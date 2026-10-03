# Exercise 8.15 welder arm: final browser artifact audit

Read-only audit of the fresh browser-authored assembly bundle `artifacts/planchard/WA-assembly-final-browser-2026-10-03.mforge` (5,805,307 bytes), ANSI C drawing `WA-ANSI-C-exploded-browser-2026-10-03.svg` (489,418 bytes), and `WA-BOM-browser-2026-10-03.csv` (1,172 bytes). The part definitions and saved home transforms match the protected 23-mate native home bundle byte for byte per occurrence. The static native/STEP geometry audit is in `welder-arm-8.15-home-step-audit-2026-10-03.md`.

## Native assembly and motion

- 18 occurrences of 12 distinct browser-authored parts; one grounded pedestal; 23 topology mates; saved home assembly solves in one pass with no failed mates and four physical degrees of freedom.
- Gear mate 3451 has 1:1 ratio and `reverse:false`: the second jaw turns opposite the first in world X rotation.
- Four saved studies each carry a baseline for all 18 component poses. Independent cold JSON replay of time 1 then time 0 succeeds without mate failures: jaws +20°/−20°, shoulder yaw +30°, housing pitch +30°, wrist yaw +30°. Each return to zero restores all 18 home poses; worst measured position delta is 1.8 × 10⁻¹⁵ cm and rotation matrix delta is zero.
- The saved document is assembled (`exploded:false`) with no explosion offset applied to component transforms. Both explode layouts remain: View 1 has 17 steps; active compact View 2 has 16 steps.
- The static home geometry is 18 valid native solids, 485.6869152876 cm³, 3.7407361251 kg with saved material density proxies, bounds 160 × 245 × 100 mm, mass-weighted COM (36.62832711, 79.24019325, approximately 0) mm. Exact pairwise BREP checks at home found no positive-volume material interference.

## Drawing export

- SVG parses as valid XML and declares ANSI C landscape **558.8 × 431.8 mm**, with `viewBox="0 0 558.8 431.8"`; title block states third-angle projection and **1:2 · mm** scale.
- The sheet contains 18 balloon circles, all within page bounds, and 18 dashed explosion guide lines. Its title and notes label this an original educational design example, identify the ferritic stainless density as a proxy for book-specified cast stainless, and disclaim manufacturing tolerances and load ratings.
- The CSV contains 12 BOM rows with quantities totaling 18. Sheet title block includes drawing number WA-8.15, revision A, and the density-proxy mass 3.740736 kg.

## Final cold export

The replacement bundle exported from the clean cold browser state stores **`time:0` in all four studies**, with all 18 full-pose baselines retained. Its part definitions and component transforms still match the protected home bundle exactly; Gear Reverse remains off, the assembly remains assembled, and compact Exploded View 2 remains active. This resolves the earlier jaw timeline metadata mismatch.

Audit data: `scratch/planchard/wa-final-motion-audit-2026-10-03.json` and the home native/STEP audit logs beside it.
