# Planner and cabinet performance with fidelity preserved

Implemented on 2026-09-30 against the existing working tree. Baseline comparisons
use the source snapshots in `scratch/planner-cabinet-perf/`, preserving the
user's other work instead of treating Git HEAD as the starting point.

## Changes

- Cabinet opening updates the existing door and drawer pivot groups when a fresh
  authoritative layout has exactly the same structural inputs and parts.
  Dimensions, pivots, rotation axes, material inputs, canonical definitions and
  topology remain dependencies. No rounding or shortened hashes are introduced.
- Part changes, including the wardrobe garment-reveal threshold, take the normal
  mesh rebuild path. Custom textures, texture decode events, catalog changes and
  cleared groups also reject reuse. Authoring edits retain their full rebuild,
  linked-definition, manufacturing and validation paths.
- Slider events queue one preview update per animation frame. Closing, switching
  cabinets or destroying the overlay cancels a pending callback. Runtime motion
  keeps its existing separation from authoring history and canonical definitions.
- Planner cabinet motion queues the affected item instead of marking the entire
  scene for rebuilding. Unchanged item build requests retain their existing mesh.
  Full signatures now include canonical definition data, so an independent
  definition edit cannot serve stale geometry or derived data. Catalog revision,
  shadow invalidation, ghosted layers, live item references, missing-item handling
  and the physics full-rebuild fallback remain effective.
- Cabinet elevation and thumbnail canvases skip unchanged backing-size
  assignments. Their integer sizes, display scaling and drawing calculations
  stay the same. Thumbnails clear the entire pixel buffer before drawing,
  including fractional pixels introduced by rounding at noninteger scaling.
- Runtime previews recompute picking bounds with the same Box3/sphere calculation
  as a full preview rebuild and use the existing rendering and clipping path.

Tessellation, materials, lighting, shadow settings, antialiasing, display scaling,
manufacturing tolerances, BOM/cut lists and saved design data retain their quality
and correctness requirements. The planner's existing on-demand rendering,
structure/item separation and 2D model/HUD caching remain in use.

## Measured fixture

Hardware Chrome using the WebGL renderer; a sage `w_classic` wardrobe measuring
120 × 240 × 60 cm, opening from 40% to 60%. Timings are the median of five rounds
after warmup. Each round executes 21 preview updates with actual rendering calls.
They measure synchronous browser work, not completed GPU time or whole-app FPS.

| Work | Before | After |
| --- | ---: | ---: |
| 21 preview updates | 1,098.5 ms | 17.0 ms |
| Geometry rebuilds per round | 21 | 0 |
| Geometry disposal events per round | 1,218 | 0 |
| Rebuilds for a burst of 21 slider events | 21 | 0 |
| Full planner scene marked dirty by that burst | Yes | No |
| Queued planner item operations for that burst | 0; full scene dirty | 1 affected item |
| Cut list before/after opening | Identical | Identical |

The separate scheduler test deliberately supplies an uncached preview: 21 events
produce exactly one rebuild on the next frame when reuse is unavailable. This
checks that coalescing also works on the conservative path.

Reproduction scripts are `scratch/planner-cabinet-perf/benchmark.browser.mjs` and
`baseline.mjs`; machine-readable results are `benchmark-before.json` and
`benchmark-after.json`. Set `MF_BROWSER_GPU=1`, run the benchmark normally for
current sources, or pass `--import ./scratch/planner-cabinet-perf/baseline.mjs`
to Node for the saved pre-change sources.

## Verification

- Final `npm run check` passes: no free identifiers, no link errors across 593
  modules, and 1,489 source assertions checked. `git diff --check` passes for the
  changed source and tests.
- Focused unit suite: 349/349 pass, covering cabinet design/manufacturing,
  planner drawings/canvas behavior, item reuse, layers and physics. Complete
  canonical definition changes and 1e-10 dimensional changes invalidate caches.
- Standard cabinet browser suite plus new non-GPU regressions: 19 pass, zero
  failures; the three hardware-only cases skip in this run. This includes the
  model-editor handoff, resizing, save/reload, joinery, production review,
  dimensional inspection, allowances and stale revision rejection.
- All five new hardware-browser regressions pass on the final code. They compare
  cabinet preview pixels and picking bounds against a full rebuild, all cabinet
  presets against independently built geometry/attributes/materials/transforms,
  planner runtime geometry against an independent fresh mesh, retained structure
  and furniture, disposal counts, slider scheduling and conservative invalidation.
  The canvas case compares every projection and the thumbnail against a reset
  reference at display scaling 1, 1.25 and 2.
- Broader planner hardware suite: 88 pass, three fail across 91 cases. All three
  failing names also fail with the saved baseline: wall-surface point height in
  orbit and walk, and completed arc/survey viewport preservation. The orbit case
  timed out under concurrent load; baseline reaches the same null-hit failure as
  the walk case. Tool parity, real orbit/walk pointers, work-set picking, layer
  exports, undo, floor switching and the main planner layout checks pass.
- The expanded hardware cabinet run records 21 passes and one model-editor
  handoff/reload timeout under concurrent load. That case passes on the current
  source when repeated separately, as well as on the saved baseline. The standard
  browser suite passes it too.

Logs and snapshots are in `scratch/planner-cabinet-perf/`: `unit-final.log`,
`check-final.log`, `browser-final.log`, `cabinet-gpu-final.log`,
`cabinet-parametric-gpu-repeat.log`, `cabinet-parametric-gpu-baseline.log`,
`planner-browser-final.log`, `planner-modifiers-baseline.log`, and the benchmark
JSON files. The prior whole-app CI findings are recorded in
`docs/performance-preserving-fidelity.md`. This follow-up runs focused suites;
it does not claim that the existing whole-app CI failures have been resolved.
