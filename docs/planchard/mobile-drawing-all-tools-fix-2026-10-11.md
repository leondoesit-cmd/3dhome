# Phone Drawing All tools

The actual 390×844 phone Drawing session opened the Sketch CommandManager from **All tools**. `showSheet("cmd")` prioritized an empty Part over Drawing mode and only hosted the modeling command panel, leaving native drawing tools absent.

The Drawing-first branch now builds labelled touch shortcuts from the actual `#mdDrawingTools` buttons. It leaves the native toolbar and listeners in their owner. A shortcut closes the phone sheet before clicking its original drawing button; native drawing tools, forms, history, persistence and selection behavior remain shared. Stale owner/mode, disconnected and disabled targets reject dispatch. Modeling mode retains its existing Sketch/Assembly/Features routing.

Scoped CSS presents drawing commands in two columns with 60px minimum touch targets and fully visible wrapping labels. Search remains available. No browser automation, authored CAD changes, touch-mode timestamp changes or Git operations were performed.

The first implementation's 29 passing routing/density tests did **not** prove the actual paged layout: parent ordinary phone validation showed an orphan Drawing heading on page one, the entire tall tool grid on page two, and a collapsed deck (`artifacts/planchard/mobile/drawing-commands-after.png`). That implementation is superseded. Commands now form atomic sections containing their heading and at most four buttons (two touch rows). The existing pager recognizes each section; it cannot detach a heading from its controls. This specific command sheet has a bounded `min(46dvh, --mobile-sheet-cap)` height, and its active page can scroll on unusually short screens. Other generated menus retain their content-height behavior. The specific height class clears on close and is absent in other command modes.

The collection includes **all** original native toolbar buttons, including ID-only Zoom to fit, Print, Export SVG, Overall dimensions, Insert Model Items and Hidden lines, rather than only `data-drawing-tool` buttons. Native aria-pressed state is reflected in the shortcut.

Files: `js/modeler_mobile.js`, `css/styles.css`, `tests/mobile_drawing_commands.test.mjs`.

Final verification: **31/31 PASS**, zero skipped, for actual production-function routing/dispatch/stale regressions plus existing mobile-menu density tests. The 40-command case verifies ten bounded atomic sections, complete ordered command retention, recognized pager section boundaries and attached heading/controls. ID-only native-action dispatch is separately tested. Log: `scratch/planchard/mobile-drawing-commands-tests-2026-10-11.log`. Actual ordinary phone tap/render acceptance of the revised layout is parent-owned and pending.

Revised implementation `npm run check` exited 0: no free identifiers, **692 modules / 1487 source assertions PASS**. Log: `scratch/planchard/mobile-drawing-commands-final-gates-2026-10-11.log`. Owned diff check clean. The earlier attempt during sibling Saved-library integration correctly caught its in-flight import; final validation followed coherent integration. No change to that owned region was made.

Browser acceptance: in Drawing mode, tap **All tools**, verify visible labelled drawing cards including dimensions, Paper ellipse, Note and sheet formats, then tap a drawing tool. The sheet should close and the native canvas tool or form should open. Return to Model/Sketch mode and verify the original command panel still opens.
