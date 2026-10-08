# 8.20 SH01 Back Plate — actual browser native audit

**Geometry/native STEP PASS.** Actual Chrome exports are `artifacts/planchard/SH01-nominal-browser-2026-10-09.mforge` (648,323 bytes) and matching STEP (73,204 bytes). Every authored shape came from parent Chrome UI; this independent audit only rebuilt disposable verification shapes.

The actual six-feature recipe matches the frozen original designer plan:

|Feature|Profile and constraints|Native extent, mm|
|---|---|---|
|Disk|Front fixed center (0,0), ordinary driving D100|Z −12..0|
|Guide body|Front centered 40×100 at (0,20), fixed center/midpoint, 2H/2V and driving dimensions|Z 0..12|
|Rail|Front centered 20×100 at (0,20), same ordinary constraint pattern|Z 12..18|
|Bearing arm|Front centered 40×12 at (0,76), same ordinary constraint pattern|Z 0..34.2|
|Bearing bore|Top fixed center (U0,V26.2), driving D8.2, sketch offset Y70, Blind12|Y 70..82|
|Mount bores|Four Front fixed centers (±30,±25), four driving D6, sketch offset Z−12, ThroughAll forward|Z −12..34.21 tool extent|

The first four Front sketches use offset zero; their extrusion feature offsets establish the listed Z intervals. This distinction is verified explicitly rather than assuming a sketch's plane offset equals its extrusion start. All six sketches are fully defined with empty diagnostics; all twelve history entries are rebuilt and unsuppressed (six sketch/six feature). Three ordinary rectangle outlines each retain their excluded construction diagonal and fixed center point. None becomes a helper solid; four ordinary mount-hole profiles are retained through one primary profile plus three additional region-profile groups.

Native regeneration yields **one valid solid**, **168.6728895112609 cm³**, bounds **100 ×132 ×46.2 mm** (X ±50, Y −50..82, Z −12..34.2). COM is approximately **(0,14.225481816469194,1.0361262724684794) mm**. The analytic sum of disk, guide, rail and arm volumes less the bearing and four mount bores is **168.67288951126088 cm³**; native error is about 2.84e−14 cm³.

STEP import validates one solid and exact bidirectional Boolean subtraction gives **zero solids/zero volume in both directions**. Native and STEP are geometrically equivalent. AISI 1020 (SOLIDWORKS reference), catalog `stock:aisi1020`, density **7.90 g/cm³**, retains Student Workbook 2011 Appendix A provenance. Native mass is **1.3325158271389612 kg**. Description discloses original educational dimensions and printed8-55/PDF433; PartNo is SH01.

The nominal bundle omits **BookItemNo**; the frozen design calls for item1. Parent was notified to add this through Chrome before final metadata acceptance. This is a metadata finding, separate from the passing geometry audit. Parent observed disk driving D100→102 changing native volume/mass **168.6729→172.4805 cm³ /1.332516→1.362596 kg**, then Undo100→Redo102→Undo100. Cold saved-library proof for `cm_mv00dber` is pending parent observation at this nominal checkpoint.

Evidence:

- `SH01-native-bundle-audit-2026-10-09.json`
- `SH01-native-step-audit-2026-10-09.json`
- `SH01-step-equivalence-audit-2026-10-09.json`
- `SH01-design-consistency-audit-2026-10-09.json`

Scripts and reports are read-only verification; authored exports and ADVANCE were untouched. The native helper's featureCount17 denotes compiled kernel operations, not seventeen authored CAD features.

## Final cold acceptance

**Final SH01 acceptance PASS:** actual Chrome `artifacts/planchard/SH01-final-browser-2026-10-09.mforge` (648,231 bytes), SHA-256 `2a370988ddccd663d59c4057ba1b06ce4bd16e9c23f3ac0f2d202ca273272175`. Parent cold reopened actual library `cm_mv00dber` and verified one native solid, 100×132×46.2 mm and twelve editable history steps. Custom Properties shows **BookItemNo1**, PartNoSH01 and the retained Description; the nominal metadata finding is resolved.

Final features, sketches and history are byte-identical to nominal. Appearance and authored physical part/material data remain equivalent. The part's transient `meshData` and `exactBuildToken` differ after cold regeneration; rebuild and standards-audit bookkeeping also differ. These differences are explicitly excluded from authored-data equality, not mistaken for recipe changes. Fresh independent final regeneration validates one solid with exactly the same **168.6728895112609 cm³** volume and nominal bounds/COM. The earlier exact STEP Boolean comparison remains applicable to unchanged authored geometry.

Additional evidence is `SH01-final-native-bundle-audit-2026-10-09.json` and `SH01-final-cold-consistency-audit-2026-10-09.json`; the consolidated design consistency audit records acceptance PASS and parent browser durability. Earlier nominal export and its metadata finding remain preserved. No model or ADVANCE writes occurred.
