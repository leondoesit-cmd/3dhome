# Advanced Q2 repaired browser checkpoint — independent audit, 2026-10-09

**Native/browser consistency passes; source acceptance remains pending.** Protected actual Chrome bundle `ADVANCED-Q2-source-repaired-browser-2026-10-09.mforge` and native STEP match by exact bidirectional Boolean subtraction: zero residual solids and volume in both directions. Read-only regeneration has no native issues and produces one valid solid.

|Observed quantity|Native result|
|---|---:|
|Volume|210.449177767357 cm³ / 12.842396769022 in³|
|Mass at preserved printed .097 lb/in³ density|565.045679133281 g / 1.245712486595 lb|
|World COM, mm|43.089899395579, 25.319957010582, approximately 0|
|World COM, in|1.696452732109, .996848701204, approximately 0|

These differ from printed 14.05 in³ and COM (1.59,1.19,0) in. Compared with independently extracted companion cached COM (40.375,30.274,0) mm, residuals are +2.7148994 and −4.9540430 mm. The companion cached 230000 mm³ is rounded, not an exact geometric target. No dimensions or density were fitted to either result. The backing profile remains under independent source inspection; a hypothesized missing half-disc is not accepted solely because its volume resembles the residual.

The saved repaired model contains 26 history entries, 14 authoring features (12 active), and 12 fully defined sketches. Old triangle Boss6 and its old Mirror1 remain suppressed as diagnostic history. Against the protected clean-guide Undo baseline, all eleven prior feature recipes, inputs, references and suppression states and all eleven prior sketches' points, entities, constraints, planes, support and frame fields are exactly preserved.

Three actual new browser features are inspected:

- Thin Boss7 `feature_mv0behi8_1`: fully fixed Top guide `sk_18pq9`, X .375..2.2, physical Z−1 in; normal +Y, start Y0, outward Other Side .38 gives Z−1.38..−1. Up To Face owner is canonical Boss2 while its persistent address retains the generated native end face. Plane stations yield exposed endpoints (.375,3.140992723813)→(1.899777860021,.5) in.
- Mirror2 `feature_mv0bf66o_2`: feature scope, only Thin Boss7 as seed, Front Z0 mirror, merged original retained. Both outward native walls are present.
- Final heel Cut5 `feature_mv0bgral_3`: fully defined Front rectangle X1.7..2.7/Y0...125 in, ThroughAll both Z directions after Mirror2. Exact probes confirm heel removal on both wall sides, preventing support operations from refilling the source heel.

Upstream source stations remain as documented: backing −.26..0, disc 0...24, rear hub −.46..−.26, grooves .24→.115, coaxial bore ThroughAll. Native probes independently confirm both groove voids above their retained .115 floors. Raised pad retains its annular hole profile and height .5...625; a solid base floor exists beneath its inner recess and the annular band remains above the base. This proves the pad is a blind raised recess rather than a through-base hole.

Material remains Aluminum 6061 with explicit printed-density convention 2.684950756889703 g/cm³, source text `.097 lb/in^3`, unchanged from baseline. Official companion nominal 2.7 g/cm³ is a separate convention, not silently substituted.

Evidence:

- `ADVANCED-Q2-source-repaired-native-audit-2026-10-09.json`
- `ADVANCED-Q2-source-repaired-step-audit-2026-10-09.json`
- `ADVANCED-Q2-source-repaired-design-audit-2026-10-09.json`

All audits use disposable native verification only. No authored bundle, STEP, geometry, ADVANCE, or source file was changed. Parent browser driving/Undo/Redo/cold checks remain separate observations to append when complete. A complete decoded source BREP equivalence is not claimed.
