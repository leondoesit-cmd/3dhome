# CSWA practice Question 6 (PDF pp.501-502) - browser construction, 2026-09-29/30 (PARTIAL)

Fresh blank model editor in desktop Chrome (dark theme), mm, name "CSWA Q6 hollow AISI 304". Material Steel 304 (library 8.00 g/cm3 = the book's .008 g/mm3).

Reading of the print (numeric fit in scratch, no geometry created by script): front profile 130 long; left tab 30 high x 15 long, R5 foot, 8 wide bump to 45 high, 65 deg rising flank, a R30 concave saddle, a R10 crest, a 60 deg descent to a 15 high right end (R5 corner); extruded 40 mm; a 15 mm wide slot from the right end (x 80..130, 12.5 + 15 + 12.5 in the top view); a 2 mm wall pocket opened on the +Z face (12.50 deep), leaving the tab solid (left wall at x = 45); 3 x D4 x 25 holes and R5 fillets.

Built through the real UI:
1. Front-plane sketch: 130 base, 15 right rise, 43.3207 descent at 60 deg (tangent to R10), R10 crest, R30 saddle (tangent), 45 deg flank line, 7.5 / 8 / 16.551 bump lines, 15 tab, 30 left wall. Profile placed so the origin is at mid-length (x -65..65). 11 entities, 13 dimensions. Extrude 40 mm Mid-plane.
2. Top-plane sketch, centre rectangle 55 x 15 at (42.5, 0), Extruded Cut through-all symmetric -> the 15 mm slot.
3. Face sketch on the +Z end face: "Copy face boundary" with offset -2 (2 mm wall), a vertical line at x = -20 and the Trim tool to remove everything left of it -> closed pocket profile; Extruded Cut blind 12.5 (12.50 in the print).
4. Steel 304, Save, project bundle and STEP.

Results (Mass properties, exact solid, mm/g):
| quantity | book | app | deviation |
|---|---|---|---|
| volume | 111059.43 mm3 | 113547.0 mm3 | +2.24 % |
| mass | 888.48 g | 908.376 g | +2.24 % |
| COM X (origin mid-length) | -15.39 | -15.638 | -0.25 |
| COM Y | 15.93 | 15.171 | -0.76 |
| COM Z | -2.65 | -2.410 | +0.24 |
NOT within the book's 1 % tolerance. Known omissions that explain the sign of the gap: the three D4 x 25 holes (about -940 mm3, -0.85 %), all R5/R10-style fillets (edges R5 typ, several hundred mm3), and the crest height of the R10/R30 blend, which the print only fixes through the 65/60 degree angles (the face sketch keeps 2 degrees of freedom, the Front sketch is fully defined). Estimated: 113547 - 940 - fillets ~ 111.0-111.5k, i.e. consistent with the printed 111059.43, but not built, so the printed value is NOT claimed as reproduced.

Gaps found in the app (not fixed here): the extrude cut ignores the sketch-entity selection when a face-boundary copy is split by a line (both halves are cut; Trim on the copied boundary was the workaround); no way to see the sloped-face hole direction from the iso views without manual orbit.

Files: CSWA-Q6-browser-2026-09-29.{mforge,step,png,md}. Time about 2.5 h wall clock, ~230 UI actions.
