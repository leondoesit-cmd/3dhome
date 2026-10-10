# Drawing toolbar command reach — 2026-10-10

Parent's actual desktop Chrome BATTERY witness isolated toolbar **Insert Model Items** failure from its working right-sheet counterpart. Both handlers call the same current drawing controller. Read-only actual DOM evidence: toolbar button y1273, height32, desktop viewport2560×1296; its centre hit `DIV.ps-cmdbar`, so the underlying command never received the intended click.

The growing vertical drawing rail had only `top:8px`, no bottom bound and no overflow handling. The bounded CSS fix places its bottom44px above the canvas bottom, adds vertical scrolling/contained overscroll, and prevents buttons shrinking below their existing32px minimum. No command routing, controller, document or CAD geometry change is introduced.

`tests/drawing_toolbar_reach.browser.mjs` uses the actual current toolbar command list and application stylesheet in an isolated layout fixture, with no CAD model. At canvas heights280/500/900, every command scrolls within the rail, remains above the status chrome, receives `elementFromPoint` hit-testing and a real DOM click. Local Chrome regression **1/1 PASS**. Sandbox process launch exited before testing; the same authorized isolated local Chrome test passed with elevated subprocess permission.

Actual parent application reload/hit-test confirmation remains separate. Owned files: `css/styles.css` drawing rail rules, the isolated layout regression and this report. No browser CAD authoring, protected exports, ADVANCE or Git changes.
