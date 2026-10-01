# Inspector dimension commit / stale popover — 1 October 2026

Observed in the root's fresh browser stem workflow: Smart Dimension placed a circle diameter at 3.4 cm and opened a contextual popover. The inspector value was changed to 1.18 cm and visibly committed with Enter. Finishing the sketch restored 3.4 cm. A separate seat dimension similarly reverted from 6 to 6.6 cm.

Cause: Finish / tool change applies an active placed-dimension popover. That popover retained its original text and `before.value`, so its later application overwrote a successful edit made through the inspector.

Fix: a successful inspector value commit dismisses only the popover editing that exact sketch and constraint. Failed edits retain the popover and original value. Other sketch / dimension popovers are untouched. There is no geometry approximation or weakening of constraint validation.

Three focused tests execute the real inspector change handler and verify successful commit survives subsequent finish, failed validation retains the prior dimension, and unrelated popovers are retained. Tests passed; module/link gates passed (618 modules) and 1,490 assertion gates passed.

Actual browser acceptance passed in a separate new blank Chrome tab 710858975: origin-centered circle, Smart Dimension popover initially 6.80294054068 cm, inspector entered 1.18 and Enter, then Finish sketch. The dimension stayed 1.18 cm and the sketch was fully defined. Save validation completed clean, with no Unsaved changes. Protected PNG and 4,160-byte portable bundle: artifacts/planchard/DIMENSION-inspector-finish-retained-browser-2026-10-01. Read-only bundle audit confirms diameter value 1.18. Tab 710858975 is safe to close.
