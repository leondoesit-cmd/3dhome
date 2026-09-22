// Automatic MEP rough-in: turn a furnished plan into an installable first-fix
// layout for electrics, water, drainage, comms and ducted air conditioning.
//
// The rules here are the ones a designer actually works to, not "put a dot in
// the middle of the room":
//   * Devices sit in a FREE SPAN of wall — clear of the corners, clear of door
//     and window reveals, clear of the wet zone around a shower or bath — and
//     no two land on top of each other, including on a wall shared by two rooms.
//   * Mounting heights come from the device's job (socket 30, switch 110,
//     counter socket 115, WC supply 25, shower supply 110, panel 150 …).
//   * Every run is routed on the wall graph by mep_route.js, so cables sit in
//     chases and pipes follow the walls instead of cutting diagonally across
//     rooms and straight through walls.
//   * Topology follows the trade: lighting is a ceiling circuit that drops to
//     its switches, sockets are chained radial circuits, ovens/washers/the
//     condenser get dedicated circuits, water is a home-run star off a
//     manifold, comms is a star off the rack, drainage and ductwork are
//     branching TREES that grow off a shared trunk, and waste pipes fall.
//
// Everything is a rough-in: the user is expected to drag it around afterwards,
// which is exactly why devices are wall-attached (they ride wall edits) and
// runs are re-routable polylines.

import { S, clamp } from "./state.js";
import { wallGeom, detectRooms, pointInPoly, roomName, wallById } from "./geometry.js";
import {
  ensureMEP, addNode, addRun, nodePos, autoConnectAll,
  connectMissingMEP, applyRoutingPolicies, generationLayer, roomIsBedroom,
} from "./mep.js";
import { makeRouter, concatPath, pathLength, splitTail } from "./mep_route.js";

/* ---- rule constants ------------------------------------------------------ */
// Mounting heights above finished floor (cm).
var H = {
  socket: 30,
  socketCounter: 115, // above a 90cm worktop + backsplash
  socketAppliance: 60, // behind a dishwasher / washing machine
  socketHigh: 180, // above a fridge / for a wall-hung TV feed
  socketTV: 120,
  switch: 110,
  panel: 150,
  port: 30,
  thermostat: 150,
  supplyWC: 25,
  supplySink: 55,
  supplyShower: 110,
  supplyBath: 75,
  supplyAppliance: 65,
  manifold: 50,
};
// Clearances and spacings (cm).
var C = {
  corner: 20, // keep a device this far from the end of a wall
  opening: 12, // ... and from the edge of a door or window reveal
  wet: 60, // no general socket within this of a shower/bath footprint
  apart: 28, // minimum gap between two devices on the same wall
  socketStep: 300, // longest gap between sockets around a room's perimeter
  minSpan: 40, // a free span shorter than this takes no device
  counterStep: 95, // spacing of worktop sockets
};
// Fixture rough-in: which services it needs and at what height.
var WET = {
  sink: { cold: 1, hot: 1, waste: 1, sup: H.supplySink },
  vanity: { cold: 1, hot: 1, waste: 1, sup: H.supplySink },
  toilet: { cold: 1, waste: 1, sup: H.supplyWC },
  shower: { cold: 1, hot: 1, waste: 1, sup: H.supplyShower, wetzone: 1 },
  bathtub: { cold: 1, hot: 1, waste: 1, sup: H.supplyBath, wetzone: 1 },
  dishwasher: { cold: 1, waste: 1, sup: H.supplyAppliance, appliance: 1 },
  washer: { cold: 1, waste: 1, sup: H.supplyAppliance, appliance: 1 },
};
// Appliances that get their own circuit rather than sharing the ring.
var DEDICATED = { oven: 1, cooktop: 1, washer: 1 };
// Appliances that take a gas point and a shutoff. A bedroom never gets the meter.
var GAS_APPLIANCE = { cooktop: 1, oven: 1, boiler: 1, waterheater: 1 };
// Appliances fed from the kitchen circuit at appliance height.
var APPLIANCE = { dishwasher: H.socketAppliance, fridge: H.socketHigh };
var MAX_LIGHTS_PER_CIRCUIT = 10;
var MAX_SOCKETS_PER_CIRCUIT = 8;
var WASTE_FALL = 0.02; // 2% — the fall a 50mm waste pipe is laid to
var COND_FALL = 0.01; // 1% on the air-conditioning condensate line

/* ---- small geometry helpers --------------------------------------------- */
function wallPointAt(id, s) {
  var w = wallById(id);
  if (!w) return null;
  var g = wallGeom(w);
  s = clamp(s, 0, g.L);
  return { x: g.a.x + g.ux * s, z: g.a.z + g.uz * s, wall: id, s: s, L: g.L };
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
// s of the perpendicular projection of p onto a wall, plus the offset distance
function projectOnWall(w, p) {
  var g = wallGeom(w);
  var t = (p.x - g.a.x) * g.ux + (p.z - g.a.z) * g.uz;
  var tc = clamp(t, 0, g.L);
  return { s: tc, off: Math.hypot(p.x - (g.a.x + g.ux * tc), p.z - (g.a.z + g.uz * tc)), L: g.L };
}
// The walls bounding a room, in cycle order, each with its inward normal.
function roomWalls(r) {
  var out = [];
  for (var i = 0; i < r.nidx.length; i++) {
    var a = r.nidx[i], b = r.nidx[(i + 1) % r.nidx.length];
    var w = null;
    for (var k = 0; k < S.walls.length; k++) {
      var ww = S.walls[k];
      if ((ww.a === a && ww.b === b) || (ww.a === b && ww.b === a)) { w = ww; break; }
    }
    if (!w) continue;
    var g = wallGeom(w);
    // probe both sides of the midpoint to find which way the room is
    var mx = (g.a.x + g.b.x) / 2, mz = (g.a.z + g.b.z) / 2;
    var nx = -g.uz, nz = g.ux;
    if (!pointInPoly(mx + nx * 12, mz + nz * 12, r.pts)) { nx = -nx; nz = -nz; }
    out.push({ w: w, g: g, nx: nx, nz: nz });
  }
  return out;
}
// A point guaranteed to be inside a (possibly L-shaped) room, biased to `pref`.
function insidePoint(poly, pref) {
  if (pointInPoly(pref.x, pref.z, poly)) return { x: pref.x, z: pref.z };
  var x1 = Infinity, x2 = -Infinity, z1 = Infinity, z2 = -Infinity;
  poly.forEach(function (p) {
    x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x);
    z1 = Math.min(z1, p.z); z2 = Math.max(z2, p.z);
  });
  var best = null;
  for (var i = 1; i < 24; i++)
    for (var j = 1; j < 24; j++) {
      var x = x1 + ((x2 - x1) * i) / 24, z = z1 + ((z2 - z1) * j) / 24;
      if (!pointInPoly(x, z, poly)) continue;
      var d = dist({ x: x, z: z }, pref);
      if (!best || d < best.d) best = { x: x, z: z, d: d };
    }
  return best || { x: pref.x, z: pref.z };
}
// Item footprint projected onto a wall as a blocked interval, if it stands
// close enough to that wall to matter. `grow` widens it (wet-zone clearance).
function itemSpan(w, it, grow, reach) {
  var g = wallGeom(w);
  var hw = (it.w || 40) / 2, hd = (it.d || 40) / 2;
  var ca = Math.cos((-(it.rot || 0) * Math.PI) / 180), sa = Math.sin((-(it.rot || 0) * Math.PI) / 180);
  var lo = Infinity, hi = -Infinity, near = Infinity;
  [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(function (c) {
    var px = it.x + c[0] * ca - c[1] * sa, pz = it.z + c[0] * sa + c[1] * ca;
    var t = (px - g.a.x) * g.ux + (pz - g.a.z) * g.uz;
    var off = Math.abs(-(px - g.a.x) * g.uz + (pz - g.a.z) * g.ux);
    lo = Math.min(lo, t); hi = Math.max(hi, t); near = Math.min(near, off);
  });
  if (near > (reach == null ? 100 : reach)) return null;
  return { a: lo - grow, b: hi + grow };
}
// Free intervals along a wall: full length minus corners, openings and any
// caller-supplied blocked intervals.
function freeSpans(wid, blocked, openClear, minSpan, corner) {
  var w = wallById(wid);
  if (!w) return [];
  var L = wallGeom(w).L;
  var cuts = (blocked || []).slice();
  S.openings.forEach(function (o) {
    if (o.wall !== wid) return;
    var pad = openClear == null ? C.opening : openClear;
    cuts.push({ a: o.s - o.width / 2 - pad, b: o.s + o.width / 2 + pad });
  });
  var cn = corner == null ? C.corner : corner;
  var spans = [{ a: cn, b: L - cn }];
  cuts.forEach(function (c) {
    var next = [];
    spans.forEach(function (s) {
      if (c.b <= s.a || c.a >= s.b) { next.push(s); return; }
      if (c.a > s.a) next.push({ a: s.a, b: c.a });
      if (c.b < s.b) next.push({ a: c.b, b: s.b });
    });
    spans = next;
  });
  var ms = minSpan == null ? C.minSpan : minSpan;
  return spans.filter(function (s) { return s.b - s.a >= ms; });
}
// The same, but stepping the rules down until the wall yields something. A
// tight WC whose every wall is corner, door reveal and cistern still has to end
// up with a light switch and a manifold somewhere — leaving the service off the
// drawing is never the right answer, crowding it slightly is.
function relaxedSpans(wid, blocked) {
  var levels = [[C.opening, C.minSpan, C.corner], [7, 22, 12], [0, 10, 6]];
  for (var i = 0; i < levels.length; i++) {
    var sp = freeSpans(wid, i < 2 ? blocked : null, levels[i][0], levels[i][1], levels[i][2]);
    if (sp.length) return sp;
  }
  return [];
}
// Pick a position inside the free spans, as close as possible to `pref`.
function pickSpot(spans, pref) {
  var best = null;
  spans.forEach(function (s) {
    var v = clamp(pref, s.a + 6, s.b - 6);
    var d = Math.abs(v - pref);
    if (!best || d < best.d) best = { s: v, d: d };
  });
  return best ? best.s : null;
}

/* ---- placement bookkeeping ----------------------------------------------- */
function Ctx() {
  // Two devices of the SAME service may not share a spot — a second socket
  // 5cm from the first is a mistake, not a design. Different services happily
  // stack (the trap sits right under the tap, the fan coil shares the ceiling
  // with the light point), so the exclusion list is kept per system.
  this.taken = {};
  this.all = [];
}
Ctx.prototype.free = function (sys, p, gap) {
  gap = gap || C.apart;
  var list = this.taken[sys] || [];
  for (var i = 0; i < list.length; i++) if (dist(list[i], p) < gap) return false;
  for (var j = 0; j < this.all.length; j++) if (dist(this.all[j], p) < 4) return false;
  return true;
};
Ctx.prototype.put = function (sys, k, p, layer, elev, gap) {
  if (!p) return null;
  if (!this.free(sys, p, gap)) return null;
  var n = addNode(sys, k, p.x, p.z, p.wall != null ? p.wall : null, p.s != null ? p.s : null, layer);
  if (elev != null) n.elev = elev;
  (this.taken[sys] = this.taken[sys] || []).push({ x: p.x, z: p.z });
  this.all.push({ x: p.x, z: p.z });
  return n;
};
// Same, but if the spot is occupied try a few nudges around it — used for the
// devices that have to exist somewhere (the fan coil, the diffusers).
Ctx.prototype.putNear = function (sys, k, p, layer, elev, gap, poly) {
  var n = this.put(sys, k, p, layer, elev, gap);
  if (n) return n;
  for (var r = 45; r <= 135 && !n; r += 45)
    for (var a = 0; a < 8 && !n; a++) {
      var q = { x: p.x + Math.cos((a * Math.PI) / 4) * r, z: p.z + Math.sin((a * Math.PI) / 4) * r };
      if (poly && !pointInPoly(q.x, q.z, poly)) continue;
      n = this.put(sys, k, q, layer, elev, gap);
    }
  return n;
};

/* ---- plan analysis -------------------------------------------------------- */
function classify(r, items) {
  var nm = (roomName(r.key) || "").toLowerCase();
  var has = {};
  items.forEach(function (it) { has[it.type] = (has[it.type] || 0) + 1; });
  var f = {
    bath: !!(has.toilet || has.shower || has.bathtub || /bath|wc|toilet|shower|אמבט|שירות|מקלח/.test(nm)),
    kitchen: !!(has.cooktop || has.oven || has.fridge || /kitchen|מטבח/.test(nm)),
    bed: roomIsBedroom(r) || !!(has.bed || /bed|שינה/.test(nm)),
    hall: /corridor|hall|entry|מסדרון|פרוזדור|כניסה/.test(nm) || (r.area < 50000 && !items.length),
  };
  f.living = !f.bath && !f.bed && !f.hall;
  f.habitable = !f.bath && !f.hall; // gets data + a generous socket count
  return f;
}
function analyze(rooms) {
  var use = {};
  rooms.forEach(function (r) {
    r.key.split(",").forEach(function (id) { use[id] = (use[id] || 0) + 1; });
  });
  var info = rooms.map(function (r) {
    var items = S.items.filter(function (it) { return pointInPoly(it.x, it.z, r.pts); });
    return {
      r: r,
      area: r.area,
      items: items,
      flags: classify(r, items),
      walls: roomWalls(r),
      centre: insidePoint(r.pts, { x: r.cx, z: r.cz }),
    };
  });
  return {
    rooms: info,
    // a wall bounding exactly one room faces outside — that's where the entry
    // door, the condenser and the soil stack's vent belong
    exterior: function (id) { return (use[id] || 0) <= 1; },
  };
}

/* ---- electrical ---------------------------------------------------------- */
// Panel + comms rack by the entry: the door on an exterior wall, or failing
// that any door, or failing that the longest free wall in the first room.
function placeHeadEnd(plan, ctx) {
  var entry = null;
  S.openings.forEach(function (o) {
    if (o.type === "window") return;
    if (!plan.exterior(o.wall)) return;
    if (!entry || o.width > entry.width) entry = o;
  });
  var host = null;
  if (entry) {
    host = plan.rooms.find(function (ri) {
      return ri.walls.some(function (rw) { return rw.w.id === entry.wall; });
    });
  }
  if (!host) host = plan.rooms[0];
  var cands = [];
  if (entry) cands.push({ wid: entry.wall, pref: entry.s + entry.width / 2 + 35 });
  host.walls.forEach(function (rw) {
    if (plan.rooms.length > 1 && host.flags.bath) return; // never in a wet room
    cands.push({ wid: rw.w.id, pref: wallGeom(rw.w).L / 2 });
  });
  var panel = null, rack = null;
  for (var i = 0; i < cands.length && !panel; i++) {
    var spans = freeSpans(cands[i].wid, null, C.opening + 8);
    var s = pickSpot(spans, cands[i].pref);
    if (s == null) continue;
    panel = ctx.put("power", "panel", wallPointAt(cands[i].wid, s), "wall", H.panel);
    if (panel) {
      // the rack goes beside the panel, or on the next wall along if there is
      // no room left in that span
      var s2 = pickSpot(spans, s + 45);
      if (s2 != null && Math.abs(s2 - s) > 30)
        rack = ctx.put("comms", "rack", wallPointAt(cands[i].wid, s2), "wall", 60);
    }
  }
  if (panel && !rack) {
    for (var j = 0; j < cands.length && !rack; j++) {
      var sp = freeSpans(cands[j].wid, null, C.opening + 8);
      var sr = pickSpot(sp, wallGeom(wallById(cands[j].wid)).L / 2);
      if (sr != null) rack = ctx.put("comms", "rack", wallPointAt(cands[j].wid, sr), "wall", 60);
    }
  }
  return { panel: panel, rack: rack };
}

// Intervals on `wid` a general socket must stay out of: the splash zone around
// a shower/bath and the footprint of the WC.
function wetBlocks(ri, wid) {
  var w = wallById(wid), out = [];
  if (!w) return out;
  ri.items.forEach(function (it) {
    var d = WET[it.type];
    var grow = d && d.wetzone ? C.wet : it.type === "toilet" ? 15 : 0;
    if (!grow) return;
    var sp = itemSpan(w, it, grow, 140);
    if (sp) out.push(sp);
  });
  return out;
}

function placeRoomPower(plan, ri, ctx, out) {
  var r = ri.r;
  // --- lighting: one point, two in a big room, on the room's long axis ---
  var lights = [];
  var bb = bbox(r.pts);
  var two = ri.area > 220000 && !ri.flags.bath; // over ~22 m²
  if (!two) lights.push(ri.centre);
  else if (bb.w >= bb.d) {
    lights.push(insidePoint(r.pts, { x: r.cx - bb.w / 4, z: r.cz }));
    lights.push(insidePoint(r.pts, { x: r.cx + bb.w / 4, z: r.cz }));
  } else {
    lights.push(insidePoint(r.pts, { x: r.cx, z: r.cz - bb.d / 4 }));
    lights.push(insidePoint(r.pts, { x: r.cx, z: r.cz + bb.d / 4 }));
  }
  lights.forEach(function (p) {
    var n = ctx.put("power", "light", p, "ceiling", null, 60);
    if (n) out.lights.push(n);
  });

  // --- switch: beside the room's door, on the handle side, inside the room.
  // A bathroom switch goes on the OTHER side of the same doorway, which is
  // where the regulations put it and where people reach for it anyway.
  var door = null;
  ri.walls.forEach(function (rw) {
    S.openings.forEach(function (o) {
      if (o.wall !== rw.w.id || o.type === "window") return;
      if (!door || o.width > door.o.width) door = { o: o, rw: rw };
    });
  });
  // Candidates in the order a sparky would try them: both reveals of the main
  // door first, then the walls flanking it, then anywhere clear in the room.
  var cands = [];
  if (door) {
    cands.push({ wid: door.o.wall, pref: door.o.s + door.o.width / 2 + 18 });
    cands.push({ wid: door.o.wall, pref: door.o.s - door.o.width / 2 - 18 });
  }
  ri.walls.forEach(function (rw) {
    if (door && rw.w.id === door.o.wall) return;
    var g = wallGeom(rw.w);
    var end = door ? nearestEnd(g, door.o) : null;
    cands.push({ wid: rw.w.id, pref: end != null ? end : g.L / 2 });
  });
  for (var i = 0; i < cands.length && !out.switches[ri.idx]; i++) {
    var s = pickSpot(relaxedSpans(cands[i].wid, null), cands[i].pref);
    if (s == null) continue;
    out.switches[ri.idx] = ctx.put("power", "switch", wallPointAt(cands[i].wid, s), "wall", H.switch, 22);
  }

  // --- kitchen first: the worktop and the appliances have fixed positions, so
  // they get their sockets before the general ones compete for the same wall
  if (ri.flags.kitchen) placeKitchen(ri, ctx, out);

  // --- sockets: walk the perimeter and drop one every C.socketStep of free
  // wall. A bathroom gets a single point outside the wet zone; a corridor one.
  var quota = ri.flags.bath ? 1 : ri.flags.hall ? 1 : Math.max(2, Math.round(perimeter(r.pts) / C.socketStep));
  var placed = 0;
  var ordered = ri.walls.slice().sort(function (a, b) { return b.g.L - a.g.L; });
  ordered.forEach(function (rw) {
    if (placed >= quota) return;
    var spans = freeSpans(rw.w.id, wetBlocks(ri, rw.w.id), C.opening);
    spans.forEach(function (sp) {
      if (placed >= quota) return;
      var n = Math.max(1, Math.floor((sp.b - sp.a) / C.socketStep));
      for (var i = 0; i < n && placed < quota; i++) {
        var s = sp.a + ((sp.b - sp.a) * (i + 0.5)) / n;
        var node = ctx.put("power", "outlet", wallPointAt(rw.w.id, s), "wall",
          ri.flags.bath ? 130 : H.socket);
        if (node) { out.sockets.push({ n: node, room: ri }); placed++; }
      }
    });
  });
  // no wall in this room passed the clearance rules — a room with no socket at
  // all is worse than one with a tight socket, so relax and try the long wall
  if (!placed && ordered.length) {
    var sp0 = relaxedSpans(ordered[0].w.id, null)[0];
    if (sp0) {
      var n0 = ctx.put("power", "outlet", wallPointAt(ordered[0].w.id, (sp0.a + sp0.b) / 2), "wall",
        ri.flags.bath ? 130 : H.socket, 20);
      if (n0) out.sockets.push({ n: n0, room: ri });
    }
  }

  // --- data: one port per habitable room, beside a socket but not on it ---
  if (ri.flags.habitable && out.sockets.length) {
    var last = null;
    for (var k = out.sockets.length - 1; k >= 0; k--)
      if (out.sockets[k].room === ri) { last = out.sockets[k].n; break; }
    if (last && last.wall != null) {
      var ps = pickSpot(freeSpans(last.wall, null, C.opening), last.s + 30);
      if (ps != null) {
        var port = ctx.put("comms", "port", wallPointAt(last.wall, ps), "wall", H.port);
        if (port) out.ports.push(port);
      }
    }
  }

  // --- a wall-hung TV wants power + data behind it at screen height ---
  var tv = ri.items.find(function (it) { return it.type === "tv"; });
  if (tv) {
    var best = nearestWallTo(ri, tv);
    if (best) {
      var st = pickSpot(freeSpans(best.w.id, null, C.opening), best.s);
      if (st != null) {
        var so = ctx.put("power", "outlet", wallPointAt(best.w.id, st), "wall", H.socketTV);
        if (so) out.sockets.push({ n: so, room: ri });
        var sd = pickSpot(freeSpans(best.w.id, null, C.opening), best.s + 28);
        if (sd != null) {
          var dp = ctx.put("comms", "port", wallPointAt(best.w.id, sd), "wall", H.socketTV);
          if (dp) { out.ports.push(dp); out.tvPort = dp; }
        }
      }
    }
  }
}

function placeKitchen(ri, ctx, out) {
  var anchor = ri.items.find(function (it) { return it.type === "cooktop"; }) ||
    ri.items.find(function (it) { return it.type === "sink"; });
  if (anchor) {
    var near = nearestWallTo(ri, anchor);
    if (near) {
      var spans = freeSpans(near.w.id, null, C.opening);
      var made = 0;
      spans.forEach(function (sp) {
        var n = Math.min(3, Math.max(1, Math.floor((sp.b - sp.a) / C.counterStep)));
        for (var i = 0; i < n && made < 4; i++) {
          var s = sp.a + ((sp.b - sp.a) * (i + 0.5)) / n;
          var node = ctx.put("power", "outlet", wallPointAt(near.w.id, s), "wall", H.socketCounter, 40);
          if (node) { out.counter.push(node); made++; }
        }
      });
    }
  }
  ri.items.forEach(function (it) {
    var wall = nearestWallTo(ri, it);
    if (!wall) return;
    if (DEDICATED[it.type]) {
      var sd = pickSpot(freeSpans(wall.w.id, null, C.opening), wall.s);
      if (sd == null) return;
      var nd = ctx.put("power", "outlet", wallPointAt(wall.w.id, sd), "wall",
        it.type === "oven" || it.type === "cooktop" ? H.socketAppliance : H.socketAppliance, 24);
      if (nd) out.dedicated.push(nd);
    } else if (APPLIANCE[it.type]) {
      var sa = pickSpot(freeSpans(wall.w.id, null, C.opening), wall.s);
      if (sa == null) return;
      var na = ctx.put("power", "outlet", wallPointAt(wall.w.id, sa), "wall", APPLIANCE[it.type], 24);
      if (na) out.counter.push(na);
    }
  });
}

// The bounding wall of `ri` an item stands against (nearest by perpendicular
// offset), with the projected position along it.
function nearestWallTo(ri, it) {
  var best = null;
  ri.walls.forEach(function (rw) {
    var pr = projectOnWall(rw.w, it);
    if (pr.off > 130) return;
    if (!best || pr.off < best.off) best = { w: rw.w, rw: rw, s: pr.s, off: pr.off };
  });
  return best;
}
// The end of wall `g` nearest a door on another wall — the switch belongs on
// the side of the room you reach first when you walk in, not out in the middle.
function nearestEnd(g, o) {
  var w = wallById(o.wall);
  if (!w) return null;
  var og = wallGeom(w);
  var dp = { x: og.a.x + og.ux * o.s, z: og.a.z + og.uz * o.s };
  return dist(g.a, dp) <= dist(g.b, dp) ? C.corner + 25 : g.L - C.corner - 25;
}
function bbox(pts) {
  var x1 = Infinity, x2 = -Infinity, z1 = Infinity, z2 = -Infinity;
  pts.forEach(function (p) {
    x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x);
    z1 = Math.min(z1, p.z); z2 = Math.max(z2, p.z);
  });
  return { x1: x1, x2: x2, z1: z1, z2: z2, w: x2 - x1, d: z2 - z1 };
}
function perimeter(pts) {
  var L = 0;
  for (var i = 0; i < pts.length; i++) L += dist(pts[i], pts[(i + 1) % pts.length]);
  return L;
}

/* ---- plumbing ------------------------------------------------------------ */
function placePlumbing(plan, ctx, out) {
  var wet = [];
  plan.rooms.forEach(function (ri) {
    ri.items.forEach(function (it) {
      if (WET[it.type]) wet.push({ it: it, ri: ri, def: WET[it.type] });
    });
  });
  if (!wet.length) return;

  // the room with the most fixtures hosts the manifold and the soil stack
  var count = {};
  wet.forEach(function (f) { count[f.ri.r.key] = (count[f.ri.r.key] || 0) + 1; });
  var host = plan.rooms.filter(function (ri) { return count[ri.r.key]; })
    .sort(function (a, b) { return count[b.r.key] - count[a.r.key]; })[0];

  // manifold: on the host room's wall with the most clear space
  var bestSpan = null;
  host.walls.forEach(function (rw) {
    relaxedSpans(rw.w.id, null).forEach(function (sp) {
      if (!bestSpan || sp.b - sp.a > bestSpan.sp.b - bestSpan.sp.a) bestSpan = { wid: rw.w.id, sp: sp };
    });
  });
  if (bestSpan)
    out.manifold = ctx.put("water", "manifold", wallPointAt(bestSpan.wid, (bestSpan.sp.a + bestSpan.sp.b) / 2),
      "wall", H.manifold, 20);
  if (!out.manifold) {
    // nowhere on a wall — stand it just off the wall behind the first fixture
    // rather than leaving the whole supply side unbuilt
    var f0 = wet[0];
    var nw = nearestWallTo(f0.ri, f0.it);
    var mp = nw
      ? { x: wallPointAt(nw.w.id, nw.s).x + nw.rw.nx * 18, z: wallPointAt(nw.w.id, nw.s).z + nw.rw.nz * 18 }
      : { x: f0.it.x, z: f0.it.z };
    out.manifold = ctx.putNear("water", "manifold", mp, "wall", H.manifold, 20, f0.ri.r.pts);
  }

  // soil stack: in the host room's corner closest to the fixtures, pulled in
  // off both walls so it reads as a boxed-in riser rather than a floating dot
  var corner = null;
  host.r.pts.forEach(function (p) {
    var d = 0;
    wet.forEach(function (f) { d += dist(p, f.it); });
    if (!corner || d < corner.d) corner = { p: p, d: d };
  });
  if (corner) {
    var inward = { x: host.centre.x - corner.p.x, z: host.centre.z - corner.p.z };
    var L = Math.hypot(inward.x, inward.z) || 1;
    var sp = { x: corner.p.x + (inward.x / L) * 32, z: corner.p.z + (inward.z / L) * 32 };
    out.stack = ctx.put("drain", "stack", sp, "floor", 0, 20);
    if (out.stack) {
      // the stack is vented above the ceiling — the vent leg rises beside it
      var vp = { x: sp.x + (inward.x / L) * 26, z: sp.z + (inward.z / L) * 26 };
      out.vent = ctx.put("drain", "vent", vp, "ceiling", null, 15);
    }
  }

  wet.forEach(function (f) {
    var wall = nearestWallTo(f.ri, f.it);
    // supply point on the wall behind the fixture, at that fixture's height
    var sp = wall ? wallPointAt(wall.w.id, wall.s) : { x: f.it.x, z: f.it.z };
    var fx = ctx.put("water", "fixture", sp, "wall", f.def.sup, 16);
    if (fx) out.fixtures.push({ n: fx, def: f.def, it: f.it });
    // the trap sits on the floor at the foot of that wall
    var tp = wall
      ? { x: sp.x + wall.rw.nx * 12, z: sp.z + wall.rw.nz * 12 }
      : { x: f.it.x, z: f.it.z };
    var tr = ctx.put("drain", "trap", tp, "floor", 12, 16);
    if (tr) out.traps.push(tr);
  });

  // a floor gully in every wet room, inside the shower tray where there is one
  plan.rooms.forEach(function (ri) {
    if (!ri.flags.bath) return;
    var shower = ri.items.find(function (it) { return it.type === "shower" || it.type === "bathtub"; });
    var p = shower ? { x: shower.x, z: shower.z } : insidePoint(ri.r.pts, { x: ri.r.cx, z: ri.r.cz });
    var fd = ctx.put("drain", "floor", p, "floor", 0, 25);
    if (fd) out.floorDrains.push(fd);
  });
}

/* ---- air conditioning ---------------------------------------------------- */
function placeHVAC(plan, ctx, out) {
  // the concealed fan coil hangs over the corridor, or the smallest room that
  // isn't somebody's bedroom — the same spot an installer picks for access
  var hostPool = plan.rooms.filter(function (ri) { return ri.flags.hall; });
  if (!hostPool.length) hostPool = plan.rooms.filter(function (ri) { return !ri.flags.bed; });
  if (!hostPool.length) hostPool = plan.rooms.slice();
  var host = hostPool.sort(function (a, b) { return a.area - b.area; })[0];
  out.host = host;
  out.unit = ctx.putNear("hvac", "unit", host.centre, "ceiling", null, 30, host.r.pts);
  if (!out.unit) return;
  var up = nodePos(out.unit);

  // return grille in the same ceiling, a clear metre off the unit
  var bb = bbox(host.r.pts);
  var away = bb.w >= bb.d ? { x: up.x + Math.min(90, bb.w / 3), z: up.z } : { x: up.x, z: up.z + Math.min(90, bb.d / 3) };
  out.ret = ctx.putNear("hvac", "return", insidePoint(host.r.pts, away), "ceiling", null, 30, host.r.pts);

  // one supply diffuser per conditioned room, offset from the light point so
  // the two don't fight for the same ceiling tile
  plan.rooms.forEach(function (ri) {
    if (ri.area < 60000) return; // under 6 m² is served by transfer air
    if (ri.flags.bath) return;
    var b = bbox(ri.r.pts);
    var pref = b.w >= b.d
      ? { x: ri.r.cx + Math.min(80, b.w / 4), z: ri.r.cz }
      : { x: ri.r.cx, z: ri.r.cz + Math.min(80, b.d / 4) };
    var n = ctx.putNear("hvac", "supply", insidePoint(ri.r.pts, pref), "ceiling", null, 45, ri.r.pts);
    if (n) out.supplies.push(n);
  });

  // thermostat on a living-room wall, clear of the door swing
  var liv = plan.rooms.filter(function (ri) { return ri.flags.living; })
    .sort(function (a, b) { return b.area - a.area; })[0] || host;
  for (var i = 0; i < liv.walls.length && !out.stat; i++) {
    var s = pickSpot(freeSpans(liv.walls[i].w.id, null, C.opening + 10), wallGeom(liv.walls[i].w).L / 2);
    if (s != null) out.stat = ctx.put("hvac", "thermostat", wallPointAt(liv.walls[i].w.id, s), "wall", H.thermostat);
  }

  // condenser outside the nearest exterior wall to the unit, standing clear of
  // the facade on its own feet
  var best = null;
  plan.rooms.forEach(function (ri) {
    ri.walls.forEach(function (rw) {
      if (!plan.exterior(rw.w.id)) return;
      if (rw.g.L < 90) return;
      var mid = { x: (rw.g.a.x + rw.g.b.x) / 2, z: (rw.g.a.z + rw.g.b.z) / 2 };
      var d = dist(mid, up);
      if (!best || d < best.d) best = { rw: rw, mid: mid, d: d };
    });
  });
  if (best) {
    var p = { x: best.mid.x - best.rw.nx * 65, z: best.mid.z - best.rw.nz * 65 };
    out.cond = ctx.put("hvac", "condenser", p, "floor", 10, 20);
    // the isolator/spur the outdoor unit is wired through
    if (out.cond) {
      var ip = { x: best.mid.x - best.rw.nx * 22, z: best.mid.z - best.rw.nz * 22 };
      out.condSpur = ctx.put("power", "junction", ip, "wall", 150, 18);
    }
  }
}

/* ---- gas ------------------------------------------------------------------ */
// Meter on an exterior wall that is not a bedroom, then a shutoff at each
// appliance. The pipe itself is laid later, in the screed, so it can pass
// under a door without entering the room.
function placeGas(plan, ctx, out) {
  var apps = [];
  plan.rooms.forEach(function (ri) {
    if (ri.flags.bed) return;
    ri.items.forEach(function (it) {
      if (GAS_APPLIANCE[it.type]) apps.push({ it: it, ri: ri });
    });
  });
  if (!apps.length) return;
  var anchor = apps[0].it;
  var walls = [];
  plan.rooms.forEach(function (ri) {
    if (ri.flags.bed) return;
    ri.walls.forEach(function (rw) {
      if (plan.exterior(rw.w.id) && rw.g.L >= 50) walls.push(rw);
    });
  });
  walls.sort(function (a, b) {
    var ma = { x: (a.g.a.x + a.g.b.x) / 2, z: (a.g.a.z + a.g.b.z) / 2 };
    var mb = { x: (b.g.a.x + b.g.b.x) / 2, z: (b.g.a.z + b.g.b.z) / 2 };
    return dist(ma, anchor) - dist(mb, anchor);
  });
  function putInSpan(sys, k, wallId, sp, elev) {
    for (var i = 0; i < 8; i++) {
      var s = sp.a + (sp.b - sp.a) * (i + 0.5) / 8;
      var n = ctx.put(sys, k, wallPointAt(wallId, s), "wall", elev, 16);
      if (n) return n;
    }
    return null;
  }
  for (var w = 0; w < walls.length && !out.meter; w++) {
    var pref = projectOnWall(walls[w].w, anchor).s;
    var spans = relaxedSpans(walls[w].w.id, null);
    var at = pickSpot(spans, pref);
    if (at != null) out.meter = ctx.put("gas", "meter", wallPointAt(walls[w].w.id, at), "wall", 40, 16);
    if (!out.meter) {
      spans.slice().sort(function (a, b) {
        return Math.abs((a.a + a.b) / 2 - pref) - Math.abs((b.a + b.b) / 2 - pref);
      }).forEach(function (sp) {
        if (!out.meter) out.meter = putInSpan("gas", "meter", walls[w].w.id, sp, 40);
      });
    }
  }
  out.gasPoints = [];
  apps.forEach(function (a) {
    var wall = nearestWallTo(a.ri, a.it);
    if (!wall) return;
    var spans = relaxedSpans(wall.w.id, null);
    var at = pickSpot(spans, wall.s);
    var valve = at == null ? null : ctx.put("gas", "valve", wallPointAt(wall.w.id, at), "wall", 50, 16);
    if (!valve) {
      spans.slice().sort(function (p, q) {
        return Math.abs((p.a + p.b) / 2 - wall.s) - Math.abs((q.a + q.b) / 2 - wall.s);
      }).forEach(function (sp) {
        if (Math.abs((sp.a + sp.b) / 2 - wall.s) > 120) return;
        if (!valve) valve = putInSpan("gas", "valve", wall.w.id, sp, 50);
      });
    }
    if (valve) out.gasPoints.push(valve);
  });
}

/* ---- wiring: turn the placed devices into routed runs -------------------- */
function tapNode(net, n) {
  var p = nodePos(n);
  return net.tap(p, n.wall, n.s);
}
// Order devices into the sequence a chased-in circuit would actually take:
// nearest neighbour, starting from the board.
function chainOrder(start, devs) {
  var left = devs.slice(), seq = [], cur = start;
  while (left.length) {
    var bi = 0, bd = Infinity;
    for (var i = 0; i < left.length; i++) {
      var d = dist(cur, nodePos(left[i]));
      if (d < bd) { bd = d; bi = i; }
    }
    cur = nodePos(left[bi]);
    seq.push(left.splice(bi, 1)[0]);
  }
  return seq;
}
// One run threading `devs` in order, routed wall-by-wall from `startTap`.
function layRun(sys, kind, pts, layer) {
  if (!pts || pts.length < 2) return null;
  return addRun(sys, kind, pts, null, null, generationLayer(sys, kind, layer, pts));
}
function chainRun(net, sys, kind, layer, startTap, devs, taps, fallback) {
  var pts = [], prev = startTap;
  var fallbackPrev = fallback && fallback.startTap;
  function flush() {
    if (pts.length >= 2) layRun(sys, kind, pts, layer);
    pts = [];
  }
  devs.forEach(function (n) {
    var t = taps[n.id];
    if (t == null) return;
    var res = net.path(prev, t);
    if (res.blocked && fallback && fallbackPrev != null && fallback.taps[n.id] != null) {
      flush();
      var fr = fallback.net.path(fallbackPrev, fallback.taps[n.id]);
      if (fr.pts.length >= 2) layRun(sys, kind, fr.pts, fallback.layer);
    } else if (res.pts.length) {
      pts = concatPath(pts, res.pts);
    }
    prev = t;
    if (fallback) fallbackPrev = fallback.taps[n.id];
  });
  flush();
}

function wire(plan, out) {
  var wallNet = makeRouter(true); // wall chases have to dodge doorways
  var voidNet = makeRouter(false); // ceiling void / floor screed run free
  var m = ensureMEP();
  var wt = {}, vt = {};
  m.nodes.forEach(function (n) {
    wt[n.id] = tapNode(wallNet, n);
    vt[n.id] = tapNode(voidNet, n);
  });
  wallNet.build();
  voidNet.build();

  /* --- lighting: a ceiling circuit that drops onto each switch --- */
  if (out.panel && out.lights.length) {
    var lightPts = [];
    out.lights.forEach(function (l) { lightPts.push(l); });
    out.switches.forEach(function (s) { if (s) lightPts.push(s); });
    var seq = chainOrder(nodePos(out.panel), lightPts);
    for (var i = 0; i < seq.length; i += MAX_LIGHTS_PER_CIRCUIT)
      chainRun(voidNet, "power", "circuit", "ceiling", vt[out.panel.id],
        seq.slice(i, i + MAX_LIGHTS_PER_CIRCUIT), vt);
  }

  /* --- sockets: radial circuits chased through the walls, grouped by room
         so one tripped breaker never takes the whole flat out --- */
  if (out.panel) {
    var groups = [], cur = [], curRoom = null;
    out.sockets.forEach(function (s) {
      if (curRoom !== s.room && cur.length >= 4) { groups.push(cur); cur = []; }
      curRoom = s.room;
      cur.push(s.n);
      if (cur.length >= MAX_SOCKETS_PER_CIRCUIT) { groups.push(cur); cur = []; }
    });
    if (cur.length) groups.push(cur);
    groups.forEach(function (g) {
      chainRun(wallNet, "power", "circuit", "wall", wt[out.panel.id], chainOrder(nodePos(out.panel), g), wt,
        { net: voidNet, layer: "ceiling", taps: vt, startTap: vt[out.panel.id] });
    });
    if (out.counter.length)
      chainRun(wallNet, "power", "circuit", "wall", wt[out.panel.id], chainOrder(nodePos(out.panel), out.counter), wt,
        { net: voidNet, layer: "ceiling", taps: vt, startTap: vt[out.panel.id] });
    // one dedicated circuit per heavy appliance, plus the outdoor unit
    out.dedicated.forEach(function (n) {
      chainRun(wallNet, "power", "circuit", "wall", wt[out.panel.id], [n], wt,
        { net: voidNet, layer: "ceiling", taps: vt, startTap: vt[out.panel.id] });
    });
    if (out.condSpur) {
      chainRun(wallNet, "power", "circuit", "wall", wt[out.panel.id], [out.condSpur], wt,
        { net: voidNet, layer: "ceiling", taps: vt, startTap: vt[out.panel.id] });
      if (out.cond) {
        var leg = wallNet.path(wt[out.condSpur.id], wt[out.cond.id]).pts;
        if (leg.length >= 2) layRun("power", "circuit", leg, "wall");
        else {
          var ceilLeg = voidNet.path(vt[out.condSpur.id], vt[out.cond.id]).pts;
          if (ceilLeg.length >= 2) layRun("power", "circuit", ceilLeg, "ceiling");
        }
      }
    }
  }

  /* --- comms: home runs from the rack, one cable per outlet --- */
  if (out.rack) {
    out.ports.forEach(function (p) {
      var pts = wallNet.path(wt[out.rack.id], wt[p.id]).pts;
      var layer = "wall";
      if (pts.length < 2) { pts = voidNet.path(vt[out.rack.id], vt[p.id]).pts; layer = "ceiling"; }
      if (pts.length >= 2) layRun("comms", p === out.tvPort ? "coax" : "cat6", pts, layer);
    });
  }

  /* --- water: a home-run star off the manifold, in the screed, rising into
         the wall at each fixture. Hot is offset so both pipes stay visible. --- */
  if (out.manifold) {
    out.fixtures.forEach(function (f) {
      var pts = voidNet.path(vt[out.manifold.id], vt[f.n.id]).pts;
      if (pts.length < 2) return;
      layRun("water", "cold", pts, "floor");
      if (f.def.hot) layRun("water", "hot", offsetPath(pts, 5), "floor");
    });
  }

  /* --- drainage: a falling tree. The first trap runs to the stack, every
         other one joins the nearest branch already laid. --- */
  if (out.stack) {
    var tree = [vt[out.stack.id]];
    var pending = out.traps.concat(out.floorDrains).filter(function (n) { return vt[n.id] != null; });
    pending.sort(function (a, b) {
      return dist(nodePos(a), nodePos(out.stack)) - dist(nodePos(b), nodePos(out.stack));
    });
    pending.forEach(function (n) {
      var res = voidNet.pathToSet(vt[n.id], tree);
      if (!res || res.pts.length < 2) return;
      var pts = res.pts.slice().reverse(); // upstream first, so it falls to the stack
      var run = layRun("drain", "waste", pts, "floor");
      run.fall = Math.min(14, pathLength(pts) * WASTE_FALL);
      res.vis.forEach(function (v) { if (tree.indexOf(v) < 0) tree.push(v); });
    });
    if (out.vent) {
      var vp = voidNet.path(vt[out.stack.id], vt[out.vent.id]).pts;
      if (vp.length >= 2) layRun("drain", "vent", vp, "ceiling");
    }
  }

  /* --- ductwork: a trunk out of the fan coil that branches to each diffuser,
         finished with a short length of flex into the grille --- */
  if (out.unit) {
    if (out.ret) {
      var rp = voidNet.path(vt[out.ret.id], vt[out.unit.id]).pts;
      if (rp.length >= 2) layRun("hvac", "return", rp, "ceiling");
    }
    var duct = [vt[out.unit.id]], first = true;
    var order = out.supplies.slice().sort(function (a, b) {
      return dist(nodePos(a), nodePos(out.unit)) - dist(nodePos(b), nodePos(out.unit));
    });
    order.forEach(function (n) {
      var res = voidNet.pathToSet(vt[n.id], duct);
      if (!res || res.pts.length < 2) return;
      var cut = splitTail(res.pts, 70);
      if (cut.head.length >= 2) layRun("hvac", first ? "duct" : "branch", cut.head, "ceiling");
      if (cut.tail && cut.tail.length >= 2) layRun("hvac", "flex", cut.tail, "ceiling");
      else if (cut.head.length < 2) layRun("hvac", "flex", res.pts, "ceiling");
      res.vis.forEach(function (v) { if (duct.indexOf(v) < 0) duct.push(v); });
      first = false;
    });
    if (out.cond) {
      var lp = voidNet.path(vt[out.unit.id], vt[out.cond.id]).pts;
      if (lp.length >= 2) layRun("hvac", "refrig", lp, "ceiling");
    }
    var drains = [];
    if (out.stack) drains.push(out.stack);
    (out.floorDrains || []).forEach(function (n) { drains.push(n); });
    var drainNode = null;
    drains.forEach(function (n) {
      if (!vt[n.id]) return;
      if (!drainNode || dist(nodePos(n), nodePos(out.unit)) < dist(nodePos(drainNode), nodePos(out.unit)))
        drainNode = n;
    });
    var cdest = drainNode || out.cond;
    if (cdest && vt[cdest.id] != null) {
      var cp = voidNet.path(vt[out.unit.id], vt[cdest.id]).pts;
      if (cp.length >= 2) {
        var cd = layRun("hvac", "condensate", cp, drainNode ? "floor" : "ceiling");
        if (cd) cd.fall = Math.min(20, pathLength(cp) * COND_FALL);
      }
    }
    if (out.stat) {
      var sp2 = voidNet.path(vt[out.stat.id], vt[out.unit.id]).pts;
      if (sp2.length >= 2) layRun("hvac", "control", sp2, "ceiling");
    }
  }

  // Gas is pressurized from the meter. It runs in the screed, under doors,
  // and does not need a fall. Each appliance keeps its own shutoff.
  if (out.meter && out.gasPoints) {
    out.gasPoints.forEach(function (n) {
      var pts = voidNet.path(vt[out.meter.id], vt[n.id]).pts;
      var layer = "floor";
      if (pts.length < 2) { pts = wallNet.path(wt[out.meter.id], wt[n.id]).pts; layer = "wall"; }
      // Stay off the cold-water chase. Hot is already 5cm to one side.
      if (pts.length >= 2) layRun("gas", "pipe", offsetPath(pts, 12), layer);
    });
  }
}

// Shift a polyline sideways by `d` cm so a paired run (hot beside cold,
// condensate beside the gas line) doesn't hide underneath its partner.
function offsetPath(pts, d) {
  return pts.map(function (p, i) {
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    var dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    return { x: p.x - (dz / L) * d, z: p.z + (dx / L) * d };
  });
}

/* ---- entry point ---------------------------------------------------------- */
export function autoInfrastructure() {
  var m = ensureMEP();
  var rooms = detectRooms();
  if (!rooms.length) return { ok: false, reason: "need-room" };
  m.nodes = [];
  m.runs = [];
  m.route = null;

  var plan = analyze(rooms);
  var ctx = new Ctx();
  var out = {
    lights: [], switches: [], sockets: [], counter: [], dedicated: [], ports: [],
    fixtures: [], traps: [], floorDrains: [], supplies: [], tvPort: null, gasPoints: [],
  };
  var head = placeHeadEnd(plan, ctx);
  out.panel = head.panel;
  out.rack = head.rack;
  plan.rooms.forEach(function (ri, i) {
    ri.idx = i;
    placeRoomPower(plan, ri, ctx, out);
  });
  placePlumbing(plan, ctx, out);
  placeHVAC(plan, ctx, out);
  placeGas(plan, ctx, out);
  wire(plan, out);
  autoConnectAll();
  // Random layouts can create a short wall island between openings. Repair any
  // remaining outlet/switch through a legal ceiling bridge, then apply the
  // user's per-service preferred/required routing planes.
  var repaired = connectMissingMEP();
  applyRoutingPolicies();
  if (m.runs.some(function (r) { return r.layer === "floor"; })) m.xray.floor = true;
  return { ok: true, nodes: m.nodes.length, runs: m.runs.length, repaired: repaired.made };
}
