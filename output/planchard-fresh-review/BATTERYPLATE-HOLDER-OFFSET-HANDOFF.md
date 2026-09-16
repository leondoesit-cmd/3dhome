# BATTERYPLATE holder: Offset cannot consume a model edge

Browser review, 2026-09-16. No application code changed in this continuation.

## Book step

PDF 249–250, printed 5-31–5-32, steps 204–218:
- Sketch on the pocket floor.
- Select the central hole's top circular edge and offset outward 7.62 mm.
- Offset that new circle outward another 2.54 mm.
- Extrude the annular holder 10.16 mm with 3° draft.

The Ø12.7 mm hole implies holder sketch radii 13.97 mm and 16.51 mm.

## Browser reproduction

1. Open `BATTERYPLATE - repaired support`. The repaired two floor holes are present.
2. Top view, Face filter, select the pocket floor. UI identifies `feature_mu495t59_4:face:generated:plane:2`.
3. Create sketch on reference. This adds an empty step 11 Face sketch on the floor.
4. Choose Select / move and click the central circular hole edge; choose Offset.
5. With Offset active, click the central hole rim again (top point of the visible circle).

Actual: no distance form opens, no model edge is selected for offset, and the sketch remains empty. The hint says to click an entity to copy at a distance. The book's direct model-edge offset cannot proceed.

## Implementation evidence

`js/modeler.js` around line 13900 groups Offset with Trim/Extend/Construction and uses only `hitSketch(uv, e.pointerType)`. With an empty sketch, it returns before `openSketchOffsetForm`. That form accepts a sketch entity ID and calls `offsetEntity`; it has no BREP-edge input path.

There is a separate Convert circular edge implementation around line 12252. This may provide a longer conversion-then-offset route, but it does not provide the book's direct Offset Entities workflow. No claim is made that creating the holder by other means is impossible.

## Requested functionality

Allow Offset to pick a compatible exact model edge while editing a sketch, project it into the sketch plane, and create an associative offset without requiring manual reconstruction. For this case preserve the circle centre/radius and link to the hole edge. Expose inward/outward distance, preview, apply/cancel, and clear feedback for unsupported/noncoplanar edges. Do not silently ignore the click.

Acceptance: perform the steps above in the real browser; create R13.97/R16.51 mm concentric circles from the central Ø12.7 mm hole, then a 10.16 mm / 3° annular holder. The source hole must stay open and the other terminal hole must remain unchanged. Save/reopen must retain source association and correct geometry.

## Preserved state

Saved repaired model remains available. Current retained browser has an unsaved empty step-11 holder sketch on the pocket floor, Offset active. No holder circles or boss have been committed. Stopped at this functionality gap under the original review instructions; the preceding authorization to fix saved-support recovery was completed in the previous turn.
