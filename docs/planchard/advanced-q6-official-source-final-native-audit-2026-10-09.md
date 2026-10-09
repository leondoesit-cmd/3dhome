# Advanced Q6 official-source final — native geometry pass

Closed-checkpoint follow-up: `ADVANCED-Q6-Q6A-official-source-closed-browser-2026-10-09.mforge` retains features, sketches, history, engineering material, parameters, local frame and authored part data exactly. Only part rebuild/mesh caches differ. The named Q6A reference frame persists with origin **(100,-75,-40) mm** and identity axes, consistently in both reference collections. Subtracting that origin from independently audited physical COM gives **(-64.09223015411306,75,40.701493617646725) mm**, without moving the solid. Parent observed lower-wall25→25.2 driving regeneration, Undo restoration, cold saved-library reopen and named-frame re-evaluation. Compact evidence: `ADVANCED-Q6-Q6A-official-source-closed-consistency-2026-10-09.json`; unchanged geometry safely reuses the existing native/STEP audit.

The actual Chrome final bundle and STEP pass independent read-only geometry checks. The bundle has five active features, three stored fully-defined sketches, eight history steps and one valid native solid. The first four features and both earlier sketches remain structurally exact to the audited shell-slot checkpoint; its three inner C openings, four outer chamfers and 10/25/25 mm wall values are preserved.

The new Top S scallop has three ordinary lines and two radius30 minor arcs, with centres **(-20.98076211353316,-15)** and **(30.98076211353316,15) mm**. Its exact five contour vertices are (5,30),(0,30),(0,-30),(5,-30),(5,0). The actual exported sketch has **seven points, seven Point Fix constraints and three H/V constraints: ten total**. This corrects the parent's initial count of eight/eleven; geometry is complete. All points are fixed, stored status is fully defined, and the latest cut consumes the previous slot body Through-all toward−Y from Y75 with additional offset0.

| Result | Independent native measurement |
|---|---:|
| Volume | 522989.2179780045 mm³ |
| Mass at source density7.8 | 4079.315900228435 g |
| Physical-frame COM X/Y/Z | 35.90776984588694 / 0 / 0.7014936176467267 mm |
| Scallop material removed | 45000 mm³, numerical precision |
| Bounds | 100×150×100 mm |
| Native issues / valid solids | 0 / 1 |
| Native outside STEP / STEP outside native | 0 / 0 mm³ |

Body and engineering metadata retain the explicit source **Plain Carbon Steel7.8 g/cm³** override and official companion7800kg/m³ citation, with grade/condition unspecified and no qualified strength rating. The preset's default7.85 is not used for this exercise mass. No coordinate or density was fitted to an answer.

Evidence under `artifacts/planchard/ADVANCED-Q6-official-source-final-...-2026-10-09.json`: native audit, STEP equivalence and design audit. All18 recorded checks pass; source SHA and unchanged input are retained. Parent Chrome durability PASS: lower Shell face override25→25.2mm regenerated both downstream cuts, one native solid523790.2mm³/4085.563g; Undo restored522989.2mm³/4079.316g. NamedQ6A coordinate system was authored at sourceorigin(100,-75,-40)mm with identity axes; selectedmass-report COM(-64.09223,75,40.70149)mm agrees printed rounding without moving geometry. Coldpage reload/saved-library reopen restores8steps/threeFullyDefinedsketches/onebody/material7.8, originalworld properties and namedframe; reselectingtheframe repeatsCOM. Screenshots separately protected. Closedacceptance description/export is a later checkpoint; independent geometry input remained unmodified. No authored models, browser, app source or ADVANCE file changed during this audit.
