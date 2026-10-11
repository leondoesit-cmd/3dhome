# Full CI failure reconciliation

The earlier full CI log recorded23 failures. Six overlay/signed-angle harness failures were delegated to theory_answers; three icon/readability failures to ui_finish_audit. This agent repaired the remaining14 failures and reran72 related tests successfully.

The14 failures were stale test harnesses or invalid fixtures, not evidence to relax current production validation:

- Async Drawing preview/export now awaits configured native geometry. Tests await actual production promises and supply their existing preparation dependency; fit refusal still produces no dialog/download.
- Assembly Drawing owner uses its real `ensureAssemblyDrawingDoc` helper. Exact body success publishes its real `captureExactTopology` dependency. Dimension editors use real clone/tolerance helpers, retaining exact numerical/noise/unit assertions.
- Camera indicator harness supplies the new projection button selector while preserving camera-only/plane-stability checks. Evaluation replacement test recognizes the template-capable `newModel(template)` signature and still verifies old evaluation output is rejected.
- Loft now persists section source records; cut projection handles both loft and sweep. Source assertions target the current genuine branches, not obsolete spelling.
- Face-supported offset fixture formerly placed the face sketch before its supporting stock body. The topology budget fixture additionally used the same sketch to create its own supporting stock. Fixtures now obey body-before-supported-sketch history. Product future-source validation is preserved. The compaction test explicitly requires valid compilation and adds an invalid-history case that must return the original cache unchanged.

Focused result:72/72 passed (`scratch/planchard/full-ci-repair-focused.log`). Final full CI and all-agent gates are separate checks; this report does not claim their success before completion.

The next default-sandbox full run encountered loopback HTTP `EACCES` in the relay bridge test. Isolated default rerun reproduced it while the child remained alive; the elevated isolated bridge test passed1/1. This confirms an environment restriction, not a reason to loosen readiness validation or skip the test. The full run is allowed to finish before an elevated final run; its result will be recorded separately.

That default run completed exit1:4672 tests,4659 passed,13 failed,0 cancelled/skipped,988.4 seconds. All13 failures were environment restrictions: bridge loopbackEACCES1, temporary-file atomic renameEPERM4, relay readiness2, Chrome startup5, symlink realpathEPERM1. All23 earlier code/fixture failures are absent from the new final summary. Because the unit stage failed, this run did not reach the separate browser stage. Elevated full CI remains pending after all latest generic fixes freeze. Log: `scratch/planchard/full-objective-final-ci-2026-10-11.log`.

The elevated final full CI has now started after all owners froze, including named camera views. Its log is `scratch/planchard/full-objective-final-ci-elevated-2026-10-11.log`; the authoritative execution session is93063. Initial gates report no free identifiers and690 linked modules. This is a running verification, not a completed pass.

During that run, actual Chrome exposed a named-view capture integration failure (the current document/identifier was not supplied correctly). The owning agent is repairing it. Therefore session93063 predates that follow-up and cannot certify the final updated graph, even if it finishes green. The running verification is preserved rather than cancelled.
