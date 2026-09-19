# Intermediate fillet removal fixed

The former blanket dependency refusal now has a limited safe removal path for single-input fillets and chamfers. Body-consuming features reconnect to the predecessor. Feature seeds, multiple inputs and other unsupported dependencies remain protected.

Topology references are remapped only when one matching geometry descriptor exists in verified exact predecessor topology. Signed normals and geometry must match; stale cache entries, missing topology and ambiguous matches refuse the transaction with a repair message. No document changes are applied on refusal. Downstream feature identities and sketches are retained. Removing a node also adjusts the rollback index and invalidates affected preview geometry.

Changed implementation:
- js/core/finish_removal.js: transaction planning, body rewiring and conservative topology matching.
- js/core/parametric_document.js: finish-removal transaction and rollback adjustment.
- js/modeler.js: passes verified exact topology into deletion.
- tests/finish_removal.test.mjs: preserved body chain, serialization, unique reference mapping, atomic refusal and protected feature seeds.

## Real browser verification

Opened the saved `BATTERYPLATE - repaired support` record at localhost:8765. Deleted step 6 `Fillet 2`. The model changed from 12 to 11 history steps and rebuilt successfully. Top view showed both holes and the annular Holder intact. Undo restored Fillet 2 and 12 steps; Redo returned to 11 steps with a successful rebuild. Saved the existing record, fully reloaded the browser, reopened from Saved models, and confirmed `Rebuild succeeded` with one solid and 11 steps.

The saved record now omits the old top rim fillet and retains the holes and Holder. It is ready for the ebook's rollback and Full Round replacement steps. This fix does not claim that the subsequent Full Round geometry has been tested.

## Validation

38 focused tests passed across removal, Planchard workflows, parametric core/authoring, saved supports, BATTERY and BATTERYPLATE regressions. `npm run check` passed (503 linked modules, 1,449 source assertions). `git diff --check` passed. Full suite not run.
