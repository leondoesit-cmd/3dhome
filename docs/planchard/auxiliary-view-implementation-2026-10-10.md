# Auxiliary view — bounded genuine implementation, 2026-10-10

Source: supplied Planchard PDF 113 / printed 2-27. A primary Auxiliary projects parallel to an inclined model face, as a child of a principal view, to display true dimensions. This implements actual current native-reference-driven projection, not a renamed Front view or rotated drawing image. Actual parent Chrome acceptance is pending.

## Ordinary authoring and driving references

Drawing → **Auxiliary** → click the middle of a named straight inclined edge in an unmodified principal view → select **Native inclined planar face** and optional **Reverse sight direction** → Apply. The candidate labels include actual face-normal components to distinguish qualifying planes. Only incident native planar faces seen edge-on in that parent qualify; native endpoint geometry, current face normal and persistent IDs are required. Missing, degenerate, axis-aligned, curved, nonplanar, modified-parent or wrong-part references are rejected rather than inferred from a paper line. The face dialog is guarded against a changed model/drawing.

A real child view persists `auxiliary:{from,edgeReference:{pid},faceReference:{pid},flip}` with the original parent ID. It inherits the parent scale/configuration selection at creation and remains separately placeable. The current face normal drives the projection on each rebuild; references are not converted into a frozen 2D picture. The basis is forward=face normal (negated for reverse sight), right=parent forward, up=forward×right. Shared `viewBasis` explicitly validates arbitrary orthogonal nonzero finite inputs. Standard named bases retain their existing behavior.

All actual mesh projection/HLR and circle classification run through that basis. Topology dimensions and exact arc rendering consume the returned basis. Current native mesh topology is supplied both to interactive projection and standalone stored drawing export. The parent sight marker points toward the face, opposite forward-to-viewer. Auxiliary and downstream Detail views participate in dependent deletion. Missing source references yield an explicit diagnostic and no Front fallback. Full document saving/normalization retains the driving reference fields; creation reacquires the live drawing document after history callbacks.

## Scope and limitations

Finite first release is a primary Auxiliary from an inclined native straight edge and incident planar face in a principal unmodified view. Floating placement is supported; automatic diagonal hinge-line layout, secondary Auxiliary, arbitrary pictorial parents and Section/Break/Broken-out composition are not claimed. Projection extents use actual mesh directional bounds, with normal drawing tessellation qualifications. The reverse direction is chosen during authoring; there is no dedicated face-reference/flip edit panel yet. A Detail can derive from the genuinely projected Auxiliary. Native references must remain resolvable in the selected model/configuration; missing references are reported explicitly.

## Meaningful validation

Five focused tests passed: orthonormal/right-handed basis for all six principal parents and reversal; invalid/nonplanar/modified/wrong-part references; upstream slope changes drive the reference normal and removed references diagnose; an actual inclined-axis cylinder projects a round rim only in the matching Auxiliary basis; actual OpenCascade native wedge projection, controller edge/face authoring, stale dialog rejection, sight marker, genuine dependencies, cold JSON/SVG and a bound native 50 mm dimension.

The native numerical oracle is a supplementary 30–40–50 mm triangular wedge extruded 20 mm. Its actual inclined face has native area **1000 mm²** and projected true dimensions **20 × 50 mm**; Auxiliary's native-bound edge dimension exports **50 mm**. The source illustration does not specify these dimensions, so this is a qualified geometry/workflow witness rather than invented source-model fidelity. No user model was generated or modified by the tests.

Combined Auxiliary/Crop/Broken-out/drawing/configuration/native neighboring run: **93/93 PASS**. Final native Auxiliary + Break neighboring run: **10/10 PASS**. `npm run check` passed on the integrated implementation: no free identifiers, **668 linked modules**, **1489 source assertions**; final free-identifier/link recheck and diff check are also completed at handoff. No full-suite or Chrome acceptance is asserted.

## Parent actual browser recipe

Create the supplementary wedge through actual native sketch/Extrude in Chrome: Front triangle (0,0),(30,0),(0,40) mm; 20 mm extrusion normal to Front. Save a review copy. In Drawing, choose Auxiliary and click the inclined hypotenuse midpoint, choose its native inclined face and Apply. Verify the genuine child shows 20×50 mm true extents, source face remains edge-on in Front, the bound inclined edge dimension reads 50 mm, and sight arrows agree. Save/export/cold reopen that exact review copy; compare reference IDs/basis/geometry and SVG. Optional later normal face-supported native bore supplies a circle-versus-foreshortening witness.

Owned files: new `js/core/drawing_auxiliary.js`, `tests/drawing_auxiliary.test.mjs`; minimal integration `js/core/hidden_line.js`, `js/cad_sheet.js`, `js/cad_drawings.js`, `js/modeler_drawing.js`, `js/modeler.js`. Parent owns actual model/browser evidence, ADVANCE and commits.
