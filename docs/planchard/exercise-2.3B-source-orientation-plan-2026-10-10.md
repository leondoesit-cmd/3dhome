# Exercise 2.3B source orientation correction — 2026-10-10

**Use the proposed mirrored Z coordinates.** Source PDF126/printed2-40 lower figure shows a visible projecting plinth and a triangular beveled face toward the viewer. The app default isometric camera looks from +X/+Y/+Z. The earlier plan placed the projecting strip and facet toward low Z; its geometry was feasible but would conceal those source features from this camera.

The exact mirror Z′=50−Z preserves all chosen proportions and topology. Browser recipe, illustrative mm:

1. Fully defined Top base X0..60/Z0..50, Boss+Y5.
2. Fully defined Top offsetY5 main X0..60/Z0..40, Boss+Y50 (topY55). The visible plinth strip lies atZ40..50.
3. Fully defined Top offsetY55 triangle A(X20,Z40), D(X60,Z40), B(X60,Z0).
4. Genuine fixed terminal-point sketch at world C(X60,Y10,Z40), followed by ruled solid Loft Cut from the triangle to this terminal point, scoped to the stock body. The terminal remains a functional feature input and history sketch; it is not a label or mesh substitute.

The removed solid is the tetrahedron A–D–B–C; D=(60,55,40). Its volume is40×40×45/6=12,000mm³. The remaining planar triangular facet has vertices A=(20,55,40), B=(60,55,0), C=(60,10,40); its outward normal is proportional to(9,8,9), so it faces the default camera. Its plane is45X+40Y+45Z=4900 in these mm coordinates. The three edges are genuine facet boundaries across the top, tall viewer-facing face and right side.

Expected chosen native volume is15,000+120,000−12,000=123,000mm³, with bounds60×55×50mm and one valid connected solid. The plinth remains intact because terminalY10 is above the main-to-plinth junctionY5. Validate native/actual STEP, three facet boundaries and visible plinth in actual Chrome PNG, driver/Undo/Redo/Undo, Save and full cold reopening before acceptance.

This is a source-led orientation/proportion plan, not actual CAD authorship or acceptance. The source explicitly requests approximate sizing and supplies no physical numeric dimensions, material or hidden-corner depth. Preserve those qualifications in notes and Description. Parent owns all ordinary Chrome authoring; this report changes no model/browser/app/ADVANCE state.
