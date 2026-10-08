# Exercise 8.18 KT07 Brace B — independent native audit

Final actual Chrome export: `artifacts/planchard/KT07-final-browser-2026-10-08.mforge`,241315 bytes, with matching37381-byte `KT07-two-features-browser-2026-10-08.step`. Feature/sketch arrays equal the earlier two-feature snapshot after JSON serialization; metadata is retained. Verification only reads authored files and rebuilds a disposable native shape. Final input SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Six exact Brace A vertices reflectedV→−V and reversed in order form the intended ordinary closed outline; all six points have fixed anchors. Two fully defined Front sketches, two features and four active rebuilt history entries. Boss is blind+Z3mm fromZ11 to14, merged, zero draft/non-thin. Bore sketch atZ11 has three fixed centers with ordinary driving diameters:

| Bore | U/V center (mm) | Diameter (mm) |
|---|---|---:|
| RB |−25/45 |6.2 |
| P |0/0 |8.2 |
| JB |65/−35 |8.2 |

Main/additional selected profile IDs resolve to all three circles. Cut is Through All+Z to paddedZ14.01mm. No diagnostics or native rebuild issues; five compiled kernel operations implement the two authored features.

Final native volume **5.443262021012166cm³**, imported STEP **5.443262021011358cm³**, difference8.08×10⁻¹³cm³. STEP reports one valid solid, maximum tolerance10⁻⁷cm. Bounds(mm): X−34.518601451101..74.481996460700, Y−44.481996460700..54.518601451101, Z11..14. COM(mm):(14.25505873655,−0.198244604009,12.5). Alloy Steel reference density7.70g/cm³ gives nominal mass **41.913117561793676g**.

Metadata passes: PartNo=`KT07`, BookItemNo=`7`. Description identifies mirrored moving brace, printed8-53/PDF431, original educational designer example, unavailable companion CAD/AVI and no rated capacity. Material provenance specifies educational7700kg/m³ reference, grade unspecified/no load certification.

**Parent reports browser durability passed:** rear bore6.2→6.4mm changed native volume to5.437324cm³/mass0.04186740kg; Undo/Redo/Undo and Save restored nominal geometry. Cold reload→preserve draft→saved-library`cm_muztcbk6` reopen returned four fully defined history steps, one native solid109.0006×99.0006×3mm,5.443262cm³/0.04191312kg,density7.7,COM(1.425506,−0.01982446,1.25)cm; screenshots protected. These are parent-observed browser checks, distinct from independent verification. No standalone KT07 acceptance gaps remain; moving pair mating and full mechanism motion/interference remain pending.

Evidence:

- `artifacts/planchard/KT07-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT07-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT07-two-features-native-step-audit-2026-10-08.json`
- `scratch/planchard/audit-kt07-readonly.mjs` — repeatable inspection.
- Earlier two-feature audit files remain historical evidence; STEP comparison applies to the identical final recipe.
