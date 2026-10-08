# Exercise 8.18 — original Kant Twist clamp proposal

**KT01–KT07 accepted through Chrome2026-10-08; remaining definitions and assembly pending.** See `kant-twist-8.18-KT01-acceptance-2026-10-08.md`. Book location: printed8-53/PDF431, following the vice at8-52/PDF430. 8.17 is accepted in `bench-vice-8.17-final-acceptance-2026-10-08.md`. This is an original educational cantilever mechanism, not a reconstruction of unavailable companion dimensions or a rated commercial clamp. The analytic layout below precedes browser authoring; actual native solids, reference binding, motion and exact interference acceptance remain required.

Frozen revision: **postX40,100×60 foot,60×24 stand head centeredX18, handle setback22mm**. Earlier draft postX0 and handle setback14.2mm are rejected: the former crossed the handle bar; the latter admitted a grip/BraceA rear-cap clash during full roll. These revisions were made before any8.18 geometry was authored. Read the current dimensions below, not the earlier chat proposals.

## Source, role inventory and limits

The rendered source is `scratch/planchard/p/designer-431.png`. Enlarged read-only BOM crops are `scratch/planchard/kt-bom-source-431.png` and `kt-bom-bottom-431.png`. The book permits original parts and additional components. It requests proper movement and a **C-ANSI landscape, third-angle isometric exploded drawing**, explode lines, BOM/balloons, general notes and custom title properties. Companion parts and AVI are unavailable.

[Industrial Magnetics' official T-handle page](https://www.magnetics.com/products/kant-twist-t-handle) supports the cantilever principle and free-floating jaws accommodating uneven surfaces. It does not supply dimensions for this design. No4:1 force ratio, rated capacity, material grade, manufacturing fit, thread load transfer or safety certification is asserted. The book's15 rows total22 occurrences: Base1; HingeA1; BraceA2; PinA4; GripA1; CR-PHIL retaining hardware2; BraceB2; PinB2; HingeB1; GripB1; Shaft1; Handle shaft1; Handle grip1; CB-bh hardware1; another CR-PHIL item1. Exact fastener-code raster transcription remains provisional; do not assign a certified standard from it. Metal rows say Alloy Steel; handle grip says Rubber.

This proposal keeps those15 role definitions, adds **KT16 spacer sleeves**, and adds one KT06 retaining screw. It therefore has **16 fresh definitions /25 occurrences**. The additions retain the longer common jaw pin on the inner brace pair and retain the fourth PinA. The permitted additions must be disclosed in the final BOM/source note. Metal material can use the existing Alloy Steel educational reference7.70g/cm³ with the established provenance; rubber grade/density must be selected from an explicitly sourced app material before mass acceptance.

## Frozen frame and one-DOF path

All dimensions millimetres. WorldY is up, Z spans the paired plates, X points toward the jaws. The ground pivot is **P=(0,150,0)**. The coordinates below are in the clamp frame relative to P unless explicitly world coordinates.

The outer BraceA pair is fixed to the bench fixture at **two** pins, P and Q, so grounding is physically supported by two separated connections. The inner BraceB pair rotates about P through **0≤θ≤atan(3/4)=36.869897645844°**, positive about+Z. Initial θ0 is the open pose. Two swiveling rear trunnions and a rotating threaded spindle form the actuated closed loop. Both jaw blocks have actual Z-axis swivel joints; a disclosed **flat-workpiece configuration** keeps their clamping faces parallel to the stand Top datum. Removing those two orientation guides gives the expected extra free jaw swivels; do not call that unrestricted configuration one DOF.

Fixed centers:

- P=(0,0); second ground/tie pin **Q=(45,315/13)=(45,24.230769230769)**.
- Upper jaw **JA=(65,35)**.
- Captured screw trunnion **RA=(−25,−45)**.

Moving centers, with radians in the equations:

`RB(θ)=(−25 cosθ−45 sinθ, −25 sinθ+45 cosθ)`

`JB(θ)=(65 cosθ+35 sinθ, 65 sinθ−35 cosθ)`

`u(θ)=(−sin(θ/2), cos(θ/2),0)` is the spindle axis from RA toward RB. Both trunnions yaw **α=θ/2** aboutZ; the spindle spins about its local+Y axis in that yawed frame. The loop equation is `RB−RA=L u`, where:

`L(θ)=sqrt((25−25 cosθ−45 sinθ)²+(45−25 sinθ+45 cosθ)²)`

Original ideal lead **2 mm/revolution**. Define positive *closing progress* `N=(90−L)/2`; the actual sign of the native Screw mate's Drive turns must be established in Chrome by one small measured trial, rather than inferred from a viewport axis. Capture the open θ0 axial zero/phase first. At the end stop, **RB=(−47,21)**, **JB=(73,11)**, `L=22 sqrt(10)=69.570108523704 mm`, and `N=10.214945738148` turns. Jaw blocks are14 mm high, so opening is **g=21−JB.y**, decreasing monotonically from56 to10 mm. No toggle singularity occurs: the rear links would reach coincident directions only outside the allowed angle interval.

| θ degrees | RB X/Y | JB X/Y | Trunnion span L | Closing progress N | Jaw opening |
|---:|---|---|---:|---:|---:|
| 0 | −25 /45 |65 /−35 |90 |0 |56 |
| 10 |−32.434362 /39.975144 |70.090190 /−23.181140 |85.299736 |2.350132 |44.181140 |
| 20 |−38.883222 /33.735664 |73.050725 /−10.657932 |79.950289 |5.024856 |31.657932 |
| 30 |−44.150635 /26.471143 |73.791651 /2.189111 |73.992372 |8.003814 |18.810889 |
| atan(3/4) |−47 /21 |73 /11 |69.570109 |10.214946 |10 |

In the planar linkage, θ and the two trunnion yaw angles initially provide three freedoms; line incidence and axis alignment remove two. Spindle roll adds one freedom; ideal screw lead coupling removes one. The guided-jaw configuration therefore leaves one physical actuator DOF. A specified drive value removes that final DOF. This is an analytic count, not a claim that the current browser's native solver has already accepted this particular loop.

## Plate contour and exact browser entry

BraceA is a14 mm wide, square-ended strip along `RA→P→JA`, with a miter at P. Its closed Front-plane outline, in U=X/V=Y, is the six vertices below in order. Enter to at least six decimal places; dimensions/centers remain the authoritative interfaces. BraceB uses the same outline reflected **V→−V** and reversed vertex order. No script may insert the geometry: draw the closed polyline in Chrome, then commit each selected vertex's exact U/V coordinates and apply ordinary fixed-point constraints before cutting the precisely dimensioned holes. A native workflow gap in exact polyline entry should be repaired before replacing this with injected geometry.

| Vertex | U | V |
|---|---:|---:|
|1 |−34.518601451101 |−47.719600414600 |
|2 |−5.123579703923 |5.191438730321 |
|3 |67.844598938210 |44.481996460700 |
|4 |74.481996460700 |32.155401061790 |
|5 |5.123579703923 |−5.191438730321 |
|6 |−22.280399585400 |−54.518601451101 |

The ground support rail uses a12 mm wide square-ended strip along `P→Q`, centered in Z±9, merged into the stand head. Its end vertices can be entered by the same formula `center±6u±6n`, where `u=(65,35)/sqrt(5450)` and `n=(−35,65)/sqrt(5450)`; start end is at`−6u`, far end at`Q+6u`. Cut the P/Q bores through the merged stand after the rail is added. Square ends keep the interface holes enclosed; decorative fillets are optional only after clearance acceptance.

## Fresh native definitions and home placement

All source documents start blank, set units mm, preserve named datums, and save separate PartNo/BookItemNo properties. Front usesU=X/V=Y and extrudes alongZ; Top usesU=X/V=Z; Right usesU=Z/V=Y. Sources use the local dimensions below. Home placements add the world P offsetY150 where specified. Do not seed any definition from the previous clamp, vice or Toolbox.

| PartNo /book role | Qty | Frozen local features | Home assembly placement |
|---|---:|---|---|
|KT01 Base |1 |Base X±50,Z±30,Y0..8, fourØ6 mounting holes atX±35/Z±20. Merged Ø16 post alongY8..144, centeredX40/Z0. Merged stand head X−12..48,Z±9,worldY138..162. Merged12-wide ground rail P→Q atworldY+150, Z±9. Through-ZØ8.2 holes at worldP andQ. One connected welded-fixture proxy. |Identity, grounded. The rail/second pin anchors BraceA; no unsupported orientation Lock. |
|KT02 HingeA |1 |Ø16 barrel alongZ−16..16. CrossboreØ10.2 alonglocalY through barrel. IntegralØ6 journals: positiveZ16..20.2; negativeZ−20.2..−16. Negative integral retaining flangeØ10,Z−22.8..−20.2. Positive blindØ3.2 nose boreZ17.2..20.2. |Origin RA world(−25,105,0); homeRz0. Moving trunnion yaw α. |
|KT03 BraceA |2 |Six-vertex Front outline above, Front offsetZ17, extrusion3 toZ20. Through-Z holes:Ø6.2 atRA; Ø8.2 atP,Q,JA. |PositiveT=(0,150,0); negativeT=(0,150,−37), givingZ−20..−17. Ground both via the separatedP/Q connection. |
|KT04 PinA |4 |FreshØ8 shaft alongZ−20.2..20.2; integralØ12 headZ−23.2..−20.2. Blind nominalØ4 thread envelope fromZ20.2 back to16.2. |Centers worldP,(45,174.230769231,0),JA=(65,185,0), andJB=(65,115,0). Lock P/Q/JA pins to fixed fixture/BraceA; JB pin follows BraceB. |
|KT05 GripA |1 |Front rectangle24X×14Y, center0, extrude Z−16..16. Through-ZØ8.2 swivel bore centered0. Lower faceY−7 is clamping face. |JA world(65,185,0), Rz0; actual revolute swivel aroundJA with flat-workpiece orientation guide. |
|KT06 CR-PHIL retainer proxy |3 |Fresh+Z nominalØ4 stemZ−4..0; Ø12 retaining headZ0..2. Cosmetic thread only; original oversized retaining head, no standard inferred. |Positive PinA endZ20.2 atJA,JB,Q. Source illustration has2; third is explicitly added forQ. Lock each to its pin. |
|KT07 BraceB |2 |Reflected BraceA outline; Front offsetZ11, extrude3 to14. Through-Z holesØ6.2 atRB=(−25,45), Ø8.2 atP andJB=(65,−35). |PositiveT=(0,150,0); negativeT=(0,150,−25), givingZ−14..−11. Pair rigidly connected; rotate together aboutP byθ. |
|KT08 PinB cap proxy |2 |Fresh+Z Ø3 stemZ−3..0; Ø10 retaining headZ0..2. Original unloaded retention hardware, smooth nominal thread envelope. |One atRA worldZ20.2, one atRB worldZ14.2. Lock to respective trunnion; follows yawα, not brace yaw. |
|KT09 HingeB |1 |Ø16 barrel alongZ−10..10. Smooth nominalØ10.2 threaded bore alonglocalY, cosmetic designer lead2mm. PositiveØ6 journalZ10..14.2; negativeØ6 journalZ−14.2..−10, negativeØ10 flangeZ−16.8..−14.2. PositiveØ3.2 blind boreZ11.2..14.2. |WorldRB+P; home(−25,195,0), Rz0; yawα while its center followsBraceB. |
|KT10 GripB |1 |Fresh Front rectangle24×14 centered0, Z−10..10. Through-ZØ8.2 swivel bore. Upper faceY+7 is clamping face. |WorldJB+P; home(65,115,0), Rz0. Through motion it stays globallyRz0 in the flat-workpiece configuration and swivels relative toBraceB. |
|KT11 Shaft |1 |Ø10 stock alonglocalY−28..110. MergedØ18 handle hubY−28..−8.2; mergedØ18 capture collarY8.2..11.2. Crossbar boreØ6.2 alongX atY−22,Z0, through hub. Cosmetic original right-hand lead2mm fromY11.2..110. |OriginRA world(−25,105,0). Initial roll0; through motion rotation isRz(α)Ry(φ). Axial capture atHingeA fixes origin atRA; no artificial world-axis translation. |
|KT12 Handle shaft |1 |FreshØ6 cylinder alongX−32..32. Blind nominalØ4 hole along+X from−32..−28 atits negative end for grip screw. |Home(−25,83,0), axisworldX; rigid with shaft, centered on hub crosshole. |
|KT13 Handle grip |1 |RubberØ14 body alongX−40..−16. BlindØ6.2 socket fromX−16 back to−32; throughØ4.4 fastener passage from−40..−32, meeting socket. One body, original cylindrical proxy; end rounding optional after fit acceptance. |Same origin as handle shaft; rod tipX−32 seats on socket floor. Lock tobar. Material/density provenance must be resolved before mass acceptance. |
|KT14 CB-bh grip screw proxy |1 |Fresh+X Ø4 stemX−12..0, Ø8 headX0..3. No certified standard inferred. |Homeworld(−65,83,0), Ry180: stem runsworldX−65..−53 through rubber and4mm into bar tip; head is outboard. Lock tobar/grip. |
|KT15 CR-PHIL main retainer proxy |1 |Fresh+Z Ø4 stemZ−4..0, Ø12 headZ0..3, independently authored even though similar toKT06. |WorldP withZ20.2, retained mainPinA. |
|KT16 added spacer sleeve |2 |Fresh annularØ12/Ø8.2 profile, localZ0..6. |At movingJB, positiveZ14.2..20.2 and negativeZ−20.2..−14.2; lock toJB pin. Bridges the inner brace-to-common-pin retention spacing. |

### KT01 immediate blank-document workflow

Use world bench coordinates in this source and leave its assembly transform identity. Author stock first, then holes. Expected six features/six sketches/twelve history entries and one connected native solid:

1. Top centered rectangle100×60, U/V0, offsetY0; extrude8 Along normal+Y.
2. Top fixed circleD16 atU40/V0, offsetY8; extrude136 toY144, merged.
3. Front centered rectangle60×24, U18/V150, offsetZ−9; extrude18 toZ+9, merged.
4. Front closed four-point rail outline below, offsetZ−9; extrude18, merged.
5. Front fixed circlesD8.2 atU0/V150 andU45/V174.230769230769, offsetZ−9; ThroughAll+Z cut.
6. Top four fixed circlesD6 atU±35/V±20, offsetY0; ThroughAll+Y cut of the foot stock.

Rail vertices in world-source U/V order:

|Vertex |U |V |
|---|---:|---:|
|1 |−8.127425537743 |152.438227661323 |
|2 |47.438227661323 |182.358194768512 |
|3 |53.127425537743 |171.792541569446 |
|4 |−2.438227661323 |141.872574462257 |

The post overlaps the head by6mm, and the rail's rear cap lies inside that head; these are intentional unions within the same part. The overall source bounds are approximatelyX−50..53.127426,Y0..182.358195,Z±30. Mounting-hole minimum radial edge margin is7mm. Post footprintX32..48 lies2mm inside the foot edgeX50. Rail/P/Q geometry is original and mathematically driven, not a measurement from the manufacturer. Apply/Enter each edited numeric field and explicitly finish/rebuild before accepting native mass or exporting.

Trunnion journals are **integral side spigots**, not a solid pin through the screw bore: a through Z pin atRA/RB would physically intersect the threaded spindle. Every blind spigot/nose cut must stop short of its crossbore. Retaining flange/head faces have0.2mm clearance to plate outer faces; barrel end faces leave1mm to plate inner faces. The smooth threaded envelopes and nominal clearance represent ideal joints, not force-transfer surfaces.

## Continuous layout checks before native bodies exist

These are analytic geometry bounds for the frozen layout. They do not substitute for exact native pairwise intersections after actual browser creation.

- A plates occupyZ±17..20; B plates occupyZ±11..14. Their crossings therefore have3mm material separation. The stand/ground rail is Z±9, leaving2mm to B plates. GripA spansZ±16 and GripBZ±10, each1mm from its supporting inner plate faces.
- The trunnion center separation never drops below69.570109mm; twoØ16 barrels therefore stay far apart. The shaft passes through theirØ10.2 bores with0.1mm radial clearance. Capturing hub/collar faces atY±8.2 leave0.2mm to theØ16 HingeA barrel's extremities. Shaft protrusion beyondHingeB is20mm open and40.429891mm closed; it points into the rear sectorX≤−25, away from the jaws and stand centerline.
- Jaw material remains separated by g≥10mm. Over the interval, JB.x≥65; the jaw footprints overlap at least16mm in X. The optional **additional reference workpiece** is X61..77,worldY168..178,Z±6 at the closed pose: touches both jaw faces but intersects neither. It is not in the initial25-occurrence count.
- Q is on the fixed front-arm centerline. At the closed limit the moving front-arm centerline differs by19.73066°; Q's perpendicular separation is about17.25mm. Subtracting the7mm strip half-width and4mm crossing-pin radius leaves over6mm. Q's pin also remains at least4mm in X from the moving jaw body. End-cap checks must accompany these line bounds in the native audit.
- Main/JA/JB pins occupy their ownØ8.2 bores with0.1mm radial clearance; Q is clear of the moving strip. Spacer bores give the same clearance to theØ8 pin. Spacer and retaining heads nearJB remain belowJA material and outside the opposing plate band.
- The handle is offset**22mm** behindRA along−u. Its grip has axial projection at most−15mm relativeRA, while the entire square-ended BraceA strip has axial projection at least`−7 sqrt(2)=−9.899495mm`: continuous separation is at least**5.100505mm**, including all grip roll phases. HingeA barrel projection is at least−8mm, giving at least7mm clearance. TheØ6 bar and smaller grip fastener are farther from those solids. This axial half-space test avoids the false assumption that the grip always stays on one side of the spinning bar.
- The post isX40, radius8, so all its material hasX≥32. Across allθ and all360° roll phases, maximum worldX is**22.117937mm for the grip**, **24.015304mm for its screw head**, and13.263560mm for the bar. Thus the minimum X separation from the post is**7.984696mm**, including hardware. The grip's maximum worldY is103.418862mm, below the head'sY138 minimum by over34.58mm; the head and rail cannot be reached by the handle. The base topY8 is also far below its swept envelope.
- Exact roll-envelope derivation: for an axial cylinder/cap at extreme crossbar coordinate magnitude`a`, radius`R`, setback`d=22`, and yaw`α=θ/2`, maximumX is`−25+d sinα+H`. Set`k=sqrt(a²+R²)`. If`sinα≤R/k`, then`H=k`; otherwise`H=a cosα+R sinα`. These branches account for the circular section's correlatedY/Z coordinates. Maxima increase over0..atan(1/3), so the closed pose gives grip`−25+149/sqrt(10)` and screw-head`−25+155/sqrt(10)`. Native full-roll checking remains required after browser creation, including component/cap geometry beyond these analytic primitives.
- BraceB's rear centerY≥21 relativeP throughout motion, whereasRA isY−45 and the handle sits further behind it. The base topY8 is well below all moving parts. The merged ground rail's end is outside the moving jaw footprint. Do not move the rail, feet or support into the swept gap merely to improve appearance; the vice's rear-foot conflict illustrates why full travel must precede drawing acceptance.

## Native mating, browser validation and stop rules

1. Author every source from blank through visible desktop Chrome controls, dark app, mm. Save exact sketch coordinates/constraints, one native solid per definition, custom provenance and appropriate material. Validate library reopen and native bundle/STEP for each. Preserve starting/final artifacts; no script-authored geometry or previous-part reuse.
2. Assemble home θ0 using the placements above. GroundKT01. Anchor the fixed outer pair with P/Q connections, then lock its already correct rigid group. Lock each duplicate brace pair; retain actual physical Z offsets. Add the PinA and retainer/sleeve groups without overlapping their bores.
3. Inner pair: native Concentric to mainP pin axis and a datum Distance to fix its Z position; leave Z rotation free. Both trunnions: native Concentric through their integral Z journals and datum Distance to capture Z; each keeps one Z rotation. Cap hardware follows trunnions.
4. Shaft/HingeA: actual bore-axis Concentric and datum Distance capture axial origin; leave spindle spin free. HingeB/Shaft: actual axis-based **coupled Screw mate**, designer pitch2mm. Leave Drive blank initially; establish axial zero90mm atθ0 and capture phase. Avoid a Lock between either trunnion and its brace. The loop must resolve without suppressing support mates to make the issue counter disappear.
5. Each grip: native Concentric to its PinA, datum Distance for Z, plus a face/datum Parallel mate to the fixed Top plane in the flat-workpiece configuration. The relative swivel remains visible as BraceB turns. Save a separate unrestricted-jaw configuration only after the one-DOF drive is accepted; report its extra freedoms honestly.
6. Use a native **Limit between HingeA Top datum asA and HingeB Top datum asB**, aligned, minimum69.570108523704mm /maximum90mm. Both datum normals rotate together as+u because their bore axes are aligned by the loop, and their origins areRA/RB: the signed separation is therefore exactlyL, even while the spindle tilts. This stops both over-closing and wrong-sign opening beyondθ0. The existing Angle mate has Minimum/Maximum fields, but a0..36.8699° unsigned angle between Right planes alone would also admit negativeθ; do not use that as the only physical end stop. One measured small drive must confirm the sign and the resulting θ/g before attempting the full stroke.
7. Verify the table poses, both beyond-limit rejections, return to open, blank-drive oneDOF, specified-drive zeroDOF, cold reopen and all reference binding. Use native exact intersection checks through at least quarter-turn screw increments and fine angle samples, including360° handle roll at fixed representative openings. Report contact separately; no positive-volume clash may be hidden by excluding hardware or suppressing mates.
8. Only then author the book's **ANSI C landscape558.8×431.8mm** sheet, third-angle isometric exploded view, explode lines, native25-occurrence BOM/balloons, title KANT TWIST CLAMP, extra-part notes, original dimensions and material/thread limitations. Use the app preset's actual orientation and verify the exported page dimensions.

## Resume queue

Current status: **KT01–KT07 accepted, KT08 in progress**. Exact arbitrary-polyline numeric authoring was verified through visible Line clicks, shared point Fix anchors and Shape U/V edits. Native assembly limit/solver workflow remains pending. Resume details are in `ADVANCE.md`. A capability gap found during authoring should get a focused repair and browser revalidation. KT01–KT07 have separate part acceptance; native full-loop solver and drawing acceptance remain pending.
