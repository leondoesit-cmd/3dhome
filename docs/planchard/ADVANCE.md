# Planchard ebook — live advance file

Updated: **2026-10-08**. Read this first when resuming; older plans and STOP-HERE files contain superseded status.

## Standing task

Recreate the entire `David Planchard - Engineering Graphics with SOLIDWORKS 2021-SDC Publications (2021).pdf` through human-like, visible desktop Chrome interactions in dark theme. Start each new definition from blank; keep already browser-authored fresh exercise checkpoints. Do not reuse older model definitions, inject model JSON, call internal geometry APIs, or substitute scripts for UI authoring. The latest request explicitly excludes native Computer Use. Browser controls are required. Fix concrete CAD, sketch-plane, UI and performance gaps as encountered; use subagents for source repairs. Keep this file current after each saved/accepted part or task.

The previous usage instruction is to continue toward 3–2% usage remaining, finish the active task and commit work before stopping; check live usage when work resumes. Do not claim the entire book is finished.

## Current location

**Exercise 8.17 Bench Vice — printed page 8-52 / PDF page 430.**

**BV01 base accepted 2026-10-08.** Saved library key `cm_musrulf4`, name `Planchard 8.17 - BV01 Base - fresh designer example 2026-10-03`. Eight features/16 fully-defined sketch/history steps, one native solid,176×66×70mm. Nose passage and four foot holes completed through browser UI. Exact volume198.69716711709407cm³, mass1.529968kg at Alloy Steel reference7.70g/cm³. Driving edit/Undo/Redo/cold library reopen passed. Actual editable bundle and STEP protected; independent recipe/STEP validations passed. See `bench-vice-8.17-BV01-acceptance-2026-10-08.md`. Remaining vice parts and assembly are unfinished.

Protected Chrome recovery export: `artifacts/planchard/BV01-base-retention-checkpoint-browser-2026-10-03.mforge`. It predates removal of an empty sketch and final material assignment. Preserve that distinction when recovering from export instead of the saved library. Detailed evidence: `bench-vice-8.17-browser-checkpoint-2026-10-04.md`. Frozen geometry/interface and part quantities: `bench-vice-8.17-design.md`.

### Next exact actions

1. Reconnect browser controls in desktop Chrome at `http://localhost:8765/`, preserve saved site storage and dark theme. BV01 is accepted; preserve its final bundle/STEP and library entry.
2. **BV02 also accepted** (`bench-vice-8.17-BV02-acceptance-2026-10-08.md`), named `Planchard 8.17 - BV02 Base Plate - fresh designer example 2026-10-08`; one solid20×12×90mm,20.77891334405777cm³, source props/material and driving edit/Undo/Redo/cold reopen/native exports passed. Next BV03 movable jaw from blank: carriageX70..110/Y12..20/Z±28, uprightX96..110/Y20..66/Z±28, tongueX72..108/Y-0.2..12/Z±7.8; Ø20.2 nut boreX96..110 atY34/Z0 and Ø6.6 keeper holesX80/90 alongY. Then BV04..BV10 per frozen design, all from blank/browser UI.
3. Perform driving edit/Undo/Redo/cold reopen, actual bundle/STEP and independent audit for each part. Create16-occurrence assembly, check4mm/rev guided screw with0..50mm travel, native clearances/mates, ANSI A landscape third-angle exploded drawing/BOM/balloons. Disclose designer dimensions, missing companion parts/AVI, ideal threads and book artwork title discrepancy.
4. Continue8.18 Kant-Twist Clamp(8-53/PDF431),8.19 Arbor Press(8-54/PDF432),8.20 Shaper Tool Head(8-55/PDF433), then reconcile earlier/later uncertainties in `remaining-book-audit-2026-10-03.md`.

## Latest accepted work

| Exercise | Printed / PDF | Accepted evidence |
|---|---|---|
|8.14 Double Pulley|8-49 /427|`double-pulley-8.14-browser-progress-2026-10-03.md`;28 occurrences,30 mates,1 physical DOF; protected native/export/drawing evidence|
|8.15 Welder Arm|8-50 /428|`welder-arm-8.15-final-acceptance-2026-10-03.md`;18 occurrences,23 topology mates,4 physical DOF, native motion and ANSI C sheet; commit`fba69cd`|
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
<!-- Resume note: 2026-10-08, current chat 01a119fd-60d8-72e3-8664-af800e15d372 -->
## Earlier interrupted session status — 2026-10-08 (superseded below)

Caught up through the previous chat's committed checkpoint `b14f5ed` (startup recovery and sketch-center coordinate editing). Repository contents and PDF could not be freshly inspected in this session: PowerShell process creation failed with `helper_unknown_error: setup refresh had errors`; Node and browser runtimes exited before initialization. The requested UI subagent independently confirmed the same blocker. No new geometry, UI repairs, or test passes are claimed for this session.

Resume remains Exercise **8.17, printed 8-52 / PDF page 430**. Open the saved BV01 Base in desktop Chrome at `http://localhost:8765/`, preserve browser site storage, and use Chrome dark theme. Author models through visible browser controls; the current user explicitly excludes native computer use and script-only model creation.

Next: finish BV01's Ø4.2 mm nose passage (X8/Z0, Y42.2..44), four Ø6 mm blind foot holes (X30/146, Z±25, Y0..4), source properties and final export/cold-reopen audit; then author BV02–BV10 and the sixteen-occurrence vice assembly per `bench-vice-8.17-design.md`. Verify screw motion, native solids and exports; produce the book's ANSI A landscape third-angle exploded drawing, lines, BOM, balloons and title properties. Continue remaining-book tracking below. Exercise 8.16 is complete according to the prior protected acceptance reports; 8.17 and the rest of the book remain unfinished.

First recover the Codex local runtime/browser connection, then read this file and current git status before resuming. A restart was already requested in the prior chat; this new session still exhibits runtime startup failures. Update this advance file after each accepted modeling milestone and each app repair with evidence and next action.

## Active browser continuation — 2026-10-08

Local shell and browser controls recovered in this chat. Read current Git history through `b14f5ed`; only this advance file was initially modified. Freshly rendered and visually inspected PDF430/printed8-52 from the user's actual Downloads PDF. Exercise asks for original parts, proper assembly movement, and ANSI A landscape third-angle exploded drawing with lines/BOM/balloons; companion dimensions remain unavailable.

Desktop Chrome browser-only extension controls connected; no native Computer Use actions. Chrome tab `710861699` at `http://localhost:8765/` displays the dark app and working WebGL model editor. Local relay launched outside restricted-network sandbox after restarting only our verified server process; logs `scratch/planchard/relay-2026-10-08.*.log`. Opened existing BV01 library entry through visible UI: 12 history steps (six features and six fully-defined sketches), one native solid, 176 × 66 × 70 mm. Exact rebuild initially computing. No new geometry accepted yet.

UI subagent `/root/ui_current` is fixing plane-local coordinate labels and constraint-aware edits for points, line endpoints, and ellipse centers. Parent owns this advance file. Next action remains BV01 nose passage, then foot holes, properties and acceptance/export, followed by BV02–BV10 and assembly. Browser click calls can time out after dispatch while their action succeeds; inspect fresh DOM before retrying to avoid double actions.

### Milestone: BV01 nose passage saved

Browser authored Ø4.2 circle at Top U8/V0 with driving diameter and fixed center, offset42.2mm; Blind Extrude Cut depth1.8mm Along normal. Fresh tree/status:14 steps/seven features, all sketches fully defined, Rebuild succeeded, Native solids1. Saved via library control. Remaining: four Ø6 holes, properties, driving edit/undo/reopen and actual native exports. Precision-circle commands had been omitted from both visible pro ribbon and UIKit catalog; UI agent repaired both plus old saved-layout migration. Hard reload verified visible Dimensioned circle and the actual form/application works.

Full unit run logged4091 tests,4052 pass,39 failures; no clean-suite claim. UI agent triages stale source/VM fixtures and environment failures. Separate `/root/rotary_gap` agent confirmed malformed rotary pivot errors were ignored by seek/incremental callers and is fixing success/rollback behavior. Do not confuse these test failures with model acceptance.

### Milestone: BV01 complete geometry and properties saved

Four Top circles Ø6 at U30/146,V±25, all fixed centers/driving diameters, offset0; one Blind Extrude Cut4mm Along normal. Eight features/16 history steps, one native solid,176×66×70mm. Added PartNo BV01,Description,Source PDF430/8-52,OriginalDesignerExample,BookItemNo1,BookMaterial and RetentionRepresentation through Custom props UI. Saved library.

Exact mass panel:198.6972cm³,1.529968kg,7.70000g/cm³ Alloy Steel reference; COM X95.20954,Y18.38893,Z approximately0mm. Driving one foot diameter6→7mm updates volume198.6563cm³ (delta≈0.0409cm³, analytic expected0.0408407cm³ within display rounding). Undo→Redo→Undo exercised through visible controls; final nominal restoration/reopen/export still to verify. Export milestone pending; geometry is not final acceptance yet.

### BV01 accepted and BV02 underway

Commit `232a298` protects BV01 final bundle/STEP, two browser proof images, independent native audit JSON and detailed acceptance report. Cold library reopen confirmed nominal volume/mass and16 steps. Source/UI fixes and original failure triage included; source gates and focused corrected tests passed, but full suite not rerun clean. Queue reconciled accepted8.14–8.16; corrected Welder Arm23 topology mates from actual final bundle.

BV02 now authored from blank in visible Chrome: Top fixed-center20×90mm rectangle, offset-12mm, Blind boss12mm Along normal. Second Top sketch offset-12mm with fixed-center drivingØ6.6 atU0/V±25, Through all Along normal. Two features/four fully-defined history steps, one native solid. Alloy Steel reference applied. PartNo BV02,Description,Source,BookItemNo2,BookMaterial,OriginalDesignerExample saved. Exact mass/parametric/Undo/reopen/export acceptance still in progress; not accepted yet. Future remains BV03–BV10/16-occurrence vice and drawing, then8.18–8.20 and earlier/later unfinished audit items.
