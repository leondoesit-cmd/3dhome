# Three-point Paper arc — source validation, 2026-10-09

A generic **Paper arc** Drawing annotation now complements Line/Polyline/Rectangle/Circle for drafting-only source exercises such as PDF82/printed1-54 Exercise1.5. It does not create a CAD sketch, native feature, model dimension or topology reference.

The browser picks **start → a point on the curve → end** in paper millimetres. A translated-coordinate circumcircle calculation avoids cancellation from large paper-coordinate offsets. The chosen directed sweep contains the through point; minor/major and clockwise/counterclockwise arcs remain analytic. Stored primitives retain the three defining points, from which the scene derives exact centre/radius/start/end angles. Canvas uses its explicit anticlockwise parameter; SVG uses a circular `A` path with matching large-arc/sweep flags. Existing arc items lacking the new flag keep their prior clockwise behavior.

Three collinear/coincident/nonfinite points reject. Arc validation checks the actual directed arc's cardinal extrema against paper bounds, rather than accepting three inside endpoints when the curved segment leaves the paper, or requiring the unused complementary circle to fit. A rejected third pick can be replaced without losing the first two points. There is no whole-circle or polygonal approximation fallback.

The existing primitive workflow supplies endpoint/grid/Shift/Ctrl snapping, Escape cancellation, stroke selection, double-click three-point numeric/style editing, Delete, Undo/Redo, persistence and SVG export. Numeric edit fields are Point1=start, Point2=through, Point3=end, each X/Y in paper mm. Invalid commits/edits do not add history or modify saved source. Stored paper geometry remains independent of model/view scale.

Validation:

- `node --test tests/drawing_paper_arc.test.mjs tests/drawing_primitives.test.mjs tests/drawing_multiline_notes.test.mjs tests/cad_sheet.test.mjs`: **76/76 pass**, including eight new arc cases. Cases cover exact quarter/reversed/major/wrapped arcs, finite/noncollinear/paper-bound rejection, directed-segment hit testing, actual three-pick creation with retry/cancel, numeric style edit, Delete/Undo, persistence, SVG analytic flags and actual canvas anticlockwise calls. Existing sheet/annotation/note cases pass.
- No full-suite result is claimed for this patch: the parent's concurrent full-suite run began before the new Paper arc implementation/test inventory.
- Scoped `git diff --check` clean. Final shared gate result follows below.

Parent browser next step: cold reload; on the actual worksheet select **Paper arc**. Read the start/through/end hint, pick three points, then Select/double-click and set precise paper coordinates as needed. Verify the intended curved segment, style, Undo/Redo/Delete, Save/project/SVG, and cold reopen. Source shapes without numerical dimensions remain grid-relative instructional drawings with declared size assumptions; code readiness is not exercise acceptance.

Owned files: `js/core/drawing_primitives.js`, `js/modeler_drawing.js`, clockwise flag support in `js/cad_sheet.js`, one toolbar button/hint in `js/modeler.js`, two strings in `js/modeler_strings.js`, and `tests/drawing_paper_arc.test.mjs`. No actual model, protected fixture or ADVANCE edits.

Final npm run check: no free identifiers, 658 module links and 1489 source assertions pass.
