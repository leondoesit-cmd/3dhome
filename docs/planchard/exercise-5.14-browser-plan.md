# Exercise 5.14 — next fresh browser construction

Status: **not authored**. This is a construction plan and independent acceptance target, not a model or completed exercise. Source: user-supplied PDF page 263 / printed page 5-45; rendered reference `scratch/planchard/pdf-page-263.png`.

Start a new blank desktop Chrome document in dark theme. Use ANSI/MMGS, third-angle drawing conventions and Aluminum 1060. Preserve symmetry about the Front plane.

1. Front L profile: overall length 100 mm, height 60 mm, base thickness 10 mm. The 75 mm upper land makes the upright thickness 25 mm. Profile coordinates from the lower rear origin: (0,0), (100,0), (100,10), (25,10), (25,60), (0,60), closed. Add driving dimensions and relations through the sketch UI, with derived dimensions kept reference when needed to avoid redundant constraints.
2. Mid-plane Boss width 50 mm, Z=-25…25 mm.
3. Central top notch: width 30 mm across Z, with 10 mm lands on both sides, 12 mm deep from Y=60 to 48, spanning the 25 mm upright thickness. Author a separate fully defined sketch and cut through the upright. Confirm the sketch support and removal direction in the browser before committing.
4. Use **Hole Wizard** for a simple Ø25 mm Through-all hole in the base. The printed position is X=60 mm from the rear, Z=0 (25 mm from the edge). Place its standalone point through the sketch UI and constrain it. Confirm the Hole Wizard cuts downward through the 10 mm base.
5. Save/reopen, exact volume/COM, visible one-body geometry and STEP export. Record actual browser exports and screenshot. Final annotated sheet and upstream edit checks should be recorded separately.

Independent target volume, in mm³:

`100×50×10 + 25×50×50 − 25×30×12 − π×12.5²×10 = 98591.26147876595`.

Independent signed-block moments, relative to the lower rear origin on the Front symmetry plane:

- X moment: `50000×50 + 62500×12.5 − 9000×12.5 − (π×12.5²×10)×60`.
- Y moment: `50000×5 + 62500×35 − 9000×54 − (π×12.5²×10)×5`.
- Z centre of mass: 0 by symmetry.

Divide X/Y moments by the target volume. This calculation is verification only; no geometry was created by script.
