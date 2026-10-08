# Exercise 8.17: BV01 base acceptance

Current accepted revision: rear mounting-hole centers **X170 mm**, saved in the global library and exported through Chrome. The initial X146 mm acceptance below remains historical evidence; it is superseded for current assembly use by the revision described near the end of this report.

Source: Planchard 2021, printed8-52/PDF430, freshly rendered from the user's Downloads PDF. Original designer dimensions follow `bench-vice-8.17-design.md`; the brief supplies no dimensions or available companion parts/AVI. This accepts only BV01, not the vice assembly or entire book.

## Actual desktop Chrome authoring

Resumed the existing fresh six-feature library document `cm_musrulf4`, named `Planchard 8.17 - BV01 Base - fresh designer example 2026-10-03`. Browser-only extension controls at localhost8765, dark app, real WebGL; no native Computer Use or injected geometry.

- New Top sketch: fixed center U8/V0, driving diameter4.2mm, offset42.2mm. Blind Extrude Cut1.8mm Along normal, completing stepped retention passage Y42.2..44.
- New Top sketch: four fixed-center driving-diameter6mm circles, centers U30/146,V+/-25, offset0. One Blind Extrude Cut4mm Along normal, producing four underside mounting bores Y0..4.
- Custom properties: PartNo BV01,Description,Source,OriginalDesignerExample,BookItemNo1,BookMaterial,RetentionRepresentation. Saved in library; material remained Alloy Steel SOLIDWORKS reference7.70g/cm3.
- Final history16 steps: eight ordinary sketches, eight solid features, all sketches Fully defined. Native solid count1. Bounds176x66x70mm.

## Parametric and durability checks

One foot-hole diameter6->7mm rebuilt downstream cut. UI volume198.6972->198.6563cm3; analytic subtraction for a4mm cylinder is pi/4*(49-36)*4/1000=0.0408407045cm3, consistent with displayed rounding. Undo->Redo->Undo restored nominal geometry and198.6972cm3. Library saved before export. Cold browser reload, preserve recovery draft, reopen saved library:16 history steps, same solid count/bounds and mass. No draft definition was substituted for the library acceptance.

Exact native mass198.69716711709407cm3 at density7.7 gives1.5299681868016244kg. COM(95.2095416363,18.3889319158,approximately0)mm. This is a geometry/material result, not a mass target from the book.

## Protected outputs and independent audit

- `artifacts/planchard/BV01-base-final-browser-2026-10-08.mforge`: actual Chrome Project bundle download,920989 bytes; eight authored features. Read-only adapter expands this into23 kernel operations; do not call that23 authored features.
- `artifacts/planchard/BV01-base-final-browser-2026-10-08.step`: actual Chrome STEP download,121559 bytes.
- `BV01-native-export-audit-2026-10-08.json`: exported recipe independently rebuilt with no issues, exact volume198.69716711709407cm3, export validation passed.
- `BV01-native-step-audit-2026-10-08.json`: downloaded STEP reimport valid, one solid, volume198.69716536619055cm3, maximum tolerance1e-7cm. Volume differs by0.0000017509cm3 from recipe rebuild.
- `BV01-exact-mass-browser-2026-10-08.jpg`, `BV01-cold-reopen-mass-browser-2026-10-08.jpg`: saved browser screenshots.

Authoring occurred across runtime recovery/ribbon repair/test work; continuous elapsed authoring time and exact click count were not reliably captured. No speed advantage over SOLIDWORKS is claimed. Previous six-feature recovery export remains protected separately and is superseded only for BV01 geometry.

## Browser revision: rear mounting holes X170 mm

The full-travel assembly audit found that the rear mounting foot at X146 mm blocked the moving tongue and keeper from 29 mm jaw travel. The original design was revised to place the rear foot and its two screws at X170 mm, leaving 2 mm clearance to the moving keeper at the 50 mm end stop. The matching BV01 fixing bores therefore move from U146 to U170; diameter6 mm, V±25 mm, datum offset0 and cut depth4 mm remain unchanged.

This revision was authored in the assembly context, then independently repeated for Circle3 and Circle4 in the global library through visible Chrome controls. Each Center U170 field was committed with Enter; the library was saved and the revised bundle and STEP downloaded. There are still eight authored features, eight fully defined sketches with no diagnostics, sixteen history entries, and one native solid. The assembly-local and library definitions match exactly for both raw and compiled feature/sketch geometry; their compiled feature hash is `316cb848ab436e28f56564abea695b35a0c43c3829fb44b75b09b667671b3044`.

Read-only native rebuild of `artifacts/planchard/BV01-base-rearfoot170-browser-2026-10-08.mforge` passed export validation without issues: volume198.6971671170941 cm³, mass1.5299681868 kg at7.7 g/cm³, bounds176×66×70 mm, COM(95.1822203021,18.3889319158,approximately0) mm. The23 adapter operations remain eight authored features. The actual downloaded STEP, `BV01-base-rearfoot170-browser-2026-10-08.step` (121545 bytes), reimports as one valid solid at tolerance1e-7 cm and volume198.69716536619055 cm³. The unchanged volume and shifted center of mass agree with relocating equal-size blind bores.

Evidence: `BV01-base-rearfoot170-native-bundle-audit-2026-10-08.json`, `BV01-base-rearfoot170-native-step-audit-2026-10-08.json`, and `BV01-base-rearfoot170-library-assembly-consistency-audit-2026-10-08.json`, all under `artifacts/planchard/`. The consistency comparison uses the actual `BV-assembly-rearfoot170-collapsed-home-browser-2026-10-08.mforge` export. Initial X146 exports remain protected; use the X170 revision for the current vice. Verification did not change authored models. See `ADVANCE.md` for the current book position and remaining assembly/drawing work.

## Initial next steps (historical)

Build remaining BV02..BV10 from blank, following frozen interfaces; assemble16 occurrences and verify4mm/rev screw movement0..50mm, clearances and cold reopen. Create requested ANSI A landscape third-angle exploded sheet, explode lines,10-row BOM and16 balloons. Source title discrepancy ARBOR PRESS remains disclosed; intended example title BENCH VICE.
