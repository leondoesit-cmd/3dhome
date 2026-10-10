# FLASHLIGHT final tutorial: ordinary browser route and confirmed gaps

Source PDF460–463 / printed9-26–29 covers exploded assembly drawing, parts-only BOM, numbered balloons and source part numbers. The protected source is `artifacts/planchard/FLASHLIGHT-seven-chains-collapsed-browser-2026-10-01.mforge`, assembly owner **FLASHLIGHT**, key `asm_mumj9qzq`. Its unrelated `mainModel` is an empty placeholder. The protected assembly is collapsed (`exploded:false`) with active saved exploded view `ev_muo099wk`, seven steps and eight real leaf occurrences. Current live/library state must be checked against this checkpoint rather than assumed identical.

## Confirmed ordinary UI gaps before independent final authoring

1. Assembly Saved-library cards provide Open/Delete, but no **Save copy and open**. That action exists only on Part cards (`modeler.js` refreshLib branches). **Branch** merely opens history, so it is not an independent assembly-copy route. Generic bounded repair should clone the complete assembly under a new key/name, retain internal component/part/mate/chain/metadata IDs, save with expected-null conflict protection and open with fresh scoped history. Do not use bundle import preserving the original key as a copy workaround.
2. Interactive assembly Drawing supplies the actual BOM table and exploded body poses, but no automatic balloon or explode-chain provider/control. `modeler_drawing.js` passes host.bom only and has no balloon/explodeLines path. The legacy no-authored-sheet export generates balloons and explode lines through `assemblyDrawingDocument`, but `drawingSvgContent` switches to `drawingSheet().svg()` once an owned Drawing exists. Therefore an ordinary native five-view/iso Drawing cannot presently prove the source's automatic8balloons/7chains by relying on that legacy exporter. A bounded shared-scene fix should use persistent leaf occurrence IDs and actual BOM item mapping for genuine balloon leaders, and saved chain line geometry in the same Canvas/SVG path. Interactive ownership, edits, Undo and cold persistence must be verified.

## Source identities and part-number choices

| Leaf / nested path | Source number |
|---|---|
| HOUSING1394 |44-A28|
| SWITCH1395 |99-B04|
| LENSCAP1396/1385 |44-A27|
| O-RING1396/1386 |99-B03|
| LENS1396/1387/1379 |99-B02|
| BULB1396/1387/1381 |99-B05|
| BATTERY1397/1372 |B99-B01|
| BATTERYPLATE1397/1373 |44-A26|

Source assembly number is10-F123. Protected leaf definitions lack these PartNo values. Native **Custom properties → PartNo** on each copied leaf definition establishes source-owned values; enter component context, edit only the property, Finish component and return through nested owners. Do not Save source parts over their original library records merely to annotate this independent assembly. Confirm actual exported leaf `def.customProperties.PartNo`. Inspector **Component part number** instead edits the occurrence override (`setDocumentProperty(component,'PartNo',...)`); this is a valid explicit alternative for all8rows but must be labelled occurrence overrides rather than source-owned part fields. Existing Description values are useful BOM labels and should stay exact.

## Shortest post-fix ordinary route

Open Model library→Assembly→FLASHLIGHT→new Save copy and open, choose an independent tutorial name. Activate **Exploded view**; the current handler reuses saved `ev_muo099wk` at full progress rather than replacing the seven steps. Cancel/stop the animation form if opened; keep its final exploded pose. Do not rebuild mates or change authored placements. Source protected top-level `mates` is0; preserve nested/topology mates and actual placements, not an invented top mate count.

Enter Drawing; ensure owner is the copied assembly, not placeholder part. Set **BOM scope → Parts only** (`mdSheetBOMScope`). Retain one native isometric for the shortest source sheet, set **View scale →1:4**, **Display style →Shaded with edges**. Delete extra principal views through ordinary controls if a four-view default is created. Put the native iso on the right, BOM on the upper left; use genuine repaired automatic BOM balloons for all8rows including O-RING and native seven explode chains. Verify source/native occurrence identities, not merely labels placed as paper notes.

Set assembly Description `FLASHLIGHT ASSEMBLY`, custom PartNo10-F123, companyD&M ENGINEERING, chosen author/date/revision. Title source **Model Description** is live to assembly owner metadata; drawing-number source offers manual/name only, so source assembly10-F123 can be manual native number while preserving actual PartNo property. This is an explicit limitation, not a PartNo-linked number claim. Font/source0.19-inch text height may remain disclosed presentation difference. Third-angle symbol is automatic.

Save/export project/SVG/PNG; inspect8parts-only BOM identities/quantities/source numbers, all8 genuine leaders, seven chain geometry, shaded native surfaces and readable frame/title. Real property driver and ordinary Undo should change the proper BOM/title field only. Clean Save→cache bypass→exact copied library reopen→export again must preserve whole assembly authoring, Drawing and SVG. Positive physical contacts previously reported remain separately qualified; a drawing witness does not establish zero assembly interference.

This is a read-only route and gap audit, not actual new browser authorship or completion. Parent owns copy, metadata choices, generic fixes, browser acceptance and commits.
