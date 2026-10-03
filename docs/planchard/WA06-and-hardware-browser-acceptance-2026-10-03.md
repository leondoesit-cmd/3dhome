# Welder arm fixture and hardware browser acceptance

Authored through visible desktop Chrome controls on 3 October 2026. Exercise 8.15, physical PDF 428 / printed 8-50, supplies no dimensions. These are original designer proxies from the coordinated welder-arm plan, not recovered manufacturer parts. All geometry started blank during this task; the subsequent WA06/WA10 edits revise those same fresh parts.

| Part | Saved key | Final native volume cm³ | Native mass g | Overall mm | History |
|---|---|---:|---:|---|---|
|WA06 Fixture|cm_musekt6u|14.94613|115.0852|50 × 8 × 50|4 steps, 1 body|
|WA10 M4×20 fixture screw|cm_museyg2y|0.3896770|3.058964|7 × 24 × 7|1 Toolbox step, 1 body|
|WA11 M6×40 jaw pivot screw|cm_musfcldk|1.537260|12.06749|10 × 46 × 10|1 Toolbox step, 1 body|
|WA12 M5×40 support screw|cm_musfqw1k|1.034482|8.120686|8.5 × 45 × 8.5|1 Toolbox step, 1 body|

## Fixture

Fully defined Top origin circle Ø50, sketch offset Y86, Extrude8 along normal. Hole Wizard Ø4.5, Through all, circular count3, radius9, first angle30: local X/Z (±7.794228634,4.5), (0,−9). A second Ø5.5 Through-all Hole Wizard, circular count2/radius15/angle0, provides X±15/Z0 clearance for the support screws. Both use the fully defined origin sketch as their layout frame. The previous PCD30 checkpoint is retained separately.

Assigned material is Ferritic stainless steel, grade unspecified, density7.70g/cm³. `BookMaterial=Cast Stainless Steel` and the explicit geometric-mass proxy property remain. PartNo6. Native centre of mass is (0,90,0)mm. Hard reload, library reopen, and native Mass Properties reproduce the final values and five visible bores.

Protected final exports: `artifacts/planchard/WA06-fixture-revised-fit-browser-2026-10-03.mforge` and `.step`; mass and cold screenshots use the same revised-fit prefix.

## Hardware

Fresh native Toolbox ISO4762 socket-cap recipes, cosmetic smooth nominal threads, generic Steel/Black Oxide, density7.85g/cm³. No 8.8 or other strength-class certification is asserted. All three viewport projection records agree with the recipe material; socket cutter visibility remains unchanged. Explicit PartNo10/11/12 and explanatory descriptions are saved. Part-local axes are Y; assembly placement supplies WA11's X orientation.

WA10 was revised from12 to20mm to span holder8 + fixture8 + nominal midpiece engagement4. WA12 was revised in the design before creation from16 to40mm to span support30 + holder8. Native exact mass, saved bundle properties, and cold library reopening were checked. Reopening each Toolbox part retains one editable history step without creating an empty sketch.

Protected exports: `WA10-fixture-screw-M4x20-browser-2026-10-03`, `WA11-jaw-screw-browser-2026-10-03`, and `WA12-support-screw-browser-2026-10-03`, each `.mforge` and `.step` under `artifacts/planchard`. Associated native mass and cold screenshots are retained.

## UI repairs qualified during authoring

Document name/description now commit on blur and Enter, with one undo per changed value. Actual blank Chrome QA used Model name fill → Tab → tree → settings; the value and saved draft remained. Proof: `model-name-blur-browser-2026-10-03.jpg`.

Toolbox replay previously copied unqualified generated Steel8.8Zinc appearances over a changed Steel/BlackOxide recipe. Recipe defaults now regenerate while separately assigned stock/qualified materials survive. Stable projection IDs, nylon constituents and transparent cutter opacity are preserved. Actual WA11 material editing and all hardware cold mass results show Body1 Steel7.85.

Focused tests: 8 passed across document metadata commit, Toolbox configuration appearance and assigned material. Required gates passed: no free identifiers, 633 linked modules, 1490 source assertions. Source fixes were checkpointed by the parent in commit1daee93.

Observed remaining UI issue: selecting a downstream Hole Wizard tree row then pressing the generic derived-body “Edit feature in history” opened the base extrusion. Direct feature-tree double-click opened the intended Hole Wizard. No incorrect extrusion edit was committed; the unchanged form was cancelled. This report does not claim that navigation issue is fixed.

### History edit routing source repair

The Shape inspector now prioritizes an explicitly selected single history feature over the merged body's producing feature. It also offers editing for an upstream feature with no separate projected body. Nonadditive model/body picks and deselection clear history intent; additive feature collectors remain available. Eight focused regressions pass, including invoking the real inspector edit callback for the selected Hole Wizard. This repair has source/test acceptance; a new actual Chrome acceptance is pending coordination with the parent’s live assembly work.

Actual Chrome acceptance completed in own saved tab260 after loading current source and reopening WA06 from the library. Single-clicking upstream Hole wizard1 followed by Edit feature in history opened Hole wizard1 with diameter4.5mm, count3, radius9mm and first angle30°. Cancel restored the clean Save indicator and disabled Undo without changing or saving geometry. Selecting the ordinary solid-body row then replaced that history intent with the body-source Extrude/Boss1 inspector. Proofs: `WA06-history-hole-editor-browser-2026-10-03.jpg` and `WA06-history-body-selection-browser-2026-10-03.jpg`. Tab260 is saved and marked Deliverable; root assembly tabs were untouched.
