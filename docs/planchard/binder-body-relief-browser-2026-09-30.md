# Binder body hinge relief — 2026-09-30

This repair modifies only the binder body created from blank during this book run (`cm_muncw1yf`). It is a designer example for Exercise 8.3, whose dimensions are not specified by the book.

## Browser authoring

Chrome tab 710858437 loaded the fresh library body. A new Right-plane centre rectangle was authored through visible controls, with width Z = 0.12 in, height Y = 0.28 in, centre (0,0), fixed centre, and driving dimensions. An Extrude Cut with Mid-plane extent and total X depth 0.76 in removed the central portions of both hinge rolls (X −0.38 to +0.38 in). Four short hinge ears remain. The narrow adjoining lip relief is intentional. Both original sketches and the new relief sketch remain fully defined; the model has seven editable history steps.

The body was saved to its existing fresh library record. Root owns the assembly and will update its component from this library revision before checking interference.

## Native verification

Visible Mass properties reports Exact solid geometry, one Body 1, Plain Carbon Steel (grade unspecified), density 7.85 g/cm³, volume 1.003416 cm³, mass 7.876817 g, and centre of mass (0,0,1.333239) cm. The exported STEP contains exactly one MANIFOLD_SOLID_BREP.

Protected browser exports:

- `artifacts/planchard/BINDER-body-relieved-browser-2026-09-30.mforge` — compact 1.04 MB UI project bundle; mainModel id cm_muncw1yf.
- `artifacts/planchard/BINDER-body-relieved-browser-2026-09-30.step` — native STEP, 135,914 bytes.
- `artifacts/planchard/BINDER-body-relieved-exact-browser-2026-09-30.png` — visible four-ear geometry and native exact mass proof.

## Hinge solver regression

Added the meaningful synthetic hinge test in `tests/planchard_ch8_mechanical_mates.test.mjs`: a drifting handle at ry = −150°, constrained by concentric axis, Right centre plane and Front angle limit 0–150°, must recover without tilting its held axis, remove translation drift and retain one rotational DOF. Repeated solving remains clean. The root-owned solver fix was not edited here.

Focused mechanical/limit mate tests: 13/13 passed. `npm run check`: passed, with no free identifiers, no module linking errors (593 modules), and 1,490 source assertions checked.
