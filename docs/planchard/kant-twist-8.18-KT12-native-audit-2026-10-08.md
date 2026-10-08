# Exercise 8.18 KT12 Handle shaft — independent native audit

Final actual Chrome export: `artifacts/planchard/KT12-final-browser-2026-10-08.mforge`,117215 bytes, with matching9768-byte `KT12-two-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier two-feature snapshot after JSON serialization; metadata retained. Audit only reads authored files and rebuilds disposable native verification geometry. Final input SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Two fully defined Right-plane sketches, two features and four active rebuilt history entries. Ordinary circles have fixed centerU/V=(0,0), driving diameters and offsetX−32mm. Ø6 stock is blind+X64mm toX32; Ø4 nominal retaining bore is blind+X4mm toX−28. Correct datum/profile selections; boss merges, forward directions/zero draft/non-thin. No diagnostics or native rebuild issues. Five compiled kernel operations implement two authored features.

Native volume **1.7592918860102849cm³**, STEP **1.7592918860102977cm³**, difference1.29×10⁻¹⁴cm³. STEP reports one valid solid, maximum tolerance10⁻⁷cm. Bounds X±32mm,Y/Z±3mm,64×6×6mm. COM≈(0.857142857143,0,0)mm. Alloy Steel educational reference density7.70g/cm³ gives nominal mass **13.546547522279194g**.

Metadata passes: PartNo=`KT12`, BookItemNo=`12`; Description identifies original educational crossbar with nominal blind grip-retaining thread envelope, printed8-53/PDF431, unavailable companion CAD/AVI/no rated capacity. Material provenance specifies educational7700kg/m³ reference, grade unspecified/no load certification.

**Parent reports browser durability passed:** bore4→4.2mm changed native volume to1.754140cm³/mass0.01350688kg; Undo/Redo/Undo and Save restored nominal geometry. Cold reload→preserve draft→saved library`cm_muzuacdn` reopened four fully defined history steps/two features, one native solid64×6×6mm,1.759292cm³/0.01354655kg,density7.7,COMX0.08571429cm; screenshots protected. These are parent-observed browser checks, distinct from independent verification. No standalone KT12 acceptance gaps remain; assembled handle/grip fit and full motion/interference remain pending.

Evidence:

- `artifacts/planchard/KT12-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT12-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT12-two-features-native-step-audit-2026-10-08.json`
- `scratch/planchard/audit-kt-circle-part-readonly.mjs` — repeatable frozen-spec inspection.
- Earlier two-feature snapshot audit files remain historical evidence; STEP comparison applies to the identical final recipe.
