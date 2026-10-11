# Drawing rear-column layout repair

**Confirmed production layout bug fixed.** Full CI and an isolated elevated Chrome run of `adding multiple views and re-laying out keeps zero overlaps and updates view scales` both reported `ISOMETRIC × REAR`. The unchanged browser fixture adds Left, Rear and Bottom to the standard Front/Top/Right/Isometric sheet, then requests relayout. This is a seven-view placement failure, not a source geometry or fixture substitution issue.

`js/cad_sheet.js` previously reserved only the maximum width of the right-side and Rear views in the principal cluster. Its Rear placement nevertheless lay beyond the adjacent side. Floating Isometric placement therefore used paper incorrectly described as free and could overlap the actual Rear view.

The bounded correction reserves Rear as a separate column, including its gap, and places it beyond the actual positive-side view width (Right in third angle, Left in first angle). A Rear-only cluster uses one gap instead of reserving an imaginary adjacent side. Projection-line alignment, standard fit-scale selection, manually authored view coordinates, source projections, dimensions and model geometry are unchanged. No view is removed, renamed, shrunk by an arbitrary custom scale or substituted to satisfy the test.

## Verification

- Original isolated browser test before repair: FAIL with `ISOMETRIC × REAR`.
- Full elevated isolated `node --test tests/model_editor_drawing.browser.mjs` after repair: **13/13 PASS**. Original seven-view zero-overlap assertion remains exact. The test is strengthened to compare every displayed view-scale label with its actual scene placement scale, rather than checking only that seven labels exist.
- `node --test tests/cad_sheet.test.mjs`: **65/65 PASS**. New regression uses the same three-body bracket geometry and checks seven views in first/third angle on A3/A4: zero overlap, rear beyond the adjacent side, retained projection alignment, frame/title clearance and standard fit scale. Existing details, sections, forced-scale, manual alignment, dimensions, save/Undo and shared SVG tests also pass.
- Final `npm run check`: no free identifiers, **691** linked modules and **1487** source assertions PASS. Owned diff whitespace check passes.

Owned production edits are restricted to the principal cluster's Rear metrics/spread/placement in `js/cad_sheet.js`. Tests are `tests/cad_sheet.test.mjs` and `tests/model_editor_drawing.browser.mjs`. Parent owns actual user CAD/browser artifacts, ADVANCE and Git. These targeted passes do not represent a rerun or acceptance of all unrelated prior full-CI failures.
