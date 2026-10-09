# Advanced3: remaining source datums and chamfer scope

Read-only investigation of actual protected `ADVANCED-Q3-source-repair-checkpoint-browser-2026-10-09.mforge`. No model geometry, app source or ADVANCE changed. Official source original and validated block extraction are those recorded in `remaining-official-source-gaps-2026-10-09.md`. Durable exact observations are in `artifacts/planchard/ADVANCED-Q3-final-source-differences-2026-10-09.json`.

## Confirmed rear-relief location difference

The actual repaired checkpoint still has Front sketch `sk_5i9v0`, circle centre point2055=(U45,V52)mm. Official Sketch7 typed loci give centre(Xs0,Y52), arc endpoints(±20.3960780544,Y30), R30. Source native circles independently give centres(0,±52,Z−50/−45), radius30, axis±Z. Thus the required app centre is **(U55,V52)** under the already established map Xapp=Xs+55 and Zapp=Zs+50.

Change the circle's U45→55 through its existing coordinate/constraint controls, retainingV52/R30 and the original rear-wall cut scope. The existing TopY0 mirror should carry the corresponding lower relief. This is an equal-volume feature-station correction except for any actual overlapping-cut interactions; it is source-derived, not a change selected to fit COM. It explains why the small62.5mm³ volume difference cannot by itself account for the reported XCOM shift: a missing prism within the part cannot have the distant centroid that that shift would require.

## Source supports two mouth chamfer edges

Protected Chamfer1 currently stores one native edge reference, the lower fork lip at app(2.5,0,50), distance5mm/45°. It removes one triangular prism of cross-section5×5/2 over5mm wall width,62.5mm³.

The official native source contains two distinct non-axis-aligned45° plane records:

|Plane|Source record/geometry|Equivalent app section|Interpretation|
|---|---|---|---|
|Lower|attr40/ordinal955 at(−50,−5,0), normal(0,+√.5,+√.5)|Y+Zapp=45|Lower fork lipY0/Zapp50 becomes endpointsY−5/Z50 andY0/Z45.|
|Upper|attr8/ordinal976 at(55.001,12,−5), normal(0,−√.5,+√.5)|Zapp−Y=33|Upper fork lipY12/Zapp50 becomes endpointsY17/Z50 andY12/Z45.|

Each plane has zero X normal; its stored Xorigin is an arbitrary in-plane station and does not independently establish which wall owns the trimmed face. In particular, the upper plane's55.001X does not alone prove a right-arm chamfer. The source fork boundary0..12 and its left wallX−55..−50 give the matching source-supported mouth-lip interpretation.

The typed `Chamfer_c` producer is present immediately before UTF16 `Chamfer1` at byte78726 in ResolvedFeatures. Its payload has **two** repeated selection-reference records at79404 and79548, each starting `9b822d80020000000000006b0000006b000000`, with external entity tokens0x053B/0x0532. This independently corroborates two selected references. The external entity/live FACE ownership schema has not been fully decoded, so this report does not claim a complete formal topology binding from binary IDs.

The narrow source-supported next browser action is to refresh upstream native edges and add the **upper fork mouth edge app(2.5,12,50)** to the existing Chamfer1 while retaining the lower edge and5mm/45°. Both left-wall mouth edges should be bounded by X0..5. If source edge availability or exact native shape disagrees, preserve the failed diagnostic and stop that local change rather than silently selecting another edge.

The added source-plane triangle independently has the same62.5mm³ volume as the current lower triangle. Agreement with the reported remaining volume residual is corroborating output, not the reason for selecting its5mm dimension or its edge. The rear-relief centre likewise comes from named source sketch/native axes, not the target COM.

## Verification still needed

Actual Chrome actions remain parent-owned. After the two source-derived changes, verify one valid native solid, exact upstream references, fully defined circle and unchanged slot/fork constraints. Check output against source native volume49701.13mm³, density2.7, mass134.19g and embedded reporting-frameCOM(−53.20,−.27,−15.54), retaining the bold printedX−53.30 discrepancy. The source default physical cachedCOM is(1.802,−.267,−35.536); its app-frame equivalent is(56.802,−.267,14.464), within cache rounding precision.

Matching those checks would not replace visible driving/Undo/cold/STEP acceptance. No claim of new browser geometry or a post-change native result is made in this report.
