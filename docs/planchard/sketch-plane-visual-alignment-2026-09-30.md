# Sketch plane visual alignment — 2026-09-30

The user reported sketches looking displaced from the plane of the model. Normal To previously aligned the camera direction but retained perspective projection. A housing corner at X = 6.5 cm and its Right-plane projection at X = 0 therefore appeared at different screen positions despite having the same Z/Y coordinates. This made plane sketching look detached from the model.

## Repair

- ModelForge's CAD viewport uses orthographic projection while locked Normal To. The model and sketch overlay share that camera, so model depth cannot magnify the visible edge relative to the drawing plane.
- Orbiting or leaving the locked view restores the existing perspective camera.
- Pointer-to-plane mapping now handles both orthographic parallel rays and perspective eye rays. Normal To preserves the former perspective scale at the target plane; existing distance zoom, viewport resize, and fit controls continue to work.
- The cabinet viewport retains its existing camera behavior; the CAD editor explicitly enables this option.

Files: `js/editor_view.js`, `js/core/editor_projection.js`, and the narrow import/ray/viewport-option changes in `js/modeler.js`.

## Verification

Real desktop Chrome, dark app theme, isolated tab 710858395. Started a new empty part using visible controls; mouse-drew a Front-plane rectangle and used the Extrude form to make 10 cm stock. Edited the source sketch from its feature tree. All four blue sketch edges coincided with the solid's front silhouette rather than appearing inset by perspective. Clicking the displayed upper-right corner selected the actual sketch point and reported X 14.1 / Y 49.3 cm, matching the pointer readout X 14.0976 / Y 49.3063 cm. Finished the sketch and orbited with a mouse drag; the solid returned to perspective 3D normally.

Proof: `artifacts/planchard/NORMAL-TO-sketch-solid-alignment-browser-2026-09-30.png`.

18 focused tests passed, including a numeric fixture at the reported HOUSING coordinates proving the old perspective parallax and exact orthographic alignment, plus pointer ray round trips for both cameras and existing sketch/model-edge relation tests. `npm run check` passed: no free identifiers, no link errors across 593 modules, and all 1489 source assertions passed.

This QA stock is a temporary visual regression fixture, not an ebook model. No geometry was authored or altered through script. The fix addresses misleading perspective parallax in Normal To; it does not claim to correct a genuinely misassigned sketch support or reference plane.
## Offset-plane picking, rebuilding and reopening acceptance

Created `Offset plane model picks QA - fresh 2026-09-30` from a blank document through Chrome mouse and form controls. The fixture is a fully defined 10 × 6 cm Front rectangle extruded 4 cm, with a Right-plane sketch offset 2 cm in X.

- Normal To: selecting the displayed solid corner and Coincident bound Point1 to Z4/Y6.
- Perspective: selecting the displayed vertical solid edge reported a real edge selection. The cursor's plane intersection was Z6.57212/Y3.09189, but Midpoint bound Point2 to the actual edge midpoint Z4/Y3. This distinguishes topology picking from merely placing a point at the cursor-plane intersection.
- Edited upstream depth from 4 to 5 cm through the feature form. Native rebuild succeeded. Reopening the downstream sketch showed (5,6) and (5,3), fully defined.
- Saved, reloaded Chrome, reopened this newly created fixture: both relations and the 2 cm offset persisted.
- Front/Right camera presets during principal-plane editing now retain the current sketch and plane. Previously they could silently adopt the other principal sketch. Normal To now also converts the camera target between plane-relative and model-relative coordinates, avoiding a model-height jump when leaving or entering locked plane view.
- Picked the actual visible X10 side face (`side:1203`), created a new empty attached sketch, and used Convert face. Four associative boundary lines matched the face under Normal To, fully defined, one closed loop. Saved this QA fixture through the UI.

Proofs: `artifacts/planchard/OFFSET-PLANE-perspective-edge-relation-2026-09-30.png`, `artifacts/planchard/OFFSET-PLANE-rebuild-reopen-Normal-To-2026-09-30.png`, and `artifacts/planchard/FACE-PLANE-boundary-normal-alignment-2026-09-30.png`.

Verification: projection tests 6/6; combined projection/browser/escape regression tests 26/27. The sole failing test was an existing offset-plane source-extraction harness missing the newly added `threePointCoordinateFields` dependency, reported to the UI agent. `npm run check` passed: no free identifiers, 593 module links and 1489 source assertions.
