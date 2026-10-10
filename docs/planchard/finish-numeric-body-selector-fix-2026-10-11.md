# Finishing command numeric body selection

Actual Chrome Fillet on the independent ShellA model exposed a valid Target body option `6466`, but choosing it immediately returned the selector to Choose solid body. Radius editing still worked. The confirmed source defect was a strict comparison between the native numeric part ID and the string value returned by an HTML select.

The bounded repair converts the choice ID to string for selector comparison. Selection remains the original part object; no stored ID, geometry, feature, topology reference, history or finish parameter is rewritten. Fillet, Chamfer, Shell, Dome, Draft and Thicken share this control.

The test DOM now models real select string conversion. A new regression exercises both numeric bodies, feedback synchronization, blank and unknown selections, and source nonmutation across all six finishing commands. Existing string IDs, viewport/tree targeting, rollback/suppression and actual native cold geometry retain coverage.

Focused tests: **11/11 PASS** across finish body targeting, QuickForm instance lifecycle and focus intent. Required gates PASS: no free identifiers, **685 linked modules / 1487 source assertions**. Owned diff check is clean. Actual Chrome replay remains pending the parent's reload; this report does not claim the browser issue has already been replayed with the fix.
