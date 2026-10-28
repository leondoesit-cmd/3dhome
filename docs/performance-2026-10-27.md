# Where the reported slowness comes from (Track B1, 2026-10-27)

This is the measurement step of the roadmap in
[rust-webgpu-assessment-2026-10-26.md](rust-webgpu-assessment-2026-10-26.md). The
four reported slow areas (3D open and light changes, CAD rebuilds, big-plan editing,
import/recognition) are measured here before anything is changed.

**Setup**
- Windows 11, RTX 5070 Ti, Ryzen 7 5700X3D, Chrome 155 (fresh profile, vsync off,
  WebGPU).
- Scene: generated large apartment (seed 3): 18 walls, 44 items, 838 meshes.
- One round per probe unless noted. This is a fast desktop GPU: laptops and phones
  will be slower, never faster.

**Reproduce** (needs the app served, e.g. `npm start`):
```powershell
node tools/gpu_bench.mjs --only=stall_hour,stall_add_item,wall_drag_plan,wall_drag_split,door_drag_plan --backends=webgpu --rounds=1
node tools/gpu_bench.mjs --only=stall_hour --stall-settle=60000 --backends=webgpu --rounds=1
node tools/gpu_bench.mjs --only=init --backends=webgpu --rounds=1
```

Those probes are new in `tools/gpu_bench.mjs` and opt-in (named with `--only`):
- `stall_*` time one user action and split its cost:
  - `actionMs`: the action itself.
  - `renderCpuMs`: three's JS inside `render()` over the next two frames, which is
    where node and shader building happens.
  - `gpuWaitMs`: the wait for the GPU queue afterwards (driver pipeline compiles
    plus GPU work).
- `*_drag_*` run 30 pointer moves, one frame apart, under the V8 CPU profiler.
  Each records what was grabbed and whether the geometry changed.

## Ranking

The worst two (rows 1 and 2) are minutes-per-session problems on a fast machine.

| # | Area | User action | Measured | Where the time goes |
|---|---|---|---|---|
| 1 | Big-plan editing | Drag a wall with only the plan visible | **181 ms per move** (p95 623 ms, p99 2.6 s), about 5 fps | The hidden 3D view rebuilds and three re-builds node shaders on every move |
| 1 | Big-plan editing | Drag a door along its wall | 121 ms per move (p95 285 ms) | Same |
| 1 | Big-plan editing | Drag a wall in split view | 91 ms per move (p95 136 ms) | Same rebuild, but the visible view keeps shader caches warm |
| 2 | Light changes | Time of day crosses 18:00 (sun off, ceiling lamps take the shadows) | **4.4 s freeze**, still present after 60 s idle; 17:00 costs 0.9–1.3 s | 3.5 s waiting on the GPU queue + 0.87 s three node building. A device-call count later confirmed 12 new render pipelines and 15 shader modules at 18:00, against 0 for every other step. Other half-hour steps cost ~60 ms |
| 3 | 3D open | Compile the whole planner scene cold (synthetic: a second renderer, no post chain) | **9.3 s** (was 5.3 s on 2026-10-16 with 785 meshes); first frame afterwards 0.37 s | Pipeline count. A real action-to-present first-open measurement is still to do |
| 4 | Light / furniture | Place a furniture type the 3D view has not drawn yet | 210–300 ms typical; **2.8 s** for the kitchen island | The island is 2.5 s GPU compile. Typical items are 100–190 ms of three node building |
| 5 | CAD rebuilds | First kernel use, and again after **every** worker restart (120 s idle, or any cancel) | 2.6–3.2 s to load OpenCascade | Inflate + compile of 50 MB WASM from a buffer: no streaming compile, no code cache |
| 5 | CAD rebuilds | Drag a sketch point | 79 ms per frame at 320 variables, 600 ms at 640 | Dense O(n³) solve of the whole sketch (`js/core/least_squares.js`, 96% of samples) |
| 5 | CAD rebuilds | Drawing views (hidden line) | 0.6–1.2 s per view at 58k triangles, on the main thread | edges × cylinders scan (`js/core/hidden_line.js` `cylindricalSeam`) |
| 5 | CAD rebuilds | Motion study playback | ~226 ms per frame | ~31% re-stringifying and cloning documents |
| 6 | Import | PDF/DXF plan recognition | p50 7.9 ms, **p99 2.5 s, max 6.6 s**, synchronous on the main thread | Flat profile; no worker |

**Sources.** Rows 1–4 were measured on 2026-10-27 with the probes above. The CAD and
import rows were measured on 2026-10-26 during the assessment:
- the kernel load in this session's browser and desktop checks;
- the solver, hidden-line and playback numbers in Node with the V8 profiler;
- the recognition numbers from the stored `bench/out` reports (1,877 samples).

## What the profiles say

**Wall drag, plan only**
- 9.2 s of CPU across 30 moves.
- three's node builder dominates: `build` (three.webgpu.js:2212, :2816, :8958),
  `analyze`, `getChildren`, `getNodeType`, `getMaterialCacheKey`. That is 4.5 s,
  plus 2.8 s of native time.
- The 3D view is hidden, yet every move rebuilds the scene and builds node programs
  again.
- Smaller per-move costs that should not be there at all:
  - furniture geometry regenerated (`RoundedBoxGeometry.getUv`, ~3 ms) when only a
    wall moved;
  - the bounce-light plan texture repacked (`js/room_bounce.js` `packPlanMap`, ~3 ms);
  - `detectTimezoneUnitSystem` (`js/unit_settings.js:92`, 3–6 ms). It constructs
    `Intl.DateTimeFormat()` on every unit lookup.

**Dusk handoff**
- The freeze is mostly the GPU process compiling pipelines for the newly keyed
  shaders.
- The idle shadow-set pre-compile (view3d) does not prevent it: the 60 s-settled
  run still freezes for 4.4 s.

**New furniture type**
- The JS share is three's node builder, plus texture upload
  (`copyExternalImageToTexture`).
- The catalog thumbnail warm-up runs on a different GPU device, so it does not warm
  the planner's pipelines.

## What this means for Rust

| Cost | Language-bound? | Would a Rust/WASM port fix it? |
|---|---|---|
| Driver pipeline compiles (rows 2–4) | No | No: WGSL compiles in the browser and driver whatever language submits it. Fewer variants or pre-compiling do |
| three node building (rows 1–4) | Architecture | No: fewer rebuilds and stable materials remove it in JS |
| Rebuild granularity (row 1) | No | No: it is work that should not run |
| OpenCascade loading (row 5) | No (it is already C++) | No: warm workers, streaming compile and module reuse do |
| Sketch solve (row 5) | Partly | 1.5–3× at best. The algorithm fix is 10–1000× |
| Recognition, hidden line (rows 5–6) | No | No: a worker removes the jank; indexing removes the scan |

## Desktop shell (Track C1), same machine

| Orbit | Chrome 155 | WebView2 156 (Tauri) |
|---|---|---|
| Day | 165.3 fps | 148.4 fps |
| Night | 161.3 fps | 151.1 fps |

Medians of two alternating rounds. Details are in [desktop/README.md](../desktop/README.md).

## Track B2 results so far (2026-10-27)

Same machine and probes. Medians of 2 rounds unless noted. The B1 numbers above are
the baseline for the working tree before these changes.

| Problem | Fix | Before | After |
|---|---|---|---|
| A wall drag with only the plan visible rebuilt the hidden 3D house on every move | `js/view3d.js`: while the pane is hidden and a gesture is in progress (a pointer held, or input within 300 ms), the rebuild is held and runs once afterwards. A missed release (a move with no buttons, a blur, a hidden page) ends the hold | 181 ms per move (median) | **11.5 ms** |
| Door drag, plan view | same | 121 ms per move | **16–24 ms** |
| `Object3D.clone` deep-copies `userData` through JSON; walls kept their cutaway stub there, so every clone (the inspector preview's) serialized whole meshes and PNG-encoded textures: 1–3 s moves | `js/view3d.js`: stubs move to a WeakMap | 3 readbacks and 1–3 s spikes per drag | **0** readbacks |
| The lawn was resized to the content on every rebuild, and its texture repeat is part of the material, so every wall move built 7 new shaders (the lit one and 6 shadow passes) | `js/view3d.js`: the lawn grows in 10 m steps | ~200 ms per rebuild (split view) | 12–37 ms per rebuild, 2–4 shadow-pass misses left |
| `detectTimezoneUnitSystem` built an `Intl.DateTimeFormat` on every unit lookup | `js/unit_settings.js`: read once per session | 3–6 ms per move | ~0 |
| The idle shadow-set warm-up was cancelled for good by any frame request (orbit, time change) during its run, so dusk compiled 12 pipelines on the spot | `js/view3d.js`: an interrupted run re-arms itself | 18:00 step 4.4–5.9 s | **0.73 s** after 60 s idle (2 pipelines left); 17:00 0.9 s (1 pipeline, a transparent table-lamp material, under investigation) |
| three's `compileAsync` queues a transparent DoubleSide material's two passes (back faces, then front faces) with the material itself and builds them after `side` is back to DoubleSide, so every warm-up built a cull-none pipeline no frame uses and missed the two that frames do use. A table lamp's shade was the one left at 17:00 | `js/gpu.js` `compileSidesAsDrawn`: each queued pass keeps the side it was queued at; the build sees a per-material, per-side stand-in that differs only in `side` (tests/compile_sides_patch.test.mjs, with a guard on three's source) | 17:00: 1 pipeline + 1 shader module, 0.8–0.95 s. 18:00 after idle: 2 pipelines, 0.73–0.93 s | 17:00: **0 pipelines**, 0.42–0.81 s, all of it three re-creating ~3,000 buffers and ~4,400 bind groups for the new light set. 18:00: **282–305 ms**. The last on-the-spot build, the star field (hidden all day, so the warm-up's walk never met it), is now built once per page by the warm-up: **0 pipelines from 16:00 to 20:00** (`tests/planner_dusk_prewarm.browser.mjs` asserts it) |
| Big plans (198 walls: `gpu_bench --plan-copies=11` tiles the seed-3 apartment): every per-wall helper (`normalizeWall`, `wallLayers`, …) re-normalized every wall through `ensureWallTypes`, and `js/plan2d.js` also called it once per wall drawn, so a 2D paint was O(walls²) | Codex (`js/wall_types.js`, `js/plan2d.js` two lines, `js/geometry.js`, `js/room_area.js`, `js/polygon_area.js`, `js/core/spatial_project.js`): the catalogue repair is remembered per state and redone only when the catalogue, the wall array or its length change (in-place type/layer edits included); joints, room areas and polygon booleans index what they scan. Equivalence against HEAD in `tests/wall_normalize_fast.test.mjs` | door drag 560 ms p50 / 1.4 s p95; split-view wall drag 760 ms | door drag **65 ms / 75–126 ms**; plan-view wall drag 20 ms p50, ~100 ms p95 |
| With the 3D pane visible, a 198-wall rebuild costs ~600 ms, and the fixed 120 ms plan-drag pacing let nearly every move pay one | `js/view3d.js`: a gesture whose rebuilds take over 100 ms waits 3× their cost between them (small plans keep 120 ms) | split-view wall drag 630–760 ms p50 | **29–31 ms** p50, mean 100–123 ms; exact on release |
| Still open on big plans: 149 lights make every lit fragment shader ~830 KB (18 walls: ~139 KB). The first drag after a build waits 2–25 s with the main thread idle while the driver compiles them | The light loop (`?lightLoop=1`) removes unshadowed lights from the shader; it stays opt-in until its over-bright dusk handoff is fixed | | |
| With the 3D pane visible, every move of a plan drag paid a full rebuild (~80 ms) inside the plan's own frame | `js/view3d.js`: a gesture on the 2D plan is followed at ~8 Hz (one rebuild per 120 ms); exact on release. A gesture in the 3D view is never throttled | wall drag, split view: 81–86 ms per move (3 rounds) | **7.1–7.4 ms** median (mean 16–19 ms) |
| The first selection of a session froze the page: the inspector preview has its own GPU device, and its first paint built ~20 shaders synchronously (the selection overlay's studio-lit clones and the scene) | `js/inspector_preview.js`: before its first paint the preview builds them with `compileAsync` from exactly the state it will draw, then paints | one 480–561 ms task (warm caches; 2+ s cold) | **no long task**; preview up in 470 ms |
| The OpenCascade worker recompiled 50 MB after every idle expiry or cancel | Codex (`js/cad_kernel.js`, `js/core/cad_worker_client.js`): compile once per page and hand the module to workers; idle expiry 10 min; worker BREPs stay opaque until used | 2.6–3.2 s per restart | no recompile on restart (not yet timed end to end) |
| Dragging a sketch point solved the whole sketch as one dense system | Codex (`js/core/least_squares.js`, `js/sketch_solver.js`): elimination skips zero multipliers on `Float64Array` rows; each Newton step solves the independent blocks of the Jacobian separately and skips satisfied ones. Same damping, acceptance and rank as before (`cluster:false` keeps the old path for comparison) | 116 ms median at 320 variables, 1,072 ms at 640 | **2.7 ms** / **9.0 ms** median (640: p95 11.5 ms). 535/535 tests in the 58 files that use the solver |
| Drawing views scanned every cylinder for every edge | Codex (`js/core/hidden_line.js`): cylinders are bucketed along their widest axis with conservative bounds, tried in their original order; circle-chord absorption rejects far segments before measuring. Output deep-equal to before | 3.7 s for seven views of a 300-boss plate (56k triangles) | **2.2 s**; `buildEdges` is now the largest cost |
| Motion-study playback cloned the assembly, studies and mate graph on every frame, and the worker received them every frame | Codex (`js/core/motion_playback.js`, `js/core/motion_playback_executor.js`, `js/motion_playback_worker.js`, `js/cad_motion_study.js`): the preview reuses one trial and copies only what the solver writes; the worker gets the graph once per revision, then poses, and answers with changed fields. Claude review: a failed solve pauses at the last good pose again (Codex had made it close the preview), and the trial is resynced after a failure | copying 2.3–6.8 ms per frame | 0.3–2.0 ms. Poses identical on all 167 worker frames. The solver is 77% of what remains (Kant Twist ~400 ms per frame); the B1 "31% cloning" did not reproduce |

New regression tests:
- `tests/planner_scene_clone_cost.browser.mjs`: no three objects in `userData`; the
  hidden-rebuild hold, lost-release cases, and the inspector preview following a held
  rebuild.
- `tests/planner_dusk_prewarm.browser.mjs`: the warm-up resumes after an interruption;
  dusk builds ≤ 3 pipelines on the spot. Without the fix it fails.
- `tests/cad_kernel_main_thread.browser.mjs` and the `tests/cad_worker_*` tests.

**Still open:**
- **17:00 handoff:** 0.9 s for one transparent table-lamp material. Its key is unchanged,
  and `artK` crosses 0.5 at 17:00, so it belongs to the dusk set but escapes the
  warm-up. Most likely three's two-pass double-sided transparent path, which
  `compileAsync` does not build.
- **An idle warm-up build in flight delays the first edit** until that build finishes
  (`finishPrewarm`).
- **Real first 3D open** (new `gpu_bench --only=first_open`, fresh profile):
  - opening 20 s after making the apartment in Plan takes **145 ms**, because the
    hidden pane prepared it;
  - opening it 1 s after takes **5.9–6.4 s**.

  The rebuild lands in 5 ms and the frame is submitted at 7 ms; the rest is the GPU
  queue compiling pipelines. The main thread stays free (≤ 250 ms tasks), but the
  pane stays blank.
- **Shader size, not variant count, is what costs.** The whole planner needs only
  **61 pipelines**, and its 806 materials reduce to **13 distinct shader keys**. One
  lit fragment shader was ~175 KB of WGSL, because every light, shadow map and light
  mask was unrolled. So sharing materials would barely help. The lever is the lighting
  architecture: a light loop over a buffer (three's tiled lighting) instead of
  per-light code.
  - **On by default: the room-map read is shared by every light**
    (`js/room_bounce.js`). Cold first open, 1 s after generating (salted, see
    below): **HEAD 6.8–7.4 s → 5.0–5.9 s**. Biggest lit shader 171.5 → 139.3 KB.
    Pixel-identical to HEAD by day, dusk and night.
  - **Prototype, opt-in (`?lightLoop=1`): light loop, `js/light_loop.js`.** The
    lights that cast no shadow are drawn by one loop over a uniform array, on both
    backends (three's TiledLighting is WebGPU-only and point-only, so it was not
    used). Cold first open **2.7–2.8 s**; biggest lit shader 91.1 KB; all fragment
    WGSL 2092 → 1122 KB; pipelines unchanged (31–33). WebGL2 first open
    1.6–1.9 s → ~45 ms. Adding a lamp: 9.1 s → 0.8 s (lamps no longer key the
    shaders). Dusk handoffs with no warm-up: 6.9 s → 5.4–5.9 s. Steady-state
    frames are pixel-identical by day, dusk and night on both backends.
    **Blocker:** right after the 13 → 17:30 handoff, the loop can leave the frame
    uniformly over-bright (mean +7/255, app frames included) until the next light
    or sky change. It is deterministic in one driver flow and was seen once in
    `tests/planner_light_loop_fidelity.browser.mjs` (WebGL2). Three's path is
    clean in the same flow. Shaders, light lists and packed data are correct on
    the CPU, so the stale state is GPU-side. Root cause not found.
  - **Fixed on the way (`gpu.js sizeShadowMapsAtOnce`):** three sized a shadow
    map only on its first draw. A material bound before that got a placeholder
    depth texture, and the first draw destroyed it. Every dusk handoff re-created all
    six lamp maps; intermittently, "Destroyed texture used in a submit" dropped the
    planner to a bare render with no AO/TRAA.
  - **Next:** the dusk shaders are dominated by the six *casting* lamps (cube PCF and
    BRDF unrolled per lamp). Folding the casters into the loop (shadow factors
    computed before it) is the remaining lever.
  - **Measuring:** the NVIDIA driver's shader cache survives fresh Chrome
    profiles, so repeat cold-compile runs come out fast. Add a per-page salt to every
    WGSL/GLSL program (one that changes the compiled code) for cold numbers.
- **Still to measure:** a 200-wall fixture.

## Next (Track B2, in this order)

1. **Wall and door drags**
   - Do not rebuild a hidden 3D view per move: coalesce to drag end, or until the 3D
     pane is visible.
   - Keep material identities stable across rebuilds, so three's node caches hit.
   - Skip furniture geometry when only structure changed.
   - Memoize `detectTimezoneUnitSystem`.
   - Throttle `packPlanMap` during drags.
2. **Dusk handoff**
   - Make the shadow-set pre-compile cover the GPU pipelines too, or stop the
     handoff from re-keying shaders (fixed shadow slots).
3. **Shader-variant count**
   - Shared opaque materials and per-item render bundles.
   - These shorten the cold compile and the new-item stalls.
4. **CAD**
   - Kernel worker kept warm; module compiled once and reused; streaming compile.
   - Main-thread kernel calls moved to the worker.
   - Solver fixes; hidden line in a worker.
5. **Recognition in a worker.**
