# Exercise 8.12 browser progress — 2026-10-03

Resume at **printed page 8-47 / PDF page 425**. The clamp exercise is incomplete. Its companion AVI and part dimensions are unavailable, so this is a labeled original educational designer example. Every part below started with New model and was authored through desktop Chrome's sketch, driving dimension, relation, feature, material, Save and Project bundle controls. No geometry was injected by script and no older part was reused.

| Part | Native key | Accepted geometry (mm) | Protected artifact prefix |
|---|---|---|---|
| QC01 bench base | cm_murv256t | 100×60×6; four Ø6 mounting holes at X±40/Z±20 | QC01-base-browser-2026-10-03 |
| QC02 paired arm plate | cm_murvhsb0 | Front X−8..88/Y±6; thickness6; Ø6 pivots at X0/50/80, Y0 | QC02-arm-browser-2026-10-03 |
| QC03 arm support cheek | cm_murvnpbt | Upright16×48×6, Ø6 pivot X0/Y40; foot32×12×6 | QC03-arm-support-browser-2026-10-03 |
| QC04 rear trunnion U support | cm_murw39gp | Upright X±5/Y0..88/Z0..20; Ø6 pivot X0/Y80 through Z; central Z4..16 slot above Y6; foot X±10/Z−2..22/Y0..6 | QC04-rear-support-browser-2026-10-03 |
| QC05 threaded trunnion | cm_murwiego | Centered 12×14×10 body; Ø8.2 axial X bore; integral Ø5.8 Z journals, overall Z23.4 | QC05-trunnion-browser-2026-10-03 |
| QC06 arm support crossbar | cm_murwtda1 | Front X±8/Y8..16; symmetric extrusion Z±16 | QC06-crossbar-browser-2026-10-03 |
| QC07 lead screw | cm_murwvxvh | Ø8 shaft X−40..50.091; Ø5.8 nose X50.091..54.091; Ø12 head X−48..−40; Ø5 Z handle bore centered X−44/Y0 | QC07-lead-screw-browser-2026-10-03 |
| QC08 sliding T-handle | cm_murx0km4 | Ø4.8 rod, length60, symmetric Z±30 | QC08-T-handle-browser-2026-10-03 |
| QC09 swivel eye | cm_murx4omr | Front X−10..6/Y±6, symmetric Z±6; Ø6 Z crosspin bore at origin; Ø6 axial recess X−10..−6 | QC09-swivel-eye-browser-2026-10-03 |
| QC10 hanging jaw | cm_murxkr8f | Front X±6/Y−30..6, symmetric Z±6; Ø6 Z pivot through bore at origin | QC10-jaw-browser-2026-10-03 |
| QC11 soft contact pad | cm_murxwbyo | Top X/Z±10; extrusion Y0..3; bonded to jaw underside | QC11-soft-pad-browser-2026-10-03 |

Each prefix has a `.mforge` recovery bundle and `.jpg` browser proof under `artifacts/planchard/`. QC02 was widened from the first 90×10 plate through its original driving dimensions and fixed corner coordinates; its protected bundle contains the revised 96×12 profile. QC01/QC03/QC04 use Aluminum6061, density2.7g/cm³; QC02 uses Steel304, density8g/cm³.

QC05 uses Brass C360, density8.5g/cm³; QC06 uses Aluminum6061, density2.7g/cm³; QC07/QC08 use Steel304, density8g/cm³. Read-only audits of the four new protected bundles confirm `fully-parametric`, successful rebuild, one native body, no rebuild issues and no pending/error geometry. QC05/QC07 each contain nine history steps and four sketches after the accepted cosmetic thread annotations; QC06/QC08 each contain two history steps and one sketch. Their recovery bundle sizes are respectively301959,35348,364597 and47430 bytes.

QC05/QC07 custom thread annotations are complete, saved and independently exported through Chrome. QC05 has an internal right-hand cosmetic thread, designer Ø8mm/pitch4mm, length12mm, origin X+6 and axis−X, ending at X−6. QC07 has an external right-hand cosmetic thread with the same designer diameter/pitch, length90.091mm, origin X+50.091 and axis−X, ending at X−40. Read-only audits confirm both thread features rebuilt with no diagnostics, one body and zero rebuild issues. Corrected full helix placement is shown in `QC05-trunnion-thread-browser-2026-10-03.jpg` and `QC07-lead-screw-thread-browser-2026-10-03.jpg`. These are custom educational annotations; no ISO standard, tolerance fit or modeled helical contact is claimed. The failed initial native bore thread was undone; owner-reference and midpoint-placement fixes were then applied before recreating the accepted annotations. Both corrected parts passed final cold reopen after reload through Chrome: nine history steps including Thread1, one native body and Rebuild succeeded. The QC07 full helix fits the complete shaft in the reopened browser view. The native coupled Screw mate and assembly motion remain pending. Optional T-handle endcap retention is also pending.

QC09 uses Steel304, density8g/cm³. Its207431-byte protected bundle reports `fully-parametric`, six history steps, three fully defined sketches, one native body, successful rebuild and no issues/pending/error geometry. The crosspin bore uses a Front sketch at Z−6 and Through all Along normal; the axial clearance recess uses a Right sketch at X−10 and Blind4mm Along normal, ending at X−6. Both native cut parameter sets were audited read-only after browser Save/export.

QC04 has eight editable history steps, four fully defined sketches, one native solid body, and browser Save reports geometry validated. Its center slot uses a Top datum sketch offset6mm and an 82mm Blind cut, retaining the connecting web and foot. A stale top-level export capability label was repaired without changing geometry or live state. QC01/QC03/QC04 were cold reopened and re-exported through Chrome; all four protected bundles now report `fully-parametric`, successful native rebuild and one body. Eleven targeted bundle/classification tests and all source/link gates pass.

QC10 uses Steel304, density8g/cm³, verified in its protected120376-byte bundle. It contains four history steps, two fully defined sketches, one native body, successful rebuild and no issues/pending/error geometry. The12×36×12mm block uses a symmetric Front extrusion; its Ø6 pivot uses a Front sketch at Z−6 and Through all Along normal.

## Resume sequence

1. Build the pins and retainers from blank models. QC11 is a separate bonded nitrile pad, density1.30g/cm³, with one fully defined sketch, two history steps, one native body and zero rebuild issues. Translate it to jaw Y−33 so its top meets the jaw underside at Y−30; a Lock mate represents the adhesive bond. Use `quick-acting-clamp-8.12-design.md` for assembly datums. The bracket feet are educational welded connections to the aluminum base; Lock mates represent those fixed joints.
2. Decide and implement T-handle end retention; corrected QC05/QC07 custom annotations have passed final cold reopen. The integral QC05 journals replace a separate A pin because a central transverse pin would block the axial screw bore.
3. Assemble closed pose: rear pivot A(−35,80,0), arm pivot D(0,40,0), arms60° about Z, eye C(25,83.301,0), jaw pivot P(40,109.282,0). QC04 local origin translates X−35/Z−10. Duplicate QC02/QC03 only as new assembly instances of these freshly authored task parts.
4. Verify native topology mates, one coupled screw DOF, open/closed motion and interference through Chrome. The native synthetic regression alone is not browser assembly acceptance.
5. Complete ANSI C landscape third-angle exploded assembly drawing, BOM, balloons/leaders, notes, properties, native export and reopen.

The screw mechanism code has 28 passing focused native tests: grounded closed-loop decomposition, free helical motion, ± turns, ten-turn seek in quarter-turn increments, reversal and JSON reopen. Instant3D mm controls were checked in Chrome against the feature form at7mm and6mm, then canceled without modifying QC03. The full checkpoint suite completed with3887 tests passing, zero failures, in914.092 seconds (`scratch/planchard/full-test-clamp-checkpoint-2026-10-03.log`). This verifies the stable prior checkpoint; newer thread-control changes have21 focused passing tests and all source/link gates passing (624 modules/1490 source assertions). Corrected placement, Save and protected export were accepted through Chrome; final cold reopen after reload passed for both, with nine history steps, one native body and successful rebuild.

## Tabs and recovery

The eleven completed parts and earlier valve/shock are saved and independently exported. Their tabs can be closed without losing these models. Preserve browser local storage and the repository artifact files. Reload Model Editor → Saved models to resume. The Shock drawing tab is retained as a deliverable; the current ModelForge tab is marked for continued work. Finish any newly started feature and save/export its part before closing the working tab.

## Save performance checkpoint

Completed current native viewport rebuilds now populate the existing Save proof cache. Geometry, topology and thread changes invalidate reuse; stale, failed, approximate and unverified results remain excluded. Thirty-one focused tests and all624 module/1490 source checks pass. In Chrome, cold-reopened QC05 completed native regeneration; its first Save returned from the click in494ms and subsequently reported `data-exact-save-validation="reused"`. This confirms reuse in the real workflow; it is not a controlled speed benchmark. Commit `c6625de` protects QC01–QC10 and both thread repairs; QC11 and this optimization form the next checkpoint.
