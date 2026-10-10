# Chapter 2/4 drawing view capability map — 2026-10-10

Continuation update: the initially missing standalone Crop row below has subsequently received a bounded genuine implementation; see `standalone-crop-view-implementation-2026-10-10.md` for saved spline authoring, shared clipping, validation and pending actual browser acceptance. The matrix records the original audit findings before that gap closure.

## Source scope

Source: David Planchard, Engineering Graphics with SOLIDWORKS 2021, supplied local PDF. PDF page numbers below are one-based physical pages; printed pages are separate.

PDF 107–113 (printed 2-21–2-27) explains nonstandard drawing views. PDF 181–218 (printed 4-1–4-38) is the SOLIDWORKS/user-interface overview, including document templates, BRACKET feature history, view navigation, model section display, drawing toolbars, configurations and task panes. PDF 203 / 4-23 is a drawing CommandManager inventory, not a worked authoring exercise for every icon. Its Alternate Position icon establishes a referenced capability; these ranges do not provide an Aligned Section authoring procedure. PDF 200's heads-up Section View is a model cutaway, distinct from a persisted drawing Section.

## Capability mapping

| Workflow | Book evidence | Current implementation / tests | Remaining gap |
|---|---|---|---|
| Standard/projected views | PDF 107 / 2-21; view palette PDF 211 / 4-31 | Drawing views picker adds principal/isometric directions; first/third-angle layout and projected alignment in `cad_sheet.js`; unit tests verify axes, projected placement and export. | App uses its own picker rather than SOLIDWORKS palette drag. Same resulting views can be checked in browser. |
| Section | PDF 107–108 / 2-21–22; inventory PDF 203 | Real mesh half-space cut, cut loops and hatch; Section drag on orthographic parent; Shift reverses arrows. Tests verify cut geometry, hatching and arrow/sight agreement. | Current authoring is horizontal/vertical single-plane only. Material-specific hatch and deliberate rib exclusion are not established equivalents. |
| Detail | PDF 109–110 / 2-23–24 | Genuine parent-derived circular cropping, enlarged scale, parent bubble/tag and child label. Core recursively projects parent, including Section. | This patch closes the UI restriction on isometric and existing Detail parents. Native geometric circles crossing the crop boundary retain the pre-existing projector treatment; no claim of new exact BREP clipping. |
| Broken-out Section | PDF 110 / 2-24; PDF 203 | No region-plus-depth drawing modifier found. | Missing. A global Section child or a manually drawn outline does not expose only the requested local region or retain the rest of the original view. |
| Break | PDF 111–112 / 2-25–26; PDF 203 | No persisted discontinuous mapping of a long view. Existing dimensions can associate with geometry but are not a Break view. | Missing. Requires visible break lines, shortened view mapping and dimensions retaining true unshortened lengths. |
| Crop | PDF 112 / 2-26; PDF 203 | `cropProjection` is used inside Detail only. | Standalone existing-view Crop modifier and book's parent restrictions are missing. Cropped Detail child is not the same workflow. |
| Auxiliary | PDF 113 / 2-27; PDF 203 | Named bases are principal directions and fixed pictorial views; `viewBasis` does not accept a saved arbitrary basis. | Missing true arbitrary sight/hinge authoring and angled-plane true-shape projection. Rotating a paper annotation does not provide it. |
| Alternate Position | PDF 203 / 4-23 inventory | Independent configuration views and exploded drawing leaders are substantive, tested capabilities. | Missing superimposed alternate-position projection/phantom lines. Separate configuration copies or exploded isometric views are not equivalent. |
| Aligned Section | Requested audit item; not a worked workflow in these source ranges | Single-plane Section only. Test phrase “an aligned view” refers to projected-view placement, not Aligned Section geometry. | Missing multi-leg cutting path with prescribed unfolding/rotation. Do not count projected alignment as closure. |

Evidence inspected: `js/modeler_drawing.js`, `js/cad_sheet.js`, `js/core/hidden_line.js`, `js/modeler.js`; `tests/cad_sheet.test.mjs`, `tests/review_fourth_batch.test.mjs`, `tests/cad_drawing_configurations.test.mjs`, `tests/exploded_drawing_leaders.test.mjs`, `tests/drawing_primitives.test.mjs`. This is a source/capability audit, not new browser acceptance of all rows.

## Bounded Detail change

`modeler_drawing.js` now accepts any actually projected view as a Detail parent; Section retains its original orthographic/non-Detail restriction. `cad_sheet.js` returns no projection for cyclic or missing Detail parents instead of recursing forever or showing unrelated uncropped geometry. Parent deletion now transitively removes dependent Section/Detail views and their bound dimensions/leader notes, while retaining unrelated views and plain sheet notes. This is needed for genuine nested Detail authoring.

Three new meaningful controller/core regressions cover isometric and nested Detail gestures, annotation scales, cold JSON projection equality, both crop boundaries, Section's retained restriction, invalid saved graphs and transitive deletion. The full scoped run of `cad_sheet`, `review_fourth_batch` and `cad_drawing_configurations` passed **75/75** tests. `npm run check` passed: no free identifiers, **664 linked modules**, **1489 source assertions**. `git diff --check` passed. No full-suite or browser PASS is asserted here.

## Next finite actual browser checks

1. On a real saved source model with clear isometric edges, enter Drawing mode and fit the sheet. Choose **Detail**, drag a nontrivial circle on the isometric view. Verify new enlarged child, parent circle/tag and printed scale. Save a review copy, export SVG/PNG and cold reopen it.
2. Choose **Detail** again on that child and create a smaller nested Detail. Verify geometry lies within both original and nested crop boundaries; labels/scales and parent markers persist in the saved cold sheet. Delete the first Detail and verify its nested child/attached dimensions disappear together; Undo restores the drawing document.
3. Existing Section check: draw a horizontal/vertical Section on a principal view; verify removed front half, hatch and sight arrows; repeat with Shift reversed. Create a Detail on that Section and verify cropped hatch and enlarged scale. Save/cold-reopen/export the accepted sheet.
4. Verify standard first/third-angle placements and per-view configuration selection separately. These checks establish implemented workflows, not Alternate Position or Auxiliary closure.

Next implementation priorities, kept explicit for continuation: bounded standalone Crop first (shared clipping plus legal-parent restrictions), then region/depth Broken-out and true-length Break. Auxiliary needs a saved orthonormal basis and shared dimension/projection handling. Alternate Position and Aligned Section each require distinct persisted geometric contracts. None is implemented by this patch and none should be credited as completed solely from a toolbar inventory.
