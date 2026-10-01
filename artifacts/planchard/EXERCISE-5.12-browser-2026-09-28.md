# Exercise 5.12 — fresh Chrome construction

Source: PDF page 262 / printed page 5-44. New blank desktop Chrome document, dark theme, named `Planchard Exercise 5.12 - rebuilt 2026-09-28`. No older geometry was used.

Front eight-edge profile: A=3.30 in overall length, B=2.00 in height; top land .75 in and .50 in drop, bottom land 1.75 in and .75 in height. Middle land .80 in and middle rise .75 in are derived reference dimensions. Six driving dimensions, horizontal/vertical relations, fixed origin and merged closure leave 0 DOF. Boss width 2.25 in.

A separately drawn Top-plane 1×1 in square was translated horizontally 2.30 in through the sketch UI, then cut Through all. This removes the corner X=2.30…3.30, Z=0…1.00, Y=0….75 in. Origin is the bottom corner of the tall step at X=Y=Z=0, on the same depth side as the notch. Both sketches fully defined; four authored steps, two solid features, one body. ANSI inch/third-angle, precision 2; Aluminum 2014.

## Acceptance and calculation

Save, library reopen and exact rebuild succeeded with both sketches fully defined. Chrome STEP and unmodified project-bundle exports succeeded. Final screenshot shows the notch, fully defined history and exact volume/center card. No upstream edit test or completed drawing sheet is claimed.

Independent replay of the actual browser bundle: five compiled kernel steps, valid BREP, no issues, volume 135.654164175 cm³ = 8.278125 in³. Analytic volume: 2.25×(.75×2.00 + .80×1.50 + 1.75×.75) − 1×1×.75 = 8.278125 in³.

Center of mass (in), confirmed independently by signed rectangular-block moments: X=1.139382785956965, Y=.752123442808607, Z=1.181625141562854. Bounds 3.30×2.00×2.25 in.

Library 2014 density is 2.80 g/cm³ = .101156 lb/in³, giving .8373855 lb. The book's rounded .101 lb/in³ gives .836090625 lb; this density difference does not affect the requested volume/center result.

Artifacts: `EXERCISE-5.12-browser-2026-09-28.{mforge,step,png}`.
