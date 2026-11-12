# 20 Verified Planner Bugs to Fix in ModelForge / 3dhome

You are asked to verify and fix the following 20 bugs in the 2D/3D parametric Home Planner modules of `3dhome`.
For each bug:
1. Verify the defect in the code.
2. Apply the surgical fix in the planner module without introducing any free identifiers or link errors.
3. Ensure all changes pass:
   - `node tools/module_check.mjs`
   - `node tools/link_check.mjs`
   - `node tools/comment_assertions.mjs`
   - `node --test tests/planner_20_bugs.test.mjs`

---

### Bug 1: `js/interaction.js` Multi-item delete ignores user layer locks
- **File**: `js/interaction.js` lines ~3294-3297
- **Defect**: In `applyRemove(sel)` when `sel.kind === "items"`:
  ```javascript
  var lockedSkipped = sel.refs.filter(function (i) { return i.locked; }).length;
  S.items = S.items.filter(function (i) {
    return sel.refs.indexOf(i) === -1 || i.locked;
  });
  ```
  It checks `i.locked` directly instead of `refLocked(i)`. An item whose individual `i.locked` is false, but whose user layer is locked (`itemUserLocked(i)` is true), is deleted when part of a multi-item selection!
- **Fix**: Use `refLocked(i)` instead of `i.locked` in both `lockedSkipped` and `S.items.filter(...)`.

---

### Bug 2: `js/commands/item_duplicate.js` Duplicated items keep stale stacking parent `item.on`
- **File**: `js/commands/item_duplicate.js` lines ~76-85
- **Defect**: When duplicating items, `item.on` (the host item id for piece-on-piece stacking from `js/stack.js`) is retained as-is:
  - If an item stacked on a table is duplicated with an offset, `item.on` still points to the original table. Whenever the original table moves, the duplicated item moves with it!
  - If both table and lamp are duplicated together, the duplicate lamp still points to the old table instead of the newly duplicated table.
- **Fix**: In `applyItemDuplicate`, track mapping from `source.id` to the newly created `item.id`. For each duplicated item: if `source.on != null`, if `source.on` was also duplicated in this operation, update `item.on = idMap.get(source.on)`; otherwise `delete item.on;`.

---

### Bug 3: `js/exports_pro.js` `toScheduleCSV` does not neutralize CSV formula injection
- **File**: `js/exports_pro.js` lines ~12, 74-80
- **Defect**: In `js/wall_schedule.js`, user-typed strings starting with `= + - @ \t \r` are prefixed with `'` to prevent spreadsheet formula injection. `js/exports_pro.js` has a local `csv(value)` helper that only escapes quotes, leaving formula characters unescaped.
- **Fix**: In `js/exports_pro.js`, update `csv(value)`: if `typeof value !== "number" && /^[=+\-@\t\r]/.test(s)`, prefix with `'` before quoting/returning.

---

### Bug 4: `js/room_area.js` `roomClearArea` aborts on any curved wall in whole project
- **File**: `js/room_area.js` lines ~26-30
- **Defect**:
  ```javascript
  for (const original of state.walls) {
    if (own.has(String(original.id))) continue;
    const wall = JSON.parse(JSON.stringify(original));
    const geom = wallCurveGeom(wall,state.nodes);
    if (!geom || geom.kind !== 'line') return {area:null,reason:'solids'};
  ```
  If ANY wall anywhere on the entire floor plan has `geom.kind !== 'line'` (or is curved), `roomClearArea` returns `{area:null, reason:'solids'}` for EVERY room, even if the curved wall is far away from the room!
- **Fix**: Only reject with `solids` if the wall intersects or touches `bounds`. Specifically, if `geom.kind !== 'line'`, check if the bounding box of the curve overlaps `bounds` (e.g. `center.x +/- radius` and `center.z +/- radius` or arc endpoints). If it does NOT overlap `bounds`, `continue`!

---

### Bug 5: `js/planning_units.js` `parseLength` silently falls back to default units on invalid unit suffix
- **File**: `js/planning_units.js` lines ~39-44
- **Defect**:
  ```javascript
  const unitValue=raw.match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z'"]+)?$/);
  if(!unitValue)return NaN;
  const amount=finiteNumber(unitValue[1]);
  if(!Number.isFinite(amount))return NaN;
  const unit=aliasUnit(unitValue[2])||fallback;
  return fromDisplayLength(amount,unit);
  ```
  If the user types an invalid unit suffix like `100km` or `50foo`, `unitValue[2]` is `"km"`. `aliasUnit("km")` returns `null`. Then `const unit = aliasUnit(unitValue[2]) || fallback;` falls back to `fallback` (e.g. `cm`) and returns `100`!
- **Fix**: If `unitValue[2]` is provided (non-empty), but `aliasUnit(unitValue[2])` is null/falsy, return `NaN`. Only use `fallback` when `!unitValue[2]`.

---

### Bug 6: `js/room_dock.js` & `js/room_graph.js` Arc check misses `w.curve` and `w.bulge`
- **Files**: `js/room_dock.js` line ~58, `js/room_graph.js` line ~101
- **Defect**: `straight()` and `dockFaces()` only check:
  `if (w.geometry && w.geometry.type === "arc") return;`
  In ModelForge, curved walls also store `w.curve` (e.g. `w.curve.type === "arc"`) and `w.bulge` (non-zero bulge). Ignoring these causes arc walls to be treated as straight chords, docking against or splitting curved walls improperly.
- **Fix**: In both places, check:
  `if ((w.geometry && w.geometry.type === "arc") || (w.curve && w.curve.type === "arc") || (w.bulge != null && Math.abs(w.bulge) > 1e-6)) return ...` (or `return null;` in `straight`).

---

### Bug 7: `js/commands/room_split.js` `roomSplitCommand.prepare` rejects split on any item/node in whole project
- **File**: `js/commands/room_split.js` line ~10
- **Defect**:
  ```javascript
  if(state.items.length||state.wallCons?.length||state.roomCons?.length||state.mep?.nodes?.length||state.mep?.runs?.length||state.slabOpenings?.length)return fail('SPLIT_CONTENTS');
  ```
  If there is even 1 item or 1 mep node anywhere in the entire house, `roomSplitCommand.prepare` rejects splitting any room with `SPLIT_CONTENTS`.
- **Fix**: Check only contents inside the target room:
  - Items inside the room: `state.items.some(it => pointInPolygon({x: it.x, z: it.z}, room.pts))`
  - Slab openings inside the room: `(state.slabOpenings || []).some(o => pointInPolygon({x: o.x, z: o.z}, room.pts))`
  - MEP nodes inside the room: `(state.mep?.nodes || []).some(n => pointInPolygon({x: n.x, z: n.z}, room.pts))`
  - Wall constraints on the room's walls: `const rWalls = new Set(room.key.split(',')); state.wallCons?.some(c => rWalls.has(String(c.wall)))`
  - Room constraints on the room: `state.roomCons?.some(c => c.room === room.key)`

---

### Bug 8: `js/commands/room_merge.js` `roomMergeCommand.apply` does not rollback state on topology failure
- **File**: `js/commands/room_merge.js` lines ~22-26
- **Defect**:
  ```javascript
  state.walls=state.walls.filter(w=>!p.shared.includes(String(w.id)));
  state.openings=state.openings.filter(o=>!p.openingIds.includes(o.id));
  const expected=...;
  const room=env.services.detectRooms().find(...);
  if(!room)return fail('MERGE_TOPOLOGY');
  ```
  If `detectRooms` fails to find the merged room, `apply` returns `fail('MERGE_TOPOLOGY')`, but `state.walls` and `state.openings` were already modified, permanently destroying the shared walls and openings without rolling back!
- **Fix**: Save `prevWalls = state.walls` and `prevOpenings = state.openings`. If `!room`, restore `state.walls = prevWalls; state.openings = prevOpenings;` before returning `fail('MERGE_TOPOLOGY')`.

---

### Bug 9: `js/plan_sync.js` `WALL_FIELDS` whitelist omits `curve`, `bulge`, `radius`, `cornerTreatment`
- **File**: `js/plan_sync.js` lines ~67-72
- **Defect**: When synchronizing walls over relay or sanitizing walls, `WALL_FIELDS` whitelists allowed properties. `curve`, `bulge`, `radius`, and `cornerTreatment` are missing from `WALL_FIELDS`. This causes curved walls and fillets to lose their curve data on multiplayer sync or sanitize.
- **Fix**: Add `"curve"`, `"bulge"`, `"radius"`, `"cornerTreatment"` to `WALL_FIELDS`.

---

### Bug 10: `js/plan_patterns.js` Global `patCache` leaks / shares patterns across different canvas contexts
- **File**: `js/plan_patterns.js` lines ~49-68
- **Defect**: `patCache` is a single global `Map` keyed by `cacheKey + "@" + level`. A `CanvasPattern` created in one canvas context (e.g. 2D view) is returned and reused on other canvas contexts (e.g. offscreen print canvas, sheet drawing), and `pat.setTransform` mutates the single shared pattern transform.
- **Fix**: Scope pattern caching by context using a `WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>` (or export `clearPatternCache()` and check context). Using `const patContextCache = new WeakMap();` ensures patterns are properly isolated per context.

---

### Bug 11: `js/pbr_material.js` Inverted tint check and uninitialized color
- **File**: `js/pbr_material.js` lines ~197-198
- **Defect**:
  ```javascript
  if (!entry.tint) mat.color.setHex(o.tint != null ? o.tint : 0xffffff);
  else if (o.tint != null) mat.color.setHex(o.tint);
  ```
  When `!entry.tint`, it sets tint! And when `entry.tint` is true, if `o.tint` is null/undefined, `mat.color` is never set, retaining whatever random previous color was on the material.
- **Fix**:
  ```javascript
  if (!entry.tint) mat.color.setHex(0xffffff);
  else mat.color.setHex(o.tint != null ? o.tint : 0xffffff);
  ```

---

### Bug 12: `js/pbr_material.js` `pbrSurfaceMaterial` sets metallic unconditionally on dielectric materials
- **File**: `js/pbr_material.js` lines ~282
- **Defect**: In `applyPbrMaps` (line 196): `mat.metalness = entry.metal > 0 ? 1 : 0;`. But in `pbrSurfaceMaterial` (line 282):
  `mat.metalnessNode = orm.b;`
  For non-metal materials (`entry.metal <= 0` or missing), any noise in the ORM blue channel causes dielectric surfaces (wood, drywall, tile) to render metallic in WebGPU.
- **Fix**: Set `mat.metalnessNode = entry.metal > 0 ? orm.b : T.float(0);` (using `T.float(0)` from `TSL`).

---

### Bug 13: `js/ui_layers.js` `selectableOn` omits openings and returns empty for structure/furniture
- **File**: `js/ui_layers.js` lines ~680-691
- **Defect**: In `selectableOn(id)`:
  ```javascript
  if (id === "structure")
    return (S.walls || []).filter(function (w) {
      return !hid.walls[w.id];
    });
  ```
  When the user selects the "structure" layer, it only returns walls, completely ignoring `S.openings` (which live on structure).
- **Fix**: Include visible openings when selecting structure:
  ```javascript
  if (id === "structure") {
    var ws = (S.walls || []).filter(function (w) { return !hid.walls[w.id]; });
    return ws;
  }
  ```
  Wait, if `selectLayer("structure")` calls `selectRefs(selectableOn(id), ...)`, `selectRefs` accepts one kind ("wall" or "walls"). But if `selectableOn` is queried, ensure `selectableOn` handles both or respects layer selection properly. In addition, ensure `id === "furniture"` properly handles furniture.

---

### Bug 14: `js/ui_layers.js` Selecting a user layer filters out faded items and does not filter out hidden room items
- **File**: `js/ui_layers.js` lines ~843-850
- **Defect**:
  ```javascript
  name.addEventListener("click", function () {
    selectRefs(
      itemsOnUserLayer(L.id).filter(function (it) {
        return !itemUserUnpickable(it);
      }),
      "item",
      "items",
    );
  });
  ```
  `itemUserUnpickable(it)` is true whenever `L.vis !== "show"`. If the user layer is faded (`vis: "fade"`), clicking the user layer in the layers panel filters out 100% of its items and flashes "No items to select"! Furthermore, items in hidden rooms are NOT filtered out because `hid = hiddenSets()` is not checked.
- **Fix**: In the user layer click handler, filter by `!hid.items[it.id]` (where `hid = hiddenSets()`) instead of `!itemUserUnpickable(it)`. If the layer's visibility is not `"hide"`, selecting from the layer panel should select the layer's items that are not in hidden rooms.

---

### Bug 15: `js/interaction.js` Group selection selects hidden and unpickable items
- **Files**: `js/interaction.js` lines ~3193 and ~5106
- **Defect**:
  ```javascript
  toSelect = S.items.filter(function (it) {
    return it.groupId === hi.groupId;
  });
  ```
  When clicking a grouped item, all items with that `groupId` are selected, even if they are in hidden rooms (`hid.items[it.id]`) or on hidden/faded user layers (`itemUserUnpickable(it)`).
- **Fix**: In both lines 3193 and 5106:
  ```javascript
  var hid = hiddenSets();
  toSelect = S.items.filter(function (it) {
    return it.groupId === hi.groupId && !hid.items[it.id] && !itemUserUnpickable(it);
  });
  ```

---

### Bug 16: `js/room_shapes.js` `shapePoints` rejects valid L-shaped rooms with arm >= min/2
- **File**: `js/room_shapes.js` line ~6
- **Defect**:
  ```javascript
  if(![x,z,width,depth,arm].every(Number.isFinite)||width<20||depth<20||arm<20||arm>=Math.min(width,depth)/2)return null;
  ```
  The condition `arm >= Math.min(width, depth) / 2` applies only to 'U' shapes (which have two arms). For an 'L' shape, having an arm of 180cm in a 400x300cm room is completely valid (`arm < min(width, depth)`), but line 6 rejects any arm >= 150cm!
- **Fix**: Check `arm` based on shape type:
  - For 'L': `arm >= Math.min(width, depth) - 20` (minimum remaining leg width 20)
  - For 'U': `arm * 2 >= width - 20 || arm >= depth - 20`
  - For 'T': `arm >= width - 40 || arm >= depth - 20`

---

### Bug 17: `server/relay.mjs` `toCode` disallows replies unless sender watches recipient
- **File**: `server/relay.mjs` lines ~707-710
- **Defect**:
  ```javascript
  function toCode(sender, code, obj) {
    const c = [...clients].find((c) => c.code === code);
    if (c && ((sender.room && c.room === sender.room) || sender.watch.has(code))) sendObj(c, obj);
  }
  ```
  If client A watches client B and sends a message to B, client B cannot reply to A unless client B also explicitly watches A or they are in the same room.
- **Fix**: Allow message delivery if `sender.watch.has(code) || c.watch.has(sender.code)`.

---

### Bug 18: `js/slab_openings.js` `holesForRoom` drops stair voids whose center falls on boundary walls
- **File**: `js/slab_openings.js` line ~127
- **Defect**: `pointInPoly(o.x, o.z, roomPts)` returns false for points exactly on the boundary segment between rooms due to strict ray casting inequalities. When a stair void is placed on the dividing wall, neither room cuts the hole.
- **Fix**: In `holesForRoom`, test `pointInPoly(o.x, o.z, roomPts)` with a boundary check or check opening corners: if `pointInPoly(o.x, o.z, roomPts)` is false, check if `pointInPoly(o.x + 0.1, o.z + 0.1, roomPts)` or `pointInPoly(o.x - 0.1, o.z - 0.1, roomPts)` or any corner of `openingCorners(o)` is inside `roomPts`.

---

### Bug 19: `js/drawing_export.js` Hardcodes `' cm'` in room dimension text, ignoring `fmt`
- **File**: `js/drawing_export.js` lines ~19 and ~38
- **Defect**:
  - In `drawingDXF`, exterior dimensions support `{ fmt }`, but room dimension text hardcodes `' cm'` on line 38:
    `text(Number(room.width.toFixed(2))+' x '+Number(room.depth.toFixed(2))+' cm', ...)`
  - In `drawingSVG`, options do not accept `fmt` and hardcode `' cm'` on line 19.
- **Fix**: In `drawingDXF`, if `fmt` is provided, format as `${fmt(room.width)} x ${fmt(room.depth)}`; otherwise default to `${Number(room.width.toFixed(2))} x ${Number(room.depth.toFixed(2))} cm`. In `drawingSVG`, accept `{ fmt = null }` and use it if provided.

---

### Bug 20: `js/room_cons.js` `solveRoomRect` quadrant signs collapse skewed quads and move locked nodes
- **File**: `js/room_cons.js` lines ~261-270
- **Defect**:
  ```javascript
  for (var k = 0; k < 4; k++) {
    var su = u[k] >= 0 ? 1 : -1, sv = v[k] >= 0 ? 1 : -1;
    var wantX = cx + ux * su * halfU + nx * sv * halfV,
      wantZ = cz + uz * su * halfU + nz * sv * halfV;
    var node = S.nodes[nidx[k]];
    if (!node) continue;
  ```
  1. `node.locked` is never checked. If a corner node is pinned, `solveRoomRect` moves it anyway.
  2. If the room is rotated or skewed relative to the reference edge, two vertices can have the same sign of `u` and `v`, collapsing both vertices to the exact same point!
- **Fix**: Check `if (!node || node.locked) continue;`. Order the 4 target corners along the cycle `(k = 0, 1, 2, 3)` using the cyclic corner signs `[{su: -1, sv: -1}, {su: 1, sv: -1}, {su: 1, sv: 1}, {su: -1, sv: 1}]` mapped to the closest matching cycle orientation or preserve cycle order.
