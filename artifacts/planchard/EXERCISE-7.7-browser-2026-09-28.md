# Exercise 7.7 — fresh browser designer example

Reference: PDF page 373, printed 7-65. The exercise is undimensioned. The visible tree supports Revolved Base, a nominal 3/8 inch Hole Wizard hole, Circular Pattern and PBT General Purpose material. The aperture count and shape are ambiguous in the illustration; this is a documented designer example, not a claim of exact dimensional transcription.

## Chosen dimensions and actual authoring

Authored from blank in desktop Chrome 2, tab `710849228`, dark application theme. No earlier model or geometry was used. Library name: **Planchard Exercise 7.7 - designer example - fresh 2026-09-28**.

- Disk head Ø1.50 × .25 inches; stem Ø.50 × 2.00 inches beyond the disk, overall 2.25 inches.
- Four axial Ø.375 inch Through All holes, equally spaced on an assumed Ø.875 inch bolt circle. Hole count and bolt circle are designer choices.
- Front revolve profile: six line entities, eleven constraints, five driving dimensions, fully defined with zero DOF. Revolved 360° about Y.
- Top seed sketch: one point fixed at (.4375, 0) inches, fully defined with zero DOF. Hole Wizard Simple/Custom/.375/Through All, along normal.
- Circular feature pattern: four instances, 360°, Y axis, equal spacing, merged into one body.
- Five editable history steps, two fully defined sketches, three features, one solid. Hole tree name explicitly shows `3/8 (0.375 in) Diameter Hole`.

## Material and acceptance

Added a reusable **PBT General Purpose (unfilled reference)** stock entry. Density 1.31 g/cm³ is the representative Celanese Celanex 2002 unfilled grade value in its [Short-Term Properties Guide](https://www.celanese.com/-/media/Engineered-Materials/Files/Product-Technical-Guides/POM-031R1_HostaformPOM-PTXfuelPPT_AM_0314.pdf), not an assertion about the SOLIDWORKS library's exact grade.

- Exact mass card after clean Saved models reopen: volume **11.86487 cm³**, mass **15.54298 g**, density **1.31 g/cm³**, center of mass (0, 1.867331, 0) cm.
- Changed actual stem-length driving dimension from 2.00 to 2.25 inches; exact volume became **12.66927 cm³**, mass **16.59674 g**. Undo restored 2.00; Redo restored 2.25; final Undo restored original dimensions. Mass card closed on Undo, preventing stale results.
- Saved final part, reloaded and opened its actual named library record. Five-step history, both fully defined sketches, original bounds and exact PBT mass persisted with clean Save state.
- Actual UI STEP export **32,582 bytes**, project bundle **79,761,776 bytes**. Independent read-only replay of that exported bundle produced **11.86487231524235 cm³**, no issues, and passed BREP export validation.
- Focused material tests: **12/12 passing**; `npm run check` green. Whole-book completion and full CI are not claimed.

## Protected artifacts

- `EXERCISE-7.7-browser-2026-09-28.mforge` — actual final browser bundle.
- `EXERCISE-7.7-browser-2026-09-28.step` — actual exact browser STEP export.
- `EXERCISE-7.7-browser-2026-09-28.png` — clean library reopen and exact mass proof.
- `EXERCISE-7.7-driving-edit-browser-2026-09-28.png` — upstream edit proof.
- `EXERCISE-7.7-five-step-browser-checkpoint-2026-09-28.mforge` — earlier geometry checkpoint before PBT assignment.
