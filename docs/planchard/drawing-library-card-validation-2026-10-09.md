# Drawing-only library card classification — validation, 2026-10-09

The actual browser-authored worksheet was first labeled `Sketch only · 0 Sketches`. The initial source classification patch passed synthetic zero-history cases, but actual cold reopening then showed `Sketch only · 1 Sketch`. The protected 6034-byte `DRAFTING-1.1-1.3-qualified-browser-2026-10-09.mforge` explains the missing case: the editor created one empty Top working sketch `sk_0iq6o`; canonical normalization then added `history:sketch:sk_0iq6o`. Its points, entities and constraints are all empty; it supplies no source geometry or native solid.

The current classification uses actual visible content. With no parts/features and no sketch points/entities/constraints, saved valid paper annotations/notes produce `Drawing · 8 annotations · 3 notes` for this actual fixture, even when empty sketch history exists. All original sketch/history records remain untouched. A deliberately authored empty sketch document without drawing content retains its existing `Sketch only` label and saveability. Real point-only or entity-bearing sketches and solid content retain their existing classification. Singular/plural English and Hebrew labels are supported; blank/malformed sheets do not become authored drawings.

The helper is a pure read-only classification operation. No save/history normalization semantics, persisted document bytes, geometry, cache or model authoring are changed. In particular, no history rows are deleted based on guessed provenance.

Validation:

- `node --test tests/drawing_library_card.test.mjs tests/model_sketch_only_save.test.mjs tests/drawing_primitives.test.mjs tests/drawing_multiline_notes.test.mjs`: **20/20 pass**, including five card cases. New regressions read the actual protected qualified worksheet without mutation and recreate the real `ensureSketchDoc` → `ensureParametricDocument` working-sketch/history normalization path in a disposable synthetic document. Existing empty authored sketch save/library cases pass unchanged.
- Module checks: no free identifiers and **658 module links**. Final source-assertion gate result is recorded below when complete.
- The parent's concurrent full-suite run began on prior checkpoint `b3f3eb9`; that run is not evidence for this later classification amendment. No full-suite rerun or cold browser acceptance is claimed by this report.

Browser next check: reload and inspect the actual Saved models worksheet card, expecting Drawing counts; open it and verify all eight annotations and three notes remain. Preserve the existing source worksheet history and drawing data.

Owned changes: `js/core/model_save_policy.js` content classification, narrow Saved-model card block in `js/modeler.js`, five labels in `js/modeler_strings.js`, and `tests/drawing_library_card.test.mjs`. No actual model/export or ADVANCE changes.

Final gates: npm run check passes — no free identifiers, 658 module links, 1489 source assertions. Scoped git diff --check clean. The final amendment after b3f3eb9 changes only the helper and its tests; the previously committed card wiring/labels are reused.
