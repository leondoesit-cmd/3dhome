# Advanced Q6/Q6A — browser source preparation

Source cursor: PDF511/printed10-31 (dimensioned top/front/right views), then PDF512/printed10-32 (isometric, answers and Q6A vertex). Read-only source review; no model geometry or browser operation was performed. Repository filename/doc search found no task-fresh **Advanced** Q6 checkpoint. Existing `CSWA-Q6*` bundles belong to Basic/intermediate PDF501–503 and must not be reused for this question.

The existing September30 audit and October9 continuation queue correctly leave this question pending. This audit resolves several witness associations, but does **not** claim a completely resolved solid recipe. In particular, exact left S-profile join placement and the full vertical-waist cut scope require another independent drawing trace before feature commits. Printed mass/COM are not used to choose dimensions.

## Confirmed witness associations

For discussion use L horizontally from the left/back end to the right/open end in the front/top views, H vertically from bottom to top, and T across the top/right view. These are drawing coordinates, not a claim about the supplied CAD file's default origin.

|Witness|Source meaning|
|---|---|
|Front overall100 /150; top overall100|Envelope L100 × H150 × T100mm.|
|Front70 and60|70 runs from the outer L0 end to the visible L70 vertical wall;60 runs from the inner L10 witness to that same L70 wall. They are distinct references and imply a10mm back-end band.|
|Front22.50|From the hidden U-return rear extremum L47.5 to the L70 return centre/end-wall witness. It agrees with the top-slot45 width/R22.5 return. It is not the taper run or a new wall setback.|
|Top30|Slot return centre at L70,30mm from the open L100 end. Slot mouth45mm wide, illustrated centred transversely. A semicircular return gives R22.5 and rear extremum L47.5.|
|Front opening100 and lower25|Vertical middle span H25→125; total height150 leaves25mm at both cap ends. The25/100/150 dimensions establish those heights.|
|Front10 TYP|At the tip, cap edge is H10/H140; taper links tip L100 to wall L70 at H25/H125. Horizontal run30 and rise15 are separate from the45° chamfers.|
|Right10 and45°TYP|Four outer cap corners across T at the top and bottom. The drawing gives10mm horizontal setback and10mm vertical fall; use10×45° on those shown corner edges. Do not apply45° to the30-by15 front tapers or every edge.|
|Top10 TYP and60|Left S-profile endpoint ledges are10mm inward from the inner chamfer lines, hence T20/T80 in a T0→100 convention. Their separation is60mm.|
|Top5|S-profile endpoint ledges extend5mm from the outer L0 back edge. The dashed L10 band is separate.|
|TopR30 TYP|Leader points to the upper arc of the left S-profile. Lower arc has opposite curvature. It does not label the right U-slot.|

The top-view horizontal60 witness also uses the L10 inner reference to the L70 slot centre; do not mistake it for the full L envelope. The S-profile is not symmetric under reflection about the transverse centre plane, consistent with the explicit warning that the part is not symmetric about Front Plane.

## S-profile candidate, not a verified join dimension

The two endpoint ledges can be located at(L5,T20) and(L5,T80). A plausible smooth equal-R30 pair joins at(L5,T50), with opposite curvature. For this **additional midpoint assumption**, circle centres are approximately(L30.9807621135332,T35) and(L−20.9807621135332,T65); maximum/minimum L are approximately9.01923788646684 and0.98076211353316. These numbers follow radius/chord geometry, not answer mass.

The print does not dimension the arc join or mark a midpoint/symmetry relation. Equal radius, two fixed end ledges and a G1 join do not alone justify freezing that midpoint. Keep this candidate labelled; obtain an independent trace or companion dimension information before calling it the exact book profile. Do not replace it with a single R30 scallop or a spline adjusted to volume.

## Proposed browser workflow and gates

1. Start a new blank part. Set MMGS and two decimal places; retain editable sketches/features. Choose and record a consistent L/H/T frame without fitting the printed default COM. A Front sketch can carry L/H; Top can carry L/T.
2. Author the dimensioned front cap/taper envelope using overall100×150, wall/end references70/60, H25→125 central span and H10/H140 tip references. Fully constrain its points and lines before extrusion. The verified transverse envelope is100mm. **Before committing a final complete solid, trace whether the central-waist relief is full-depth or leaves the internal back band/side wall shown by the hidden lines and isometric.** Merely extruding the visible outer C silhouette is not established as the complete part.
3. On the appropriate Top/cap faces, author the U-opening with45mm width, centre L70, R22.5 return and open end L100. The boundary coordinates are independently authorable; confirm its height/depth scope against both caps and vertical waist rather than choosing Through all merely because it is convenient.
4. After independent S-join confirmation, author the left R30 pair and5mm endpoint ledges on the Top profile, with10/60 transverse witnesses. Use two real arcs, shared endpoint and tangent relation, not a visual spline; fully define source-backed point/centre dimensions. Confirm its vertical cut scope from all three views.
5. Apply only the four shown10×45° outer transverse cap corner chamfers. A deliberate front/taper edge pick and right-view check must precede Apply. Audit cap heights25 and remaining tip thickness10 afterward.
6. Assign the catalog's **Plain Carbon Steel (grade unspecified)** reference, which currently uses7.85g/cm³ with an Alleima20C representative-density source (`js/cad_appearances.js`). The book says Plain Carbon Steel but prints rounded density0.01g/mm³ in its answer screenshot; it does not establish the same precise catalog density. Disclose the app reference and do not adjust density to force4079.32g. Separate geometry volume acceptance from material-reference mass comparison.
7. Native rebuild must yield one valid solid without unresolved diagnostics. Save/cold reopen, STEP and an upstream driving edit/Undo are needed. Only then compare printed volume522989.22mm³, mass4079.32g and default COM(35.91,0,0.70)mm. A mismatch prompts source/profile/frame review, not numerical fitting.
8. Q6A is a derived coordinate-system workflow on the completed same fresh part. Select the actual illustrated **back-right-bottom vertex**, then orient a right-handed triad from physical model edges/datum directions and use Evaluate → Mass properties → Report coordinate values relative to. Do not select an artificial point inferred from answer coordinates. Printed relative COM is(−64.09,75.00,40.70)mm. Preserve the geometry/material and prove Save/reopen of the named coordinate system.

The drawing's default origin is not visibly marked on PDF511. A chosen authoring origin may therefore need a separately justified reporting frame; do not claim the printed default-origin COM merely because the new Q6A frame is correct. The10mm chamfer means “back-right-bottom vertex” must be picked on the actual chamfered cap, not an erased pre-chamfer stock corner.

## Evidence paths and unresolved cursor

- Existing source audit: `docs/planchard/advanced-q5-q6-source-audit-2026-09-30.md`.
- Existing next queue: `docs/planchard/remaining-book-next-browser-leg-2026-10-09.md`.
- Full source pages: `scratch/planchard/advanced-source-audit-511.png`, `advanced-source-audit-512.png`.
- Newly rendered original-PDF600dpi crops: `scratch/planchard/advanced-q6-top-witnesses-2026-10-09.png`, `advanced-q6-plan-front-witnesses-2026-10-09.png`, `advanced-q6-right-witnesses-2026-10-09.png`.
- Extracted page text/labels: `scratch/planchard/book.txt`, PDF511–512 separators.

Next source cursor remains **PDF511 top S-profile plus front/right hidden-line scope**, not Q6A answers. Resolve these before a complete Q6 construction is claimed. This audit creates no imported/reused model, performs no mass fitting and does not change ADVANCE or source code.
