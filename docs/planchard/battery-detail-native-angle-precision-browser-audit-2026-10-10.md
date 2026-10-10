# BATTERY Detail — native angle and precision browser audit

Actual parent Chrome exports inspected: `BATTERY-front-detail-native-three-dims-browser-2026-10-10.mforge` → `BATTERY-front-detail-native-angle-precision-browser-2026-10-10.mforge/svg`. These were authored through ordinary native drawing controls by the parent; this audit is read-only. Source supplied PDF453 / printed9-19 and PDF455 / printed9-21 Model Items.

**Qualified actual browser witness passes.** Existing Detail `v1eocwbj` gains two real native cone draft-angle Model Items; all five Detail dimensions resolve without dangling references. Whole drawing dimension count10→12. Three linear dimensions retain authentic native references and empty `text`, with per-dimension `precision:3` only:

|Actual dimension|Native remeasurement|Rendered label|Native source|
|---|---|---|---|
|`dhumrh4o`|1.524cm|0.600 [15.24]|Entity61 top/base rims,qu+|
|`dv869w4b`|1.143cm|0.450 [11.43]|Entity64 top rim,qu−; lower wall/fillet tangent line3,b|
|`d0g16lgq`|.508cm|0.200 [5.08]|Upper rim circle10,qu−; recess floor native line4,a|
|`dsedjy7q`|5.000000000000007°|5°|Feature7 native conical face/source draft-angle key|
|`d3uo8jpz`|5.000000000000007°|5°|Feature8 native conical face/source draft-angle key|

Angular bindings are `coneAngle:{faceId,featureId,side:1}` and `modelItem:feature:<featureID>:draftAngle`. Both actual faces are `<featureID>:tool:face:generated:cone:1`; the native semiangle/axis/radius/range derive true generator and parallel-axis rays. No arbitrary seam, frozen5° string or literal displayed-value override is used. Actual protected SVG contains two5° text labels. The book has one representative draft callout; two independent source features give two genuine, slightly redundant callouts without changing geometry.

All source **features, sketches and metadata are exact** against the actual three-linear-dimension baseline. Recursive parts comparison changes only `parts[0].exactBuildToken` and added `parts[0].meshData.bounds` (previously absent, now x/z±3.429cm,y0→11.43cm). Native positions, topology, exact bounds and authoring geometry remain exact. This is preservation evidence, not a new independent kernel/STEP validation.

Machine-readable read-only audit: `artifacts/planchard/BATTERY-front-detail-native-angle-precision-readonly-audit-2026-10-10.json`; helper `scratch/planchard/battery-detail-angle-precision-audit.mjs`. Native driver5→8/restoration and duplicate insertion have meaningful implementation tests; no new actual browser source-angle driver is claimed here.

## Actual cold acceptance

Parent clean Save→cache-bypass reload→exact Saved BATTERY record→Native1 produced protected `BATTERY-front-detail-native-angle-precision-cold-browser-2026-10-10.mforge/svg`. Independent comparison against the qualified angle/precision export: **whole Drawing, all features, all sketches and model metadata EXACT; actual SVG BYTE-EXACT**. Part changes remain limited to derived `exactBuildToken` and `meshData.bounds` presence; native mesh positions/topology, source authoring geometry and exact geometry bounds are unchanged. All three per-dimension precision overrides and both native cone-angle source bindings persist in the exact Drawing. This bounded actual Detail angle/precision cold witness is accepted, without extending it to an unperformed browser source-angle driver.

Code is frozen. No CAD authoring, source/protected export mutation, ADVANCE or Git action.
