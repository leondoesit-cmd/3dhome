# Wall junctions: replace the default diagonal mitre with construction-correct joins

Status: plan, not implemented. Written 2026-11-14. No code in this file on purpose.

## 1. What is wrong today

Every corner where exactly two walls meet is closed with a **mitre**: each wall's
two faces are cut where they meet the neighbour's faces, so the two wall
polygons share one diagonal edge (45 degrees at a square corner of equal
thickness).

- The rule lives in `faceShiftAt` (`js/geometry.js`), consumed by
  `wallBaseCorners` / `wallOutline` / `wallBandOutline` / `tJoinStep`.
- The diagonal is **inked**:
  - technical 2D plan: `drawWall` in `js/plan2d/overlays.js` strokes every
    layer band polygon and then the wall's whole closed outline;
  - working-drawing sheet: `wallsSVG` in `js/drawing_sheet/hatches.js` strokes
    each wall's closed ring (`wall-cut`) and each band polygon (`wall-joints`);
  - presentation plan: `drawPresentationWalls` in `js/plan2d/walls.js` strokes
    every sub-path of the mass.
- The same closed-outline stroke also draws a line **across a straight wall**
  wherever it is stored as two walls (a split at a node), and across the mouth
  of every T-junction, even when both walls are the same material.
- The mitre is applied regardless of what the walls are made of: a 10 cm block
  partition meeting a 20 cm reinforced-concrete wall is cut diagonally through
  both.
- 3D: `js/view3d/wall_build.js` follows the same outline; the cutaway builder
  (`buildStraightWall` in `js/view3d/site_cutaway.js`, `getCursor`) picks the
  **lowest wall id** as the wall that spans a corner, which is arbitrary.
- The inspector already has a per-end override (`w.join.a` / `w.join.b` =
  `miter` | `butt` | `through`, picker `#w_join_a/b`, handler in
  `js/ui/wall_inputs.js`), but it is set on one wall only; nothing makes the
  neighbour take the matching role.

## 2. What is correct

Construction: no masonry or concrete wall is mitred. Masonry corners are bonded
(courses interlock), concrete is cast as one piece, and infill masonry or a
light partition stops square against the structure it meets.

Drawing convention (plans at 1:50 / 1:100): the cut area of one material is
drawn as one continuous area. Where two walls of the **same** construction meet
there is **no line** between them. Where **different** constructions meet, the
stronger one runs through and the other stops at its face, and the line between
them is that face, never a diagonal.

(Stated as general drafting practice. Clause numbers in ISO 128 / ISO 7519 /
Israeli practice were not looked up for this plan; do not cite them in code
comments.)

## 3. Design

Three things that are one today are separated.

### 3.1 Face meeting point (unchanged, becomes measurement-only)

The intersection of a wall's face line with the neighbour's face line: today's
mitre arithmetic. This is where a visible face really ends, whatever the join.
All **measurements** keep using it.

**Invariant M:** no stated length, clear length, room clear size, dimension
chain value or room area may change because of this work, for any join mode.
Today `wallCuts` goes through `faceShiftAt` and so picks up the manual
`butt`/`through` shift; that is a latent error and is fixed by this invariant.

### 3.2 Junction rule (who owns the corner)

Decided per node, once, for all arms, in one pure resolver. Roles per wall end:
`wrap`, `owner`, `butt`, plus today's `continuation` / `branch`.

| # | Situation at the node | Geometry | 
|---|---|---|
| R1 | Two arms in line (split wall) | Unchanged: both end at the node. |
| R2 | Two arms at an angle, **same assembly** | `wrap`: today's mitre, so each layer band meets the same layer of the neighbour. The seam is never drawn (3.3). |
| R3 | Two arms at an angle, **different assembly** | `owner` + `butt`. Owner: both faces run to the neighbour's **far** face line. Butt: both faces stop on the owner's **near** face line. Square at 90 degrees; at any other angle the end is cut along that face line, so there is no gap and no overlap. |
| R4 | Three or more arms | Unchanged (straight-through run stays square, branch butts, `tJoinStep` for mixed thickness; arms with no through pair keep today's rule). |
| R5 | Manual `w.join[end]` | Wins over R2/R3, and now sets the pair: `through` on one end makes the neighbour `butt`, `butt` makes the neighbour `owner`, `miter` on either makes both `wrap`. Two conflicting manual values: the wall with the higher R3 priority keeps its own. Same formulas as R3 (identical to today's at 90 degrees). |

**Same assembly** (R2): same wall kind, same phase, same solid top at the node,
and the same list of layer materials and thicknesses when both walls are read
from the corner's outer side to its inner side (this handles `layersReversed`
and a wall drawn a-to-b versus b-to-a).

**Owner priority** (R3), first difference decides:

1. Phase: an existing wall beats a new one; a wall being demolished never owns.
2. Core material class of the main layer: reinforced concrete > masonry
   (block, generic masonry) > light (stud cavity, gypsum, glass, anything else).
3. Main layer `structural: true` beats `false`.
4. Thicker wall.
5. Longer wall.
6. Lower id (only so the result is deterministic).

The result must not depend on wall creation order except at step 6.

### 3.3 Ink rule (which outline segments are drawn)

A new pure function returns, per wall, the **segments of its cut outline that
are drawn**. A piece of a wall's outline is dropped when it lies inside or on
the outline of a neighbour (a wall sharing that node) of the same **ink class**:

- Ink class = wall kind + phase + core material class.
- Both walls single-layer: drop anything inside or on the neighbour's polygon.
  This removes the wrap diagonal, the line across a split wall, and the line
  across a T mouth of the same material, at any thickness.
- Multi-layer walls: merge only with an identical assembly, and only where an
  **end edge** coincides with the neighbour's end edge (wrap corner, split
  wall). A multi-layer T keeps its line, because the through wall's finish
  layer really does cross the mouth.
- Different ink class: nothing is dropped. The line that remains is the owner's
  face, which is the correct material boundary.
- Demolition walls, room dividers, railings, curved walls: never merged; drawn
  as today.

Layer lines inside a wall: only the edges that run **along** the wall are
drawn. A band's end edges are never drawn on their own (where the wall end is
inked, the wall outline already covers them). At a wrap corner the layer lines
of the two walls then meet and read as one layer turning the corner.

Method (no polygon boolean library): split each outline edge at its crossings
with the neighbour polygon's edges, keep a piece when its midpoint is neither
inside the polygon nor within a small tolerance of its boundary. Only
node-sharing neighbours are tested.

## 4. Where the code goes

`js/geometry.js` is frozen by the size gate at its current length and may only
shrink. `js/plan2d/overlays.js` is near the limit.

- **New** `js/wall_junctions.js`: the resolver (3.2), assembly/material
  classification, and the face-line intersection helpers the roles need. No
  `three` import, no DOM. It must not create an import cycle that breaks at
  load; if `geometry.js` has to call into it, move the joint code out of
  `geometry.js` with `tools/split_module.mjs` rather than retyping, and keep
  `geometry.js`'s exports (`tests/export_surface.test.mjs`).
- **New** `js/wall_ink.js`: the ink function (3.3), also Node-importable.
- **New** `js/plan2d/wall_ink_draw.js` (or similar small piece): the canvas
  drawing that uses it.
- The material class used for ink and priority must agree with `bandKind` in
  `js/drawing_sheet/hatches.js`; share one classifier rather than keeping two.
- Add every new file to `survey-assets.json`.

## 5. Steps

Each step ends with `npm run check` green and the related tests green
(`npm run test:changed`). Stop and report if a step cannot be finished; the
steps are ordered so the tree is usable after each one.

### Step A: rules and geometry

1. Add the resolver. Feed it into the geometry path so `wallOutline`,
   `wallBandOutline` and `tJoinStep` produce R1 to R5.
2. Give measurement its own entry point for the face meeting point and move
   every measuring caller to it (`wallCuts` and whatever else states a length;
   classify each caller of `faceShiftAt` as geometry or measurement and list
   them in the report).
3. Tests (new `tests/wall_junction_rules.test.mjs`, behaviour only, built on
   the sandbox pattern of `tests/wall_mitre.test.mjs`):
   - same assembly, 90 degrees: outline identical to today's;
   - concrete 20 + block 10, 90 degrees: concrete is a rectangle to the block's
     far face, block ends square on the concrete's near face;
   - the same at 60 degrees: the two polygons share one full edge, no gap, no
     overlap;
   - each priority step decides in isolation, and swapping wall ids / creation
     order does not change the owner;
   - Invariant M: `wallClearLength` on each `dimSide` is identical under auto,
     `miter`, `butt` and `through`;
   - R5 pairing: a manual value on one wall gives the neighbour the matching
     role.
4. Existing `tests/wall_mitre.test.mjs`, `tests/wall_join_control.test.mjs`,
   `tests/wall_location_line.test.mjs`, `tests/wall_dimension_edit.test.mjs`
   must pass. If one pins behaviour this plan deliberately changes (a mitre
   between different assemblies, or a manual join changing a measured length),
   change that assertion and list it in the report with the reason. Do not
   weaken any other assertion.

### Step B: ink function

1. Add the ink function and its tests (new `tests/wall_ink.test.mjs`):
   - same-assembly L: no drawn segment on the diagonal; the drawn segments are
     exactly the outer L and the inner L;
   - split straight wall, same assembly: no segment across the wall;
   - single-layer T, same material, different thickness: no segment across the
     mouth; block into concrete: one segment, on the concrete face;
   - multi-layer T: line kept;
   - free end: end edge drawn;
   - demolition wall next to a new wall of the same type: nothing merged.

### Step C: 2D plan and sheet

1. Technical plan (`drawWall`, `js/plan2d/overlays.js`, and its caller in the
   `structure` band of `js/plan2d.js`): two passes over the walls, all fills
   first, then ink, so a neighbour's fill cannot cover a line. Band fills lose
   their closed stroke; layer lines and the perimeter come from 3.3. Two fills
   of the same colour meeting on the hidden diagonal must not show a light
   hairline (antialiasing): close it, for example with a hairline in the fill's
   own colour.
   Selection and erase highlight keep the wall's full closed outline. The HUD
   pass that redraws a selected wall must still look right.
2. Presentation plan (`drawPresentationWalls`): stroke the ink segments instead
   of every sub-path.
3. Sheet: `sheetWalls` in `js/drawing_snapshot.js` adds the ink segments and
   the along-wall layer lines to each wall; `wallsSVG` in
   `js/drawing_sheet/hatches.js` draws those instead of closed polygons for
   `wall-cut` and `wall-joints`, keeping the exterior/interior pen widths. The
   plain sheet in `js/drawing_sheet.js` (solid fill) needs no change.
4. The ink result is needed for every wall on every repaint: memoise it on a
   key that changes with anything it depends on (node positions, wall ends,
   thickness, type, layers, phase, kind, join, location line, openings at a
   joint) and confirm with `tools/perf_planner.mjs` that 2D repaint is not
   measurably slower.
5. Tests: sheet SVG for a same-type square room contains no diagonal segment
   in `wall-cut`; for concrete + block it contains the square seam. Check that
   `outlineSegments` / dimension chains on the sheet give the same values as
   before for a mixed-type room (Invariant M).

### Step D: 3D

1. `js/view3d/wall_build.js` follows the outline; confirm its tests pass and
   that a mixed-type corner builds the owner through and the other butted.
2. `getCursor` in `js/view3d/site_cutaway.js`: replace the lowest-id choice and
   the manual-join branches with the resolver's role, so plan and 3D agree.
   `buildStraightWall` is frozen by the size gate: it may only shrink.
3. Same-assembly corners stay mitred in 3D (one continuous surface, no visible
   end grain).

### Step E: finish

1. `npm run check` (all five gates), then `npm run test:quiet` in the
   background for the whole suite.
2. `node tools/size_check.mjs --ratchet` if anything frozen got smaller.
3. Inspector: no new control. The existing picker keeps working; "Automatic"
   now means the rules above. Update the tooltip text in `js/i18n/*` only if
   the current wording says "mitre" for Automatic.

## 6. Constraints

- No commit, no push, no branch switch. Leave `.ses`, `BUGS_TO_FIX.md`,
  `perf-shots/` alone.
- Follow `AGENTS.md`: size gate (split, never raise a limit or add a baseline
  entry), codemods for moves, behaviour tests over source regexes, do not read
  big files whole, `tools/outline.mjs` first.
- Saved projects need no migration: `w.join` keeps its meaning. Mixed-type
  corners in existing projects will change from mitred to butted; that is the
  intended fix.
- Quantities: per-wall areas/volumes at a mixed corner move from "half each" to
  "owner takes the corner". Totals are unchanged. If a take-off test pins a
  per-wall figure at such a corner, update it and report it.
- Not in scope: layer-by-layer clean-up between different assemblies, curved
  walls, Y-junctions with no straight-through pair, new UI.

## 7. Report expected from the implementer

- Files added and changed.
- The callers of `faceShiftAt`, each marked geometry or measurement.
- Every existing assertion that was changed, with the reason.
- Output of `npm run check` and of the test runs (failures quoted in full).
- Anything in this plan that turned out wrong or was not done.
- What was not verified (the 3D look and the on-screen 2D look need a real
  browser with a GPU and are checked afterwards by the main session).
