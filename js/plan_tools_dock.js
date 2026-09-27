/* Dockable panels over the 2D plan.

   #plan-tools used to be one cluster nailed to the inside-start edge of the
   pane: the tool column, the work-set layer chips and the wall palette moved
   together or not at all. They are now three independent panels, each with its
   own grip, each dockable to any of eight positions — the four edges and the
   four corners — and each able to share a position with the others.

   THE MODEL. The pane carries eight dock ZONES. A zone is flush against the
   pane edge (or the two edges of its corner) and holds any number of panels in
   one flex box, so panels sharing a zone sit against each other with a 1px
   divider and no gap. Three things are decided by where you drop, and stored:

     zone.axis  h or v — which way the panels in it are laid out INTERNALLY.
                A tool column becomes a tool row, the chips lose their labels.
                It comes from the edge you dropped nearest, so a corner can be
                either: dropped from the side it is a column, from the top it
                is a row.
     zone.flow  row or column — how panels in the zone TILE against each
                other, side by side or stacked. It comes from which way you
                dropped past the panels already there, which is the only
                gesture that means "beside" as opposed to "under".
     order      position within the zone; index 0 is always the panel closest
                to the flush edge, which is why right- and bottom-flush zones
                lay out reversed.

   FLUSH IS THE WHOLE POINT. A docked panel gives up the floating card look —
   no shadow, no outer margin, and no border or corner radius on the sides that
   touch the pane edge or a neighbour. The zone, not the panel, draws the
   remaining border and the remaining rounded corners, and clips its panels to
   them; that is why every panel is wrapped in a .pt-panel that holds the grip
   and hands its own background over to the zone.

   JS decides only geometry: which zone, in what order, and the pixel box each
   zone gets. Every shape change is an attribute the CSS reads. The max sizes
   have to be pixels — a percentage cannot resolve against a content-sized
   absolutely positioned box.

   At <=1024px (or in compact-nav) this whole structure is dismantled and the
   three panels go back to being direct children of #plan-tools in their
   original order, because there the element IS the phone rail and the media
   queries in css/styles.css own its layout. */
import { t, onLangChange } from "./i18n.js";
import * as bridge from "./uikit_host/dock.js";
import { ALL_HANDLES, CURSORS, rectFrom, sizeFrom } from "../uikit/editor/resize.js";

var PREFS = "home3d_plan_dock";
/* The top-trailing corner is shared by the view gizmo and the maximize button.
   They move down when a panel claims that corner; until one does, the top
   edge's centre zone stops short of them. */
var GIZMO_W = 100;
// how close to an existing group a drop counts as joining it rather than as
// claiming the edge behind it. This has to be a tap on the group, not an
// aura around it: a row along the top used to steal every drop 72px into
// the plan, which is why a pill parked just under it would not stay free.
var JOIN_PAD = 16;
/* How close to a pane edge a Shift-drop has to land to mean "dock here".
   Ordinary drags never snap: the Select pill lives on the top strip, and a
   magnet there is exactly the dashed preset the drag is trying to leave. */
var SNAP_PAD = 14;
// A panel that is not in any of the eight zones. Kept as a string so it stores
// and restores like any other zone id.
var FREE = "free";

/* Cluster panels live in #plan-tools and can dock. Overlay panels are the rest
   of the 2D pane chrome (floors, CAD bar, gizmo, …): same grip/move/resize,
   defaulting to free, never sent to the phone rail. */
var PANELS = [
  { key: "tools", id: "plan-toolbar", minW: 48, minH: 120 },
  { key: "layers", id: "layer-chips", minW: 80, minH: 44 },
  { key: "walls", id: "plan-wall-palette", minW: 160, minH: 80 },
  { key: "rooms", id: "plan-room-palette", minW: 160, minH: 80 },
  { key: "status", id: "plan-tool-status", minW: 72, minH: 28 },
  { key: "floors", id: "floor-tabs", overlay: true, axis: "h", minW: 80, minH: 28 },
  { key: "cad", id: "cad-status", overlay: true, axis: "h", minW: 200, minH: 28 },
  { key: "tune", id: "cad-tune", overlay: true, axis: "v", minW: 180, minH: 120 },
  { key: "entry", id: "cad-entry", overlay: true, axis: "h", minW: 160, minH: 40 },
  { key: "gizmo", sel: ".plan-gizmo", overlay: true, axis: "v", minW: 48, minH: 48 },
  { key: "max", sel: "#view-2d > .view-max-btn", overlay: true, axis: "v", minW: 28, minH: 28 },
  { key: "trace", id: "bp-trace-controls", overlay: true, axis: "h", minW: 120, minH: 36 },
  { key: "hint", id: "plan-hint", overlay: true, axis: "h", minW: 120, minH: 28 },
];
var PANEL_BY_KEY = {};
PANELS.forEach(function (p) { PANEL_BY_KEY[p.key] = p; });
function specOf(key) { return PANEL_BY_KEY[key] || { key: key, minW: 48, minH: 28 }; }
function isOverlay(key) { return !!specOf(key).overlay; }
var ZONES = [
  "top-left", "top", "top-right",
  "left", "right",
  "bottom-left", "bottom", "bottom-right",
];
// which pane edges each zone is flush against — this drives the border and the
// corner radius as much as it drives the position
var FLUSH = {
  "top-left": ["top", "left"],
  top: ["top"],
  "top-right": ["top", "right"],
  left: ["left"],
  right: ["right"],
  "bottom-left": ["bottom", "left"],
  bottom: ["bottom"],
  "bottom-right": ["bottom", "right"],
};
// [centre, start, end] per edge: the corners are the ends of two edges each,
// which is exactly why a corner zone's axis depends on the edge you came from
var EDGE_ZONES = {
  top: ["top", "top-left", "top-right"],
  bottom: ["bottom", "bottom-left", "bottom-right"],
  left: ["left", "top-left", "bottom-left"],
  right: ["right", "top-right", "bottom-right"],
};
var RING = ["left", "top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left"];
var DEFAULT_AXIS = {
  top: "h", bottom: "h", left: "v", right: "v",
  "top-left": "v", "top-right": "v", "bottom-left": "v", "bottom-right": "v",
};

var st = null;
// what the layout document last reported per panel — see adoptArrangement
var docZone = {};
var layer = null, pane = null;
var els = {}, wraps = {}, grips = {}, zoneEls = {}, dropEl = null;
var drag = null, sizing = null, pending = false, lastSig = "";

function clamp(lo, v, hi) {
  return hi < lo ? lo : v < lo ? lo : v > hi ? hi : v;
}

/* ---- state ---- */

function defaults() {
  var panels = {
    tools: { zone: "top", order: 0 },
    layers: { zone: "left", order: 0 },
    walls: { zone: "top", order: 1 },
    rooms: { zone: "top", order: 2 },
    status: { zone: "left", order: 1 },
  };
  PANELS.forEach(function (p) {
    if (!panels[p.key]) {
      var stick = p.key === "cad" ? "bottom"
        : p.key === "floors" ? "floors"
        : p.key === "gizmo" ? "gizmo"
        : p.key === "max" ? "max"
        : p.key === "tune" ? "tune"
        : p.key === "entry" ? "entry"
        : p.key === "trace" ? "trace"
        : p.key === "hint" ? "hint"
        : null;
      panels[p.key] = { zone: FREE, order: 0, free: { axis: p.axis || "h", stick: stick } };
    }
  });
  return { panels: panels, zones: { top: { axis: "h", flow: "column" }, left: { axis: "v", flow: "column" } } };
}
/* Every read of a panel's placement goes through here.
 *
 * `st.panels` is seeded from defaults() and then has a stored arrangement laid
 * over it, and a stored arrangement is only ever as new as the build that
 * wrote it. A panel added since — the room palette was the one that proved it —
 * is absent from the store, and the reads below are on the boot path, so one
 * missing entry threw inside place() and the whole app came up with "something
 * went wrong". Defaulting is the honest answer: a panel this file knows about
 * has a home whether or not the user has ever arranged it. */
function panelState(key) {
  var p = st.panels[key];
  if (!p) {
    var home = defaults().panels[key];
    p = st.panels[key] = home ? Object.assign({}, home) : { zone: isOverlay(key) ? FREE : "left", order: PANELS.length };
  }
  return p;
}
function isFree(key) {
  return panelState(key).zone === FREE;
}
/* Where a floating panel sits, which way round it is, and the box the user
   last chose. Stored in pane pixels; place() keeps the grip reachable after
   the pane has been resized. w/h are optional: missing means content-size. */
function freeState(key) {
  var p = panelState(key);
  var axis = specOf(key).axis || DEFAULT_AXIS.left;
  if (!p.free) p.free = { x: 24, y: 24, axis: axis };
  if (p.free.axis !== "h" && p.free.axis !== "v") p.free.axis = axis;
  if (typeof p.free.x !== "number") p.free.x = 24;
  if (typeof p.free.y !== "number") p.free.y = 24;
  return p.free;
}
// The axis a panel is currently laid out on, docked or floating. zoneState()
// would happily invent an st.zones.free entry if handed the sentinel.
function axisOf(key) {
  var p = panelState(key);
  if (p.axis === "h" || p.axis === "v") return p.axis;
  if (p.free && (p.free.axis === "h" || p.free.axis === "v")) return p.free.axis;
  return isFree(key) ? freeState(key).axis : zoneState(p.zone).axis;
}
function chosenSize(key) {
  var f = panelState(key).free;
  if (f && f.w > 0 && f.h > 0) {
    var spec = specOf(key);
    /* Old customize-layout builds could persist a wrapper after flex had
       squeezed it to only a couple of pixels. Restoring that literal box made
       a complete toolbar disappear while its content overflowed somewhere
       else in the plan. Treat impossible stored boxes as unsized and let the
       panel recover its natural dimensions. Horizontal panels legitimately
       have a short single-row height, so their vertical floor is deliberately
       lower than the column-oriented minimum. */
    var axis = f.axis === "h" || f.axis === "v" ? f.axis : axisOf(key);
    var minW = spec.minW || 48;
    var minH = axis === "h" ? Math.min(spec.minH || 28, 32) : (spec.minH || 28);
    if (f.w < minW || f.h < minH) return null;
    return { w: f.w, h: f.h };
  }
  return null;
}
function applyChosenSize(w, key) {
  var sz = chosenSize(key);
  if (!sz) {
    w.classList.remove("pt-sized");
    w.style.removeProperty("width");
    w.style.removeProperty("height");
    return;
  }
  w.classList.add("pt-sized");
  w.style.width = Math.round(sz.w) + "px";
  w.style.height = Math.round(sz.h) + "px";
}

/* Take a stored arrangement over the defaults, PER KNOWN PANEL rather than
   wholesale. A stored arrangement was written by whatever version of this file
   the user last ran, and a panel added since then is simply absent from it.
   Assigning the object straight over `st.panels` left that panel with no state
   at all, and the next read of its zone — in members(), during the first
   place() — threw before the plan had finished setting itself up. Every path
   that adopts an outside arrangement goes through here for that reason. */
function adoptArrangement(source) {
  if (!source) return;
  PANELS.forEach(function (panel) {
    var q = source.panels && source.panels[panel.key];
    if (!q) return;
    /* A panel the user dropped in open plan stays there while the document
       keeps saying what it said last time. Only a document that has actually
       changed its mind about this panel pulls it back into a zone. */
    if (isFree(panel.key) && docZone[panel.key] === q.zone) {
      docZone[panel.key] = q.zone;
      return;
    }
    docZone[panel.key] = q.zone;
    st.panels[panel.key] = Object.assign(panelState(panel.key), q);
  });
  st.zones = source.zones || {};
}
function zoneState(id) {
  var z = st.zones[id];
  if (!z) z = st.zones[id] = {};
  if (z.axis !== "h" && z.axis !== "v") z.axis = DEFAULT_AXIS[id];
  if (z.flow !== "row" && z.flow !== "column") z.flow = "row";
  return z;
}
/* The layout document is the durable store when uikit is running, and this
   file's own localStorage when it is not. Both have to work: uikit is behind a
   flag that is off by default, so the second is still the shipped path. */
function readFreeBox(q) {
  if (!q || typeof q.x !== "number" || typeof q.y !== "number") return null;
  var out = { x: q.x, y: q.y, axis: q.axis };
  if (typeof q.w === "number" && isFinite(q.w) && q.w > 0) out.w = q.w;
  if (typeof q.h === "number" && isFinite(q.h) && q.h > 0) out.h = q.h;
  if (q.seeded) out.seeded = true;
  if (typeof q.stick === "string") out.stick = q.stick;
  return out;
}
function applyLocal(p) {
  if (!p) return;
  if (typeof p.dock === "string") {
    if (ZONES.indexOf(p.dock) >= 0) {
      PANELS.forEach(function (panel) {
        if (!isOverlay(panel.key)) panelState(panel.key).zone = p.dock;
      });
      zoneState(p.dock);
    }
    return;
  }
  PANELS.forEach(function (panel) {
    var q = p.panels && p.panels[panel.key];
    if (!q) return;
    if (ZONES.indexOf(q.zone) >= 0) panelState(panel.key).zone = q.zone;
    if (q.zone === FREE && q.free) {
      panelState(panel.key).zone = FREE;
      var box = readFreeBox(q.free);
      if (box) panelState(panel.key).free = box;
      freeState(panel.key);
    }
    if (typeof q.order === "number" && isFinite(q.order)) panelState(panel.key).order = q.order;
    if (q.axis === "h" || q.axis === "v") panelState(panel.key).axis = q.axis;
  });
  ZONES.forEach(function (id) {
    var q = p.zones && p.zones[id];
    if (!q) return;
    var z = zoneState(id);
    if (q.axis === "h" || q.axis === "v") z.axis = q.axis;
    if (q.flow === "row" || q.flow === "column") z.flow = q.flow;
  });
}
function restore() {
  st = defaults();
  docZone = {};
  var p;
  try {
    p = JSON.parse(localStorage.getItem(PREFS) || "null");
  } catch (err) {
    p = null;
  }
  if (p && p.version === 3) {
    applyLocal(p);
    for (var key of Object.keys(p.docZone || {})) if (PANEL_BY_KEY[key] && ZONES.includes(p.docZone[key])) docZone[key] = p.docZone[key];
  }
  /* Overlay chrome is this file's store even when uikit owns the cluster.
     Read local first, then the document overwrites only the keys it knows. */
  var fromDoc = bridge.active() ? bridge.readState() : null;
  if (fromDoc) adoptArrangement(fromDoc);
}
function save() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ version: 3, panels: st.panels, zones: st.zones, docZone: docZone }));
  } catch (err) {
    /* a full or disabled quota must never break an edit */
  }
}

/* ---- who is where ---- */

/* THE PANE DECIDES, NOT THE WINDOW.

   A 1600px screen split with a 3D-heavy ratio leaves a 120px plan, and a
   198px-wide layer panel docked in it painted straight over the 3D view and
   the inspector — the window was wide, so none of the phone rules applied.
   Two thresholds, both measured on #view-2d itself:

     narrow  the panels stay docked but lose their labels, and the pane's
             elective chrome (the gesture hint, half the status strip) gets
             out of the way — see .plan-narrow in css/styles.css
     tiny    the dock is more chrome than plan: hand the panels back to the
             rail, which is the layout designed for exactly this strip. */
var NARROW_W = 460, TINY_W = 300, TINY_H = 260;
function posture() {
  if (!pane) return "full";
  var w = pane.clientWidth, h = pane.clientHeight;
  if (!w || !h) return "full";
  if (w < TINY_W || h < TINY_H) return "tiny";
  return w < NARROW_W ? "narrow" : "full";
}
function syncPosture() {
  if (!pane) return "full";
  var p = posture();
  pane.classList.toggle("plan-narrow", p !== "full");
  pane.classList.toggle("plan-tiny", p === "tiny");
  /* The window can be wide while the actual drawing pane is not (library and
     inspector consume more than 600px). Responsive toolbar density therefore
     follows the pane, not `window.innerWidth`; otherwise the labelled ribbon
     looks roomy to the media query while its final actions are crowded against
     the floor controls. */
  pane.classList.toggle("plan-tools-compact", pane.clientWidth < 1280);
  /* Below this width, independently saved free panels cannot share the same
     top edge without squeezing context controls into unreadable slivers. */
  pane.classList.toggle("plan-tools-tight", pane.clientWidth < 760);
  /* Context palettes contain more labelled controls than the primary ribbon.
     Give them their own threshold so a 1480px canvas can keep ribbon labels
     while Room presets use the no-horizontal-scroll command-panel layout. */
  pane.classList.toggle("plan-context-compact", pane.clientWidth < 1500);
  return p;
}
// The compact touch shell and very small panes use the phone rail.
// Narrow desktop windows keep the same dock as full-size windows.
function compact() {
  return document.body.classList.contains("compact-nav") || posture() === "tiny";
}
function statusH() {
  if (!isFree("cad")) return 0;
  var bar = els.cad || document.getElementById("cad-status");
  var host = wraps.cad && wraps.cad.parentNode ? wraps.cad : bar;
  if (!host || !host.offsetParent || (bar && bar.hidden)) return 0;
  if (pane) {
    var pr = pane.getBoundingClientRect();
    var r = host.getBoundingClientRect();
    /* Parked up in the plan: do not keep reserving the bottom strip. Still
       sitting on the bottom edge (the default): docked zones stay above it. */
    if (r.top < pr.top + pr.height * 0.65 && pr.bottom - r.bottom > 10) return 0;
  }
  return host.offsetHeight;
}
// `hidden` is exactly how js/ui.js toggles the wall palette, so it is also the
// only visibility question this module has to ask.
function shown(key) {
  var el = els[key];
  if (!el || el.hidden) return false;
  if (key === "status" && !el.classList.contains("has-msg") && !editingLayout()) return false;
  if (isOverlay(key) && pane && el.parentElement !== pane && wraps[key] && el.parentElement !== wraps[key]) {
    return false;
  }
  return true;
}
function members(id, onlyShown) {
  return PANELS.map(function (p) { return p.key; })
    .filter(function (k) {
      if (panelState(k).zone !== id || !els[k] || !wraps[k]) return false;
      if (drag && drag.key === k) return false; // a panel in the air is in no zone
      return !onlyShown || shown(k);
    })
    .sort(function (a, b) { return panelState(a).order - panelState(b).order; });
}
// Index 0 sits against the flush edge, so a zone flush right or bottom lays
// its panels out backwards.
function reversed(id, flow) {
  return flow === "row"
    ? FLUSH[id].indexOf("right") >= 0
    : FLUSH[id].indexOf("bottom") >= 0;
}

/* Beside, or under? `flow` is what the user asked for by dropping; this is what
   the pane can actually hold. Two panels side by side in a pane too narrow for
   them have three possible endings — one slides out of the pane, one scrolls,
   or they stack — and stacking is the only one that keeps every control
   reachable. Measured, not guessed: the zone is laid out both ways and the
   first that does not overflow wins, the user's own choice first. */
function fitFlow(z, zs, vis, w, h) {
  if (vis.length < 2) return zs.flow;
  if (zs.flow === "row") {
    var totalW = 0;
    vis.forEach(function (k) {
      var sz = chosenSize(k);
      totalW += sz ? sz.w : (wraps[k] && wraps[k].offsetWidth) || 0;
    });
    if (totalW > w) return "column";
  }
  return zs.flow;
}

/* Which sides of a panel are exposed, and which meet something.

   The card belongs to the PANEL, not to the zone: two panels of different
   sizes tiled into one zone would otherwise be painted as one rectangle with a
   large empty half, which is not "flush", just big. So each panel carries the
   background and the border, and this decides, per panel, which of its four
   sides is flush against the pane (no border, no radius), which meets a
   neighbour (one shared hairline, square corners) and which is simply exposed
   to the plan (border and a 14px radius, as before). */
var OPPOSITE = { left: "right", right: "left", top: "bottom", bottom: "top" };
function decorate(id, flow, vis) {
  var f = FLUSH[id], row = flow === "row";
  // the side each panel's PREVIOUS neighbour is on: index 0 hugs the edge
  var lead = row
    ? f.indexOf("right") >= 0 ? "right" : "left"
    : f.indexOf("bottom") >= 0 ? "bottom" : "top";
  var trail = OPPOSITE[lead];
  var cross = row ? ["top", "bottom"] : ["left", "right"];
  vis.forEach(function (k, i) {
    // a flush side across the flow is shared by every panel in the zone; the
    // one along the flow belongs to whichever panel is actually against it
    var flush = cross.filter(function (s) { return f.indexOf(s) >= 0; });
    if (i === 0 && f.indexOf(lead) >= 0) flush.push(lead);
    var join = [];
    if (i > 0) join.push(lead);
    if (i < vis.length - 1) join.push(trail);
    wraps[k].setAttribute("data-flush", flush.join(" "));
    wraps[k].setAttribute("data-join", join.join(" "));
    /* When the zone runs out of room the panel furthest from the edge is the
       one that gives, so a tool rail keeps all of its commands and the panel
       you added last is the one that scrolls. Marked here rather than with
       :last-child because the last child may be a hidden wall palette. */
    if (i === vis.length - 1) wraps[k].setAttribute("data-give", "1");
    else wraps[k].removeAttribute("data-give");
  });
}

/* ---- the DOM the dock owns ---- */

function ensureDom() {
  ZONES.forEach(function (id) {
    if (zoneEls[id] && zoneEls[id].parentNode === layer) return;
    var z = zoneEls[id] || document.createElement("div");
    z.className = "pt-zone";
    z.setAttribute("data-zone", id);
    z.setAttribute("data-flush", FLUSH[id].join(" "));
    z.hidden = true;
    layer.appendChild(z);
    zoneEls[id] = z;
  });
  bridge.registerZones(zoneEls);
  if (!dropEl) {
    dropEl = document.createElement("div");
    dropEl.className = "pt-drop";
    dropEl.hidden = true;
  }
  if (dropEl.parentNode !== layer) layer.appendChild(dropEl);
}

/* Hand the panels back to the phone rail: original order, direct children of
   #plan-tools, none of the dock's own elements left behind. */
function release() {
  var wasDock = layer.classList.contains("pt-dock");
  layer.classList.remove("pt-dock");
  /* Before anything is reparented. Unregistering the slots makes uikit skip
     the eight zone containers on its next pass, which releases the wrappers it
     was holding — if it still held them while this function moved the panels
     out of them, the next render would put them straight back. */
  if (wasDock) bridge.unregisterZones();
  PANELS.forEach(function (p) {
    var el = els[p.key];
    if (!el || lent(el)) return;
    el.removeAttribute("data-axis");
    el.classList.remove("pt-inner");
    if (p.overlay || p.key === "status") {
      if (el.parentElement === pane || (wraps[p.key] && el.parentElement === wraps[p.key])) {
        pane.appendChild(el);
      }
    } else {
      layer.appendChild(el);
    }
    var w = wraps[p.key];
    if (!w) return;
    ["data-flush", "data-join", "data-give"].forEach(function (a) { w.removeAttribute(a); });
    /* The phone rail lays the panels out itself; a stored free position is a
       desktop fact and must not follow them into it. The state survives — this
       clears the styling only, so widening the pane restores the arrangement. */
    w.classList.remove("pt-free");
    w.classList.remove("pt-sized");
    w.style.removeProperty("left");
    w.style.removeProperty("top");
    w.style.removeProperty("width");
    w.style.removeProperty("height");
    if (w.parentNode) w.parentNode.removeChild(w);
  });
  ZONES.forEach(function (id) {
    var z = zoneEls[id];
    if (z && z.parentNode) z.parentNode.removeChild(z);
  });
  if (dropEl && dropEl.parentNode) dropEl.parentNode.removeChild(dropEl);
  pane.style.removeProperty("--plan-hint-lift");
  pane.style.removeProperty("--plan-corner-lift");
}

function sameKids(parent, kids) {
  if (parent.children.length !== kids.length) return false;
  for (var i = 0; i < kids.length; i++) if (parent.children[i] !== kids[i]) return false;
  return true;
}

/* ---- layout ---- */

function place() {
  if (!layer || !pane) return;
  syncPosture();
  if (compact()) return release();
  claimAll();
  ensureDom();
  layer.classList.add("pt-dock");

  var pw = pane.clientWidth, ph = pane.clientHeight;
  if (!pw || !ph) return;

  // 1. every panel into its zone, in order, with the zone's axis on it
  ZONES.forEach(function (id) {
    var z = zoneEls[id], zs = zoneState(id), all = members(id, false);
    var kids = all.map(function (k) {
      var w = wraps[k], el = els[k];
      if (!w || !el) return null;
      if (lent(el)) { w.hidden = true; return null; }
      if (isOverlay(k) && pane && !pane.contains(el) && el.parentNode !== w) {
        w.hidden = true;
        return null;
      }
      /* A hidden panel keeps its place in the zone's DOM order — the wall
         palette comes and goes with the tool — but its wrapper has to go with
         it, or the grip alone leaves an 18px sliver of card behind.
         Two owners, one write: the app hides a panel whose tool is not active,
         and the layout hides one the user put away. Either is enough. */
      w.hidden = !shown(k) || bridge.hiddenInDoc(k);
      w.setAttribute("data-axis", axisOf(k));
      el.setAttribute("data-axis", axisOf(k));
      el.classList.add("pt-inner");
      if (el.parentNode !== w) w.appendChild(el);
      applyChosenSize(w, k);
      return w;
    }).filter(Boolean);
    if (!sameKids(z, kids)) kids.forEach(function (w) { z.appendChild(w); });
    var vis = members(id, true);
    z.hidden = vis.length === 0;
    var flow = fitFlow(z, zs, vis, pw, ph);
    z.setAttribute("data-flow", flow);
    z.setAttribute("data-rev", reversed(id, flow) ? "1" : "0");
    decorate(id, flow, vis);
  });
  if (drag) {
    var dw = wraps[drag.key];
    if (dw.parentNode !== layer) layer.appendChild(dw);
  }
  placeFree(pw, ph);
  /* Free overlays (the CAD bar at the bottom) have to be sitting where they
     will actually be before docked zones measure the leftover room. */
  var bottom = ph - statusH();
  /* A free primary ribbon is visually the first row. Context palettes docked
     to the top edge belong on the next row, not underneath it. This is derived
     from the rendered box (not the saved x/y) because the pane may have just
     compacted or centred the toolbar for presentation. */
  var topOffset = 0;
  if (wraps.tools && isFree("tools") && shown("tools") && !wraps.tools.hidden) {
    var pr = pane.getBoundingClientRect();
    var rr = wraps.tools.getBoundingClientRect();
    var ry = rr.top - pr.top;
    if (ry <= 24) topOffset = Math.round(Math.min(bottom, ry + rr.height + 12));
  }

  // 2. natural sizes, capped only by the pane
  var nat = {};
  ZONES.forEach(function (id) {
    cap(zoneEls[id], pw, Math.max(0, bottom - (FLUSH[id].indexOf("top") >= 0 ? topOffset : 0)));
    nat[id] = { w: zoneEls[id].offsetWidth, h: zoneEls[id].offsetHeight };
  });

  /* 3. real caps. A centre zone may not run into the corner zones it shares an
        edge with — capped there, two zones that grow towards each other end up
        flush instead of overlapping, which is the whole promise of docking. */
  var trFree = members("top-right", true).length === 0 ? GIZMO_W : 0;
  /* Free rails still own horizontal lanes. Centre labelled context palettes
     in the genuinely open canvas between Layers and Floors instead of under
     either card. This matters most in short windows where there is no spare
     vertical room to repair an avoidable horizontal collision. */
  function freeBox(key) {
    var w = wraps[key];
    if (!w || w.hidden || !isFree(key) || !shown(key)) return null;
    var paneRect = pane.getBoundingClientRect(), r = w.getBoundingClientRect();
    return { x: r.left - paneRect.left, y: r.top - paneRect.top, w: r.width, h: r.height, r: r.right - paneRect.left };
  }
  var leftRail = freeBox("layers");
  var rightRail = freeBox("floors");
  var topLaneLeft = leftRail && leftRail.x < pw / 3 ? leftRail.r + 12 : 0;
  var topLaneRight = rightRail && rightRail.x > pw / 2 ? rightRail.x - 12 : pw;
  var span = {
    top: {
      l: Math.max(nat["top-left"].w, topLaneLeft),
      r: Math.min(pw - Math.max(nat["top-right"].w, trFree), topLaneRight),
    },
    bottom: { l: nat["bottom-left"].w, r: pw - nat["bottom-right"].w },
    left: { t: topOffset + Math.max(nat["top-left"].h, nat.top.h), b: bottom - nat["bottom-left"].h },
    right: { t: topOffset + Math.max(nat["top-right"].h, nat.top.h), b: bottom - nat["bottom-right"].h },
  };
  cap(zoneEls.top, Math.max(120, span.top.r - span.top.l), Math.max(0, bottom - topOffset));
  // Capping the top can add a wrapped row; measure before placing side palettes.
  span.left.t = Math.max(span.left.t, topOffset + zoneEls.top.offsetHeight);
  span.right.t = Math.max(span.right.t, topOffset + zoneEls.top.offsetHeight);
  cap(zoneEls.bottom, Math.max(120, span.bottom.r - span.bottom.l), bottom);
  cap(zoneEls.left, pw, Math.max(80, span.left.b - span.left.t));
  cap(zoneEls.right, pw, Math.max(80, span.right.b - span.right.t));

  // 4. position each zone against its edge(s)
  var boxes = {};
  ZONES.forEach(function (id) {
    var z = zoneEls[id];
    if (z.hidden) return;
    var f = FLUSH[id], w = z.offsetWidth, h = z.offsetHeight, x, y;
    if (f.indexOf("left") >= 0) x = 0;
    else if (f.indexOf("right") >= 0) x = pw - w;
    else {
      var sx = span[id === "top" ? "top" : "bottom"];
      x = clamp(sx.l, sx.l + (sx.r - sx.l - w) / 2, Math.max(sx.l, sx.r - w));
    }
    if (f.indexOf("top") >= 0) y = topOffset;
    else if (f.indexOf("bottom") >= 0) y = bottom - h;
    else {
      var sy = span[id];
      y = sy.t;
    }
    z.style.left = Math.round(x) + "px";
    z.style.top = Math.round(y) + "px";
    boxes[id] = { x: x, y: y, w: w, h: h };
  });

  /* The dock now has final coordinates. Run the free-panel presentation pass
     once more with those zones reserved; this is what keeps Layers, Floors,
     Maximise and the view gizmo clear when a labelled context palette opens. */
  placeFree(pw, ph, Object.keys(boxes).map(function (id) { return boxes[id]; }));
  /* A shallow desktop pane cannot stack the right-side navigation by trial
     and error: clamping the last card back into the pane can recreate the
     collision the solver just removed. Give the three controls a deterministic
     compact rail beside (never over) the context palette. */
  if (ph < 500) {
    var railY = topOffset + 1;
    ["floors", "max", "gizmo"].forEach(function (key) {
      var w = wraps[key];
      if (!w || w.hidden || !isFree(key) || !shown(key)) return;
      var rw = w.offsetWidth, rh = w.offsetHeight;
      w.style.left = Math.round(Math.max(0, pw - rw)) + "px";
      w.style.top = Math.round(Math.min(Math.max(0, ph - rh), railY)) + "px";
      railY += rh + 12;
    });
  }

  /* 5. the two floating controls that were here first. The gizmo and the
        maximize button sit in the top-trailing corner; when a panel takes that
        corner they move below it rather than under it. The active-tool hint
        floats at the bottom, where the bottom zones now are. */
  var trh = 0;
  ["top-right", "top", "top-left"].forEach(function (id) {
    var b = boxes[id];
    if (b && (id === "top-right" || b.x + b.w > pw - 120)) {
      trh = Math.max(trh, b.y + b.h);
    }
  });
  pane.style.setProperty(
    "--plan-corner-lift",
    Math.round(trh ? clamp(0, trh + 8, Math.max(0, ph - 220)) : 0) + "px",
  );
  var lift = 0;
  ["bottom-left", "bottom", "bottom-right"].forEach(function (id) {
    if (boxes[id]) lift = Math.max(lift, boxes[id].h);
  });
  pane.style.setProperty("--plan-hint-lift", Math.round(lift + (lift ? 8 : 0)) + "px");
  lastSig = sig();
}

/* Panels the user dropped in open plan. They belong to no zone, so they carry
   the whole card themselves — border, radius and shadow on all four sides — and
   sit where they were left. The clamp is not decoration: the pane is resizable
   and a stored position outlives the size it was chosen at, so a panel parked
   at the right edge of a wide pane has to still be reachable in a narrow one. */
function placeFree(pw, ph, reserved) {
  /* Docked zones and floating panels share the same pixels. The first layout
     pass establishes natural sizes; the final pass receives the positioned
     dock zones as reserved rectangles so a free Layers/Floors/Gizmo card can
     never sit over an expanded Wall or Room palette. */
  var placed = (reserved || []).map(function (b) {
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  });
  /* Bottom CAD status is an anchored frame edge, not a card that should move
     out of the way of Floors/Gizmo. Place it first so every later free panel
     yields to it; the previous registry order could push the full-width bar
     upward across a Room palette in a short window. */
  var priority = { cad: 0, tools: 1, layers: 2, floors: 3, max: 4, gizmo: 5 };
  PANELS.slice().sort(function (a, b) {
    return (priority[a.key] == null ? 20 : priority[a.key]) - (priority[b.key] == null ? 20 : priority[b.key]);
  }).forEach(function (panel) {
    var key = panel.key, w = wraps[key];
    if (!w) return;
    if (!isFree(key) || (drag && drag.key === key) || (sizing && sizing.key === key)) {
      if ((!drag || drag.key !== key) && (!sizing || sizing.key !== key)) {
        w.classList.remove("pt-free");
        w.style.removeProperty("left");
        w.style.removeProperty("top");
        if (!chosenSize(key)) {
          w.classList.remove("pt-sized");
          w.style.removeProperty("width");
          w.style.removeProperty("height");
        }
      }
      return;
    }
    var el = els[key];
    if (!el || lent(el) || (isOverlay(key) && el.parentElement !== w && el.parentElement !== pane)) {
      w.hidden = true;
      return;
    }
    if (el.parentNode !== w) w.appendChild(el);
    var f = freeState(key);
    applyStick(key, f, w, pw, ph);
    seedFreeIfNeeded(key, w, pw, ph);
    f = freeState(key);
    w.hidden = !shown(key) || bridge.hiddenInDoc(key);
    ["data-flush", "data-join", "data-give"].forEach(function (a) { w.removeAttribute(a); });
    w.setAttribute("data-axis", f.axis);
    el.setAttribute("data-axis", f.axis);
    el.classList.add("pt-inner");
    if (w.parentNode !== layer) layer.appendChild(w);
    w.classList.add("pt-free");
    /* Kept reachable, not kept wholly inside. Two reasons it is a corner of the
       panel rather than the whole box: a panel is measured on the frame it
       appears, before its rows have settled, and requiring the full height to
       fit made it jump on that frame and settle back a frame later; and a
       window manager does not shove your window up the screen because it is
       tall — it only guarantees you can still grab it. The grip runs along the
       top, so a visible top edge is exactly that guarantee.
       Display only, never written back: a pane that is briefly narrow — a split
       mid-drag — must not quietly consume the position the user chose. */
    var storedSize = chosenSize(key);
    var sized = !!storedSize;
    w.classList.toggle("pt-sized", sized);
    w.style.maxWidth = Math.round(pw) + "px";
    w.style.maxHeight = Math.round(ph) + "px";
    if (sized) {
      w.style.width = Math.round(Math.min(storedSize.w, pw)) + "px";
      w.style.height = Math.round(Math.min(storedSize.h, ph)) + "px";
    } else {
      w.style.removeProperty("width");
      w.style.removeProperty("height");
    }
    var r = w.getBoundingClientRect();
    var keep = 64;
    var arranging = editingLayout();
    /* While arranging, a card may hang partly outside the pane as long as its
       grip remains reachable. In the normal product view every control must
       be visible: a floor switcher with only its last 64px on-screen is not a
       useful menu, even though it is technically draggable in Customize UI. */
    var minX = arranging ? keep - Math.round(r.width) : 0;
    var maxX = arranging ? Math.max(0, pw - keep) : Math.max(0, pw - Math.round(r.width));
    w.style.left = Math.round(clamp(minX, f.x, maxX)) + "px";
    var keepTop = Math.min(32, Math.max(16, Math.round(r.height)));
    var maxY = arranging ? Math.max(0, ph - keepTop) : Math.max(0, ph - Math.round(r.height));
    w.style.top = Math.round(clamp(0, f.y, maxY)) + "px";

    if (!arranging && !w.hidden) {
      /* A saved free layout can be restored into a smaller pane. Keeping each
         card in bounds is necessary but not sufficient: two individually
         valid boxes may now cover each other's controls. Resolve collisions
         for presentation only (the stored coordinates remain untouched), in
         panel priority order, preferring the open space below a blocker. */
      var box = {
        x: parseFloat(w.style.left) || 0,
        y: parseFloat(w.style.top) || 0,
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
      /* A ribbon parked along the top edge reads as primary application
         chrome, so keep it optically centred in normal mode. Customize UI
         still exposes the exact stored position and remains the only place
         that writes it. This also prevents a valid-but-lopsided saved x value
         from crowding Delete against the floor controls after sidebars resize. */
      if (key === "tools" && f.y <= 24 && box.w < pw) {
        box.x = Math.round((pw - box.w) / 2);
      }
      function hits(a, b) {
        var gap = 12;
        return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
          a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
      }
      for (var pass = 0; pass < placed.length * 2 + 2; pass++) {
        var blocker = placed.find(function (other) { return hits(box, other); });
        if (!blocker) break;
        var down = blocker.y + blocker.h + 12;
        var right = blocker.x + blocker.w + 12;
        var left = blocker.x - box.w - 12;
        var up = blocker.y - box.h - 12;
        if (down + box.h <= ph) box.y = down;
        else if (right + box.w <= pw) box.x = right;
        else if (left >= 0) box.x = left;
        else if (up >= 0) box.y = up;
        else break;
      }
      box.x = clamp(0, box.x, Math.max(0, pw - box.w));
      box.y = clamp(0, box.y, Math.max(0, ph - box.h));
      w.style.left = Math.round(box.x) + "px";
      w.style.top = Math.round(box.y) + "px";
      placed.push(box);
    }
  });
}

function seedFreeIfNeeded(key, w, pw, ph) {
  var f = freeState(key);
  if (f.stick || f.seeded) return;
  applyStick(key, f, w, pw, ph);
}

/* The zone's room, as a style AND as two variables. A percentage cannot resolve
   against a box that is only max-constrained, so a panel that wants to wrap
   inside the zone — rather than scroll, or spill — has no way to know how much
   room it has unless the pixels are handed down. */
function cap(z, w, h) {
  var cw = Math.max(0, Math.round(w)), ch = Math.max(0, Math.round(h));
  z.style.maxWidth = cw + "px";
  z.style.maxHeight = ch + "px";
  z.style.setProperty("--pt-w", cw + "px");
  z.style.setProperty("--pt-h", ch + "px");
}
function sig() {
  /* Free panels are in the signature too: a pane resize that leaves every zone
     the same size can still have pushed a floating panel out of view, and the
     clamp that fixes that only runs if this string moves. */
  var free = PANELS.map(function (p) {
    if (!isFree(p.key)) return "";
    var f = freeState(p.key);
    return p.key + ":" + Math.round(f.x) + "," + Math.round(f.y) +
      (typeof f.w === "number" ? "x" + Math.round(f.w) + "x" + Math.round(f.h || 0) : "");
  }).join(",");
  return ZONES.map(function (id) {
    var z = zoneEls[id];
    return z ? z.offsetWidth + "x" + z.offsetHeight : "";
  }).join("|") + "|" + free + "|" + (pane ? pane.clientWidth + "x" + pane.clientHeight : "");
}

function relayout() {
  if (pending || drag || sizing) return;
  pending = true;
  var done = false;
  var run = function () {
    if (done) return;
    done = true;
    pending = false;
    place();
  };
  requestAnimationFrame(run);
  /* rAF is suspended while the tab or the pane is occluded, and a layout that
     never arrives leaves every panel where the last visible frame put them —
     which is how a split-view pane's sizes survive a switch to full plan. The
     timer is the floor under that. */
  setTimeout(run, 120);
}
// Opening the wall palette or switching locale resizes a panel, and a resize
// moves every zone that is centred or flush on the far side. Guarded on the
// measured sizes so re-placing cannot chase its own writes.
function onResize() {
  if (drag || sizing || !layer.classList.contains("pt-dock")) return relayout();
  if (sig() === lastSig) return;
  relayout();
}

/* ---- picking a target while dragging ---- */

function targetFor(px, py, pw, ph, axisNow, noDock) {
  var d = { left: px, right: pw - px, top: py, bottom: ph - py };
  var edge = "left";
  ["right", "top", "bottom"].forEach(function (k) { if (d[k] < d[edge]) edge = k; });
  var horiz = edge === "top" || edge === "bottom";
  var wantAxis = horiz ? "h" : "v";

  if (noDock) return { zone: FREE, axis: axisNow || wantAxis };

  /* Dropped ON or immediately beside a panel: join that group. Do not require
     the nearest pane edge to match — a column on the left is still the target
     when the pointer is 10px off it, even if the top edge is closer. */
  var best = null;
  ZONES.forEach(function (id) {
    var R = occupied(id);
    if (!R) return;
    var near = Math.max(
      px < R.x ? R.x - px : px > R.r ? px - R.r : 0,
      py < R.y ? R.y - py : py > R.b ? py - R.b : 0,
    );
    if (near <= JOIN_PAD && (!best || near < best.d)) best = { id: id, d: near };
  });
  // Inside the explicit edge band, Shift chooses that edge or corner. A
  // nearby palette must not steal a deliberate corner drop.
  if (best && Math.min(d.left, d.right, d.top, d.bottom) > SNAP_PAD) return { zone: best.id, axis: axisNow || zoneState(best.id).axis };

  /* Nowhere near an edge and not on a group: the drop means the plan.
     A free panel keeps the axis it already had. */
  if (Math.min(d.left, d.right, d.top, d.bottom) > SNAP_PAD) {
    return { zone: FREE, axis: axisNow || wantAxis };
  }

  var along = horiz ? px / Math.max(1, pw) : py / Math.max(1, ph);
  var end = along < 1 / 3 ? 1 : along > 2 / 3 ? 2 : 0;
  var cand = EDGE_ZONES[edge][end];
  // If the candidate corner is already occupied by a panel with a conflicting axis,
  // target the edge's main zone (top, bottom, left, right) instead of corrupting the corner.
  if (cand !== edge && occupied(cand) && zoneState(cand).axis !== wantAxis) {
    cand = edge;
  }
  return { zone: cand, axis: wantAxis };
}

// The union of what is already in the zone, in pane coordinates.
function occupied(id) {
  var pr = pane.getBoundingClientRect(), box = null;
  members(id, true).forEach(function (k) {
    var r = wraps[k].getBoundingClientRect();
    var b = { x: r.left - pr.left, y: r.top - pr.top, r: r.right - pr.left, b: r.bottom - pr.top };
    box = box
      ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), r: Math.max(box.r, b.r), b: Math.max(box.b, b.b) }
      : b;
  });
  if (!box) return null;
  box.w = box.r - box.x;
  box.h = box.b - box.y;
  return box;
}

/* Beside, or under? Determines flow and lead from spatial intent: along the
   rail's primary axis (column for vertical rails, row for horizontal rails) by
   default, or across the rail if dragged sideways into the pane. */
function insertion(id, px, py) {
  var R = occupied(id);
  if (!R) return { flow: zoneState(id).flow, lead: true, rect: null };
  var f = FLUSH[id], axis = zoneState(id).axis;
  var pr = pane.getBoundingClientRect();
  var band = SNAP_PAD + 8;
  /* A pointer in the snap band is choosing the edge, not "under the pill
     already there". Stacking in that band is what parked a column 46px down. */
  if (f.indexOf("top") >= 0 && py <= band) {
    return { flow: "row", lead: px < R.x + R.w / 2, rect: R };
  }
  if (f.indexOf("bottom") >= 0 && (pr.height - py) <= band) {
    return { flow: "row", lead: px < R.x + R.w / 2, rect: R };
  }
  if (f.indexOf("left") >= 0 && px <= band) {
    return { flow: "column", lead: py < R.y + R.h / 2, rect: R };
  }
  if (f.indexOf("right") >= 0 && (pr.width - px) <= band) {
    return { flow: "column", lead: py < R.y + R.h / 2, rect: R };
  }
  var flow, lead;
  if (axis === "v") {
    // Vertical rail (left / right edge):
    // The natural layout along the rail is a column. If the cursor is near or past
    // the top or bottom of what is already there, stack vertically.
    // Only if the cursor is vertically alongside the group and clearly dragged into
    // the pane does it tile horizontally into a row.
    if (py > R.b - 20) {
      flow = "column";
      lead = false;
    } else if (py < R.y + 20) {
      flow = "column";
      lead = true;
    } else {
      flow = "row";
      if (f.indexOf("left") >= 0) {
        lead = px < R.x + 24;
      } else if (f.indexOf("right") >= 0) {
        lead = px > R.r - 24;
      } else {
        lead = px < R.x + R.w / 2;
      }
    }
  } else {
    // Horizontal rail (top / bottom edge):
    // The natural layout along the rail is a row. If the cursor is near or past
    // the start or end of the row, tile horizontally.
    // Only if the cursor is horizontally inside the group and clearly dragged down/up
    // into the pane does it stack vertically into a second row.
    if (px > R.r - 20) {
      flow = "row";
      lead = f.indexOf("right") >= 0;
    } else if (px < R.x + 20) {
      flow = "row";
      lead = f.indexOf("left") >= 0;
    } else {
      flow = "column";
      if (f.indexOf("top") >= 0) {
        lead = py < R.y + 24;
      } else if (f.indexOf("bottom") >= 0) {
        lead = py > R.b - 24;
      } else {
        lead = py < R.y + R.h / 2;
      }
    }
  }
  return { flow: flow, lead: lead, rect: R };
}

/* Where the panel lands. The slot is the card they are holding, parked
   against the edge — not a restyled row/column the dock guessed for them. */
function previewRect(target, ins, pw, ph) {
  var f = FLUSH[target.zone], R = ins.rect;
  var w = Math.min(drag.w, pw), h = drag.h;
  var bottom = ph - statusH();
  if (!R) {
    return {
      x: f.indexOf("left") >= 0 ? 0 : f.indexOf("right") >= 0 ? pw - w : (pw - w) / 2,
      y: f.indexOf("top") >= 0 ? 0 : f.indexOf("bottom") >= 0 ? bottom - h : (bottom - h) / 2,
      w: w, h: h,
    };
  }
  var flow = ins.flow;
  if (flow === "row" && R.w + w > pw) {
    flow = "column";
    ins.flow = "column";
  }
  if (flow === "row") {
    var atEnd = f.indexOf("right") >= 0;
    return {
      x: ins.lead ? (atEnd ? R.r - w : R.x) : atEnd ? R.x - w : R.r,
      y: R.y, w: w, h: h,
    };
  }
  var atBottom = f.indexOf("bottom") >= 0;
  return {
    x: R.x,
    y: ins.lead ? (atBottom ? R.b - h : R.y) : atBottom ? R.y - h : R.b,
    w: w, h: h,
  };
}

/* ---- the drag ---- */

/* What the panel measures on its own, laid out along `axis`. Measured rather
   than guessed by swapping width for height: a tool column is 54 wide and 596
   tall, but the same tools in a row are 578 × 44 and wrap to 290 × 146 in a
   narrow pane — no arithmetic on the column's box predicts that. Cached per
   axis, so a drag that crosses the pane measures twice at most. */
function natural(key, axis) {
  var w = wraps[key], cached = drag && drag.sizes[axis];
  if (cached) return cached;
  var el = els[key];
  var wasW = w.style.width, wasH = w.style.height;
  var wasAxis = w.getAttribute("data-axis");
  w.style.width = "";
  w.style.height = "";
  w.setAttribute("data-axis", axis);
  el.setAttribute("data-axis", axis);
  var r = w.getBoundingClientRect();
  var size = { w: Math.round(r.width), h: Math.round(r.height) };
  if (wasAxis) { w.setAttribute("data-axis", wasAxis); el.setAttribute("data-axis", wasAxis); }
  w.style.width = wasW;
  w.style.height = wasH;
  if (drag) drag.sizes[axis] = size;
  return size;
}

function floatAt(x, y) {
  var w = wraps[drag.key];
  w.style.left = Math.round(x) + "px";
  w.style.top = Math.round(y) + "px";
}

function editingLayout() {
  return !!document.querySelector("#app.uikit-editing");
}

function onDown(e) {
  if (!editingLayout()) return;
  if (compact() || (e.button != null && e.button > 0)) return;
  var key = e.currentTarget.getAttribute("data-grip");
  var w = wraps[key];
  if (!w || !shown(key)) return;
  var r = w.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  var axis = axisOf(key);
  var wasFree = isFree(key);
  drag = {
    key: key, id: e.pointerId,
    dx: e.clientX - r.left, dy: e.clientY - r.top,
    sx: e.clientX, sy: e.clientY, moved: false,
    alt: !!e.altKey,
    shift: !!e.shiftKey,
    axis: axis, sizes: {},
    target: { zone: panelState(key).zone, axis: axis },
    ins: wasFree
      ? { flow: "row", lead: true, rect: null }
      : { flow: zoneState(panelState(key).zone).flow, lead: true, rect: null },
  };
  w.classList.remove("pt-free");
  // in the air it belongs to no group: a whole card, not a tiled piece of one
  w.removeAttribute("data-flush");
  w.removeAttribute("data-join");
  w.classList.add("pt-floating");
  layer.classList.add("pt-dragging");
  /* Lifted BEFORE it is measured. Docked, a panel is stretched to its
     neighbour's height — five layer rows in a card as tall as the tool column —
     and freezing that is how the drag came to carry a mostly empty card around
     the pane. Out of the zone's flex box it sizes to its own content, which is
     both what it looks like in the air and what it will look like alone. */
  var sized = wasFree && freeState(key);
  var nat = (sized && sized.w && sized.h)
    ? { w: sized.w, h: sized.h }
    : natural(key, axis);
  drag.w = nat.w;
  drag.h = nat.h;
  drag.dx = Math.min(drag.dx, Math.max(8, nat.w - 8));
  drag.dy = Math.min(drag.dy, Math.max(8, nat.h - 8));
  w.style.width = nat.w + "px";
  w.style.height = nat.h + "px";
  place(); // the zone it left closes up behind it, immediately
  w.setAttribute("data-axis", axis);
  els[key].setAttribute("data-axis", axis);
  floatAt(r.left - pr.left, r.top - pr.top);
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
}

function onMove(e) {
  if (!drag) return;
  if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
  drag.alt = !!e.altKey;
  drag.shift = !!e.shiftKey;
  var pr = pane.getBoundingClientRect();
  var px = e.clientX - pr.left, py = e.clientY - pr.top;
  var pw = pr.width, ph = pr.height;
  floatAt(clamp(-drag.w / 2, px - drag.dx, pw - drag.w / 2), clamp(0, py - drag.dy, ph - 20));
  if (!drag.moved) return;

  /* Ordinary drags stay free. Shift is the opt-in to dock; Alt still cancels
     it. The dashed box is a dock slot, so it only appears for that gesture. */
  var target = targetFor(clamp(0, px, pw), clamp(0, py, ph), pw, ph, drag.axis, !drag.shift || drag.alt);
  var free = target.zone === FREE;
  var ins = free ? { flow: "row", lead: true, rect: null } : insertion(target.zone, px, py);
  drag.target = target;
  drag.ins = ins;
  if (free) { dropEl.hidden = true; return; }
  var rect = previewRect(target, ins, pw, ph);
  dropEl.hidden = false;
  dropEl.style.left = Math.round(clamp(0, rect.x, pw)) + "px";
  dropEl.style.top = Math.round(clamp(0, rect.y, ph)) + "px";
  dropEl.style.width = Math.round(Math.min(rect.w, pw)) + "px";
  dropEl.style.height = Math.round(Math.min(rect.h, ph)) + "px";
}

function onUp(e) {
  if (!drag) return;
  var d = drag;
  var w = wraps[d.key];
  /* Read before the inline styles come off: the panel's own left/top IS the
     answer for a free drop, and it is already clamped to the pane by onMove. */
  var landed = { x: parseFloat(w.style.left) || 0, y: parseFloat(w.style.top) || 0 };
  var shift = !!(e && e.shiftKey);
  var alt = !!(e && e.altKey);
  /* Resolve the drop WHILE this panel is still "in the air". members()
     ignores drag.key; clearing drag first made occupied() include this wrap
     at 0,0 and every Shift-drop joined the zone it had just left. */
  if (!d.moved) {
    d.target = { zone: panelState(d.key).zone, axis: d.axis };
  } else if (shift && !alt && pane && e && e.clientX != null) {
    var pr = pane.getBoundingClientRect();
    var px = e.clientX - pr.left, py = e.clientY - pr.top;
    var pw = pr.width, ph = pr.height;
    d.target = targetFor(clamp(0, px, pw), clamp(0, py, ph), pw, ph, d.axis, false);
    d.ins = d.target.zone === FREE ? d.ins : insertion(d.target.zone, px, py);
  } else {
    d.target = { zone: FREE, axis: d.axis };
  }
  w.classList.remove("pt-floating");
  w.style.removeProperty("left");
  w.style.removeProperty("top");
  w.style.removeProperty("width");
  w.style.removeProperty("height");
  layer.classList.remove("pt-dragging");
  if (dropEl) dropEl.hidden = true;
  try { grips[d.key].releasePointerCapture(d.id); } catch (err) {}
  drag = null;
  if (!d.moved) {
    if (d.alt) flipAxis(d.key);
    else place();
    return;
  }
  if (d.target.zone === FREE) {
    return setFree(d.key, landed.x, landed.y, d.axis, { w: d.w, h: d.h });
  }
  /* Keep the axis the card already has. Passing the edge's axis is what
     restyled a column into a row the moment it touched the top. */
  dock(d.key, d.target.zone, d.axis, d.ins.flow, d.ins.lead, { w: d.w, h: d.h });
}

/* Leave a panel where it was dropped. The counterpart of dock(): it takes the
   panel out of whatever zone it was numbered into, so the zone it left closes
   up exactly as it does for any other move. */
function applyStick(key, f, w, pw, ph) {
  var stick = f.stick;
  if (!stick) return;
  var hh = Math.max(w.offsetHeight || 0, f.h || 30);
  var ww = Math.max(w.offsetWidth || 0, f.w || 80);
  if (stick === "bottom") { f.x = 0; f.y = Math.max(0, ph - hh); f.w = pw; f.h = hh; }
  else if (stick === "floors") { f.x = Math.max(0, pw - Math.max(ww, 160) - 88); f.y = 12; }
  else if (stick === "gizmo") { f.x = Math.max(0, pw - 90); f.y = 54; }
  else if (stick === "max") { f.x = Math.max(0, pw - 46); f.y = 12; }
  else if (stick === "tune") { f.x = Math.max(0, pw - 246); f.y = Math.max(0, ph - 320); }
  else if (stick === "entry") { f.x = 80; f.y = Math.max(0, ph - 90); }
  else if (stick === "trace") { f.x = 12; f.y = 12; }
  else if (stick === "hint") { f.x = Math.max(0, (pw - Math.max(ww, 200)) / 2); f.y = Math.max(0, ph - 80); }
}

function setFree(key, x, y, axis, box) {
  var p = panelState(key), from = p.zone;
  var prev = p.free || {};
  p.zone = FREE;
  p.axis = axis === "h" ? "h" : "v";
  p.free = {
    x: x, y: y,
    axis: p.axis,
    seeded: true,
  };
  var keepW = (box && box.w > 0) ? box.w : prev.w;
  var keepH = (box && box.h > 0) ? box.h : prev.h;
  if (keepW > 0) p.free.w = keepW;
  if (keepH > 0) p.free.h = keepH;
  if (ZONES.indexOf(from) >= 0) {
    members(from, false).forEach(function (k, i) { panelState(k).order = i; });
  }
  /* The layout document models the eight zones as nodes, and "nowhere" is not
     one of them — so a free position is this file's own state and lives in
     localStorage even when uikit is driving everything else. docZone remembers
     what the document last said about this panel, so the next sync can tell a
     stale re-read (leave it floating) from the user actually re-docking it in
     the designer (obey). */
  save();
  place();
}

/* Commit a panel to a zone. Everything else in that zone is renumbered, so
   `order` stays a dense 0..n-1 and index 0 always means "against the edge". */
function dock(key, zone, axis, flow, lead, box) {
  var zs = zoneState(zone);
  if (flow) zs.flow = flow;
  var p = panelState(key);
  if (axis === "h" || axis === "v") p.axis = axis;
  p.zone = zone;
  if (box && box.w > 0 && box.h > 0) {
    if (!p.free) p.free = {};
    p.free.w = box.w;
    p.free.h = box.h;
    if (p.axis) p.free.axis = p.axis;
  }
  var rest = members(zone, false).filter(function (k) { return k !== key; });
  rest.splice(lead === false ? rest.length : 0, 0, key);
  rest.forEach(function (k, i) { panelState(k).order = i; });
  /* One mutation point, two stores. Writing through the document is what puts
     a grip drag into the same undo history as everything else the user can
     rearrange; writeDock re-enters here through syncFromDoc, which is why the
     local state is settled BEFORE it is called. */
  if (!bridge.writeDock(key, zone, null, flow, lead)) save();
  place();
}

/* The document changed under us — an undo, a reset, or a reorder made from
   customize mode rather than from a grip. Take the new assignment and lay out
   again. Guarded against re-entry: place() can itself trigger a uikit render. */
var syncing = false;
export function syncFromDoc() {
  /* Not mid-gesture. A drag has already taken its panel out of every zone and
     is floating it under the pointer; re-reading the document would put it
     back in the zone it started from, halfway through being dragged out. */
  if (syncing || drag || !st || !bridge.active()) return;
  var next = bridge.readState();
  if (!next) return;
  syncing = true;
  try {
    adoptArrangement(next);
    place();
  } finally {
    syncing = false;
  }
}

/* ---- grip without a pointer ---- */

function flipAxis(key) {
  if (compact() || !isFree(key)) return;
  var f = freeState(key);
  f.axis = f.axis === "h" ? "v" : "h";
  panelState(key).axis = f.axis;
  f.seeded = true;
  save();
  place();
  if (grips[key]) grips[key].focus();
}

// Keyboard Enter still walks the eight dock positions; a pointer click does not.
function cycle(key) {
  if (!editingLayout()) return;
  if (compact()) return;
  if (isFree(key)) return flipAxis(key);
  var i = RING.indexOf(panelState(key).zone);
  var next = RING[(i + 1) % RING.length];
  dock(key, next, axisOf(key), null, false);
  if (grips[key]) grips[key].focus();
}
/* An arrow sends a docked panel to that edge. A free panel nudges by pixels
   instead — Alt+arrow still docks, so the keyboard path to a zone remains. */
function onKey(e) {
  if (!editingLayout()) return;
  var key = e.currentTarget.getAttribute("data-grip");
  if (compact() || !key) return;
  if (e.key === "r" || e.key === "R") {
    e.preventDefault();
    flipAxis(key);
    return;
  }
  var dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "bottom" }[e.key];
  if (!dir) return;
  e.preventDefault();
  if (isFree(key) && !e.altKey) {
    var f = freeState(key);
    var step = e.shiftKey ? 24 : 4;
    if (dir === "left") f.x -= step;
    else if (dir === "right") f.x += step;
    else if (dir === "top") f.y -= step;
    else f.y += step;
    f.seeded = true;
    save();
    place();
    return;
  }
  var list = EDGE_ZONES[dir], at = list.indexOf(panelState(key).zone);
  var next = list[at < 0 ? 0 : (at + 1) % list.length];
  dock(key, next, axisOf(key), null, false);
  if (grips[key]) grips[key].focus();
}

function panelLabels() {
  var out = {};
  PANELS.forEach(function (p) {
    var el = els[p.key];
    out[p.key] = (el && el.getAttribute("aria-label")) || p.key;
  });
  return out;
}

function label() {
  PANELS.forEach(function (p) {
    var g = grips[p.key], el = els[p.key];
    if (!g) return;
    var s = t("dock_grip");
    g.title = s;
    if (el && el.dataset && el.dataset.i18nAria) {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    }
    var name = el && el.getAttribute("aria-label");
    g.setAttribute("aria-label", name ? name + " — " + s : s);
  });
}

/* A panel the desktop layout has lent to its left panel (js/pro_left.js puts
   the layer rows in a Layers tab) is not the dock's to place while it is
   there: its card stays hidden, and the node comes back on its own. */
function lent(el) { return !!(el && el.closest && el.closest(".ps-left-pane")); }

function findEl(panel) {
  if (els[panel.key] && els[panel.key].isConnected) return els[panel.key];
  if (panel.id) {
    var byId = document.getElementById(panel.id);
    if (byId) return byId;
  }
  if (panel.sel && pane) {
    var found = pane.querySelector(panel.sel);
    if (found) return found;
  }
  return null;
}

function fillHandles(w, key) {
  ALL_HANDLES.forEach(function (h) {
    var rh = document.createElement("div");
    rh.className = "pt-rh pt-rh-" + h;
    rh.setAttribute("data-rh", h);
    rh.setAttribute("data-uikit-native-gesture", "");
    rh.setAttribute("data-panel", key);
    rh.style.cursor = CURSORS[h];
    rh.addEventListener("pointerdown", onSizeDown);
    rh.addEventListener("pointermove", onSizeMove);
    rh.addEventListener("pointerup", onSizeUp);
    rh.addEventListener("pointercancel", onSizeUp);
    w.appendChild(rh);
  });
}

function ensureWrap(p, el) {
  if (!el) return null;
  if (wraps[p.key]) {
    els[p.key] = el;
    if (el.parentNode !== wraps[p.key] && pane &&
        (el.parentElement === pane || el.parentElement === wraps[p.key] || el.parentElement === layer)) {
      if (!wraps[p.key].isConnected && el.parentNode) el.parentNode.insertBefore(wraps[p.key], el);
      wraps[p.key].appendChild(el);
    }
    return wraps[p.key];
  }
  els[p.key] = el;
  if (p.overlay && pane && isFree(p.key) && !freeState(p.key).seeded && !freeState(p.key).stick) {
    var pr = pane.getBoundingClientRect();
    var box = el.getBoundingClientRect();
    if (pr.width > 80 && pr.height > 80 && box.width >= 2 && box.height >= 2) {
      var f = freeState(p.key);
      f.x = box.left - pr.left;
      f.y = box.top - pr.top;
      f.w = box.width;
      f.h = box.height;
      f.seeded = true;
    }
  }
  var w = document.createElement("div");
  w.className = "pt-panel" + (p.overlay ? " pt-overlay" : "");
  w.setAttribute("data-panel", p.key);
  var g = document.createElement("button");
  g.type = "button";
  g.className = "pt-grip";
  g.setAttribute("data-grip", p.key);
  g.setAttribute("data-uikit-native-gesture", "");
  /* No data-tool and no data-act on purpose: js/mobile_shell.js builds the
     Tools sheet from exactly those attributes and js/tool_search.js indexes
     them, and a grip is neither a tool nor a command. It also sits in the
     WRAPPER rather than inside the panel, so the chips keep a clean
     role="radiogroup" and js/ui_layers.js can still wipe and rebuild the
     strip without taking the grip with it. */
  g.innerHTML = '<i class="ph ph-dots-six"></i>';
  g.addEventListener("pointerdown", onDown);
  g.addEventListener("pointermove", onMove);
  g.addEventListener("pointerup", onUp);
  g.addEventListener("pointercancel", onUp);
  g.addEventListener("keydown", onKey);
  g.addEventListener("click", function (ev) { if (ev.detail === 0) cycle(p.key); });
  w.appendChild(g);
  // Keep the live control connected while the pane changes mode. Layout can
  // defer placement when its width is temporarily zero; taking the control
  // into a detached wrapper here made floor navigation disappear meanwhile.
  if (el.parentNode) el.parentNode.insertBefore(w, el);
  w.appendChild(el);
  fillHandles(w, p.key);
  wraps[p.key] = w;
  grips[p.key] = g;
  return w;
}

function claimOverlays() {
  claimPanels(true);
}
function claimAll() {
  claimPanels(false);
}
function claimPanels(overlayOnly) {
  if (!pane) return;
  PANELS.forEach(function (p) {
    if (overlayOnly && !p.overlay) return;
    var el = findEl(p);
    if (!el) return;
    if (p.overlay) {
      if (el.hidden && !wraps[p.key]) return;
      if (pane && !pane.contains(el)) return;
    }
    ensureWrap(p, el);
  });
}

function onSizeDown(e) {
  if (!editingLayout()) return;
  if (compact() || (e.button != null && e.button > 0) || drag) return;
  var key = e.currentTarget.getAttribute("data-panel");
  var handle = e.currentTarget.getAttribute("data-rh");
  var w = wraps[key];
  if (!w || !shown(key)) return;
  e.preventDefault();
  e.stopPropagation();
  var r = w.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  /* Docked, the zone's flex box owns the size. Pull the panel out first so
     the handle is resizing the card, not fighting a stretch. */
  if (!isFree(key)) {
    setFree(key, r.left - pr.left, r.top - pr.top, axisOf(key), { w: r.width, h: r.height });
    w = wraps[key];
    if (!w) return;
    r = w.getBoundingClientRect();
    pr = pane.getBoundingClientRect();
  }
  if (!isFree(key)) return;
  sizing = {
    key: key, id: e.pointerId, handle: handle,
    start: { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height },
    px: e.clientX, py: e.clientY,
  };
  w.classList.add("pt-sizing");
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
}

function onSizeMove(e) {
  if (!sizing) return;
  var spec = specOf(sizing.key);
  var size = sizeFrom(sizing.start, sizing.handle, e.clientX - sizing.px, e.clientY - sizing.py, {
    minW: spec.minW || 48,
    minH: spec.minH || 28,
    maxW: pane.clientWidth,
    maxH: pane.clientHeight,
  });
  if (!size) return;
  var box = rectFrom(sizing.start, sizing.handle, size);
  var w = wraps[sizing.key];
  w.style.left = Math.round(box.x) + "px";
  w.style.top = Math.round(box.y) + "px";
  w.style.width = Math.round(box.w) + "px";
  w.style.height = Math.round(box.h) + "px";
  w.classList.add("pt-sized");
}

function onSizeUp() {
  if (!sizing) return;
  var s = sizing;
  var w = wraps[s.key];
  if (w) w.classList.remove("pt-sizing");
  sizing = null;
  if (!w) return;
  var f = freeState(s.key);
  delete f.stick;
  f.x = parseFloat(w.style.left);
  f.y = parseFloat(w.style.top);
  f.w = parseFloat(w.style.width);
  f.h = parseFloat(w.style.height);
  f.seeded = true;
  if (!isFinite(f.x) || !isFinite(f.y) || !isFinite(f.w) || !isFinite(f.h)) return;
  save();
  place();
}

export function initPlanToolsDock() {
  layer = document.getElementById("plan-tools");
  if (!layer || wraps.tools) return;
  pane = layer.parentElement;
  restore();

  if (!compact()) {
    PANELS.forEach(function (p) {
      if (p.overlay) return;
      var el = findEl(p);
      if (el) ensureWrap(p, el);
    });
    claimOverlays();
  }
  label();

  /* Hand the bridge the two things it cannot reach from outside this closure:
     the .pt-panel wrappers a zone actually contains, and the zone elements
     themselves. Registration is a no-op when uikit is not running. */
  bridge.attach({ wraps: wraps, zoneEls: zoneEls, labels: panelLabels(), sync: syncFromDoc });

  onLangChange(label);
  window.addEventListener("resize", relayout);
  window.addEventListener("mf-posture", relayout);
  if (window.ResizeObserver) {
    new ResizeObserver(relayout).observe(pane);
    new ResizeObserver(onResize).observe(layer);
  }
  // compact-nav is toggled on <body> by js/mobile_shell.js, and crossing it
  // hands the panels to (or takes them back from) the phone rail.
  new MutationObserver(relayout).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  new MutationObserver(function () {
    if (compact() || drag || sizing) return;
    claimOverlays();
    relayout();
  }).observe(pane, { childList: true });
  place();
}

// Move the existing controls, retaining their event bindings and dock layout.
export function movePlanToolsTo(id) {
  const next=document.getElementById(id);
  if(!next||!layer||next===pane)return;
  const previous=pane;
  pane=next;
  next.appendChild(layer);
  for(const key of ['cad','tune','entry','status','trace','hint']) {
    const spec=PANEL_BY_KEY[key];
    const node=spec?.id?document.getElementById(spec.id):null;
    const wrapper=node?.closest('.pt-panel');
    if(wrapper?.parentElement===previous)next.appendChild(wrapper);
    else if(node?.parentElement===previous)next.appendChild(node);
  }
  relayout();
}
