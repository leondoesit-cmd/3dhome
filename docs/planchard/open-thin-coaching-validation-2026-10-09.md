# Open Thin sketch readiness

Source-only repair for the valid Advanced Q2 open Thin Extrude guide being described as an error and coached to close its profile.

The sketch card and ribbon distinguish **open path availability** from **Thin Extrude readiness**. An unconsumed valid open line/arc path has a neutral availability message; the coach offers Finish sketch for Thin Extrude, or a single path for Rib/Sweep. Active and saved Thin extrusions validate their actual finite positive thickness, side, and chain references before showing readiness. Multiple independent valid Thin chains are supported. Branches, zero-length paths, unsupported geometry, missing selections, and invalid Thin widths remain warnings. An ordinary extrusion with Thin disabled still requires a closed profile, even if that sketch previously fed a Rib.

Changing Thin parameters updates the existing readiness card and ribbon without rebuilding the document or replacing the inspector. Valid open-path endpoint rings are blue; invalid/ordinary-open and branch markers retain their warning colors. No stored geometry, feature parameters, native engine behavior, or saved model is changed.

Focused actual-handler validation:

```
node --test tests/open_thin_coaching.test.mjs tests/committed_sketch_plane_ui.test.mjs tests/modeler_finish_preview.test.mjs tests/modeler_refresh_work.test.mjs
```

32 tests passed. The six new readiness tests exercise the real presentation, coach, and live-feedback functions, including changing a green Thin card back to an ordinary-open warning. Readiness leaves the sketch byte-identical.

Related UI/native validation:

```
node --test tests/open_thin_coaching.test.mjs tests/thin_extrude_multi_chain_ui.test.mjs tests/rib_profile.test.mjs tests/parametric_ui.test.mjs
```

39 tests passed, including existing multi-chain Add/Cut native cold regeneration, saved side selection, Undo, and terminating-face persistence.

Final `npm run check` passed: no free identifiers, no link errors (653 modules), 1489 source assertions checked. Scoped `git diff --check` passed.

Browser acceptance remains parent-owned; no Chrome actions or CAD model authoring were performed by this subagent.
