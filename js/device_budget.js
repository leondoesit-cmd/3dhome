/* How much BACKGROUND work and cache this device can afford: one budget the
   presentation-plan pictures (js/plan_sprites.js, js/plan_sprite_prewarm.js)
   and the 3D warm-up read, instead of each guessing the device on its own.

   It never decides how anything LOOKS. Image quality stays with
   applyPlannerQuality (view3d) and materialTier() (js/material_tier.js);
   this only sizes caches and decides how much work to do ahead of time.

   Static signals (memory, cores, touch-first pointer, software GPU, storage
   quota) give a starting tier. Measured signals matter more and also work
   where navigator.deviceMemory is missing (Safari, Firefox): how long the
   first picture bakes take, and whether background work has caused long
   tasks. The batch size adapts: long tasks shrink it, quiet idle periods
   grow it.

   pickBudget() and adaptBatch() are pure (tested in Node); deviceBudget()
   reads the browser once and folds in what has been measured since. */

/**
 * @param {object} env
 * @param {number}  [env.deviceMemory]  GB (absent on Firefox/Safari)
 * @param {number}  [env.cores]         navigator.hardwareConcurrency
 * @param {boolean} [env.coarse]        touch-first device
 * @param {boolean} [env.software]      software rasteriser
 * @param {number}  [env.quotaMB]       storage quota left for this origin
 * @param {number}  [env.bakeMs]        median main-thread ms of one picture bake (measured)
 * @param {number}  [env.longTaskMs]    worst long task caused by background work (measured)
 * @returns {{tier:"low"|"mid"|"high", spritePixelBudget:number, spritePersistCap:number,
 *   bakesPerSlice:number, prebakeNextBucket:boolean, prebuild3D:boolean, prewarmSprites:boolean}}
 */
export function pickBudget(env) {
  const e = env || {};
  const mem = typeof e.deviceMemory === "number" && e.deviceMemory > 0 ? e.deviceMemory : null;
  const cores = typeof e.cores === "number" && e.cores > 0 ? e.cores : null;
  let tier = "mid";
  if (e.software || (mem != null && mem <= 2) || (cores != null && cores <= 2)) tier = "low";
  else if (!e.coarse && (mem == null || mem >= 8) && cores != null && cores >= 8) tier = "high";
  // measured: a slow bake demotes, whatever the static signals said
  if (typeof e.bakeMs === "number" && e.bakeMs > 0) {
    if (e.bakeMs > 40) tier = "low";
    else if (e.bakeMs > 20 && tier === "high") tier = "mid";
  }
  const PIX = { low: 16e6, mid: 48e6, high: 96e6 }; // RGBA: ~64 / 190 / 380 MB at most
  const PERSIST = { low: 200, mid: 600, high: 1200 };
  let persist = PERSIST[tier];
  // a kept picture is ~20-60 KB of PNG; never claim more than 2 % of the quota
  if (typeof e.quotaMB === "number" && e.quotaMB > 0) persist = Math.max(50, Math.min(persist, Math.floor((e.quotaMB * 0.02) / 0.06)));
  // pieces per bake batch: they share one compile and one GPU wait, while
  // each piece's build and draw stay tasks of their own
  let batch = tier === "low" ? 1 : tier === "mid" ? 3 : 4;
  if (typeof e.longTaskMs === "number" && e.longTaskMs > 50) batch = Math.max(1, batch >> 1);
  return {
    tier,
    spritePixelBudget: PIX[tier],
    spritePersistCap: persist,
    bakesPerSlice: batch,
    prebakeNextBucket: tier === "high",
    prebuild3D: tier !== "low",
    prewarmSprites: !e.software,
  };
}

/* The next batch size after one background slice: a long task it caused
   halves it, a slice that finished well inside a long idle period grows it
   by one, up to `max`. */
export function adaptBatch(cur, slice, max) {
  const n = Math.max(1, cur | 0), top = Math.max(1, max | 0);
  if (slice && slice.longTaskMs > 50) return Math.max(1, n >> 1);
  if (slice && slice.idleLeftMs > 20 && slice.ms < 8) return Math.min(top, n + 1);
  return Math.min(n, top);
}

/* ---- browser reader ---------------------------------------------------- */
let env = null;
const bakeSamples = [];
let worstLong = 0;

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
/** A long task seen while background work ran. */
export function noteBackgroundLongTask(ms) {
  if (ms > worstLong) worstLong = ms;
}

export function deviceBudget() {
  if (!env) env = readEnv();
  const e = Object.assign({}, env);
  if (bakeSamples.length >= 3) {
    const s = bakeSamples.slice().sort(function (a, b) { return a - b; });
    e.bakeMs = s[s.length >> 1];
  }
  if (worstLong) e.longTaskMs = worstLong;
  return pickBudget(e);
}
