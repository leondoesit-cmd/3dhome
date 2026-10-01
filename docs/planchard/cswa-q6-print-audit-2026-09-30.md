# CSWA Q6 print audit — 2026-09-30

Read-only source audit of ebook PDF pages 501–502. No geometry changed and no target fitting.

## Resolved hole face and pattern

The three blind holes belong on the descending face immediately after the left 8 mm flat bump and its 7.50 mm vertical step. Front/back hidden bore axes run down-left into the material from this face. They do not belong on the 65-degree rising flank or the long 60-degree right descent.

The auxiliary view's pattern is a 15 mm equilateral triangle. Taking U across the 40 mm part width, centred at U=0, and V down the hole face from its upper edge:

- first hole: U=0, V=3.30 mm;
- second: U=-7.50 mm, V=3.30 + 15 cos(30°) = 16.290381 mm;
- third: U=+7.50 mm, V=16.290381 mm.

All are diameter 4 mm, blind depth 25 mm. The face needs at least 18.290381 mm usable length, allowing a 2 mm hole radius below the farther row.

## Profile contradiction requiring repair before holes

The protected initial Q6 profile's straight face between the bump and R30 saddle is only 7.562 mm long: start approximately (29.9948,37.5003) mm and end approximately (35.3418,32.1532) mm in coordinates measured from its left bottom. It cannot contain the printed triangle.

The high-resolution second front view shows this descent reaching roughly the pocket-wall position X=45 mm before the R30 valley. There appears to be a separate rounded junction into the R30 valley; all unspecified rounds are 5 mm. Directly making the R30 saddle tangent to the 45-degree descent, as the initial model does, likely shortens the hole face incorrectly. This is a source interpretation issue, not a reason to relocate the holes to a different face.

A tentative nominal endpoint (X45,Y22.5) was considered from the dimension arrangement, but the vertical 15 mm extension must be independently checked. It is not an accepted coordinate and must not be used as a fitted target.

The right 45 mm dimension must also be checked for virtual corner versus tangent endpoint extent; the initial model's tangent line is 43.3207 mm.

## Source images

- `scratch/planchard/cswa-q6-front-detail.png`: focused first front view.
- `scratch/planchard/cswa-q6-second-front-detail.png`: focused second front view with hidden bores.
- `scratch/planchard/cswa-p502-aux-detail.png`: equilateral pattern and 3.30 mm offset.

Current Q6 remains partial until the hole face profile and R5 fillets are corrected and the book's 1% mass criterion is met.

## Fresh reconstruction checkpoint, 2026-09-30

A new blank Chrome document now has seven committed editable features: fully defined Front base sketch, 40 mm mid-plane extrusion, five native R5 edge rounds, fully defined Top slot sketch, through-all slot cut, fully defined front-face pocket sketch and 12.5 mm reverse-normal pocket cut. The native solid measures 130 × 45 × 40 mm. The 45° drill facet drops 15 mm in both X and Y; R5 bridges its junction to the R30 curve. The separate R10/R30 transition and 45 mm right flank follow the printed geometry. The document was not derived from an older library model.

The pocket was made through Convert face with a 2 mm inward offset, then a dimensioned wall at drawing X45 mm (world X−20 mm). Native Trim removes the unused left chain and closes the wall at the exact offset-arc intersection. The resulting eight-entity profile is fully defined. The printed slot begins 50 mm from the right end and is 15 mm wide. An eighth, empty face sketch is attached to the actual 45° facet for the remaining three Ø4 × 25 mm blind holes. This checkpoint remains incomplete until those holes, material, final properties and cold reopen are accepted. Library ID `cm_munj5xtw`; Chrome tab710858539.

### Corrections from the enlarged printed views

The checkpoint above was superseded. The 12.50 mm Top dimension measures the arm from outer face to slot; the 2 mm residual pocket floor makes the blind pocket depth **10.50 mm**. The Front 15 mm dimension ends at the outer pocket reference wall; the inner pocket boundary lies another **2 mm to its right**, at nominal drawing X47 mm (world X−18 mm). Source crops are `cswa-q6-top-depth-detail.png` and `cswa-q6-second-front-detail.png`. These corrections follow dimension leaders and wall outlines, independently of the mass result.

Three Ø4 mm circles have been placed on the actual 45° face in a 15 mm equilateral pattern, with the upper center 3.30 mm down the face. Their native reverse-normal cut is blind 25 mm. All four sketches are fully defined. The corrected left pocket wall intersects the R32 offset curve, so its obsolete R7 corner tail was removed. Native Trim calculated the wall intersection, Point coordinates located the matching arc endpoint there, and Merge overlapping endpoints produced a closed seven-entity profile with zero DOF. Native mass verification and protected export follow this correction.

### Native browser acceptance

Chrome tab710858629 reported exact solid geometry: **111060.4 mm³**, **888.4836 g**, COM **(−15.39197, 15.93340, −2.652365) mm**, bounds **130 × 45 × 40 mm**, Steel 304 at **8.00000 g/cm³**. At the book's two decimal places, mass **888.48 g** and all three COM values **(−15.39, 15.93, −2.65) mm** match. The underlying volume differs from the printed 111059.43 mm³ by 0.97 mm³; no dimension was adjusted to remove that rounding residual.

Save completed with no unsaved marker. Project bundle was exported using the visible Output command, then protected as `artifacts/planchard/CSWA-Q6-final-fresh-browser-2026-09-30.mforge` (1,577,246 bytes). After a real page reload and visible saved-library reopen, nine editable features and four fully defined sketches remained; a new exact calculation repeated the same mass and COM. Proof: `CSWA-Q6-final-native-browser-2026-09-30.png` and `CSWA-Q6-cold-reopened-native-browser-2026-09-30.png`. The accepted live Chrome tab710858629 is retained.
