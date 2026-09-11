# 3D planning and as-built surveys: implementation and validation

Implemented locally on 11 September 2026. Existing uncommitted UI work was retained. No deployment or app-store publication was performed. This is a substantial implementation of the accepted plan, but **full acceptance is not complete**; see the remaining work below.

## Using the implementation

See the [English/Hebrew quick start](survey-quick-start.md) for the user workflow.

Select **3D** to edit with the existing planning tools. The viewport has **Orbit / Walk**, **Look / Build** and first/third-person controls. Split view uses the last active viewport. Open **As-Built Survey** beside the view buttons for property missions or one of four practice documents. Practice has a **Return to my property** action that restores the original document, view, selection and edit history.

Survey observations retain their source, reference, status, target and original values. Geometry corrections have a preview and apply with their observation in one undo step. Navigation diagnostics use the selected virtual walker; they do not widen doors, snap measured geometry to a tile grid or rescale the property.

## Implemented components

- Shared planner controller and independent 3D world-coordinate adapter, projected previews and constraint picking, shared tool chrome, gesture cancellation and draft preservation across views.
- Saved navigation profile, first/third-person editing, physical wall/door/obstacle/beam/ceiling/void queries, stair support and floor-relative movement, camera obstruction rays and smooth recovery, temporary reachable-area overlays.
- Seven survey mission stages, manual readings and photos, stale-evidence detection, target highlighting, correction preview, pause/reorder/skip/checkpoints and four isolated practice scenarios.
- Canonical measured points, polylines and planar faces for site/roof evidence; 3D rendering, SVG/DXF export and printable plans/elevations/evidence reports. Coordinate forms support exact creation/editing; 3D vertex handles provide detached, grid-aware edits within measured planes, including one-step undo, cancellation and layer/role locks.
- Versioned survey persistence, autosave and undo integration, stable floor references, local photo storage outside undo snapshots and bounded peer photo transfers.
- Stable browser corner capture, optional plane observations, tracking-loss recovery, retake/undo and interrupted-capture review. Two-reference rigid alignment and complete shared-wall/opening reconciliation retain the original scan and stop on conflicts.
- Version 1 `.mfsurvey.json` import/export with units, rigid transforms, geometry, observations, settings and embedded photos. Existing RoomPlan JSON remains supported.
- Explicit offline asset preparation, local service-worker caching, and optional HTTPS configuration for the relay.
- SwiftUI/RoomPlan and Kotlin/ARCore capture companions with manual readings, photos, review, local recovery and system-share export. Native multiroom captures retain separate source rooms for browser alignment.

See [exchange format](survey-exchange.md), [offline and HTTPS](survey-offline-https.md), and [native setup](../native/README.md).

## Tool coverage checklist

`PLANNER_TOOL_COVERAGE` in `js/planner_input.js` contains the pointer-tool registry. `tests/planner_tool_parity.browser.mjs` compares resulting canonical geometry from the real 2D event handler and the 3D input adapter, including positive mutation checks.

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

Continuation checks include 36 real-GPU cases across the tool registry, room shapes, layers and six direct navigation/editing flows; browser offline reload and quota/transfer recovery tests; and Android emulator manual, recovery, failed-write, permission-denial and share tests in English/Hebrew. The commands for the GPU cases are:

```sh
MF_BROWSER_GPU=1 node --test --test-concurrency=1 tests/planner_tool_parity.browser.mjs tests/room_shapes.browser.mjs tests/layers.browser.mjs tests/survey_gpu.browser.mjs
node --test tests/survey_storage.browser.mjs tests/survey*.test.mjs
```

The GPU option starts visible Chrome with hardware rendering, using isolated test profiles. Ordinary CI keeps its existing headless layout checks; the six GPU-only cases are run separately.

- `npm run check`: passes free-identifier analysis, all 444 linked modules and 1,392 source assertions.
- Full `npm test`: **2,242 passed** in the latest CI run.
- Focused run: **55 passed**, comprising 21 survey/navigation/photo data checks and **34 browser cases**: 19 registry comparisons, 10 survey/practice/correction/layout/tracing tests, and 5 browser AR tests. The expanded ten-case workflow suite passes, including room/centre-line corrections, numeric-entry preservation and floor transitions. Mobile layouts include 390 px English, 390 px Hebrew and 717 px Hebrew.
- Browser correction test verifies detached previews and geometry/evidence rollback in one undo step. Practice verifies restoration of the user's original model and history.
- A real browser with GPU rendered the practice room, created a canonical wall directly in 3D, and switched to walking editing. No browser warnings/errors were reported during that check. The continuation also passes the 36 GPU cases above, including registry comparisons in 2D, orbit and walk; this is not exhaustive field acceptance.
- Android `assembleDebug` succeeded with SDK 35, Gradle 8.9 and the Android Studio JDK. The project includes a Gradle wrapper.
- iOS compiles and links for simulator and unsigned device with Xcode 27.0 / iOS 27 SDK (deployment target iOS 17). Three native recovery/validation/export tests and four English/Hebrew UI test executions across iPhone and iPad simulators pass; the Swift export also passes the browser importer with its measurement and photo intact.
- `git diff --check` passes.

**Current validation:** source checks and all **2,242 unit tests** pass. The full browser run completed with **476 passed, 2 failed and 6 GPU-only skips**. The failures were panel-reload persistence during layout motion and touch-target sizing during a transition. Follow-up changes wait for panel motion before dragging and prevent touch-target height transitions. A further markup-baseline race was traced to a queued project-guide refresh and corrected in test setup. Full CI is not claimed green after these follow-up changes; the affected docking/customization suites pass all **67 tests** in the final rerun.

The browser suite includes the repaired panel gestures, floating persistence, room-side resize, current customization controls and fresh-document isolation for responsive tests. These automated checks do not replace the remaining real-GPU and physical-device acceptance work below.

## Continuation changes

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

## Remaining implementation and acceptance work

- Exhaustive real-GPU testing of all inspector/constraint/shape/tracing operations in both orbit and walk, numeric entry during view changes, cancellation, permissions and undo. The registry comparison validates shared dispatch, not every 3D picking/occlusion case.
- Complex constraint overlays currently use projected labels/symbols; they do not reproduce every 2D annotation graphic. Site/roof vertices now have direct 3D drag handles; exact coordinates and elevations remain available in the survey editor.
- Correction previews support straight-wall interior and centre-line lengths, supported rectangular-room width/depth changes, and scalar wall/opening/item/point fields. Curved-wall and underdetermined adjustments request more measurements instead of solving a general survey network. Partial shared-wall overlap is detected and blocks import; automatic reconciliation of those overlaps is not implemented.
- Camera collision uses multiple rays and clearance margins, not a swept camera volume. Stair landing transitions and floor-model preservation now have automated checks; real-GPU tests now cover stationary camera recovery, profile-dependent doorway movement, numeric-entry suppression, touch movement at a void, and climbing a full stair flight through its upper landing. Complex building combinations still need field acceptance.
- Offline reload, quota failure, incomplete cache updates, slow/out-of-order photo transfers, conflicting duplicates and replacement-peer retries now have automated coverage. Long field sessions and device-specific storage eviction remain physical-device acceptance items.
- Native captures are implementation builds, not release-validated applications. iOS SDK compilation now passes. Both platforms still need supported/unsupported physical devices, interruption and multiroom tests, English/Hebrew layout review and independently measured accuracy trials. No physical-device capture errors have been measured or claimed.

The native device test protocol is in `native/README.md`. Device accuracy results must record actual measurements and errors, not advertised sensor accuracy.
