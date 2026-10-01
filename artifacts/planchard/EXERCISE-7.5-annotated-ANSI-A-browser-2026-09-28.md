# Exercise 7.5 — completed printed measurements in browser drawing

Continues the independent fresh drawing copy created from root's newly browser-authored Exercise 7.5 model. Reference PDF page 372, printed 7-64. Completed through desktop Chrome 2, tab `710849245`, dark app. Earlier tab 219 stopped responding; its prior exports remain protected. A single replacement loaded the actual saved drawing copy through Saved models. No geometry was edited.

## Accepted browser drawing

- ANSI A/Letter landscape, third-angle, inch units, two decimal places, trailing zeros. Stable explicit 1:2 sheet scale; shaded-with-edges Isometric 1:2.5.
- Front, Top, Right and Isometric views. Adjusted view positions through visible drag UI to separate labels; removed redundant overlapping overall dimensions.
- **17 measured dimensions**: 4.00 overall width; 5.50 overall length; 2.25 rear-boss length; 1.75 cavity depth; .38 rib thickness; 2.00 rib pattern spacing; 1.25 hole location from right and 1.00 from front; 1.50 outer rear height above base; .50 floor; two separate .25 side walls; roof **(.25)** reference dimension; rib locations 1.62 and 3.62 from left; 1.00 plateau; 2.70 rib span.
- Linked Hole Wizard **Ø.75 in THRU** callout, title `EXERCISE 7.5`, number `PLANCHARD-7.5`, 6061 Alloy material.
- Saved clean; reopened the actual named library copy. Dimensions, reference format, layout, explicit scale and four views persisted with no unsaved state.
- Actual SVG export **49,639 bytes**; parametric bundle **79,831,150 bytes**. Final screenshot after clean library reopen.

## Concrete app fixes

`js/modeler_drawing.js` now retains the meaningful orientation for axis-aligned dimension picks even when a label is placed beyond an endpoint. Coincident projected picks cannot commit a zero-size dimension. It also permits snaps to real endpoints/midpoints of displayed hidden edges; hidden edges suppressed by sheet/view settings or shaded style stay unavailable. These fixes let the printed rear floor/roof and side-wall dimensions be authored through the drawing UI.

`tests/drawing_linear_placement.test.mjs` plus focused angle/reference tests: **6/6 passing**. `npm run check`: no free identifiers, 583 linked modules, 1498 source assertions green. No full-suite pass claimed.

Read-only independent exact replay of the actual exported document verifies unchanged sketch and feature records, **16 named associative dimensions**, one overall extent dimension, correct printed values, and **zero dangling references** against final-body topology. Verifier: `scratch/planchard/verify-7.5-annotated-drawing.mjs`. Intermediate consumed topology must not be used as the drawing's final-body topology index.

## Limits

All printed measurement values are represented, with additional explicit 2.00 pattern spacing. The book's combined `2X .25` is shown as two separate .25 dimensions. Standard Front/Top/Right and default isometric face the opposite end from the figure's pictorial; this is not a claim of identical page layout or view direction. Insert Model Items still imports only a subset automatically; the remaining values were placed associatively using actual visible/hidden geometry snaps. Whole-book reconstruction remains incomplete.
