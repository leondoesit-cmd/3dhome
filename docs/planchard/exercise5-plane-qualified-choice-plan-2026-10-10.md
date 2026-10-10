# Exercises5.1–5.5: justified plane choices for a reconstruction

SourcePDF258/5-40 and259/5-41 re-inspected, including6× rendered figure details `scratch/planchard/plane52-source-detail.png`, `plane53-source-detail.png`, and `plane54-source-detail.png`. This qualifies the earlier unresolved-source report by supplying **our informed modeling choices**, not recovering undocumented publisher feature-tree plane IDs or an official key. The printed questions ask to identify a Boss-Extrude1 sketch plane, consider the marked origin, and simplify features. These choices answer that design intent under the following explicit convention.

## Convention and choices

Use vertical **Y**; **X** is the width direction drawn down-right; **Z** is the depth direction drawn up-right. Front is the X-Y vertical plane, Right is the Y-Z vertical plane, and Top is X-Z horizontal. The marked origin remains the shown material-corner/intersection datum; it is not itself proof of a selected sketch plane. Front/Right lettering depends on this declared model orientation. No dimensions are supplied for5.1–5.4, so no nominal lengths or manufactured tolerance are invented.

|Exercise|Our answer|Extrusion axis and economical feature strategy|
|---|---|---|
|5.1|**A — Top Plane**|Draw the entire T-shaped horizontal footprint on X-Z, extrude along Y to the uniform height. One Boss includes both branches; separate rectangular bosses are unnecessary.|
|5.2|**B — Front Plane**|Draw the complete H-like upright X-Y section: central upper notch, central lower opening, side posts and outward feet. Extrude along Z through the common depth. The two apparent upright walls are front/back copies of this same section, joined by the central horizontal web. A single closed profile includes the notches and feet; no separate notch cuts or post bosses are needed.|
|5.3|**B — Front Plane**|Draw the near dark three-level stair section in X-Y; extrude along Z through its width/depth. One Boss includes all three stair heights. The front corner plan-notch changes the section along Z and is therefore a separate rectangular Through-All Cut from Top, stopping only through the low tier geometrically. Economical strategy: one Boss plus one Cut; an unnotched one-feature stair alone does not reproduce the figure.|
|5.4|**C — Right Plane**|Draw the stepped Y-Z section at the left return, including the thin base, low front lip and high rear wall, then extrude along X across the full width. Cut away the low front-lip volume over the interior width, preserving the left return and rear-wall strip; cut the high rear wall down at the right end. This is an economical three-feature strategy: one profile Boss and two rectangular depth-limited Cuts. It preserves the stepped left return in the initial section. No single uniform-profile extrusion captures all width/depth changes in this figure. Front can also be defensible with a different three-feature order; C is our chosen construction, not a proven unique official answer.|
|5.5|**C — Aluminum Alloys**|6061 belongs to Aluminum Alloys; this material-category answer is independent of orientation.|

### Independent geometry check for5.4

The6× source image shows a rectangular base, a rear raised strip, a raised left return forming an L-shaped upper footprint, a lowered front-left step, and a lowered right end of the rear strip. These changes occur along both horizontal directions. A Right-profile Boss captures the base/left-step/rear-height section at once. The first Cut removes the interior front area down to the base while leaving the left-width strip; the second lowers the rear strip at the right end. Starting instead from only a rectangle loses the useful profile and requires more additive steps. Feature quantities here are a reasoned feasible strategy, not a recovered source history or formally exhaustive global minimum proof.

## Exact ready-for-browser worksheet notes

Six native notes, font2.5mm, pitch3.5mm, x35mm, header y25mm and answer notes starting y60mm. Start successive notes after their row count*3.5mm plus6mm; all fit in one A3 column beforey190mm. Keep the source qualification visible in the header and5.4 note. No additional solids are required by these multiple-choice plane/material questions.

```text
EXERCISES 5.1-5.5 - QUALIFIED DESIGN CHOICES
Source: PDF258-259 / pages5-40 and5-41.
Convention: Y up; X width; Z depth.
Front=X-Y, Right=Y-Z, Top=X-Z; not an official answer key.
```

```text
5.1 - A: TOP PLANE
Sketch the full horizontal T footprint; extrude vertically along Y.
One Boss includes both branches at the same height.
```

```text
5.2 - B: FRONT PLANE
Sketch the complete upright H-like section, posts and feet in X-Y.
Extrude along Z; upper and lower notches belong to the profile.
One Boss gives the repeated front/back section and joining web.
```

```text
5.3 - B: FRONT PLANE
Sketch all three stair heights in the near X-Y section; extrude Z.
Add a Top-plane rectangular Cut for the low-tier plan notch.
One Boss plus one Cut; an unnotched stair alone is incomplete.
```

```text
5.4 - C: RIGHT PLANE - OUR CONSTRUCTION CHOICE
Sketch the Y-Z base, low front step and high rear wall; extrude X.
Cut the interior front area to the base, preserving the left return.
Lower the rear wall at the right end with a second Cut.
Three features; a different Front-plane order can also be valid.
```

```text
5.5 - C: ALUMINUM ALLOYS
6061 is an aluminum alloy in the source's material categories.
```

Row counts are4/3/4/4/5/2 =22 LF rows. Recommended answer y positions60,76.5,96.5,116.5,140mm (end147mm). The Header is separate at25mm. Preserve ASCII text exactly to make content audit finite; source images independently document the shape observations. Browser qualification/cold persistence remains parent work. This plan closes the unanswered *design-choice* scope when actually authored and verified; it does not claim original publisher part-tree evidence.
