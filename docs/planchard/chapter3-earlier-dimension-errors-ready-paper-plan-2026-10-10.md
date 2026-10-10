# Earlier Chapter3 dimension errors — source-ready worksheet plan

Read-only actual supplied PDF150–153 / printed3-22–25 inspected, including high-resolution151–153 detail crops. Two sets: **A1–A3** on150–151, **B1–B4** on152–153. No CAD/browser authoring, acceptance, ADVANCE or Git changes.

## Exact reuse

**A1 PDF150 is genuinely identical to accepted homework3.3 PDF176**: same stepped boundary, 2.50/1.75/3.50/.85/.75/.75 labels, missing vertical dimension lines, inside labels, contacting extensions and missing step heights. Both source renders visually compared. Reuse `artifacts/planchard/EXERCISES-3.3-3.4-cold-browser-2026-10-10.{mforge,svg,png}` with its accepted source/geometry/cold audit:33primitives/10notes/30rows. Record source equivalence; do not recreate or remove its homework3.4 companion.

Six others are distinct. **B3 differs from accepted homework3.6**: source6X Ø.19THRU EQSP, two additionalØ.19leaders, overall4.50 and thickness**.09**, versus homework.10 and different callouts. Existing capsule geometry is an illustrative reuse candidate, not an exact source-annotation match.

## Ordinary UI source-faithful graphic recipe

Use one A3 landscape/mm worksheet per remaining activity; zeroCAD parts/features/views. **Insert image** chooses a local source PNG, then edit X35,Y45,Width180 and listed height, preserving aspect. Add native Paper Circles/crossout Paper Lines, plus source/answer/qualification Notes. Recently implemented native image insertion needs actual browser proof if not already accepted. This is an ordinary UI source graphic, not an authored CAD script/import. Crops were rendered read-only from the provided PDF and contain the original deliberately erroneous diagrams.

Files: `scratch/planchard/ch3-earlier-{A2,A3,B1,B2,B3,B4}-source-figure.png`. Each worksheet has one native image and three notes: source header `(240,60)`, answer `(240,85)`, qualification `(240,155)`. Wrap about70–75characters; inspect actual LF rows/readability. Source header: `Chapter3 earlier Dimension Exercises\nSet A/B ExerciseN — SOURCE ERROR DIAGRAM\nSource PDFNNN / printed3-NN\nSource image plus native paper markup\nIllustrative placement; zero CAD`. Qualification: `Original source labels retained deliberately.\nMissing sizes have no invented numeric values.\nRecommendations explained beside the diagram.\nNo corrected manufacturing model claimed.` Replace placeholders before authoring.

For a crossout centre `(x,y)`, draw two native lines `(x−6,y−2)→(x+6,y+2)` and `(x−6,y+2)→(x+6,y−2)`. Native circle positions are illustrative markup mapped from the actual source crop, not publisher keys.

|Activity/source|Image height|Circle `(x,y,r)`|Crossout centres|Native annotation primitives|
|---|---:|---|---|---:|
|A2/150E2|178.13|(134.79,67.38,11.19);(181.42,162.51,13.99);(134.79,204.48,11.19)|none|3circles|
|A3/151E3|139.50|(142.10,138.60,6.30);(158.30,161.55,5.40)|(179,117.90);(115.55,176.40);(66.50,176.40);(158.30,133.65)|2circles+8lines=10|
|B1/152E1|86.49|(133.77,66.04,7.60);(77.08,117.47,8.18)|none|2circles|
|B2/152E2|128.57|(86.73,73.47,11.02);(86.73,142.96,7.96);(185.61,137.45,10.41);(116.43,142.96,6.73)|none|4circles|
|B3/153E3|98.87|(90.77,88.10,9.51);(108.52,72.25,8.24)|(90.77,134.37);(136.41,134.37)|2circles+4lines=6|
|B4/153E4|120.00|(84.18,119.26,5.90);(58.11,141.89,4.92);(72.38,145.33,3.93)|none|3circles|

## Exact ready answer blocks

### A2 — PDF150/3-22 Exercise2

```text
1. 5.50 is inside the thin upper view despite outside space.
Move the overall dimension outside with proper extensions.
2. The lower endpoint of1.50 floats inside the front view.
No feature or marked datum defines that endpoint.
3. Lower notch depth and overall front height are absent.
Do not infer them from apparent drawing proportions.
4. 2.00+1.50+2.00 equals5.50; avoid a closed size chain.
Keep an independent set or mark the total REFERENCE.
```

Circles target inside5.50, floating1.50 endpoint and lower notch. Upper-notch.50 does not automatically size the lower notch. Upper1.00 is part depth, not missing front height. Contacting extensions are additional presentation issues; no exact missing-arrow count is certified.

### A3 — PDF151/3-23 Exercise3

```text
Cross out right-view1.00; retain upper-view1.00.
Cross out lower-right2.00; retain upper-right2.00.
Cross out lower-left2.00: it derives from5.50−1.50−2.00.
Cross out right-view upper.50; retain front upper.50.
This avoids duplicate dimensions and a closed size chain.
Front1.50 still ends without a defined feature/datum.
Move lower-notch.50 to its visible front-view feature.
Use proper extension gaps; avoid hidden-edge dimensions.
```

One defensible **chosen omission set**, as the source asks what YOU would omit. Keep5.50, top-notch1.50 and upper-right2.00. Right lower.50 must be relocated, not deleted without replacement. Floating front1.50 is not an established half-height/symmetry datum. Right-view3.00 is legitimate overall height, although clearer on front outline.

### B1 — PDF152/3-24 Exercise1

```text
1. A full circular bore normally uses a diameter callout.
Source R.625 needs clarification of the intended size.
If R.625 is literal, its equivalent diameter is Ø1.250.
Do not replace it with Ø.625 from drawn proportions.
2. 2.00 length is inside the view despite outside space.
Place it outside with proper extension lines and gaps.
Hidden lines show the bore through the cylinder length.
No different bore diameter is claimed from this image.
```

Source ODØ1.500. Apparent bore/image proportions conflict with literalR.625, but an intentionally erroneous, unscaled sketch cannot prove intendedØ.625. Preserve original label and explain ambiguity; do not author a false corrected solid.

### B2 — PDF152/3-24 Exercise2

```text
1. Ø.50THRU sizes the hole but does not locate its centre.
Add two centre dimensions or explicit symmetry.
2. Notch depth is absent; width derives as2−.60−.60=.80.
Do not infer depth or hole location from apparent centring.
3. Front/right views omit corresponding hidden bore detail.
Add appropriate bore/notch hidden lines and centreline.
4. Right.60 has arrows/text without a proper dimension line.
Use full dimension/extension lines with an offset gap.
```

Source frontheight1.00/upperdepth1.50 already supplied. The two.60 margins describe different sides, not automatically duplicates. Hidden-line termination depends on unspecified notch depth; do not invent an intersection height. Circle the empty right-view region for missing projection detail.

### B3 — PDF153/3-25 Exercise3

```text
1. Nine centres are drawn;6X does not specify the full set.
Use9X Ø.19THRU EQSP if all nine holes are identical.
Cross out the two extraØ.19 leaders as duplicate notes.
2. Nine equal centres spanning4.00 imply pitch.50.
State8SPACES@.50=4.00 for the chosen pattern.
3. 4.50 also follows4.00+2×R.25; mark it REFERENCE.
Use2X R.25 if both ends have that intended radius.
Retain source thickness.09; homework3.6 used.10.
```

6X plus two separate diameter notes still does not unambiguously describe all nine as a common pattern. One9X group is an explicit chosen interpretation, not recovered publisher key. **EQSP is already present**, unlike homework3.6: do not falsely claim no equal-spacing specification. Raster circles appear faceted when enlarged; no hexagonal-centre-hole requirement is established. Both endsR.25 is a stated interpretation when correcting the callout.

### B4 — PDF153/3-25 Exercise4

```text
Move frontØ.88 outside the body for clearer placement.
Provide proper extension offsets at circled contacts.
Left.63 lower arrow/stroke is unclear in the source;
use a complete two-ended dimension rather than guess it.
Top(Ø.88) is a legal REFERENCE duplicate as marked.
.63 body and.12 flange imply overall length.75.
Ø.75 body/Ø.88 flange/Ø.500THRU already size the part.
Do not invent missing sizes or reject the legal REF note.
```

First item is a clear placement recommendation; lower.63 stroke ambiguity expressly qualified. **FrontØ.75 is below the body**, not an inside-label error. .63 runs flange underside→body bottom, so it is body length, not contradictory overall length. Top hiddenØ.75 and front bore hidden lines agree with isometric. All five physical sizes are present. No exact publisher error count or confirmed missing-arrow count is claimed; parent can refine the stroke issue after actual PDF view.

## Acceptance boundary

Actual browser source-image insertion/native markup/save/export and exact Saved cold reopening remain pending. Compare image bytes/aspect, whole Drawing image/primitive/note records, SVG and readable PNG. Source diagram images alone without native circles/crossouts fail the requested output; answer-only notes also do not satisfy the graphics commands. If local image insertion is unavailable, complete its finite browser proof first: manual outline-only diagrams lacking the original erroneous dimension strokes are inadequate. These paper-analysis worksheets imply no native solids, corrected manufacturing accuracy, physical material, or full-book100% completion.
