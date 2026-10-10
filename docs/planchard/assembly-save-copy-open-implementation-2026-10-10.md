# Assembly Saved-card Save copy and open — 2026-10-10

The assembly Saved library now exposes the same ordinary **Save copy and open** action as the part library. Click the action on a saved assembly card, enter the independent name, and Apply. Unsaved-document discard confirmation uses the existing document-open decision.

The action deep clones the saved assembly and changes only its root key/name (and root id/definitionId if present). The new key starts `asm_`; insertion uses the store's `expected:null` guard. Nested part/subassembly keys, native geometry/topology, occurrence IDs, mates, placements, configurations, exploded states, drawings, and histories are preserved in the persisted copy. The original record remains unchanged. Opening uses the existing assembly topology-compaction policy, new undo history, clean baseline, and draft reset used by ordinary Saved-card opening.

Cancellation, blank names, a changed saved record, or changed active document/history during the name dialog stop before writing. A failed insert reports failure and preserves the active document. If the user changes documents while persistence is awaiting completion, the independent copy remains saved but the newly active document is not replaced or marked clean.

Validation: **12/12 PASS** — four actual extracted-handler regressions plus eight existing keyed library ownership/concurrency regressions. Tests verify deep source-data preservation/isolation, expected-null identity, original unchanged, cancellation/blank/source/history guards, failed insert, and an active-document switch during persistence. Actual FLASHLIGHT browser copying remains parent-owned; this report asserts code/test acceptance only.

Files: js/modeler.js (assembly copy handler and Saved-card action); tests/assembly_save_copy_open.test.mjs. No drawing/controller or configured-native source changes.

Final gates PASS: 682 linked modules / 1487 assertions, no free identifiers; git diff --check clean. Source frozen for parent actual browser proof.
