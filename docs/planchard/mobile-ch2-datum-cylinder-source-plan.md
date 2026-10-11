# Three datum-oriented cylinders — native mobile source plan

Original lower illustration printed2-14/PDF100, `scratch/planchard/mobile-source-100.png`. Original-PDF detail renders: `mobile-datum-source-100-crop.png` and `mobile-datum-source-100-right-label.png`. The three source captions are **Top Plane (left), Front Plane (middle), Right Plane (right)**. The angled right caption is Right Plane, not another Top Plane. All three include an Origin arrow at the selected end/sketch plane. The surrounding text explicitly discusses three default planes and says the chosen base-sketch plane determines part/drawing/assembly orientation.

## Source geometry and qualifications

The illustrations resemble long hollow cylindrical/prismatic parts: circular inner openings are visible, and multiple longitudinal outer edges show a faceted perimeter. The image is small, wireframe-like, and undimensioned. It does not specify outer facet count, wall thickness, length, material, or a manufacturing specification. Do not silently turn longitudinal wireframe edges into exact publisher polygon dimensions.

For a useful native reconstruction, choose an explicitly illustrative **eight-sided outer profile with concentric circular bore**, extruded normal to the selected datum. Outer circumradius10mm, bore radius6mm, length40mm are convenient example values only. An outer circle instead may be used to demonstrate cylindrical orientation, but disclose that its smooth exterior simplifies the faceted-looking source. Three parts must share the same illustrative section/length so the changed base plane is the tested variable.

## Human native-touch workflow — one separate document per orientation

1. From a clean native Part, choose the actual named default sketch plane through the visible plane picker/tree. Do not copy/import a previous desktop or mobile authored model. Select **Top**, then repeat independently for **Front** and **Right**.
2. Orient normal to the selected sketch and pinch/pan until the Origin and profile occupy a comfortable phone area. Touch the actual intended origin-centered outer profile. If regular Polygon is used, set sides8 through its visible native form and place center/radius by actual touch; use clear symmetric snap/axis guides. Draw the concentric bore circle at the same actual origin. If circular outer contour is chosen, touch two concentric circles.
3. Apply native relations/dimensions only as ordinary CAD design controls, not per-endpoint placeholder correction: center coincidence to Origin, outer size, bore diameter and polygon orientation as needed. Check the native sketch DOF/closed profile display. An annular profile must exclude the inner circle: confirm the shaded selected region is the wall, not the full outer disc.
4. Finish sketch; use native Boss/Extrude. Set a visible illustrative depth40mm using the normal feature parameter field. Inspect actual preview and native axis/bounds before Apply. Use the normal/reverse choice that extrudes from the source's highlighted end-plane outward, but don't infer sign from the screenshot alone.
5. Native isometric should show the selected datum at the originating end, the inner opening, and a long axis perpendicular to that plane. Enable actual datum display/Origin display if supported. If only a paper note labels the plane, qualify that the datum overlay itself was not witnessed.
6. Save separately as MOBILE Ch2 Top/Front/Right Datum Cylinder, with a description stating illustrative profile/units and inferred facet count. Export native model/STEP if available, generated isometric evidence and actual phone screenshot; cold library reopen and rebuild each. No publisher mass target.

## App-axis verification gates

Read-only current app code names Top as **X·Z**, Front as **X·Y**, Right as **Z·Y** (`js/modeler.js` toolbar labels and `planeAxis`). These establish an expected mapping only; parent must verify visible UI/preview/native bounds during actual touch authorship. Do not transplant SOLIDWORKS screenshot coordinates or assume its camera orientation equals this app.

| Source datum | Expected app plane span | Expected extrusion long axis | Native acceptance |
|---|---|---|---|
| Top |X,Z|Y|Visible Top selection, profile at Origin, longYdimension|
| Front |X,Y|Z|Visible Front selection, profile at Origin, longZdimension|
| Right |Z,Y|X|Visible Right selection, profile at Origin, longXdimension|

For the illustrative circular outer radius10 andlength40, bounds lengths should be20,40,20 forTop;20,20,40 forFront;40,20,20 forRight. Eight-sided profiles can have smaller transverse bounds depending on polygon phase; therefore inspect largest40mm axis and actual section orientation instead of forcing circular bounds onto an octagon. Crosssection topological count should show one outer loop andone innerloop, native feature result one hollow connected body. This is a scope gate, not a claim already verified.

## Scope and next page

Source qualifies plane choice/orientation; these are three distinct native modeling tasks, not another six-view paper exercise. The preceding six-view mobile sheet's explanatory extent arrows may be simplified to labels; do not claim exact full-page replication from that witness. Following source: printed2-15/PDF101 horizontal stepped-shaft Front+Right and vertical stepped-shaft Front+Top examples, distinct from these datum-oriented tubes.
