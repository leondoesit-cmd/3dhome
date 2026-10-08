# Planchard ebook — live advance file

Updated: **2026-10-08**. Read this first when resuming; older plans and STOP-HERE files contain superseded status.

## Standing task

Recreate the entire `David Planchard - Engineering Graphics with SOLIDWORKS 2021-SDC Publications (2021).pdf` through human-like, visible desktop Chrome interactions in dark theme. Start each new definition from blank; keep already browser-authored fresh exercise checkpoints. Do not reuse older model definitions, inject model JSON, call internal geometry APIs, or substitute scripts for UI authoring. The latest request explicitly excludes native Computer Use. Browser controls are required. Fix concrete CAD, sketch-plane, UI and performance gaps as encountered; use subagents for source repairs. Keep this file current after each saved/accepted part or task.

The previous usage instruction is to continue toward 3–2% usage remaining, finish the active task and commit work before stopping; check live usage when work resumes. Do not claim the entire book is finished.

## Current location

**Exercise 8.17 Bench Vice — printed page 8-52 / PDF page 430.**

BV01 base is in progress. Saved browser library key: `cm_musrulf4`; name: `Planchard 8.17 - BV01 Base - fresh designer example 2026-10-03`. Six finished features: bed, merged front pedestal, merged fixed jaw, through-bed slot, Ø20.2 Right-datum journal bore with 16 mm blind depth, Ø6 Top-datum retention bore at X8/Z0 and Y44 with 14 mm blind depth. UI reported one native solid and 176 × 66 × 70 mm bounds. The cleaned history and whole-body Alloy Steel density 7.70 g/cm³ were saved before reload.

Protected Chrome recovery export: `artifacts/planchard/BV01-base-retention-checkpoint-browser-2026-10-03.mforge`. It predates removal of an empty sketch and final material assignment. Preserve that distinction when recovering from export instead of the saved library. Detailed evidence: `bench-vice-8.17-browser-checkpoint-2026-10-04.md`. Frozen geometry/interface and part quantities: `bench-vice-8.17-design.md`.

### Next exact actions

1. Reconnect browser controls, inspect desktop Chrome at `http://localhost:8765/`, verify dark theme, and open the saved BV01 library entry. Inspect it before editing.
2. Use Sketch → Dimensioned circle on Top: U8/V0, diameter4.2 mm, fixed center, sketch offset42.2 mm; blind cut1.8 mm along+Y for the retention nose passage.
3. New Top sketch at offset0: four fixed-center Ø6 mm circles at U30/146, V±25; blind cut4 mm along+Y. Verify profiles/cut extent and one connected native solid.
4. Add source/custom properties, perform driving-dimension/undo/reopen acceptance, export actual native bundle and STEP, preserve proof and read-only native audit. Replace the partial checkpoint only with documented final evidence.
5. Build BV02..BV10 from blank, then the sixteen-occurrence vice assembly. Check 4 mm/rev guided screw movement with 0..50 mm travel, native clearance and mates; create ANSI A landscape third-angle exploded drawing with BOM/balloons. Disclose designer dimensions, missing companion parts/AVI, ideal thread representation, material proxies and the book image's ARBOR PRESS title discrepancy.
6. Continue Exercise8.18 Kant-Twist Clamp (8-53/PDF431),8.19 Arbor Press (8-54/PDF432),8.20 Shaper Tool Head (8-55/PDF433), then reconcile earlier/later unfinished rows in `remaining-book-audit-2026-10-03.md` against their newer detailed reports.

## Latest accepted work

| Exercise | Printed / PDF | Accepted evidence |
|---|---|---|
|8.14 Double Pulley|8-49 /427|`double-pulley-8.14-browser-progress-2026-10-03.md`;28 occurrences,30 mates,1 physical DOF; protected native/export/drawing evidence|
|8.15 Welder Arm|8-50 /428|`welder-arm-8.15-final-acceptance-2026-10-03.md`;18 occurrences,26 mates,4 physical DOF, native motion and ANSI C sheet; commit`fba69cd`|
|8.16 Radial Engine|8-51 /429|`radial-engine-8.16-browser-progress-2026-10-03.md` final sections;55 connected valid solids,14 definitions,75 mates,1 physical DOF; actual Chrome full-cycle Play,25 sampled clearances, corrected annular piston, ANSI C exploded sheet; commit`12c88eb`|

Earlier brief/plan claims that these exercises have not started are stale. Earlier chapters still have reconciliation items; this table does not certify all earlier work.

## App/source reconciliation on 2026-10-08

- Last committed checkpoint: `439cf46` (six-feature BV01 recovery export, dimensioned-circle UI, screw handedness, pending rebuild GPU retention, accurate remembered-plane coach;15 focused tests and gates passed).
- Other coder's uncommitted startup changes are in `index.html`, `js/main.js`, `js/planner_chrome.js`, `tests/boot_guard.test.mjs`: withhold initial app chrome until both boot entry points finish, reveal fatal errors, await optional UIKit adoption. Preserve these changes.
- Explicitly requested UI subagent found circle/arc center inspector fields labeled X/Y on all planes and fixed-center edits snapping back. Its narrow repair uses Center U/V, updates fixed anchors and rolls back edits rejected by other constraints. Twelve combined circle/boot tests passed; module/link gates passed (639 modules), and1490 source assertions passed. Browser QA remains pending.
- No further BV01 geometry was authored on 2026-10-08. New source fixes do not constitute browser acceptance.

## Browser runtime interruption

Browser-only CUA startup failed with `helper_unknown_error: setup refresh had errors`. Local logs identify OS error32 while opening the Codex `cua_node/.../bin/node_repl.exe` runtime for normal read/execute validation. Sandbox bookkeeping was22 bytes but not all-zero; it was not moved or edited. Supported runtime resets failed. At the user's request to fix it, root stopped only two verified stuck browser-runtime helper processes. The current browser transport then closed; normal sandbox execution still failed. The latest log identifies another locked runtime file, `@oai/sky/bin/windows/swift/x64/VCRUNTIME140_1.dll`. Reconnect through a fresh Codex app session and inspect the latest setup error before any more repairs. Security/permission settings were not changed. Do not use native Computer Use or internal/scripted model authoring as a workaround.

## Tabs and durability

Completed exercise exports survive closing their CAD tabs. BV01's saved library checkpoint survives closing its tab; keep the Chrome profile/site storage, or recover the protected partial bundle and reapply its documented later edits. Unrelated tabs have not been audited. Save/export any new work before closing tabs. Keep this file and all acceptance evidence in Git checkpoints.
