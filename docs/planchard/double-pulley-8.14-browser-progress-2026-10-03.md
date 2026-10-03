# Exercise 8.14 Double Pulley — browser progress — 2026-10-03

Book reference: printed 8-49 / PDF 427. The page supplies a parts list and assembly/drawing brief but no component dimensions or companion AVI in this workspace. All dimensions in `double-pulley-8.14-design.md` are declared original designer choices. The user's fresh-from-zero requirement applies to every part. **This exercise is in progress: DP01–DP07 are accepted, seven of eleven printed part roles; no complete assembly, motion or drawing is claimed.**

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

After that geometry acceptance, root corrected the source `BookPartNumber` from 8 to the book's brace number **2** through Chrome and replaced the protected bundle with the actual browser export. The saved key, one fully defined sketch, two history entries, material and geometry remain the same; the protected STEP is the unchanged accepted geometry.

## DP04 support accepted

Fresh Chrome-authored support block 36 × 32 × 18 mm spans X−18..18/Y−16..16/Z−30..−12. A merged Ø12 shaft continues along Z to +28 mm, with a Ø6.6 axial through-bore. A Ø6.45 transverse Right-plane bore starts at X18, Z−26/Y0 and cuts 22 mm in the reverse X direction. Four sketches are fully defined; the named part key `cm_mus86o7o` has four authored features and eight history entries. Its `BookPartNumber` is **4**, matching the printed support role, with Alloy Steel (SOLIDWORKS reference) density 7.70 g/cm³.

Protected outputs are `artifacts/planchard/DP04-support-browser-2026-10-03.mforge` (327610 bytes), `DP04-support-browser-2026-10-03.step` (96205 bytes), `DP04-support-mass-browser-2026-10-03.jpg`, and cold-reopen proof `DP04-support-cold-reopen-browser-2026-10-03.jpg`. Native replay yields one connected export-valid solid with no issues; bounds X−18..18/Y−16..16/Z−30..28 mm, exact volume **22.741725683 cm³**, COM (−0.2212572, approximately 0, −16.858886) mm and mass **175.1112878 g**. Chrome displays 22741.73 mm³ and 175.1113 g. Its STEP has one manifold BREP, one closed shell and four cylindrical surfaces. Root cold-reopened the named library item in real Chrome: eight entries, four fully defined sketches, one native body and successful BREP regeneration.

## Book part-number metadata in the assembly BOM

The fresh browser exports use human-authored property labels: DP01 `Part number=6`, DP02 `BookPartNumber=5`, corrected DP03 `BookPartNumber=2`, and DP04 `BookPartNumber=4`. The BOM and component inspector now recognize both labels as fallbacks after their existing canonical `PartNo`, `PartNumber` and `Number` fields. Focused regression runs against the actual exported DP01–DP03 bundles and checks canonical override priority; 16 focused drawing/BOM tests and module/link/source gates passed (629 modules, 1490 assertions). This source change does not rewrite the user-authored properties.

## DP05 bushing accepted

The root authored a fresh, fully defined Front annulus with a shared fixed center, OD16/ID12.2 mm and sketch offset Z12 mm. Its 15.8 mm +Z extrusion spans Z12..27.8 mm. Protected outputs are `artifacts/planchard/DP05-bushing-browser-2026-10-03.mforge` (138723 bytes), `DP05-bushing-browser-2026-10-03.step` (9462 bytes), `DP05-bushing-mass-browser-2026-10-03.jpg` and `DP05-bushing-cold-reopen-browser-2026-10-03.jpg`. The named part key `cm_mus8kakg` has `PartNo=3`, matching the book's bushing role, and Alloy Steel (SOLIDWORKS reference) density 7.70 g/cm³.

Independent exact native replay returns one connected export-valid body with no issues, two history entries and bounds X/Y±8, Z12..27.8 mm. Volume is **1.329779622 cm³**, COM (0,0,19.9) mm and mass **10.2393031 g**, matching Chrome's 1.329780 cm³ and 10.23930 g. The analytic annular volume π(8²−6.1²)·15.8 mm³ agrees. STEP contains one manifold solid BREP, one closed shell and two cylindrical surfaces. Root cold-reopened the named saved item in Chrome and confirmed one regenerated native body, a fully defined sketch, two steps and 16×16×15.8 mm bounds.

## DP06 pulley accepted

Root authored the wheel from blank in desktop Chrome with two fully defined Top sketches. A 360° +Z Revolve of the rectangle at radius 8.1..33 mm, Z12..28 mm makes the annular blank with Ø16.2 bore, Ø66 outer diameter and 16 mm width. A separate 360° Revolve Cut of radius 28..34 mm, Z17.8..22.2 mm forms the 4.4 mm wide groove with Ø56 root, centered Z20. Four history entries remain editable; the wheel is one connected body. Native part key `cm_mus8q8pa` has canonical `PartNo=1`, matching the printed pulley role, and Alloy Steel (SOLIDWORKS reference) density 7.70 g/cm³.

Protected exports are `artifacts/planchard/DP06-pulley-browser-2026-10-03.mforge` (228457 bytes), `DP06-pulley-browser-2026-10-03.step` (16917 bytes), `DP06-pulley-mass-browser-2026-10-03.jpg` and `DP06-pulley-cold-reopen-browser-2026-10-03.jpg`. Independent native replay returns one exact export-valid solid with no issues, bounds Ø66 ×16 mm, volume **47.225174751 cm³**, COM (0,0,20) mm and mass **363.6338456 g**, matching Chrome. Analytic annular blank volume minus the annular groove agrees. STEP contains one manifold solid BREP, one closed shell and four cylindrical surfaces. Root cold-reopened the named item in Chrome: four steps, two fully defined sketches, one regenerated native body and expected fit.

## DP07 washer accepted

Root authored a fresh, fully defined Front annulus with shared fixed center, OD22/ID6.6 mm at sketch offset Z28.2 mm. A 2 mm +Z extrusion spans Z28.2..30.2 mm. Protected outputs are `artifacts/planchard/DP07-washer-browser-2026-10-03.mforge` (139833 bytes), `DP07-washer-browser-2026-10-03.step` (9563 bytes), `DP07-washer-mass-browser-2026-10-03.jpg` and `DP07-washer-cold-reopen-browser-2026-10-03.jpg`. Part key `cm_mus8vsnp` has canonical `PartNo=7`, matching the printed washer role, and Alloy Steel (SOLIDWORKS reference) density 7.70 g/cm³.

Independent native replay produces one exact export-valid body with no issues, two history entries and bounds X/Y±11, Z28.2..30.2 mm. Volume is **0.691841534 cm³**, COM (0,0,29.2) mm and mass **5.327179813 g**, matching Chrome. STEP contains one manifold BREP, one closed shell and two cylindrical surfaces. Root cold-reopened the named item in Chrome and confirmed a fully defined sketch, two steps, one regenerated native body and 22×22×2 mm fit.

The next fresh role is DP08 screw cap. The design proposes representative M6×25 and M6×70 length configurations for the book's four screw-cap occurrences; Toolbox configuration research is pending. Four printed part roles, mating, belt motion, interference audit and ANSI A exploded drawing remain pending. Full CI is not yet green, as recorded in `STOP-HERE-2026-10-03.md`.
