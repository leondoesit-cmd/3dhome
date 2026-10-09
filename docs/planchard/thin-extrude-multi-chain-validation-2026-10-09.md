# Thin Extrude multi-chain source validation — 2026-10-09

Confirmed gap: the browser creation pipeline rejected every Thin Extrude containing more than one disconnected open chain. Native sketch regeneration also discarded additional thin regions. The repair supports independent open chains without changing existing single-chain geometry or guessing which side is outward.

The creation form offers chain subsets and an explicit thickness side for each chain. An existing explicit geometry selection initializes the chosen subset. Empty selection means all eligible chains. Per-chain overrides survive selection toggles; unsupported overrides fail before geometry changes or Undo capture. Add follows the existing multi-region convention: one feature per chain within one Undo. Each merged feature consumes the current body head. Cut uses one feature containing all chosen chain references. Temporary UI settings are removed from persisted native recipes; the primary chain stores `thinMode`, and additional chains store aligned `thinRegionModes` alongside `regionProfileEntityIds`.

Source files: `js/modeler.js`, `js/modeler_strings.js`, `js/modeler_thin_extrude_profiles.js`. Native agent owns `js/cad_feature_tree.js`. The native resolver regenerates every region's analytic segments, including after source edits, with uniform-mode fallback for older recipes. Existing inclined Up To Face splitting required no kernel changes.

Validation command:

```powershell
node --test tests/thin_extrude_multi_chain_ui.test.mjs tests/cad_thin_multi_region.test.mjs tests/cad_thin_extrude.test.mjs tests/submillimetre_extrusion.test.mjs tests/cad_merge_result.test.mjs tests/modeler_browser_qa_regressions.test.mjs
npm run check
```

Results: **47/47 focused tests pass**. Actual source creation handlers verify two Add features merge sequentially into one body, one Undo restores the original body, Redo restores both features, and JSON cold regeneration gives the independently calculated 8.4 cm³ volume. Actual Cut creation serializes both chains and opposite sides into one feature; cold native regeneration removes both bands and yields 32.4 cm³. Native tests cover additional-chain edits, uniform-mode compatibility, rejected missing references, and source-shaped single/two-guide inclined-face termination. Gates pass: no free identifiers, **653 linked modules**, **1,489 source assertions**.

This report records source and synthetic/native tests, not actual book model authoring or final browser acceptance. The official Q2 feature history uses one guide followed by a mirror; the parent retains that source workflow. No geometry, ADVANCE, staging, or commits were performed by this agent.

## Actual Q2 terminating-face follow-up

The protected failed browser bundle `ADVANCED-Q2-thin-up-to-face-failed-browser-2026-10-09.mforge` exposed a separate reference-ownership defect. Boss7 (`feature_mv0b6zjb_1`) saved the correct inclined rear plane as `feature_munnngt6_2:tool:face:end`, but its dependency owner was the generated native `feature_munnngt6_2:tool`. The authored graph contains Boss2 (`feature_munnngt6_2`), not its lowered tool node. Earlier Boss2 parameters/references and its datum support were unchanged from the clean baseline: the error was attributed to the referenced owner, not evidence of a self-reference mutation.

The terminating-face dropdown and the creation persistence boundary now use existing `canonicalFeatureTopologyReferences`. They retain the exact persistent ID and descriptor while assigning the authored dependency owner. The second boundary also covers viewport selections that bypass the dropdown. No face geometry, upstream sketch, feature parameters, or stored models are edited by this repair.

```powershell
node --test tests/thin_extrude_multi_chain_ui.test.mjs tests/terminating_face_picker.test.mjs
```

**10/10 tests pass**, including a reference descriptor copied from the actual failed Q2 export, unchanged upstream definition and picked-entry assertions, and actual creation-handler persistence of raw viewport-generated ownership. The native agent separately verified disposable regeneration of the protected failed bundle as one valid solid (198.2632872289938 cm³). This is native validation, not a claim that the new browser feature has been accepted yet.
