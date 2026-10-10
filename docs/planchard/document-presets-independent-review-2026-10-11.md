# Independent Part / Assembly document-template review

Accepted within the bounded settings-only native document workflow. Read-only independent command `node --test tests/document_presets.test.mjs tests/drawing_presets.test.mjs`: **13/13 PASS** after the provenance follow-up. No code edits by this reviewer.

Capture excludes geometry, sketches, mates, materials, source identities and drawings. The strict local schema permits only the documented units/standard/projection/precision/dual-dimension defaults. New-from-template requires a matching kind and a fresh blank document, retains its new identity and deep-copies defaults. Local persistence validates records, duplicate identities, limits and corrupted libraries; chooser/capture/properties dialogs guard owner and Undo-node identity. Properties commits reacquire the current normalized owner after history capture. New creation respects unsaved-document discard authorization. New drawings consume defaults once; existing drawings retain their values.

One confirmed validation gap was reported and fixed by the owner: blank-save provenance initially accepted truthy nonstring IDs/names. The final `hasDocumentPresetDefaults` now rejects extra keys and delegates identity/version/name/kind/default validation to the strict preset validator. Regression covers numeric/object/blank identity, invalid kind and unexpected geometry provenance. Valid template blanks remain saveable without dummy CAD; ordinary unconfigured blanks remain unsaveable.

This review does not claim actual browser template capture, library reopening or source-book completion. Parent owns those witnesses. Owner's required gates are reported separately; this independent run did not repeat the full module gate or full CI.
