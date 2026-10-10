# Rollback native publication — independent review

Read-only review of frozen `js/modeler.js` changes in `syncPreviewFromHistory`, `exactDisplayBody`, `queueExactMesh`, actual-source fixture and three regression suites. No source/CAD/browser/ADVANCE/Git changes by reviewer.

**No confirmed production defect found in the bounded repair. Final independent focused rerun12/12 PASS.** Compiler already selects the active history prefix. History synchronization now queues supported unsuppressed dirty bodies even when an earlier simple disk has no modifier requiring exact display. Stale derived mesh/bounds are removed together; a cold rolled-back body missing its mesh also queues once, with pending/error and queued guards avoiding duplicate work. Actual completed native mesh supplies updated canonical display bounds.

Requested-head topology publication checks current document identity, history node and mass-edit revision. `captureExactTopology` preserves only independently verified entries whose current source stamps match, then adds native results; a rolled-back disk proof cannot validate the full pattern after Roll to End. Existing mesh publication still requires matching document/build token and releases native results after conversion. Canonical sketches/features/parameters/history are not rewritten by these added publication statements; this repair changes derived display/cache state.

```text
node --test tests/rollback_native_publication.test.mjs tests/rollback_display_head.test.mjs tests/tree_rollback_bar.test.mjs
```

Tests execute actual extracted publication functions plus real history/compiler/native regeneration. The supplied rolled-back disk fixture produces the disk-only prefix, native mesh radius30mm/height8mm, current topology, cold proof and recomputed bounds. Restoring full history invalidates disk-as-final proof. Cold normalized flags/pending de-duplication, before-base/history boundaries, suppressed heads and stale owner/history/revision publication are covered.

First independent run exposed a **test-path mismatch**: raw Node tessellation did not carry browser worker `nativeSolidCount`, so one asserted count was undefined. Owner corrected the regression to run actual worker `packBody` against the real native disk with native solid enumeration, then feed its serialized mesh to the publication function. Final independent run passes all12; no fabricated count is assigned. Production source remained frozen during that test correction.

Owner reports full gates685 linked modules/1487 assertions PASS. This review did not rerun full gates. Actual fresh-code browser rollback/return/cold remains a separate required proof; native unit regeneration and source review do not certify the original proprietary BRACKET feature-tree import or every multi-body rollback scenario.
