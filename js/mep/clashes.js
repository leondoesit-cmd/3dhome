/* MEP signatures, 3D segment approach and clash detection, split out of
   js/mep.js. It shares the editor's state through live imports from ../mep.js.
   */
import { detectRooms, distSeg, wallGeom } from "../geometry.js";
import { layerRank } from "../layers.js";
import { makeRouter } from "../mep_route.js";
import { drawNode, drawRoutePreview, drawRun } from "../mep/drawing.js";
import { computeMEPFlow, computeMEPStatus } from "../mep/routing.js";
import { nodePos, runLength } from "../mep/topology.js";
import { S, clamp, fin } from "../state.js";
import {
  _aliveCount, _mepRot, _sig, _state, ensureMEP, mepLayerVisible, mepVisible,
  nodeKindDef, runKindDef, runPointY, set__aliveCount, set__mepRot, set__sig,
  set__state,
} from "../mep.js";

// Integer signature of everything computeMEPStatus/computeMEPFlow reads.
// A weighted float sum used to cancel when two devices moved by opposite
// amounts, and it ignored endpoint ids — linking a run with a/b kept the
// previous "orphan" answer until something else moved.
function mixNum(h, n) {
  return Math.imul(h ^ (n | 0), 16777619) >>> 0;
}
function mixStr(h, str) {
  str = str == null ? "" : String(str);
  for (var i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}
function mepSignature(m) {
  var h = 2166136261;
  h = mixNum(h, m.nodes.length);
  h = mixNum(h, m.runs.length);
  h = mixStr(h, JSON.stringify(m.circuits || []));
  // Host geometry changes the world position of wall-attached devices and
  // the height of ceiling routes, even when the MEP objects are untouched.
  (S.nodes || []).forEach(function (p) {
    h = mixNum(h, Math.round((p.x || 0) * 10));
    h = mixNum(h, Math.round((p.z || 0) * 10));
  });
  (S.walls || []).forEach(function (wall) {
    h = mixStr(h, wall.id);
    h = mixNum(h, wall.a);
    h = mixNum(h, wall.b);
    h = mixNum(h, Math.round((wall.height || 0) * 10));
  });
  // Gas-through-bedroom depends on the rooms and where the beds are, not only
  // on the pipe. Hashing them keeps the warning current when a bed moves.
  detectRooms().forEach(function (room) {
    var meta = (S.roomMeta || {})[room.key] || {};
    h = mixStr(h, room.key);
    h = mixStr(h, meta.name);
    h = mixStr(h, meta.roomType);
    h = mixNum(h, Math.round(room.cx || 0));
    h = mixNum(h, Math.round(room.cz || 0));
  });
  (S.items || []).forEach(function (it) {
    if (!it || (it.type !== "bed" && it.type !== "cooktop")) return;
    h = mixStr(h, it.type);
    h = mixNum(h, Math.round(it.x || 0));
    h = mixNum(h, Math.round(it.z || 0));
  });
  m.nodes.forEach(function (n) {
    var p = nodePos(n);
    h = mixNum(h, Math.round(p.x * 10));
    h = mixNum(h, Math.round(p.z * 10));
    h = mixNum(h, Math.round((n.elev || 0) * 10));
    h = mixStr(h, n.id);
    h = mixStr(h, n.sys);
    h = mixStr(h, n.k);
    h = mixStr(h, n.layer);
    h = mixStr(h, n.wall);
  });
  m.runs.forEach(function (r) {
    h = mixStr(h, r.id);
    h = mixStr(h, r.sys);
    h = mixStr(h, r.k);
    h = mixStr(h, r.layer);
    h = mixStr(h, r.a);
    h = mixStr(h, r.b);
    h = mixStr(h, r.circuitId);
    h = mixNum(h, r.explicit ? 1 : 0);
    h = mixNum(h, Math.round((r.dia || 0) * 10));
    h = mixNum(h, r.elev == null ? 2147483647 : Math.round(r.elev * 10));
    h = mixNum(h, r.exposed ? 1 : 0);
    h = mixNum(h, Math.round((r.fall || 0) * 10));
    h = mixNum(h, r.pts ? r.pts.length : 0);
    if (!r.pts) return;
    r.pts.forEach(function (p) {
      h = mixNum(h, Math.round(p.x * 10));
      h = mixNum(h, Math.round(p.z * 10));
    });
  });
  return h;
}
// Closest points on two finite 3D segments. Plane labels and overlapping plan
// projections are not enough to establish that two services occupy one space.
function segSegApproach3D(a0, a1, b0, b1) {
  var u = [a1.x - a0.x, a1.y - a0.y, a1.z - a0.z];
  var v = [b1.x - b0.x, b1.y - b0.y, b1.z - b0.z];
  var w = [a0.x - b0.x, a0.y - b0.y, a0.z - b0.z];
  var dot = function(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  var aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w);
  if (aa < 1e-9 || cc < 1e-9) return null;
  var D = aa * cc - bb * bb, sn, sd = D, tn, td = D;
  if (D < 1e-9) { sn = 0; sd = 1; tn = ee; td = cc; }
  else {
    sn = bb * ee - cc * dd; tn = aa * ee - bb * dd;
    if (sn < 0) { sn = 0; tn = ee; td = cc; }
    else if (sn > sd) { sn = sd; tn = ee + bb; td = cc; }
  }
  if (tn < 0) {
    tn = 0;
    if (-dd < 0) sn = 0;
    else if (-dd > aa) sn = sd;
    else { sn = -dd; sd = aa; }
  } else if (tn > td) {
    tn = td;
    if (-dd + bb < 0) sn = 0;
    else if (-dd + bb > aa) sn = sd;
    else { sn = -dd + bb; sd = aa; }
  }
  var s = Math.abs(sn) < 1e-9 ? 0 : sn / sd;
  var t = Math.abs(tn) < 1e-9 ? 0 : tn / td;
  var p = { x: a0.x + s * u[0], y: a0.y + s * u[1], z: a0.z + s * u[2] };
  var q = { x: b0.x + t * v[0], y: b0.y + t * v[1], z: b0.z + t * v[2] };
  return { d: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2, yA: p.y, yB: q.y, z: (p.z + q.z) / 2 };
}
export function computeMEPClashes() {
  var m = ensureMEP(), out = [];
  function clearance(a, b) {
    return Math.max(4, ((fin(a.dia) ? a.dia : 2) + (fin(b.dia) ? b.dia : 2)) / 2);
  }
  function halfHeight(r) {
    var kind = runKindDef(r.sys, r.k);
    return kind && kind.rect ? r.dia * (kind.hRatio || 0.6) / 2 : r.dia / 2;
  }
  for (var i = 0; i < m.runs.length; i++) {
    var A = m.runs[i];
    if (!A.pts || A.pts.length < 2) continue;
    for (var j = i + 1; j < m.runs.length; j++) {
      var B = m.runs[j];
      if (A.sys === B.sys || !B.pts || B.pts.length < 2) continue;
      var gap = clearance(A, B), best = null;
      var ay = runPointY(A), by = runPointY(B);
      for (var ia = 1; ia < A.pts.length; ia++) {
        for (var ib = 1; ib < B.pts.length; ib++) {
          var a0 = { x: A.pts[ia - 1].x, y: ay[ia - 1], z: A.pts[ia - 1].z };
          var a1 = { x: A.pts[ia].x, y: ay[ia], z: A.pts[ia].z };
          var b0 = { x: B.pts[ib - 1].x, y: by[ib - 1], z: B.pts[ib - 1].z };
          var b1 = { x: B.pts[ib].x, y: by[ib], z: B.pts[ib].z };
          var hit = segSegApproach3D(a0, a1, b0, b1);
          // Ducts are rectangular. Their plan width is not their vertical
          // radius; a cable above a duct can clear its top even when the
          // centre distance is less than half the duct width.
          var kindA = runKindDef(A.sys, A.k), kindB = runKindDef(B.sys, B.k);
          var verticalGap = Math.max(0,
            Math.min(a0.y, a1.y) - Math.max(b0.y, b1.y),
            Math.min(b0.y, b1.y) - Math.max(a0.y, a1.y));
          if (hit && ((kindA && kindA.rect) || (kindB && kindB.rect)) &&
            verticalGap >= halfHeight(A) + halfHeight(B) + 2) continue;
          if (hit && hit.d < gap && (!best || hit.d < best.d)) best = hit;
        }
      }
      if (!best) continue;
      out.push({
        a: A.id, b: B.id, sysA: A.sys, kA: A.k, sysB: B.sys, kB: B.k,
        layerA: A.layer, layerB: B.layer, x: best.x, y: best.y, z: best.z,
        separationCm: best.d, clearanceCm: gap,
      });
    }
  }
  return out;
}

// cached { status, flow, clashes } — recomputed only when the network signature changes
export function getMEPState() {
  var m = ensureMEP();
  var sig = mepSignature(m);
  if (sig !== _sig) {
    set__sig(sig);
    set__state({ status: computeMEPStatus(), flow: computeMEPFlow(), clashes: computeMEPClashes() });
  }
  return _state;
}

// Bill of materials: run lengths (metres) per kind + device counts per kind,
// each costed. Feeds the cost estimate + CSV export.
export function mepBOM() {
  var m = ensureMEP();
  var runG = {}, devG = {}, total = 0;
  m.runs.forEach(function (r) {
    var key = r.sys + "." + r.k, d = runKindDef(r.sys, r.k) || {};
    var g = runG[key] || (runG[key] = { sys: r.sys, k: r.k, meters: 0, ppm: d.pricePerM || 0 });
    g.meters += runLength(r) / 100;
  });
  m.nodes.forEach(function (n) {
    var key = n.sys + "." + n.k, d = nodeKindDef(n.sys, n.k) || {};
    var g = devG[key] || (devG[key] = { sys: n.sys, k: n.k, qty: 0, price: d.price || 0 });
    g.qty++;
  });
  var runs = Object.keys(runG).map(function (k) {
    var g = runG[k]; g.cost = g.meters * g.ppm; total += g.cost; return g;
  });
  var devices = Object.keys(devG).map(function (k) {
    var g = devG[k]; g.cost = g.qty * g.price; total += g.cost; return g;
  });
  return { runs: runs, devices: devices, total: total };
}

/* ---- snapping ------------------------------------------------------------ */
// Snap a placement/route point. Priority: existing MEP node → wall centerline
// (returns wall + parametric s so the point sits "in" the wall) → 5cm grid.
export function snapMEPPoint(px, pz) {
  var m = ensureMEP();
  var tolN = 14 / S.SC; // node snap radius (screen px → world)
  var tolW = 16 / S.SC; // wall snap radius
  // 1) snap to an existing node
  var bestN = null, bd = tolN;
  m.nodes.forEach(function (n) {
    var p = nodePos(n), d = Math.hypot(px - p.x, pz - p.z);
    if (d < bd) { bd = d; bestN = { x: p.x, z: p.z, node: n }; }
  });
  if (bestN) return bestN;
  // 2) project onto the nearest wall centerline
  var bestW = null, bwd = tolW;
  S.walls.forEach(function (w) {
    var g = wallGeom(w);
    var t = ((px - g.a.x) * g.ux + (pz - g.a.z) * g.uz);
    t = clamp(t, 0, g.L);
    var qx = g.a.x + g.ux * t, qz = g.a.z + g.uz * t;
    var d = Math.hypot(px - qx, pz - qz);
    if (d < bwd) { bwd = d; bestW = { x: qx, z: qz, wall: w.id, s: t }; }
  });
  if (bestW) return bestW;
  // 3) grid
  return { x: Math.round(px / 5) * 5, z: Math.round(pz / 5) * 5 };
}

/* Expand one drawn segment A→B into the path the trade would actually take:
   along the wall graph, round doorways for a wall-layer chase, with a single
   perpendicular spur where an endpoint stands away from a wall. Returns the
   vertices AFTER `a` (the caller already holds `a`), or just [b] when the two
   points are effectively on the same straight wall run. */
export function wallPath(a, b, layer) {
  var net = makeRouter(layer === "wall"); // ceiling/floor may pass above/below a door
  var ta = net.tap(a, a.wall, a.s);
  var tb = net.tap(b, b.wall, b.s);
  var pts = net.path(ta, tb).pts;
  if (pts.length < 2) return null;
  return pts.slice(1).map(function (p) { return { x: p.x, z: p.z }; });
}

// CAD angle helper: from the previous vertex to the raw cursor, optionally snap
// the direction to 15° increments AND to any wall direction, then snap length to
// 5cm. Returns the resolved point plus readouts for the on-screen HUD.
export function routeResolve(prev, px, pz, prevDir) {
  var dx = px - prev.x, dz = pz - prev.z;
  var len = Math.hypot(dx, dz);
  var ang = Math.atan2(dz, dx); // radians
  var m = ensureMEP();
  // first, let a nearby node/wall win (hard snap) — routing should latch to devices
  var hard = snapMEPPoint(px, pz);
  if (hard.node || hard.wall != null) {
    var hdx = hard.x - prev.x, hdz = hard.z - prev.z;
    return {
      x: hard.x, z: hard.z,
      len: Math.hypot(hdx, hdz),
      ang: Math.atan2(hdz, hdx),
      snapped: true,
      hard: hard,
    };
  }
  if (m.snapAngle && len > 1) {
    // candidate directions: every 15°, plus each wall's orientation (±)
    var cands = [];
    for (var a = 0; a < 360; a += 15) cands.push((a * Math.PI) / 180);
    S.walls.forEach(function (w) {
      var g = wallGeom(w);
      cands.push(g.ang);
      cands.push(g.ang + Math.PI);
    });
    var best = ang, bestDiff = 1e9;
    cands.forEach(function (c) {
      var diff = Math.abs(angDelta(ang, c));
      if (diff < bestDiff) { bestDiff = diff; best = c; }
    });
    if (bestDiff < (12 * Math.PI) / 180) ang = best; // within 12° → snap
  }
  len = Math.round(len / 5) * 5;
  var x = prev.x + Math.cos(ang) * len;
  var z = prev.z + Math.sin(ang) * len;
  return { x: x, z: z, len: len, ang: ang, snapped: false, hard: null };
}
// smallest signed angular difference a-b in radians, wrapped to [-π,π]
function angDelta(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/* ---- hit testing (select tool) ------------------------------------------ */
// Returns the topmost MEP entity under the cursor. Nodes take priority over
// runs. For runs, `vi` is the index of a nearby vertex (for vertex dragging),
// else -1 (whole-run hit → move the run or just select).
export function hitMEP(px, pz, scale=S.SC) {
  /* Off the pointer entirely when the MEP layer is ghosted or hidden. Sockets,
     drains and cable vertices are the densest targets on the plan and they sit
     exactly where furniture wants to go, so a hidden MEP network that still
     answered clicks would be indistinguishable from a broken hit test. Rank 1
     (visible, but not the work set) still answers — the pointerdown chain
     consults it in its second pass and selects without dragging. */
  if (layerRank("mep") === Infinity) return null;
  if (!isFinite(scale) || scale <= 0) scale = 1;
  var m = ensureMEP();
  var tolN = 12 / scale, tolV = 9 / scale, tolR = 8 / scale;
  // nodes (visible systems only), nearest first
  var bn = null, bd = tolN;
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys) || !mepLayerVisible(n.layer)) return;
    var p = nodePos(n), d = Math.hypot(px - p.x, pz - p.z);
    if (d < bd) { bd = d; bn = n; }
  });
  if (bn) return { kind: "mepNode", ref: bn };
  // A vertex inside its own radius wins even when the stroke is closer.
  // Distance-to-segment is always ≤ distance-to-vertex for a point near the
  // line, so the old "then segments" pass cleared every vertex handle.
  var bv = null, bvd = tolV;
  var br = null, brd = tolR;
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer) || !r.pts) return;
    for (var i = 0; i < r.pts.length; i++) {
      var d = Math.hypot(px - r.pts[i].x, pz - r.pts[i].z);
      if (d < bvd) { bvd = d; bv = { r: r, vi: i }; }
    }
    for (var j = 1; j < r.pts.length; j++) {
      var ds = distSeg(px, pz, r.pts[j - 1].x, r.pts[j - 1].z, r.pts[j].x, r.pts[j].z);
      if (ds < brd) { brd = ds; br = r; }
    }
  });
  if (bv) return { kind: "mepRun", ref: bv.r, vi: bv.vi };
  if (br) return { kind: "mepRun", ref: br, vi: -1 };
  return null;
}

// number of visible, energised runs at the last draw — lets the render loop
// know whether the flow animation needs to keep ticking.
export function mepAliveCount() { return _aliveCount; }

export function drawMEP(pc, sx, sz, label, phase, rot) {
  var m = ensureMEP();
  if (!m.show) return;
  set__mepRot(rot || 0);
  var state = getMEPState();
  var status = state.status, flow = state.flow;
  var animate = m.animate !== false;
  var alive = 0;
  // runs first, devices on top
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer)) return;
    var f = flow[r.id];
    if (f && f.alive && f.flow !== "signal" && f.flow !== "vent") alive++;
    drawRun(pc, sx, sz, r, status.run[r.id], f, animate ? phase || 0 : null);
  });
  set__aliveCount(alive);
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys) || !mepLayerVisible(n.layer)) return;
    drawNode(pc, sx, sz, n, status.node[n.id]);
  });
  var clashSeen = {};
  (state.clashes || []).forEach(function (c) {
    if (!mepVisible(c.sysA) || !mepVisible(c.sysB)) return;
    // A floor-only drawing must not retain warnings for hidden wall/ceiling
    // routes; those markers otherwise look like unexplained defects on pipes.
    if (!mepLayerVisible(c.layerA) || !mepLayerVisible(c.layerB)) return;
    var key = Math.round(c.x) + ":" + Math.round(c.z);
    if (clashSeen[key]) return;
    clashSeen[key] = 1;
    smallBadge(pc, sx(c.x), sz(c.z), "#b91c1c", "×");
  });
  // in-progress route preview + CAD angle HUD
  if (m.route && m.route.pts.length) drawRoutePreview(pc, sx, sz, label, m.route);
}
// point at half the polyline length (for placing a run's warning badge)
function runMidpoint(r) {
  var total = runLength(r), half = total / 2, acc = 0;
  for (var i = 1; i < r.pts.length; i++) {
    var a = r.pts[i - 1], b = r.pts[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + seg >= half) {
      var tt = (half - acc) / (seg || 1);
      return { x: a.x + (b.x - a.x) * tt, z: a.z + (b.z - a.z) * tt };
    }
    acc += seg;
  }
  return r.pts[0];
}
// small amber "!" badge marking an unsupplied entity (no hub upstream)
function warnBadge(pc, X, Y, color) {
  smallBadge(pc, X, Y, color, "!");
}
// slate tag showing the routing plane (C=ceiling, F=floor; wall has no tag)
function layerBadge(pc, X, Y, letter) {
  smallBadge(pc, X, Y, "#475569", letter);
}
function smallBadge(pc, X, Y, color, letter) {
  pc.beginPath();
  pc.arc(X, Y, 4.5, 0, 7);
  pc.fillStyle = color;
  pc.fill();
  pc.strokeStyle = "#fff";
  pc.lineWidth = 1;
  pc.stroke();
  pc.save();
  if (_mepRot) { pc.translate(X, Y); pc.rotate(-_mepRot); pc.translate(-X, -Y); } // upright
  pc.fillStyle = "#fff";
  pc.font = "700 6px system-ui, sans-serif";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  pc.fillText(letter, X, Y + 0.5);
  pc.restore();
}

export { layerBadge, runMidpoint, smallBadge, warnBadge };
