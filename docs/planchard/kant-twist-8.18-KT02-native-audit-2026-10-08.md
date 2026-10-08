# Exercise 8.18 KT02 Hinge A — independent native audit

Final actual input is `artifacts/planchard/KT02-final-browser-2026-10-08.mforge`,465399 bytes, with the matching102632-byte `KT02-six-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier six-feature snapshot after JSON serialization; metadata is retained. The final native rebuild repeats the same volume/bounds. All geometry was authored through Chrome; this audit reads the document, rebuilds a disposable native shape and imports STEP. It does not modify either authored file; final source SHA256 remained unchanged.

**Geometry matches the frozen original designer plan.** Six fully defined sketches, six features and twelve active rebuilt history entries. All circles have fixed centerU/V=(0,0), ordinary driving diameters, correct datum plane/offset and selected profile IDs. Four merged blind bosses and two cuts form one valid STEP solid:

| Feature | Plane/axis | Diameter and extent (mm) |
|---|---|---|
| Barrel | Front /+Z |Ø16,Z−16..16 |
| Positive journal | Front /+Z |Ø6,Z16..20.2 |
| Negative journal | Front /+Z |Ø6,Z−20.2..−16 |
| Retaining flange | Front /+Z |Ø10,Z−22.8..−20.2 |
| Spindle crossbore | Top /+Y |Ø10.2,offsetY−8,Through All to paddedY8.01 |
| Retaining bore | Front /+Z |Ø3.2,offsetZ17.2,blind3 toZ20.2 |

No sketch diagnostics or native rebuild issues. Seventeen compiled kernel operations reflect profile/tool/boolean operations, rather than authored feature count. STEP validation reports one valid solid and maximum tolerance10⁻⁷cm. Bounds are nominal X/Y±8mm,Z−22.8..20.2mm, with kernel bounding tolerance about10⁻⁶mm on X/Y.

Native volume is5.6144638520461365cm³, imported STEP5.614467807664072cm³. Their small3.955617935×10⁻⁶cm³ difference is0.7045ppm. To check whether this was a geometry mismatch, native-minus-STEP and STEP-minus-native were rebuilt with exact kernel booleans: **both results contain zero solids and zero volume**. Geometry therefore agrees at kernel tolerance; the reported curved-surface mass integration values retain their numerical difference. Native nominal mass43.2313716607553g and STEP mass43.2314021190134g at density7.70g/cm³. Native center of mass is approximately(0,0,−0.862338077891)mm.

Material and metadata pass: Alloy Steel educational reference, `stock:alloySteel`, density provenance7700kg/m³, grade unspecified/no load certification. PartNo=`KT02`, BookItemNo=`2`; Description identifies original educational designer geometry, book8-53/PDF431, nominal blind retaining bore and unavailable companion CAD/AVI.

**Parent reports browser durability passed:** driving crossbore10.2→10.4mm changed native volume to5.568592cm³/mass0.04287816kg; Undo/Redo/Undo restored diameters10.2/10.4/10.2, followed by Save. Chrome reload→keep draft→library`cm_muzs3cnz` cold reopen showed12 history steps, one native solid,16×16×43mm,5.614464cm³/0.04323137kg, with Description/PartNo/BookItemNo retained. These are parent-observed Chrome checks, distinct from the independent read-only audit. No KT02 standalone acceptance gaps remain; complete mechanism motion, mating and interference remain pending.

Evidence:

- `artifacts/planchard/KT02-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT02-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT02-six-features-native-step-audit-2026-10-08.json`
- `artifacts/planchard/KT02-final-native-step-symmetric-difference-audit-2026-10-08.json` — repeated directly with the final bundle, zero solids/volume both directions.
- Earlier six-feature audit JSON files remain historical evidence.
- Read-only repeat scripts `scratch/planchard/audit-kt02-readonly.mjs` and `compare-bundle-step-readonly.mjs`.
