# Planchard book completion plan

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
| LENSCAP | 323–332 | Book's last step (262, rename `Thread`) reached, 11 steps | Dimensional and mass acceptance not done |
| HOUSING | 335–364 | **In progress (UI), restarted 2026-09-14 in the Browser-pane profile** | Saved: Base Extrude (accepted: 111.125 × 33.02 mm, 320.2510 cm³ = analytic), Sketchcircle, Description property, BatteryLoftPlane (1.300 in), Sketchsquare through step 310 (converted circle, centerline, top and side lines, R .1 in fillet; DOF 1). Next: steps 311–330 (mirror, trim, dimensions), then Boss-Loft1. Not ritual-Done. |
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
| G2 | Sketch Fillet | HOUSING HandlePath, steps 459–462 (p.350) | **Done (2A-3).** Trims two lines that share a vertex, inserts a tangent arc, keeps H/V, driving radius |
| G3 | Intersection relation (point at the intersection of two edges) | HandlePath, step 475 (p.351) | **Done (2A-4).** Point + two sketch lines or two model edges; rebuild rebinds projected corners |
| G4 | Tangent Arc sketch tool | LongRib sketch, step 633 (p.362) | **Done (2A-5).** Two clicks: existing line/arc endpoint, then the other end; adds a tangent relation |
| G5 | Nested assemblies (assembly as a component) | CAPANDLENS contains LENSANDBULB; FLASHLIGHT (p.379–434) | `insertAssemblyComponent` (`js/modeler.js:13892`) inserts library parts only |
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
| 2A-7 | **Build HOUSING end to end from the book**: Base Extrude, BatteryLoftPlane, loft with guide curves, Boss-Stop, Shell, ThreadPlane/ThreadPath/ThreadSection/Thread, HandlePath/HandleProfile/Handle sweep, SwitchHole (Up To Surface), Rib1 plus linear pattern, LongRibPlane, Rib2, Mirror | **In progress.** Base Extrude + Convert End sketch + BatteryLoftPlane (end face, 3.302 cm) + Sketchsquare convert of Ø111.13 mm. Remaining: Sketchsquare profile, Boss-Loft1, Boss-Battery, Shell, Boss-Stop, Draft, Thread, Handle, SwitchHole, ribs, Mirror. Ritual not started. |

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
