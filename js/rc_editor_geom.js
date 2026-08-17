// RC track editor — pure geometry, clearance tests and track validation.
//
// Leaf module: reads ST.D / ST.E, calls nothing that edits or redraws. Keeping
// it dependency-free is what lets the 2D map, the 3D handles and the editing
// actions all share it without an import cycle.
import {
  ST, GHOST_SEG, CLEAR_BAND, STEP_UP, L, fin, clamp,
} from "./rc_editor_state.js";

// Closest point on segment ab to p, as {x,z,t,d}.
export function nearOnSeg(ax, az, bx, bz, px, pz) {
  var dx = bx - ax,
    dz = bz - az,
    l2 = dx * dx + dz * dz;
  var tt = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  tt = clamp(tt, 0, 1);
  var x = ax + dx * tt,
    z = az + dz * tt;
  return { x: x, z: z, t: tt, d: Math.hypot(px - x, pz - z) };
}

// Where a new anchor should go: the closed-polygon edge it is nearest to.
// Returns {i} — the index the new point takes (i.e. after anchor i-1).
export function insertSpot(pts, x, z) {
  var n = pts.length;
  if (n < 2) return { i: n, d: 0 };
  var best = null;
  for (var i = 0; i < n; i++) {
    var a = pts[i],
      b = pts[(i + 1) % n];
    var h = nearOnSeg(a.x, a.z, b.x, b.z, x, z);
    if (!best || h.d < best.d) best = { i: i + 1, d: h.d, hx: h.x, hz: h.z };
  }
  return best;
}

export function anchorAt(pts, x, z, r) {
  var bi = -1,
    bd = r;
  for (var i = 0; i < pts.length; i++) {
    var d = Math.hypot(pts[i].x - x, pts[i].z - z);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

export function segmentAt(pts, x, z, r) {
  var best = null;
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i],
      b = pts[(i + 1) % pts.length];
    var h = nearOnSeg(a.x, a.z, b.x, b.z, x, z);
    if (h.d <= r && (!best || h.d < best.d)) best = { i: i, d: h.d, x: h.x, z: h.z };
  }
  return best ? best.i : -1;
}

export function segmentMid(i) {
  var a = ST.D.anchors[i],
    b = ST.D.anchors[(i + 1) % ST.D.anchors.length];
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

export function anchorY(a) {
  return fin(a && a.y) ? a.y : 0.7;
}

export function segmentY(i) {
  if (i < 0 || !ST.D.anchors.length) return 0.7;
  return (anchorY(ST.D.anchors[i]) + anchorY(ST.D.anchors[(i + 1) % ST.D.anchors.length])) / 2;
}

// Closed Catmull-Rom through the anchors — the route preview, matching how
// track.js will smooth it.
export function ghostLine(pts) {
  var n = pts.length,
    out = [];
  if (n < 2) return out;
  if (n === 2) return [pts[0], pts[1], pts[0]];
  for (var i = 0; i < n; i++) {
    var p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n],
      p3 = pts[(i + 2) % n];
    for (var k = 0; k < GHOST_SEG; k++) {
      var u = k / GHOST_SEG,
        u2 = u * u,
        u3 = u2 * u;
      var q = {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3),
      };
      if (fin(p1.y) || fin(p2.y)) {
        var y1 = anchorY(p1),
          y2 = anchorY(p2),
          ease = u * u * (3 - 2 * u);
        q.y = y1 + (y2 - y1) * ease;
      }
      out.push(q);
    }
  }
  out.push(out[0]);
  return out;
}

export function pathLen(pts) {
  var l = 0;
  for (var i = 1; i < pts.length; i++)
    l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return l;
}

export function halfRoad() {
  return (ST.E.cfg.roadWidth || 26) / 2;
}

// Distance from (x,z) to the nearest blocking wall face (negative inside it).
// Doors are opened for RC mode, so doorSegs are floor the truck can use.
export function segClear(segs, x, z) {
  var best = 1e6;
  for (var i = 0; i < (segs || []).length; i++) {
    var s = segs[i];
    var d = nearOnSeg(s.ax, s.az, s.bx, s.bz, x, z).d - s.half;
    if (d < best) best = d;
  }
  return best;
}

export function wallClear(x, z) {
  var col = ST.E.col();
  return col ? segClear(col.segs, x, z) : 1e6;
}

// Same for furniture, but only boxes that actually stand in the way at deck
// height y — the deck flies over a 40cm counter and under a wall unit.
export function rectsClear(rects, x, z, y) {
  var best = 1e6;
  for (var i = 0; i < (rects || []).length; i++) {
    var rc = rects[i];
    if (!(rc.y0 < y + CLEAR_BAND && rc.y1 > y + STEP_UP)) continue;
    var d;
    if (x > rc.x0 && x < rc.x1 && z > rc.z0 && z < rc.z1)
      d = -Math.min(x - rc.x0, rc.x1 - x, z - rc.z0, rc.z1 - z);
    else d = Math.hypot(x - clamp(x, rc.x0, rc.x1), z - clamp(z, rc.z0, rc.z1));
    if (d < best) best = d;
  }
  return best;
}

export function rectClear(x, z, y) {
  var col = ST.E.col();
  return col ? rectsClear(col.rects, x, z, y) : 1e6;
}

export function clearAt(x, z, y) {
  return Math.min(wallClear(x, z), rectClear(x, z, y));
}

// Nearest spot where the WHOLE ROAD fits, not just a truck: E.freeSpot() clears
// a 12cm car, so dropping a point 13cm from a wall passed that test and then
// built a deck through the plaster.
export function roomySpot(x, z, y) {
  var need = halfRoad() + 1.5;
  if (clearAt(x, z, y) >= need) return { x: x, z: z };
  var best = null;
  for (var rad = 5; rad <= 120; rad += 5) {
    for (var a = 0; a < 16; a++) {
      var ang = (a / 16) * Math.PI * 2;
      var px = x + Math.cos(ang) * rad,
        pz = z + Math.sin(ang) * rad;
      var c = clearAt(px, pz, y);
      if (c >= need) return { x: px, z: pz };
      if (!best || c > best.c) best = { x: px, z: pz, c: c };
    }
    if (best && best.c >= need) break;
  }
  var fb = ST.E.freeSpot(x, z);
  return best && best.c > clearAt(fb.x, fb.z, y) ? { x: best.x, z: best.z } : fb;
}

// Everything wrong with the current route, as flags per anchor / per leg plus a
// walkable list for the ⚠ chip. Never called while a handle is moving.
export function validate() {
  var n = ST.D.anchors.length,
    out = { pts: [], segs: [], list: [] };
  for (var i = 0; i < n; i++) {
    out.pts.push(null);
    out.segs.push(null);
  }
  if (n < 3 || !ST.E.col()) return out;
  function flag(arr, i, sev, kind, msg) {
    if (!arr[i] || sev > arr[i].sev) arr[i] = { sev: sev, kind: kind, msg: msg };
    out.list.push({ at: arr === out.pts ? "pt" : "seg", i: i, sev: sev, kind: kind, msg: msg });
  }
  var need = halfRoad(),
    w = need * 2;
  var line = ghostLine(ST.D.anchors); // n * GHOST_SEG samples, span i first
  for (i = 0; i < n; i++) {
    var a = ST.D.anchors[i],
      b = ST.D.anchors[(i + 1) % n],
      prev = ST.D.anchors[(i - 1 + n) % n];
    // the anchor itself
    if (clearAt(a.x, a.z, anchorY(a)) < need)
      flag(out.pts, i, 2, "blocked", L("נקודה " + (i + 1) + " צמודה מדי לקיר/רהיט", "Point " + (i + 1) + " is too close to a wall or furniture"));
    // the leg: worst clearance along the smoothed span
    var worst = 1e6;
    for (var k = 0; k < GHOST_SEG; k++) {
      var p = line[i * GHOST_SEG + k];
      if (!p) break;
      var c = clearAt(p.x, p.z, fin(p.y) ? p.y : anchorY(a));
      if (c < worst) worst = c;
    }
    if (worst < need * 0.72)
      flag(out.segs, i, 2, "clip", L("מקטע " + (i + 1) + " חותך קיר או רהיט", "Section " + (i + 1) + " cuts through a wall or furniture"));
    var leg = Math.hypot(b.x - a.x, b.z - a.z);
    if (leg < w * 0.9)
      flag(out.segs, i, 1, "short", L("מקטע " + (i + 1) + " קצר מרוחב הכביש", "Section " + (i + 1) + " is shorter than the road is wide"));
    var dy = Math.abs(anchorY(b) - anchorY(a));
    if (leg > 1 && dy / leg > 0.5)
      flag(out.segs, i, 1, "steep", L("מקטע " + (i + 1) + " תלול מדי לטיפוס", "Section " + (i + 1) + " is too steep to climb"));
    // corner: how hard the deck has to bend here
    var l1 = Math.hypot(a.x - prev.x, a.z - prev.z);
    var turn = Math.abs(angDiff(Math.atan2(a.z - prev.z, a.x - prev.x), Math.atan2(b.z - a.z, b.x - a.x)));
    if (turn > 1.75 && Math.min(l1, leg) < w * 1.6)
      flag(out.pts, i, 1, "tight", L("פנייה " + (i + 1) + " חדה מדי", "Turn " + (i + 1) + " is too sharp"));
  }
  out.list.sort(function (p, q) {
    return q.sev - p.sev;
  });
  return out;
}

export function angDiff(a, b) {
  var d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
