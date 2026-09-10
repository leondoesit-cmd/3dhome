# Model editor friction reduction — adjusted implementation

Implemented September 10, 2026, following the review of the proposed next improvements.

## Adjusted scope and order

1. Replace the editor's three blocking browser confirmations first.
2. Connect feature parameter fields to the existing arithmetic parser, with interpreted values and inline validation. Unit suffixes are a separate change.
3. Extend the existing finish-selection collectors with an explicit geometry-selection step that preserves the form.
4. Add Repeat last operation through command search, building on the existing remembered finish amounts.

Existing selection breadcrumbs, filters, expandable parameter groups, density modes, and responsive form reparenting remain the foundation; no replacement systems were added.

## Changes

- Recovery, abandoning unsaved work (New, Close, and both library panes), and saved-model deletion now await a DOM dialog. Rendering and the event loop continue. The native dialog provides modal focus containment; the editor's shortcuts are suspended while it is open.
- Recovery shows the draft name and timestamp as plain text. Restore loads it; the explicitly labelled discard action starts fresh. Escape or Not now exits recovery without deleting its stored draft. Dismissing or replacing an open dialog settles its pending action safely.
- Discard answers are checked against the document that requested them. Closing after explicitly accepting discard clears that document's recovery draft. Cancelling preserves the document.
- Document settings expose draft saving, saved, and failed states, also associated with the Save button for assistive technology. The status distinguishes a recovery draft from a clean library revision.
- Shared feature and quick-form numeric fields accept arithmetic such as `80/3` and `(10+5)*2`. Results appear next to the input; errors retain the last valid preview and prevent Apply. Field bounds and integer instance counts are validated. Inactive pattern settings do not block another pattern mode, and pattern normalization no longer replaces the expression currently being typed.
- Arithmetic uses the existing hand-written evaluator, never JavaScript evaluation. It commits the numerical result, not a persistent equation. Numeric scientific notation remains accepted. Values use the existing field units; unit suffixes and document-variable formulas are not introduced here.
- Fillet, Chamfer, Shell, Draft, and Thicken offer Select geometry. On mobile this dismisses the sheet without destroying the form or its values. Parameters returns to the same form. Face-based commands request faces; collecting Fillet/Chamfer preserves face-to-boundary-edge expansion and borrows All without overwriting the user's sticky filter. Finish stays unavailable until required geometry is selected.
- Repeat last operation is searchable after a successful feature-form commit. It copies form parameters, rechecks the command's normal prerequisites, and clears topology references for fresh selection. Cancelled operations do not replace the remembered operation. The memory resets when opening a different document or creating a new one.

## Baseline and verification

Before source edits, the existing `modeler_loop_rhythm`, `modeler_selection_grammar`, and `modeler_responsive_flow` browser suites passed **18/18**, with no skips, in **25.85 seconds** on this machine. The raw baseline is `/tmp/friction-baseline.log`.

These are automated suite durations, including setup and intentional waits—not human task completion times, tap counts, or physical-device latency measurements. They must not be presented as a measured UX speedup. Existing bounded completion waits and geometry/history assertions remain the regression gates.

New behavioral tests cover arithmetic precision and rejection, last-valid parameter preservation, continued animation frames during recovery, Escape/cancel/accept behavior, recovery identity, narrow/foldable/desktop layouts, selection-filter restoration, preservation of typed expressions, Repeat after commit, and Hebrew mobile library deletion. A real in-app browser also displayed the recovery dialog over a live 3D viewport; the existing user draft was left untouched.

Physical phone keyboards, actual fold hinges, pen/touch switching, and longitudinal task/tap/error measurements still require real-device sessions. No physical-device performance claim is made.

Final results:

- Full unit suite: **2,206/2,206 passed**, zero skips (`/tmp/friction-all-unit-final.log`).
- Editor browser regression run: **61/61 passed** (`/tmp/friction-browser-final.log`). This includes four of the new friction cases.
- Final friction browser suite, including the additional Hebrew deletion case: **5/5 passed** (`/tmp/friction-regressions-final.log`), giving **62 distinct browser cases** across the two runs.
- Module/link/source gates passed: 424 linked modules, 1,392 source assertions (`/tmp/friction-all-gates-final.log`).
- Whitespace/diff validation passed.

The first full unit run caught a missing Repeat icon and an obsolete source assertion that prohibited any Fillet-specific filter branch. Repeat now has a dedicated CAD icon, and the assertion forbids forcing Edge while allowing the explicit All collector. The full unit suite was rerun after both corrections and passed.
