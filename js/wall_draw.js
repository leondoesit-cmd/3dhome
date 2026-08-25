/* Wall drawing defaults, live preview geometry, and Chief-style placement
   helpers. Topology edits (split/weld) stay in interaction.js; this file is
   the authoring contract: type + draw-from + what the rubber band means. */
import { S, WALL_T, WALL_H, fin } from "./state.js";
import {
  wallById,
  wallNodeGeom,
  wallGeom,
  wallLocFace,
  nearestWallLanding,
  openingAtWallPosition,
} from "./geometry.js";
import { ensureWallTypes, wallTypeById, wallLayerBands, normalizeWall, setWallType, flipWall } from "./wall_types.js";

export const WALL_DRAW_TOOLS = {
  wall: 1, arcwall: 1, rect: 1,
  walloffset: 1, wallbreak: 1, walljoin: 1, wallreverse: 1, wallpaint: 1,
};

export const WALL_DRAW_PRESETS = [
  { id: "generic", typeId: "generic", kind: "normal", datum: "center", loc: "center", dimSide: 0, from: "center", icon: "ph-wall", label: "wd_generic" },
  { id: "exterior", typeId: "exterior", kind: "normal", datum: "exterior", loc: "face", dimSide: -1, from: "exterior", icon: "ph-house-line", label: "wd_exterior" },
  { id: "interior", typeId: "interior", kind: "normal", datum: "interior", loc: "face", dimSide: 1, from: "interior", icon: "ph-columns", label: "wd_interior" },
  { id: "foundation", typeId: "foundation", kind: "normal", datum: "exterior", loc: "face", dimSide: -1, from: "exterior", icon: "ph-steps", label: "wd_foundation" },
  { id: "railing", typeId: "generic", kind: "railing", datum: "center", loc: "center", dimSide: 0, from: "center", icon: "ph-minus", label: "wd_railing" },
  { id: "half", typeId: "generic", kind: "half", datum: "center", loc: "center", dimSide: 0, from: "center", icon: "ph-align-bottom", label: "wd_half" },
  { id: "divider", typeId: "generic", kind: "roomDivider", datum: "center", loc: "center", dimSide: 0, from: "center", icon: "ph-line-vertical", label: "wd_divider" },
];

export const WALL_DRAW_FROM = [
  { id: "exterior", loc: "face", datum: "exterior", dimSide: -1, label: "wd_from_outer" },
  { id: "main-exterior", loc: "face", datum: "main-exterior", dimSide: -1, label: "wd_from_core_out" },
  { id: "center", loc: "center", datum: "center", dimSide: 0, label: "wd_from_center" },
  { id: "main-interior", loc: "face", datum: "main-interior", dimSide: 1, label: "wd_from_core_in" },
  { id: "interior", loc: "face", datum: "interior", dimSide: 1, label: "wd_from_inner" },
];

function presetById(id) {
  for (var i = 0; i < WALL_DRAW_PRESETS.length; i++)
    if (WALL_DRAW_PRESETS[i].id === id) return WALL_DRAW_PRESETS[i];
  return WALL_DRAW_PRESETS[0];
}

export function isWallDrawTool(tool) {
  return !!WALL_DRAW_TOOLS[tool];
}

/* True while a finger is authoring geometry. The numbers then live in one
   touch readout, so geometry/status copies stand down. */
export function touchDrawing() {
  var tc = S.touchContact;
  return !!(tc && tc.pointerId != null && tc.kind);
}

export function resolveWallDrawDefaults() {
  ensureWallTypes(S);
  var d = S.wallDrawDefaults || {};
  var type = wallTypeById(S, d.typeId || "generic") || wallTypeById(S, "generic");
  var loc = d.loc === "face" ? "face" : "center";
  var dimSide = d.dimSide === 1 || d.dimSide === -1 ? d.dimSide : 0;
  if (loc === "face" && !dimSide) dimSide = -1;
  if (dimSide === 0) loc = "center";
  return {
    typeId: type ? type.id : "generic",
    kind: d.kind || "normal",
    datum: d.datum || (loc === "face" ? (dimSide < 0 ? "exterior" : "interior") : "center"),
    loc: loc,
    dimSide: dimSide,
    from: d.from || (loc === "face" ? (dimSide < 0 ? "exterior" : "interior") : "center"),
    phase: d.phase === "demolish" ? "demolition" : (d.phase || "new"),
    layersReversed: !!d.layersReversed,
    height: fin(d.height) && d.height > 0 ? d.height : WALL_H,
    thickness: type && fin(type.thickness) ? type.thickness : WALL_T,
    upperWallTypeId: d.upperWallTypeId,
    splitHeight: d.splitHeight,
    offsetDist: fin(d.offsetDist) && d.offsetDist > 0 ? d.offsetDist : 120,
  };
}

export function applyWallDrawDefaults(wall) {
  if (!wall) return wall;
  var defaults = resolveWallDrawDefaults(), type = wallTypeById(S, defaults.typeId);
  wall.wallTypeId = type ? type.id : "generic";
  if (type && fin(type.thickness)) wall.thickness = type.thickness;
  wall.kind = defaults.kind;
  wall.datum = defaults.datum;
  wall.phase = defaults.phase;
  wall.layersReversed = !!defaults.layersReversed;
  if (fin(defaults.height)) wall.height = defaults.height;
  if (defaults.upperWallTypeId) wall.upperWallTypeId = defaults.upperWallTypeId;
  if (fin(defaults.splitHeight)) wall.splitHeight = defaults.splitHeight;
  if (defaults.loc === "face" && (defaults.dimSide === 1 || defaults.dimSide === -1)) {
    wall.loc = "face";
    wall.dimSide = defaults.dimSide;
  } else {
    wall.loc = "center";
    if (wall.dimSide === 1 || wall.dimSide === -1 || wall.dimSide === 0) {
      /* leave an explicit centreline pin; otherwise let Auto pick */
    } else delete wall.dimSide;
  }
  return wall;
}

export function activeWallPresetId() {
  var d = S.wallDrawDefaults || {};
  if (d.kind === "railing") return "railing";
  if (d.kind === "half") return "half";
  if (d.kind === "roomDivider") return "divider";
  if (d.typeId === "exterior") return "exterior";
  if (d.typeId === "interior") return "interior";
  if (d.typeId === "foundation") return "foundation";
  return "generic";
}

export function setWallDrawPreset(id) {
  var p = presetById(id);
  S.wallDrawDefaults = Object.assign({}, S.wallDrawDefaults || {}, {
    typeId: p.typeId,
    kind: p.kind,
    datum: p.datum,
    loc: p.loc,
    dimSide: p.dimSide,
    from: p.from,
  });
  return resolveWallDrawDefaults();
}

export function setWallDrawFrom(id) {
  var found = null;
  for (var i = 0; i < WALL_DRAW_FROM.length; i++)
    if (WALL_DRAW_FROM[i].id === id) found = WALL_DRAW_FROM[i];
  if (!found) return resolveWallDrawDefaults();
  S.wallDrawDefaults = Object.assign({}, S.wallDrawDefaults || {}, {
    from: found.id,
    loc: found.loc,
    datum: found.datum,
    dimSide: found.dimSide,
  });
  return resolveWallDrawDefaults();
}

export function defaultsFromWall(wall) {
  if (!wall) return resolveWallDrawDefaults();
  normalizeWall(wall, S);
  return {
    typeId: wall.wallTypeId || "generic",
    kind: wall.kind || "normal",
    datum: wall.datum || "center",
    loc: wall.loc === "face" ? "face" : "center",
    dimSide: wall.dimSide === 1 || wall.dimSide === -1 ? wall.dimSide : 0,
    from: wall.loc === "face"
      ? (wall.datum === "interior" || wall.datum === "main-interior" ? wall.datum : "exterior")
      : "center",
    phase: wall.phase || "new",
    layersReversed: !!wall.layersReversed,
    height: wall.height,
    upperWallTypeId: wall.upperWallTypeId,
    splitHeight: wall.splitHeight,
  };
}

/* Jamb / face snap: land the NEW wall's drawn face on the jamb. Centreline
   drawing backs off half a thickness; face-located drawing already hangs on a
   face, so the node lands on the jamb. */
export function drawFaceBack() {
  if (S.tool !== "wall") return 0;
  var d = resolveWallDrawDefaults();
  if (d.loc === "face") return 0;
  return (d.thickness || WALL_T) / 2;
}

function hypot(dx, dz) {
  return Math.hypot(dx, dz) || 0.0001;
}

/* Preview points are on the LOCATION line (what the user is drawing). The
   filled ghost is the wall's own centreline, offset the same way wallGeom is. */
export function previewCentreline(ax, az, bx, bz, spec) {
  spec = spec || resolveWallDrawDefaults();
  var dx = bx - ax, dz = bz - az, L = hypot(dx, dz),
    ux = dx / L, uz = dz / L,
    th = spec.thickness || WALL_T,
    off = spec.loc === "face" && (spec.dimSide === 1 || spec.dimSide === -1)
      ? -spec.dimSide * th / 2 : 0,
    nx = -uz * off, nz = ux * off;
  return {
    a: { x: ax + nx, z: az + nz },
    b: { x: bx + nx, z: bz + nz },
    ux: ux, uz: uz, L: L, ang: Math.atan2(dz, dx),
    thickness: th, loc: spec.loc, dimSide: spec.dimSide,
    kind: spec.kind, typeId: spec.typeId, datum: spec.datum,
  };
}

export function previewBandPoly(cl, from, to) {
  var nx = -cl.uz, nz = cl.ux;
  return [
    { x: cl.a.x + nx * from, z: cl.a.z + nz * from },
    { x: cl.b.x + nx * from, z: cl.b.z + nz * from },
    { x: cl.b.x + nx * to, z: cl.b.z + nz * to },
    { x: cl.a.x + nx * to, z: cl.a.z + nz * to },
  ];
}

export function previewLayerBands(spec) {
  spec = spec || resolveWallDrawDefaults();
  var wall = {
    wallTypeId: spec.typeId, thickness: spec.thickness, datum: spec.datum,
    kind: spec.kind, layersReversed: spec.layersReversed, phase: spec.phase,
    height: spec.height,
  };
  try {
    return wallLayerBands(wall, S);
  } catch (_) {
    var h = (spec.thickness || WALL_T) / 2;
    return [{ start: -h, end: h, color: "#d8d3c8" }];
  }
}

export function previousRunAngle() {
  var ids = S.drawWalls || [];
  if (!ids.length) return null;
  var w = wallById(ids[ids.length - 1]);
  if (!w) return null;
  return wallNodeGeom(w).ang;
}

export function signedTurn(from, to, prevAng) {
  var abs = Math.atan2(to.z - from.z, to.x - from.x);
  if (!fin(prevAng)) return abs;
  var d = abs - prevAng;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function nearestParallelInfo(ax, az, bx, bz, skipIds) {
  var ang = Math.atan2(bz - az, bx - ax),
    mx = (ax + bx) / 2, mz = (az + bz) / 2,
    skip = skipIds || {},
    best = null, bestAbs = 1e9;
  S.walls.forEach(function (w) {
    if (skip[w.id]) return;
    var g = wallNodeGeom(w);
    if (!fin(g.L) || g.L < 8) return;
    var dAng = ang - g.ang;
    while (dAng > Math.PI) dAng -= 2 * Math.PI;
    while (dAng < -Math.PI) dAng += 2 * Math.PI;
    var fold = Math.abs(dAng);
    if (fold > Math.PI / 2) fold = Math.PI - fold;
    if (fold > (8 * Math.PI) / 180) return;
    var nx = -g.uz, nz = g.ux;
    var dist = (mx - g.a.x) * nx + (mz - g.a.z) * nz;
    var along0 = (ax - g.a.x) * g.ux + (az - g.a.z) * g.uz;
    var along1 = (bx - g.a.x) * g.ux + (bz - g.a.z) * g.uz;
    var overlap = Math.min(Math.max(along0, along1), g.L) - Math.max(Math.min(along0, along1), 0);
    if (overlap < 8 && Math.abs(dist) > 40) return;
    var ad = Math.abs(dist);
    if (ad < 4 || ad > 2500) return;
    if (ad < bestAbs) {
      bestAbs = ad;
      best = { wall: w, dist: dist, abs: ad, nx: nx, nz: nz, g: g };
    }
  });
  return best;
}

export function closeLoopInfo(preview) {
  if (S.drawStart == null || !preview) return null;
  var ids = S.drawWalls || [];
  if (ids.length < 2) return null;
  var a = S.nodes[S.drawStart];
  if (!a) return null;
  var dx = a.x - preview.x, dz = a.z - preview.z, L = Math.hypot(dx, dz);
  if (L < 1) return { x: a.x, z: a.z, dist: 0, node: S.drawStart, closing: true };
  return { x: a.x, z: a.z, dist: L, node: S.drawStart, closing: L <= 40 };
}

export function previewMetrics(fromNode, preview) {
  var a = S.nodes[fromNode];
  if (!a || !preview) return null;
  var skip = {};
  (S.drawWalls || []).forEach(function (id) { skip[id] = 1; });
  var prev = previousRunAngle();
  var turn = signedTurn(a, preview, prev);
  return {
    length: Math.hypot(preview.x - a.x, preview.z - a.z),
    absAng: Math.atan2(preview.z - a.z, preview.x - a.x),
    turn: turn,
    hasPrev: fin(prev),
    parallel: nearestParallelInfo(a.x, a.z, preview.x, preview.z, skip),
    close: closeLoopInfo(preview),
  };
}

function nodeSegIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  var rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  var den = rx * sz - rz * sx;
  if (!fin(den) || Math.abs(den) < 1e-8) return null;
  var qx = cx - ax, qz = cz - az;
  var t = (qx * sz - qz * sx) / den;
  var u = (qx * rz - qz * rx) / den;
  return { t: t, u: u, x: ax + rx * t, z: az + rz * t };
}

/* Ray from `origin` along the current segment: first host wall it hits, if the
   cursor is at or past that hit. Promotes healDrawnWallEnds into a live snap. */
export function extendToHit(origin, cursor, joinTol) {
  if (!origin || !cursor) return null;
  var dx = cursor.x - origin.x, dz = cursor.z - origin.z, len = Math.hypot(dx, dz);
  if (len < 20) return null;
  var ux = dx / len, uz = dz / len;
  var tol = fin(joinTol) && joinTol > 0 ? joinTol : 30;
  var best = null, bestT = len + tol + 1;
  S.walls.forEach(function (w) {
    if (w.a === S.drawFrom || w.b === S.drawFrom) return;
    var g = wallNodeGeom(w);
    if (g.kind === "arc") return;
    var ip = nodeSegIntersect(origin.x, origin.z, origin.x + ux, origin.z + uz, g.a.x, g.a.z, g.b.x, g.b.z);
    if (!ip || ip.t < 15 || ip.u <= 0.02 || ip.u >= 0.98) return;
    var hostS = ip.u * g.L;
    if (openingAtWallPosition(w, hostS, 0.05)) return;
    if (ip.t < bestT) {
      bestT = ip.t;
      best = {
        x: ip.x, z: ip.z, t: ip.t, wall: w, s: hostS,
        kind: "hit",
      };
    }
  });
  if (!best) return null;
  if (len + 1 < best.t - tol) return null;
  return best;
}

/* Proper crossings of a committed wall's NODE line with other walls. Far-to-
   near order so successive splits of `made` stay valid on the remaining stub. */
export function throughCrossings(made) {
  if (!made) return [];
  var gm = wallNodeGeom(made), hits = [];
  if (gm.kind === "arc" || gm.L < 20) return hits;
  S.walls.forEach(function (w) {
    if (!w || w.id === made.id) return;
    if (w.a === made.a || w.b === made.a || w.a === made.b || w.b === made.b) return;
    var g = wallNodeGeom(w);
    if (g.kind === "arc") return;
    var ip = nodeSegIntersect(gm.a.x, gm.a.z, gm.b.x, gm.b.z, g.a.x, g.a.z, g.b.x, g.b.z);
    if (!ip) return;
    if (ip.t <= 0.04 || ip.t >= 0.96 || ip.u <= 0.04 || ip.u >= 0.96) return;
    var alongMade = ip.t * gm.L, hostS = ip.u * g.L;
    if (alongMade < Math.max(made.thickness || 8, 8) || gm.L - alongMade < 8) return;
    if (hostS < Math.max(w.thickness || 8, 8) || g.L - hostS < 8) return;
    if (openingAtWallPosition(w, hostS, 0.05)) return;
    hits.push({ hostId: w.id, alongMade: alongMade, hostS: hostS, x: ip.x, z: ip.z });
  });
  hits.sort(function (a, b) { return b.alongMade - a.alongMade; });
  return hits;
}

export function offsetGhost(host, distance, side) {
  if (!host) return null;
  var g = wallNodeGeom(host);
  var dist = fin(distance) && distance > 0 ? distance : 120;
  var sgn = side < 0 ? -1 : 1;
  var nx = -g.uz * sgn, nz = g.ux * sgn;
  return {
    a: { x: S.nodes[host.a].x + nx * dist, z: S.nodes[host.a].z + nz * dist },
    b: { x: S.nodes[host.b].x + nx * dist, z: S.nodes[host.b].z + nz * dist },
    host: host, dist: dist, side: sgn,
  };
}

export function offsetSideFromCursor(host, px, pz) {
  if (!host) return 1;
  var g = wallNodeGeom(host);
  var d = (px - g.a.x) * (-g.uz) + (pz - g.a.z) * g.ux;
  return d < 0 ? -1 : 1;
}

export function joinProposal(a, b) {
  if (!a || !b || a === b) return null;
  var shared = null, farA = null, farB = null;
  if (a.b === b.a) { shared = a.b; farA = a.a; farB = b.b; }
  else if (a.b === b.b) { shared = a.b; farA = a.a; farB = b.a; }
  else if (a.a === b.b) { shared = a.a; farA = a.b; farB = b.a; }
  else if (a.a === b.a) { shared = a.a; farA = a.b; farB = b.b; }
  if (shared == null) return null;
  var ga = wallNodeGeom(a), gb = wallNodeGeom(b);
  if (ga.kind === "arc" || gb.kind === "arc") return null;
  var dAng = ga.ang - gb.ang;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  while (dAng < -Math.PI) dAng += 2 * Math.PI;
  var fold = Math.abs(dAng);
  if (fold > Math.PI / 2) fold = Math.PI - fold;
  if (fold > (6 * Math.PI) / 180) return null;
  return { keep: a, drop: b, shared: shared, farKeep: farA, farDrop: farB };
}

export function paintWallWithDefaults(wall) {
  if (!wall) return wall;
  var d = resolveWallDrawDefaults();
  setWallType(wall, d.typeId, S, { preserveDatum: false });
  wall.kind = d.kind;
  wall.datum = d.datum;
  wall.phase = d.phase;
  wall.layersReversed = !!d.layersReversed;
  if (fin(d.height)) wall.height = d.height;
  if (d.loc === "face" && (d.dimSide === 1 || d.dimSide === -1)) {
    wall.loc = "face";
    wall.dimSide = d.dimSide;
  } else {
    wall.loc = "center";
  }
  return wall;
}

export function reverseWallStyle(wall) {
  if (!wall) return wall;
  flipWall(wall);
  return wall;
}

export function hatchSide(spec) {
  spec = spec || resolveWallDrawDefaults();
  if (spec.typeId !== "exterior" && spec.typeId !== "foundation" && spec.datum !== "exterior")
    return 0;
  /* Exterior hatch lives on the exterior finish. dimSide -1 is the right-hand
     (location) face for clockwise rooms; hatch the opposite face so ticks sit
     outside the building. */
  if (spec.loc === "face" && spec.dimSide) return -spec.dimSide;
  return spec.layersReversed ? 1 : -1;
}
