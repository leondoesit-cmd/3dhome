/* Whole-house view: the 3D pane draws every OTHER storey around the one being
   edited, each at its own level relative to it, so a multi-storey project can
   be seen as one building. The state is one workspace flag
   (workspace.showAllFloors) toggled from the floor strip.

   This file is the pure half: which storeys to stack and where, how to read a
   stored storey's scene in place of the live one, and the plain wall geometry
   (solid boxes cut around doors and windows). No THREE, no DOM — the GPU half
   is js/view3d/floor_stack.js. */

export function wholeHouseOn(workspace) {
  return !!(workspace && workspace.showAllFloors && Array.isArray(workspace.floors) && workspace.floors.length > 1);
}

export function toggleWholeHouse(workspace) {
  if (!workspace) return false;
  workspace.showAllFloors = !workspace.showAllFloors;
  return workspace.showAllFloors;
}

/* The storeys to draw besides the active one, lowest first, each with `dy`:
   its level relative to the active storey (which the 3D view draws at 0).
   hideAbove leaves out the storeys over the active one (the dollhouse cut
   looks down into the active storey; a floor above would lid it). */
export function stackedFloors(workspace, options = {}) {
  if (!wholeHouseOn(workspace)) return [];
  const active = workspace.floors.find((f) => f.id === workspace.activeFloor);
  const base = active ? Number(active.elevation) || 0 : 0;
  const list = workspace.floors
    .filter((f) => f && f.id !== workspace.activeFloor && f.scene)
    .map((f) => ({ floor: f, dy: (Number(f.elevation) || 0) - base }))
    .filter((e) => !(options.hideAbove && e.dy > 0))
    .sort((a, b) => a.dy - b.dy);
  const levels = list.map((e) => e.dy).concat(0);
  list.forEach((e) => { e.rise = riseAbove(levels, e.dy); });
  return list;
}

/* Floor-to-floor height from a storey at `dy` to the next storey shown above
   it (levels: every shown storey's dy, the active one's 0 included), or null
   for the top one. A storey stands exactly on the one below: the walls below
   run up to this level and the slab fills what they do not. */
export function riseAbove(levels, dy) {
  let next = null;
  levels.forEach((y) => { if (y > dy + 0.01 && (next == null || y < next)) next = y; });
  return next == null ? null : next - dy;
}

/* The active storey's rise to the storey shown above it (null: none shown). */
export function activeRise(workspace, options = {}) {
  return riseAbove(stackedFloors(workspace, options).map((e) => e.dy).concat(0), 0);
}

/* A full-height wall carries the storey above, so it runs from its own base
   to that storey's level: up past its own top when the walls are lower than
   the floor-to-floor height (the band the slab sits in), cut down when they
   are taller. Half walls, railings and dividers keep their own height. */
export function carriedTop(kind, ownTop, rise) {
  if (rise == null || !(rise > 0) || (kind && kind !== "normal")) return ownTop;
  return rise;
}

/* The slab under a storey: from its floor down to the ceiling of the storey
   below (the tallest full wall there), i.e. floor-to-floor height minus that
   storey's wall height. 0 when the walls already reach the level. */
export function slabDepth(rise, belowWallTop) {
  if (rise == null || !(belowWallTop > 0)) return 0;
  return Math.max(0, rise - belowWallTop);
}

/* A stored storey's spatial document, in the shape state.spatial has (the
   legacy aliases state.walls / nodes / ... read through it). Older scenes kept
   the arrays at the top level. Read-only: nothing here is cloned. */
export function floorSpatial(scene) {
  const src = (scene && (scene.spatial || scene)) || {};
  return {
    schemaVersion: src.schemaVersion,
    id: src.id,
    nodes: src.nodes || [],
    walls: src.walls || [],
    wallTypes: src.wallTypes || [],
    openings: src.openings || [],
    instances: src.instances || src.items || [],
    rooms: src.rooms || src.roomMeta || {},
    markers: src.markers || [],
    slabOpenings: src.slabOpenings || [],
    annotations: [],
    surveyFeatures: Array.isArray(src.surveyFeatures) ? src.surveyFeatures : [],
    wallCons: [],
    roomCons: [],
    planVars: [],
    cabinetPresets: src.cabinetPresets || [],
    revision: Number(src.revision) || 1,
  };
}

/* Run fn with `state` reading a stored storey instead of the live one: the
   geometry helpers (detectRooms, wallGeom, roomFloor ...) all read the global
   state, so the cheapest faithful way to ask them about another storey is to
   point state.spatial at it for the duration of one synchronous call. Always
   restored, also when fn throws. */
export function withFloorScene(state, scene, fn) {
  const saved = { spatial: state.spatial, floorTex: state.floorTex };
  state.spatial = floorSpatial(scene);
  if (scene && scene.floorTex) state.floorTex = scene.floorTex;
  try {
    return fn();
  } finally {
    state.spatial = saved.spatial;
    state.floorTex = saved.floorTex;
  }
}

/* The solid parts of a wall face of length L standing from `bottom` to `top`,
   with the openings (each { s: centre along the wall, width, y0, y1 }) cut out:
   rectangles { s0, s1, y0, y1 } in wall coordinates. Breaks fall on every jamb;
   in each column the openings covering it are subtracted from [bottom, top]. */
export function wallSolidPieces(L, bottom, top, openings) {
  if (!(L > 0) || !(top > bottom)) return [];
  const cuts = (openings || [])
    .map((o) => {
      const half = (Number(o.width) || 0) / 2;
      return { s0: Math.max(0, o.s - half), s1: Math.min(L, o.s + half), y0: Math.max(bottom, o.y0), y1: Math.min(top, o.y1) };
    })
    .filter((c) => c.s1 - c.s0 > 0.5 && c.y1 - c.y0 > 0.5);
  const xs = [0, L];
  cuts.forEach((c) => xs.push(c.s0, c.s1));
  xs.sort((a, b) => a - b);
  const breaks = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.01);
  const out = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const s0 = breaks[i], s1 = breaks[i + 1], mid = (s0 + s1) / 2;
    const holes = cuts.filter((c) => c.s0 <= mid && c.s1 >= mid).sort((a, b) => a.y0 - b.y0);
    let y = bottom;
    holes.forEach((h) => {
      if (h.y0 > y) out.push({ s0, s1, y0: y, y1: h.y0 });
      y = Math.max(y, h.y1);
    });
    if (top > y) out.push({ s0, s1, y0: y, y1: top });
  }
  return out;
}

/* An opening as wallSolidPieces wants it. A window starts at its sill; a
   door or passage at the floor. */
export function openingCut(o, wallTop) {
  const width = Number(o.width) || 0;
  const y0 = o.type === "window" ? Number(o.sill) || 0 : 0;
  const h = Number(o.height);
  return { s: Number(o.s) || 0, width, y0, y1: Number.isFinite(h) && h > 0 ? y0 + h : wallTop };
}

/* Boxes ({ a:{x,z}, b:{x,z}, y0, y1, t }: a slab of thickness t standing on
   the segment a→b) as one indexed triangle list with flat normals, so a whole
   storey's walls are a single draw call. */
export function boxArrays(boxes) {
  const pos = [], nrm = [], idx = [];
  function quad(p, n) {
    const base = pos.length / 3;
    p.forEach((v) => { pos.push(v[0], v[1], v[2]); nrm.push(n[0], n[1], n[2]); });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  boxes.forEach((bx) => {
    const dx = bx.b.x - bx.a.x, dz = bx.b.z - bx.a.z, len = Math.hypot(dx, dz);
    if (!(len > 0.01) || !(bx.y1 > bx.y0)) return;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux, h = bx.t / 2;
    const c = (s, side, y) => [bx.a.x + ux * s + nx * h * side, y, bx.a.z + uz * s + nz * h * side];
    const lo = bx.y0, hi = bx.y1;
    // faces wound counter-clockwise seen from outside
    quad([c(0, 1, lo), c(len, 1, lo), c(len, 1, hi), c(0, 1, hi)], [nx, 0, nz]);
    quad([c(0, -1, lo), c(len, -1, lo), c(len, -1, hi), c(0, -1, hi)].reverse(), [-nx, 0, -nz]);
    quad([c(0, -1, hi), c(len, -1, hi), c(len, 1, hi), c(0, 1, hi)].reverse(), [0, 1, 0]);
    quad([c(0, -1, lo), c(len, -1, lo), c(len, 1, lo), c(0, 1, lo)], [0, -1, 0]);
    quad([c(0, -1, lo), c(0, 1, lo), c(0, 1, hi), c(0, -1, hi)], [-ux, 0, -uz]);
    quad([c(len, -1, lo), c(len, 1, lo), c(len, 1, hi), c(len, -1, hi)].reverse(), [ux, 0, uz]);
  });
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
