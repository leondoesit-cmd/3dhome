# Sketch relations to model edges and corners (2026-09-28)

Found while rebuilding HOUSING (book pp. 335-364, the handle): the path ends are
made with Coincident / Intersection relations to existing model edges, and the
Convert Entities step brings model edges into the sketch.

## What was already there

* `onModelEdge` (Coincident, point + one model edge), `intersection` with
  `edgeA`/`edgeB` (point + two model edges) and `pierce` (another sketch's curve)
  are stored as constraints holding a **topology reference** (`persistentId`,
  `ownerFeatureId`, `semantic`), never coordinates. `bindModelEdgeTargets` /
  `bindIntersectionTargets` re-read the rebuilt edge and write the derived target
  (`ax..by`, `x/y`) onto the constraint before every solve, live
  (`resolveSketch`) and in the feature-tree rebuild (`resolveSketchRelationSources`).
* Picking a model edge in the 2D sketch (canonical sketch phase) adds it to
  `E.topologySelection`, and Coincident / Intersection read it.

## The gaps closed here

1. **Corners.** Ctrl-click on a projected model corner selected nothing. A
   vertex reference is derived from edge ends and keyed by position
   (`vertexKey`), so it cannot follow a rebuild on its own.
2. **Only "somewhere on the projected line".** No relation could pin a point to
   the start, end or middle of a model edge, and an edge standing square to the
   sketch plane (it projects to a point, which `modelEdgeSketchLine` rejects) was
   unusable: "does not show as a line".
3. **Convert Entities of a straight model edge** did not exist (only circular
   edges, cone silhouettes and planar face boundaries).

## Design choice: one relation, an `at` field, no new baked geometry

Smallest and most robust option: keep the single `onModelEdge` constraint and give
it an optional `at`:

| constraint | meaning | solved as |
| --- | --- | --- |
| `{onModelEdge, point, edge}` | point on the edge's line as seen on the plane | point-to-line residual (`ax..by`) |
| same, edge square to the plane | point where the edge pierces the plane | pinned to `px,py` |
| `{..., at:"start"\|"end"}` | point at that end of the edge | pinned to `px,py` |
| `{..., at:"mid"}` | Midpoint of the model edge | pinned to `px,py` |

`px,py` are recomputed from the rebuilt edge in `bindModelEdgeTargets` (stale
`ax..px` keys are deleted first), exactly like `pierce` binds `x,y`. The solver
treats them as constants, so the point is associative: change the box width and
the sketch point moves with the edge.

* **Vertex**: a picked corner is converted at *apply time* to "the start/end of the
  edge that ends there" (`vertexEdgeBinding`), and that edge reference plus `at` is
  what is stored. The position-keyed vertex id is never stored.
* **Convert Entities of straight edges** (`convertModelEdgesToSketch`, on the
  existing Convert face button / command `faceboundary`, when straight model edges
  are selected in a sketch): each edge becomes a real sketch `line`; its two points
  carry `onModelEdge` with `at:"start"`/`"end"`. Shared corners are one sketch point
  so an outline closes into a profile. Because the result is ordinary sketch
  geometry, every normal relation and dimension works on it, and it is linked
  through the same references, so it follows the model without a second rebuild
  pipeline (`circleCopies` / `silhouetteCopies`). Only `curve:"line"` edges are
  converted (an arc's chord would be wrong); circles keep the existing command.
* **Missing reference is diagnosed, not baked.** `bindModelEdgeTargets` throws
  ("A coincident model edge is unavailable", "does not show as a line on this
  sketch plane", "has no end points to relate to"). In a rebuild
  `resolveSketchRelationSources` propagates that, the feature is reported failing
  and the sketch is left as it was (no `boundaryUpdates`). The live editor keeps
  its last bound target while a body is mid-rebuild (pre-existing behaviour).

## Gestures

Enter a sketch on a plane, with a solid in the document:

* Select tool, click near a projected corner or edge of the solid (Ctrl to add more);
  a corner beats the edge it ends. Then click / Ctrl-click a sketch point.
* **Coincident** (ribbon or palette): point + edge, or point + corner.
* **Midpoint**: point + model edge.
* **Intersection**: point + two model edges (existing).
* **Convert face** (Convert Entities) with one or more straight model edges picked.

Not covered: picking model edges/corners in the 3D view *while* a 2D sketch is
active (the pick lives on the 2D sketch plane; 3D-picked corners in
`E.topologySelection` are also accepted by Coincident); relations to curved (non
circular-edge-on) edges other than end points.

## Render loop RangeError

`js/core/render_guard.js` wraps `view.render` in `js/editor_view.js`. A render
requested from inside a render (an `afterRender` hook such as the sketch repaint,
or a material callback) now runs once on the next animation frame instead of
nesting until three's `renderBufferDirect` overflows the stack. Not reproduced in
Node (needs WebGL); the guard is proven on its own and is harmless if the cause
was something else.

## Tests

`tests/sketch_model_edge_relation.test.mjs` (relation solves, follows an upstream
box width/height change through a real `regenerateFeatures`, pierce, midpoint,
vertex binding, missing reference diagnosed), `tests/render_guard.test.mjs`.

## Browser findings (real Chrome, HOUSING HandlePath, 2026-09-29)

Exercising the gestures on the HandlePath sketch (Right Plane, perspective camera over the model) found four gaps, all fixed with focused tests in `tests/sketch_model_edge_relation.test.mjs`:

1. **Curved edges were "lines".** `modelEdgeSketchLine` projected a B-spline's two end points and called the chord a line, so the loft's rails were pickable across the Boss-Stop rim and a Coincident could bind to a chord. Only straight edges (and a circle seen edge-on, or an arc's end-to-end span when the arc stands square to the plane) are lines now; a B-spline still offers its end points to corner/Midpoint relations.
2. **Screen-space picking.** Over the model through a perspective camera an edge off the sketch plane is not where its plane projection is, so a click on a drawn corner missed by tens of pixels (or hit another edge's shadow). `hitScreenModelVertex`/`hitScreenModelEdge` compare the click with the edge as drawn (`edgePoints`), only for straight edges and circles.
3. **Stale model picks.** An edge/corner picked earlier stayed in `E.topologySelection`, so the next Coincident reused it. A fresh sketch pick, or a miss, now drops model edge/vertex picks (`dropSketchModelPicks`).
4. **Origin on a face sketch.** A sketch on a face has its origin at the face centre (the Right Plane HandlePath origin is the part origin, the SwitchHole sketch on the Handle's top face is not). SwitchHole therefore detaches to the Top Plane and offsets 6.604 cm instead of dimensioning from a face centre.

Rib gap found on the same run: see `docs/planchard/rib-and-export-repairs-2026-09-28.md` (multi-surface parallel Rib).

## Offset-plane native surface intersections, 2026-09-30

The Shell1 curved inner wall is a trimmed offset of a B-spline loft surface. Neither its endpoint chord nor a cylinder diameter is the intersection requested for Rib2. The new inspector command **Intersect model surface** appears with one selected sketch point and one model edge. It offers upstream curved native faces that actually meet the model-edge projection on the sketch plane, with explicit Lower/Upper branches. The stored Intersection constraint retains the face and edge references; native rebuild refreshes its target before solving. Missing or trimmed-out sources fail rather than retaining a fabricated point.

Read-only regeneration of the protected FLASH housing through Shell1 verifies that, on X1.524 cm at the BossStop line Z−0.254 cm, inner face `feature_mukkpocl_1:face:generated:offset:10` meets Y−5.0784060573 cm. The outer lower B-spline meets Y−5.3430626894 cm, and the upper inner offset face meets Y4.9606423106 cm. Thus the true lower inner face can be distinguished from both the outer wall and projected diameter.

Three native tests cover offset-plane geometry, explicit branches, JSON persistence, upstream radius edits and trimmed-face refusal; eleven combined section/edge/source-rebuild tests pass. Module/link/assertion gates pass (602 modules, 1490 assertions). Actual FLASH browser acceptance of this new control is still required; source probes are not a browser model reconstruction.

The section query runs in the exact CAD worker, returns only JSON face references and coordinates, and releases native handles in the worker. The first form lets the user choose a surface feature; selecting Shell1 replays only the prefix through Shell1 and filters candidate ownership to that feature. Existing exact-computation cancellation remains available, so querying does not load a second kernel on the UI thread. Four focused section tests pass, including owner-scoped wire candidates. Browser verification must use the desired edge at the correct world Z; the front native cylinder and rear offset loft are distinct trimmed faces.
