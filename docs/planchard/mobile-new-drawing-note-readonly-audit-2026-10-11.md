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


Parent browser resolution: ordinary120ms touch Select then Note, fresh DOM, and paper140,380 opened the native Note form. Parent authored through visible textarea/Apply; Undo/Redo, Save, SVG and cold reopen passed. No confirmed production bug or reset patch. Initial125,355 nonresponses remain recorded as transient unlocalized behavior.
