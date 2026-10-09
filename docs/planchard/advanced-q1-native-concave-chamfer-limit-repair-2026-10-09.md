# Q1 native limiting concave Chamfer — 2026-10-09

The existing Chamfer operation now handles a verified limiting circular concave corner at exactly its cylindrical wall height. This is a native operation repair, not a new exercise feature or a silently substituted tapered cut. No actual Q1 geometry was authored by these fixtures.

Before repair, a Ø1.5 recess from Z2.6 to2.5 in followed by the Ø.75 through-bore supplied the correct lower recess edge R.75/Z2.5. Chamfer .1in failed in both equal-distance and45° distance-angle modes, for either flip. A .099in chamfer succeeded. The exact full-height case collapses the last cylinder strip and the OCCT rolling chamfer rejects it.

The fallback runs only after a native Chamfer build failure, with one explicitly selected edge. It requires a full circular plane/cylinder corner, uninterrupted cylindrical wall with height exactly equal to distance, a concentric annular floor whose inner boundaries clear the bevel, open termination, and independently probed concave material sides. Only equal-distance or exactly45° distance-angle modes qualify. The same analytic annular bevel wedge is united with the original body; exact gain, validity and unchanged solid count are checked. Unrelated build failures remain errors. Ordinary partial chamfers continue through OCCT.

Native verification yields one valid solid and a true cone with reference origin (0,0,63.5)mm, axis+Z, reference radius16.51mm=.65in, semi-angle45°, axial range0..2.54mm. Its boundary circles are R.65/Z2.5 and R.75/Z2.6 in. External bounds and the Ø.75 bore are preserved. Native probes confirm added material at R.70/Z2.51, empty pocket at R.70/Z2.59, and empty through-bore. The gain equals the analytic circular bevel volume without approximating distance or angle.

For the parent's actual browser, select the **counterbore bottom rim**: a complete circle centeredX0/Y0, radius.75in, atZ2.5in, belonging to the recess producer. Do not reuse synthetic fixture transport IDs. The native exact geometry, not an opaque original SolidWorks selector ID, establishes this valid operation.

Validation: 4 new native regression tests pass, including both modes/flips, exact cone circles and volume, .099in unchanged behavior, missing targets, over-height distance and unsupported failed60° cases. Existing kernel topology suite29/29 passes (combined32/32 before the additional guard assertion; latest new4/4 passes, including reverse-cut cylinder orientation). Shared gates pass653links/1489assertions. Core change is confined to `js/cad_kernel.js`; regression file is `tests/cad_concave_chamfer_limit.test.mjs`.

Evidence: `ADVANCED-Q1-concave-counterbore-chamfer-native-fixture-2026-10-09.json`, historical `ADVANCED-Q1-concave-counterbore-chamfer-pre-repair-failure-2026-10-09.json`, and separate `.099in` sub-limit verification. Inputs to these fixtures are disposable local verification shapes; no model bundles, browser geometry, ADVANCE, or source part were altered.

