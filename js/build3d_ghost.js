/* What the active planner tool is about to build, as plain 3D primitives for
   the 3D pane's preview volumes ("ghosts"). Pure: no three, no DOM, no global
   state. js/planner_3d.js feeds it S plus the few lookups Node cannot import
   cheaply (`deps`), and js/view3d/build_ghost.js turns the result into meshes.

   Primitives, in the planner's centimetres (x/z on the plan, y up):
     { shape: "box",   cx, cy, cz, w, h, d, rotY, tone }   w along local X, d along local Z
     { shape: "prism", pts: [{x,z}...], y0, y1, tone }      a plan polygon pushed up from y0 to y1
     { shape: "tube",  pts: [{x,y,z}...], r, tone }         a polyline with a radius
   rotY follows three.js (an item's rot in degrees is rotY = -rot·π/180), so a
   box whose local X runs along (ux, uz) has rotY = atan2(-uz, ux).
   tone: "ok" | "blocked" | "erase" | "edit".

   Each tool mirrors the commit it previews, not a second opinion: walls take
   the draw defaults the wall command is handed (js/wall_draw.js
   resolveWallDrawDefaults), a rectangle asks room.create's prepare, an
   opening asks opening.place's prepare (clamp + overlap refusal) and draws at
   its preview centre, a piece takes the pose placeFurnAt would give it
   (deps.placePose, js/build3d_pose.js).

   deps (all optional; a missing one drops only what needs it):
     wallDefaults   { thickness, height, loc, dimSide, offsetDist }
     openingDefaults(type) -> { width, height, sill }
     catalog        FURN
     placePose(type, x, z) -> { x, z, rot, w, d, y0, y1 }
     fitCabDraft()  -> { box: { x, z, w, d, h, rot, elev? } } | null
     cursor         { x, z } the plan point under the pointer (3D pane)
     mepRunY(route) -> y,  mepNodeAt(x, z) -> { x, y, z } | null
     itemSpan(item) -> { lo, hi } */
import { makeArcFromThreePoints, pointAtWall, projectToWall, tangentAtWall, wallCurveGeom } from "./wall_curves.js";
import { OPENING_DEFAULTS, prepareOpeningPlace, previewOpeningPlace } from "./commands/opening_place.js";
import { prepareRoomCreate } from "./commands/room_create.js";

export const GHOST_TONE_COLORS = Object.freeze({ ok: "#26b99a", blocked: "#ed705a", erase: "#ed705a", edit: "#faac38" });

const FLOOR_T = 2; // the thin floor slab under a rectangle / stamped room
const SLAB_Y0 = -25, SLAB_Y1 = 3; // a slab void reads as a hole through the floor
const SLAB_MIN = 40; // js/interaction/room_tools.js commitSlabFromTo
const BITE_MIN = 20; // js/interaction/mep_tools.js commitWallBite
const BREAK_END = 8; // js/interaction/mep_tools.js handleBreakClick
const PAD = 4; // a hovered wall / piece is drawn this much proud of itself
const CURVE_STEP = 30; // cm of curved wall per straight box

function fin(v) { return typeof v === "number" && Number.isFinite(v); }
function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : d; }
function snap2(v) { return Math.round(v / 2) * 2; }
export function rotYAlong(ux, uz) { return Math.atan2(-uz, ux); }
export function rotYOfItem(rotDeg) { return -num(rotDeg, 0) * Math.PI / 180; }

function drawDefaults(deps) {
  var d = (deps && deps.wallDefaults) || {};
  var thickness = fin(d.thickness) && d.thickness > 0 ? d.thickness : 10;
  var loc = d.loc === "face" ? "face" : "center";
  var dimSide = d.dimSide === 1 || d.dimSide === -1 ? d.dimSide : 0;
  if (!dimSide) loc = "center";
  return {
    thickness: thickness,
    height: fin(d.height) && d.height > 0 ? d.height : 270,
    loc: loc, dimSide: dimSide,
    offsetDist: fin(d.offsetDist) && d.offsetDist > 0 ? d.offsetDist : 120,
  };
}

/* A face-located wall's body sits beside its location line: the same
   translation as geometry.wallAxisNodes / opening_place's wallAxisNodes. */
function faceOffset(loc, dimSide, thickness) {
  return loc === "face" && (dimSide === 1 || dimSide === -1) ? -dimSide * thickness / 2 : 0;
}

/** A box spanning a→b (local X along the segment), `offset` along the left normal. */
export function segmentBox(a, b, o) {
  if (!a || !b) return null;
  var dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  if (!(L > 0.5)) return null;
  var ux = dx / L, uz = dz / L, off = o.offset || 0, ext = o.extend || 0;
  var y0 = o.y0 || 0, y1 = o.y1;
  return {
    shape: "box",
    cx: (a.x + b.x) / 2 - uz * off, cy: (y0 + y1) / 2, cz: (a.z + b.z) / 2 + ux * off,
    w: L + ext * 2, h: y1 - y0, d: o.thickness, rotY: rotYAlong(ux, uz), tone: o.tone,
  };
}

/* A wall the tool would create, from a to b (the location line). */
function newWallBox(a, b, p, tone) {
  return segmentBox(a, b, {
    thickness: p.thickness, y0: 0, y1: p.height, tone: tone,
    offset: faceOffset(p.loc, p.dimSide, p.thickness),
  });
}

function rectCorners(r) {
  return [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
}
function rectOf(a, b) {
  return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
}
function floorPrism(r, tone, y0, y1) {
  return { shape: "prism", pts: rectCorners(r), y0: y0 == null ? 0 : y0, y1: y1 == null ? FLOOR_T : y1, tone: tone };
}

/* ---- existing walls ---------------------------------------------------- */

function axisNodes(wall, nodes) {
  if (!wall || wall.loc !== "face" || (wall.dimSide !== 1 && wall.dimSide !== -1) ||
      wall.geometry || wall.curve || wall.bulge) return nodes;
  var a = nodes[wall.a], b = nodes[wall.b];
  if (!a || !b) return nodes;
  var dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
  var off = -wall.dimSide * num(wall.thickness, 0) / 2, out = {};
  out[wall.a] = { x: a.x + (-dz / L) * off, z: a.z + (dx / L) * off };
  out[wall.b] = { x: b.x + (-dz / L) * off, z: b.z + (dx / L) * off };
  return out;
}
function wallInfo(wall, state) {
  var nodes = axisNodes(wall, (state && state.nodes) || []);
  var g = wall && wallCurveGeom(wall, nodes);
  if (!g || !fin(g.length) || g.length <= 0) return null;
  return {
    wall: wall, nodes: nodes, L: g.length, curved: g.kind !== "line",
    T: num(wall.thickness, 10) || 10, H: num(wall.height, 270) || 270,
  };
}
function wallPoint(info, s) { return pointAtWall(info.wall, s, info.nodes); }
function wallTangent(info, s) { return tangentAtWall(info.wall, s, info.nodes); }
function wallById(state, id) {
  var walls = (state && state.walls) || [];
  for (var i = 0; i < walls.length; i++) if (String(walls[i].id) === String(id)) return walls[i];
  return null;
}

/* The span s0..s1 of an existing wall as boxes (one for a straight wall, a
   run of short chords for a curved one), `pad` proud of every face. */
function wallSpanBoxes(info, s0, s1, tone, pad) {
  var out = [], lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(info.L, Math.max(s0, s1));
  if (!(hi - lo > 0.5)) return out;
  var n = info.curved ? Math.max(1, Math.ceil((hi - lo) / CURVE_STEP)) : 1;
  for (var i = 0; i < n; i++) {
    var box = segmentBox(wallPoint(info, lo + (hi - lo) * i / n), wallPoint(info, lo + (hi - lo) * (i + 1) / n), {
      thickness: info.T + pad, y0: pad ? -1 : 0, y1: info.H + pad, tone: tone,
      extend: !info.curved ? pad / 2 : 0,
    });
    if (box) out.push(box);
  }
  return out;
}
function wallHover(wall, state, tone) {
  var info = wall && wallInfo(wall, state);
  return info ? wallSpanBoxes(info, 0, info.L, tone, PAD) : [];
}
function cursorOf(state, deps) {
  var c = deps && deps.cursor;
  if (c && fin(c.x) && fin(c.z)) return c;
  var wp = state.wallProbe;
  if (wp && fin(wp.x) && fin(wp.z)) return wp;
  var p = state.previewPt;
  return p && fin(p.x) && fin(p.z) ? p : null;
}
function probeWall(state) {
  var wp = state.wallProbe;
  return wp && wp.wall && (state.walls || []).indexOf(wp.wall) !== -1 ? wp.wall : null;
}

/* ---- per tool ---------------------------------------------------------- */

function arcBand(arc, p) {
  var n = Math.max(12, Math.ceil(arc.L / 20)), left = [], right = [], half = p.thickness / 2;
  for (var i = 0; i <= n; i++) {
    var q = pointAtWall(arc, arc.L * i / n), tg = tangentAtWall(arc, arc.L * i / n);
    if (!q || !tg) return null;
    left.push({ x: q.x - tg.uz * half, z: q.z + tg.ux * half });
    right.push({ x: q.x + tg.uz * half, z: q.z - tg.ux * half });
  }
  return { shape: "prism", pts: left.concat(right.reverse()), y0: 0, y1: p.height, tone: "ok" };
}

function wallTools(state, deps, out) {
  var p = drawDefaults(deps), end = state.previewPt;
  if (state.tool === "wall" && state.drawing && state.drawFrom != null && end) {
    var from = (state.nodes || [])[state.drawFrom];
    var box = from && newWallBox(from, end, p, "ok");
    if (box) out.push(box);
  }
  if (state.tool === "arcwall" && state.arcDraft && end) {
    var a = (state.nodes || [])[state.arcDraft.startNode] || state.arcDraft.startPoint;
    var arc = a && state.arcDraft.through ? makeArcFromThreePoints(a, state.arcDraft.through, end) : null;
    var band = arc && arc.L > 0 ? arcBand(arc, p) : null;
    if (band) out.push(band);
    else if (a) { var straight = newWallBox(a, end, p, "ok"); if (straight) out.push(straight); }
  }
  if (state.tool === "rect" && state.rectDraft && end) {
    var prep = prepareRoomCreate({
      from: state.rectDraft, to: end, thickness: p.thickness, height: p.height, loc: p.loc, dimSide: p.dimSide,
    });
    var tone = prep.ok ? "ok" : "blocked", r = rectOf(state.rectDraft, end), corners = rectCorners(r);
    var walls = prep.ok ? prep.plan.params.walls : corners.map(function (c, i) {
      return { from: c, to: corners[(i + 1) % 4], thickness: p.thickness, height: p.height, loc: p.loc, dimSide: p.dimSide };
    });
    walls.forEach(function (w) {
      var b = newWallBox(w.from, w.to, w, tone);
      if (b) out.push(b);
    });
    if (r.x1 - r.x0 > 0.5 && r.z1 - r.z0 > 0.5) out.push(floorPrism(r, tone));
  }
  if (state.tool === "slabvoid" && state.rectDraft && end) {
    var v = rectOf(state.rectDraft, end);
    if (v.x1 - v.x0 > 0.5 && v.z1 - v.z0 > 0.5)
      out.push(floorPrism(v, v.x1 - v.x0 >= SLAB_MIN && v.z1 - v.z0 >= SLAB_MIN ? "erase" : "blocked", SLAB_Y0, SLAB_Y1));
  }
  if (state.tool === "roomstamp" && state.roomGhost && state.roomGhost.rect) {
    var g = state.roomGhost, rr = g.rect, rc = rectCorners(rr), rt = g.blocked ? "blocked" : "ok";
    var stamp = { thickness: p.thickness, height: p.height, loc: "center", dimSide: 0 };
    rc.forEach(function (c, i) { var b = newWallBox(c, rc[(i + 1) % 4], stamp, rt); if (b) out.push(b); });
    out.push(floorPrism(rr, rt));
    if (g.corridor && !g.blocked) out.push(floorPrism(g.corridor, "edit"));
  }
  if (state.tool === "walloffset" && state.offsetDraft && state.offsetDraft.hostId != null) {
    var host = wallById(state, state.offsetDraft.hostId), nodes = state.nodes || [];
    var ha = host && nodes[host.a], hb = host && nodes[host.b];
    if (ha && hb) {
      // js/wall_draw.js offsetGhost: the host's node line moved `dist` to `side`
      var L = Math.hypot(hb.x - ha.x, hb.z - ha.z) || 1, ux = (hb.x - ha.x) / L, uz = (hb.z - ha.z) / L;
      var sgn = state.offsetDraft.side < 0 ? -1 : 1, dist = fin(state.offsetDraft.dist) && state.offsetDraft.dist > 0 ? state.offsetDraft.dist : 120;
      var nx = -uz * sgn * dist, nz = ux * sgn * dist;
      var ob = newWallBox({ x: ha.x + nx, z: ha.z + nz }, { x: hb.x + nx, z: hb.z + nz }, p, "ok");
      if (ob) out.push(ob);
    }
  }
}

/* The opening tools preview the opening.place plan for the wall under the
   pointer — the same resolver (S.wallProbe is hitWall's answer) and the same
   clamp and overlap refusal as the click. */
export function openingGhost(state, deps) {
  var tool = state.tool;
  if (tool !== "door" && tool !== "window" && tool !== "passage") return null;
  var wall = probeWall(state), at = cursorOf(state, deps);
  var info = wall && wallInfo(wall, state);
  if (!info || !at) return null;
  var proj = projectToWall(wall, at.x, at.z, info.nodes);
  if (!proj || !fin(proj.s)) return null;
  var def = (deps && deps.openingDefaults && deps.openingDefaults(tool)) || OPENING_DEFAULTS[tool];
  var params = { wallId: wall.id, type: tool, s: proj.s, width: def.width, height: def.height, sill: def.sill };
  var prep = prepareOpeningPlace(params, { state: state });
  var s = prep.ok ? prep.plan.params.s : Math.max(0, Math.min(info.L, proj.s));
  var centre = prep.ok ? previewOpeningPlace(prep.plan, { state: state }) : null;
  var c = centre ? centre.center : wallPoint(info, s), tg = wallTangent(info, s);
  if (!c || !tg) return null;
  return {
    box: {
      shape: "box", cx: c.x, cy: def.sill + def.height / 2, cz: c.z,
      w: def.width, h: def.height, d: info.T + 2, rotY: rotYAlong(tg.ux, tg.uz), tone: prep.ok ? "ok" : "blocked",
    },
    width: def.width, gap: Math.max(0, Math.min(s - def.width / 2, info.L - s - def.width / 2)),
    at: { x: c.x, y: def.sill + def.height + 12, z: c.z }, ok: !!prep.ok,
  };
}

function itemBox(pose, tone, pad) {
  pad = pad || 0;
  var y0 = num(pose.y0, 0), y1 = num(pose.y1, y0 + 80);
  return {
    shape: "box", cx: pose.x, cy: (y0 + y1) / 2 + pad / 2 - (pad ? 0.5 : 0), cz: pose.z,
    w: num(pose.w, 60) + pad, h: y1 - y0 + pad, d: num(pose.d, 60) + pad, rotY: rotYOfItem(pose.rot), tone: tone,
  };
}
/* A slim bar on the top front edge says which way a piece faces. */
function frontMarker(box) {
  var fx = Math.sin(box.rotY), fz = Math.cos(box.rotY), r = box.d / 2;
  return {
    shape: "box", cx: box.cx + fx * (r - 2), cy: box.cy + box.h / 2 - 2, cz: box.cz + fz * (r - 2),
    w: Math.max(6, Math.min(40, box.w * 0.5)), h: 4, d: 4, rotY: box.rotY, tone: "edit",
  };
}

function placementGhost(state, deps, out) {
  if (!state.placeType || (state.tool && state.tool !== "select")) return;
  var spec = deps && deps.catalog && deps.catalog[state.placeType];
  var at = (deps && deps.cursor) || state.previewPt;
  if (!spec || !at || !fin(at.x) || !fin(at.z)) return;
  var pose = deps.placePose ? deps.placePose(state.placeType, at.x, at.z) : null;
  if (!pose) pose = { x: snap2(at.x), z: snap2(at.z), rot: 0, w: spec.w || 60, d: spec.d || 60, y0: 0, y1: spec.h || 80 };
  var box = itemBox(pose, "ok");
  out.push(box, frontMarker(box));
}

function fitCabGhost(state, deps, out) {
  if (state.tool !== "fitcab" || !deps || !deps.fitCabDraft) return;
  var d = deps.fitCabDraft(), b = d && d.box;
  if (!b) return;
  var y0 = fin(b.elev) ? b.elev : 0; // a hung box stands at its real height
  var box = itemBox({ x: b.x, z: b.z, w: b.w, d: b.d, rot: b.rot, y0: y0, y1: y0 + b.h }, "ok");
  out.push(box, frontMarker(box));
}

function wallEditTools(state, deps, out) {
  var tool = state.tool;
  if (state.biteDraft) {
    var bw = wallById(state, state.biteDraft.wall), bi = bw && wallInfo(bw, state);
    if (bi) {
      var lo = Math.max(0, Math.min(state.biteDraft.s0, state.biteDraft.s1));
      var hi = Math.min(bi.L, Math.max(state.biteDraft.s0, state.biteDraft.s1));
      wallSpanBoxes(bi, lo, hi, hi - lo >= BITE_MIN ? "erase" : "blocked", PAD).forEach(function (b) { out.push(b); });
    }
    return;
  }
  if (tool !== "wallbreak" && tool !== "walljoin" && tool !== "wallreverse" && tool !== "wallpaint" && tool !== "wallbite") return;
  var wall = probeWall(state);
  if (tool === "walljoin" && state.joinPick && state.joinPick !== wall)
    wallHover(state.joinPick, state, "edit").forEach(function (b) { out.push(b); });
  if (!wall) return;
  wallHover(wall, state, "edit").forEach(function (b) { out.push(b); });
  if (tool === "wallbreak") {
    var info = wallInfo(wall, state), at = cursorOf(state, deps);
    var pr = info && at && projectToWall(wall, at.x, at.z, info.nodes);
    var q = pr && wallPoint(info, pr.s), tg = pr && wallTangent(info, pr.s);
    if (q && tg) out.push({
      shape: "box", cx: q.x, cy: info.H / 2, cz: q.z, w: 3, h: info.H + 16, d: info.T + 14,
      rotY: rotYAlong(tg.ux, tg.uz), tone: pr.s < BREAK_END || pr.s > info.L - BREAK_END ? "blocked" : "edit",
    });
  }
}

function openingBoxOf(o, state, tone) {
  var w = wallById(state, o.wall), info = w && wallInfo(w, state);
  if (!info) return null;
  var s = Math.max(0, Math.min(info.L, num(o.s, 0))), c = wallPoint(info, s), tg = wallTangent(info, s);
  var sill = num(o.sill, 0), h = num(o.height, 200);
  return c && tg ? {
    shape: "box", cx: c.x, cy: sill + h / 2, cz: c.z, w: num(o.width, 90) + PAD, h: h + PAD,
    d: info.T + PAD + 2, rotY: rotYAlong(tg.ux, tg.uz), tone: tone,
  } : null;
}

function eraseGhost(state, deps, out) {
  if (state.tool !== "erase" || !state.eraseHover || !state.eraseHover.ref) return;
  var h = state.eraseHover, ref = h.ref;
  if (h.kind === "wall") wallHover(ref, state, "erase").forEach(function (b) { out.push(b); });
  else if (h.kind === "item") {
    var span = deps && deps.itemSpan ? deps.itemSpan(ref) : null;
    var y0 = span && fin(span.lo) ? span.lo : num(ref.elev, 0), y1 = span && fin(span.hi) ? span.hi : y0 + num(ref.h, 80);
    out.push(itemBox({ x: ref.x, z: ref.z, w: ref.w, d: ref.d, rot: ref.rot, y0: y0, y1: y1 }, "erase", PAD));
  } else if (h.kind === "opening") {
    var ob = openingBoxOf(ref, state, "erase");
    if (ob) out.push(ob);
  } else if (h.kind === "marker" && fin(ref.x) && fin(ref.z)) {
    out.push(pinBoxes(ref, "erase")[1]);
  }
}

function pinBoxes(p, tone) {
  var y = fin(p.y) ? p.y : 0;
  return [
    { shape: "box", cx: p.x, cy: y + 10, cz: p.z, w: 2, h: 20, d: 2, rotY: 0, tone: tone },
    { shape: "box", cx: p.x, cy: y + 24, cz: p.z, w: 8, h: 8, d: 8, rotY: 0, tone: tone },
  ];
}

function mepGhost(state, deps, out) {
  var mep = state.mep;
  if (state.tool === "mepRoute" && mep && mep.route && mep.route.pts && mep.route.pts.length) {
    var r = mep.route, pts = r.pts.slice(), last = pts[pts.length - 1];
    if (r.previewPath && r.previewPath.length)
      r.previewPath.forEach(function (p) { if (!(p.x === last.x && p.z === last.z)) pts.push(p); });
    else if (r.preview && fin(r.preview.x) && fin(r.preview.z)) pts.push(r.preview);
    var y = deps && deps.mepRunY ? num(deps.mepRunY(r), 30) : 30;
    var line = [];
    pts.forEach(function (p) {
      var q = line[line.length - 1];
      if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 0.5) line.push({ x: p.x, y: y, z: p.z });
    });
    if (line.length >= 2) out.push({ shape: "tube", pts: line, r: 3, tone: r.previewBlocked ? "blocked" : "ok" });
  }
  if (state.tool === "mepNode" && deps && deps.mepNodeAt) {
    var at = cursorOf(state, deps), n = at && deps.mepNodeAt(at.x, at.z);
    if (n && fin(n.x) && fin(n.z))
      out.push({ shape: "box", cx: n.x, cy: num(n.y, 30), cz: n.z, w: 12, h: 12, d: 6, rotY: 0, tone: "ok" });
  }
  if (state.tool === "point" && state.markerPreview && fin(state.markerPreview.x) && fin(state.markerPreview.z))
    pinBoxes(state.markerPreview, "ok").forEach(function (b) { out.push(b); });
}

/** Every primitive the active tool would build right now ([] when idle). */
export function ghostSpecs(state, deps) {
  var out = [];
  if (!state) return out;
  deps = deps || {};
  wallTools(state, deps, out);
  var op = openingGhost(state, deps);
  if (op) out.push(op.box);
  placementGhost(state, deps, out);
  fitCabGhost(state, deps, out);
  wallEditTools(state, deps, out);
  eraseGhost(state, deps, out);
  mepGhost(state, deps, out);
  return out.filter(function (s) {
    if (s.shape === "box") return [s.cx, s.cy, s.cz, s.w, s.h, s.d, s.rotY].every(fin) && s.w > 0 && s.h > 0 && s.d > 0;
    return Array.isArray(s.pts) && s.pts.length >= 2;
  });
}

/* Labels the 3D HUD adds next to the volumes (the sizes a 2D plan prints on
   the same drafts): { x, y, z, lens: [cm...], gap?: cm, tone }. */
export function ghostLabels(state, deps) {
  var out = [], p = drawDefaults(deps), end = state && state.previewPt;
  if (!state) return out;
  if (state.tool === "rect" && state.rectDraft && end) {
    var r = rectOf(state.rectDraft, end);
    out.push({ x: (r.x0 + r.x1) / 2, y: p.height + 20, z: (r.z0 + r.z1) / 2, lens: [r.x1 - r.x0, r.z1 - r.z0], tone: "ok" });
  }
  if (state.tool === "slabvoid" && state.rectDraft && end) {
    var v = rectOf(state.rectDraft, end);
    out.push({ x: (v.x0 + v.x1) / 2, y: 10, z: (v.z0 + v.z1) / 2, lens: [v.x1 - v.x0, v.z1 - v.z0], tone: "erase" });
  }
  if (state.tool === "roomstamp" && state.roomGhost && state.roomGhost.rect && state.roomGhost.size) {
    var g = state.roomGhost, rr = g.rect;
    out.push({ x: (rr.x0 + rr.x1) / 2, y: p.height + 20, z: (rr.z0 + rr.z1) / 2, lens: [g.size.w, g.size.d], tone: g.blocked ? "blocked" : "ok" });
  }
  var op = openingGhost(state, deps || {});
  if (op) out.push({ x: op.at.x, y: op.at.y, z: op.at.z, lens: [op.width], gap: op.gap, tone: op.ok ? "ok" : "blocked" });
  return out;
}

function round1(k, v) { return typeof v === "number" ? Math.round(v * 10) / 10 : v; }
/** A cheap identity for a spec list, so an unchanged draft costs nothing. */
export function ghostSignature(specs) {
  return JSON.stringify(specs || [], round1);
}
