# CAD review: findings 76–100

Verified against the implementation, with native-kernel and regression tests. Nineteen findings led to fixes or explicit safety guards. Six proposed fixes were rejected or were not established defects. This does not certify every generated part for manufacture.

| Finding | Decision and resulting behavior |
| --- | --- |
| 76 — sheet-metal relief | Keep explicit relief selection. The existing UI catches the refusal and exposes relief controls. Regression verifies that refused adjacent flanges leave the sheet unchanged and valid relief permits them. |
| 77 — empty recipe topology | No speculative topology added. Exact topology is extracted after kernel operations; a native revolve test verifies faces, edges, and repeatable identifiers. This test does not prove arbitrary topological edits preserve references. |
| 78 — countersunk length | Socket, machine, and wood countersunk screws now include the head in overall nominal length; shortened shanks and seat placement agree. |
| 79 — BOM quantity | Sheet tables accept the BOM producer's `quantity`, while preserving support for `qty`. |
| 80 — draft sign | Negative draft is classified as an undercut for the selected pull direction, not sufficient positive draft. |
| 81 — hole count | Callouts count selected sketch circles; construction circles are excluded from both cutters and callouts. Missing explicitly referenced placement sketches do not produce a fabricated count. |
| 82 — spline sweep | No valid sketch spline primitive exists in the current authoring/solver schema. An arbitrary `type: spline` record cannot safely define a curve. Unsupported records remain refused. |
| 83 — round trim/extend | Added circle and arc trimming, arc extension to boundaries, and finite-arc intersection filtering. Closed circles have no endpoints to extend. |
| 84 — offset drift | Signed line/circle offset distances are persistent solver constraints, visible and selectable as dimensions. Invalid circle radii are refused. |
| 85 — pattern dimensions | One editable translation-distance constraint per copy carries its point pairs. The report's claim of inevitable overconstraint was not established; repeated dimension clutter was real. |
| 86 — inertia origin | Preserve centroidal kernel inertia. A translated-box native test pins the result. Removing the existing parallel-axis handling on the report's assumption would be incorrect. |
| 87 — short rib corners | Reject excessive mitres, corners that consume adjacent segments, and invalid offset boundaries. No silent web-thickness change. |
| 88/89 — mirrored cylinders | Reflect both the base origin and directed axis, preserving height and the association of each frustum radius with its endpoint. |
| 90 — exploded configuration | Applying a collapsed configuration clears the active exploded view. |
| 91 — insert orientation | Preview and native annular solids use the requested axis, including oblique axes. |
| 92 — hole leader view | Choose an available face-on view and project the hole entry point into its basis. Interactive sheets retain topology-bound anchors; exported notes no longer assume front-view coordinates. |
| 93 — section tags | Existing labels are outside the body beside arrow tails. The suggested positional reversal is unsupported. Regression covers horizontal and vertical sections. |
| 94 — side-plane coordinates | Preserve the established `(u,v,w) -> (w,v,u)` sketch/extrusion convention. Flipping one coordinate only in the sampler would break agreement with existing geometry. |
| 95 — helix pitch | Derive missing pitch from height and turns. Length uses the actual axial travel and includes taper. |
| 96 — helix apex frame | Construct a finite radial direction from the angular basis even at zero radius. |
| 97 — coarse threads | Add M3.5 × 0.6 and M7 × 1 to the pitch validation table. This does not invent missing head or hole manufacturing tables. |
| 98 — gear root | The reference outline's radial root transition is not a validated cutter-generated root. Geometry audits now report `unverified-gear-root` instead of manufacturing compliance. Reference modeling remains available. |
| 99 — bearing seat | Head-seat mate normal points toward the screw tip. |
| 100 — cylinder cut scope | Project circular end caps in the cut frame rather than rotating a world bounding box. The circumscribed 96-sided approximation remains conservative, with about 0.054% radial excess. |

## Verification

- Dedicated regression coverage includes actual OpenCascade regeneration, centroidal mass properties, mirrored endpoints, constraints after solver perturbation, drawing quantities, and refusal without mutation.
- Browser coverage exercises exported hole notes and the existing interactive drawing workflows.
- Module identifier, import-link, and source assertion gates are run alongside the complete unit/integration suite. Final counts are reported in the task response.

## Sources used to check engineering assumptions

- [OpenCascade GProp_GProps](https://dev.opencascade.org/doc/occt-7.8.0/refman/html/classGProp__GProps.html): `MatrixOfInertia` uses central coordinates, with axes parallel to global axes. Absolute coordinates for the reported center do not change that tensor origin.
- [Accu countersunk screw dimensions](https://www.accu.co.uk/countersunk-socket-head-screws/153500-SSK-M8-100-A4-BL): overall length is specified as L.
- [Bossard metric ISO thread tables](https://www.bossard.com/-/media/bossard-group/website/documents/technical-resources/en/f-079-en.pdf): second-choice coarse sizes include M3.5 × 0.6 and M7 × 1.
- [FVA cylindrical gear geometry](https://doc.fva-service.de/60/en/root-cylindrical-gear-geometry.html): root geometry depends on the generating tool. A universal guessed root radius is not a replacement for a validated generating model.

## Follow-up implementation

The following four items are implemented within the supported geometry families described in [CAD completion](cad-completion.md). That document records the editing workflows, tests, and manufacturing limits.

### Original follow-up scope

1. Implement a cutter-generated gear root with tool parameters, undercut detection, and meshing/interference validation before allowing manufacturing compliance.
2. Add a real sketch spline primitive across authoring, persistence, constraints, trimming, and exact kernel conversion before advertising spline sweeps.
3. Make trim/extend dependency changes explicit in the UI, including dimensions and references that must be reattached after an endpoint is replaced.
4. Add an exact intersection stage after conservative cut-scope filtering where false positive overlap matters for manufacturing decisions.
