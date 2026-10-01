# Exercise 8.8 gear mates — browser work in progress

The printed Exercise 8.8 (PDF page 420 / printed 8-42) requests a base plate,
two shafts and two different Toolbox gears with a 1:2 gear relation. The
companion models/motion file and manufacturing dimensions are absent. These
parts are a labeled educational design authored from blank through visible
Chrome controls. No preexisting model was used as a seed.

## Twenty-tooth gear accepted

Chrome tab 710858542; saved library record `cm_munjjh4a`, named
`Planchard 8.8 - gear 20 teeth - fresh 2026-09-30`.

- Toolbox rack-generated gear: module 2 mm, 20 teeth, 20° pressure angle,
  cutter depth/module 1.25, tip radius/module .38, backlash .2 mm, profile
  shift zero, face width 8 mm; mating geometry checked with 40 teeth.
- Independent Top-plane sketch: origin snap creates a fixed centre; a driving
  Smart Dimension sets the circle diameter to 9 mm. Fully defined.
- Through-all Extrude Cut accepted, four editable history steps, one solid.
- Actual browser Mass properties says **Exact solid geometry**:
  volume **9.317408 cm³**, mass **.07314165 kg** with the explicitly reported
  default steel density 7.85 g/cm³, COM X0/Y.4/Z0 cm.
- Actual Save succeeded and the exported editable bundle preserves the bore,
  canonical history, approximation metadata, and unsuccessful qualification
  audit. This is an editable educational draft, not production approval.

Artifacts:

- `artifacts/planchard/GEAR20-compact-bored-browser-2026-09-30.mforge`
- `artifacts/planchard/GEAR20-exact-bore-mass-browser-2026-09-30.jpg`
- `artifacts/planchard/GEAR20-qualification-audit-browser-2026-09-30.jpg`
- Dense checkpoints `GEAR20-pre-bore-fresh-browser-2026-09-30.mforge` and
  `GEAR20-bore-committed-fresh-browser-2026-09-30.mforge` remain preserved.

## Actual gaps fixed

1. Toolbox geometry previously lacked a canonical base feature, so a subsequent
   bore referenced a nonexistent `feature:part:…`. Generated extrusions now
   register a real, editable fixed outline sketch and Extrude feature.
2. A fixed relation for every dense sample caused a large rank matrix. Generated
   points now have fixed coordinates without redundant solver equations.
3. The manual-sketch healing tolerance .05 cm collapsed neighboring tooth
   samples. Generated outlines use .000001 cm profile tolerance; the resolver
   also recognizes earlier generated IDs from this run. Cold reopen rebuilt
   successfully, followed by the actual native bore acceptance above.
4. Dense sampling yielded 4,380 short edges and multi-minute native rebuilding.
   Bounded curve simplification preserves root land, tip land and every
   root/involute junction. The compact gear has 1,780 points. Tests compare all
   dense reference points to the simplified boundary for 10/20/40 teeth and
   bound added deviation to **.002 mm**. Stored metadata reports that added
   deviation and **.004 mm estimated total chord error** for this gear. This
   remains a polyline approximation of a generated rack profile.
5. Saving previously discarded the possibility of preserving an unqualified
   draft. Save now retains the unsuccessful standards audit and reports draft
   qualification status. Existing manufacturing exchange gates remain active.
6. A rejected cut now has a persistent report, instead of only a short toast.

## Qualification audit — separate from geometry acceptance

The real Standards command displays 24 failures. None is a missing/open sketch
or native solid error. They are missing service/process inputs: torque, speed,
centre/tooth/profile tolerances, measured profile error, minimum/maximum
backlash, service hours, mate width, load factors, bending/contact safety,
temperature, environment, lubrication, measurement source, validation method,
driver/mate material qualification, and production validation.

No numerical service data or qualification was invented to force a passing
audit. The normal qualified exchange gates remain active. Local STEP, IGES,
STL, 3MF and AMF dialogs now offer an explicit **Export unqualified draft**
choice, retain the failed audit and mark the downloaded filename
`__UNQUALIFIED_DRAFT`. Actual twenty-tooth STEP export through this choice
completed in Chrome: one native solid and one cylindrical bore surface,
7,214,698 bytes. The other draft formats still need browser acceptance.
The educational drawing/motion exercise itself supplies no such service data.

## Verification

`tests/generated_extrusion.test.mjs`: 3/3 passed, including profile resolution,
canonical dependency and dense-reference deviation/landmark checks.
`tests/cad_gear_expansion.test.mjs`: 5/5 passed, including native solids and STEP
volume roundtrip for undercut/shifted gears (17.5 seconds native test).
`npm run check`: no free identifiers, no link errors, 1,490 source assertions.

## Remaining work

The forty-tooth gear's independent bore and native rebuild completed and its
editable draft was saved. Both gears use module 2 mm, pressure angle 20 degrees,
backlash 0.2 mm, face width 8 mm and bore diameter 9 mm. Both were authored
from blank through the Toolbox and sketch/feature UI.

The fresh base plate was sketched as a centred 14 by 10 cm rectangle and
extruded 0.8 cm. A fresh 8 mm diameter support shaft was extruded 1.5 cm and
inserted twice. These example dimensions are absent from the book.

The saved and cold-reopened assembly contains five fresh components and three
native-reference mates: driver shaft/gear concentric, driver axial distance
0.05 cm, and follower shaft/gear concentric. Base and support shafts are fixed.
Driver gear has one rotational degree of freedom; follower still has axial
slide and rotation. The new visible **Apply placement** command was verified
at shaft centres X=-3/+3 cm, Y=0.8 cm and gear starts Y=0.85 cm. The component
picker now remembers its chosen fresh model after insertion and refresh.

Protected three-mate assembly bundle:
`artifacts/planchard/GEAR-assembly-three-mates-browser-2026-09-30.mforge`
(126,762,930 bytes). After the UI agent's occurrence/cache export reduction,
actual Chrome reopen and Project bundle export produced
`GEAR-assembly-three-mates-compact-browser-2026-09-30.mforge`
(36,565,640 bytes), with the same five components and three mates.

The mate inspector reproducibly becomes blank partway through reference
selection. A persistent exception diagnostic was added and passes module/link
gates; no diagnostic has yet appeared. Two raw diagnostic calls hung despite
their requested timeout and were interrupted. Further work uses normal UI
only; this issue is not claimed fixed.

Follower axial mate, actual 1:2 gear relation/motion and clearance remain
unfinished; Exercise 8.8 is not marked complete. Exercise 8.9 and designer
assemblies 8.10–8.20 follow it. PDF pages 423–433 are rendered under
`scratch/planchard/p/designer-*.png` for visual auditing.

## Five-mate and motion acceptance, 30 September

Chrome tab 710858709 cold-reopened the saved five-component assembly. Both
gears now have native bore concentric and start-face distance mates. The
external gear mate uses 20 and 40 teeth; the status shows five mates and one
rotational degree of freedom. Both distance alignments are Aligned. The
exported final poses place gear starts at Y=0.75 cm (the earlier Y=0.85 cm
placement was superseded by the signed native face mate).

The mate chooser continuation now works after memoizing unchanged final
topology, and the native cylinder choices appear before the thousands of
tooth faces. Both bore references were selected through the visible chooser.
The Save conflict caused by comparing a bounded occurrence clone with a full
stored record was repaired: the open baseline retains the exact stored
record. Actual Save and cold reopen succeeded; genuine concurrent-write
protection remains covered by regression tests.

Protected five-mate bundle:
`artifacts/planchard/GEAR-assembly-five-mates-browser-2026-09-30.mforge`
(36,569,486 bytes, five components and five topology mates).

The Motion study form exposed another real gap: browser selects return text
while occurrence IDs can be numeric. The form now resolves selected values
to their saved ID type. Two extracted real-form callback regressions pass for
numeric and text IDs. Actual Chrome **Add relation**, 20:40 external, five RPM,
one second, then Apply committed the study (Undo identifies Motion study and
the document became dirty). The underlying solver replay gives driver +30°
and follower −15°. Motion Save was clicked; its clean-state confirmation and
new bundle export are still pending. Exact interference checking is also
pending, so the exercise remains incomplete.

`npm run check` passed: 609 linked modules and 1,490 source assertions.

### Exact clearance and tooth indexing

The saved signed offsets were corrected through both mate steppers to
−0.05 cm, Aligned. Actual exported gear starts are Y=0.85 cm, providing a
0.5 mm gap above the plate. Exact checking then identified a real 0.148 cm³
driver/follower tooth overlap, captured in
`GEAR-initial-phase-interference-browser-2026-09-30.jpg`.

A follower phase control was added to the Gear mate inspector. It changes
the captured mechanical zero atomically, keeps tooth ratio and motors, and
restarts timeline zero poses. A meaningful phase/motion/JSON-reopen regression
and the existing mechanical tests pass (13 focused tests); check gates pass
with 610 modules and 1,490 source assertions.

Actual Chrome phase 4.5° (half a 40-tooth pitch) was accepted and saved. Because
the chosen bore reference points along −Y, this moves the world's follower
Ry from −15° to −19.5°. Driver Ry remains 30°, both gear Y coordinates remain
0.85 cm, and the study restarts at time zero. Protected indexed bundle:
`artifacts/planchard/GEAR-assembly-indexed-browser-2026-09-30.mforge`
(36,570,054 bytes). The second actual exact-kernel interference report states
**No interference detected**; screenshot:
`artifacts/planchard/GEAR-indexed-exact-clearance-browser-2026-09-30.jpg`.
This verifies this indexed pose, not a continuous contact simulation. Final
indexed motion cold reopen remains to be verified; earlier five-mate reopen
and actual saved 1:2 motion were accepted.
