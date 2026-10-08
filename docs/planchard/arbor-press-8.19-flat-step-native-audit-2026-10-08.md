# 8.19 Arbor press — actual flat assembled STEP audit

PASS for actual Chrome exports `AP-assembly-flat-assembled-browser-2026-10-08.step` (487,111 bytes) and `AP-assembly-motion-home-browser-2026-10-08.mforge` under `artifacts/planchard`.

Independent STEP import validates **11 native solids**. Rebuilding the bundle's eight exact definitions and placing its eleven saved occurrences yields **zero solid residuals in both subtraction directions**: native outside STEP = 0 cm³; STEP outside native = 0 cm³. The symmetric difference is zero.

STEP-integrated volume is **600.1580394263552 cm³**, versus authored native **600.1580396978882 cm³** (−2.7153294013260165e−7 cm³). This small curved-surface integration difference does not represent missing geometry: both native Boolean differences are empty. STEP bounds are X −50..80, Y 0..240, Z approximately −40..40 mm. The mixed saved-material mass remains **4.719336856673411 kg**; standalone STEP geometry does not encode the part-density sum.

The motion-home bundle's components (including all definitions, properties and saved poses) and all fourteen mates are byte-identical to the accepted free-home bundle. Thus its resolved references, settled 1 DOF and clear native home are retained. The newly saved study is **“AP full stroke - 60 mm in 10 s”**, with a rack/pinion motor on mate 4819 at **−5.72957795130823 RPM**, baseTurns 0, duration 10 seconds. All eleven recorded study base poses exactly equal saved open home. The motor analytically commands 60 mm travel at the 10 mm pitch radius. Saved study time is 10 seconds while assembly components remain restored open home; these are distinct saved values.

Evidence:

- `artifacts/planchard/AP-assembly-flat-step-native-audit-2026-10-08.json`
- `artifacts/planchard/AP-assembly-flat-step-equivalence-audit-2026-10-08.json`
- `artifacts/planchard/AP-assembly-motion-home-flat-consistency-audit-2026-10-08.json`

All authored inputs were read only and their hashes preserved. The full movement sweep and browser playback evidence are separately audited; this report certifies the flat STEP and saved motion-home consistency.
