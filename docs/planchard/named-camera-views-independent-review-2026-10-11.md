# Named camera views: independent review

Read-only review of the frozen `named_camera_views.js` helper and ordinary modeler toolbar/menu/form integration. No production code, authored CAD, browser state or source artifacts were changed by this review.

## Numeric-ID correction after actual browser discovery

The initial passing test harness supplied a string UID and missed the production `state.js::uid()` numeric contract. Actual Chrome exposed the caller/core mismatch: strict named-view insertion rejected the numeric ID after Undo. The earlier20/20 result did not cover that real caller contract and was insufficient to establish successful browser insertion.

The frozen correction computes `recordId=String(uid())` before preview validation and Undo, then uses the identical validated ID for live insertion. Strict core validation remains unchanged. The revised regression executes the actual production UID function with numeric counter6478 and asserts persisted string ID `6479` in both Part and Assembly; normalized owner/history/source guards remain intact. Independent final rerun of the same three test files: **20/20 PASS** with this real-UID regression. No reviewer production edits were made. Actual Chrome retry/acceptance remains parent-owned and pending here.

## Result

No confirmed defect within the implemented scope. The ordinary **Named views** menu exposes **Save current view…**, current stored-name recall and **Delete [name]** for Part and Assembly. Assembly CSS preserves the shared projection group containing this control.

Camera poses validate finite azimuth/elevation/distance and world target, positive distance/zoom, supported projection, and finite orthonormal fixed-frame axes before mutation. Capture retains the orbit projection preference while Normal To remains orthographic. World-centimeter target conversion correctly accounts for model center and offset frame; recall retains framing when the model center changes.

The naming form checks current document type/owner/history before Undo and reacquires the normalized live owner afterward. Menu recall reads the current stored record; deletion rejects a stale owner, captures Undo, and removes from the normalized live document. Metadata deep copies isolate returned/captured records. Geometry, source features and occurrence definitions are untouched. JSON cold persistence and canonical definition migration retain the records.

## Independent verification

`node --test tests/named_camera_views.test.mjs tests/editor_orbit_projection.test.mjs tests/editor_projection.test.mjs`: **20/20 PASS**. This includes actual production viewport frame/projection methods and extracted real form/menu lifecycle callbacks, not only a mock camera transform.

An additional read-only check loaded `tests/fixtures/ch4_rollback_native_source.json`, compiled the canonical document, added one named orthographic view, JSON-round-tripped it through `migrateDefinition`, and compiled again. Named-view metadata remained exact; native compiled feature records and issues were exactly equal before/after. Exact-topology stamp source also consumes modeling features/sketches rather than document camera metadata, so this metadata does not alter the geometry stamp.

Final corrected frozen test rerun remained **20/20 PASS**, including actual numeric UID and `libraryBundle` / `parseLibraryBundle` Part and Assembly metadata round trips. Owner corrected final gates exited0: no free identifiers, **690 linked modules /1487 assertions PASS**, owned diff clean. This source review does not independently claim actual Chrome capture/recall or saved-library cold acceptance; those witnesses belong to the parent browser task and its separate exported-artifact audit.
