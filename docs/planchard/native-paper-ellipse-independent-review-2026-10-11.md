# Native paper ellipse — independent review

Read-only review, 2026-10-11. Source owner `ui_finish_audit`; no production changes or CAD authored by this reviewer.

Independent command: `node --test tests/drawing_paper_ellipse.test.mjs tests/drawing_primitives.test.mjs tests/drawing_paper_arc.test.mjs` — **23/23 PASS**. Owner independently reported module/link685 and assertions1487 green; those gate totals are attributed, not separately rerun here.

Reviewed `drawing_primitives.js` ellipse geometry/validation/hit, `modeler_drawing.js` three-pick/editor/Canvas/deletion integration, and `cad_sheet.js` shared SVG ellipse. No confirmed defect in the declared finite paper-annotation scope.

The third pick supplies perpendicular distance to the chosen major axis, rather than its distance from the centre. This correctly defines the minor semi-axis even when that pick also has an axial component. Positive axes, finite points, minor<=major, degeneracy and the entire rotated shape inside the paper are guarded. Bounds use analytic half-extents sqrt((rx*cos)^2+(ry*sin)^2) and sqrt((rx*sin)^2+(ry*cos)^2). Canvas uses the same centre/radii/radian rotation; SVG emits an actual rotated `<ellipse>`, not a sampled polyline or circular approximation.

Hit testing computes numerical nearest-curve distance using 64 angular candidates followed by local refinement. This is bounded numerical selection; rendering and stored geometry remain analytic. The focused tests distinguish curve selection from centre/bounding-box selection and verify rotated geometry.

Controller tests exercise ordinary three picks, normalized-history exact coordinate/style editing, cancellation/invalid/stale-owner rejection, Undo, cold serialization/shared SVG and unchanged source CAD. Primitive deletion now reacquires `host.doc()` after `pushUndo`, preventing a write to a normalized detached primitive collection. The live-history regression covers it.

This implementation makes a genuine source ellipse construction possible for PDF93–94/2-7–8. Code/test acceptance is not actual browser completion of those book illustrations. Parent must still create the independent source-qualified worksheet, inspect it, demonstrate editing/Undo and cold reopen.
