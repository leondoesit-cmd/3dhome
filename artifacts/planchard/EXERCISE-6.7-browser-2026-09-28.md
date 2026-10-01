# Exercise 6.7 — fresh Chrome bracket

Source: supplied Planchard PDF page 306, printed page 6-38. All geometry was authored from a blank Chrome document on 2026-09-28.

Right-plane closed L-section: 2 in depth, 2.5 in overall height, .5 in base and upright thickness. Four driving lengths plus two reference closure lengths, horizontal/vertical relations, fixed origin, and merged closing endpoint leave zero degrees of freedom. Mid-plane Boss is 4 in across X.

Top-plane Ø2 in circle centered on the front-edge origin cuts the R1 semicircular opening through the base. Front-plane Ø1 in circle at (0,1.5) in cuts through the upright: its center is 1 in above the base's top. Both circle sketches are fully defined. Final Fillet rounds the two upper through-thickness edges with R.50 in. Seven authored history steps, four solid features, three fully defined sketches, one solid. Assigned Aluminum 6061, 2.70 g/cm³.

The Drawing→Model transition froze the original tab before Save acceptance. The new Saved drafts UI recovered its seven-step browser-authored draft into another tab without modifying the original. Save, reopen, and STEP export then succeeded. With the repaired classic CAD preview renderer, Drawing→Model returns promptly with all geometry retained. Final ANSI inch/third-angle settings use two decimal places.

Actual Chrome bundle exact replay validates the BREP with nine compiled kernel steps and no issues:

- Volume: 110.91178353865448 cm³ = 6.76825229575319 in³.
- Mass at library density: 299.461815554 g = .6602003 lb.
- Bounds: 4 × 2.5 × 2 in.
- Centre of mass: (0, .8992672434, 1.4605771975) in.

Analytic volume agrees: 8 in³ L-section less .7853981634 in³ semicircle, .3926990817 in³ bore and .05365045915 in³ corner rounds. The book's rounded density .0975 lb/in³ yields .6599045988 lb, slightly below the library's .0975437 lb/in³ value.

Deliverables: `EXERCISE-6.7-browser-2026-09-28.{mforge,step,png}`. A finished drawing sheet and an upstream dimension-edit test are not claimed for this homework.
