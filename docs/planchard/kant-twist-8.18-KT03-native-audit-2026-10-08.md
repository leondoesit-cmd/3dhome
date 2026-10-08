# Exercise 8.18 KT03 Brace A — independent native audit

Final actual Chrome inputs: `artifacts/planchard/KT03-final-browser-2026-10-08.mforge`,349922 bytes, and matching41716-byte `KT03-two-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier two-feature snapshot after JSON serialization; metadata is retained. Final native rebuild repeats the same volume/bounds. This is read-only verification of exported geometry: a disposable native rebuild and independent STEP import. Authored files are unchanged.

**Geometry matches the frozen original designer plan.** Two fully defined Front sketches, two active features and four rebuilt history entries. Six ordered contour vertices match the frozen coordinates to10⁻⁷mm inspection tolerance; six fixed constraints anchor every vertex. The six ordinary lines form the intended closed outline. Boss is blind+Z3mm fromZ17 to20, merged, zero draft/non-thin. Bore sketch atZ17 contains four fixed centers with ordinary driving diameters:

| Bore | U/V center (mm) | Diameter (mm) |
|---|---|---:|
| RA |−25/−45 |6.2 |
| P |0/0 |8.2 |
| Q |45/24.230769230769 |8.2 |
| JA |65/35 |8.2 |

The cut is Through All+Z to paddedZ20.01mm. Main and additional region profile IDs select all four ordinary circles. No diagnostics or native rebuild issues. Five compiled kernel operations implement the two authored features.

Native volume **5.2848315034916284cm³**, STEP **5.284831503491074cm³**, difference5.54×10⁻¹³cm³. STEP is one valid solid, maximum tolerance10⁻⁷cm. Bounds(mm): X−34.518601451101..74.481996460700, Y−54.518601451101..44.481996460700, Z17..20. Native center of mass(mm):(13.333376190515,−0.522210780695,18.5). Alloy Steel reference density7.70g/cm³ gives nominal mass **40.6932025768855g**.

Metadata passes: PartNo=`KT03`, BookItemNo=`3`, Description identifies outer fixed brace/paired assembly use, exact designer coordinates, printed8-53/PDF431, unavailable companion CAD/AVI, nominal holes and no rated capacity. Material provenance specifies educational7700kg/m³ reference, grade unspecified/no load certification.

**Parent reports browser durability passed:** rear-bore6.2→6.4mm changed native volume to5.278894cm³/mass0.04064748kg; Undo/Redo/Undo then Save restored nominal geometry. Chrome cold reload→preserve draft→actual saved library`cm_muzscwb3` reopened one native solid/four history steps,5.284832cm³/0.04069320kg, nominal bore restored. These are parent-observed browser checks, distinct from the independent native audit. No standalone KT03 acceptance gaps remain; assembly pair placement/mating and full motion interference remain pending.

Evidence:

- `artifacts/planchard/KT03-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT03-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT03-two-features-native-step-audit-2026-10-08.json`
- `scratch/planchard/audit-kt03-readonly.mjs` — repeatable read-only comparison.
- Earlier two-feature snapshot audits remain historical evidence; STEP comparison applies to the identical final recipe.
