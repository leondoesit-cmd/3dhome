# Part-owned dimension tolerance — bounded implementation

Source: supplied Planchard PDF121 / printed2-35, Design Intent ExampleA. A TUBE outside diameter receives +.000/−.002 in the part and that tolerance propagates to its drawing. This is signed unilateral deviation metadata, not a geometry displacement. The adjacent Material property example already has a property-link mechanism and is not duplicated here.

## Delivered behavior

- Double-click a placed sketch driving dimension. Its existing value/name/driving-mode editor now exposes **Part tolerance: None / Signed deviations**, with upper/lower fields in the dimension's displayed unit. Enter `.000` and `-.002` for an inch document. Angular deviations use degrees. Finite upper≥lower is required; up to eight decimal places are supported. Setting None removes metadata; reference mode removes a driving tolerance. Solver failure restores the original metadata with the original value/name/mode.
- Metadata lives on the original sketch constraint as `tolerance:{version:1,kind:'deviation',upper,lower,unit,precision}`. Linear deviations are stored in model centimetres; angle values are degrees. No geometry/solver parameters are changed by a tolerance value itself. Existing JSON save/history captures preserve the metadata.
- Insert Model Items already persists the original sketch constraint ID and genuine topology references. The shared sheet builder now reads the current source tolerance through that ID, with conversion into current sheet units; no copied stale suffix is baked into the drawing. Live geometry remeasurement remains unchanged.
- Drawing Dimension Text exposes **Override part tolerance (blank suppresses)**. A nonempty sheet tolerance is an explicit override, preserving legacy free-text fits. Blank plus unchecked override follows the source. Blank plus checked override suppresses it. Clearing the override restores association. The edit commits to the live normalized dimension record after Undo capture.
- Metadata-only source edits and override flags participate in the drawing scene cache key. Interactive Canvas and exported SVG use the same resolved dimension. The offline `buildDrawingScene` exporter also receives the original model.

The core can resolve feature-owned `dimensionTolerances.depth/radius` if provided, but this release exposes authoring controls for **sketch driving dimensions only**. It does not claim a feature-parameter tolerance editor, GD&T, fit-class calculation, limit-size notation, or assembly occurrence tolerance ownership. The displayed signed suffix uses a readable slash rather than stacked typesetting.

## Validation and acceptance boundary

Four new focused tests plus one Insert Model Items regression cover source inch deviations, mm/angular conversion, invalid input, genuine persistent-edge binding, source nominal/radius edits, source metadata edits without body-token changes, explicit override/suppression/reset, normalized live-record mutation, cold JSON/ensureSheetDoc preservation, removed source metadata, legacy sheet tolerance, and unchanged source parts.

Together with the existing drawing/model-item suite: **72 tests PASS**. Module/link/source-assertion gates pass (677 modules / 1487 source assertions at this integration checkpoint; concurrent image work shares those gates). No actual CAD or worksheet was authored by this agent. Actual desktop Chrome UI/Undo/native rebuild/cold export proof remains necessary before claiming the source workflow accepted.

## Finite actual browser witness

1. Open an existing accepted cylindrical part with a driving diameter sketch constraint; set its document units to inch. Double-click that placed diameter and select Signed deviations, upper `.000`, lower `-.002`, then Apply/Finish/Rebuild. This is an illustrative source workflow, not the unavailable original TUBE binary/model geometry.
2. Open its ordinary end-view drawing and Insert Model Items. Inspect the native-bound diameter callout suffix `+0.000/−0.002` and its source constraint/modelItem IDs. Export SVG/MFORGE.
3. Change only the source tolerance lower to `-.003`; confirm the callout updates while actual native geometry/STEP dimensions stay unchanged. Then change the diameter nominal; confirm geometry and drawing measurement both follow, tolerance retained. Undo/Redo and restore chosen nominal.
4. Set a drawing-specific tolerance, confirm it overrides the source. Clear text and leave Override unchecked to restore source association; check Override with blank to suppress; restore source-following state.
5. Save, hard reload, reopen the exact Saved library record, compare source constraint metadata, whole Drawing/native references, and rendered SVG suffix. Changing sheet units should convert the deviations rather than reuse inch strings.

Owned code: new `js/core/dimension_tolerance.js`; focused `tests/dimension_tolerance.test.mjs`; one `tests/model_items.test.mjs` regression; small sketch-editor blocks in `js/modeler.js`, dimension loop in `js/cad_sheet.js`, provider/cache/editDim blocks in `js/modeler_drawing.js`, and model provider in `js/cad_drawings.js`. Concurrent image integration owns other blocks of shared drawing files. No ADVANCE, ledger, browser authoring, Git, or material workflow changes.
