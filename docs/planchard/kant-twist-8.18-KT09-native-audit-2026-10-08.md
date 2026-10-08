# Exercise 8.18 KT09 Hinge B — independent native audit

Final actual Chrome export: `artifacts/planchard/KT09-final-browser-2026-10-08.mforge`,471028 bytes, with matching102453-byte `KT09-six-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier six-feature snapshot after JSON serialization; metadata retained. This audit only reads authored files and rebuilds disposable native verification shapes. Final input SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Six fully defined fixed-center/driving-circle sketches, six features and twelve active rebuilt history entries. All centersU/V=(0,0), correct datum offsets/profile IDs, forward direction/zero draft/non-thin. Four merged bosses and two cuts:

| Feature | Diameter (mm) | Plane/interval (mm) |
|---|---:|---|
| Barrel |16 |Front,Z−10..10 |
| Positive journal |6 |Front,Z10..14.2 |
| Negative journal |6 |Front,Z−14.2..−10 |
| Retaining flange |10 |Front,Z−16.8..−14.2 |
| Nominal spindle crossbore |10.2 |Top,Y−8,Through All+Y to padded8.01 |
| Retaining bore |3.2 |Front,Z11.2,blind3 to14.2 |

The spindle crossbore occupies at mostZ±5.1mm; retaining bore beginsZ11.2, leaving **6.1mm axial web**. Its blind bottom is1.2mm above the positive journal rootZ10. The bores remain separate and the retaining bore does not enter the spindle interface. No diagnostics or native rebuild issues; seventeen compiled kernel operations implement six authored features.

Native volume **3.201720694089142cm³**, imported STEP **3.2017246497074097cm³**, difference3.955618268×10⁻⁶cm³(1.2355ppm). Exact final-native-minus-STEP and STEP-minus-final-native booleans both contain **zero solids/zero volume**, confirming geometric equivalence at kernel tolerance despite curved-surface mass integration variation. STEP reports one valid solid, maximum tolerance10⁻⁷cm. Nominal bounds X/Y±8mm,Z−16.8..14.2mm,16×16×31mm; X/Y bounding tolerance≈10⁻⁶mm. Native COM≈(0,0,−1.084285786888)mm. At Alloy Steel reference density7.70g/cm³, native nominal mass **24.653249344486394g**, STEP mass24.653279802747054g.

Metadata passes: PartNo=`KT09`, BookItemNo=`9`. Description identifies moving trunnion/integral journals, nominal **smooth lead2mm threaded crossbore**, printed8-53/PDF431, original educational designer example, unavailable companion CAD/AVI and no rated capacity. It is ideal smooth envelope geometry, not a physical load-bearing thread. Material provenance specifies educational7700kg/m³ reference, grade unspecified/no load certification.

**Parent reports browser durability passed:** crossbore10.2→10.4mm changed native volume to3.155849cm³/mass0.02430004kg; Undo/Redo/Undo and Save restored nominal geometry. Cold reload→preserve draft→saved-library`cm_muztqbrg` reopen returned twelve fully defined history steps/six features, one native solid16×16×31mm,3.201721cm³/0.02465325kg,density7.7,COMZ−0.1084286cm; screenshots protected. These are parent-observed browser checks, distinct from independent verification. No standalone KT09 acceptance gaps remain; assembled screw coupling/motion/interference remain pending.

Evidence:

- `artifacts/planchard/KT09-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT09-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT09-six-features-native-step-audit-2026-10-08.json`
- `artifacts/planchard/KT09-final-native-step-symmetric-difference-audit-2026-10-08.json`
- `scratch/planchard/audit-kt09-readonly.mjs` and `compare-bundle-step-readonly.mjs` — repeatable inspection.
- Earlier six-feature snapshot audit files remain historical evidence.
