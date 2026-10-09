# Advanced1 actual finalgeometry/source/native/STEP audit

Actual parent-authored Chrome input: `ADVANCED-Q1-chamfer-rear-fillet-browser-2026-10-09.mforge`, plus its actual `.step`. Evidence JSON: `artifacts/planchard/ADVANCED-Q1-finalgeometry-native-source-step-audit-2026-10-09.json`. Read-only native regeneration and STEP reimport; no geometry authored/imported from the publisher source. All source-geometry checks pass.

Seven sketches are fully defined; rear has13 entities/30constraints with source fourR0.5 corner arcs and preserved original sharp-side constraints. Front retains the exact eight arcs: fourR0.5/150° convex and fourR1.5/60° concave. All seven pre-finish feature definitions and all sketches are bit-identical from the14-step checkpoint to the16-step checkpoint; only chamfer and fillet operations were added.

Boss intervals areZ0..0.4,0.4..2.1,2.1..2.6in, shaftR0.55. Native cylindrical faces prove eightØ0.35 holes: rear cardinal(±1,0),(0,±1) throughZ0..0.4; front corner(±1,±1) throughZ2.1..2.6. BoreØ0.75 remains coaxial; recess startsZ2.6 and endsZ2.5. The final native cone is exactlyR0.65 atZ2.5→R0.75 atZ2.6,45°. Four rear perimeter tori have majorR0.4/minorR0.1 centered on the cardinal lobe centers atZ0.3. Rear shaft-root torus has majorR0.65/minorR0.1 atZ0.5. No front-root torus exists; the analytic shaft cylinder terminates exactlyZ2.1, confirming the sharp join. Kernel bounds include its normal1e−7cm padding and are not used as exact edge stations.

Native one valid solid, no regeneration issues, maximum tolerance1.00000002e−7cm. Volume98.44708930485145cm³=6.007609984610509in³. Physical COM≈(0,0,38.26024833328833)mm, orZ1.506308989499541in, consistent with source cachedZ38.260mm and printed1.51in. X/Y bounds±38.1mm andZ0..66.04mm, allowing kernel bound padding. Nominal companion1060 density2.7 gives265.8071411230989g, consistent with source cache265.807g; this is a comparison output, not a parameter fit.

Actual Chrome STEP reimports as one valid solid. Native-minus-STEP and STEP-minus-native each contain zero solid volume, establishing exact bidirectional equivalence. Input bytes remain unchanged.

## Later actual material/provenance export

`ADVANCED-Q1-source-material-browser-2026-10-09.mforge` preserves features, sketches and history bit-identically, so native geometry evidence above applies without another regeneration. Actual1060 material uses printed0.097lb/in³, exactly2.684950756889703g/cm³. Calculated mass0.5827381685072195lb rounds to the visible0.5827382; nominal companion2.7 comparison remains separate. Strength properties remain zero/unspecified, and source explicitly says condition/qualification unspecified/unrated. Description discloses separately authored eight-hole cuts as an equivalent alternate feature workflow, opaque original edge IDs, and absence of source CAD import.

Minor provenance formatting: superscript unit characters in DensitySource became replacement characters; the ASCII Description preserves correct density units and page/source attribution. This does not affect the numeric material or geometry.

## Restored and cold acceptance

Later actual exports `ADVANCED-Q1-source-restored-browser-2026-10-09.mforge` and `ADVANCED-Q1-cold-accepted-browser-2026-10-09.mforge` independently compare equal for feature definitions, sketches,16-step history, frames/references, parameters, engineering materials, Description, appearances, units/context and exact topology cache. Only derived body meshData and rebuild timing/signature bookkeeping differ. Cold mainModel still has all seven fully defined sketches; native geometry definitions are bit-identical to the previously accepted native/STEP input, so no redundant native rebuild is required.

Description is present in `mainModel.customProperties.Description`; density/qualification are present in engineeringMaterials and body parts. Units appear in both model context and bundle metadata. No field absence is inferred from looking in an unrelated library wrapper.

Parent actual Chrome evidence completed holeD0.35→0.351 driving edit, Undo→0.35, Redo→0.351, Undo→0.35. Edited nativeV6.007335in³/mass0.5827115lb returned toV6.007610/mass0.5827382 and COM(0,0,1.506309)in. Protected edited/restored screenshots record the browser proof. Actual cold app reload, opening the exact saved Q1 entry, showed16steps/sevenfullydefined/native1, cleanCtrlS Save, V98.44709cm³/mass0.2643256kg/COMZ3.826025cm and density2.68495; the source Description was read visibly. Cold screenshot is `ADVANCED-Q1-cold-source-properties-browser-2026-10-09.jpg`.

Final Q1 scope is accepted: source geometry, native1, exact STEP equivalence, printed-density/unrated material, disclosed source provenance, driving Undo/Redo restoration and clean saved cold durability. Parent owns the actual browser proof; this read-only audit independently verifies saved exports. The source-equivalent separate hole-cut workflow remains disclosed and original proprietary edge selectors remain opaque. Whole-book completion is not claimed.
