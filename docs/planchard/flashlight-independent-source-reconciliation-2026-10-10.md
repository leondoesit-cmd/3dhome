# FLASHLIGHT independent source reconciliation

The protected actual independent-copy export matches the historical seven-chain source. Read-only comparison passes 5/5 checks; no model or library writes were performed.

`FLASHLIGHT-CH9-independent-source-browser-2026-10-10.mforge` contains exactly one assembly, `asm_mv2pb85e_6408`, named FLASHLIGHT-CH9. Bundle active-document metadata selects that key. Its four top components and all nested native definitions, transforms and exploded-view steps match `FLASHLIGHT-seven-chains-collapsed-browser-2026-10-01.mforge`.

The complete assembly diff has nine entries: old owner key `asm_mumj9qzq` and name FLASHLIGHT become the independent key/name; seven `explodedOffset:null` values become exact `{x:0,y:0,z:0}`. The assembly is collapsed, retains active view `ev_muo099wk`, and retains all seven source steps unchanged. Legacy `mates` arrays are empty, but native `topologyMates` contain respectively **9, 6, 3 and 3** records, all unchanged from the historical source. App mate-count semantics sum both collections.

The parent's observed nine top-level mates therefore agrees with the exported canonical native topology. The two observed unresolved mates and unchecked mobility remain current diagnostic qualifications; this read-only identity comparison does not solve them. An earlier audit message overlooked `topologyMates` and incorrectly inferred a UI/export mismatch; this report and checker correct that interpretation. This evidence does not inspect the original Saved-library record; it certifies the actual independent export against the historical protected source.

No bundle import is needed to recover seven chains. In `js/modeler.js`, the ordinary Exploded view command calls `createDefaultExplodedView`, finds the retained active/saved view, applies it at 1, refreshes the presentation without solving mates, and opens playback. The saved source steps address CAPANDLENS 1396, SWITCH 1395, LENS 1396/1387/1379, O-RING 1396/1386, HOUSING 1394, BATTERYPLATE 1397/1373 and BULB 1396/1387/1381. Their translations remain the original protected values.

Source drawing tutorial PDF460–463 / printed9-26–9-29 remains the target: seven chains, parts-only BOM, shaded 1:4 isometric and eight occurrence-bound balloons. Existing source-contact qualifications remain separate. Actual drawing authorship and final cold acceptance are pending.

Evidence: `FLASHLIGHT-CH9-independent-source-audit-2026-10-10.json`; reproducible read-only helper `scratch/planchard/flashlight-independent-source-readonly.mjs`. The earlier route plan remains useful for controls and part numbers, with this report clarifying the actual copy/export association.
