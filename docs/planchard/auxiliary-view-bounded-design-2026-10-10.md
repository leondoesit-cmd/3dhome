# Auxiliary view — source and bounded implementation design

Design only, 2026-10-10. No implementation, CAD creation or browser authoring in this audit.

## Book workflow

PDF 113 / printed 2-27 defines an Auxiliary as a child view on a plane parallel to an angled model plane, showing its true dimensions. Its primary Auxiliary is hinged from a principal orthographic parent. The example has an inclined face shown edge-on in the parent and face-on in the Auxiliary, with sight arrows. This requires a real new projection basis; a standard view renamed Auxiliary, a rotated paper image or an annotation is insufficient.

## Existing integration points and gaps

`hidden_line.js:projectSolid` already projects mesh triangles, HLR, circles and cut geometry through a basis, but `viewBasis` accepts only named `VIEW_BASES`, silently falling back to Front for an unknown name. `cad_sheet.js:createProjector` feeds `view.dir` throughout. Topology-based dimensions and exact arcs already consume the actual returned `projection.basis`, which is the right place to extend. Layout treats nonprincipal views as floating, and the editor can drag/select/name a real child view. Standard first/third-angle principal placement must stay unchanged.

Native topology has planar-face descriptors (`surface:'plane'`, origin, normal), straight-edge descriptors/endpoints, persistent IDs and edge-on-face queries in `core/topology.js`. Drawing edge picks currently support persistent named endpoints for dimensions/angle tools. Auxiliary authoring needs a named straight edge and a qualifying incident planar face; an arbitrary 2D slope alone does not identify a model face uniquely.

## Finite proposed contract

1. Ordinary Drawing tool **Auxiliary**: click a real straight inclined edge in an unmodified principal view. Resolve the persistent edge descriptor against the current native topology, then offer only incident planar faces that are seen edge-on in that parent. If more than one qualifies, a face selector explicitly names the persistent candidate rather than choosing a hidden guess. Reject missing topology, curved/degenerate edges, cylindrical faces, wrong face ownership, projected degeneracy and ambiguous unselected planes.
2. Persist a genuine child view `auxiliary:{from:parentId,edgeReference:{pid},faceReference:{pid},flip:false}`. The current topology drives orientation on every rebuild; the saved references and last-known diagnostic basis are inspectable, not an uneditable frozen label. Actual input changes resolve the face/edge again. Missing/suppressed source references produce a dangling-view diagnostic rather than a Front fallback.
3. Resolve the current planar face's unit normal `n`. For the bounded primary case require `abs(dot(n,parent.forward)) <= tolerance`, i.e. face edge-on in the principal parent. Set Auxiliary forward to `n` (or `-n` for Flip), right to the parent's forward axis, and up to `cross(forward,right)`. This is an orthonormal right-handed basis with `right × up = forward`; the selected inclined edge must lie in the face and align with the resulting Auxiliary up direction. Native face coordinates thereby become true shape.
4. Add an explicit validated basis input to shared projection rather than extending the fixed direction enum with an arbitrary normal. Invalid vectors/near-parallel axes are rejected, never defaulted to Front. Preserve standard named bases exactly. Project actual chosen/configured mesh bodies with this resolved basis; all HLR/circle classification and native topology dimension anchors consume the same basis. Exact directional bounds are initially from source mesh, explicitly qualified; an AABB corner box is not a true face outline.
5. Child layout is initially floating and user-placeable, with explicit Auxiliary label/scale and sight marker tied to the parent edge. It remains a persisted parent dependency, and deletion cascades through its Detail children and bound dimensions/leader notes. No dummy CAD feature is added. Save/Undo/Redo/cold export reuse the same shared projection and reference resolver.

Bounded first release: principal unmodified edge parent and a native planar face seen edge-on in it. No unrestricted rotated/pictorial parent, secondary Auxiliary, Section/Break/Broken-out composition, or general automatic fold-line packing claim. Detail may use the resulting genuinely projected view as a parent; shared cropping already handles arbitrary projection coordinates. Invalid source graphs/references must be guarded.

## Oracle and actual native model plan

A finite supplementary **Auxiliary proof wedge**, authored by the parent through actual browser native sketch/Extrude, can provide an unambiguous numerical oracle: Front triangle (0,0), (30,0), (0,40) mm, extruded 20 mm along parent forward. Its inclined hypotenuse is 50 mm. The actual inclined planar face has true dimensions **20 × 50 mm** and area **1000 mm²**, while the Front view shows it edge-on. Auxiliary must project that face as a rectangle of those dimensions. This is a validation supplement, not a claim that the undimensioned source illustration specifies these values. The existing bridge has only axis-aligned native planar faces and is unsuitable for proving inclined-face Auxiliary.

Optional second witness after the basic face proof: a real face-supported native bore normal to that inclined face should project as a circle of its actual diameter in Auxiliary and be foreshortened/edge-on in a principal view. Do not require a scripted surrogate or metadata-only circle for acceptance.

Meaningful tests: orthonormality/right-handedness for all six parent directions; 3–4–5 wedge true lengths and area from actual geometry; face-normal flip; inclined-plane circle classification; native planar face/edge persistent references survive upstream dimensions and cold JSON; native HLR changes on current bodies; missing/wrong-owner/nonplanar reference rejection; no named-base regression; dimensions measure true Auxiliary coordinates and change with source geometry; real controller creation/Undo/child deletion; SVG and cold projection equality. Browser proof must use the actual native saved source model, ordinary Auxiliary tool and a current native topology reference.

## Proposed ownership when released

New `js/core/drawing_auxiliary.js` reference/basis resolver + `tests/drawing_auxiliary.test.mjs`; minimal validated-basis support in `js/core/hidden_line.js`; schema/cache/dispatch/dependency/sight marker in `js/cad_sheet.js`; genuine edge/face authoring in `js/modeler_drawing.js` plus toolbar/hint in `js/modeler.js`. Coordinate the shared files with the Break agent before edits. Parent owns model/browser/ADVANCE/commit. No shared code changes have been made for this design.
