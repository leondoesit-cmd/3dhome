# Planchard book completion plan

**Current continuation pointer (2026-10-08): [ADVANCE.md](ADVANCE.md).** Exercise8.17 Bench Vice accepted; resume Exercise8.18 Kant-Twist Clamp, printed8-53/PDF431. KT01–KT14 standalone definitions accepted; KT15 stand pin retainer in progress. Remaining clamp definitions, assembly, motion and drawing are unfinished. Exercises8.14–8.17 have superseding accepted browser reports. Historical tables below require reconciliation against these reports.

Source book: David C. Planchard, *Engineering Graphics with SOLIDWORKS 2021* (587 PDF pages; text extract at `scratch/planchard/book.txt`). Page references below are **PDF pages**.
Status log: [workflow-audit.md](workflow-audit.md). This plan replaces the audit's "Remaining project coverage" table as the working to-do list. The audit stays as the history log.

This plan combines two independent reviews of the audit and a cross-check of each reviewer's claims against the code and the book. Every "missing" item below was confirmed by a code search on 2026-09-13. Re-verify before starting a task in case it has since landed.

---

## 1. Goal and definition of done

**Goal:** every workflow in the book runs in the browser app, is associative, and passes the acceptance ritual. On that suite, the app should be measurably better than SOLIDWORKS 2021.

**"Better than SolidWorks" means, on this suite:**
- No green rebuild with wrong geometry, and no silent substitutes (Through All for Up To Surface, silhouette for Convert, a flat parts list for nested assemblies).
- Exact BREP values are the source of truth for mass, bounds and interference, using the body's assigned material.
- Every model gets a **time and click count** recorded against the book's numbered steps. The book's step count is the SolidWorks baseline, and CSWA is a timed exam.
- Manufacturing and standards claims stay explicit about what is not certified.

Out of scope unless the book needs it: surfacing, weldments, simulation, CAM, PDM, top-down in-context design.

**Book-complete** = HOUSING, the nested FLASHLIGHT assembly, the three Chapter 9 drawings, STL export, triaged homework and the CSWA examples all exist and survive save and reopen. No "pro-grade" or "book-complete" claim before that.

### Acceptance ritual (every model, every task that touches geometry)
1. Author it through the real UI at `http://localhost:8765/`. No injected JSON and no internal JS calls.
2. Dimensions match the book within **±0.01 mm**. Record volume, and mass with the book's material where the book gives one. Otherwise compute a reference volume analytically (as was done for O-RING).
3. Change a driving dimension, rebuild, and check that downstream features follow.
4. Undo/redo. Save, reload the browser, reopen from the library. The rebuild still succeeds with the same step count.
5. Exercise whatever downstream consumer the book uses (assembly, drawing, export).
6. Record time, clicks, and anything unsupported in the coverage matrix (§6).
7. Unit tests for any new kernel or solver behavior; `npm test` and `npm run check` green.
8. **Commit** one checkpoint per accepted model or task.

---

## 2. Current status (verified)

| Model | Book pages | State | Open issues |
|---|---|---|---|
| BATTERY | 229–245 | Saved, 68.58 × 114.3 × 68.58 mm accepted | – |
| BATTERYPLATE | 246–254 | Saved, 12 steps | **Holder centre ~0.67 mm off** (blocks mates); two holes built as two features, while the book uses one multi-contour cut |
| LENS | 269–285 | Saved, 13 steps, LensShield suppressed | Associative copied construction geometry |
| BULB | 286–298 | Saved, 10 steps | Feature-pattern preview refresh |
| O-RING | 311–314 | Saved | Configurations (Ch 9), material |
| SWITCH | 315–320 | Saved | – |
| LENSCAP | 323–332 | Book's last step (262, rename `Thread`) reached, 11 steps | Dimensional and mass acceptance not done. **Browser-pane rebuild 2026-09-16:** ThreadPlane built from the narrow back rim (steps 189–195: Back view, Face filter, `0.450in` → 1.143 cm, Flip offset) and the stray `sk_30tgo` X·Z sketch deleted from the tree (7 steps). ThreadPath built and saved (steps 199–215): sketch on ThreadPlane, Convert Entities on the back **inside** edge (R 6.2239 at z −4.3815), Helix pitch 0.635 cm / 2.5 turns / taper 5° / reverse / right hand, height derived 1.5875 cm; 9 history steps. **ThreadSection and Thread built and saved (steps 245–262, 2026-09-16):** trapezoid profile on the Top Plane with four construction centerlines, midpoint/equal relations and a driving `.125in` (0.3175 cm) dimension; point 144 pierced to ThreadPath at Helix position Start (DOF 2 → 0); renamed ThreadSection; then Sweep with Sketch profile / Follow path / Add material / Merge result committed from the corner ✓ and renamed Thread. Saved revision 15, 11 history steps, rebuild ok, one part; profile loop is entities 158/159/161/162 with the construction lines correctly excluded. Next: dimensional and mass acceptance for LENSCAP, and the pre-existing Right Plane sketch's 3 free DOF (free in the book too). |
| HOUSING | 335–364 | **In progress (UI), restarted 2026-09-14 in the Browser-pane profile** | Saved: Base Extrude (accepted: 111.125 × 33.02 mm, 320.2510 cm³ = analytic), Sketchcircle, Description property, BatteryLoftPlane (1.300 in), Sketchsquare complete through step 341 (lower-crossing side lines, mirror, trim, 3.100 in × 1.600 in, R .5 in top and bottom fillets; fully defined, 0 DOF, no redundant relation; one extra Vertical from a draft repair). Boss-Loft1 (steps 342–348) accepted on exact bounds 111.125 × 111.125 × 66.04 mm, 596.3463 cm³. Boss-Battery (steps 349–360: back-face copy, 4.400 in, 1° draft) accepted on 111.125 × 111.125 × 177.8 mm, 1355.676 cm³. Shell1 (steps 361–366, .100 in, front face removed): OpenCascade's join offset is invalid on this body; the kernel now builds an exact shell per feature, split on each junction's crease bisector (`shellByJunctionBisectors`). Kernel-verified in node on a body rebuilt in the test: valid, exportable (0.000926 cm), 156.35 cm³, outer 111.125 × 111.125 × 177.8 mm, wall 0.2540 cm all round and next to both junctions (up to t/cos(θ/2) at the sharp cylinder/loft crease, as SOLIDWORKS), 0 of 705 crease samples missing. The earlier ~917 cm³ reading was not a real wall. **Boss-Stop (367–379) unblocked:** ring union valid and exportable, 165.52 cm³. On the saved record (2026-09-15): exact, 156.40 cm³, walls correct, but a `loose-shell-tolerance` warning (0.0082 cm loft seam edges) blocks export until solved. Boss-Stop's converted inner edge follows the exact shell's renumbered edge (geometric fallback for converted circles), no re-pick. **Boss-Stop (367–379) accepted in the UI (2026-09-15):** renamed from Extrude / Boss 3, saved, reopened record rebuilds all five features with no error; Mass properties (exact) 130.175 × 130.175 × 177.8 mm, 165.5745 cm³ = Shell1 + 9.1703 analytic. Next: Draft (383–394). **Draft1:** the app's axis/end neutral plane was a stand-in for the book's picked rim face; built the real pick (G17); node check on the saved record 179.9892 cm³ exact; **Draft1 (383–391) accepted in the UI (2026-09-15):** Draft ▸ Neutral plane · Pick face (rim) ▸ outer wall ▸ 5° ▸ OK, renamed Draft1, saved; saved record rebuilds all six features with no error, Draft1 input Boss-Stop, neutral Shell1 plane:4 at z 3.302; Mass properties (exact) 130.175 × 130.175 × 177.8 mm, 179.9892 cm³ = analytic. Next: Thread with Swept feature. ThreadPlane (398–403) **accepted in the UI** with Flip offset (z 2.9845 cm, saved); ThreadPath (404–419) **accepted in the UI** (converted rim edge R 5.55625, helix .250 in × 2.5, reversed, 180°, 5° outward to R 5.69514, saved); ThreadSection (420–429) is blocked by LENSCAP missing from this profile (G18 Copy/Paste is built). HandlePath (452–484) **accepted in the UI and saved** with G19 Coincident, Intersection and G21 Origin dimension. HandleProfile (485–533) **built in the UI** on Boss-Stop's back face with G20 Pierce to HandlePath's line and the 1.000 in centre dimension (G22); one construction end stays free (G23 false refusal). **Handle (534–545) accepted in the UI and saved (2026-09-15):** Sweep ▸ Sketch profile, HandleProfile then HandlePath, follow path, merged; renamed Handle; saved record has eight features, Handle referencing both sketches, no errors. Rebuild of Shell1 takes about 3 minutes. Not ritual-Done. |
| LENSANDBULB, BATTERYANDPLATE, CAPANDLENS, FLASHLIGHT | 379–434 | **Not started** | Blocked by Phase 2B |
| BATTERY, FLASHLIGHT, O-RING drawings | 435–480 | **Not started** | Phase 4 |
| Homework Ch 5–9 (~63 exercises) | various | **Not inventoried** | Phase 5 |
| CSWA examples | 481–520 | **Not started** | Phase 6 |
| Additive (STL/AMF/3MF) | 409, 521–586 | **No STL/AMF/3MF export** | Phases 3 and 7 |

---

## 3. Verified defects and gaps to fix

### 3.1 Bugs (existing code is wrong)
| ID | Defect | Where | Fix hint | Test |
|---|---|---|---|---|
| B1 | Face-boundary edges ignore edge orientation. At offset 0 on a box top, all 4 edges came back reversed against wire order, so profile ordering can zig-zag or lose corners. | `js/cad_face_offset.js` | **Fixed.** Reversed OC edges swap `from`/`to`, reverse samples, and set `reversed` | `tests/planchard_face_offset.test.mjs` |
| B2 | A linked boundary rejects any face with inner loops, with the misleading message "split into multiple regions" | `js/cad_associative_boundary.js` | **Fixed.** Outer + holes; reject only when loop count changes | `tests/cad_linked_boundary.test.mjs` |
| B3 | A closed ellipse or B-spline edge becomes a zero-length `line` entity (from and to merge into one point) | `js/cad_face_offset.js` | **Fixed.** Closed ellipse → `ellipse` entity; other closed kernel curves split in two | `tests/planchard_face_offset.test.mjs` |
| B4 | Mass properties always use 7.85 g/cm³, whatever material is assigned | `js/cad_mass_properties.js` | **Fixed.** Per-body stock density, mass rows, mm/g toggle | `tests/cad_mass_materials.test.mjs` |
| B5 | A revolve profile that crosses its axis is silently mirrored (`Math.abs(u)`) instead of rejected | `js/core/revolve_geometry.js` | **Fixed.** Rejects crossing; points on the axis allowed | `tests/cad_mass_materials.test.mjs` |
| B6 | Up-to-face and up-to-next cuts behave as through-all | `js/modeler.js`; `js/core/extrude_extent.js`; `js/cad_kernel.js` | **Kernel-verified.** Scalar `to` is the measured hit for the property manager. The solid is a long prism split by the face itself, so a cylindrical SwitchHole does not leave a flat sliver. | `tests/cad_extrude_extent.test.mjs`, `tests/cad_up_to_face.test.mjs` |

### 3.2 Missing capabilities the book requires
| ID | Capability | Book use | Code state |
|---|---|---|---|
| G1 | Up To Surface / Up To Face / Up To Next end condition | HOUSING SwitchHole, steps 563–566 (p.356); CSWA advanced parts | **Kernel-verified (2A-1), plane and cylinder.** The tool is a long prism trimmed by the selected face. Planes extend like SolidWorks (a face off to the side still stops the cut). A face the pull never reaches errors (parallel, behind, spline-side). Up-to-next requires the next face to cover the whole profile. Two-region cuts keep both islands. Cone success and a spline the pull *does* meet are untested. Not ritual-Done until HOUSING. |
| G2 | Sketch Fillet | HOUSING HandlePath, steps 459–462 (p.350) | **Done (2A-3), extended 2026-09-14.** Trims two lines that share a vertex, inserts a tangent arc, keeps H/V, driving radius. Also a line meeting an arc (vertex pick or line-then-arc), keeping a related corner as a virtual sharp; mirrored arcs keep their sweep |
| G3 | Intersection relation (point at the intersection of two edges) | HandlePath, step 475 (p.351) | **Done (2A-4).** Point + two sketch lines or two model edges; rebuild rebinds projected corners |
| G4 | Tangent Arc sketch tool | LongRib sketch, step 633 (p.362) | **Done (2A-5).** Two clicks: existing line/arc endpoint, then the other end; adds a tangent relation |
| G5 | Nested assemblies (assembly as a component) | CAPANDLENS contains LENSANDBULB; FLASHLIGHT (p.379–434) | **Built and landed on planchard (`b3decf5`, 2026-09-23); editor check pending (LENSANDBULB → CAPANDLENS).** A saved assembly inserts as one rigid sub-assembly component carrying its own document; it presents everything inside it as its own topology (ids namespaced by child path), so the unchanged mate solver moves it onto faces inside it. Every component answers for its Front/Top/Right planes and the assembly's own planes are a virtual grounded frame (book steps 148–166, 202); plane-to-plane mates default to Aligned. Tree shows sub-assembly contents and plane rows; publish and BOM see through sub-assemblies. Test: `tests/nested_assemblies_g5.test.mjs`. |
| G6 | STL export (binary, Fine) | HOUSING, LENSCAP, BATTERYPLATE, steps 297–300 (p.409) | Not in the modeler |
| G7 | Symmetric mate | Ex 8.7 | Missing (mates today: coincident, concentric, distance, angle, tangent, limit, screw) |
| G8 | Gear mate in the assembly solver | Ex 8.8 | Only a motion-study relation (`js/cad_gear_motion.js`) |
| G9 | Templates and document properties (PART/ASM-IN-ANSI, -MM-ISO; drafting standard, units, precision) | Every chapter from Ch 5 | Mixed-unit *entry* only; no document-wide units, no templates |
| G10 | Custom properties (Description, part number) flowing to title block and BOM | Ch 9 (p.435–439) | Not found |
| G11 | Drawing: Insert Model Items, BOM table on sheet, revision table, Center of Mass mark, logo/sheet format | Ch 9 | Balloons, sections, details and projection symbol exist; the rest are missing |
| G12 | Design table (spreadsheet-style parameter table driving configurations) | O-RING Small/Medium/Large (Ch 9) | Configurations exist (`js/cad_configurations.js`), but no table UI |
| G13 | Exploded-view collapse animation | Ch 8 (p.407) | Explode exists; check animation |
| G14 | eDrawings equivalent | Ch 8 (p.408–411) | Replace with a read-only share/viewer link (a browser advantage) |
| G15 | AMF / 3MF export | Ch 11 | Missing |
| G16 | 3D sketch for Hole Wizard on non-planar faces | Ex 5.17; CSWA advanced | Partial; verify |
| G17 | Draft Neutral Plane pick (a planar face as pivot and pull) | HOUSING Draft1, steps 386–391 (p.344); moulded-part drafts in later chapters | **UI-accepted on HOUSING Draft1 (2026-09-15).** `draftBrep` `neutralFaceId`; `params.neutralFace` rebound and never drafted (tree, display rebuild, live preview); Draft panel **Neutral plane · Pick face** box; faces to draft additive. Saved HOUSING in node: Draft1 179.9892 cm³ = analytic, radii 5.56517 / 5.81889 cm. Parting-line and step draft, and a reference plane as the neutral plane, are not built. |
| G18 | Copy a sketch from one part and paste it onto a plane of another (Edit ▸ Copy / Paste) | HOUSING ThreadSection from LENSCAP, steps 420–429 (p.347–348) | **Built (2026-09-15); copy and paste checked in the editor on HOUSING (then undone).** Tree ▸ right-click a sketch ▸ Copy sketch (Ctrl+C), then in any part right-click a plane ▸ Paste sketch (Ctrl+V; a selected planar face also takes Ctrl+V). The clipboard is kept in the browser, so it survives closing one part and opening another. What travels: points, lines, arcs, circles, splines and the relations and dimensions between them (`js/core/sketch_clipboard.js`); links outside the sketch (converted edges, silhouettes, model-edge intersections and coincidences, pierce) are dropped and said so. LENSCAP is still not in this profile, so the book's source sketch has to be rebuilt or imported before HOUSING's ThreadSection can be pasted. |
| G19 | Coincident relation between a sketch point and one model edge (point lies on the edge's line) | HOUSING HandlePath, steps 464–468 (p.350) | **Built (2026-09-15); checked in the editor on HOUSING HandlePath (end point onto Boss-Stop's z = 0 rim).** Select a sketch point and one model edge ▸ Coincident records `onModelEdge`; the edge's line on the sketch plane is re-read from the rebuilt body before every solve, so the point follows it. A complete circle seen edge-on (Boss-Stop's rim in the Right Plane) now projects to a line, which also serves Intersection with model edges. A missing edge or one that does not show as a line fails the rebuild with its own message. |
| G20 | Pierce relation between a sketch point and a line of another sketch (a path) | HOUSING HandleProfile, steps 524–531 (p.354); CSWA sweeps | **Built (2026-09-15); checked in the editor on HOUSING HandleProfile (the form listed "HandlePath · line 88"; the centerline's top point moved to X 0 · Y 6.35 cm and the profile followed, DOF 6 → 4, recorded in the draft).** The sketch Pierce form now lists the lines and arcs of other sketches that cross this plane, besides helices; picking one records `pierce`, re-found where that curve crosses this plane on every solve and rebuild (arcs by bisection). Helix pierce still snaps to its start or end. |
| G21 | Smart Dimension from the sketch Origin, and point-to-line distance | HOUSING HandlePath step 477–481 (2.500 in from the Origin to the horizontal line, p.351); common in every chapter | **Built (2026-09-15); checked in the editor on HOUSING HandlePath (Origin to the horizontal line, 6.35 cm, sketch fully defined; Cancel removed a new dimension).** Smart Dimension now treats a pick near the sketch Origin as a point: a fixed point at (0, 0) is found or made once (`js/core/sketch_origin.js`) and flows into the existing point-to-line distance (Origin, then line; or line, then Origin) and point-to-point distance. Also fixed: Cancel in the dimension value editor now removes a dimension that pick just created (the editor was never told it was new). |
| G22 | A sketch point under a dimension's leader line can be picked | HOUSING HandleProfile, 1.000 in between the arc centres (the R .100 leader starts at one centre); any dimensioned arc or circle centre | **Built (2026-09-15); landed on planchard as 184994e (full suite 2830/2830); checked in the editor 2026-09-16 (see the audit).** The Select and Dimension tools grabbed any dimension leader within 10 px before looking for sketch points, so an arc centre under its own R leader could never be picked. `dimensionHitYieldsToPoint` (`js/sketch_dimensions.js`) lets a sketch point under the pointer win over a leader line; the label itself still wins. Test: `tests/dimension_leader_point_pick.test.mjs`. |
| G23 | A consistent relation that removes a free DOF is refused as redundant | HOUSING HandleProfile: the horizontal centerline's right end to the right arc centre (book shows the sketch Fully Defined, p.354) | **Fixed and landed on planchard as b0cd73b (2026-09-15, full suite 2836/2836); re-checked in the editor on HandleProfile 2026-09-16 (see the audit).** Coincident and two-point Vertical between that end (x free, −0.502 cm) and the arc centre were refused with "repeats what is already set by: Symmetric (Point1, Point2, Line2), Midpoint (Point6, Line1)" while the sketch kept DOF 1. The cause was not a zero-slope rank loss: the mirror relations already carried consistent redundancy (rank 25 of 31 rows), which only turned the status "over-constrained" once the last freedom was taken, so the relation that took it was rolled back. `refusesAsRepeat(report, previous)` now refuses an over-constrained edit only if it removed no freedom and added a dependent row (`redundancy` count from `solveSketch`). Test: `tests/sketch_repeat_refusal_g23.test.mjs`. The closed profile is fully set; only a construction end stays free. |
| G24 | Unit suffixes in the sketch constraint list's dimension field | LENSCAP steps 134 and 149 (4.900in, 3.875in); every inch value typed into a dimension row | **Fixed and landed on planchard (`12bf73d`, 2026-09-15).** The row field (`.md-dim-value`) treated anything that was not a plain number as a unitless equation, so `4.900in` was silently rejected. `expandUnitLiterals` (sketch_equations.js) now serves the row field, `resolveEquations` and feature fields alike, so a stored `4.900in` rebuilds and names still work (`Dia / 2 + 1mm`). Test `tests/dimension_row_units_g24.test.mjs`; full suite 2844/2844. |
| G25 | Back and Left standard views | LENSCAP ThreadPlane: the narrow back face at z −4.3815 is reachable only by a hand orbit | **Fixed and landed on planchard (`e2bc72a`, 2026-09-15).** View toolbar Back · X·Y and Left · Z·Y, camera-only like Isometric (they do not swap the active sketch). Test `tests/view_back_left_g25.test.mjs`. |
| G26 | An empty plane sketch left by a view switch is invisible and cannot be deleted | LENSCAP carried `sk_30tgo` ("X·Z sketch", no history row) after Top was clicked with the BackCut face sketch active | **Fixed and landed on planchard (`1cfcda8`, 2026-09-16; full suite 2844/2844).** A face sketch cannot follow the view, so `adoptSketchForView` opened a new plane sketch; the tree lists only history rows. `pruneAbandonedSketches` drops a plane sketch that is empty, not renamed, not active and mentioned nowhere else, after a view swap and before Save. Test `tests/abandoned_plane_sketch.test.mjs`. |
| G27 | A sketch at 0 DOF still reads "Over-defined" when its redundancy is consistent | HOUSING HandleProfile after the G23 relation: 17 constraints, 0 DOF, no refusal, panel chip "Over-defined" (book shows the sketch Fully Defined, p.354) | **Fixed and landed on planchard (`15ea1b5` + `51c3134`, 2026-09-23).** Two parts. (1) Pure repeats are not created: `pruneImpliedRelations` drops what the Line tool infers and what mirror/pattern add when the sketch already implies it, and a hand-added relation that adds nothing is refused at any DOF (checked in the editor on ThreadSection). (2) Status follows SOLIDWORKS: the book's HandleProfile Pierces the top of a vertical centerline already Coincident with the Origin — a partial repeat — and reads Fully Defined (p.7-45), so consistent overlap among relations is Fully defined; only a wholly redundant dimension is Over-defined. The overlap stays counted (`redundancy`) and named (`repeated`). Checked with the served solver on the saved HOUSING HandleProfile: with the G23 Vertical it reads fully-constrained, 0 DOF, overlaps 105/113/127 named (was Over-defined). |
| G28 | A helix reference record was write-once, so its driving circle was not parametric | LENSCAP ThreadPath (steps 199–215) | **Fixed (2026-09-16).** `synchronizeSketchHelices` re-derives helix references on rebuild and `resolveSketchSources` prefers the owning feature. See the audit. |
| G29 | A sweep along a helix did not turn its section — the thread broke out through the part | LENSCAP Thread (steps 257–262): tool r 5.8053 → 6.5035 for a 6.2239 anchor; the user's "thread goes through the lens cap" | **Fixed and landed on planchard (`2bf26f6`, 2026-09-23).** The helix reached MakePipeShell as a polyline, on which no orientation mode can rotate the section. `helixSweepPath` hands it one C2 B-spline; old saved sweeps rebuild on it. Verified on the saved LENSCAP (tool 5.7775 → 6.2239, body 17 faces). |
| G30 | A contradictory relation collapses geometry instead of being refused | LENSCAP ThreadSection: Horizontal applied to an already-Vertical line shrank it to zero length and collapsed the whole profile to one point, no refusal | **Fixed and landed on planchard (`15ea1b5`, 2026-09-23).** The rollback gate refuses an edit that crushes a drawn entity (`collapsedEntityIds`). Checked in the editor on ThreadSection with its length dimension suppressed: "Horizontal (Line8) has no solution in this sketch. It fights: Vertical (Line4), Equal (Line2, Line3)", geometry untouched. |
| G31 | The Sweep form does not show which path it will follow | LENSCAP Thread: with one sketch selected the sweep silently binds to the only helix; no Path row names ThreadPath | **Fixed and landed on planchard (`15ea1b5`, 2026-09-23).** Sweep form Path row (helices by tree name, or the second selected sketch); an explicit sketch path is honoured; editing the path moves the sweep's sources, references and merge. Checked in the editor: new Sweep on ThreadSection and Edit Thread both read Path = ThreadPath. |
| G32 | New sketches and features ignore the rollback bar | HOUSING Thread (steps 420–451): with the bar above Handle, the pasted ThreadSection was appended after Handle | **Fixed and landed on planchard (`132dd25`, 2026-09-23).** Every new history entry goes in at the bar and the bar moves past it; a body feature inserted there becomes what later steps build on (`reconnectLaterBodyConsumers`). Test: `tests/rollback_insertion_all.test.mjs`. |

**Not a gap (a reviewer thought it was):** mirroring existing sketch entities already exists (`mirrorSelection`, `js/modeler.js:12122`). Only Dynamic Mirror is limited to new lines.

### 3.3 Operational risks
| ID | Risk | Action |
|---|---|---|
| R1 | 284 uncommitted files on unrelated branch `layers-perf` | Split into reviewed commits on a `planchard` branch before Phase 1 ends |
| R2 | "Browser storage is full"; tab froze opening a sketch before topology restored; save/rebuild overlap | Move library/project storage to IndexedDB (or file-backed); serialize geometry queues; strip regenerable caches. Must hold 8 parts + 4 assemblies + 3 drawings |
| R3 | Missing-topology flash on open; preview vs exact history mismatch | Fix during Phase 1; it gets worse at assembly scale |

---

## 4. Phases

Dependencies: **1 → (2A ∥ 2B) → 3 → 4 → 5 → 6 → 7**. Phases 2A and 2B run in parallel.

### Phase 1 — Stabilize and freeze (start here)
| Task | Work | Done when |
|---|---|---|
| 1-1 | Commit the current work in reviewable chunks on a `planchard` branch (R1) | Clean tree; `npm test` and `npm run check` green |
| 1-2 | Replace the audit's coverage table with the matrix in §6; keep the narrative as the log | The matrix matches §2 |
| 1-3 | Accept LENSCAP dimensionally: Ø124.46, 43.815 depth, 5° draft, 3.81 shell, thread pitch 0.250 in, 2.5 turns, 5° taper, section height 0.125 in | Ritual passes; values recorded |
| 1-4 | Fix the BATTERYPLATE holder centre displacement (~0.67 mm); decide on one multi-contour cut vs two features | Kernel drafted concentric holder stays on axis. Saved plate still needs a library rebuild: **one multi-contour cut** for the two holes. Holder sketch must be recentred on origin |
| 1-5 | Fix B4 (per-body material density) plus a material-assignment UI | **Partial.** Per-body stock density, toolbox catalog densities, custom density, rubber and polycarbonate. mm/g toggle; mass rows show material. Not ritual-Done for O-RING/LENS. |
| 1-6 | Fix B5 (revolve axis crossing) | **Done.** Rejects with "The revolve profile crosses the axis" |
| 1-7 | **Decide document units and templates now** (G9 design only). Retrofitting 8 saved parts later is a migration. Write the design: document unit, drafting standard, precision, template = saved document defaults | **Done.** [document-units.md](document-units.md) |
| 1-8 | Storage and queue hardening (R2, R3) | **Code landed.** Assemblies and drafts in IndexedDB; **library JSON export/import** so HOUSING / 1-3 / 1-4 can leave the Cursor profile. Autosave JSON not in localStorage; missing-topology hidden until first exact regen. Browser load of 7 parts still needs the user's library |

### Phase 2A — HOUSING tools, then HOUSING (p.335–364)
| Task | Work | Done when |
|---|---|---|
| 2A-1 | **Real Up To Surface / Face / Next** (G1/B6) for extrude cut and boss: terminate the tool at a selected face (planar, then cylindrical/conical), or at the next face along the direction. Store the face as a persistent topology reference that re-resolves on rebuild | **Kernel-verified (plane + cylinder).** Shelled-box cut stops at the inner wall (volume 32 vs 48 when thickness 2→3); planes extend off-profile; a miss errors (parallel / behind / spline-side); two regions stay two islands; up-to-next skips a partial-coverage step; SwitchHole Ø12.95 mm at 11.43 mm opens the inner Ø of a Ø111.13 × 33.02 mm shell with no sliver and the opposite wall intact. Cone/spline *success* untested. Not ritual-Done. |
| 2A-2 | Fix B1, B2, B3 (Convert/offset of housing faces) | **Kernel-verified.** Offset-0 box/fillet wires chain; hole faces keep inner loops; closed ellipse is not a zero-length line; reversed closed spline splits on the sample walk |
| 2A-3 | Sketch Fillet (G2): trims two connected lines, inserts a tangent arc, keeps relations | **Kernel-verified.** Vertex or two-line pick; 0.5 in HandlePath L stays fully defined; radius dimension rebuilds; driving lengths stay measured to the original corner |
| 2A-4 | Intersection relation (G3) in the solver plus the Add Relations UI | **Kernel-verified.** Point stays on both edges after the housing edges move |
| 2A-5 | Tangent Arc tool (G4) | **Kernel-verified.** Book step 633: click the line endpoint, then the other end; the arc stays tangent |
| 2A-6 | Browser-verify on a test body: rib up-to-body, two-direction linear pattern with "pattern seed only", plane through a vertex parallel to a plane, feature Mirror | **Kernel-verified.** Through-vertex-parallel planes follow rebuilt edges without rewriting saved bindings; Pattern seed only copies a rib's web on a 3×3 grid; Geometry pattern checkbox removed; Mirror keep-original doubles volume |
| 2A-7 | **Build HOUSING end to end from the book**: Base Extrude, BatteryLoftPlane, loft with guide curves, Boss-Stop, Shell, ThreadPlane/ThreadPath/ThreadSection/Thread, HandlePath/HandleProfile/Handle sweep, SwitchHole (Up To Surface), Rib1 plus linear pattern, LongRibPlane, Rib2, Mirror | **In progress.** Base Extrude + Sketchcircle (start face) + BatteryLoftPlane (3.302 cm behind the start face) + Sketchsquare (fully defined). Remaining: Boss-Loft1, Boss-Battery, Shell, Boss-Stop, Draft, Thread, Handle, SwitchHole, ribs, Mirror. Ritual not started. |

### Phase 2B — Nested assemblies (parallel with 2A)
| Task | Work | Done when |
|---|---|---|
| 2B-1 | Save assemblies to the library; insert an assembly as a component (G5) with its own transform, hide/show, suppress | An assembly inside an assembly survives save/reopen |
| 2B-2 | Mates across subassembly faces; subassembly moves as a rigid unit; interference and explode treat it as one or many | Mate a face deep in a subassembly |
| 2B-3 | Assembly templates ASM-IN-ANSI / ASM-MM-ISO (uses the 1-7 design) | New assembly from template |
| 2B-4 | Build **LENSANDBULB** and **BATTERYANDPLATE** from the saved parts per the book (coincident, concentric, distance) | Fully defined; save/reopen |
| 2B-5 | Build **CAPANDLENS** (LENSCAP + O-RING + LENSANDBULB as a subassembly) | Nested save/reopen |

### Phase 3 — FLASHLIGHT (p.379–434)
| Task | Work | Done when |
|---|---|---|
| 3-1 | FLASHLIGHT = HOUSING + SWITCH + CAPANDLENS + BATTERYANDPLATE, book mates, Quick mate, Move/Rotate Component | Fully defined |
| 3-2 | Interference detection reports the Rib2 clash; change Rib2 33.02 → 34.29 mm (book steps 251–252); interference clears | Clash volume reported, then zero |
| 3-3 | Exploded view with whole-subassembly steps plus collapse/explode animation (G13) | Animates; save/reopen |
| 3-4 | STL export, binary, Fine resolution (G6), from exact tessellation: HOUSING, LENSCAP, BATTERYPLATE | Watertight check (no open edges); re-import bounds match exact bounds |
| 3-5 | Share/viewer link as the eDrawings equivalent (G14) | Read-only view opens in a fresh browser profile |

### Phase 4 — Drawings (p.435–480); Chapters 1–3 are the quality checklist
| Task | Work | Done when |
|---|---|---|
| 4-1 | Implement the 1-7 design: document units and standard, part/drawing templates, sheet format with logo (G9) | Chapter 9 template steps reproduce |
| 4-2 | Custom properties (Description, part number, material) editable on parts, linked into the title block (G10) | Edit a part property → title block updates |
| 4-3 | BATTERY drawing: Front/Top/Right/Detail/Isometric, third angle, Insert Model Items (G11) | Change terminal height in the part → drawing dimension updates |
| 4-4 | FLASHLIGHT exploded drawing: BOM table on sheet, balloons linked to BOM item numbers and part numbers, revision table (G11) | Add a component → BOM and balloons update |
| 4-5 | O-RING design table (G12): table UI with Sketch-path and Sketch-profile diameters for Small/Medium/Large configurations; drawing table; Center of Mass mark (G11) | Switch configuration → model and drawing update |
| 4-6 | Chapters 1–3 checklist review: alphabet of lines and precedence, projection symbol, dual dimensioning, hole/thread callouts, tolerance display | Checklist file with pass/fail per item |

### Phase 5 — Homework (Chapters 5–9)
| Task | Work | Done when |
|---|---|---|
| 5-1 | Inventory every exercise into §6 with a source type: **printed-dimensions** (rebuildable) or **needs-companion-file** (5.16, 5.17, 8.1, 8.2 and others that "copy and open" or "insert from the Homework folder") | Complete list |
| 5-2 | Triage the needs-companion-file exercises: rebuild from the pictured dimensions if enough are shown, otherwise mark as skipped with a reason. Do not download SDC files | Every row has a decision |
| 5-3 | Build the rebuildable exercises, each as a named library checkpoint plus a regression test. Add features as they come up: symmetric mate (G7, Ex 8.7), gear mate (G8, Ex 8.8), cosmetic thread (Ex 5.16), 3D sketch Hole Wizard (G16, Ex 5.17), variable-pitch helix (Ex 7.10) | Ritual per exercise |

### Phase 6 — CSWA (p.481–520)
| Task | Work | Done when |
|---|---|---|
| 6-1 | Rebuild each Chapter 10 example; answer in the requested units (grams, mm, centre of mass relative to the stated coordinate system) | Every answer within **1%** of the book's answer |
| 6-2 | A timed run of a full practice set; record minutes per question | Times recorded; slowest workflows filed as UX tasks |

### Phase 7 — Additive and polish
| Task | Work | Done when |
|---|---|---|
| 7-1 | AMF and 3MF export (G15), including units and material metadata | Opens in a slicer; bounds match |
| 7-2 | Print-prep advisory: build orientation, overhang warning, fit clearance for interlocking parts | Advisory only; labelled as such |
| 7-3 | Polish backlog from the audit: Hole Wizard favourites, Dynamic Mirror on existing entities, Description in the inspector, reference-plane labels, stale feature breadcrumbs, Performance Evaluation timings | Each closed or deferred with a reason |

---

## 5. Rules for the coder

- **No substitutes.** If the book's command doesn't exist, build it or record the gap. Never build something that looks equivalent and mark it accepted.
- **Do not download** the SDC companion files or contact the publisher.
- **Don't chase unrelated work** (gears beyond Ex 8.8, ISO packs, cabinet manufacturing) unless it unblocks a book step.
- Where the book contradicts itself, follow the illustrated inch branch and log it (precedent: the M5 vs 1/2 in bolt hole, p.279).
- Update the §6 matrix and commit at the end of every task. The audit narrative is optional; the matrix is not.

---

## 6. Coverage matrix (keep this current)

| Item | Book pages | Saved name | Steps | Exact volume / mass (material) | Dims accepted | Time / clicks vs book steps | Downstream consumer | Open issues |
|---|---|---|---|---|---|---|---|---|
| BATTERY | 229–245 | Planchard BATTERY | 9 | | ✅ | | BATTERYANDPLATE, BATTERY drawing | |
| BATTERYPLATE | 246–254 | Planchard BATTERYPLATE | 12 | 28.18955 cm³ | ❌ centre offset | | BATTERYANDPLATE, STL | 1-4 |
| LENS | 269–285 | Planchard LENS | 13 | | | | LENSANDBULB | |
| BULB | 286–298 | Planchard BULB | 10 | | | | LENSANDBULB | |
| O-RING | 311–314 | Planchard O-RING | | 2.748212 cm³ | ✅ bounds | | CAPANDLENS, design table | 4-5 |
| SWITCH | 315–320 | Planchard SWITCH | | 1.754454 cm³ (after edit) | | | FLASHLIGHT | |
| LENSCAP | 323–332 | Planchard LENSCAP | 11 | | ❌ ritual pending | | CAPANDLENS, STL | 1-3 |
| HOUSING | 335–364 | HOUSING | 4 (of ~25), step 310 reached | Base Extrude 320.2510 cm³ | Base Extrude ✅ | | FLASHLIGHT, STL | 2A-7; G10 Description ✅ (parts/assemblies) |
| LENSANDBULB | 379–434 | – | | | | | CAPANDLENS | 2B-4 |
| BATTERYANDPLATE | 379–434 | – | | | | | FLASHLIGHT | 2B-4 |
| CAPANDLENS | 379–434 | – | | | | | FLASHLIGHT | 2B-5 |
| FLASHLIGHT | 379–434 | – | | | | | Drawing, eDrawings | Phase 3 |
| BATTERY drawing | 435–480 | – | | | | | | 4-3 |
| FLASHLIGHT drawing | 435–480 | – | | | | | | 4-4 |
| O-RING design table drawing | 435–480 | – | | | | | | 4-5 |
| Homework (per exercise rows) | | | | | | | | 5-1 |
| CSWA examples (per question rows) | 481–520 | | | | | | | 6-1 |

---

## 7. Remaining HOUSING steps — extracted parameters

Working spec for task 2A-7, pulled from the book on 2026-09-20 so the UI session
is spent clicking rather than hunting. Values are the book's inch figure with the
bracketed metric beside it; the app works in cm.

**Order note.** In the book SwitchHole follows Thread. Thread is still blocked on
G18 (LENSCAP is not in this profile), and SwitchHole has no geometric dependency
on it — it is sketched on the Handle and terminates on Shell1. Building it first
is a deliberate deviation; Thread must still be inserted ahead of it in the tree
before HOUSING can be called ritual-Done.

### SwitchHole (steps 546–568, p.355–356)
| Item | Value |
|---|---|
| Sketch plane | top face of Handle |
| View | Top |
| Profile | one circle, near the front of the Handle |
| Relation | Vertical, Origin to circle centre |
| Diameter | .510 in [12.95 mm] = 1.295 cm |
| Distance from Origin | .450 in [11.43 mm] = 1.143 cm |
| Feature | Extruded Cut, **Up To Surface** (G1) |
| End face | top inside face of Shell1 |
| Rename | SwitchHole |

### Rib1 + LPattern1 (steps 569–605, p.357–359)
| Item | Value |
|---|---|
| Sketch plane | Top Plane; Top view; Hidden Lines Visible |
| Profile | one horizontal line, endpoints either side of the Handle |
| Dimension | inner back edge → line, .175 in [4.45 mm] |
| Rib | Both Sides; thickness .100 in [2.54 mm]; **Parallel to Sketch**; material points to the back (flip if not) |
| Draft | on, 1° |
| LPattern1 D1 | hidden **upper** back vertical edge of Shell1; .500 in [12.7 mm]; 3 instances |
| LPattern1 D2 | hidden **lower** back vertical edge of Shell1; .500 in [12.7 mm]; 3 instances |
| Options | **Pattern seed only**; book also checks Geometry pattern — that checkbox was removed from the app in 2A-6, so record it as a deviation |

### LongRibPlane + Rib2 (steps 606–631+, p.360–362)
| Item | Value |
|---|---|
| Plane | parallel to Right Plane, through the vertex at the back right of the Handle |
| Rename | LongRibPlane |
| Sketch plane | LongRibPlane; Right view |
| Profile | horizontal line (must not snap to Shell1 edges), plus an arc |
| Relation | Coincident, line's left end point → BatteryLoftPlane (G19-class) |
| Dimension | line → Origin, 1.300 in [33.02 mm] |

Then Mirror, and the Rib2 33.02 → 34.29 mm interference edit in Phase 3 (3-2).

### Open question before authoring

**Answered 2026-09-23: the saved record rebuilds.** HOUSING rev 24 (restored
from the disk mirror) regenerates with no errors under the current kernel —
all eight features including Handle — in 11 min in Node and 5.7 min in the
page. HOUSING continues from rev 24; HOUSING_v2 (lost in a wipe before the
disk mirror existed) is not needed. The original note is kept below.
`regenerateFeatures()` on `scratch/planchard/HOUSING-checkpoint.json` fails in a
bare Node harness (2026-09-20), even through `ensureParametricDocument`: sketches
`sk_1lw92` and `sk_1yps9` (HandleProfile) report
`missing-sketch-support-feature` against `<featureId>:tool:face:generated:plane:1`,
and Boss-Battery and Handle report `missing-feature-reference` against
`<featureId>:tool`. Only Base Extrude survives, in 4.8s against the ~3 minutes the
app takes. Either the harness skips a step the editor does on open, or the saved
record does not carry the `:tool` outputs its face-sketches bind to — which would
be a ritual step 4 failure (save, reload, reopen, rebuild still succeeds).
**Resolve this in the UI before building SwitchHole**; do not assume either way.

### HOUSING_v2 — rebuild from step 265 (started 2026-09-20)

The saved `HOUSING` record would not reopen (see the open question above), so the
part is being rebuilt from the book's first step under the name **HOUSING_v2**.
Authored through the real UI on a 375x812 phone viewport, dark theme.

| Step | Book | Result |
|---|---|---|
| 265–270 | New part, name, description | `HOUSING_v2`, description `HOUSING FOR 6VOLT FLASHLIGHT` |
| 271–274 | Circle on the Front Plane, centred on the Origin | Sketch **fully defined**, profile closed |
| 275–276 | Ø4.375in [111.13] | Typed as the inch literal `4.375in` → Ø 11.1125 cm. G24 (unit suffixes) confirmed working in the Smart dimension field |
| 277–278 | Extruded Boss/Base, depth 1.300in [33.02] | Typed `1.300in` → stored 3.302 cm. G24 confirmed in a feature field too |
| 280 | Rename to `Base Extrude` | Renamed; tree reads `Base Extrude / Extrude / Boss` |

**Accepted.** Exact solid geometry, before save and again after a full browser
reload and reopen from the library, both reading:
`X 111.125 · Y 111.125 · Z 33.02 mm`, volume `320.2510 cm³`.
That is the analytic value (π·5.55625²·3.302 = 320.251) and matches the figure
the previous HOUSING recorded for the same feature.

**Ritual step 4 passes for HOUSING_v2**: saved, browser reloaded, reopened from
the library — `fully parametric`, `Rebuild succeeded`, 1 part, no unsaved
changes, 2 editable steps. So the reopen failure is specific to the old HOUSING
record and is **not** a systemic fault in the save path. The old record is kept
in the library (`cm_mu0uonq1`) for diagnosis; do not delete it.

Next: steps 281+ (Sketch-Circle on the back face via Convert Entities, then
BatteryLoftPlane and Sketch-Square for Boss-Loft1).

#### HOUSING_v2 — extracted parameters for the lofted boss (steps 281–348)

| Step | Feature | Parameters |
|---|---|---|
| 281–285 | `Sketchcircle` | Sketch on the **back face** of Base Extrude; Convert Entities to extract the face; exit; rename |
| 286–293 | `BatteryLoftPlane` | Offset plane from that back face, distance **1.300in [33.02]** = 3.302 cm; rename; rebuild; save |
| 294–298 | `Sketchsquare` begins | Sketch on BatteryLoftPlane, Back view; Convert Entities on the circle's circumference |
| 299–303 | | Vertical **centerline** coincident to the Origin and the circle's top edge; a horizontal line right of it; a vertical line down to the circumference |
| 304–310 | | Sketch Fillet between the horizontal and vertical lines, R **.100in** initially |
| 311–315 | | Mirror the horizontal line + fillet + vertical line about the centerline |
| 316–321 | | PowerTrim the circle away on both sides |
| 322–326 | | Horizontal dimension, left vertical line → right vertical line: **3.100in [78.74]** |
| 327–330 | | Vertical dimension, Origin → top horizontal line: **1.600in [40.64]** |
| 331–332 | | Change the fillet dimension .100 → **.500in [12.7]** |
| 333–338 | | Sketch Fillet R **.500in [12.7]** on the lower-left and lower-right corner points |
| 339–341 | | Exit, rename `Sketchsquare`, save |
| 342–348 | `Boss-Loft1` | Lofted Boss/Base over Sketchcircle + Sketchsquare; rename; save |

Target from the previous attempt (same feature, for cross-check): Boss-Loft1 exact
bounds 111.125 x 111.125 x 66.04 mm, 596.3463 cm3.

Next after that: Boss-Battery (349+), Convert Entities on the loft's back face,
depth **4.400in [111.76]**, 1 deg draft — previously accepted at
111.125 x 111.125 x 177.8 mm, 1355.676 cm3.

**Mobile gap found 2026-09-20 (HOUSING_v2, step 285):** a sketch cannot be
renamed from the phone shell. Double-clicking a sketch row in the tree re-enters
sketch edit (a feature row opens its editor with a "Feature name" field, so
features rename fine); right-click falls through to the canvas and selects a
face instead of opening a tree context menu; and the Properties ▸ Sketch panel
shows plane, support face and constraint counts but carries no name field.
Book steps that rename a sketch (285 `Sketchcircle`, 340 `Sketchsquare`, and the
same pattern for ThreadPath/HandleProfile) therefore cannot be completed on a
phone. Not blocking geometry — the loft references the sketch by id — so
HOUSING_v2 carries the default names until this is built or the rename is done
on a desktop viewport.

### Storage warning (2026-09-20) — the browser library is not durable

**Resolved by the disk mirror (2026-09-23, `6e5d290` + `829f3b0`).** Every
library save is now mirrored through the relay to `.model-backups/` (20
versions per model, atomic writes), and the Library pane offers "Restore from
disk backup" for anything the browser lost. It has already paid off twice: on
2026-09-23 the pane came back with an empty library again, and all 24
models (LENSCAP at the post-fix rev 13, HOUSING rev 24) came back through that
button. Manual exports are no longer the only safety net. The history below is
kept for context.

`HOUSING_v2` was lost once mid-session. The Browser pane closed and reopened,
and every IndexedDB store came back empty (`models: []`, `drafts: []`,
`snapshots: []`) while `localStorage` survived and the origin was unchanged.
Nothing deleted the records; the pane was recreated with fresh IndexedDB. The
library moved to IndexedDB in task 1-8, so that is where all model work lives.

Consequences for this plan:
- Treat the in-browser library as scratch space, not as the record. Anything
  worth keeping must leave the browser.
- **Export after every accepted feature** (Library pane ▸ Export library) and
  keep the JSON beside `HOUSING-checkpoint.json` in `scratch/planchard/`. That
  export/import path exists precisely for this and is the only thing that made
  the older HOUSING survivable.
- The acceptance ritual's step 4 (save, reload, reopen) checks that a record
  *rebuilds*; it does not check that the record still exists after the host
  restarts. Those are different risks and only the export covers the second.

Re-authoring cost, measured: Base Extrude took about twelve UI operations at a
desktop viewport, so a loss is recoverable but not free. The per-step parameters
in this section are what made the rebuild quick — keep them current.



