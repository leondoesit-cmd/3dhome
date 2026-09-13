# 3D planning and as-built surveys: implementation and validation

Implemented locally on 11–12 September 2026. Existing uncommitted UI work was retained. No deployment or app-store publication was performed. This is a substantial implementation of the accepted plan, but **full acceptance is not complete**; see the remaining work below.

## Using the implementation

See the [English/Hebrew quick start](survey-quick-start.md) for the user workflow.

Select **3D** to edit with the existing planning tools. The viewport has **Orbit / Walk**, **Look / Build** and first/third-person controls. Split view uses the last active viewport. Open **As-Built Survey** beside the view buttons for property missions or one of four practice documents. Practice has a **Return to my property** action that restores the original document, view, selection and edit history.

Survey observations retain their source, reference, status, target and original values. Geometry corrections have a preview and apply with their observation in one undo step. Navigation diagnostics use the selected virtual walker; they do not widen doors, snap measured geometry to a tile grid or rescale the property.

## Implemented components

- Shared planner controller and independent 3D world-coordinate adapter, projected previews and constraint picking, shared tool chrome, gesture cancellation and draft preservation across views.
- Saved navigation profile, first/third-person editing, physical wall/door/obstacle/beam/ceiling/void queries, stair support and floor-relative movement, continuous camera-sphere collision and smooth recovery, temporary reachable-area overlays.
- Seven survey mission stages, manual readings and photos, stale-evidence detection, target highlighting, correction preview, pause/reorder/skip/checkpoints and four isolated practice scenarios.
- Canonical measured points, polylines and planar faces for site/roof evidence; 3D rendering, SVG/DXF export and printable plans/elevations/evidence reports. Coordinate forms support exact creation/editing; 3D vertex handles provide detached, grid-aware edits within measured planes, including one-step undo, cancellation and layer/role locks.
- Versioned survey persistence, autosave and undo integration, stable floor references, local photo storage outside undo snapshots and bounded peer photo transfers.
- Stable browser corner capture, optional plane observations, tracking-loss recovery, retake/undo and interrupted-capture review. Two-reference rigid alignment and complete shared-wall/opening reconciliation retain the original scan and stop on conflicts.
- Version 1 `.mfsurvey.json` import/export with units, rigid transforms, geometry, observations, settings and embedded photos. Existing RoomPlan JSON remains supported.
- Explicit offline asset preparation, local service-worker caching, and optional HTTPS configuration for the relay.
- SwiftUI/RoomPlan and Kotlin/ARCore capture companions with manual readings, photos, review, local recovery and system-share export. Native multiroom captures retain separate source rooms for browser alignment.

See [exchange format](survey-exchange.md), [offline and HTTPS](survey-offline-https.md), and [native setup](../native/README.md).

## Tool coverage checklist

`PLANNER_TOOL_COVERAGE` in `js/planner_input.js` contains the pointer-tool registry. `tests/planner_tool_parity.browser.mjs` compares resulting canonical geometry from the real 2D event handler and the 3D input adapter, including positive mutation checks. `tests/planner_pointer_coverage.browser.mjs` additionally drives actual viewport clicks/drags for all 19 registered tools in both orbit and walk (38 cases), checking selection or the resulting geometry. Wall type application uses a different assembly to verify a real change.

| Registry tool | Adapter comparison |
| --- | --- |
| Selection | Pass |
| Wall | Pass |
| Arc wall | Pass |
| Rectangle room | Pass |
| Preset room | Pass |
| Door | Pass |
| Window | Pass |
| Passage | Pass |
| Floor void | Pass |
| Measured point | Pass |
| Erase | Pass |
| Wall offset | Pass |
| Wall split | Pass |
| Wall cut | Pass |
| Wall join | Pass |
| Wall reverse | Pass |
| Wall type application | Pass |
| Service device | Pass |
| Service route | Pass |

Furniture/stairs placement, transformations, room shape editing, dimensions, constraints, parameters, materials, layers and tracing retain the existing shared command/inspector paths. This does **not** mean every combination has passed a real-GPU orbit and walk test. The separate object-modeling and cabinet workflows were retained.

## Validation performed

The 11 September checks included 36 real-GPU cases across the tool registry, room shapes, layers and six direct navigation/editing flows; browser offline reload and quota/transfer recovery tests; and Android emulator manual, recovery, failed-write, permission-denial and share tests in English/Hebrew. The commands for the GPU cases are:

```sh
MF_BROWSER_GPU=1 node --test --test-concurrency=1 tests/planner_tool_parity.browser.mjs tests/room_shapes.browser.mjs tests/layers.browser.mjs tests/survey_gpu.browser.mjs
node --test tests/survey_storage.browser.mjs tests/survey*.test.mjs
```

The GPU option starts visible Chrome with hardware rendering, using isolated test profiles. Ordinary CI keeps its existing headless layout checks; the seven GPU-only cases are run separately.

- `npm run check`: passes free-identifier analysis, all 445 linked modules and 1,402 source assertions.
- Full `npm test`: **2,260 passed** on 12 September in the isolated validation snapshot.
- Full `npm run test:browser`: **484 passed, 0 failed, 7 GPU-only skips** on that snapshot.
- Focused run: **55 passed**, comprising 21 survey/navigation/photo data checks and **34 browser cases**: 19 registry comparisons, 10 survey/practice/correction/layout/tracing tests, and 5 browser AR tests. The expanded ten-case workflow suite passes, including room/centre-line corrections, numeric-entry preservation and floor transitions. Mobile layouts include 390 px English, 390 px Hebrew and 717 px Hebrew.
- Browser correction test verifies detached previews and geometry/evidence rollback in one undo step. Practice verifies restoration of the user's original model and history.
- A real browser with GPU rendered the practice room, created a canonical wall directly in 3D, and switched to walking editing. No browser warnings/errors were reported during that check. The continuation also passes the 36 GPU cases above, including registry comparisons in 2D, orbit and walk; this is not exhaustive field acceptance.
- Android `assembleDebug` succeeded with SDK 35, Gradle 8.9 and the Android Studio JDK. The project includes a Gradle wrapper.
- iOS compiles and links for simulator and unsigned device with Xcode 27.0 / iOS 27 SDK (deployment target iOS 17). Three native recovery/validation/export tests and four English/Hebrew UI test executions across iPhone and iPad simulators pass; the Swift export also passes the browser importer with its measurement and photo intact.
- `git diff --check` passes.

**Current validation (12 September, camera continuation):** `npm run ci` passes on commit `37c8ca0` plus this task's survey/import, camera, stacking, touch-style and test changes: source checks (445 modules), **2,260 unit tests**, and **484 browser tests** with seven intentional GPU-only skips. The browser stage took 491 seconds. A separate real-GPU run passes **33 tests** across planner parity, furniture movement and survey/navigation.

Validation used a separate worktree because unrelated model-editor files were being edited concurrently in the shared checkout. Those edits and `scratch/` were preserved. The task's files matched the tested copy except for additional concurrent ceiling/shadow edits in `view3d.js`; the camera code itself was retained. After reviewing that difference, all **seven camera/navigation GPU cases** and source checks (**446 modules**) also passed in the combined shared checkout. Full CI is not a validation claim for all unrelated concurrent CAD changes.

No iPhone/iPad work was performed in this continuation. No Android device was connected, so physical capture accuracy remains untested. The earlier native and broader room/layer GPU results above were not rerun today.

The browser suite includes the repaired panel gestures, floating persistence, room-side resize, current customization controls and fresh-document isolation for responsive tests. These automated checks do not replace the remaining real-GPU and physical-device acceptance work below.

## Held-furniture split validation (12 September 2026)

- **Full CI passed in the shared checkout**: **2,366 unit tests**, **508 browser passes**, zero failures, and seven GPU-only skips (515 browser cases). Source checks passed across 450 linked modules and 1,402 assertions. This run includes the concurrent workspace changes; no isolated copy was used for this continuation.
- Dedicated real-GPU merge suite: **6 passed**. The constrained English desktop/Hebrew phone cases now include held furniture: attachment rehosting preserves position/gap/side, reseating moves nothing, and one Undo restores the complete document including items.
- Final focused survey/room checks: **61 passed**. Four added cases cover live item identity, rotated footprints on oblique walls, straddling/unmeasured/invalid/locked attachments, and locked items whose unchanged first-section host needs no edit.
- Visually inspected the Hebrew phone preview with a dashed held-furniture footprint. Final free-identifier/link/source-assertion and whitespace checks passed. No iPhone/iPad, physical-device capture, deployment or publication work was performed.
- Logs: `/tmp/survey-held-ci.log`, `/tmp/survey-held-final-check.log`, `/tmp/survey-held-tests.log`, `/tmp/survey-held-gpu.log`; inspected preview: `/tmp/survey-held-he.png`.

Furniture crossing a proposed cut, missing footprint measurements, invalid attachment settings or a required locked-attachment reassignment still needs review. Whole-wall/opening-relative constraints and curved-wall reconciliation remain outside automatic splitting.

## Constraint-preserving split validation (12 September 2026)

- **Full CI passed** in an isolated checkout based on `37c8ca0` plus the survey changes and previously validated browser/stacking fixture fixes: **2,271 unit tests**, **490 browser passes**, no failures, and six GPU-only skips. Source checks cover 445 linked modules and 1,402 assertions. The copied-file inventory is `/tmp/survey-constraints-snapshot-files.txt`.
- Dedicated real-GPU merge suite: **6 passed**, both in the shared checkout and in the isolated copy. English desktop and Hebrew phone cases cover endpoint dimensions, room requirements, solver stability without geometry movement, evidence preservation and one-step undo.
- Focused survey/room tests: **57 passed**, including legacy and stable endpoint anchors, unrelated constraints, blocked whole-wall/opening/rectangle relations, exchange round-trip, straight-edge subdivisions and irregular-room minimum widths.
- The isolated survey implementation/test files matched the shared workspace byte-for-byte. Concurrent model-editor/kernel changes were excluded from this full-CI result. The shared checkout's earlier unit attempt had four unrelated model reconstruction/migration failures; it is not claimed as a clean full-CI snapshot. The temporary worktree was removed after validation.
- Logs: `/tmp/survey-constraints-isolated-ci.log`, `/tmp/survey-constraints-isolated-gpu.log`, `/tmp/survey-constraints-unit.log`, `/tmp/survey-constraints-gpu.log`; shared attempt: `/tmp/survey-constraints-ci.log`.

No iPhone/iPad work, device capture, deployment or publication was performed. General whole-wall constraint remapping, opening-relative constraints on split hosts, affected rectangular-room drivers and held furniture remain review cases.

## Existing-wall split continuation validation (12 September 2026)

- Final focused survey tests: **38 passed**, including seven split-specific domain cases.
- Full browser suite: **491 passed, 0 failed, 7 GPU-only skipped** (498 cases). Dedicated real-GPU scan merge suite: **4 passed** across English desktop and Hebrew phone layouts, including complete undo, opening/service positions, retained room names, unresolved original readings and refusal to apply a former full-span measurement to one fragment.
- Visually inspected the Hebrew phone preview: amber cut markers, green reused sections, grey untouched sections, existing opening outlines, recheck notice and reachable import controls.
- Source checks passed at 449 linked modules and 1,402 assertions. Final import/free-identifier checks and whitespace checks passed after the presentation/evidence additions. Offline inventory includes the new split-preparation module.
- Repository CI initially stopped at an old cone-recipe source assertion after concurrent model-editor changes. Updated its assertions to the actual kernel calls; all 14 tests in that group passed. The repeated full unit run reported **2,329 passes and one partial-revolution failure** (2,330 tests). The concurrently updated implementation then passed all 12 tests in the affected group. A complete unit run was not repeated after that concurrent fix; no clean full-CI claim is made for this shared checkout snapshot.
- Logs: `/tmp/survey-split-ci.log`, `/tmp/survey-split-unit-full.log`, `/tmp/survey-split-check.log`, `/tmp/survey-split-browser.log`, `/tmp/survey-split-gpu.log`, `/tmp/survey-split-unit.log`, `/tmp/survey-split-model-check.log`, `/tmp/survey-split-concurrent-recheck.log`.

No iPhone/iPad or physical-device capture work was done. Splitting is limited to unlocked straight walls without plan constraints or held furniture. Cuts through opening clearances, unlocated services, ambiguous hosts and curved geometry remain review cases. Existing endpoints and observed dimensions are not widened, rounded or rescaled.

## Scan merge continuation validation (12 September 2026)

Validated in the shared working checkout, preserving concurrent model-editor changes:

- Final source checks pass: 446 linked modules and 1,402 source assertions.
- Full `npm run ci`: 2,311 unit tests passed; browser run had 486 passes, one failure and seven GPU-only skips. The failure was an outdated selection fixture pressing B after the concurrent editor change made P the Paint shortcut. Updated the fixture to P without changing the editor; its complete ten-test browser group then passed. The full CI command was not repeated after that fixture correction.
- Final focused survey tests: 31 passed, including six new segmented-wall/topology cases.
- Two new merge browser cases pass in both the full browser run and a separate real-GPU run: desktop English and 390px Hebrew. They exercise preview isolation, height-conflict blocking, shared-room topology, original capture retention and one-step undo. Visually inspected the Hebrew phone preview; selected scan walls stay purple so red is reserved for conflicts.
- Full-run log: `/tmp/survey-merge-ci.log`; final source checks: `/tmp/survey-merge-final-check.log`; focused tests: `/tmp/survey-merge-unit.log`; GPU cases: `/tmp/survey-merge-gpu.log`; corrected editor fixture: `/tmp/survey-merge-selection-recheck.log`.

No iPhone/iPad or physical Android capture work was performed in this continuation. Existing-wall splitting and opening-junction reconciliation remain explicit review cases; these tests do not claim physical scan accuracy.

## Continuation changes

- Survey splits now preserve held furniture when its rotated footprint fits on one resulting wall section. Rehosting changes only the wall reference; item identity, pose, gap and side remain intact. Locked attachments are retained without edits or block reassignment. Straddling/unmeasured footprints and invalid attachment settings stop the merge. Dashed footprints appear in the bilingual preview. Four added domain cases and the English/Hebrew GPU solver/undo cases cover oblique walls, rotation, attachment reseating and preservation.

- Added support for corner endpoint constraints and room area/minimum-width checks during survey wall splits. Legacy anchors and stable vertex owner hints follow the original physical endpoints; room checks follow the new boundary key. Unrelated known constraints are retained. Unsupported whole-wall/opening relations, rectangle drivers and malformed anchors still block the merge. Exchange round-trip and real-GPU solver/undo cases verify the supported references.
- Fixed minimum-room-width analysis to ignore collinear wall subdivisions in its temporary measurement polygon. It preserves the measured model and still detects irregular-room pinches. Corrected a missing callback closure in concurrently edited model-editor inertia rendering so source validation could continue.

- Added detached splitting of unlocked straight existing walls at aligned scan endpoints. Amber preview markers and the final summary identify cuts. Opening/service IDs and world positions survive, room names and identities are rekeyed, and original wall observations retain their values and geometry while becoming unresolved. Cached full-wall dimension targets are discarded for new fragments. Old full-span readings retain all fragment references through subsequent splits and cannot resize just the first fragment. Stale previews refuse to apply. Seven domain cases and two added English/Hebrew real-GPU browser cases cover the split, conflicts, evidence retention and complete undo restoration. iPhone/iPad work remains excluded.

- Added segmented scan-wall reuse with uncovered extensions, position-correct opening rehosting, and shared graph-node reuse. Existing walls and original scan evidence remain unchanged. A bilingual preview shows shared walls, existing openings and specific conflict explanations; the importer refuses a stale review if the project changes while photos are stored. Six added domain regressions and two desktop/Hebrew-mobile browser cases cover dimensions, conflicts, connected room detection, retained evidence and single-step undo.

- Fixed stack-cycle protection to compare stable item IDs across refreshed references and reject direct attachment into a cycle. A deterministic regression covers stale references and pre-existing corrupt chains; the combined GPU run passes all 33 camera, movement and planner-tool cases.

- Replaced the third-person camera ray samples with a continuous sphere sweep against mesh faces, edges and vertices. Collision is two-sided and independent of presentation visibility; physical exclusions are respected. A disposable, versioned geometry BVH rejects distant surfaces and avoids repeated triangle scans. World-space checks cover nonuniform transforms and instances, and posed meshes use current vertices. Eight mathematical/mesh regressions and all seven GPU survey cases pass, including a thin measured face between the former rays and profile-dependent clearance without changing its points.

- Stabilized browser fixtures by isolating stacking candidates, waiting for model scenes and saved customization before assertions, and allowing up to 60 seconds for app startup under concurrent test load. Inspector control size/font changes no longer animate through undersized touch states.
- Hardened rigid scan alignment against invalid coordinates/tolerances and preserved furniture orientation when its initial rotation is omitted. Shared-wall reuse preserves reversed door hinges/swing/sliding directions, rejects explicit operation conflicts, and retains existing door details when the scan did not observe them. Six added regression cases keep both source scans and existing geometry unchanged.

- Added direct 3D survey vertex handles with detached previews, measured-plane/grid snapping, lock checks, cancellation and undo.
- Fixed deferred 2D pointer coordinates exposed by the real-GPU wall-cut comparison, and restored 2D numeric/route keys when returning from walking mode.
- Kept the customization drag source visibly marked across host repaints, prevented touch target height transitions, and added explicit scene/guide/layout readiness to browser checks.
- Fixed the milliseconds-to-seconds conversion for walking speed, third-person camera recovery while stationary, and stair landing support at linked floor-opening edges. Headroom checks handle collinear initial roof vertices.
- Made offline updates publish complete cache generations atomically; failed updates retain the previous prepared app.
- Added automatic photo retry with replacement-peer cleanup, progress-based timeouts, conflicting duplicate rejection and storage-failure recovery.
- Hardened Android writes with AtomicFile rollback, bounded photo reads, persistent corner undo and cancellation of stale capture callbacks. Added English/Hebrew emulator validation and native-to-browser export checks.

- Compiled the iOS companion with the installed full Xcode SDK, fixed SwiftUI state declarations and RoomPlan delegate isolation, and guarded cancelled capture callbacks.
- Added native recovery/export tests and localized manual-entry UI tests. Failed saves and undo operations retain evidence; the numeric keyboard has an explicit dismissal control, and measurement types use localized labels.
- Added a reproducible unsigned-device/simulator validation script and checked actual Swift-exported measurements and photo attachments through the browser importer.
- Added the calibrated tracing raster to the 3D floor plane, sharing source pixels and world calibration with 2D without reading its canvas. The overlay honours visibility/opacity and is excluded from model picking, collision and export.
- Preserved raw survey numeric entries, selected measurement field, units, reference and notes while previewing corrections or changing view.
- Added guarded rectangular-room corrections and centre-line wall lengths; expanded detached 3D previews to wall height, hosted openings, furniture bounds and measured points.
- Fixed room-side resizing to ignore motion perpendicular to the handle's allowed axis.
- Fixed native panel handles in customization mode, floating position/size restoration, explicit corner docking and side-by-side panel stretching.
- Added requested-peer validation and expired-transfer recovery to photo synchronization; corrected units and alignment for services on every imported floor.
- Added stair landing floor transitions that wait for floor loading, floor-height recovery when leaving stairs, and a shared saved step count for visible stairs and navigation checks. Practice documents and floor transitions refresh the floor tabs.
- Verified the expanded workflow, including detached correction geometry, fixed-node refusal, preserved measurement entries, and both floor models after a stair transition.

## Supported limits and remaining physical acceptance

- All 19 pointer tools now have real-pointer orbit/walk acceptance cases, alongside the shared geometry comparisons. Additional GPU cases cover Shift corner selection, elevated wall points, cancellation/undo, layers, room shapes, furniture movement, survey numeric entry, tracing, missions and view changes. Arbitrary combinations of imported geometry, constraints, device layouts and occlusion are not an exhaustive test space; field acceptance remains necessary.
- Complex constraint overlays currently use projected labels/symbols; they do not reproduce every 2D annotation graphic. Site/roof vertices now have direct 3D drag handles; exact coordinates and elevations remain available in the survey editor.
- Correction previews support straight-wall interior and centre-line lengths, supported rectangular-room width/depth changes, and scalar wall/opening/item/point fields. Curved-wall and underdetermined adjustments request more measurements instead of solving a general survey network. Incoming straight walls can span complete existing wall segments and extend beyond them. Unlocked straight existing walls can be split in the detached merge preview, preserving opening/service positions and room identity and marking affected readings unresolved. Corner endpoint dimensions and room area/minimum-width checks survive splits; unrelated supported constraints no longer block import. Whole-wall and opening-relative constraints, affected rectangle drivers, locked walls/rooms/layers, held furniture spanning a cut or requiring a locked attachment change, cuts through openings, ambiguous existing hosts and unlocated services still block import for review. General constraint remapping, opening-junction reconciliation and curved-wall reconciliation remain unimplemented.
- Camera collision now sweeps the configured sphere against mesh triangles, including edges and corners. It is only as complete as the scene collision geometry; exotic imported animation (such as per-instance morph targets) and complex building combinations still need acceptance testing. GPU tests cover a thin measured obstruction, profile-dependent camera clearance, stationary camera recovery, doorway movement, numeric-entry suppression, touch movement at a void, and a full stair flight through its upper landing.
- Offline reload, quota failure, incomplete cache updates, slow/out-of-order photo transfers, conflicting duplicates and replacement-peer retries now have automated coverage. Long field sessions and device-specific storage eviction remain physical-device acceptance items.
- Native captures are implementation builds, not release-validated applications. iOS SDK compilation now passes. Both platforms still need supported/unsupported physical devices, interruption and multiroom tests, English/Hebrew layout review and independently measured accuracy trials. No physical-device capture errors have been measured or claimed.

The native device test protocol is in `native/README.md`. Device accuracy results must record actual measurements and errors, not advertised sensor accuracy.

## Site/roof report continuation — 12 September 2026

Printable reports now include two orthographic elevations per canonical survey feature (X/height and Z/height), including roof slopes and site level changes, with centimetre coordinate tables. Y is the height stored in the floor model; these views do not infer compass bearings or rescale measured geometry. Measured points render as visible markers. Invalid feature geometry is omitted through the existing normalization rules. Calculated geometry remains separate from recorded observations.

Reports use the current English/Hebrew language, page direction and date format. Phone layouts stack elevation views and keep coordinate tables within the viewport. The report operation does not modify the project.

Validation: 22 focused survey/report tests passed; two dedicated visible real-GPU browser tests passed (English desktop and Hebrew phone), with screenshots inspected. Full repository CI reached 2,378 unit tests: 2,377 passed and one unrelated CAD draft test failed (`tests/cad_draft.test.mjs:147`, expected a zero-angle rejection). That failure reproduces when the CAD test is run alone and stops CI before its full browser stage. No CAD implementation was changed for this report work. iPhone/iPad work remains excluded.

## Final non-iOS acceptance continuation — 12 September 2026

- Primary Shift clicks now reach the shared planning controller. Camera navigation remains available through the secondary button or Look control.
- Wall-face ray hits are projected onto the host's planning line, with screen-distance corner picking. The separate physical hit retains its actual elevation.
- Measured points placed on 3D wall surfaces retain the picked height in their preview and canonical record, including after view changes and undo.
- Six dedicated real-GPU checks cover Shift selection and elevated points in orbit/walk, plus completed arc draft points and the active mission across Plan/3D/Split/Walk, and detached arc drafts with one-step undo of both host splits.
- The 69-case survey/planner GPU acceptance run passed; the additional 38-case real-pointer registry sweep passed. These verify representative flows rather than every possible geometric combination.
- Android debug assembly passed. English/Hebrew emulator checks passed manual readings, restart recovery, undo, failed-write retry, camera denial and system-share export. The exported JSON passed the planner importer with four recorded values intact. The emulator was shut down after validation.
- Two obsolete CAD test expectations were aligned with the newer, independently tested behavior in the shared checkout: zero draft returns an independent identity, and an unresolved rotated face retains identity without claiming its old plane descriptor. CAD production code was not changed for these test corrections.

No physical Android device was connected. Real AR tracking, sensor accuracy, field interruptions and device-specific storage behavior cannot be release-validated by the emulator. All iPhone/iPad work was excluded.

The final pointer sweep now verifies one-step undo for every modifying registry tool. It exposed and fixed the initial arc point being committed too early: drafts now keep their first point outside canonical geometry until a valid arc is complete, including when both ends split an existing host. Cancel leaves no geometry behind. Reports also explicitly mark floors without saved geometry as incomplete instead of copying the active floor into them.

The full browser sweep also exposed a legacy Model Editor compatibility failure: generated box features referred to absent `xMin`/`zMin` parameters. Conversion now supplies missing derived parameters (and a cylinder's missing `radius`) without replacing existing formulas. The reusable-model lifecycle test passes save/edit, independent instance overrides, undo/redo, reload and import; two cylinder tests verify generated and pre-existing radius formulas. This preserves the separate modeling workflow required by the plan.

Final full-suite fixes also include isolated, normalized starting documents for the drag/command equivalence test; reopening the recovery palette after the shared multi-selection Hide command; and reliable offline asset storage. Offline preparation fully buffers a downloaded asset before writing its response, retries one interrupted download, names failed assets, waits for each batch to finish before failure cleanup, and never replaces the previous complete generation with a partial one. The browser test verifies the complete compressed CAD engine can be read offline; domain tests cover transient downloads, persistent failures and storage failure with the previous generation retained.

## Final validation result

The complete `npm run ci` pipeline finished successfully in the shared checkout: no free identifiers, 458 linked modules, 1,402 source assertions, **2,445 unit tests passed**, and **540 browser tests passed** with no failures. The 51 intentional skips are the GPU-only cases exercised separately. The final browser stage took approximately 450 seconds.

Separate validation passed **63 focused planner/arc/point GPU-browser checks** and **two offline GPU-browser checks**; the earlier 69-case broader GPU survey run also passed. Android debug assembly and English/Hebrew emulator validation passed, and its exported readings round-tripped through the browser importer. `git diff --check` passed. Existing unrelated uncommitted work was preserved; nothing was committed, deployed or published.

Software implementation and automated validation are complete for the supported workflows described above. Physical Android capture accuracy and extended field/device testing remain unavailable without a connected device. iPhone/iPad implementation and validation were excluded from this continuation. No physical sensor accuracy is claimed.
