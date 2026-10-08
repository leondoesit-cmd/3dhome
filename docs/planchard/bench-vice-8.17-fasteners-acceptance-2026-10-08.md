# Exercise 8.17 — BV08, BV09 and BV10 accepted

Accepted 2026-10-08 through visible desktop Chrome in dark theme, each authored from blank with mm units. All use ordinary driving circles and a six-sided driving polygon: circumscribed diameter 11.5470053837925 mm, rotation 30°, fixed center and rotation. Heads have X flats ±5 mm and Z vertices ±5.7735 mm. Alloy Steel reference density 7.70 g/cm³ and source/part/item/description properties were assigned through the UI.

| Part | Geometry along local Y (mm) | Features / history steps | Volume cm³ | Mass kg |
|---|---|---|---|---|
|BV08 Foot Hex Screw|Ø6 stem −14..0, AF10 head 0..4|2 / 4|0.7422508358660889|0.005715331|
|BV09 Retention Bolt|Ø6 stem −13.8..0, Ø4 nose −15.8..−13.8, AF10 head 0..6|3 / 6|0.9349337910752327|0.007198990|
|BV10 Keeper Screw|Ø6 stem −25..0, AF10 head 0..4|2 / 4|1.0532685085714784|0.008110168|

All sketches fully defined; one merged native solid each. BV08 stem diameter 6→7 gives 0.8851933 cm³; BV09 nose 4→4.2 gives 0.9375099 cm³; BV10 head diameter increased 10% (AF10→AF11) gives 1.126015 cm³. Each agrees with the independent analytic volume calculation. Undo→Redo→Undo restores nominal geometry and clean saved state.

A cold page reload followed by actual saved-library opening of each part restored the editable history, one native solid, material and nominal exact mass. Cold-reopen screenshots are in artifacts/planchard. Final browser-downloaded editable bundles and STEP files use the BV08-foot-screw, BV09-retention-bolt and BV10-keeper-screw final-browser-2026-10-08 stems. Independent recipe regeneration has no issues; STEP reimport confirms one valid solid and corresponding volume, maximum tolerance 1e−7 cm. Audit JSON files preserve full results. Adapter operation counts include sketches and supporting operations and are not authored feature counts.

These are original designer dimensions; companion files are unavailable. Smooth nominal stems represent fasteners, without certified thread engagement or load ratings. Book exercise: printed 8-52 / physical PDF 430. Assembly/motion/interference/drawing acceptance remains unfinished. BV07 sphere socket cut currently exposes a real source eligibility gap under repair.
