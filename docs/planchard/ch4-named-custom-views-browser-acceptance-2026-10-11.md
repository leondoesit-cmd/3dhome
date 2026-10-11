# Chapter4 custom named views — actual browser warm/cold audit

**Accepted Part workflow for supplied PDF201 / printed4-21.** Parent authored two camera records through ordinary Chrome **Named views → Save current view… → View name → Apply** on independent Saved copy `cm_mv31o07x_6477`, recalled both, deleted one and restored it with Undo, saved clean, hard reloaded and reopened the exact Saved record. Parent observed the two names and both projection states after cold reopening. This read-only audit compares the three protected actual browser bundles; it does not author CAD or inject application state.

Files: `artifacts/planchard/CH4-named-view-baseline-browser-2026-10-11.mforge`, `CH4-named-views-warm-browser-2026-10-11.mforge`, `CH4-named-views-cold-browser-2026-10-11.mforge`. Hashes, sizes and every changed JSON path are preserved in the companion acceptance JSON. Actual cold PNG inspected: native one-solid patterned Part, five history steps, fully defined sketch and clean Save are visible.

## Persisted records and naming qualification

Both records survive cold byte-for-byte within `mainModel.metadata.namedCameraViews`:

|ID|User name|Actual pose|
|---|---|---|
|6477|Orbit perspective|azimuth0.8rad, elevation0.5rad, distance14.474805698177788cm, zoom1, world target(0,0.4,0)cm, perspective orbit|
|6478|Normal To front|same distance/target and retained perspective orbit preference; fixed **Top** datum origin(0,0,0), xAxis+X, yAxis+Z, normal+Y|

“Normal To front” is free user-entered text; it does **not** identify an actual Front frame. The stored geometry and inspected cold top-down image prove a Top-aligned Normal To camera. Recall correctly forces orthographic, with Perspective unchecked/disabled, and recalling Orbit restores perspective checked/enabled. The retained `projection:"perspective"` in the fixed record is the orbit preference, not the actual fixed-frame camera projection.

## Full source and derived comparisons

Baseline/warm/cold IDs, Saved key/name, local frame, references, fully defined sketches/constraints, canonical features, five-entry feature history, drawing, configurations and rollback head are **deep exact**. Read-only `compileKernelFeatureTree` yields the same eight lowered feature records and no issues for all three. Native mesh positions and normals are exact baseline→warm→cold; one native solid remains. All six cached native topology payloads are exact after excluding only their compilation signature strings.

Baseline→warm has exactly **18 changed paths**, individually listed in JSON. Named-view metadata is added; export/rebuild/standards timestamps and the derived mesh build token change; native mesh bounds are added. In addition, legacy top-level `w/h/d` and the matching planner-exposed width/depth/height parameters are removed. These dimension metadata removals are disclosed normalization changes, not a claim of whole-document identity. The six compilation signature strings differ **only** in that planner parameter map; their feature/sketch inputs and cached geometric payloads are unchanged, and the actual lowered feature records remain exact. Existing mesh dimensions remain68×8×68mm.

Warm→cold has exactly **three changed paths**: export `createdAt`, `lastRebuild.rebuiltAt`, and removal of optional derived `parts[0].meshData.bounds`. The complete document becomes deep exact after excluding just those paths. The whole native mesh is exact after removing that optional bounds field; all named-view metadata, native topology signatures/payloads, canonical CAD and drawing fields persist exactly. No broad derived-field exclusion is used.

## Scope and isolation

The protected exports contain this independent Part as `mainModel` and no assembly/drawing library collection. They therefore prove the witness's distinct Saved key and stable source body, but cannot independently establish before/after identity of every original library record. Parent reports the original pattern copy was preserved. Assembly capture/recall/persistence is covered by real production-form/core tests and shared visible menu integration, but **an actual Assembly named-view browser witness is not claimed by these files**. No fresh native kernel/STEP regeneration was needed or performed for camera metadata; geometric comparisons use the actual browser's protected native mesh/cache plus identical compiled canonical records.

The corrected implementation has20/20 focused tests,690/1487 gates and independent review. The ongoing full-CI snapshot predates the narrow numeric-ID caller correction; its result is separate from this actual corrected-browser acceptance.

## Actual Assembly warm witness

Parent subsequently created independent Saved assembly `asm_mv328jas_6477`, name `Planchard Ch4 assembly named views witness - browser 2026-10-11`. Ordinary capture persists exactly one record `6481`, **Assembly orbit**, perspective az0.8/el0.5/dist17.3972438795759cm/zoom1, world target(3.008386832996358,1.65,1.9130696583641602)cm. Parent changed to Top, recalled Assembly orbit and observed perspective enabled, then saved clean. The assembly menu contains none of the two Part names.

Actual `CH4-assembly-named-views-baseline-browser-2026-10-11.mforge` → warm export contains **five changed paths**: metadata addition, export timestamp and three Moving-occurrence orientation numeric normalizations. `ry` changes26.00000000002113→26deg; quaternion y/w changes are at most1.94×10⁻¹³. Translation, authored body definitions and both native topology mates remain exact. This finite pose roundoff is disclosed rather than classified as byte identity. The accompanying Part `mainModel`, including both Part named records, is deep exact across these assembly actions, proving actual per-document isolation in this combined bundle.

### Assembly cold acceptance

Parent hard reloaded, reopened the exact Saved assembly key, saw only Assembly orbit in its menu, changed to Top and recalled the saved perspective pose. Protected `CH4-assembly-named-views-cold-browser-2026-10-11.mforge` persists that entire named record exactly. The **complete baseline assembly object is deep exact to cold after removing only newly added named-view metadata**. Warm→cold restores the same three orientation values to their baseline solver precision; excluding those three finite numbers, the complete warm/cold assembly is deep exact. Both authored native component definitions and both mates remain exact.

The cold whole bundle has23 changed paths, all listed in JSON. It contains a fresh inactive blank `mainModel` named New model and uses top-level export unitscm instead ofmm. The active document remains assembly `asm_mv328jas_6477`. Replacement of that inactive Part context is not evidence of original Saved Part deletion; it does not modify assembly geometry, constraints or saved world-cm camera data. Consequently whole-bundle byte identity is explicitly **not** claimed. Actual per-document separation is established by the deep-exact retained Part in the assembly baseline/warm bundles and the assembly's distinct cold record, not by asserting preservation of every library record.

Both ordinary **Part and Assembly named custom-view workflows are now accepted**, with the Top-frame user-label and finite transform/export-context qualifications above. These are source4-21 workflow proofs, not a whole587-page completion certificate.
