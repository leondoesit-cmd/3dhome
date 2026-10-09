# Multi-chain Thin Extrude native validation — 2026-10-09

The native associative resolver now regenerates all ordered `regionProfileEntityIds` chains instead of discarding them for Thin Extrude. `thinMode` governs the primary chain; `thinRegionModes[index]` governs the corresponding additional chain, falling back to the primary mode. Every chain retains exact analytic segments and is resolved before any solid is built. Missing chain references reject resolution without changing the source document.

Source Q2 uses one guide followed by a mirror. The generic multiple-chain repair is a separate authorized app capability; this validation does not author or alter any final exercise model.

The inclined termination test uses the source guide coordinates X .375..2.2, start Y .5, thickness .38, and the supporting plane through C=(.95,2.66506351,0)−.26n with n=(cos30°,sin30°,0). The face intersects the sketch start within the guide. Native Up To Face already clips the positive wedge correctly: the part beyond that intersection is absent, material beyond the face is absent, and analytic wedge volume matches. Both a single guide and two independently sided guides merge with a base and inclined plate into one valid solid. No kernel clipping change was required for this source case.

Validation:

- `tests/cad_thin_multi_region.test.mjs`: 3/3 pass. Checks independent wall sides, legacy uniform fallback, invalid-chain rejection without mutation, thickness edits, compiled multi-chain Cut and additional-chain edits, partial inclined termination, and valid single-solid contact.
- Existing `cad_thin_extrude.test.mjs` and `cad_up_to_face.test.mjs`: 19/19 pass in the related run. Together, 22 affected native cases passed; the final added Cut test was run with the other two new cases after the existing related run.
- Shared `npm run check`: no free identifiers, 653 module links, 1489 source assertions pass. UI agent separately reports its own focused checks and shared gates.

Only `js/cad_feature_tree.js` and the new native test file belong to this core repair. Browser creation and UI selection are owned by the parent and UI agent. No authored bundle, STEP, ADVANCE file, or source model was mutated by this validation.
