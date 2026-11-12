/* MEP topology migration, change events, nodes and runs, split out of
   js/mep.js. It shares the editor's state through live imports from ../mep.js.
   */
import { wallGeom } from "../geometry.js";
import { effectiveRunLayers, policyLayerFor, routingPolicy, runTouchesPoint, runsTouch, wallRouteBlocked } from "../mep/routing.js";
import { S, fin, uid } from "../state.js";
import {
  MEP_TOUCH, allowedLayersFor, defaultLayerFor, ensureMEP, layerAllowed,
  mepListeners, mepNotifyQueued, nodeKindDef, runKindDef, set_mepNotifyQueued,
} from "../mep.js";

// Legacy scenes represented connectivity only by geometric contact. Convert
// each source-connected component into an explicit circuit/service branch on
// load, preserving every original node and run even when inference is partial.
export function migrateMEPTopology(model = ensureMEP()) {
  var nodes = model.nodes || [], runs = model.runs || [];
  model.circuits = model.circuits || [];
  model.branches = model.branches || [];
  nodes.forEach(function(source) {
    var def = nodeKindDef(source.sys, source.k);
    if (!def || !def.hub) return;
    var reachedNodes = new Set([source.id]), reachedRuns = new Set(), changed = true;
    while (changed) {
      changed = false;
      runs.forEach(function(run) {
        if (run.sys !== source.sys || reachedRuns.has(run.id)) return;
        var touches = nodes.some(function(n) {
          return reachedNodes.has(n.id) && nodeTouchesRun(n, run, nodePos(n));
        }) || runs.some(function(other) { return reachedRuns.has(other.id) && runsTouch(other, run, MEP_TOUCH); });
        if (touches) { reachedRuns.add(run.id); changed = true; }
      });
      nodes.forEach(function(n) {
        if (n.sys !== source.sys || reachedNodes.has(n.id)) return;
        if (runs.some(function(run) { return reachedRuns.has(run.id) && nodeTouchesRun(n, run, nodePos(n)); })) {
          reachedNodes.add(n.id); changed = true;
        }
      });
    }
    var devices = nodes.filter(function(n) { return n !== source && reachedNodes.has(n.id) && n.sourceId == null; });
    if (!devices.length) return;
    if (source.sys === "power") {
      var cid = "legacy-circuit-" + source.id;
      while (model.circuits.some(function(c) { return c.id === cid; })) cid += "-more";
      model.circuits.push({ id: cid, number: model.circuits.length + 1, kind: "legacy", panelId: source.id,
        deviceIds: devices.map(function(n) { return n.id; }), estimatedLoadW: 0, inferred: true });
      devices.forEach(function(n) { n.sourceId = source.id; n.circuitId = cid; });
      runs.forEach(function(r) { if (reachedRuns.has(r.id) && r.circuitId == null) r.circuitId = cid; });
    } else {
      var bid = "legacy-branch-" + source.id;
      while (model.branches.some(function(b) { return b.id === bid; })) bid += "-more";
      model.branches.push({ id: bid, sys: source.sys, kind: "legacy", sourceId: source.id,
        deviceIds: devices.map(function(n) { return n.id; }), inferred: true });
      devices.forEach(function(n) { n.sourceId = source.id; n.branchId = bid; n.branchIds = [bid]; });
      runs.forEach(function(r) { if (reachedRuns.has(r.id) && r.branchId == null) r.branchId = bid; });
    }
  });
  return model;
}

export function onMEPChange(fn) {
  mepListeners.push(fn);
  return function () {
    var i = mepListeners.indexOf(fn);
    if (i >= 0) mepListeners.splice(i, 1);
  };
}
function emitMEP() {
  if (!mepListeners.length || mepNotifyQueued) return;
  set_mepNotifyQueued(true);
  queueMicrotask(function () {
    set_mepNotifyQueued(false);
    var fns = mepListeners.slice();
    for (var i = 0; i < fns.length; i++) fns[i]();
  });
}

export function addNode(sys, k, x, z, wall, s, layer) {
  var d = nodeKindDef(sys, k) || {};
  layer = layerAllowed(sys, k, "node", layer) ? layer : defaultLayerFor(sys, k, "node");
  var onWall = layer === "wall"; // only wall devices ride a wall
  var n = {
    id: uid(),
    sys: sys,
    k: k,
    layer: layer,
    x: x,
    z: z,
    wall: onWall && wall != null ? wall : null,
    s: onWall && s != null ? s : null,
    elev: d.elev != null ? d.elev : 100,
    label: "",
    sourceId: null,
    circuitId: null,
    branchId: null,
    itemId: null,
  };
  ensureMEP().nodes.push(n);
  emitMEP();
  return n;
}
export function addRun(sys, k, pts, a, b, layer) {
  if (!Array.isArray(pts) || pts.length < 2 || !runKindDef(sys, k)) return null;
  var d = runKindDef(sys, k) || {};
  var policy = routingPolicy(sys, k);
  // Required overrides the plane the caller asked for. Preferred does not:
  // the caller already chose the next route's plane, and a preference must
  // not redraw a run the user placed on another legal plane.
  var requireBlocked = policy.mode === "require" && layerAllowed(sys, k, "run", policy.layer)
    && wallRouteBlocked(sys, k, policy.layer, pts, d.dia);
  if (policy.mode === "require" && layerAllowed(sys, k, "run", policy.layer) && !requireBlocked)
    layer = policy.layer;
  layer = layerAllowed(sys, k, "run", layer) ? layer : defaultLayerFor(sys, k, "run");
  var run = {
    id: uid(),
    sys: sys,
    k: k,
    layer: layer,
    pts: pts.map(function (p) { return { x: p.x, z: p.z }; }),
    dia: d.dia || 2,
    elev: null,
    color: null,
    fall: 0,
    exposed: !!d.exposed,
    a: a ?? null,
    b: b ?? null,
    policyViolation: !!requireBlocked,
    circuitId: null,
    branchId: null,
  };
  ensureMEP().runs.push(run);
  emitMEP();
  return run;
}
// Change a device's kind and move it onto a legal plane. Leaving the wall
// plane snapshots the resolved station first — otherwise a ceiling light that
// used to be an outlet keeps a wall id and nodePos() keeps riding that wall.
export function setNodeKind(n, k) {
  var def = nodeKindDef(n && n.sys, k);
  if (!n || !def) return false;
  n.k = k;
  if (def.elev != null) n.elev = def.elev;
  if (allowedLayersFor(n.sys, n.k, "node").indexOf(n.layer) < 0)
    setMEPLayer(n, defaultLayerFor(n.sys, n.k, "node"));
  emitMEP();
  return true;
}
export function setRunKind(r, k) {
  var def = runKindDef(r && r.sys, k);
  if (!r || !def) return false;
  r.k = k;
  r.dia = def.dia || r.dia || 2;
  r.color = null;
  r.exposed = !!def.exposed;
  if (effectiveRunLayers(r.sys, r.k).indexOf(r.layer) < 0)
    setMEPLayer(r, policyLayerFor(r.sys, r.k, defaultLayerFor(r.sys, r.k, "run")));
  emitMEP();
  return true;
}
export function setMEPLayer(e, layer) {
  if (!e) return false;
  var mode = Array.isArray(e.pts) ? "run" : "node";
  var allowed = mode === "node" ? allowedLayersFor(e.sys, e.k, "node") : effectiveRunLayers(e.sys, e.k);
  if (allowed.indexOf(layer) < 0) return false;
  if (mode === "run" && wallRouteBlocked(e.sys, e.k, layer, e.pts, e.dia)) {
    e.policyViolation = true;
    emitMEP();
    return false;
  }
  if (mode === "node" && layer !== "wall" && e.wall != null) {
    var p = nodePos(Object.assign({}, e, { layer: "wall" }));
    e.x = p.x;
    e.z = p.z;
    e.wall = null;
    e.s = null;
  }
  if (e.layer !== layer) {
    e.layer = layer;
    if (layer === "floor") ensureMEP().xray.floor = true;
    if (layer === "ceiling") ensureMEP().xray.ceiling = true;
  }
  emitMEP();
  return true;
}
export function nodeById(id) {
  return ensureMEP().nodes.find(function (n) { return n.id === id; });
}
// Called before walls are removed. A device riding a doomed wall is frozen at
// its last RESOLVED position and becomes free-standing — otherwise it keeps a
// dangling wall id and nodePos() falls back to a stale x/z, teleporting the
// device to wherever the wall used to be before it was last moved.
// `doomed` is a predicate or a lookup object keyed by wall id.
export function detachNodesFromWalls(doomed) {
  var m = S.mep;
  if (!m || !m.nodes) return;
  var hit = typeof doomed === "function" ? doomed : function (id) { return !!doomed[id]; };
  m.nodes.forEach(function (n) {
    if (n.wall == null || !hit(n.wall)) return;
    var p = nodePos(n);
    n.x = p.x;
    n.z = p.z;
    n.wall = null;
    n.s = null;
  });
}
// clear the in-progress route only
export function cancelRoute() {
  ensureMEP().route = null;
}
// clear both the armed palette entry and any in-progress route
export function cancelMEP() {
  var m = ensureMEP();
  m.route = null;
  m.place = null;
}
// commit the in-progress route into a run (needs ≥2 points); returns the run
export function finishRoute() {
  var m = ensureMEP();
  if (!m.route) return null;
  var pts = m.route.pts;
  var run = pts.length >= 2 ? addRun(m.route.sys, m.route.k, pts, null, null, m.route.layer) : null;
  if (run) linkRunEndpoints(run); // auto-connect endpoints to nearby devices
  m.route = null;
  return run;
}
export function deleteMEP(sel) {
  var m = ensureMEP();
  if (!sel) return;
  if (sel.kind === "mepNode") {
    m.nodes = m.nodes.filter(function (n) { return n !== sel.ref; });
    // orphan any run endpoints that referenced it (keep the run geometry)
    m.runs.forEach(function (r) {
      if (r.a === sel.ref.id) r.a = null;
      if (r.b === sel.ref.id) r.b = null;
    });
  } else if (sel.kind === "mepRun") {
    m.runs = m.runs.filter(function (r) { return r !== sel.ref; });
  } else return;
  emitMEP();
}

// World position of a node — a wall-attached node is resolved from its wall so
// it tracks the wall when the wall is edited/moved.
export function nodePos(n) {
  if (!n) return { x: 0, z: 0 };
  // Only a wall-plane device tracks its host. A stale wall id on a ceiling
  // or floor device, or a wall id whose station was lost, must not pull the
  // marker to the wall origin (s null used to multiply through as 0).
  if (n.layer === "wall" && n.wall != null && fin(n.s)) {
    var w = (S.walls || []).find(function (ww) { return ww.id === n.wall; });
    if (w) {
      var g = wallGeom(w);
      return { x: g.a.x + g.ux * n.s, z: g.a.z + g.uz * n.s };
    }
  }
  return { x: fin(n.x) ? n.x : 0, z: fin(n.z) ? n.z : 0 };
}

export function runLength(run) {
  var L = 0;
  for (var i = 1; i < run.pts.length; i++) {
    L += Math.hypot(run.pts[i].x - run.pts[i - 1].x, run.pts[i].z - run.pts[i - 1].z);
  }
  return L;
}

// True when a wall-plane run occupies the rectangle of a door/passage. The
// router prevents this for new routes; this audit also catches imported runs,
// old saved plans and vertices that were dragged manually after routing.
export function runCrossesOpening(run) {
  if (!run || run.layer !== "wall" || !Array.isArray(run.pts)) return false;
  var openings = S.openings || [], walls = S.walls || [];
  for (var i = 1; i < run.pts.length; i++) {
    var A = run.pts[i - 1], B = run.pts[i];
    for (var j = 0; j < openings.length; j++) {
      var o = openings[j];
      if (!o || o.type === "window" || !fin(o.width) || o.width <= 0) continue;
      var w = walls.find(function (ww) { return ww.id === o.wall; });
      if (!w) continue;
      var g = wallGeom(w), pad = Math.max(2, (run.dia || 2) / 2);
      var ax = (A.x - g.a.x) * g.ux + (A.z - g.a.z) * g.uz;
      var ay = -(A.x - g.a.x) * g.uz + (A.z - g.a.z) * g.ux;
      var bx = (B.x - g.a.x) * g.ux + (B.z - g.a.z) * g.uz;
      var by = -(B.x - g.a.x) * g.uz + (B.z - g.a.z) * g.ux;
      var x0 = o.s - o.width / 2 - pad, x1 = o.s + o.width / 2 + pad;
      var y0 = -(w.thickness || 10) / 2 - pad, y1 = -y0;
      if (segmentHitsRect(ax, ay, bx, by, x0, y0, x1, y1)) return true;
    }
  }
  return false;
}
function segmentHitsRect(ax, ay, bx, by, x0, y0, x1, y1) {
  var t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay;
  var p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (var i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; continue; }
    var r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

function touchTol(r) {
  return MEP_TOUCH + (fin(r.dia) ? r.dia : 0) / 2;
}
function nodeTouchesRun(n, r, p) {
  if (!r || r.sys !== n.sys || !r.pts || r.pts.length < 2) return false;
  if (r.a === n.id || r.b === n.id) return true;
  if (r.explicit) return false;
  return runTouchesPoint(r, p || nodePos(n), touchTol(r));
}
// Is a device touched by any same-system run? True if a run endpoint id or
// any run segment passes within tolerance of the device.
export function isNodeConnected(n) {
  var m = ensureMEP();
  var p = nodePos(n);
  return m.runs.some(function (r) { return nodeTouchesRun(n, r, p); });
}
// Non-hub devices that no same-system run reaches — these need a connection.
export function unconnectedNodes() {
  var m = ensureMEP();
  return m.nodes.filter(function (n) {
    var def = nodeKindDef(n.sys, n.k);
    if (def && def.hub) return false; // sources aren't "unconnected"
    return !isNodeConnected(n);
  });
}
// Link a run's endpoints (a/b) to the nearest same-system device at each end.
export function linkRunEndpoints(run) {
  if (run.explicit) return;
  var m = ensureMEP();
  if (run.pts.length < 2) return;
  var ends = [{ p: run.pts[0], set: "a" }, { p: run.pts[run.pts.length - 1], set: "b" }];
  ends.forEach(function (e) {
    var best = null, bd = 12; // cm
    m.nodes.forEach(function (n) {
      if (n.sys !== run.sys) return;
      var np = nodePos(n), d = Math.hypot(e.p.x - np.x, e.p.z - np.z);
      if (d < bd) { bd = d; best = n; }
    });
    run[e.set] = best ? best.id : null;
  });
}

export { emitMEP, nodeTouchesRun };
