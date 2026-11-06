// MEP (Mechanical/Electrical/Plumbing) infrastructure layer.
// Color-coded networks — electrical, water, gas, drainage, comms and air
// conditioning — drawn as an overlay on the 2D plan and, optionally, as thin
// conduits + device markers embedded in the walls in the 3D view.
//
// Model (lives on S.mep):
//   nodes: [{ id, sys, k, x, z, wall|null, s|null, elev, label }]
//   runs:  [{ id, sys, k, pts:[{x,z}], dia, color|null, a|null, b|null }]
// A node attached to a wall keeps the wall id + parametric distance `s` so it
// rides the wall when the wall moves; free nodes keep raw x/z. Runs are simple
// polylines; endpoints may reference node ids (a/b) for future connectivity.
import { S, uid, clamp, fin } from "./state.js";
import { wallGeom, distSeg, detectRooms, pointInPoly, roomName } from "./geometry.js";
import { makeRouter } from "./mep_route.js";
import { layerRank } from "./layers.js";
import { getLang, t } from "./i18n.js";
import { roomTypeOf } from "./room_types.js";
import { roomPreset } from "./room_presets.js";
import { GENERIC_RESIDENTIAL_PROFILE, mepProfileRef } from "./mep_profile.js";
import { validateMEPModel } from "./mep_validate.js";
import {
  buildMEP3D, deviceSurfacePosition, drawNode, drawRoutePreview, drawRun,
} from "./mep/drawing.js";
import {
  computeMEPClashes, drawMEP, getMEPState, hitMEP, mepAliveCount, mepBOM,
  routeResolve, snapMEPPoint, wallPath,
} from "./mep/clashes.js";
import {
  applyRoutingPolicies, autoConnectAll, computeMEPFlow, computeMEPStatus,
  connectMissingMEP, effectiveRunLayers, gasThroughBedroom, generationLayer,
  gravityUphill, policyLayerFor, roomIsBedroom, routingPolicy,
  runTouchesPoint, runsTouch, setRoutingPolicy, wallRouteBlocked,
} from "./mep/routing.js";
import {
  addNode, addRun, cancelMEP, cancelRoute, deleteMEP, detachNodesFromWalls,
  emitMEP, finishRoute, isNodeConnected, linkRunEndpoints, migrateMEPTopology,
  nodeById, nodePos, onMEPChange, runCrossesOpening, runLength, setMEPLayer,
  setNodeKind, setRunKind, unconnectedNodes,
} from "./mep/topology.js";
export { addNode, addRun, cancelMEP, cancelRoute, deleteMEP, detachNodesFromWalls, finishRoute, isNodeConnected, linkRunEndpoints, migrateMEPTopology, nodeById, nodePos, onMEPChange, runCrossesOpening, runLength, setMEPLayer, setNodeKind, setRunKind, unconnectedNodes };
export { applyRoutingPolicies, autoConnectAll, computeMEPFlow, computeMEPStatus, connectMissingMEP, effectiveRunLayers, gasThroughBedroom, generationLayer, gravityUphill, policyLayerFor, roomIsBedroom, routingPolicy, setRoutingPolicy };
export { computeMEPClashes, drawMEP, getMEPState, hitMEP, mepAliveCount, mepBOM, routeResolve, snapMEPPoint, wallPath };
export { buildMEP3D, deviceSurfacePosition };
// for js/mep/drawing.js (live bindings: it sees every reassignment)
export { _mepRot, ceilingY };
// for js/mep/clashes.js (live bindings: it sees every reassignment)
export {
  _aliveCount, _sig, _state, set__aliveCount, set__mepRot, set__sig,
  set__state,
};
// for js/mep/routing.js (live bindings: it sees every reassignment)
export { GRAVITY_CAP, GRAVITY_FALL, MEP_TOUCH };
// for js/mep/topology.js (live bindings: it sees every reassignment)
export { mepListeners, mepNotifyQueued, set_mepNotifyQueued };

/* ---- bilingual labels (kept here so all MEP naming lives in one place) --- */
const MEP_L = {
  sys: {
    power: { en: "Electrical", he: "חשמל" },
    water: { en: "Water", he: "מים" },
    drain: { en: "Drainage", he: "ניקוז" },
    comms: { en: "Comms", he: "תקשורת" },
    hvac: { en: "Air conditioning", he: "מיזוג אוויר" },
    gas: { en: "Gas", he: "גז" },
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
    "gas.meter": { en: "Gas meter", he: "מונה גז" },
    "gas.valve": { en: "Shutoff valve", he: "ברז ניתוק" },
    "gas.point": { en: "Appliance point", he: "נקודת גז" },
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
    "hvac.return": { en: "Return duct", he: "תעלת אוויר חוזר" },
    "gas.pipe": { en: "Gas pipe", he: "צינור גז" },
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
  // Yellow, and kept off the ceiling: a dwelling gas pipe runs in the wall or
  // the screed, not through the void above a bedroom.
  gas: { key: "gas", color: "#eab308", c3d: 0xeab308, runY: 20 },
};
export const MEP_SYS_ORDER = ["power", "water", "drain", "comms", "hvac", "gas"];

// Routing plane: infrastructure runs in walls, along the ceiling, or under the
// floor slab. The layer drives 3D height (see layerRunY/layerNodeY) and whether
// a device attaches to a wall (only 'wall' devices do). 'W'/'C'/'F' is the 2D tag.
export const MEP_LAYERS = ["wall", "ceiling", "floor"];
export const MEP_LAYER_TAG = { wall: "", ceiling: "C", floor: "F" };
var FLOOR_RUN_Y = -10; // under the slab
var FLOOR_NODE_Y = 2;
function ceilingY() {
  var h = 0;
  (S.walls || []).forEach(function (w) { if (w && w.height > h) h = w.height; });
  return h || 270;
}
// 3D height of a run's conduit for its layer
export function layerRunY(sys, layer) {
  if (layer === "ceiling") return ceilingY() - 6;
  if (layer === "floor") return FLOOR_RUN_Y;
  var def = MEP_SYS[sys];
  return def ? def.runY : 30;
}
// 3D height of every vertex of a run. Level for pressurised systems; a gravity
// run (waste, condensate) starts `fall` cm high and drops to the layer height
// at its downstream end, interpolated by distance along the polyline.
export function runPointY(r) {
  if (!r || !Array.isArray(r.pts) || !r.pts.length) return [];
  var base = layerRunY(r.sys, r.layer), fall = runFall(r);
  var kd = runKindDef(r.sys, r.k);
  // Exposed ducts hang BELOW the ceiling finish. Previously their centre was
  // only 6cm below it, so most of a 15–25cm duct disappeared into the slab.
  if (r.layer === "ceiling" && r.exposed && kd)
    base = ceilingY() - (kd.rect
      ? Math.max(14, r.dia * (kd.hRatio || 0.6) / 2 + 10)
      : Math.max(10, r.dia / 2 + 6));
  if (fin(r.elev)) base = r.elev;
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
  gas: [
    { k: "meter", code: "G", hub: true, elev: 40, price: 900, layers: ["wall"] },
    { k: "valve", code: "V", elev: 50, price: 80, layers: ["wall"] },
    { k: "point", code: "A", elev: 50, price: 40, layers: ["wall"] },
  ],
};

// Run (pipe/cable/duct) kinds — `dia` in cm drives both plan stroke width and
// 3D tube radius; an optional per-kind `color` overrides the system color
// (e.g. hot water red vs. cold blue). `dash` sets the plan line dash.
// `pricePerM` = cost (ILS) per metre of run for the bill-of-materials.
export const MEP_RUN_KINDS = {
  power: [{ k: "circuit", dia: 2, dash: [], pricePerM: 12, layers: ["wall", "ceiling", "floor"], defaultLayer: "wall", flow: "supply" }],
  water: [
    { k: "cold", dia: 2, color: "#2563eb", dash: [], pricePerM: 22, layers: ["floor", "wall"], defaultLayer: "floor", flow: "supply" },
    { k: "hot", dia: 2, color: "#dc2626", dash: [], pricePerM: 26, layers: ["floor", "wall"], defaultLayer: "floor", flow: "supply" },
  ],
  drain: [
    { k: "waste", dia: 6, dash: [], pricePerM: 35, layers: ["floor"], defaultLayer: "floor", flow: "gravity" },
    { k: "vent", dia: 4, color: "#65a30d", dash: [7, 5], pricePerM: 28, layers: ["wall", "ceiling"], defaultLayer: "ceiling", flow: "vent" },
  ],
  comms: [
    { k: "cat6", dia: 1.5, dash: [3, 4], pricePerM: 8, layers: ["wall", "ceiling", "floor"], defaultLayer: "wall", flow: "signal" },
    { k: "coax", dia: 2, color: "#9333ea", dash: [3, 4], pricePerM: 10, layers: ["wall", "ceiling", "floor"], defaultLayer: "wall", flow: "supply" },
  ],
  // `rect` extrudes a rectangular section in 3D instead of a round tube — a
  // 25cm sheet-metal duct drawn as a fat pipe reads as plumbing, not ductwork.
  // `dia` is the duct's height/width, so it still drives the plan stroke.
  hvac: [
    { k: "duct", dia: 25, rect: true, exposed: true, dash: [], pricePerM: 190, layers: ["ceiling"], defaultLayer: "ceiling", flow: "supply" },
    { k: "branch", dia: 18, rect: true, exposed: true, dash: [], pricePerM: 140, layers: ["ceiling"], defaultLayer: "ceiling", flow: "supply" },
    { k: "return", dia: 18, rect: true, exposed: true, dash: [], pricePerM: 140, layers: ["ceiling"], defaultLayer: "ceiling", flow: "return" },
    { k: "flex", dia: 15, exposed: true, color: "#0e7490", dash: [6, 4], pricePerM: 75, layers: ["ceiling"], defaultLayer: "ceiling", flow: "supply" },
    { k: "refrig", dia: 4, exposed: true, color: "#b45309", dash: [], pricePerM: 120, layers: ["ceiling", "wall", "floor"], defaultLayer: "ceiling", flow: "supply" },
    { k: "condensate", dia: 3, exposed: true, color: "#65a30d", dash: [5, 4], pricePerM: 45, layers: ["ceiling", "wall", "floor"], defaultLayer: "floor", flow: "gravity" },
    { k: "control", dia: 1.5, color: "#475569", dash: [3, 4], pricePerM: 14, layers: ["ceiling", "wall"], defaultLayer: "ceiling", flow: "signal" },
  ],
  // No ceiling plane and no fall. Gas is pressurized from the meter, and it
  // does not belong in the void above a room.
  gas: [{ k: "pipe", dia: 2, color: "#eab308", dash: [], pricePerM: 35, layers: ["floor", "wall"], defaultLayer: "floor", flow: "supply" }],
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
// supply: pressurized, away from the source (power, water, supply air, coax).
// gravity: liquid falls toward a drain (waste, condensate).
// vent: air leaves the stack toward open air, not back down the waste.
// return: air comes back to the fan coil.
// signal: a link, not a fluid (Cat6, control cable).
export function runFlowKind(sys, k) {
  var d = runKindDef(sys, k);
  return d && d.flow ? d.flow : "supply";
}
// Color a run is drawn/extruded in: kind override first, then the system color.
export function runColor(run) {
  var d = runKindDef(run.sys, run.k);
  var sys = MEP_SYS[run.sys];
  return run.color || (d && d.color) || (sys && sys.color) || "#64748b";
}

/* ---- state bootstrap ----------------------------------------------------- */
function mepVisDefault() {
  return { power: true, water: true, drain: true, comms: true, hvac: true, gas: true };
}
// Older saved scenes have no `mep` block — create a valid empty one on demand.
export function ensureMEP() {
  if (!S.mep) {
    S.mep = {
      nodes: [],
      runs: [],
      circuits: [],
      branches: [],
      profile: mepProfileRef(GENERIC_RESIDENTIAL_PROFILE),
      show: true,
      show3D: true,
      xray: { walls: false, floor: false, ceiling: false }, // 3D see-through surfaces to reveal embedded conduits
      snapAngle: true,
      wallRoute: true, // expand each drawn segment into a wall-following path
      animate: true, // animate directional flow on live runs
      layer: "wall", // active routing plane: wall | ceiling | floor
      vis: mepVisDefault(),
      layerVis: { wall: true, ceiling: true, floor: true },
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
  if (!S.mep.vis) S.mep.vis = mepVisDefault();
  else S.mep.vis = Object.assign(mepVisDefault(), S.mep.vis);
  if (!S.mep.layerVis) S.mep.layerVis = { wall: true, ceiling: true, floor: true };
  else S.mep.layerVis = Object.assign({ wall: true, ceiling: true, floor: true }, S.mep.layerVis);
  if (!S.mep.active) S.mep.active = "power";
  if (!S.mep.routePolicy || typeof S.mep.routePolicy !== "object") S.mep.routePolicy = {};
  if (S.mep.place === undefined) S.mep.place = null;
  if (S.mep.route === undefined) S.mep.route = null;
  if (!Array.isArray(S.mep.circuits)) S.mep.circuits = [];
  if (!Array.isArray(S.mep.branches)) S.mep.branches = [];
  if (!S.mep.profile) S.mep.profile = mepProfileRef(GENERIC_RESIDENTIAL_PROFILE);
  return S.mep;
}

export function mepVisible(sys) {
  var m = ensureMEP();
  return m.show && m.vis[sys] !== false;
}
export function mepLayerVisible(layer) {
  var m = ensureMEP();
  return m.show && m.layerVis[layer || "wall"] !== false;
}

// What the auto-generate button should do. No rooms: say so and do not touch
// history. An existing network: ask first. Confirm is not called otherwise.
export function decideAutoGenerate(roomCount, existingCount, confirmReplace) {
  if (!roomCount) return "need-room";
  if (existingCount > 0 && !confirmReplace()) return "cancelled";
  return "run";
}

// Restore MEP state from a saved/imported scene, validating each entity.
function uniqueId(seen, id) {
  if (id == null || seen[id]) return uid();
  seen[id] = 1;
  return id;
}
export function loadMEP(d) {
  ensureMEP();
  var m = S.mep;
  var seenN = Object.create(null), seenR = Object.create(null);
  m.nodes = ((d && d.nodes) || [])
    .filter(function (n) { return n && MEP_SYS[n.sys] && nodeKindDef(n.sys, n.k); })
    .map(function (n) {
      var def = nodeKindDef(n.sys, n.k);
      var layer = MEP_LAYERS.indexOf(n.layer) >= 0 ? n.layer : defaultLayerFor(n.sys, n.k, "node");
      if (!layerAllowed(n.sys, n.k, "node", layer)) layer = defaultLayerFor(n.sys, n.k, "node");
      // A wall id without a finite station (including a missing one) used to
      // resolve as s = 0 and teleport the device to the wall start.
      var onWall = layer === "wall" && n.wall != null && fin(n.s);
      return {
        id: uniqueId(seenN, n.id),
        sys: n.sys,
        k: n.k,
        layer: layer,
        x: fin(n.x) ? n.x : 0,
        z: fin(n.z) ? n.z : 0,
        wall: onWall ? n.wall : null,
        s: onWall ? n.s : null,
        elev: fin(n.elev) ? n.elev : def.elev != null ? def.elev : 100,
        label: typeof n.label === "string" ? n.label.slice(0, 80) : "",
        sourceId: n.sourceId ?? null,
        circuitId: n.circuitId ?? null,
        branchId: n.branchId ?? null,
        branchIds: Array.isArray(n.branchIds) ? n.branchIds.filter(function(id) { return id != null; }) : n.branchId != null ? [n.branchId] : [],
        itemId: n.itemId ?? null,
        switchId: n.switchId ?? null,
        roomKey: n.roomKey ?? null,
        generated: !!n.generated,
      };
    });
  m.runs = ((d && d.runs) || [])
    .filter(function (r) { return r && MEP_SYS[r.sys] && runKindDef(r.sys, r.k) && Array.isArray(r.pts); })
    .map(function (r) {
      var kind = runKindDef(r.sys, r.k);
      var layer = MEP_LAYERS.indexOf(r.layer) >= 0 ? r.layer : defaultLayerFor(r.sys, r.k, "run");
      if (!layerAllowed(r.sys, r.k, "run", layer)) layer = defaultLayerFor(r.sys, r.k, "run");
      return {
        id: uniqueId(seenR, r.id),
        sys: r.sys,
        k: r.k,
        layer: layer,
        pts: r.pts.filter(function (p) { return p && fin(p.x) && fin(p.z); })
          .map(function (p) { return { x: p.x, z: p.z }; }),
        dia: fin(r.dia) && r.dia > 0 ? r.dia : (kind.dia || 2),
        elev: fin(r.elev) ? r.elev : null,
        color: r.color || null,
        fall: fin(r.fall) && r.fall > 0 ? r.fall : 0, // gravity fall along the run (cm)
        exposed: r.exposed != null ? !!r.exposed : !!kind.exposed,
        a: r.a ?? null,
        b: r.b ?? null,
        circuitId: r.circuitId ?? null,
        explicit: !!r.explicit,
        branchId: r.branchId ?? null,
        generated: !!r.generated,
      };
    })
    .filter(function (r) { return r.pts.length >= 2; });
  m.circuits = d && Array.isArray(d.circuits) ? d.circuits : [];
  m.branches = d && Array.isArray(d.branches) ? d.branches : [];
  m.profile = d && d.profile && typeof d.profile.id === "string" ? d.profile : mepProfileRef(GENERIC_RESIDENTIAL_PROFILE);
  if (d) {
    if (d.show != null) m.show = !!d.show;
    if (d.show3D != null) m.show3D = !!d.show3D;
    if (d.snapAngle != null) m.snapAngle = !!d.snapAngle;
    if (d.vis) m.vis = Object.assign(mepVisDefault(), d.vis);
    if (d.layerVis) m.layerVis = Object.assign({ wall: true, ceiling: true, floor: true }, d.layerVis);
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
  migrateMEPTopology(m);
  emitMEP();
}

/* ---- CRUD ---------------------------------------------------------------- */
// Panel/tree listeners. Mutations that happen in a burst (auto rough-in)
// collapse to one notification on the next microtask, so a 40-device generate
// does not rebuild the infrastructure panel 40 times.
var mepListeners = [];
var mepNotifyQueued = false;
function set_mepNotifyQueued(value) { return mepNotifyQueued = value; }

/* ---- connectivity: auto-connect run endpoints to devices + flag orphans --- */
// One touch radius for the orphan badge and the supply graph. They used to
// disagree (10cm vs 12cm), so a device the graph had already joined could
// still be drawn as an orphan.
var MEP_TOUCH = 12;

// Repair imported/manual networks without replacing the existing layout. Each
// orphan or unsupplied device gets a trade-appropriate route to the nearest
// source. Wall routes stay strict around doors and fall back to a ceiling
// bridge with vertical drops when the wall graph is blocked.
var GRAVITY_FALL = { waste: 0.02, condensate: 0.01 };
var GRAVITY_CAP = { waste: 14, condensate: 20 };

/* ---- auto rough-in --------------------------------------------------------
   The placement + routing rules moved to mep_auto.js, which routes every run on
   the wall graph (mep_route.js) instead of drawing straight lines between
   devices. Import autoInfrastructure from there. */

var _sig = null, _state = null;
function set__sig(value) { return _sig = value; }
function set__state(value) { return _state = value; }

/* ---- 2D rendering -------------------------------------------------------- */
// Drawn from render2D() after walls. `sx/sz` map world→screen; `label` is the
// plan's boxed-text helper. Kept dependency-injected to avoid an import cycle.
var _aliveCount = 0;
function set__aliveCount(value) { return _aliveCount = value; }

var _mepRot = 0; // current plan-view rotation (rad) so glyphs/badges stay upright
function set__mepRot(value) { return _mepRot = value; }

