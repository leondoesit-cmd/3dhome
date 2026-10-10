# Full CI failure reconciliation

The earlier full CI log recorded23 failures. Six overlay/signed-angle harness failures were delegated to theory_answers; three icon/readability failures to ui_finish_audit. This agent repaired the remaining14 failures and reran72 related tests successfully.

The14 failures were stale test harnesses or invalid fixtures, not evidence to relax current production validation:

- Async Drawing preview/export now awaits configured native geometry. Tests await actual production promises and supply their existing preparation dependency; fit refusal still produces no dialog/download.
- Assembly Drawing owner uses its real `ensureAssemblyDrawingDoc` helper. Exact body success publishes its real `captureExactTopology` dependency. Dimension editors use real clone/tolerance helpers, retaining exact numerical/noise/unit assertions.
- Camera indicator harness supplies the new projection button selector while preserving camera-only/plane-stability checks. Evaluation replacement test recognizes the template-capable `newModel(template)` signature and still verifies old evaluation output is rejected.
- Loft now persists section source records; cut projection handles both loft and sweep. Source assertions target the current genuine branches, not obsolete spelling.
- Face-supported offset fixture formerly placed the face sketch before its supporting stock body. The topology budget fixture additionally used the same sketch to create its own supporting stock. Fixtures now obey body-before-supported-sketch history. Product future-source validation is preserved. The compaction test explicitly requires valid compilation and adds an invalid-history case that must return the original cache unchanged.

Focused result:72/72 passed (`scratch/planchard/full-ci-repair-focused.log`). Final full CI and all-agent gates are separate checks; this report does not claim their success before completion.
