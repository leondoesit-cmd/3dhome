# Exercise 8.16 — native motion and solid audit

This is a read-only replay of the actual desktop Chrome assembly export `artifacts/planchard/RE-assembly-motion-zero-browser-2026-10-03.mforge`. No model or assembly geometry was generated or changed by the audit. The geometry is an explicitly labeled designer example because the book's companion models and animation are unavailable.

## Sampled crank cycle

The saved RE13 journal motor runs at 12 rpm about world +Z. Exact native solids were rebuilt for the 14 distinct definitions, placed at each solved pose of all 55 occurrences, and checked for positive-volume BRep intersections. The [25-pose machine-readable result](../../scratch/planchard/re816-cycle-native-clearance-15deg-2026-10-03.json) samples 0°, 15°, …, 360° over five seconds. **All 25 samples solved with zero unresolved mates and zero detected positive-volume body intersections.** This establishes clearance at those samples; it is not a continuous swept-volume proof.

The quarter-turn positions are crankpin XY (0,18), (−18,0), (0,−18), (18,0), (0,18) mm. The saved home and 360° poses are identical across all 55 components: maximum position difference **0 cm** and maximum rotation-matrix entry difference **0**. The [five quarter-turn result](../../scratch/planchard/re816-cycle-native-clearance-2026-10-03.json) and [closure check](../../scratch/planchard/audit-re816-closure.mjs) preserve the separate evidence.

## Connected-solid defect found in the saved piston

Native inspection of the saved RE03 piston found **five disconnected solids per occurrence** even though its part document displayed one part/body. Its groove seed `feature_muskm5n4_4` references the outer circle entity 3480 but has no inner `holeProfileEntityIds`; inner circle 3483 exists in the fully defined sketch. The seed and three copies therefore remove a full disk through the wall and split the cup into five axial sections. All other 13 definitions are one native solid each. This accounts exactly for the **75 solids** in the imported assembly STEP: five pistons × five solids plus 50 other occurrences × one solid. The STEP is topologically valid, but the piston is not the intended connected part.

The protected [assembly STEP](../../artifacts/planchard/RE-assembly-home-browser-2026-10-03.step) imports as 75 valid solids, 960.995715177 cm³ and assembled bounds X/Y ±160 mm, Z −32…48 mm. Independent reconstruction of the saved 55 occurrences totals 960.996474169 cm³; the 0.000759 cm³ difference is from STEP exchange tolerance. The [native-solid audit](../../scratch/planchard/audit-re816-native-solids.mjs) and [RE03 subshape audit](../../scratch/planchard/audit-re03-solid-splits.mjs) identify the source.

A read-only clone of RE03 with the existing inner circle bound as `holeProfileEntityIds:[[3483]]` produces **one connected solid**, 26.743832886563 cm³. The original saved source was 23.803299351840 cm³ across five solids.

### Actual browser repair

The browser author edited the existing groove contour and protected the actual [repaired part bundle](../../artifacts/planchard/RE03-piston-head-annular-repair-browser-2026-10-03.mforge) and [STEP](../../artifacts/planchard/RE03-piston-head-annular-repair-browser-2026-10-03.step). Independent replay confirms the original part and feature IDs, outer entity 3480, inner entity 3483, **one connected native solid** and volume **26.743832886563 cm³**. The STEP imports as **one valid solid**, volume **26.743681088230 cm³**, with the expected 44 × 40 × 44 mm bounds. This repaired part awaits cold UI reopening and refresh of its five assembly occurrences.

The 25-pose clearance result above applies to the **pre-repair** disconnected piston and must be repeated on the corrected saved assembly before geometry acceptance. The expected aggregate native assembly volume after five repaired pistons is 975.699141842 cm³, subject to actual assembly replay.
