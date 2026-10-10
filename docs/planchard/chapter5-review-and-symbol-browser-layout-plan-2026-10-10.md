# Chapter5 review and remaining review symbols: browser layout plan

Read-only source planning; no model authoring, import, browser use, ADVANCE edit or commit. PDF256/257 (printed5-38/39), PDF102 (2-16), and PDF174 (3-46) were rendered and visually inspected in `scratch/planchard/finish-source-{page}.png`. Answers remain in `chapter-review-answer-plan-2026-10-10.md`; this report supplies native paper placement and diagram primitives.

## Chapter5: 19 answers on one A3 sheet

A3 landscape420×297mm, third-angle, mm. Header X35/Y25, four LF rows. Left column X35, right X225, start Y60. Notes use 2.5mm font, 3.5mm baseline pitch, 5mm gap. First row is `Qnumber - topic`; wrap answer body at75 characters without splitting words/hyphenated words. The actual viewport origin/zoom must be measured before clicks. Do not use a stale screenshot origin.

```text
CHAPTER5 - REVIEW ANSWERS Q1-Q19
Source: printed5-38/39 / PDF256/257, Planchard2021.
Independent explanations and source-reviewed icon names.
No official answer-key or original SOLIDWORKS-session claim.
```

|Q|Column/X mm|Y mm|LF rows including heading|
|---:|---|---:|---:|
|1|Left/35|60|4|
|2|Left/35|79|4|
|3|Left/35|98|5|
|4|Left/35|120.5|4|
|5|Left/35|139.5|4|
|6|Left/35|158.5|2|
|7|Left/35|170.5|3|
|8|Left/35|186|3|
|9|Left/35|201.5|2|
|10|Left/35|213.5|2|
|11|Right/225|60|3|
|12|Right/225|75.5|3|
|13|Right/225|91|3|
|14|Right/225|106.5|3|
|15|Right/225|122|3|
|16|Right/225|137.5|5|
|17|Right/225|160|4|
|18|Right/225|179|4|
|19|Right/225|198|4|

Total20 notes/69 LF rows including header. Last occupied baseline is217mm left and208.5mm right. A3 fits; A2 or three columns are unnecessary. Qualified export and independent cold reopen remain acceptance work for the parent.

### Source icon answers

PDF257 Q18 A–F: **A Extruded Boss/Base; B Linear Pattern; C Draft; D Shell; E Revolved Boss/Base; F Mirror.**

Q19 A–J: **A Line; B Smart Dimension; C Centerline; D Circle; E Corner Rectangle; F Offset Entities; G Tangent Arc; H Convert Entities; I Point; J Polygon.** G was additionally checked against PDF274's arc flyout in the existing plan. The Point icon is faint at normal page size; preserve the inspected mapping instead of substituting a visible-looking icon. Letter/name answer notes satisfy these identification prompts; no new solid or bitmap-copy workflow is required.

## Chapter2 Q9/Q10: native paper projection symbols

Source PDF102 visibly places the **larger frustum end at the right, smaller at the left, concentric circles at the left for third-angle**. Keep that source orientation. First-angle uses the same frustum and circles at the right. These are illustrative worksheet dimensions, not dimensions prescribed by the source.

Use the Drawing polyline, circle, line and note controls. Coordinates below are paper mm, Y increasing down. An optional separate A3 companion worksheet avoids guessing free space in an existing pack. Put title/source notes atX35/Y25 and symbol labels atX35/Y60 andY125.

**Q9 third-angle**, center axisY90:

- Closed frustum polyline `(75,84) → (95,78) → (95,102) → (75,96) → close`.
- Two concentric circles center `(55,90)`, radii12 and6.
- Horizontal centerline `(39,90) → (100,90)` and vertical centerline `(55,74) → (55,106)`; select a center/chain line style if provided by the actual Drawing UI.
- Note: `Q9 - THIRD-ANGLE PROJECTION` and `Source frustum: large end right; end view left.`

**Q10 first-angle**, center axisY155:

- Closed frustum `(45,149) → (65,143) → (65,167) → (45,161) → close`.
- Concentric circles center `(85,155)`, radii12 and6.
- Horizontal centerline `(40,155) → (101,155)` and vertical centerline `(85,139) → (85,171)`.
- Note: `Q10 - FIRST-ANGLE PROJECTION` and `Same frustum orientation; end view right.`

Each symbol has5 drawing primitives: one closed polyline, two circles, two centerlines. Together10 primitives, zero CAD geometry. Do not mirror both the cone and circle arrangement: changing both can accidentally preserve the same convention. A source-label note alone does not close these two drawing prompts.

## Chapter3 Q14: native paper hole-symbol outlines

PDF174 asks for Counterbore and Countersunk symbols. Author visible outlines using ordinary Drawing polylines; use these illustrative dimensions, without creating solids or Hole Wizard features.

- Counterbore: open U polyline `(45,209) → (45,219) → (59,219) → (59,209)`; note atX35/Y195 `Q14 - COUNTERBORE`. Keep the top open and bottom horizontal.
- Countersink: open V polyline `(90,209) → (97,219) → (104,209)`; note atX80/Y195 `Q14 - COUNTERSINK`. Keep the top open; the two diagonals meet at the lower point.
- Explanation note X35/Y235: `Counterbore: flat-bottom enlarged recess. Countersink: conical enlarged mouth.`

These can share the projection companion sheet above: all symbols fit above the titleblock and remain separated. Total12 diagram primitives, two required projection symbols and two required hole outlines. Export the actual browser worksheet and inspect both SVG paths and PNG; verify symbol directions, open endpoints, circles and centerlines before accepting. A standalone companion may reference the original chapter packs, without claiming that those packs themselves already contained the graphics.
