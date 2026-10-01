# Exercise 5.10 — fresh Chrome construction

Source: PDF page 261 / printed page 5-43. Started from a blank document in desktop Chrome, dark theme, named `Planchard Exercise 5.10 - rebuilt 2026-09-28`. No older geometry was used.

Front-plane eight-edge profile uses the printed bottom-left/front origin. Overall length 3.50 in, overall height 2.25 in; two 1.25 in treads and two .70 in rises. The remaining tread is 1.00 in and upper rise .85 in by subtraction. Six driving dimensions, two reference dimensions, horizontal/vertical relations and a fixed origin; overlapping closing endpoints merged through the UI. Fully defined, 0 DOF.

Blind Boss depth 1.50 in; two history steps and one exact solid. Aluminum 1060 uses the printed nominal density .0975 lb/in³. ANSI inch/third-angle standards, precision 2 saved.

## Acceptance

- Save and library reopen restored the fully defined profile and exact solid.
- Actual driving length changed 3.50→3.75 in through the sketch UI; the derived tread changed 1.00→1.25 in. Exact volume changed 7.893750→8.156250 in³ and mass .7696406→.7952344 lb. Undo restored the printed dimensions and mass, then Save completed.
- Chrome STEP and original project-bundle exports succeeded; final screenshot includes the complete solid, fully defined sketch and exact mass card.
- Independent replay of the actual downloaded bundle: two kernel steps, no issues, valid BREP, volume 129.35538645 cm³ = 7.893750 in³. Analytic check: 1.50 × (1.25×2.25 + 1.25×1.40 + 1.00×.70) = 7.893750 in³; mass .769640625 lb.
- Center of mass: (1.3565914489, .8805819477, .7500000000) in from the printed origin. Bounds 3.50 × 2.25 × 1.50 in.

Artifacts: `EXERCISE-5.10-browser-2026-09-28.{mforge,step,png}`. No completed drawing sheet is claimed; the homework requests the part, drafting standard and mass.
