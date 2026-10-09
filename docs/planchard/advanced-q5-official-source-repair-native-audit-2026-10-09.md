# Advanced Q5 official-source repair — failed authored dependency checkpoint

**Not accepted.** The actual Chrome bundle `ADVANCED-Q5-official-source-repair-browser-2026-10-09.mforge` contains 16 unsuppressed features, 15 sketches and 31 history steps. All sketches retain stored fully-defined status without diagnostics. The six previously suppressed rear features are active. Source coordinates match the inspected official companion: repaired width/height bevel, minor R25 rail, full-height rear strip, D90/H35 rear bore, W20/D39 top bore, exact underside fillet, central annulus and upper cap. Metadata retains Copper density 8.9 g/cm³ with the printed exercise reference and unspecified grade.

Full native regeneration gives **164.15201155724344 cm³**, one valid solid, bounds 50×63×100 mm and COM **(27.38533852190246,25.255287793164367,-57.67809931829112) mm**. The actual STEP has zero bidirectional Boolean difference against this regenerated solid. Therefore the STEP is geometrically equivalent to the exported feature graph, despite disagreement with the parent's earlier UI mass observation.

The exact failure is the new additive pin's dependency. `feature_mv06p906_9` targets `feature_mv05s0ec_2` (Cut 7), rather than the immediately preceding Cut 13. Its compiled union combines that earlier body with the pin, restoring material removed by the subsequent rear features. This is unrelated to the stale-looking stored Blind endpoints on Cut 5: its native Through-all resolves correctly and removes 30.6 cm³.

Per-feature native volumes prove the divergence:

| Stage | Volume cm³ |
|---|---:|
| Cut 7 | 164.07494025454216 |
| Cut 13, after all rear cuts | 143.78050999672635 |
| New additive pin, wrongly joined to Cut 7 | 164.70325878526015 |
| Upper cap, final exported graph | 164.15201155724344 |

A **disposable compiled-graph diagnostic only** changes the pin's union host and tool target to immediately preceding Cut 13. No coordinates, dimensions, profiles, materials or authored files change. That yields one valid solid, no issues, **143.85758129942764 cm³**, Copper mass **1280.332473564906 g**, COM **(26.813642184976354,25.800639860919183,-56.06356026858947) mm**. The added Ø10×8 pin contributes 0.6283185307 cm³ and the exact source upper cap removes 0.551247228 cm³; their net 77.0713027 mm³ explains the apparent remainder. Agreement with rounded source properties follows source geometry and dependency correction, without answer fitting.

The parent is repairing the operation through Chrome and will export a new checkpoint. Neither this failed authored graph nor the diagnostic clone is a final accepted model.

Evidence under `artifacts/planchard/ADVANCED-Q5-official-source-repair-...-2026-10-09.json`: `native-audit`, `step-equivalence`, `feature-volumes`, `design-audit`, and `dependency-diagnostic`. The design audit records source SHA/size, all active states, material reference, profile point coordinates and unmodified input check. Source producer ownership remains qualified as documented in the official-companion source inspection; this audit claims exact STEP equivalence only for the actual exported graph. No browser, app source, authored model or ADVANCE file was changed.

