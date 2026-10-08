# 8.19 Arbor press — actual 14-mate free-home audit

PASS for actual Chrome export `artifacts/planchard/AP-assembly-free-home-browser-2026-10-08.mforge` (3,386,046 bytes). The diagnostic closed export and earlier closed-position screenshot are excluded from this audit.

All eleven saved occurrence poses match the frozen open home to 1e-12 cm, including ram/head origin **(45,90,0) mm** and shaft/handle origin **(23,150,0)/(23,150,−34) mm**. Every occurrence definition and custom property is byte-identical to raw accepted placement; the eight accepted definitions retain their materials and source provenance. AP01 remains the only grounded component. Native regeneration validates all eight definitions as single solids.

The saved fourteen mates are active with unique IDs: **8 Lock, 1 Concentric, 3 Distance, 1 Rack and pinion, 1 Limit**. All **12 non-body references** resolve on a disposable clone without issues or rebindings. Limit values are **30–90 mm**, aligned signed distance. Rack pitch radius is **10 mm**, reverse false, with the original captured rackTravel0 −6 cm and pinionRoll0 0 retained; the saved free-home mate has no prescribed driveTurns.

The native clone solve is settled, converged and reports **1 DOF** (moving shaft/handle and ram/head cluster: 24 variables, rank 23). It has no issues or unsatisfied constraints and changes no saved pose: all eleven translation and rotation-matrix deltas are zero.

Fresh native all-pairs intersection at this actual saved home finds **no positive-volume clashes**. The eleven solids total **600.1580396978882 cm³** and **4.719336856673411 kg** using their saved mixed reference-material densities. Nominal ram/guide side clearance is 0.2 mm and the head/table home gap is 62 mm. This report certifies the actual home and reference binding; the core agent separately audits the full native movement sweep.

Evidence:

- `artifacts/planchard/AP-assembly-free-home-definition-audit-2026-10-08.json`: accepted source recipe comparison, native validation and solver.
- `artifacts/planchard/AP-assembly-free-home-native-audit-2026-10-08.json`: eleven native placed solids and exact interference.
- `artifacts/planchard/AP-assembly-free-home-consistency-audit-2026-10-08.json`: frozen home, definitions, mate parameters, twelve resolved reference frames and consolidated PASS.

All authored models were read only; the audit used disposable verification clones. No ADVANCE, browser state or geometry was modified.
