# Official companion reconciliation: Basic1–6B and Advanced1–4

Later acceptance supersedes the Advanced3 repair queue below: Q3 is source-coordinate accepted in `f1f0016`, with final native/STEP equality, source-frame properties and cold driving Undo/Redo. See `advanced-q3-final-source-native-audit-2026-10-09.md`. Its older findings remain evidence of the pre-repair state.

Read-only source preparation, 9October2026. This report does not supersede newer accepted Advanced5/6/6A or Chain work. It narrows the older `remaining-book-followups-reconciled-2026-10-09.md` queue using official publisher files and protected historical browser exports. No CAD source was imported, no app geometry/ADVANCE was edited, and no mass or COM was used to choose dimensions.

## Evidence and precision

Official publisher download: https://www.sdcpublications.com/downloads/978-1-63057-407-9; extracted originals under `scratch/planchard/official-companion-2021/Chapter 10 CSWA Models`. Each modern container was decoded read-only with raw-DEFLATE size and CRC checks. All12 relevant sources passed, with44–49 verified blocks each. Source hashes, named dimensions/material keywords and direct density fields are in `artifacts/planchard/remaining-official-source-properties-2026-10-09.json`.

Density is the stored float64LE at byte84 of `Contents/Config-0-LWDATA`, corroborated against material names and the already checked Q5/Q6 source material records. It is not inferred from mass divided by volume. The `SW-MassProp` cached volume is rounded to six decimal places in cubic metres: a1000mm³ increment for these files. Its cached mass is to.001g and COM to.001mm. These cached volumes are therefore not exact native geometry acceptance targets. Basic4 has no decoded mass tuple; density is verified, mass remains unavailable in this cache.

Typed sketch loci are in each `official-advanced-qN-container/sketch-loci.json`, and native analytic candidates in `official-advanced-qN-partition-inspection/record-observations.json`. Native primitive scanning alone does not establish live FACE/BODY ownership; old/converted construction geometry may remain in the stream. Findings below distinguish corroborated named-sketch facts from candidates that still require producer binding.

Historical browser mainModel metadata was extracted without loading its unrelated library. Input filenames, byte sizes, canonical mainModel hashes, feature parameters, part densities and saved coordinate systems are in `artifacts/planchard/remaining-protected-model-properties-2026-10-09.json`. The12 protected inputs remain unchanged. The three source coordinate-system translations were independently found twice in each typed class payload; byte offsets and exact bytes are in `artifacts/planchard/remaining-coordinate-origins-2026-10-09.json`. Axis orientation was not fully decoded by that translation scan.

## Verified property table

All densities below are g/cm³. Source COM columns use default physical source coordinates in mm, before any named reporting system.

|Exercise|Official material/density|Protected browser density|Source cached mass / default COM|Finite next action|
|---|---|---|---|---|
|Basic1|Alloy Steel7.700|7.695, explicit printed.278lb/in³|2253.212g;41.430,25.593,−.889|Keep printed density and disclosed rounding residual. Add missing driving-edit/Undo evidence; no geometry redo established.|
|Basic2|Copper8.900|8.900|1605.292g;0,19.794,0|Material/COM confirmed. Only missing driving-edit/Undo evidence from historical report.|
|Basic3|Cast Alloy Steel7.300|7.300|69.768g;9.787,−.127,0|Replace old external density provenance with official companion provenance through UI if desired. Cold/edit evidence follow-up; geometry already matches printed result.|
|Basic4|2014 Alloy2.800|2.800|No decoded mass cache|Official material confirms current value. Existing repaired native/cold acceptance remains; missing upstream edit proof only.|
|Basic5|6061 Alloy2.700|2.700|1355.895g;0,18.513,−21.858|Printed.097lb/in³ is2.6849507569; explicitly choose printed exercise density if required, without claiming a geometry fix. Existing COM differs; resolve named support/tube datums before edits.|
|Basic6|AISI3048.000|8.000|888.475g;−15.392,15.933,−2.653|Material/COM round correctly; preserve geometry. Exact final STEP evidence remains the older report's qualification.|
|Basic6A|AISI3048.000|8.000|Same as Basic6|Source translation65,0,20 confirms saved named-frame origin. Retain documented embedded-report positiveY versus bold-answer negativeY discrepancy.|
|Basic6B|1060 Alloy2.700|2.6987907092, external nominal.0975lb/in³|309.747g;−16.248,15.506,−2.666|Through UI replace density/provenance with official2.700 if pursuing companion parity. Add source reporting origin70,0,20 after physical frame alignment. Geometry residual remains separate.|
|Advanced1|1060 Alloy2.700|2.6849507569, explicit printed.097lb/in³|265.807g;0,0,38.260|Preserve printed density; correct confirmed flange/shaft/holes and bind source Cut2/chamfer scope.|
|Advanced2|6061 Alloy2.700|2.6849507569, explicit printed.097lb/in³|621.788g;40.375,30.274,0|Preserve printed density; correct original inclined datum and.26/.24 disc depths, then support profile/termination.|
|Advanced3|6061 Alloy2.700|2.700|134.193g;1.802,−.267,−35.536|Correct paired rear slots; introduce physical source frame and named origin55,0,−20. Do not fit printedXCOM by moving origin.|
|Advanced4|Gray Cast Iron7.200|No explicit saved density|2536.592g;0,34.974,−46.673|Source initial thin stock differs. Resolve remaining trim producers, repair initial geometry, then apply source material. Old model remains unaccepted.|

Printed density takes precedence when explicitly part of the printed task. Companion nominal2700/7700 is a separate source fact, not permission to silently change a correct printed conversion to make mass round differently. Basic6B's density difference is only about.0448%; it cannot explain the historical+.875% volume residual. COM is independent of uniform density.

## Advanced1: confirmed shape and axial datum corrections

Protected `ADVANCED-Q1-fillets-mass-audit-browser-2026-09-30.mforge` has tube depth2.2in, rear rounded-square flange atZ2.2..2.6in and front flangeZ0.. .5in. Its hole pattern uses corner centres(±1,±1)in through both flanges. This differs from source named sketches and analytic stations.

Official rear Sketch1 is a rounded diamond: four R.5in lobes centred(0,+1),(0,−1),(+1,0),(−1,0), connected by diagonal tangents. Tangency endpoints use.3535533906 offsets from those centres; external diagonal spans join the adjacent lobe tangencies. Rear Ø.35 holes share those cardinal centres. Front Sketch3 uses corner centres(±1,±1), R.5 lobes and concave R1.5 transitions centred(0,±(1+√3)) and(±(1+√3),0); adjacent tangencies include(.75,1.4330127019) and(1.4330127019,.75). Historical short straight joins are not those exact tangent arcs.

Source named Boss depths are.4,1.7,.5in. Source circles corroborate physical axial stations rear0.. .4, tube.4..2.1, front2.1..2.6in; R.1 junction fillets reach tube stations.5 and2.1. Preserve total2.6 while correcting roles, rather than adding rear/tube/front dimensions on the existing reversed datum.

Source sequence includes Cut2 .1in and Chamfer .1in/45°, rather than the historical separate reverse drafted additive collar. Native candidates include cone radii.75 atZ2.6 and.65 atZ2.5, and straight boreR.375 atZ0/2.5. These make the collar/cut assumption suspect but do not yet bind Cut2's exact selected contour and end condition. **Browser-authorable now:** rear diamond and cardinal holes, front true tangent outline, source axial stations. **Before full final acceptance:** bind Cut2/chamfer selected faces and scope; do not certify a guessed collar.

## Advanced2: confirmed disc plane and depths; finite support uncertainty

Protected `Advanced-Q2-6061-audit-browser-2026-09-30.mforge` has reverse.125in backing, forward.5in disc and.24in thick support extrude. Official named Boss2/Boss3 are reverse.26/forward.24, total.50in. Source inclined plane normal is(.8660254038,.5,0). Its disc centre on the starting plane is(24.13,67.6926131403,0)mm=(.95,2.6650635095,0)in, corroborating the original Plane1 pivotX2.2/Y.5 and local vertical−2.5in station. The later inferred pivotX1.7 does not reproduce this datum.

Source disc back centre is(18.4107682334,64.3906131403,0)mm, exactly−.26in along the normal; front is(29.4092908615,70.7406131403,0), exactly+.24in. The rear central post adds another.2in from the disc back. These are direct source geometric relations, not mass fitting.

Source Sketch9 support guide runs X.375..2.2in at absoluteZ1in, mirrored on the opposite side, with named thin thickness.38in. Historical toeX.7/footX1.7/Z±1.375/.24thickness differs. Native thin feature has only D5=.38 in Keywords; its exact terminating end condition was not decoded. UpToNext is plausible, not verified. **Browser-authorable now:** restore original plane and.26/.24 disc depths; restore support guide and thickness after checking actual endpoint stock. **Unresolved:** thin extrusion direction/termination, groove start/end producers. Do not replace those with an arbitrary blind height.

## Advanced3: rear closed-slot correction and reporting frame

Protected `ADVANCED-Q3-correct-lower-chamfer-browser-2026-09-30.mforge` has a fully defined rear closed-slot sketch `sk_40pdm`: centres worldX10/25mm, radius6mm, atY0. Its Mirror2 seeds the separate large-circle cut `feature_munro5f8_6`, not this slot. Thus the existing mirror operation does not establish the required paired rear slots.

Official Sketch6 has R5, centre pitch15mm, source centresX−35/−20 atY0. Source analytic circles corroborate both this pair and reflected centres+20/+35, through source rear wallZ−50..−45. The left open fork remains12mm wide; it is not a reason to give the closed rear slots12mm width. A subsequent source-locus/native-cylinder crosscheck also confirms that fork occupiesY0..12 with centreY+6, whereas protected `sk_3tw1r` spans−6..6. Translate its whole profile upward6mm and reselect its lower-mouth chamfer; see `chain-scope-and-advanced3-next-browser-plan-2026-10-09.md` for exact UI anchors and dependencies. In the historical translated physical frame Xsource=Xapp−55 and Zsource=Zapp−50, the left closed-slot centres are appX20/35 and the right centres75/90. Confirm stock equivalence before using this map; it is not a new authored assembly or geometry.

Source `moCoordSys_c` origin is(55,0,−20)mm, present at offsets110889/111096. With identity axes, cached globalCOM translates to(−53.198,−.267,−15.536), rounding(−53.20,−.27,−15.54). A subsequent full-page507 visual check confirms that the embedded Mass Properties screenshot itself readsX−53.20 and the figure labels+X/+Y/+Z; these independently corroborate identity axes. The bold printed answerX−53.30 conflicts with its own embedded screenshot; shifting origin to55.1 would be fitting. The binary rotation-field schema itself remains incompletely decoded; the browser frame is supported by the source figure and embedded report rather than a claim of full binary-vector parsing.

## Advanced4: initial stock must be resolved before downstream repair

Protected `ADVANCED-Q4-multi-feature-mirror-unaccepted-browser-2026-09-30.mforge` records initial thin depth90mm/wall6mm and later added13mm platform. Official `Extrude-Thin1` is depth64mm/wall19mm; Sketch1 base140/inclined leg90/angle60. Source slab Boss1 depth18, R32; ears Boss2 depth38. The first geometry divergence precedes the existing mixed mirror, so another downstream patch is not a reliable final reconstruction.

Source Ø19 ear circles/cylinders share Y51mm; historical ear centreY44 differs. The source sloped R32 centre moves from(0,87.8538290725,−8.1672955930) to(0,103.4422863406,.8327044070)mm, exactly18mm along(0,.8660254038,.5). Counterbore depth9, throat22, groove6, mouth42/30° remain source-backed. Initial thin direction/trim/Cut1 and exact width redistribution through later cuts are not fully producer-bound. **Next source/browser leg:** resolve that producer chain, repair earliest stock in a protected revision, then reuse only downstream contours confirmed to align. Apply GrayCastIron7.2 after geometry. No mass acceptance is asserted here.

## Basic5 and6B: bounded unresolved geometry

Basic5 official source cache COM converts to(0,.7288582677,−.8605511811)in and rounds to printed(0,.73,−.86). Protected current(0,.7229636,−.8672443) differs. Source Sketch5 includes D1=.31 and a support endpoint(−.308321417,1.878799405)in relative to its local plane. Source tube native candidate end centre(0,85.4074934719,−25.1640385394)mm differs from the historical named plane centre(0,84.9414535521,−25.6816283068) by about.69649mm along the tube axis. Other intermediate source circle stations also remain in the stream. **Do not simply shift the cylinder:** bind the original sketch frame and live tube/support producer first. A local V coordinate is not a world centre until its source plane origin is established.

Basic6A source named origin(65,0,20)mm agrees with the saved browser origin and prior embedded-report positiveY; no new geometry discrepancy established. Basic6B source named origin(70,0,20), at offsets110215/110540, is not saved in the protected file. Historical Xbounds−65..75 are not source centred±70; first establish a physical translation before adding the reporting origin. Source named R10/R30 contour arcs and pocketR5 remain explicit, while later general fillets are R7. Some R5 primitives remain in native payload but may be historical/converted geometry; without live ownership they are not proof of an unmodified final fillet. The old+.875% volume residual remains an honest within1%-scoring qualification, not exact companion parity.

## Suggested finite next browser queue

1. Complete short driving-edit/Undo/cold/STEP evidence gaps on accepted Basic1–4/6 without rebuilding their geometry. Basic3/4 material provenance can now cite the actual companion.
2. Advanced3 is the smallest concrete source correction: rear paired slots R5 at source−35/−20 and+20/+35, then reporting-frame evidence. Preserve the lower chamfer acceptance.
3. Advanced2 restore the original inclined datum and.26/.24 depth split; resolve thin end condition before final support repair.
4. Advanced1 repair source flange shapes/holes and axial chain; bind Cut2/chamfer before final collar treatment.
5. Advanced4 resolve earliest thin stock/trim source chain before further downstream changes.
6. Basic5 and6B remain bounded source-contour/frame audits. Density/provenance updates are separate; neither is a mechanism to fit geometry or COM.

This is a prepared task list, not evidence that any new browser correction, native rebuild, driving test, Save/cold reopen or STEP acceptance has occurred.
