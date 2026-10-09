# Chain: official source browser plan

Printed10-34–10-35 / PDF514–515. Read-only preparation from the publisher companion; no app model, imported geometry or browser acceptance is produced here. The canonical source frame below uses `Assem2.SLDASM`. Both `Assem2` and `Assembly` contain the same nine physical occurrences, although symmetric link flips, pin spins and mate face choices differ. All42 compressed blocks of each assembly were CRC/length verified. Exact source matrices, Euler conversions, source density offsets and analytic measurements are in `scratch/planchard/official-chain-frame-material-preparation-2026-10-09.json`; reproducible reader: `chain-source-frame-preparation.py`.

## Material and source identity

All three main-folder parts explicitly name **Titanium**. All three modern and all three legacy parts store **4600kg/m³ =4.6g/cm³**, directly as float64 little endian at byte84 in `Contents/Config-0-LWDATA` (`0000000000f8b140`). This field follows the source bounding box/radius and precedes the hatch object. Independent schema controls at that same offset give Q6=7800 and Q5=8900, agreeing with their labeled MATERIALTREE densities. The cached part masses corroborate4600 after geometric extraction; density was not adjusted to a mass or COM answer. Set an explicit exercise Titanium density4.6 for all three definitions. The app's Titanium Grade5 preset4.43 is a different material reference.

Modern source hashes/dimensions and the legacy comparison are recorded in `official-chain-source-measurements-2026-10-09.md`. Modern/legacy analytic coordinate multisets agree52/5/5, but their bytes and complete topology graphs are not claimed identical. Source parts contain `Imported1`, so the following browser sketches are a deliberate parametric reconstruction of the measured solid, not a recovered original sketch history.

## Three fresh definitions

Preserve physical source coordinates in millimetres. Link bounds X±50, Y±150, Z±50. Upper pivot(0,100,0) has axisZ; lower pivot(0,−100,0) has axisX. Both Ø50 bores and Ø100 round ends; upper fork gap40, ears30 each; lower tongue width40. Source measurements give link volume1396349.540849mm³ and local COM(0,14.748210875,0)mm.

The following simple rect/circle unions avoid uncertain arc controls while exactly producing the measured outer profiles:

| Browser feature | Physical sketch and extent |
|---|---|
| Upper bar | Front rectangle X−50..50 / Y0..100; Boss100 symmetricZ−50..50 |
| Upper round end | Front circle Ø100 atX0/Y100; Add100 symmetricZ−50..50 |
| Lower tongue | Side rectangle Z−50..50 / Y−100..0; Add40 symmetricX−20..20 |
| Lower round end | Side circle Ø100 atZ0/Y−100; Add40 symmetricX−20..20 |
| Fork opening | Front rectangle X−50..50 / Y50..160; Cut40 symmetricZ−20..20. Y160 merely extends the tool into empty space; physical floor is exactlyY50 |
| Upper bore | Front Ø50 atX0/Y100; ThroughAllZ, cuts both ears |
| Lower bore | Side Ø50 atZ0/Y−100; ThroughAllX |

On the Side plane, verify the displayed U direction against worldZ before entering the rectangle; its symmetric horizontal extent makes the sign immaterial here. All definitions remain at their source origin. Each rect/circle has driving dimensions and a fully constrained centre/placement. Lower and upper solids meet over the Y0 face; additions must merge into one native solid.

Long pin: Top X/Z circle Ø50 at(0,0), reverse Boss300 fromY0 to−300. Short pin: same circle, reverse Boss100 fromY0 to−100. Their source local centroids are(0,−150,0) and(0,−50,0); no shoulders. At4.6g/cm³ the source masses are link6423.207888g, long pin2709.623664g, short pin903.207888g. Preserve three definitions and insert four links, two long pins, three short pins.

## Canonical initial occurrence poses

These are direct `Assem2` source transforms, converted to the app's XYZ Euler convention. Millimetres/degrees; source JSON retains full precision. Ground **link1** after placement. This anchors the illustrated assembly frame and leaves the five plain pins' axial spins free. Names below renumber the source's `long_pin-3/-4` and `short_pin-4` into concise occurrence roles.

| Occurrence | X / Y / Z mm | RX / RY / RZ degrees |
|---|---|---|
| link1 |100 / −20 /0 |180 /0 /−90 |
| link2 |290.630778704 /−62.261826174 /0 |−90 /25 /−90 |
| link3 |433.245236480 /−128.764039999 /−81.915204429 |31.113561109 /47.936593567 /−129.110510317 |
| link4 |551.017817463 /−99.158644084 /−216.484487310 |129.241758755 /7.271101262 /−138.453904297 |
| long pin1 |0 /0 /0 |0 /0 /0 |
| short pin1 |200 /−20 /50 |90 /4.281016988 /0 |
| short pin2 |402.392470494 /−59.208262996 /0 |0.005696082 /0.012215287 /−25.000000607 |
| short pin3 |522.349109378 /−170.313858302 /−135.151587040 |110.283227046 /−9.623765781 /−48.851009147 |
| long pin2 |610.478504244 /−6.900082585 /−237.763222182 |44.604346972 /−36.222283617 /9.026163799 |

Source long pin1 has an additional−31.642753617° spin about its ownY axis. Zero spin gives exactly the same plain cylinder and references needed here; this is the only simplified spin in the table. Source pin2/3 spin angles are retained as convenient exact placement seeds, not mechanisms to drive.

**Origin:** world(0,0,0) is long pin1's Y0 end-face centre. Link1's lower-hole centre is world(0,−20,0). Moving that hole centre to origin would shift the COM incorrectly. Keep global axes as supplied; do not derive a translated measurement frame from an answer.

## Nineteen native mates

At each link joint, the previous link's upper Z bore and next link's lower X bore are concentric. Add one coincident seating plane and one angle. In the canonical poses, every child local+X is opposite the previous local+Z. Reader fork inner face localZ+20 therefore coincides with moving tongue face localX−20. Their outward normals are opposed. Verify that native face alignment before commit; selecting the other mating face pair is also equivalent if both signs change together.

| Link joint | Concentric refs | Coincident refs | Angle refs / value |
|---|---|---|---|
| A: link1→link2 | upper Z bore→lower X bore | reader innerZ+20→child tongueX−20 | Top datum+Y→Top datum+Y:25° |
| B: link2→link3 | upper Z bore→lower X bore | reader innerZ+20→child tongueX−20 | reader Top datum+Y→child exposed shoulderY0 with normal−Y:125° |
| C: link3→link4 | upper Z bore→lower X bore | reader innerZ+20→child tongueX−20 | reader Top datum+Y→child exposed shoulderY0 with normal−Y:130° |

The child shoulder is the exposed planar part of the upper bar's Y0 end outside the narrow lower tongue, for example X20..50/Z−50..50; its normal is−Y. Identify the actual rebuilt native face from its plane/normal, not a guessed selector index. These reference choices give the printed interior angles literally. The corresponding forward turns about each reader's upper-bore axis are **25°,55°,50°**. Source `Assembly` stores its third native angle as50° because it selects the supplementary face orientation; `Assem2` stores25/125/130. This is a reference choice, not a conflict in the physical chain. Preserve the pictured bend branch by starting from the source poses; unsigned angle alone permits a mirrored branch.

Each pin adds one native Concentric and one Coincident mate:

| Pin | Concentric reader | Pin Y0 end coincident with |
|---|---|---|
| long pin1 | link1 lower X bore | link1 tongueX+20 face |
| short pin1 | link1 upper Z bore | link1 outer earZ−50 face |
| short pin2 | link2 upper Z bore | link2 outer earZ+50 face |
| short pin3 | link3 upper Z bore | link3 outer earZ+50 face |
| long pin2 | link4 upper Z bore | link4 outer earZ−50 face |

Both cap and chosen side-face outward normals align in these poses. All diameters are exactly50 with no clearance. There are eight Concentric, eight Coincident and three Angle mates: **19 total**, with five pin spins remaining. That expected mobility does not affect mass/COM. A fully constrained rotation of each plain pin would be an optional extra convention, not part of the book's conditions.

## Measurements and reversible angle change

Independent analytic integration of the measured primitives, transformed by the actual nine source XML matrices, gives volume7352544.031042mm³, mass33821.702543g, and COM **(348.659349552,−88.476544720,−91.403729068)mm**. This agrees with the source cached tuple and rounds to the printed **(348.66,−88.48,−91.40)**. The assembly has three definitions/nine occurrences; compare their volumes and density before assessing COM.

The publisher sample exam's next configuration changes A/B/C to30/115/135. The same source hinge directions and source local centroids analytically give **(327.668340407,−98.388083591,−102.905282982)mm**, rounding to **(327.67,−98.39,−102.91)**. Only those three angle values change; the source frame, first link and densities remain fixed. This is a useful bonus driving-edit/Undo/cold check, not a new material or shape variant. No geometry or pose was adjusted to obtain either reference result.

## Acceptance still required

Author all three definitions and every occurrence/mate in Chrome. Verify fully defined sketches, one native solid per definition, literal source density, exact datum/cylinder reference signs,19 accepted native mates, only pin-spin mobility, no positive-volume interference, and the physical first-pin origin. Save/cold reopen, STEP/native equality, BOM3roles/9occurrences and actual visible angle edits remain browser work. Use two-decimal published rounding for COM comparison; native definition volume/transform checks should retain their higher precision. The read-only source parser does not decode a complete SolidWorks B-rep face graph or automatically map IDs to future app-generated native selectors.
