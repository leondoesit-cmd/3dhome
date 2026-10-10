# Chapter 8 final assembly browser controls — 2026-10-10

Read-only current-code and protected-bundle reconciliation. This is an ordinary UI recipe, not new browser acceptance. Parent owns browser authoring and cold exports. Cross-check `chapter8-assembly-final-acceptance-plan-2026-10-10.md`, `vice85-flashlight-source-acceptance-reconciliation-2026-10-10.md`, and `full-book-final-browser-queue-2026-10-10.md`.

| Exercise / source | Exact saved record / key | Required final proof |
|---|---|---|
| 8.2 / PDF414, 8-36 | WEIGHT-LINK8.2 - rebuilt 2026-09-28 / `asm_mukitj6a` | Five resolved mates, two DOF; four native leaf solids; whole visible assembly exact interference. |
| 8.5 / PDF417, 8-39 | Planchard8.5 - screw mate vice assembly - fresh labeled example2026-09-30 / `asm_mung79t0` | Corrected three-part Vice; pitch10mm/turn; coupled fractional rotation/travel and return to zero; cold persistence. |
| 8.8 / PDF420, 8-42 | Planchard 8.8 - gear mate assembly - fresh 2026-09-30 / `asm_munkuhc0` | Five mates, one DOF; saved10-second study at time0→1→0; indexed phase retained cold. |
| 8.9 / PDF421, 8-43 | Planchard 8.9 - counterweight assembly - fresh labeled example 2026-09-30 / `asm_munwkpui` | Seven top components/eight mates/two DOF; one measured, declared screw/nut overlap, zero unreviewed/bounds-only. |

## Interference scope and reporting

Use **Interference**. Clear component selection and keep all required components visible. Zero or one selected root means **All visible components**; two or more means **Selected components: …**, with only leaves of those selected roots included. Selecting two leaves/components can therefore yield a misleading partial clearance result. A rigid nested assembly counts its actual visible leaf solids, not one bounding box.

The current worker prepares native exact geometry. Its fallback also uses native BREP; progress, cancellation, stale-document guards and failures remain visible. Record completed output, not a Preparing exact screenshot. Report captions are **Native overlaps**, **Declared contacts**, **Unreviewed overlaps**, and **Bounds only**. Any bounds-only result is not native clearance acceptance. Zero overlaps before topology/mate repair cannot establish solved mobility.

## WEIGHT-LINK: actual missing-reference repair route

Parent's current Chrome result (three roots/five mates, Concentric1 and Tangent5 missing face/axis, mobility unchecked) matches the protected old references. It is unresolved, not the accepted two-DOF assembly.

The inspector exposes two-component dropdowns **Reference A · {component label}** and **Reference B · {component label}**, and **Refresh exact mate references · {component label}**. Refresh rebuilds each native leaf, publishes verified topology/bodies, and runs the solver. It does not explicitly replace saved mate references; automatic reference resolution must be witnessed, not assumed. If errors remain:

1. Select AXLE451 and FLATBAR452 together. Refresh both exact reference lists. Choose the actual axle cylinder and FLATBAR left bore; select **Replace references with selection** on Concentric1 (mate453). Old bore identity was `feature_mukhpbcy_2:tool:face:generated:cylinder:1`, local center X−50.8mm/Y0, radius2.413mm. Select by current geometry, not by inventing that old ID.
2. Select FLATBAR452 and rigid Weight-Hook456. Refresh both; nested refresh walks its actual leaf definitions. Choose FLATBAR right bore (old local X+50.8mm/Y0, radius2.413mm; old ID `feature_mukhptgp_3:copy:8:face:generated:cylinder:1`) and the actual nested Hook torus (old member prefix443). Use **Replace references with selection** on Tangent5 (mate567).
3. Preserve the existing tangent's aligned, **finite-bore** contact behavior and other three mates. Verify no missing/ambiguous reference errors and two DOF before whole-assembly interference/cold save. If current faces differ materially, stop accepting the legacy shape and record source correction rather than rebinding arbitrarily.

Source qualification remains separate: official companion files now exist. Parent has since authored FLATBAR thickness2.286mm/Aluminum2014 in Chrome; cold proof owns its acceptance. Original protected baseline thickness was1.524mm and material assignment absent. WEIGHT Pure Lead still needs physical assignment. Parent actual book PDF370/7-62 requires right-hand#8-36/.150in/.0277778in/trim start face/Plain Carbon Steel for the separate Chapter7 Hook. PDF413/8-35 exercise8.1 explicitly copies Chapter8 Homework Hook/Weight, so companion custom helix/profile correction is relevant to embedded8.1/8.2 Hook; preserve standalone Chapter7 Hook. Retain upper-loop/representative qualifications unless actual source geometry is established. Refresh alone cannot close remaining geometry/material differences.

## Vice: actual controls and numerical oracle

Use protected `artifacts/planchard/VICE-assembly-corrected-browser-2026-09-30.mforge`, not BenchVICE8.17. Base1585 is fixed; shaft1586 and jaw1587 carry Screw1588 plus the other three mates. Preserve **Screw axes: Opposed**, **Thread handedness** and the corrected clearance.

In Screw mate row, verify **Pitch (mm/turn)** =10 (internal1cm/turn). Enable checkbox **Couple screw rotation and travel**; visible text is **Couple rotation and travel (free screw joint)**. The drive field becomes **Drive turns (blank = free)**. Numeric edits commit with Enter; do this before Save.

Read-only actual corrected-bundle replay independently passes:

| Drive | Shaft X / jaw X | Shaft rotation | Solver |
|---|---|---|---|
| Free captured zero | −22.5mm / −22.5mm | 0° | One DOF, no errors |
| 0.25 | −25mm / −25mm | RX−90° | Zero DOF, no errors |
| 1 | −32.5mm / −32.5mm | One full turn, orientation equivalent to0° | Zero DOF, no errors |
| 0 | −22.5mm / −22.5mm | Zero orientation restored | Zero DOF, no errors |
| Blank after zero | −22.5mm / −22.5mm | Zero orientation retained | One DOF, no errors |

Base remains unchanged. The 0.25 sample proves shaft rotation and2.5mm travel; a360° sample alone cannot visually distinguish rotation. For the final free coupled joint, return to0 then clear drive, Enter, Save; cold check one DOF and pitch10. This is a representative three-part Vice, not an unqualified official multipart geometric match. Browser witnesses remain required.

## Gear: study time versus configuration

Open **Motion study**, choose saved **Motion Study 1**. Preserve motor1745, **Speed (RPM, signed direction)** =5, world axisY, external20:40 relation and **Keep existing relations**. Leave **Use current pose and actuator Drives as time zero** unchecked; recapturing at a moving pose would shift the source indexed baseline.

Use **Time (seconds)** =0/1/0 with Apply for exact samples. Alternatively **Preview saved motion** opens **Motion playback · Motion Study 1**: **Preview duration (seconds)** stays10, range **Motion time (seconds)** seeks on release/change; **Play**, **Pause**, **Reset**, **Keep current pose**, **Cancel preview** are explicit. Reset seeks saved time0; Cancel restores the pose at preview opening. Keep commits the sampled pose. Save is blocked while preview remains pending.

Expected indexed driver1745/follower1746 RY is30°/−19.5° at0,60°/−34.5° at1, then30°/−19.5° at0. This preserves+30°/−15° differential and4.5° follower phase. Study duration is10seconds;1second is a sample. **Configurations → INDEXED** applies a different saved configuration snapshot and is not evidence of study Reset. Do not update the active configuration from a nonzero pose. Save/export cold at the restored indexed zero. Indexed clearance is already accepted; continuous tooth collision simulation is not claimed.

## Counterweight: positive contact is intentional evidence

Latest baseline is `scratch/planchard/COUNTERWEIGHT-ANSI-contact-audit-browser-2026-09-30.mforge`. Preserve Axle2124 grounding; Flat2125, nested Weight-Hook2134; pan screw2171, washers2173/2175 and nut2177. Preserve distance mate2136=.25cm (2.5mm), two narrow washers and all four relative fastener locks.

Whole visible native interference should retain screw2171/nut2177 overlap **0.0017450999084413555cm³ =1.7450999084413555mm³**. Expected report: **Native overlaps:1 · Declared contacts:1 · Unreviewed overlaps:0 · Bounds only:0**. This is cosmetic5/16-18UNC smooth major-shaft/minor-bore contact; helical thread surfaces are not modeled. Do not turn the measured positive overlap into a false zero or change geometry solely to conceal it.

Existing annotations expose **Remove declared contact**. A genuinely unrecorded expected pair offers **Reason for expected contact · {pair label}**, then **Record expected contact · {pair label}**; require the stated geometric reason and retain the measured report. Changed geometry invalidates old declarations for review. Verify the reason/measurement survives cold export. Correct stale Description text through ordinary UI, while retaining representative/cosmetic-thread qualifications.

## Validation

31/31 focused current tests passed across `assembly_interference_scope`, `cad_coupled_screw_mate`, `assembly_contact_audit`, `motion_playback`, `cad_motion_study_full_pose`, and `interference_volume_label`. Additional readonly Vice clone replay above passes coupled/free states and fractional/full turn/zero. No app code defect requiring a new change was confirmed by this audit. Actual browser mate repair, clearance, motion and cold acceptance are intentionally pending parent evidence.
