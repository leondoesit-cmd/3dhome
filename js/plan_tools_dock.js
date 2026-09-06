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

var PREFS = "home3d_plan_dock";
/* The top-trailing corner is shared by the view gizmo and the maximize button.
   They move down when a panel claims that corner; until one does, the top
   edge's centre zone stops short of them. */
var GIZMO_W = 100;
// how close to an existing group a drop counts as joining it rather than as
// claiming the edge behind it
var JOIN_PAD = 72;

var PANELS = [
  { key: "tools", id: "plan-toolbar" },
  { key: "layers", id: "layer-chips" },
  { key: "walls", id: "plan-wall-palette" },
  { key: "rooms", id: "plan-room-palette" },
  { key: "status", id: "plan-tool-status" },
];
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
var layer = null, pane = null;
var els = {}, wraps = {}, grips = {}, zoneEls = {}, dropEl = null;
var drag = null, pending = false, lastSig = "";

function clamp(lo, v, hi) {
  return hi < lo ? lo : v < lo ? lo : v > hi ? hi : v;
}

/* ---- state ---- */

function defaults() {
  return {
    // the pre-dock arrangement: all three against the left edge, side by side
    panels: {
      tools: { zone: "left", order: 0 },
      layers: { zone: "left", order: 1 },
      walls: { zone: "left", order: 2 },
      rooms: { zone: "left", order: 3 },
      status: { zone: "top", order: 0 },
    },
    zones: {},
  };
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
  if (!p) p = st.panels[key] = defaults().panels[key] || { zone: "left", order: PANELS.length };
  return p;
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
    if (q) st.panels[panel.key] = Object.assign(panelState(panel.key), q);
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
function restore() {
  st = defaults();
  var fromDoc = bridge.active() ? bridge.readState() : null;
  if (fromDoc) {
    adoptArrangement(fromDoc);
    return;
  }
  var p;
  try {
    p = JSON.parse(localStorage.getItem(PREFS) || "null");
  } catch (err) {
    p = null; /* a corrupt store just means the default arrangement */
  }
  if (!p) return;
  /* The first version of this file docked the cluster as a whole and stored
     {dock, pos}. Read it as "all three panels on that edge" rather than
     throwing away the one choice the user had already made. */
  if (typeof p.dock === "string") {
    if (ZONES.indexOf(p.dock) >= 0) {
      PANELS.forEach(function (panel) { panelState(panel.key).zone = p.dock; });
      zoneState(p.dock);
    }
    return;
  }
  PANELS.forEach(function (panel) {
    var q = p.panels && p.panels[panel.key];
    if (!q) return;
    if (ZONES.indexOf(q.zone) >= 0) panelState(panel.key).zone = q.zone;
    if (typeof q.order === "number" && isFinite(q.order)) panelState(panel.key).order = q.order;
  });
  ZONES.forEach(function (id) {
    var q = p.zones && p.zones[id];
    if (!q) return;
    var z = zoneState(id);
    if (q.axis === "h" || q.axis === "v") z.axis = q.axis;
    if (q.flow === "row" || q.flow === "column") z.flow = q.flow;
  });
}
function save() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ panels: st.panels, zones: st.zones }));
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
  return p;
}
// The phone rail owns these panels below 1024px, the compact shell owns them at
// any width (there #plan-toolbar and the palette are display:none and only the
// chips show), and a pane too small to dock in owns them however wide the
// window is.
function compact() {
  return window.innerWidth <= 1024 || document.body.classList.contains("compact-nav") || posture() === "tiny";
}
function statusH() {
  var bar = document.getElementById("cad-status");
  return bar && bar.offsetParent ? bar.offsetHeight : 0;
}
// `hidden` is exactly how js/ui.js toggles the wall palette, so it is also the
// only visibility question this module has to ask.
function shown(key) {
  return !!els[key] && !els[key].hidden;
}
function members(id, onlyShown) {
  return PANELS.map(function (p) { return p.key; })
    .filter(function (k) {
      if (panelState(k).zone !== id || !els[k]) return false;
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
  if (zs.axis === "h") {
    var totalW = 0;
    vis.forEach(function (k) { totalW += natural(k, "h").w; });
    if (zs.flow === "row" && totalW > w) return "column";
    return zs.flow;
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
  if (!layer.classList.contains("pt-dock")) return;
  layer.classList.remove("pt-dock");
  /* Before anything is reparented. Unregistering the slots makes uikit skip
     the eight zone containers on its next pass, which releases the wrappers it
     was holding — if it still held them while this function moved the panels
     out of them, the next render would put them straight back. */
  bridge.unregisterZones();
  PANELS.forEach(function (p) {
    var el = els[p.key];
    if (!el) return;
    el.removeAttribute("data-axis");
    el.classList.remove("pt-inner");
    if (p.key !== "status") {
      layer.appendChild(el);
    } else {
      pane.appendChild(el);
    }
    var w = wraps[p.key];
    if (!w) return;
    ["data-flush", "data-join", "data-give"].forEach(function (a) { w.removeAttribute(a); });
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
  ensureDom();
  layer.classList.add("pt-dock");

  var pw = pane.clientWidth, ph = pane.clientHeight;
  if (!pw || !ph) return;
  var bottom = ph - statusH(); // the usable bottom: #cad-status owns the strip below it

  // 1. every panel into its zone, in order, with the zone's axis on it
  ZONES.forEach(function (id) {
    var z = zoneEls[id], zs = zoneState(id), all = members(id, false);
    var kids = all.map(function (k) {
      var w = wraps[k], el = els[k];
      /* A hidden panel keeps its place in the zone's DOM order — the wall
         palette comes and goes with the tool — but its wrapper has to go with
         it, or the grip alone leaves an 18px sliver of card behind.
         Two owners, one write: the app hides a panel whose tool is not active,
         and the layout hides one the user put away. Either is enough. */
      w.hidden = !shown(k) || bridge.hiddenInDoc(k);
      w.setAttribute("data-axis", zs.axis);
      el.setAttribute("data-axis", zs.axis);
      el.classList.add("pt-inner");
      if (el.parentNode !== w) w.appendChild(el);
      return w;
    });
    if (!sameKids(z, kids)) kids.forEach(function (w) { z.appendChild(w); });
    var vis = members(id, true);
    z.hidden = vis.length === 0;
    var flow = fitFlow(z, zs, vis, pw, bottom);
    z.setAttribute("data-flow", flow);
    z.setAttribute("data-rev", reversed(id, flow) ? "1" : "0");
    decorate(id, flow, vis);
  });
  if (drag) {
    var dw = wraps[drag.key];
    if (dw.parentNode !== layer) layer.appendChild(dw);
  }

  // 2. natural sizes, capped only by the pane
  var nat = {};
  ZONES.forEach(function (id) {
    cap(zoneEls[id], pw, bottom);
    nat[id] = { w: zoneEls[id].offsetWidth, h: zoneEls[id].offsetHeight };
  });

  /* 3. real caps. A centre zone may not run into the corner zones it shares an
        edge with — capped there, two zones that grow towards each other end up
        flush instead of overlapping, which is the whole promise of docking. */
  var trFree = members("top-right", true).length === 0 ? GIZMO_W : 0;
  var span = {
    top: { l: nat["top-left"].w, r: pw - Math.max(nat["top-right"].w, trFree) },
    bottom: { l: nat["bottom-left"].w, r: pw - nat["bottom-right"].w },
    left: { t: nat["top-left"].h, b: bottom - nat["bottom-left"].h },
    right: { t: nat["top-right"].h, b: bottom - nat["bottom-right"].h },
  };
  cap(zoneEls.top, Math.max(120, span.top.r - span.top.l), bottom);
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
    if (f.indexOf("top") >= 0) y = 0;
    else if (f.indexOf("bottom") >= 0) y = bottom - h;
    else {
      var sy = span[id];
      y = clamp(sy.t, sy.t + (sy.b - sy.t - h) / 2, Math.max(sy.t, sy.b - h));
    }
    z.style.left = Math.round(x) + "px";
    z.style.top = Math.round(y) + "px";
    boxes[id] = { x: x, y: y, w: w, h: h };
  });

  /* 5. the two floating controls that were here first. The gizmo and the
        maximize button sit in the top-trailing corner; when a panel takes that
        corner they move below it rather than under it. The active-tool hint
        floats at the bottom, where the bottom zones now are. */
  var trh = 0;
  ["top-right", "top", "top-left"].forEach(function (id) {
    var b = boxes[id];
    if (b && (id === "top-right" || b.x + b.w > pw - 120)) {
      trh = Math.max(trh, b.h);
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
  return ZONES.map(function (id) {
    var z = zoneEls[id];
    return z ? z.offsetWidth + "x" + z.offsetHeight : "";
  }).join("|");
}

function relayout() {
  if (pending || drag) return;
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
  if (drag || !layer.classList.contains("pt-dock")) return relayout();
  if (sig() === lastSig) return;
  relayout();
}

/* ---- picking a target while dragging ---- */

function targetFor(px, py, pw, ph) {
  var bottom = ph - statusH();
  var d = { left: px, right: pw - px, top: py, bottom: bottom - py };
  var edge = "left";
  ["right", "top", "bottom"].forEach(function (k) { if (d[k] < d[edge]) edge = k; });
  var horiz = edge === "top" || edge === "bottom";
  var wantAxis = horiz ? "h" : "v";

  /* Dropped ON or beside a panel: join that panel's group only if its axis
     matches the edge being dropped on. An existing vertical column on the left edge
     must NEVER hijack a drop heading for the top edge and rotate itself horizontal. */
  var best = null;
  ZONES.forEach(function (id) {
    var R = occupied(id);
    if (!R) return;
    var zs = zoneState(id);
    if (zs.axis !== wantAxis) return;
    var near = Math.max(
      px < R.x ? R.x - px : px > R.r ? px - R.r : 0,
      py < R.y ? R.y - py : py > R.b ? py - R.b : 0,
    );
    if (near <= JOIN_PAD && (!best || near < best.d)) best = { id: id, d: near };
  });
  if (best) return { zone: best.id, axis: wantAxis };

  var along = horiz ? px / Math.max(1, pw) : py / Math.max(1, bottom);
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

/* Where the panel lands, at the size it will BE there — measured in the target
   axis, sized across the flow to the group it is joining, and stacked instead
   of tiled when tiling would not fit the pane. The drop is the one moment the
   user is choosing between arrangements, so the box has to be the arrangement
   rather than an outline of the thing they happen to be holding. */
function previewRect(target, ins, pw, ph) {
  var f = FLUSH[target.zone], R = ins.rect;
  var size = natural(drag.key, target.axis);
  var w = Math.min(size.w, pw), h = size.h;
  var bottom = ph - statusH();
  if (!R) {
    return {
      x: f.indexOf("left") >= 0 ? 0 : f.indexOf("right") >= 0 ? pw - w : (pw - w) / 2,
      y: f.indexOf("top") >= 0 ? 0 : f.indexOf("bottom") >= 0 ? bottom - h : (bottom - h) / 2,
      w: w, h: h,
    };
  }
  /* fitFlow() will stack a row that does not fit; the preview says so first,
     rather than promising a slot beside the group and delivering one under it */
  var flow = ins.flow;
  if (flow === "row" && R.w + w > pw) {
    flow = "column";
    ins.flow = "column";
  }
  if (flow === "row") {
    var atEnd = f.indexOf("right") >= 0;
    return {
      x: ins.lead ? (atEnd ? R.r - w : R.x) : atEnd ? R.x - w : R.r,
      y: R.y, w: w, h: Math.max(R.h, h),
    };
  }
  var atBottom = f.indexOf("bottom") >= 0;
  return {
    x: R.x,
    y: ins.lead ? (atBottom ? R.b - h : R.y) : atBottom ? R.y - h : R.b,
    w: Math.max(R.w, w), h: h,
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

function onDown(e) {
  if (compact() || (e.button != null && e.button > 0)) return;
  var key = e.currentTarget.getAttribute("data-grip");
  var w = wraps[key];
  if (!w || !shown(key)) return;
  var r = w.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  var axis = zoneState(panelState(key).zone).axis;
  drag = {
    key: key, id: e.pointerId,
    dx: e.clientX - r.left, dy: e.clientY - r.top,
    sx: e.clientX, sy: e.clientY, moved: false,
    axis: axis, sizes: {},
    target: { zone: panelState(key).zone, axis: axis },
    ins: { flow: zoneState(panelState(key).zone).flow, lead: true, rect: null },
  };
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
  var nat = natural(key, axis);
  drag.w = nat.w;
  drag.h = nat.h;
  drag.dx = Math.min(drag.dx, Math.max(8, nat.w - 8));
  drag.dy = Math.min(drag.dy, Math.max(8, nat.h - 8));
  w.style.width = nat.w + "px";
  w.style.height = nat.h + "px";
  place(); // the zone it left closes up behind it, immediately
  floatAt(r.left - pr.left, r.top - pr.top);
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
}

function onMove(e) {
  if (!drag) return;
  if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
  var pr = pane.getBoundingClientRect();
  var px = e.clientX - pr.left, py = e.clientY - pr.top;
  var pw = pane.clientWidth, ph = pane.clientHeight;
  floatAt(clamp(-drag.w / 2, px - drag.dx, pw - drag.w / 2), clamp(0, py - drag.dy, ph - 20));
  if (!drag.moved) return;

  /* The POINTER picks the zone, never the floating panel's own box: a panel
     laid out along an edge is nearly as wide as the pane, so its centre can
     never come close enough to a side edge to choose it. */
  var target = targetFor(clamp(0, px, pw), clamp(0, py, ph), pw, ph);
  var ins = insertion(target.zone, px, py);
  drag.target = target;
  drag.ins = ins;
  /* The card in the air takes the shape it is heading for: a tool column
     dragged to the top edge becomes a tool row before it is dropped, so the
     drop holds no surprises. */
  if (target.axis !== drag.axis) {
    var size = natural(drag.key, target.axis);
    drag.axis = target.axis;
    drag.w = size.w;
    drag.h = size.h;
    drag.dx = Math.min(drag.dx, Math.max(8, size.w - 8));
    drag.dy = Math.min(drag.dy, Math.max(8, size.h - 8));
    wraps[drag.key].style.width = size.w + "px";
    wraps[drag.key].style.height = size.h + "px";
  }
  wraps[drag.key].setAttribute("data-axis", target.axis);
  els[drag.key].setAttribute("data-axis", target.axis);
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
  w.classList.remove("pt-floating");
  w.style.removeProperty("left");
  w.style.removeProperty("top");
  w.style.removeProperty("width");
  w.style.removeProperty("height");
  layer.classList.remove("pt-dragging");
  if (dropEl) dropEl.hidden = true;
  try { grips[d.key].releasePointerCapture(d.id); } catch (err) {}
  drag = null;
  if (!d.moved) return cycle(d.key); // a click on the grip, not a drag
  dock(d.key, d.target.zone, d.target.axis, d.ins.flow, d.ins.lead);
}

/* Commit a panel to a zone. Everything else in that zone is renumbered, so
   `order` stays a dense 0..n-1 and index 0 always means "against the edge". */
function dock(key, zone, axis, flow, lead) {
  var zs = zoneState(zone);
  if (axis) zs.axis = axis;
  if (flow) zs.flow = flow;
  panelState(key).zone = zone;
  var rest = members(zone, false).filter(function (k) { return k !== key; });
  rest.splice(lead === false ? rest.length : 0, 0, key);
  rest.forEach(function (k, i) { panelState(k).order = i; });
  /* One mutation point, two stores. Writing through the document is what puts
     a grip drag into the same undo history as everything else the user can
     rearrange; writeDock re-enters here through syncFromDoc, which is why the
     local state is settled BEFORE it is called. */
  if (!bridge.writeDock(key, zone, axis, flow, lead)) save();
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

// One press = the next dock position, all the way round the eight.
function cycle(key) {
  if (compact()) return;
  var i = RING.indexOf(panelState(key).zone);
  var next = RING[(i + 1) % RING.length];
  dock(key, next, DEFAULT_AXIS[next], null, false);
  if (grips[key]) grips[key].focus();
}
/* An arrow sends the panel to that edge; pressing the same arrow again walks
   it along that edge, centre → start → end, which is how the corners are
   reachable from the keyboard. */
function onKey(e) {
  var dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "bottom" }[e.key];
  if (!dir || compact()) return;
  e.preventDefault();
  var key = e.currentTarget.getAttribute("data-grip");
  var list = EDGE_ZONES[dir], at = list.indexOf(panelState(key).zone);
  var next = list[at < 0 ? 0 : (at + 1) % list.length];
  dock(key, next, dir === "top" || dir === "bottom" ? "h" : "v", null, false);
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

export function initPlanToolsDock() {
  layer = document.getElementById("plan-tools");
  if (!layer || wraps.tools) return;
  pane = layer.parentElement;
  restore();

  PANELS.forEach(function (p) {
    var el = document.getElementById(p.id);
    if (!el) return;
    els[p.key] = el;
    var w = document.createElement("div");
    w.className = "pt-panel";
    w.setAttribute("data-panel", p.key);
    var g = document.createElement("button");
    g.type = "button";
    g.className = "pt-grip";
    g.setAttribute("data-grip", p.key);
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
    // detail 0 is a keyboard-activated click; the pointer path already ran
    g.addEventListener("click", function (ev) { if (ev.detail === 0) cycle(p.key); });
    w.appendChild(g);
    wraps[p.key] = w;
    grips[p.key] = g;
  });
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
  place();
}
