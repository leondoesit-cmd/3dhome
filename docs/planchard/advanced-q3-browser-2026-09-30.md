# Advanced Question 3 — fresh browser reconstruction

Source: PDF page 507, printed page 10-27. All geometry authored through the desktop Chrome UI, from a blank document named `Planchard Advanced Q3 - fresh print reconstruction 2026-09-30`, millimeter units.

Current native checkpoint has five history entries and one solid:

- Fully defined connected three-line Top sketch. Stock-center points (2.5,50), (2.5,2.5), (107.5,2.5), (107.5,60) mm, offset -30 mm. Horizontal/vertical relations and explicit fixed coordinates were applied in the point-coordinate dialog. This positions a mid-plane thin feature so its outside width is 110 mm and left/right depths are 50/60 mm.
- Thin extrusion 60 mm tall, 5 mm wall, mid-plane thickness. Outside native bounds 110 x 60 x 60 mm.
- Native R5 fillet on both inner vertical bend edges at world (5,0,5) and (105,0,5) mm, selected from the visible exact body-edge browser.
- Fully defined Right-plane sketch, four driving diameter 6 mm circles. Centers (Z,Y) = (20,+/-20), (40,+/-20) mm; two seed circles and a two-copy U-pitch 20 mm sketch pattern. Hole positions are read from the print leaders, pending final comparison.
- Blind 5 mm cut along Right-plane normal, affecting the left wall only. Native rebuild succeeded as one solid.

Saved to the library and exported through Output / Project bundle. Protected `artifacts/planchard/ADVANCED-Q3-bends-left-holes-checkpoint-browser-2026-09-30.mforge` (721,767 bytes) and JPEG. This is unfinished: rounded right arm, its bore and four-hole pattern, two slots, rear reliefs, chamfers, specified material, reference coordinate system, native mass/COM and cold-reopen acceptance remain pending.

The book gives 134.19 g, 49,701.13 mm^3 and coordinate-system COM (-53.30,-0.27,-15.54) mm. No mass-fitting changes have been made.

## Right nose checkpoint
Browser-authored quarter-circle upper-corner cut on Right plane X=105 mm, Through All Along normal, restricted geometrically to the right flange by its starting plane. Radius30 mm, centre(Z30,Y0), scalar endpoint Horizontal/Vertical relations; fullydefined afterfinish. Native selected-feature mirror across TopY0 accepted. Eight history entries, one native body, saved library and compact protected bundle ADVANCED-Q3-native-cut-mirror-checkpoint-browser-2026-09-30.mforge.

## Twenty-entry checkpoint — not accepted against the book

Eight fully defined sketches, twelve solid features, one native body. UI saved and exported `ADVANCED-Q3-twenty-step-mass-audit-browser-2026-09-30.mforge` and JPEG. Material Aluminum 6061, density 2.7 g/cm³. Native volume 53,158.77 mm³, mass 143.5287 g, world COM (58.07806,-0.009013878,13.72719) mm. The book target remains 49,701.13 mm³ / 134.19 g; reference coordinate system has not been established. No completion or mass acceptance is claimed.

Right flange bore Ø20 and four Ø6 holes on Ø40 pitch circle are browser-authored, with safe Through All cuts from X105. Left fork and rear closed slot cuts were corrected explicitly to Blind 5 mm; their original Through All extents removed unintended opposite-wall material. This was a cut-extent issue, not a sketch-plane mismatch.

Rear slot width12, arc-centre spacing15, centresX10/25,Y0. Rear relief R30 centre(X45,Y52), producing8mm sagitta from the upper edge, mirrored across TopY0. Chamfer5 currently selects the upper fork-mouth edge at(X2.5,Y6,Z50); its precise intended edge set remains under source review. The third mirror indicated by the book's thirteen-feature sequence and a partially occluded second rear slot remain to be reconciled.

## Rounded bends checkpoint

Independent drawing audit reads the two-slot callout as the left open fork plus the single rear closed slot; no third opening was added. The feature-count hint can use a separate mirror for the lower left holes, whereas this reconstruction cuts all four in one sketch. An unused Right X55 datum exists from the investigation.

Outside bends were still sharp. The drawing's uniform5mm wall with insideR5 implies outsideR10. A late R10 fillet failed where the existing slot intersects the bend. Through the UI rollback bar, a two-edge R10 fillet was inserted before the inside R5 fillet and the cuts, and the bar was released to the end. The downstream cuts rebuild. Chamfer1 correctly reported its lost generated-edge reference; it is temporarily suppressed for explicit reselection, not silently substituted.

Saved21entries,8fullydefinedsketches,1nativebody. Exact volume50,672.82mm³, mass136.8166g with6061density2.7, worldCOM(58.13838, approximately0,14.34698)mm. Protected `ADVANCED-Q3-rounded-bends-chamfer-suppressed-browser-2026-09-30.mforge` and JPEG. Still unaccepted against49,701.13mm³ and134.19g; chamfer/source coordinate-system audit remains pending.

## Correct lower chamfer checkpoint

The print leader C points to the upper lip of the lower fork arm: edge centre (2.5,-6,50) mm. Refreshed exact upstream edges through the browser, cleared the stale upper-arm edge, selected the correct lower edge, updated and unsuppressed Chamfer1. Actual Chrome rebuild order is valid and the native rebuild succeeds as one body. The app fixes for suppressed-feature upstream queries and compiled tool ownership were exercised by this workflow.

Saved and exported `ADVANCED-Q3-correct-lower-chamfer-browser-2026-09-30.mforge` (1,870,437 bytes), with screenshot. Native volume 50,610.32 mm³, mass 136.6479 g, world COM (58.20709,0.009467721,14.30501) mm. Book volume/mass and source coordinate-system acceptance remain unfinished.
