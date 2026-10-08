# Exercise 8.18 KT11 Shaft — independent native audit

Final actual Chrome export: `artifacts/planchard/KT11-final-browser-2026-10-08.mforge`,384352 bytes, with matching78513-byte `KT11-four-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier four-feature snapshot after JSON serialization; metadata retained. Audit only reads authored files and rebuilds disposable native verification shapes. Final input SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Four fully defined circle sketches, four features and eight active rebuilt history entries. Top boss circles have fixed centerU/V=(0,0), ordinary driving diameters and exact plane offsets/depths; Right bore has fixed centerU/V=(0,−22)mm. Correct sketch/profile selections, forward directions, zero draft/non-thin; bosses merge:

| Feature | Diameter (mm) | Plane/interval (mm) |
|---|---:|---|
| Stock |10 |Top,+Y−28..110 |
| Handle hub |18 |Top,+Y−28..−8.2 |
| Capture collar |18 |Top,+Y8.2..11.2 |
| Crossbar bore |6.2 |Right,X−9,centerZ0/Y−22,Through All+X to padded9.01 |

No diagnostics/native rebuild issues; eleven compiled kernel operations implement four authored features. Native volume **14.314429546021731cm³**, STEP **14.314442044688912cm³**, difference1.249866718×10⁻⁵cm³(0.8732ppm). Exact final-native-minus-STEP and STEP-minus-final-native booleans both contain **zero solids/zero volume**, confirming geometric equivalence at kernel tolerance despite curved-surface mass integration variation. STEP reports one valid solid, maximum tolerance10⁻⁷cm. Nominal bounds X/Z±9mm,Y−28..110mm,18×138×18mm; bounding tolerance≈10⁻⁶mm. Native COM≈(0,27.819747643016,0)mm. At Alloy Steel reference density7.70g/cm³, native nominal mass **110.22110750436734g**, STEP mass110.22120374410463g.

Metadata passes: PartNo=`KT11`, BookItemNo=`11`. Description identifies capture collar/crossbar hub, printed8-53/PDF431, original educational designer example, smooth nominal thread envelope with idealRH2mm leadY11.2..110mm, unavailable companion CAD/AVI/no rated capacity. It is ideal envelope geometry, not a physical thread or load certification. Material provenance specifies educational7700kg/m³ reference, grade unspecified.

**Parent reports browser durability passed:** crossbar bore6.2→6.4mm changed native volume to14.27992cm³/mass0.1099554kg; Undo/Redo/Undo and Save restored nominal geometry. Cold reload→preserve draft→saved library`cm_muzu3x2i` reopened eight fully defined history steps/four features, one native solid18×138×18mm,14.31443cm³/0.1102211kg,density7.7,COMY2.781975cm; screenshots protected. These are parent-observed browser checks, distinct from independent verification. No standalone KT11 acceptance gaps remain; assembled axial capture/screw coupling/motion/interference remain pending.

Evidence:

- `artifacts/planchard/KT11-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT11-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT11-four-features-native-step-audit-2026-10-08.json`
- `artifacts/planchard/KT11-final-native-step-symmetric-difference-audit-2026-10-08.json`
- `scratch/planchard/audit-kt11-readonly.mjs` and `compare-bundle-step-readonly.mjs` — repeatable inspection.
- Earlier four-feature snapshot audit files remain historical evidence.
