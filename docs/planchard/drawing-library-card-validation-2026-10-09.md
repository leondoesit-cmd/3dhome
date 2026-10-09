# Drawing-only library card classification — validation, 2026-10-09

The actual browser-authored annotation-only worksheet was labeled `Sketch only · 0 Sketches`. The saved library card now recognizes authored paper annotations/notes when the document has no solid parts/features or authored sketch content, and labels it `Drawing · 8 annotations · 3 notes` for the parent's reported worksheet. Counts come from valid primitive records and nonempty saved note records; singular/plural English and Hebrew labels are supported. The implicit empty working sketch does not turn a drawing into a sketch document. Real sketch geometry/history and solid content retain the existing labels.

`drawingOnlyContentSummary` is a pure classification helper in the existing save-policy module. It does not modify models, drawing records, library storage or geometry. Blank or malformed sheets are not classified as authored drawings.

Validation: `node --test tests/drawing_library_card.test.mjs tests/model_sketch_only_save.test.mjs tests/drawing_multiline_notes.test.mjs tests/drawing_primitives.test.mjs` — **18/18 pass**, including three new classification cases (8/3 worksheet roundtrip, blank/malformed inputs, real sketch/solid versus implicit empty sketch). The production library card calls this helper before its existing sketch-only branch.

Browser next check: reopen Saved models after reload and inspect the actual worksheet card; confirm Drawing counts, open the saved worksheet and finish the multiline-note QA. No new browser acceptance is claimed by this source test report.

Owned changes: `js/core/model_save_policy.js`, narrow Saved-model card block in `js/modeler.js`, five labels in `js/modeler_strings.js`, and `tests/drawing_library_card.test.mjs`. No actual model/export or ADVANCE changes.

Final gates: npm run check passes — no free identifiers, 658 module links, 1489 source assertions. Scoped git diff --check clean.
