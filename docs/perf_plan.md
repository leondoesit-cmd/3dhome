# Performance plan: planner, 2D model pictures, infrastructure (MEP)

Written 2026-11-13 for an executing agent (Opus 5.5, medium effort). Read AGENTS.md first; its
gates and structure rules apply to every step here.

## Goal and hard rules

1. Make the planner faster everywhere it is slow, with **no change to what the user sees**.
   Not allowed: lower resolution, fewer shadows, cheaper materials, lower quality presets,
   dropped effects. Allowed: doing the same work once instead of many times, earlier, in the
   background, in fewer draw calls, or from a cache.
2. The 2D "presentation" plan (furniture drawn as pictures of the real models) must show its
   pictures almost at once when switched on.
3. The infrastructure (MEP) layer must stop stalling, in 2D and in 3D.

Working rules:

- **Measure first, per package.** Everything under "Suspected causes" was found by reading
  the code, not by profiling. Confirm each with a number before changing it. If the number
  says a suspect is innocent, skip it and write that down in the results table (see end).
- **One package = one self-contained change** that passes `npm run check` and
  `npm run test:changed`. Run the full suite once at the end, in the background.
- **Prove the picture did not change.** For each package that touches drawing, capture
  before/after images of the same scene and view (2D: `planImageCanvas()`; 3D: the GPU
  capture script described in the project memory, not the hidden pane) and diff them.
  2D must be pixel-identical unless the package says otherwise; 3D within noise of TRAA.
- Put logic in functions Node can import and test behaviour (AGENTS.md "Writing tests").
- New code goes into small new pieces; do not grow `js/plan2d.js`, `js/view3d.js`,
  `js/ui/init_ui.js`. Add new files to `survey-assets.json`.
- Do not touch quality presets in `applyPlannerQuality` (`js/view3d.js:649`) or the texture
  tier in `js/material_tier.js` except to read from the shared device budget (package B).

## Package A: measurement harness (do this first)

Extend the existing tools instead of writing new ones: `tools/perf_harness.mjs` (headless,
counts and relative numbers) and `tools/gpu_bench.mjs` (real windowed Chrome, real GPU).

Add these scenarios, on a generated large apartment (seed 3, as the bench uses) with
auto-generated infrastructure, and on a second scene with about 150 items:

| id | what it measures |
|---|---|
| `sprites_cold` | technical plan → presentation: time to first picture, time to all pictures, longest main-thread task, with an empty IndexedDB |
| `sprites_warm` | the same on a second load (pictures on disk) |
| `sprites_zoom` | zoom across two bucket boundaries: time until all pictures are exact again |
| `pres_paint` | cost of one `renderModel()` in presentation mode, and model paints per pan move |
| `mep_2d_idle` | MEP shown and animating, no input: HUD paint ms, frames/s, main-thread share |
| `mep_2d_drag` | drag a wall, a device and a bed with MEP shown: ms per move, calls to `computeMEPClashes` / `computeMEPStatus` / `makeRouter` |
| `mep_route` | drawing a route: ms per pointermove |
| `mep_3d` | MEP 3D on: draw calls, meshes, rebuild ms; toggle a system: ms until the frame is back |
| `planner_rebuild` | `rebuild3D()` ms split into structure / items / MEP; pipeline count after first compile |

Use injected counters as `perf_harness.mjs` does (no source edits for instrumentation).
Record the baseline in `perf-baseline.md` under new sections. Known traps are in the project
memory: dirty3D rebuilds inside a sample, thumbnail prewarm stalls, readbacks waiting behind
GPU bursts, the hidden pane freezing rAF.

## Package B: one device budget

Today three places guess the device separately: `applyPlannerQuality` (memory + cores),
`material_tier.js` (touch, memory, screen, software GPU), and fixed constants
(`PIXEL_BUDGET = 48e6` ≈ 190 MB and `MAX_PERSIST = 600` in `js/plan_sprites.js:33,423`).

Add `js/device_budget.js`, pure core + thin browser reader, in the style of
`material_tier.js` (`pickX(env)` tested in Node):

- Static inputs: `deviceMemory`, `hardwareConcurrency`, coarse pointer, software GPU,
  WebGPU adapter limits when a device exists, `navigator.storage.estimate()`.
- **Measured inputs** (these matter more than the static ones, and work on Safari/Firefox
  where `deviceMemory` is missing): time of the first few sprite bakes, time of the first
  3D compile, longest task seen during background work. The budget adapts: if background
  work causes long tasks, shrink the batch; if idle periods are long, grow it.
- Outputs, used only for *how much background work and cache*, never for image quality:
  sprite cache pixel budget, sprite persist cap, bakes per idle slice, whether to pre-bake
  the next zoom bucket, whether to pre-build 3D while in 2D.

Do not change what `applyPlannerQuality` or `materialTier()` return in this package.

## Package C: 2D model pictures (presentation plan)

Files: `js/plan_sprites.js`, `js/plan_sprite_key.js`, `js/offscreen_gl.js`,
`js/plan2d/items.js` (`drawItemPresentation`, line 177), `js/furniture_api.js`
(`knownVSpan` / `measureVSpanSoon`, line 157), `js/thumbs.js`.

How it works now: `itemSprite()` is only called from the presentation paint, so nothing is
baked until the user switches the mode on. Then the queue bakes **one piece at a time**;
each bake builds the model, shrinks textures, `compileAsync`, waits for the GPU to drain,
waits for an idle tick, renders, reads back, then waits for another idle tick.

Suspected causes, in expected order of weight:

1. **No prewarm.** All the work starts at the click. Fix: start baking in the background
   while the user is still in the technical plan: after boot settles, and after each item
   add/resize/retexture, for the current zoom bucket. Priority: pieces in view, then the
   rest. Sized by package B. Must yield to input (stop the batch on pointer activity).
2. **Two-stage gating on height.** A piece whose vertical span is not measured draws its
   glyph and only *then* gets queued for a picture (`items.js:186`), and measuring builds
   the model a second time. The bake already has the bounding box: have it feed the vspan
   cache, and let prewarm measure and bake in one build.
3. **Per-piece fixed waits.** Count them: with `requestIdleCallback` timeouts of 150 ms, a
   busy page pays up to ~300 ms per piece in waiting alone. Fix: bake in batches. Build N
   models, one `compileAsync` for the group, one GPU drain, then render each into its own
   viewport of the 512² canvas (several small pictures fit in one frame) and read back
   together. Keep each main-thread step short; batch size from package B.
4. **Shared renderer contention.** The library thumbnails use the same offscreen renderer
   and their cold warm-up takes 12.6 s (`perf-gpu-bench.md`). Pictures the user is looking
   at must go before tiles in a closed panel: give the shared renderer one queue with
   priorities, or pause thumbnail prewarm while sprites are queued.
5. **Zoom re-bakes everything.** The key includes the size bucket (64/128/256/512). Check
   whether a lower bucket can be produced by downscaling a higher one already in the cache
   with identical or better pixels; if the diff is clean, derive instead of re-bake, and
   let prewarm bake one bucket above the current one on capable devices.
6. **Disk cache misses.** Pieces with `tex` / `texParts` and all "provisional" pictures are
   never persisted, and persisting runs one picture per quiet moment, so a short session
   may save little. Measure the hit rate in `sprites_warm`. Likely fixes: include the
   texture identity in the key so textured pieces can persist once their textures have
   loaded; flush pending writes on `visibilitychange`.
7. **Paint cost.** Every sprite is drawn with a canvas drop shadow (`shadowBlur`,
   `items.js:213`), which is slow, on every model paint, and panning repaints the model
   every move. If `pres_paint` confirms it: cache the shadowed result per sprite and
   rotation (the shadow offset is in screen space, so the cache key needs the rotation),
   pixel-identical to today.

Acceptance: `sprites_warm` shows all pictures within one frame of switching;
`sprites_cold` after 10 s in the technical plan likewise; no main-thread task over 50 ms
caused by baking; 2D output pixel-identical (except item 5, which needs a clean diff).

## Package D: infrastructure (MEP)

Files: `js/mep/clashes.js`, `js/mep/routing.js`, `js/mep/drawing.js`, `js/mep/topology.js`,
`js/mep_route.js`, `js/ui_mep.js`, `js/plan2d.js` (MEP animation, line 116),
`js/view3d/items_layers.js` (`rebuild3D`, line 395).

Suspected causes, 2D:

1. **Signature recomputed on every frame.** `drawMEP` → `getMEPState()` → `mepSignature()`
   (`clashes.js:31,177`) hashes every plan node, wall, room, bed, MEP node (with a wall
   projection each) and run, plus `JSON.stringify(circuits)`. While the flow animates this
   runs 30 times a second. Fix: compute the signature at most once per model change (hang
   it off the same "plan changed" signal as `planIndex.invalidate()`, or a revision
   counter), not per HUD frame.
2. **The whole overlay is redrawn 30 times a second.** While animating, all runs, vertices,
   arrows, devices and badges are drawn on the HUD each frame (`mepOnHud`, `plan2d.js:714`)
   only so the white travelling dashes can move. Fix: keep the static part on the model
   canvas (or its own cached layer) and redraw only the dashes; batch dashes by style into
   single paths; cache each run's screen path (`Path2D`) per view transform.
3. **Clash detection is quadratic and allocates.** `computeMEPClashes` (`clashes.js:129`)
   compares every run pair segment by segment with no bounding-box reject, builds four
   objects per segment pair, and calls `runPointY(B)` inside the inner run loop. It reruns
   whenever the signature changes, i.e. on every move of a wall/device/bed drag. Fix: per-run
   boxes with early reject (or the shared spatial index), hoist the per-run data; during a
   gesture, recompute status/flow only and defer clashes to gesture end or idle.
4. **Router rebuilt per call.** `wallPath` / `routeResolve` (`clashes.js:245,257`) and
   `routing.js:103` call `makeRouter()`, which builds a graph of all walls and openings,
   likely once per pointermove while routing (`js/interaction/plan_move.js`). Fix: cache
   one router per (wall geometry signature, avoidOpenings).
5. **Panel rebuild.** `ui_mep.js:291` re-renders the whole panel on every MEP change. Check
   it does not rebuild during drags; if it does, coalesce to one per frame or gesture end.

Suspected causes, 3D:

6. **One mesh and one geometry per pipe segment.** `buildMEP3D` (`drawing.js:288`) creates
   a new `CylinderGeometry`/`BoxGeometry` and `Mesh` per segment, collar, hanger and
   device: hundreds of draw calls, again in each shadow pass. Fix: one shared unit
   geometry per shape with `InstancedMesh` per material, or merged geometry per material.
   Same materials, same result. Keep picking (`hitMEP` 3D, selection) working.
7. **Any MEP change rebuilds the whole house.** Every toggle in `ui_mep.js` sets
   `S.dirty3D`, and `rebuild3D` disposes and rebuilds structure too. Fix: an MEP-only path
   that swaps the contents of `mepRoot` and updates the few dependent flags (ground and
   slab visibility for the under-floor x-ray, `items_layers.js:460`), like the per-item
   path `S.items3D` already gives furniture.

Acceptance: `mep_2d_idle` under 2 ms per frame on the large scene; `mep_2d_drag` and
`mep_route` under 8 ms per move; MEP toggle in 3D under 50 ms and no structure rebuild;
MEP draw calls in 3D down by at least 10×; 2D output pixel-identical; all `tests/mep_*`
green.

## Package E: planner 3D and general

Measure with package A, then act on what is large. Candidates from existing numbers:

1. **First 3D compile: 5.3 s WebGPU, 8.9 s WebGL2** (`perf-gpu-bench.md`), the largest
   single number in the app. Count distinct pipelines and find why there are so many:
   materials that are equal but not shared, per-item clones, flags that re-key shaders
   (project memory: environment identity, `castShadow` handoffs). Share equal materials.
   Compile in priority order: what the opening camera sees first, the rest in idle.
2. **785 meshes for 44 items.** Per item, merge static meshes that share a material;
   instance identical pieces (six equal chairs). Must keep per-part picking, ghosting
   (`ghostSwap`), see-through fades and Blender export working; check each before merging.
3. **Background 3D while in 2D.** `main.js:927` already warms 3D once after boot. Extend
   it with package B: keep the 3D item cache in step with 2D edits during idle time, so
   opening 3D never starts from a stale scene.
4. **`itemSig`** (`items_layers.js:205`) stringifies every item and its definition on every
   sync. Measure on the 150-item scene; if visible, cache per item object revision.
5. **2D pan** repaints the model once per move. If `pres_paint` is high after package C,
   paint the model canvas with a margin and blit while panning, repainting only when the
   margin runs out. Final pixels must equal a normal paint.
6. **Boot**: 176 requests, 7.5 MB of JS, no build step by design. Check only cheap wins:
   `modulepreload` for the deep graph, HTTP caching headers from the relay, loading only
   the active language. Do not introduce a bundler.

Each item is optional: do it only if its measured share justifies it.

## Order and reporting

A → B → C → D → E. C and D are what the user feels today; do not start E before both meet
their acceptance numbers.

At the end, add a "Results" section to this file: one row per suspect with baseline,
result, and "fixed / not a cause / skipped (why)". List anything that could not be
verified on a real GPU.

## Results (2026-11-13)

Measured with `node tools/perf_planner.mjs` (package A) on this machine's RTX 5070 Ti, WebGPU,
real windowed Chrome; generated large apartment, seed 3 (18 walls, 44 items, 71 MEP devices,
71 runs) and the same tiled ×3 (132 items). Full tables: `perf-baseline.md`, sections
"Planner probes — baseline", "— after C+D" and "— after C+D, switch after 10 s" (the "after"
section was taken just before the last C4 change, so its zoom row still shows the tile
readback stall that change removed). Numbers
vary run to run by roughly ±20 %; the cold-switch numbers at 3 s more than that, because the
hidden 3D view's first compile holds the GPU then.

Pixel checks: 2D presentation plan, `HEAD` vs working tree via `--head --capture`, with the
library-tile warm-up off in both (`--no-thumbs`, see C4): 0 differing pixels; the working
tree gave the same image in all 4 runs. 3D with MEP (merged meshes) vs `HEAD`, captures taken
back to back: 36–38 pixels differ, max 13 levels (CPU-baked vertex positions).

| # | suspect | baseline | result | verdict |
|---|---|---|---|---|
| A | harness | — | `tools/perf_planner.mjs` + `tools/perf_planner/{wraps,scenarios,report}.mjs`; counters injected over CDP Fetch, `--head` A/B, `--capture`; for E: `first_open` (`--salt` for cold shader compiles, `--first-open-wait`), inclusive profile times, `--eval=<file>` for ad-hoc page probes | done |
| B | one device budget | 3 separate guesses | `js/device_budget.js` (`pickBudget`, `adaptBatch`, Node-tested); sprite cache, persist cap, batch size, next-bucket prebake read it; `applyPlannerQuality` / `materialTier()` untouched | done |
| C1 | no prewarm | first picture 3.5 s, all 8.1 s after the click | `js/plan_sprite_prewarm.js`: pieces asked for after paints settle in the technical plan, in-view first, quiet moments only, stops for input. Switch after 10 s in the technical plan: all 36 pictures exact in the first paint (1–4 ms) | fixed |
| C2 | two-stage height gate | first bake started 3.2 s after the switch | the bake feeds the vspan cache (`rememberVSpan`), the plan queues the picture together with the height, heights are stored with pictures on disk (`seedVSpan`) | fixed |
| C3 | per-piece fixed waits | 32 bakes ≈ 150 ms each, serial | `bakeBatch`: one compile + one GPU drain per batch, builds and draws still one task per piece (longest bake step 31–36 ms). Cold switch at 3 s: all 8.1 s → 5.5 s (rest is the 3D first compile, C4) | fixed |
| C4 | shared renderer contention | tiles' warm-up interleaved with bakes; also made `HEAD`'s pictures timing-dependent (dropped small textures re-made with another resampler) | tile warm-up waits while the plan is baking (`spritesFirst`), between models and before its readback, which had been a 214–288 ms task in the zoom probe when it met a bake. Zoom probe after: no long task (2 runs). The one long task left in the cold switch at 3 s is the hidden 3D view's first frame (`renderScene`, ~200 ms), not baking | fixed |
| C5 | zoom re-bakes | all exact 2.9 s after ×4 zoom | next bucket pre-baked on high-tier devices (`prebakeSprite`, behind everything else): 2.1–2.4 s when the zoom comes right away, ready when there was idle time. Deriving a lower bucket by downscaling was not done: ink outline width and texture size are per bucket, so it cannot be pixel-identical | partly; downscale skipped (not identical) |
| C6 | disk cache misses | warm: first picture 252 ms | textured pieces persist once not provisional (texture identity is in the key), pending writes flush on `visibilitychange`, heights stored with pictures. Warm: all exact in the first paint (1–6 ms) | fixed |
| C7 | shadowBlur paint cost | presentation model paint 6.5 ms vs technical 8.2 ms (132 items); `drawItemPresentation` 1.3 ms of it | — | not a cause |
| D1 | MEP signature per frame | 0.145 ms per HUD paint | — | not a cause (under budget) |
| D2 | whole overlay redrawn at 30 Hz | 1.49 ms HUD per frame (target < 2) | 1.35 ms (from D3). Splitting the dashes onto their own layer changes which run is drawn on top where runs overlap, so it cannot be pixel-identical | not needed; acceptance met |
| D3 | quadratic clash detection | bed drag 3.58 ms/move, wall 1.42 | per-run 3D data hoisted, run and segment bounding-box rejection; same answer, same order (`tests/mep_clash_equivalence.test.mjs` vs the old algorithm, 60 random networks): bed 0.29–0.30, wall 0.11 | fixed |
| D4 | router rebuilt per call | `makeRouter` 0.03 ms per move while routing | — | not a cause |
| D5 | panel rebuilt during drags | 0 `renderPanel` calls in wall/device/bed drags | — | not a cause |
| — | drags and routing, paint + MEP work per move | wall 4.4, device 6.4, bed 6.4 ms | wall 3.6, device 6.4, bed 2.8 ms (all < 8). The probes' frame p50 (11–15 ms) also counts the wait for the next frame | acceptance met |
| D6 | one mesh per pipe segment | MEP adds 420–425 draw calls (425 meshes) | opaque meshes merged per material (`js/mep/merge3d.js`, Node-tested): x-ray off 12 draw calls (35×); x-ray on 59 (7×): the 47 transparent under-floor guides stay separate, since merging them changed ~760 pixels by > 32 levels (blend order) | fixed for opaque; transparent kept (not identical) |
| D7 | any MEP change rebuilds the house | system toggle until redrawn: 112–124 / 135–145 ms, full `rebuild3D` | `S.mep3D` + `rebuildMEP3D()` swaps only `mepRoot` (panel eye, show/hide, 3D on/off, plane visibility, MEP drag on the plan); x-ray changes still rebuild everything. 33 / 35–42 ms, 0 full rebuilds | fixed |
| E1 | first 3D compile; equal materials not shared | cold (salted shaders) first open 9.35 s, main thread idle ~8.3 s of it; 31 pipelines; 77 node builds (77 distinct keys, 136 ms); 827 materials | three keys a material's numbers as on/off only, so equal materials already share shader builds; sharing material objects across items would save only per-material uniform objects and needs reference-counted disposal and per-lamp glow care. The per-object part of the first frame went with E2 (cold 9.35 → 9.14 s, materials 827 → 418). The rest is GPU-side compile of 31 pipelines | not a cause (sharing); GPU compile left |
| E2 | 785 meshes / 44 items | 672 furniture meshes, 897 total; first-frame `renderScene` task 1.12–1.14 s; 33,960 draw calls over the steady sample | `js/view3d/item_merge.js` (Node-tested): per item, direct mesh children with value-equal materials, same shadow flags and physics class baked into one mesh (opaque only; mirrored, nested, cabinet-pivot and human items left alone; not while physics runs, and the item cache rebuilds when that changes). 263 furniture / 488 total meshes; first-frame task 0.85–0.89 s (warm and cold); draw calls 17,600 (½); direct render CPU p50 3.4 → 2.1–3.2 ms; merge costs ~1 ms per piece (48–51 ms for 44). Picking walks up to the item group (no per-part picking exists); `ghostSwap` clones per mesh, still works; see-through fades only touch walls; Blender export gets the same triangles and materials as fewer objects per piece. 3D vs HEAD: 55 px, max 5 levels. Instancing equal pieces across items skipped: a shared InstancedMesh would break per-item groups (placement, ghosting, picking, disposal), and a merged chair is ~3 draws | fixed (merge); cross-item instancing skipped |
| E3 | background 3D in step with 2D | opened 10 s after generating: HEAD 191 ms to the first frame, rebuild already done (`rebuiltAt` 6 ms) | the hidden pane already rebuilds after 300 ms without input (`render_loop.js`, HIDDEN_EDIT_IDLE_MS), so 3D is in step whenever the user pauses; merged: 148 / 185 ms. Only an open within ~1 s of an edit still pays the rebuild (~1.1–1.3 s, mostly the first frame, see E2) | not needed (already done) |
| E4 | `itemSig` | 141 calls 3.8–5.3 ms per rebuild on 132 items (of 66–69 ms) | — | not a cause (~7 %) |
| E5 | 2D pan repaint | 1.05 model paints per move, 7–7.7 ms each (132 items) | — | not started: under a frame; a margin-and-blit must stay pixel-identical |
| E6 | boot caching | the relay already answers ETag + `no-cache` (304 revalidation), which hot-serving by mtime needs | — | not a cause for caching; `modulepreload` not tried |

Package E numbers: `perf-baseline.md` "Planner probes — package E". Not verified on a real GPU other than this desktop: phones, the WebGL2 fallback (`--forceWebGL`
was not run) and Safari/Firefox (where `deviceMemory` is missing and the budget leans on the
measured bake time). The 3D merges (MEP and furniture) were checked on WebGPU only.

## Review fixes (2026-11-14)

From `docs/perf_review_fixes.md`. Numbers: `perf-baseline.md` sections "review-fixes" /
"review-before" (`--head --head-counters`: the committed sources with the same counters),
"review-zoom-*", "mep-x3-cpu4", "mep-x6-cpu6", "mep-x6-webgl2", "webgl2-review". RTX 5070 Ti
desktop, 16 cores, DPR 1. Presentation-plan pixels after all fixes: identical to `HEAD`
(0 of 560k pixels differ, `--no-thumbs` A/B).

| # | item | outcome |
|---|---|---|
| 1.1 | equal pieces baked several times per batch | fixed: `pickBatch()` (`js/plan_sprite_batch.js`) bakes each key once; the other requests for it (in the batch or still queued) ride along and their items get the picture. Node test: 6 chairs → 1 bake. Cold switch: 32–34 bakes vs 35–36 on `HEAD` |
| 1.2 | cache pixel counter drifts | fixed: `storeCounted()` subtracts the replaced entry first; Node test: one key stored twice counts once |
| 2.1 | software GPU never reported | fixed: `js/material_tier.js` reports the WebGPU adapter's answer (else the WebGL probe's) to `noteSoftwareGPU` once `primeGpuTier()` settles, and again when `materialTier()` reads it; `materialTier()` returns what it did |
| 2.2 | unused `adaptBatch` / `prebuild3D` | `adaptBatch` now sizes every bake batch in `pump()`; `prebuild3D` deleted with its test |
| 2.3 | long-task signal never decays | fixed: per slice, a long task (> 50 ms) halves the batch, a clean slice grows it back by one (`worstLong` / `noteBackgroundLongTask` removed). Node test: 4 → 2 → 4 in two clean slices |
| 2.4 | bake thresholds may demote a top-end desktop | not a problem here: median `noteBakeMs` 5.1 ms (first 9 bakes), 5.9 ms over 136, p90 17.7 ms, so it stays "high" (thresholds 20 / 40 ms kept, numbers in the test). Cache sizes now come from the static tier only (`cacheTier`): a later measurement changes how much is done ahead, never what is already stored |
| 2.5 | high tier doubles the cache to ~380 MB | fixed: peak `pixels` on the generated apartment over a 0.25×–7× zoom sweep: 8.4e6 (126 pictures; ~34e6 at DPR 2). High tier back to the old 48e6 ceiling |
| 3.1 | prewarm pass repeats forever | fixed: a pass runs only when a fingerprint of its inputs moved (items, zoom, DPR, view at 50 cm, next-zoom setting, `spriteGeneration()` for disk index / texture / catalogue / renderer events), and again while a light is still being measured. 3 s of flow animation: `prewarmOrder` 3 calls + 108 `itemSprite` → 0, pass cost 1.5 → 0.5 ms (44 items) |
| 3.2 | prewarm for users who never open the presentation plan | chosen: on the "low" tier or a touch-first device, prewarm starts only once the presentation plan has been shown on that device (remembered in `localStorage`); mid / high keep it always on, where it is what makes the switch instant |
| 4.1 | library thumbnails can starve | fixed: `pump()` clears the renderer hold while parked for a quiet slot and sets it only around a batch. That let a tile readback meet a bake (a 109 ms `toDataURL` during a zoom), so the tile warm-up now re-checks for a bake after its GPU drain, in the same task as its readback. Zoom ×4: 0 long tasks in both runs, all exact 2.4 / 1.6 s (HEAD 2.9 / 3.0 s) |
| 4.2 | stored heights dropped at boot | fixed: `seedVSpan` no longer waits for three, and three landing no longer clears the cache (nothing measured is cached before it; only seeded spans were dropped). New `sprites_warm_now` (reload, switch at once): first picture 1.7 s vs 2.5 s on HEAD |
| 4.3 | flush on tab hide is best effort | comment now says so |
| 5.1 | inspector edits rebuild the house | fixed: elevation, diameter, fall, exposed, kind, plane, delete, routing policy, "connect missing", adding a device and finishing a route use `conduitsChanged()` (`js/mep/topology.js`): MEP-only rebuild, or a full one when the edit moved an x-ray setting. Auto-generate, focus-issue and the inspect-floor button (they change layers or x-ray) keep the full rebuild. Inspector diameter edit until drawn: 137 → 36 ms (WebGPU, 71 runs), 0 full rebuilds |
| 5.2 | D2 closed on too small a case | re-measured: `drawMEP` per HUD paint 1.4 ms (71 runs) → 10 ms with 401 runs (apartment ×6, WebGL2), 23 ms with 203 runs at 4× CPU, 75 ms with 401 runs at 6× CPU. Auto-generate on ×6: 0.39 s (2.96 s at 6× CPU). Three ways tried: (1) two cached layers (all lines / dashes / all arrows): 9.2 → 2.3 ms at 401 runs but 7–11 % of the overlay's pixels change > 32 levels (runs share corridors: a later run's core hid an earlier run's dashes) — reverted. (2) layers that keep the paint order (a run goes one level up when its dash or arrow touches a later run's line; second opinion: Fable 5.2): exact, but the network is connected, so every junction stacks a level: ~21 levels for 71 runs, 247 for 401 — no gain; removed. (3) exact refactor: visibility from one `ensureMEP()` per paint (it rebuilt the visibility objects for every run, device and clash) and device positions once per paint (`withNodePosMemo`); drawn calls identical to HEAD (recorded, `tests/mep_draw_overlay.test.mjs`): 0.94 → 0.83 ms (71 runs), 7.3 → 6.4 ms (401 runs). Profiled, the 2D overlay is not where the user-felt stall is on a real apartment (71 runs): at 4× CPU, 1.3–1.8 s main-thread stretches while working in 2D are the hidden 3D pane rebuilding after an edit (box/pipe geometry, the D6/E2 merges), and a device drag repaints the model canvas every move (27.5 ms/move, 5.7 ms unthrottled). Both fixed below (5.2b, 5.2c) |
| 5.2c | a device drag repaints the whole plan per move | while the flow animates (the default whenever live runs exist) the whole overlay is on the HUD, yet an MEP drag asked for a model repaint every move. Now it repaints the HUD only when `mepOverlayOnHud()` (the predicate that put it there); with the animation off it repaints as before. 4× CPU, 12 moves: device drag model paints 18 → 2 (+4 forced for the check), model time 748 → 175 ms; vertex drag 1.45 → 0.51 s. After every 3rd move the frame as drawn equals a full repaint at the same phase (0 pixels differ) |
| 5.2b | hidden 3D rebuild lands in the next action | measured per edit with the 3D pane hidden (generated apartment, 71 runs): this desktop 12–38 ms; at 4× CPU a wall move 160–220 ms, an infrastructure edit 60–80 ms, a resized piece ~110 ms, each one task started 300 ms after the last input. Fixed: `js/view3d/rebuild_hold.js` (Node-tested): a hidden pane waits for 1.5 s without input (wheel now counts); a shown pane still builds what is pending on its first frame. 4× CPU, an edit then 3.2 s of steady input: HEAD 180–213 ms rebuild inside the work every time, now 0 (the rebuild lands in the pause). Opening 3D 100 ms after a wall move shows the moved walls (every structure mesh matches the settled scene), 0.9–1.1 s to open at 4× CPU (HEAD 1.3 s) |
| 6 | tests and verification | Node tests: `tests/plan_sprite_batch.test.mjs` (batch picker, cache count, quiet-input rule, fingerprint, boot heights, pump and tile wiring), `tests/device_budget.test.mjs`, `tests/mep_3d_path.test.mjs`. WebGL2: sprites cold 1.8 / 4.0 s, zoom 1.7 s with 0 long tasks; 3D merges deterministic run to run; merged vs `--no-merge` differs in 107 of 560k pixels (98 by 1–2 levels, 7 by 3–32, 2 by > 32). Full suite and browser suite: below |

Full suite (`npm run test:quiet`) with all of the above and package E in place: 6,353 tests,
0 failures, 3 skipped. `npm run check` passes. Browser suite: 707 tests, 473 pass, 11 fail,
223 skipped. The same 11 fail on a clean `HEAD` checkout (cabinet inspector / units, model
editor, modeler responsive flow at 4 widths, narrow viewport, floor navigation, room display
units), so they are pre-existing and not touched here.
