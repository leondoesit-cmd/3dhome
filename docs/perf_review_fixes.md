# Review of the perf work: fixes to make

Review of commit `7b699508` (packages A–D of `docs/perf_plan.md`) and the uncommitted
package E (furniture mesh merge). The gates and the tests for the new modules pass. The
findings below come from reading the code; the app was not run and no number was
re-measured. Confirm each before changing it, and keep the rules of `docs/perf_plan.md`
(no visible change, `npm run check`, behaviour tests in Node, AGENTS.md structure rules).

When done, add a "Review fixes" table to `docs/perf_plan.md`: one row per item below with
"fixed / not a problem (why) / skipped (why)".

## 1. Bugs (fix first)

### 1.1 Identical pieces are baked several times in one batch
`js/plan_sprites.js`, `pump()` (batch picker around line 267). The queue is keyed by item
id, the picture key ignores the id, so six equal chairs are six entries with one key. The
picker only checks `cache.has(best.key)`, and the cache is still empty while the batch is
being assembled, so one batch bakes the same picture up to `bakesPerSlice` times. The old
one-at-a-time loop skipped the repeats.

Fix: de-duplicate by key while assembling the batch (drop a request whose key is already
in the batch; its item still gets `lastById` set when the picture lands). Test in Node:
N requests with one key produce one bake.

### 1.2 The cache pixel counter drifts
`store()` does `pixels += sp.px` without subtracting an entry already stored under the
same key. With 1.1 each duplicate inflates the count and pictures are evicted before the
budget is reached. Fix `store()` itself (subtract the replaced entry's `px`) even after
1.1, so no other path can cause it. Test: storing one key twice leaves the count at one
picture.

## 2. Device budget (`js/device_budget.js`) is mostly not wired up

### 2.1 Software GPU is never reported
`noteSoftwareGPU` has no caller. So `prewarmSprites` is always true and the software
route to the "low" tier is dead, although the module header and `plan_sprite_prewarm.js`
say nothing is prewarmed on a software GPU. Wire it from where `js/material_tier.js`
detects the software rasteriser (`softwareRenderer()`), without changing what
`materialTier()` returns.

### 2.2 Unused outputs
`adaptBatch` and `prebuild3D` are exported and tested, but nothing reads them. Either use
them or delete them and their tests. If `adaptBatch` stays: use it in `pump()` per slice.

### 2.3 The long-task signal never decays
`worstLong` is a session maximum, so one hitch halves the batch for good. Make it recover
(for example a decaying value, or `adaptBatch` per slice as in 2.2).

### 2.4 Bake-time thresholds probably demote a top-end desktop
A median bake over 20 ms drops "high" to "mid"; the results table reports 31–36 ms as the
longest bake step on the RTX 5070 Ti. Measure the median `noteBakeMs` sample on that
machine. If it is over 20 ms, the next-zoom pre-bake (C5) turns itself off after three
bakes, and the cache budget changes mid-session. Then: set the thresholds from measured
medians on this desktop (and state them in the test), and decide the tier's cache sizes
once rather than letting them move after pictures are already stored.

### 2.5 The high tier doubles the picture cache to ~380 MB
96e6 pixels for any non-touch device with 8+ cores, including browsers that do not report
memory. No measurement shows the cache ever needs it. Report the peak `pixels` value on
the 132-item scene across a zoom sweep, and size the tiers from that; do not raise the
old 48e6 ceiling without a number that requires it.

## 3. Prewarm (`js/plan_sprite_prewarm.js`)

### 3.1 The pass repeats forever and re-serialises every item
`afterPaint` fires after every plan frame, HUD-only animation frames included, so while
the infrastructure flow animates the pass runs every ~0.8 s. Each pass calls
`itemSprite()` per item, which builds the key by serialising the whole item (and up to
four more keys when the picture is missing or failed). Skip the pass when nothing it
depends on changed: items (a revision or a cheap signature), zoom bucket, DPR, view rect
for the ordering. Measure the pass cost on the 132-item scene before and after.

### 3.2 It runs for users who never open the presentation plan
Every user pays GPU work, memory and IndexedDB writes, on phones too. Proposal to
evaluate, not a decision: on the "low" tier (and on touch-first devices) prewarm only
after the presentation plan has been used once (a remembered flag); keep it always-on for
mid/high. Say in the results table what was chosen and why.

## 4. Shared renderer and disk

### 4.1 Library thumbnails can starve
In `pump()`, `setSpritesUrgent(true)` is set before `await quietSlot()`. While the user
keeps working, the queue is parked waiting for a quiet moment and the thumbnail warm-up
stays blocked the whole time, although nothing is being baked. Set the flag only around
the actual bake (after the quiet slot resolves), and clear it when the pump parks again.

### 4.2 Stored heights are dropped at boot
`seedVSpan` returns early until three.js has loaded, and `hydrate()` runs at module load,
before that. So the heights kept on disk are not seeded at boot, and a switch to the
presentation plan right after a reload takes the old two-stage path. Keep the persisted
spans and seed them when three lands (the same moment `baseVSpan` clears its cache), or
make the seed independent of three. Add a `sprites_warm` variant that switches
immediately after reload.

### 4.3 Flush on tab hide is best effort
The `visibilitychange` handler starts `toBlob` + IndexedDB writes that may not finish
before the page is frozen. Acceptable, but say so in the comment; do not claim the
session's pictures are kept.

## 5. Infrastructure (MEP)

### 5.1 Inspector edits still rebuild the whole house
`js/ui_mep.js` lines ~768–875 (elevation, diameter, "exposed", kind) and the remaining
`S.dirty3D` sites at 50, 95, 228, 319, 392, 575 still ask for the full rebuild. For each,
check whether anything outside `mepRoot` depends on it; where nothing does, use
`S.mep3D`. Also check the add / delete / finish-route paths in `js/interaction/`. Leave
the x-ray settings on the full rebuild.

### 5.2 D2 was closed on too small a case
"1.35 ms per HUD frame, not needed" was measured with 71 runs on an RTX 5070 Ti desktop.
The user's report is that infrastructure really stalls. Re-measure `mep_2d_idle`,
`mep_2d_drag` and `mep_3d` on a network several times larger (tile ×3 and ×6, multi-room
manual routes) with 4× and 6× CPU throttling (CDP `Emulation.setCPUThrottlingRate`), and
on the WebGL2 fallback. If any exceeds its acceptance number, do D2: static part cached,
only the travelling dashes redrawn. The stated blocker (z-order where runs overlap) can
be kept by drawing the dashes in run order on top of a cached static layer and checking
the pixel diff; if a difference remains, report its size instead of skipping.

Also ask the user which action stalls (opening the panel, auto-generate, drawing a route,
3D) if the larger scenes still meet the numbers; auto-generate (`js/mep_auto.js`) was not
measured at all.

## 6. Tests and verification gaps

- No test covers the batch pump, the prewarm ordering and skip logic, or the input-stop
  rule (`quietSlot`). Extract what can be made pure and test behaviour in Node.
- Run the WebGL2 fallback (`--forceWebGL`) for the sprite scenarios and both 3D merges;
  it is the slowest backend in `perf-gpu-bench.md` and was not run.
- Run the full suite (`npm run test:quiet`) and the browser suite once at the end and
  report failures, including pre-existing ones.
- Package E is uncommitted; do not commit it until the above passes with it in place.

## Checked and found fine (no action)

- Clash detection: bounding-box rejection is exact; equivalence test present.
- MEP-only 3D rebuild: ground/slab/wall state depends on the x-ray and layer visibility,
  which still take the full rebuild.
- Furniture merge: skips transparent, mirrored, nested, animated and physics cases;
  nothing in the 3D code looks up furniture parts by name.
