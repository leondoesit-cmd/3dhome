# Sketch CI fixture reconciliation

2026-10-11. Owned only `tests/sketch_scene_overlay.test.mjs` and `tests/sketch_signed_angle_editor.test.mjs`; no production/source CAD changes.

Full CI log reported four overlays failures from missing `isHoleWizardSketch` in a source-extracted-function harness. Production modeler already imports the actual helper from `core/hole_wizard_sketches.js`. Harness now imports/injects that real helper; ordinary consumed/unused/face/surface sketch overlay assertions are unchanged. No unconditional false stub was introduced.

Two signed-angle failures showed missing `flash`, masking the genuine underlying harness error: actual `applyDimensionEditor` now reads the live tolerance selector, but fixture DOM omitted `mdDimTolerance`, upper/lower fields. Dereferencing its missing control threw, and production catch attempted to report it through flash. Real browser editor has these controls; this was fixture drift, not a demonstrated production angle rejection.

Added the actual DOM controls, real `makeDimensionTolerance`, actual extracted `dimensionEditorUnit`, baseline tolerance:null and an unexpected-refusal flash that throws instead of swallowing errors. Existing−160° acceptance,0° valid, nonpositive lengths/nonfinite angles refusal assertions remain. New meaningful test applies signed degree deviations+.5/−.25 through the actual editor and verifies unchanged−160° nominal plus correct tolerance metadata.

Focused `node --test tests/sketch_scene_overlay.test.mjs tests/sketch_signed_angle_editor.test.mjs`: **10/10 PASS**. Independent current `npm run check` PASS:689module/link and1487assertions. These fixes resolve the six assigned failures only. Other full-CI failures remain assigned separately; no whole-CI-green claim. Parent final checkpoint remains required for concurrent product changes.
