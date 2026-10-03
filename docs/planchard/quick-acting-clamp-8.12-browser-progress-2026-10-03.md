# Exercise 8.12 browser progress — 2026-10-03

Resume at **printed page 8-47 / PDF page 425**. The clamp exercise is incomplete. Its companion AVI and part dimensions are unavailable, so this is a labeled original educational designer example. Every part below started with New model and was authored through desktop Chrome's sketch, driving dimension, relation, feature, material, Save and Project bundle controls. No geometry was injected by script and no older part was reused.

| Part | Native key | Accepted geometry (mm) | Protected artifact prefix |
|---|---|---|---|
| QC01 bench base | cm_murv256t | 100×60×6; four Ø6 mounting holes at X±40/Z±20 | QC01-base-browser-2026-10-03 |
| QC02 paired arm plate | cm_murvhsb0 | Front X−8..88/Y±6; thickness6; Ø6 pivots at X0/50/80, Y0 | QC02-arm-browser-2026-10-03 |
| QC03 arm support cheek | cm_murvnpbt | Upright16×48×6, Ø6 pivot X0/Y40; foot32×12×6 | QC03-arm-support-browser-2026-10-03 |
| QC04 rear trunnion U support | cm_murw39gp | Upright X±5/Y0..88/Z0..20; Ø6 pivot X0/Y80 through Z; central Z4..16 slot above Y6; foot X±10/Z−2..22/Y0..6 | QC04-rear-support-browser-2026-10-03 |

Each prefix has a `.mforge` recovery bundle and `.jpg` browser proof under `artifacts/planchard/`. QC02 was widened from the first 90×10 plate through its original driving dimensions and fixed corner coordinates; its protected bundle contains the revised 96×12 profile. QC01/QC03/QC04 use Aluminum6061, density2.7g/cm³; QC02 uses Steel304, density8g/cm³.

QC04 has eight editable history steps, four fully defined sketches, one native solid body, and browser Save reports geometry validated. Its center slot uses a Top datum sketch offset6mm and an 82mm Blind cut, retaining the connecting web and foot. A stale top-level export capability label was repaired without changing geometry or live state. QC01/QC03/QC04 were cold reopened and re-exported through Chrome; all four protected bundles now report `fully-parametric`, successful native rebuild and one body. Eleven targeted bundle/classification tests and all source/link gates pass.

## Resume sequence

1. Build the threaded trunnion with integral Ø5.8 Z journals and Ø8.2 X screw bore. A central transverse pin was removed from the plan because it would block the axial screw bore.
2. Build the arm support crossbar, threaded trunnion, lead screw, T-handle, swivel eye, hanging jaw/pad, pins and retainers from blank models. Use `quick-acting-clamp-8.12-design.md` for frozen dimensions and assembly datums. The bracket feet are educational welded connections to the aluminum base; Lock mates represent those fixed joints.
3. Assemble closed pose: rear pivot A(−35,80,0), arm pivot D(0,40,0), arms60° about Z, eye C(25,83.301,0), jaw pivot P(40,109.282,0). QC04 local origin translates X−35/Z−10. Duplicate QC02/QC03 only as new assembly instances of these freshly authored task parts.
4. Verify native topology mates, one coupled screw DOF, open/closed motion and interference through Chrome. The native synthetic regression alone is not browser assembly acceptance.
5. Complete ANSI C landscape third-angle exploded assembly drawing, BOM, balloons/leaders, notes, properties, native export and reopen.

The screw mechanism code has 28 passing focused native tests: grounded closed-loop decomposition, free helical motion, ± turns, ten-turn seek in quarter-turn increments, reversal and JSON reopen. Instant3D mm controls were checked in Chrome against the feature form at7mm and6mm, then canceled without modifying QC03. Full suite is currently running; see STOP-HERE for the current test status.

## Tabs and recovery

The four completed parts and earlier valve/shock are saved and independently exported. Their tabs can be closed without losing these models. Preserve browser local storage and the repository artifact files. Reload Model Editor → Saved models to resume. The Shock drawing tab is retained as a deliverable; the current ModelForge tab is marked for continued work. Any future unsaved feature must be finished and saved before closing its tab.
