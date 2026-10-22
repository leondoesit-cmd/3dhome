# Model editor UX implementation

Implemented from `plans/MODEL_EDITOR_UX_PLAN.md`, 10 September 2026. Existing responsive work and unrelated working-tree changes were preserved. This is a local implementation; no deployment or PR was created.

## Delivered

| Plan item | Result |
|---|---|
| T1: color interaction | Viewport colors refresh decorations without rebuilding bodies. Part color redraws coalesce into one animation frame and the whole picker gesture is undoable. |
| T2: decoration cache | Selection stamps belong to individual bodies/components. Hovering B does not recreate A's unchanged selection highlights. Unknown references no longer affect every body. |
| T3: pattern feedback | Merge-off previews flag possible overlap, tint affected copies red, and warn on Apply without blocking it. The bounding-box prefilter is shared with the existing kernel grouping code. Separated copies clear the warning; merge-on keeps its existing exact preview. |
| T4: inspector | Starts collapsed; explicit toggle choices persist. The shared 3D canvas remains in use. |
| T5: chrome | Name and price live in Settings. Desktop workflow and coach share a single row, showing the current step and one suggested action. Save, Close, Undo and Redo retain their places. |
| T6: tab following | Existing automatic Sketch/Features/Assembly behavior retained. Tabs and command search remain available. |
| P2: direct editing | Handle labels are numeric inputs with units in their accessible labels. Tap to edit, or start typing during a drag. Draft has a face-anchored angle handle; circular pattern readouts show angle rather than spacing. |
| P3: empty model | Three translucent, selectable origin planes and labeled Top/Front/Right choices. Welcome is consumed after its first automatic display and can still be reopened explicitly. |
| P4: repair | Tree warning buttons and Enter route through existing diagnostic actions. Surviving ambiguous candidates are selected. A missing reference with stored coordinates gets an amber marker at its last known position and an explanatory note. |
| P5: density | Guided / Standard / Expert presets wrap existing welcome and coach preferences, plus workflow visibility and an icon ribbon preference. Existing uikit customization remains available. |

## Corrections to the plan

- History captures **before** mutation. The color gesture starts one undo entry on its first input; pushing only after the final change would lose the original color.
- Rebuilding a selected group on every refresh would retain the hover performance bug. The implementation compares each group's selection stamp instead.
- Bounding boxes establish **possible** overlap, not exact intersection. The warning explicitly describes the approximation and never invokes the kernel for merge-off previews.
- A deleted face cannot be truthfully highlighted as existing geometry. The repair marker identifies its stored last known location; if the document has no coordinates, the existing reference error and repair form remain the available evidence.
- No additional tab manager or layout-customization system was introduced; those parts already exist.

## Verification

- `npm run check`: passes, including module linking and source assertion checks.
- Initial focused run: 25 browser checks passed for hover, responsive feature forms, commit/cancel, and overlay rails.
- New behavioral tests cover selection-highlight identity, viewport recoloring, overlap bounds, angle handling, and typing during a drag.
- New browser tests cover preference persistence, origin-plane sketching, warning appearance/removal, typed values, and mouse/keyboard repair.
- Full browser sweep: 435 tests, 417 passed. Seventeen failures expected the previous layout or relied on automatic welcome reopening; the affected suites were updated and rerun. The remaining unrelated failure is Night Shift: `zMission` overlaps `zThreat` on a 280×653 cover screen.
- Full Node sweep after updating the Draft assertion: 2,203 tests, 2,201 passed. The two failures were timing-sensitive MCP startup and terrace-solver tests under concurrent browser load; their complete files passed all 15 tests when rerun serially. A prior full run passed 2,202 tests with only the subsequently corrected Draft assertion failing.
- Final combined editor suite: **77/77 passed**, no skips. This reruns desktop density, mobile layout, cabinet editing, responsive forms, viewport rails, sketch/feature rhythm, and all new UX browser tests against the final implementation.
- New focused behavioral suite: **5/5 passed**, including typing during a handle drag and pointer-cancel listener cleanup.
- `git diff --check`: passes.

Real-browser visual review covered the desktop canvas and a phone-sized viewport. Automated tests emulate phone/foldable/desktop sizes, Hebrew/English, and keyboard space. Physical folding, touch accuracy, and actual mobile keyboards still require device testing. The later in-app-browser launch pause was traced to an existing draft-recovery confirmation. Editor launch after reload was verified after answering that prompt; recovery protection remains intact.


## Follow-up: both reported concerns resolved

- Night Shift now groups mission and threat readouts in normal vertical flow. Wrapped mission text cannot cover the threat indicator, and the run statistics clear the top-corner HUD on compact screens. The collision test now covers all eight postures in both English and Hebrew.
- A reproducible mobile drawer bug was fixed: the legacy swipe handler could hide the drawer while the mobile shell still considered it open. Shared class changes now clear that stale state, backdrop, and expanded button state. The next Add tap opens the drawer immediately, including when dismissal and reopening happen before the observer runs.
- A new browser regression test starts from a reloaded page with a saved Tree tab, dismisses the Add drawer by swipe, reopens it, checks the editor button's hit target, and launches the editor. It failed before the fix and passes afterward.
- Verification: 11 focused checks passed (four browser tests and seven Night Shift unit tests), with no skips. Ten additional mobile-menu and editor-flow browser checks passed. Module/link/source checks and whitespace checks passed. The in-app browser also verified a reachable Add drawer and successful editor launch after reload and draft recovery.

## Further friction reduction

The reviewer-adjusted follow-up is implemented and verified. See [the friction implementation notes](model-editor-friction-implementation.md) for nonblocking recovery/discard/delete dialogs, arithmetic feature entry, guided geometry collection, Repeat last operation, the pre-edit baseline, and final test results.
