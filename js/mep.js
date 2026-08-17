// MEP (Mechanical/Electrical/Plumbing) infrastructure layer.
// Four independent, color-coded networks — electrical, water supply, drainage,
// and comms/data — drawn as an overlay on the 2D plan and, optionally, as thin
// conduits + device markers embedded in the walls in the 3D view.
//
// Model (lives on S.mep):
//   nodes: [{ id, sys, k, x, z, wall|null, s|null, elev, label }]
//   runs:  [{ id, sys, k, pts:[{x,z}], dia, color|null, a|null, b|null }]
// A node attached to a wall keeps the wall id + parametric distance `s` so it
// rides the wall when the wall moves; free nodes keep raw x/z. Runs are simple
// polylines; endpoints may reference node ids (a/b) for future connectivity.
import { S, uid, clamp, fin } from "./state.js";
import { wallGeom, distSeg } from "./geometry.js";
import { makeRouter } from "./mep_route.js";
import { getLang } from "./i18n.js";

/* ---- bilingual labels (kept here so all MEP naming lives in one place) --- */
const MEP_L = {
  sys: {
    power: { en: "Electrical", he: "חשמל" },
    water: { en: "Water", he: "מים" },
    drain: { en: "Drainage", he: "ניקוז" },
    comms: { en: "Comms", he: "תקשורת" },
    hvac: { en: "Air conditioning", he: "מיזוג אוויר" },
  },
  node: {
    "power.panel": { en: "Panel", he: "לוח חשמל" },
    "power.outlet": { en: "Outlet", he: "שקע" },
    "power.switch": { en: "Switch", he: "מתג" },
    "power.light": { en: "Light point", he: "נקודת אור" },
    "power.junction": { en: "Junction box", he: "תיבת חיבורים" },
    "water.manifold": { en: "Water manifold", he: "מרכזיית מים" },
    "water.valve": { en: "Valve", he: "ברז" },
    "water.tee": { en: "Tee", he: "מפצל" },
    "water.fixture": { en: "Fixture", he: "כלי" },
    "drain.stack": { en: "Soil stack", he: "קולטן" },
    "drain.trap": { en: "Trap", he: "סיפון" },
    "drain.floor": { en: "Floor drain", he: "מחסום רצפה" },
    "drain.vent": { en: "Vent", he: "אוורור" },
    "drain.cleanout": { en: "Cleanout", he: "פתח ניקוי" },
    "comms.rack": { en: "Rack", he: "ארון תקשורת" },
    "comms.port": { en: "Data port", he: "נקודת רשת" },
    "comms.ap": { en: "Access point", he: "נקודת גישה" },
    "comms.junction": { en: "Junction", he: "מפצל" },
    "hvac.unit": { en: "Fan coil unit", he: "יחידה פנימית / מפוח" },
    "hvac.condenser": { en: "Condenser", he: "יחידה חיצונית (מעבה)" },
    "hvac.plenum": { en: "Plenum box", he: "תיבת פיצול" },
    "hvac.supply": { en: "Supply diffuser", he: "מפזר אוויר" },
    "hvac.return": { en: "Return grille", he: "רשת אוויר חוזר" },
    "hvac.thermostat": { en: "Thermostat", he: "תרמוסטט" },
  },
  run: {
    "power.circuit": { en: "Circuit cable", he: "כבל מעגל" },
    "water.cold": { en: "Cold pipe", he: "צינור קר" },
    "water.hot": { en: "Hot pipe", he: "צינור חם" },
    "drain.waste": { en: "Waste pipe", he: "צינור שופכין" },
    "drain.vent": { en: "Vent pipe", he: "צינור אוורור" },
    "comms.cat6": { en: "Cat6 cable", he: "כבל Cat6" },
    "comms.coax": { en: "Coax cable", he: "כבל קואקס" },
    "hvac.duct": { en: "Exposed main duct", he: "תעלה ראשית גלויה" },
    "hvac.branch": { en: "Exposed branch duct", he: "תעלת הסתעפות גלויה" },
    "hvac.flex": { en: "Flexible duct", he: "תעלה גמישה" },
    "hvac.refrig": { en: "Refrigerant lines", he: "צנרת גז" },
    "hvac.condensate": { en: "Condensate drain", he: "ניקוז מזגן" },
    "hvac.control": { en: "Control cable", he: "כבל פיקוד" },
  },
};
function pick(o) {
  return o ? o[getLang()] || o.en : "";
}
export function sysLabel(sys) {
  return pick(MEP_L.sys[sys]);
}
export function nodeLabel(sys, k) {
  return pick(MEP_L.node[sys + "." + k]) || k;
}
export function runLabel(sys, k) {
  return pick(MEP_L.run[sys + "." + k]) || k;
}
// human-readable name for a selected entity (used by the tree/inspector)
export function mepName(sel) {
  if (!sel) return "";
  if (sel.kind === "mepNode") return sysLabel(sel.ref.sys) + " · " + nodeLabel(sel.ref.sys, sel.ref.k);
  if (sel.kind === "mepRun") return sysLabel(sel.ref.sys) + " · " + runLabel(sel.ref.sys, sel.ref.k);
  return "";
}

/* ---- system + kind catalog ---------------------------------------------- */
// Each system has a plan color, a 3D color, and a default conduit height (cm)
// used when extruding runs into the 3D walls.
export const MEP_SYS = {
  power: { key: "power", color: "#f59e0b", c3d: 0xf59e0b, runY: 30 },
  water: { key: "water", color: "#2563eb", c3d: 0x2563eb, runY: 110 },
  drain: { key: "drain", color: "#15803d", c3d: 0x15803d, runY: 12 },
  comms: { key: "comms", color: "#7c3aed", c3d: 0x7c3aed, runY: 45 },
  // Ducts do not live inside walls like the other four — their natural home is
  // the ceiling void, so the wall-layer height is already up at bulkhead level.
  hvac: { key: "hvac", color: "#0891b2", c3d: 0x0891b2, runY: 236 },
};
export const MEP_SYS_ORDER = ["power", "water", "drain", "comms", "hvac"];

// Routing plane: infrastructure runs in walls, along the ceiling, or under the
// floor slab. The layer drives 3D height (see layerRunY/layerNodeY) and whether
// a device attaches to a wall (only 'wall' devices do). 'W'/'C'/'F' is the 2D tag.
export const MEP_LAYERS = ["wall", "ceiling", "floor"];
export const MEP_LAYER_TAG = { wall: "", ceiling: "C", floor: "F" };
var FLOOR_RUN_Y = -10; // under the slab
var FLOOR_NODE_Y = 2;
function ceilingY() {
  var h = 0;
  S.walls.forEach(function (w) { if (w.height > h) h = w.height; });
  return h || 270;
}
// 3D height of a run's conduit for its layer
export function layerRunY(sys, layer) {
  if (layer === "ceiling") return ceilingY() - 6;
  if (layer === "floor") return FLOOR_RUN_Y;
  return MEP_SYS[sys].runY;
}
// 3D height of every vertex of a run. Level for pressurised systems; a gravity
// run (waste, condensate) starts `fall` cm high and drops to the layer height
// at its downstream end, interpolated by distance along the polyline.
export function runPointY(r) {
  var base = layerRunY(r.sys, r.layer), fall = runFall(r);
  var kd = runKindDef(r.sys, r.k);
  // Exposed ducts hang BELOW the ceiling finish. Previously their centre was
  // only 6cm below it, so most of a 15–25cm duct disappeared into the slab.
  if (r.layer === "ceiling" && r.exposed && kd)
    base = ceilingY() - (kd.rect
      ? Math.max(14, r.dia * (kd.hRatio || 0.6) / 2 + 10)
      : Math.max(10, r.dia / 2 + 6));
  var cum = [0], L = 0;
  for (var i = 1; i < r.pts.length; i++) {
    L += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].z - r.pts[i - 1].z);
    cum.push(L);
  }
  return cum.map(function (c) { return base + (fall ? fall * (1 - (L ? c / L : 0)) : 0); });
}
// 3D height of a device marker for its layer
export function layerNodeY(n) {
  if (n.layer === "ceiling") return ceilingY() - 2;
  if (n.layer === "floor") return FLOOR_NODE_Y;
  return Math.max(2, n.elev);
}

// Device/junction kinds. `code` is the single glyph drawn on the marker disc;
// `hub` marks distribution points (panel/manifold/stack/rack) drawn larger as a
// rounded square. `elev` is the mounting height (cm) for the 3D marker.
// `price` = unit cost (ILS) for the bill-of-materials / cost estimate.
export const MEP_NODE_KINDS = {
  power: [
    { k: "panel", code: "P", hub: true, elev: 150, price: 450, layers: ["wall"] },
    { k: "outlet", code: "O", elev: 30, price: 35, layers: ["wall"] },
    { k: "switch", code: "S", elev: 110, price: 30, layers: ["wall"] },
    { k: "light", code: "L", elev: 240, price: 40, layers: ["ceiling"] },
    { k: "junction", code: "J", elev: 240, price: 15, layers: ["wall", "ceiling"] },
  ],
  water: [
    { k: "manifold", code: "M", hub: true, elev: 40, price: 380, layers: ["wall", "floor"] },
    { k: "valve", code: "V", elev: 60, price: 60, layers: ["wall", "floor"] },
    { k: "tee", code: "T", elev: 40, price: 25, layers: ["wall", "floor"] },
    { k: "fixture", code: "F", elev: 60, price: 120, layers: ["wall"] },
  ],
  drain: [
    { k: "stack", code: "S", hub: true, elev: 0, price: 220, layers: ["floor"] },
    { k: "trap", code: "P", elev: 12, price: 45, layers: ["floor"] },
    { k: "floor", code: "D", elev: 0, price: 90, layers: ["floor"] },
    { k: "vent", code: "A", elev: 240, price: 40, layers: ["wall", "ceiling"] },
    { k: "cleanout", code: "C", elev: 12, price: 35, layers: ["wall", "floor"] },
  ],
  comms: [
    { k: "rack", code: "R", hub: true, elev: 60, price: 400, layers: ["wall"] },
    { k: "port", code: "D", elev: 30, price: 30, layers: ["wall"] },
    { k: "ap", code: "W", elev: 240, price: 180, layers: ["ceiling"] },
    { k: "junction", code: "J", elev: 60, price: 15, layers: ["wall", "ceiling"] },
  ],
  hvac: [
    { k: "unit", code: "F", hub: true, elev: 236, price: 6500, layers: ["ceiling"] },
    { k: "condenser", code: "C", hub: true, elev: 10, price: 4800, layers: ["floor"] },
    { k: "plenum", code: "B", elev: 236, price: 380, layers: ["ceiling"] },
    { k: "supply", code: "S", elev: 262, price: 260, layers: ["ceiling"] },
    { k: "return", code: "R", elev: 262, price: 320, layers: ["ceiling"] },
    { k: "thermostat", code: "T", elev: 150, price: 450, layers: ["wall"] },
  ],
};

// Run (pipe/cable/duct) kinds — `dia` in cm drives both plan stroke width and
// 3D tube radius; an optional per-kind `color` overrides the system color
// (e.g. hot water red vs. cold blue). `dash` sets the plan line dash.
// `pricePerM` = cost (ILS) per metre of run for the bill-of-materials.
export const MEP_RUN_KINDS = {
  power: [{ k: "circuit", dia: 2, dash: [], pricePerM: 12, layers: ["wall", "ceiling", "floor"], defaultLayer: "wall" }],
  water: [
    { k: "cold", dia: 2, color: "#2563eb", dash: [], pricePerM: 22, layers: ["floor", "wall"], defaultLayer: "floor" },
    { k: "hot", dia: 2, color: "#dc2626", dash: [], pricePerM: 26, layers: ["floor", "wall"], defaultLayer: "floor" },
  ],
  drain: [
    { k: "waste", dia: 6, dash: [], pricePerM: 35, layers: ["floor"], defaultLayer: "floor" },
    { k: "vent", dia: 4, color: "#65a30d", dash: [7, 5], pricePerM: 28, layers: ["wall", "ceiling"], defaultLayer: "ceiling" },
  ],
  comms: [
    { k: "cat6", dia: 1.5, dash: [3, 4], pricePerM: 8, layers: ["wall", "ceiling", "floor"], defaultLayer: "wall" },
    { k: "coax", dia: 2, color: "#9333ea", dash: [3, 4], pricePerM: 10, layers: ["wall", "ceiling", "floor"], defaultLayer: "wall" },
  ],
  // `rect` extrudes a rectangular section in 3D instead of a round tube — a
  // 25cm sheet-metal duct drawn as a fat pipe reads as plumbing, not ductwork.
  // `dia` is the duct's height/width, so it still drives the plan stroke.
  hvac: [
    { k: "duct", dia: 25, rect: true, exposed: true, dash: [], pricePerM: 190, layers: ["ceiling"], defaultLayer: "ceiling" },
    { k: "branch", dia: 18, rect: true, exposed: true, dash: [], pricePerM: 140, layers: ["ceiling"], defaultLayer: "ceiling" },
    { k: "flex", dia: 15, exposed: true, color: "#0e7490", dash: [6, 4], pricePerM: 75, layers: ["ceiling"], defaultLayer: "ceiling" },
    { k: "refrig", dia: 4, exposed: true, color: "#b45309", dash: [], pricePerM: 120, layers: ["ceiling", "wall", "floor"], defaultLayer: "ceiling" },
    { k: "condensate", dia: 3, exposed: true, color: "#65a30d", dash: [5, 4], pricePerM: 45, layers: ["ceiling", "wall", "floor"], defaultLayer: "floor" },
    { k: "control", dia: 1.5, color: "#475569", dash: [3, 4], pricePerM: 14, layers: ["ceiling", "wall"], defaultLayer: "ceiling" },
  ],
};

export function allowedLayersFor(sys, k, mode) {
  var d = mode === "node" ? nodeKindDef(sys, k) : runKindDef(sys, k);
  return d && d.layers ? d.layers.slice() : MEP_LAYERS.slice();
}
export function defaultLayerFor(sys, k, mode) {
  var d = mode === "node" ? nodeKindDef(sys, k) : runKindDef(sys, k);
  if (d && d.defaultLayer) return d.defaultLayer;
  return d && d.layers && d.layers[0] || "wall";
}
export function layerAllowed(sys, k, mode, layer) {
  return allowedLayersFor(sys, k, mode).indexOf(layer) >= 0;
}

// Gravity systems are laid to a fall, not level: a waste pipe drops ~2cm per
// metre toward the stack and a condensate line ~1cm. `run.fall` is the total
// drop (cm) from the FIRST point of the polyline to the last, so the upstream
// end is the one that sits higher in 3D.
export function runFall(r) {
  return fin(r.fall) ? r.fall : 0;
}

export function nodeKindDef(sys, k) {
  return (MEP_NODE_KINDS[sys] || []).find(function (d) { return d.k === k; });
}
export function runKindDef(sys, k) {
  return (MEP_RUN_KINDS[sys] || []).find(function (d) { return d.k === k; });
}
// Color a run is drawn/extruded in: kind override first, then the system color.
export function runColor(run) {
  var d = runKindDef(run.sys, run.k);
  return run.color || (d && d.color) || MEP_SYS[run.sys].color;
}

/* ---- state bootstrap ----------------------------------------------------- */
// Older saved scenes have no `mep` block — create a valid empty one on demand.
export function ensureMEP() {
  if (!S.mep) {
    S.mep = {
      nodes: [],
      runs: [],
      show: true,
      show3D: true,
      xray: { walls: false, floor: false, ceiling: false }, // 3D see-through surfaces to reveal embedded conduits
      snapAngle: true,
      wallRoute: true, // expand each drawn segment into a wall-following path
      animate: true, // animate directional flow on live runs
      layer: "wall", // active routing plane: wall | ceiling | floor
      vis: { power: true, water: true, drain: true, comms: true, hvac: true },
      active: "power",
      routePolicy: {}, // "system.kind" -> { mode:auto|prefer|require, layer }
      place: null, // { sys, k, mode:'node'|'run' } — armed palette entry
      route: null, // { sys, k, pts:[...] } — in-progress polyline
    };
  }
  if (typeof S.mep.xray === "boolean") {
    S.mep.xray = { walls: S.mep.xray, floor: false, ceiling: false };
  } else if (!S.mep.xray || typeof S.mep.xray !== "object") {
    S.mep.xray = { walls: false, floor: false, ceiling: false };
  }
  if (S.mep.xray.walls === undefined) S.mep.xray.walls = false;
  if (S.mep.xray.floor === undefined) S.mep.xray.floor = false;
  if (S.mep.xray.ceiling === undefined) S.mep.xray.ceiling = false;
  if (S.mep.animate === undefined) S.mep.animate = true;
  if (S.mep.wallRoute === undefined) S.mep.wallRoute = true;
  if (!S.mep.layer) S.mep.layer = "wall";
  // transient fields are never persisted; make sure they exist after a load
  if (!S.mep.vis) S.mep.vis = { power: true, water: true, drain: true, comms: true, hvac: true };
  if (!S.mep.active) S.mep.active = "power";
  if (!S.mep.routePolicy || typeof S.mep.routePolicy !== "object") S.mep.routePolicy = {};
  if (S.mep.place === undefined) S.mep.place = null;
  if (S.mep.route === undefined) S.mep.route = null;
  return S.mep;
}

export function mepVisible(sys) {
  var m = ensureMEP();
  return m.show && m.vis[sys] !== false;
}

// Restore MEP state from a saved/imported scene, validating each entity.
export function loadMEP(d) {
  ensureMEP();
  var m = S.mep;
  m.nodes = ((d && d.nodes) || [])
    .filter(function (n) { return n && MEP_SYS[n.sys] && nodeKindDef(n.sys, n.k); })
    .map(function (n) {
      var def = nodeKindDef(n.sys, n.k);
      var layer = MEP_LAYERS.indexOf(n.layer) >= 0 ? n.layer : defaultLayerFor(n.sys, n.k, "node");
      if (!layerAllowed(n.sys, n.k, "node", layer)) layer = defaultLayerFor(n.sys, n.k, "node");
      return {
        id: n.id || uid(),
        sys: n.sys,
        k: n.k,
        layer: layer,
        x: fin(n.x) ? n.x : 0,
        z: fin(n.z) ? n.z : 0,
        wall: layer === "wall" && n.wall != null ? n.wall : null,
        s: layer === "wall" && fin(n.s) ? n.s : null,
        elev: fin(n.elev) ? n.elev : def.elev != null ? def.elev : 100,
        label: n.label || "",
      };
    });
  m.runs = ((d && d.runs) || [])
    .filter(function (r) { return r && MEP_SYS[r.sys] && runKindDef(r.sys, r.k) && Array.isArray(r.pts); })
    .map(function (r) {
      var layer = MEP_LAYERS.indexOf(r.layer) >= 0 ? r.layer : defaultLayerFor(r.sys, r.k, "run");
      if (!layerAllowed(r.sys, r.k, "run", layer)) layer = defaultLayerFor(r.sys, r.k, "run");
      return {
        id: r.id || uid(),
        sys: r.sys,
        k: r.k,
        layer: layer,
        pts: r.pts.filter(function (p) { return p && fin(p.x) && fin(p.z); })
          .map(function (p) { return { x: p.x, z: p.z }; }),
        dia: fin(r.dia) ? r.dia : (runKindDef(r.sys, r.k).dia || 2),
        color: r.color || null,
        fall: fin(r.fall) ? r.fall : 0, // gravity fall along the run (cm)
        exposed: r.exposed != null ? !!r.exposed : !!runKindDef(r.sys, r.k).exposed,
        a: r.a || null,
        b: r.b || null,
      };
    })
    .filter(function (r) { return r.pts.length >= 2; });
  if (d) {
    if (d.show != null) m.show = !!d.show;
    if (d.show3D != null) m.show3D = !!d.show3D;
    if (d.snapAngle != null) m.snapAngle = !!d.snapAngle;
    if (d.vis) m.vis = Object.assign({ power: true, water: true, drain: true, comms: true, hvac: true }, d.vis);
    if (d.xray != null) {
      if (typeof d.xray === "object") {
        m.xray = {
          walls: !!d.xray.walls,
          floor: !!d.xray.floor,
          ceiling: !!d.xray.ceiling,
        };
      } else {
        m.xray = { walls: !!d.xray, floor: false, ceiling: false };
      }
    }
    if (d.animate != null) m.animate = !!d.animate;
    if (d.wallRoute != null) m.wallRoute = !!d.wallRoute;
    if (d.layer && MEP_LAYERS.indexOf(d.layer) >= 0) m.layer = d.layer;
    if (d.routePolicy && typeof d.routePolicy === "object") m.routePolicy = d.routePolicy;
  }
  m.route = null;
  m.place = null;
  autoConnectAll();
}

/* ---- CRUD ---------------------------------------------------------------- */
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
  };
  ensureMEP().nodes.push(n);
  return n;
}
export function addRun(sys, k, pts, a, b, layer) {
  var d = runKindDef(sys, k) || {};
  var policy = routingPolicy(sys, k);
  if (policy.mode === "require" && layerAllowed(sys, k, "run", policy.layer)) layer = policy.layer;
  layer = layerAllowed(sys, k, "run", layer) ? layer : defaultLayerFor(sys, k, "run");
  var run = {
    id: uid(),
    sys: sys,
    k: k,
    layer: layer,
    pts: pts.map(function (p) { return { x: p.x, z: p.z }; }),
    dia: d.dia || 2,
    color: null,
    fall: 0,
    exposed: !!d.exposed,
    a: a || null,
    b: b || null,
  };
  ensureMEP().runs.push(run);
  return run;
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
  }
}

// World position of a node — a wall-attached node is resolved from its wall so
// it tracks the wall when the wall is edited/moved.
export function nodePos(n) {
  if (n.wall != null) {
    var w = S.walls.find(function (ww) { return ww.id === n.wall; });
    if (w) {
      var g = wallGeom(w);
      return { x: g.a.x + g.ux * n.s, z: g.a.z + g.uz * n.s };
    }
  }
  return { x: n.x, z: n.z };
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
  for (var i = 1; i < run.pts.length; i++) {
    var A = run.pts[i - 1], B = run.pts[i];
    for (var j = 0; j < S.openings.length; j++) {
      var o = S.openings[j];
      if (o.type === "window") continue;
      var w = S.walls.find(function (ww) { return ww.id === o.wall; });
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

/* ---- connectivity: auto-connect run endpoints to devices + flag orphans --- */
// Is a device touched by any same-system run? True if a run endpoint/vertex or
// any run segment passes within tolerance of the device.
export function isNodeConnected(n) {
  var m = ensureMEP();
  var p = nodePos(n);
  var tol = 10; // cm
  return m.runs.some(function (r) {
    if (r.sys !== n.sys || r.pts.length < 2) return false;
    if (r.a === n.id || r.b === n.id) return true;
    for (var i = 1; i < r.pts.length; i++) {
      if (distSeg(p.x, p.z, r.pts[i - 1].x, r.pts[i - 1].z, r.pts[i].x, r.pts[i].z) <= tol + r.dia / 2) return true;
    }
    return false;
  });
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
export function effectiveRunLayers(sys, k) {
  var p = routingPolicy(sys, k);
  return p.mode === "require" ? [p.layer] : allowedLayersFor(sys, k, "run");
}
export function applyRoutingPolicies() {
  var m = ensureMEP();
  m.runs.forEach(function (r) {
    var p = routingPolicy(r.sys, r.k);
    r.policyViolation = false;
    if (p.mode === "auto" || !layerAllowed(r.sys, r.k, "run", p.layer)) return;
    if (p.layer === "wall") {
      var probe = Object.assign({}, r, { layer: "wall" });
      if (runCrossesOpening(probe)) { r.policyViolation = p.mode === "require"; return; }
    }
    r.layer = p.layer;
  });
  if (m.runs.some(function (r) { return r.layer === "floor"; })) m.xray.floor = true;
  autoConnectAll();
}

// Repair imported/manual networks without replacing the existing layout. Each
// orphan or unsupplied device gets a trade-appropriate route to the nearest
// source. Wall routes stay strict around doors and fall back to a ceiling
// bridge with vertical drops when the wall graph is blocked.
export function connectMissingMEP() {
  var m = ensureMEP(), status = computeMEPStatus(), made = 0, skipped = 0;
  var bad = m.nodes.filter(function (n) { return !!status.node[n.id]; });
  bad.forEach(function (n) {
    var hubs = m.nodes.filter(function (h) {
      if (h.sys !== n.sys) return false;
      var hd = nodeKindDef(h.sys, h.k);
      if (!hd || !hd.hub) return false;
      if (n.sys === "hvac" && (n.k === "supply" || n.k === "return" || n.k === "thermostat"))
        return h.k === "unit";
      return true;
    });
    var np = nodePos(n), hub = null, best = Infinity;
    hubs.forEach(function (h) {
      var hp = nodePos(h), d = Math.hypot(np.x - hp.x, np.z - hp.z);
      if (d < best) { best = d; hub = h; }
    });
    if (!hub) { skipped++; return; }
    var kind = repairRunKind(n), policy = routingPolicy(n.sys, kind), layer = repairLayer(n, kind);
    var path = repairPath(hub, n, layer);
    if ((!path || path.blocked || path.pts.length < 2) && policy.mode !== "require" && layer === "wall" && layerAllowed(n.sys, kind, "run", "ceiling")) {
      layer = "ceiling";
      path = repairPath(hub, n, layer);
    }
    if (!path || path.pts.length < 2) { skipped++; return; }
    var r = addRun(n.sys, kind, path.pts, hub.id, n.id, layer);
    if (kind === "waste") r.fall = Math.min(14, runLength(r) * 0.02);
    if (kind === "condensate") r.fall = Math.min(20, runLength(r) * 0.01);
    made++;
  });
  autoConnectAll();
  return { made: made, skipped: skipped };
}
function repairRunKind(n) {
  if (n.sys === "power") return "circuit";
  if (n.sys === "water") return "cold";
  if (n.sys === "drain") return n.k === "vent" ? "vent" : "waste";
  if (n.sys === "comms") return "cat6";
  if (n.sys === "hvac") {
    if (n.k === "thermostat") return "control";
    if (n.k === "supply" || n.k === "return" || n.k === "plenum") return "branch";
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
function repairPath(a, b, layer) {
  var net = makeRouter(layer === "wall"), ap = nodePos(a), bp = nodePos(b);
  var ta = net.tap(ap, a.wall, a.s), tb = net.tap(bp, b.wall, b.s);
  return net.path(ta, tb);
}

/* ---- auto rough-in --------------------------------------------------------
   The placement + routing rules moved to mep_auto.js, which routes every run on
   the wall graph (mep_route.js) instead of drawing straight lines between
   devices. Import autoInfrastructure from there. */

// does a run pass within `tol` of point p?
function runTouchesPoint(r, p, tol) {
  for (var i = 1; i < r.pts.length; i++) {
    if (distSeg(p.x, p.z, r.pts[i - 1].x, r.pts[i - 1].z, r.pts[i].x, r.pts[i].z) <= tol) return true;
  }
  return false;
}
// do two runs physically join (an endpoint of one lands on the other)?
function runsTouch(A, B, tol) {
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
  m.nodes.forEach(function (n) { parent["n" + n.id] = "n" + n.id; });
  m.runs.forEach(function (r) { parent["r" + r.id] = "r" + r.id; });
  var tol = 12;
  // device ↔ run (same system)
  m.nodes.forEach(function (n) {
    var p = nodePos(n);
    m.runs.forEach(function (r) {
      if (r.sys !== n.sys) return;
      if (runTouchesPoint(r, p, tol + r.dia / 2)) union("n" + n.id, "r" + r.id);
    });
  });
  // run ↔ run (same system)
  for (var i = 0; i < m.runs.length; i++)
    for (var j = i + 1; j < m.runs.length; j++)
      if (m.runs[i].sys === m.runs[j].sys && runsTouch(m.runs[i], m.runs[j], tol))
        union("r" + m.runs[i].id, "r" + m.runs[j].id);
  // which components contain a hub?
  var hubComp = {};
  m.nodes.forEach(function (n) {
    var def = nodeKindDef(n.sys, n.k);
    if (def && def.hub) hubComp[find("n" + n.id)] = true;
  });
  var node = {}, run = {}, deviceIssues = 0;
  m.nodes.forEach(function (n) {
    var def = nodeKindDef(n.sys, n.k) || {};
    if (def.hub) return;
    if (!isNodeConnected(n)) { node[n.id] = "orphan"; deviceIssues++; }
    else if (!hubComp[find("n" + n.id)]) { node[n.id] = "unsupplied"; deviceIssues++; }
  });
  m.runs.forEach(function (r) {
    if (!hubComp[find("r" + r.id)]) run[r.id] = "unsupplied";
  });
  return { node: node, run: run, deviceIssues: deviceIssues };
}

// min distance from a point to a run's polyline
function minDistPointToRun(p, r) {
  var best = 1e9;
  for (var i = 1; i < r.pts.length; i++) {
    var d = distSeg(p.x, p.z, r.pts[i - 1].x, r.pts[i - 1].z, r.pts[i].x, r.pts[i].z);
    if (d < best) best = d;
  }
  return best;
}

// Flow model: which runs are "alive" (trace to a source hub) and which way the
// medium flows. Supply systems (power/water/comms) flow hub→terminals; drainage
// flows terminals→stack. Direction is found by BFS hop-distance to a hub: the
// run endpoint nearer (through the graph) to the source is upstream.
// Returns { runId: { alive, dir } } where dir=+1 means pts[0]→pts[last].
export function computeMEPFlow() {
  var m = ensureMEP();
  var adj = {}, pos = {}, isHub = {}, nodeById2 = {};
  m.nodes.forEach(function (n) { var k = "n" + n.id; adj[k] = []; pos[k] = nodePos(n); var d = nodeKindDef(n.sys, n.k); if (d && d.hub) isHub[k] = true; nodeById2[k] = n; });
  m.runs.forEach(function (r) { adj["r" + r.id] = []; });
  var tol = 12;
  m.nodes.forEach(function (n) {
    var kn = "n" + n.id, p = pos[kn];
    m.runs.forEach(function (r) {
      if (r.sys !== n.sys) return;
      if (runTouchesPoint(r, p, tol + r.dia / 2)) { adj[kn].push("r" + r.id); adj["r" + r.id].push(kn); }
    });
  });
  for (var i = 0; i < m.runs.length; i++)
    for (var j = i + 1; j < m.runs.length; j++)
      if (m.runs[i].sys === m.runs[j].sys && runsTouch(m.runs[i], m.runs[j], tol)) {
        adj["r" + m.runs[i].id].push("r" + m.runs[j].id);
        adj["r" + m.runs[j].id].push("r" + m.runs[i].id);
      }
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
    if (alive) {
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
          startUpstream = minDistPointToRun(e0, orun) <= minDistPointToRun(e1, orun);
        }
        dir = startUpstream ? 1 : -1;
      }
      if (r.sys === "drain") dir = -dir; // waste flows toward the stack
    }
    flow[r.id] = { alive: alive, dir: dir };
  });
  return flow;
}

// cheap change-signature so animation frames reuse the heavy status/flow
// computation until the network actually changes.
//
// Everything computeMEPStatus/computeMEPFlow READ must be hashed here, or the
// cache silently serves a stale answer. Two holes this used to have:
//  - node positions were hashed raw (n.x/n.z), but a wall-attached device is
//    resolved through its wall by nodePos(), so moving a WALL relocated the
//    device without changing the signature — connectivity kept reporting the
//    pre-move topology ("all connected") after a break.
//  - only a run's first/last point was hashed, so dragging an interior vertex
//    off its device did the same thing.
// Coordinates are weighted by index so that two devices moving by equal and
// opposite amounts can't cancel out into an unchanged sum.
function mepSignature(m) {
  var s = m.nodes.length * 7 + m.runs.length * 13;
  m.nodes.forEach(function (n, i) {
    var p = nodePos(n), w = i + 1;
    s += (p.x * 0.7371 + p.z * 1.3313 + (n.elev || 0) * 0.101) * w;
    s += n.layer.charCodeAt(0) + n.k.charCodeAt(0);
  });
  m.runs.forEach(function (r, i) {
    s += r.pts.length + r.k.charCodeAt(0) + r.layer.charCodeAt(0) + (r.dia || 0) * 31;
    r.pts.forEach(function (p, j) {
      var w = (i + 1) * 3 + j + 1;
      s += (p.x * 0.5077 + p.z * 0.9109) * w;
    });
  });
  return s;
}
var _sig = null, _state = null;
// cached { status, flow } — recomputed only when the network signature changes
export function getMEPState() {
  var m = ensureMEP();
  var sig = mepSignature(m);
  if (sig !== _sig) { _sig = sig; _state = { status: computeMEPStatus(), flow: computeMEPFlow() }; }
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
export function hitMEP(px, pz) {
  var m = ensureMEP();
  var tolN = 12 / S.SC, tolV = 9 / S.SC, tolR = 8 / S.SC;
  // nodes (visible systems only), nearest first
  var bn = null, bd = tolN;
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys)) return;
    var p = nodePos(n), d = Math.hypot(px - p.x, pz - p.z);
    if (d < bd) { bd = d; bn = n; }
  });
  if (bn) return { kind: "mepNode", ref: bn };
  // run vertices, then run segments
  var br = null, brd = tolR, bvi = -1;
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys)) return;
    for (var i = 0; i < r.pts.length; i++) {
      var d = Math.hypot(px - r.pts[i].x, pz - r.pts[i].z);
      if (d < tolV && d < brd) { brd = d; br = r; bvi = i; }
    }
    for (var j = 1; j < r.pts.length; j++) {
      var ds = distSeg(px, pz, r.pts[j - 1].x, r.pts[j - 1].z, r.pts[j].x, r.pts[j].z);
      if (ds < brd) { brd = ds; br = r; bvi = -1; }
    }
  });
  if (br) return { kind: "mepRun", ref: br, vi: bvi };
  return null;
}

/* ---- 2D rendering -------------------------------------------------------- */
// Drawn from render2D() after walls. `sx/sz` map world→screen; `label` is the
// plan's boxed-text helper. Kept dependency-injected to avoid an import cycle.
var _aliveCount = 0;
// number of visible, energised runs at the last draw — lets the render loop
// know whether the flow animation needs to keep ticking.
export function mepAliveCount() { return _aliveCount; }

var _mepRot = 0; // current plan-view rotation (rad) so glyphs/badges stay upright
export function drawMEP(pc, sx, sz, label, phase, rot) {
  var m = ensureMEP();
  if (!m.show) return;
  _mepRot = rot || 0;
  var state = getMEPState();
  var status = state.status, flow = state.flow;
  var animate = m.animate !== false;
  var alive = 0;
  // runs first, devices on top
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys)) return;
    var f = flow[r.id];
    if (f && f.alive) alive++;
    drawRun(pc, sx, sz, r, status.run[r.id], f, animate ? phase || 0 : null);
  });
  _aliveCount = alive;
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys)) return;
    drawNode(pc, sx, sz, n, status.node[n.id]);
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

// point + unit tangent at half the polyline length (for the direction arrow)
function runMidTangent(r) {
  var total = runLength(r), half = total / 2, acc = 0;
  for (var i = 1; i < r.pts.length; i++) {
    var a = r.pts[i - 1], b = r.pts[i], segx = b.x - a.x, segz = b.z - a.z, seg = Math.hypot(segx, segz) || 1;
    if (acc + seg >= half) {
      var tt = (half - acc) / seg;
      return { x: a.x + segx * tt, z: a.z + segz * tt, tx: segx / seg, tz: segz / seg };
    }
    acc += seg;
  }
  var a0 = r.pts[0], b0 = r.pts[r.pts.length - 1], L = Math.hypot(b0.x - a0.x, b0.z - a0.z) || 1;
  return { x: (a0.x + b0.x) / 2, z: (a0.z + b0.z) / 2, tx: (b0.x - a0.x) / L, tz: (b0.z - a0.z) / L };
}
// filled arrowhead at the run midpoint pointing in the flow direction
function drawFlowArrow(pc, sx, sz, r, dir, col) {
  var mt = runMidTangent(r), ux = mt.tx * dir, uz = mt.tz * dir;
  var ang = Math.atan2(uz, ux), size = 5.5;
  pc.save();
  pc.translate(sx(mt.x), sz(mt.z));
  pc.rotate(ang);
  pc.beginPath();
  pc.moveTo(size, 0);
  pc.lineTo(-size * 0.7, size * 0.7);
  pc.lineTo(-size * 0.7, -size * 0.7);
  pc.closePath();
  pc.fillStyle = "#fff";
  pc.strokeStyle = col;
  pc.lineWidth = 1.2;
  pc.fill();
  pc.stroke();
  pc.restore();
}

function drawRun(pc, sx, sz, r, issue, flowInfo, phase) {
  if (r.pts.length < 2) {
    // a single-point run (just started) — nothing to stroke yet
  }
  var col = runColor(r);
  var d = runKindDef(r.sys, r.k) || {};
  var selected = S.sel && S.sel.kind === "mepRun" && S.sel.ref === r;
  var lw = clamp(r.dia * 1.1, 1.6, 6);
  var dead = flowInfo && !flowInfo.alive; // routed but not traced to a source
  pc.save();
  pc.lineJoin = "round";
  pc.lineCap = "round";
  if (dead) pc.globalAlpha = 0.4; // dim the "not alive" runs
  // selection halo
  if (selected) {
    pc.beginPath();
    traceRun(pc, sx, sz, r);
    pc.strokeStyle = "rgba(63,107,120,.35)";
    pc.lineWidth = lw + 7;
    pc.setLineDash([]);
    pc.stroke();
  }
  // Under-floor services get a broad dotted bed in plan view. The actual line
  // remains in the system colour, but now reads immediately as concealed below
  // the finish rather than as another wall cable.
  if (r.layer === "floor") {
    pc.beginPath();
    traceRun(pc, sx, sz, r);
    pc.strokeStyle = col;
    pc.globalAlpha = dead ? 0.12 : 0.2;
    pc.lineWidth = lw + 7;
    pc.setLineDash([2, 6]);
    pc.stroke();
    pc.globalAlpha = dead ? 0.4 : 1;
  }
  pc.beginPath();
  traceRun(pc, sx, sz, r);
  pc.strokeStyle = col;
  pc.lineWidth = lw;
  pc.setLineDash((d.dash || []).map(function (v) { return v; }));
  pc.stroke();
  pc.setLineDash([]);
  // vertices
  pc.fillStyle = col;
  r.pts.forEach(function (p) {
    pc.beginPath();
    pc.arc(sx(p.x), sz(p.z), selected ? 3.2 : 2.2, 0, 7);
    pc.fill();
  });
  pc.globalAlpha = 1;
  // flow visualisation on live runs: travelling dashes (when animating) + a
  // midpoint arrow showing which way the medium moves
  if (flowInfo && flowInfo.alive) {
    if (phase != null) {
      pc.beginPath();
      traceRun(pc, sx, sz, r);
      pc.strokeStyle = "rgba(255,255,255,0.92)";
      pc.lineWidth = Math.max(1.2, lw * 0.55);
      pc.setLineDash([5, 13]);
      pc.lineDashOffset = flowInfo.dir > 0 ? -phase : phase;
      pc.stroke();
      pc.setLineDash([]);
      pc.lineDashOffset = 0;
    }
    drawFlowArrow(pc, sx, sz, r, flowInfo.dir, col);
  }
  // unsupplied flag (no hub upstream) at the run midpoint
  if (issue === "unsupplied") {
    var mp = runMidpoint(r);
    warnBadge(pc, sx(mp.x), sz(mp.z), "#d97706");
  }
  // routing-plane tag (ceiling/floor) at the first vertex
  var rtag = MEP_LAYER_TAG[r.layer];
  if (rtag) layerBadge(pc, sx(r.pts[0].x), sz(r.pts[0].z), rtag);
  pc.restore();
}
function traceRun(pc, sx, sz, r) {
  r.pts.forEach(function (p, i) {
    if (i) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
}

function drawNode(pc, sx, sz, n, issue) {
  var def = nodeKindDef(n.sys, n.k) || {};
  var col = MEP_SYS[n.sys].color;
  var p = nodePos(n);
  var X = sx(p.x), Y = sz(p.z);
  var selected = S.sel && S.sel.kind === "mepNode" && S.sel.ref === n;
  var R = def.hub ? 9 : 7;
  pc.save();
  if (selected) {
    pc.beginPath();
    pc.arc(X, Y, R + 5, 0, 7);
    pc.fillStyle = "rgba(63,107,120,.30)";
    pc.fill();
  }
  pc.fillStyle = col;
  pc.strokeStyle = "#fff";
  pc.lineWidth = 1.6;
  if (def.hub) {
    roundRect(pc, X - R, Y - R, R * 2, R * 2, 3);
    pc.fill();
    pc.stroke();
  } else {
    pc.beginPath();
    pc.arc(X, Y, R, 0, 7);
    pc.fill();
    pc.stroke();
  }
  // glyph (kept upright when the plan view is rotated)
  pc.save();
  if (_mepRot) { pc.translate(X, Y); pc.rotate(-_mepRot); pc.translate(-X, -Y); }
  pc.fillStyle = "#fff";
  pc.font = "700 " + (def.hub ? 11 : 9) + "px system-ui, sans-serif";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  pc.fillText(def.code || "?", X, Y + 0.5);
  pc.restore();
  // connection flag: orphan (touches no run) = red; unsupplied (no hub upstream) = amber
  if (issue) {
    warnBadge(pc, X + R * 0.9, Y - R * 0.9, issue === "orphan" ? "#dc2626" : "#d97706");
  }
  // routing-plane tag (ceiling/floor) at the opposite corner
  var ntag = MEP_LAYER_TAG[n.layer];
  if (ntag) layerBadge(pc, X - R * 0.9, Y - R * 0.9, ntag);
  pc.restore();
}

function drawRoutePreview(pc, sx, sz, label, route) {
  var sys = MEP_SYS[route.sys];
  pc.save();
  pc.lineJoin = "round";
  pc.lineCap = "round";
  // committed segments
  pc.beginPath();
  route.pts.forEach(function (p, i) {
    if (i) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
  pc.strokeStyle = sys.color;
  pc.lineWidth = 2.4;
  pc.stroke();
  // vertices
  pc.fillStyle = sys.color;
  route.pts.forEach(function (p) {
    pc.beginPath();
    pc.arc(sx(p.x), sz(p.z), 3, 0, 7);
    pc.fill();
  });
  // rubber-band segment to the resolved cursor, with the CAD readout. In
  // wall-follow mode the band traces the routed path, not the straight line.
  if (route.preview) {
    var last = route.pts[route.pts.length - 1];
    var band = route.previewPath && route.previewPath.length
      ? [last].concat(route.previewPath)
      : [last, { x: route.preview.x, z: route.preview.z }];
    pc.beginPath();
    band.forEach(function (p, i) {
      if (i) pc.lineTo(sx(p.x), sz(p.z));
      else pc.moveTo(sx(p.x), sz(p.z));
    });
    pc.setLineDash([6, 5]);
    pc.strokeStyle = route.previewBlocked ? "#dc2626" : sys.color;
    pc.lineWidth = 2;
    pc.stroke();
    pc.setLineDash([]);
    if (label) {
      var deg = Math.round((route.preview.ang * 180) / Math.PI);
      if (deg < 0) deg += 360;
      var txt = route.previewBlocked
        ? (getLang() === "he" ? "המסלול חסום בדלת" : "Route blocked by a door")
        : Math.round(route.preview.len) + "cm · " + deg + "°";
      if (route.preview.dAng != null) txt += " · Δ" + route.preview.dAng + "°";
      label(
        (last.x + route.preview.x) / 2,
        (last.z + route.preview.z) / 2,
        txt,
        sys.color,
      );
    }
  }
  pc.restore();
}

function roundRect(pc, x, y, w, h, r) {
  pc.beginPath();
  pc.moveTo(x + r, y);
  pc.arcTo(x + w, y, x + w, y + h, r);
  pc.arcTo(x + w, y + h, x, y + h, r);
  pc.arcTo(x, y + h, x, y, r);
  pc.arcTo(x, y, x + w, y, r);
  pc.closePath();
}

/* ---- 3D building --------------------------------------------------------- */
// Called from rebuild3D(). Adds thin colored tubes for runs (at each system's
// conduit height) and small markers for devices to the dynamic group.
export function buildMEP3D(group, THREE) {
  var m = ensureMEP();
  if (!m.show || !m.show3D) return;
  var matCache = {};
  function matFor(hex) {
    if (!matCache[hex]) {
      matCache[hex] = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.5,
        metalness: 0.2,
        emissive: new THREE.Color(hex).multiplyScalar(0.12),
      });
    }
    return matCache[hex];
  }
  var exposedDuctMat = new THREE.MeshStandardMaterial({
    color: 0xa8b3ba,
    roughness: 0.34,
    metalness: 0.72,
  });
  var hangerMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.65, metalness: 0.55 });
  var jointSeen = {};
  // runs → cylinders between consecutive points at the layer's conduit height
  // (rectangular sections for ductwork, which is what `rect` kinds are for)
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys)) return;
    var ys = runPointY(r);
    var hex = new THREE.Color(runColor(r)).getHex();
    var rad = Math.max(0.8, r.dia / 2);
    var kd = runKindDef(r.sys, r.k);
    for (var i = 1; i < r.pts.length; i++) {
      var A = r.pts[i - 1], B = r.pts[i];
      var seg = kd && kd.rect
        ? segBox(THREE, r.exposed ? exposedDuctMat : matFor(hex), A.x, ys[i - 1], A.z, B.x, ys[i], B.z, r.dia, kd.hRatio || 0.6)
        : segCylinder(THREE, matFor(hex), A.x, ys[i - 1], A.z, B.x, ys[i], B.z, rad);
      if (seg) group.add(seg);
      if (seg && r.exposed && kd && kd.rect) {
        // Visible sheet-metal collars make every bend/join legible, and a slim
        // hanger connects each exposed segment back to the ceiling slab.
        [i - 1, i].forEach(function (vi) {
          var P = r.pts[vi], key = Math.round(P.x) + "_" + Math.round(P.z) + "_" + Math.round(ys[vi]);
          if (jointSeen[key]) return;
          jointSeen[key] = 1;
          var collar = new THREE.Mesh(
            new THREE.BoxGeometry(r.dia + 2, Math.max(6, r.dia * (kd.hRatio || 0.6) + 2), 4),
            matFor(hex),
          );
          collar.position.set(P.x, ys[vi], P.z);
          collar.rotation.y = Math.atan2(B.x - A.x, B.z - A.z);
          group.add(collar);
        });
        var mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
        var top = ys[i - 1] + Math.max(4, r.dia * (kd.hRatio || 0.6) / 2);
        var slab = ceilingY() - 2;
        var hanger = segCylinder(THREE, hangerMat, mx, top, mz, mx, slab, mz, 0.65);
        if (hanger) group.add(hanger);
      }
    }
  });
  // devices → small boxes (hubs bigger) at their layer height
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys)) return;
    var def = nodeKindDef(n.sys, n.k) || {};
    var p = nodePos(n);
    var hex = new THREE.Color(MEP_SYS[n.sys].color).getHex();
    var s = def.hub ? 12 : 7;
    var box = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, Math.max(3, s * 0.4)),
      matFor(hex),
    );
    box.position.set(p.x, layerNodeY(n), p.z);
    group.add(box);
  });
  // vertical risers: connect same-system entities that meet in plan (x,z) but
  // sit on different planes — e.g. a ceiling run dropping to a wall switch, or
  // an under-floor pipe rising into a wall.
  var anchors = [];
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys)) return;
    var p = nodePos(n);
    anchors.push({ x: p.x, z: p.z, y: layerNodeY(n), sys: n.sys });
  });
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys)) return;
    var ys = runPointY(r);
    // Every routed vertex is an anchor, not only the two polyline endpoints.
    // Chained socket circuits visit most outlets at interior vertices; limiting
    // risers to the ends made those outlets look physically disconnected in 3D.
    r.pts.forEach(function (p, i) {
      anchors.push({ x: r.pts[i].x, z: r.pts[i].z, y: ys[i], sys: r.sys });
    });
  });
  var riserSeen = {};
  for (var a = 0; a < anchors.length; a++)
    for (var b = a + 1; b < anchors.length; b++) {
      var A2 = anchors[a], B2 = anchors[b];
      if (A2.sys !== B2.sys) continue;
      if (Math.hypot(A2.x - B2.x, A2.z - B2.z) > 12) continue;
      if (Math.abs(A2.y - B2.y) < 3) continue;
      var x = (A2.x + B2.x) / 2, z = (A2.z + B2.z) / 2;
      var key = Math.round(x) + "_" + Math.round(z) + "_" +
        Math.round(Math.min(A2.y, B2.y)) + "_" + Math.round(Math.max(A2.y, B2.y));
      if (riserSeen[key]) continue;
      riserSeen[key] = 1;
      var hex2 = new THREE.Color(MEP_SYS[A2.sys].color).getHex();
      var rr = segCylinder(THREE, matFor(hex2), x, A2.y, z, x, B2.y, z, 1.4);
      if (rr) group.add(rr);
    }
}
// a rectangular duct section spanning two 3D points. Width is the run's `dia`
// and height a fraction of it, so a 25cm duct reads as the flat sheet-metal
// box it is; the section stays upright (no roll) because ducts are hung level.
function segBox(THREE, mat, x1, y1, z1, x2, y2, z2, wid, hRatio) {
  var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  var len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return null;
  var h = Math.max(4, wid * hRatio);
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(wid, h, len), mat);
  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  // yaw the +Z face along the run; pitch only matters for the rare sloped drop
  mesh.rotation.y = Math.atan2(dx, dz);
  if (Math.abs(dy) > 0.5) mesh.rotation.x = -Math.asin(dy / len);
  return mesh;
}

// a cylinder spanning two 3D points (used for run segments)
function segCylinder(THREE, mat, x1, y1, z1, x2, y2, z2, rad) {
  var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  var len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return null;
  var geom = new THREE.CylinderGeometry(rad, rad, len, 8);
  var mesh = new THREE.Mesh(geom, mat);
  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  // align the cylinder's +Y axis with the segment direction
  var up = new THREE.Vector3(0, 1, 0);
  var dir = new THREE.Vector3(dx, dy, dz).normalize();
  mesh.quaternion.setFromUnitVectors(up, dir);
  return mesh;
}
