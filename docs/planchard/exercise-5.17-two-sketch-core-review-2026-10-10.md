# Exercise 5.17: bounded two-sketch core integration review

Date: 2026-10-10. This is a code/core-native verification report. It does not certify actual Chrome creation, independent browser editing or full browser cold acceptance.

## Implemented core

- `js/core/hole_wizard_sketches.js`: versioned, persisted `cylindrical-position-3d` and `hole-counterbore-profile` sketch factories. Factory creates real XYZ A/B/P, a construction line and position point, six source relations, plus a six-line closed axial profile with driving bore/head diameter and recess depth. Factory is atomic and leaves insertion/history ownership to the caller.
- Position solver evaluates the actual saved XYZ and authored active/suppressed relations, solves residuals with a bounded damped numerical iteration and computes Jacobian rank/DOF. A removed Along Y relation leaves actual free angular coordinates instead of quietly reconstructing that relation. Fully defined consumers reject missing, malformed, suppressed or unsupported-version sketches.
- Profile solver refreshes a constrained stepped half-section and its local 3D frame from the position and actual cylinder. Scope is deliberately a through-all counterbore on one undrafted straight Top-plane circular extrude. Profile dimensions drive native geometry; through-all display extent is derived. The profile editor must restrict edits to this bounded parameter family rather than claim arbitrary contour editing.
- Shared `resolveHoleWizardInputs` resolves both saved objects and synchronizes explicit centimetre/millimetre values so stale feature aliases cannot override the profile. `sketchId` is forced to the actual profile ID after parameter merging. Legacy cylindrical features retain parameter-only resolution without synthesizing new sketches.
- `hole_geometry.js` compatibility cutters and `kernel_feature_adapter.js` native lowering consume this same resolved input. Compatibility refresh copies all relevant pair cutter parameters, including changed diameter/depth, instead of only placement.
- `cad_feature_tree.js` native sketch diagnostics now receive actual upstream feature records. Previously they received only owner IDs; a genuine associative source solver then could not identify the cylinder type or dimensions.

UI/history integration is owned separately by the UI agent. APIs are `createHoleWizardSketchPair(params,document,{positionId,profileId})`, `isHoleWizardSketch(sketch)`, `solveHoleWizardSketch(sketch,document)` and `resolveHoleWizardInputs(featureOrParams,document)`. Position editor fields: `topDistance`, `branch`, constraint `enabled`/`suppressed`. Profile driving values: `dimensions[].name/value` for `diameter`, `cboreDiameter`, `cboreDepth`. Source IDs remain explicit on `source.featureId/circleId/faceReference`; profile dependency is `positionSketchId`.

## Verification completed

`tests/hole_wizard_sketches.test.mjs`: 8/8 passed.

1. Genuine geometry and solver status survive JSON cold serialization; profile frame has the inward axial orientation.
2. Independent position and profile dimension edits produce identical native-lowering and compatibility cutter dimensions/frame. A stale 123 mm feature bore alias cannot override the actual profile.
3. Removing Along Y exposes positive DOF and preserves independently authored free angular coordinates. Consumption fails; restoring it solves the point.
4. Upstream radius/height edits and an explicit negative-Z branch relocate saved XYZ and the profile frame.
5. Unknown versions, missing/malformed relation references, mismatched sources, impossible profile dimensions and suppressed inputs fail explicitly, without legacy fallback.
6. Compatibility cut refresh updates real bore dimensions and is idempotent.
7. Factory rejection and legacy resolution leave the document unchanged.
8. Actual OpenCascade regeneration from cold-serialized two-sketch input produces a positive-volume cut solid. Increasing the profile bore decreases actual native solid volume; editing the position changes the native cutter topology origin to the new source-derived point.

Focused regression command covering the new test plus hole point positions, circular layout/callout, socket-head size, support-stage binding, ordinary sketch rebuild status and parametric core passed **35/35**. Earlier cylindrical placement/constraint integration run passed **22/22** (before adding the additional native two-sketch case). This includes preservation of ordinary planar point-driven holes, manually bound union-face holes, explicit stage-qualified native hole placement, fractional size defaults and conflicting/redundant planar sketch status.

Combined dedicated editor/history and core/native verification passed **13/13**, including nonmutating edit drafts, dependency-safe deletion/order, suppression/rollback and cold malformed/underdefined diagnostics.

`npm run check` completed successfully with no free identifiers, no link errors and 1,489 source assertions checked. Later integration changes require the final combined gate run by the parent/UI agent.

## Integration review findings sent to UI owner

- Hole input selection formerly allowed at most one sketch. UI owner added a targeted exception for the exactly two distinct IDs matching the persisted pair; ordinary holes retain the one-sketch limit.
- Source dependencies, profile-to-position ordering, suppression, deletion, cycles and rollback must share the same sketch dependency traversal. UI owner is implementing these rather than relying on labels.
- Deliberately suppressed subtype sketches must be skipped by solve diagnostics and retain suppressed display status; the strict consumer resolver still rejects suppressed inputs. This avoids reporting an intended suppression cascade as malformed authoring.
- Stable UI source inspection confirmed atomic pair creation/rollback and separate profile editing. Requested an additional current-history-node guard across asynchronous editor native verification, because Undo/Redo can move history without incrementing the edit revision.
- Feature Edit on a pair should route to its driving profile editor, while the position has its separate editor. Competing ordinary wizard dimension fields must not silently diverge from profile dimensions.

## Remaining acceptance

Actual Chrome source creation, separate sketch Edit controls, visible XYZ construction/DOF, profile contour/dimension controls, native/preview refresh, undo/cancel transaction behavior, hard reload/exact-library reopen and protected exported model/STEP/drawing evidence remain the parent's browser acceptance work. Do not call the book two-sketch workflow complete from these unit/native checks alone.
