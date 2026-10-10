# Principal-plane extrusion rebuild proxy synchronization

Fixed a generic mismatch exposed by the actual Chapter2 bridge diameter driver: after D12→13mm, native rebuild/STEP were correct but saved `parts[0].cuts3d` retained the sampled radius0.6cm and analytic circle0.6cm. `synchronizeExtrusionProjections` filtered out successful extrusion tools without a face support; principal-plane sketches have no face support.

`js/core/extrusion_projection.js` now synchronizes successful principal-plane cutters/merged-boss records too, using the native run's resolved points, analytic segments, holes and extents. Missing resolved curve/hole metadata removes obsolete proxy metadata rather than retaining an old circle after a profile becomes polygonal. Changed records invalidate the owning mesh. Existing supported through-all frame coverage logic remains intact. Unbuilt tools retain their prior successful records.

Meaningful regressions in `tests/extrusion_projection.test.mjs` cover principal-plane diameter changes updating sampled+analytic recipes, empty holes, mesh invalidation, untouched other records, idempotence, absent-tool failure preservation and removal of obsolete analytic metadata. Existing supported-pocket/through-hole/context tests and plane-offset tests pass:7/7. `npm run check` passes: no free identifiers, no link errors666modules,1489source assertions checked.

Read-only native regeneration on an in-memory clone of protected settled browser export passes6/6 checks: radius0.6000000000000001→0.649999999999995cm, every sampled radius0.65cm within1e-12; dirty body returned and repeated synchronization idempotent. The bridge's through-notch record also adopts its successful canonical extent0→4.001000100000001cm instead of creation-time−2→6cm. Source export bytes remain exactly untouched. Evidence `artifacts/planchard/CH2-BRIDGE-proxy-sync-regression-2026-10-10.json`; helper `scratch/planchard/bridge-proxy-sync-readonly-2026-10-10.mjs`.

Actual Chrome post-fix save/export/cold reacceptance remains the parent's next step; this read-only test is not a new browser-authored artifact. No ADVANCE change or commit by this subagent.
