# Drawing live text and BOM repair — 2026-09-30

Caught up the other coder's protected records: 9.1, 9.2, 9.3, 9.5 and 9.6 already have fresh Chrome-authored part and drawing acceptance. LINKS 9.4 also has a fresh-derived four-component assembly and exported drawing; its configuration and drafting gaps remain documented in `artifacts/planchard/LINKS-9.4-browser-2026-09-30.md`.

## PRESSURE PLATE 9.3

The current library initially exposed only the earlier seven-step plate. The accepted five-step Hole Wizard plate was recovered by opening its exact protected `PRESSURE-PLATE-9.3-browser-2026-09-28.mforge` through Output > Open bundle > Bundle JSON. This is the part built from blank during this book run, not an old model seed. No geometry was authored through scripts.

Automatic approval review rejected restoring all twenty missing disk records, because that broad operation could introduce old models. That operation was abandoned. The narrow bundle recovery contains one accepted main model and no assemblies; it succeeded through the visible UI.

The Ø3.92 bolt-circle span previously had frozen literal text. Dimension text now supports `<>` as the live formatted measurement, while retaining existing literal overrides. Double-clicking the dimension and typing `Ø<>` in the visible dialog preserves the diameter prefix and its associative hole-centre anchors.

Real Chrome checks:

- Inches showed Ø3.92; switching the sheet to millimetres showed Ø99.57, proving that the prefix no longer freezes the number. Switched back to the book's inches.
- Save, full reload and library reopen retained the drawing and the template. The saved bundle contains `text: "Ø<>"` on the vertical span dimension.
- No upstream geometry edit was run for this repair while the root agent was working on HOUSING. Unit regression changes the anchor span from 3.92 to 4.00 inches and verifies the live text changes.
- Original protected files remain intact. New proof/export: `artifacts/planchard/PRESSURE-PLATE-live-diameter-browser-2026-09-30.{mforge,svg}`, `PRESSURE-PLATE-live-diameter-mm-browser-2026-09-30.png`, and `PRESSURE-PLATE-live-diameter-reopened-browser-2026-09-30.png`.
- Browser tab 710858358 is left on the accepted drawing.

## Assembly BOM

The general assembly drawing exporter explicitly discarded material and part numbers. BOM generation now reads instance/source PartNo, PartNumber or Number, Description, the Material custom property, and assigned stock material. Both drawing providers carry those values through to a five-column ITEM / PART NUMBER / DESCRIPTION / MATERIAL / QTY table. Existing standard-part material metadata retains precedence.

Long source descriptions now fit their cells instead of spilling across the table. The SVG retains the full text as a hover title; no source property is shortened.

Actual browser acceptance used this run's saved WEIGHT-HOOK8.1 assembly: load through its visible library label, Drawing > Drawing, open its downloaded SVG in Chrome. Both rows show assigned Plain Carbon Steel, the new PART NUMBER column, and fitted descriptions. No part numbers are invented for these source parts. Files: `artifacts/planchard/WEIGHT-HOOK-BOM-properties-browser-2026-09-30.{svg,png}`. Preview tab 710858402.

LINKS 9.4 is not in the currently exposed six-assembly library. Its protected original bundle and proofs remain intact. Re-exporting that exact assembly and filling its printed part properties through the UI remains to do. This repair does not claim the LINKS sheet or per-component configurations are complete.

The apparent export scale discrepancy is an explicitly labelled isometric scale override: the isometric view is half the general sheet scale. The current labels show both scales; no scale change was made in this repair.

## Verification

Three live-text regressions, the existing reference-dimension regression, and three BOM/property/cell-fitting regressions pass. The combined BOM/live-text/toolbox review run passed 25 tests before the added cell-fit regression; the final focused live-text/BOM run passed six tests. Final `npm run check` passes: no free identifiers, 593 linked modules, and 1,489 source assertions.

Changed files: `js/cad_sheet.js`, `js/modeler_drawing.js`, `js/cad_drawings.js`, `js/cad_interference.js`, two narrow BOM provider lines in `js/modeler.js`, and the two new focused test files.
