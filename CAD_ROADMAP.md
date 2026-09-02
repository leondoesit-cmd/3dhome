# ModelForge CAD roadmap

ModelForge is intended to remain local-first and free to use. Core part and
assembly documents are stored in the browser and do not require an account,
subscription, or cloud service.

## Working now

- 2D top/front/side sketch planes with grid and object snaps
- Connected line/wall chains with live length and angle feedback
- Editable length and angle constraints saved inside the part document
- Rectangle, circle, slot, regular polygon, ellipse, sphere, revolve, extrude,
  cut and bore tools; two-point tools take a drag or two clicks
- Fillet, chamfer, shell, loft, mirror and linear/circular patterns
- Materials, textures, feature history, undo/redo and reusable part library
- Edge-triggered auto-pan during long wall and polygon sketches
- Click-empty and Escape deselection behavior
- Assembly documents with reusable component instances
- Component hierarchy, 3D picking, Ctrl/Cmd multi-selection, visibility and grounding
- Numeric XYZ position and XYZ rotation
- Align-X/Y/Z and distance mates
- Local assembly save/load
- SolidWorks-style CommandManager tabs for Features, Sketch, Evaluate and Assembly
- Search Commands (`Ctrl/Cmd+K` or `/`) with availability-aware results
- Searchable FeatureManager tree and contextual finish/cancel controls for multi-step tools
- Profile diagnostics with visible open/branched endpoints, near-endpoint repair, multi-loop selection and nested-hole extrusion
- Mixed line/arc extrusion profiles, parametric sketch rectangles and typed line length/angle input
- Selection measurements, sketch health metrics, duplicate-constraint prevention and one-click conflict cleanup
- Driving/reference dimension toggles, fixed-entity support and strict rollback of redundant over-constraints

### Parametric sketch kernel

- Persistent line, circle and arc entities independent of solid features
- Shared nodes and a constraint graph solved by damped Gauss-Newton
- Coincident, horizontal, vertical, parallel, perpendicular, tangent, equal,
  concentric, midpoint, point-on-entity, symmetry, fix, distance, angle,
  radius and diameter constraints
- Auto-inferred horizontal/vertical rules on drawn segments
- Degrees-of-freedom display on the tab, the sketch pane and the status bar,
  counted from a row-equilibrated Jacobian so the same shape reports the same
  freedoms whatever size it is drawn at
- Dragging a sketch point skips the rank analysis and keeps the last report,
  which is what makes a large sketch draggable at all: the diagnostics cost
  O(residuals · variables²) while the Newton step on an already-solved sketch is
  nearly free
- Conflict diagnostics naming the offending constraints, with solver rollback
  so a contradictory edit never lands half-applied
- Smart dimensions that measure first, then drive; editable and suppressible
  from the constraint list
- Live re-solve while dragging a sketch point
- Trim, extend, offset, construction geometry and projected part edges
- Sketches belong to a plane (top/front/side, with an offset) and are listed as
  documents: switching plane swaps which sketch is editable, other sketches on
  the same plane are drawn dimmed as snap references, and each solid extrudes
  along its own sketch's normal rather than along the current view
- Sketch-driven solids rebuild from their sketch on every solve, so editing a
  dimension resizes the solid it created; one resolver serves both the live mesh
  and the BREP regeneration, and a broken profile keeps its last good shape and
  is flagged in the tree rather than deleting the user's geometry
- Named dimensions, global variables and equations between them: any dimension
  can be written as an expression over other dimensions and variables, across
  sketches, with cycle detection and per-field error reporting. Expressions are
  parsed by a purpose-built evaluator, never by `eval`, because they travel
  inside saved models and imported scene files
- Sketch mirror, linear pattern and circular pattern, all tied to their source
  by constraints rather than copied and forgotten: move the original and the
  copies follow, and each copy's pitch is an ordinary dimension that a named
  equation can drive. The circular pattern rests on a rotation-about-a-point
  constraint that carries every point pair of one copy, so a whole copy is one
  editable angle rather than one dimension per corner
- Slots and regular polygons are compositions of the primitives the solver
  already understands — a slot is two lines and two arcs held by tangency,
  parallelism and equal radius; a polygon is n chords of a construction circle
  held equal — so trim, dimension, mirror and pattern all keep working on them,
  and each keeps exactly the freedoms the shape really has (five for a slot,
  four for a polygon)
- Ellipses are a first-class entity: centre, both semi-axes and a tilt, each one
  a variable the solver drives, with a radius dimension per named axis
- Typed dimension entry while drawing: type, Tab between fields, Enter to place.
  A typed value becomes a driving dimension and a dragged one does not, so
  "40 × 18" leaves the ellipse it drew carrying those two dimensions

### Feature history

- The part list is the feature history, in build order
- Drag to reorder, suppress a step, and a rollback bar that cuts the build
- New features insert at the rollback bar rather than always appending
- Suppressed and rolled-back steps are drawn as dashed ghosts on the canvas and
  excluded from the 3D preview, the saved model, the bounds and STEP regeneration
- Reference planes, axes and coordinate systems are persistent FeatureManager items
- OpenCascade regeneration supports sketch extrusion, revolve, sweep and loft feature records
- STEP and IGES solid export
- Assembly exploded views, rotary motion studies, BOM and interference checks
- Part mass/volume/center-of-mass evaluation and portable `.mforge` project bundles
- Hole wizard with counterbore, spotface, countersink, ISO tap drill, layouts and callouts
- Helix/spiral curves, ISO metric cosmetic and modeled threads, DIN 82 knurls
- Inserts/bushings with per-face appearances and named configurations
- Screw, tangent and limit mates plus ISO 286 hole/shaft fits
- Toolbox SHCS, hex screws, nuts and brass bushings
- Drawing sheets on real paper (A4-A0, first/third angle) with hidden-line
  removal, centre marks and axes, section and detail views, dimensions you place
  on the projection, leader notes, a parts list and an ISO title block — printed
  or exported as SVG at true size from the same scene the screen draws

## Next: parametric sketch kernel, remaining

- Splines and conic fillets
- Sketch planes on part faces and on user-created reference planes
- Dimension witness-line placement and dragging
- Tangency with a stored side, so a very large drag cannot pick the other branch
  (the slot works around this by holding its sides parallel to the centreline,
  which is a signed relation and cannot flip)

## Next: production part modelling

- Reference planes attached directly to selected BREP faces
- Extrude depth driven by the sketch plane's offset when that offset changes
- Boundary loft, draft, rib, variable fillet and multi-body boolean editing UI
- Sheet-metal bends and flat patterns beyond the current allowance calculator
- STEP/IGES/BREP import/export backed by an open geometry kernel

## Next: production assemblies

- Subassemblies and component patterns
- Exact rotated-solid clearance volume (the current fallback is transformed AABB)

## Next: drawings and interoperability

- Drawing dimensions that drive the model, not only measure it
- Broken-out and aligned sections, revision clouds and GD&T frames
- DXF export (SVG and print are done; PDF goes through the browser's printer)
- STEP, STL, OBJ, GLB and 3MF workflows
- Autosave snapshots, portable project bundles and offline installable PWA

The browser UI can support all of these workflows, but production-grade STEP
modelling and a general constraint solver should be built on established open
geometry libraries rather than hand-written mesh approximations.
