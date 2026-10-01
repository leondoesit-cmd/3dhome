# Exercise 7.8 — fresh design example

Source: PDF373 / printed7-65. The book deliberately provides no dimensions. This is a labeled designer-choice example, authored from a blank desktop Chrome document in dark theme. No older geometry reused.

## Chosen geometry

Right-plane stepped extrusion profile(Z,Y),mm: (10,0)→(110,0)→(110,40)→(90,40)→(90,10)→(10,10)→close. Four independent driving dimensions100,40,20,30mm, horizontal/vertical relations and fixed start. Mid-plane extrusion60mm alongX. Front revolved sectionX10…20/Y−10…10mm, fully constrained,360° aboutY. Merged with the shelf; innerØ20mm bore remains fully open. Axis/origin lies at the boss center as shown in the book. MaterialAluminum6061,2.7g/cm³.

Four authored steps, two fully defined sketches, one solid. Exact Chrome volume112.3928cm³, mass0.3034606kg, COM(0,1.056755,6.375282)cm. Independent actual-browser-bundle replay:112.39281652432125cm³, bounds(−3,−1,−2)…(3,4,11)cm, five compiled features, issues[], valid BREP. Ideal union is stepped base96000mm³ plus annulus6000πmm³ minus radius20mm circular-cap overlap atZ10 over10mm height; matches exact result.

## Browser acceptance

Clean Save, reload and actual library reopen preserve both fully defined sketches, four features and material. Reopened exact mass matches. STEP export after reopening succeeds(42,134bytes). Upstream extrusion60→62mm updates revolved union to115.5928cm³/0.3121006kg; Undo restores112.3928cm³/0.3034606kg and clean saved state.

Initial background Exact model queue remained stale despite successful feature/mass/save jobs. The repaired visible Cancel control reset it; clean reload/library reopening cleared the queue and allowed STEP export. This is documented separately from geometry acceptance; worker agents continue repairing that lifecycle.

Artifacts: EXERCISE-7.8-design-example-browser-2026-09-28.{mforge,step,png}. The screenshot is actual Chrome. Example dimensions intentionally differ from any implied proportions of the undimensioned illustration.
