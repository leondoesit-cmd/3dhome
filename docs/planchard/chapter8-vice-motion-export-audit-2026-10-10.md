# Vice8.5 actual motion export audit — 2026-10-10

Independent read-only audit of parent actual ordinary Chrome motion actions for book PDF417/8-39. Exact saved assembly `asm_mung79t0`, name **Planchard 8.5 - screw mate vice assembly - fresh labeled example 2026-09-30**. The native three-part Vice and10mm/turn pitch are chosen reconstructed dimensions; neither this motion proof nor the exercise screenshot recovers official multipart geometry/dimensions. Retain representative-source qualification.

Parent enabled **Couple screw rotation and travel**, entered **Drive turns (blank = free)**0 then Enter, exported Downloads `Planchard_8_5_-_screw_mate_vice_assembly_-_fresh_labeled_example_2026-09-30 (2).mforge` (644,826bytes); then .25 Enter, exported `(3).mforge` (644,879bytes).

| Actual export | Shaft1586 | Jaw1587 | Base1585 / native solver replay |
|---|---|---|---|
| Drive0 | X−2.25cm,Y3.5cm,RX0° | X−2.25cm,Y0,RY180° | Fixed identity pose; zero DOF/no issues |
| Drive.25 | X−2.5cm,Y3.5cm,RX−89.99999999991901° | X−2.5cm,Y0,RY180° | Fixed identity pose unchanged; zero DOF/no issues |

The actual quarter turn gives **shaft−90° rotation** and **shaft/jaw−.25cm =−2.5mm travel**, agreeing with pitch1cm/turn. Native-topology-backed saved assembly replay has zero issues/unsatisfied at both samples. Base pose is exactly unchanged. Export0 component poses equal the earlier protected `artifacts/planchard/VICE-assembly-corrected-browser-2026-09-30.mforge` home, so recoupling did not shift the saved assembly.

Mate1588 retains pitch1cm/turn, legacy turns2, axisOpposedtrue, coupledMotiontrue, coupledAxial0=2.25, coupledPhase0=π, coupledAxialBasis=`component-origin`. Across exports2/3, every mate record is identical except driveTurns0→.25. Concentric1589 and Coincident1590/1591 references/settings are unchanged. All three full embedded canonical component definitions compare byte-for-byte after JSON serialization, including geometry/history/cache; no native geometry was changed to manufacture the motion.

Independent SHA256 of each unchanged component definition:

- Base1585: `01c40de454237d96fbf7f775d2a63f1bb810971f3a01fcb9e2c876a85f75c19d`
- Shaft1586: `f164ded73503ed9651fd1bd5d55555cbfca7a5d474442345653e5788626383d3`
- Jaw1587: `9028205dd08193a805abdac5d648d31ba83914f97f1355348addf5859d662c71`

## Actual full-turn, Undo/Redo and free home exports

Independent read-only actual Downloads exports4/5/6/7 pass:

| Export | Bytes | Actual state / solver replay |
|---|---|---|
|4|644,826|Drive1: shaft/jawX−3.25cm,−10mm versus drive0; shaft orientation is identity, equivalent to the commanded full−360° turn; zero DOF/no issues.|
|5|644,879|Ctrl+Z restores drive.25, shaft/jawX−2.5cm, shaftRX−90°; zero DOF/no issues.|
|6|644,826|Ctrl+Y restores drive1; entire saved assembly JSON exactly equals export4; zero DOF/no issues.|
|7|644,811|Drive0 Enter then blank Enter, clean Save: entire saved assembly JSON equals export2 except driveTurns0 is removed; free coupled one DOF/no issues.|

Undo5 is geometrically equivalent to quarter-turn3 with identical authoring, mate records and embedded definitions, but **not bit-identical overall**: shaftRX normalized from−89.99999999991901° to−89.99999999999997°, quaternionX/W change by about5×10⁻¹³. These are the only full-assembly differences. Redo6 is exact4; free7 is exacthome2 aside from removed drive. All three complete component-definition SHA256 values above remain identical across2–7, and fixed Base is unchanged.

## Actual cold-open acceptance

Parent clean-saved, hard-reloaded Chrome and reopened the exact library assembly, observing three components, four mates and one free DOF. The protected cold export `artifacts/planchard/EXERCISE-8.5-coupled-free-cold-browser-2026-10-10.mforge` is 644,811 bytes, SHA256 `99f8d2e2060b81f909494d1fe3fa0070b1820c0f94dc73797804dfcc1e2c5389`. Independent read-only comparison finds the **entire saved assembly JSON exactly equal to export7**, with zero differences: authoring, embedded component definitions/native geometry, references, pitch, free mode and home poses all survive cold reopening.

Native-topology-backed cold replay returns **ok, one DOF, no issues or unsatisfied mates**. Screw1588 retains coupledMotion=true, pitch1cm/turn and no driveTurns property. Base remains at the identity origin; Shaft is X−2.25/Y3.5/Z0cm with identity orientation; Jaw is X−2.25/Y0/Z0cm with RY180°. The three component-definition hashes above remain unchanged.

Parent actual all-visible **Interference** popup reports no two components overlap at home, with protected home/cold PNGs. This records the parent browser witness; this audit independently verifies motion/state exports, not a new interference execution or continuous-path clearance. **Exercise8.5 passes the finite representative-source motion scope**, including quarter/full turns, Undo/Redo, free home, save and cold persistence. The chosen three-part reconstruction and 10mm/turn pitch qualification remain; official multipart dimensions are not recovered. No browser/CAD/model-state/ADVANCE/Git writes by this audit.
