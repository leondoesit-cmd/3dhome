# 8.20 SH02 Down Bit / feed screw — actual browser native audit

**Final acceptance PASS.** Actual Chrome exports `SH02-nominal-browser-2026-10-09.mforge` (431,465 bytes), its matching STEP (86,127 bytes), and `SH02-final-browser-2026-10-09.mforge` under `artifacts/planchard` were read only. Parent separately preserved an initial D10 upper-hub diagnostic; the accepted nominal and final recipes contain the corrected **D16 hub**.

All five fixed-center ordinary circle sketches match the frozen recipe and remain fully defined with empty diagnostics and driving diameters:

|Feature|Profile/plane|Native intended extent, mm|
|---|---|---|
|Shaft|Top D8 center0|Y −45..90|
|Lower capture collar|Top D12 center0|Y 68..70|
|Upper hub|Top D16 center0|Y 90..106|
|Crossbore|Right D6.2 center(U0,V96), offsetX−8|ThroughAll forward +X|
|Terminal fastener socket|Top D4.2 center0, offsetY102|Blind4 toY106|

The first three sketches use offset zero and their feature offsets establish the Y spans. All five profiles are ordinary circles; no construction geometry or helper solid is used. All ten history steps are rebuilt and unsuppressed. Native regeneration gives **one valid solid**, **9.599271130905295 cm³**, reference AISI1020 density **7.9 g/cm³**, mass **0.07583424193415184 kg**, nominal bounds **16×151×16 mm**. Native tolerance slightly expands reported bounds by approximately 1e−6 mm. COM Y is **44.31258288265855 mm**; X/Z deviations are below 7e−7 mm.

The ThroughAll feature retains a prior measured end span X6.01 mm in its stored snapshot. Native regeneration resolves ThroughAll against current host bounds rather than treating that cached span as a blind cut. Independent full cross-cylinder volume integration predicts **9.59927111259349 cm³**, just **1.8311805405346604e−8 cm³** below native integration, confirming the complete crossbore. The crossbore's upper Y edge99.1 mm clears the terminal socket start102 mm by **2.9 mm**; its lower edge92.9 mm similarly clears the hub's lower Y90 end by **2.9 mm**. No unintended crossbore/socket breakthrough occurs.

STEP independently imports as one valid solid; native-minus-STEP and STEP-minus-native each produce **zero solids/zero volume**, so symmetric difference is zero. Final features, sketches, history, properties and appearances exactly match accepted nominal, with authored part/material data equivalent. The smooth RH lead1 mm envelope and omitted threads are disclosed in Description; PartNoSH02 and BookItemNo2 persist. AISI1020 catalog/material source remains the actual SOLIDWORKS Student Workbook 2011 Appendix A reference, not an unverified physical-grade claim.

Parent actual Chrome durability PASS: shaft driving D8→8.2 changed native **9.599271→9.937715 cm³ /0.07583424→0.07850795 kg**, then Undo8→Redo8.2→Undo8 and clean Save. Cold saved library `cm_mv012esp` reopened ten editable steps, one native solid16×151×16mm, and retained Description/SH02/BookItem2. The protected final cold image is parent UI evidence, separate from disposable native audit.

Evidence:

- `SH02-native-bundle-audit-2026-10-09.json`
- `SH02-native-step-audit-2026-10-09.json`
- `SH02-step-equivalence-audit-2026-10-09.json`
- `SH02-final-native-bundle-audit-2026-10-09.json`
- `SH02-design-consistency-audit-2026-10-09.json`

No authored geometry, exports, browser state or ADVANCE was modified. Helper featureCount14 denotes compiled kernel operations; the authored model has five CAD features.
