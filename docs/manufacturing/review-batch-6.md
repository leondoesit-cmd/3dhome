# CAD integrity review — findings 51–75

Reviewed against the implementation and executable tests, September 12, 2026. This batch implements 22 defect corrections and one behavior improvement; two proposed changes are rejected. The original report's claim that all 25 are verified defects is not supported.

| Finding | Disposition and resulting behavior |
| --- | --- |
| 51 | Fixed. Named expression dimensions enter the symbol table before their first numeric value exists. |
| 52 | Fixed. Section cuts retain chords passing through a triangle vertex and edges lying on the plane. Coplanar triangles do not expose their internal triangulation as cut lines. |
| 53 | Fixed. Open chains cannot become hatch polygons. |
| 54 | Fixed. Plane/cylinder tangent mates use contact distance and axis-in-plane equations, preserving tangential translation and the other unconstrained motions. Both reference orders are covered. |
| 55 | Fixed. Endpoint healing remaps constraint centers and pair lists before deleting merged point IDs. |
| 56 | Fixed. Suppressed components do not enter BOM counts; suppressed parts do not enter either mass evaluator. |
| 57 | Fixed. Circle tangency selects a branch before solving and retains it through iteration. Equal-radius circles cannot collapse into a concentric solution. |
| 58 | Fixed. Negative-height cylinders and frustums retain outward triangle winding on each principal axis. |
| 59 | Fixed. Insert construction releases both temporary cylinders on success and partial allocation failure. |
| 60 | Fixed. Linear and circular patterns release temporary copies when compounding fails, without disposing the seed. |
| 61 | Fixed for asymmetric chamfers. Adjacent-face lookup initializes absent topology. Equal-distance chamfers did not require this lookup. |
| 62 | Behavior improvement. Zero-degree draft returns an independently owned identity result. The previous explicit refusal was not silent geometry corruption. |
| 63 | Fixed. Detail views using `detail.from` emit the parent-view callout without requiring a duplicate `parent` field. |
| 64 | Fixed. A fit with negative minimum clearance and zero maximum clearance is classified as interference. |
| 65 | Fixed. Knurl lead uses circumference divided by the tangent of the helix angle measured from the axis. Straight grooves have zero turns. |
| 66 | Fixed. Left/right displacement follows the corresponding helix direction and integer start count. The previous straight-groove displacement branch already existed. |
| 67 | Fixed. Close/normal/loose clearance table rows agree with the cited chart, including M6 normal 6.6 mm and M10 normal 11 mm. The new M6 form default is 0.66 cm. Explicit saved custom diameters remain explicit values. |
| 68 | Proposed change rejected. A tapped entrance cone can taper to the tap-drill bore. Usable thread engagement starts where the cone reaches the major diameter; that intersection is already used. Truncating the cutter at the major diameter is not justified by the report and can introduce a ledge. Regression coverage pins the current continuous cutter and engagement start. |
| 69 | Fixed in the definition rebuild. An invalid sketch or parameter blocks its consumers, while independent bodies rebuild. Out-of-range parameters also invalidate dependent expressions. Native feature regeneration still has a separate recovery policy; this does not claim universal branch recovery. |
| 70 | Fixed. Sketch IDs are recognized as dependencies; supported sketches also order and require their owning feature. Truly missing IDs remain errors. |
| 71 | Fixed. An opening wider than its selected wall is rejected with a diagnostic instead of being positioned outside it. |
| 72 | Fixed. Native body transforms supply their actual centroid-based transform to topology descriptors in both history and legacy operation paths. Origins, directions, endpoints and bounds transform together. Before a native transform exists, unsupported complex pivots yield pending descriptors rather than stale geometry. |
| 73 | Fixed. Cone normals include the axial component and are perpendicular to surface derivatives. The actual descriptor uses `angle`, not the report's `halfAngle` field. |
| 74 | Fixed. No module-count alternative is offered when its resulting span violates the minimum or maximum. |
| 75 | Proposed orientation swap rejected. An executable test against the bundled OCCT kernel shows identical fillet contour endpoints for forward and reversed wrappers of the same edge. Raw edge orientation does not specify the fillet contour direction; swapping radii on that flag would change a valid result. The code comment now states the contour contract. |

## Evidence and scope

`tests/cad_integrity_batch6.test.mjs` exercises solver behavior, geometry, references, classification and kernel ownership, including injected allocation/compounding failures. `tests/cad_integrity_batch6.browser.mjs` checks the real hole form default and size/fit changes. Existing precision browser tests cover exact mass reporting and saving conical hole cutters through Apply.

The clearance dimensions were checked against the manufacturer's [Albany County Fasteners clearance-hole chart](https://www.albanycountyfasteners.com/media/6b/b8/g0/1764944339/clearance-hole-chart.pdf?ts=1764944339). This table correction is not a claim that the entire manufacturing catalog is standards-certified.

The fillet contract was checked against [OCCT MakeFillet documentation](https://dev.opencascade.org/doc/occt-7.6.0/refman/html/class_b_rep_fillet_a_p_i___make_fillet.html), [OCCT implementation](https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/V7_4_0/src/BRepFilletAPI/BRepFilletAPI_MakeFillet.cxx), and the native experiment using the installed kernel.

## Follow-up improvements (now implemented)

See [implementation and validation](professional-followups.md). The original priorities were:

1. Give native regeneration the same independent-branch recovery contract as the definition rebuild, with explicit unavailable-input diagnostics and export/mass tests. Preserve failed feature history so users can repair it.
2. Make variable-fillet start/end locations visible in the viewport and persist a geometric endpoint anchor. This would define a user-facing direction independent of incidental kernel traversal.
3. Extend section boundary reconstruction to explicitly diagnose non-manifold and self-intersecting cut graphs. Never silently hatch ambiguous boundaries.
4. Attach source, edition and supported ranges to every manufacturing table. Validate full table packs and mark unsupported standards combinations explicitly.

## Validation results

- Full Node suite: 2,405 passed, no failures. The final additions and touched solver, rebuild, drawing and body-operation paths were subsequently rechecked in focused suites (146, 71 and 44 passing tests; these overlap and must not be added together).
- New batch regression file: 28 tests, all passing in the final body-operation run.
- Browser: corrected clearance form, exact mass/engagement panel, and countersink Apply/save all passed. The first clearance test used a label selector instead of the input; correcting the test selector resolved that test failure.
- All repository checks passed: module identifiers, import links (454 modules), and 1,402 source assertions. Whitespace diff check passed.
