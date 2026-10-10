# Chapter 8 assembly final acceptance plan — 2026-10-10

Read-only reconciliation of current ADVANCE, source book.txt, protected browser bundles and earlier accepted reports. This report does not author models or establish actual browser clearance/cold acceptance.

| Source | Exact saved library record / key | Remaining actual browser proof |
|---|---|---|
| 8.2, printed8-36 /PDF414 | WEIGHT-LINK8.2 - rebuilt 2026-09-28 /asm_mukitj6a | Cold rebuild and resolved five mates/two DOF; whole-assembly native interference, four leaf solids, zero overlaps, zero unreviewed and zero bounds-only. |
| 8.8, printed8-42 /PDF420 | Planchard 8.8 - gear mate assembly - fresh 2026-09-30 /asm_munkuhc0 | Cold indexed pose, five resolved mates/one DOF; actual study sample1s then seek0, preserving gear phase and restored indexed pose. |
| 8.9, printed8-43 /PDF421 | Planchard 8.9 - counterweight assembly - fresh labeled example 2026-09-30 /asm_munwkpui | Cold seven components/eight mates/two DOF; retained measured cosmetic screw/nut contact and actual report with zero unreviewed/zero bounds-only. |

## WEIGHT-LINK8.2

Baseline `artifacts/planchard/WEIGHT-LINK8.2-final-browser-2026-09-28.mforge` (78,914,653 bytes) contains five assemblies. Select exact key, not the first assembly or unrelated mainModel. Three top-level components are grounded Axle451, FLATBAR452 and rigid Weight-Hook456 nested assembly asm_mukhtlq5. Mate IDs453/454/455/539/567 preserve concentric/three coincident/tangent source relationships. Prior actual coupled child motion and independent native/worker replay were accepted; actual clearance UI remained pending.

Current raw-saved-graph solver replay fails topology references in mate453 (`feature_mukhpbcy_2:tool:face:generated:cylinder:1`) and mate567 (`feature_mukhptgp_3:copy:8:face:generated:cylinder:1`). Its reported four DOF is an unresolved-reference consequence, not the accepted two-DOF result. A current native topology rebuild/rebind must precede acceptance. Do not replace finite-bore tangent behavior or conceal unresolved mates. Preserve sources and child rigidity; export actual rebuilt/cold bundle plus visible clearance screenshot and audit the resulting refs.

## GEAR8.8

Baseline `artifacts/planchard/GEAR-assembly-indexed-browser-2026-09-30.mforge` (36,570,054 bytes). Five components1687/1688/1744/1745/1746. Gear mate2059 uses20:40, reverse=false, rollA0=0, rollB0=0.07853981633974483rad, followerPhaseDeg=4.5. Both axial distance mates are−0.05cm. Indexed driver/follower world Y angles30/−19.5 degrees and startsY0.85cm supersede earlier overlapping trials. Actual indexed clearance already reports no interference; continuous tooth-contact simulation is not required by the source.

Saved Motion Study1 duration is10 seconds, motor1745 at5rpm around+Y, external20/40 relation. Older report's one-second *duration* is incorrect; one second is a useful sample time. Current read-only evaluator on an in-memory copy passes, yields driver60.000000000055/follower−34.499999999999 at1s, restores30.000000000055/−19.499999999999 at0s. This confirms expected differential+30/−15 degrees, not actual browser playback. Capture actual time0/1/0, clean-save at0 and protect cold bundle/screenshot. Compare phase, distances, component definitions, source refs and poses; newly saved motion baselines are legitimate only if actual UI captured them and zero pose remains the indexed pose.

## COUNTERWEIGHT8.9

Latest annotated baseline `scratch/planchard/COUNTERWEIGHT-ANSI-contact-audit-browser-2026-09-30.mforge` (1,100,669 bytes); protect new actual export under artifacts after cold check. Seven top-level components:2124 Axle grounded;2125 Flat;2134 Weight-Hook nested asm_munx3lna;2171 pan screw;2173/2175 washers;2177 nut. Eight mates:2126 concentric,2127 distance1.8cm,2135 concentric,2136 distance0.25cm,2206/2210/2211/2212 relative locks from Flat to the four fasteners. Current saved-graph replay passes two DOF.

Expected contact2171↔2177 retains measured native overlap **0.0017450999084413555cm³**. Reason: matching5/16-18 UNC smooth major-diameter screw proxy overlaps minor-bore nut envelope; helical surfaces not modeled. Expected actual results: **one measured overlap, one declared contact, zero unreviewed, zero bounds-only**. A zero-overlap requirement would incorrectly reject or alter this qualified assembly. Grounding, poses, two narrow washers, relative locks, contact measurement and explanatory text must survive cold save.

Description currently says “Assembly in progress” and “companion dimensions unavailable.” Correct completion metadata through actual browser controls; preserve representative driver-form/cosmetic-thread qualification. Source page422 is the next additional-project introduction and is not part of8.9.

## Companion-source correction and remaining scope

Official zip inventory now exists: `scratch/planchard/official-companion-archive-inventory-2026-10-09.json`, original archive `C:/Users/liron/Downloads/Eng_Graphics_SW_2021_Exercise_Files_V3.zip`, SHA256 bfdd94a72cab5e7328c9bcd7681af9b00153f39c8395056643cb64da881443e2. Inventory includes Chapter8 Homework/Axle.SLDPRT, FLATBAR.SLDPRT, HOOK.SLDPRT and WEIGHT.SLDPRT, plus Gear Mate video/presentation. Thus blanket claims that companion files are unavailable are stale. These source identities/dimensions have not been inspected in this audit; no official-geometric-identity claim follows. Earlier representative assembly qualifications remain until source inspection establishes equivalence or repairs.

Review worksheets are separate from these assembly proofs. Current ADVANCE authoring Ch8/9 thenCh5 review packs does not reopen already accepted8.19/8.20 models. No defensible whole-book completion percentage is established here:117 numbered IDs alone do not include all tutorials, review questions and required workflow supplements.

## Read-only harness

`scratch/planchard/assembly-acceptance-readonly-2026-10-10.mjs` selects exact keys, checks counts, solves a cloned in-memory assembly, replays gear0→1→0 and writes only audit JSON. Run `node scratch/planchard/assembly-acceptance-readonly-2026-10-10.mjs weight|gear|counterweight [actual-cold.mforge]`. It does not write models or use browser state. Optional cold comparison lists every selected-assembly authoring difference while excluding only named regeneration/render fields (lastRebuild, meshData, exactTopologyCache, verifiedExactTopology, diagnostics, parts). Inspect differences rather than accepting them automatically. Native clearance and screenshot acceptance remain actual browser tasks. Weight unresolved topology is recorded explicitly; no false green assertion.
