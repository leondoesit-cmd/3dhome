# Exercise 8.16 — radial engine: original designer example plan

Status: source review and dimensional planning only, 2026-10-03. No parts or assembly have been created for this exercise. All eventual geometry must be authored from blank through visible desktop Chrome controls.

## Book requirements and source limits

Source: Planchard, *Engineering Graphics with SOLIDWORKS 2021*, physical PDF page 429, printed page 8-51. The exercise supplies an assembly illustration and BOM, asks for web research and original parts, permits additional components, and requires an ANSI C landscape, Third Angle, isometric exploded assembly drawing with explode lines, BOM balloons, notes and title properties. Companion part files and AVI are absent. The page does not supply manufacturing dimensions.

The embedded BOM is a low-resolution raster even in a 600 dpi render. Source evidence is retained in `scratch/planchard/radial-bom-600dpi-source.png` and `radial-429-600dpi-source.png`. The following is a visual transcription, with uncertain readings identified explicitly. Material text for cast roles reads **C355.0-T61 Permanent Mold cast (SS)**, not cast stainless steel. The exact stock label also appears in [DriveWorks' material documentation](https://docs.driveworkspro.com/topic/HowToDriveAPartsMaterial). This establishes a catalog label, not a certified casting specification for our example.

| Book item | Fresh role | Description | Qty read | Book material read | Confidence / limitation |
|---|---|---|---:|---|---|
| 1 | RE01 | Master rod | 1 | C355.0-T61 Permanent Mold cast (SS) | Quantity clear; exact material suffix moderately clear |
| 2 | RE02 | Articulated rod | 4 | Same cast aluminum label | Quantity clear |
| 3 | RE03 | Piston head | 5 | Same cast aluminum label | Quantity clear |
| 4 | RE04 | Piston ring | 20 | Rubber | Quantity and material clear |
| 5 | RE05 | Piston pin | 5 | Plain Carbon Steel | Quantity clear |
| 6 | RE06 | Piston rod bushing | 5 | Aluminum Bronze | Quantity clear |
| 7 | RE07 | Piston rod bushing lower | 4 | Aluminum Bronze | Quantity clear |
| 8 | RE08 | Cap pin | 4 | Plain Carbon Steel | Four appears most likely; retain raster uncertainty |
| 9 | RE09 | Master rod bushing | 1 | Aluminum Bronze | Quantity clear |
| 10 | RE10 | Master rod pin | 1 | Plain Carbon Steel | Quantity clear |
| 11 | RE11 | Counterweight | 2 | Same cast aluminum label | Two appears most likely; retain raster uncertainty |

This reading totals **52 book-role occurrences**. The printed part-number column appears to run 11–21 but is too blurred to rely on. Use fresh PartNo RE01–RE11 and separate BookItemNo 1–11. Neither quantities nor companion geometry are claimed independently verified against missing files.

## Mechanism reference

[FAA-H-8083-32B, Powerplant chapter 1](https://www.faa.gov/sites/faa.gov/files/03_amtp_ch1.pdf), 2023 edition, printed pages 1-9–1-10, describes the master-and-articulated rod system. One master rod joins the crankpin to one piston. The other rods pivot on knuckle pins attached to the master rod. Their knuckle centres follow different paths, so piston positions cannot be represented by five copies of one sinusoidal motion. This plan uses actual rotary joints and guided sliders. Older editions may paginate the same discussion at 1-11.

Downloaded primary reference: `scratch/planchard/faa-powerplant-ch1.pdf`; visual evidence: `faa-master-articulated-rod.png` and `faa-master-articulated-rod-continuation.png`.

## Coordinate system and material policy

All dimensions below are **original designer choices in mm**, for a cold, unloaded mechanism demonstration. XY is the motion plane, Z is every wrist/knuckle/crank pin axis. Cylinder angle alpha is measured from +Y toward +X: 0, 72, 144, 216, 288 degrees. Part placement rotations about Z use the app's usual positive rotation from +X toward +Y; a radial part therefore uses Rz = -alpha.

Preserve `BookMaterial` separately from the actual selected `MaterialProxy` and density used for mass. Cast roles should use a distinct source-backed C355.0-T61 stock record if available; otherwise explicitly label Aluminum 6061, 2.70 g/cm³, as the selected mass proxy. Do not silently call 6061 C355.0. Bronze roles may use custom C95400, **7.45 g/cm³**, as a disclosed proxy for the unspecified Aluminum Bronze family: [Wieland Concast C95400 physical properties](https://www.concast.com/c95400.php). Carbon-steel roles use the generic 7.85 g/cm³ proxy with no inferred strength class. Rubber grade/density is unresolved: select and cite an actual proxy before reporting physical mass, or mark rubber mass unavailable. Rubber is the book's label; no combustion suitability is inferred.

Persist Source, BookItemNo, BookMaterial, MaterialProxy, DesignStatus, and Representation properties. All pins use ideal axial retention; the example does not specify bearing fits, lubrication, seal compression, balancing or load ratings.

## Proposed fresh part geometry

Crank throw = 18. Rod pin-centre length = 68. Master knuckle circle radius = 20. Dimensions specify exact envelopes and intentional axial layers; native clearance must still be checked over motion before acceptance.

| Role | Geometry to author through UI |
|---|---|
| RE01 Master rod | Hub Ø54, Z0..12, main bearing bore Ø24.2. Stem width12, Y20..60, Z3..9; small-end boss Ø24 centred Y68, Z3..9, bore Ø12.2. Four Ø6.2 knuckle bores on R20 at alpha72/144/216/288. Hub/stem and stem/boss have finite overlapping regions and must fuse to one body. |
| RE02 Articulated rod | Big-end boss Ø16 at XY0, bore Ø10.2; small-end boss Ø24 at local Y68, bore Ø12.2; width10 stem Y6..60. Entire body Z12..18. The offset axial layer clears the master hub. |
| RE03 Piston head | Cup axis local +Y: Ø44 outer, Y-10..30. Ø36 cavity from Y-10..22, leaving an8 mm crown. Wrist bore Ø8.2 along Z at Y0. Four circumferential grooves root Ø42, width2, Y10..12/14..16/18..20/22..24. One body. |
| RE04 Piston ring | Revolved annulus, inner radius21.2, outer22.8, axial width1.8 about local Y0. Place four rings at piston-local Y11/15/19/23. Groove gaps intentionally provide clearance without simulating rubber deformation. |
| RE05 Piston pin | Ø8 cylinder, Z-22..22. Place at piston XY and world Z6. Ideal retention, no invented circlips. |
| RE06 Piston rod bushing | Ø12 outside / Ø8.2 inside, local Z-3..3. Master instance centre Z6; articulated instances centre Z15. |
| RE07 Lower bushing | Ø10 outside / Ø6.2 inside, local Z-3..3. Four instances at master knuckle XY, centre Z15. |
| RE08 Cap pin | Ø6 shaft Z0..18, Ø10 head Z18..20. Four instances fixed to the master hub at knuckle centres. |
| RE09 Master bushing | Ø24 outside / Ø12.2 inside, Z0..12, fixed to the master hub. |
| RE10 Master rod pin / crankpin | Ø12 shaft Z-10..32, centred on eccentric C=(0,18). Spans both crank cheeks and the master bushing. |
| RE11 Counterweight proxy | Ø72 crank-cheek disk, local Z0..10; Ø12.2 centre-journal bore and Ø12.2 eccentric crankpin bore at local Y18. Two instances at Z-10 and Z22. The front cheek is deliberately beyond the articulated rods and cap heads; putting it at Z12 would intersect those rods. No balancing claim. |

### Explicit additional fixture roles

These are allowed additional components, with separate BOM rows; they are not substitutes hidden under book roles.

| Role | Qty | Proposed geometry / function |
|---|---:|---|
| RE12 Ground guide carrier | 1 | Connected backplate Ø320, Z-25..-18, central Ø12.2 journal bore. Five radial open cylinder guides, outerØ50 / innerØ46, radial coordinate60..140, transverse centre Z6. Native circular feature pattern5 about Z. Guide bottoms reach Z-19 and fuse to the plate with1 mm overlap. Piston bottoms Z-16 clear the plate; ring outer22.8 clears guide radius23. |
| RE13 Rear drive journal | 1 | Ø12, Z-32..0, fixed to rear cheek. Central guide-carrier bore supports rotation. |
| RE14 Front drive journal | 1 | Ø12, Z32..48, fixed to front cheek. |

A continuous central shaft through Z0..12 would intersect the displaced master hub. Separate front/rear journals leave that space open while both cheeks and the eccentric pin form a rigid crank unit. Proposed total: **14 roles / 55 occurrences**, conditional on the two blurred book quantities above.

## Initial placements for native assembly

Ground carrier at world origin. Crankpin C=(0,18), master part origin at C, Rz0. Rear cheek origin(0,0,-10), front cheek(0,0,22). Journals and cheek holes are concentric about world Z through O=(0,0).

For articulated cylinder i: u=(sin alpha,cos alpha); K=C+20u. Choose the outward slider intersection P=s*u with s=K·u+sqrt(68²-(|K|²-(K·u)²)). These are planning calculations, not injected model state. Type placements through the assembly form. Rod Rz is minus atan2(Px-Kx,Py-Ky).

| Cylinder alpha | Knuckle Kx,Ky | Piston Px,Py | Rod Rz |
|---:|---|---|---:|
| 0 | master origin0,18 | 0,86 | 0 |
| 72 | 19.021130,24.180340 | 86.900105,28.235556 | -86.581107 |
| 144 | 11.755705,1.819660 | 42.678834,-58.742375 | -152.951028 |
| 216 | -11.755705,1.819660 | -42.678834,-58.742375 | 152.951028 |
| 288 | -19.021130,24.180340 | -86.900105,28.235556 | 86.581107 |

Every piston origin uses its Pxy, world Z6, Rz=-alpha. Pins share Pxy/Z6. Master small-end bushing uses P0xy/Z6; four articulated small-end bushings use Pixy/Z15. Lower bushings use Kxy/Z15; cap pins use Kxy/Z0. Rings share head orientation and Z6, with centre XY=P+g*u for g11,15,19,23.

## Human UI build order and actual mechanism acceptance

1. Create every unique definition from New model; set mm before dimensions. Author native circles/rectangles, offsets, extrusions/cuts, revolve grooves/rings, and pattern where appropriate. Use fully defined sketches and verify one connected solid per role. Save source properties and material identity; export editable bundle and STEP; cold-reopen and compare native mass/envelopes.
2. Create a fresh assembly and insert only these newly accepted records. Enter all55 placements through visible UI. Ground only RE12. Save/export before mating.
3. Rear journal: native Concentric to carrier bore plus axial plane seat, leaving rotation Z. Lock the two cheeks, crankpin and front journal into one crank unit.
4. Master: lock its bushing; Concentric to crankpin plus axial plane seat. Each articulated rod's lower bushing locks to its rod; cap pin locks to master; native Concentric plus axial seat leaves the knuckle rotation.
5. Each piston: native Concentric to its guide plus parallel motion-plane normal to remove cylinder roll, leaving radial translation. Lock the wrist pin to the piston and the small-end bushing to the rod; Concentric and axial seat close each rod/piston joint. Articulated bushing centre Z15 is9 mm above pin centre Z6; preserve this explicit axial placement.
6. Verify exactly one physical crank DOF, legitimate residual tolerances, and preserved68 mm pin-centre rod lengths. Do not substitute independent piston motors or copied sinusoidal animation. If the native solver cannot close the loops, preserve the checkpoint and fix the genuine gap before claiming motion acceptance.
7. Drive the crank about Z through360 degrees, starting with <=5 degree increments to stay on the outward slider branch. Audit native intersections, guide engagement, crank/rod/pin alignment and cold seek/replay throughout. No matching claim against the absent AVI.
8. Save normal and exploded configurations. Produce ANSI C22×17 inch landscape, Third Angle isometric exploded drawing with leaders, role BOM, balloons, title properties and explicit designer/proxy notes. Add extra fixture roles openly. Verify exports and cold reopening.

## Remaining gates before authoring is accepted

- Resolve/carry forward blurred Cap Pin and Counterweight quantity readings honestly.
- Confirm a supported actual density for the chosen rubber proxy; preserve cast-grade distinction.
- Native guide pattern must fuse into a single carrier, and all moving loops must solve without forced transforms.
- Full crank-cycle exact clearance is pending; these chosen dimensions have not been validated as model geometry.
- No parts, motion result, fabrication claim or book-exercise completion is asserted by this planning document.
