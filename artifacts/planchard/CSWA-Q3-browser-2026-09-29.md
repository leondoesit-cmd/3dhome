# CSWA practice Question 3 (PDF p.498) - browser construction, 2026-09-29

Fresh blank model editor in desktop Chrome (dark theme), Part units mm (MMGS), name "CSWA Q3 cast alloy steel pin". Same part as Exercise 6.6, rebuilt from scratch in a new document.

Build (real UI only):
1. Front-plane sketch, Line tool with typed length/angle: 14 up, 12 right, 8 down, 20 right, 6 down, closing click on the start point; five driving dimensions, start point "Place at sketch origin" -> profile (0,0),(0,14),(12,14),(12,6),(32,6),(32,0), fully defined (11 constraints).
2. Revolve 360 degrees about the X axis (head Ø28 x 12, shaft Ø12 x 20, 32 overall).
3. Front-plane Center rectangle 14 x 4 centred (6, 14) (fixed), Extruded Cut Blind 4 mm Mid-plane: 2 mm deep, 4 mm wide crown slot across the whole head.
4. Material: Cast Alloy Steel (SOLIDWORKS reference), 7.30 g/cm3 = .0073 g/mm3.

Results (Mass properties, exact solid, mm/g):
| quantity | book | app | deviation |
|---|---|---|---|
| volume | 9557.27 mm3 | 9557.265 mm3 | 0 |
| mass | 69.77 g (screen 69.77) | 69.76804 g | 0 |
| COM X | 9.79 | 9.786768 | 0 |
| COM Y | -0.13 | -0.127233 | 0 |
| COM Z | 0.00 | 0 | 0 |
Answer B reproduced.

One exact solid; Save to library, STEP (one MANIFOLD_SOLID_BREP) and project bundle exported.
Files: CSWA-Q3-browser-2026-09-29.{mforge,step,png,md}.
Time: about 9 min wall clock, ~55 UI actions (the sketch, revolve and slot workflow was already known from Q1/Q2).
