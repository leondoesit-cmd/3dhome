# Saved BATTERYPLATE recovery fixed

Implemented 2026-09-16 under the user's explicit request to fix the bug.

- Saved sketch supports now reject an exact-ID match whose planar normal contradicts the retained reference descriptor. A unique parallel face with comparable area and in-plane position can recover the support across a depth change. Missing/ambiguous recovery fails rather than choosing an arbitrary wall.
- Canonical saves now copy successful kernel reference repairs back into authored features and shared sketches, rebuild the repaired document, and persist its topology cache and audit trail.
- The open document and coach refresh from the accepted saved result.

Browser validation used the actual `BATTERYPLATE - support frame retest` library record. It initially showed no floor holes and a rim notch. The new path recovered both terminal supports from plane:4 to plane:2. Both floor holes returned and the notch disappeared.

Saved `BATTERYPLATE - repaired support`, reloaded the entire app, then opened that saved record directly from the library. Both holes remained in Top view, the rim was intact, and the tree/footer reported Rebuild succeeded with no repair warnings. This was a real browser save/reopen check, not an injected model.

Validation: 94 distinct focused tests passed across saved support, Planchard battery/plate, parametric UI/core, kernel topology, exact cache, topology/rules and descriptor immutability. npm run check passed. Full test suite was not run.

Changed in this fix: js/core/topology.js, js/modeler.js, tests/cad_saved_support.test.mjs. Existing unrelated working-tree changes were preserved.
