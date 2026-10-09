# Finish body target UI validation — 2026-10-09

## Implemented behavior

New Fillet, Chamfer, Shell, Dome, Draft and Thicken forms expose **Target body**. Choices use existing body IDs and the existing active-head resolver, including suppression and rollback. A single tree-selected feature resolves to its unique current body; selection during an open command also updates the target. Shared ancestry or multiple selected features require an explicit body choice.

Choosing or changing a target clears prior face/edge selections and the finish-edge pool. It does not choose all face edges or create a Shell opening. Existing viewport selections survive opening the form. Selecting the blank choice clears the target without restoring stale tree selection. The control changes editor selection only; it does not mutate feature inputs, history, body definitions or stored topology.

Source changes: `js/modeler.js`, `js/modeler_strings.js`; new regression file: `tests/finish_body_target.test.mjs`.

## Verification

The final source passed these commands:

```powershell
node --test tests/finish_body_target.test.mjs tests/finish_browser_stability.test.mjs tests/reactivated_body_publication.test.mjs tests/modeler_finish_preview.test.mjs
```

**28/28 passed.** Four new target tests exercise the actual source handlers: historical/current tree resolution; explicit body switching and blank choice; multi-body/shared-ancestry ambiguity; suppression and rollback; viewport-selection retention. A native cold regeneration after target changes preserves the complete saved document and verifies two independent bodies at 3.5 cm³ and 1 cm³. Existing reactivated-branch publication and finish-preview regressions also pass.

```powershell
node --test tests/modeler_selection_grammar.test.mjs tests/modeler_edge_selection.test.mjs tests/shell_face_thickness_form.test.mjs
```

**33/33 passed.** Existing collection grammar, edge canonicalization, exact edge availability, and independent Shell thickness/opening behavior remain covered.

```powershell
npm run check
git diff --check -- js/modeler.js js/modeler_strings.js tests/finish_body_target.test.mjs
```

Both passed: no free identifiers; no link errors across **650 modules**; **1489 source assertions** checked, with none satisfied only by comments. The whitespace check reported only Git's normal LF-to-CRLF conversion warnings.

Total focused regressions: **61/61** across the two test runs. No full-suite rerun was performed for this scoped UI change.

## Browser acceptance boundary

Cold Chrome QA of this target chooser is **pending parent verification** at report creation. Suggested check: select an intermediate body feature in the tree, open Chamfer or Shell, verify Target body resolves to the current active body and the edge/opening well remains empty; then use Browse body edges/faces without a viewport face click. Repeat explicit selection with two bodies and confirm previous geometry picks clear.

This report records source and native regression evidence only. It does not claim browser acceptance or any newly authored ebook geometry. Parent owns Chrome authoring, final exports, ADVANCE and commits.

## Parent cold Chrome acceptance

Fresh app reload, cold CH01 saved-library reopen. Selecting original Boss1 in tree then opening new Chamfer automatically selects body5504 with current head ExtrudeCut3. No edges selected; Browse body edges gives55 exact current edges including both source bore radii. Cancel then Shell targets same current body; exact opening face browser and retained plane choices populate without a viewport body/face click and without selecting an opening. Cancel leaves14steps/one native body/Saveclean. Actual Chrome Chamfer/Shell screenshots retained. PASS.
