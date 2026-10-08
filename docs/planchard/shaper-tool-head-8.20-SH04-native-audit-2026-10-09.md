# 8.20 SH04 Spacer Bush — actual browser native audit

**Nominal geometry PASS.** Actual Chrome `artifacts/planchard/SH04-nominal-browser-2026-10-09.mforge` and matching STEP were read only. One authored feature/two rebuilt unsuppressed history steps retain a fully defined Top annulus: ordinary fixed-center circles D16 and D8.2, each with its own ordinary driving diameter. The native Boss extrudes Y0..8 mm, forward Blind8, with outer `profileEntityIds` and inner `holeProfileEntityIds` referencing the two correct circle entities. No helper solid or construction-boundary substitution is present.

Independent native regeneration validates **one solid**, **1.1860140585832188 cm³**, nominal bounds **16×8×16 mm** and COM(0,4,0)mm. Analytic annular volume is **1.1860140585832186 cm³**, equal within roundoff. STEP imports as one valid solid; exact bidirectional native/STEP differences are zero solids/zero volume.

Actual material is **Plain Carbon Steel (grade unspecified)**, catalog `stock:plainCarbonSteel`, density **7.85 g/cm³**, sourced to Alleima20C carbon-steel reference density with an explicit representative/not-certified-grade disclosure. Native mass is **0.009310210359878267 kg**. PartNoSH04, BookItemNo4 and Description disclosing original OD16/ID8.2/length8 educational dimensions are retained.

Parent Chrome driving PASS: outerD16→16.2 changed native **1.186014→1.226478 cm³ /0.009310210→0.009627851 kg**, then Undo16→Redo16.2→Undo16 and clean Save. Final cold-library proof is pending parent observation at this nominal checkpoint.

Evidence: `SH04-native-bundle-audit-2026-10-09.json`, `SH04-native-step-audit-2026-10-09.json`, `SH04-step-equivalence-audit-2026-10-09.json`, and `SH04-design-consistency-audit-2026-10-09.json`. No authored model, browser or ADVANCE changes occurred.

## Final cold acceptance

**Final acceptance PASS:** actual Chrome `SH04-final-browser-2026-10-09.mforge`. Features, sketches, history, custom properties and appearances are byte-identical to accepted nominal; authored part/material data remain equivalent. Fresh independent final native regeneration validates one solid with the exact same **1.1860140585832188 cm³** volume and nominal16×8×16mm bounds. Existing exact STEP equivalence applies to the unchanged recipe.

Parent actual cold saved-library `cm_mv01hz92` proof confirms one native solid,16×8×16mm, two fully defined editable steps, and retained SH04/BookItem4/Description. The protected cold image is separate browser evidence. Final acceptance and hash are recorded in `SH04-final-cold-consistency-audit-2026-10-09.json`; final native measurements in `SH04-final-native-bundle-audit-2026-10-09.json`. The consolidated design audit is accepted, with initial nominal/driving evidence preserved.
