# Exercise 8.14 — fresh double-pulley design plan

Status: design plan, 3 October 2026. DP01 base through DP09 nut have since been authored and cold-reopened in Chrome; measured acceptance is recorded in `double-pulley-8.14-browser-progress-2026-10-03.md`. DP10 turn screw, DP11 belt, assembly, motion and drawing are still pending. This supplements `remaining-book-audit-2026-10-03.md`; it does not replace its acceptance queue.

## Evidence and scope

The user-supplied Planchard PDF, physical page 427 / printed page 8-49, requires an ANSI pulley assembly, movement based on companion AVI, and an ANSI A landscape third-angle isometric exploded drawing with explode lines, BOM, balloons, notes and title properties. The page explicitly permits original parts and additional components. Its bottom figure is titled **Double Pulley Assembly**, whereas the upper figure shows one pulley support. The bottom BOM is the appropriate inventory for this project.

The page supplies no component dimensions. The sample-part folders and AVI are referenced but unavailable in this workspace; a filename or rendered figure is not dimensional source data. All dimensions below are **original designer choices in millimetres**, not measured book dimensions or manufacturer product dimensions. Use fresh blank Chrome part documents and fresh occurrences; no old model may seed them.

Primary research reference: [SDP/SI Handbook of Timing Belts and Pulleys](https://shop.sdp-si.com/products/synchronous-drive-belts-pulleys-cables/handbook-of-timing-belts-and-pulleys.html), particularly belt sizing and centre-distance discussion. It informs the distinction between pulley effective diameter, belt length and centre distance. This design uses a smooth round belt, not the handbook's manufactured synchronous teeth. The ideal no-slip motion relationship is a declared educational simplification; no friction, tension or torque rating is inferred.

## Printed bill of parts

The figure has **11 part types, 28 occurrences**. Preserve these quantities and printed materials in custom properties, even if a geometric trial uses a temporary display colour.

| Item | Book part number | Role | Quantity | Printed material |
|---|---|---|---:|---|
|1|6|Pulley base|1|Balsa|
|2|5|Bracket|2|Alloy Steel|
|3|2|Brace|4|Alloy Steel|
|4|8|Hex nut|6|Alloy Steel|
|5|4|Support|2|Alloy Steel|
|6|9|Screw cap|4|Alloy Steel|
|7|10|Turn screw|2|Alloy Steel|
|8|3|Bushing|2|Alloy Steel|
|9|1|Pulley|2|Alloy Steel|
|10|7|Washer|2|Alloy Steel|
|11|11|Belt1-1|1|Silicon Rubber (printed wording)|

Use `Silicone rubber` as the descriptive material name if the app offers it, while retaining the exact book wording in `Source material`. Do not invent density to meet an unprinted target mass. Balsa is a demonstrator base, not a structural load-rating claim.

Material density references: assign the nine steel roles to **Alloy Steel (SOLIDWORKS reference)**, a distinct stock entry with density **7.70 g/cm³**. The official [SOLIDWORKS Simulation API material example](https://help.solidworks.com/2024/English/api/swsimulationapi/Apply_Material_to_Bodies_Example_VBNET.htm) names Alloy Steel and supplies DENS 7700 kg/m³, EX 210 GPa and Poisson ratio 0.28; the equivalent [2024 C# example](https://help.solidworks.com/2024/english/api/swsimulationapi/Apply_Material_to_Bodies_Example_CSharp.htm) exposes the same values. This is an educational, unspecified-grade CAD reference, not Cast Alloy Steel (7.30 g/cm³) and not a certified load-bearing grade. Elastic reference constants do not populate qualified strength inputs automatically.

For the Balsa base, use the declared custom nominal density **0.155 g/cm³** from [Gurit Balsaflex 150 datasheet, mechanical performance table](https://www.gurit.com/wp-content/uploads/bsk-pdf-manager/2022/08/balsaflex.pdf): 155 kg/m³, with a published typical range 135–176 kg/m³. This manufacturer end-grain balsa-core reference is a chosen proxy, not a claim that the book's generic Balsa or a SOLIDWORKS material library has that exact value. Preserve the printed Balsa identity plus the chosen reference source in custom properties.

## Chosen layout and dimensions

World X separates the pulleys, Y is vertical, and Z is the parallel shaft direction. Base occupies X −110…110, Z −60…60, Y 0…12. Nominal pulley axes are **(X,Y) = (−50,65) and (+50,65)**, parallel +Z; both groove centre planes are Z=20. Centre distance is 100. Lowest belt surface is Y=33, leaving 21 above the base.

| Fresh part | Chosen editable geometry |
|---|---|
|Base|220 × 120 × 12 rectangular plate; two Ø6.6 fixing bores. Establish their centres from bracket feet after the foot layout is frozen; do not guess independent hole positions.|
|Bracket, twice|Revised frozen local foot X−22…22, Z−30…26, Y0…6; **8 mm upright** X−22…22, Z−30…−22, Y6…94. Insert at X±50,Y12,Z0. One Ø6.6 fixing bore per foot at local X0/Z0 (world X±50/Z0). Guide opening 36.4 X ×32.4 Y, centred local X0/Y53, local Y36.8…69.2, world centre Y65. Adjustment bore Ø6.45 at local Y53/Z−26, along X from +22 reverse 3.8 through only the right wall. The original 4 mm upright trial could not contain this bore and is superseded. The other two cap screws retain the pulleys.|
|Brace, four|Right triangular side gusset with fully defined original sketch legs 48 Y and 36 Z, thickness 4 X. A through Ø13 circular relief centered at local (Z,Y)=(−4,47) mm removes the jam-nut interference crest; the actual solid's height is 45.061185 mm. Foot datum Y6, upright datum Z−22; place outside the guide at bracket-local X−26 or +22. The relief leaves 0.7265 mm nominal radial clearance from an AF10 jam nut at that axis. Keep clear of the support opening and belt envelope.|
|Support, twice|36 X × 32 Y × 18 Z block, centred on the nominal shaft axis, Z −30…−12; merged Ø12 shaft to Z28.2 and integral Ø18/Ø6.6 shoulder Z10…11.8. Shaft is fixed to the support. Ø6.6 axial through-bore and Ø6.45 transverse adjustment bore are present in the accepted fresh Chrome source.|
|Bushing, twice|Plain annulus OD16, ID12.2, length16.4 along Z; occupies Z11.8…28.2 between the support shoulder and front washer. Separate purchased-style proxy, not a bearing-performance claim.|
|Pulley, twice|Revolved annulus OD66, bore16.2, total axial width16, occupies Z12…28; bore clearance around bushing OD16. Groove centred at Z20: width4.4, root radius28, flange radius33. A rectangular-bottom groove is a simplified demonstrator form. The accepted Chrome part uses Revolve blank plus a separate editable Revolve Cut groove.|
|Washer, twice|OD22, ID6.6, thickness2; captures the pulley front face without touching its rotating bore. Place just ahead of the pulley at Z28.2…30.2.|
|Screw cap, four|One fresh definition with two length configurations: two M6×25 bracket fixing bolts and two M6×70 axial pulley-retention bolts. Axial bolts pass through the support Ø6.6 bore to rear nuts. Lengths are designer choices, not printed standard callouts.|
|Hex nut, six|Two M6 fixing nuts below the base, two M6 retention nuts behind the support at Z−35.2…−30, and two M6 turn-screw jam nuts. Use one fresh native ISO 4032 M6 nut definition: 10 mm across flats, 5.2 mm thick, nominal Ø6 cosmetic threaded bore. Six occurrences. The earlier 5 mm thick/Ø6.6 proxy is superseded.|
|Turn screw, twice|Fresh M6 adjustment stem **X4…27.2** (length23.2), head X27.2…32.2 (Ø16 ×5); ISO 4032 jam nut X22…27.2 (5.2 thick) seats between bracket outer face X22 and head. Axis follows bracket local Y53/Z−26 along X. The stem engages the support bore from X18 to X4 for14 mm and stops1 mm clear of the axial M6 bolt's radius3 envelope about X0. Its earlier X−3 tip crossed the axial bolt and was revised through Chrome after native interference detection. Support's local adjustment bore is at Y0/Z−26 when its placement datum is at world Y65. Nominal adjustment is locked after placement; cosmetic threading does not establish a manufactured fit.|
|Belt, once|Closed round-section sweep, Ø4 cord. Centre path is two R30 semicircles about the nominal axes joined by two 100-long horizontal tangents at Y35 and Y95, all in Z20. Ideal centreline length is 200+60π = **388.4956 mm**. No manufactured belt-length tolerance or preload is claimed.|

The four printed cap screws are assigned two to bracket fixing and two to axial pulley retention. Their two lengths must be named configurations of the fresh screw definition; the BOM may separate configuration rows while its aggregate remains four cap screws. The six nut roles above sum to the printed six. For each base fixing, an M6×25 screw seats under its head at world Y18, crosses the 6 mm bracket foot and 12 mm base, and ends at Y−7. A 5.2 mm ISO 4032 nut seats at Y−5.2…0, leaving 1.8 mm shaft past it. For each axial retention, an M6×70 screw seats under its head at Z30.2, passes through the washer and support bore, and ends at Z−39.8. Its 5.2 mm nut seats against the rear support at Z−35.2…−30, leaving 4.6 mm shaft past it.

### Mechanical seating correction before assembly

The DP04 support and DP05 bushing were revised in real Chrome and accepted after protected native export and cold reopen. The Ø12 support shaft now ends at Z28.2 and has an integral Ø18 shoulder whose front face is Z11.8. The 16.4 mm bushing occupies Z11.8…28.2. The pulley remains Z12…28 and washer Z28.2…30.2. This provides shoulder and washer seats for the bushing and nominal 0.2 mm axial clearance for the pulley at each face; the Ø16 bushing has 0.1 mm radial clearance within the Ø16.2 pulley bore. The M6×70 screw and ISO 4032 nut form the proposed clamp stack. No extra BOM role was needed. Whole-assembly interference and contact remain to be verified after mating.

The 16.2 pulley bore gives 0.1 radial clearance around the 16 bushing. The groove's Ø4 belt contacts its R28 root at nominal R30 centreline; side clearance is 0.2 per side. The proposed corrected bearing seats and end clearances need a real assembled interference/contact audit before acceptance. The circular cord sweep must remain separate from both pulley bodies.

## Human UI construction sequence

1. Set new-part units to mm; create the base from a fully defined centred rectangle and Extrude. Create a bracket through an L profile/Thin Extrude or separate merged foot/upright extrusions; cut its guide opening. Create the triangular brace as a separate part. Use native Hole Wizard for the fixing interfaces after their positions are fixed.
2. Build the support from a fully defined rectangle and a merged concentric shaft extrusion. Add the actual axial retention and transverse adjustment holes. Save native, editable definitions; verify one body per intended part.
3. Sketch each plain bushing annulus and extrude; no flange is added. Sketch the pulley radial/axial annular blank and Revolve 360°, then sketch the groove profile and Revolve Cut 360° as the accepted Chrome part does. Use native bore and cap faces for later mates.
4. Build the belt's closed tangent line/arc centre path through real sketch tools. Make its Ø4 profile on a normal datum at the path start, then native Sweep. Require native success, a continuous closed solid and preserved path tangencies; never substitute a rendered tube mesh for a failed sweep.
5. Create fresh native Toolbox M6 hardware through the visible picker, with chosen lengths and representative/cosmetic-thread limits retained. Build the knob/turn screw through native sketch/revolve/extrude if its form is absent from the picker.
6. Save every part, export protected checkpoints, and reopen them before assembly insertion. Enter book part numbers, material/source wording and descriptions in actual custom-property controls.
7. Create a new blank assembly and ground the base. Use planar Coincident/Distance mates to seat brackets and braces. Locate each support with native guide planes; lock its nominal adjustment only after dimensional verification. Add concentric/axial mates for the bushing and pulley. Bushing/support stays fixed; each pulley retains rotation.
8. Retain rotating pulleys axially with genuine cap-face spacing. Attach washers/retention screws to the fixed support, not to the rotating pulleys. Fasteners must not remove the intended pulley rotation. Evaluate every interface natively.

## Motion and gap checks

With identical effective diameters, an open belt requires same-direction **1:1** rotation. Current source has a Gear mate `reverse` branch expressly intended for a same-direction belt, but no dedicated Belt mate was found in `cad_mate_model.js` or `cad_mate_solver.js`. A native Gear mate in same-direction mode can supply the ideal rotational coupling only if the assembly/property notes explicitly call it a **belt-drive kinematic proxy**. It does not prove rolling contact, friction, belt tension or material transport. Prefer a user-visible Belt mate wrapper with diameter/length semantics if implemented before this workflow.

Use one native rotational input; record driver/follower angles at 0°,90°,180°,270°,360° and verify equal change/sign after Save/reopen. Final assembly should have one intended rotary DOF after coupling, with all fixed supports and hardware constrained. The axis references must be oriented consistently before interpreting sign. Evaluate native interference at the five poses; a circularly symmetric pulley may make unchanged geometry valid, but saved mate movement still needs visible verification.

The belt's capsule geometry is stationary in an ideal smooth-belt CAD animation; no claim of material-point movement may be made without belt animation. Adjustment screws are static at the nominal 100 centre distance. Moving a support would require changing belt path/length or a genuine flexible/tension model; do not animate that adjustment against the unchanged rigid belt.

## Required sheet and acceptance evidence

Create the actual **ANSI A / Letter landscape, 279.4 ×215.9 mm**, third-angle assembly drawing. Use a saved isometric exploded view with grouped offsets: hardware along Z, pulleys/bushings along Z, belt away from the groove plane, then brackets/supports and base. Add explode leaders, item balloons for all part types, BOM with true quantities/configurations, and notes declaring original dimensions, ideal belt kinematics, representative threads and absent companion files. Populate name/date, title `Double Pulley Assembly`, drawing number, revision, material policy and projection convention in the saved title block.

Acceptance requires fresh Chrome construction, native one-body part checks, saved/cold reopened assembly and intended DOF, sampled motion, native clearance/contact audit, portable bundle, native STEP, and exported sheet inspected for BOM/balloon/leader completeness. DP01 base through DP07 washer meet the individual part construction, native, STEP and cold-reopen checks; the other four roles and assembly-level acceptance remain open.

## Source capability update — Belt mate

A distinct `belt` topology mate is now implemented in source. Its persisted parameters are effective diameters in canonical centimetres and `beltDirection: open|crossed`; it does not store fictional tooth counts. The visible Belt mate command, mate palette, SmartMate form and inspector expose diameters in document units and label the coupling honestly. The existing angular residual solver is shared with Gear mates: open means same direction, crossed opposite. No belt geometry, tension, contact or material transport is created. Numeric edits accept Enter. Actual Chrome acceptance is still pending.

Focused regressions verify mm/in conversion, invalid inputs, actual form output, 60:90 ratio in both directions, one remaining rotary freedom, JSON reopening and a native rotary motor following the persisted Belt mate without a separate gear relation. Belt-specific persisted phase history now unwraps successive manual rotations across the Euler seam. A rotary motor on pulley A supplies its explicit unwrapped angle through a saved motion-study baseline, allowing arbitrary whole-turn seeks and reopening for noninteger diameter ratios. Tests exercise open/crossed 2:3 motion at positive, negative and multiple whole turns, seek back to zero, and cold native solve after every JSON reopening. Gear behaviour remains unchanged. A single manual orientation jump cannot specify an unknown number of whole turns; use a rotary motor for that intent.
