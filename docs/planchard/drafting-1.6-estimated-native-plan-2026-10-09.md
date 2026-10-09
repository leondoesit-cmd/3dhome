# Exercise 1.6 estimated native browser plan

Read-only visual source: lower figure in `scratch/planchard/drafting-exercise-082.png`, PDF82 / printed1-54. It shows a low horizontal base, a raised full-width block at its rear, and an open rectangular fork/notch in the forward base. The notch is an opening to an outside edge, not a closed through-hole or blind pocket. No rounded edges or circular holes are indicated. The source asks the reader to estimate dimensions and draw three views; it supplies no Front arrow, dimensions or authoritative source solid.

Choose Front looking from the open fork end toward the raised rear block. Define world X across width, Y vertically upward, Z toward the rear; the front end is Z0. This convention must be written on the worksheet. It is an explicit interpretation of the undimensioned illustration, not proof of the publisher's original coordinate frame. The source grid behind an isometric is not an orthographic dimension ruler. Visually the horizontal footprint is longer than wide, overall height is about three base thicknesses, and rear block depth and notch length are each roughly a third of overall depth. These are approximate projected proportions, not measured physical grid counts.

A defensible clean instructional choice is W30, depth50, overallH30, base thickness10, rear block depth15, centered front notch width10/depth15, all **illustrative mm**. This corresponds to chosen10mm intervals W3/depth5/H3/base1/rear1.5/notch1×1.5; these interval counts are chosen for browser readability and internal consistency, not source-certified counts. There is no dimensioned source target, companion native equivalence, mass target or material assignment.

Finite generic browser recipe, authored from blank only by actual UI:

1. Base: Top rectangle X0..30/Z0..50 (map Z sign to current Top sketch axes explicitly), fully define30×50 and corner location; Boss10 in +Y. Native one box, boundsX0..30/Y0..10/Z0..50.
2. Raised rear: Top plane offsetY10, rectangleX0..30/Z35..50, fully define30×15/location; Boss20 +Y, joined to base. Bounds remainX0..30/Z0..50; topY30. Do not create a detached overlapping body.
3. Open fork: Top plane offsetY10, rectangleX10..20/Z0..15, fully define10×15/location; Cut10 in −Y, or ThroughAll downward. Because one edge lies on outsideZ0, the cut opens the front end and passes entirely through base; it leaves two10-wide forward prongs. Use exact edge coincidence; do not leave a thin accidental bridge or extend cut into rear blockZ35..50.

This three-feature route preserves meaningful editable dimensions and produces one connected native solid. It is preferable to separately positioned boxes for illustrating parametric operations. The independent analytic validation **plan**, not an authored model or acceptance result, is V=30×50×10+30×15×20−10×15×10=22500mm3, bounds30×30×50mm, one connected solid, central notch wallsX10/20 with floor absent. A future disposable audit may check these invariants against actual browser exports; no script-generated final model is supplied here.

Under the declared Front direction, orthographic plan:

| View | Visible geometry | Hidden geometry |
|---|---|---|
| Front (width×height) | Outer30×30 rectangle; horizontal base/top-of-prong lineY10; vertical notch boundariesX10/20 fromY0..10. The rear block behind the open notch fills its projected background, so the overall Front silhouette remains rectangular. | No extra hole pair or bore centerline. |
| Top (width×depth) | U-shaped base perimeter: frontprongsX0..10 and20..30 overZ0..15, notch back edgeZ15 betweenX10..20; full rear footprint, rear block front edgeZ35 acrossX0..30. | None required for these fully visible upward-facing boundaries. |
| Right (depth×height) | Stepped outline: baseZ0..50/Y0..10 and rearblockZ35..50/Y10..30. | Notch rear wall atZ15 can be a short hidden vertical edgeY0..10, since the side prong occludes it. Front notch sidewall edges overlap external/base projected lines and need no invented internal pair. |

Top is the most informative about the fork opening and rear-block station; Right is most informative about height/step. If asked to select one overall, choose Top with this qualification rather than assert an unprovided source Front direction. A worksheet note should say: `Estimated instructional reconstruction of Exercise1.6; Front chosen from open-fork end. Dimensions are illustrative, not publisher manufacturing data.` Physical fit/strength/material and exact source geometry remain unclaimed.
