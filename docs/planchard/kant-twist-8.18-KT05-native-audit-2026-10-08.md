# Exercise 8.18 KT05 Grip A — independent native audit

Final actual Chrome export: `artifacts/planchard/KT05-final-browser-2026-10-08.mforge`,110620 bytes, with matching20278-byte `KT05-two-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier two-feature snapshot after JSON serialization; metadata is retained. Verification only reads authored files and rebuilds a disposable native shape. Final source SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Two fully defined Front sketches, two features and four active rebuilt history entries. Rectangle corners match X±12/Y±7mm. Ordinary closed lines have two horizontal/two vertical relations, driving24/14mm distances and fixed first corner(−12,−7). The boss is blind+Z32mm fromZ−16 to16, merged, zero draft/non-thin. Bore is ordinaryØ8.2mm with fixed centerU/V=(0,0), driving diameter, Front offsetZ−16 and Through All+Z to paddedZ16.01mm. Correct sketch/profile selections; no diagnostics or native rebuild issues.

Five compiled kernel operations implement the two authored features. Final native volume **9.062074479781002cm³**, STEP **9.062074479780918cm³**, difference8.35×10⁻¹⁴cm³. STEP validation reports one valid solid, maximum tolerance10⁻⁷cm. Bounds24×14×32mm centered at origin; center of mass≈(0,0,0). Alloy Steel reference density7.70g/cm³ gives nominal mass **69.77797349431371g**.

Metadata passes: PartNo=`KT05`, BookItemNo=`5`. Description identifies outer floating jaw/nominal pivot bore, original educational designer example, printed8-53/PDF431, unavailable companion CAD/AVI and no rated capacity. Material provenance specifies educational7700kg/m³ reference, grade unspecified/no load certification.

**Parent reports browser durability passed:** bore8.2→8.4mm changed native volume to8.978634cm³/mass0.06913548kg; Undo/Redo/Undo then Save restored nominal geometry. Cold Chrome reload→saved-library reopen returned four editable fully defined history steps, one native solid24×14×32mm,9.062074cm³/0.06977797kg,density7.7; final cold mass screenshot protected. These are parent-observed browser checks, distinct from independent native verification. No standalone KT05 acceptance gaps remain; actual jaw swivel mating and full mechanism interference remain pending.

Evidence:

- `artifacts/planchard/KT05-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT05-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT05-two-features-native-step-audit-2026-10-08.json`
- `scratch/planchard/audit-kt05-readonly.mjs` — repeatable inspection.
- Earlier two-feature audit files remain historical evidence; STEP comparison applies to the identical final recipe.
