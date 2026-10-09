# Q4 Save responsiveness review

Parent observed several-second Chrome input stalls while saving a settled Q4 model. This review used source inspection and disposable in-memory copies of `artifacts/planchard/ADVANCED-Q4-source-material-browser-2026-10-09.mforge`; it did not control Chrome or alter that fixture.

## Confirmed avoidable work and repair

Every keyed model/assembly save reads all library records. `changeKeyedStore` cloned the full library into an isolated transaction snapshot, cloned the resulting records into its private memory cache, and then cloned the entire returned outcome again. `saveLib` subsequently clones returned records for the modeler's own cache. The third store-level copy was redundant: the returned outcome already belongs to the transaction, and neither caller input nor private memory cache shares its mutable objects.

The store now returns that owned outcome directly after creating its separate internal-cache copy. This removes one full-library allocation/copy per keyed operation while preserving expected-record conflict checks, atomic IndexedDB transactions, independent caller inputs and returned values, and unrelated library records. No storage or backup record is deleted; no native proof or geometry cache semantics change.

A clone-count regression failed before repair (three library copies versus the two required for isolation), then passed. It also mutates returned `records`, `puts`, and the original input and verifies stored records remain unchanged. Assembly results and rejected conflict snapshots retain the same isolation.

```
node --test tests/model_library_clone_ownership.test.mjs tests/model_library_concurrent.test.mjs tests/library_refresh_baseline.test.mjs tests/model_sketch_only_save.test.mjs tests/exact_save_cache.test.mjs
```

28 tests passed, zero failed.

Final `npm run check` passed: no free identifiers, 653 modules linked, 1489 source assertions checked. Scoped diff check passed.

## Save geometry and measured limits

No main-thread BREP restoration was found in Save: its worker request already uses `restoreMode: 'mesh'`, including the repaired-reference retry. Exact Save cache reuse already ignores material-only changes and rejects changed geometry inputs. The previously repaired part Mass card is independent of this Save path.

Node read-only timings for the 1,888,077-byte Q4 export (12 authoring features, 11 sketches, 37 compiled features): parse 7.62ms; snapshot clone 13.60ms; compile 39.80ms; geometry keys 4.66ms; document validation 150.76ms; attachment externalization 23.73ms; definition migration 18.28ms. These are local Node timings, not Chrome measurements; they do not establish the source of the observed several-second browser stall.

The whole-library read and copies, saved-model rendering/registration, IndexedDB transaction completion, and subsequent catalog/preview refresh still require Chrome phase measurements. The total library size is unknown here. The new repair reduces a confirmed scaling cost but does not claim that Save is now stall-free. Header Unsaved remains truthful until the write and clean-marker update complete.

Parent owns any browser acceptance and ADVANCE update. No further source changes are proposed without new evidence.
