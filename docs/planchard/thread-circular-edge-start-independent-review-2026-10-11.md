# Thread circular-edge start — independent review

Read-only review, 2026-10-11; no production edits or browser/CAD authorship by reviewer.

Independent command `node --test tests/thread_circular_start.test.mjs tests/custom_thread_ui.test.mjs tests/thread_placement.test.mjs tests/unc_cosmetic_thread.test.mjs`: **20/20 PASS**. Reviewed `core/thread_circular_start.js`, `modeler.js::selectedThreadStart/createThreadFeature`, catalog selection and meaningful native regression. No confirmed defect in declared initial-placement scope.

Full circular native edges require finite centre, positive radius, valid axis and native circumference matching2*pi*r. A unique equal-radius coaxial cylinder with native referenceOrigin/axisRange must place the circle at one end of its nonzero range. Interior rims, partial arcs, noncircular/planar support, mismatched geometry, missing range and ambiguous support reject. This is strict analytic boundary matching, not nearest-face selection; the helper does not claim decoded topological adjacency identifiers.

Direction is cylinder-axis at its lower station and reversed at its upper station. Tests cover both ends and an oblique axis, so screen orientation/world-Y guessing is avoided. The ordinary selector reacquires the selected edge by persistentID+owner from current target native topology and validates captured geometry. Same-ID changed radius and staleID fail without authoring/history.

Actual native cylinder R.3175cm/L5.08cm regression uses regenerated kernel topology and the production selector/creator functions: starts at the genuine free circle, points inward+Y, records both face and edge references, preserves6.35mm diameter, and survives JSON cold compile/regeneration. Native volume before/after cosmetic annotation agrees within1e-8 and regenerated result remains cosmetic-thread. This is real kernel evidence, not a mocked volume assertion.

Existing face placement remains priority and its bore/negative-axis regressions pass; Helix/Knurl code was not changed. For source5.16 browser proof, clear the face selection and pick the free circular edge alone. Current selected start is retained as params and source references; this review does not claim general automatic placement recomputation after arbitrary upstream edge movement. Exact stepped companion geometry and browser cold proof remain separate tasks described in `exercise-5.16-official-companion-source-ready-plan-2026-10-11.md`.

Independent `npm run check`: **PASS**, no free identifiers, no link errors686 modules, all1487 source assertions checked.
