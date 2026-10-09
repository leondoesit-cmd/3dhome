# LINKS current library reference audit — 2026-10-09

The entire actual `LINKS-current-library-diagnostic-browser-2026-10-09.mforge` assembly is bit-identical to the protected `LINKS-named-configurations-compact-final-browser-2026-09-30.mforge` assembly: all four components, occurrence definitions, transforms, selected configuration IDs, eight topology mates, drawing settings and custom properties. The current failure is not a new loss of library data.

Independent native regeneration accepts all four occurrence definitions as one valid solid each. Flatbar7/5/3-hole variants retain their intended physical lengths, hole spacing and1524µm thickness; volumes are1.4727507600651515/1.03689328277107/0.6010358054770926cm³. Collar volume is0.5035532250401158cm³. Modern compilation resolves these Front sketches to physical extrusionZ, despite stale historical params.axisY; the resulting native shape agrees with the captured mate physical axes.

Disposable cold solve fails specifically on three concentric mates1642/1645/1648: five flatbar selectors refer to obsolete producers `feature_mukhpbcy_2` and `feature_mukhptgp_3`, whereas the actual flatbar definitions/cache use `feature_munmk4sc_2` and `feature_munmkxj5_3`. The collar selector `feature_mukfprqu_1:edge:profile:299:end` still resolves. Five remaining native datum distance/angle mates have no residual failures. The unresolved-reference result reports7DOF; this is not accepted LINKS mobility.

## Concrete visible repair targets

Use Replace references on each existing concentric mate, preserving its ID and the component order. Pick each **physical hole axis**, using the native cylindrical bore face or a native circular mouth; do not choose the large rounded outer cap. All flatbar bores areØ4.826mm with component-local axisZ.

|Mate|First occurrence / local hole center|Second occurrence / local center|
|---|---|---|
|1642|7 HOLES component1638, right-endX+38.1mm/Y0|5 HOLES component1639, left-endX−25.4mm/Y0|
|1645|5 HOLES component1639, right-endX+25.4mm/Y0|3 HOLES component1640, left-endX−12.7mm/Y0|
|1648|7 HOLES component1638, left-endX−38.1mm/Y0|Collar component1641, centerX0/Y0; existing outerØ11.1252mm circular reference remains valid|

At saved poses, these axes already coincide pairwise: first joinworldX38.1/Y0mm, secondX38.1/Y50.8, collarX−38.1/Y0. Axialmouth Z need not match for concentric because the retained distance mates establish layer separation. The source bar transforms, dimensional sketches, named configurations, descriptions and drawing data need no replacement.

Modern generated references for right-end holes include `feature_munmkxj5_3:copy:6:edge:generated:circle:2` (7 HOLES) and `...:copy:4:edge:generated:circle:2` (5 HOLES). However a prefix substitution alone is insufficient: seed holes now have `...:tool:edge:profile:1826:start/end`, with the tool's end extending slightly past the actual mouth. Regeneration topology also contains intermediate duplicate IDs at some pattern stations. Selecting verified final native geometry in the UI is preferable to interpreting those intermediate lists as unique final selectors. No automatic captured-frame fallback should conceal missing references.

Evidence: `artifacts/planchard/LINKS-native-reference-audit-2026-10-09.json`; reproduce with `scratch/planchard/links-native-reference-audit-readonly.mjs`. No actual definition, fixture, library model or browser state was edited. Native geometry and provenance comparisons pass; reference repair, resulting mobility and actual cold persistence remain parent-owned browser work.

## Actual reference/material/BOM repair checkpoint

`LINKS-reference-material-bom-repaired-browser-2026-10-09.mforge` preserves every occurrence's authored features, sketches, history and reference geometry. Poses remain identical within4.45e−16 rotation-matrix tolerance. All eight original mate IDs remain; disposable cold solve accepts all eight with oneDOF, confined to collar spin. Five geometric rebindings resolve obsolete flatbar selectors to current producer topology; **stored persistent selectors themselves remain unchanged**. This is refreshed native-cache resolution, not a claim that the exporter rewrote reference IDs.

Two concrete checks fail at this intermediate checkpoint. First7HOLES correctly stores Aluminum2014/density2.8 in current body appearance and named configuration snapshots; second5HOLES still stores Aluminum1060/density2.698790709244804 in both current body and selected snapshot after update from the older library record. Third3HOLES/collar correctly remain1060. Occurrence PartNo/Description fields correctly distinguish all three bar variants and collar, but current `assemblyDrawingBOM` merges their shared definition key into one quantity3 row, producing two rows rather than four. Parent is correcting the saved library material; UI agent owns the explicit configuration-aware BOM identity gap. Neither failed check should be hidden by correct visible occurrence labels.

Evidence: `LINKS-reference-material-bom-repaired-browser-2026-10-09-audit.json`; reproduce with `scratch/planchard/links-repaired-properties-audit-readonly.mjs`. Geometry and eight-mate native recovery pass; final material/BOM/cold acceptance remains pending.

## Direct shared library Save checkpoint

`LINKS-shared-config-material-library-browser-2026-10-09.mforge` passes all six read-only checks. Canonicalkeycm_munm4oro is active5HOLES; current body and5/7 configuration appearance snapshots store Aluminum2014/density2.8, while3 stores Aluminum1060/density2.698790709244804. Each configuration's snapshot sketches and featureParameters exactly match its independently regenerated actual7/5/3 occurrence geometry. The3 snapshot now uses the correct Front sketch plane, matching its accepted occurrence definition. Native verification can therefore be reused without inventing a model.

The5/7 snapshot Description text still says historical Aluminum1060; numeric density and catalog assignments are correct. Parent was informed of this remaining metadata qualification. Assembly occurrenceDescriptions separately override these with the proper concise BOMlabels. Assembly refresh, four-row BOM and cold persistence remain pending. Evidence: `LINKS-shared-config-material-library-audit-2026-10-09.json`, reproduced with `links-shared-library-material-audit-readonly.py`.

## Final configuration/material/BOM checkpoint

`LINKS-final-config-material-bom-browser-2026-10-09.mforge` now passes all ten geometry/property/solver/BOM checks. All occurrence feature/sketch/history/reference definitions remain unchanged; translation is exact and maximum rotation-matrix drift4.45e−16. Selected7/5 snapshots and current bodies both use Aluminum2014/2.8;3 and collar use Aluminum1060/2.698790709244804. All original mate IDs persist. Disposable cold solve accepts all eight, no issues or unsatisfied mates, with collar spin as the soleDOF. Five old selector IDs still resolve by geometric rebinding to the refreshed native cache; this is not persistent selector rewriting. One valid native solid per occurrence is independently verified by the earlier identical authored definitions.

The fixed BOM reports four quantity1 rows with occurrence PN/Descriptions7HOLES,5HOLES,3HOLES,SHAFT-COLLAR and materials2014/2014/1060/1060. The actual exported `LINKS-final-config-material-bom-browser-2026-10-09.svg` prints the same four rows and matching leaf balloons1–4, each in its own circle within the ANSI A landscape sheet. Occurrence descriptions override the preserved historical configuration Description text; the rendered BOM materials are correct. No false claim of updating that old snapshot text is made. Evidence: `LINKS-final-config-material-bom-browser-2026-10-09-audit.json` and `LINKS-final-svg-bom-balloon-audit-2026-10-09.json`; scripts `links-repaired-properties-audit-readonly.mjs` and `links-final-svg-audit-readonly.py`.

Parent reports actual native interference check clear and four-row/four-balloon preview. Whole-sheet browser proof and the second actual cold reopen/export remain pending at this checkpoint.

## Final scoped acceptance after second cold

`LINKS-cold-final-config-material-bom-browser-2026-10-09.mforge` preserves the **entire assembly exactly** against the final export: every component definition/cache, configuration ID, material/property field, pose, native mate object and drawing setting is identical. Independent cold solve again accepts all eight with no issues/unsatisfied mates and one collar-spinDOF; four correct quantity1BOM rows persist. The original obsolete persistent IDs remain unchanged and resolve by the same five geometric rebindings. This qualification is retained, rather than claiming opaque selector recovery or automatic ID rewriting.

Parent reports actual second cold selection of the exact canonical saved LINKS, clean Save,4occurrences/8mates/zero unresolved; actual drawing form ANSI A/in/1:1/third angle and LINK/56-7789/A/ModelForge/D&M ENGINEERING/September30; cold four-row/four-balloon Preview; actual interference check clear. Protected screenshots `LINKS-cold-config-bom-preview-browser-2026-10-09.jpg`, `LINKS-cold-final-clearance-browser-2026-10-09.jpg` and `LINKS-final-config-material-bom-full-sheet-browser-2026-10-09.jpg` establish the parent-owned Chrome proof, including full SVG sheet with all borders/title/BOM/balloons and no overlap.

Scoped LINKS acceptance is closed: existing authored geometry and named configurations preserved, source materials/BOM distinctions repaired, native mates accepted, clearance and whole-sheet UI proof reported, exact second-cold durability independently verified. Historical5/7 snapshot Description text remains superseded by actual occurrence BOM labels and correct material fields. Earlier pending checkpoints are superseded by this acceptance; this does not certify completion of the whole book. Evidence: `LINKS-cold-durability-audit-2026-10-09.json` and `LINKS-cold-final-config-material-bom-browser-2026-10-09-audit.json`.
