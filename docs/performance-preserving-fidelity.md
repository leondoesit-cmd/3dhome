# Performance improvements preserving fidelity

Implemented against the existing working tree on 2026-09-30. The tree already
contained substantial work; comparisons below use source snapshots saved before
this task, rather than Git HEAD.

## Changes

1. **Retain solid geometry during inspection selection.** Solid selection and dependency changes
   update material state, topology decorations and Instant3D handles in place.
   The editor still refreshes its tree, inspectors, status and authoring controls.
   Solid inspection no longer recompiles feature history or rebuilds solid meshes.
   Selection during 2D or 3D sketch editing retains its established working
   geometry/support reconciliation path and reuses the existing core run.
2. **Retain drawing projections during solid selection.** An inspection selection change no longer
   invalidates the drawing token. Geometry edits retain their full refresh and
   partial-rebuild invalidation paths.
3. **Solve an assembly once per full refresh.** Panels, viewport and drawing
   construction share the solution made within that refresh. An explicitly
   completed solve is consumed once; standalone construction still solves. The
   scoped state is restored in `finally`, including when a panel throws.
4. **Serialize cache inputs once.** Each feature and common dependency is
   normalized/serialized once, then combined into the same complete canonical
   JSON keys. This removes repeated traversal of growing feature prefixes.
5. **Transfer fresh worker buffers.** Fresh BREP/export buffers transfer ownership
   instead of being cloned. Regeneration coordinates use Float64 on the wire and
   become ordinary arrays before the client exposes the result. Finish payloads
   that may alias retained Shell caches remain cloned.

The changes preserve tessellation settings, antialiasing, display styles, physics,
CAD operations and tolerances. Cache keys remain complete signatures, with the
same existing frame normalization and no additional rounding or hash collisions.
Native exact proofs, topology names, downstream operations, mass evaluation,
STEP/IGES export and the saved plain-array mesh format remain in place.

Selection stores original material values without color quantization. Shared
materials are isolated on first mutation; viewport-owned materials are reused.
Exact painted surface meshes also follow selection while retaining explicit
appearance opacity, transparency, depth writing and shadow behavior.

## Measurements

Local fixture measurements, not claims about whole-app speed:

| Work | Before | After | Result |
| --- | ---: | ---: | --- |
| Cache keys: 180 features, median of 7 | 594.07 ms | 25.51 ms | 23.29× faster; every prefix signature byte-identical |
| Transport: 900,000 coordinates, median of 7 | 81.62 ms | 37.97 ms | 2.15× faster; complete plain-array restoration included |
| Legacy face selection: solid builds / edge scans | 2 / 2 | 0 / 0 | Existing geometry retained |
| Canonical face selection: solid builds / edge scans | 2 / 2 | 0 / 0 | Existing geometry retained |

Browser gesture timings were collected during other tests and are not used as
reliable latency estimates. Operation counts establish the removed work.

Reproducible scripts, baseline snapshots and machine-readable measurements are
under `scratch/performance-preserve/`: `benchmark.mjs`, `benchmark-transfer.mjs`,
`cache-benchmark.json`, `transport-benchmark.json`, and
`modeler-before.json` / `modeler-after.json`.

## Verification

- Final `npm run check`: no free identifiers, no link errors across 590 modules;
  1,489 source assertions checked.
- Final focused correctness run: 36/36 passed. Includes cache invalidation and
  canonical-key equality, precision extremes, native BREP/topology and mass,
  STEP/IGES, repeated cache use after transfer, cancellation/client lifecycle,
  selection material isolation, assembly solve scoping, and the sketch-authoring
  reconciliation guard.
- Updated existing modeler performance tests: 15/15 passed, including retained
  geometry, no solid disposal and an unchanged drawing token on selection.
- Hardware Chrome GPU tests: 3/3 passed with `MF_BROWSER_GPU=1`. Part and assembly
  selection match a full viewport rebuild pixel for pixel. Assembly poses remain
  equal, instances highlight independently and selection performs no mate solve.
  The painted-face case checks exact surface pixels, explicit opacity and retained
  buffers/materials with line and selection helpers hidden in the test fixture.
- Complete live-preview browser file: 6/6 passed, including analytic per-tick
  timing, debounced kernel work and seed-buffer isolation.
- Full CI attempt: the unit stage recorded 3,593 passes and 14 failures across
  3,607 tests. All 14 failure names reproduce with the pre-change modeler snapshot
  (the icon checks concern files this task did not change). CI stops at this stage.
- Separate full browser run recorded 393 passes, 36 failures and 206 skips across
  635 tests. Of these 36 failing cases, 32 also fail in baseline comparisons and
  4 pass on current-source repeat runs. The sketch Intersection case is
  intermittent in both versions; the conservative sketch refresh guard remains.
  The analytic timing case passes when the complete file runs with its required
  shared setup under normal load. A test-name-only run omits that setup, so its
  null-page failure is not used as baseline evidence for the timing assertion.

The transparent painted-face fixture exposed an existing full-rebuild problem:
line-helper pixels can change between rebuilds while camera and material values
stay identical. It also reproduces with the pre-change source. This task does not
claim to fix it; the surface comparison isolates appearances, while the other
two GPU cases retain their complete viewport comparisons.

Relevant tests: `viewport_selection.test.mjs`, `modeler_refresh_work.test.mjs`,
`cad_worker_geometry_keys.test.mjs`, `cad_worker_transfer.test.mjs`,
`modeler_perf.test.mjs`, `performance_fidelity.browser.mjs`.

Logs: `ci-after.log`, `browser-after.log`, `pre-existing-failures.log`,
`pre-existing-other.log`, `browser-baseline-editor.log`,
`browser-baseline-remaining.log`, `browser-repeat-current.log`,
`sketch-intersection-baseline-repeat.log`, `final-correctness.log`,
`live-preview-final.log`, and `gpu-final.log`, all under
`scratch/performance-preserve/`. Existing failures prevent claiming a clean
whole-app CI result.
