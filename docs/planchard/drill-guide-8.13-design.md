# Exercise 8.13 - fresh drill-guide design plan

The printed Exercise 8.13 illustration (book page 8-48, PDF page 426) calls for a bottom-up ANSI Drill Guide assembly and a C-ANSI landscape, third-angle isometric exploded drawing with explode lines, BOM, balloons, notes, and custom title properties. It provides a nine-row BOM but no part dimensions. Its sample part files and AVI are not present in this workspace. **Every dimension below is an original educational choice**, not a measurement of the book picture or a commercial tool. Build every part from a blank document in Chrome; a round bar shown beneath the guide is demonstration stock, not an assembly component.

The figure's functions are consistent with a two-column drill guide: the head slides on two rods, the rods pivot together at the base, collars set a plunge stop, and the central adaptor rotates. The [Milescraft DrillMate 1318 manual](https://milescraft.com/wp-content/uploads/2016/01/1318-DrillMate-Manual.pdf) independently shows two guide bars, a guide head, stop collar and adjustable angle base. [Rockler's portable drill guide](https://www.rockler.com/rockler-portable-drill-guide) illustrates a tilting two-post tool with a depth stop and round-stock locating features. Those sources support the mechanism only; neither supplies the dimensions or part geometry used here.

## Coordinate scheme and motion

All dimensions are **millimetres**. World X spans the two columns, Y is upward, and Z runs along the illustrative round stock. The annular base underside is Y=0, so a separate Ø24 demonstration bar may have its axis at (0, -12, 0) along Z and touch the underside without occupying the base material. The fixed pivot centers are `P_L=(-52,23,0)` and `P_R=(52,23,0)`, with both journal axes parallel to X. A single tilt angle θ turns the columns about X; zero is upright, and the intended geometric range is -20° to +20°.

Define the column direction `u(θ)=(0,cos θ,sin θ)`. At column coordinate `s`, the left and right rod centerlines are `P_L+s*u` and `P_R+s*u`; the central drill axis is `(0,23,0)+s*u`. The paired bushings force the slide to remain aligned to both rods. The planned plunge range places the slide center at `s=58..138` (80 mm travel). The illustrated assembly may be saved near `s=118` so the adaptor is visible below the head. At θ=0 and the low stop, the lower adaptor end is Y=6 if it extends to slide-local `s=-75`; see the adaptor row below. That end lies within the Ø64 base aperture and remains above the demonstration bar; any real drill bit is a separate unmodeled tool.

| Check | Nominal result |
|---|---:|
| Base annulus | OD140, ID64, Y=0..8 |
| Base pivot lug top | Y=46 |
| Rotor lower corner at 20° tilt | `23 - 11 cos20° - 12 sin20° = 8.56`, clearing the base top by 0.56 |
| Stop-collar top | rod coordinate s=46 |
| Slide lower face at minimum center s=58 | s=46, face contact with both collars |
| Slide upper face at maximum center s=138 | s=150, 38 below rod cap start at s=188 |
| Drill-axis crossing of base underside at 20° | Z≈-8.37, inside the 32 mm aperture radius |

These are nominal CAD clearances; check the exact solids at upright and both tilt limits before claiming the physical assembly clear.

## Printed BOM roles and fresh part recipes

The book lists **17 instances in nine rows**. Preserve its role and material labels in the drawing. Material grades describe the book's example; any custom density used by ModelForge must be separately documented. For the four thumb screws, the small printed designation appears to be `.25-20 × .53, Type B, flat point`; verify the source image before claiming a manufactured standard. The design below uses a nominal Ø6.35 ×13.46 shank and a simple hand knob, with a cosmetic thread note only.

| Book item | Qty / printed material | Fresh part geometry and interfaces |
|---|---|---|
| 1. Base | 1 / 2014 alloy | Sketch annulus OD140/ID64 on Top; extrude Y0..8. Fuse four pivot ears, each Z=-14..14 and Y8..46: left X=-70..-66 and -38..-34, right X=34..38 and 66..70. All ears join the annulus because their innermost X is 34, beyond aperture radius32. Cut coaxial Ø6.0 journal bores along X through each ear at Y23/Z0. The two outer ears also receive Ø6.45 angle-lock screw holes along X at Y38/Z8, above and to one side of the journals. |
| 2. Rotator | 2 / plain carbon steel | One master part, mirrored by occurrence placement. Central hub X=-14..14 in local coordinates about pivot, local Y=-11..35 and Z=-12..12. Integral Ø5.8 journals extend 8 mm beyond both hub ends, entering the ear bores; each has one outboard Ø5.2 ×1 groove for item 7. Cut a blind Ø10.0 rod socket parallel to local +Y from s=35 down to s=12. The guide rod seats in that socket at nominal line-to-line fit and is locked to the rotator in the assembly; do not claim a rated press fit. Hub spans X=-66..-38 on the left or 38..66 on the right, exactly between a pair of ears. At θ=0 its bottom is Y12, 4 above the ring top. |
| 3. Rod guide | 2 / cast alloy steel | Ø10.0 main rod along local s=12..188 and integral Ø14 ×4 top cap at s=188..192. One source part is placed at X=±52. Its bottom s=12..35 sits inside its rotator socket. The cap provides an upper physical stop so the slide cannot come off the rods; no old rod model is reused. |
| 4. Slide | 1 / 2014 alloy | Crosshead X=-66..66, local Y=-12..12 about its center, Z=-14..14. Through bores parallel to Y at X=±52, Ø14.0 for item 6, and at X=0, Ø16.2 for the spinning adaptor. Fillet external hand-contact edges only after holes. Initial assembly center s=118; lower study s=58, upper s=138. |
| 5. Collar | 2 / 2014 alloy | Stop collar OD22, ID10.2, axial thickness10, mounted on each rod at s=36..46. Radial Ø6.45 tapped/clearance representation along outward X receives item 9; the flat point stops at the rod surface without modeled overlap. Both collars lock to their rods at this location in the study configuration. |
| 6. Bushing | 2 / aluminum bronze | Tube OD13.98, ID10.2, axial length24, seated through the two slide bores. A top flange OD18 ×2 lies above the slide top. The 0.02 diameter outer clearance is an educational assembly gap, not a press-fit specification; Lock each bushing to the slide. Rod-to-bushing diameter clearance is 0.2 (0.1 radial). |
| 7. Retaining ring | 2 / alloy steel | Educational split ring OD10/ID5.2/axial thickness0.8 with a 1 mm radial slit, one on each **outer** rotator journal groove. Left groove may be X=-72.3..-71.3, right X=71.3..72.3; place ring bodies inside those grooves without penetrating the journal. Inner journals are captured by hub/ear contact. Label the book's `B27.1 - NA2-45` designation as a reference only; this custom sketch is not certified hardware. |
| 8. Drill adaptor | 1 / plain carbon steel | Coaxial stepped spindle about slide-local Y: bearing Ø16.0 from -12..12, top seating flange Ø22 from 12..15, upper drive shank Ø8 from 15..39, lower Ø8 stem from -75..-12. A bottom Ø6 blind bore 15 deep can depict a bit seat. The flange rests on the slide top; central concentric plus flange-face mate retains rotation. The book does not supply a complete chuck or upward retainer, so this is a guided educational adaptor, not a cutting-capable chuck claim. |
| 9. Thumb screw | 4 / 2014 alloy | One Ø6.35 ×13.46 nominal shank with a Ø18 ×4 hand head and flat tip. Two act through the base's outer ears at Y38/Z8, contacting rotator side faces to lock a chosen angle; two act radially through the stop collars, contacting the rods. Place screw heads outward of the slide envelope X=±66. Model a cosmetic `.25-20` annotation if wanted; do not cut helical material or claim standardized fit. |

Nominal clearances are Ø6.0 bores against Ø5.8 journals (0.1 radial), Ø10.2 slide bushing IDs against Ø10 rods (0.1 radial), and Ø16.2 central slide bore against the Ø16 adaptor (0.1 radial). Nominally touching faces should have zero overlapping volume. Avoid applying a visual `Transparent` style when checking exact interference.

## Assembly and motion sequence

1. Ground item 1. Place the two item 2 hubs between their respective ear pairs. Each rotator uses a journal Concentric mate to an ear bore and one coincident side face to center it axially. Their only intended freedom before angle locking is a shared tilt about X.
2. Lock each item 3 rod to its rotator with the local Y axis aligned to the socket. The rod and its top cap stay one native part. Place item 7 rings on the two outboard journal grooves and Lock them to the corresponding rotators.
3. Lock each item 6 bronze bushing into the item 4 slide. Mate each bushing's Ø10.2 bore concentrically to its rod. The two separated parallel axes prevent slide roll and tie both rotators to the same angle, while leaving plunge motion along `u(θ)`. Use a plane-to-plane Limit Distance from collar top to slide bottom with range 0..80 mm; the 0 lower bound represents collar contact at s=58.
4. Concentric-mate the item 8 adaptor to the slide center bore and seat its flange against the slide's upper face. Leave rotation about the drill axis free. Lock each item 5 collar to its rod at s=36..46. Place two item 9 screws on the collar radial bores, with flat tips at rod contact, and Lock them to the collars in the stopped configuration.
5. Add an unsigned Limit Angle of 0..20° between a base reference plane and one rotator reference plane; the second follows through the slide/rod closed loop. This supports either tilt branch after a deliberate starting placement. For the upright drilling study, use an Angle=0° mate/configuration on the rotator pair. Put the other two item 9 screws in the outer base ears; retract their tips for angle movement, or seat them and Lock the angle in the upright configuration.
6. For a feed-only Motion Study, keep tilt at 0° and drive the slide along +Y between s=58 and 138. For tilt examples, save -20°, 0° and +20° assembly configurations and leave feed at a fixed safe height. A separate rotary study may spin the adaptor. The present motion system fixes driven components during each solve, so simultaneous independent linear feed and adaptor spin must be browser-proven before promising it; sequential studies/configurations are acceptable for the book's depicted movement.

With angle fixed, the intended undriven mobility is plunge plus adaptor spin (two freedoms). With angle free, add one tilt freedom. A Motion Study temporarily drives a pose; the normal assembly status continues to report the undriven freedoms. If native mates do not resolve the closed loop, preserve the geometry checkpoint and repair the solver instead of grounding both rotators as a workaround.

## Browser acceptance and drawing

- Build each of the nine unique roles from a blank document, fully define their driving sketches, save/reopen, and export a STEP of each native part. Verify exact material density and mass only after the chosen custom grade is documented.
- Insert all 17 instances, check native interference at upright low/high feed and at both ±20° tilt configurations, and preserve the selected configuration in the exported assembly bundle. The demonstrative Ø24 bar stays outside the assembly BOM.
- Save a C-ANSI landscape, third-angle isometric exploded assembly drawing with nine BOM rows summing to 17 instances, balloons, explode lines, notes identifying designer dimensions and study limits, and linked custom title properties. The printed book gives no tolerance stack, load rating, motor speed, or verified drilling-force model; do not imply those were supplied.

## Sources and scope

- David Planchard, *Engineering Graphics with SOLIDWORKS 2021*, exercise 8.13, printed page 8-48 / supplied PDF page 426. The book figure and BOM define the requested roles and drawing deliverable, not the dimensions above.
- [Milescraft DrillMate 1318 assembly manual](https://milescraft.com/wp-content/uploads/2016/01/1318-DrillMate-Manual.pdf), official manufacturer example of two guide bars, sliding head, stop collar and angle setting.
- [Rockler portable drill guide](https://www.rockler.com/rockler-portable-drill-guide), official manufacturer example of a tilting portable drill guide, depth stop and round-stock positioning.

## Material catalog audit before authoring

Existing catalog entries cover `aluminum2014` (2.80 g/cm³) for items1/4/5/9, `plainCarbonSteel` (representative7.85) for2/8 and `castAlloySteel` (SOLIDWORKS reference7.30) for3. Keep their source-backed catalog densities and labels. Do not relabel brass as aluminum bronze or cast alloy steel as a retaining-ring spring grade.

For the missing book material families, assign explicitly assumed designer grades through Custom material: item6 C95400 aluminum bronze,7.45g/cm³ ([Wieland Concast manufacturer data](https://www.concast.com/c95400.php)); item7 51CrV4 / SAE6150 spring alloy steel,7.85g/cm³ ([Walzwerke Einsal mill data](https://einsal.com/en/materials/material-database/material/1.2241)). The printed book gives families only, so record both grade choices as assumptions in properties/BOM. No native model geometry has been authored at this planning checkpoint.
