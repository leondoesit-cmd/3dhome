# Q1 Save and material responsiveness review

Observed by parent in actual Chrome: Save on the settled Q1 model can block a CDP input call for more than three seconds; the header remains Unsaved until the save completes. Material/custom-density edits with the Mass card open trigger another exact mass evaluation.

## Confirmed repair

Part Mass Properties asked the CAD worker for native mass integrals but then used the default native restoration route, deserializing BREP geometry on the UI thread before consuming `workerMassProperties`. The part-only request now uses `restoreMode: 'mesh'`. `exactDisplayBody` already accepts a verified worker-native mesh facade; `evaluateMassProperties` already consumes its exact mass integrals, inertia, and bounds. No approximated mesh integral substitutes for the native result. Assembly mass retains native restoration because its placement-bound queries require the shape. Legacy parts retain their existing native fallback.

An actual Mass-card handler regression invokes the real mass evaluator with a verified worker proof and no UI-thread shape. Density 7.8 to 4.6 changes mass from 15.6g to 9.2g at fixed 2cm³, preserving COM and releasing both results correctly. Existing asynchronous card invalidation and assembly tests remain passing.

## Save diagnosis and limits

Save already requests worker-native meshes (`restoreMode: 'mesh'`) and consults `createExactSaveCache` with complete geometry keys. Existing regression tests prove material/appearance/description edits reuse a saved proof, while native recipe, sketch, frame, parameter, and topology changes invalidate it. Cached results are isolated copies, not native handles.

Save still performs snapshot cloning/serialization, compilation and geometry-key construction, topology/projection publication, document validation, attachment externalization, and library registration. These include synchronous JavaScript work. This review has not measured each phase in actual Chrome and cannot attribute the observed three-second stall to one of them. No Save recomputation or backup/cache invalidation semantics were changed. Unsaved remains truthful until storage succeeds.

The Undo/Redo header title is updated by the real history `onChange` callback through `syncUndoButtons`. No stale actual DOM-title defect was reproduced here; inspect the button's current `title` attribute separately from a cached accessibility snapshot before changing that path.

Focused command `node --test tests/mass_card_lifecycle.test.mjs tests/assembly_mass_card.test.mjs tests/exact_save_cache.test.mjs` passed 20 tests. Browser performance acceptance is pending parent measurement; no browser, actual model, or ADVANCE edit was performed by this subagent.

Additional native/protocol command `node --test tests/cad_worker_mesh_only.test.mjs tests/cad_mass_materials.test.mjs tests/assembly_mass_properties.test.mjs` passed 19 tests, including exact mesh-only mass and unchanged native export payload. Final `npm run check` passed (653 linked modules, 1489 assertions); scoped diff check passed.
