# Batch 8: verification and changes

The report contains confirmed defects, unsupported capabilities, and several fixes that would regress working geometry. Decisions below are based on current producers, consumers, and regression tests. Existing unrelated workspace changes are preserved.

| Finding | Decision and outcome |
| --- | --- |
| 101 — undercut pinions | Keep the refusal. The current generator supports unshifted, non-undercut rack profiles and explicitly rejects folded envelopes. Removing one throw does not implement an undercut envelope or profile shift. The editor catches the exception and reports it without adding a body. Small/shifted pinions remain a capability extension. |
| 102 — backlash | Reject the proposed sum. The rack cutter adds `backlash/4` to its half-width, so each gear's tooth thinning is `backlash/2`. Summing those actual thinnings gives the existing mean of the two input allowances. A regression verifies this directly against cutter geometry. |
| 103 — hole deviations | Corrected the special offset rule for K/M/N holes in supported grades 6–8 and P holes in grades 6–7 above 3 mm. K grades above 8 use zero upper deviation. Tests match published NSK K6/K7, M7, N7 and P7 values, including Ø20 K7 = −15/+6 µm. The ≤3 mm boundary retains the general rule. |
| 104 — fit coverage | Extended the tabulated IT5 grades and verified H/h/JS/js ranges through 500 mm, grades 5–8 above 120 mm. Other deviation series remain limited to 120 mm and explicitly refuse extrapolation. Grades 1–4 and the complete ISO class matrix are not implemented. Range metadata and its auditor distinguish the supported domains. |
| 105 — knurl form | Fixed loss of the RGV form during normalization and made RGV invert the diamond lattice relative to RGE. Preserved the finished outer-diameter envelope. Raised points do not inherently require adding material beyond that diameter: RGE can also be cut. The suggested unconditional radius addition would model raised groove lines instead of establishing a manufacturing allowance. |
| 106 — knurl pitch | Tooth count now uses transverse pitch derived from the normal pitch and helix angle. Straight knurls force zero helix angle. Invalid helix/pitch combinations are refused. Integer tooth count means realized pitch is necessarily quantized to the circumference. |
| 107 — internal thread cutter | Added the complementary cutter: wide at the minor-diameter entry, narrow at the major-diameter root, half a pitch from the metal crest, with overlap into the bore. Verified profile complement and a valid native lofted cutter. |
| 108 — motion mates | Each motion evaluation now solves mates on a trial assembly with motor components prescribed. Both numerical iterations and initial pose seeding respect those fixed poses. Failed/unsupported motion returns diagnostics and leaves the original components untouched. Gear-ratio, belt and arbitrary linkage-specific mate types are not added by this change. |
| 109 — collapse | Null view selection clears all exploded offsets. An unknown non-null ID preserves the existing state. |
| 110 — linked dimensions | Traverses all equal links, including branches and transitive chains, with cycle protection. Checks every target's allowed size before returning an atomic change/proposal. |
| 111 — framed cylinders | Not confirmed for an authored part. Face-supported bosses use framed extrusions; primitive cylinders use a world base and axis. The reproduction invents a cylinder frame without its basis, which other cylinder consumers do not support either. Changing only bounds would make picking disagree with rendered/exact geometry. General framed-cylinder support remains a separate extension. |
| 112 — singular solve | Replaced diagonal-index pivoting with independent row/column pivot tracking. Free variables receive zero; useful equations in rows preceding a skipped column survive. The suggested row deletion would lose those equations. |
| 113 — revolve handedness | Preserve the documented legacy lathe convention. X/Z radial placement and exact-kernel axis sign deliberately agree. Changing only the coordinate helper would reverse saved partial revolves and break preview/export agreement. A new convention would require versioned authoring and migration. |
| 114 — linear spacing | Explicit free direction vectors are normalized; spacing no longer depends on direction magnitude. Axis-grid semantics remain unchanged. |
| 115 — custom pattern center | Explicit pivot/origin coordinates now propagate through placement transforms, preview copies, feature lowering and native circular patterns. Legacy radial-distance centers remain supported. |
| 116 — spline trim handles | The actual editor command already prunes unused handles and archives their removed constraints in sketch repair records. The report called the lower-level geometry helper directly and supplied a nonstandard constraint field. Regression uses the real command and a supported point constraint. Automatically rebinding handles is unsafe because subdivision changes handle positions and lengths. |
| 117 — circle radius | Reject pruning/conversion. The solver's shared circle/arc reader calculates arc radius from center/endpoints; it does not require `r` on arcs. Radius constraints remain valid after trimming and are tested. `sketch.dimensions` is not the driving constraint store used by this editor. |
| 118 — signed angles | Reject absolute value. The measurement and solver both use directed signed angles. Solving a measured −45° leaves the sketch unchanged; changing it to +45° would cause the rotation the report claims to avoid. |
| 119 — spline regions | Cubic splines are sampled into the planar arrangement, enabling closed spline/line regions and retaining source entity IDs. |
| 120 — hatch vertices | Half-open edge crossings fix even/odd parity at shared vertices and retain holes. |
| 121 — drawing precision | Added decimal-place and trailing-zero controls, persistent document options and render-cache invalidation. Explicit precision retains zeros by default; existing drawings retain their formatting until changed. Coordinate signs survive formatting, and rounded negative zero becomes zero. Decimal count does not automatically assign a tolerance; explicit/general tolerances remain separate. |
| 122 — rollback | Missing rollback IDs produce a warning and rebuild full history rather than an empty result. The original feature list was not deleted; the missing geometry was the bug. |
| 123 — datums | Recognized built-in and registered static references are accepted without a BREP result. Unknown `plane:*` names still fail: blanket prefix filtering would conceal typos. |
| 124 — STEP auto units | Reject additional scaling. OpenCascade is configured with 10 mm per model unit when reading. Native export in millimeters and import preserves a 24 cm³ test solid. The helper applies only an override correction after that conversion. |
| 125 — extrusion interference | Fallback bounds now include extrusions, their local frames and pattern rotations, plus component rotations. Supplied bounds, including null, remain authoritative. This is an approximate bounding-box fallback, not proof of exact interference. |

## Evidence and verification

- [NSK Super Precision Bearings](https://www.nsk.com/content/dam/nsk/common/catalogs/ctrgPdf/bearings/e1254.pdf), printed pp. 282–285: shaft and housing limits, inspected as rendered tables.
- [KHK primer on backlash](https://www.khkgears.us/media/1224/a-primer-on-backlash-and-its-purpose-in-gear-designs.pdf): allocating half the required allowance to each gear.
- [Hommel + Keller cut knurling](https://www.hommel-keller.de/en/product-categories/knurling/knurling-milling/): RGE manufacturing by cutting.
- [Dorian knurling information](https://pdf.directindustry.com/pdf/dorian-tool-international/knurling-tools/7164-116699.html): normal/transverse pitch distinction.

`tests/cad_integrity_batch8.test.mjs` covers the confirmed mechanisms and pins rejected fixes against current behavior, including native solids and STEP units. The new browser test checks drawing precision persistence; the existing drawing suite checks layout, dimensions, sections and export.

## Recommended next improvements

1. Install a complete, versioned and independently checked ISO 286 deviation dataset with explicit class/grade/diameter coverage, including special diameter substeps. Avoid extending the current arrays by repeating their final values.
2. Add generated undercut/profile-shift gears with intersection-trimmed envelopes and independent tooth-thickness, contact and export tests.
3. Extend the motion solver with explicit gear-ratio/belt constraints and continuous-angle state before advertising complete transmission simulation.
4. Consolidate primitive placement and conservative bounds across rendering, exact rebuild and assembly fallback; this is the appropriate place for framed-cylinder support and versioned revolve conventions.
5. Add inspection-grade gear/knurl pitch and tolerance reporting. These geometry fixes do not provide full manufacturing certification or material-process allowances.

The full regression sweep also exposed a cabinet fit-check crash for filler/blind columns with no laid-out compartments. The door-height calculation now skips that empty compartment list; the existing 336-combination cabinet sweep passes.

Final verification: 2,536 unit/integration tests passed with zero failures; this includes 21 new Batch 8 tests. All 14 drawing browser tests passed (13 existing tests plus the new precision-control test). Identifier checks, 465-module import linking, 1,402 source assertions and whitespace checks passed.
