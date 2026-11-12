# Performance improvements without fidelity reductions

## Plan-first background 3D and shared dollhouse navigation

3D initialization now waits until both planner boot entry points have completed
and the plan has had two animation-frame opportunities to paint. An idle task
(bounded by a two-second timeout, with a timer fallback) prepares the existing
renderer and scene even while the 3D pane is hidden. A visible 3D request still
starts initialization immediately after boot. Hidden preparation uses workspace
dimensions; showing the pane resizes the same renderer to the real dimensions.
Saved view preferences are preserved; the normal new-session view remains Plan.

Dollhouse already shares the 3D renderer, scene and navigation controls. Its
toggle now changes only cutaway geometry; it no longer calls `frameDollhouse()`
or `frameView()`. Orbit angle, target, zoom and navigation mode therefore persist
across both toggle directions and Plan/3D switches. Explicit Frame and imported
blueprint overview commands retain their intentional reframing behavior.

New desktop/phone GPU regressions verify that boot completes in Plan before
3D exists, a real GPU frame renders while Plan remains selected, the renderer
and scene remain the same objects, cutaway toggles and restores, and the entire
navigation state is exactly equal before/after both toggles and view switches.
No rendering quality settings changed. Background preparation does consume GPU
and memory even if the session stays in Plan, as requested.

Validation: 20/20 relevant GPU browser regressions passed, plus the final
strengthened desktop/phone first-render checks (2/2); 17/17 boot and renderer
contract tests passed. Module/link/source-assertion checks and diff whitespace
checks passed. Logs: `background-gpu-regressions.log`,
`background-3d-focused-final.log`, `background-unit.log`, and
`background-check.log` under `scratch/performance-2026-10-23/`.

## Startup and first-agent-open follow-up

Measured against the immediately preceding fixed app, saved as
`scratch/performance-2026-10-23/startup-before/`, using 15 alternating navigations
per variant in hardware Chrome (`MF_BROWSER_GPU=1`). Both variants share all
other current files and the same no-store server. This comparison isolates the
new index/agent-launch changes, rather than comparing different app revisions.

| Median | Before | After | Measured change |
| --- | ---: | ---: | ---: |
| Boot-ready latency | 526.3 ms | 516.1 ms | 10.2 ms / 1.9% lower |
| First agent open | 10.2 ms | 3.3 ms | 6.9 ms / 67.6% lower (3.09× faster) |

Boot improved in 11/15 paired rounds; median paired saving was 12.6 ms. This is
a modest fixture result, not proof of a universal startup improvement. Earlier
locale-only repeats varied in either direction. First-open measures until the
dock is open, not completion of the compositor; identical dock HTML (including
rendered SVG icons) is verified after two animation frames for both variants.

Changes: the import map and deferred module entry points now appear in the
head, after the error guard, preserving execution order and DOM-parsed execution.
Only the selected language and normalized icon theme are preloaded, overlapping
their module-evaluation waits with graph discovery. Optional preload failures
leave error/fallback handling to the actual imports. Agent UI code is now loaded
with the boot graph, while DOM construction, conversation restoration and UI
listeners remain deferred until first use. The first click initializes and
opens the original dock synchronously. The command bridge remains ready at boot.

This trades more code fetched before readiness for lower first-open latency.
Resource Timing reported median decoded boot JS of 4,951,507 versus 5,196,621
bytes; early hints can change which resources are complete when sampled, so
this is not a transfer-size or total-code-growth claim. No resolution, materials,
lighting, animation cadence, geometry precision or CAD tolerances changed.
Broad module-preload experiments without useful gains were removed.

Verification: **48/48 relevant browser tests passed with GPU enabled**, zero
skips/failures, including agent interactions, first-use/settings lifecycle,
translated/rotated assembly fidelity and exact planner comparisons on both
WebGPU and WebGL2. Geometry/bounds match and the direct/AO/TRAA comparisons
retain zero differing pixels. **51/51 startup, agent and offline Node tests
passed**, including selected locale/theme normalization and preload-error
handling. `npm run check` and `git diff --check` passed. The full suite was not
repeated for this follow-up; these are the relevant regression runs.

Evidence and reproduction: `startup-followup.mjs` (15 alternating rounds),
`startup-variant-server.mjs`, `startup-followup.json`, `startup-followup.log`,
`startup-unit.log`, `startup-check.log`, and `startup-gpu-tests.log` in
`scratch/performance-2026-10-23/`. The benchmark preserves the before sources,
records raw samples, and captures both settled dock HTML snapshots.

## Benchmark rerun after GPU fixes

All saved benchmark scripts were rerun after the fixes. Original measurement
JSON files were preserved in `scratch/performance-2026-10-23/original-measurements/`.
The baseline source is still the saved pre-optimization source, not Git HEAD.

| Measurement | Original recorded baseline | Original code rerun now | Current optimized code | Improvement in this rerun |
| --- | ---: | ---: | ---: | --- |
| Precise bounds, ms/query | 1.563 | 1.60403 | 0.009544 | 168.1× faster; 99.4% less time |
| Human discovery, ms/tick | 0.0542 | 0.057341 | 0.0000555 | 1,033× faster; animation work excluded |
| Retained definition payload, characters | 8,235,783 | 8,235,783 | 667,117 | 91.9% smaller; 81 versus 1,000 entries |
| 32-wall corner edit/rebuild, WebGPU, ms | 14.5 | 19.7 | 6.7 | 2.94× faster; 66.0% less CPU time |
| Startup decoded JS bytes | 4,995,858 | 5,032,450 | 4,951,507 | 80,943 fewer bytes (1.61%) |
| Boot latency, ms | 447.6 | 927.7 | 918.5 | No demonstrated meaningful latency improvement |
| First agent-dock open, ms | 3.0 | 3.7 | 8.7 | 5.0 ms on-demand loading cost |

Against the original *recorded* wall baseline, current 6.7 ms is 2.16× faster
(53.8% less time). The original code also ran slower today (19.7 versus 14.5 ms),
so the fresh original-code comparison is more useful for judging the optimization.
Likewise, today's bounds and registry operations remain about 164× and 977×
faster than their original recorded baselines. Startup measurements are medians
of seven alternating runs; bounds and traversal use nine warmed batches.
Absolute startup latency increased for both variants, and shared source has
changed since the initial measurements. Decoded byte savings and the observed
first-open cost are the supported startup conclusions, not a boot speedup claim.
These fixture timings are not whole-app FPS or GPU-completion measurements.

Forced WebGL2 currently takes 8.2 ms for the wall edit versus 22.0 ms for its
current forced-full rebuild path; that is a diagnostic comparison, not an
original-source WebGL baseline. Both hardware WebGPU and WebGL2 retain 28/32
wall groups, match geometry and precise bounds exactly, and report **zero
differing pixels** for direct rendering and the complete AO/TRAA comparison.
All five geometry invalidation scenarios pass and both runs report no console
errors. The startup probe confirms identical resulting agent-dock HTML.

The full post-fix correctness evidence remains **5,401 unit tests passed** and
**510 GPU-enabled browser tests passed, zero failures**, with the 153 disabled
Customize cases skipped. These complete suites were run immediately before this
benchmark rerun; no production code changed during the rerun. Exact assembly
pixel checks include translated and rotated components. Visual confirmation is
for these tested fixtures and render backends, not every possible document.

Fresh data: `microbench.json`, `before-webgpu.json`, `webgpu.json`, `webgl.json`,
and `startup.json` under `scratch/performance-2026-10-23/`; execution logs use
the `post-fix-` prefix. Reproduction uses the same `benchmark.mjs`,
`browser-check.mjs --before`, `browser-check.mjs`, `browser-check.mjs --webgl`,
and `startup-benchmark.mjs` scripts described below, with `MF_BROWSER_GPU=1`.

Implemented on 2026-10-23 against the existing working tree. Other uncommitted
work was preserved. The baseline is the saved source in
`scratch/performance-2026-10-23/before/`, not Git HEAD.

## Implemented, in order

1. **Precise selection bounds:** reuse the original vertex-exact world-space
   result while descendant transforms, geometry attributes and buffer versions
   remain unchanged. Camera changes do not invalidate it. Skinned, morphed,
   instanced and custom vertex readers use the original calculation. Multiple
   selected walls share one scene traversal.
2. **Human registry:** Three's subtree attachment/removal events maintain the
   human set. Animation visits that set at the existing cadence, with the same
   animation function and timestamps. Removed subtrees lose their listeners.
3. **History pool collection:** retain values reachable from every undo branch,
   the live document and the history observation checkpoint. Independent gesture
   and practice checkpoints carry their own reachable values. Portable checkpoints
   now also carry pooled parametric definitions. Collection runs after editing
   pauses; no undo steps are removed beyond the existing history cap.
4. **Deferred agent UI:** keep the command bridge active at boot; load the dock
   and settings UI on demand. Queue initial tutor/proposal events across loading,
   retain saved conversation rendering, and avoid duplicate initialization.
   Other background-dependent panels remain eager.
5. **Incremental wall geometry:** retain eligible straight, opaque, untextured
   wall buffers when the wall, incident arms, their endpoints/openings, wall-type
   definitions, color, cut height and x-ray inputs match exactly. New identities
   after document restoration reject reuse. Openings on the wall, framing,
   curves/profiles, textured finishes and active physics/game modes use the
   existing builder. Floors, MEP, lighting and collision rebuilds retain their
   existing dependency paths.

Wall materials are deliberately recreated in builder order. Reusing their old
IDs altered opaque draw ordering at overlapping edges, producing small GTAO/TRAA
differences. Fresh material instances preserve exact pixels while retaining
geometry. Old materials retire after replacements draw, preserving shader cache
lifetimes and releasing resources.

No resolution, tessellation, material settings, light/shadow settings, antialiasing,
animation cadence, CAD tolerance, geometry precision or physics fidelity was reduced.
The offline manifest includes every new browser module.

## Measurements

Windows, Node v24.19.0, hardware Chrome. These are fixture measurements, not a
whole-app FPS claim. CPU timings exclude completion of queued GPU work.

| Measurement | Original | Optimized | Interpretation |
| --- | ---: | ---: | --- |
| Repeated precise bounds, 95,060 vertices | 1.563 ms/query | 0.0096 ms/query | About 162× faster for unchanged selected geometry |
| Human discovery, 5,001 objects / 5 people | 0.0542 ms/tick | 0.000040 ms/tick | Visits 5 registered objects instead of traversing 5,001; animation work excluded |
| Definition pool after 1,000 distinct snapshots, 81 retained | 1,000 entries / 8,235,783 characters | 81 entries / 667,117 characters | 91.9% less retained serialized payload; not a heap/RSS measurement |
| Corner edit and scene rebuild, 32-wall fixture, WebGPU | 14.5 ms | 5.1 ms | About 2.8× faster; retains 28/32 wall groups |
| Startup JS decoded bytes, median of 7 | 4,995,858 | 4,906,170 | About 90 KB less code at boot |
| Observed boot latency, median of 7 | 447.6 ms | 456.9 ms | No demonstrated startup latency improvement |
| First agent-dock open, median of 7 | 3.0 ms | 22.2 ms | On-demand loading tradeoff; resulting dock HTML identical |

Bounds/traversal timings are medians of nine batches after warmup. Startup runs
alternate original and optimized source through the same no-store test server;
they measure decoded bytes, not the relay's Brotli transfer size. Boot timing
includes polling quantization and normal scheduling noise. Do not interpret the
small boot-time difference as a reliable regression or speedup.

The original structural measurement uses saved pre-change `view3d.js`. The
optimized forced-full path measured about 15 ms: cache checks add some overhead
when nothing can be reused. The 2.8× improvement uses the actual original 14.5 ms
baseline, not that slower forced-full comparison. Timing rounds alternate a
0.25 cm corner movement and a forced rebuild. Original and optimized probes ran
separately; these are not controlled hardware-wide benchmarks.

## Verification

- `npm run check`: no free identifiers, no link errors across 736 modules, and
  no comment-only assertions.
- Focused initial regression run: **90/90 passed**.
- Clean full `npm test` rerun outside the sandbox: **5,401/5,401 passed**, no
  failures or skips, in 964.45 seconds (`full-tests-rerun.log`).
- Clean full `npm run test:browser` rerun: **450 passed, 0 failed, 212 skipped**
  in 520.57 seconds (`full-browser-final.log`). Existing skip conditions remain
  intact. The first full browser run exposed two test assumptions: the external
  bridge card was checked before its lazy render, and the guided draft expected
  three rooms without selecting the small plan. Both tests now wait/select
  explicitly, retaining their behavioral assertions; no production behavior was
  changed for these fixes.
- Follow-up hardware visual rerun: **2/2 passed** on WebGPU and WebGL2
  (`gpu-final-rerun.log`), including exact geometry and pixel comparisons.
- New unit tests cover nested transform/geometry invalidation, interleaved buffer
  updates, deforming geometry, scene reparenting, branched undo, pool collection,
  independent checkpoint restoration and wall dependency keys.
- Permanent GPU regression: **2/2 passed**, one hardware WebGPU case and one
  forced WebGL2 case. Exact geometry arrays, normals, world transforms, material
  colors/opacity, shadow flags and precise selection bounds match forced rebuilds.
  Direct rendering and the complete AO/TRAA pipeline both have **zero differing
  pixels**. The fixture also checks wall height/layer/opening/removal/paint
  invalidation and retirement of old materials.
- Browser lifecycle tests: **2/2 passed**, covering first-use agent UI/bridge
  availability and a texture checkpoint restored after 100 edits and collection.
- Agent browser follow-up: **18/18 passed**. The wall-snap failure reproduced on
  pre-change source because the test expected the old 400 cm room while startup
  now supplies a larger apartment. The test now explicitly loads that room and
  waits for the proposal to render; all exact placement assertions remain intact.

GPU capture instrumentation exists only in the test server. It pauses competing
planner draws, prevents asynchronous shader prewarming from temporarily changing
the light rig during comparison, and primes matching temporal jitter/depth
history. It does not change production quality settings. The pixel result covers
the supplied architectural fixture, not every possible document or GPU.

## Reproduce and inspect

### Audit of the 212 browser skips (initial results)

The standard browser run's skips were fully accounted for:

| Reason | Tests | Follow-up |
| --- | ---: | --- |
| Physical viewport picking requires GPU | 38 | Enabled and executed |
| Real pointer picking requires GPU | 6 | Enabled and executed |
| Survey tests require GPU | 7 | Enabled and executed |
| Hardware rendering fidelity | 6 | Enabled and executed |
| Incremental WebGPU/WebGL2 fidelity | 2 | Enabled and executed |
| UI Customize is disabled in production | 153 | Remain disabled |

`tests/helpers/customize_gate.mjs` derives its skip from the literal
`CUSTOMIZE_DISABLED = true` in `js/uikit_host/index.js`. The production comment
explains that saved customization conflicts with the current desktop layout.
There is no test-only environment switch for this feature. Enabling these 153
tests requires enabling different app behavior; it was left unchanged.

All 59 GPU-gated tests ran with `MF_BROWSER_GPU=1`, serially on hardware Chrome.
The run also included the GPU branches in tool parity and survey storage, plus
the related battery-view and cabinet tests: **83 executed, 66 passed, 17 failed,
0 skipped**, in 137.35 seconds (`enabled-browser-tests.log`). Of the original
59 skipped tests, **42 passed and 17 failed**. All four affected files were run
again: **52 executed, 35 passed, the same 17 failed, 0 skipped**, in 72.74 seconds
(`enabled-browser-repeat.log`). No production code, test assertions, or feature
flags were edited during this audit.

The newly exposed failures prevent a blanket visual/correctness sign-off:

| Area | Failures | Observed evidence |
| --- | ---: | --- |
| Assembly selection | 1 | Geometry retention, solved poses and highlight checks pass; final pixel equality fails. |
| Cabinet runtime preview | 1 | Pixels and bounds match, but 58 mesh disposals and one rebuild violate the reuse assertion. |
| Planner cabinet runtime motion | 1 | Retention fails with 69 disposals. The test then compares its captured old cabinet group with a fresh build, so its geometry mismatch alone does not establish that the displayed replacement is wrong. |
| Wall surface-point tests | 2 | `plannerPointer3D` returns null before the test can check marker height or undo. |
| Arc draft / view switch | 1 | Active viewport is `plan`, while the test expects `3d` after switching to split. |
| Orbit wall tools | 11 | Select hits a room instead of the wall; door/window/passage and wall operations consequently fail their state assertions. Diagnostic rays hit the floor. Cutaway walls are intentionally excluded by picking; whether the fixture should explicitly select full walls needs further diagnosis. All 19 walk-pointer cases pass. |

Verified visual coverage includes exact incremental planner geometry, bounds,
direct pixels and AO/TRAA pixels against full rebuilds on both WebGPU and
WebGL2; painted-face and solid-selection pixels; cabinet canvas projections and
thumbnails; cabinet preview pixels and bounds. Survey navigation/collision,
survey handle commit/cancel/undo, and all 19 tool-parity cases also pass with GPU
enabled. These results do not resolve the assembly pixel failure or certify all
scenes.

Reproduce the enabled run without changing the app:

```powershell
$env:MF_BROWSER_GPU='1'
node --test --test-concurrency=1 tests/performance_fidelity.browser.mjs tests/planner_cabinet_performance.browser.mjs tests/planner_incremental_fidelity.browser.mjs tests/planner_modifiers.browser.mjs tests/planner_pointer_coverage.browser.mjs tests/planner_tool_parity.browser.mjs tests/survey_gpu.browser.mjs tests/survey_storage.browser.mjs tests/battery_front_view.browser.mjs
```

### Resolution of the 17 GPU failures

One failure exposed an app bug: incremental assembly face overlays used world
coordinates even though their parent already carried the component transform.
This both displaced the overlay and could match the wrong descriptor plane.
`faceHighlightMesh` now transforms vertices into the overlay parent's frame,
updating ancestor matrices first. Both face-selection and face-appearance callers
provide that parent. Exact GPU comparisons pass for translated and rotated
assemblies; the rotated case is an additional regression. No quality settings or
pixel tolerances were reduced.

The other 16 original failures came from test prerequisites:

- Eleven orbit wall-tool tests aimed at walls hidden by the default near-wall
  cutaway. Their fixture now explicitly uses the existing full-wall view setting.
- Two surface-point tests sampled before GPU initialization and pending geometry
  completed. They now await readiness and use visible walls. The related Shift
  pointer test also waits for readiness and asserts finite projected coordinates.
- Two cabinet tests captured fallback meshes while initial PBR loads were still
  invalidating the cache. They now await `pbrLoading()` and establish a fresh
  baseline before measuring motion. Original exact pixels, bounds, geometry,
  material/mesh identity and zero-disposal assertions remain unchanged.
- The arc-draft test assumed split view activates 3D, but the app deliberately
  starts split view on the plan pane. It now asserts that default, uses the actual
  Walk button to activate 3D, and retains the draft, survey, floor and final arc
  assertions.

Assembly captures also explicitly await shader compilation before comparing
completed frames. This alone did not fix the failure: the coordinate bug still
failed the same assertion until the production fix above.

The first full GPU-enabled run then passed all original regressions but exposed
six additional test issues (504 passed, 6 failed, 153 intentionally skipped):

- The floor picker expected a generated PNG even when the active GPU material
  tier uses a baked thumbnail. It now verifies the exact tier-specific source,
  successful decoding, dimensions and nonuniform visible pixels. Both GPU and
  fallback runs pass.
- Toolbar scrolling, survey dragging and tangent-arc input now await the actual
  GPU/font/material prerequisites before interacting. Tangent-arc input also
  uses coordinates measured after the tool changes the layout.
- The responsive game HUD now waits for its resize classes and visual viewport
  height to agree before checking overlap, visibility and touch target sizes.
- The sketch inspector boundary comparison allows only 0.0001 CSS pixel of
  floating-point roundoff (the observed difference was 0.0000305). Its actual
  hit-test and one-pixel field-clearance checks remain intact.

These changes affect tests only. Targeted reruns passed; no application quality
settings, exact image comparisons or geometric correctness checks were relaxed.
The complete Node suite passed **5,401/5,401**, with zero skips, in 1,008 seconds
(`full-unit-gpu-fixes.log`). Module identifiers, all 736 linked modules, and the
1,212 source assertions also passed validation (`gpu-fixes-final-check.log`).

A subsequent full run reached 509 passes with one intermittent Properties-panel
failure. Its CSS bottom was correctly 92 pixels above the viewport edge, but
the measured rectangle was still 36 pixels below that final position during
the opening transition. The test passed unchanged in isolation. It now awaits
the panel's actual animation completion instead of sleeping 420 milliseconds;
all clipping, touch-height and page-navigation assertions remain unchanged.
The focused transition-aware test passed (`properties-gpu-settled.log`).

### Final verification after GPU fixes

The complete browser suite passed with hardware GPU tests enabled and the
standard three-browser concurrency: **663 discovered, 510 passed, 0 failed,
153 intentionally skipped**, in **587 seconds**. All remaining skips are the
disabled Customize feature; none are GPU exclusions. The additional rotated
assembly regression accounts for the increase from 662 to 663 total tests.

```powershell
npm test
npm run check
$env:MF_BROWSER_GPU='1'
npm run test:browser
```

Evidence: `scratch/performance-2026-10-23/full-browser-gpu-verified.log`,
`full-unit-gpu-fixes.log`, and `gpu-final-static-check.log`. The unit run passed
5,401 tests with no skips; subsequent edits were test synchronization only.
The final browser run includes exact translated/rotated assembly pixel checks,
cabinet pixels and bounds, rebuilt geometry equivalence, retained mesh/material
identity, and the existing interaction, undo and responsive-layout assertions.
`git diff --check` also passed. No visual quality setting was reduced.

```powershell
npm run check
node --test tests/precise_bounds_cache.test.mjs tests/scene_registry.test.mjs tests/history_pool_collection.test.mjs tests/wall_build_key.test.mjs tests/survey_assets.test.mjs
node --test tests/performance_lifecycle.browser.mjs
$env:MF_BROWSER_GPU='1'
node --test tests/planner_incremental_fidelity.browser.mjs
```

The source snapshots, measurement scripts, JSON results, PNG comparisons and
logs are in `scratch/performance-2026-10-23/`. In particular:
`microbench.json`, `before-webgpu.json`, `webgpu.json`, `webgl.json`, `startup.json`,
`final-gpu-tests.log`, `full-tests.log`, `restricted-tests-repeat.log`, and
`agent-baseline.log`. `benchmark.mjs`, `browser-check.mjs --before`,
`browser-check.mjs`, `browser-check.mjs --webgl`, and `startup-benchmark.mjs`
reproduce the local measurements. The scratch baseline is intentionally not
required by the permanent regression tests.
