# Exercise 5.13 — fresh Chrome construction

Source: PDF page 262 / printed page 5-44. Started from a blank desktop Chrome document in dark theme; no older geometry used.

Front profile has five connected driving line dimensions: 20, 60, 10, 90 and 30 mm. The line chain was translated +15 mm horizontally through the sketch UI. A centrepoint semicircle joins (15,0) to (-15,0), with its centre constrained to the sketch origin. The derived radius is 15 mm. Six entities, twelve constraints, five driving dimensions, 0 DOF and one closed region. Mid-plane Boss is 50 mm, symmetric about the Front plane. Aluminum 1060; ANSI, mm, third-angle, precision 2.

Save, Library reopen, exact mass properties, STEP and unmodified project-bundle exports all succeeded in Chrome. Independent replay of the actual exported bundle has two compiled features, no issues and a valid BREP.

Exact volume: 92.67145867644257 cm³ = 92671.45867644257 mm³. Analytic volume: 50 × (90×10 + 30×20 + π×15²/2). Centre of mass in mm: (14.567591999533025, -14.162936666212655, 0). Bounds: X=-15…75, Y=-30…15, Z=-25…25 mm. Library nominal .0975 lb/in³ density gives 250.1009 g.

Artifacts: `EXERCISE-5.13-browser-2026-09-28.{mforge,step,png}`. No upstream edit test or final annotated drawing sheet is claimed.
