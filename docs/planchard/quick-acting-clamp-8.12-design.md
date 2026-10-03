# Exercise 8.12 — original screw clamp design

The printed page 8-47/PDF page 425 specifies an assembly, exploded C-ANSI drawing, BOM, balloons and title block, but gives **no part dimensions**. Its example shows two flanged supports, a long T-handle screw, paired inclined arms, a swivel at the screw end and a hanging jaw. The dimensions below are an original educational design for those roles, not dimensions measured from the illustration or a DESTACO product. All dimensions are millimetres. World X is left–right, Y is up, and Z spans the paired arms. The bench base top is Y=0.

## Kinematic datums and poses

| Datum | Closed | Open | Description |
|---|---:|---:|---|
| A | (−35, 80, 0) | fixed | Rear threaded trunnion pivot, axis Z |
| D | (0, 40, 0) | fixed | Paired arm ground pivot, axis Z |
| C | (25, 83.301, 0) | (−17.101, 86.985, 0) | Swivel-eye cross pin, `D + 50(cos θ, sin θ, 0)` |
| P | (40, 109.282, 0) | (−27.362, 115.175, 0) | Hanging-jaw pin, `D + 80(cos θ, sin θ, 0)` |
| Arm angle θ | 60° | 110° | Measured from +X about Z |
| Screw axis A→C | 3.15° | 21.32° | Rear nut and shaft swing together |
| Trunnion to eye distance AC | 60.091 | 19.214 | Shaft travel −40.877 |

Use a 4 mm right-hand lead for the demonstrator; closing from the open pose advances approximately 10.22 turns. The jaw withdraws 67.362 mm in X and rises 5.893 mm. A 30 mm hanging jaw places its bottom at Y≈79.282 closed. A 79 mm tall fixture on the bench can meet an adjustable soft pad at the jaw bottom. This is a kinematic educational mechanism with no claim of commercial holding force or safety rating. Set physical open/closed stops at θ=110°/60° and keep the screw eye and rear nut at least 3 mm apart in the open pose.

## Fresh part plan and initial placement

| BOM role | Qty | Local sketch / feature dimensions | Initial assembly placement |
|---|---:|---|---|
| Bench base | 1 | 100 X ×60 Z ×6 Y; four Ø6 through holes at X=±40, Z=±20 | Grounded; X=−50..50, Z=−30..30, Y=−6..0 |
| Arm support cheek | 2 | L bracket: upright X=−8..8, Y=0..48; foot X=−16..16, Y=0..6; 6 thick Z; Ø6 D bore | Z=−22..−16 and +16..+22; pin centers D. Lock both to base. Feet leave base mounting holes at X±40 exposed. |
| Arm support crossbar | 1 | X=−8..8, Y=8..16, Z=−16..+16 | Lock to both cheeks; safely below D and all swept arms. It makes the support a U shape without joining moving parts. |
| Rear nut support | 1 | Foot X=−45..−25/Y=0..6; upright X=−40..−30/Y=0..88; two 4 mm ears at Z=−10..−6 and +6..+10; coaxial Ø6 A bores in the ears | Lock to base; A at (−35,80,0). The open central slot Z=−6..+6 clears the swinging nut body. The foot clears the base holes at Z±20. |
| Arm plate | 2 | Local Front XY rectangle X=−8..88, Y=−6..6, extrude 6 in Z; Ø6 through bores at local X=0, 50, 80/Y=0 | Local origin D; rotate +60° about world Z. Z=−14..−8 and +8..+14. D, C, P are the three hole centers. Optional end rounds R6. |
| Threaded nut trunnion | 1 | Body 12 along local screw X ×14 local Y ×10 Z, centered at A; axial Ø8.2 bore through local X for the Ø8 lead screw. Integral Ø5.8 round journal stubs extend from Z=±5 to ±11.7 on the A axis. No Z through-bore or separate A pin. | Body Z=−5..+5 between the support ears; each journal enters a Ø6 ear bore at Z=±6..±10 and protrudes 1.7 mm past the outer ear for a retaining ring. Local X aligns A→C at 3.15° closed and swings to 21.32° open. The shaft rotates and advances through the axial bore. |
| Lead screw and T-handle | 1 each | Screw major Ø8, lead 4; local X extends at least −30..65 from its bore datum. Ø5.8 swivel nose at its distal end; transverse Ø5 handle rod through rear head. | Screw axis A→C, Z≈0. At open the rear handle overhangs the 100 mm bench footprint, as in the illustration. No interference claim for nearby external furniture. |
| Swivel eye | 1 | Central width12 in Z; axial Ø6 clearance recess from local X=−10..−6, crosspin Ø6 Z at local X=0; keep ≥3 mm web between recess and crosspin. | Crosspin at C, Z=−6..+6; recess receives the rotating shaft nose. The nose spins independently of the Z crosspin. |
| Hanging jaw block + adjustable soft pad | 1 each | Jaw width12 across Z, hinge Ø6 at its top P, nominal 30 vertical height; pad adjustment near lower face. | Between arms at P, Z=−6..+6; add a ground-referenced orientation mate or a second stabilising link if the jaw must stay vertical through motion. |
| Pivot pins and retainers | 3 separate pins, retainers as needed | Ø5.8 shafts for Ø6 clearance bores. D pin≈48 long; C and P pins≈32 long; shoulders/retainers outboard. Add two retaining rings to the integral A journals. | D passes through both support cheeks/arms; C and P pass through paired arms and the center eye/jaw. The trunnion journals serve as the A pivot. |

The near-horizontal long screw and paired plates reproduce the *roles* visible in the book figure. All metal parts can start from fully dimensioned rectangles/capsules, through holes and simple extrudes; a displayed thread may be cosmetic. Jaw guidance and stops are required for a working fixture but are not dimensioned in the book.

## Mate plan and motion

1. Ground the bench base. Lock the two arm cheeks, their crossbar and the rear nut support to the base.
2. At A, mate a trunnion's integral Ø5.8 journal concentrically to a fixed support Ø6 ear bore, then mate an axial journal/body face to center the nut between the ears while retaining Z rotation. There is no cross-pin through the screw bore.
3. Mate the nut bore to the screw shaft using **Screw → Couple rotation and travel**, pitch 4 mm/turn. This optional mode leaves one helical freedom; the older prescribed-turns Screw mate remains available.
4. Mate the shaft nose to the swivel eye coaxially and axially at its shoulder. This permits shaft spin without rotating the cross pin.
5. Concentric + axial face mates connect eye to both arms at C, arm plates to supports at D, and jaw to arm plates at P. Lock the paired arms to each other through an assembly mate or make the paired plates a rigid subassembly; otherwise their mirrored freedom is counted twice.
6. Keep the jaw vertical with a ground-referenced planar angle relation, or add a physical parallel stabilising link. A free jaw hinge otherwise contributes another DOF. An adjustable pad may be locked for one motion study and reset between studies.
7. In Motion Study choose **Screw mate** motor, select the coupled mate and enter rpm/time. The native evaluator divides a direct time seek into at most quarter-turn steps so it follows the same linkage branch through the 10.22-turn travel. Its motion is kinematic, not a contact-force simulation.

The native solver now groups loops through grounded parts for a simultaneous solve. A synthetic grounded trunnion/shaft/swivel-eye/arm loop retains one DOF when the screw is free and resolves with zero DOF when driven. Source-level tests cover positive/negative turns, a direct ten-turn motion seek, saved JSON replay, legacy Screw behavior and a twelve-joint chain remaining decomposed. Browser-built geometry, interference and full drawing acceptance remain to be checked against this part plan.

## Trunnion clearance check

The nut body's Ø8.2 axial bore leaves 2.9 mm of material above and below it in the 14 mm high body, and 0.9 mm across Z before each integral journal starts at Z=±5. A Ø5.8 journal spans each support ear's full Z=6..10 or −10..−6 thickness; its round section remains centered at A as the nut swings. The nut body stays in the support's open Z=−6..+6 slot. At θ=110°, the A–C distance is about 19.214 mm: the nut's front axial face at A+6 mm and the eye's rear axial face at C−10 mm are separated by about **3.214 mm** along the screw axis. The support slot is open above the base, including where the nut body's rotated upper corner reaches Y≈88.7 mm. These are nominal design clearances; the completed browser assembly still needs an interference check.

## Sources

- Planchard, *Engineering Graphics with SOLIDWORKS 2021*, exercise 8.12, PDF p425 (supplied local copy).
- [DESTACO explanation of over-center toggle action](https://www.destaco.com/resources/blogs-and-insights/2000-series-hold-down-action-manual-toggle-clamps). This design follows the book's pictured screw mechanism; the toggle reference is context, not a copied product design.
- [DESTACO 201 hold-down clamp dimensions and opening examples](https://www.destaco.com/clamping/manual-clamping/hold-down-clamps/hold-down-clamps-201). Its ratings and geometry are not assigned to this educational assembly.
