# Exercise 5.10 — stepped block

Constructed through the browser from the figure on PDF page 261. Front-plane eight-edge profile, anchored at the front-bottom-left origin, fully defined with seven driving lengths. Extruded 1.25 in and assigned Aluminum 1060.

Saved as **STEPPED BLOCK - exercise 5.10** and reopened from Saved Models. Rebuild succeeded with one exact solid and two history steps.

Browser mass properties:
- Dimensions X 88.9, Y 57.15, Z 31.75 mm.
- Volume 115.7336 cm³.
- Mass 0.3123409 kg.
- Centre of mass X 3.54729, Y 2.340228, Z 1.5875 cm.

Independent volume: (1.5 × 2.25 + 1.25 × 1.4 + .75 × .7) × 1.25 = 7.0625 in³. At .0975 lb/in³, mass is .68859375 lb, matching the browser result.

Construction exposed a redundant automatic Vertical relation on the final closing edge. Removed it through the browser, leaving the sketch fully defined. Code now skips automatic line relations when both endpoints are reused and the resulting sketch is already fully constrained. Workflow status now explicitly reports conflicting and over-constrained states instead of “Partially defined · 0 DOF.” These two latest changes still need a fresh browser reproduction after reload.

Remaining: exercise 5.10 drawing, subsequent book exercises, and broader professional workflow coverage. The complete ebook has not been finished.

## Follow-up verification

- Reloaded latest code and drew a fresh constrained four-edge rectangle through the browser. Closing at the origin kept seven constraints / three driving dimensions and Fully defined in both inspector and workflow header; no redundant closing Vertical relation was inserted. The disposable unsaved sketch was discarded.
- Finished the saved stepped-block drawing with seven dimensions: 3.50 overall run, 2.25 overall height, 1.50 and 1.25 treads, two 0.70 rises, and 1.25 extrusion width. ANSI preset, inches, two decimals, third angle. Material Aluminum 1060; mass 0.69 lb. Removed the unrequested default general tolerance. Reloaded and visually verified all dimensions persisted.
- Added in / lb Mass Properties display, including volume, density, centroid and mass inertia. Browser verified 7.062500 in³, 0.6885937 lb, 0.0975000 lb/in³, dimensions 3.5 × 2.25 × 1.25 in. Switching back to mm / g correctly reports 312.3409 g and g·mm² inertia.
- Corrected drawing view-list scale to use the actual layout scale (the isometric view is 1:1 while orthographic views are 2:1). Reloaded and verified the view list now reports FRONT/TOP/RIGHT 2:1 and ISOMETRIC 1:1.
- Exercise 5.11 and subsequent exercises remain outstanding.

Validation: 10 mass/material/history tests passed. Module and link checks passed with 507 modules; 1,452 source assertions passed. No full-suite claim.
