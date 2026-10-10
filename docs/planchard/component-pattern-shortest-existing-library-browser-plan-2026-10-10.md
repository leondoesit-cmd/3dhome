# Existing-library Component Pattern browser witness

Read-only plan, not browser acceptance. Source: supplied PDF121 / printed2-35, Design Intent in an Assembly, Example A: mate one machine screw into the first hole, use Component Pattern to copy it to the other existing Linear Pattern holes. No source screw dimensions or exact example carrier dimensions are specified there.

## Current source reconciliation — corrected after actual carrier inspection

The older September protected carrier is active `cfg_default`/3HOLES. It does **not** describe the latest shared library state: `LINKS-shared-config-material-library-browser-2026-10-09.mforge` captures the same key `cm_munm4oro` active5HOLES/countX5. The parent's current actual native picker showing five centers at X−25.4/−12.7/0/+12.7/+25.4mm is consistent with that latest record, rather than a broken pattern.

Both source documents use Front (`plane:front`) X·Y sketches. Their actual native bore descriptors have axis−Z and extend Z0..1.524mm; the historical feature `params.axis:"y"` is overridden by the driving sketch's plane during native lowering. The earlier plan's +Y extrusion claim was wrong. Native geometry and actual picker, rather than that obsolete field, determine mating axes.

Configuration3HOLES restores **both** the source sketches and feature parameters: stock cap centers X±12.7mm, source circle1827 at X−12.7mm, Pattern1 countX3/pitch12.7mm. Native hole centers are −12.7/0/+12.7mm, stock total length38.1mm, width12.7mm and thickness1.524mm. Configuration5HOLES has stock cap centers X±25.4mm and source hole−25.4mm; changing only count5→3 there would leave hole centers−25.4/−12.7/0mm and retain the longer stock. That is not the intended named3HOLES.

Ordinary selection route: carrier selected → right inspector **Component** tab → accessible **Component configuration** select → **3HOLES** (`cfg_default`). This control is implemented in `assemblyFlagsInspector`; it is not in **Placement**. Await native configuration completion, inspect current reference IDs, and repair a mate through ordinary native picks only if its captured ID no longer identifies the intended hole. This edits the isolated assembly occurrence, not the shared Saved part record.

## Shortest source-faithful route: two existing Saved parts

Create a separate **New Assembly** through the ordinary UI. Insert these actual existing library definitions; do not modify their original Saved records:

|Role|Exact saved name/key|Protected source inspected|
|---|---|---|
|Carrier|Planchard 9.4 FLATBAR - 3 5 7 HOLES - fresh from zero 2026-09-30; `cm_munm4oro`|`FLATBAR-named-configurations-Front-final-browser-2026-09-30.mforge`|
|Seed machine screw|Planchard 8.15 - WA10 M4x20 fixture screw - fresh proxy 2026-10-03; `cm_museyg2y`|`WA10-fixture-screw-M4x20-browser-2026-10-03.mforge`|

The carrier must be explicitly set to named3HOLES before the witness. Source feature `feature_munmkxj5_3` is `pattern`, `scope:feature`, `mode:linear`, X direction enabled, countX3, spacingX1.27cm, seed cut `feature_munmk4sc_2`. Bore diameter4.826mm, seed centerX−12.7mm, native bore axisZ. The saved screw is a previously qualified Toolbox/native proxy with local+Y axis and M4 nominal shaft; its reuse retains that proxy qualification. This is an illustrative source workflow witness, not an undocumented publisher screw reconstruction.

1. Ground the carrier at identity. Insert the screw; choose its shaft cylinder and the first current native bore cylinder at X−12.7mm, then Concentric. Native solver rotates the screw's localY into the carrier's Z axis. Choose screw head underside and the carrier face at Z1.524mm, then Coincident so the shaft enters the plate. A remaining screw spin DOF may be constrained with an ordinary orientation/Lock mate if needed; first preserve genuine bore/head seating. If the parent already seated at X−12.7mm while5HOLES was active, switch the carrier occurrence to3HOLES using **Component configuration** and verify/rebind current references. Do not merely change current5HOLES count to3.
2. Run **Component Pattern**. Choose that screw occurrence as seed; choose carrier / Pattern1 as source. Name it `Source design-intent screw pattern - illustrative`. Expected new derived occurrences2, screws including seed3, total root occurrences4. Inspect visible screw/hole alignment and native source provenance; show BOM screw quantity3.
3. Protect baseline bundle/native STEP/BOM/drawing screenshot. Edit the carrier in context, edit its existing source Pattern1 count3→2, Finish component. Expected screws2/generated1/BOM2. Restore3. Edit spacing12.7→10mm, Finish component; the two copies move to X−2.7 and+7.3mm relative to the identity carrier while seed staysX−12.7mm. Restore12.7. These temporary values fit the current stock and are expressly illustrative driver probes, not source dimensions.
4. Actual Undo/Redo/restoration; remove Component Pattern then Undo. Original two components and seed mates stay intact. Restore baseline3/12.7. Save the new assembly under a distinct name, verify clean, hard reload, reopen its exact Saved record, wait for native completion, export bundle/STEP/BOM. Compare pattern recipe IDs, generated grid IDs, configured part definitions, solved poses, count/BOM and native placements. Source CAD definitions must remain unchanged beyond the documented driver/restoration history and derived rebuild fields.

The shorter implementation-only demonstration could reuse accepted WEIGHT-LINK8.2 `asm_mukitj6a`: AXLE451 is already mated into FLATBAR452's first hole, and carrier `feature_mukhptgp_3` has9holes at12.7mm pitch. However its seed is an axle, rather than the machine screw explicitly pictured/described in Design Intent. Creating a temporary pattern there would also extend an accepted homework assembly. Prefer the two-part separate screw witness above; it is smaller and source-faithful without new modeled geometry.

## Independent acceptance conditions

Confirm the stored assembly `componentPatterns` recipe references actual seed/carrier/source feature IDs. Generated real occurrences must share the current seed modelKey/configuration/definition, retain deterministic IDs and source provenance, and change count/spacing through native carrier edits. Whole assembly cold must preserve the recipe, source geometry, seed mates and placements; export/BOM quantity must match3 after restoration. No independent mates on generated copies, subassembly seeds, circular patterns or exact publisher geometry claims are required or supported by this finite witness.

Owned read-only support: this report and targeted inventory helper `scratch/planchard/component-pattern-short-route.py`. No CAD/browser authorship, ADVANCE, original Saved library mutation or Git action.
