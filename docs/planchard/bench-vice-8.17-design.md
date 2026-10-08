# Exercise 8.17 — original bench vice design plan

Status: BV01–BV06 and BV08–BV10 are accepted with browser/native evidence. BV07 sphere and socket sketch are saved, with sphere-cut eligibility repair underway. Assembly, motion and drawing remain pending. See [ADVANCE.md](ADVANCE.md) and the 2026-10-04 browser checkpoint for the current state. All new geometry must start from blank documents and be authored through visible desktop Chrome controls. Dimensions below are designer choices, not recovered companion dimensions or certified manufacturing fits.

## Source and references

Planchard 2021, physical PDF430, printed8-52: **Bench Vice Assembly Project**. Create original parts, assembly and proper movement; additional components permitted. Required drawing: ANSI A landscape, third-angle isometric exploded assembly, explode lines, BOM with balloons, general/custom title properties. Companion parts and AVI are absent. The embedded drawing title reads **ARBOR PRESS**, conflicting with the exercise heading; preserve this discrepancy in source notes and title our example BENCH VICE.

[Kurt's official D-series exploded parts drawing](https://www.kurtworkholding.com/wp-content/uploads/2020/05/D-Series_replacement_parts.pdf) identifies the body, movable jaw, nut, screw, collar and handle. It informs the need for a guided jaw and axially retained rotary screw; our dimensions and ten-role construction are independent and do not duplicate a Kurt vise or its capacities. The book labels every role **Alloy Steel**. Use stock `Alloy Steel (SOLIDWORKS reference)` density7.70g/cm³; [SOLIDWORKS instructor material reference](https://www.solidworks.com/sw/images/content/Training/SolidWorks_Simulation_Instructor_Guide_2010_ENG.pdf) and the existing sourced app catalog support this educational density. Grade/heat treatment/load certification remain unspecified.

| Book item | Fresh role | Printed description | Qty | Source limit |
|---|---|---|---:|---|
| 1 | BV01 | Base | 1 | Original dimensions below |
| 2 | BV02 | Base Plate | 2 | Used as two mounting feet |
| 3 | BV03 | Vice Jaw | 1 | Movable jaw and integral smooth nut envelope |
| 4 | BV04 | Clamping Plate | 1 | Jaw underside keeper |
| 5 | BV05 | Jaw Screw | 1 | Cosmetic nominal thread, functional mate pitch |
| 6 | BV06 | Screw Bar | 1 | Sliding crossbar handle |
| 7 | BV07 | Bar Globes | 2 | End balls with shaft sockets |
| 8 | BV08 | Hex Screw M6x1.0x14-14WN | 4 | Suffix provisional raster transcription; do not infer a certified standard |
| 9 | BV09 | Bolt | 1 | Original stepped retention bolt |
| 10 | BV10 | Bolt1 | 2 | Original M6×25 keeper screws |

Ten definitions / **sixteen occurrences**. No previous part or Toolbox definition may seed these models. Even roles of the same nominal size must be freshly authored for this exercise. Every source stores PartNo BV01..10, BookItemNo1..10, BookMaterial Alloy Steel, density provenance, Source PDF430/8-52, OriginalDesignerExample, and ThreadRepresentation / RetentionRepresentation where relevant.

## Frozen coordinate frame and interface

All measurements mm. World X is screw axis and jaw travel; Y is vertical; Z is across jaw width. Base origin(0,0,0), screw centerline **Y34,Z0**. Home movable jaw clamping face X110; fixed face X160. Motion parameter **s=0..50mm**, giving jaw opening50−s. Work clamping band is Y46..66 (screw below this band). Native shaft/nut thread envelopes are smooth with clearance; a coupled Screw mate supplies ideal pitch **4mm/revolution**. No real thread contact, cutting data or force rating is asserted.

Most definitions use world-like local coordinates and identity home placements; quantities use explicit translations below. Keep interfaces and coordinates intact when simplifying decorative detail.

## Ten fresh native definitions

### BV01 base — one connected body, grounded

1. Top XZ rectangle X0..176,Z−35..35 atY0; extrude12 along+Y for bed.
2. Front pedestal X0..16,Y12..58,Z−24..24, merged.
3. Fixed jaw X160..176,Y12..66,Z−28..28, merged; its inner work face isX160.
4. Through-Y bed slot X20..160,Z−8..8. It leaves two longitudinal rails and connected front/rear bridges.
5. Through-X front pedestal journal bore Ø20.2 centeredY34,Z0, X0..16 only.
6. Retention bolt hole centeredX8,Z0: nominalØ6 vertical holeY44..58; lowerØ4.2 nose passageY42.2..44, meeting it. It opens into the journal bore. Avoid extending a drill cut through the lower bed.
7. Four nominalØ6 blind foot fixing bores fromY0 toY4 at(X30,Z±25),(X146,Z±25). These are smooth nominal thread envelopes. Foot screw tips reachY2, leaving2mm to blind bottoms.

Identity placement. Native clearance audit must confirm the groove bolt passage and no unrelated shaft removal; dimensions are proposed nominal representations.

### BV02 base plate — two feet

Local box X−10..10,Y−12..0,Z−45..45. Through-YØ6.6 bores atlocalX0,Z±25. Two instances translateX30 andX146; other coordinates0. TopY0 contacts bed underside, endsZ±45 extend10mm beyond bed. Foot screw head seatsY−12.

### BV03 vice jaw — integral carriage and tongue

Three merged boxes: carriage X70..110,Y12..20,Z±28; jaw upright X96..110,Y20..66,Z±28; tongue X72..108,Y−0.2..12,Z±7.8. Tongue has0.2mm lateral clearance per side in the16mm bed slot; carriage seats on bedY12. CutØ20.2 throughX96..110 atY34,Z0 for the ideal nut envelope. Add twoØ6.6 through-Y keeper bores atX80/90,Z0, fromY−0.2 to20. Heads are outside the upright footprint (which beginsX96).

Home identity; motion translationX=s. At s50 tongue endsX158, remaining2mm before slot end; carriage/jaw face reaches fixed faceX160. Nominal shaft extends toX158, leaving12mm axial engagement with the last jaw position and2mm before the fixed jaw. Do not extend travel past50.

### BV04 clamping plate — underside keeper

Box X72..108,Y−6.4..−0.4,Z±14. Two nominalØ6 blind holes from topY−0.4 toY−5.4 atX80/90,Z0. Home identity, Lock to BV03. Keeper top has0.4mm clearance beneath bedY0 and0.2mm below tongue bottom; keeper extends6mm beyond each slot side to retain jaw lift without intersecting rails. Bolt tipsY−5 leave0.4mm to blind bottoms.

### BV05 jaw screw — rotary X-axis source

Merged revolved or circle-extruded stock centeredY34,Z0: Ø20 shaft X−12..158; Ø30 handle hub X−30..−0.2; Ø30 thrust flange X16.2..20.2. Front/rear pedestal axial clearances0.2mm each. Cut annular journal groove X5.8..10.2 down toØ16 (from nominalØ20); this4.4mm groove accepts BV09'sØ4 nose with0.2mm axial clearance each side. CutØ8.2 crossbar hole alongZ through hub, centeredX−20,Y34. Cosmetic screw thread designationTr20×4 on X20.2..158; preserve smooth native Ø20 envelope and honest ideal nut bore Ø20.2.

Identity placement, free rotation aroundworld+X, axially fixed to base. A Concentric mate uses actual front journal/base bore axes; a Distance mate between native Right datums fixesX translation0. Avoid Locking rotation or adding a contradictory screw axial offset.

### BV06 screw bar — centered crossbar

Fresh Ø8 cylinder alongZ, local X0,Y0,Z−60..60. Place(X−20,Y34,Z0), identity rotation. Concentric to BV05 crossbore; at first use a center datum Distance to keep it centered. Optional later handle sliding allows localZ±35mm with travel limit; do not add this extra DOF before screw-drive acceptance.

### BV07 bar globe — two socketed balls

Fresh Ø12 sphere centeredorigin, withØ8.2 blind socket along+Z fromlocalZ−6 to0. Two instances centeredworld(X−20,Y34,Z+60) withRx0 and(X−20,Y34,Z−60) withRx180. Socket mouths face the crossbar center. Bar ends terminate at each socket's center-plane bottom; radial clearance0.1mm. Ideal bonded/press retention disclosed. Lock both globes to bar; do not leave them individually free. At centered handle ball extentZ±66 and hubcrosshole clearance0.1mm radial.

### BV08 foot hex screws — four original nominal M6×14 proxies

Fresh local+Y screw: nominalØ6 stemY−14..0; hex head AF10,Y0..4, no loaded thread model. PlaceheadseatY−12 atX30/146,Z±25 withRx180 (tipY2, headY−16..−12). This matches the source quantity and nominal M6×14; the printed `14WN` suffix is not a dimensional authority. Lock feet and four screws to base only after independent source update/clearance acceptance.

### BV09 stepped retention bolt — original nose bolt

Local+Y construction centeredX0,Z0: Ø6 stemY−13.8..0, Ø4 noseY−15.8..−13.8, hex headAF10,Y0..6. Place(X8,Y58,Z0), identity. TipY42.2, shoulderY44.2: the2mm nose enters shaft groove; floorY42 leaves0.2mm clearance and the nominal6mm stem is outside the shaft. Base nominal threaded holeØ6 accepts the stem. Lock to base. This is an original unloaded retention proxy, not a certified fastener standard.

### BV10 keeper screws — two nominal M6×25 proxies

Fresh local+Y nominalØ6 stemY−25..0, hex headAF10,Y0..4. PlaceheadseatY20 atX80/90,Z0, identity (tipsY−5); Lock to jaw. Nominal thread engagement in keeper is4.6mm with0.4mm blind-bottom clearance. HeadsY20..24 are clear of uprightX96..110; radius/hex halfwidth5 leaves the second head endingX95,1mm before upright.

## Native mating and motion sequence

1. New assembly from blank. Insert16 occurrences of only these ten newly accepted sources and type frozen placements. Ground BV01.
2. Lock mounting feet/foot screws and retention bolt to base; Lock keeper/its screws to jaw; Lock ball ends to crossbar. Preserve screw and jaw freedoms.
3. Shaft/base native Concentric and Right-datum Distance0 establish one rotary DOF. Jaw/base Top datum distance0 and Front datum distance0 preserve itsX travel while blocking lift/lateral translation and rotation; use physically consistent datum alignment. Add **Limit mate**, base Right datum as A and jaw Right datum as B, **Aligned**, minimum **0 mm**, maximum **50 mm**. With datum A normal +X and both origins coincident at home, the measured separation is exactly jaw advance s. If the actual chosen native normal is −X, use the corresponding signed limits −50..0; do not infer the sign from a viewport arrow alone.
4. Add native coupled Screw mate between BV05 axis and BV03 Ø20.2 nut-bore axis, pitch4mm. Enable **Couple screw rotation and travel**, leave **Drive turns blank** for the free one-DOF joint, and choose **Thread handedness: Right hand / Left hand** at home before driving or creating a motion study. The selector preserves the captured axial zero and phase; it does not silently recapture the current pose. Do not assume selector-axis sign: measure one actual shaft revolution and a4mm jaw advance. Relative phase is B minus A, so positive Drive turns can correspond to negative shaft rotation when A is the shaft; choose handedness and signed motor RPM consistently from the actual trial. Capture home phase at s0. Final physical mechanism has one driven screw/jaw DOF while the centered crossbar's spin follows the screw.
5. Initially Lock the correctly positioned crossbar to the shaft, avoiding an extra crossbar roll DOF. An optional later sliding-handle configuration replaces that Lock with native Concentric, an orientation mate and a ±35mm axial limit. Full shaft rotation rotates the centered bar and globes as a rigid connected handle assembly; its axis changes world orientation naturally.
6. Apply actual screw-drive turns0,2.5,6.25,10,12.5 for jaw positions0,10,25,40,50mm. Return to0 and cold reopen. Negative advance would move toward front support, so forbid s<0; stop at jaw face contact s50.
7. Native exact collision checks at each saved pose and handle rotation sample; report intentional touching separately. Do not treat ideal threaded clearance as force-transfer validation or hide positive-volume clashes.

### Native capability review, 2026-10-03

The coupled solver already supports full-turn winding, document-unit pitch and component-origin axial zero. A missing **Thread handedness** selector was added to the native Screw mate inspector, using the solver's existing right/left-hand semantics. Focused synthetic constraint tests (no authored geometry) verify a grounded base, axially retained shaft and two-plane guided jaw: one free physical DOF, 4 mm/revolution travel at 0/2.5/6.25/10/12.5 turns, 0..50 mm end stops, return to zero, both overshoots rejected without publishing partial motion, left-hand signed drive and JSON reopen. Existing coupled/legacy screw regressions also pass. This is capability evidence; actual fresh Chrome vice geometry and motion acceptance remain required.

The human hole-authoring workflow now has **Sketch → Dimensioned circle**, also available by that command-search name. Enter **Center U**, **Center V** and **Diameter** in document units, with **Fix center** checked by default. This authors an ordinary circle with a driving diameter and fixed center on the active sketch datum; the datum offset remains unchanged. Top uses U=X/V=Z, Front U=X/V=Y, and Right U=Z/V=Y. The resulting circle is selected for normal native feature authoring. Focused solver tests verify diameter edits after JSON reopen, two translation freedoms when Fix center is unchecked, preserved datum/offset, invalid-input rollback and annular contour bindings. Actual Chrome acceptance is recorded with the vice part workflow.

## Human UI build order and acceptance

Author BV01/03/05 first to verify interfaces; parallel BV02/04/06/07 and new BV08/09/10 only after the frozen layout is agreed. Use visible Settings→mm before entering geometry. Rectangles/circles fixed to named planes and fully dimensioned; normal extrusions and cuts must merge to one body. Use a proper revolved hemisphere profile for globes if no Sphere feature exists, then blind axial socket cut. Every source gets native mass7.70×volume(cm³), one-body validation, visible cold reload/library reopen, editable bundle+STEP and proof screenshot. No part mass target is inferred from book.

Name assembly `Planchard 8.17 - Bench vice assembly - fresh designer example 2026-10-03`. Protect raw16-occurrence placement checkpoint before mates. Drawing: A(ANSI)/Letter landscape279.4×215.9mm, third angle, isometric exploded native bodies, manually authored explode steps/lines, sixteen balloon leaders and ten-row BOM, original dimensions/material/thread notes and title BENCH VICE. Preserve the conflicting book artwork title only in notes. Final acceptance requires fully resolved native mechanism, measured screw/jaw travel, cold solved reopen, actual clearances and drawing export; no completion is claimed by this plan.

