# Exercise 8.9 — fresh counterweight example, in progress

The book's PDF page 421 (printed 8-43) supplies no part dimensions and asks for
companion files that are unavailable. Every part below is a clearly labeled
educational example, authored from blank through real dark Chrome UI.

## Accepted parts

- **Axle:** origin-fixed Top-plane circle, driving diameter 8 mm; blind
  extrusion 40 mm. Two editable history steps, one native solid, saved and
  exported. Read-only bundle inspection confirms centre (0,0), radius 0.4 cm.
  `artifacts/planchard/COUNTERWEIGHT-axle-browser-2026-09-30.mforge` (55,672 bytes)
  and matching `.jpg` preserve the actual browser result.
- **Flat:** fully constrained centred Front-plane rectangle 20 by 60 mm;
  extrusion 4 mm along Z. Native Hole Wizard linear layout, two 8.4 mm through
  holes at sketch U=0, V=0 and 20 mm. Three editable steps and one solid; save,
  export and cold reopen succeeded. The protected bundle has only the Front
  sketch, axis Z extrusion and editable Hole Wizard.
  `artifacts/planchard/COUNTERWEIGHT-flat-browser-2026-09-30.mforge`.

## Concrete workflow gaps

Deleting a temporary empty active Right-plane sketch selected the surviving
Front sketch, but the canvas working-plane chip still said Right. The plane
agent's first source repair passed focused tests; actual browser reproduction
still showed the mismatch. A second correction normalizes the dangling active
sketch before comparing its ID. Actual Chrome acceptance then showed the
surviving Front sketch, working-plane text, chip and inspector all agreeing on
Front after deletion. History returned to three steps and the model was saved.
Screenshot: `COUNTERWEIGHT-sketch-plane-deletion-fixed-browser-2026-09-30.jpg`.

The book asks for needed Lock mates. The current palette and solver do not
offer a true relative Lock mate; grounding a component is not equivalent when
its parent must move. This capability is an open book gap.

## Remaining

Weight, Eye Hook, Weight-Hook subassembly, two washers, pan cross-head screw,
hex nut, final assembly, SmartMates, centre Distance/Symmetric mate, Lock mates,
motion, clearance, save/reopen and exchange proof remain unfinished. Exercise
8.9 is not complete.
# Fresh eccentric weight continuation

Built from a new blank document in Chrome tab 710858688: Front origin circle,
driving diameter 5 cm, Extrude depth 1 cm, Hole Wizard Custom simple through
bore diameter 1.6 cm, Circular layout count one, radius 1 cm and angle 90°.
The native rebuild accepted three editable steps and one solid. Plain Carbon
Steel was chosen in the visible material inspector (7.85 g/cm³), and Save
shows no unsaved changes. These are declared designer-example dimensions;
the companion part dimensions are absent.

Saved name: `Planchard 8.9 - eccentric weight - fresh labeled example 2026-09-30`.
Protected steel bundle:
`artifacts/planchard/COUNTERWEIGHT-weight-steel-browser-2026-09-30.mforge`
(114,484 bytes), screenshot with the same stem name `.jpg`.
Hook and assembly fasteners remain pending. A new blank Front hook sketch is
now active; no earlier hook model was reused.

## Fresh eye hook and assembly checkpoint — 2026-09-30

A fresh Front sketch with driving concentric diameters 16 mm and 12 mm was
extruded 2 mm. A separate Top sketch, offset +6 mm, contains an origin-fixed
2 mm diameter circle, extruded 24 mm with Merge result. Chrome reports four
editable steps, fully defined sketches, native rebuild succeeded and one solid.
Plain Carbon Steel was selected, assumed dimensions recorded in Description,
and Save confirmed no unsaved changes. Protected bundle:
`COUNTERWEIGHT-eye-hook-browser-2026-09-30.mforge` (158,240 bytes), with screenshot.

A new empty assembly contains only this run's fresh axle and plate. The axle is
grounded at origin. Native cylinder references provide the concentric mate;
the axle Top datum and plate Front datum provide a distance mate of 1.8 cm,
Aligned. The visible Placement inspector confirms plate Y=1.8 cm, RX=-90°;
its 4 mm thickness puts its midpoint at axle Y=2 cm. Two mates solve with one
remaining rotational degree of freedom. Saved and exported checkpoint:
`COUNTERWEIGHT-assembly-two-mates-browser-2026-09-30.mforge` (360,623 bytes).
Weight/hook subassembly, standard hardware, Lock workflow, final clearance and
cold reopen remain in progress. Lock capability has now been added by the UI
agent; this browser tab requires a safe reload before accepting that workflow.

## Receiving-seat repair recovered and mounted

The revised Weight is saved within the new Weight hook subassembly. Save during
component editing finishes the component and saves its containing assembly; the
standalone three-step Weight library record remains unchanged. After tab 688
vanished, a fresh Chrome tab cold reopened the saved one-component assembly.
A browser export protects its five-step native definition:
`COUNTERWEIGHT-radial-seat-subassembly-browser-2026-09-30.mforge` (271,987 bytes).
Read-only inspection confirms native rebuild success without issues, seat
sketch Top offset 2.5 cm, centre (0, 0.5), driving diameter 0.22 cm, and a
reverse blind Y cut from 2.5 to 2 cm.

The fresh hook occurrence was edited through its native feature dialog: stem
depth reduced from 2.4 to 0.6 cm, four editable steps retained. Placement X=0,
Y=3.3, Z=0.5, RZ=180° puts its stem into the radial bore and its eye tangent to
the weight rim. Chrome accepted native Concentric between seat and stem,
Tangent between weight and eye outer cylinders, and a genuine relative Lock.
The saved assembly reports two components, three mates and no remaining DOF.
Exact interference is currently computing; final export/reopen/clearance and
insertion into the counterweight assembly remain pending.

The exact interference check subsequently completed in Chrome763 with **No
interference detected** for Weight and Eye Hook. Screenshot:
`COUNTERWEIGHT-weight-hook-exact-clearance-browser-2026-09-30.jpg`.
The saved two-component/three-mate revision was exported through Project bundle:
`COUNTERWEIGHT-weight-hook-three-mates-browser-2026-09-30.mforge` (435,620 bytes).
Source gates completed: no free identifiers, no link errors (613 modules),
1,490 source assertions accepted. Final assembly/hardware and cold reopen of
this three-mate revision remain in progress.

## Nested main assembly and saved-pose precision repair

The accepted fresh weight/hook subassembly was inserted as a rigid occurrence into the fresh axle/flat assembly through Chrome 787. Plate second bore and hook inner bore were selected from the real topology chooser. Concentric initially resolved, but Save rounding caused a false over-constrained status with only 1.078e-10 cm measured linear residual and zero angular error. Protected failure bundle: scratch/planchard/COUNTERWEIGHT-nested-concentric-save-failure-browser-2026-09-30.mforge (528,766 bytes), plus screenshot.

A narrow solveCluster change accepts a stalled answer only when every measured physical tolerance is satisfied; exhausted searches remain failures. Reduced frame/pose regression repeats JSON reopening four times and still rejects a contradictory 1 cm distance. All 22 focused mate tests pass. Source gates pass: 614 linked modules, no free identifiers or link errors, 1490 source assertions. Actual Chrome reload and cold Library open accepted all three mates without unresolved status.

An axial Distance mate between arm outer cap and nested hook cap now saves with four resolved mates / two remaining rotational freedoms. Exported checkpoint scratch/planchard/COUNTERWEIGHT-assembly-four-mates-browser-2026-09-30.mforge (530,162 bytes) contains the initial negative gap trial; exact clearance correctly detected weight and hook clashes. Human UI changed signed gap to +0.15 cm to place the hook outside the arm face, saved clean; revised exact interference evaluation is pending. Hardware insertion and final acceptance remain outstanding.

## Main mechanism clearance accepted

The positive 0.15 cm gap clears the eye. Human Placement controls swung the freely rotating weight outward; the example arm was shortened from 6 to 5.4 cm through its driving sketch dimension, preserving both bore centres. Native rebuild succeeded. Chrome 817 cold-opened the saved mechanism with four resolved mates and two rotational freedoms. Exact evaluation of all visible components returned **No interference detected**.

- `scratch/planchard/COUNTERWEIGHT-main-clearance-accepted-browser-2026-09-30.mforge`: 530,682 bytes.
- `scratch/planchard/COUNTERWEIGHT-main-exact-clearance-browser-2026-09-30.jpg`: visible exact clearance proof.

The absent companion dimensions remain explicitly labeled as a designer example.

## Assembly Toolbox and ANSI hardware

Fastener insertion now creates an editable canonical part occurrence inside the assembly. It retains the active assembly and its mates. Actual Chrome inserted an ISO M8 washer and saved/exported the four-component checkpoint, `scratch/planchard/COUNTERWEIGHT-metric-picker-checkpoint-browser-2026-09-30.mforge` (538,062 bytes). That trial washer was subsequently removed through the component Delete control and replaced with the book's ANSI families.

Source-backed 1/4, 5/16 and 3/8 sizes now expose ANSI Type A Narrow washers, hex **machine screw** nuts, and pan cross-head machine screws. See `ansi-toolbox-sources.md` for published manufacturer tables and geometric limits. Pan screw native history includes two Boolean recess cuts; simplified driver walls/crown are explicitly representative. Cosmetic thread declarations are Unified 60°, external 2A and internal 2B.

All-family native BREP generation passes including the new families. Focused ANSI/Toolbox audit tests pass 22/22. Gates pass: 616 modules, no free identifiers/link errors, 1,490 source assertions. Chrome 817 visibly inserted a 5/16 pan screw, two ANSI narrow washers and one ANSI machine nut, retaining all three original mechanism occurrences. The seven-component hardware stack is still undergoing native rebuild, mates and final exact clearance; its completion is not yet claimed.

## Hardware revision and native evaluation repair

Chrome 834 recovered the exact same-run saved draft after tab 817 disappeared. All seven occurrences survived. Two screw mates initially used screw A / moving arm B; the directed solver then removed the arm's rotation. The UI removed those reversed mates and attached screw, both washers and nut as Lock followers of the arm. Saved/cold reopened assembly: seven components, eight mates, two rotational freedoms. Protected pre-clearance export: `scratch/planchard/COUNTERWEIGHT-ANSI-eight-mate-checkpoint-browser-2026-09-30.mforge` (1,025,907 bytes). This checkpoint is not clearance accepted.

Full native evaluation found a real 0.005 cm³ narrow-washer/weight overlap. The labeled example eye OD 16 mm was smaller than the source-backed ANSI washer OD17.4752 mm. Through generic Edit component, the fully defined eye sketch's driving diameter was changed to 18 mm and rebuilt natively. Removing/reapplying its relative Lock allowed the genuine Tangent mate to move the eye centre from 33 to 34 mm. The subassembly was saved and propagated through Update from library. The main assembly retained eight resolved mates/two DOF and was saved clean. Chrome 843 cold-opened this revised assembly; final exact clearance is computing.

The screw's two display primitives and two recess cutters had also caused a false four-body count and bounds-only evaluation. A narrow `hasSingleToolboxKernelRecipe` guard identifies one complete canonical Toolbox union/cut head, allowing exact assembly interference and STEP evaluation. It rejects rollback, foreign projections and additional authored features. ANSI pan screw tree now reports one solid. Six focused ANSI/assembly tests and gates pass (616 modules, 1490 source assertions). The 19 mm initial occurrence is an explicitly labeled metric-length example; the corrected fresh picker exposes exact inch lengths such as 19.05 mm. Cross driver/crown surfaces remain representative, with cosmetic UNC declarations.

## Hardware contact audit accepted through Chrome

The initial numeric gap edit changed the displayed input without committing its value. The protected `COUNTERWEIGHT-ANSI-eye18-gap035-browser-2026-09-30.mforge` therefore actually contains 0.15 cm; its filename is misleading and it remains an unaccepted trial. The mate input now commits Enter explicitly. A focused keyboard regression and actual Chrome dirty-state/save verification cover this repair.

An actual committed 0.35 cm trial put the eye into the front washer. Measurement established a 0.25 cm gap, entered with Enter and saved. Chrome 843 evaluated all visible components: **one native overlap, one declared contact, zero unreviewed overlaps, zero bounds-only pairs**. The sole overlap is screw/nut cosmetic-thread engagement, exact volume 0.0017450999 cm³. Its manually recorded reason states that the smooth screw major-diameter and nut minor-bore proxies overlap during intended engagement; helical thread surfaces are absent. The raw overlap stays visible and this is expressly **not a geometric clearance pass**. The unintended eye/washer and weight/washer collisions are absent.

- `scratch/planchard/COUNTERWEIGHT-ANSI-contact-audit-browser-2026-09-30.mforge`: 1,100,669 bytes; seven occurrences, eight topology mates, saved gap 0.25 cm, persisted measured contact/reason.
- `scratch/planchard/COUNTERWEIGHT-ANSI-contact-audit-browser-2026-09-30.png`: actual dark Chrome native report.

The new contact audit rejects bounds-only findings and blank reasons; changed measurement bounds or volume require another review. JSON reopening, reversed pair ordering and removal are tested. Numeric Enter and contact tests pass; source gates pass with 617 linked modules and 1490 assertions. Saved assembly shows eight resolved mates and two rotational freedoms. Final cold reopening of this contact-annotated checkpoint remains to verify.

