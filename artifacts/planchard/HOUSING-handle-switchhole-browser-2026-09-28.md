# Fresh HOUSING - HandlePath, Handle, SwitchHole, Rib1, LPatterns, LongRibPlane, Rib2 (book PDF 350-363) - PARTIAL

Status: real Chrome, dark theme, real UI. Library model `Planchard HOUSING - rebuilt 2026-09-28` was saved through **Rib2** (features: Base Extrude, Boss-Loft1, Boss-Battery, Shell 1, Boss-Stop, Draft 1, ThreadPath, Thread, Handle, SwitchHole, Rib1, LPattern1, Pattern 2 (second direction), Rib2). **Mirror1, the acceptance run (reload/edit/Undo/STEP) and the protected `.mforge/.step/.png` were NOT done**: the session hit the usage limit while reopening the model from the library. The last accepted protected bundle is still `HOUSING-thread-browser-2026-09-28.{mforge,step,png}`.

## Authored (all through the UI)

* HandlePath (Right Plane, step 16), with model-edge relations instead of derived numbers: bottom end Coincident with the Boss-Battery top-back corner (picked model vertex, stored as start/end of the edge that ends there); left end Coincident with the Boss-Stop back rim (a circle seen edge-on); Origin-to-line 2.5 in, R 0.5 in Sketch Fillet. No length dimension on the path; it follows Boss-Stop / Boss-Battery changes through the stored topology references.
* HandleProfile (Face sketch on the Boss-Stop back face): Slot 2.54 cm (1.000 in) centres, R 0.254 cm (.100 in), Pierce to HandlePath's horizontal line; fully defined.
* Handle (Sweep profile HandleProfile, path HandlePath, follow path, merge). Exact volume 210.3074 cm3 (+24.5044 cm3 = profile 1.4929 cm2 x path length 16.414 cm), bounds 13.0175 x 13.1128 x 18.034 cm, one solid, mass 1.650913 kg (default steel), COM (0.0000653, 0.4848, -5.358) cm. Library saved.
* SwitchHole (Extruded Cut, Up To Surface, terminating face `Shell 1 generated-5`, reversed normal): sketch on the Handle top plane, O 0.510 in (1.2954 cm), 0.450 in (1.143 cm) from the Origin. The face sketch's origin is the face centre, so the sketch was detached to the Top Plane with offset 6.604 cm (see gaps).
* Rib1 (Top Plane sketch, line 13.7795 cm, Parallel to sketch, thickness 0.254 cm both sides, Down): saved. LPattern1 (Y instances 3, spacing +1.27 cm) and Pattern 2 (Y instances 3, spacing -1.27 cm), seed only, merge, saved.
* LongRibPlane (Reference plane through the Handle back-right vertex, parallel to the Right Plane, X 1.524 cm) and Rib2 (sketch: horizontal line at Y 3.302 cm from the BatteryLoftPlane, tangent arc to the boss; thickness 0.1905 cm both sides, Parallel to sketch, Down): built exactly after the Rib fix below, saved with the model.

## Deviations from the book, honestly

* Rib sketches are left "partially defined" (Rib1 line: 2 DOF; Rib2 arc/line: 3 DOF). The book says a Rib sketch need not be fully defined; the intersection/coincident relations of steps 635 were not added.
* The book's single Linear Pattern in two directions is two Pattern features here (one direction each).
* The book uses Rib "Draft outward 1 deg"; Parallel-to-sketch Rib does not support draft (kernel refuses nonzero draft), so Rib1 and Rib2 have no 1 degree draft.
* Mirror1 (Right Plane, Rib2) was set up (Mirror form, plane = Right Plane) but not applied to the saved model.

## App gaps found and fixed (each with a focused test)

1. `modelEdgeSketchLine` treated any edge as the chord of its end points: a lofted B-spline rail was pickable across the Boss-Stop rim (`js/sketch_intersection.js`).
2. Model edges and corners were hit at their plane projection, not where drawn through a perspective camera (`hitScreenModelEdge/Vertex`, used by the sketcher).
3. Edge/corner picks stayed in `E.topologySelection` after a fresh sketch pick or a miss, so the next Coincident reused a stale edge (`dropSketchModelPicks`, `js/modeler.js`).
4. Parallel-to-sketch Rib refused a profile that meets more than one stopping surface ("Parallel Rib reaches different stopping surfaces"), which is exactly Rib2 (line on the wall, arc on the loft/boss): now grows an oversize slab and keeps the free pieces connected to the profile (`js/cad_kernel.js parallelRibBrep`). Tests in `tests/cad_rib_parallel.test.mjs` (stepped floor: exact +96; floor + cylindrical boss: exact half-disc, one solid, exportable). 24 rib tests pass.

`tests/sketch_model_edge_relation.test.mjs` grew 4 cases (11 pass). `npm run check` clean (589 modules, 1489 assertions).

## Other observations (not fixed)

* Typing a rename while the tree row is not in rename mode sends the letters to the app as shortcuts; the planner's global P/W/F keys then fire inside the modeler (P opened Photo mode, whose Close button is under the modeler layer and unreachable until the modeler is closed). Rename only through the context menu and check `document.activeElement.className === "md-tree-rename"` first.
* The cold exact rebuild is 6-10 minutes per reload and every Save re-validates the whole tree (about 10 minutes). No protected export was possible in the time.
