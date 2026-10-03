# Assembly selection and insertion work — 2026-10-03

The main agent observed repeated 2–3 second browser interaction timeouts while inserting parts and selecting assembly components or mates. Source review found two unnecessary paths:

- Component, reference-plane, and mate tree selections performed a full assembly refresh. This solved poses and rebuilt GPU bodies despite changing only the selection. These three handlers now use the existing selection refresh, which updates controls/highlights without geometry rebuilding or mate solving.
- Insertion cloned the entire part or assembly library before finding one record, then copied the chosen record again. It now finds the record in the immutable in-memory library cache and retains the independent copy for the inserted occurrence. Unselected geometry is not traversed.
- A follow-up review found that `assemblyWorkflowState` cloned the entire library merely to check whether it contained a record. That workflow runs during selection/status refreshes. It now reads the immutable cache length directly; a functional test refuses all saved geometry access.

Actual insertion and mate edits retain the full refresh needed to present changed assembly contents and poses. No assembly geometry or mate semantics were changed. Browser timing improvement has not yet been measured.

Verification: 12 targeted tests passed. These exercise tree selection and Ctrl-add/remove, plane and mate selections, selected-record copying for parts and subassemblies, refusal to traverse unused library geometry, and the existing refresh lifecycle. The older refresh test fixture needed its missing `syncAssemblyContextBar` no-op added to match the current source.

Follow-up combined verification passed 15 tests, including the added workflow-presence test and two existing finish-at-rollback tests. The main agent still observed a 2673 ms tree selection interaction timeout after the first patch; no timing improvement is claimed. The workflow clone was found and removed afterward.

```
node --test tests/assembly_selection_work.test.mjs tests/modeler_refresh_work.test.mjs tests/component_context_render.test.mjs
npm run check
```
