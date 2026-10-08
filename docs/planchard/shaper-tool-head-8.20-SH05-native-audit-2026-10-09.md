# 8.20 SH05 Handle grip — actual browser native audit

**Nominal geometry PASS.** Actual Chrome `artifacts/planchard/SH05-nominal-browser-2026-10-09.mforge` and matching STEP were read only. One authored feature/two rebuilt unsuppressed history steps retain a fully defined Right-plane annulus: ordinary fixed-center D14 and D6.2 circles, each with its own driving diameter. Sketch offset0 plus featureoffset−30 mm establishes the forward Blind20 Boss **X−30..−10 mm**. Native outer `profileEntityIds` and inner `holeProfileEntityIds` reference the correct ordinary circles; no helper geometry becomes a solid.

Independent native regeneration validates **one solid**, **2.474946692498039 cm³**, exactly matching analytic annular volume. Nominal bounds are **20×14×14 mm**, COM **(−20,0,0) mm**. STEP independently validates one solid; both native-minus-STEP and STEP-minus-native differences are zero solids/zero volume.

Actual material is **AISI1020 (SOLIDWORKS reference)**, catalog `stock:aisi1020`, density **7.9 g/cm³**, retaining Student Workbook2011 Appendix A reference provenance. Native mass is **0.01955207887073451 kg**. PartNoSH05, BookItemNo5 and Description disclose the original smooth OD14/ID6.2/length20 grip interpretation.

Parent actual Chrome driving PASS: outerD14→14.2 changed native **2.474947→2.563540 cm³ /0.01955208→0.02025196 kg**, then Undo14→Redo14.2→Undo14 and clean Save. Final cold-library proof remains pending parent observation at this nominal checkpoint.

Evidence: `SH05-native-bundle-audit-2026-10-09.json`, `SH05-native-step-audit-2026-10-09.json`, `SH05-step-equivalence-audit-2026-10-09.json`, and `SH05-design-consistency-audit-2026-10-09.json`. Authored exports, browser state and ADVANCE were untouched.

## Final cold acceptance

**Final acceptance PASS:** actual Chrome `SH05-final-browser-2026-10-09.mforge`. Final features, sketches, history, properties and appearances exactly match nominal; authored material/part data remain equivalent. Fresh final regeneration validates one native solid at the exact same **2.474946692498039 cm³**, bounds20×14×14mm and nominal COM. Exact STEP equivalence remains applicable to the unchanged recipe.

Parent actual cold library `cm_mv01mi81` proof confirms one native solid20×14×14mm, two editable steps, and retained SH05/BookItem5/Description; final cold image is protected. `SH05-final-native-bundle-audit-2026-10-09.json` and `SH05-final-cold-consistency-audit-2026-10-09.json` record measurements, equality and input hash; the consolidated design audit records acceptance PASS. This geometry/browser acceptance does not claim that a separately stopped parallel full npm test run passed.
