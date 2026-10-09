# Solid extrusion contour refresh

The actual Q1 rear sketch was filleted correctly in Chrome, but Boss 1 still referenced its original four trimmed line IDs, excluding the four new arcs. Its native rebuild failed. The existing explicit **Refresh sketch contour** control was available only for cuts.

The same control now supports solid Add and New body extrusions as well as cuts. It refreshes a single current sketch region and its inner holes, retaining feature ID, inputs, operation, extrusion extents, unrelated references, history, and downstream features. Multiple regions are refused rather than chosen silently. Thin features retain their open-chain workflow and refuse this closed-contour refresh. The existing cut-only helper API remains available.

On Update, a standalone associative extrusion body receives the refreshed profile IDs as well as its current sampled geometry. Cancel restores the previous feature recipe and body IDs. This uses the existing edit transaction; no extra Undo entry or source-model rewrite is introduced.

Read-only regression fixture: `artifacts/planchard/ADVANCED-Q1-rear-four-fillet-refresh-browser-2026-10-09.mforge`. Tests invoke the actual contour button callback and modeler projection/Cancel handlers against a disposable clone, with actual Undo history. They prove four lines plus four arcs, unchanged downstream feature JSON/history, Add and New body intent, atomic Thin/multiple-contour rejection, Cancel and Undo/Redo, and cold native regeneration of all three bosses. The rear boss volume matches its rounded-diamond dimensions analytically; the final native result has one valid solid.

```
node --test tests/solid_profile_refresh_ui.test.mjs tests/feature_profile_refresh.test.mjs tests/sketch_polygon_fillet_preservation.test.mjs tests/extrude_projection_transition.test.mjs
```

10 tests passed, zero failed. `npm run check` passed: no free identifiers, 653 modules linked, 1489 source assertions checked. Scoped `git diff --check` passed.

Parent owns cold Chrome acceptance and continued Q1 authoring. No actual model bundle or ADVANCE file was changed by this subagent.

## Follow-up review after e2f4c7c

An actual refresh/projection handler regression reproduced a remaining omission: after deleting the inner contour of an annular sketch, the refreshed feature correctly had `holeProfileEntityIds: []` and `holes: []`, but its live body's sampled hole remained. `synchronizeSketchExtrusionFrames` formerly ignored empty hole lists. It now propagates explicitly empty associative hole lists to the feature and its matching live body/merge/cut records. Legacy sampled recipes without associative hole IDs and unresolved nonempty hole IDs retain their prior data; missing references remain diagnosable.

Two added regressions cover clearing old holes with actual Refresh/Update projection handlers and Undo/Redo, plus preservation of legacy and unresolved hole recipes. Focused command `node --test tests/solid_profile_refresh_ui.test.mjs tests/feature_profile_refresh.test.mjs tests/extrude_projection_transition.test.mjs` passed 9 tests. No geometry was authored or changed in an actual model bundle.

Additional command `node --test tests/extrusion_projection.test.mjs tests/sketch_support_edit.test.mjs tests/open_thin_coaching.test.mjs` passed 11 tests. Final `npm run check` passed (653 modules, 1489 assertions); scoped diff check passed. No further concrete coaching issue was established during this review.
