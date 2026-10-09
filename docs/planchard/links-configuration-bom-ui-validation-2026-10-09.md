# Configuration-aware BOM grouping — source validation

Parent actual Chrome reported four LINKS occurrences rendered as only two drawing rows: the shared FLAT BAR definition was counted as one7HOLES row quantity3, plus collar. Read-only source confirmed `generateBOM` grouped by shared model key alone.

The repair in `js/cad_interference.js` groups by source identity, selected configuration and resolved PartNo/Description/material/finish/standard/property class. Equivalent occurrences retain a combined quantity; occurrence names/IDs do not split equivalent parts. Explicit occurrence Material joins the existing material priority. Drawing parts-only and indented row/path numbering share this same key, so table rows and leaf balloons stay consistent. `js/modeler_commands.js` retains authoritative resolved row metadata instead of replacing it with another same-model occurrence's values.

No geometry, configuration, mate or authored export is changed by BOM reading. The actual protected `LINKS-reference-material-bom-repaired-browser-2026-10-09.mforge` now yields four quantity1 rows with the four printed PartNos, in both drawing scopes. Its five-hole definition still records1060; the test explicitly preserves/reports that actual material rather than fabricating2014. Parent browser material correction and cold drawing QA remain separate.

Focused command: `node --test tests/configuration_bom_identity.test.mjs tests/drawing_bom_properties.test.mjs tests/modeler_commands.test.mjs tests/form_subassembly_ui.test.mjs tests/cad_toolbox_review.test.mjs` —59/59PASS. Four new regressions cover three configured variants, repeated equivalent occurrences, different metadata overrides, actual export rows and per-leaf balloon labels; existing indented AP/toolbox/BOM tests pass.

`npm run check` —PASS: no free identifiers,653 module links,1489 source assertions. Scoped diff check passes. No full suite rerun.

## Context Save semantics (read-only guidance)

`saveModel` at `js/modeler.js:27234` explicitly finishes the edited component and saves the assembly. It does not update the shared Part library. `finishContextPart` publishes the edited working definition into that occurrence only. Updating another occurrence from the library can therefore retrieve the older library configuration materials. To update the shared source, open canonical Part `cm_munm4oro` through Saved models, update7/5 configuration material snapshots, Save the Part, then update assembly occurrences from that library and verify their selected configurations. Occurrence Placement **Component description**/**Component part number** remain the explicit BOM metadata controls.

Actual cold Chrome QA remains parent-owned. No new browser authoring or whole-book acceptance is claimed.
