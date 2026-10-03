# Exercise 8.16 — independent 34-occurrence placement audit

Read-only source: `artifacts/planchard/RE-assembly-34-placement-browser-2026-10-03.mforge`, exported from the actual Chrome assembly. This checkpoint excludes the twenty piston rings and front journal. It has no mechanism mate acceptance yet; this is a static placement audit only.

## Exact native interference

The audit regenerated twelve unique saved component recipes, placed their native BREPs using the saved occurrence transforms, and checked material intersection. Native handles were released after checking.

- 34 visible occurrences; only RE12 carrier grounded.
- Exact aggregate solid volume: 951.224864378880 cm³.
- **Zero positive-volume interference pairs.** Tangency alone is not reported as a material overlap.

Report: `scratch/planchard/RE-assembly-34-interference-audit-2026-10-03.json`. Existing read-only helper: `scratch/planchard/audit-wa-assembly-interference.mjs`.

## Rod length and bearing placement

Stored native-source circle centers, canonical rotations including saved quaternions, and actual occurrence translations give:

| Cylinder angle | Rod bearing-axis spacing mm | Wrist axis vs piston axis XY error mm | Piston offset from radial guide line mm |
|---|---|---|---|
| 0° | 68.00000000000001 | <2e−14 | 0 |
| 72° | 68 | 4.2828e−7 | 2.6705e−7 |
| 144° | 67.99999999999997 | 7.2704e−8 | 2.9647e−7 |
| 216° | 67.99999999999997 | 7.2704e−8 | 2.9647e−7 |
| 288° | 68 | 4.2828e−7 | 2.6705e−7 |

Sub-micrometre residuals arise from decimal placement rounding; they are far below the native geometric tolerance. Bearing axes are parallel to global Z. Axial seating layers remain intentional: master wrist material Z3..9 mm, articulated rods Z12..18 mm, wrist pins spanning the bearing seats.

## Sketch-plane and guide-cylinder audit

All RE01 sketches use Front datum: hub/cut offsets0 mm, stem and wrist boss offsets3 mm. All RE02 sketches use Front offset12 mm. Their occurrence rotations are about Z; no sketch has been mapped onto an incorrect world plane.

The carrier's saved extrusion parameters retain a legacy `axis: x`, but compilation uses its actual Top datum reference and produces **axis Y**. Native topology confirms five inner guide cylinders of radius23 mm. Their axes lie on radial directions0°,72°,144°,216°,288° measured from +Y, with common global Z center6 mm and radial extent60..140 mm. Native axis signs can be inward; a cylinder's unoriented axis is the same bearing line. The real carrier shape therefore aligns with all five piston axes.

Report: `scratch/planchard/RE-assembly-34-pose-audit-2026-10-03.json`; read-only helper `scratch/planchard/audit-radial-placement-readonly.mjs`.

No model, app state, library record, or browser was changed by either audit. Further acceptance must cover the complete 55-occurrence assembly, genuine native mechanism joints, motion poses, and the book drawing workflow.
