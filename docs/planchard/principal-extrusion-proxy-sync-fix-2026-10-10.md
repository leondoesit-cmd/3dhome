# Principal-plane extrusion rebuild proxy synchronization

Fixed a generic mismatch exposed by the actual Chapter2 bridge diameter driver: after D12→13mm, native rebuild/STEP were correct but saved `parts[0].cuts3d` retained the sampled radius0.6cm and analytic circle0.6cm. `synchronizeExtrusionProjections` filtered out successful extrusion tools without a face support; principal-plane sketches have no face support.

`js/core/extrusion_projection.js` now synchronizes successful principal-plane cutters/merged-boss records too, using the native run's resolved points, analytic segments, holes and extents. Missing resolved curve/hole metadata removes obsolete proxy metadata rather than retaining an old circle after a profile becomes polygonal. Changed records invalidate the owning mesh. Existing supported through-all frame coverage logic remains intact. Unbuilt tools retain their prior successful records.

Meaningful regressions in `tests/extrusion_projection.test.mjs` cover principal-plane diameter changes updating sampled+analytic recipes, empty holes, mesh invalidation, untouched other records, idempotence, absent-tool failure preservation and removal of obsolete analytic metadata. Existing supported-pocket/through-hole/context tests and plane-offset tests pass:7/7. `npm run check` passes: no free identifiers, no link errors666modules,1489source assertions checked.

Read-only native regeneration on an in-memory clone of protected settled browser export passes6/6 checks: radius0.6000000000000001→0.649999999999995cm, every sampled radius0.65cm within1e-12; dirty body returned and repeated synchronization idempotent. The bridge's through-notch record also adopts its successful canonical extent0→4.001000100000001cm instead of creation-time−2→6cm. Source export bytes remain exactly untouched. Evidence `artifacts/planchard/CH2-BRIDGE-proxy-sync-regression-2026-10-10.json`; helper `scratch/planchard/bridge-proxy-sync-readonly-2026-10-10.mjs`.

Actual Chrome post-fix save/export/cold reacceptance remains the parent's next step; this read-only test is not a new browser-authored artifact. No ADVANCE change or commit by this subagent.


## Actual Chrome post-fix diameter driver

Parent created an independent Saved copy named “Planchard Chapter2 bridge - proxy driver review - browser2026-10-10”, opened roof sketch history row5, changed genuine diameter12→13mm with Enter, finished plane editing, and waited for fresh Native1/RebuildSucceeded. Protected `CH2-BRIDGE-proxy-driver-D13-browser-2026-10-10.mforge` (155292bytes) and actualSTEP(33859bytes) pass10stored-proxy/source guards plus17native/STEP guards. Actual canonical circle, analytic cuts3d circle and every sampled proxy point have radius.649999999999995cm; nativeV58009.015655787494mm³ matches analytic58009.015655787465mm³. ActualSTEP is one valid connectedsolid and both residual differences arezero. Original first2sketches/all3feature authoring/wholeDrawing/sixgreenhistory are exact; copy identity/name are intentionally distinct. This is actual browser proxy/native coherence, not in-memory synchronization. Parent's Undo/Redo/Undo restoration and cold acceptance remain pending.


Actual Undo12/Redo13/Undo12 exports pass8restoration guards plus10stored-proxy guards each. Redo13 equals initialD13 authoring/geometry except rebuild and standards-audit timestamps. Restored nominal Save equals firstUndo in exact sketches/features/wholeDrawing/native mesh positions; only build token/timestamps differ and Save adds correct meshData.bounds. Canonical, sampled and analytic proxy radii restore.6000000000000001cm. No source or geometry drift. Cold witness remains pending; detailed differences retained in `CH2-BRIDGE-proxy-driver-undo-redo-restoration-audit-2026-10-10.json`.


## Final actual cold acceptance

Actual hard reload and exact Saved review-copy reopen yield protected `CH2-BRIDGE-proxy-driver-cold-browser-2026-10-10.mforge` plus cold screenshot. Final actual proxy workflow is accepted:10stored-proxy guards,15nominal native guards and7cold restoration comparisons pass. Canonical/analytic/sampled radii remain.6000000000000001cm, nativeV58303.53996706151mm³. Cold preserves exact sketches/features/wholeDrawing/native mesh positions and coherent part.bounds. Only rebuiltAt changes and redundant meshData.bounds is absent after cold native transfer; source authoring and actual geometry do not change. ActualD13 driverSTEP was separately accepted17/17; no fresh coldSTEP export is claimed. Physical sizing remains the disclosed illustrative Chapter2PDF105/2-19 choice. Parent owns ADVANCE/commit; no ledger change by auditor.
