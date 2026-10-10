# Exercise 2.3A STEP and pending Save audit

## STEP reconstruction

Read the protected actual browser bundle
`artifacts/planchard/EXERCISE-2.3A-qualified-browser-2026-10-10.mforge`
and passed its canonical mainModel through `createCadWorkerExecutor` with
`kind:'part-step'`, `canonical:true`. The three native authored features rebuilt
and wrote a valid 41,194-byte STEP buffer with ISO-10303-21 header and terminator.
SHA-256: `353c2fb7ee3b0ff5224a59dc7fc20bb24940de9a5c672751899b5ebd129368c9`.
The source bytes were unchanged. The buffer was not written to a STEP artifact:
this is code/native evidence, not an actual browser download claim.

The part UI awaits worker bytes, creates an attached hidden Blob anchor,
clicks it, removes it and revokes the URL after one second. Its success toast
confirms the click was dispatched; anchor downloads provide no reliable native
API acknowledgement of a completed file save. The intended actual filename is
`Planchard_2_3A_-_upright_fork_block_-_browser_2026-10-10.step` (the part handler
replaces the period in 2.3A). No exporter bug was confirmed. Browser download
permission, dispatch timing or browser state remain possible, unproven causes.
No browser/internal-browser API work was performed.

## Library Save

“Writing to model library…” precedes a keyed atomic IndexedDB transaction.
Quota/request/transaction errors reject and retain dirty state; the deferred
disk mirror cannot block this save. Library size or actual quota was not read
from the running browser. The 133,482-byte bundle is not the full library size.
No claim is made that a blocked upgrade caused this actual Save incident.

A concrete generic gap was found: `openAt` had no `onblocked` handler and no
version-change close listener. A database upgrade blocked by another connection
could therefore remain pending indefinitely. The scoped fix rejects that
blocked open with a retry message, aborts any subsequently resumed upgrade
before changing stores, and closes a late successful connection. Healthy open
connections close on version changes; IndexedDB close waits for existing
transactions rather than aborting successful writes. No arbitrary transaction
timeout was added. Save displays the retained storage exception for ordinary
Save and conflict-copy Save, rather than mislabeling a blocked open as quota.
Existing save finally cleanup clears the busy flag and retains Unsaved state.

## Validation

20 focused tests PASS: native part STEP, database initialization/self-heal,
blocked-open rejection and late cleanup, version-change close, concurrent
keyed saves/conflicts, cache isolation and cross-tab library baselines. The
actual Save-handler harness additionally verifies rejected storage clears its
busy/pending state, permits retry and keeps Unsaved status.
`npm run check` PASS: no free identifiers, 671-module import graph clean and
1489 assertions checked. `git diff --check` PASS. Actual Chrome
Save retry/download acceptance is parent's next task; no full-suite claim.
