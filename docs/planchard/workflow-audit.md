# Planchard workflow audit

Source: David C. Planchard, *Engineering Graphics with SOLIDWORKS 2021*, supplied local PDF (587 pages). Started September 12–13, 2026. Document instructions were treated as reference material, not authorization to contact the publisher, upload files, or change accounts.

## Scope and evidence

This is an **incomplete implementation and coverage record**, not a claim of SOLIDWORKS parity. The contents and Chapter 5 BATTERY instructions were read; the BATTERY overview diagram was rendered and inspected. Later projects below are inventory from the contents, not completed browser tests.

Modeling was performed with the actual ModelForge UI at `http://localhost:8765/` through the computer-use browser. The sketch, extrusion, edge selections, fillet, deletion, and library saves were authored with clicks and form entry, not injected model JSON or calls to internal JavaScript.

Saved library checkpoint: **Planchard BATTERY - base and side fillets** (original library name retained). It includes the base, four vertical fillets, 3.81 mm inset, 5.08 mm recessed cut, and 1.27 mm fillets on both boundaries of the top rim, plus a fully defined terminal sketch. Nine editable history steps now survive save/reopen with a successful one-body rebuild, including two terminal bosses entered as 15.24 mm with 5° inward draft. Overall dimensions are verified below; a separate direct measurement of the floor attachment remains outstanding.

## Browser-tested sequence

1. Open Model Editor, start a Top-plane rectangle, type both dimensions. The corner rectangle had two remaining degrees of freedom despite its exact size.
2. After adding Center rectangle, enter `2.7in` for width and `68.58mm` for height, with center U/V zero. The UI reported **Fully defined**.
3. Extrude with depth `4.1in` (10.414 cm). The UI reported a successful one-body rebuild.
4. Select four vertical edges in the viewport and apply radius `.5in` (1.27 cm). The exact preview showed four rounded vertical corners and the committed model rebuilt successfully.
5. Select the top face and open a face-attached sketch. Compare the Project and Offset commands with the book's face-boundary offset. The equivalent operation is missing; do not substitute a silhouette and claim equivalence.
6. Save, reopen, and inspect the library. The body retained its feature history, but library dimensions had been clamped to 10×10×10 cm. Corrected dimension persistence now stores the actual extents.
7. Delete the fillet from the tree. Before the fix its geometry remained. After the fix, a browser screenshot showed the sharp base extrusion and two remaining history steps.
8. Recreate the fillet: select one upright edge and click **Parallel edges**. The collector reported **4 edges selected** and **Live · exact preview updates as you edit**. Commit and save.
9. The library showed the actual 6.858×6.858×10.414 cm dimensions (floating-point display noise subsequently formatted separately from stored precision).
10. Select the top face, create an attached sketch, choose **Copy face boundary**, and enter `-3.81mm`. After correcting frozen-arc solver diagnostics, the browser reported one closed, fully defined profile with eight entities.
11. Choose **Extrude cut**, Blind, Reverse normal, `5.08mm`. The first result exposed polygonized cut corners; preserve typed profile curves in cut records and rebuild through the browser. The resulting pocket has true circular walls.
12. Select the thin top rim and choose Fillet with `1.27mm`. Tightening geometric face tolerance excluded the pocket floor; using authoritative solid edges reduced the collector from 48/24 incorrect or duplicate entries to the expected 16 rim edges.
13. Fix the mismatch between preview and history edge names by rebinding against the rebuilt source solid and validating the proposed finish with the exact kernel. Cache verified topology with modeling-input signatures so the lightweight history pass can resolve generated edges without trusting stale data.
14. Commit the rim fillet, regenerate, save, reload the browser, and reopen the library checkpoint. Six editable steps, rounded rim geometry, and **Rebuild succeeded** were verified in the browser.
15. Explicitly create another sketch on the same face. Fix the command reopening the prior pocket sketch instead of creating a new one. The seventh sketch preserves the prior profile and history.
16. Reproduce the terminal sketch using circles, a fixed origin center, radius 0.635 cm, Equal, a construction centerline, Coincident, aligned distance 2.54 cm, and 135° from positive U (45° to vertical). A new sketch geometry list permits explicit selection of overlapping points; Cmd-click selected two distinct endpoints for Coincident in the real browser.
17. Reopening the document exposed numeric ID reuse: actions on a new line could address an older circle. Reserve authored numeric IDs when registering/opening documents and restoring drafts. Clear the affected terminal geometry through the UI, reload the fix, and rebuild the sketch with distinct IDs. The final browser state reports **Fully defined**, three entities, six constraints, three dimensions, and two closed profiles.
18. Trial-extrude both terminal profiles with `15.24mm`, 5° inward draft, Add material, and Merge result. The UI created two boss features but reported **three solid bodies**. Rim reference errors appeared until explicit exact regeneration. Undo the trial extrusion and save the verified seven-step sketch checkpoint; reload and verify the saved sketch remains fully defined. The 114.3 mm final height, floor attachment, and single-solid result are not yet accepted.

### Terminal-sketch fixes

- Preserve unrounded values in Smart Dimension, numeric inspector fields, and dimension-expression fields. Reopening and accepting a 0.635 cm radius must not silently change it to 0.64 cm. Regression coverage verifies this no-op edit leaves the value and undo history unchanged.
- Preserve the snapped point ID at the start of a connected line; prefer an existing sketch point over a coordinate-only origin snap at the same location. Avoid inferring a redundant point-to-itself coincidence when an endpoint is already shared.
- Add the collapsible **Sketch geometry** entity/point selection list, including coordinates and construction state. Browser-tested point selection and construction toggling; readable wrapping checked at the current desktop width.
- Explain valid equation/dimension naming characters when a name is rejected.
- Reserve numeric IDs from loaded library documents and recovered drafts before allocating new sketch objects. Tests cover point/entity/constraint IDs, aliases, serialization, and preservation of a higher existing counter.

### Next terminal acceptance work

The additive history gap is fixed: hosted extrudes lower to an extrusion tool plus union, and each new boss consumes the latest body modifier or merged extrusion. After committing merged profiles, the editor completes an exact rebuild after ordinary refresh settles the document. Real-browser repetition now finishes without a manual Ctrl+B, shows one body and no rebuild errors, and survives save/reload. Verify the actual support is the 99.06 mm pocket floor and the final top is 114.3 mm. The header/library dimensions still use the base-part bounds and omit merged bosses; this remains a separate measurement gap.

## Implemented changes

| Gap | Change | Verification |
| --- | --- | --- |
| Centered design intent requires manual constraints | Center rectangle in Sketch ribbon and command search; four perimeter lines, a construction diagonal, fixed center, midpoint relation, driving width/height | UI fully defined; solver resize and serialization test preserves center |
| Inch/mm conversion burden | Feature numeric length fields accept explicit mm, cm, m, in, ft; angle fields accept deg/rad; safe arithmetic parser retained | UI `2.7in`, `68.58mm`, `4.1in`, `.5in`; mixed-unit arithmetic and wrong-unit tests |
| Four upright edges require repeated orbit/select actions | Parallel edges collects straight edges parallel to first selected edge within the current candidate body/face scope | UI one selected edge → four; tests reject arcs and degenerate directions |
| Catalog clamps and rounds small components | Persist actual positive extents; format display separately | UI library extents; small-part tests |
| Removing a feature leaves its operation on the preview body | Remove matching exact operations/cuts/merges/holes, invalidate mesh and pending build token, rebuild affected previews | Browser sharp-corner restoration; targeted deletion regression |
| Planar face boundary cannot be copied or inset | Exact line/arc/circle extraction with signed offset; fixed sketch copy and explicit non-associative notice | Browser 3.81 mm inset; kernel checks four lines/four R8.89 mm arcs |
| Frozen valid arcs report over-constraint | Omit satisfied implicit arc identities when all their points are fixed; retain invalid-arc residuals | Solver plus actual inset UI |
| Curved pocket corners become polygon walls | Carry typed sketch segments into recorded cutting solids and translation | Browser smooth pocket; cutter has four cylindrical walls and ten faces |
| Thin rim selection includes nearby floors and duplicate display edges | Scale geometric tolerance to modeling precision; use authoritative exact topology for finish selection | Browser collector reports expected 16 edges |
| Valid generated edges fail history validation | Rebind finish targets against the exact source; validate complete exact trial; reuse topology only with matching input signatures | Browser commit/save/reopen; cache invalidation test |

Unit suffix support is for numeric feature/property forms, including Center rectangle. The canvas's keystroke dimension HUD still accepts numeric centimeters. Document-wide display-unit switching is not implemented by this change.

## Remaining project coverage

The working to-do list and coverage matrix live in [book-completion-plan.md](book-completion-plan.md) (§4–§6). This audit stays the history log. Matrix below matches the plan’s §2 status as of the 1-2 freeze.

| Item | Book pages | Saved name | Steps | Exact volume / mass (material) | Dims accepted | Time / clicks vs book steps | Downstream consumer | Open issues |
|---|---|---|---|---|---|---|---|---|
| BATTERY | 229–245 | Planchard BATTERY | 9 | | ✅ | | BATTERYANDPLATE, BATTERY drawing | |
| BATTERYPLATE | 246–254 | Planchard BATTERYPLATE | 12 | 28.18955 cm³ | ❌ centre offset | | BATTERYANDPLATE, STL | 1-4 |
| LENS | 269–285 | Planchard LENS | 13 | | | | LENSANDBULB | |
| BULB | 286–298 | Planchard BULB | 10 | | | | LENSANDBULB | |
| O-RING | 311–314 | Planchard O-RING | | 2.748212 cm³ | ✅ bounds | | CAPANDLENS, design table | 4-5 |
| SWITCH | 315–320 | Planchard SWITCH | | 1.754454 cm³ (after edit) | | | FLASHLIGHT | |
| LENSCAP | 323–332 | Planchard LENSCAP | 11 | | ❌ ritual pending | | CAPANDLENS, STL | 1-3 |
| HOUSING | 335–364 | – | – | | | | FLASHLIGHT, STL | 2A-7 |
| LENSANDBULB | 379–434 | – | | | | | CAPANDLENS | 2B-4 |
| BATTERYANDPLATE | 379–434 | – | | | | | FLASHLIGHT | 2B-4 |
| CAPANDLENS | 379–434 | – | | | | | FLASHLIGHT | 2B-5 |
| FLASHLIGHT | 379–434 | – | | | | | Drawing, eDrawings | Phase 3 |
| BATTERY drawing | 435–480 | – | | | | | | 4-3 |
| FLASHLIGHT drawing | 435–480 | – | | | | | | 4-4 |
| O-RING design table drawing | 435–480 | – | | | | | | 4-5 |
| Homework (per exercise rows) | | | | | | | | 5-1 |
| CSWA examples (per question rows) | 481–520 | | | | | | | 6-1 |

## Earlier boundary gap and remaining coverage

Associative face-boundary conversion/offset now rebuilds from the owning feature result and preserves analytic offset curves. The plate inset was linked and rebuilt in the browser. Multi-loop source faces, general source-dimension changes and live offset previews still require broader validation. The original Project command still creates construction silhouettes.

Exact topology caching currently invalidates on preceding feature, parameter, variable, or relevant sketch changes. A subsequent exact regeneration is needed to repopulate generated-edge data after such edits. Broader downstream-edit, suppression and export coverage remains required.

## Acceptance for each remaining model

Create through the browser; verify the book's dimensions and feature intent; change a driving dimension and rebuild; undo/redo; save/reopen; inspect exact geometry; exercise the downstream assembly/drawing/export that uses it. Record unsupported behavior explicitly. No professional-grade or book-wide completion claim until that coverage exists.

## Validation for the recessed-top checkpoint

- `npm run check` passes (472 linked modules; source assertions checked).
- The final full unit run had 2,557 passes and one test-harness failure because the extracted finish function became async. The harness was updated to await exact validation; all nine affected regression/cache/offset tests pass, including failed-finish non-mutation and invalid frozen arcs. A fresh monolithic unit run after that harness-only change has not been run.
- The broad browser run had 549 passes, 51 skips and one ribbon inventory failure. The ribbon inventory now includes the newly added commands and existing spline/repair/fit tools; all nine ribbon browser tests pass on rerun. No full browser rerun after that fix.
- Actual computer-use verification: copy/inset, blind cut, rim edge selection, exact fillet commit, regenerate, save, browser reload, library reopen, six history steps, and successful rebuild. The saved checkpoint is left open.

## Validation for the terminal-sketch checkpoint

- Fresh full `npm test`: **2,564 passed, 0 failed** (`scratch/planchard/tests-terminals-final.log`). This supersedes the earlier unit-run caveat above.
- Fresh `npm run check`: passes, **473 linked modules**, 1,402 source assertions (`scratch/planchard/check-terminals-final.log`).
- Ribbon browser tests: **9 passed, 0 failed** (`scratch/planchard/ribbon-terminals.log`). No fresh full browser-suite run in this continuation.
- Real-browser save/reload/library reopen: seven history steps, one battery body, successful rebuild, fully defined terminal sketch, two closed profiles. The geometry selection list was visually checked after wrapping fixes. The unfinished extrusion trial was undone and is absent from the saved checkpoint.


## Terminal merge fix verification

- Real browser: recreated both bosses from the saved constrained sketch, depth `15.24mm`, inward draft `5`, Merge result checked. Automatic exact rebuild succeeds, with nine steps and one body. Saved and reopened successfully.
- Canonical history regression builds two successive bosses and checks one exact solid and the combined volume. Separate-body options are checked independently.
- Full tests: 2,565 passed, zero failed (`scratch/planchard/merge-fix-full-tests.log`); the subsequently added separate-body case passes in the 10-test focused suite (`scratch/planchard/merge-fix-tests.log`).
- Final module/link/source gates pass (`scratch/planchard/merge-fix-final-check.log`).
- No claim of whole-book completion or dimensional acceptance of the terminal support/overall height.


## Overall battery dimensions verified in browser

The Mass properties panel now measures bounds from the exact modified solid and displays overall X/Y/Z dimensions in millimetres. The saved battery reports **X 68.58, Y 114.3, Z 68.58 mm**, matching the book's overall dimensions. The quick size label now includes merged-body mesh bounds and displays 7×7×11 cm instead of the original base's 7×7×10 cm. Real-browser reload and visual inspection confirmed both displays. The precise dimensions panel remains open for review.

The focused precision suite passes all seven tests, including exact merged-boss bounds, multiple-body aggregate bounds, and absence of a bounds claim when geometry fails. Module/link/source gates pass (`scratch/planchard/dimensions-tests.log`, `scratch/planchard/dimensions-check.log`). No full-suite rerun for these bounds-only changes. Other ebook models remain outstanding.

## BATTERYPLATE derivation started

Added a saved-library action, **Save copy and open**, which deep-copies the saved definition with new document/library identity and preserves internal sketch and feature references. It opens independently without a placed source instance. Browser-created **Planchard BATTERYPLATE** from the battery, removed both terminal boss features using the tree's Delete keyboard command, retained the fully defined two-circle sketch, and saved the seven-step checkpoint (clean Save status, successful rebuild). The original saved battery was not edited.

Remaining: through-all holes from the retained sketch, base depth 10.16 mm with 3° draft, annular holder from 7.62 mm and 2.54 mm offsets, 10.16 mm holder extrusion at 3°, full-round rim and multiple-radius fillets (PDF 247–252). None of these plate changes is yet accepted. Tree button clicks did not reliably execute deletion; keyboard Delete worked. Subsequent browser interactions became unusually slow with repeated timeouts; reload completed, but reopening the library was not verified in this continuation. Final code gates logged in `scratch/planchard/plate-copy-final-check.log`.

## Plate thickness / hole browser continuation

Recovered browser operation in a fresh in-app tab (tab 2, `recoveryTab`); original tab 1 remains slow. Confirmed independent BATTERY and BATTERYPLATE library cards. Recreated through-all holes, removed obsolete rim Fillet 2 (also removed/recreated downstream holes to preserve valid dependency order), changed base depth to 1.016 cm and draft angle to 3 degrees through feature editor. Eight-step plate reports successful exact rebuild; Mass properties displays 68.5801 × 10.1601 × 68.5801 mm and volume 43.07087 cm³. Library reports saved; simultaneous room-project save warning says browser storage is full. Do not assume room-project persistence.

**Not accepted as book geometry:** screenshot shows a flat top instead of inherited recessed pocket after base-height edit. Face-supported pocket/frame failed to follow resized support, despite green rebuild. Terminal sketch also appears above plate, suggesting its frame remains at old height. Fix support/frame propagation and verify pocket depth plus hole extent before holder construction. Current live plate in tab 2 preserves the reproducible case. No code edits in this continuation.


### BATTERYPLATE continuation — full-round rim and dependent geometry

Browser work on the saved Planchard BATTERYPLATE now reaches 11 editable history steps, including TopFillet (three-face full round). The 3° drafted base, associative 3.81 mm inset, two through holes, and annular drafted holder are in the saved model. The holder support was repaired to the pocket floor; its top was measured at 15.24 mm before the rim operation. Holder fillets remain in progress; do not treat the plate or book as complete.

Closed gaps in this pass: exact linked offset curves survive draft; support resolution distinguishes identical face names at different history steps; annular merged bosses preserve their inner profile; full-round face selection remains intact after clearing the live preview; exact display now uses ordered canonical history instead of applying all legacy finishes after cuts and merges. Canonical save/registration preserves authored coordinates, and canonical sketch frames are no longer rebound to the final displayed body's similarly named face. Save validation refreshes exact topology.

The full-round implementation currently supports a planar center face with parallel straight side boundaries, including the book's drafted plate rim. It is not yet general curved-center SolidWorks full-round parity. Kernel volume tests verify removal of the flat land within tolerance. The browser showed the rounded rim after exact rebuild and successful save, and opening the next fillet kept the history healthy after support-frame repair. Multiple-radius holder fillets and final dimensions/save/reopen verification remain next.

### Completed plate finishing verification

TopFillet and HolderFillet were authored via browser selection, renamed, and grouped as FilletFolder. HolderFillet uses outer-holder R1.52 mm, inner-holder default R1.27 mm and pocket-bottom R1.02 mm. Edge details confirmed holder radii 16.51/13.97 mm and all three selected edges at Y=5.08 mm; no hole or bottom perimeter edges were substituted. The new Browse body edges panel helped disambiguate the pocket edge. Reopened exact Mass properties reported one measured body, volume 28.18955 cm³ and dimensions X68.5801/Y15.24/Z68.5801 mm. STEP export UI reported success; a local downloaded artifact path has not been confirmed.

Exact mass evaluation now uses the same canonical history as display and export. Reopening regenerates canonical display data. Local recovery drafts omit regenerable exact-topology cache to avoid filling browser storage; authored references and imported mesh data remain intact. Latest broad unit/check runs are tracked in scratch/planchard/final-unit.log and final-check.log. The earlier full CI unit stage passed 2572 tests; its unrelated browser suite was stopped after many passing checks because it competed with interactive browser work.

### Lens workflow progress (2026-09-13)
- Browser-built and saved `Planchard LENS`: fully defined Right Plane profile (50.8 mm baseline and left side, 10.16 mm right side, R101.6 mm arc), `BaseRevolve`, `LensShell` (6.35 mm), linked rear-face circle, and `LensNeck` (10.16 mm). Five history steps, one body. Hole Wizard and later lens steps remain.
- Added three-point arc with snapped endpoint identity, origin placement for selected points, and duplicate-anchor cleanup when healing endpoints. Corrected canvas resize observation (backing height lag caused ~6 px click displacement).
- Corrected revolve coordinate mapping via `Use sketch plane coordinates` (enabled for this lens and new revolutions); legacy radial-coordinate records remain available. Exact kernel test verifies distinct large and small end caps, not just bounding dimensions. Earlier lens mass 231.3742 cm³ belonged to the incorrect radial-coordinate mapping and must not be used as a validation result.
- Kernel triangle face ranges now retain exact revolution/spline face identities; shell preview and face-boundary copy regenerate the canonical source history. Boundary copy support now uses the chosen sketch's owning history step.
- Pending: verify restored drafts automatically regenerate stripped topology caches; a lens draft initially reported a missing shell face until Ctrl+B regenerated it. Check current lens mass, neck shape, reopening, and downstream associativity.
- Pending precision audit: BATTERYPLATE edge descriptors revealed a roughly 0.067 cm centre displacement; revisit terminal spacing and holder centre before calling it an exact book match.
- Reference discrepancy on PDF 279: inch branch specifies 1/2-inch bolt clearance (screenshot 0.5312-inch hole), while metric branch says M5. Follow the inch branch for the compatible flashlight assembly unless subsequent dimensions establish a different requirement; document this discrepancy.

### LENS continuation: BulbHole, LensConnector, LensCover
- Browser-authored BulbHole uses the illustrated inch branch: through bore 1.349248 cm, counterbore 1.524 cm diameter × .508 cm deep from inside rear face. Placement circle constrained at face origin. Saved and exact rebuild succeeded.
- LensConnector: Right Plane quarter arc, centre (5.842, 1.016) cm, start (6.096, 1.016), end vertically above centre; radius .254 cm. Thin revolve 360° about Z, .127 cm total mid-plane thickness per step 114 (book prose elsewhere says .100 in; explicit step says .050 in). Fully defined, merged, saved with exact rebuild.
- Added thin revolve for one open line/arc with analytic walls, flat caps, mid-plane/outward/inward thickness; multi-curve thin chains still unsupported. Added canonical revolve merge lowering and plane-aware preview coordinates. Kernel volume checked independently by Pappus and merged-neck regression.
- Added numeric point-coordinate entry, automatically constraining the point; verified in browser for connector centre/start.
- LensCover: copied front annular face, made original boundaries construction, applied ±.635 cm circle offsets with new bidirectional option, then .635 cm outward extrusion. Fully defined, merged, saved and rebuilt.
- Remaining linkage gap: offsets reference copied circles, but source-face boundary regeneration currently only handles a whole single-loop direct extrusion profile. Construction copies driving offset circles need regeneration before solving, preserving entity IDs and constraints. Do not claim full associative cover edits yet.
- Draft recovery now initiates exact regeneration; browser restore temporarily shows missing references while kernel loads, then clears them automatically. Verified on LENS.
- Hole creation verification now checks canonical full history, and new automatic face-origin placement circles are fixed (including small hole diameters).
- Still to do: LensShield/projection/transparency, hole favourites, all later models/assemblies/drawings/exercises, BATTERYPLATE precision correction, broader regression and outstanding workflow gaps.

### LENS shield and appearance follow-up (2026-09-13)
- Browser-created the Front Plane shield from the cover's converted inner circle (R44.45 mm), 2.54 mm reverse extrusion; renamed LensShield. Thirteen history steps, one solid, exact rebuild and library save succeeded.
- Added feature-tree Change transparency, persisted by feature ID. Exact surviving faces receive real materials; face-specific overrides take priority. Verified normal to the shield: the bulb bore shows through the transparent shield and disappears when toggled opaque. Undo restored transparency. The oblique view obscured the bore behind the interior wall, so it was not useful for this check.
- Fixed Normal to preferring the selected planar face outside sketch editing; formerly it used an unrelated old sketch plane. Verified against the shield face in the browser.
- Book PDF 285 also suppresses LensShield before saving the LENS; this final suppression is being applied before proceeding to BULB.
- Remaining gaps: associative copied construction geometry and projected subset loops; transient missing-topology diagnostics during kernel loading; preview geometry reverting after history actions until exact regeneration; Hole Wizard favorites; precision corrections on BATTERYPLATE.


### BULB continuation — completed geometry (2026-09-13)

Created the Right-plane stepped base with a 2.54 mm flange, 14.986 mm flange diameter, 10.16 mm shank diameter and 12.7 mm shank length. Built the bulb end from a cubic spline and a second merged revolve. The spline handles retain four free coordinates, matching the book's undimensioned curve. The thin revolved cut uses 3.81 mm outward thickness and the specified 1.778 mm terminal segment. Added the 2.54 mm spherical Dome to the contact face.

On the flange face, converted its circular boundary and created a construction centerline. Dynamic Mirror created the second V edge. Midpoint, symmetry, perpendicular and point-on-circle relationships fully defined the seed without dimensions. Trimmed the outer circle to the closing arc, healed endpoints, removed redundant relations, and made a reverse Through all cut named SeedCut. The new feature-pattern scope repeats the material removed by SeedCut rather than the entire bulb. Browser verified four notches, edited count to eight, regenerated, and saved Planchard BULB (10 steps, one solid).

New kernel tests verify spherical-cap volume on all three principal axes, invalid-face rejection, Dome height history edits, and caller ownership when cut intersection uses a canonical body. Circular cut-feature pattern tests verify four/eight instance volumes and export validity. Full CI at this checkpoint: 2588 tests, 2586 passing; the two failures (missing Dynamic Mirror state guard and the lifecycle test's renamed implementation function) were fixed; focused 13 tests pass. Full CI needs a final rerun after subsequent changes.

Outstanding quality follow-ups: new feature-pattern preview and count-edit refresh require another browser pass; only subtractive circular patterns have browser acceptance so far. Rebuild/save overlap caused a kernel error; rebuild ordering is now serialized and save waits for an active rebuild, with successful sequential rebuild/save observed. Startup still briefly reports missing topology before exact regeneration resolves it. Pattern's form shows irrelevant layout fields. Dynamic Mirror currently applies to new lines only. Trim/heal still requires redundant-relation cleanup. Hole Wizard favorites, toolbar/shortcut customization, and remaining ebook exercises are not complete.


### O-RING circular sweep (2026-09-13)

Browser authored a Front-plane circle at (0,0), driven diameter 11.049 cm, fixed center, fully defined. Added the missing one-sketch Circular profile sweep option and entered the book's 3.175 mm section diameter. The kernel uses exact semicircular arcs for both the path and section; tests verify the analytical torus volume in Front/Top/Right orientations. Browser created Base-Sweep, rebuilt and saved Planchard O-RING. Mass Properties reported exact X/Y 113.665 mm, Z 3.175 mm, volume 2.748212 cm³. Density remains the app default 7.85 g/cm³; no rubber material has been assigned by the book at this stage.

Renamed the driving sketch Sketch-path; the name was saved, but the tree's storage-key filter incorrectly displayed Sketch. The filter now preserves user names with hyphens; reload verification remains. Circular-profile diameter and path-edit history tests were added. The circular profile currently accepts paths beginning with a line or a whole circle; starting arcs/splines need analytic tangent support. Circular sweep merge behavior and live preview need follow-up before broad pro-grade acceptance.

### SWITCH browser verification (2026-09-13)
- Saved `Planchard SWITCH`: three fully defined sketches, `Base Loft`, and a 5.08 mm Dome; one solid.
- Lower square: 12.7 mm driving Width plus Equal relation. Middle circle diameter `Width`; upper circle diameter `Width / sqrt(2)`; both centers fixed at the origin.
- Created editable chained planes at 12.7 mm intervals. Changed the first offset to 3.175 mm through the browser; dependent upper plane, loft and dome rebuilt successfully.
- Browser exact mass properties after the height edit: X/Z 12.7525 mm, Y 20.955 mm; volume 1.754454 cm³. Default density remains 7.85 g/cm³ (material not specified by this workflow).
- Closed gaps: editable parent-plane offsets with cycle/missing-parent validation; loft source sketches retained/re-read during rebuild; analytic section curves passed to the kernel; Dome accepts circular spline rims only after boundary, area and perimeter checks.
- Remaining fidelity/usability gaps: cross-sketch geometric relations were represented by dimension equations; Description property is not yet exposed; reference-plane labels in the sketch inspector still show the principal orientation and zero local offset; feature breadcrumbs can retain their old name; Performance Evaluation timings are not exposed.

### LENSCAP browser work in progress (2026-09-13)
- Saved `Planchard LENSCAP`: Front sketch Ø124.46 mm, reverse Base Extrude 43.815 mm with 5° outward draft; front face circle Ø98.425 mm and Front-Cut 6.985 mm with 5° inward draft; 3.81 mm Shell removes recess floor and back disk. Five history steps, one hollow solid, verified visually after commit.
- Fixed Shell commit consuming the base extrusion instead of the current body history; now preflights and links after Front-Cut.
- Shell face collection now toggles faces without modifier keys. Shell failures show a shell-specific message.
- Added exact rotational-section fallback for coaxial conical/cylindrical shells with two disk openings when the surface-offset kernel fails. Opening planes stay fixed. Regression checks analytic integrated volume and containment in the source body.
- Next: Right-plane silhouette-linked rear thin revolve cut, offset ThreadPlane, tapered helix, trapezoid sweep thread. These are not yet implemented in the saved model.

### LENSCAP continuation: rear groove and thread path
- Browser saved **BackCut**, reverse thin revolve 360° around Z, 0.127 cm thickness inward, from a linked outer conical silhouette shortened to 0.635 cm. Seven steps, one hollow body; exact rebuild succeeded.
- Added axial cone/cylinder silhouette conversion and complete circular edge projection. Converted entities preserve source topology dependencies and update on exact rebuild. Tests verify the 5° draft slope, length, source radius edits, and offset-plane circle projection.
- Browser created **ThreadPlane** from the narrow rear planar face, offset -1.143 cm against its outward normal. Added face-supported offset planes and dependent sketch-frame rebuilding.
- Browser copied the inside rear circle (radius 6.22387622113482 cm, source Z -4.3815 cm) onto ThreadPlane, fully defined.
- Browser saved **ThreadPath**, pitch 0.635 cm, 2.5 turns, reverse direction, start angle 0°, right handed, taper inward 5°. Canonical rebuild succeeded, nine steps and one solid. Internal path visually checked with transparent display.
- Added sketch-driven helix definitions, direction and taper angle controls, and explicit pitch/turn or height/turn definitions. Unit test verifies start/end axial positions and taper.
- Added Pierce curve attachment for a selected sketch point to a helix start/end; it translates the profile and follows path edits. ThreadSection and final Thread sweep still pending.
- Fixed canonical merged sweep/loft inputs and lowering to a union, plus missing helix sweep source references; needs full LENSCAP swept-thread browser verification.
- Full CI before these latest additions: 2,594 unit tests passed; browser suite 546 passed, 51 skipped, four failures. Fixed missing legacy extrusion end condition, missing Hebrew ribbon labels, and three missing customizable ribbon commands. Focused browser rerun: 74/74 passed.
- Latest focused linked geometry tests: 6/6; Pierce/merge/mechanical/adapter tests: 32/32; checks pass with 484 linked modules. Full CI must be repeated after the thread changes stabilize.
- One browser tab became unresponsive when opening a sketch before restored geometry settled. Recovered saved model in agent tab 5 and closed agent tab 4. Serialization of competing geometry queues remains a gap.

## LENSCAP continuation: thread section and helix sweep path

The LENSCAP continuation was recreated in the browser through the feature tree: a rear inward revolved groove (`BackCut`), a face-supported inward offset `ThreadPlane`, an exact converted circular edge, a right-handed tapered helix (`ThreadPath`, 0.250 in pitch, 2.5 turns, 5° inward taper), and a fully defined trapezoidal `ThreadSection` with a midpoint pierce relation and named `ThreadHeight` equation (0.125 in).

The authoring model now includes helix-aware sweep plumbing in the parametric rebuild, dependency graph, kernel adapter, and browser feature manager. The browser sweep command exposes sketch-profile mode, carries the helix reference through the confirmation corner, and resolves it again at commit time so a single ThreadSection can drive the sweep. The feature validator now recognizes that helix-backed sweeps use one profile sketch plus a helix reference while ordinary sketch-path sweeps still require two sketches. Browser acceptance completed the feature as step 11 (`Sweep 1`), with rebuild order valid and one solid body.

### HOUSING tools 2A-6 (2026-09-13)

Reference planes can be **through a vertex, parallel** to a parent plane (LongRibPlane). The plane stores the two edges that meet at the vertex and follows that corner after the body is edited. Linear Pattern **Pattern seed only** copies a rib's added web on a two-direction grid (XYZ toggles or two picked edges) without re-running Up To Body per copy. Feature Mirror with Keep original was re-verified on a test body. Rib up-to-body was already kernel-tested. HOUSING itself is still 2A-7.

### HOUSING restart: dimension entry gaps (2026-09-14)

The saved library from earlier sessions is not in the in-app Browser pane profile, and no library export exists on disk. HOUSING is being rebuilt from book step 265 in that profile.

Book steps 275–276 (Smart Dimension on a circle, type 4.375in) exposed three gaps:
- **Circle dimensioned as a radius.** SOLIDWORKS dimensions a full circle by its diameter. `addSmartDimension` now writes a `diameter` constraint for a circle and keeps `radius` for an arc. Existing radius dimensions on circles are still matched, so clicking one edits it instead of adding a duplicate.
- **Unit suffixes were misread.** The canvas dimension editor used `parseFloat`, so `111.13mm` became 111.13 cm and `4.375in` became 4.375 cm, without an error. It now uses the feature-form parser (`evaluateFeatureNumber`): mm/cm/m/in/ft, deg/rad for angles, arithmetic, and a wrong-unit rejection. The input is `type="text"` so letters can be typed.
- **Float noise in the editor** (22.29999999999997). The field shows 12 significant digits. Accepting the text unchanged keeps the stored float, which the 0.635 regression still checks. Canvas labels show three decimals of a centimetre instead of one.

Tests: `tests/planchard_dimension_entry.test.mjs` plus the three existing suites that touch dimensions, 61/61. `npm run check` is green.

Browser-verified (Browser pane, real clicks): Front-plane circle → Dimension tool → the editor opened on a diameter (`42.4004716955`, no noise tail) → typed `4.375in` → Apply → canvas label **Ø 11.113 cm**. Enter applies too. An earlier run looked broken only because the automation's `Return` keysym arrives with an empty `event.key`. The circle centre did not snap to the origin (2 DOF left), which the book needs for step 274.

**Origin relation on two-point tools (fixed).** The origin snap moved the click to 0,0, but `addSketchCircle` always created a new free point, so the circle only *looked* centred. SOLIDWORKS adds Coincident-to-origin. The press now remembers its snap (`E.drag.snap`). `snappedSketchPoint` fixes the first point at 0,0 on an origin snap and reuses an existing point on a point snap. This covers the circle centre, the polygon centre and the rectangle's first corner. Browser-verified after reload: Front plane → Circle from the origin → Dimension → the sketch reports **Fully defined**, with no manual Fix. Test: `tests/planchard_origin_snap.test.mjs`.

**Base Extrude (steps 277–280) accepted.** Depth `1.300in` → Mass properties (exact solid) **X 111.125 · Y 111.125 · Z 33.02 mm, 320.2510 cm³**, analytic πr²h = 320.25100 cm³. The book prints [111.13]; 4.375 in is exactly 111.125 mm. Renamed Base Extrude, model named HOUSING, saved.
- Fixed: the centre-of-mass row printed quadrature noise (`X -2.6624468270138713e-16`), and inertia products printed ±1e-19. Values below 1e-9 (relative for inertia) now show 0.
- Gap G10 confirmed: there is no Description property on a part (step 269, "HOUSING FOR 6VOLT FLASHLIGHT"). Settings holds only name and price.
- UI defect: in Settings ▸ Guidance, the "Interface density" label wraps one letter per line in the left panel. (Fixed.)

### HOUSING continuation: Description, BatteryLoftPlane, Sketchsquare start (2026-09-14)

- **Description property (G10 closed for parts and assemblies).** `def.customProperties.Description` is edited under the model name in Settings. It saves, reloads, and links into the drawing title block: TITLE shows it while the stored title is empty or still the model name, and a typed title overrides it. The BOM Description column reads the same property. Browser-verified: HOUSING FOR 6VOLT FLASHLIGHT survives reload and appears in the title block.
- **Drawing sheet was blank (fixed).** In Drawing mode `#mdCanvas` had `width/height:auto`. A canvas is a replaced element, so each resize doubled it to 33,554,432 px.
- **Empty red bar in the Sheet panel (fixed).** `display:flex` beat `[hidden]` on the dangling-dimension box.
- **HOUSING labelled "hybrid" after its first save (fixed).** The exact-regeneration mesh cache on an `ext` part counted as direct geometry. After a re-save HOUSING reads "fully parametric".
- **BatteryLoftPlane (steps 286–293).** Selected the Base Extrude end face → Reference plane → name BatteryLoftPlane, offset `1.300in` (shown as 3.302 cm) → Apply. Saved. Gaps fixed: user reference planes were never drawn in the 3D view (now a translucent square at the resolved origin and normal), and a sketch on one said "Sketching on Front (X·Y)" (it now names the plane).
- **Sketchsquare (steps 294–298).** Create sketch → Datum planes → BatteryLoftPlane → Copy face boundary offers Convert circular edge → the Ø11.113 cm circle is fully defined on the plane.
- **Line to a circle quadrant.** Ending a line on a quadrant added no relation; it now adds `pointOnCircle`, as SOLIDWORKS adds Coincident. Test: `tests/planchard_quadrant_snap.test.mjs`. UI recheck pending.
- **Open: RangeError "Maximum call stack size exceeded"** in the render path (`editor_view.js:470` → `gpu.js:147` → three.webgpu). Repro observed once: sketch open on BatteryLoftPlane → Escape twice (leaves the sketch surface while the sketch stays active) → Select click lands on the model end face → Delete → Line tool click starts a new sketch on that face → draw. A plain reopen of HOUSING does not throw. Also noted: a second Escape leaves the sketch surface without finishing the sketch. SOLIDWORKS Escape only clears the selection or tool.

### Review follow-up (2026-09-13)

2A-1…2A-6 are **kernel-verified**, not ritual-Done. Up To Surface now trims the extrude tool with the selected face (SwitchHole inner cylinder test). Closed reversed spline `kernelCurve` splits on the sample walk. Through-vertex planes resolve from live edges and no longer mutate saved plane origin during rebuild. Library JSON export/import is on the Library pane. Geometry pattern checkbox removed. Sketch fillet driving lengths stay on the original corner. Revolve crossing is checked in sketch-plane space. Toolbox/custom/rubber/polycarbonate densities are no longer silent steel.

