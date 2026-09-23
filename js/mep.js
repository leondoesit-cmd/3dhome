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

/* ---- CRUD ---------------------------------------------------------------- */
// Panel/tree listeners. Mutations that happen in a burst (auto rough-in)
// collapse to one notification on the next microtask, so a 40-device generate
// does not rebuild the infrastructure panel 40 times.
var mepListeners = [];
var mepNotifyQueued = false;
export function onMEPChange(fn) {
  mepListeners.push(fn);
  return function () {
    var i = mepListeners.indexOf(fn);
    if (i >= 0) mepListeners.splice(i, 1);
  };
}
function emitMEP() {
  if (!mepListeners.length || mepNotifyQueued) return;
  mepNotifyQueued = true;
  queueMicrotask(function () {
    mepNotifyQueued = false;
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

/* ---- connectivity: auto-connect run endpoints to devices + flag orphans --- */
// One touch radius for the orphan badge and the supply graph. They used to
// disagree (10cm vs 12cm), so a device the graph had already joined could
// still be drawn as an orphan.
var MEP_TOUCH = 12;
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

// Repair imported/manual networks without replacing the existing layout. Each
// orphan or unsupplied device gets a trade-appropriate route to the nearest
// source. Wall routes stay strict around doors and fall back to a ceiling
// bridge with vertical drops when the wall graph is blocked.
var GRAVITY_FALL = { waste: 0.02, condensate: 0.01 };
var GRAVITY_CAP = { waste: 14, condensate: 20 };
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

/* ---- auto rough-in --------------------------------------------------------
   The placement + routing rules moved to mep_auto.js, which routes every run on
   the wall graph (mep_route.js) instead of drawing straight lines between
   devices. Import autoInfrastructure from there. */

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
var _sig = null, _state = null;
// cached { status, flow, clashes } — recomputed only when the network signature changes
export function getMEPState() {
  var m = ensureMEP();
  var sig = mepSignature(m);
  if (sig !== _sig) {
    _sig = sig;
    _state = { status: computeMEPStatus(), flow: computeMEPFlow(), clashes: computeMEPClashes() };
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
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer)) return;
    var f = flow[r.id];
    if (f && f.alive && f.flow !== "signal" && f.flow !== "vent") alive++;
    drawRun(pc, sx, sz, r, status.run[r.id], f, animate ? phase || 0 : null);
  });
  _aliveCount = alive;
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
function runTangentAt(r, t) {
  var total = runLength(r), want = total * t, acc = 0;
  if (!(total > 0)) return runMidTangent(r);
  for (var i = 1; i < r.pts.length; i++) {
    var a = r.pts[i - 1], b = r.pts[i], segx = b.x - a.x, segz = b.z - a.z, seg = Math.hypot(segx, segz) || 1;
    if (acc + seg >= want || i === r.pts.length - 1) {
      var tt = Math.max(0, Math.min(1, (want - acc) / seg));
      return { x: a.x + segx * tt, z: a.z + segz * tt, tx: segx / seg, tz: segz / seg };
    }
    acc += seg;
  }
  return runMidTangent(r);
}
// filled arrowhead. `at` is 0..1 along the run; the default is the midpoint.
function drawFlowArrow(pc, sx, sz, r, dir, col, at) {
  var mt = at == null ? runMidTangent(r) : runTangentAt(r, at);
  var ux = mt.tx * dir, uz = mt.tz * dir;
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
  var lw = clamp(r.dia * 1.1, r.layer === "floor" ? 3.2 : 1.6, 6);
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
  // A bright dashed casing keeps the route legible over both dark tile and
  // light timber while the solid core retains its system colour. The former
  // low-opacity coloured dots disappeared against busy floor textures.
  if (r.layer === "floor") {
    pc.beginPath();
    traceRun(pc, sx, sz, r);
    pc.strokeStyle = "#ffffff";
    pc.globalAlpha = dead ? 0.45 : 0.9;
    pc.lineWidth = lw + 5;
    pc.setLineDash([7, 5]);
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
  // Live runs show how the service actually moves. Supply, gravity and return
  // get one arrow and, while motion is allowed, travelling dashes. A vent is
  // air leaving the stack, so it gets the arrow only. Data is a link: two
  // opposing marks, not a stream.
  if (flowInfo && flowInfo.alive) {
    var mode = flowInfo.flow || "supply";
    if (phase != null && mode !== "signal" && mode !== "vent") {
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
    if (mode === "signal") {
      drawFlowArrow(pc, sx, sz, r, 1, col, 0.35);
      drawFlowArrow(pc, sx, sz, r, -1, col, 0.65);
    } else drawFlowArrow(pc, sx, sz, r, flowInfo.dir, col);
  }
  // unsupplied flag (no hub upstream) at the run midpoint
  if (issue === "unsupplied") {
    var mp = runMidpoint(r);
    warnBadge(pc, sx(mp.x), sz(mp.z), "#d97706");
  }
  if (flowInfo && flowInfo.uphill) {
    var slope = runMidTangent(r);
    warnBadge(pc, sx(slope.x - slope.tz * 16), sz(slope.z + slope.tx * 16), "#b45309");
  }
  if (flowInfo && flowInfo.bedroom) {
    var bedPt = runMidpoint(r);
    smallBadge(pc, sx(bedPt.x), sz(bedPt.z), "#a16207", "!");
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
  var sys = MEP_SYS[n.sys];
  if (!sys) return;
  var def = nodeKindDef(n.sys, n.k) || {};
  var col = sys.color;
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
  pc.fillStyle = "#fff";
  pc.strokeStyle = col;
  pc.lineWidth = 2.2;
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
  // Conventional high-contrast plan symbols. Text remains the fallback for
  // specialist equipment, while the everyday electrical/plumbing devices no
  // longer depend on knowing an internal one-letter code.
  pc.save();
  if (_mepRot) { pc.translate(X, Y); pc.rotate(-_mepRot); pc.translate(-X, -Y); }
  pc.strokeStyle = col; pc.fillStyle = col; pc.lineWidth = 1.8;
  if (n.sys === "power" && n.k === "outlet") {
    pc.beginPath(); pc.arc(X - 2.2, Y, 1.5, 0, 7); pc.moveTo(X + 3.7, Y); pc.arc(X + 2.2, Y, 1.5, 0, 7); pc.stroke();
  } else if (n.sys === "power" && n.k === "switch") {
    pc.beginPath(); pc.arc(X - 2.5, Y + 2, 1.2, 0, 7); pc.moveTo(X - 1.5, Y + 1); pc.lineTo(X + 3.5, Y - 3.5); pc.stroke();
  } else if (n.sys === "power" && n.k === "light") {
    pc.beginPath(); pc.moveTo(X - 4, Y - 4); pc.lineTo(X + 4, Y + 4); pc.moveTo(X + 4, Y - 4); pc.lineTo(X - 4, Y + 4); pc.stroke();
  } else if (n.sys === "drain" && n.k === "floor") {
    pc.strokeRect(X - 3.5, Y - 3.5, 7, 7); pc.beginPath(); pc.moveTo(X - 3, Y); pc.lineTo(X + 3, Y); pc.moveTo(X, Y - 3); pc.lineTo(X, Y + 3); pc.stroke();
  } else {
    pc.font = "700 " + (def.hub ? 10 : 8) + "px system-ui, sans-serif";
    pc.textAlign = "center"; pc.textBaseline = "middle";
    pc.fillText(def.code || "?", X, Y + 0.5);
  }
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
  if (!sys) return;
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
        ? t("mep_routeBlocked")
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
  function matFor(hex, underFloor) {
    var key = hex + (underFloor ? ":under-floor" : "");
    if (!matCache[key]) {
      matCache[key] = underFloor && m.xray.floor
        ? new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: 0.96,
          depthTest: false, depthWrite: false,
        })
        : new THREE.MeshStandardMaterial({
          color: hex, roughness: 0.5, metalness: 0.2,
          emissive: new THREE.Color(hex).multiplyScalar(0.12),
        });
    }
    return matCache[key];
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
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer)) return;
    var ys = runPointY(r);
    var hex = new THREE.Color(runColor(r)).getHex();
    // A 20 mm supply line is sub-pixel at an apartment-wide camera distance.
    // Give concealed lines a minimum *display* radius in 3D; model diameter
    // and exported design properties remain unchanged.
    var rad = Math.max(r.layer === "floor" ? 2.4 : 0.8, r.dia / 2);
    var kd = runKindDef(r.sys, r.k);
    for (var i = 1; i < r.pts.length; i++) {
      var A = r.pts[i - 1], B = r.pts[i];
      var seg = kd && kd.rect
        ? segBox(THREE, r.exposed ? exposedDuctMat : matFor(hex, r.layer === "floor"), A.x, ys[i - 1], A.z, B.x, ys[i], B.z, r.dia, kd.hRatio || 0.6)
        : segCylinder(THREE, matFor(hex, r.layer === "floor"), A.x, ys[i - 1], A.z, B.x, ys[i], B.z, rad);
      if (seg) {
        // Transparent slab and furniture render before these inspection
        // guides, so an under-floor route cannot disappear into the finish.
        if (r.layer === "floor" && m.xray.floor) seg.renderOrder = 20;
        group.add(seg);
      }
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
    if (!mepVisible(n.sys) || !mepLayerVisible(n.layer)) return;
    var def = nodeKindDef(n.sys, n.k) || {};
    var p = nodePos(n);
    var hex = new THREE.Color(MEP_SYS[n.sys].color).getHex();
    var s = def.hub ? 12 : 7, marker;
    if (n.sys === "power" && n.k === "light") {
      marker = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2.5, 20), matFor(hex));
    } else {
      var w = n.sys === "power" && n.k === "outlet" ? 9 : n.sys === "power" && n.k === "switch" ? 7 : s;
      var h = n.sys === "power" && (n.k === "outlet" || n.k === "switch") ? 12 : s;
      marker = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(2.2, s * 0.3)), matFor(hex));
      if (n.wall != null) {
        var host = S.walls.find(function(wall) { return wall.id === n.wall; });
        if (host) { var wg = wallGeom(host); marker.rotation.y = -Math.atan2(wg.uz, wg.ux); }
      }
    }
    var surface = deviceSurfacePosition(n);
    marker.position.set(surface.x, layerNodeY(n), surface.z);
    group.add(marker);
  });
  // vertical risers: connect same-system entities that meet in plan (x,z) but
  // sit on different planes — e.g. a ceiling run dropping to a wall switch, or
  // an under-floor pipe rising into a wall.
  var anchors = [];
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys) || !mepLayerVisible(n.layer)) return;
    var p = nodePos(n);
    anchors.push({ x: p.x, z: p.z, y: layerNodeY(n), sys: n.sys });
  });
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer)) return;
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
// Mount plates on the interior finish instead of burying them at the datum.
export function deviceSurfacePosition(n) {
  var p = nodePos(n), host = S.walls.find(function(w) { return w.id === n.wall; });
  if (!host || n.layer !== "wall") return p;
  var g = wallGeom(host), nx = -g.uz, nz = g.ux;
  var room = detectRooms().find(function(r) { return r.key === n.roomKey; }) ||
    detectRooms().find(function(r) { return pointInPoly(p.x + nx * 20, p.z + nz * 20, r.pts) || pointInPoly(p.x - nx * 20, p.z - nz * 20, r.pts); });
  if (room && !pointInPoly(p.x + nx * 20, p.z + nz * 20, room.pts)) { nx = -nx; nz = -nz; }
  var offset = (host.thickness || 10) / 2 + 1.6;
  return { x: p.x + nx * offset, z: p.z + nz * offset };
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
