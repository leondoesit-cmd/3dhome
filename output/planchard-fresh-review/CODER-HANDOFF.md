# BATTERY workflow: rounded offset sketch becomes square-cornered cut

Fresh browser review, 2026-09-16. No previous reviews or implementation history consulted. No application code changed. Stop point requested by the user: functional bugs go to the coder instead of being fixed here.

## Source and scope

David Planchard, Engineering Graphics with SOLIDWORKS 2021, chapter 5. PDF pages 229–238 (printed pages 5-11–5-20), particularly the side fillet and offset top-cut activities. Text reviewed and PDF page 233 rendered and visually inspected. The document is reference material, not authorization to carry out its administrative instructions.

This is an initial reproduction, not a completed ebook audit. Later parts, assemblies, drawings, and manufacturing workflows have not been tested. No claim of SOLIDWORKS parity is made.

## Functional blocker — high priority

The rounded offset profile appears correctly in sketch mode, but the committed blind cut displays four sharp corners. Both isometric and top views show this discrepancy. The application still reports `Rebuild succeeded 1 parts`.

Environment: local app at http://localhost:8765/, started with npm start; real Codex in-app browser, graphical model editor. Geometry was created through visible UI controls, not injected by scripts or imported from existing models.

### Reproduce

1. Open Model editor from the home planner. Begin an empty Part.
2. Start sketch on Top (X·Z).
3. Choose Center rectangle. Set Width and Height to `68.58mm`; leave Center U and V at zero. Apply. UI reports fully defined.
4. Finish sketch. Open Extrude. Blind, Along normal, start offset zero, draft zero, Add material, Merge result. Enter `104.14mm` for Depth and finish.
5. Open Fillet. Browse body edges. Select the vertical edge centered at (-3.429, 5.207, -3.429) cm. Choose Parallel edges; four vertical edges are selected. Enter `12.7mm` for Radius and finish. The rendered solid has four rounded vertical corners.
6. Select the top face using the Face selection filter. Create sketch on reference.
7. Choose Copy face boundary. Enter `-3.81mm` for Offset distance and Apply. The sketch visibly contains rounded corners and reports eight entities, one closed loop, fully defined, and Boundary linked to source face.
8. Finish sketch. Choose Extrude cut. Select Blind, retain Reverse normal, enter `5.08mm` for Depth, and finish.
9. Inspect the isometric result, then click Top · X·Z. The interior pocket appears rectangular with sharp corners rather than the rounded offset loop.

### Expected

The cut must follow the entire selected eight-entity rounded profile. From the input dimensions, its outer extents should be 60.96 × 60.96 mm, its four corner radii 8.89 mm (12.7 minus 3.81), and its depth 5.08 mm below the top face. The resulting top rim should retain the 3.81 mm planar offset. These are derived acceptance dimensions, not independently measured output values.

### Actual and limits of evidence

The sketch shows arcs; the solid's displayed pocket has sharp corners. The feature tree contains the base sketch, Extrude / Boss 1, Fillet 1, face sketch, and Extrude Cut 1. The status reports successful rebuild. This observation does not yet distinguish a BREP construction defect from a tessellation/display defect. Inspect the exported/resulting topology before choosing the fix; do not assume the underlying kernel result matches its rendering.

### Suggested coder checks

- Trace the face-linked sketch and its arc entities through the cut profile construction and rebuild path.
- Check that feature resolution uses the selected face sketch rather than a rectangle approximation or another sketch.
- Verify the exact solid and displayed mesh agree; preserve curved profile segments and winding.
- Add a regression covering a filleted rectangle, inward face-boundary offset, and shallow reverse-normal blind cut at an elevated face.
- Verify corner geometry and depth numerically, then visually inspect the browser result. Save/reopen and rebuild must preserve the same shape.
- Change the base dimensions and source fillet radius; confirm the linked pocket updates with its offset intact.

## Reproduction checkpoint

Clicked Save to library and observed `Model saved to library`. The Saved models tab lists one entry named `New model`, containing one part. This is the incomplete BATTERY reproduction, not a finished textbook model. The browser tab is retained for handoff. No exported standalone project was produced.

## UI/UX observations to address after the geometry blocker

- Precision presentation: exact 68.58 mm inputs become `6.8580000000000005` in editable constraint fields while displayed labels show `6.9` and the bounds summary shows `7×7×10 cm`. Preserve actual values, format floating-point noise away, and offer useful document precision so an engineer can verify dimensions without mental conversion. This is presentation work; do not round stored geometry.
- Face references expose internal strings such as `feature_…:face:end` in the plane chip, support-face panel, and create-sketch action. Present a readable face label and parent feature; keep IDs in diagnostics.
- The guided next step recommends an additive Extrude after finishing the top-face sketch. Provide equal visibility for pocket/cut intent in this context.

## What worked in this browser session

Exact unit-suffixed inputs, centered fully defined rectangle, base extrusion, four-edge selection via Parallel edges, side fillet, face-attached sketch, and offset boundary creation were all reached through the UI. Copy face boundary combines conversion and offset in one form, and Parallel edges avoids manually orbiting to each hidden edge. These are useful workflow strengths, although downstream correctness must be fixed before treating the full workflow as passing.

## Resume point

Retest the top cut first. If it passes, continue chapter 5 with the 1.27 mm top-face fillet and the battery terminals, then proceed to BATTERYPLATE, LENS, BULB, O-RING, SWITCH, LENSCAP, HOUSING, subassemblies, FLASHLIGHT assembly, and drawing workflows. Do not mark these untested workflows as missing features merely because this session stopped earlier.
