# Broken-out Section — bounded implementation, 2026-10-10

## Source and scope

Supplied Planchard ebook **PDF 110 / printed 2-24** explains a Broken-out Section as local material removal to a specified depth on an existing drawing view, preserving hidden lines outside the section. **PDF 493 / 10-13** shows the closed-spline procedure with correct answer B. The separate cropped isometric example below it is Crop. Break and Aligned Section on PDF 494 remain separate capabilities.

This implements a real drawing projection modifier on the existing view, not a Detail clone, annotation or CAD solid feature. It consumes actual source tessellation (including a native solid's displayed mesh), performs an actual depth-plane mesh cut and closes the cut faces for correct hidden-line visibility. It does not edit the source model or claim exact kernel BREP surgery.

## Ordinary UI and persisted driving data

**Broken-out section**: choose an ordinary orthographic edge view; click 3–64 points around the desired removal region; **Enter** closes the spline and opens **Removal depth from front envelope (mm)**. Apply the chosen depth. **Escape** cancels boundary authoring; canceling the depth form leaves the drawing unchanged. **Remove broken-out**, then click the modified view, restores its original projection. Creation/removal are undoable. Repeating authoring replaces the region/depth.

Saved driving data is `view.brokenOut = {sketch:{type:'closed-spline',closed:true,points:[{u,v},...]},depth:<model cm>,datum:'front-envelope'}`. The spline controls are stored in projected model coordinates; depth uses the frontmost actual mesh coordinate along the chosen view's forward axis. Millimetres from the form are converted to model centimetres. Cold reopen recomputes the cut from these persisted values. View count and ID remain unchanged.

Finite first release: principal orthographic views with edge display. Pictorial, existing Section/Detail/Crop, shaded and exploded views are rejected. Crop/Section/Detail composition with a Broken-out modifier is blocked to avoid silently ignoring one operation. Depth must be finite, greater than zero and smaller than the source envelope depth. Invalid cut topology or malformed saved modifiers yield no projected geometry rather than an uncut substitute. Editing individual spline handles, selecting an arbitrary depth datum face and shaded Broken-out output are not claimed.

## Geometry correctness

The new `drawing_broken_out.js` resolves the actual forward envelope, clips triangles with `sectionBodies` at `front − depth`, analyzes the cut loops and triangulates cut-face caps including inner holes. Those caps are necessary: an open clipped mesh lets hidden-line removal see deeper holes even when the requested shallow cut leaves material in front of them. The covered-bore regression caught that problem and proves the capped result respects depth.

The shared projector retains original visible/hidden geometry outside the closed spline and uses the actual depth-cut projection inside. Thus outside hidden lines remain intact. Hatching is generated from original closed cut loops and clipped to the local boundary; section outlines are clipped too. The closed removal-boundary line is rendered by the shared scene. Ordinary sheet bounds remain the complete original view bounds. Canvas and SVG consume the same scene, and cold JSON/SVG equality is tested.

The existing Crop spline sampling (12 subdivisions per control interval) and partial-circle approximation (256 segments) apply to the boundary masks. This is a bounded mesh drawing workflow, not unrestricted exact surface intersection. Valid closed cut loops are required; ambiguous overlapping cut topology is rejected instead of fabricated.

## Verification

**85/85** scoped tests passed across Broken-out, Crop, drawing controller/core, per-view configurations and neighboring native regressions. New meaningful cases prove: a covered rear bore appears after a sufficiently deep cut but stays occluded for a shallow cut; outside hidden lines exactly match the unchanged original projection; chosen front/back orientation changes the envelope correctly; invalid depths/parent types are rejected; actual depth prompt authoring, remove/Undo and cancel work; a model rebuild while the depth dialog is open prevents stale application; clipped hatch persists after cold JSON/SVG round trip.

`npm run check` passed: no free identifiers, **666 linked modules**, **1489 source assertions**. Diff check passed. No full-suite or actual browser acceptance is asserted here.

## Parent browser handoff

On an accepted native model with a covered recess/bore, Drawing → **Broken-out section** → choose Front/Top/etc, click a closed region around the hidden feature → Enter → enter depth in **mm from the front envelope**. Compare shallow/deep cuts: the feature must remain hidden until the actual cut reaches it, while hidden geometry outside remains unchanged. Verify local hatch, saved `brokenOut` depth/controls, same original view count and cold reopen/SVG. **Remove broken-out** restores the complete view; Undo restores the modifier.

Files owned in this change: new `js/core/drawing_broken_out.js`, `tests/drawing_broken_out.test.mjs`; complement masking extension in `js/core/drawing_crop.js`; minimal shared integration in `js/cad_sheet.js`, `js/modeler_drawing.js`, `js/modeler.js`; two controller regressions in `tests/cad_sheet.test.mjs`. Parent owns actual browser/model evidence, ADVANCE and commits. Unrelated concurrent extrusion-projection edits belong to another agent.

Whole-app mutation follow-up: the actual Crop persistence failure exposed a shared stale-reference hazard across history callbacks. Broken-out creation/removal also now reacquire the current view by ID after `pushUndo`. The strengthened real authoring test replaces view records during the history callback, then verifies persisted full-document JSON depth and both Undo steps. Actual Broken-out browser acceptance remains pending.

## Actual shallow-view false-circle fix

Parent's actual Chrome shallow artifact is preserved as `artifacts/planchard/DRAWING-BROKENOUT-shallow-browser-2026-10-10.mforge` / SVG / PNG. Its saved Right view uses a 10 mm depth, from maximum X=60 mm to X=50 mm. The original Right projection correctly classifies the two roof-bore rims at (Z=20,Y=15/30) mm as invisible **edge-on metadata**, not round ink. The shared crop mask wrongly converted all circle metadata into 256 drawable spans each, producing the two false circles, including geometry extending outside the local patch.

The mask now creates circular ink only for genuinely drawn round entries; edge-on and undrawn records remain metadata. Read-only reconstruction from the saved native mesh, without changing the artifact/model, yields **4 visible spans and 7 hidden spans**, down from **520 visible spans**; no Right-view circle or arc scene primitives remain. The depth plane is unchanged (front=6 cm, depth=1 cm, offset=5 cm). This is a projection-mask fix, not an exact-arc renderer change or an adjustment to the model/source bore.

New regressions verify both inside/outside masking never promotes rim metadata and that a genuine shallow side-cylinder section cannot create face-on round ink. Combined scoped validation after this fix: **88/88 PASS**. Actual Chrome shallow/deep comparison after reload remains the parent's acceptance check.

## Exact saved browser replay recipe

Saved model **Planchard Broken-out section - bridge depth branch - browser 2026-10-10**, key `cm_mv2ac1da_6221`; modified Right view `vetll4lp`, six original views. Historical shallow/deep protected exports retain identical five-point spline and depth1/3cm. Reopening the saved branch already recomputes the repaired projection. For ordinary depth comparison, choose **Broken-out section**, pick the same five boundary controls on Right, Enter, set **Removal depth from front envelope (mm)** to10 or30 and Apply. Reauthoring replaces the modifier; the current UI has no standalone persisted depth-only editor. **Remove broken-out** then click Right restores the original view; Undo restores the modifier.

Saved controls in projected model centimetres: (−2.820621929,2.689939572), (−1.069192375,2.689939572), (−0.909971506,1.575393492), (−2.183738455,1.256951755), (−2.979842798,1.893835229). Historical screen picks (1170,720), (1280,720), (1290,790), (1210,810), (1160,770) require the original viewport/zoom and must be located visually after layout changes.

Right views the actual +X front envelope60mm. Depth10 cuts X50, outside the roof-bore X24–36 extent; depth30 cuts X30, giving a side-on rectangular slot at Z14–26/Y15–30mm, not full radius6mm bore-rim circles. Verify bounded section ink/hatching and unchanged outside hidden geometry. Export ordinary drawing SVG through **Export drawing SVG**; the **Preview drawing** panel also exposes **Download SVG**. Save/export and exact cold reopening must retain the controls, depth, six view IDs and unchanged source CAD. These are replay instructions, not new browser acceptance evidence.
