# CSWA practice Question 6B (PDF p.503) - modified Q6 (PARTIAL)

Starting from the saved Q6 model (itself PARTIAL) with the Q6A coordinate system:
- Overall length 130 -> 140: edited the driving 130 dimension in the Front sketch (parametric rebuild of pocket and body). The Top-plane slot sketch was NOT tied to the right end, so it was moved (centre +12.5) and widened to 60 to keep its start 50 mm from the new end.
- Material Aluminum 1060 (library 2.69879 g/cm3 = .0975 lb/in3; the printed 309.75 g / 114721.22 mm3 implies exactly 2.700 g/cm3).
- "All fillets to 7 mm": NOT done - the Q6 model has no fillets (see Q6 note), so there is nothing to modify.

Result (mm/g): volume 116593.9 mm3, mass 314.6625 g; COM relative to the Q6A system (-76.596, -14.528, -22.157) (the mass card was left on that system; the book's Q6B COM is printed in the default frame as (-16.25, 15.51, -2.67), so it is not directly comparable and was not checked).
| quantity | book | app | deviation |
|---|---|---|---|
| volume | 114721.22 mm3 | 116593.9 mm3 | +1.63 % |
| mass | 309.75 g | 314.6625 g | +1.59 % |
Density check: 116593.9 x .00269879 = 314.66 g, so with the book's 2.700 the app would give 314.81 g; the 0.04 % density difference is minor.
Outside the book's 1 % tolerance because the 3 x D4 x 25 holes and the R7 fillets (both -volume) are missing. Not claimed as reproduced.
Saved to the library, STEP (one solid) and bundle exported. Files: CSWA-Q6B-browser-2026-09-29.{mforge,step,png,md}.
