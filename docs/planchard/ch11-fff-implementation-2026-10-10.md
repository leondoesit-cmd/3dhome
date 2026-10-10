# Chapter11 bounded genuine FFF slicer implementation

Implemented2026-10-10 against `chapter11-remaining-digital-workflow-plan-2026-10-10.md`, sourcePDF541–547 /11-21–27. This is implementation plus independent read-only feasibility, **not actual browser slicing/cold acceptance or physical printing**. No CAD authoring, source-export mutation, ADVANCE edits or commits by this agent.

## Actual new capability

Output/ribbon/global search expose **FFF slice preview**, independent of the previously accepted **Layer analysis**. It acquires validated actual native0.01mm/5° print meshes with the saved orientation/bed, preserves occurrence identity and stale-source/cancel guards, generates wall/skin/rectilinear infill/support/adhesion paths, shows selectable deposition layers, and exports actual JSON/SVG/G-code. Apply stores `fffSliceSettings` study metadata with Undo; features, sketches, solids and occurrence poses are unchanged. The selected slice settings must be reapplied before exporting after any edit.

New dependency-free core files:

- `js/core/print_raster.js`: bounded scanline raster regions with holes/concavity, conservative chamfer-distance offsets, booleans/dilation and closed boundary tracing. A separate exact source-contour segment-clearance check rejects a deposition path if its bead intersects a missed sub-grid void/boundary.
- `js/core/print_toolpaths.js`: original native mesh sectioning, explicit raster grid, physical-layer top-Z deposition, walls, locally exposed top/bottom skins, alternating rectilinear infill, vertical-column support with Touching Buildplate/Everywhere distinction, real skirt/brim/raft, filament/material/time estimates, layer/cell/path budgets and cooperative cancellation. Raft raises the model deposition height. Fit includes the complete deposited **bead envelope**, including half line width, not just centreline coordinates; bed dimensions must be finite positive.
- `js/core/print_toolpath_export.js`: shared tagged-path SVG and explicit `illustrative-generic-absolute-e` G-code with G21/G90/M82, nonextruding G0 travels, positive extrusion G1, XYZ bed-origin conversion and mm/s→mm/min feeds. Independent export guard verifies bead-envelope fit.

Minimal integration: imports, separate Output commands/dispatcher/new `openFffSlicePreview` in `js/modeler.js`; separate visible entry in `js/pro_catalog.js`. The existing `openPrintLayerAnalysis` operation and its read-only source-preservation contract are unchanged.

## Scope that must remain visible

This is a bounded **conservative raster** FFF study, not exact polygon offsets or a printer-certified production engine. Default grid0.2mm/line0.4mm; offsets include two additional grid cells of clearance. Chamfer distances are conservatively corrected. Narrow regions can collapse; `unresolved-thin-region` diagnoses a filled object layer without any surviving wall, but a narrow branch can disappear while its broader region survives without branch-specific diagnostics. The exact contour guard prevents deposition through a void, not loss of all fine features. Finer resolution may be required and is limited by explicit resource budgets.

Only alternating rectilinear infill, shared wall/skin speed and shared infill/support speed, constant width, straight vertical-column supports and simple adhesion are implemented. UI exposes support placement/density/gaps, not every possible support style;45° support heuristic,1.75mm filament and2 raft layers are explicit saved defaults, fixed in the current form. No adaptive thin-wall paths, tree supports, retraction, bridging optimization, acceleration simulation, heating/homing/start-end printer macros or multi-extruder workflow. G-code is an illustrative digital motion study under an explicit generic profile; actual device compatibility/printing remains unverified. Deposited volume uses rectangular-bead approximation and estimated time excludes acceleration/travel.

## Tests and actual accepted-source feasibility

Final focused command passed **21/21**:

`node --test tests/print_toolpaths.test.mjs tests/print_toolpaths_ui.test.mjs tests/print_layer_analysis_ui.test.mjs tests/print_setup.test.mjs tests/assembly_print.test.mjs`

Seven new core tests cover concave slots/holes/diagonal islands; real circular-hole bead clearance;15→20% material/path change;0% interior behavior; internal downward counterbore shoulder support; Buildplate versus model-terminated Everywhere; actual skirt/brim/raft and bed overflow; G-code extrusion/feed replay; source immutability/deterministic cold JSON; invalid profile/mesh/budgets/stale state; rejected sub-grid slot; and binary-exact0.125mm-grid brim half-bead overrun plus independent G-code bed guard. Three actual-handler tests cover command visibility, real native mesh generation/exports, study-only persistence, settings/source staleness and cancellation. Original layer-analysis UI/assembly/print setup tests also pass.

**`npm run check` PASS:** no free identifiers, no link errors at671modules, all1489 source assertions satisfied by executable code. UI agent independently reviewed the implementation and found the bead-envelope bug, which was fixed with regression; see `ch11-fff-independent-source-code-review-2026-10-10.md`.

Read-only final feasibility on the **existing actual accepted FLAT cold Top STL** (117584bytes,2350triangles,1175 welded vertices):0.2mm layers/grid,0.4mm width,15% infill generated **204 deposition layers,535 wall paths,1837 skin paths,3991 infill paths**, no unresolved-region diagnostics, and1298730-byte actual illustrative G-code in9643ms. Independent contour clearance and bead fit passed; source bytes remain unchanged. Filament estimate10389.8408877mm; deposited volume24990.4959756mm³; these are qualified path estimates, not native volume/actual print consumption. Helper `scratch/planchard/ch11-fff-source-readonly-2026-10-10.mjs`; summary `artifacts/planchard/CH11-FFF-readonly-source-feasibility-2026-10-10.json`. It explicitly marks actualBrowserSlicerAcceptance=false.

## Next actual Chrome witness

1. Hard reload; open exact accepted FLAT print variant with Top150mm bed. Output → FFF slice preview; Apply default settings. Inspect first/middle/final layer paths; exportJSON/SVG/illustrativeG-code. Compare only infill15→20%, save study settings, cold reopen/readback/regenerate and independent source/deterministic output audit.
2. Separate accepted counterbored print variant: choose orientation producing a downward internal shoulder, actual support Off/Touching Buildplate/Everywhere comparisons, inspect true internal/external layers and preserve CAD. Test simple skirt/brim/raft first-layer variants and full bead-envelope bed fit. Existing source-derived layer-height50→40 comparison remains accepted and need not be redone.
3. Keep raster/narrow-feature/profile qualifications visible in evidence. Do not mark all Chapter11 digital scope complete until these actual browser/cold/support/adhesion witnesses pass, and never infer physical printing or successful interlocking fit. SourcePDF549 prints ± tolerance suggestions, not a uniquely defined radial/diametral gap.
