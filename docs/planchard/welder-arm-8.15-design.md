# Exercise 8.15 — fresh welder arm designer example

Status: original designer plan revised after actual browser assembly fit checks, 3 October 2026. Fresh parts are saved and checked; assembly and drawing acceptance remain pending.

## Source and scope

Planchard physical PDF page 428 / printed 8-50 supplies a rendered assembly and BOM, but no dimensions. The companion parts and movement AVI are absent. The book permits original parts and asks for an ANSI assembly, movement, and an ANSI C landscape third-angle exploded isometric sheet with explode lines, BOM balloons, notes and title properties. Dimensions below are original millimetre choices, not inferred manufacturer dimensions. Every part starts blank in Chrome.

Primary visual references: [KUKA spot-welding applications](https://www.kuka.com/en-us/applications/automated-welding/spot-welding) for articulated welding arms, and [SCHUNK GAP angular grippers](https://schunk.com/us/en/gripping-systems/angular/radial-gripper/gap/c/PGR_1609) for paired hinged jaws. This example is an educational articulated fixture; it has no welding process, electrical system, actuator, payload or force rating.

All nine printed custom roles specify Cast Stainless Steel. The selected stock material is explicitly **Ferritic stainless steel, grade unspecified**, density 7.70 g/cm³, a declared geometric mass proxy. Preserve `BookMaterial=Cast Stainless Steel` and `MaterialProxy=Ferritic stainless steel, grade unspecified`. Density reference: [ISSF The Ferritic Solution](https://www.worldstainless.org/Files/issf/non-image-files/PDF/ISSF_The_Ferritic_Solution_English.pdf). It does not identify an equivalent cast grade.

## Frame and interfaces

World Y is vertical. WA01 origin is the floor centre. WA02 origin is (0,83,0). WA03 through WA08 use origin (85,83,0), with dimensions below relative to that origin unless stated. Datum axes remain native; no imported geometry or saved seed is used.

| Role | Qty | Original geometry and mating interface |
|---|---:|---|
|WA01 Base1 pedestal|1|Flange Ø100, Y0–8; conical neck Ø72 at Y8 to Ø36 at Y63; journal Ø24, Y63–103. Four Ø6.6 flange holes on PCD80. Journal axis Y, centre Y83.|
|WA02 Base2 yaw shoulder|1|Local cylinder Ø50 along Y−20–20, through bore Ø24.2; horizontal journal Ø20 along X24–105, local Y0/Z0. One millimetre overlap at cylinder tangent ensures fusion. Place at (0,83,0). Shoulder bore axis Y concentric to WA01, axial centre coincident.|
|WA03 Base3 pitch housing|1|Lower cylinder Ø50 along X−20–20; through Ø20.2 bore along X. Upper vertical collar Ø36, Y20–60, bore Ø24.2 only through Y20–60. Lower cylinder top is Y25, giving 5 mm collar overlap. Place at (85,83,0); native X bore concentric to WA02 journal.|
|WA04 Base4 wrist rotor|1|Spindle Ø24 along Y20–60, flange Ø50 along Y60–66. Place at (85,83,0). Spindle fits WA03 upper bore, leaving wrist yaw.|
|WA05 Midpiece|1|24×20×24 block, X/Z±12, Y66–86. Three Ø4 nominal cosmetic M4 tapped envelopes, blind4 from Y86 toward−Y, PCD18 at30/150/270°. These are nominal mating envelopes, not the smaller tap-drill diameter. Fixed to WA04 top by native face/datum mates.|
|WA06 Fixture|1|Ø50 disk along Y86–94, three Ø4.5 holes PCD18 at30/150/270°, plus two Ø5.5 vertical clearance bores X±15/Z0. Fixed above WA05.|
|WA07 Support|2|Bearing plate 6×30×60, own X−3–3, Y102–132, Z−30–30; two Ø6.6 through-X bores at Y117, Z±18, plus a vertical Ø5.5 through-Y fixing bore at own X0/Z0. Place X=85±15, Y83, Z0. Both plate feet at world Y185. Locked to holder at their actual seated locations.|
|WA08 Holder|1|Bridge 36×8×60, X±18, Y94–102, Z±30. Two vertical Ø5.5 fixing bores at X±15/Z0, plus three Ø4.5 through-Y fixture bores PCD18 at30/150/270°. Fixed to fixture top at world Y177. Supports seat on world Y185, on bridge ends.|
|WA09 Thong|2|Each 8 mm thick along X±4, pivot boss Ø16 in Y/Z at (Y117,Z18). Stem Y117–162, Z18–23; inward toe Y157–162, Z4–23. Merge stem/boss/toe with finite overlap. Left occurrence mirrored by a native 180° rotation about local Y (not a geometry seed); its pivot Z−18 and toe Z−4. Closed tip gap8. Through-X Ø6.6 pivot bore. Native concentric and axial seat mates leave one angular freedom per jaw.|
|WA10 fixture screw proxy|3|Fresh M4 socket-cap screw, chosen 20 mm shank, smooth nominal threaded shaft. Book tiny ANSI designation is not asserted as decoded.|
|WA11 jaw pivot screw proxy|2|Fresh M6 socket-cap screw, chosen 40 mm shank, smooth nominal threaded shaft, X axis. Spans the two supports and 8 mm jaw at each Z±18.|
|WA12 support screw proxy|2|Fresh M5 socket-cap screw, chosen 40 mm shank, smooth nominal threaded shaft, Y axis at bridge X±15/Z0.|

The page contains 12 roles / 18 occurrences: nine custom roles (Support and Thong each quantity two) plus hardware quantities 3/2/2. The metric hardware above is explicitly a designer proxy for the small printed ANSI hardware, not a transcription.

## Human authoring and verification

WA01: fully define Top origin circles Ø100, Ø72 and Ø36; flange Extrude8; section offsets8 and63; native solid Loft with Add material/Merge result; journal Top Ø24 at offset63, Extrude40; four source-sized flange holes. Check one native connected body, diameter/height100×103×100, and journal axisY. Save, export editable bundle and exact STEP, hard reload and reopen, then compare native/STEP volume and mass.

WA02–04: origin circles on Top and Right datum planes, exact offsets/depths above, finite-overlap merged extrusions and native through cuts. WA05/07/08 use fully defined centre rectangles and Hole Wizard or dimensioned circles. WA09 uses a fully defined closed stem/toe profile plus pivot boss and cut, all native. Fresh Toolbox hardware uses explicit length/material records and configuration QA if configured.

Assembly: fixed WA01, native concentric and axial seating for the three rotary interfaces, fixed midpiece/fixture/holder/supports; jaw bores seat on two X-axis pivot screws. Preserve measurable rotary freedom, apply genuine angle limits only after native mating and interference checks. Demonstrate yaw, shoulder pitch, wrist yaw and jaw opening with user-visible motion controls; companion AVI is unavailable, so do not claim its exact trajectory. Record raw clashes separately from declared smooth-thread contact; do not hide intersections.

Save/reopen each part and assembly, export native STEP and editable bundle, record actual Mass Properties, verify BOM18 occurrences, and generate the required ANSI C landscape third-angle exploded sheet. Include notes identifying original dimensions, material and hardware proxies, nominal cosmetic threads, and absent companion animation.

## Physical fit corrections from the fresh assembly

The original PCD30 M4 pattern collided with the support plates and did not align with the midpiece. PCD18 at30 degrees now places heads clear of the support inner faces X±12. M4 head seats at worldY185, tipsY165: Holder8 + Fixture8 + Midpiece4 mm nominal threaded engagement. M5 support screws now40 mm instead16, head seatsY215/tipsY175, through Support30 + Holder8 + Fixture2 mm clearance. M5 clearance bores in the fixture prevent a buried shank collision. Thread mating is represented by coincident nominal envelopes with cosmetic metadata, without helical flank geometry or a strength rating. These corrections retain the printed12 roles/18 occurrences.

