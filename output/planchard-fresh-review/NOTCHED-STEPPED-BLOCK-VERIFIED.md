# Exercise 5.12 — notched stepped block

Recreated through the real browser from page 5-44 of the supplied ebook. Saved as `NOTCHED STEPPED BLOCK - exercise 5.12`.

- Fully defined eight-edge Front-plane base sketch, 2.25 in blind extrusion.
- Fully defined rectangular Front-plane cut sketch: x = 2.30–3.30 in, y = 0–0.75 in. Blind cut 1.00 in along +Z.
- Four editable history steps, one exact solid; both sketches fully defined.
- Exact volume 8.278125 in³. Independent rectangular-prism calculation agrees.
- Exact centroid (1.139383, 0.7521234, 1.181625) in agrees with independent volume-weighted calculation. Origin is base lower-left, cut starts at Z=0.
- Aluminum 2014 assigned. Catalog density is 2.80 g/cm³; the book uses rounded 0.101 lb/in³. These are not identical. At the book density the mass would be 0.836090625 lb. Drawing mass left blank.
- Saved drawing: ANSI inch preset, two decimal places, third angle, four views, nine dimensions (3.30, 2.00, 2.25, 0.75 tread, 0.50 rise, 1.75 tread, 0.75 lower height, two 1.00 notch dimensions). No assumed general tolerance.
- Reopened saved library record: exact rebuild succeeded, one solid, both sketches fully defined. All nine drawing dimensions survived and were visually checked.

The first drawing of this fresh model showed all steps and notch edges before a reload, verifying the late exact-geometry drawing-cache invalidation on this workflow. Reopened drawing also agrees.

Removed the unsolicited ISO 2768-m general tolerance from newly created drawing documents. Existing explicit title fields remain untouched.

Validation: 58 drawing/projection/mass-display tests passed; module/link checks passed (507 modules), 1,452 source assertions passed, git diff whitespace check clean. Full suite not run.
