# Basic Q2 actual driving/native audit

Actual Chrome exports `BASIC-Q2-current-library-preflight-browser-2026-10-09.mforge`, `BASIC-Q2-driving-20p1-browser-2026-10-09.mforge`, and `BASIC-Q2-driving-restored-browser-2026-10-09.mforge` independently checked read-only. Canonical model `cm_mumwq36i`, CSWA Q2 copper bracket. Audit JSON: `artifacts/planchard/BASIC-Q2-driving-native-audit-2026-10-09.json`.

Both changed and restored models regenerate as one valid native solid. All four sketches remain fully defined across eight history steps. Changed right base-hole radius1.005cm and restored1cm are present in final native cylindrical topology. The other original Top driving dimensions, all downstream features/sketches, and current origin reference geometry are preserved.

Changed native volume180.32581290254367cm3; restored180.36990515543678cm3. Actual delta-0.04409225289310825cm3 agrees with the independent14mm-thick bore formula `-pi/4*(20.1^2-20^2)*14` mm3 within2.4e-11mm3. Restored COM is (0,19.793668835537195,0)mm to numerical tolerance. No dimensions or density were fitted to printed answers.

Current preflight-to-restored features, sketches, history, referenceGeometry, localFrame, engineeringMaterials, context, and exactTopologyCache are exact. Historical September29 features/sketches also remain exact. Historical referenceGeometry was an empty array; the current library records the six standard origin planes/axes. That additive datum migration is explicitly distinguished from an authored geometry change.

Parent observed actual Chrome20→20.1 Finish, Undo20, Redo20.1, Undo20; the four visible Top fields80/30/20/20 were verified after restoration. Input bytes remain unchanged by the audit. Material provenance edits, STEP and cold durability are pending their actual exports; this report does not yet certify those stages.

## Saved provenance and STEP

The later actual `BASIC-Q2-source-qualified-restored-browser-2026-10-09.mforge` and `BASIC-Q2-source-qualified-browser-2026-10-09.step` pass an independent read-only check (`BASIC-Q2-qualified-native-step-audit-2026-10-09.json`). Geometry, history, sketch definition, datum support, frame and units exactly preserve the current preflight. Native and STEP each contain one valid solid; both directed Boolean differences have zero volume. Restored volume180.36990515543678cm3 and mass1605.2921558833873g at8.9 agree with the independently checked source-rounded values.

Actual engineering profile1502 retains the custom Copper grade and density8.9. It now contains the exact PDF497/official-companion density citation and the educational density-only qualification; all material strengths/service ratings remain zero. Actual document customProperties.Description contains the planned reconstruction/source/opaque-history qualification. These fields are verified from the saved export, not inferred from a dialog. Final cold remains pending.

## Final cold acceptance

`BASIC-Q2-cold-accepted-browser-2026-10-09.mforge` passes present-field durability against the qualified restored export. Features/sketches/history, datum support, frame, engineeringMaterials, customProperties.Description, units, parameters, bindings, named selections and exactTopologyCache are identical where present. All body properties except derived meshData are exact; other model changes are lastRebuild bookkeeping. The saved density8.9, source citation and educational qualification persist exactly. No authoring or input-byte edits were performed by the audit.

Parent independently observed full Chrome reload, preservation of the old planner backup, blank Model, unique saved Q2 selection, one valid native solid/eight steps/four fully defined sketches, and clean Save. Actual cold properties read180369.9mm3/1605.292g/COM(0,19.79367,0)mm. Parent also read the actual Description and Engineering material fields and canceled both dialogs unchanged. Evidence is separately attributed to those browser observations; independent native and fresh STEP validation are recorded above.

Scoped Basic Q2 driving/Undo/Redo/restoration, source geometry/density, fresh STEP, explicit provenance and final cold durability are accepted. Original opaque source selection/history equivalence remains qualified; the whole ebook is not declared complete. Cold audit: `artifacts/planchard/BASIC-Q2-cold-durability-audit-2026-10-09.json`.
