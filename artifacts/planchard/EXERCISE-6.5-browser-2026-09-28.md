# Exercise 6.5 — fresh browser construction

Source: PDF page 305 (printed 6-37), visually inspected at full resolution and
in a larger figure crop before construction. New blank desktop Chrome dark-theme
tab 761; no old geometry reused. All profile creation, dimensions, construction
geometry, features, material assignment, Save/reopen and exports used visible UI.

## Dimension interpretation

- A = 3.00 in total width; B = 1.00 in central cut and right side land, leaving
  three equal width thirds.
- Depth 2.00 in, height 2.00 in, front ledge thickness .50 in. The raised-foot
  intersection lies .50 in from the front and .50 in above the bottom.
- Rear top flat land is 1.00 in deep. The middle removal is a triangular wedge:
  its floor rises from the raised-foot origin to the rear top edge. At depth
  1.00 in, floor height is 1.00 in, matching the printed vertical callout.
- This ramp interpretation is derived from the isometric diagonal and the
  two-feature requirement; the print does not explicitly name the cut shape.

The sketch origin is at the raised-foot intersection on the right side, as in
the book. Right-plane (depth,height) coordinates relative to it, in inches:
base `(0,0),(-.5,0),(-.5,-.5),(1.5,-.5),(1.5,1.5),(.5,1.5)`;
cut triangle `(0,0),(1.5,1.5),(.5,1.5)`.

## Browser history and checks

- Six base edges plus a real horizontal construction centreline, fixed origin,
  horizontal/vertical relations and dimensions. Closing diagonal is reference.
- Base Boss: Blind 3.000 in, Reverse normal, from right-side X=0 to X=−3 in.
- Triangle sketch: origin fixed, top horizontal, three driving side lengths;
  duplicated closing endpoint merged. Both sketches show fully defined, 0 DOF.
- Cut: Blind 1.000 in, Reverse normal, start offset +1.000 in along that pull,
  cutting X=−1 to −2 in. Exactly two features/four history steps/one solid.
- Custom 6061 Alloy density matches printed .097 lb/in³ exactly:
  2.684950756889702 g/cm³. Density reference stored through Engineering material
  data; strength/treatment properties remain unspecified.
- Exact Chrome Mass props: 7.875000 in³ = 129.048129 cm³; .7638750 lb =
  .3464878716 kg; COM `(−1.5,.3095238,.7460317)` in. This agrees independently
  with base 8.625 minus .75 cubic inches for the central wedge.
- Save then library reopen retained all four steps, both fully defined sketches,
  book material density, exact mass and clean Save state. Visible Export STEP
  succeeded (36,478 bytes); browser Project bundle downloaded unchanged.

## Concrete app repair

The history compiler previously applied reverse extrusion start offsets toward
positive normal. The UI correctly stored this cut as −1→−2 in but the compiler
lowered it to +1→0, missing the body and reporting the uncut base volume.
`js/core/kernel_feature_adapter.js` now applies the pull direction to start
offset and symmetric endpoints. Focused regression covers forward/reverse,
upstream depth change, symmetric direction and measured extent preservation,
plus actual exact wedge subtraction and one-solid export validation.
18 focused extrusion tests and `npm run check` pass. Full CI is not claimed.

Artifacts: final `.mforge`, `.step`, model PNG, mass PNG and save/reopen PNG.
The earlier `EXERCISE-6.5-pre-acceptance-browser-2026-09-28.mforge` preserves the
diagnostic checkpoint; its mesh predates the offset fix and is not the accepted
geometry. No engineering drawing is claimed for this model-only exercise.
The ebook reconstruction remains incomplete.
