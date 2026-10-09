# Drawing multiline notes and sheet fit — validation, 2026-10-09

Actual browser worksheet QA exposed flattened multi-line answers. The note scene already split LF, but the Drawing Note property form passed text into a single-line HTML input. That input removes CR/LF when assigning or entering text, before storage or rendering. This is a form defect, not an SVG escaping defect.

Drawing Note creation and double-click editing now use a genuine textarea labeled **Note text**, through the existing asynchronous form/field builder. Enter inserts line breaks; Apply finishes the edit. The textarea uses existing dark-theme input colors and spans its property-form width. Other text fields retain their existing single-line semantics. Existing flattened saved notes are preserved; the parent must edit/re-enter their intended line breaks through the browser.

The scene splits LF, CRLF and CR consistently into individual text items. Row spacing follows the note's actual font size, avoiding overlap for larger text. Each row retains the same note ID, so selection/edit/Delete works on the last row as well as the first; SVG exports the same separate row geometry. Edit cancellation, unchanged text, and a changed sheet while awaiting the form do not create an edit step.

Zoom to fit has a small, separate viewport correction: the modeler host measures the actual bottom status rectangle overlapping the canvas. The controller reserves that overlap, then uses the existing 24 px paper margin inside the remaining height. No canvas CSS dimensions, drawing data or model geometry change. It makes no claim about unrelated boot/reflow performance.

Validation:

- `node --test tests/drawing_multiline_notes.test.mjs tests/drawing_primitives.test.mjs tests/cad_sheet.test.mjs tests/dimensioned_circle_quick_form.test.mjs`: **71/71 pass**. Four new cases exercise the actual `sheetForm` and field builder with browser-like single-line newline sanitation, actual blank-sheet Note creation, scene/SVG separate rows, CR/LF normalization with nondefault font size, selection/edit from the last row, and measured-overlay fit bounds. Existing dimensioned circle forms remain valid.
- `npm run check`: no free identifiers, **658 module links**, **1489 source assertions** pass.
- Scoped `git diff --check`: clean. No full-suite rerun or browser acceptance claim.

Parent browser next step: cold reload the saved worksheet; Select and double-click each saved answer note; enter the intended actual line breaks in **Note text**, Apply, verify readable rows, Save/export SVG/project and reopen. Use Zoom to fit to verify the full paper/title block is above the status line. No dummy part is required; all paper annotations remain independent of source CAD.

Files: `js/modeler_feature_form.js` (textarea support), narrow `sheetForm`/Drawing host changes in `js/modeler.js`, `js/modeler_drawing.js`, `js/cad_sheet.js`, textarea selectors in `css/styles.css`, and `tests/drawing_multiline_notes.test.mjs`. This supplements `drawing-independent-primitives-validation-2026-10-09.md`; no authored worksheet/model or ADVANCE file was modified by the subagent.
