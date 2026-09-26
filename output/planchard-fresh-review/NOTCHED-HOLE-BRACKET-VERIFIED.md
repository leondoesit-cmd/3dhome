# Notched hole bracket — exercise 5.14

Recreated from Planchard page 5-45 through the real browser. Saved library record: **NOTCHED HOLE BRACKET - exercise 5.14**.

- Front L profile: 100 mm length, 60 mm height, 10 mm base, 25 mm upright. Mid-plane extrusion 50 mm.
- Right-plane notch: 30 mm wide, 12 mm deep, centered across the width.
- Attached face sketch and Hole Wizard: Ø25 mm through hole, center X60 mm, Z0; drawing verifies 60 mm from back and 25 mm from width edge.
- Three fully defined sketches, six history entries, one solid. Save/reopen rebuild verified visually.
- Exact volume 98,591.26 mm³; Aluminum 1060, density 2.69879 g/cm³; mass 266.0772 g. Centre of mass X29.15295, Y19.54490, Z0 mm.
- Independent volume: 100×50×10 + 25×50×50 − 25×30×12 − π×12.5²×10 = 98,591.26148 mm³.
- Saved third-angle metric drawing: front, top, right, isometric; ten dimensions (100, 60, 50, 30, 12, 10 cheek, 75, 10 base, 60 hole X, 25 hole width coordinate), including two automatically seeded overall dimensions.
- Feature-linked Ø25 THRU callout, material and mass title fields. No assumed manufacturing tolerance. All annotations survive reload.

## Fixes made during this exercise

- Document tree now reports body-assigned material instead of incorrectly showing unspecified; mixed/unassigned bodies remain represented. Browser verified Aluminum 1060 after reopening.
- Material panel explains whether presets affect face appearance only or body material/density.
- Hole callout leader meets the circular rim rather than the center when viewed along its axis. It follows changed radius, retains the existing topology reference, and updates existing saved drawings without migration. Browser verified on reopened drawing.

Validation: 34 feature-manager tests and 56 drawing tests pass; module/link checks and 1,452 source assertions pass; diff whitespace check clean. Full suite not run.

## Remaining review

Hole Wizard still requires a pre-existing circular position sketch; direct face-to-positioning workflow needs improvement. Escape behavior while a quick-form input is focused needs isolated reproduction. Whole ebook review remains ongoing.
