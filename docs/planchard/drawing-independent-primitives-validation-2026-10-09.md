# Independent Drawing annotations — source validation, 2026-10-09

The Drawing editor now supports paper Line, Polyline, Rectangle and Circle annotations without a placeholder 3D part. These are stored under `definition.drawing.primitives`; coordinates are millimetres from the paper's top-left, X right/Y down. They are independent of model geometry, sketch constraints, topology, model units and view scale.

An actually empty document starts with zero views. Existing explicit zero-view sheets remain zero-view on read/reopen. Populated CAD documents with no drawing retain the established four-view default. Zero-view layout returns a valid sheet instead of dereferencing a missing primary view.

Each completed primitive records one Undo step. Clicks collect endpoints (circle: centre then rim; rectangle: opposite corners). Polyline finishes with Enter or a click snapped back to its first point. Escape cancels the draft. Endpoints and a 1 mm paper grid snap; Shift aligns horizontally/vertically; Ctrl bypasses snapping. Select then double-click edits paper coordinates and Visible/Hidden/Centerline style through the existing asynchronous property form. Delete removes the selected annotation. Invalid coordinates, zero-length segments, degenerate rectangles, circles outside the paper, and late answers after the sheet changes leave the document/history untouched. Drafts and selection highlights are transient.

The existing scene/SVG renderer exports these as ordinary line/circle items, retaining line styles. The save policy recognizes authored drawing notes and valid primitives; an untouched empty sheet still does not count as authored content. The real canonical empty-feature compile/regenerate/cache/rebuild path succeeds without inventing a native solid.

## Validation

- `node --test tests/drawing_primitives.test.mjs tests/model_sketch_only_save.test.mjs tests/cad_sheet.test.mjs`: **67/67 pass**, including eight new drawing cases. Tests exercise the actual pointer/key/double-click/controller handlers, numeric edit rejection, Delete/Undo/Redo snapshots, SVG closure/styles, real library store/bundle/reopen, unchanged CAD fields, zero-view versus standard four-view behavior, and the canonical native save pipeline with no features.
- `npm run check`: no free identifiers; **658 module links**; **1489 source assertions** pass.
- Scoped `git diff --check`: clean. No full-suite rerun or browser acceptance is claimed.

## Parent browser validation / exact controls

1. Start a genuinely new blank Part document; set a meaningful name/description through existing Settings. Switch to Drawing. Expect a paper/title block with zero model views and no geometry placeholder.
2. Use toolbar **Paper line**, **Paper polyline**, **Paper rectangle**, **Paper circle**. Pick two points for Line/Rectangle/Circle; collect several points and press Enter for Polyline. The bottom hint describes paper mm, Shift/Ctrl and cancellation. These are paper annotations, not CAD feature tools.
3. Switch to Select, click an annotation stroke, then double-click. Edit **Point 1 X (paper mm)** / **Point 1 Y (paper mm)** etc and **Line style**. Apply; verify highlight and Hidden/Centerline appearance. Delete, Undo and Redo should affect only the annotation.
4. Save to library, export project and SVG, reload and open the saved record. Verify zero views, annotations, notes, title and styles persist; the Part document still has zero solid parts/features. Inspect SVG geometry at paper scale.
5. Reopen an existing populated CAD drawing and verify its four standard views and dimensions remain intact.

This code enables the book's drafting-only workflow. It does not establish completion of Exercises 1.4–1.10, whose source grid-relative shapes and instructional assumptions still require actual browser authoring and evidence.

Owned files: `js/core/drawing_primitives.js`, `js/core/model_save_policy.js`, `js/cad_sheet.js`, `js/modeler_drawing.js`, narrow toolbar/hints in `js/modeler.js` and `js/modeler_strings.js`, `tests/drawing_primitives.test.mjs`. Design source: `drawing-independent-primitives-design-2026-10-09.md`. No authored model, protected artifact or ADVANCE modification by this task.
