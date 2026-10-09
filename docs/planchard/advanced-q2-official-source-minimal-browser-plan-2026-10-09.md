# Advanced2: source-resolved repair of the existing fresh part

Read-only source plan9October2026, PDF506/printed10-26. Existing browser record: **Planchard Advanced Q2 - fresh print reconstruction 2026-09-30**, protected `artifacts/planchard/Advanced-Q2-6061-audit-browser-2026-09-30.mforge`. Eleven features/ten fully defined sketches/21history entries; historical part is an unaccepted audit checkpoint. This plan does not author, import or replay geometry, edit app source, or update ADVANCE.

Durable source/protected-object evidence: `artifacts/planchard/ADVANCED-Q2-source-repair-evidence-2026-10-09.json`. Original official source is `Advanced Part Modeling-Question2.SLDPRT`, validated46-block extraction under `scratch/planchard/official-advanced-q2-container`. Native source analytic candidates are not a complete decoded live FACE/BODY model; named-feature/typed-sketch and geometric agreement are identified below.

## Stable physical frame and material

Base source and app frame already agree: X0..4.2in, Y0.. .5, Z±1.75. Keep the default physical frame. Source normal for inclined Plane1 is n=(.8660254038,.5,0). App local axes are U=(.5,−.8660254038,0), V=(0,0,−1). Keep those axes and the existing local circle U−2.5/V0.

Official material6061/density2700kg/m³=2.7g/cm³. Existing saved material is6061 with explicit printed.097lb/in³=2.684950756889703g/cm³ and book provenance. Do not silently replace that choice to force mass. PrintedV14.05in³ multiplied by explicit.097 is1.36285lb, which rounds1.36; printed mass1.37 uses a nominal material density closer to companion2.7. Report this distinction if preserving printed density. Source cached mass621.788g and physicalCOM(40.375,30.274,0)mm corroborate its nominal material; source cached volume230000mm³ is rounded and is not an exact volume target. Use printed/source geometry and disclose material convention.

## 1. Correct existing Plane1 and axial feature depths

Use the reference tree's **Edit reference** action for `plane_1846`, **Plane1 -60 degree support**, rather than the ribbon's creation command. Existing axis originX1.7/Y.5/Z0 must becomeX2.2/Y.5/Z0in. Preserve selected base-top support, angle−60°, globalZ rotation axis. Only the pivot changes. All existing Plane1-bound sketches should re-resolve to this plane with unchanged local circle/rectangle coordinates.

The correct world disc centre is(.95,2.665063509461,0)in=(24.13,67.6926131403,0)mm. Source native circular stations independently establish the following axial table, measured along+n from Plane1:

|Existing app feature|Source required interval, inches|Existing UI repair|
|---|---|---|
|Boss2 `feature_munnngt6_2`, sketch `sk_14jtw`|−.26..0|Reverse/Against normal, depth.26, start0. **Backing is rectangleU−2.5..0,V±1.75 plus the upper semicircular cap centered(U−2.5,V0), R1.75, bulging towardU−4.25.** The prior rectangle-only instruction was incomplete and is superseded.|
|Boss3 `feature_munntw7s_3`, sketch `sk_2ek0l`|0..+.24|Forward/Along normal, depth.24, start0. KeepØ3.5 circleU−2.5,V0.|
|Boss4 `feature_munovvba_3`, sketch `sk_37js7`|−.46..−.26|Reverse, depth.2, start offset+.26 relative to selected reverse direction; preserveØ.9 circleU−2.5,V0.|
|Bore Cut3 `feature_munozs9a_4`, sketch `sk_4fd13`|Through assembly of these coaxial features|PreserveØ.625 and ThroughAll both directions; original UV centre remains correct.|

Explicitly verify read-only effective extent displays after every direction/offset update. The offset convention is relative to direction; the table's geometric stations decide correctness, not a guess about a minus sign. Plane1 origin should become(5.588,1.27,0)cm in exported internal coordinates. Do not translate circle localU to compensate for the old pivot: that would retain the wrong physical centre.

**Backing contour correction, independently source-confirmed9October:** Keywords binds Boss2 ID201 to Sketch3 ID172. Source Sketch2 instead belongs to Plane1's construction/location geometry; it is not this backing profile. Typed Sketch3 side endpoints are source-localX±44.45mm atY−16.94147737194 andY46.55852262806, a63.5mm (=2.5in) side length. The upper arc center is(0,46.55852262806)mm, radius44.45mm (=1.75in); its converted point(42.50774640256,59.55444490299) lies on that same circle. Native back-face circle attr465 is centered at(18.4107682334,64.3906131403,0)mm, exactly−.26in alongn from the disc center, with radius44.45mm. This independently establishes the rounded cap on the backing's rear face; the source preview also shows the continuous rounded backing. These observations resolve the omission without selecting geometry from the output mass difference.

Current app top edge1854 joins point1850(U−2.5,V−1.75) to1851(U−2.5,V+1.75). The exact backing outline replaces this edge with a semicircle passing through(U−4.25,V0), centered(U−2.5,V0), radius1.75; retain edges1853/1855/1856 and their side/bottom dimensions. Remove the obsolete line-specific relation/height dimension as needed, then fully define the arc and endpoint relations. The arc must bulge toward negativeU; do not infer arc sweep from endpoint order alone. Refresh the additive Boss2 profile references through supported UI and verify all downstream features after rebuild.

If additive contour replacement is unavailable, a disclosed equivalent history is an added fullØ3.5 disk at(U−2.5,V0), Reverse.26 on the same Plane1. Its lower half merges with the existing rectangle, so only the upper backing cap is new material. Since an appended boss comes after the old bore, repeat the existing coaxialØ.625 ThroughAll cut afterward; the old bore does not automatically cut newly added material. This alternative preserves final source geometry but is not the original one-sketch Boss2 workflow. Do not certify the earlier rectangle-only checkpoint as source-complete.

Old triangleBoss6 and Mirror1 may remain temporarily while these early edits are accepted, but they are not source support geometry. Protect the checkpoint before downstream repairs. Generic suppression cascades through dependants; do not suppress an earlier cut expecting its children to remain active.

## 2. Correct both existing groove sketches and cuts

Official Sketch5/6 named widths are.375in, with source circle-relative boundaries+.5..+.875 and−.875..−.5. Native groove wall planes independently corroborate those same local stations. The current historical grooves are instead centred±1 from the circle, displaced by.3125in.

App circleU is−2.5. Keep the existing rectangular overrun length4in/V±2, since the circle intersection supplies the actual curved groove ends. Correct their U anchors without changing their horizontal/vertical and length/width relations:

|Current cut/sketch|Fixed point|Current U → required U, inches|Required full U interval|
|---|---|---|---|
|Cut1 `feature_munokf29_1`, `sk_34s5n`|1868, constraint1880|−3.6875→−3.375; V−2 unchanged|−3.375..−3.0|
|Cut2 `feature_munoreox_2`, `sk_2q4zq`|1882|−1.6875→−2.0; V−2 unchanged|−2.0..−1.625|

Each source Cut is Blind.125in, cutting against+n from the disc front+.24 to floor+.115. The native shared groove-floor plane at(26.6596602045,69.1531131403,0)mm has exactly+.115in axial station. Both current.375deep/.125start cuts therefore require extent repair.

With the existing stable Plane1 sketch references, choose Reverse/Against normal, depth.125 and relative start offset−.24; verify effective start+.24/end+.115 along+n. A new explicit parallel front datum at+.24 and reverse cut with zero start is geometrically equivalent if the visible controls cannot express the current stable-plane start. Preserve fully defined profiles and existing feature IDs when possible. No reassignment to a moving face is necessary.

## 3. Reauthor current Cut4 as the source heel cut; preserve pad dependency

Current `feature_munpbunl_5`/Cut4 uses Top sketch `sk_59new`: a centreX3.2 capsuleR.2 atZ±1, cut through base. Official Cut4 instead uses **Front Sketch10 heel rectangleX1.7..2.7/Y0.. .125in**, through fullZ width. Source planes corroborate X43.18/68.58mm and floorY3.175mm. Official native pad innerR.2 circles occur atY.5/.625 only; there is no source base-through pad hole. Boss5's annular raised pad has a blind recess terminating at baseTopY.5.

**Do not suppress Cut4 while retaining Boss5:** source UI suppression cascades all dependent history. The safe identity-preserving visible workflow is to edit Cut4's existing sketch, reassign Top→Front through its sketch-plane inspector, delete its obsolete capsule/constraints, and create the heel rectangle with four explicit driving corner coordinates and horizontal/vertical relations. Then edit the same Cut4 and click existing **Refresh sketch contour**, followed by Update feature. That refresh rebuilds profile IDs/references from the new closed contour while preserving the feature's ID and downstream body chain. Choose ThroughAll both directions alongZ fromFront0; verify full base width is affected. If native contour refresh/reference repair fails, preserve the diagnostic rather than silently introducing a no-op feature.

Keep raised **Boss5 `feature_munpm43o_6`**, Top sketch `sk_6pm2o`, active. Its centresX3.2/Z±1, outerR.5/innerR.2, height.125 abovebaseY.5, are source-consistent. No replacement pad or extra through-hole is required. Correct source inner recess is Y.5.. .625; the floor remains at.5.

## 4. Replace obsolete triangle with one native Thin Extrude and feature mirror

Current Boss6 `feature_munpqdl8_7`, Front sketch `sk_7bg09`, is a.24in symmetric closed triangle with footX.7/1.7 and top(.45,2.665063509)in. Its Mirror1 `feature_munpra9z_8` is the final feature. This is not the source support.

Official Sketch9 has **one** open horizontal guide X.375→2.2in at localV−1in. `Extrude-Thin1` follows it, then `Mirror1`; there is no requirement for two separate chains in one Thin feature. Native physical wall intervals are Z−1.38..−1 and reflected+1..+1.38. Thickness.38 is one-sided outward, not.38 mid-plane aboutZ±1.

Source end condition is now resolved: named `moEndSpec_c` is defined at13951; its Thin feature class-reference record at96678 contains type4, followed by `moSingleFaceRef_w` at96717. Type4 is the historical selected-surface end condition, not UpToNext. The official [SOLIDWORKS2021 end-condition enum](https://help.solidworks.com/2021/english/api/swconst/SOLIDWORKS.Interop.swconst~SOLIDWORKS.Interop.swconst.swEndConditions_e.html) confirms4=UpToSurface and11=UpToNext. The exact binary external face identifier has not been formally bound to a liveFACE record; the target's **geometric plane** is independently corroborated below.

Native support diagonal lines at sourceZ±1 and±1.38 have direction(−.5,+.8660254038,0) and axial station−.26 relative to the disc centre. They lie on the **backing rectangle's rear face**, not originalPlane1 or frontdisc+.24. Select the native planar rear face of Boss2: normal±n, throughC−.26n=(18.4107682334,64.3906131403,0)mm. This is the app's existing **Up to surface** end-condition workflow, with exact face selection/refresh.

After accepting earlier geometry, suppress only the final old triangleBoss6 (its Mirror1 cascades), then author a new fully defined Top open lineX.375→2.2 at physicalZ−1, guide startY0, and a Thin Extrude along+Y, one side outward toZ−1.38, thickness.38, Up to surface at that backing rear face. Check current Top U/V physical mapping and preview; use the physical Z stations rather than assuming a sign for every legacy plane convention. Add a feature-scope mirror about FrontZ0. An explicit new Thin+newMirror preserves the old diagnostic history and avoids forcing a closed-triangle profile into an incompatible open-chain feature.

Visible external support geometry above baseTopY.5 should meet the back-plane line from(X.375,Y3.1409927238) to(X1.8997778600,Y.5). These endpoints follow plane intersection, not mass fitting. The source guide's finalX2.2 is partly past the back plane'sY0 crossingX≈2.188453; a robust selected-surface feature must trim that portion and merge with the existing base. Current native `untilFace` path uses an extended plane and seed-side retention, but exact open-line/partial crossing creation has not been verified on this actual model. If rejected, preserve the actual failed transaction and investigate that concrete gap. Do not substitute a blind support height or silently shorten the source guide to make the app pass. A source-equivalent clipped triangle can be disclosed as an alternate geometry workflow only after its scope is explicitly agreed/reviewed.

## Acceptance and honest remaining uncertainty

Source serialization confirms Thin Boss4 (76838) → Cut3 (84744) → Mirror1 (101719) → heel Cut4 (113585) → pad Boss5 (130422). Appending replacement Thin+Mirror after the existing heel can refill its X1.7..2.7/Y0..0.125 removal. Reapply the same source heel through-cut after the newly appended support features, or explicitly reorder/rebind history through supported UI. Keeping the earlier heel as a redundant cut is a disclosed history difference; geometry still requires the final heel removal. Do not suppress the old Cut4 and inadvertently cascade the pad.

The original generic binary parser has not decoded every selected-face ID or every coordinate-frame object. The named end-condition plus native plane/line stations now resolve support termination geometrically; cut widths/floors and heel/pad placement have independent source corroboration. No output volume/COM was used to choose these parameters.

After actual browser repair: native one solid; all edited sketches fully defined; no unresolved face references; source default frame; protected bundle and native STEP; upstream edit/Undo/Redo/restoration; clean Save/cold reopen. Check printedV14.05in³/COM(1.59,1.19,0) and material convention separately. Source cachedCOM is(40.375,30.274,0)mm, or(1.5895669,1.1918898,0)in. Retain any residual; do not alter a source datum or density to force an answer. This document establishes a source/browser action plan, not post-repair acceptance.

## Actual browser checkpoint update — 9 October, 04:52

Datum/depth, both grooves, heel Cut4 identity-preserving Front reassignment/contour refresh and pad retention are browser-authored. Old triangle Boss6 suppressed, dependent old mirror cascaded. Cold reopen verified. New Top sketch sk_18pq9 is fully defined: U.375..2.2/V−1, horizontal plus two fixed endpoint coordinates. This historical document uses legacy Top mapping U+X/V+Z/normal+Y. Actual visible extent confirms Along normal is +Y; use Other side for outward negativeZ. The earlier Reverse direction suggestion must not be applied to this document.

Actual first support creation (Thin.38, Other side, Along normal, Up to surface Boss2 end) failed with16 rebuild diagnostics. Selected face refers to internal feature_munnngt6_2:tool; earlier Boss2 receives misleading owner diagnostic attribution, while its stored recipe is unchanged. Diagnostic bundle ADVANCED-Q2-thin-up-to-face-failed-browser-2026-10-09.mforge857423 protected. One actual Undo restored22steps/one native solid; clean guide bundle1234558 protected. Agents investigate this concrete reference bug. Native synthetic splitter tests pass, but actual model termination is not yet accepted. Parent must cold-load repair, retain existing guide, retry exact source selected-face operation, then Mirror and reapply heel. No blind-height substitution or mass fit.


