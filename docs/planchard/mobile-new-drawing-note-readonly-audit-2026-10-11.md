# New blank Drawing Note event audit

Actual parent phone observation: after clean Saved Alphabet 3 → More/New model, a blank Drawing is visible; Note is active, but two 120 ms touches on the paper did not show the text form. Screenshot: `artifacts/planchard/mobile/orthographic1-new-sheet-note-gap.png`. This is a reported browser workflow failure, not yet a confirmed source defect.

Source trace:

- Drawing `setTool("note")` sets both `E.tool` and the live controller's tool, then updates controls/hint.
- `newModel` replaces `E.def`; the persistent controller reads its document/model through live getters. It does not retain the old model in those callbacks.
- Canvas pointerdown returns early for three-finger tracking or an unaccepted open dimension editor, then routes Drawing directly to controller pointerDown.
- Controller pointerDown first updates its cursor. The Note branch unconditionally invokes placeNote after the panning check. placeNote invokes sheetForm/promptFields before waiting for input.
- sheetForm adds the Drawing form class; openQuickForm explicitly invokes the phone feature-form reveal route.

An isolated read-only-development Node witness used the actual native controller at 338×638 and real Note pointerDown with touch metadata. It placed a first note in an old blank owner, replaced the live owner, invalidated/fitted/reselected Note and placed a second note into the new blank owner. Both prompt calls occurred; the old owner's note count remained one. This rejects persistent-controller/live-owner replacement alone as a reproducer. It is not a full browser/New-model acceptance claim.

No production fix is justified by the source trace alone. Parent-owned read-only diagnostics needed after an ordinary touch: controller getTool/cursor/draft, native #mdQuickSettings existence/hidden state, and any console exception. A cursor that remains unchanged localizes the problem before controller pointerDown; updated cursor plus draft/form state distinguishes panning, scene exceptions and form reveal. No handler calls, state injection, protected CAD mutation, browser interaction or Git operations were performed by this audit.

## Later ordinary-browser observations and focused reproduction

Parent resolved the first Orthographic 1 case with ordinary Select → Note re-selection and a touch at (140,380), then authored and applied the real note. No reset patch was made.

Orthographic 5 produced a second observation after 15 native paper primitives and a 19-field primitive editor: Note appeared active, but touches (96,342), (140,345), (140,355) showed no form despite canvas DOM hit and no app console errors. A later ordinary touch at (150,410) opened the real form and parent authored the note. This remains a qualified event/form-delivery observation; source has no Note paper-boundary/title-block exclusion or primitive-hit rejection.

New meaningful regression in `tests/drawing_primitives.test.mjs` uses the actual native controller with a closed nine-point polyline plus 14 paper lines, performs the real 19-field double-click edit through normalized history, fits a 338×638 phone-size viewport, reselects Note, and tests each reported position in canvas-local coordinates. Each pointerDown opens its pending prompt; pointerUp leaves that prompt pending; the answer appends exactly one live note. **19/19 PASS** across drawing primitives and paper arcs, zero skipped, exit 0. Log: `scratch/planchard/mobile-note-after-primitive-edit-tests-2026-10-11.log`.

This rejects snapAt/primitive-edit/ordinary pointer-up as an isolated controller reproducer. It does not reproduce actual OS touch delivery or prove browser form geometry. Production code remains unchanged; only this bounded regression and audit documentation were added. Browser app-global diagnostic reads were not used; parent preserved its DOM-only restrictions.

Final gates: `npm run check` exit 0, no free identifiers, **692 modules /1487 source assertions PASS**. Log: `scratch/planchard/mobile-note-after-primitive-edit-gates-2026-10-11.log`. Owned test diff check clean. Source/test/report frozen for checkpoint; actual broader phone acceptance remains parent-owned.


Parent browser resolution: ordinary120ms touch Select then Note, fresh DOM, and paper140,380 opened the native Note form. Parent authored through visible textarea/Apply; Undo/Redo, Save, SVG and cold reopen passed. No confirmed production bug or reset patch. Initial125,355 nonresponses remain recorded as transient unlocalized behavior.
