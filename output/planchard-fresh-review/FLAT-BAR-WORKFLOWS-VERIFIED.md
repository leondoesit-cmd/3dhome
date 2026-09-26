# Flat-bar workflows — 2026-09-22

Recreated exercises 5.8 and 5.9 from PDF page 260 through the actual browser UI.

Saved independent library records:
- FLAT BAR - 3 HOLE - exercise 5.8
- FLAT BAR - 9 HOLE - exercise 5.9

Both contain five editable history steps: centred slot sketch, extrusion, face-supported hole sketch, through-all cut, and linear feature pattern. Both sketches are fully defined. The nine-hole variant was created with Save copy and open, then edited through the sketch and feature controls.

| Property | Three holes | Nine holes |
| --- | --- | --- |
| End-arc centre spacing | 25.4 mm | 101.6 mm |
| Overall length | 38.1 mm | 114.3 mm |
| Width / end radius | 12.7 / 6.35 mm | 12.7 / 6.35 mm |
| Thickness | 1.524 mm | 1.524 mm |
| Bore diameter / pitch | 4.826 / 12.7 mm | 4.826 / 12.7 mm |
| Exact volume | 0.6010358 cm³ | 1.908608 cm³ |
| Material | Ferritic stainless family, grade unspecified | Aluminum 1060 |

The nine-hole saved model's browser mass report is 5.150934 g using the sourced nominal 1060 density. The three-hole geometry was verified after reload; the subsequent ferritic-family assignment was saved and displayed at 7.70 g/cm³. The analytical mass using that family density is approximately 4.627976 g; this is not a certified grade-specific mass.

Book inch values control where rounded bracketed metric values disagree (0.060 inch is 1.524 mm; 0.19 inch is 4.826 mm).

Gaps fixed during this workflow:
- Added Centerpoint straight slot: exact unit-aware centre spacing/width, fixed midpoint, driving dimensions, tangent arcs and editable construction centreline. Solver regression verifies changes preserve the centre and full constraint status.
- Copy migration inferred a 1 cm minimum depth and rejected a 1.524 mm sheet. Inferred extent limits now support small CAD parts while explicit authored limits remain unchanged. The failed saved copy reopened successfully with the fix.
- Model size readout no longer rounds small thicknesses to zero.
- Authoring status is derived from the live model rather than a stale empty-document classification.
- Added ferritic-family material without inventing a grade. Typical density source: ISSF, The Ferritic Solution, p. 28, https://www.worldstainless.org/Files/issf/non-image-files/PDF/ISSF_The_Ferritic_Solution_English.pdf . No strength qualification was inferred.
- Material action labels now wrap in narrow inspector columns.

Remaining scope: flat-bar drawings/annotations and subsequent ebook exercises. These saved models are not claimed to be fully toleranced manufacturing drawings. The drafting presets are not a full ANSI/ISO conformance claim.
# Final verification note

The combined focused run passed 96 tests. A further 12 workflow tests passed after correcting saved-document startup focus. Module and link checks passed (506 modules), as did the source assertions and whitespace check. The material catalog wrapping was visually verified in the real browser.

Saved-document startup now lets existing history determine the workflow stage instead of forcing the blank-part context. Its final browser retest remains pending: the browser control connection began timing out on clicks while screenshots and accessibility reads continued to work. The flat-bar drawing work remains outstanding.
