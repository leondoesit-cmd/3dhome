# CSWA practice Question 2 (PDF p.497) - browser construction, 2026-09-29

Fresh blank model editor in desktop Chrome (dark theme), Part units mm (MMGS), no earlier geometry reused. Model name "CSWA Q2 copper bracket".

Build (real UI only):
1. Top-plane sketch: Centerpoint straight slot (arc centre spacing 80 = 2 x (A/2 + B - ... ) i.e. centres at x = +-40, width 60 -> R30 ends), centre fixed at the origin; two circles drawn at the arc centres, diameter 20 typed, each made Concentric with its slot arc. Sketch fully defined (15 constraints, 4 dimensions). Extrude/Boss 14 mm upward: one region with two holes.
2. Right-plane sketch: Center rectangle 60 x 30, centre (0, 15) -> spans y 0..30 (overlaps the base below y=14, which is already material). Extrude/Boss 40 mm Mid-plane about X, merged.
3. Right-plane sketch: circle D60 centre (0, 30) (Set point coordinates), fully defined. Extrude/Boss 40 mm Mid-plane, merged: the R30 round top (its lower half is inside the rectangle/base).
4. Right-plane sketch: circle D20 centre (0, 30). Extruded Cut, Through all, Mid-plane (both directions).
5. Material: Engineering material data, custom "Copper" 8.9 g/cm3 (= .0089 g/mm3).

App bug found and fixed while building (kernel): a typed circle hole inside an outline on a plane whose (u,v) axes are mirrored against the normal (Top plane: u->x, v->z, normal +y) came out with the wrong wire direction, so the exact kernel treated the "hole" as a second boss - the first Top-plane extrusion reported 115 580 mm3 (= 106 784 + 8 796) and showed no caps. `makeBrepExtrusion` in js/cad_kernel.js now compares hole/outline winding in world space (single circle/ellipse loops are built counter-clockwise about the normal); regression `tests/cad_profile_curves.test.mjs` "typed circle holes cut a Top-plane slot ...". 58 kernel tests + 12 profile tests + `npm run check` pass.

Results (Mass properties, exact solid, mm/g):
| quantity | book | app | deviation |
|---|---|---|---|
| volume | 180369.91 mm3 | 180369.9 mm3 | 0 |
| mass | 1605.29 g | 1605.292 g | 0 |
| COM X | 0.00 | 0 | 0 |
| COM Y | 19.79 | 19.79367 | +0.004 |
| COM Z | 0.00 | 0 | 0 |
Answer A (0.00, 19.79, 0.00) reproduced. Analytic: base 97 987.6 + upright 82 382.3 = 180 369.9 mm3.

One exact solid; Save to library; STEP exported (one MANIFOLD_SOLID_BREP).
Files: CSWA-Q2-browser-2026-09-29.{mforge,step,png,md}.
Time: about 35 min wall clock (plus ~10 min diagnosing and fixing the kernel bug), ~75 UI actions.
