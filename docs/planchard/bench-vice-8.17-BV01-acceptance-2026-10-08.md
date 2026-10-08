# Exercise 8.17: BV01 base acceptance

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

## Next

Build remaining BV02..BV10 from blank, following frozen interfaces; assemble16 occurrences and verify4mm/rev screw movement0..50mm, clearances and cold reopen. Create requested ANSI A landscape third-angle exploded sheet, explode lines,10-row BOM and16 balloons. Source title discrepancy ARBOR PRESS remains disclosed; intended example title BENCH VICE.
