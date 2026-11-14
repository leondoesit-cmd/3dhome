/* The pure parts of the presentation-plan picture queue (js/plan_sprites.js):
   which requests go into the next bake batch, how the picture cache counts
   its pixels, and when a background bake may start. No DOM, no three: tested
   in Node (tests/plan_sprite_batch.test.mjs). */

/* The next bake batch: up to `n` requests, highest priority first, taken out
   of `queue` (item id -> {key, pri, ...}).

   The queue is keyed by item, the picture by what it shows, so six equal
   chairs are six requests for one picture. Each key is baked once: the other
   requests for a key in the batch (and any still queued) ride along in the
   entry's `also`, so their items get the picture when it lands. A key
   `isCached` says is already stored is dropped, not baked. */
export function pickBatch(queue, n, isCached) {
  const batch = [], byKey = new Map();
  const want = Math.max(1, n | 0);
  while (batch.length < want && queue.size) {
    let bestId = null,
      best = null;
    queue.forEach(function (req, id) {
      if (!best || req.pri > best.pri) { best = req; bestId = id; }
    });
    queue.delete(bestId);
    if (isCached && isCached(best.key)) continue;
    const same = byKey.get(best.key);
    if (same) { same.also.push(best); continue; }
    const entry = { id: bestId, req: best, also: [] };
    byKey.set(best.key, entry);
    batch.push(entry);
  }
  // a request still queued for a picture this batch makes would only bake
  // it again
  queue.forEach(function (req, id) {
    const entry = byKey.get(req.key);
    if (!entry) return;
    entry.also.push(req);
    queue.delete(id);
  });
  return batch;
}

/* Store `sp` under `key` in the LRU `cache` (Map order = use order) and return
   the new pixel count. A picture replaced under the same key leaves the count
   first, so it never drifts; the oldest pictures go while the count is over
   `budget` (the newest always stays). */
export function storeCounted(cache, key, sp, pixels, budget) {
  let px = pixels;
  const old = cache.get(key);
  if (old) {
    px -= old.px || 0;
    cache.delete(key);
  }
  cache.set(key, sp);
  px += sp.px || 0;
  while (px > budget && cache.size > 1) {
    const oldest = cache.keys().next().value;
    px -= cache.get(oldest).px || 0;
    cache.delete(oldest);
  }
  return px;
}

/* A background bake (pictures made ahead of time) waits for a quiet moment:
   no input for `quietMs` and a real idle period. `s.urgent` (the presentation
   plan is on screen) goes at once.
   Returns {go:true}, {waitMs} (input was too recent) or {idle:true} (ask the
   browser for a real idle period, then go). */
export const INPUT_QUIET_MS = 700;
export function quietStep(s) {
  if (s.urgent) return { go: true };
  const quietFor = s.now - s.lastInput;
  if (quietFor < INPUT_QUIET_MS) return { waitMs: INPUT_QUIET_MS - quietFor };
  return { idle: true };
}

/* A cheap fingerprint of a value (FNV-1a over its primitives, walking nested
   objects and arrays in key order), for the prewarm pass
   (js/plan_sprite_prewarm.js): a pass whose inputs have the same fingerprint
   as the last one would only repeat the same cache lookups. Unlike the
   picture key, it allocates no strings per item. */
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
function mix(h, n) {
  return Math.imul(h ^ n, 16777619) >>> 0;
}
function mixStr(h, s) {
  for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
  return mix(h, 0x1f);
}
function mixValue(h, v, depth) {
  if (v === null || v === undefined) return mix(h, v === null ? 1 : 2);
  const t = typeof v;
  if (t === "number") {
    if (v === (v | 0)) return mix(mix(h, 3), v);
    F64[0] = v; // the exact bits of a fraction, without a string
    return mix(mix(mix(h, 4), U32[0]), U32[1]);
  }
  if (t === "string") return mixStr(mix(h, 5), v);
  if (t === "boolean") return mix(h, v ? 6 : 7);
  if (t !== "object" || depth > 8) return mix(h, 8);
  if (Array.isArray(v)) {
    h = mix(mix(h, 9), v.length);
    for (let i = 0; i < v.length; i++) h = mixValue(h, v[i], depth + 1);
    return h;
  }
  h = mix(h, 10);
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    h = mixValue(mixStr(h, k), v[k], depth + 1);
  }
  return mix(h, 11);
}
export function fingerprint(v) {
  return mixValue(2166136261, v, 0);
}
