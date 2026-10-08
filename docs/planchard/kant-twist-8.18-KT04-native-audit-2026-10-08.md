# Exercise 8.18 KT04 Pin A — independent native audit

Final actual Chrome export: `artifacts/planchard/KT04-final-browser-2026-10-08.mforge`,191298 bytes, with matching13828-byte `KT04-three-features-browser-2026-10-08.step`. The final feature/sketch arrays equal the earlier three-feature snapshot after JSON serialization. Metadata is retained. This audit only reads authored files and rebuilds disposable verification geometry; final source SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Three fully defined Front sketches, three active features and six rebuilt history entries. Each ordinary circle has centerU/V=(0,0), a fixed center and driving diameter. Correct selected sketch/profile IDs and plane offsets; forward+Z, blind, zero draft, non-thin; bosses merge:

| Feature | Diameter (mm) | Z interval /depth (mm) |
|---|---:|---|
| Shaft |8 |−20.2..20.2 /40.4 |
| Integral head |12 |−23.2..−20.2 /3 |
| Nominal blind retaining bore |4 |16.2..20.2 /4 |

No sketch diagnostics or native rebuild issues. Eight compiled kernel operations implement the three authored features. Final native volume **2.3197520154107036cm³**, imported STEP **2.31975201541071cm³**, difference6.22×10⁻¹⁵cm³. STEP reports one valid solid, maximum tolerance10⁻⁷cm. Bounds X/Y±6mm,Z−23.2..20.2mm; center of mass≈(0,0,−3.568255687974)mm. Alloy Steel reference density7.70g/cm³ gives nominal mass **17.86209051866242g**.

Metadata passes: PartNo=`KT04`, BookItemNo=`4`. Description identifies common pivot pin/four assembly occurrences, nominal blind retaining bore, original educational designer dimensions, printed8-53/PDF431, unavailable companion CAD/AVI and no physical thread load claim. Material provenance specifies educational7700kg/m³ reference, grade unspecified/no load certification.

**Parent reports browser durability passed:** bore4→4.2mm changed native volume to2.314600cm³/mass0.01782242kg; Undo/Redo/Undo and Save restored nominal geometry. Cold Chrome→library`cm_muzslh3n` reopened six history steps, one native solid,12×12×43.4mm, restored2.319752cm³/0.01786209kg; metadata retained and model/mass proof screenshots protected. These are parent-observed browser checks, distinct from the independent native audit. No standalone KT04 acceptance gaps remain; full mechanism mating/motion/interference remain pending.

Evidence:

- `artifacts/planchard/KT04-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT04-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT04-three-features-native-step-audit-2026-10-08.json`
- `scratch/planchard/audit-kt04-readonly.mjs` — repeatable inspection.
- Earlier three-feature audit JSON files remain historical evidence; STEP comparison applies to the identical final recipe.
