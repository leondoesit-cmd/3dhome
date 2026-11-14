/* How much BACKGROUND work and cache this device can afford: one budget the
   presentation-plan pictures (js/plan_sprites.js, js/plan_sprite_prewarm.js)
   and the 3D warm-up read, instead of each guessing the device on its own.

   It never decides how anything LOOKS. Image quality stays with
   applyPlannerQuality (view3d) and materialTier() (js/material_tier.js);
   this only sizes caches and decides how much work to do ahead of time.

   Static signals (memory, cores, touch-first pointer, software GPU, storage
   quota) give a starting tier, and the CACHE sizes come from that alone: they
   are decided once, so pictures already stored are never evicted because a
   later measurement moved the budget. How much work is done AHEAD of time
   also follows a measurement that works where navigator.deviceMemory is
   missing (Safari, Firefox): the median of the first picture bakes. The batch
   size adapts per slice in the picture queue (adaptBatch): a long task halves
   it, a clean slice grows it back.

   pickBudget() and adaptBatch() are pure (tested in Node); deviceBudget()
   reads the browser once and folds in what has been measured since. */

/* Median main-thread ms of one picture bake (sync prepare + draw/readback)
   above which less is done ahead of time. Measured on an RTX 5070 Ti desktop
   (16 cores): median 5.1 ms of the first 9 bakes, 5.9 ms of 136, p90 17.7 ms
   (docs/perf_plan.md, "Review fixes"), so a top-end desktop stays "high". */
export const MID_BAKE_MS = 20;
export const SLOW_BAKE_MS = 40;

/**
 * @param {object} env
 * @param {number}  [env.deviceMemory]  GB (absent on Firefox/Safari)
 * @param {number}  [env.cores]         navigator.hardwareConcurrency
 * @param {boolean} [env.coarse]        touch-first device
 * @param {boolean} [env.software]      software rasteriser
 * @param {number}  [env.quotaMB]       storage quota left for this origin
 * @param {number}  [env.bakeMs]        median main-thread ms of one picture bake (measured)
 * @returns {{tier:"low"|"mid"|"high", cacheTier:"low"|"mid"|"high", spritePixelBudget:number,
 *   spritePersistCap:number, bakesPerSlice:number, prebakeNextBucket:boolean,
 *   prewarmSprites:boolean, prewarmOnFirstUse:boolean}}
 */
export function pickBudget(env) {
  const e = env || {};
  const mem = typeof e.deviceMemory === "number" && e.deviceMemory > 0 ? e.deviceMemory : null;
  const cores = typeof e.cores === "number" && e.cores > 0 ? e.cores : null;
  let cacheTier = "mid";
  if (e.software || (mem != null && mem <= 2) || (cores != null && cores <= 2)) cacheTier = "low";
  else if (!e.coarse && (mem == null || mem >= 8) && cores != null && cores >= 8) cacheTier = "high";
  // measured: a slow bake means less work ahead of time, whatever the static
  // signals said (never more: a fast bake on a small device still has its
  // small memory)
  let tier = cacheTier;
  if (typeof e.bakeMs === "number" && e.bakeMs > 0) {
    if (e.bakeMs > SLOW_BAKE_MS) tier = "low";
    else if (e.bakeMs > MID_BAKE_MS && tier === "high") tier = "mid";
  }
  // RGBA: ~64 / 190 MB at most. Measured peak: 8.4e6 px for a generated
  // apartment's 126 pictures over a 0.25x-7x zoom sweep at DPR 1 (~34e6 at
  // DPR 2), so a big desktop gets the old 48e6 ceiling, not more.
  const PIX = { low: 16e6, mid: 48e6, high: 48e6 };
  const PERSIST = { low: 200, mid: 600, high: 1200 };
  let persist = PERSIST[cacheTier];
  // a kept picture is ~20-60 KB of PNG; never claim more than 2 % of the quota
  if (typeof e.quotaMB === "number" && e.quotaMB > 0) persist = Math.max(50, Math.min(persist, Math.floor((e.quotaMB * 0.02) / 0.06)));
  // pieces per bake batch: they share one compile and one GPU wait, while
  // each piece's build and draw stay tasks of their own
  const batch = tier === "low" ? 1 : tier === "mid" ? 3 : 4;
  return {
    tier,
    cacheTier,
    spritePixelBudget: PIX[cacheTier],
    spritePersistCap: persist,
    bakesPerSlice: batch,
    prebakeNextBucket: tier === "high",
    prewarmSprites: !e.software,
    // a weak or touch-first device pictures the plan ahead of time only once
    // the presentation plan has been used there (js/plan_sprite_prewarm.js)
    prewarmOnFirstUse: tier === "low" || !!e.coarse,
  };
}

/* The next batch size after one background slice: a long task (> 50 ms) it
   caused halves it, a slice without one grows it back by one, up to `max`.
   So one hitch costs a few slices, not the rest of the session. */
export function adaptBatch(cur, slice, max) {
  const n = Math.max(1, cur | 0), top = Math.max(1, max | 0);
  if (slice && slice.longTaskMs > 50) return Math.max(1, n >> 1);
  return Math.min(top, n + 1);
}

/* ---- browser reader ---------------------------------------------------- */
let env = null;
const bakeSamples = [];

function readEnv() {
  const out = {};
  try { out.deviceMemory = navigator.deviceMemory; } catch (e) { /* not exposed */ }
  try { out.cores = navigator.hardwareConcurrency; } catch (e) { /* not exposed */ }
  try {
    out.coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  } catch (e) { /* no matchMedia */ }
  try {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (q) {
        if (q && q.quota) out.quotaMB = Math.max(0, (q.quota - (q.usage || 0)) / 1048576);
      }, function () {});
    }
  } catch (e) { /* no storage API */ }
  return out;
}

/** Mark the GPU as a software rasteriser (js/material_tier.js knows). */
export function noteSoftwareGPU(on) {
  if (!env) env = readEnv();
  env.software = !!on;
}
/** One picture bake's synchronous main-thread ms (the first few count). */
export function noteBakeMs(ms) {
  if (!(ms > 0) || bakeSamples.length >= 9) return;
  bakeSamples.push(ms);
}

export function deviceBudget() {
  if (!env) env = readEnv();
  const e = Object.assign({}, env);
  if (bakeSamples.length >= 3) {
    const s = bakeSamples.slice().sort(function (a, b) { return a - b; });
    e.bakeMs = s[s.length >> 1];
  }
  return pickBudget(e);
}
