# Browser CI gap audit — 2026-09-28

Read-only audit of `scratch/planchard/browser-ci-2026-09-28.log`, the root-owned `npm run test:browser` run (`--test-concurrency=3`). Its final summary reports **633 tests:363 pass,66 fail,204 skipped;589.600s;exit1**. Source and fixtures changed while this run was executing, so these are the actual results of that mixed-revision run, not a clean verdict on the final current source. No production edits or extra test runs were made for this audit. This is not a full-suite success claim or desktop Chrome acceptance.

## Observed failures and likely groups

Later focused verification supersedes the recovery/form uncertainty below: 11 targeted assembly recovery, gear, drawing precision, flange, material and cabinet Save/reload cases pass. Their fixtures now use the owning tab's IndexedDB-aware draft API and the explicit legacy recovery workflow. Logs include `recovery-explicit-final.log`, `cabinet-owned-final.log` and `drawing-precision-owned-idb.log`. The kitchen workflow also passes after fixing its Windows screenshot path. Other layout, room-unit, AR and lifecycle cases remain unverified unless a separate result is recorded.

| Group | Failure names or families observed in the current log | Assessment / next evidence needed |
|---|---|---|
| CAD persistence and recovery | `assembly recovery, editing, autosave and a second browser reload preserve components and mates`; `gear relation editor persists, reopens and seeks a full-turn ratio correctly`; `a reusable model survives edit, instances, undo/redo, reload, and project import`; nonblocking recovery/expression collection at344/717/1280px; repeated expressions/discard | Owned draft storage changed the recovery contract. The focused draft run still times out waiting for assembly/gear recovery; these remain unresolved. Audit which draft key the fixture owns and which recovery card is displayed before classifying a production loss. |
| CAD forms and save | undercut/profile shift; drawing precision; sheet rules/adjacent flanges; material qualification; legacy countersink; fillet varying radius/per-edge radius/document units; curve pattern group; cabinet parametric save/reload | Several save fixtures have passing focused results below. Four variable-fillet/curve-pattern cases fail during fixture setup with **`ReferenceError: model is not defined`**, before exercising their forms. Legacy countersink times out waiting for a condition and remains unresolved. Require each form's actual parameters and exact Save result; no general CAD-save failure or success inferred. |
| CAD editor layout and transitions | automatically oriented sketch restores3D pose; compact/expandable diagnostics; assembly FeatureManager; editor close restores desktop layout; Commands drawers/mode tab; mobile welcome/tutorial/nav/Touch CAD/View sheet; narrow viewport; Hebrew feature flow | The shared classic-layout context first fails editor close with **`Runtime.evaluate timed out` after30.831s**, followed by **13 `CDP connection closed` failures**. Those subsequent cases cannot establish13 independent layout defects. Diagnose the initial close/timeout and reset the shared context before evaluating later layout assertions. Other listed transition/layout failures remain unverified. |
| Planner dimensions and unit assumptions | exact room resize/Undo/baseline inEnglish/Hebrew; exact interior-size inspector/transactional edits; room-side resize; selected-room guide text; mobile dimension dial | `room_resize` injects bare321.75/245.125 as centimetres without selecting units: actual geometry **32175/24512.5 cm**, exactly100× expected. Inspector and room-stamp failures compare displayed **3.5/3 m** against **350/300 cm**. Current guide uses `fmtLen/parseLen(...,'rooms')`; inspector uses inferred rooms-domain format/parse; smart metric rooms default to metres. These failing assertions are unit mismatches, not evidence of failed geometry or Undo. Room summary expects bare`360` in formatted text and may have the same assumption. Dial failures include a missing dial/null element and6 versus256, so need separate input-unit and activation evidence. |
| Planner geometry and planning guide | reordered checklist boundary packing; contextual kind-specific actions; preset-floor image/Undo; interactive walls/rooms/openings/finishes; corridor-offset hallway | Packing fails with **`Missing packed preview`**; hallway and interactive drafting include evaluation timeouts. Genuine geometry, transactional or picker defects are possible. Determine requested unit, active tool/selection, generated room measurements, and first failing assertion. Other corridor/stamp/join/bite cases passed in the same log, but do not clear these workflows. |
| Responsive planner / shared chrome | desktop header/search/Split/classic layout; Add after reload/drawer dismissal; short menus; unclipped Properties deck;3D overflow/compass | Likely layout or state transitions; may share setup assumptions with classic skin fixtures. Need measured boxes and active skin, not a selector-presence inference. |
| Performance / scheduling | kernel-backed downstream feature debounce/stale status; analytic tier frame cost / kernel off tick | Resource-sensitive timing gates during concurrent browser execution. Reproduce in controlled isolation before loosening budgets or changing scheduling. No focused pass is recorded here. |
| AR | crosshair adds corner; restart does not resume abandoned trace; tabletop cannot accept corner | Session/input and horizontal-plane filtering remain unverified. These are separate from the ebook CAD geometry. |
| Helper / export fixtures | LM Studio progress and connection-model persistence; identical Blender pieces share a mesh | All three have subsequent focused passing logs below; broad running-log failures remain historical observations until a complete rerun. |
| Windows fixture path | typed kitchen remodel example | Fails before authoring with **ENOENT mkdir `C:\\C:\\Users\\liron\\Desktop\\3dhome\\scratch\\apartment`**. This is a doubled-drive path fixture error, not a demonstrated wall-tool defect. |

Prioritize owned-draft recovery and explicit regional-unit setup in fixtures, then the undefined model identifier/Windows path and shared-context failure. Actual hit-target/layout, packed-preview, AR and geometry claims still need their own isolated evidence. GPU-dependent skips in this headless run do not count as desktop acceptance.

## Subsequent focused evidence already on disk

These logs were read, not rerun for this audit:

- `agent-stream-focus.log`: **1/1 pass**, visible LM Studio streaming progress.
- `agent-connect-focus.log`: **1/1 pass**, successful connection saves available model.
- `blender-share-focus.log`: **1/1 pass**, identical pieces share a mesh.
- `drawing-precision-owned-idb.log`: **1/1 pass**, owned-draft recovery and precision/exported text.
- `owned-draft-browser-focus.log`: **7/9 pass**, **2 fail**. Undercut/profile shift, manufacturing thread, sheet rules, material qualification and selected-body/cut cases passed. **Assembly recovery and gear relationship recovery still fail** waiting for their recovery condition.
- `ui-regression-check-2026-09-28.log`: module/link/source gates passed, **587 modules /1489 source assertions**. These static gates do not clear browser failures.

## Native cluster status (separate from browser CI)

The adjacent native investigation corrected test contracts, not production geometry: a Rib fixture now places its linked Top sketch atY2; reverse hole start offset−10 places the cutter atY10; reverse extrusion offset follows its pull direction. Focused extrusion/native wedge regressions **22/22 passed**; native Rib seed-pattern plus five Hole Wizard cases **2/2 passed**; earlier Rib/Cut/Copy-circle cluster **28/28 passed**.

Only the first expensive HOUSING test was run in isolation with `--wasm-num-compilation-tasks=1`: **exact constant-thickness Shell and Boss-Stop pass,470.694s** (`housing-shell-first-isolated-2026-09-28.log`). The earlier full-CI file-level failure after351s was not reproduced. **The other two expensive HOUSING cases were not run.**

## Scope limits

Desktop Chrome/its CUA surfaces were unavailable when the fresh7.11 bottle was reloaded; its four-step native-valid saved checkpoint remains protected, but thread/STEP/reopen/edit-Undo acceptance is pending. Automated headless browser results do not replace the requested desktop GPU workflow. The ebook reconstruction and complete CI remain unfinished.
