# Pending topology coach validation — 2026-10-09

The parent observed Q4's coach claiming Fillet1 lost a selected face/edge while exact geometry was still computing. The actual settled preflight export has no rebuild issues and Fillet1 is rebuilt; retained failure after successful descriptor recovery was not demonstrated.

A narrow guard in modeler.js coachRebuildSuggestion now withholds actionable repair guidance while the existing modelRebuildPending predicate reports exact restore, native kernel work, or a pending part mesh. It does not remove diagnostics, change geometry or caches, or mask settled missing/ambiguous reference warnings. Existing rebuild status remains visible during computation.

Validation: node --test tests/coach_pending_topology.test.mjs tests/rebuild_pending_status.test.mjs tests/open_thin_coaching.test.mjs — 12/12 pass. New regression exercises all three pending states, verifies settled errors and warnings remain actionable, and reconstructs the actual Q4 settled diagnostic state. Parent owns subsequent actual Chrome confirmation. No browser/model authoring, ADVANCE edits, staging or commit by this agent.

Final npm run check passes: no free identifiers, 654 module links, 1489 source assertions. No full-suite rerun was required for this UI-only guard.
