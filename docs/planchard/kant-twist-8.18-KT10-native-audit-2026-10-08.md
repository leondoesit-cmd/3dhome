# Exercise 8.18 KT10 Grip B — independent native audit

Final actual Chrome export: `artifacts/planchard/KT10-final-browser-2026-10-08.mforge`,106106 bytes, with matching19840-byte `KT10-two-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier two-feature snapshot after JSON serialization; metadata retained. This audit only reads authored files and rebuilds disposable verification geometry. Final input SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Two fully defined Front sketches, two features and four active rebuilt history entries. Centered rectangle corners X±12/Y±7mm use four ordinary lines/two horizontal/two vertical relations, ordinary driving24/14mm distances, center point fixedU/V=(0,0), and midpoint relation to its construction diagonal. The construction diagonal is **excluded from the four selected boss profile IDs**. Thus it defines the center without introducing extra material contours.

Boss is merged blind+Z20mm fromZ−10 to10, zero draft/non-thin. Bore is ordinaryØ8.2mm with fixed center/driving diameter, Front offsetZ−10, Through All+Z to paddedZ10.01mm. Correct datum/sketch/profile selections; no diagnostics or native rebuild issues. Five compiled kernel operations implement two authored features.

Final native volume **5.663796549863113cm³**, STEP **5.663796549863074cm³**, difference3.91×10⁻¹⁴cm³. STEP reports one valid solid, maximum tolerance10⁻⁷cm. Bounds24×14×20mm centered at origin, center of mass≈(0,0,0). Alloy Steel educational reference density7.70g/cm³ gives nominal mass **43.61123343394597g**.

Metadata passes: PartNo=`KT10`, BookItemNo=`10`. Description identifies inner floating jaw/nominal pivot bore, printed8-53/PDF431, original educational designer example, unavailable companion CAD/AVI and no rated capacity. Material provenance specifies educational7700kg/m³ reference, grade unspecified/no load certification.

**Parent reports browser durability passed:** centered width24→26mm produced6.223797cm³/0.04792323kg,X26/Y14/Z20mm,COM0; Undo/Redo/Undo and Save restored nominal geometry. Cold Chrome reload→preserve draft→saved library`cm_muztxzqs` reopened four fully defined history steps, one native solid24×14×20mm,5.663797cm³/0.04361123kg,density7.7,COM0; screenshots protected. This confirms the center stays fixed through width edits. These are parent-observed browser checks, distinct from independent verification. No standalone KT10 acceptance gaps remain; assembled jaw swivel/flat-workpiece guide and full mechanism motion/interference remain pending.

Evidence:

- `artifacts/planchard/KT10-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT10-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT10-two-features-native-step-audit-2026-10-08.json`
- `scratch/planchard/audit-kt10-readonly.mjs` — repeatable inspection.
- Earlier two-feature snapshot audit files remain historical evidence; STEP comparison applies to the identical final recipe.
