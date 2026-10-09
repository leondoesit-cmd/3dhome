# Regular polygon fillet preservation

Source-only repair for the browser-observed Advanced Q1 first-corner fillet. Actual protected failure: `artifacts/planchard/ADVANCED-Q1-polygon-fillet-failed-browser-2026-10-09.mforge`. Independent constraint diagnosis: `artifacts/planchard/ADVANCED-Q1-polygon-fillet-constraint-diagnosis-2026-10-09.json`.

The existing equal-side constraints compared trimmed physical lines with untrimmed polygon lines, forcing the original regular polygon to move. When **Keep constrained corners** is enabled, equal-side measurements now reference construction copies of the original sharp sides. Original endpoint IDs survive successive corner fillets. Angle and supporting-line relations remain on the physical lines; no original equal constraints are discarded. Construction measurement copies are excluded from corner picking. Existing radius validation and transactional handler rollback remain intact.

`tests/sketch_polygon_fillet_preservation.test.mjs` executes the real modeler fillet handler with the real solver and Undo history. Before repair, the first-corner case reproduced the movement (4.336051224cm original right vertex became 4.295339cm). After repair, the R0.5in center is exactly (2.54,0)cm and all original sharp corners remain fixed. Four sequential fillets, a driving diameter edit after JSON reopen, Undo/Redo, and oversized-radius rejection are covered.

Validation:

```
node --test tests/sketch_polygon_fillet_preservation.test.mjs tests/sketch_fillet.test.mjs tests/sketch_dimensioned_polygon.test.mjs tests/planchard_line_arc_fillet.test.mjs tests/planchard_fillet_arc_pick.test.mjs
```

25 tests passed, zero failed.

`npm run check` passed: no free identifiers, no link errors (653 modules), 1489 source assertions checked. `git diff --check -- js/sketch_fillet.js tests/sketch_polygon_fillet_preservation.test.mjs` passed.

This report does not claim browser acceptance or a completed Q1 model. Parent owns the fresh Chrome repetition and book workflow. Existing failed sketches are not automatically rewritten.
