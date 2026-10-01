# UI repairs and fresh QuattroSeal progress

## Repairs

- `modeler.js` ignores unsupported keyboard payloads before changing tool state; regression exercises missing, empty and non-string keys while a cut is pending.
- Draft listing filters malformed records without modifying or deleting storage. Valid fresh parts and assemblies remain available. Actual desktop Chrome opened Saved Drafts without the prior null `def` exception. Screenshot: `artifacts/planchard/SAVED-DRAFTS-null-repair-browser-2026-09-28.png`.
- Dynamic length input parses explicit mm/cm/m/in/ft using the document dimension parser, preserves unit suffix keystrokes and avoids duplicating the document unit in the HUD. Plain numeric input retains the active document unit. Focused tests pass 3/3. Actual fresh desktop Chrome acceptance: in a cm document, typing separate `1`, `0`, `0`, `m`, `m` then Enter makes a circle with R5 cm and a driving diameter 10 cm. Screenshot: `artifacts/planchard/UI-explicit-mm-in-cm-browser-2026-09-28.png`. Test-only unsaved tab was closed. Logs contain the known Chrome extension `page-events.js` key handler error; no product modeler error.
- Sketch copy/paste remaps standalone `point.p` and spline handle IDs. Regression checks fresh references resolve and the source geometry remains unchanged. Parent will verify HOUSING by Undo/reload/repaste in Chrome.
- Pierce picker now includes circles already supported by the relation engine. The picker regression verifies a non-construction crossing circle appears and its relation target follows a radius edit.
- Exact regeneration resolves external relations for every referenced Sweep/Loft source sketch, including source records without a direct `sketchId`. New `sketch_relation_sources` tests verify a pierced profile and derived sweep geometry move with an edited circular path, and unavailable sources refuse regeneration.

Latest `npm run check`: no free identifiers, no link errors (588 modules), 1489 source assertions. Logs: `scratch/planchard/ui-sweep-pierce-sources-check-2026-09-28.log`, `ui-explicit-unit-tests-2026-09-28.log`, `ui-pasted-point-regressions-2026-09-28.log`.

## Exercise 7.1

Built from a blank model in desktop Chrome, not a pre-existing seed or scripted geometry. Book PDF page 369 specifies Front Ø100 mm path and Top section R5/R10 with 15 mm horizontal center spacing. Vertical 9 mm spacing is a chosen estimate explicitly recorded in the model description and named `LobeCenterHeightEstimated`.

Saved library name: `Planchard Exercise 7.1 - QuattroSeal - fresh 2026-09-28`.

Both sketches are fully defined. The section has eight arcs, one closed region, four driving dimensions (`OuterLobeRadius`, `ConcaveRadius`, `LobeCenterWidth`, `LobeCenterHeightEstimated`), six Equal relations, eight Tangent relations and four center alignment relations. Fifteen initial Fix anchors were removed; one placement anchor remains.

Actual browser edit acceptance: width 15→16 mm moves the left lobe centers from X42.5→41.5 mm and adjusts tangent concave centers and join points. The profile remains fully defined and closed. Undo restores the baseline. This validates dimension-driven shape, rather than accepting fixed-coordinate geometry alone.

Initial fixed-coordinate checkpoint is preserved as `artifacts/planchard/QUATTRO-SEAL-7.1-profile-browser-checkpoint-2026-09-28.mforge`; it is not the final dimension-driven checkpoint. Dimensioned exact sweep before Pierce is protected as `QUATTRO-SEAL-7.1-dimensioned-sweep-before-pierce-2026-09-28.mforge`.

Exact baseline sweep: one solid, 125×125×19 mm, volume 129.7269 cm³, center of mass at the origin. Material is unspecified: UI explicitly assumes steel density 7.85 g/cm³ and shows mass 1.018356 kg; that is not an ebook rubber material claim. Screenshot `QUATTRO-SEAL-7.1-exact-sweep-browser-2026-09-28.png`.

An actual path diameter edit initially left the fixed profile placement unchanged; failure screenshot `QUATTRO-SEAL-7.1-path-edit-failure-browser-2026-09-28.png` is retained. Replaced the last Fix anchor with a construction diagonal between opposite lobe centers, a center Point, Midpoint and Pierce to the Front circle. Current section has no fixed point anchors, four drivers, 24 constraints, ten entities, one region and zero DOF. The circle picker and exact source relation repairs above close the associated workflow gaps.

Actual Ø100→102 path edit now translates the center to X51 mm, outer NE center to X58.5 mm, and the remaining profile points by +1 mm. Both sketches remain fully defined; swept bounds become 127×127×19 mm with one body. Exact edited volume132.3215 cm³ is 1.02× the baseline, COM origin; steel-default mass1.038723 kg. Screenshot `QUATTRO-SEAL-7.1-path-edit-accepted-browser-2026-09-28.png`. Undo restores clean Ø100 baseline with centerX50. Read-only inspection of the actual exported bundle verifies circleR5 cm, Pierce targetX5 cm and original profile placement.

Final Chrome exports protected: `artifacts/planchard/QUATTRO-SEAL-7.1-fresh-browser-2026-09-28.step` (47,278 bytes) and `.mforge` (87,655,586 bytes). Canonical saved library model reopened after source reload. Independent native replay is deferred while the parent's HOUSING rebuild uses the shared native queue. The browser workflow is accepted; no annotated drawing claimed.

## Limit mate travel stop classification

Repaired `cad_mate_solver.js` freedom classification so a nonzero Limit interval retains translation mobility at either stop. The position inequality remains active in the numerical solve, while freedom rank retains orientation restrictions and equal-min/max limits. Focused limit/reference regression run passes 10 tests, including upper/lower stop, repeated solve, return to interior, and zero-width locking.

Actual fresh Chrome test tab408 reopened the protected labeled axle/collar example. Native keyboard Z2 clamped to1.099999997cm with1DOF; Z−1 clamped to.200000004cm with1DOF; returningZ.9 retained1DOF. Original library entry was not overwritten. Evidence: `artifacts/planchard/LIMIT-MATE-stop-mobility-browser-2026-09-28.png`.
