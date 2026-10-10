# Exercise8.8 actual gear motion export audit — 2026-10-10

Independent read-only audit of ordinary Chrome actions witnessed by the parent after viewing book PDF420/8-42. Actual Downloads prefix: `Planchard_8_8_-_gear_mate_assembly_-_fresh_2026-09-30`; assembly `asm_munkuhc0`. This is the existing source-qualified functional designer example with chosen base/shaft/module2 gear dimensions, not recovered official companion geometry or continuous physical tooth-contact verification.

| Actual export | Bytes | Study time | Driver1745 RY | Follower1746 RY | Comparison |
|---|---:|---:|---:|---:|---|
|(8)|36,571,115|0|30.000000000055067°|−19.49999999999873°|Indexed study baseline|
|(9)|36,571,111|1|60.00000000002514°|−34.5000000000533°|Driver +30°, follower −15°|
|(10)|36,571,115|0|30.000000000055067°|−19.49999999999873°|Actual Undo: whole assembly exactly equals8|
|(11)|36,571,111|1|60.00000000002514°|−34.5000000000533°|Actual Redo: whole assembly exactly equals9|
|(12)|36,571,115|0|30.000000000055067°|−19.49999999999873°|Actual Time0 Apply/Save action: whole assembly exactly equals8|

Across8→9 only seven scalar fields change: driver/follower RY and quaternionY/W, plus motion study time0→1. All translations, fixed components, mate records/references, full embedded canonical definitions/history/native caches/configuration authoring and time-zero captures remain unchanged. Native-topology-backed `solveAssemblyMates` on independent clones returns ok, one DOF, no issues or unsatisfied mates for all five exports. The free mechanism retains one DOF even when the study supplies a sampled pose.

Unchanged native Gear2059: external20:40 ratio, reverse=false, followerPhaseDeg4.5, rollA0=0, rollB0=π/40. Unchanged Motion Study1: duration10seconds; motor1745, 5RPM, world +Y, pivot(0,0,0), original base rotation and base position; external20:40 relation, both axes+Y. Its complete `baseRotations`/`__assemblyPoses` SHA256 remains `fe1aa3b87701cf1552dc2828740c8734ad65fbca0b24027c63519ed8d2bd6a7b`. Thus actual seeking did not recapture or shift time zero; unchanged stored relations support the parent's unchecked recapture/keep-relations UI witness.

Full embedded definition SHA256 values, identical across8–12:

- Base1687: `22de683a36cfaf74027890f617f44c4593dc51ba7a731a8d8cfefab74c4db839`.
- Driver shaft1688 and follower shaft1744: `91c9bed10a595ccfcb4aec10606941589c3015fa49d49bef4734ddf8d5f3a373`.
- Driver gear1745: `6270026b74b370ed01d78b6bd3fbf5b1054f148344cfe40b832f881c5e74b764`.
- Follower gear1746: `db0300232c4e696ec439b0a988d116f2dc3b33ef3a94ccadf557b44d10ee5749`.

Whole export12 SHA256: `5d2e171b623363063c36955c8b1838ec7c2a7ff6a162bd55d64e16b4d791b926`. Export timestamps differ, so exact comparisons above refer to the complete saved assembly, not the entire timestamped file.

**Finite actual sampled-motion/Undo/Redo/restored-zero audit passes.** Save completion and exact library cold reopening remain pending parent browser proof. This audit made no browser, CAD, model-state, ADVANCE, ledger or Git writes.
