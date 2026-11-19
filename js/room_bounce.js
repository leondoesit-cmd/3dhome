import { holesForRoom } from "./slab_openings.js";
import { FILL2D, FLOOR, WALLC, WOOD } from "./state.js";
import { wallCurveGeom, pointAtWall, tangentAtWall, verticalSegments } from "./wall_curves.js";
import { wallLayerBands } from "./wall_types.js";
import { openingTransmittance, clearWindowSize } from "./view3d/backdrop.js";
/* ---- light that bounces: the room fills itself ----
   A real room is lit mostly by light that has already hit something: the sky
   through the window and the lamps land on the floor and walls, which pass
   about half of it on, again and again, into every corner. Pro interior
   renderers spend their global illumination on exactly that. Without it a
   room under its ceiling got only the window spots and the sky map, and from
   above (the dollhouse cut) read as dark grey boxes.

   The stand-in here is the lighting designer's split-flux (lumen-method)
   interreflection: the flux Φ that ENTERS a room through its windows and from
   its lamps, on interior surfaces of area A with mean reflectance ρ, settles
   into an indirect irradiance of Φ·ρ / (A·(1−ρ)), spread evenly over the
   room. Each colour channel has its own area-weighted reflectance. Rooms
   exchange diffuse flux only through the transmissive area of a shared
   opening; a sealed, unlit room stays dark.

   On the GPU it is ONE light for the whole house: a custom light node that
   adds the irradiance of the room each fragment sits in, read from a map of
   the plan (one texel ≈ a few cm) and a per-room strip of that same atlas.
   Point lights per room could not stop at a
   wall (their range is a sphere, and a sphere that fills the corners crosses
   the walls), cost every pixel one more light each, and toggling one changed
   the light set every material's shader is keyed on — the whole house
   recompiled. This light is always on and never casts, so the light set never
   changes; refitting only rewrites the map.

   The first half of this module is plain arithmetic, so Node tests can check
   it; createRoomBounce builds the three.js part once three has loaded. */
import { pointInPoly } from "./geometry.js";
import { wallPathVisibility } from "./light_loop.js";

export var GRID = 512; // fixed spatial resolution across room and light edits
var PAD_CM = 40; // margin round the house: the map's edge texels are "outside"
/* Storeys the map holds, one GRID x GRID layer each, stacked along the
   texture's height: the active storey in layer 0, the whole-house view's
   other storeys (js/view3d/floor_stack.js) above it. Rooms of different
   storeys share a plan position, so one 2D map gave a storey the light of the
   rooms over or under it: lamps lit through the slabs, and a storey shown for
   context (its own lights stripped) was as dark as the room above it. */
export var STOREY_LAYERS = 4;
// One irradiance record per possible Uint16 index, beside the plan layer.
// Both texture axes stay inside WebGL2's 2048-pixel guaranteed minimum.
export const ROOM_ATLAS_WIDTH = GRID + 65536 / GRID;
const SLAB_EPS_CM = 0.002;

/* Share the available samplers between daylight openings and fixtures. The
   layout determines the casters, so changing the hour only changes energy. */
export function selectShadowCasters(candidates, slots) {
  const casting = new Set();
  function take(entry) {
    if (entry && casting.size < slots) casting.add(entry.l);
  }
  candidates.filter(c => c.rank === 0).forEach(take);
  function ordered(kind) {
    const rooms = new Set(), first = [], rest = [];
    const entries = candidates.filter(c => c.kind === kind && c.rank !== 0)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.size - a.size);
    // Daylight benefits from covering separate openings. A fixture's shade
    // and the furniture below it both need its own map, even when another
    // fixture in that room already has one.
    if (kind === "lamp") return entries;
    for (const entry of entries) {
      (rooms.has(entry.room) ? rest : first).push(entry);
      rooms.add(entry.room);
    }
    return first.concat(rest);
  }
  const windows = ordered("window"), lamps = ordered("lamp");
  for (let i = 0; i < Math.max(windows.length, lamps.length) && casting.size < slots; i++) {
    take(lamps[i]);
    take(windows[i]);
  }
  return casting;
}

/* Luminous flux of three's lights, in the units of their intensity (candela
   against centimetre throws: irradiance = I / d²). A spot's cone fades by a
   smoothstep from cos(angle·(1−penumbra)) out to cos(angle); the smoothstep
   averages ½ over its band. */
export function pointFlux(I) {
  return 4 * Math.PI * Math.max(0, I || 0);
}
export function spotFlux(I, angle, penumbra) {
  var outer = Math.cos(angle),
    inner = Math.cos(angle * (1 - Math.min(1, Math.max(0, penumbra || 0))));
  return 2 * Math.PI * Math.max(0, I || 0) * (1 - inner + 0.5 * (inner - outer));
}

export function roomArea(pts) {
  var a = 0;
  for (var i = 0, n = pts.length; i < n; i++) {
    var p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}
function perimeter(pts) {
  var s = 0;
  for (var i = 0, n = pts.length; i < n; i++) {
    var p = pts[i], q = pts[(i + 1) % n];
    s += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return s;
}
/* floor + ceiling + walls: every surface the light bounces between */
export function roomSurface(room, wallH) {
  return 2 * roomArea(room.pts) + perimeter(room.pts) * (room.ceilH || wallH || 250);
}
export function splitFluxIrradiance(flux, surface, rho) {
  if (!(flux > 0) || !(surface > 0)) return 0;
  return (flux * rho) / (surface * (1 - rho));
}

/* Which room each texel of the plan belongs to: 0 outside, i + 1 for
   rooms[i]. Even-odd scanline fill, one row at a time (a point-in-polygon
   test per texel was ~20 M edge tests for a flat). Square texels over the
   padded bounds of every room, so the shader maps x and z the same way.
   `bounds` (planBounds) puts several storeys' maps on one square. */
export function planBounds(roomLists) {
  var minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  roomLists.forEach(function (rooms) {
    rooms.forEach(function (r) {
      r.pts.forEach(function (p) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });
    });
  });
  if (!isFinite(minX)) return null;
  var span = Math.max(maxX - minX, maxZ - minZ) + 2 * PAD_CM;
  return { x0: (minX + maxX) / 2 - span / 2, z0: (minZ + maxZ) / 2 - span / 2, span: span };
}
export function rasterRooms(rooms, size, bounds) {
  size = size || GRID;
  var index = new Uint16Array(size * size);
  var b = bounds || planBounds([rooms]);
  if (!rooms.length || !b) return { size: size, x0: b ? b.x0 : 0, z0: b ? b.z0 : 0, cell: b ? b.span / size : 1, index: index };
  var cell = b.span / size;
  var x0 = b.x0, z0 = b.z0;
  var xs = [];
  rooms.forEach(function (r, ri) {
    var pts = r.pts, n = pts.length;
    for (var j = 0; j < size; j++) {
      var z = z0 + (j + 0.5) * cell;
      xs.length = 0;
      for (var a = 0, b = n - 1; a < n; b = a++) {
        var p = pts[a], q = pts[b];
        if ((p.z > z) !== (q.z > z)) xs.push(p.x + ((z - p.z) * (q.x - p.x)) / (q.z - p.z));
      }
      if (xs.length < 2) continue;
      xs.sort(function (u, v) { return u - v; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)),
          i1 = Math.min(size - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
        for (var i = i0; i <= i1; i++) index[j * size + i] = ri + 1;
      }
    }
  });
  return { size: size, x0: x0, z0: z0, cell: cell, index: index };
}
/* the room (index into the rasterised list) at a plan point, or -1 */
export function roomAt(grid, x, z) {
  var i = Math.floor((x - grid.x0) / grid.cell),
    j = Math.floor((z - grid.z0) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.size || j >= grid.size) return -1;
  return grid.index[j * grid.size + i] - 1;
}

/* Indirect irradiance per room, as linear RGB. `sources` are the lights that
   put flux into the house: { x, z, flux, color: [r, g, b] }; a source counts
   for the room it stands in (none outside every room). The scalar form
   describes a monochrome sealed enclosure. The planner passes measured
   finishes and any diffuse exchange paths between its enclosures. */
export function roomIrradiance(rooms, sources, rho, wallH) {
  var flux = rooms.map(function () { return [0, 0, 0]; });
  sources.forEach(function (s) {
    if (!(s.flux > 0)) return;
    for (var i = 0; i < rooms.length; i++) {
      if (!pointInPoly(s.x, s.z, rooms[i].pts)) continue;
      var c = s.color || [1, 1, 1];
      flux[i][0] += s.flux * c[0];
      flux[i][1] += s.flux * c[1];
      flux[i][2] += s.flux * c[2];
      return;
    }
  });
  if (!Array.isArray(rho)) return rooms.map(function (r, i) {
    return flux[i].map(function (f) { return splitFluxIrradiance(f, roomSurface(r, wallH), rho); });
  });
  // Sum local re-reflections analytically. A diffuse field E sends E * a
  // through a portal of effective area a. Only reflected light seeds this
  // solve: direct lights already project their primary rays through doors.
  var local = flux.map((rgb, i) => rgb.map((f, c) =>
    splitFluxIrradiance(f, rho[i].area, rho[i].rho[c])));
  var field = local;
  if (!rho.some(finish => finish.portals?.length)) return field;
  for (var pass = 0; pass < 64; pass++) {
    var next = local.map(rgb => rgb.slice()), maxChange = 0, peak = 0;
    rho.forEach(function (finish, i) {
      for (var portal of finish.portals || []) {
        var j = portal.room, receiver = rho[j];
        for (var c = 0; c < 3; c++)
          next[j][c] += field[i][c] * portal.area / (receiver.area * (1 - receiver.rho[c]));
      }
    });
    next.forEach(function (rgb, i) {
      for (var c = 0; c < 3; c++) {
        peak = Math.max(peak, rgb[c]);
        maxChange = Math.max(maxChange, Math.abs(rgb[c] - field[i][c]));
      }
    });
    field = next;
    if (maxChange <= peak * 1e-7) break;
  }
  return field;
}

/* An unfinished room often has neither windows nor lamps. In the daylight
   dollhouse editor its hidden ceiling must not make finishes impossible to
   inspect. This is a view-only irradiance floor, never a physical source:
   walkthroughs, night views and covered models keep the physical lighting. */
export function roomInspectionFill({ walk, showCeiling, covered, daylight, physicalMode }) {
  if (walk || showCeiling || covered || physicalMode) return 0;
  return 0.35 * Math.max(0, Math.min(1, Number(daylight) || 0));
}

/* ---- the same map stops the lights that cannot cast ----
   A light with a shadow map is stopped by the walls it sees. One without is a
   sphere: it lit the room behind a partition as brightly as its own (a floor
   lamp beside a wall lit a sealed bedroom at night). The sky was worse: the
   environment map and the hemisphere light reach every surface, so a room
   with no window was lit through its hidden ceiling. The plan map also holds,
   per texel, which room it is (0 outside every room), and the GPU half reads
   it per fragment, just as the bounce does:
     - a light that does not cast lights only the surfaces of its own room
       (a light outside every room, only what is outside);
     - the sky lights only what is outside every room or above the ceilings,
       and so does the sun while it has no shadow map (shadows off).
   A surface's room is read a little way out along its normal, so the two
   faces of a wall belong to the two sides they face. Both rules only ever
   take light away where a wall or a ceiling stands; daylight still comes in
   through the windows, carried by the window spots and the bounce. */
export var NORMAL_REACH_CM = 2; // maximum nudge, well inside ordinary wall thickness
export var UNMASKED = -1; // a light that casts: its shadow map stops it at the walls
export var SKY_ONLY = -2; // a light from the sky: it reaches what the sky reaches

/* the room number (rooms[i] -> i + 1, 0 outside every room) at a plan point */
export function roomNumberAt(rooms, x, z) {
  for (var i = 0; i < rooms.length; i++) if (pointInPoly(x, z, rooms[i].pts)) return i + 1;
  return 0;
}
/* the room whose surfaces a light may reach: its own, or any if it casts */
export function lightMaskRoom(rooms, x, z, casts) {
  return casts ? UNMASKED : roomNumberAt(rooms, x, z);
}
/* the room number the map gives a surface at (x, z) facing along (nx, nz) */
export function facingRoom(grid, x, z, nx, nz) {
  var reach = Math.min(grid.cell, NORMAL_REACH_CM);
  return roomAt(grid, x + (nx || 0) * reach, z + (nz || 0) * reach) + 1;
}
/* the two rules the shaders below apply per fragment: is the surface under
   the open sky, and does a light with this mask room reach it */
export function skyAdmits(room, y, ny, ceilTop) {
  const eps = Math.max(SLAB_EPS_CM, ceilTop * 2e-6);
  return room === 0 || y > ceilTop + eps || (y >= ceilTop - eps && ny > 0);
}
// The facing normal distinguishes the two surfaces coincident at a slab.
// Below the floor is exterior for practicals, but still under cover for sky.
export function volumeRoom(room, y, ny, top) {
  return skyAdmits(room, y, ny, top) || y < -SLAB_EPS_CM ||
    (y <= SLAB_EPS_CM && ny < 0) ? 0 : room;
}
/* The mask a light gets in ONE renderer. A light that casts is left to its
   shadow map (UNMASKED), but only where that map is drawn: a renderer with
   shadows off (the inspector preview) would let it through every wall, so
   there it falls back to the mask it would have without a shadow. */
export function effectiveMaskRoom(maskRoom, unshadowed, shadowedHere) {
  if (maskRoom === UNMASKED && !shadowedHere && unshadowed != null) return unshadowed;
  return maskRoom == null ? UNMASKED : maskRoom;
}
/* the mask room a light's shader factor uses this render: its own rule,
   with "casts" meaning it casts here (see effectiveMaskRoom). The stock
   light nodes below and js/light_loop.js both take it from here. */
export function lightMaskFor(light, renderer) {
  var ud = light.userData || {};
  var shadowedHere = !!(light.castShadow && renderer && renderer.shadowMap && renderer.shadowMap.enabled);
  return effectiveMaskRoom(ud.maskRoom, ud.maskRoomUnshadowed, shadowedHere);
}
export function maskAdmits(maskRoom, room, underSky) {
  if (maskRoom === SKY_ONLY) return !!underSky;
  return maskRoom === UNMASKED || maskRoom === room;
}
/* the highest ceiling: a surface above it is under the open sky */
export function ceilingTop(rooms, wallH) {
  var top = 0;
  rooms.forEach(function (r) { top = Math.max(top, r.ceilH || wallH || 250); });
  return top || wallH || 250;
}
/* Standalone dense plan export: RGB the room's bounce irradiance, A its
   room number. The GPU atlas below uses separate plan and field records.
   base: the number before this storey's first room (rooms are numbered
   across every storey, so a lamp's mask never matches a room on another
   storey); offset: the first texel of this storey's layer. */
export function packPlanMap(grid, perRoom, toHalf, out, base, offset) {
  var zero = toHalf(0), idx = grid.index;
  base = base || 0;
  offset = offset || 0;
  var texel = perRoom.map(function (e, i) { return [toHalf(e[0]), toHalf(e[1]), toHalf(e[2]), toHalf(base + i + 1)]; });
  for (var t = 0, n = idx.length; t < n; t++) {
    var h = idx[t] ? texel[idx[t] - 1] : null, o = (offset + t) * 4;
    out[o] = h ? h[0] : zero;
    out[o + 1] = h ? h[1] : zero;
    out[o + 2] = h ? h[2] : zero;
    out[o + 3] = h ? h[3] : zero;
  }
  return out;
}

// The GPU atlas separates plan geometry from the irradiance it indexes.
// Two exact bytes encode the Uint16 room ID. A split height retains the
// sub-millimetre accuracy needed to classify an arbitrary-height slab.
export function packRoomGeometry(grid, rooms, wallH, data, layer, toHalf, width = ROOM_ATLAS_WIDTH) {
  const offset = layer * GRID * width;
  const records = rooms.map((room, i) => {
    const h = room.ceilH || wallH || 250;
    const step = 2 ** Math.max(0, Math.floor(Math.log2(h)) - 10);
    const hi = Math.floor(h / step) * step;
    return [(i + 1) % 256, Math.floor((i + 1) / 256), hi / 4, h - hi].map(toHalf);
  });
  for (let t = 0; t < grid.index.length; t++) {
    const id = grid.index[t];
    if (!id) continue; // atlas cleared when the layout changes
    const k = offset + Math.floor(t / grid.size) * width + t % grid.size;
    data.set(records[id - 1], 4 * k);
  }
}

export function packRoomFields(rgb, data, layer, toHalf, width = ROOM_ATLAS_WIDTH, regions) {
  const startRow = layer * GRID;
  let minX = width, maxX = -1, minY = startRow + GRID, maxY = -1;
  rgb.forEach((color, i) => {
    const room = i + 1, x = GRID + Math.floor(room / GRID), y = startRow + room % GRID;
    const k = 4 * (y * width + x);
    let changed = false;
    for (let c = 0; c < 3; c++) {
      const half = toHalf(color[c]);
      if (data[k + c] !== half) { data[k + c] = half; changed = true; }
    }
    if (changed) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  });
  if (maxX < 0) return false;
  if (regions) regions.push({x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1});
  return true;
}

/* ---- the three.js half ----
   opts.masks(): false while a game's own grade holds the view (lava glowing
   up from the floors), which turns both masks off. */
export function createRoomBounce(THREE, TSL, opts) {
  opts = opts || {};
  var data = new Uint16Array(ROOM_ATLAS_WIDTH * GRID * STOREY_LAYERS * 4);
  var map = new THREE.DataTexture(data, ROOM_ATLAS_WIDTH, GRID * STOREY_LAYERS, THREE.RGBAFormat, THREE.HalfFloatType);
  // nearest: the plan holds room numbers, and a blend of rooms 3 and 5 would
  // read as room 4 (the irradiance is one value per room anyway)
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.generateMipmaps = false;
  map.colorSpace = THREE.NoColorSpace; // irradiance, already linear
  // Only these RGB edits describe a delta from the immediately preceding
  // texture version. A changed room map or wall atlas needs a full transfer.
  map.plannerRoomAtlas = { version: -1, regions: [] };
  map.needsUpdate = true;
  var origin = TSL.uniform(new THREE.Vector2(0, 0));
  var span = TSL.uniform(1);
  var atlasWidth = TSL.uniform(ROOM_ATLAS_WIDTH);
  var pathCounts = TSL.uniform(new THREE.Vector4());
  pathCounts.value.setScalar(0);
  /* Where a mesh sits in the map, per object: x its storey's layer, y that
     storey's level, z the number of rooms in preceding layers, w 1 inside the map or 0
     "outside every room". Untagged meshes are the active storey's; a
     whole-house storey shares one vector per storey (userData.lightPlace),
     and the dollhouse cut's wall caps are outside (CUT_CAP_PLACE): a cap is
     a drawing convention, and the room outlines run down the wall centre
     lines, so a cap read half room light and half sky (two tones). */
  var activePlace = new THREE.Vector4(0, 0, 0, 1);
  var place = TSL.uniform(activePlace).onObjectUpdate(function (frame) {
    var ud = frame.object && frame.object.userData;
    return (ud && ud.lightPlace) || activePlace;
  });
  var masksOn = TSL.uniform(1).onRenderUpdate(function () { return opts.masks && !opts.masks() ? 0 : 1; });
  var inspection = TSL.uniform(0).onRenderUpdate(function () {
    return opts.inspection ? opts.inspection() : 0;
  });
  var one = TSL.float(1);

  // every read is the same texture, so a material binds it once; always mip
  // 0, which the environment pass would otherwise replace with its roughness
  // level (the map has no other mips: they read as "outside every room").
  // ONE node for every light: three emits a node once per shader however
  // often it is used, where a fresh node per light re-read the map (and
  // redid its arithmetic) two or three times for every light in the house.
  var planTexelNode = null, localRoomNode = null, roomNumberNode = null, underSkyNode = null;
  // Classify the visible side of the physical triangle. Bump/normal maps
  // change the reflection direction, but cannot move plaster across a wall.
  var faceNormal = TSL.normalFlat.transformNormalByInverseViewMatrix(TSL.cameraViewMatrix);
  var edge = 0.5 / GRID;
  function planTexel() {
    if (!planTexelNode) {
      var reach = TSL.min(span.div(GRID), NORMAL_REACH_CM);
      var p = TSL.positionWorld.xz.add(faceNormal.xz.mul(reach));
      var uv = p.sub(origin).div(span);
      // its storey's layer; clamped so a read never strays into the next one
      var v = TSL.clamp(uv.y, edge, 1 - edge).add(place.x).div(STOREY_LAYERS);
      var u = TSL.clamp(uv.x, edge, 1 - edge).mul(GRID).div(atlasWidth);
      planTexelNode = TSL.texture(map, TSL.vec2(u, v)).level(0);
    }
    return planTexelNode;
  }
  function localRoom() {
    var plan = planTexel();
    if (!localRoomNode) localRoomNode = plan.r.add(plan.g.mul(256)).mul(place.w);
    return localRoomNode;
  }
  function roomFieldTexel(local) {
    var u = local.div(GRID).floor().add(GRID + 0.5).div(atlasWidth);
    var v = local.mod(GRID).add(0.5).div(GRID).add(place.x).div(STOREY_LAYERS);
    return TSL.texture(map, TSL.vec2(u, v)).level(0);
  }
  // A plan index describes x/z. Resolve both sides of the floor and roof
  // before comparing room masks or fetching a room's bounced irradiance.
  function roomNumber() {
    if (!roomNumberNode) {
      var y = TSL.positionWorld.y.sub(place.y);
      var below = y.lessThan(-SLAB_EPS_CM).or(y.lessThanEqual(SLAB_EPS_CM).and(faceNormal.y.lessThan(0)));
      roomNumberNode = TSL.select(below.or(underSky().greaterThan(0.5)), 0, localRoom().add(place.z));
    }
    return roomNumberNode;
  }
  function masked(open) {
    return one.sub(masksOn.mul(one.sub(open)));
  }
  // 1 where the sky reaches the fragment (skyAdmits), 0 under a ceiling
  function underSky() {
    if (!underSkyNode) {
      var inRoom = TSL.step(0.5, localRoom());
      var y = TSL.positionWorld.y.sub(place.y);
      var plan = planTexel(), top = plan.b.mul(4).add(plan.a);
      var eps = top.mul(2e-6).max(SLAB_EPS_CM);
      var above = TSL.select(y.greaterThan(top.add(eps)).or(
        y.greaterThanEqual(top.sub(eps)).and(faceNormal.y.greaterThan(0))), 1, 0);
      underSkyNode = TSL.max(one.sub(inRoom), above);
    }
    return underSkyNode;
  }
  function skyOpen() {
    return masked(underSky());
  }
  // 1 where a light with this mask room reaches the fragment (maskAdmits)
  const pathRecordUV = TSL.Fn(([index, width, layer]) => {
    const u = index.div(GRID).floor().add(ROOM_ATLAS_WIDTH + 0.5).div(width);
    const v = index.mod(GRID).add(0.5).div(GRID).add(layer).div(STOREY_LAYERS);
    return TSL.vec2(u, v);
  }).setLayout({name: "plannerPathRecordUV", type: "vec2", inputs: [
    {name: "recordIndex", type: "float"}, {name: "width", type: "float"}, {name: "layer", type: "float"},
  ]});
  function readPathRecord(index) {
    var count = pathCounts.element(place.x.toInt());
    return TSL.select(index.lessThan(count).and(index.greaterThanEqual(0)),
      TSL.texture(map, pathRecordUV(index, atlasWidth, place.x)).level(0), TSL.vec4(0));
  }
  var pathHeaderNode;
  function pathHeader() {
    if (!pathHeaderNode) {
      var local = TSL.select(roomNumber().greaterThan(0), localRoom(), 0);
      pathHeaderNode = readPathRecord(local).toVar("plannerWallHeader");
    }
    return pathHeaderNode;
  }
  function lightOpen(maskRoom, emitter) {
    var sky = one.sub(TSL.step(SKY_ONLY + 0.5, maskRoom));
    var any = TSL.step(SKY_ONLY + 0.5, maskRoom).mul(one.sub(TSL.step(UNMASKED + 0.5, maskRoom)));
    var same = one.sub(TSL.step(0.5, TSL.abs(roomNumber().sub(maskRoom))));
    var open = TSL.max(TSL.max(any, same), sky.mul(underSky()));
    if (emitter) {
      var header = pathHeader();
      var path = TSL.Fn(() => {
        var visible = TSL.float(1).toVar();
        var hasSpans = header.b.add(header.a).greaterThan(0);
        TSL.If(maskRoom.greaterThanEqual(0).and(same.greaterThan(0.5)).and(hasSpans), () => {
          var local = TSL.select(roomNumber().greaterThan(0), localRoom(), 0);
          visible.assign(wallPathVisibility(TSL, readPathRecord, local, TSL.positionWorld, emitter, place.y, header));
        });
        return visible;
      })();
      open = open.mul(path);
    }
    return masked(open);
  }
  const { maskedLightNode, SkyHemisphereLightNode } = createMaskedLightClasses(TSL, lightOpen, THREE);

  class RoomBounceLight extends THREE.Light {
    constructor() {
      super(0xffffff, 1);
      this.isRoomBounceLight = true;
      this.type = "RoomBounceLight";
    }
  }
  class RoomBounceLightNode extends THREE.AnalyticLightNode {
    static get type() {
      return "RoomBounceLightNode";
    }
    setup(builder) {
      var room = roomNumber(), local = TSL.select(room.greaterThan(0), localRoom(), 0);
      var texel = roomFieldTexel(local);
      // Only room interiors receive the editor fill; keep the outdoor rig and
      // every brighter room unchanged. No extra light or shader variants.
      var fill = inspection.mul(TSL.step(0.5, room));
      builder.context.irradiance.addAssign(this.colorNode.mul(TSL.max(texel.rgb, TSL.vec3(fill))));
    }
  }

  var light = new RoomBounceLight();
  light.userData.bounce = true; // exporters skip it: Blender does its own GI
  var grid = rasterRooms([]), rooms = [], storeys = [];

  return {
    light: light,
    register: function (renderer) {
      renderer.library.addLight(RoomBounceLightNode, RoomBounceLight);
      // the stock classes are already in this renderer's library and
      // addLight will not redefine one; a light with no mask room set
      // (anything a game adds) renders exactly as the stock node
      var nodes = renderer.library.lightNodes;
      nodes.set(THREE.PointLight, maskedLightNode(THREE.PointLightNode));
      nodes.set(THREE.SpotLight, maskedLightNode(THREE.SpotLightNode));
      nodes.set(THREE.DirectionalLight, maskedLightNode(THREE.DirectionalLightNode));
      nodes.set(THREE.HemisphereLight, SkyHemisphereLightNode);
    },
    /* The scene's environment, stopped at the ceilings: the PMREM three
       makes of scene.environment, times skyOpen. A getter, so a game that
       nulls scene.environment for its own grade still turns it off, and a
       new sky texture swaps into the same node. */
    confineSky: function (scene) {
      var pmrem = null, node = null;
      Object.defineProperty(scene, "environmentNode", {
        configurable: true,
        get: function () {
          var env = scene.environment;
          if (!env || !env.isTexture) return null;
          if (!pmrem) {
            pmrem = TSL.pmremTexture(env);
            node = pmrem.mul(skyOpen());
          } else if (pmrem.value !== env) pmrem.value = env;
          return node;
        },
      });
    },
    /* the rooms whose light it carries; the map follows on the next fit.
       stacked: the whole-house view's other storeys, { rooms, wallH, dy,
       place } (place: the Vector4 its meshes carry as userData.lightPlace),
       each in a layer of its own; past the last layer a storey reads as
       outside every room, as all of them did before. */
    setRooms: function (shown, wallH, stacked) {
      rooms = shown;
      stacked = stacked || [];
      var held = stacked.slice(0, STOREY_LAYERS - 1);
      var b = planBounds([shown].concat(held.map(function (s) { return s.rooms; })));
      grid = rasterRooms(shown, GRID, b);
      origin.value.set(grid.x0, grid.z0);
      span.value = grid.cell * grid.size;
      activePlace.set(0, 0, 0, 1);
      data.fill(0);
      map.needsUpdate = true;
      pathCounts.value.setScalar(0);
      packRoomGeometry(grid, rooms, wallH, data, 0, THREE.DataUtils.toHalfFloat, atlasWidth.value);
      var base = shown.length;
      storeys = held.map(function (s, k) {
        s.place.set(k + 1, s.dy, base, 1);
        var entry = { rooms: s.rooms, grid: rasterRooms(s.rooms, GRID, b), base: base };
        packRoomGeometry(entry.grid, s.rooms, s.wallH, data, k + 1, THREE.DataUtils.toHalfFloat, atlasWidth.value);
        base += s.rooms.length;
        return entry;
      });
      stacked.slice(STOREY_LAYERS - 1).forEach(function (s) { s.place.set(0, s.dy, 0, 0); });
    },
    /* what js/light_loop.js needs to mask the lights it draws exactly as
       maskedLightNode does: the mask room this renderer would use, the
       shader factor, and the map reads to make once before its loop */
    loopMasks: {
      maskRoom: lightMaskFor,
      lightOpen: function (maskRoom, emitter) {
        return lightOpen(maskRoom, emitter);
      },
      hoist: function () {
        return [planTexel(), roomNumber(), underSky(), pathHeader()];
      },
    },
    /* the active storey's rooms, in order: a light's mask room indexes them */
    rooms: function () {
      return rooms;
    },
    // A storey's blocker records occupy extra columns of the same texture.
    // Only growth allocates storage. Edits within capacity touch only the
    // records; the live counts exclude any stale tail after a shorter edit.
    setPathRecords: function (lists) {
      var oldWidth = atlasWidth.value, width = oldWidth, height = GRID * STOREY_LAYERS;
      let changed = false;
      for (let layer = 0; layer < STOREY_LAYERS; layer++) {
        const n = (lists[layer]?.length || 0) / 4;
        pathCounts.value.setComponent(layer, n);
        width = Math.max(width, ROOM_ATLAS_WIDTH + Math.ceil(n / GRID));
      }
      if (width !== oldWidth) {
        changed = true;
        const grown = new Uint16Array(width * height * 4);
        for (let row = 0; row < height; row++) {
          const start = row * oldWidth * 4;
          grown.set(data.subarray(start, start + ROOM_ATLAS_WIDTH * 4), row * width * 4);
        }
        data = grown;
        map.dispose(); // immutable GPU storage must be reallocated on resize
        map.image = {data, width, height};
        atlasWidth.value = width;
      }
      for (let layer = 0; layer < STOREY_LAYERS; layer++) {
        const list = lists[layer];
        if (!list) continue;
        for (let i = 0; i < list.length / 4; i++) {
          const row = layer * GRID + i % GRID, col = ROOM_ATLAS_WIDTH + Math.floor(i / GRID);
          const dst = (row * width + col) * 4;
          for (let c = 0; c < 4; c++) {
            const half = THREE.DataUtils.toHalfFloat(list[4 * i + c]);
            if (data[dst + c] !== half) { data[dst + c] = half; changed = true; }
          }
        }
      }
      if (changed) map.needsUpdate = true;
    },
    /* irradiance per room (linear RGB), in the order given to setRooms;
       stackedPerRoom: the same for each stacked storey, in its order */
    setIrradiance: function (perRoom, stackedPerRoom) {
      var toHalf = THREE.DataUtils.toHalfFloat;
      const regions = [];
      packRoomFields(perRoom, data, 0, toHalf, atlasWidth.value, regions);
      storeys.forEach(function (s, k) {
        var e = (stackedPerRoom && stackedPerRoom[k]) || s.rooms.map(function () { return [0, 0, 0]; });
        packRoomFields(e, data, k + 1, toHalf, atlasWidth.value, regions);
      });
      if (regions.length) {
        map.needsUpdate = true;
        map.plannerRoomAtlas = { version: map.version, regions };
      }
      light.userData.irradiance = perRoom; // for inspection from the console
    },
  };
}

// lifted out of createRoomBounce()
function createMaskedLightClasses(TSL, lightOpen, THREE) {
  // One shader function for all finite emitters. Positions, mask-adjusted
  // colour and optical parameters come from the calling light.
  const emitterColor = TSL.Fn(([color, delta, hemisphere, radiusSq]) => {
    const d2 = delta.dot(delta).max(0.0001);
    const elevation = delta.y.negate().div(d2.sqrt());
    const lobe = TSL.select(hemisphere.abs().greaterThan(0.5), elevation.mul(hemisphere).max(0), 1);
    return color.mul(lobe).mul(d2.div(d2.add(radiusSq)));
  }).setLayout({name: "plannerEmitterColor", type: "vec3", inputs: [
    {name: "radiance", type: "vec3"}, {name: "delta", type: "vec3"},
    {name: "hemisphere", type: "float"}, {name: "radiusSq", type: "float"},
  ]});
  // light.userData.maskRoom picks the rule; a light without one is stock
  function maskedLightNode(Base) {
    return class extends Base {
      constructor(light) {
        super(light);
        this.maskRoomNode = TSL.uniform(UNMASKED).setGroup(TSL.renderGroup);
        this.hemisphereSign = TSL.uniform(0).setGroup(TSL.renderGroup);
        this.sourceRadiusSq = TSL.uniform(0).setGroup(TSL.renderGroup);
        this.noShadowMask = TSL.uniform(UNMASKED).setGroup(TSL.renderGroup);
      }
      update(frame) {
        super.update(frame);
        this.maskRoomNode.value = lightMaskFor(this.light, frame && frame.renderer);
        this.hemisphereSign.value = this.light.userData.hemisphereSign || 0;
        this.sourceRadiusSq.value = (this.light.userData.sourceRadius || 0) ** 2;
        this.noShadowMask.value = lightMaskFor(this.light, null);
      }
      setupDirect(builder) {
        var d = super.setupDirect(builder);
        // Three skips setupShadow on nonreceivers (including section caps).
        // A map allocated to this light cannot protect those surfaces.
        var mask = builder.object.receiveShadow ? this.maskRoomNode : this.noShadowMask;
        if (d && d.lightColor) {
          const punctual = this.light.isPointLight || this.light.isSpotLight;
          const hasMap = this.light.castShadow && builder.object.receiveShadow && builder.renderer?.shadowMap.enabled;
          d.lightColor = d.lightColor.mul(lightOpen(mask, punctual && !hasMap ? TSL.lightPosition(this.light) : null));
          if (this.light.isPointLight || this.light.isSpotLight) {
            const delta = TSL.lightPosition(this.light).sub(TSL.positionWorld);
            d.lightColor = emitterColor(d.lightColor, delta, this.hemisphereSign, this.sourceRadiusSq);
          }
        }
        return d;
      }
    };
  }
  // the stock HemisphereLightNode.setup, times its mask
  class SkyHemisphereLightNode extends maskedLightNode(THREE.HemisphereLightNode) {
    setup(builder) {
      var w = TSL.normalWorld.dot(this.lightDirectionNode).mul(0.5).add(0.5);
      var e = TSL.mix(this.groundColorNode, this.colorNode, w);
      builder.context.irradiance.addAssign(e.mul(lightOpen(this.maskRoomNode)));
    }
  }
  return { maskedLightNode, SkyHemisphereLightNode };
}

/* Effective diffuse reflectance for the planner's well-mixed room model.
   All areas are cm² and all colour arithmetic is in linear light. */

const imageMeans = new WeakMap(), itemEnvelopes = new WeakMap();
const WHITE_MEAN = [1, 1, 1], BLACK_MEAN = [0, 0, 0];
const gridSize = 12;

function linearSample(x) {
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

// Stratified point samples from the base-colour image. Averaging *after*
// sRGB decoding preserves the energy in dark grain and bright highlights.
// Texture clones with different UV repeat share the image and its result.
function textureMean(map) {
  const im = map?.image;
  if (!im || !im.width || !im.height) return WHITE_MEAN;
  const version = map.source?.version || 0, srgb = map.colorSpace === "srgb";
  const cached = imageMeans.get(im);
  if (cached && cached.version === version && cached.srgb === srgb) return cached.mean;
  let w = im.width, h = im.height, pixels = im.data, stride = 4, divisor = 255;
  if (!pixels) {
    if (typeof document === "undefined") return WHITE_MEAN;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w = Math.min(w, 32);
      canvas.height = h = Math.min(h, 32);
      const ctx = canvas.getContext("2d", {willReadFrequently: true});
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im, 0, 0, w, h);
      pixels = ctx.getImageData(0, 0, w, h).data;
    } catch {
      // A cross-origin custom image can render but cannot be read back.
      // Retain the material tint; avoid repeating this exception on relight.
      imageMeans.set(im, {version, srgb, mean: WHITE_MEAN});
      return WHITE_MEAN;
    }
  } else {
    stride = pixels.length / (w * h);
    if (stride < 3) return WHITE_MEAN;
    if (pixels instanceof Float32Array) divisor = 1;
  }
  const nx = Math.min(32, w), ny = Math.min(32, h), mean = [0, 0, 0];
  for (let iy = 0; iy < ny; iy++) {
    const row = Math.floor((iy + 0.5) * h / ny) * w;
    for (let ix = 0; ix < nx; ix++) {
      const k = stride * (row + Math.floor((ix + 0.5) * w / nx));
      for (let c = 0; c < 3; c++) {
        const x = pixels[k + c] / divisor;
        mean[c] += srgb ? linearSample(x) : x;
      }
    }
  }
  for (let c = 0; c < 3; c++) mean[c] /= nx * ny;
  imageMeans.set(im, {version, srgb, mean});
  return mean;
}

export function diffuseReflectance(material, solidInView = false) {
  const color = material.bounceTint || material.color;
  if (!color) return BLACK_MEAN;
  const texture = textureMean(material.bounceMap || material.map);
  const metal = material.bounceMetalMap ? textureMean(material.bounceMetalMap)[2] :
    (material.metalness || 0) * textureMean(material.metalnessMap)[2];
  const coverage = !solidInView && material.transparent ? (material.opacity ?? 1) : 1;
  const diffuse = coverage * (1 - metal) * (1 - (material.transmission || 0));
  // A perfect white swatch denotes white paint; even that pigment absorbs
  // some incident light. Emissive radiance never enters the albedo.
  const rgb = [color.r, color.g, color.b].map((v, c) => Math.max(0, v * texture[c]));
  const scale = diffuse * 0.9 / Math.max(0.9, ...rgb);
  return rgb.map(v => v * scale);
}

function swatch(THREE, hex) {
  return diffuseReflectance({color: new THREE.Color(hex)});
}

function addReflected(sum, area, rgb) {
  for (let c = 0; c < 3; c++) sum[c] += area * rgb[c];
}

// Rasterise the outer envelope of a catalogue piece in six orthographic
// views. This projected-area quadrature is exact for a box. It counts the
// visible rug pile rather than all its overlapping layers, and excludes
// cabinet backs hidden inside a run. Cache geometry and material references;
// a new tint or a newly decoded texture is read on the next light fit.
function projectTriangle(coords, ia, ib, ic, axis, material, faces) {
  const u = (axis + 1) % 3, v = (axis + 2) % 3;
  const ax = coords[ia + u], ay = coords[ia + v];
  const bx = coords[ib + u], by = coords[ib + v];
  const cx = coords[ic + u], cy = coords[ic + v];
  const det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(det) < 1e-8) return;
  const face = faces[2 * axis + (det > 0 ? 1 : 0)], sign = Math.sign(det);
  const xmin = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5));
  const xmax = Math.min(gridSize - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
  const ymin = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5));
  const ymax = Math.min(gridSize - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
  for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) {
    const px = x + 0.5 - ax, py = y + 0.5 - ay;
    const b = (px * (cy - ay) - py * (cx - ax)) / det;
    const c = ((bx - ax) * py - (by - ay) * px) / det;
    if (b < 0 || c < 0 || b + c > 1) continue;
    const depth = sign * (coords[ia + axis] * (1 - b - c) + coords[ib + axis] * b + coords[ic + axis] * c);
    const k = y * gridSize + x;
    if (depth >= face.depth[k]) { face.depth[k] = depth; face.material[k] = material; }
  }
}

// A byte per axis names the open interval between adjacent sample centres.
// Bit 7 marks a vertex exactly on a centre, where horizontal/vertical
// triangle edges must still participate in the original depth tie-break.
export function forEachEnvelopeProjection(coords, geo, mat, visit) {
  const vertices = coords.length / 3, bands = new Uint32Array(vertices);
  for (let i = 0; i < vertices; i++) {
    let packed = 0;
    for (let a = 0; a < 3; a++) {
      const p = coords[3 * i + a], cell = Math.max(0, Math.min(gridSize, Math.floor(p + 0.5)));
      packed |= (cell | (p === cell - 0.5 ? 128 : 0)) << (8 * a);
    }
    bands[i] = packed;
  }
  const index = geo.index, count = index ? index.count : vertices;
  const sections = Array.isArray(mat) ? geo.groups : [{start: 0, count}];
  for (const section of sections) {
    const material = Array.isArray(mat) ? mat[section.materialIndex] : mat;
    if (!material) continue;
    const end = Math.min(count, section.start + section.count);
    for (let i = section.start; i + 2 < end; i += 3) {
      const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      const p = bands[a], q = bands[b], r = bands[c];
      const axes = (p ^ q) | (p ^ r) | (p & 0x808080);
      if ((axes & 0xff00) && (axes & 0xff0000)) visit(3 * a, 3 * b, 3 * c, 0, material);
      if ((axes & 0xff0000) && (axes & 0xff)) visit(3 * a, 3 * b, 3 * c, 1, material);
      if ((axes & 0xff) && (axes & 0xff00)) visit(3 * a, 3 * b, 3 * c, 2, material);
    }
  }
}

export function itemEnvelope(group, THREE, projections = forEachEnvelopeProjection) {
  const hit = itemEnvelopes.get(group);
  if (hit) return hit;
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const bounds = new THREE.Box3(), parts = [];
  group.traverse(o => {
    const geo = o.geometry, pos = geo?.attributes.position;
    if (!o.isMesh || !pos || !o.visible) return;
    const transform = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    if (!geo.boundingBox) geo.computeBoundingBox();
    bounds.union(geo.boundingBox.clone().applyMatrix4(transform));
    parts.push({geo, pos, transform, mat: o.userData.ghostBase || o.material});
  });
  const result = {areas: new Map(), contacts: []};
  itemEnvelopes.set(group, result);
  if (bounds.isEmpty()) return result;
  const min = bounds.min.toArray(), span = bounds.getSize(new THREE.Vector3()).toArray();
  const samples = gridSize ** 2, point = new THREE.Vector3();
  const faces = Array.from({length: 6}, () => ({
    depth: new Float32Array(samples).fill(-Infinity), material: new Array(samples)
  }));
  for (const {geo, pos, transform, mat} of parts) {
    const coords = new Float32Array(pos.count * 3);
    const w = span[0] || 1, h = span[1] || 1, d = span[2] || 1;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i).applyMatrix4(transform);
      // Preserve the Float32 rounding of the transformed vertex without
      // writing and reading it back through Vector3.toArray for every axis.
      coords[3 * i] = (Math.fround(point.x) - min[0]) * gridSize / w;
      coords[3 * i + 1] = (Math.fround(point.y) - min[1]) * gridSize / h;
      coords[3 * i + 2] = (Math.fround(point.z) - min[2]) * gridSize / d;
    }
    projections(coords, geo, mat, (ia, ib, ic, axis, material) =>
      projectTriangle(coords, ia, ib, ic, axis, material, faces));
  }
  faces.forEach((face, f) => {
    const axis = Math.floor(f / 2), area = span[(axis + 1) % 3] * span[(axis + 2) % 3] / samples;
    face.material.forEach((m, k) => {
      result.areas.set(m, (result.areas.get(m) || 0) + area);
      if (f === 2) result.contacts.push({material: m, area, y: min[1] - face.depth[k] * span[1] / gridSize});
    });
  });
  return result;
}

function surfaceIndex(root) {
  const floors = new Map(), ceilings = new Map(), wallLayers = new Map();
  for (const o of root?.children || []) {
    const ud = o.userData, key = ud.roomKey;
    const material = ud.ghostBase || o.material;
    if (key != null && ud.role === "floor") floors.set(key, material);
    if (key != null && (ud.role === "ceilingHidden" || ud.role === "ceiling")) ceilings.set(key, material);
    if (!ud.wall) continue;
    const layers = new Map();
    for (const mesh of o.children) {
      const part = mesh.userData.wallLayer;
      if (part && !part.capOnly) {
        const role = part.role || "body";
        if (!layers.has(role)) layers.set(role, new Map());
        const bands = layers.get(role);
        if (bands.has(part.layerId)) continue;
        const mat = mesh.userData.ghostBase || mesh.material;
        bands.set(part.layerId, diffuseReflectance(mat, !/glass/i.test(part.material || "")));
      }
    }
    wallLayers.set(String(ud.wall.id), layers);
  }
  return {floors, ceilings, wallLayers};
}

function wallFinish(w, r, geom, state, byRole, band, fallback) {
  const layers = byRole?.get(band.role);
  if (!layers?.size) return fallback;
  if (layers.size === 1) return layers.values().next().value;
  const mid = geom.length / 2, p = pointAtWall(w, mid, state.nodes), t = tangentAtWall(w, mid, state.nodes);
  const at = r.nidx?.indexOf(w.a) ?? -1;
  const positive = at >= 0 ? r.nidx[(at + 1) % r.nidx.length] === w.b : pointInPoly(p.x - t.z, p.z + t.x, r.pts);
  const typed = band.wallTypeId && band.wallTypeId !== w.wallTypeId ?
    {...w, layers:undefined, wallTypeId:band.wallTypeId} : w;
  const bands = wallLayerBands(typed, state).filter(b => layers.has(b.id));
  const facing = positive ? bands.at(-1) : bands[0];
  return facing ? layers.get(facing.id) : fallback;
}

// A paired passage may be cut into two adjacent parallel partitions (the
// corridor tool). Pair apertures by physical overlap; an entire corridor
// can share one list of IDs. Never connect remote openings on that list.
function connectFacingApertures(portalPairs, apertures, nodes) {
  const used = new Set();
  for (const [id, side] of apertures) {
    if (used.has(id)) continue;
    const {o, wall, room} = side, mid = pointAtWall(wall, o.s, nodes), t = tangentAtWall(wall, o.s, nodes);
    let best = null, gap = Infinity, area = 0;
    for (const mateId of o.paired || []) {
      const mate = apertures.get(mateId);
      if (!mate || used.has(mateId) || mate.room === room) continue;
      const p = pointAtWall(mate.wall, mate.o.s, nodes), tt = tangentAtWall(mate.wall, mate.o.s, nodes);
      if (Math.abs(t.x * tt.x + t.z * tt.z) < 0.999) continue;
      const dx = p.x - mid.x, dz = p.z - mid.z, across = Math.abs(dx * t.z - dz * t.x);
      if (across > ((wall.thickness || 12) + (mate.wall.thickness || 12)) / 2 + 12 || across >= gap) continue;
      const along = dx * t.x + dz * t.z;
      const width = Math.min(o.width / 2, along + mate.o.width / 2) - Math.max(-o.width / 2, along - mate.o.width / 2);
      const sill = o.sill || 0, otherSill = mate.o.sill || 0;
      const height = Math.min(sill + o.height, otherSill + mate.o.height) - Math.max(sill, otherSill);
      if (width <= 0 || height <= 0) continue;
      best = mate;
      gap = across;
      area = Math.min(width * height * side.tau * mate.tau, side.area, mate.area);
    }
    if (!best) continue;
    used.add(id); used.add(best.o.id);
    portalPairs.push({from: room, to: best.room, area});
  }
}

export function roomSurfaceFinishes(rooms, structureRoot, itemsRoot, state, THREE, wallH) {
  const {floors, ceilings, wallLayers} = surfaceIndex(structureRoot);
  const walls = new Map((state.walls || []).map(w => [String(w.id), w]));
  const wallRooms = new Map(), openings = new Map(), portalPairs = [], paired = new Map();
  rooms.forEach((r, i) => {
    for (const id of String(r.key).split(",")) {
      if (!wallRooms.has(id)) wallRooms.set(id, []);
      wallRooms.get(id).push(i);
    }
  });
  for (const o of state.openings || []) {
    const id = String(o.wall);
    if (!openings.has(id)) openings.set(id, []);
    openings.get(id).push(o);
  }
  const entries = rooms.map((r, i) => {
    const meta = state.roomMeta?.[r.key] || {}, floor = floors.get(r.key), ceiling = ceilings.get(r.key);
    const floorRgb = floor ? diffuseReflectance(floor, true) : swatch(THREE, FILL2D[meta.floor || state.floorTex] || FLOOR);
    const wallRgb = swatch(THREE, meta.wall ?? state.wallColor ?? WALLC);
    const floorArea = roomArea(r.pts), area = roomSurface(r, wallH), sum = [0, 0, 0];
    const holes = holesForRoom(r.pts, state.slabOpenings || []);
    const solidFloor = Math.max(0, floorArea - holes.reduce((total, pts) => total + roomArea(pts), 0));
    addReflected(sum, solidFloor, floorRgb);
    addReflected(sum, floorArea, ceiling ? diffuseReflectance(ceiling, true) : swatch(THREE, 0xf3efe6));
    let remaining = area - 2 * floorArea;
    for (const id of String(r.key).split(",")) {
      const w = walls.get(id), geom = w && wallCurveGeom(w, state.nodes);
      if (!geom) continue;
      const ceilingH = r.ceilH || wallH || 250;
      const segments = verticalSegments(w, state.wallTypes).filter(p => p.solid && p.bottom < ceilingH);
      const h = segments.reduce((s, p) => s + Math.min(ceilingH, p.top) - p.bottom, 0);
      let opaque = Math.min(remaining, geom.length * h);
      const wallArea = opaque;
      remaining -= Math.min(remaining, geom.length * ceilingH);
      const owners = wallRooms.get(id);
      if (owners.length === 2 && owners[0] === i) {
        const clear = Math.min(ceilingH, rooms[owners[1]].ceilH || wallH || 250) - h;
        if (clear > 0) portalPairs.push({from:i, to:owners[1], area:geom.length * clear});
      }
      for (const o of openings.get(id) || []) {
        const span = Math.max(0, Math.min(o.width, geom.length));
        const rise = Math.max(0, Math.min(o.height, h - (o.sill || 0)));
        const cut = Math.min(opaque, span * rise);
        opaque -= cut;
        const clear = Math.min(cut, clearWindowSize({...o, width:span, height:rise}).area);
        addReflected(sum, cut - clear, swatch(THREE, 0xf2eee4));
        const tau = openingTransmittance(o);
        const glazedLeaf = (o.isPocket || o.isSliding) && (o.mat === "glass" || o.mat === "frosted");
        if (o.type === "door" && !glazedLeaf) addReflected(sum, clear * (1 - tau), swatch(THREE, o.color || WOOD));
        if (tau && owners.length === 2 && owners[0] === i)
          portalPairs.push({from: i, to: owners[1], area: clear * tau});
        if (tau && owners.length === 1 && o.paired?.length)
          paired.set(o.id, {room:i, o, wall:w, tau, area:clear * tau});
      }
      for (const band of segments) {
        const top = Math.min(ceilingH, band.top), bottom = band.bottom;
        let bandArea = wallArea * (top - bottom) / h;
        for (const o of openings.get(id) || []) {
          const lo = o.sill || 0, hi = lo + o.height;
          bandArea -= Math.min(o.width, geom.length) * Math.max(0, Math.min(hi, top) - Math.max(lo, bottom));
        }
        const rgb = wallFinish(w, r, geom, state, wallLayers.get(id), band, wallRgb);
        addReflected(sum, Math.max(0, Math.min(bandArea, opaque)), rgb);
      }
    }
    addReflected(sum, remaining, wallRgb);
    return {area, sum, floorArea: solidFloor, floorRgb, portals: []};
  });
  for (const g of itemsRoot?.children || []) {
    const it = g.userData.item;
    if (!it) continue;
    const i = rooms.findIndex(r => pointInPoly(it.x, it.z, r.pts));
    if (i < 0) continue;
    const e = entries[i], envelope = itemEnvelope(g, THREE);
    let footprint = 0;
    const areas = new Map(envelope.areas);
    for (const sample of envelope.contacts) {
      if (sample.y + g.position.y > 1) continue;
      areas.set(sample.material, areas.get(sample.material) - sample.area);
      footprint += sample.area;
    }
    const replaced = Math.min(e.floorArea, footprint);
    e.floorArea -= replaced;
    e.area -= replaced;
    addReflected(e.sum, -replaced, e.floorRgb);
    for (const [material, area] of areas) {
      if (area <= 0) continue;
      addReflected(e.sum, area, diffuseReflectance(material));
      e.area += area;
    }
  }
  connectFacingApertures(portalPairs, paired, state.nodes);
  for (const p of portalPairs) {
    entries[p.from].portals.push({room: p.to, area: p.area});
    entries[p.to].portals.push({room: p.from, area: p.area});
  }
  return entries.map(e => ({area: e.area, rho: e.sum.map(s => Math.max(0, Math.min(0.9, s / (e.area || 1)))), portals: e.portals}));
}
