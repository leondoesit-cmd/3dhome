# 8.20 Actual native references and Chrome assembly plan

Read-only plan based on accepted Chrome SH01..09 final exports and SH10 nominal export. No assembly/model JSON was generated or saved. SH11..16 are still future browser parts, so their native IDs must be inspected after actual exports; the clapper moving hinge reference remains explicitly pending. All inspected inputs remain byte-identical.

SH03's accepted groove is correctly localZ12..18.2mm (`Extrude Cut1`, from1.2/to1.82cm, feature offset0 relative to its offset sketch). Use the final corrected bundle, not the preserved doubled-offset diagnostic. SH07 is actual `Steel304`,8.0g/cm³, sourced to Atlas Steels Product Reference Manual Section9 Physical Properties p7 (October2016), with an explicit representative CAD density/cast-grade disclaimer. SH04 retains Plain Carbon Steel7.85g/cm³/Alleima20C reference; the other inspected parts use recorded AISI1020 SOLIDWORKS reference density7.9. SH11 must use the approved OD10/ID6.2 recipe.

## Initial home placement

Set millimetres. Insert each role once, all rotations0°. Ground only SH01. Populate X/Y/Z through visible component Properties before adding Locks.

|Role|X mm|Y mm|Z mm|
|---|---:|---:|---:|
|SH01 Back Plate|0|0|0|
|SH02 Down Bit/feed screw|0|0|26.2|
|SH03 Vertical Slide|0|0|0|
|SH04 Spacer Bush|0|82|26.2|
|SH05 Handle grip|0|96|26.2|
|SH06 Handle Bar|0|96|26.2|
|SH07 Standard fastener|0|106|26.2|
|SH08 Swivel Plate/clapper box|0|−10|34.2|
|SH09 Swivel Screw Pin|0|−10|34.2|
|SH10 Clamping Screw|−26|−10|42.2|
|SH11 Small Washer OD10|−26|−10|40.2|
|SH12 Pivot Pin|0|4|49.2|
|SH13 Tool Holder|0|−16|54.2|
|SH14 Tool Fixing Screw|0|−16|89.2|
|SH15 Drag/clapper plate|0|−10|42.2|
|SH16 Tool Washer|0|−16|52.2|

Protect this16-role raw placement checkpoint and audit exact home solids before constraints. The plan contains no hidden bit/support/component or reused AP/KT geometry.

## Preferred actual circular references

Select ordered A then B in the native reference list. The UI labels below are copied from verified final native topology. Circular references constrain their axis; different radii are acceptable for a shaft/hole Concentric and ideal Screw. Avoid similarly located generated circles whose axis has the opposite sign.

|Key|Role and exact UI label|Native axis|Persistent ID|
|---|---|---|---|
|F1|SH01 `Extrude Cut 1 · Circular edge · profile:4886:start · R 4.100 mm · X 0.000 · Y 70.000 · Z 26.200 mm`|+Y|`feature_mv00s1js_5:tool:edge:profile:4886:start`|
|F2|SH02 `Extrude / Boss 1 · Circular edge · profile:4906:start · R 4.000 mm · X 0.000 · Y -45.000 · Z 0.000 mm`|+Y|`feature_mv012idg_1:edge:profile:4906:start`|
|F3|SH03 `Extrude Cut 4 · Circular edge · generated-1 · R 4.100 mm · X 0.000 · Y -20.000 · Z 26.200 mm`|+Y|`feature_mv01b2ie_6:edge:generated:circle:1`|
|A1|SH03 `Extrude Cut 3 · Circular edge · profile:4989:end · R 4.100 mm · X 0.000 · Y -10.000 · Z 34.200 mm`|+Z|`feature_mv01aqsy_5:tool:edge:profile:4989:end`|
|A2|SH08 `Extrude Cut 1 · Circular edge · profile:5086:start · R 4.100 mm · X 0.000 · Y 0.000 · Z 0.000 mm`|+Z|`feature_mv0246s2_4:tool:edge:profile:5086:start`|
|H1|SH08 `Extrude Cut 3 · Circular edge · profile:5108:start · R 3.100 mm · X -20.000 · Y 14.000 · Z 15.000 mm`|+X|`feature_mv024o0u_6:tool:edge:profile:5108:start`|
|H2 pending|SH15 hinge bore R3.1 at localY14/Z7; prefer a native circle with+X and localX−15.8 after its actual final export|Must verify|Not yet authored; no invented ID|

SH08's generated hinge circles atX−16/+16/+20 point−X. H1 is the actual+X reader needed for signed−20..0° outward clapper lift. Concentric accepts opposed axes, so H2 could be−X if necessary; directed sign is controlled by reader H1 and Reverse false. Actual H2 must bind and its accepted zero/drive direction must be audited before browser acceptance.

## Twenty-three mates

First capture the11 body Locks in frozen home. Select the indicated reader/body A then follower/body B; these retain original poses rather than repositioning hardware.

|Mate numbers|Body Locks|
|---|---|
|1|SH01→SH04|
|2..4|SH02→SH05, SH02→SH06, SH02→SH07|
|5|SH08→SH09|
|6..7|SH03→SH10, SH03→SH11|
|8|SH08→SH12|
|9..11|SH15→SH13, SH15→SH14, SH15→SH16|

Add the remaining12 native mates in this order. All plane references below are **named origin datum planes**, avoiding physical-face normal/centroid ambiguity. Distance uses ordered signed A→B values. `Aligned` is on; Screw/Directed Drive is blank unless temporarily testing.

|No.|Type|A reader|B moving|Settings|
|---:|---|---|---|---|
|12|Concentric|F1 SH01|F2 SH02|Coaxial Y bearing|
|13|Distance|SH01 Top Plane|SH02 Top Plane|0mm, Aligned; captures shaftY0|
|14|Distance|SH01 Front Plane|SH03 Front Plane|0mm, Aligned; fixes slideZ0|
|15|Distance|SH01 Right Plane|SH03 Right Plane|0mm, Aligned; fixes slideX0|
|16|Screw|F3 SH03|F2 SH02|Coupled motion, RH, pitch1mm, capture home, Drive blank|
|17|Limit|SH01 Top Plane|SH03 Top Plane|Min−20mm/Max0mm, Aligned|
|18|Concentric|A1 SH03|A2 SH08|Coaxial Z apron hinge|
|19|Distance|SH03 Front Plane|SH08 Front Plane|**34.2mm**, Aligned; retains boxZ34.2|
|20|Angle|SH03 Top Plane|SH08 Top Plane|0°, clamps apron orientation for cutting|
|21|Concentric|H1 SH08|H2 SH15 pending|Coaxial X clapper hinge|
|22|Distance|SH08 Right Plane|SH15 Right Plane|0mm, Aligned; captures clapperX0|
|23|Directed rotational limit|H1 SH08|H2 SH15 pending|Min−20°/Max0°, Reverse off, Drive blank; zero captured closed|

For No.19, actual physical SH03 frontfaceZ34.2→SH08 backfaceZ0 could useDistance0 with opposed-normal handling, but that is a different reference pair. Do not enter0 for the named origin-plane pair above; it would move the apron into the slide. Keep the clapper physically closed while capturing its directed home phase.

Disposable native preflight binding actual F1/F2/F3/A1/A2/H1 confirms staged solver counts:11 Locks24DOF; after13 mates19DOF; after15 mates14DOF; after17 mates13DOF; after20 mates7DOF; final23 mates2DOF. These intermediate counts assume all16 occurrences and all11 Locks are already present; unmated-component UI counts can otherwise differ.

## Movement and configuration checks

Preferred+Y feed pair with RH1mm lead makes positive shaft Drive lower the slide: Drive10→slideY−10mm, Drive20→Y−20mm. A10-second Screw motor at+120RPM reaches20 turns. Locks carry handle/grip/fastener with the screw and clamp hardware with the slide. Test fractional turns as well as integer downfeed; integer millimetres are complete shaft revolutions. Restore Drive0, then blank for saved free home.

Preferred+X directed reader with Reverse false makes Drive−10/−20° lift outward; +1° and−21° must reject without pose/mate/history changes. Hinge pivot world(0,4−feed,49.2)mm moves with reader SH08. No synchronization to a whole-machine cutting stroke is claimed.

The23-mate cutting configuration has free feed+clapper2DOF. Set directed Drive0 to temporarily seat clapper: feed-only1DOF. Set Screw Drive0 with clapper Drive blank: clapper-only1DOF. Both driven:0DOF. Suppressing only apron clamp Angle20 adds a third adjustment DOF. The approvedOD10 washer and7.2×16 slot support the proposed ±10° geometric adjustment; represent release explicitly instead of claiming a tightened clamp physically swivels.

For separate browser Motion Studies, feed demonstration uses Screw motor+120RPM for10seconds with clapper seated by directed Drive0. Clapper demonstration fixes Screw Drive0, leaves directed Drive blank, and uses a Rotary motor on SH15 aboutX at−1/3RPM for10seconds. Its **component-local pivot** isX0/Y14/Z7mm, not worldX0/Y4/Z49.2; the pivot control must follow actual SH15 geometry. This produces20° outward lift. Capture zero in closed home and verify actual UI/evaluator pivot handling before acceptance. Restore Screw/Directed Drives blank for the final2DOF free-home checkpoint if that is the declared saved configuration.

Actual-source partial native preflight passes nine feed0/10/20 +lift0/10/20 combinations, expected2/1/1/0/3 DOF configurations, and atomic rejected feed−1/+21 turns and hinge+1/−21°. SH11..16 in this disposable test still use proposal frames; no final authored assembly acceptance is implied.

Evidence: `artifacts/planchard/SH-actual-reference-preflight-2026-10-09.json` (all actual labels/IDs/materials/feature offsets/SHA/input immutability), and `SH-actual-reference-mechanism-preflight-2026-10-09.json` (actual circle bindings with remaining proposed frames, stages, mobility, motion and rejection). No source bug was found. Parent authors the remaining parts and actual assembly solely through Chrome before final topology/clearance/persistence/STEP/drawing acceptance.
