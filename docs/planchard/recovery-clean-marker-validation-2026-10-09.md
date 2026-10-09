# Planner recovery clean-marker validation — 2026-10-09

## Confirmed defect and scoped repair

The planner stores its autosave separately from model-library saves and Model Editor drafts. Closing the planner recovery dialog preserves unresolved work; newer clean model sessions do not prove that an older planner backup was saved.

A separate source defect was reproduced using the actual `markClean` function: its 40-session timestamp pruning removed the clean marker for a retained older planner snapshot after 41 later clean sessions. The unchanged snapshot then changed from `needsRecovery=false` to `true`, inventing a crash after a previously clean exit.

`js/recovery.js` now exports `pruneCleanSessions`. `js/persist.js` protects existing clean markers named by local autosave metadata and the retained IndexedDB snapshot while pruning unrelated old markers. Successful IDB writes and startup reads track the current retained IDB session. The map remains bounded at 40 entries for these at-most-two retained copies. Missing clean markers are never fabricated. Autosave payloads and metadata are not deleted or rewritten by pruning.

This prevents future clean-marker loss. It cannot reconstruct a marker already lost, establish that the observed October 3 backup was clean, or safely dismiss an unresolved backup. No change was made to recovery dismissal, planner/model separation, backup retention, or boot performance.

## Focused evidence

```powershell
node --test tests/recovery_marker_retention.test.mjs tests/security.test.mjs tests/boot_guard.test.mjs
```

**16/16 passed** outside the restricted sandbox. The initial sandbox invocation passed 14 and failed two existing environment-dependent checks (temporary fixture path `EPERM` and local relay startup); the identical authorized unsandboxed run passed all 16.

Four new lifecycle regressions execute the actual persistence functions and verify:

- A clean retained planner snapshot stays clean after 120 later model-only sessions, with 40 retained markers and unchanged autosave metadata.
- Distinct local fallback and IDB snapshot markers both remain protected.
- A genuinely unsaved snapshot keeps crash recovery, including live-tab and edits-newer-than-clean-marker behavior.
- Replacing retained snapshots releases obsolete marker protection.

Complete source gates and whitespace validation:

```powershell
npm run check
git diff --check -- js/persist.js js/recovery.js tests/recovery_marker_retention.test.mjs
```

Both commands passed: no free identifiers; no link errors across **650 modules**; **1489 source assertions** checked, with none satisfied only by comments. The whitespace check reported only normal LF-to-CRLF conversion warnings. No full-suite rerun was performed for this scoped persistence repair.

## Browser and performance boundary

No browser storage was read or changed by this agent. The fix is supported by source lifecycle regressions rather than a destructive experiment on the user's backups. The reported startup CDP stall remains unmeasured. Recovery uses asynchronous IDB reads and a 250 ms session probe; eager library loading/cloning/registration is a separate potential boot workload requiring actual profiling before a performance change.

No authored geometry, ADVANCE, or commits changed.
