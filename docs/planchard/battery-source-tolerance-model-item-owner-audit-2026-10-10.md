# BATTERY source tolerance / shared-sketch Model Items audit and correction

Readonly protected inputs: `BATTERY-source-tolerance-initial-browser-2026-10-10.mforge` (1,835,553bytes) and corresponding actual SVG/PNG. Parent's later `BATTERY-source-tolerance-linked-browser-2026-10-10.mforge` is an **unaccepted candidate**: removing the old Detail view/manual diameter and rerunning Insert Model Items had not inserted the source-owned diameter. Filename is not proof of successful linkage. Protected inputs were never modified.

## Exact source ownership

- Actual constraint ID is **`dim_ojqqrap`**, not `dim_ojqqrap1` (the trailing1 in the message joined the nominal value). In sketch `sk_2h7bg`, it is a driving diameter on entity61, nominal1.27cm /Ø.500in.
- Correct part-owned tolerance metadata: version1/deviation, upper0, lower−.00508cm, unitin, precision3. This correctly formats `+0.000/−0.002` in an inch drawing. It is source metadata, not an offset to native geometry.
- Two native boss features consume different regions of that one sketch: `feature_muk70mow_7` explicitly consumes profileEntityIds[64]; **`feature_muk70mqo_8` consumes[61]**. Same radius does not make them the same terminal.
- Actual final native topology contains `feature_muk70mqo_8:tool:edge:profile:61:start`, radius.635cm, origin approximately(0,9.906,0). Principal Top `vhjv1cxj` is face-on for this native terminal circle.
- Old manual Detail diameter `dwqasmjv` binds the different terminal64 through `feature_muk70mow_7:tool:edge:profile:64:start`. It has no source modelItem key. It cannot witness the tolerance on61 simply because both terminal radii equal.635.

## Confirmed generic cause and finite fix

Readonly `planModelItems` on actual protected final topology planned no target before deletion **or after excluding dwqasmjv**. The implementation picked the first feature sharing a sketch, so selected feature7/terminal64 when asked to bind the tolerated entity61. It was not a failed Top face-on basis or missing attached-sketch frame.

Bounded fix in `js/core/model_items.js`: choose the feature consuming the constrained entity's explicit profile/holeProfile IDs. Preserve legacy ownership only when explicit profile IDs are absent. Slot construction-length dimensions choose their consumed cap arcs rather than requiring a construction guide to survive as a solid edge. A suppressed owner does not silently switch to another explicitly owned region.

Separate duplicate guard correction: a manual diameter with a persistent native edge ID suppresses only the **same edge**, rather than every equal-radius circle anywhere in the model. Legacy unbound manual diameter deduplication remains compatible. No automatic rebinding, tolerance copying or source61→64 inference is introduced.

After the fix, readonly planning on the **same unchanged protected source** returns:

```text
modelItem: sketch:sk_2h7bg:constraint:dim_ojqqrap
type: diameter
viewId: vhjv1cxj (principal Top)
native ref: feature_muk70mqo_8:tool:edge:profile:61:start
radius: .635cm
resolved source tolerance: +0.000/−0.002
```

This is planning/audit evidence only, not an authored drawing or accepted browser/cold result. Parent already removed the old Detail/manual callout through ordinary UI; no geometry or feature deletion is required. Reload the corrected app, reopen the independent Saved copy with the source tolerance, then ordinary **Insert Model Items** should create the above native-bound diameter. Existing four source items stay intact; no second insertion is needed when the source key already exists.

## Verification and next actual witness

11 focused tolerance/model-item tests PASS, including shared-sketch two-terminal source ownership, wrong equal-radius manual diameter, actual second-boss persistent edge, face-on Top, repeat insertion, suppressed-owner refusal, and preserved construction-slot cap binding. Existing annular SHAFT COLLAR, AXLE face-on selection, depth/fillet remeasurement, legacy manual deduplication, tolerance override/reset/cache/cold tests remain green. Related drawing suite and all gates are recorded in `scratch/planchard/battery-modelitem-owner-{tests,gates}-2026-10-10.txt`.

Parent actual UI acceptance must inspect inserted `modelItem` and native edge IDs, observe the tolerance suffix, edit source lower−.002→−.003 and/or nominal diameter, verify native geometry behavior separately, Undo/Redo/restore, test drawing explicit override/suppression/reset, Save then hard reload/exact Saved reopen and compare source metadata/whole Drawing/native refs/SVG. Native full rebuild validity is parent evidence; this read-only audit does not claim a new kernel/native export validation.

Owned edits: `js/core/model_items.js`, two meaningful regressions in `tests/model_items.test.mjs`, this report. No CAD authoring, protected bundle edits, browser/ADVANCE/ledger/Git actions.
