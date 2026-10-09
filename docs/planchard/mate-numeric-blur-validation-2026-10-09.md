# Mate numeric editing validation — 2026-10-09

Listed mate values previously committed only on `change` or Enter. An input producer could change the visible number and subsequently blur the field without dispatching `change`, leaving the value disconnected from the saved mate.

`bindMateNumericCommit` now shares one commit path across blur, change and Enter. It deduplicates consecutive events and blocks reentry when an inspector refresh blurs the active field during commit. Listed values, extra numeric mate fields and linear Limit inputs use it. Existing field validation and units remain in their callbacks.

Listed Angle and Distance edits now use `setTopologyMateValue`: validate finite values (Angle additionally 0–180°), solve a trial assembly with the native solver, then publish the value and poses with one Undo only on success. Rejected input restores the actual stored value. A failed solve does not publish diagnostic subset poses. Successful edits reuse the accepted native result through the existing assembly-pose refresh path. The solver implementation and authored model data are unchanged.

## Verification

```powershell
node --test tests/mate_numeric_blur.test.mjs tests/mate_value_keyboard.test.mjs tests/assembly_mobility_status.test.mjs tests/rack_pinion_ui.test.mjs tests/rotation_limit_ui.test.mjs
npm run check
git diff --check -- js/modeler.js js/modeler_strings.js js/modeler_mate_numeric_commit.js js/cad_mate_value_controls.js tests/mate_numeric_blur.test.mjs tests/mate_value_keyboard.test.mjs
```

**30/30 focused tests passed.** Eight new regressions exercise actual inspector callbacks and the native solver: Angle 25°→30° through blur without `change`; Enter/change/blur and reentrant blur producing one Undo; invalid/out-of-range/inconsistent Angle rollback with byte-identical assembly and no Undo; Distance document units and inconsistent native rollback; Screw and Limit blur, persistence and existing atomic rejection. The accepted Angle remains valid after JSON cold reopen.

The requested transaction source review added three regressions and two narrow repairs. Canonical field restoration now runs in `finally` even if the callback throws. Undo capture is verified after successful trial solving and before live mutation; capture failure leaves the assembly unchanged. Accepted native mate fields (including legacy mechanical zero capture) are published in place with their poses while retaining mate object identities. A rejected trial cannot publish newly captured zero fields or normalized poses. A successful scalar edit followed by cold Screw Drive zero returns to the original home, rather than recapturing zero at the moved pose.

All gates passed: no free identifiers; no link errors across **652 modules**; **1489 source assertions** checked, with none satisfied only by comments. Whitespace validation passed with normal LF-to-CRLF warnings. No full-suite rerun was performed.

Cold Chrome acceptance remains parent-owned and pending at report creation. No browser geometry, ADVANCE, staging or commits were changed by this agent.

## Actual cold Chrome verification

Parent reloaded the app and reopened the accepted nine-occurrence Chain assembly. Angle A25→30 using fill and Tab, without Enter, committed the native solved pose and one `Angle mate` Undo. Actual COM became(342.9107,−104.0197,−91.40373)mm with unchanged volume/material. Undo restored25. Input181 followed by Tab restored25, displayed the range explanation and left Undo disabled, with no accepted pose/value mutation.

Clean Save retained19mates/5degrees of freedom and restored source COM(348.6593,−88.47654,−91.40373)mm/mass33821.70g. Actual screenshots and the restored browser bundle are protected in artifacts/planchard. Parent reran31focused tests (the30above plus actual sketch dimension Enter/history regression); all passed. A separate isolated Chrome inspector-scroll regression passed at three widths. No CSS or sketch Enter behavior repair was warranted by the settled DOM or handler tests.
