# Planchard 2021: numbered exercise and model inventory

Source: David C. Planchard, *Engineering Graphics with SOLIDWORKS 2021*, the user-supplied 587-page PDF. Page numbers here are **PDF page numbers**, not chapter-local printed page numbers. This is a task inventory, not a completion claim. The adjacent [fresh rebuild tracker](fresh-rebuild-2026-09-27.md) is the evidence register. Old library models and prior fixtures do not satisfy the requested from-blank Chrome rebuild.

## How to read the input column

| Code | Meaning |
|---|---|
| **Print** | The figure and stated dimensions/instructions are intended to define the task; inspect the PDF image, since text extraction loses drawing dimensions. No old model is required. |
| **Estimate** | The book deliberately leaves dimensions to the designer or asks for visual estimation. A defensible new design can be made, but there is no unique dimensional target. |
| **Companion** | The text explicitly instructs opening supplied part/assembly files or asks for data absent from the printed figure. A faithful reproduction needs those inputs; drawing a new analog should be labelled an analog. |
| **Derived** | The task depends on an earlier part/assembly made fresh in Chrome. The supplied chapter folder is an alternative, not permission to count an old part as freshly built. |
| **Theory** | Drawing identification, sketching, annotation, or written analysis; a 3D part may be useful to demonstrate it but is not the required output. |

Rows without an explicit acceptance entry below remain **pending fresh Chrome exercise completion**. This includes tasks sharing a name with an already recreated chapter-project part. A source figure must be visually inspected before declaring its dimensions complete; `book.txt` extraction alone cannot prove this.

## Fresh exercise acceptance register

| Exercise | Fresh Chrome evidence | Qualification |
|---|---|---|
| 7.4 SWEPT-CUT CASE | `artifacts/planchard/SWEPT-CUT-CASE-7.4-browser-2026-09-28.{mforge,step,png,md}`; blank Chrome200×80×24mm rounded open shell,4mm wall, linked closed perimeter path and fully defined R2 semicircle; Sweep Cut, seven steps, three0DOF sketches, ABS. Actual library reopen, STEP104399bytes, exact101.638678630cm³/105.7042g, Boss24→26mm edit/Undo restoration accepted. | Book is deliberately undimensioned; dimensions/material are labeled designer choices. No annotated drawing or pencil-fit study claimed. |
| 5.6 AXLE | `artifacts/planchard/AXLE-browser-2026-09-28.{mforge,step,svg}`; Front-plane Ø.188 in, symmetric 1.375 in Mid-plane boss, 1060 Alloy; ANSI dual-unit sheet; saved/reopened. | App retains the leading zero in fractional dimensions. |
| 5.7 SHAFT COLLAR | `artifacts/planchard/SHAFT-COLLAR-browser-2026-09-28.{mforge,step,svg,png,md}`; Ø.438/.188 in annulus, .250 in boss, 2014 Alloy, associative ANSI dual-unit drawing; saved/reopened. | Book's [11.11] mm disagrees with Ø.438 in; exact conversion is [11.13]. |
| 5.8 FLAT BAR–3 HOLE | `artifacts/planchard/FLAT-BAR-3-HOLE-5.8-browser-2026-09-28.{mforge,step,svg,png}`; blank Front centerpoint slot, 1.000 in center span, .500 width, R.250 caps, three Ø.190 through holes at .500 pitch; .060 in ferritic stainless. Two fully defined sketches; saved/reopened. | Grade unspecified in the book; generic ferritic stainless selected. Original preserved independently of 9.1. |
| 5.9 FLAT BAR–9 HOLE | `artifacts/planchard/FLAT-BAR-9-HOLE-5.9-browser-2026-09-28.{mforge,step,svg,png,md}`; new blank Chrome Front slot, 4.000 in center span, .500 width, R.250 caps, nine Ø.190 through holes at .500 pitch; .060 in 1060 Alloy. Two fully defined sketches, five steps, one solid; saved/reopened; ANSI inch/mm Front/Top/shaded Isometric drawing. | No older or 5.8 geometry reused. Supplementary Top/Isometric views and overall 4.500 dimension exceed the single homework view. |
| 9.1 FLATBAR–3 HOLE | `artifacts/planchard/3HOLES-9.1-shaded-linked-browser-2026-09-28.{mforge,svg,png}`; independent copy of freshly browser-built 5.8, changed to .090 in 1060 Alloy; A/ANSI Front/Top/shaded Isometric sheet, associative spacing/radius, live thickness and three-hole EQ SP., Description/SWFormatSize custom properties with live linked notes; saved/reloaded. | App font/title-block arrangement differs. Shading is neutral vector facet lighting; intersecting surfaces are not split for painter ordering. Earlier `3HOLES-9.1-browser-2026-09-28.step` matches final geometry. |
| 9.2 CYLINDER | `artifacts/planchard/CYLINDER-9.2-drawing-repaired-browser-2026-09-28.{mforge,step,svg,png,md}`; fresh Front annulus Ø1.500 / Ø.625 in, Blind 2.000, fully defined, AISI 1020; ANSI Letter Front/Right/shaded Iso drawing saved/exported in Chrome. Front diagonals, excess bore stripes and missing shaded cap triangles repaired; responsive Model↔Drawing preview verified. | Supplemental overall dimensions; THRU/company graphic/title arrangement still differ. STEP exported, depth 2.000→2.100 in rebuilt and drawing updated, Undo restored exact mass, Save/reopen clean. Original checkpoint preserved. Drawing-mode mouse/keyboard Undo/Redo and immediate post-commit exact Drawing refresh accepted; cached projection and pointer eligibility fixes tested. |
| 6.1 BUSHING | `artifacts/planchard/BUSHING-browser-2026-09-28.{mforge,step,png,md}`; blank Front-plane six-edge sketch, one revolve, Ø.400/.283/.188 in, .050+.100 in heights; four named driving dimensions, 0 DOF, ANSI settings, saved/reopened. | Brass C360 selected because the book does not specify a brass grade. Exact volume .1378069 cm³; mass 1.171359 g. Boss-height upstream edit and restoration verified. |
| 6.2 PIN | `artifacts/planchard/PIN-browser-2026-09-28.{mforge,step,png,md}`; blank fully defined Front profile, revolve and .100 in / 45° two-edge chamfer; Ø2.000/Ø1.525 in, 3.476 overall, 1.375 head length; three steps, 6061 Alloy, ANSI inch preset, saved/reopened. | Exact volume 132.8004 cm³ and mass 358.5611 g match independent analytic geometry. Upstream head-length edit and restoration preserved both chamfers. |
| 6.5 wedge | `artifacts/planchard/EXERCISE-6.5-browser-2026-09-28.{mforge,step,png,md}`; blank Chrome Right six-edge profile plus actual horizontal construction centreline, reverse 3 in Boss and central reverse-offset 1 in triangular Cut. Two fully defined sketches/two features/four steps/one solid; Save/reopen and STEP export accepted. | Raised-foot right-side origin follows print. Triangular ramp interpretation derived from isometric diagonal/two-feature requirement. 6061 density .097 lb/in³ matches book; volume 7.875 in³, mass .763875 lb. Reverse-offset compiler bug repaired and exactly tested. No drawing claimed. |
| 7.3 WEIGHT | `artifacts/planchard/WEIGHT-browser-2026-09-28.{mforge,step,png,md}`; blank Top rectangle, offset plane/square, loft and centered Ø.150 in through-cut; three fully defined sketches, one solid, saved/reopened. | Plain Carbon Steel; volume 3.781276 cm³ and mass 29.68301 g independently verified analytically. |

## Chapter project outputs outside homework

| PDF pp. | Output | Required browser output | Input | Fresh status |
|---:|---|---|---|---|
| 219-245 | BATTERY | Inch part: extrusion, side rounds, inset/cut, terminal bosses, edit and rebuild | Print | Fresh UI verified in main tracker; assembly/drawing use pending |
| 246-254 | BATTERYPLATE | Drafted plate, pocket, two holes, holder, full-round and multiple-radius fillets, folder | Print / Derived | Fresh UI provisional in main tracker; exact folder/export acceptance pending |
| 269-284 | LENS | Revolve, shell, Hole Wizard, thin revolve, offset and appearance | Print | Pending acceptance; new blank Chrome sketch was in progress when inventoried |
| 285-298 | BULB | Spline/revolve, thin revolved cut, dome and circular pattern | Print | Pending |
| 311-315 | O-RING | Circular-profile sweep, material and saved part | Print | Pending |
| 316-324 | SWITCH | Lofted body and dome | Print | Pending |
| 325-340 | LENSCAP | Shell, thin cut, helix and swept thread | Print | Pending |
| 341-364 | HOUSING | Lofts, shell/draft, threads, handle sweep, up-to-surface cut, rib/pattern/mirror | Print | Pending |
| 379-411 | LENSANDBULB; BATTERYANDPLATE; CAPANDLENS; FLASHLIGHT | Four saved assemblies, mates, interference correction, explode and downstream drawings | Derived | Pending |
| 437-473 | BATTERY; FLASHLIGHT; O-RING-DESIGN-TABLE drawings | Multiview part sheet; exploded BOM sheet; three-configuration O-RING sheet | Derived | Pending |
| 521-558 | Print-preparation outputs | STL, AMF, 3MF and slicer/orientation/fit workflow | Derived | Fresh BATTERY STL verified; rest pending |

## Chapters 1-3: drawing and graphics homework

| Exercise | PDF p. | Required output | Input |
|---|---:|---|---|
| 1.1 | 80 | Name six principal third-angle views in the printed projection figure | Theory |
| 1.2 | 80 | Name six principal first-angle views | Theory |
| 1.3 | 81 | Identify line types on pictured model | Theory |
| 1.4 | 81 | Estimate dimensions; third-angle top view, hidden/center lines | Estimate |
| 1.5 | 82 | Estimate dimensions; third-angle right view, hidden lines | Estimate |
| 1.6 | 82 | Estimated front/top/right drawing | Estimate |
| 1.7 | 83 | Estimated front/top/right drawing including center lines | Estimate |
| 1.8 | 84 | Isometric reconstructed from three given views | Theory |
| 1.9 | 85 | Isometric reconstructed from three given views | Theory |
| 1.10 | 86 | Isometric reconstructed from three given views | Theory |
| 1.11 | 86 | Identify surfaces visible in front/top/right | Theory |
| 2.1 | 124 | Hand isometric from illustrated model | Theory |
| 2.2 | 124-125 | Hand isometrics of pictured models, approximate size | Estimate |
| 2.3 | 126 | Hand isometrics of pictured models, approximate size | Estimate |
| 2.4 | 127 | Count vanishing points in three pictures | Theory |
| 3.1 | 175 | Estimate whole-number dimensions and annotate figure | Estimate |
| 3.2 | 175 | Estimate whole-number dimensions and annotate figure | Estimate |
| 3.3 | 176 | Mark dimensioning errors | Theory |
| 3.4 | 176 | Explain arrowhead/dimension order when space is tight | Theory |
| 3.5 | 177 | Mark dimensioning errors in right view | Theory |
| 3.6 | 177 | Mark dimensioning errors in front view | Theory |
| 3.7 | 178 | Place limit tolerance on pictured model | Theory |
| 3.8 | 178 | Name tolerance types | Theory |
| 3.9 | 178 | Identify drafting symbols | Theory |
| 3.10 | 179 | Interpret hole callouts | Theory |
| 3.11 | 179 | Class 1 fit true/false | Theory |
| 3.12 | 179 | ANSI/ISO limit order true/false | Theory |
| 3.13 | 179 | US/metric dimension notation true/false | Theory |
| 3.14 | 180 | Decode thread note | Theory |
| 3.15 | 180 | Calculate minimum clearance/allowance from shaft and hole limits | Theory |
| 3.16 | 180 | Calculate maximum clearance from shaft and hole limits | Theory |

The earlier unnumbered in-chapter pencil exercises (for example PDF pp. 53-76 and 105-113) are teaching activities, not a second numbered homework set. They should be checked during the relevant chapter workflow, but should not be silently counted as models.

## Chapter 5: part-modeling homework

| Exercise | PDF p. | Required CAD/drawing output | Input |
|---|---:|---|---|
| 5.1 | 258 | Choose sketch plane/origin for illustrated boss with minimal features | Theory |
| 5.2 | 258 | Same plane/origin analysis on second illustration | Theory |
| 5.3 | 258 | Same plane/origin analysis on third illustration | Theory |
| 5.4 | 259 | Same plane/origin analysis on fourth illustration | Theory |
| 5.5 | 259 | Identify material category of 6061 Alloy | Theory |
| 5.6 AXLE | 259 | ANSI/IPS mid-plane symmetric extrusion; 1060 Alloy; dual-unit drawing | Print |
| 5.7 SHAFT COLLAR | 260 | Front-plane part; 2014 Alloy; ANSI dual units | Print |
| 5.8 FLAT BAR - 3 HOLE | 260 | Slot-based stamped part; three-hole linear pattern; 0.060 in ferritic stainless | Print |
| 5.9 FLAT BAR - 9 HOLE | 260 | Same slot/end/spacing geometry, nine-hole pattern; 0.060 in 1060 Alloy | Derived (5.8 geometry), Print |
| 5.10 | 261 | Part and mass; A=3.50, B=0.70 in, 1060 Alloy | Print |
| 5.11 | 261 | Part and mass; A=3.00, B=0.75 in, copper | Print |
| 5.12 | 262 | Part, volume and center of mass; A=3.30, B=2.00 in, 2014 Alloy | Print |
| 5.13 | 262 | MMGS part from third-angle drawing, volume and center of mass | Print |
| 5.14 | 263 | MMGS symmetric part from drawing, Hole Wizard, volume and center of mass | Print |
| 5.15 | 264 | MMGS part from drawing with mid-plane/through-all/up-to-surface features; volume and center of mass | In progress: fresh Chrome stock + first cut checkpoint preserved; second cut/rib and exact acceptance pending browser recovery. See `artifacts/planchard/EXERCISE-5.15-browser-progress-2026-09-28.md`. |
| 5.16 | 265 | Cosmetic 1/4-20 UNC 2A thread, 1 in depth, on supplied base part | Companion: `Cosmetic thread` part in Chapter 5 Homework folder |
| 5.17 | 266-267 | 3D-sketch Hole Wizard counterbore placed and dimensioned on cylindrical face | Companion: `Hole Wizard 5.17` base part in Chapter 5 Homework folder |

## Chapter 6: revolved-feature homework

| Exercise | PDF p. | Required CAD output | Input |
|---|---:|---|---|
| 6.1 BUSHING | 302 | Fully defined front-plane revolved bushing; brass, IPS | Print |
| 6.2 PIN | 303 | Revolved pin with 6061 Alloy and mass measurement | Print |
| 6.3 Mounting Nut | 303 | Metric nut and chamfers, plain carbon steel | Fresh conical-stock workflow accepted in Chrome: assumed 17 AF ×8 mm / Ø10 bore, two-distance exterior chamfers before hex cut, .5 mm bore chamfers. Exact mass, Save/reopen, depth edit/Undo/Redo and STEP recorded in `artifacts/planchard/MOUNTING-NUT-6.3-conical-browser-2026-09-28.md`. No measured-nut/thread claim. |
| 6.4 SCREW | 304 | 10-24 x 3/8 simplified screw: revolve, mid-plane cut, fourfold pattern, R0.01 fillet | Print |
| 6.5 | 305 | Right-plane extrusion/cut, nonorthogonal edges, 6061 Alloy; A=3, B=1 in | Print |
| 6.6 | 305 | Front-plane revolve/cut with centerline, MMGS; A=Ø12 | Print |
| 6.7 | 306 | Extrude, two cuts and fillet; 6061 Alloy, mass; A=4, B=R0.5 in | Print |
| 6.8 HOLE-BLOCK | 307 | 2 x 5 x 2 in block with four distinct Hole Wizard types and spacing | Print |

## Chapter 7: sweep/loft/rib homework

| Exercise | PDF p. | Required CAD output | Input |
|---|---:|---|---|
| 7.1 QUATTRO-SEAL-O-RING | 369 | One swept solid: Ø100 mm path and symmetric section | Print |
| 7.2 HOOK | 369-370 | Sweep, 0.050 in dome and right-hand #8-36 thread | Estimate: explicitly says not all dimensions provided |
| 7.3 WEIGHT | 371 | Loft 1.000 x 0.750 in rectangle to 0.500 in square across 0.5 in; Ø0.150 in through hole | Print |
| 7.4 SWEPT-CUT CASE | 371 | Pencil case with semicircular swept cut | Estimate: dimensions deliberately absent |
| 7.5 | 372 | Part from ANSI third-angle drawing; Hole Wizard, rib, linear pattern, volume/center of mass | Print |
| 7.6 | 372 | Soap case with extrusion, fillet and shell, ABS | Estimate: dimensions deliberately absent |
| 7.7 | 373 | Revolved part, Hole Wizard, circular pattern, PBT | Estimate: dimensions deliberately absent |
| 7.8 | 373 | Extruded and revolved part, 6061 Alloy | Estimate: dimensions deliberately absent |
| 7.9 Gem paper clip | 374 | Line/arc path swept with Ø0.010 in wire | Estimate: only wire diameter is fixed |
| 7.10 variable-pitch spring | 374 | Ø0.235 in helix, specified region-pitch table, Ø0.015 in sweep | Print |
| 7.11 water bottle | 375 | Revolve/dome/shell/helix/sweep bottle | Estimate: book says estimate needed dimensions |
| 7.12 ice-cream cone | 376-377 | Designer's own cone, structural ribs, thin revolve/pattern | Estimate: open design brief |

## Chapter 8: assembly homework

| Exercise | PDF p. | Required output | Input |
|---|---:|---|---|
| 8.1 WEIGHT-HOOK | 413 | Mate weight and hook concentrically/coincident; rotation then fixed pose | Derived 7.2+7.3; book also supplies parts |
| 8.2 WEIGHT-LINK | 414 | AXLE + FLATBAR + 8.1 subassembly with concentric, coincident and tangent mates | Derived 5.6/5.9/8.1 (nine-hole bar); book also supplies parts |
| 8.3 binder clip | 415 | Two component types, material, mates and motion | Estimate: choose dimensions and create parts |
| 8.4 limit mate | 416 | Reproduce slide's travel limits | Companion: `Limit Mate` assembly and measured limits |
| 8.5 screw mate | 417 | Vice screw pitch/motion in multi-part assembly | Companion: `Screw Mate` folder plus AVI motion reference |
| 8.6 / 8.6A angle mate | 418 | Angle mate and alternate pictured angle case | Companion/example parts; angle geometry must be read from image |
| 8.7 symmetric mate | 419 | Constrain component symmetrically and test motion | Companion/example assembly |
| 8.8 gear mate | 420 | Mechanical gear relation and motion | Companion/example assembly |
| 8.9 counterweight | 421-422 | Moving counterweight assembly | Companion sample parts; choose/add missing parts if needed |
| 8.10 butterfly valve | 423 | Complete assembly, mating motion, exploded third-angle drawing/BOM | Companion sample parts; external design reference requested |
| 8.11 shock | 424 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts; external design reference requested |
| 8.12 quick acting clamp | 425 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts; external design reference requested |
| 8.13 drill guide | 426 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts; external design reference requested |
| 8.14 pulley | 427 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts; external design reference requested |
| 8.15 welder arm | 428 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts and AVI motion reference |
| 8.16 radial engine | 429 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts; external design reference requested |
| 8.17 bench vice | 430 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts; external design reference requested |
| 8.18 Kant-Twist clamp | 431 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts; external design reference requested |
| 8.19 arbor press | 432 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts and AVI motion reference |
| 8.20 shaper tool head | 433 | Complete assembly, mating motion, exploded drawing/BOM | Companion sample parts and AVI motion reference |

For 8.10-8.20, the brief explicitly permits creating extra components, but the printed page does not define a unique full bill of parts. A faithful book result requires inspecting its sample parts/AVI; a new from-scratch interpretation is still possible if documented as such.

## Chapter 9: drawing homework

| Exercise | PDF p. | Required output | Input |
|---|---:|---|---|
| 9.1 FLATBAR - 3 HOLE | 474 | Fresh part plus A/ANSI front/top/shaded isometric sheet, dimensions, linked thickness note, centerlines, custom properties | Print / Derived 5.8; chapter-folder icons optional |
| 9.2 CYLINDER | 475 | Fresh part plus A/ANSI sheet, views, centerlines/marks, annotations, properties | Print; chapter-folder icons optional |
| 9.3 PRESSURE PLATE | 476 | Fresh part plus A/ANSI front/right views, six-hole callout, properties | Print; chapter-folder icons optional |
| 9.4 LINKS | 477 | Assembly of three FLATBAR configurations and SHAFT COLLAR; drawing with BOM/balloons | Companion parts named, or Derived 5.7/5.8 with new configurations |
| 9.5 PLATE-1 | 478 | Fresh metric part plus A/ANSI third-angle front/right sheet, annotation/properties | Print; chapter-folder icons optional |
| 9.6 FLAT-PLATE | 479 | Fresh inch part plus A/ANSI four-view sheet, annotation/properties | Print; chapter-folder icons optional |

## Chapter 10: CSWA examples and models

The book's screenshots of actual exam prompts on PDF pp. 484-490 are **illustrative excerpts**, not a complete downloadable exam. The chapter's worked practice models on PDF pp. 496-515 are distinct from those screenshots. For timed simulation, save each modified state separately and check the printed mass, volume or center of mass before continuing.

| Identifier | PDF pp. | Required output / book check | Input |
|---|---:|---|---|
| Exam screenshot Basic Q1-2: Radial Swing Block | 484-485 | Build then modify aluminum part; A=120, B=14 mm, C=51.5°; mass | Companion/full exam prompt: screenshot omits model views/dimensions |
| Exam screenshot Intermediate Q3-4: Tank | 485 | Build then add top handle/bottom platform; mass | Companion/full exam prompt: A=375, B=412.5 mm is insufficient alone |
| Exam screenshot Assembly Q5-6: Wheel Linkage | 486-487 | Mate six named components, then modify/measure X at 12.5° | Companion: `Wheel_Linkage_Assembly.zip` is explicitly attached |
| Exam screenshot Advanced: Bracket | 488 | Build AISI1020 bracket; mass | Companion/full exam prompt: only A/B/C and partial image printed |
| Exam screenshot Advanced: Connector | 489 | Build cast-stainless connector; mass | Companion/full exam prompt: only A/B/C and partial image printed |
| Drafting sample Q1-6 | 493-494 | Identify closed-spline procedure, crop, alternate-position, break, aligned-section, closed-spline procedure | Theory; no model required |
| Basic/intermediate sample Q1 | 496 | Build IPS part; COM (1.63, 1.01, -0.04) in; 4.97 lb, 17.86 in³ | Print figure; companion initial/final files also offered |
| Basic/intermediate sample Q2 | 497 | Build copper MMGS part; COM (0, 19.79, 0) mm; 1605.29 g | Print figure; companion initial/final files also offered |
| Basic/intermediate sample Q3 | 498 | Build cast-alloy-steel MMGS part; COM (9.79, -0.13, 0) mm; 69.77 g | Print figure; companion files also offered |
| Basic/intermediate sample Q4 | 499 | Build seven-feature mirrored part; COM (49.21, 46.88, 0) mm; 3437.29 g | Print figure; companion files also offered |
| Basic/intermediate sample Q5 | 500 | Build ribbed part; COM (0, 0.73, -0.86) in; 2.99 lb | Print figure; companion files also offered |
| Basic/intermediate sample Q6 | 501-502 | Build AISI304 part; 888.48 g, 111059.43 mm³, default-origin COM | Print multiview figure; companion files also offered |
| Basic/intermediate sample Q6A | 503 | Add coordinate system at front-right-bottom vertex; COM (-80.39, -15.93, -22.65) mm | Derived sample Q6 |
| Basic/intermediate sample Q6B | 503 | Edit fillets to 7 mm, length to 140 mm, material to 1060 Alloy; 309.75 g, 114721.22 mm³ | Derived sample Q6 |
| Advanced sample Q1 | 504-505 | Build flanged part; COM (0, 0, 1.51) in; 0.59 lb | Print figure; companion files offered |
| Advanced sample Q2 | 506 | Build 11-feature thin/mirror part; COM (1.59, 1.19, 0) in; 1.37 lb | Print figure; companion files offered |
| Advanced sample Q3 | 507 | Build 13-feature thin/pattern/mirror part; new-coordinate COM (-53.30, -0.27, -15.54) mm | Print figure; companion files offered |
| Advanced sample Q4 | 508-509 | Build 12-feature thin/mirror part; COM (0, 34.97, -46.67) mm; 2536.59 g | Print figure; companion files offered |
| Advanced sample Q5 | 509-510 | Build copper part; COM (26.81, 25.80, -56.06) mm; 1280.33 g | Print figure; companion files offered |
| Advanced sample Q6 | 511-512 | Build nonsymmetric steel part; 4079.32 g, 522989.22 mm³; default-origin COM (35.91, 0, 0.70) mm | Print multiview figure; companion files offered |
| Advanced sample Q6A | 512 | Add coordinate system at back-right-bottom vertex; COM (-64.09, 75, 40.70) mm | Derived advanced sample Q6 |
| Assembly sample: Chain Link | 514-515 | Nine instances from three part types with angle mates; COM (348.66, -88.48, -91.40) mm and 33821.70 g | Companion: chapter CSWA model folder explicitly required for components |

The summary screenshot on PDF p. 495 additionally names **Hydraulic Cylinder Half**, **Wheel**, and **Connecting Rod Assembly** as another exam version. No complete dimensioned prompt for those three is printed; treat them as screenshot references, not three extra solvable book models. Likewise the wheel-linkage and advanced screenshots above should not be passed off as complete practice problems without their source files.

## Acceptance fields for every future row

For each newly built model, add the fresh Chrome document name, exported checkpoint path, actual feature/assembly/drawing history, dimensional comparison, material/mass check when stated, upstream edit/rebuild result, save/reopen result, and whether companion data or a design assumption was needed. Keep `pending` until that evidence exists. For theory rows, record the resulting drawing/annotation or answer separately; a blank part is not a completion.

## Chapter 8 continuation audit, 30 September

Exercise 8.8 now has five fresh components, five native mates and one
rotational degree of freedom saved and cold reopened in Chrome. The actual
Motion study form committed a five RPM, one second, external 20:40 relation;
the saved portable bundle retains numeric occurrence IDs, one motor and one
gear relation. Protected artifact:
`artifacts/planchard/GEAR-assembly-motion-browser-2026-09-30.mforge`
(36,570,133 bytes). Both axial mate signs were subsequently changed in the
visible inspector to −0.05 cm, Aligned, to place gear starts at Y=0.85 cm above
the base; Save is clean. Exact interference is currently rebuilding the
40-tooth gear. Exercise 8.8 remains pending its clearance result.

The remaining designer project pages were visually reviewed. All require
own parts, proper movement, third-angle isometric exploded drawing with
explode lines, BOM, balloons, general notes and custom title properties.
The referenced sample parts and AVI files are absent; dimensions must be
declared design assumptions, not claimed recovered measurements.

| Exercise | PDF page | Printed sheet requirement | Printed mechanical project |
|---|---:|---|---|
| 8.13 | 426 | ANSI C landscape | Drill guide: base, two rotators, two rod guides, slide, two collars, two bushings, two retaining rings, adapter, four thumb screws |
| 8.14 | 427 | ANSI A landscape | Double pulley: base, two brackets, four braces, six nuts, two supports, four cap screws, two turn screws, two bushings, two pulleys, two washers, silicone rubber belt |
| 8.15 | 428 | ANSI C landscape | Welder arm articulated base/support/fixture/linkage; shown 12-type BOM |
| 8.16 | 429 | ANSI C landscape | Five-cylinder radial engine, articulated rods/master rod/crank/pistons/rings; additional parts shown |
| 8.17 | 430 | ANSI A landscape | Bench vice, ten types, all alloy steel; separate clamping plate/base rails/vice jaw/screw/handle fasteners |
| 8.18 | 431 | ANSI C landscape | Kant Twist clamp, linked paired braces, rotating jaws and screw handle; optional stand shown |
| 8.19 | 432 | ANSI A landscape | Arbor press: column/cover/screws subassembly, table plate, stubby peg, square rack peg, handle, press body |
| 8.20 | 433 | ANSI C landscape | Shaper tool head: vertical screw slide and pivoting tool holder, 16-type BOM |

These rows are requirement audits only; they have no accepted fresh assembly
or drawing yet. They must remain pending until actual browser construction,
movement and sheet exports are verified.
