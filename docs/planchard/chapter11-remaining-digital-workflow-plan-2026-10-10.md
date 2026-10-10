# Chapter11 remaining digital workflow — reconciled implementation and browser plan

Read-only source/code/evidence audit,2026-10-10. No CAD/browser authoring, ADVANCE/shared-code changes or commits. Source chapter isPDF521–558 /11-1–38, not a new dimensioned part exercise. Fresh text extraction: `scratch/planchard/ch11-digital-source.txt`; source541–547,549,551,553 rendered at2× and actually inspected as `ch11-digital-{page}.png`. This plan supersedes stale pending rows in the October9 preflight only where accepted evidence exists.

## Already accepted; do not repeat

|Source|Accepted digital evidence|
|---|---|
|538–540 /11-18–20|Actual custom0.01mm/5° native tessellation and STL/AMF/3MF export, closed consistently oriented meshes, format/unit qualifications and cold settings; `ch11-print-resolution-browser-2026-09-30.md`.|
|545–546 /11-25–26|FLAT-PLATE Right/Top orientation variants, same native geometry, six congruent format exports, preferred Top cold witness; `ch11-flat-orientation-export-validation-2026-10-09.md`.|
|545 /11-25|Separate two-cylinder tray, preserved occurrence spacing and distinct objects, fit rejection, formats and exact cold active assembly; `ch11-tray-native-export-validation-2026-10-09.md`.|
|541 layer concept;553 one-variable method|Actual tray Layer analysis0.2mm→50 layers and0.25mm→40 layers, selected last40, all90 geometric sections independently audited, source assembly exact; `ch11-tray-layer-browser-audit-2026-10-10.md` PASS13/13. This is geometry analysis, not nozzle paths.|

The current ADVANCE header and coverage reconciliation agree that support/infill/toolpath acceptance is still pending. Code matches this qualification: `print_layer_analysis.js` returns mid-slab contours with holes and occurrence IDs; its UI/JSON expressly excludes perimeters, infill, supports, toolpaths and G-code. `print_setup.js` does principal orientation/bed centering/fit. `assembly_print.js` preserves placed leaves and exports separate meshes. `modeler.js:openPrintLayerAnalysis` reuses actual native0.01mm/5° mesh and guards against stale sources; the render/exported derived-analysis source can be reused. No existing slicer, infill or printer-toolpath engine was found in repository core or package dependencies.

## Precisely missing source workflow

|Source|Finite remaining digital outcome|
|---|---|
|541 /11-21|Take an actual accepted geometry-bearing export/native print snapshot into a real slicer engine; generate ordered layer/nozzle paths and an exportable G-code file under a named explicit profile. Merely displaying model contours or a parameter manifest does not satisfy this outcome.|
|542 /11-22|Actual wall/perimeter line count and thickness, top/bottom shell layers, actual interior infill with a selectable density and pattern. Show two physically different path results. Listing every named pattern is theory; implementing every listed pattern is not required.|
|543 /11-23|Actual wall/infill/top-bottom/travel speed controls and support generation. Compare support Off versus generated support, with Buildplate-only versus Everywhere distinction.|
|544 /11-24|Actual geometric Skirt, Brim and Raft paths or geometry in a first-layer preview, with distinct relationships to the footprint. Skirt source offset3–4mm, detached; Brim attaches at footprint boundary but does not lie below model; Raft underlies the model.|
|546–547 /11-26–27|Geometry-bearing support comparison on existing thin holed/slotted print variant and a genuine accepted counterbored part. Distinguish internal shoulder support from external overhang support; identify removal access. Preserve source CAD. Source photos are not a new dimensioned geometry recipe.|
|549 /11-29|Nominal fit interpretation and actual model clearance inspection; retain physical fit testing as pending. Source prints **±0.1mm / ±0.2mm / ±0.3mm tolerance** guidance for tight/print-in-place/loose categories, not a defined radial or diametral gap prescription. Do not silently relabel these as geometric clearances.|
|551,553 /11-31,33|Optionally add a print-only pad example (source illustrative10mm diameter,1–2 layers) if demonstration is needed; existing native cylinder/extrude tools already support it. One genuine infill/support parameter comparison and notes. The layer-height comparison is already accepted.|

Optional automatic direction optimization in546 is a vendor capability example, not a mandatory demand to implement global orientation optimization. A measured comparison of the existing principal orientations covers the book intent without inventing a printer-specific optimizer. SLA/SLS technology/material instruction, vendor add-ins, CSWA-AM learning/exam and physical printing are separate from this bounded FFF digital leg.

## Recommended finite implementation

Expose a separate **FFF slice preview** output operation. Keep the accepted geometric Layer analysis intact. Inputs are the same actual mm/Z-up native print meshes and saved bed setup; source stamps, occurrence IDs, cancellation/work budget and worker execution reuse existing architecture. Derived slice paths never become CAD features, meshes or mates.

Before implementing paths, choose a robust polygon offset/boolean engine suitable for concave contours, holes and multiple islands. No such general-purpose dependency was found in the current vendor search. A hand-written convex-only inward offset is inadequate for the accepted holed/slotted book parts. Either vendor a finite audited engine or integrate a real locally packaged slicer via an explicit bounded interface; downloading or launching one is not part of this read-only task. If using a real external engine, preserve its exact version/profile/settings and browser-facing workflow; command-line-only production without actual browser interaction does not meet the user's requirement.

Proposed stored study settings (under a print-study document/metadata, separate from the canonical model): layerHeightMm, nozzleDiameterMm, filamentDiameterMm, lineWidthMm, wallLineCount or derived wallThicknessMm, top/bottom layer count, infillPercent, pattern, wall/infill/skin/travel speeds, support mode/angle/XY gap/Z gap/density, adhesion type/skirt offset/brim width/raft layer settings, and a named machine-code flavor/profile if G-code is enabled. Numeric settings must actually affect generated geometry or paths; reject unsupported selections instead of persisting no-op controls. Begin with0.4mm nozzle/1.75mm filament and0.2mm layer height as explicitly book-era illustrative inputs, not verified current printer presets. Book screenshots show differing manufacturer defaults; do not imply one universal recommendation.

### Layer path algorithm contract

1. Reuse closed oriented outer/hole loops from `analyzePrintLayers`. Generate deposition Z at each slab's **top**, distinct from its mid-slab geometric section Z. Preserve final partial-layer height. Offset outer loops inward and hole loops outward by half line width plus wall-line steps, with robust boolean cleanup. Collapse narrow regions explicitly as thin/unresolved diagnostics; do not send crossing/reversed perimeter loops.
2. Derive infill interior after wall offsets. Clip alternating0°/90° rectilinear lines to it, including holes and all islands. Density changes line spacing;0% creates no interior infill,100% uses dense skin-spacing behavior. Selected top/bottom layers need real filled skin regions, and exposed changing roofs/floors need interlayer boolean comparison; counting only the globally first/last layers would leave internal counterbore shoulders/steps without skin.
3. Emit feature-tagged wall/skin/infill/travel segments with start/endXYZ, physical layer/object IDs, line width, extrusion and feedrate. Preserve disconnected objects. A travel across a cavity is allowed; an extrusion across that cavity is not. Order loops/lines deterministically with explicit nonextruding travel links and optional retraction; do not silently turn all connectors into extrusion.
4. Compute material estimate from deposited path lengths and a declared approximate bead-area convention, separately from exact native volume. Convert deposited volume to filament length using filament cross-sectional area. Estimate time from segment length/feedrate with explicit acceleration approximation qualification; report it as a digital estimate, not a measured print duration.

### Real support geometry, not red face coloring alone

Use consecutive layer regions and the selected overhang angle to identify material added beyond support from below; compare upper region to the lower region dilated by the allowed horizontal advance. Trace unsupported masks downward through free space, respecting XY separation and Z contact gap. **Everywhere** may terminate supports on a lower model surface; **Buildplate-only** keeps only support structures with a free-space route toZ0. Preserve islands and cavities. Produce actual clipped support paths/volume and show them separately from model wall/infill paths.

Use the genuine counterbore shoulder as an independent test: changing orientation changes where the step introduces unsupported material, and internal supports must remain in actual voids with adequate access qualifications. A downward-facing surface area/color map is useful orientation evidence but is not support generation. Flat-plane cylinders and the existing two-cylinder tray alone cannot demonstrate this missing requirement.

### Adhesion and export

Skirt is an offset footprint loop at source-illustrative3–4mm; Brim adds attached outside loops at zero initial footprint offset; Raft adds under-footprint lattice/skin layers and raises the subsequent model deposition origin by its thickness/contact gap. Recheck the complete footprint and height against saved bed limits, including adhesion; checking only the original model bounds can miss overflow.

Export derived JSON/SVG with source fingerprint, mesh resolution, profile and all path tags. G-code export must use a supported explicit flavor and validated profile: units, absolute/relative XYZ and E modes, feedrate conversion mm/s→mm/min, layer ordering, nonextruding travel versus positive extrusion, retraction, origin convention and temperatures if present. Do not silently reuse unspecified default start/end scripts or infer actual machine availability. A file exported under an illustrative profile can demonstrate digital generation; it is not evidence of device compatibility or a physical print. No automatic printer connection is needed by the book-equivalent app leg.

## Actual browser acceptance sequence

1. Parent opens exact accepted FLAT print variant and preserves its native/spec/material/feature/STEP evidence. Actual UI chooses the saved Top placement, illustrative bed, named bounded slicer profile and wall/infill/skin settings. Generate and inspect a first, middle and final layer with colored real paths; exportJSON/SVG/G-code. Confirm infill never extrudes across holes/slots.
2. Change **only infill15%→20%** (both values appear in the book) and regenerate. Show real spacing/material/path differences with all other settings/source geometry equal. Save study settings and comparison notes. Existing0.2→0.25 layer comparison is already completed and need not be repeated.
3. Open a separate variant of an already accepted counterbored native part. Compare a principal orientation exposing the internal shoulder to one reducing that overhang; use the actual part features to identify the shoulder. Show support Off/Buildplate-only/Everywhere paths, counts/volume and representative interior/exterior layers. Do not copy dimensions from the undimensioned photograph. Choose source-supported removal/access explanation with no physical success assertion.
4. Show actual Skirt/Brim/Raft alternatives on the same geometry/bed, first-layer paths and resulting bed/height fit. Source pads can be a separate optional browser print variant if needed; never alter the accepted CAD mechanism.
5. Hard reload, open the exact saved source/study, visibly read back settings, regenerate actual paths, re-export and compare deterministic path data/source/geometry. Independently audit source CAD unchanged, bed placement, complete path retention and generated extrusion totals. Screen evidence must show the selected layer and settings; a hidden-script-only slice is insufficient.
6. Digital fit worksheet: record the three printed **± tolerance categories**, explain process dependence, and inspect an existing accepted interlocking pair's actual clearance or a separately declared illustrative nominal test pair. Explicitly say whether any designed gap is radial/diametral/per-side; no printed press-fit success is inferred.

## Meaningful tests before browser acceptance

- Concave holed layer, nested islands and two disconnected tray objects: perimeter offsets do not self-cross, infill/deposition paths remain inside material; every hole has no deposited interior crossing.
-0/15/20/100% infill, positive wall count and narrow-feature collapse: results differ geometrically;0% still has walls and chosen skin.
- Variable-height stepped/counterbored solid: top/bottom skin includes locally exposed roofs/floors, support has actual source geometry and correct bed-versus-model termination.
- Three orientations preserve source geometry, alter unsupported/support metrics appropriately, and do not confuse triangle-normal areas with support volume.
- Skirt detached, Brim attached/outside, Raft below/raising model: adhesion geometry satisfies its definition and overflow validation includes all generated material.
- Parser-replay G-code: positions/E/feedrates reproduce exported path graph, no extrusion through voids, finite monotonic depositionZ, correct units/flavor; independently summed extrusion/material estimate agrees.
- Cold deterministic output, stale native/configuration/assembly-pose cancellation, budget refusal, invalid/nonmanifold mesh and unsupported profile fields fail without CAD mutation.

Physical printing, actual plate leveling/adhesion/removal/cleaning, thermal/filament calibration, actual fit/strength and direct printer monitoring remain device-dependent. Chapter11 digital closure must keep those states separate. Completing this plan does not establish physical-print evidence or a measured whole-book percentage.
