# Advanced Q5 official-source final — native geometry pass

The actual Chrome final export passes independent native regeneration and exact STEP equivalence. It has **15 active features, 15 stored fully-defined sketches, 30 history steps and one authored part**. Every feature consumes the immediately preceding body; the temporary stale additive boss is absent.

The original Cut 8 is converted in place to `Central solid pin Ø10`, an additive Blind 8 mm extrusion X42..50. All subsequent rear cuts consume that result in sequence. The preserved cap sketch `sk_9jt84` drives a new final Blind 13 mm cut X37..50. The duplicate display name `Extrude Cut 13` does not duplicate feature identity or ownership.

All **15 sketch structures are exactly unchanged** from the preserved failed source-repair bundle, including coordinates, constraints, construction flags, support planes and offsets. Consequently the source-provenance coordinate inspection remains applicable: minor R25 rail and cap, width/height bevel, full-height rear strip, rear/top bores, exact underside tangent fillet, annulus and central profiles. The failure was repaired through operation/dependency changes without moving those dimensions. Copper metadata and explicit 8.9 g/cm³ exercise reference are unchanged; the grade remains unspecified and this is not material qualification.

Native results:

| Property | Independent result |
|---|---:|
| Volume | 143857.58129942764 mm³ |
| Copper mass | 1280.332473564906 g |
| COM X / Y / Z | 26.813642184976345 / 25.800639860919174 / -56.06356026858948 mm |
| Bounds | 50×63×100 mm |
| Valid solids | 1 |
| Regeneration issues | 0 |
| Native outside STEP / STEP outside native | 0 / 0 mm³ |

This agrees with the earlier dependency-only disposable diagnostic and the official source's rounded properties, with no answer fitting. The prior 164.152011557 cm³ failed export/report remains preserved as evidence of stale body ownership; its geometry is not silently relabelled as accepted.

Inputs: `artifacts/planchard/ADVANCED-Q5-official-source-final-browser-2026-10-09.mforge` and matching `.step`. Evidence: `ADVANCED-Q5-official-source-final-native-audit-2026-10-09.json`, `...-step-equivalence-...json` and `...-design-audit-...json`. The design JSON records source SHA, unmodified input, state/count checks and the exact repaired dependency chain.

Parent Chrome durability acceptance: driving undersideR10→10.2 regenerated one solid with143868.3mm³/1280.428g; Undo restored143857.6mm³/1280.332g and originalCOM. Cold page reload, keep-draft/start-fresh and saved-library reopening restored30steps/15fullydefined sketches/one body and exact base properties. Edit, Undo and cold screenshots are protected separately. Redo was not required or claimed. The independent audit did not mutate inputs. The final description was subsequently updated through Chrome to record acceptance; a closed bundle preserves that documentation. Source geometry-equivalent scope remains explicit.
