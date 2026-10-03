# Exercise 8.16 — drawing and preserved mechanism audit

Read-only inspection of the actual [browser assembly bundle](../../artifacts/planchard/RE-assembly-drawing-browser-2026-10-03.mforge) and [exported SVG drawing](../../artifacts/planchard/RE-ANSI-C-drawing-browser-2026-10-03.svg), 2026-10-03. No model geometry, app state, browser document or protected export was modified. Dimensions remain original designer choices; the book companion parts and AVI are unavailable.

## Export checks

**Source revision scope:** this drawing and bundle predate the [RE03 annular repair](radial-engine-RE03-annular-repair-2026-10-03.md). Their structural counts remain recorded below, but they are superseded for piston geometry acceptance. A refreshed assembly and drawing must carry the connected repaired pistons; earlier native collision reports cannot establish clearance of that changed geometry.

| Check | Measured saved result |
|---|---|
| Components / definitions / canonical joints | **55 / 14 / 75** |
| Sheet | **ANSI C landscape**, 558.8 × 431.8 mm (22 × 17 in), document units mm |
| Projection | Saved `third`; actual SVG prints **THIRD ANGLE** and its projection symbol |
| Title / number / revision | RADIAL ENGINE - FIVE CYLINDER DESIGNER EXAMPLE / RE-8.16 / A |
| Exploded view | One active view, **10 manually authored steps**, 53 components with nonzero presentation offsets |
| Balloons | **55 circles with 55 paired leader lines, target dots and numeric labels**, one per occurrence |
| Exploded guide lines | **53**; actual SVG has 54 center-style lines, including the projection-symbol centerline |
| BOM | **14 rows**, quantity sum **55**, matching source-role counts |
| Preserved home | 55 saved baseline poses; current component x/y/z/rx/ry/rz match the motor baseline exactly; study time 0 |
| Preserved motor | One rotary motor on RE13 rear journal (component3548), +Z axis, origin pivot, 12 rpm, identity baseline; study duration10 s |

The exploded offsets remain presentation data. All physical component transforms are preserved at the home pose rather than being replaced by exploded coordinates. The bundle persists drawing settings on the assembly; its separate `drawings` array is empty, and the actual sheet is protected as the SVG linked above.

## BOM quantities

RE01 master rod1; RE02 articulated rod4; RE03 piston head5; RE04 piston ring20; RE05 piston pin5; RE06 small-end bushing5; RE07 lower bushing4; RE08 cap pin4; RE09 master bushing1; RE10 crankpin1; RE11 counterweight2; RE12 carrier1; RE13 rear journal1; RE14 front journal1.

The eleven provisional book roles contribute52 occurrences; the three additional support fixtures contribute3. RE08 quantity4 and RE11 quantity2 remain provisional source readings, disclosed in drawing notes. The sheet uses selected mass-proxy material labels; it does not certify the book casting grade, rubber combustion suitability, bearing fits or load capacity.

## Motion and clearance scope

The previously audited 75-joint checkpoint had zero native positive-volume collisions at phase−2.267906474°. The root's full-cycle agent reports motor samples at0,1.25,2.5,3.75,5 s all solve with zero unresolved joints and return to baseline with zero closure difference. These motion results are supplied by that agent and are separate from this drawing-structure audit. Native collision checks of the sampled motor poses were requested from the assembly agent; solver closure alone does not establish swept-cycle clearance.

[Machine-readable drawing audit](../../scratch/planchard/RE-assembly-drawing-audit-2026-10-03.json), [accepted source manifest](radial-engine-8.16-source-manifest-2026-10-03.md), [saved-phase native clearance](../../scratch/planchard/RE-assembly-55-75-interference-audit-2026-10-03.json).

## Final repaired Chrome drawing — supersedes earlier SVG

The main agent updated all five repaired pistons through the library, completed actual Chrome Play at 5.00 / 5.00 seconds, reset the physical mechanism to time zero, kept the home pose and saved, then reactivated the ten-step exploded presentation and downloaded the corrected sheet through Drawing preview.

The actual [repaired SVG](../../artifacts/planchard/RE-ANSI-C-annular-repair-drawing-browser-2026-10-03.svg) is **ANSI C landscape**, 558.8 × 431.8 mm, and prints **THIRD ANGLE**. Read-only SVG inspection confirms **55 balloon circles**, each with a paired leader, target dot and numeric item label; **14 BOM rows totaling 55**; and **53 exploded guide lines** plus the separate projection-symbol centerline. BOM quantities match all fourteen source roles exactly, including five repaired pistons and twenty rings. Title, RE-8.16 drawing number and source/material-proxy notes remain present.

Viewed actual protected screenshots: [final drawing preview](../../artifacts/planchard/RE-ANSI-C-annular-repair-drawing-browser-2026-10-03.jpg) and [completed native Chrome Play](../../artifacts/planchard/RE-motion-annular-repair-complete-browser-2026-10-03.jpg). The latter visibly shows **Complete · 5.00 / 5.00 s**, 55 components, 75 mates and one degree of freedom. The [repaired native audit](radial-engine-8.16-annular-assembly-audit-2026-10-03.md) independently verifies all 25 sampled poses without unresolved mates or positive-volume native interference and exact full-cycle closure.

The corrected SVG passes drawing structure acceptance. The subsequent clean [final exploded assembly bundle](../../artifacts/planchard/RE-assembly-annular-repair-exploded-drawing-browser-2026-10-03.mforge), 13,762,144 bytes, now supplies the saved presentation evidence: **55 / 14 / 75**, exploded true, one active view with **10 steps**, and **53 nonzero presentation offsets**. All **55 physical poses match the preserved home baseline exactly**, at saved study time **0**. ANSI C landscape Third Angle, notes, RE-8.16 number and revision A persist. [Machine-readable repaired sheet audit](../../scratch/planchard/re816-annular-drawing-audit-2026-10-03.json) pairs this final saved bundle with the corrected SVG. The earlier preview screenshot's unsaved presentation state is superseded by this protected clean export.
