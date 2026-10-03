# Exercise 8.16 — repaired engine native audit

Read-only verification of the final actual Chrome exports: [editable assembly](../../artifacts/planchard/RE-assembly-annular-repair-browser-2026-10-03.mforge), 13,762,015 bytes, and [native STEP](../../artifacts/planchard/RE-assembly-annular-repair-browser-2026-10-03.step), 1,395,691 bytes. The main agent updated all five piston occurrences from the repaired saved library source through native Chrome controls and saved the assembly clean. This audit regenerated only those saved recipes in memory; it did not modify a protected file, app state, placement or browser document.

## Saved structure and connected geometry

- **55 occurrences / 14 source definitions / 75 canonical native mates.**
- All five RE03 occurrences retain the same source ID and groove seed ID, with inner contour binding `[[3483]]`.
- Every one of the fourteen native recipes independently validates as **one connected valid solid**, including RE03 at **26.743832886563 cm³**. The assembly therefore contains **55 physical solids**, not the previous 75 caused by disconnected piston sections.
- Native aggregate volume: **975.699141842221 cm³**.
- The actual exported STEP imports **55 valid solids**, volume **975.698382850611 cm³**, maximum native tolerance **1×10⁻⁷ cm**. Exchange volume difference is **0.000758991610 cm³** (about 0.000078%).
- Saved mate solve: `ok: true`, **zero issues, zero rebinding, zero unresolved mates, one physical DOF**. The optimizer's internal `converged` flag is false; the public solver accepts the measured constraints under its physical residual criteria.
- All 55 saved component poses match the preserved motor home baseline exactly. Saved study time is 5 seconds, the completed full cycle; this pose equals home.

## Native crank cycle and clearance

The saved rotary study was evaluated at **25 samples**, from 0 to 5 seconds inclusive, at 15° crank increments. Each pose regenerated the same saved physical mechanism and used native BRep intersections for all 55 placed occurrences.

| Gate | Result |
|---|---|
| Solved sampled poses | **25 / 25** |
| Unresolved joints at any sample | **0** |
| Native positive-volume interference pairs at any sample | **0** |
| End-of-cycle journal angle | **0°**, after one complete turn |
| Maximum full-cycle return translation difference | **0 cm** |
| Maximum full-cycle return rotation-matrix difference | **0** |

These measurements establish clearance at the 25 evaluated poses. They do not measure every intervening angle or establish load capacity. The dimensional choices, provisional source quantities and disclosed material proxies remain those of the original designer example.

## Protected audit evidence

- [Persisted contours, source counts and mate solve](../../scratch/planchard/re816-annular-structure-2026-10-03.json).
- [Native recipe validity and all 25 clearance samples](../../scratch/planchard/re816-annular-cycle-native-clearance-2026-10-03.json).
- [Independent actual STEP validation](../../scratch/planchard/re816-annular-step-2026-10-03.json).
- [Exact full-cycle pose closure](../../scratch/planchard/re816-annular-closure-2026-10-03.json).
- [RE03 source repair and cold UI proof](radial-engine-RE03-annular-repair-2026-10-03.md).

The repaired source, exported assembly geometry and sampled native mechanism pass these checks. Earlier assembly/drawing artifacts and their pre-repair audits remain preserved. [Final corrected drawing and actual Chrome playback proof](radial-engine-8.16-drawing-audit-2026-10-03.md) subsequently pass: the clean exploded bundle preserves time zero, unchanged 55-component physical home, ten presentation steps, ANSI C Third Angle and the corrected source geometry. Actual Chrome Play visibly completed 5.00 / 5.00 seconds.

The subsequent clean [assembled home bundle](../../artifacts/planchard/RE-assembly-annular-repair-home-browser-2026-10-03.mforge) also passes the [final home audit](../../scratch/planchard/re816-final-home-audit-2026-10-03.json): saved time zero, unchanged 55-pose baseline, no exploded offsets, all ten presentation steps retained, unchanged audited feature/sketch geometry and five annular bindings. Exercise 8.16 is complete as the disclosed original designer example, with the recorded companion-file, provisional quantity and material-proxy limitations.
