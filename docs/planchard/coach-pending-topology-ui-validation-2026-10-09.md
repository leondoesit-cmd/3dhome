# Pending topology coach validation — 2026-10-09

The parent observed Q4's coach claiming Fillet1 lost a selected face/edge while exact geometry was still computing. The actual settled preflight export has no rebuild issues and Fillet1 is rebuilt; retained failure after successful descriptor recovery was not demonstrated.

A narrow guard in modeler.js coachRebuildSuggestion now withholds actionable repair guidance while the existing modelRebuildPending predicate reports exact restore, native kernel work, or a pending part mesh. It does not remove diagnostics, change geometry or caches, or mask settled missing/ambiguous reference warnings. Existing rebuild status remains visible during computation.

Validation: node --test tests/coach_pending_topology.test.mjs tests/rebuild_pending_status.test.mjs tests/open_thin_coaching.test.mjs — 12/12 pass. New regression exercises all three pending states, verifies settled errors and warnings remain actionable, and reconstructs the actual Q4 settled diagnostic state. Parent owns subsequent actual Chrome confirmation. No browser/model authoring, ADVANCE edits, staging or commit by this agent.

Final npm run check passes: no free identifiers, 654 module links, 1489 source assertions. No full-suite rerun was required for this UI-only guard.

CI follow-up: native operation revision f1e0488 expires the older Q4 preflight's exact topology signatures, so its lightweight Fillet references now require native regeneration. The settled regression now reads the parent's committed BASIC-Q4-fixed-cold-accepted-browser-2026-10-09.mforge (0c19545), whose current verified cache yields no core issues. Assertions retain successful rebuild and zero residual issues; no diagnostic coverage was removed or relaxed. The 12 focused coaching/status tests pass again. Other isolated full-CI failures were diagnosed separately: old DG/lead-screw saved native signature expiry, and successful adapter Shell recomputation without the expected preview-cache reuse event. No changes to those fixtures or core by this agent.

Final follow-up npm run check passes: no free identifiers, 656 module links, 1489 assertions. These focused results do not imply the separately running full CI suite is all green.
