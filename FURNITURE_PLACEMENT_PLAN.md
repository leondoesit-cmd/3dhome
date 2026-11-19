# Furniture placement: wall snapping, on-wall dragging, area-drawn wardrobes

Executor: Opus 5.5 (medium). Planner: main model, which verifies each stage after you.
Four stages, in order. Each stage ends green (`npm run check`, `npm run test:changed`)
and is reported before the next begins. No commits, stashes, resets or branch switches.

Goal (user's words, shortened):
1. Any non-structural piece snaps flush to a wall by default while it is moved (the
   wall the cursor points at, or the nearest), and never floats off it or passes
   through it. "Mounting a TV leaves it floating or going straight through the wall."
2. A piece on a wall is dragged directly across that wall, in any direction, with
   smart snaps and alignment guides, instead of through height/offset fields.
3. Draw a box in the room (RTS / desktop marquee, mouse or touch, 3D and 2D); on
   release the area is filled with a default wardrobe (or another chosen unit) and
   the wardrobe builder opens together with the move/rotate controls.

---------------------------------------------------------------------------------

## How it works today (verified; read these, they are short)

| What | Where |
|---|---|
| 3D pointer → plan handlers. Every 3D press/move becomes a synthetic 2D pointer event | `js/planner_3d.js` `sample()`/`send()` → `js/planner_input.js` `dispatchPlannerInput` |
| The 3D sample: ground plane y=0, or the x,z of the FIRST thing the ray hits; a wall hit is projected onto the wall **centreline** | `js/view3d.js` `plannerPointer3D` (line ~209) |
| Item drag, one piece | `js/interaction/plan_move.js:377` → `moveItemTo(it, x, z)` in `js/interaction/layout_drag.js:644` |
| `moveItemTo` = 2 cm grid → `applyAutoFace` → `alignItem` → `applyResolvedItemTranslation` | `layout_drag.js`, `js/item_orient.js`, `js/interaction/hit_test.js:441` |
| Flush-to-wall snap: only when no item/corner alignment won, and only when the face gap is under `WALL_SNAP_GAP` = 9 cm | `hit_test.js:467-512`, `js/interaction.js:248` |
| Hung types (TV, art, mirror, AC …) and their 220 cm reach — which only TURNS the piece, never moves it | `item_orient.js` `HUNG_TYPES`, `HUNG_REACH`, `backToWallFit`, `flushToWall` |
| Standing hold to a wall after a flush drop (`it.hold = {wall, gap, side}`) | `js/item_align.js:143` `holdToWall`, `reseatHeldItems`; set in `pointer_up.js:290` from `S.itemSnapWall` |
| Height off the floor: `it.elev` (world Y of the piece's lowest point); Alt-drag in the OLD 3D edit path | `js/furniture_api.js:166` `elevOffset`, `js/interaction/view3d_edit.js:65` `drag3DItemElev` |
| Old 3D edit drag (`editDown/Move/Up`): suppressed for the planner pane, still a useful reference for "drag on the plane through the grabbed point" | `js/view3d/navigation_edit.js:155` |
| Fit-cabinet tool: hover a wall → the free run; click fills it, drag along the wall takes a span; commit creates `cabsys`, selects it, fires `planner-fit-cabinet` → designer docks beside the room | `js/interaction/fit_cabinet_tool.js` (247 lines), pure geometry `js/fit_cabinet.js`, `js/ui_cabinet_dock.js:170` |
| 3D previews, chain strip (Finish/Undo/Cancel/Design), hint chip, preview prefs — another session's uncommitted work, already in the tree | `js/build3d_*.js`, `js/view3d/build_ghost.js`, `BUILD_3D_PLAN.md` |
| Who owns a finger in the 3D pane | `js/planner_touch.js`, `js/build3d_input.js` `touchCommitsOnRelease` |
| Wall-overlap test for a footprint (used by AI placement only) | `js/placement_resolver.js:155` `wallSolidOverlap` |

### Why the TV floats or goes through the wall (root causes)

1. **The 3D sample is wrong for a drag.** While dragging, the ray's first hit is the
   dragged piece itself, a wall behind it, or the floor far behind the wall. A wall
   hit is projected to the centreline, so the piece's CENTRE is sent to the middle of
   the wall. Hits at different heights also shift the point from frame to frame.
2. **The flush snap needs the face within 9 cm.** With the centre on the centreline
   the face gap is half the piece's depth plus half the wall, so the snap does not
   engage and the piece stays inside the wall.
3. **Nothing blocks a wall.** `moveItemTo` has no collision; walls are passed freely.
4. **Hung pieces are only turned.** `HUNG_REACH` rotates a TV toward a wall 2 m away
   and leaves it there, in the air.
5. Alignment to another item wins over the wall snap (`bx == null && bz == null`), so
   a piece lined up with a neighbour sits a few cm off the wall.

---------------------------------------------------------------------------------

## Stage 1 — one placement resolver: flush by default, never through a wall

### 1a. Pure module `js/item_wall_snap.js` (new; no `three`, no DOM, Node-importable)

Takes plain data, returns a pose. The planner adapter (walls → segments with
thickness, `physical`, height; openings; other items) lives in the caller.

```
resolveItemDrag({
  item:   { type, w, d, rot, x, z },      // pose before this frame
  target: { x, z },                        // where the pointer wants the centre
  walls:  [{ id, a, b, t, physical }],     // straight pieces; an arc is passed as its chords
  mode:   "hung" | "wall" | "run" | "seat" | "free",   // item_orient.orientMode
  aim:    { wallId, nx, nz, x, z } | null, // the wall face the cursor is on (3D only)
  prev:   { wallId, side } | null,         // what it was flush to last frame (hysteresis)
  free:   boolean,                         // Alt held: no snap, no collision
  mul:    number                           // snapMul / input scale factor
}) → { x, z, wallId|null, side, flush: boolean, corner: wallId|null, blocked: boolean }
```

Rules, in this order:
1. **Aimed wall first (3D).** `aim` set and the piece is not `free` mode → the piece
   goes flush on that face, at the aim point along the wall. This is "the wall I am
   pointing at".
2. **Capture by nearness.** Otherwise the nearest wall face whose gap to the piece's
   near face is under the capture distance: `hung` → 220 (they have no meaning off a
   wall: with any wall in reach they are always flush), `wall`/`run` → 30 cm,
   `seat`/`free` → 9 cm (today's value). Once flush, release only beyond 1.6× the
   capture distance (hysteresis through `prev`), so sliding along a wall does not
   flicker. Measure with the rotation-aware footprint projection that
   `reseatHeldItems` uses (item_align.js:192), not the axis-aligned `halfExtents`.
3. **Corner.** After the first wall, run the same test once against the walls that
   are not parallel to it; flush to both in a corner.
4. **Collision (always, unless `free`).** The rotated footprint may not overlap a
   physical wall's solid. Push it out along that wall's normal to the side the
   centre was on in the previous frame. **Tunnel rule:** a wall is crossed only when
   the target centre lies past the far face by more than the piece's reach plus
   30 cm, and the piece fits there; then it jumps to the far side. A piece pushed at
   a wall therefore stops flush against it, and a clear move into the next room
   still works.
   Reuse the polygon test from `placement_resolver.js` (export what is needed rather
   than copying it).
5. `wall.physical === false` walls neither capture nor block.

Item-against-item collision is out of scope (stacking depends on overlap).

### 1b. Wire it into `moveItemTo` (`js/interaction/layout_drag.js`)

- New order: grid → `applyAutoFace` (unchanged) → `resolveItemDrag` (wall capture) →
  `alignItem` for the axes the wall left free → `resolveItemDrag` collision pass
  again on the result → `applyResolvedItemTranslation`.
- Split `alignItem`: the wall block (hit_test.js:467-512) is replaced by the
  resolver; the item/corner alignment stays and gains an optional "tangent only"
  argument so that a flush piece can still line up with its neighbours ALONG the
  wall without being pulled off it. Keep `flashSnap` and keep writing
  `S.itemSnapWall`, so the drop still becomes a standing `hold` (pointer_up.js:290,
  view3d_edit.js:112).
- `S.snapObj === false` keeps turning the magnetic snap off; collision stays on.
  Alt (`S.orientHold`, already set per drag) = fully free for that gesture.
- The multi-selection drag (plan_move.js:350) gets collision only, applied to the
  group's bounding footprint, through a small helper called from that branch
  (the branch itself sits in a frozen function: add a call, not logic).
- Placement of a new library piece (`js/build3d_pose.js` `placementPose`, and the
  click commit in `js/ui.js` `placeFurnAt` → `item.place`) must use the same
  resolver, so the ghost and the placed piece agree and a new TV lands on the wall.

### 1c. Tests — `tests/item_wall_snap.test.mjs` (behaviour, pure)
TV centre sent to a wall centreline → ends flush on the near face; 30 cm capture and
1.6× release; hung piece 2 m out → flush; `free` type not captured at 20 cm; corner →
flush to both; push into a wall → stops flush; target 3 m past the wall → far side;
`free: true` → untouched; oblique (45°) wall with a rotated piece; `physical:false`
ignored. Update `tests/item_align.test.mjs` / `item_orient.test.mjs` /
`wall_placement.test.mjs` only where the intended behaviour changed, and say which.

---------------------------------------------------------------------------------

## Stage 2 — a correct 3D sample while dragging a piece

- New piece `js/view3d/drag_probe.js` (do NOT grow `js/view3d.js`: it is at 1,613
  lines against a frozen 1,612). Using what `view3d.js` already exposes to its
  pieces (`pointerRay`, `pickableRoots`, `targetOf`, `cutAway`; check each is
  reachable the way `navigation_edit.js` reaches them), export
  `dragProbe3D(cx, cy, ignoreItems)` → `{ ray: {o, d}, wall: { id, point:{x,y,z},
  nx, nz } | null }`: the first WALL face under the cursor, skipping the dragged
  piece, its riders (`stack.js` `descendantsOf`) and cut-away walls. The face normal
  comes from the hit face, pointing at the camera.
- `js/planner_3d.js`: on a `down` that started an item drag (`S.action === "item"`
  after `send('down')`), remember `grabY = hit.point.y`. While that drag lasts,
  `sample()` builds the point from the ray ∩ the horizontal plane at `grabY`
  (`plannerPlanePoint3D` already exists) instead of from `plannerPointer3D`'s hit,
  and attaches `drag: { ray, aim }` to the input. Keep the grazing-ray guard
  (`groundSampleOk`).
- `js/planner_input.js`: pass `drag` through `setPlannerInputView` next to `hit`
  (one field). `moveItemTo` reads it with `plannerInputView()` when `inputIs3D()`.
  Nothing is added to the frozen `pointerDown` / `planMove` / `endAction`.
- `aim` reaches the resolver only when the ray really hits a wall face and the
  ground point is at or beyond that face (the cursor is "on the wall"), so dragging
  a sofa across the floor in front of a far wall does not fling it there.
- Touch: the same path. A finger covers the piece, so keep the snap buzz
  (`flashSnap` vibrate) and show the flush state in the ghost/outline tone.
- Tests: the decision "which sample does a drag use" as a pure function in
  `js/build3d_input.js` (`dragSamplePlan(state, hit)`), cases in
  `tests/build3d_input.test.mjs`.

---------------------------------------------------------------------------------

## Stage 3 — dragging on the wall, with snaps and guides

### 3a. When a piece is "on the wall"
- Always: `HUNG_TYPES`, plus wall cabinets (`upper`, `hood`, `wallShelf`; confirm
  the list against `js/furniture.js` and where each is built at a height).
- By choice: any other single piece through an **On wall** toggle
  (`it.hold.onWall = 1`). Turning it on snaps the piece flush to the aimed/nearest
  wall and keeps its height; turning it off returns it to the floor (`elev` cleared,
  `stack.js` `refreshSupport`). Confirm that `it.hold` and `it.elev` survive save,
  undo (`history.js`), duplicate and multiplayer (`plan_sync.js` `itemMovePlanOps`
  must carry `elev`, `rot` and `hold`; extend the op if it does not).
- The toggle lives in the 3D selection controls (see 4d), in the plan's selection
  toolbar and in the mobile selection sheet; one planner action `itemOnWall` in
  `js/ui/selection_actions.js` + its Set. Key: `W` if free in `js/ui/keyboard.js`,
  otherwise none.

### 3b. The drag
For an on-wall piece `moveItemTo` takes a second branch (a new small file
`js/interaction/wall_plane_drag.js`, called from `moveItemTo`):
- **3D:** the wall is the aimed wall, else the wall it is already on. Intersect the
  drag ray with that wall's face plane pushed out by half the piece's depth →
  `(s, y)`: position along the wall and height. The grab offset is taken in `(s, y)`
  at pointer-down so the piece does not jump. The cursor moving onto another wall's
  face moves the piece to that wall, re-faced, at the same height. Cursor on the
  floor, away from every wall face → nearest wall by the ground point, height kept.
- **2D plan:** slides along the wall (`s` only), crosses to another wall when the
  pointer is nearer to it; height unchanged.
- Sets `x, z` (flush), `rot`, `it.elev`, detaches from a stack host (as
  `drag3DItemElev` does) and skips `findSupport` (`resolveSupport: false`).
- Limits: floor ≤ bottom, top ≤ that wall's top at `s` (`elevation.js`
  `wallElevationSpan`), and the wall's free length between the side walls' faces
  (`fit_cabinet.js` `findWallGap` already finds those ends; reuse it).
- Check whether the elevation views (`js/elevation.js`) have an item drag. If they
  do, route it through the same module; if not, leave them and say so.

### 3c. Pure snapping `js/wall_plane_snap.js` (new, Node-importable)
```
snapOnWall({ rect:{s, y, w, h}, wall:{left, right, top}, items:[{s,y,w,h,id}],
             openings:[{s, w, sill, head}], tol, lockAxis, free })
  → { s, y, guides:[{ axis:"s"|"y", at, from, to, kind }], dims:[{ from, to, value, axis }] }
```
Candidates, nearest wins per axis, tolerance in screen terms (8 px / scale):
- `s`: both ends of the free run (flush into the corner), centre of the run, edges
  and centres of the other pieces on this wall, edges and centre of each opening,
  equal gap between two neighbours.
- `y`: floor, ceiling (top flush), bottoms/tops/centres of the other pieces on this
  wall, door head and window sill/head of this wall, the top of a floor piece
  standing right below (a TV centred over its unit: also offer that unit's centre
  on `s`).
- No candidate → 1 cm steps. Shift = lock to the dominant axis from the start
  point. Alt = no snapping (limits still apply).
- `dims`: live distances to the floor, to the ceiling and to the nearest thing on
  the left and right.
Other items on the wall = items whose `hold.wall` is this wall, or whose footprint
lies within its depth band; build that list in the adapter, not in the pure module.

### 3d. Guides
- 3D: painted on the wall face through the existing `planner-overlay-3d` event (the
  `o.path` / `o.label` API `fit_cabinet_tool.js` `paint3D` uses): guide lines across
  the wall at each engaged snap, dimension pills for `dims` in display units
  (`fmtLen`), the engaged snap named once ("centre", "aligned with window").
- 2D: the along-wall guides as ticks on the wall plus the left/right dimensions,
  through `onAfterRender` like `paint2D` there. New file
  `js/interaction/wall_plane_guides.js`; strings in a small bilingual module in the
  style of `js/build3d_strings.js` (the i18n files are size-frozen).
- Hint chip (`build3d_input.js` `toolHintKey`): "Drag across the wall · Shift:
  straight · Alt: free".
- Keyboard: with an on-wall piece selected in the 3D pane, arrows nudge along the
  wall and up/down by the existing nudge step (find the nudge near
  `pointer_up.js:695`); only if it fits without growing a frozen function.

### 3e. Tests
`tests/wall_plane_snap.test.mjs` (each candidate kind, axis lock, limits, dims);
`tests/wall_plane_drag.test.mjs` (ray → (s, y) → pose on straight and oblique walls,
wall switch, 2D slide, elev written, host detached). The height/offset fields in the
inspector stay as they are and must show the dragged values.

---------------------------------------------------------------------------------

## Stage 4 — draw an area, get a wardrobe and its builder

Extend the existing `fitcab` tool; do not add a twin. A click without a drag keeps
today's behaviour (fill the whole run).

### 4a. Gestures (`js/interaction/fit_cabinet_tool.js`, split a piece off if it nears the limits)
- **Press on a wall face and drag (3D):** a rectangle on that wall: width from the
  `s` range, height from the `y` range. Bottom within 10 cm of the floor →
  floor-standing; top within 10 cm of the ceiling → full height; otherwise a hung
  unit with `elev` = bottom. Depth 60, or the niche depth when shallower (today's
  rule), 35 for a hung unit.
- **Press on the floor and drag (3D and 2D):** a floor rectangle, RTS-style. The
  footprint is the box. An edge within 15 cm of a wall face is pulled flush to it;
  the back goes to the wall the box touches (longest contact wins), the front faces
  the room; with no wall near, the front faces the camera (3D) or the drag's start
  side (2D). Height = the wall's height there, as today.
- **2D press near a wall face, drag kept inside the depth band:** today's
  along-the-wall span, unchanged.
- The box is clipped by walls (it cannot cross one) and by `CAB_LIMITS`; under the
  minimum it shows the existing "too narrow" hint and commits nothing.
- 3D input: the tool needs the wall-face hit height and the ray. It is available:
  `plannerInputView().hit.point.y` for the press, and the Stage 2 `drag` field for
  the moves (extend the "attach `drag`" condition to `S.action === "fitcab"`).
- Touch: confirm `touchClaims3D` gives the finger to `fitcab` and that the drag
  draws the box live under the finger and commits on release; the Cancel strip
  already exists.

### 4b. Pure geometry (`js/fit_cabinet.js`)
`fitAreaBox(kind: "floor"|"wall", rect, walls, openings, opts)` →
`{ ok, x, z, w, d, h, rot, elev, wall, frame } | { ok:false, reason }`. Cases in
`tests/fit_cabinet.test.mjs`: floor box free-standing, against one wall, in a corner,
crossing a wall (clipped), too small, over the maximum; wall box floor-standing, full
height, hung, over a window.

### 4c. What gets built
- Default: wardrobe (`cabsys`, today's `defaultPreset(famOf(...))`).
- A chooser chip beside the tool's hint, listing the cabinet families from
  `js/cabinet/presets.js` (wardrobe, base, upper, shelving … whatever exists);
  the last choice is remembered (`localStorage`, try/catch). A hung box defaults to
  the upper/wall family when one exists.
- With a library piece armed (`S.placeType`), a dragged box places THAT piece at the
  box, turned to it, and sized to it only when the catalogue marks the piece
  resizable (find the flag `ui_props.js` uses for editable size); otherwise natural
  size, centred, back to the wall. Do this last; drop it and report if it needs
  changes inside frozen functions.

### 4d. After release
- `commit()` already selects the unit and fires `planner-fit-cabinet`, which docks
  the designer. Add `elev` and `hold` (with `onWall` for a hung unit) to the created
  item, and keep going through `itemPlaceCommand` as now.
- **Work controls around the new unit, immediately, in the 3D pane and in 2D:** a
  compact selection bar — Move (drag is live; the bar says so), Rotate 90°, Flip to
  the other face, On wall, Duplicate, Delete, Design. First look at what the
  selection already shows (`js/build3d_ui.js` strip and its `design` action, the
  plan's selection toolbar, `js/ui/mobile_chrome.js`); extend that, reusing the
  existing actions (`runAction` names), rather than building a second bar.
- With the designer docked, the unit must stay draggable/rotatable in the room pane
  and the designer must follow size changes. Verify; fix what blocks it.
- Preview: `build3d_ghost.js` `fitcab` row draws the draft box at its real height
  off the floor; the marquee itself is a dashed rectangle on the floor or wall on
  the HUD, with a `w × d` / `w × h` pill. In 2D the same in `paint2D`.
- Discoverability: the tool is "Fit cabinet" under Place (`js/pro_catalog.js:52`),
  in `js/tool_search.js` and the mobile draw tools. Rename the label to "Draw
  cabinet" / "צייר ארון" with the old words kept as search keywords, and add it to
  the 3D pane's hint text.

---------------------------------------------------------------------------------

## House rules (AGENTS.md is binding)

- Size gate: files ≤ 1,500 lines, functions ≤ 300; frozen ones only shrink
  (`pointerDown`, `planMove`, `endAction`, `view3d.js`, `fillProps` are frozen).
  New logic goes in the new small files named above; a frozen function gets at most
  a one-line call, and only if the gate still passes.
- New files → `survey-assets.json`. New action → handler branch AND its Set.
- Renderer: node materials only; nothing new in the pickable roots.
- The tree holds two other sessions' uncommitted work (Build-3D: `js/build3d_*`,
  `js/view3d/build_ghost.js`, `js/planner_3d.js`, `js/planner_input.js`; wall ink /
  junctions: `js/wall_ink.js`, `js/wall_junctions.js`, `js/plan2d/walls.js` …).
  Build on the Build-3D files where this plan says so, with small edits; leave the
  wall-ink files alone.
- Never read big files whole: `node tools/outline.mjs <file> --grep word`, then
  Read with offset/limit.
- Tests are behavioural (state in → pose out), not source regexes.

## Done means (per stage)

- The stage's tests exist and pass; `npm run check` exits 0; `npm run test:changed`
  passes. Do not run the full suite.
- Report: files added/changed, what was verified and how, and plainly what was NOT
  verified. 3D needs a real GPU: say if you could not look at it. The main model
  then checks in a real browser: TV dragged at a wall from four camera angles
  (never inside, never floating), TV dragged across the wall with guides, a sofa
  pushed at a wall and moved into the next room, a wardrobe drawn on the floor and
  on a wall in 3D, in 2D, and by touch at 360×800.

## Decisions taken here (the user may overrule; build to these meanwhile)

1. Wall capture is by piece kind: hung always, wall/run pieces from 30 cm, free
   pieces and seats from 9 cm. Alt frees one drag. (An older comment in
   `hit_test.js:468` records that a large capture distance for everything was a bug:
   a sofa could not be stood just off a wall.)
2. Walls block every piece; a clear move past the wall still crosses it.
3. "On wall" is automatic for hung types and a toggle for everything else.
4. The area tool is the existing Fit-cabinet tool, extended and renamed.
