# Exercise 8.18 drawing plan — source review, not drawing acceptance

Source: `scratch/planchard/p/designer-431.png`, printed 8-53 / PDF431. The book requests ANSI C landscape, third-angle isometric exploded drawing, explode lines, BOM/balloons, general notes and custom title properties. Parent owns visible Chrome authoring after motion acceptance. This plan does not claim a created sheet.

Protected input: `artifacts/planchard/KT-assembly-parallel-free-home-browser-2026-10-08.mforge`. Read-only BOM audit: 25 occurrences, 16 rows; KT01–KT16 quantities **1,1,2,4,1,3,2,2,1,1,1,1,1,1,1,2**. Metal rows use Alloy Steel (SOLIDWORKS reference); KT13 uses Nitrile rubber (NBR-770 reference). No occurrence descriptions are overridden; source descriptions contain 155–260 characters of provenance.

## Description authoring

Use existing **Component description** inspector for all occurrences; preserve source document provenance. Suggested KT01–KT16 labels: Bench base; Hinge A; Brace A; Pivot pin A; Grip A; Retainer screw; Brace B; Retaining cap B; Hinge B; Grip B; Spindle; Handle shaft; Rubber handle grip; Grip screw; Main pin retainer; Added spacer sleeve. Keep duplicate definitions' descriptions consistent. Three-line wrapping alone cannot make the long provenance descriptions fully visible.

## Candidate browser-authored explosion

All distances below are millimetres and additive presentation offsets. Start from accepted blank-drive physical home; preserve its component transforms and native mates. Use **Explode step → Components, Direction, Distance, Reverse**. Preview after each group; revise separation through visible controls if silhouettes remain crowded.

| Step | Occurrences | Direction |
|---|---|---|
|1|All 24 except grounded KT01|Y +70|
|2–3|KT03 Brace A +Z / −Z|Z +55 / −55|
|4–5|KT07 Brace B +Z / −Z|Z +30 / −30|
|6|All four KT04 pins|Z −75|
|7|Three KT06 retainers, two KT08 caps, KT15|Z +90|
|8–9|KT16 sleeve +Z / −Z|Z +45 / −45|
|10|KT05 and KT10 grips|X +45|
|11|KT02 and KT09 hinges|X −45|
|12|KT11–KT14 spindle/handle group|Y −55|
|13|KT12–KT14 handle group|X −35|
|14|KT13 and KT14 grip/screw|X −35|
|15|KT14 screw alone|X −55|

## Drawing settings and paper coordinates

Choose **C (ANSI) /22×17 in**, mm, Fit to sheet, Third angle. Set title **KANT TWIST CLAMP**, number **PL-8.18-KT**, revision A. Existing dialog applies ANSI landscape. Notes must disclose original educational dimensions, unavailable companion CAD/AVI, two added KT16 spacers and the additional KT06 retainer, ideal RH2mm lead, flat-workpiece guides, reference materials, and unrated status. Use actual accepted mass only.

Expected sheet coordinates in millimetres: page558.8×431.8; border(20,12)–(546.8,419.8); BOM starts(26,18), width180. With short descriptions and two-line materials its 16 rows should total approximately140.4mm, endingY158.4. Title block(366.8,377.8),180×42. Automatic balloon boundsX26–540.8/Y18–359.8. Shared layout can use the region beside BOM starting beyondX218.

## Required actual-browser/export evidence

Verify physical SVG size, third-angle symbol, 16 readable rows with the exact quantities/materials, 25 balloons with repeated numbers matching occurrence definitions, circles inside border and separated, leaders clear of BOM/title/other circles, dashed explode lines terminating on corresponding displaced components, legible notes/title, unchanged physical transforms/mates, and cold reopen retaining the authored exploded view. Preserve actual SVG and screenshot before any further allocator repair. Existing vice wrapping/balloon fixes cover these controls; no additional source gap was established by this source-only review.
