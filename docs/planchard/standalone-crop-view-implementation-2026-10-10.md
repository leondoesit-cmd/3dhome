# Standalone Crop view — bounded implementation, 2026-10-10

## Source reconciliation

The supplied ebook's Crop workflow is **PDF 112 / printed 2-26**, not PDF 111 / 2-25 (which is Break). It crops an existing drawing view directly, including a Section; it forbids Detail, a parent already used for Detail, and Exploded views. **PDF 493 / 10-13** identifies the pictured cropped isometric end of a long part as Crop. The closed-spline multiple-choice question above that example shows Broken-out Section; it must not be counted as a completed Broken-out workflow. PDF 494 / 10-14 separately identifies Alternate Position, Break and Aligned Section, which remain distinct gaps.

## Genuine saved authoring

Drawing tool **Crop** starts on an actual projected view. Click 3–64 points around the desired region; **Enter** closes a periodic Catmull–Rom spline and applies it to that same view. **Escape** cancels the draft without a drawing change. Control points persist in `view.cropSketch = {type:'closed-spline',closed:true,points:[{u,v},...]}` in projected model coordinates. Repeating Crop on that view replaces its boundary with newly authored points. **Remove crop**, then click the cropped view, restores the full original projection as one undoable operation. Undo restores both creation and removal. No new Detail/duplicate view, model sketch, CAD feature or solid mutation is substituted for Crop.

The drafting hint and ordinary drawing toolbar expose the workflow. Section and isometric projections can be cropped. Source-forbidden parents are rejected before mutation; subsequent Detail authoring on a cropped view is blocked to preserve the same restrictions. An exploded-view callback checks actual assembly exploded offsets. Invalid persisted crop boundaries return no projected geometry instead of silently showing a full view.

## Shared geometry and bounds

`js/core/drawing_crop.js` validates finite controls, enclosed area and proper boundary crossings, samples each closed spline segment at 12 intervals, and clips actual projection geometry to that boundary. Visible/hidden edges and section cut edges split at polygon intersections; fully enclosed circles retain their analytic circle record, while partially intersected circles use a bounded 256-segment approximation. Shaded faces intersect triangulated crop regions, including concave boundaries, with conserved area. The stored controls are the driving data; the sampled boundary is recomputed during cold projection.

Section hatching is first generated from the original closed cut loops, then clipped to the crop boundary. This avoids treating intentionally clipped section edges as broken topology. Section outlines and centre marks/axes are clipped too. Model dimensions and sheet annotations keep their usual associativity and may remain outside the cropped geometry. The shared sheet scene supplies canvas and SVG export; no separate export-only clipping is used.

Bounds: finite sampled drawing-space crop, not exact BREP intersection or unrestricted SOLIDWORKS spline editing. Users replace a crop through the Crop tool; individual persisted control points are not dragged with a dedicated edit panel. Partial circles are tessellated as stated above. This does not implement depth removal, broken lengths, arbitrary auxiliary projection, alternate-position overlay or aligned-section unfolding.

## Validation and actual browser handoff

Focused tests verify actual controller authoring on an isometric view, same-view persistence, Remove crop and both Undo steps; clipped visible/hidden/cut strokes and partial circles; concave shaded crop area; invalid and forbidden input rejection; Section hatch survival, stroke bounds and cold JSON/SVG equality. Combined drawing/configuration/native neighboring regression run: **80/80 PASS**. After the final centre-mark clipping edit, **64/64 Crop + drawing tests PASS**. Final `npm run check` passed: no free identifiers, **665 linked modules**, **1489 source assertions**. Diff check passed. Browser acceptance belongs to the parent and is pending.

Actual browser recipe: hard reload; open the saved real part; Drawing → Crop; click at least four points outlining one isometric end, then Enter. Verify original view count/ID is retained, other views remain whole, cropped outline has no continuation beyond the boundary. Save copy and export SVG/PNG; cold reopen and inspect the saved control-point crop. Remove crop → click view restores the full part; Undo restores crop. Separately crop a genuine Section and inspect retained hatch bounded by the crop. Detail and Detail-parent Crop attempts must leave the document unchanged.

Files: `js/core/drawing_crop.js`, `js/cad_sheet.js`, `js/modeler_drawing.js`, `js/modeler.js`, `tests/drawing_crop.test.mjs`, and controller regression in `tests/cad_sheet.test.mjs`. Parent owns browser/model artifacts, ADVANCE and commits.
