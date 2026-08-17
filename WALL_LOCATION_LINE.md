# Wall location line

**Status: implemented, 2026-08-17.** `js/geometry.js` (`wallLocFace`, `wallOffset`,
`wallOffsetVec`, `wallNodeGeom`, `wallNodeFromAxis`, `setWallEnd`, `axisNodes`,
the `lineGap` term in `faceShiftAt`), `js/constraint_engine.js`
(`setWallReference`), the `w_loc` control in `index.html` / `js/ui_props.js` /
`js/ui.js`, and `tests/wall_location_line.test.mjs` (13 tests).

Two decisions below changed during the build; both are marked **CORRECTED**.

Follow-up to the 2026-08-17 fix in `js/constraint_engine.js` (`moveWallSideways`)
and `js/geometry.js` (`straightRunNodes`, the `wallCuts` clamp, `autoDimSide`
stability). That fix stopped a thickness edit from bending or stretching the
walls around it. It did **not** deliver the thing that was actually asked for:

> keep the "Measured along" line straight across the joint, and let the
> difference in thickness show on the opposite side.

## Why the current model cannot do it

`S.nodes[w.a]` / `S.nodes[w.b]` are the wall's **centreline** ends. Two collinear
walls meet at one node, so they share one centreline, so their faces are offset
from each other by `(t₁ − t₂)/2` on **each** side. There is no arrangement of the
node graph that makes one face flush and puts the whole step on the other — the
information simply is not representable.

Real CAD solves this with a **location line**: the line stored in the model is a
chosen line of the wall (centreline, core face, finish face), and thickness is
laid off from it. Two walls sharing a location line join flush on that side.
This project already has the missing half of that idea — `w.dimSide`
("Measured along", `js/geometry.js:159`) already names a reference face. What is
missing is letting the node graph *be* that face.

## The model

One new per-wall field:

```js
w.loc = "center"   // default, absent in every existing file — today's behaviour
      | "face"     // the node line IS the dimSide face
```

and one derived quantity, in `js/geometry.js`:

```js
// signed lateral distance from the node line to the wall's own centreline,
// along the +1 normal (-uz, ux) of the a->b direction
wallOffset(w) = w.loc === "face" ? -wallDimSide(w) * (w.thickness || 0) / 2 : 0
```

`wallGeom(w)` returns `a`/`b` shifted by that offset. `ux`, `uz`, `ang` and `L`
are untouched — a lateral offset changes neither a direction nor a length, which
is what keeps the constraint engine (lengths + bearings) completely unaffected.

**The invariant that makes this safe:**

> `S.nodes` is the LOCATION line — topology, dragging, welding, snapping to
> corners. `wallGeom` is the wall's OWN centreline — drawing, measuring, mitres,
> openings, items, 3D. Nothing may read one and write the other.

Consequences worth stating:

- `loc` absent ⇒ offset 0 ⇒ every existing scene is byte-identical. No migration.
- `dimSide === 0` (centreline) with `loc: "face"` is a contradiction; it resolves
  to `"center"`.
- Two collinear walls, both `loc: "face"`, same `dimSide` ⇒ their face lines
  coincide ⇒ flush face, whole step on the far side. That is the deliverable.
- A thickness edit on a `loc: "face"` wall moves **nothing**: the face is the node
  line by definition and the material grows to the other side.
  `moveWallSideways` becomes a no-op for those walls.
- Curved walls are **out of scope for phase 1**: an offset on an arc changes its
  radius rather than translating it. `loc` is forced to `"center"` when
  `wallGeom(w).kind === "arc"`.

## Work packages

Each package is shippable and testable on its own.

### P0 · foundations — `js/geometry.js` only

1. `wallOffset(w)` + `wallOffsetVec(w)`, applied in `wallGeom` (`js/geometry.js:52`).
2. `wallPointAt` / `wallTangentAt` / `wallProject` (`js/geometry.js:75-83`) pass a
   two-key virtual nodes object to `wall_curves.js` instead of `S.nodes`.
   `wall_curves.js` only ever reads `nodes[wall.a]`, `nodes[wall.b]` and the arc
   centre, so **it needs no change at all**.
3. `wallNodeFromAxis(w, pt)` — the inverse map (subtract the offset), for writers.
4. Tests: with `loc` absent, a golden sample plan produces identical outlines,
   cuts, clear lengths and room polygons; with `loc: "face"`, length/angle/clear
   are unchanged and the reference face lands exactly on the node line.

### P1 · writers — the one real hazard

A site that reads `wallGeom(w).a` and writes the result into `S.nodes[w.a]` would
bake the offset into the node and drift the wall by half a thickness per edit.
The whole surface is small and already located:

| file | node-write sites |
| --- | --- |
| `js/ui.js` | 12 (`:1066-1078`, `:1279-1286`, `:1310-1320`) |
| `js/constraint_engine.js` | 5 (`fitWallClearLength` `:260-274`, `preserveClear`, `enforceLocks`) |
| `js/interaction.js` | corner drag / split (`:1516`, `:1637`, `:2181`, `:3292`) |

Route every one through a single `setWallEnd(w, end, axisPoint)` that applies
`wallNodeFromAxis`. Add a source-text test (this repo already asserts on source
text — see `tests/wall_dimension_edit.test.mjs`, "wall inspector commits length
and angle atomically") that fails on a raw `S.nodes[...] =` inside a wall edit.

### P2 · joints — where the subtlety lives

`faceShiftAt`, `straightThroughWallAt`, `wallJoinRole` and `autoDimSide` read
`S.nodes[nodeId]` / `S.nodes[other]` for the arms' directions. Directions are
offset-invariant, so those keep working; what must change is `faceShiftAt`'s
**face lines**, which now start from each arm's own offset endpoints rather than
from the shared node.

The machinery already exists: since 2026-08-13 `faceShiftAt` intersects the two
face LINES rather than assuming ±t/2. Feeding it offset lines is what makes the
flush joint fall out on its own.

Tests to add:

- two collinear walls, unequal thickness, both `loc: "face"`, same `dimSide`:
  the measured faces are one straight line and the step on the far side is
  exactly `Δt`;
- an L corner where both walls are on their inside face: the corner closes on the
  inside, and the outside mitres to the outer intersection;
- mixed `loc` at one node (one wall `face`, one `center`): the joint still closes.

### P3 · consumers that need a look

Automatic through `wallGeom`, but each needs a test rather than an assumption:

- `detectRoomCycles` builds polygons with `pointAtWall(edge.w, ss, S.nodes)` —
  switched to the offset-aware `wallPointAt`. **CORRECTED, and it cost three
  bugs the plan did not foresee:**
  1. only the START of each edge was sampled. With centred walls that is the
     shared corner; with offsets the walls' own lines no longer meet at a point,
     so every corner was cut off the room. Both ends are sampled now, and the
     corner shows as the small step it really is.
  2. sampling both ends duplicates every corner on a centred plan, and
     `addRoomRect` (`js/room_cons.js:71`) tests `r.pts.length !== 4`. Coincident
     consecutive samples — and the wrap-around one — are dropped, so a plain
     rectangle still reports four corners.
  3. `topologySignature()` keyed the room cache on nodes, ids, heights and
     kinds. Re-hanging a wall moves its line without touching a node, so the
     cache served a stale room. `wallOffset(w)` is in the key now.
- `hitWall` / `wallProject` (`js/interaction.js:171`) — the `thickness/2 + tol`
  tests must centre on the drawn wall, not on the node line.
- `view3d.js` `getCursor` / `mitre` (`:421`, `:508`) — end cuts against offset
  neighbours.
- openings (`o.s`, `openFaceDist`/`openNodeDist`), item→wall snapping
  (`WALL_SNAP_GAP`, `js/interaction.js:279`), MEP routing.
- **`nearestWallLanding`** called `projectToWall(..., S.nodes)` directly rather
  than the wrapper, so a new wall would have landed on the node line instead of
  on the wall the user can see. Now `wallProject`.
- **`wall_framing.js`** places real timber and is written as a pure function over
  a passed-in state, so `wallAxisNodes(wall, nodes)` takes the node array
  explicitly instead of reaching for the global. Without it the studs stayed on
  the node line while the wall moved off it.
- `weldCoincidentNodes` (`js/interaction.js:2018`) merges corners within **2 cm**.
  A face-located wall meeting a centre-located one legitimately has its node half
  a thickness away; for thin walls that is inside the weld gate. `canWeld` must
  also refuse a weld that would change a wall's `loc`-derived face position.

### P4 · UI + persistence

- The "Measured along" segmented control (`#w_side`, `js/ui.js:1342`) gains a
  location-line row: **קו ייחוס: מרכז / פאה נמדדת**, plus **החל על כל הרצף**,
  which `straightRunNodes(w)` already resolves.
- **CORRECTED — the JOINT is what stays put, not the wall.** The plan said to
  shift the nodes by `−offset` so the drawing never moves. That is wrong here: a
  node is a *shared corner*, so moving it drags every neighbour standing on it —
  and on a straight run it drags the very wall the user is lining up with, which
  is the bug this whole exercise started from. So `setWallReference` leaves the
  corner alone and re-hangs the wall on it; the body moves half a thickness, once,
  and the neighbours' stated dimensions are re-READ (`captureClear`) rather than
  defended. Re-hanging both walls of a run is then exactly the flush-run
  operation, because both faces land on the one node line.
- Whitelists — the recurring drift trap: `applyData`'s wall list
  (`js/ui.js:~357`, beside `dimSide`) and the split-wall carry list
  (`js/interaction.js:1529`) both learn `loc`. `core/spatial_project.js` clones
  whole wall objects and needs nothing.
- `setWallThicknessPreservingClear`: skip the sideways move entirely when
  `loc === "face"`.

### P5 · what it unlocks

- Thickness edits on a face-located run need no geometry motion at all.
- The auto-face flip risk disappears for those walls: the face is explicit by
  construction.
- The natural next step after this is a project default ("new walls are drawn on
  their exterior face"), which is how architects actually work.

## Rejected alternative

**Shear the drawing only** — align the faces in `wallOutline` + `view3d` and leave
the model on the centreline. Cheap (no writers, no persistence, no migration) and
it looks right, but the model then disagrees with the picture: a cabinet snapped
to that wall sits at the un-sheared face, the room polygon is wrong by t/2, and
the dimension the plan prints is measured from a line the user cannot see. This
is exactly the class of inconsistency the `wallCuts` clamp was just added to
remove; re-introducing it deliberately would be a mistake.

## Cost and risk

| package | estimate | risk |
| --- | --- | --- |
| P0 foundations | ½ day | low — additive, offset 0 is a no-op |
| P1 writers | ½ day | **high if rushed**; the single setter + source test is the mitigation |
| P2 joints | 1 day | medium — mitre maths, but line-intersection is already there |
| P3 consumers | ½ day | medium — rooms/areas visibly change (correctly) for face walls |
| P4 UI + persistence | ½ day | low |

~3 days including tests. Every package leaves the tree green; nothing ships to
existing scenes until a user actually flips a wall to `loc: "face"`.

## Decisions taken

1. **Default for new walls is `center`** — nothing changes until a wall is
   explicitly re-hung, and a project-wide default is left for later.
2. **One control, two rows** — "Measured along" picks the face, "קו ייחוס" says
   whether the node line follows it, and its buttons are disabled on a centreline
   dimension and on a curved wall. `setWallReference` also refuses the
   contradictory `dimSide: 0` + `loc: "face"` state, resolving Auto first.

## What is left

- **Curved walls.** An offset changes an arc's radius rather than translating it,
  so `wallLocFace` returns false for them and the control is disabled. Doing it
  properly means offsetting the radius in `wall_curves.js`.
- **A project default** ("new walls are drawn on their exterior face"), which is
  how architects actually work, and a converter for a whole plan.
- **3D corners between a face-located and a centred wall.** `wallOutline` and the
  mitre are exact; `view3d`'s non-mitred fallback (`getCursor`, ±mt/2) still
  assumes both centrelines meet at the node, so a mixed corner can show a
  hairline. Both walls of a run being re-hung together — the intended
  operation — is exact.
