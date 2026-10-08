# Exercise 8.18 Kant Twist — native home placement audit

Actual Chrome export: `artifacts/planchard/KT-assembly-placement-browser-2026-10-08.mforge`,5514396 bytes, assembly`asm_muzv3owb`. Parent authored all geometry and placements in Chrome. This read-only audit rebuilt disposable native shapes from the actual embedded definitions, placed those shapes at saved transforms and checked exact interference. Authored files were not modified; source SHA256 remains unchanged.

**Home placement passes: no positive-volume clashes.** All25 visible occurrences match the frozen home coordinates/rotation matrices. KT01 is the sole grounded occurrence. Sixteen embedded definitions match the16 accepted final browser bundles exactly in feature/sketch arrays, properties, material names/densities/provenance and appearances. Every native definition validates as one solid; this produces25 valid solid occurrences.

| Role | Quantity |
|---|---:|
| KT01/02/05/09/10/11/12/13/14/15 |1 each |
| KT03 Brace A |2 |
| KT04 Pin A |4 |
| KT06 retainer |3 |
| KT07 Brace B |2 |
| KT08 cap |2 |
| KT16 additional spacer |2 |

This retains15 book-role definitions plus one disclosed spacer definition,25 occurrences including the additional Q retainer. KT16 retains BookItemNo=`Additional spacer`, rather than presenting it as book item16. KT13 retains the sourced NBR1.30g/cm³ reference; the other definitions retain Alloy Steel7.70g/cm³ educational provenance.

Important placements verified: Brace A second instance translatesZ−37mm to occupy−20..−17; Brace B second instanceZ−25mm to occupy−14..−11. P=(0,150,0),Q=(45,174.230769230769,0),JA=(65,185,0),JB=(65,115,0)mm; RA=(−25,105,0),RB=(−25,195,0)mm. Shaft atRA, handle bar/grip origin(−25,83,0), grip screw(−65,83,0) rotatedY180°. Positive/negative JB spacers atZ14.2/−20.2mm, allretainers/caps correctly placed. The full25-pose coordinate table and expected rotation matrices are in the JSON audit.

Total native nominal volume **180.1617864487095cm³**, total mass **1367.4709127324477g**. Density-weighted home center of mass≈(15.713245198761,98.455725382178,−0.054233582355)mm. Exact native interference detection across all25 occurrences returns **hits=[]**; touching/contact surfaces do not count as positive-volume interference.

This is a **placement-only checkpoint with zero canonical or legacy mates**. A disposable zero-mate clone solve leaves every pose unchanged and reports no issues; its reported0DOF is not physical acceptance of an unmated assembly. Twenty-four ungrounded occurrences remain to be connected. Native topology reference binding, physically supported P/Q grounding, trunnion/screw closed loop, guided/free-swivel mobility, endpoint limits and full driven motion/interference remain pending. Home clearance does not certify continuous handle roll or closing travel.

Evidence:

- `artifacts/planchard/KT-assembly-placement-frozen-plan-audit-2026-10-08.json` — all25 transforms,16 final recipe/provenance comparisons, input checksum, aggregate mass/COM.
- `artifacts/planchard/KT-assembly-placement-definition-audit-2026-10-08.json` — each native single-solid validation and recipe source match.
- `artifacts/planchard/KT-assembly-placement-native-home-audit-2026-10-08.json` — native25-occurrence total mass and exact home interference.
- `scratch/planchard/audit-kt-assembly-placement-readonly.mjs`, `audit-bv-assembly-readonly.mjs`, `verify-dp-assembly-all-native.mjs` — repeatable read-only inspections.
