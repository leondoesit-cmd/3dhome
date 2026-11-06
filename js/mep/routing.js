/* MEP auto-connect and routing policy, split out of js/mep.js. It shares the
   editor's state through live imports from ../mep.js. */
import { detectRooms, distSeg, pointInPoly, roomName } from "../geometry.js";
import { makeRouter } from "../mep_route.js";
import { validateMEPModel } from "../mep_validate.js";
import { addRun, emitMEP, linkRunEndpoints, nodePos, nodeTouchesRun, runCrossesOpening, runLength } from "../mep/topology.js";
import { roomPreset } from "../room_presets.js";
import { roomTypeOf } from "../room_types.js";
import { S } from "../state.js";
import {
  GRAVITY_CAP, GRAVITY_FALL, MEP_RUN_KINDS, MEP_TOUCH, allowedLayersFor,
  defaultLayerFor, ensureMEP, layerAllowed, nodeKindDef, runFall, runFlowKind,
  runKindDef,
} from "../mep.js";

// Re-link every run (called after routing + on load).
export function autoConnectAll() {
  ensureMEP().runs.forEach(linkRunEndpoints);
}

export function routingPolicy(sys, k) {
  var m = ensureMEP(), key = sys + "." + k, raw = m.routePolicy[key] || {};
  var mode = raw.mode === "prefer" || raw.mode === "require" ? raw.mode : "auto";
  var allowed = allowedLayersFor(sys, k, "run");
  var layer = allowed.indexOf(raw.layer) >= 0 ? raw.layer : defaultLayerFor(sys, k, "run");
  return { mode: mode, layer: layer };
}
export function setRoutingPolicy(sys, k, mode, layer) {
  var m = ensureMEP(), allowed = allowedLayersFor(sys, k, "run");
  mode = mode === "prefer" || mode === "require" ? mode : "auto";
  layer = allowed.indexOf(layer) >= 0 ? layer : defaultLayerFor(sys, k, "run");
  m.routePolicy[sys + "." + k] = { mode: mode, layer: layer };
  applyRoutingPolicies();
}
export function policyLayerFor(sys, k, fallback) {
  var p = routingPolicy(sys, k);
  return p.mode !== "auto" && layerAllowed(sys, k, "run", p.layer) ? p.layer : fallback;
}
function wallRouteBlocked(sys, k, layer, pts, dia) {
  return layer === "wall" && runCrossesOpening({
    sys: sys, k: k, layer: "wall", dia: dia || (runKindDef(sys, k) || {}).dia || 2, pts: pts || [],
  });
}
// Plane for a run that is about to be created. Preference and requirement
// both apply here. A required or preferred wall plane is refused when the
// new geometry would pass through a door; the caller keeps its own plane.
export function generationLayer(sys, k, proposed, pts) {
  var fallback = layerAllowed(sys, k, "run", proposed) ? proposed : defaultLayerFor(sys, k, "run");
  var p = routingPolicy(sys, k);
  if (p.mode === "auto" || !layerAllowed(sys, k, "run", p.layer)) return fallback;
  if (wallRouteBlocked(sys, k, p.layer, pts)) return fallback;
  return p.layer;
}
export function effectiveRunLayers(sys, k) {
  var p = routingPolicy(sys, k);
  return p.mode === "require" ? [p.layer] : allowedLayersFor(sys, k, "run");
}
export function applyRoutingPolicies() {
  var m = ensureMEP();
  var revealFloor = false, revealCeiling = false;
  m.runs.forEach(function (r) {
    var p = routingPolicy(r.sys, r.k);
    r.policyViolation = false;
    // Preferred only affects the next route (see generationLayer / the palette).
    // Changing it must not lift pipes that are already drawn.
    if (p.mode !== "require" || !layerAllowed(r.sys, r.k, "run", p.layer)) return;
    if (wallRouteBlocked(r.sys, r.k, p.layer, r.pts, r.dia)) { r.policyViolation = true; return; }
    // Reveal a concealed plane only when a run actually moves there.
    if (r.layer !== p.layer) {
      if (p.layer === "floor") revealFloor = true;
      if (p.layer === "ceiling") revealCeiling = true;
      r.layer = p.layer;
    }
  });
  if (revealFloor) m.xray.floor = true;
  if (revealCeiling) m.xray.ceiling = true;
  autoConnectAll();
  emitMEP();
}

function hubsForNode(n, nodes) {
  return nodes.filter(function (h) {
    if (h === n || h.sys !== n.sys) return false;
    var hd = nodeKindDef(h.sys, h.k);
    if (!hd || !hd.hub) return false;
    if (n.sys === "hvac" && (n.k === "supply" || n.k === "return" || n.k === "thermostat"))
      return h.k === "unit";
    return true;
  });
}
function nearestHubDist(n, hubs) {
  var p = nodePos(n), best = Infinity;
  hubs.forEach(function (h) {
    var hp = nodePos(h), d = Math.hypot(p.x - hp.x, p.z - hp.z);
    if (d < best) best = d;
  });
  return best;
}
// One router for the whole group. Every endpoint is tapped before build(),
// then each device joins the nearest vertex already on the growing tree so
// the second outlet becomes a spur instead of a second home-run.
function routeRepairGroup(nodes, hubs, kind, layer) {
  var net = makeRouter(layer === "wall");
  var tapOf = {};
  hubs.forEach(function (h) {
    var p = nodePos(h);
    tapOf["h" + h.id] = net.tap(p, h.wall, h.s);
  });
  nodes.forEach(function (n) {
    var p = nodePos(n);
    tapOf["n" + n.id] = net.tap(p, n.wall, n.s);
  });
  var tree = hubs.map(function (h) { return tapOf["h" + h.id]; });
  var blocked = [];
  nodes.slice().sort(function (a, b) { return nearestHubDist(a, hubs) - nearestHubDist(b, hubs); })
    .forEach(function (n) {
      var res = net.pathToSet(tapOf["n" + n.id], tree);
      if (!res || res.blocked || !res.pts || res.pts.length < 2) { blocked.push(n); return; }
      var pts = res.pts.map(function (p) { return { x: p.x, z: p.z }; });
      // Gravity runs are stored upstream-first so runPointY drops toward the
      // source. pathToSet returns source → device, which is the wrong way.
      if (GRAVITY_FALL[kind]) pts.reverse();
      var run = addRun(n.sys, kind, pts, null, null, layer);
      if (!run) { blocked.push(n); return; }
      if (GRAVITY_FALL[kind]) run.fall = Math.min(GRAVITY_CAP[kind], runLength(run) * GRAVITY_FALL[kind]);
      if (res.vis) res.vis.forEach(function (v) { if (tree.indexOf(v) < 0) tree.push(v); });
    });
  return blocked;
}
export function connectMissingMEP() {
  var m = ensureMEP(), status = computeMEPStatus(), made = 0, skipped = 0;
  var bad = m.nodes.filter(function (n) { return !!status.node[n.id]; });
  var groups = new Map();
  bad.forEach(function (n) {
    var kind = repairRunKind(n);
    if (!kind || !runKindDef(n.sys, kind)) { skipped++; return; }
    var hubs = hubsForNode(n, m.nodes);
    if (!hubs.length) { skipped++; return; }
    var layer = repairLayer(n, kind);
    var key = n.sys + "\0" + kind + "\0" + layer + "\0" +
      hubs.map(function (h) { return h.id; }).sort().join(",");
    var g = groups.get(key);
    if (!g) groups.set(key, g = { sys: n.sys, kind: kind, layer: layer, hubs: hubs, nodes: [] });
    g.nodes.push(n);
  });
  groups.forEach(function (g) {
    var blocked = routeRepairGroup(g.nodes, g.hubs, g.kind, g.layer);
    made += g.nodes.length - blocked.length;
    if (!blocked.length) return;
    var policy = routingPolicy(g.sys, g.kind);
    if (g.layer === "wall" && policy.mode !== "require" && layerAllowed(g.sys, g.kind, "run", "ceiling")) {
      var still = routeRepairGroup(blocked, g.hubs, g.kind, "ceiling");
      made += blocked.length - still.length;
      blocked = still;
    }
    skipped += blocked.length;
  });
  autoConnectAll();
  return { made: made, skipped: skipped };
}
function repairRunKind(n) {
  if (n.sys === "power") return "circuit";
  if (n.sys === "water") return "cold";
  if (n.sys === "drain") return n.k === "vent" ? "vent" : "waste";
  if (n.sys === "comms") return "cat6";
  if (n.sys === "gas") return "pipe";
  if (n.sys === "hvac") {
    if (n.k === "thermostat") return "control";
    if (n.k === "return") return "return";
    if (n.k === "supply" || n.k === "plenum") return "branch";
    return "refrig";
  }
  return (MEP_RUN_KINDS[n.sys] && MEP_RUN_KINDS[n.sys][0] || {}).k;
}
function repairLayer(n, kind) {
  var base = n.sys === "water" || (n.sys === "drain" && kind === "waste") ? "floor"
    : n.layer === "ceiling" && layerAllowed(n.sys, kind, "run", "ceiling") ? "ceiling"
    : defaultLayerFor(n.sys, kind, "run");
  return policyLayerFor(n.sys, kind, base);
}

// does a run pass within `tol` of point p?
function runTouchesPoint(r, p, tol) {
  if (!r || !r.pts) return false;
  for (var i = 1; i < r.pts.length; i++) {
    if (distSeg(p.x, p.z, r.pts[i - 1].x, r.pts[i - 1].z, r.pts[i].x, r.pts[i].z) <= tol) return true;
  }
  return false;
}
// do two runs physically join (an endpoint of one lands on the other)?
function runsTouch(A, B, tol) {
  if (!A || !B || !A.pts || !B.pts || A.pts.length < 2 || B.pts.length < 2) return false;
  if (A.explicit || B.explicit) return A.circuitId === B.circuitId &&
    [A.a, A.b].some(function(id) { return id != null && (id === B.a || id === B.b); });
  var ea = [A.pts[0], A.pts[A.pts.length - 1]];
  if (ea.some(function (p) { return runTouchesPoint(B, p, tol); })) return true;
  var eb = [B.pts[0], B.pts[B.pts.length - 1]];
  return eb.some(function (p) { return runTouchesPoint(A, p, tol); });
}

// Connection rules: build a per-system touch graph (devices + runs) with
// union-find, then a non-hub device / run is "unsupplied" if its component
// contains no hub (panel/manifold/stack/rack). A device touching no run at all
// is a harder "orphan". Returns issue maps keyed by entity id + a device count.
export function computeMEPStatus() {
  var m = ensureMEP();
  var parent = {};
  function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
  function union(a, b) { parent[find(a)] = find(b); }
  var bySys = {};
  function bucket(sys) { return bySys[sys] || (bySys[sys] = { nodes: [], runs: [] }); }
  m.nodes.forEach(function (n) { parent["n" + n.id] = "n" + n.id; bucket(n.sys).nodes.push(n); });
  m.runs.forEach(function (r) { parent["r" + r.id] = "r" + r.id; bucket(r.sys).runs.push(r); });
  var touched = {};
  // Same-system pairs only. A five-system plan used to compare every device
  // with every run, including the ones that can never connect.
  Object.keys(bySys).forEach(function (sys) {
    var g = bySys[sys];
    g.nodes.forEach(function (n) {
      var p = nodePos(n);
      g.runs.forEach(function (r) {
        if (!nodeTouchesRun(n, r, p)) return;
        touched[n.id] = true;
        union("n" + n.id, "r" + r.id);
      });
    });
    for (var i = 0; i < g.runs.length; i++)
      for (var j = i + 1; j < g.runs.length; j++)
        if (runsTouch(g.runs[i], g.runs[j], MEP_TOUCH))
          union("r" + g.runs[i].id, "r" + g.runs[j].id);
  });
  var hubComp = {};
  m.nodes.forEach(function (n) {
    var def = nodeKindDef(n.sys, n.k);
    if (def && def.hub) hubComp[find("n" + n.id)] = true;
  });
  var node = {}, run = {}, deviceIssues = 0;
  m.nodes.forEach(function (n) {
    var def = nodeKindDef(n.sys, n.k) || {};
    if (def.hub) return;
    if (!touched[n.id]) { node[n.id] = "orphan"; deviceIssues++; }
    else if (!hubComp[find("n" + n.id)]) { node[n.id] = "unsupplied"; deviceIssues++; }
  });
  m.runs.forEach(function (r) {
    if (!hubComp[find("r" + r.id)]) run[r.id] = "unsupplied";
  });
  validateMEPModel(m, []).issues.forEach(function(issue) {
    if (issue.code === "BROKEN_CIRCUIT_PATH" && !node[issue.entityId]) { node[issue.entityId] = "unsupplied"; deviceIssues++; }
  });
  return { node: node, run: run, deviceIssues: deviceIssues };
}

// min distance from a point to a run's polyline
function minDistPointToRun(p, r) {
  if (!r || !r.pts || r.pts.length < 2) return 1e9;
  var best = 1e9;
  for (var i = 1; i < r.pts.length; i++) {
    var d = distSeg(p.x, p.z, r.pts[i - 1].x, r.pts[i - 1].z, r.pts[i].x, r.pts[i].z);
    if (d < best) best = d;
  }
  return best;
}

// Discharge point a gravity run is supposed to fall toward. Waste uses its own
// stack. Condensate is looking for a drain, which lives on the other system.
function gravityTarget(r) {
  var m = ensureMEP(), best = null, bd = Infinity;
  if (!r.pts || r.pts.length < 2) return null;
  // Fall drops toward the last vertex, so that end is the one that must
  // reach the drain. A trap counts only when the pipe actually ends on it.
  var low = r.pts[r.pts.length - 1];
  m.nodes.forEach(function (n) {
    var p = nodePos(n);
    var nearLow = Math.hypot(low.x - p.x, low.z - p.z);
    var trapEnd = n.sys === "drain" && n.k === "trap" && nearLow <= 25;
    var ok = r.k === "condensate"
      ? n.sys === "drain" && (n.k === "stack" || n.k === "floor" || trapEnd)
      : n.sys === r.sys && (nodeKindDef(n.sys, n.k) || {}).hub;
    if (!ok) return;
    if (nearLow < bd) { bd = nearLow; best = p; }
  });
  return best;
}
// True when a gravity pipe is level, or its high end is the end nearer the drain.
// run.fall drops from the first vertex to the last, so the first vertex is high.
function boundaryGap(p, poly) {
  var best = Infinity;
  for (var i = 0; i < poly.length; i++) {
    var a = poly[i], b = poly[(i + 1) % poly.length];
    var d = distSeg(p.x, p.z, a.x, a.z, b.x, b.z);
    if (d < best) best = d;
  }
  return best;
}
export function roomIsBedroom(room) {
  if (!room) return false;
  var meta = (S.roomMeta || {})[room.key];
  var type = roomTypeOf(meta);
  var preset = type && roomPreset(type);
  if (preset && preset.cat === "sleeping") return true;
  var nm = (roomName(room.key) || "").toLowerCase();
  if (/bed|שינה/.test(nm)) return true;
  return (S.items || []).some(function (it) {
    return it && it.type === "bed" && room.pts && pointInPoly(it.x, it.z, room.pts);
  });
}
function segmentCutsRoom(a, b, room) {
  var len = Math.hypot(b.x - a.x, b.z - a.z);
  var steps = Math.max(1, Math.ceil(len / 10));
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    var p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (pointInPoly(p.x, p.z, room.pts) && boundaryGap(p, room.pts) > 12) return true;
  }
  return false;
}
// A gas pipe may end at an appliance. It may not cut across a bedroom.
export function gasThroughBedroom(r) {
  if (!r || r.sys !== "gas" || !r.pts || r.pts.length < 2) return false;
  var beds = detectRooms().filter(roomIsBedroom);
  if (!beds.length) return false;
  for (var i = 1; i < r.pts.length; i++) {
    for (var b = 0; b < beds.length; b++) {
      if (segmentCutsRoom(r.pts[i - 1], r.pts[i], beds[b])) return true;
    }
  }
  return false;
}
export function gravityUphill(r) {
  if (!r || runFlowKind(r.sys, r.k) !== "gravity" || !r.pts || r.pts.length < 2) return false;
  if (!(runFall(r) > 0)) return true;
  var target = gravityTarget(r);
  if (!target) return false;
  var d0 = Math.hypot(r.pts[0].x - target.x, r.pts[0].z - target.z);
  var d1 = Math.hypot(r.pts[r.pts.length - 1].x - target.x, r.pts[r.pts.length - 1].z - target.z);
  return d0 + 1 < d1;
}

// Flow model: which runs are alive (they trace to a source) and which way the
// medium moves. `dir` +1 means pts[0]→pts[last]. Supply and vent leave the
// source. Gravity and return air run back toward it. Signal has no single way.
// Returns { runId: { alive, dir, flow, uphill } }.
export function computeMEPFlow() {
  var m = ensureMEP();
  var adj = {}, pos = {}, isHub = {}, bySys = {};
  function bucket(sys) { return bySys[sys] || (bySys[sys] = { nodes: [], runs: [] }); }
  m.nodes.forEach(function (n) {
    var k = "n" + n.id;
    adj[k] = [];
    pos[k] = nodePos(n);
    var d = nodeKindDef(n.sys, n.k);
    if (d && d.hub) isHub[k] = true;
    bucket(n.sys).nodes.push(n);
  });
  m.runs.forEach(function (r) { adj["r" + r.id] = []; bucket(r.sys).runs.push(r); });
  Object.keys(bySys).forEach(function (sys) {
    var g = bySys[sys];
    g.nodes.forEach(function (n) {
      var kn = "n" + n.id, p = pos[kn];
      g.runs.forEach(function (r) {
        if (!nodeTouchesRun(n, r, p)) return;
        adj[kn].push("r" + r.id);
        adj["r" + r.id].push(kn);
      });
    });
    for (var i = 0; i < g.runs.length; i++)
      for (var j = i + 1; j < g.runs.length; j++)
        if (runsTouch(g.runs[i], g.runs[j], MEP_TOUCH)) {
          adj["r" + g.runs[i].id].push("r" + g.runs[j].id);
          adj["r" + g.runs[j].id].push("r" + g.runs[i].id);
        }
  });
  // BFS hop-distance from all hubs
  var dist = {}, q = [];
  Object.keys(isHub).forEach(function (k) { dist[k] = 0; q.push(k); });
  while (q.length) {
    var k = q.shift();
    adj[k].forEach(function (nb) { if (dist[nb] === undefined) { dist[nb] = dist[k] + 1; q.push(nb); } });
  }
  var flow = {};
  m.runs.forEach(function (r) {
    var kr = "r" + r.id, alive = dist[kr] !== undefined, dir = 1;
    if (alive && r.pts && r.pts.length >= 2) {
      // upstream neighbour = adjacent entity with the smallest hub-distance
      var best = null, bd = Infinity;
      adj[kr].forEach(function (nb) { if (dist[nb] !== undefined && dist[nb] < bd) { bd = dist[nb]; best = nb; } });
      if (best) {
        var e0 = r.pts[0], e1 = r.pts[r.pts.length - 1], startUpstream;
        if (best[0] === "n") {
          var rp = pos[best];
          startUpstream = Math.hypot(e0.x - rp.x, e0.z - rp.z) <= Math.hypot(e1.x - rp.x, e1.z - rp.z);
        } else {
          var orun = m.runs.find(function (x) { return "r" + x.id === best; });
          startUpstream = !!orun && minDistPointToRun(e0, orun) <= minDistPointToRun(e1, orun);
        }
        dir = startUpstream ? 1 : -1;
      }
      var mode = runFlowKind(r.sys, r.k);
      if (mode === "gravity" || mode === "return") dir = -dir;
    }
    flow[r.id] = {
      alive: alive, dir: dir, flow: runFlowKind(r.sys, r.k),
      uphill: gravityUphill(r), bedroom: gasThroughBedroom(r),
    };
  });
  return flow;
}

export { runTouchesPoint, runsTouch, wallRouteBlocked };
