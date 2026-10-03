# Exercise 8.14 Double Pulley — browser progress — 2026-10-03

Book reference: printed 8-49 / PDF 427. The page supplies a parts list and assembly/drawing brief but no component dimensions or companion AVI in this workspace. All dimensions in `double-pulley-8.14-design.md` are declared original designer choices. The user's fresh-from-zero requirement applies to every part. **This exercise is in progress: DP01–DP03 are accepted, three of eleven printed part roles; no complete assembly, motion or drawing is claimed.**

## DP01 pulley base accepted

The root session authored a fresh part in desktop Chrome from a blank model. The Top center rectangle is 220 × 120 mm and extrudes 12 mm along +Y. Two Ø6.6 mm through bores are on its top face at X−50 and +50 mm, Z0. The rectangle sketch and bore sketch are fully defined; the saved document has two sketches, two authored features and four history entries. Its native part key is `cm_mus6pgoo`, titled `Planchard 8.14 - Double pulley base - fresh designer example 2026-10-03`.

The chosen custom material is **Balsa — Balsaflex 150 density example**, density 0.155 g/cm³. The saved source text cites Gurit Balsaflex 150 nominal 155 kg/m³; this is a designer-selected density example, not a strength or grade certification.

Protected Chrome exports are `artifacts/planchard/DP01-base-browser-2026-10-03.mforge` (169258 bytes) and `artifacts/planchard/DP01-base-browser-2026-10-03.step` (24927 bytes). The Mass Properties browser proof is `artifacts/planchard/DP01-base-mass-browser-2026-10-03.jpg`. The root then cold-reopened the saved library part in Chrome; `artifacts/planchard/DP01-base-cold-reopen-browser-2026-10-03.jpg` shows one native solid body, four history steps, both fully defined sketches and the expected 220 × 12 × 120 mm summary.

Independent read-only native reconstruction from the protected browser bundle returns an exact, export-valid single solid with no issues. Bounds are X−110..110, Y0..12, Z−60..60 mm. Volume is 315.978913344 cm³; center of mass is (0,6,0) mm; 0.155 g/cm³ gives 48.9767316 g. These agree with Chrome's 315978.9 mm³ and 48.97673 g. The protected STEP contains one manifold solid BREP, one closed shell and two cylindrical surfaces for the bores. Analytic volume for the selected dimensions is 220·120·12 − 2π·3.3²·12 = 315978.9133 mm³.

The base is a light demonstrator for the assembly; no structural load claim is made.

## DP02 bracket accepted

The root authored a fresh bracket in Chrome and protected the named bundle `artifacts/planchard/DP02-bracket-browser-2026-10-03.mforge` (363538 bytes), native STEP `DP02-bracket-browser-2026-10-03.step` (52257 bytes), and Mass Properties browser proof `DP02-bracket-mass-browser-2026-10-03.jpg`. Saved part key `cm_mus74smk` is titled `Planchard 8.14 - Double pulley bracket - fresh designer example 2026-10-03` and uses Alloy Steel (SOLIDWORKS reference), 7.70 g/cm³.

Its fully defined sketches describe a 44 × 56 × 6 mm foot, 44 × 88 × 8 mm upright, 36.4 × 32.4 mm through guide opening, Ø6.6 mm foot fixing bore and Ø6.45 mm lateral blind bore centred at Y53/Z−26 mm with 3.8 mm depth. All five sketches are fully defined; the saved history has five authored features and ten entries. Independent native replay reconstructs one connected export-valid solid with no issues, bounds X−22..22/Y0..94/Z−30..26 mm, volume **35.995685133 cm³**, COM (−0.069332765,30.167696,−16.291088) mm and mass **277.1667755 g** at 7.70 g/cm³. Chrome displays 35995.69 mm³ and 277.1668 g. The STEP has one manifold solid BREP, one closed shell and two cylindrical surfaces. Root cold-reopened the named library item in real Chrome: ten history steps, one native body, five fully defined sketches and successful BREP regeneration; proof is `artifacts/planchard/DP02-bracket-cold-reopen-browser-2026-10-03.jpg`.

## DP03 brace accepted

The root authored a fresh Right-plane triangular sketch with vertices (Z,Y) = (0,0), (36,0) and (0,48) mm, fully defined by an origin point, a 36 mm horizontal base and a 48 mm vertical leg. A 4 mm +X extrusion makes one triangular gusset. The named saved part key is `cm_mus7vpir`; protected Chrome outputs are `artifacts/planchard/DP03-brace-browser-2026-10-03.mforge` (28246 bytes), `DP03-brace-browser-2026-10-03.step` (12713 bytes) and `DP03-brace-mass-browser-2026-10-03.jpg`. Alloy Steel (SOLIDWORKS reference) density is 7.70 g/cm³.

Independent native replay of the protected bundle produces one valid connected solid with no issues and bounds X0..4/Y0..48/Z0..36 mm. The exact volume is **3.456 cm³**, center of mass (2,16,12) mm and mass **26.6112 g**, matching Chrome. The STEP contains one manifold BREP, one closed shell and five advanced faces. Root cold-reopened the named saved item in Chrome: the Right sketch remained fully defined, both history entries were present, and the single native BREP regenerated; proof is `artifacts/planchard/DP03-brace-cold-reopen-browser-2026-10-03.jpg`.

The next fresh role is DP04 support. Eight printed part roles, mating, belt motion, interference audit and ANSI A exploded drawing remain pending. Root's latest 27 focused tests and `npm run check` passed (629 modules, 1490 source assertions); full CI is not yet green, as recorded in `STOP-HERE-2026-10-03.md`.
