# CSWA practice Question 1 (PDF p.496) - browser construction, 2026-09-29

Fresh blank model editor in desktop Chrome (dark theme), units IPS (Part units: in), no earlier geometry reused.

Build (real UI only):
1. Front-plane sketch: line tool with typed lengths (4.00, 1.00 vertical), three clicked corners, driving dimensions 0.25, 1.00 (top), 2.60, origin corner placed at the sketch origin -> profile (0,0),(4,0),(4,1),(1,2.35),(1,2.6),(0,2.6), fully defined.
2. Extrude/Boss 2.50 in Mid-plane (Z +1.25..-1.25).
3. Sketch on the top face (its local origin is the face centre = x 0.5), Ø0.562 circle placed at the origin, Extrude Cut Blind 1.50 in.
4. Reference plane "Through three points" N(4,0,1.25), Q(4,1,-0.75), S(1.5,2.125,1.25) - N picked as a model vertex, Q and S typed (they are not vertices of the prism: Q is 0.50 from the back on the right top edge, S is 1.50 from the left end on the slope). Sketch on that plane, 20x20 in centre rectangle (fixed centre), Extrude Cut Through all along the plane normal (toward the removed corner T): removes exactly tetrahedron N-Q-S-T (0.833 in3).
5. Material: Engineering material data, custom "Alloy Steel" 0.278 lb/in3 = 7.6950 g/cm3.

App gap fixed: the Through-three-points reference plane could only use three picked model vertices, but the book's Q and S are points on edges. The plane form now has editable Point 1..3 X/Y/Z fields (seeded from picked vertices, kept associative when unchanged, otherwise stored as free points). js/modeler.js (threePointCoordinateFields / threePointsFromFields) + test in tests/three_point_plane.test.mjs.

Results (Mass properties, exact solid, in/lb):
| quantity | book | app | deviation |
|---|---|---|---|
| volume | 17.86 in3 | 17.85702 in3 | 0.02 % (rounding) |
| mass | 4.97 lb | 4.964244 lb | -0.006 lb (-0.12 %); 17.857 x 0.278 = 4.964, so the book mass is a rounding/software-density artefact |
| COM X | 1.63 | 1.63109 | +0.001 |
| COM Y | 1.01 | 1.007601 | -0.002 |
| COM Z | -0.04 | -0.0350036 | +0.005 (rounds to -0.04 at 2 dp -> -0.04 (-0.035)) |

Analytic check: prism 19.06 - tetra 0.8333 - hole 0.372 = 17.855; app 17.857 (hole volume uses the exact 1.50 in blind depth and Ø0.562).
Answer B (X 1.63, Y 1.01, Z -0.04) reproduced.

One exact solid; Save to library, page reload and Save-copy-and-open from the library reopened all six steps; STEP has exactly one MANIFOLD_SOLID_BREP (36 kB).
Files: CSWA-Q1-browser-2026-09-29.{mforge,step,png,md}.
Time: about 60 min wall clock including one lost first attempt (unsaved draft lost on reload) and the app fix; roughly 110 UI actions on the successful pass.
