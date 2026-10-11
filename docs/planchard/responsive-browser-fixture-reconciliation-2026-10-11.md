# Responsive browser fixture reconciliation

## Scope

Only existing browser test fixtures/assertions were edited: `mobile_menu_pages.browser.mjs`, `mobile_touch_verbs.browser.mjs`, and `model_editor_desktop.browser.mjs`. No production layout, canonical CAD, source files or accepted browser models were changed.

## Concrete findings

The short Planner menu case opened Tools, which now legitimately includes wall presets and the complete product command catalog. Real Chrome measured1437px natural content height: this is a long destination, not a short menu. The test now opens the supported short View menu through its ordinary keyboard ArrowUp action (a click intentionally toggles the view). All bottom attachment, intrinsic content height, positive top and canvas visibility assertions are retained. It also waits for actual sheet animations to finish instead of assuming fixed420ms completes under full-CI load. Existing `pro_compact.browser.mjs` checks real Tools-sheet opening and attachment above the toolbar.

The contextual row fixture expected old wall actions and an empty no-selection row. Current production legitimately offers Add window on a wall. Its360px no-scroll contract belongs to the classic full-width row, but the test default loaded Round-6, whose narrower dock explicitly scrolls sideways. The test now explicitly requests `mf.proSkin=0` and reloads before seeding the fixture. Exact classic labels include the current wall action and no-selection Center view/OSNAP/ORTHO/GRID aids; Undo/Redo remain first and the original360px no-overflow assertion remains unchanged. Round-6 retains its separately tested dock behavior.

The FeatureManager fixture seeds two lightweight analytic body projections, not measured native BREP solids. Its expected subtitle now asserts both `2 body projections` and `solid count not yet measured`. The fixture deliberately creates conflicting Coincident/Concentric constraints; an unresolved status and `Mobility not checked` are now required for that inconsistent state. Original reorder/pose, suppression and freedom assertions remain, with genuine freedom checked after the existing suppression of the conflicting mate. No solver or proof guard was weakened.

The Cabinet More-sheet check also waits for its real CSS slide animation to finish before measuring. Its bottom attachment and no-continuous-scroll assertions are unchanged. The pro-desktop header/search/Split/classic-layout test passed unchanged when rerun serially on the idle host; no longer timeout or assertion weakening was introduced.

## Verification status

Initial isolated elevated run reproduced the old short-menu error; Model Editor/Cabinet one-card behavior and four modeler contextual-caption cases passed. The actual Planner contextual-row test reproduced the stale-label expectations. Subsequent run exposed Fold sheet animation still in transit under full-suite load and the FeatureManager contradictory-mobility assertion; those diagnostics motivated the bounded fixture changes above. A serial idle cohort subsequently passed the corrected short menu, FeatureManager and unchanged pro-desktop header/search/Split/classic case. It still failed Cabinet bottom attachment after a fixed250ms and Planner narrow Round-6 scrolling; the final two fixture changes request animation completion and the explicitly intended classic presentation respectively. Their rerun remains pending.

Final serial idle results: **5/5 targeted cases PASS across two recorded cohorts**. `ui-responsive-idle-2026-10-11.log` passes short Planner, FeatureManager and unchanged pro-desktop case; `ui-responsive-last-two-idle-2026-10-11.log` exits0 with the final Model Editor/Cabinet and classic contextual-row cases **2/2 PASS**. The first cohort's two failures are retained as diagnostics superseded by the final run, not relabeled passing.

`npm run check` completed: no free identifiers,690 linked modules,1487 source assertions PASS at the initial test-only change snapshot. The neighboring later GPU-retirement implementation adds one module and separately reports691/1487 gates; this report does not claim a fresh full-CI run. Test/source diff check is clean. All owned changes are frozen.
