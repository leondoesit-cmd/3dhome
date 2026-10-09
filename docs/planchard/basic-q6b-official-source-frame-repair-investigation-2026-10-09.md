# Basic Q6B — official source geometry and frame investigation

Read-only authored input: CSWA-Q6B-source-led-repaired-browser-2026-09-30.mforge. Original publisher container was already CRC-verified/extracted under scratch/planchard/official-basic-q6b-container; source analytic observations under official-basic-q6b-partition-inspection. No authored bundle or browser geometry was modified. Disposable native clones verified the coordinates below.

## Source and original residual

Source Sketch1 length140 has X−70..70mm. Protected browser geometry has X−65..75mm: its base and all explicit R10/R30 contour coordinates are shifted+5mm. Source nominal1060 density2.7 is independently recorded in LWDATA, while the old browser preset is2.6987907092. Source CoordinateSystem1 origin70,0,20mm is absent from the old browser bundle.

The old browser native V=115724.84917772402mm³; one valid solid. Its 0.875% residual was historically disclosed within the book's1% scoring note. Native independent replay preserves that historical observation in scratch/planchard/q6b-current-native-source-comparison.txt.

Source XML explicitly retains R10/R30 profile arcs, Sketch4R5, and later general R7 fillets. There is no evidence for changing the explicit contour arcs toR7. Current source-followed pocket has2mm inset and10.5mm depth (floorZ9.5), consistent with source analytic records. These dimensions must not be altered to fit the answer.

## Concrete generic defect and fix

updateTrimmedBoundarySketch intentionally computes copied curves in the authored local frame so manual closure coordinates retain their meaning. alignExtrusionToSupport then recentred that frame from X.25cm toX.85cm without compensating the copied UV coordinates. Native R32/R8 pocket axes translated+6mm relative to their source R30/R10 axes, although raw saved copied curves were correct.

The fix derives preserveSupportOrigin only for associative boundary-copy sketches. Support alignment projects the authored origin onto the updated support plane, including the stated support offset, and preserves its in-plane location. Manual unlinked bounds-relative sketches keep their existing anchoring. Full copied boundaries still own their exact regenerated coordinates/frame. The trimmed native cache revision is2, so cached old solids cannot silently bypass the repair.

Files: js/cad_feature_tree.js, js/core/kernel_feature_adapter.js. Tests: new associative_support_frame.test.mjs and strengthened trimmed_boundary_native.test.mjs. The native test requires copied R32 and source R30 cylinder axes to remain concentric after a real upstream length/fillet edit. Unit tests cover support normal/offset following, original UV preservation, ordinary manual anchoring, and detached copies.

24 focused tests pass, including cache-revision coverage for full and trimmed associative copies, and exclusion of unlinked profiles. In addition to trimmed revision2, associativeSupportFrameRevision1 invalidates every associative framed extrusion affected by the changed support contract. Source gates pass: no free identifiers,654 module links,1489 source assertions. Actual parent Chrome reproduction/publishing remains separate.

Without changing any authored coordinates, corrected native V=114722.59266986744mm³. Evidence: BASIC-Q6B-associative-frame-origin-disposable-native-audit-2026-10-09.json.

## Finite source-led browser repair coordinates

The source Sketch10 left pocket wall is X−23.005385127675076mm with arc intersectionY19.117665463612756mm. The old current wall is source-aligned X−23.0000000000mm. Editing X alone leaves the old fixed intersectionY inconsistent; the diagnostic failed native sketch is preserved as BASIC-Q6B-source-exact-manual-wall-disposable-audit-2026-10-09.json.

For the old protected pocket frame origin(2.5,22.5,20)mm, before global translation:

|Point|LocalXmm|LocalYmm|
|---|---:|---:|
|1682, bottom manual wall|−20.505385127675075|−20.5|
|1660, wall/arc intersection|−20.505385127675075|−3.382334536387244|

Source drilled axes are independently measured by their X−Y coordinate, avoiding arbitrary axial cylinder origins: centrehole−67.88225099390857mm; pairedholes−49.51107792303473mm, Z±7.5mm. At the current native hole frame origin(−27.8066443531398,30.30125922546395,0)mm, U=(.70710678,−.70710678,0), V=(0,0,−1), the source-aligned coordinates before globalX−5mm translation are:

|Point|LocalUmm|LocalVmm|
|---|---:|---:|
|1745|−3.375973433102504|0|
|1749|9.61440762366408|+7.5|
|1753|9.61440762366408|−7.5|

Parent must verify these frames after cold opening before typing coordinates. Preserve Ø4/25mm holes,2mm inset,10.5mm pocket depth,R10/R30 contour and generalR7. Then physical translationX−5mm aligns the centred source geometry; source reporting frame70,0,20mm is a separate explicit coordinate system.

## Independent disposable verification and remaining qualification

Corrected wall plus source hole axes produce one successful native reconstruction with V=114721.62484464101mm³. After physicalX−5mm alignment, COM=(−16.24777833496433,15.506081573889832,−2.6658353570419595)mm, rounding exactly to official cached(−16.248,15.506,−2.666). At independent source density2.7, mass309.7483870805307g rounds to printed309.75g.

Printed volume114721.22mm³ still differs by+.40484464101mm³, approximately0.000353%. This tiny remaining geometric/source precision difference is not resolved by the partial analytic reader and is not an exact source BREP equality claim. The official cache Y15.506 differs from the printed Y15.44 noted in the historical report; keep companion and printed evidence distinct.

Evidence: BASIC-Q6B-source-exact-manual-wall-intersection-disposable-audit-2026-10-09.json; BASIC-Q6B-source-hole-axis-wall-disposable-audit-2026-10-09.json. These contain verification-only derived inputs, no authored output geometry.

## Visible translation and coordinate-system steps

After source point repairs, finish the sketches and rebuild. Verify the pocket sketch frame origin(2.5,22.5,20)mm and hole native frame origin(−27.8066443531398,30.30125922546395,0)mm; these coordinates are specific to the protected old document. The U/V directions above are part of the verification, rather than arbitrary positions inferred from a screenshot.

Select the final native solid, open **Move / Copy Body**, set X offset−5mm, Y/Z0, Angle0, and clear **Leave a copy behind**. Apply normally. The visible handler creates an ordinary moveBody feature referring to the current final feature; this is a disclosed physical source-origin alignment, not a bundle rewrite. Verify new boundsX−70..70mm and unchanged volume/mass.

Open **Coordinate System**, name it **Q6B Coordinate System1 — official source**, type originX70/Y0/Z20mm, leave all Reverse axes unchecked, and Apply. In Mass properties select this named frame to obtain the reporting-frame COM: source-aligned globalCOM minus(70,0,20), approximately(−86.2477783,15.5060816,−22.6658354)mm. Default/world selection should retain(−16.2477783,15.5060816,−2.6658354)mm. Cold-reopen proof must check both the feature translation and named-frame persistence.
