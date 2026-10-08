# 8.20 SH06 Handle Bar — actual browser native audit

**Nominal geometry PASS.** Actual Chrome `artifacts/planchard/SH06-nominal-browser-2026-10-09.mforge` and matching STEP were read only. One feature/two rebuilt unsuppressed history steps preserve the fully defined ordinary Right-plane fixed-center D6 circle and its driving diameter. Sketch offset0 plus feature startoffset−25 mm gives forward Blind50 **X−25..25 mm**. The circle is the single ordinary profile; there are no hole profiles or helper solids.

Fresh native regeneration validates **one solid**, **1.4137166941154076 cm³**, equal to analytic cylinder volume. Bounds are **50×6×6 mm**, COM approximately zero. STEP independently validates one solid and both Boolean difference directions leave zero solids/zero volume.

Actual AISI1020 SOLIDWORKS reference material uses catalog `stock:aisi1020`, density **7.9 g/cm³**, with retained Student Workbook2011 Appendix A provenance. Native mass is **0.01116836188351172 kg**. PartNoSH06, BookItemNo6 and Description persist.

Parent actual Chrome driving PASS: D6→6.2 changed native **1.413717→1.509535 cm³ /0.01116836→0.01192533 kg**, then Undo6→Redo6.2→Undo6 and clean Save. Cold saved-library proof remains pending parent observation at this nominal checkpoint.

Evidence: `SH06-native-bundle-audit-2026-10-09.json`, `SH06-native-step-audit-2026-10-09.json`, `SH06-step-equivalence-audit-2026-10-09.json`, and `SH06-design-consistency-audit-2026-10-09.json`. Authored models, browser and ADVANCE remain untouched.

## Final cold acceptance

**Final acceptance PASS:** actual Chrome `SH06-final-browser-2026-10-09.mforge`. Features, sketches, history, properties and appearances exactly match nominal; authored part/material data are equivalent. Fresh final native regeneration validates one solid at unchanged **1.4137166941154076 cm³**,50×6×6mm, with nominal COM. Exact STEP equivalence applies to the unchanged recipe.

Parent cold saved-library `cm_mv01sjr2` proof confirms one native solid50×6×6mm, two fully defined editable steps and retained SH06/BookItem6/Description. Final cold image is protected. `SH06-final-native-bundle-audit-2026-10-09.json` and `SH06-final-cold-consistency-audit-2026-10-09.json` record native measurements, equality, input hash and cold proof; the consolidated design audit records acceptance PASS.
