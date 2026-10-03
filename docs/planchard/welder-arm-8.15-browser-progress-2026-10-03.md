# Welder arm 8.15 — browser progress

## WA01 pedestal accepted

Authored from a blank document through visible Chrome UI on 3 October 2026, own tab 710860247. Saved library key `cm_musdksnb`, name `Planchard 8.15 - WA01 pedestal - fresh designer example 2026-10-03`.

Eight history steps: four fully defined origin-centred Top circles; native flange Extrude8 mm; native solid Loft between Ø72 at Y8 and Ø36 at Y63; merged journal Extrude40 mm from Y63 using Ø24; Hole Wizard four Ø6.6 holes on PCD80. The hole feature shares the journal source sketch and uses circular layout centred at the origin, reverse through-all; at radius40 only the flange is intersected. Native solid-body count is one.

Selected material: Ferritic stainless steel, grade unspecified, density7.70 g/cm³. Saved custom properties preserve printed `BookMaterial=Cast Stainless Steel`, original designer dimensions and the explicit proxy distinction. No cast grade or load rating is inferred.

Hard reload → Model → Saved models → exact newly saved WA01 record cold-open passed. All eight steps remain editable, all four circles fully defined, dimensions100×103×100 mm. Cold-open UI Mass Properties reports exact solid geometry, one body, volume210.4601 cm³, mass1.620543 kg, centre(0,26.68623,0) mm.

Independent read-only native replay: no issues, one export-valid solid, volume210.46006708481343 cm³, centreY26.686229540694097 mm; tolerance1.0000000444×10⁻⁷ cm. Browser STEP import: one export-valid solid, volume210.4600670848491 cm³, centreY26.686229540695505 mm; tolerance10⁻⁷ cm. The native and STEP results agree without changing geometry.

Protected evidence:

- `artifacts/planchard/WA01-pedestal-browser-2026-10-03.mforge` — 605145 bytes, editable native history and properties.
- `artifacts/planchard/WA01-pedestal-browser-2026-10-03.step` — 33434 bytes, exact geometry.
- `artifacts/planchard/WA01-pedestal-cold-reopen-browser-2026-10-03.jpg` — visible cold-open native mass proof.
- `docs/planchard/welder-arm-8.15-design.md` — explicit original geometry/interfaces and source distinctions.

## WA04 wrist rotor accepted geometry

Fresh blank human Chrome authoring on tab710860247, library key `cm_musejv53`, exact saved role name `Planchard 8.15 - WA04 wrist rotor - fresh designer example 2026-10-03`. Two fully defined origin-centred Top circles: Ø24 at Y20 extruded40 mm; Ø50 at Y60 extruded6 mm merged. Four editable history steps, one body, bounds50×46×50 mm, position extentY20–66 mm. Assembly placement is (85,83,0), not embedded into the part frame.

Custom PartNo4, Description, BookMaterialCast Stainless Steel and explicit ferritic density7.70 proxy saved through UI. Native read-only replay has no issues and one export-valid solid, volume29.876546135638925 cm³, centreY49.06940063091482 mm. STEP import agrees at29.876546135638627 cm³, one export-valid solid. Material mass230.0494052444197 g. Both maximum tolerances are10⁻⁷ cm.

Protected `WA04-wrist-rotor-browser-2026-10-03.mforge`116156 bytes and matching `.step`9676 bytes. Browser hard reload and actual saved-record cold-open retain4history steps, two fully defined circles, one solid and50×46×50 mm bounds. Cold native Mass Properties passed: volume29.87655 cm³, mass0.2300494 kg, density7.7 g/cm³, centreY49.0694 mm. Proof: `WA04-wrist-rotor-cold-reopen-browser-2026-10-03.jpg`.

## WA05 midpiece accepted

Fresh blank human Chrome authoring, library key `cm_musewjyg`, saved name `Planchard 8.15 - WA05 midpiece - fresh designer example 2026-10-03`. Fixed-centre Top rectangle24×24 mm atY66, Extrude20 mm. Two editable history steps, one fully defined sketch and one native body; bounds24×20×24 mm, Y66–86 mm. Saved PartNo5, Description, BookMaterial and explicit ferritic7.70 density proxy.

Independent read-only native replay and STEP import both pass with one export-valid solid, volume11.52 cm³, centre(0,76,0) mm and tolerance10⁻⁷ cm. Actual hard reload and saved-record cold-open passed; visible exact mass88.704 g, density7.7. Protected editable `WA05-midpiece-browser-2026-10-03.mforge`, exact matching `.step`, and `WA05-midpiece-cold-reopen-browser-2026-10-03.jpg`.

## WA08 holder accepted

Fresh blank human Chrome authoring, library key `cm_musf56xr`, saved name `Planchard 8.15 - WA08 holder - fresh designer example 2026-10-03`. Fixed-centre Top rectangle36×60 mm atY94, Extrude8 mm, native Hole Wizard two Ø5.5 through holes with circular layout radius15 mm, angle0°, centred atX±15,Z0. The rectangle sketch remains fully defined and is shared by the extrusion and hole feature. Three editable history steps, one native body, bounds36×8×60 mm, Y94–102 mm. PartNo8 and the explicit material proxy are saved.

Independent read-only native replay: no issues, one export-valid solid, volume16.899867288915647 cm³, centre(0,98,0) mm. STEP import agrees at16.8998672889156 cm³, one valid solid. Both tolerances10⁻⁷ cm. Actual hard reload and saved-record cold-open passed; native mass130.1289781246505 g at7.70 g/cm³. Protected `WA08-holder-browser-2026-10-03.mforge`150350 bytes, matching `.step`25061 bytes, and `WA08-holder-cold-reopen-browser-2026-10-03.jpg`.

## Mounting revision accepted

An actual assembly fit audit found that the initial PCD30 fixture holes missed the midpiece and that 16 mm support screws could not span the support/holder stack. The original accepted part exports above remain protected as historical checkpoints. The current saved WA05/WA08 parts have been corrected through human Chrome UI to the revised dimensional plan.

WA05: added a fully defined Ø4 reference circle on Top offsetY86, then three Ø4 flat-bottom blind holes4 mm deep, reverse normal, circular layout radius9 mm and first angle30°. Four editable history steps, two fully defined sketches, one exact solid. Custom `ThreadRepresentation` explicitly identifies smooth nominal internal thread envelopes, ideal cosmetic retention and absent load rating. Native/STEP volumes11.369203552627697/11.369203552627686 cm³; centreY75.89389128504966 mm; mass87.5428673552333 g at7.7. Both export-valid one solid, tolerances10⁻⁷ cm. Hard reload and exact saved-library reopen passed with visible native mass. Protected revised-mounts `.mforge`180421 bytes, `.step`27404 bytes and cold JPEG; the earlier precommit sketch checkpoint is separately retained and is not the accepted revision.

WA08: retained the two Ø5.5 support holes, added three Ø4.5 through holes on PCD18 at30°, shared fixed-centre Top rectangle, four editable history steps and one solid. Native/STEP volumes16.518163781504487/16.518163781504438 cm³; centreY98 mm; mass127.18986111758455 g at7.7. Both valid one solid with tolerance10⁻⁷ cm; hard-reload saved-record cold Mass Properties passed. Protected revised-mounts `.mforge`319535 bytes, `.step`39871 bytes and cold JPEG.

## Assembly placement checkpoint

Fresh blank assembly authored through own Chrome tab710860247, saved key `asm_musfei54`, name `Planchard 8.15 - Welder arm assembly - fresh designer example 2026-10-03`, document unitsmm. First WA01 grounded at origin; WA02 at(0,83,0); WA03/04/05/06/08 and two WA09 at(85,83,0), second jawRY180°. The nine-occurrence checkpoint is protected as `WA-assembly-nine-components-placement-browser-2026-10-03.mforge`2170778 bytes and screenshot. Read-only exported transforms agree exactly; no mates or motion acceptance was claimed.

The final placement checkpoint contains all 18 occurrences, with verified BOM quantities: parts1–6 each1, part7×2, part8×1, part9×2, part10×3, part11×2, part12×2. Added accepted WA07 supports at(70,83,0)/(100,83,0); two M6×40 WA11 screws at tip origins(63,200,±18), RZ−90°; two M5×40 WA12 screws at(70,175,0)/(100,175,0), no rotation; three M4×20 WA10 screws at(92.794228634,165,4.5), (77.205771366,165,4.5), and(85,165,−9), no rotation. WA03, WA05, WA06 and WA08 instances were refreshed using actual Update from library controls. Exported snapshots retain the corrected WA03 six steps, WA05/06/08 four steps, and WA07 six steps. Canonical exported transforms agree with the millimetre UI placements.

Protected final placement: `WA-assembly-eighteen-components-placement-browser-2026-10-03.mforge`5761789 bytes and matching JPEG. Saved clean and handed to the parent agent for native joints/motion, with the same immutable checkpoint supplied to the interference audit agent. This checkpoint has zero mates; its placement, source revision and BOM acceptance do not establish mechanism or clearance acceptance. The earlier13/15-occurrence checkpoints are also retained.

## Encountered app gap fixed

Other-tab saves refreshed the saved-model library but left the assembly insertion dropdown stale. `refreshLibraryFromOtherTab()` now also calls the assembly component renderer when an assembly is open. Existing occurrences, source snapshots, selection and placements are preserved. Three focused functional regressions pass, including cross-tab insertion refresh, unchanged authored occurrence poses, optimistic save conflict detection and compact assembly baselines. `npm run check` passes: no free identifiers, no link errors across633 modules,1490 source assertions checked. The assembly was cold reopened successfully after loading the source fix. A separate newly arriving record was not browser-tested after that reload; the functional regression establishes the refresh routing.

## Exercise 8.15 completed — printed 8-50 / PDF 428

All 12 fresh source roles and 18 occurrences are accepted. Human Chrome authoring added 23 native mates: five concentric hinges, five axial distance mates, twelve rigid locks and one 1:1 gear relation. The solver reports four degrees of freedom. Gear Reverse was corrected through the inspector so the mirrored jaws turn in opposite world directions.

Four native studies were created from the assembled home pose: symmetric jaws ±20° about local pivot (0,117,18) mm, shoulder yaw 30°, housing pitch 30°, and wrist yaw 30°. Each was sought to time 1 and restored to time 0 in Chrome. Native all-visible interference returned no overlaps at home and at each demonstrated pose. An initial pitch sequence exposed free-wrist drift; study-wide pose baselines now restore every component before each seek. The corrected Chrome sequence returned the wrist to 0° and then reached 30°. Hard reload and saved-library reopen retained all four studies at time 0; the reopened jaw study visibly opened symmetrically.

The native ANSI C landscape drawing uses third-angle projection, mm, actual scale 1:2, 18 balloons, 12 BOM rows totaling 18 occurrences, material/finish/mass fields, and five explicit design notes. A manually authored 16-step multi-axis compact view is active; the original 17-step automatic view remains selectable. Native drawing preview was visually inspected, and a hard reload retained both views and all 16 authored steps.

Protected final outputs: `WA-assembly-final-browser-2026-10-03.mforge` (5,805,307 bytes), `WA-assembly-home-browser-2026-10-03.step` (666,914 bytes), `WA-ANSI-C-exploded-browser-2026-10-03.svg` (489,418 bytes), and `WA-BOM-browser-2026-10-03.csv` (1,172 bytes). All were generated by actual browser UI and copied unchanged. STEP has 18 valid solids and 160×245×100 mm bounds; native volume 485.6869152876 cm³ and mass 3.7407361251 kg agree with the browser, with STEP volume differing by only 0.0000070860 cm³.

App fixes verified during this exercise: offset rotary pivot; deterministic full assembly study baselines; upstream history-feature editor selection; one-solid Toolbox occurrence counts; live assembly insertion refresh; native drawing preview; and reversible creation of an empty exploded view. Focused regressions and required module/link/source-assertion gates pass. This does not claim the whole-book task or historical full CI failures are resolved.

## Next checkpoint

Exercise 8.16 begins on printed 8-51 / PDF 429. Its read-only plan is in `radial-engine-8.16-design.md`; no radial-engine models were created during the welder-arm exercise. All welder-arm deliverables are saved independently of live tabs. Browser tabs may be closed after any later work is saved; this completed exercise can be reopened from the library or final portable bundle.
