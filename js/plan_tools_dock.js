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

var PREFS = "home3d_plan_dock";
/* The top-trailing corner is shared by the view gizmo and the maximize button.
   They move down when a panel claims that corner; until one does, the top
   edge's centre zone stops short of them. */
var GIZMO_W = 100;
// how close to an existing group a drop counts as joining it rather than as
// claiming the edge behind it
var JOIN_PAD = 56;

var PANELS = [
  { key: "tools", id: "plan-toolbar" },
  { key: "layers", id: "layer-chips" },
  { key: "walls", id: "plan-wall-palette" },
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
    },
    zones: {},
  };
}
function zoneState(id) {
  var z = st.zones[id];
  if (!z) z = st.zones[id] = {};
  if (z.axis !== "h" && z.axis !== "v") z.axis = DEFAULT_AXIS[id];
  if (z.flow !== "row" && z.flow !== "column") z.flow = "row";
  return z;
}
function restore() {
  st = defaults();
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
      PANELS.forEach(function (panel) { st.panels[panel.key].zone = p.dock; });
      zoneState(p.dock);
    }
    return;
  }
  PANELS.forEach(function (panel) {
    var q = p.panels && p.panels[panel.key];
    if (!q) return;
    if (ZONES.indexOf(q.zone) >= 0) st.panels[panel.key].zone = q.zone;
    if (typeof q.order === "number" && isFinite(q.order)) st.panels[panel.key].order = q.order;
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
      if (st.panels[k].zone !== id || !els[k]) return false;
      if (drag && drag.key === k) return false; // a panel in the air is in no zone
      return !onlyShown || shown(k);
    })
    .sort(function (a, b) { return st.panels[a].order - st.panels[b].order; });
}
// Index 0 sits against the flush edge, so a zone flush right or bottom lays
// its panels out backwards.
function reversed(id, zs) {
  return zs.flow === "row"
    ? FLUSH[id].indexOf("right") >= 0
    : FLUSH[id].indexOf("bottom") >= 0;
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
function decorate(id, zs, vis) {
  var f = FLUSH[id], row = zs.flow === "row";
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
  PANELS.forEach(function (p) {
    var el = els[p.key];
    if (!el) return;
    el.removeAttribute("data-axis");
    el.classList.remove("pt-inner");
    layer.appendChild(el);
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
    z.setAttribute("data-flow", zs.flow);
    z.setAttribute("data-rev", reversed(id, zs) ? "1" : "0");
    var kids = all.map(function (k) {
      var w = wraps[k], el = els[k];
      /* A hidden panel keeps its place in the zone's DOM order — the wall
         palette comes and goes with the tool — but its wrapper has to go with
         it, or the grip alone leaves an 18px sliver of card behind. */
      w.hidden = !shown(k);
      w.setAttribute("data-axis", zs.axis);
      el.setAttribute("data-axis", zs.axis);
      el.classList.add("pt-inner");
      if (el.parentNode !== w) w.appendChild(el);
      return w;
    });
    if (!sameKids(z, kids)) kids.forEach(function (w) { z.appendChild(w); });
    var vis = members(id, true);
    decorate(id, zs, vis);
    z.hidden = vis.length === 0;
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
  var trh = boxes["top-right"] ? boxes["top-right"].h : 0;
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

function cap(z, w, h) {
  z.style.maxWidth = Math.round(w) + "px";
  z.style.maxHeight = Math.round(h) + "px";
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
  /* Dropped ON or beside a panel: join that panel's group. The pointer is over
     a thing, and the thing wins — otherwise stacking is unreachable wherever
     the two rules disagree, and they disagree exactly where it matters. A tall
     column centred on the left edge reaches into the bottom third of the pane,
     so "just under the tools" and "the bottom-left corner" are the same
     gesture until the group gets the first say. */
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
  if (best) return { zone: best.id, axis: zoneState(best.id).axis };

  var d = { left: px, right: pw - px, top: py, bottom: bottom - py };
  var edge = "left";
  ["right", "top", "bottom"].forEach(function (k) { if (d[k] < d[edge]) edge = k; });
  var horiz = edge === "top" || edge === "bottom";
  var along = horiz ? px / Math.max(1, pw) : py / Math.max(1, bottom);
  var end = along < 1 / 3 ? 1 : along > 2 / 3 ? 2 : 0;
  return { zone: EDGE_ZONES[edge][end], axis: horiz ? "h" : "v" };
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

/* Beside, or under? The drop decides both, from which way it went past what is
   already there — normalised by the group's own width and height, because "far
   to the right of a tall thin column" is a small number of pixels. */
function insertion(id, px, py) {
  var R = occupied(id);
  if (!R) return { flow: zoneState(id).flow, lead: true, rect: null };
  var nx = R.w ? (px - (R.x + R.w / 2)) / R.w : 0;
  var ny = R.h ? (py - (R.y + R.h / 2)) / R.h : 0;
  var flow = Math.abs(nx) >= Math.abs(ny) ? "row" : "column";
  var lead = flow === "row"
    ? FLUSH[id].indexOf("right") >= 0 ? nx > 0 : nx < 0
    : FLUSH[id].indexOf("bottom") >= 0 ? ny > 0 : ny < 0;
  return { flow: flow, lead: lead, rect: R };
}

// Where the panel would land: at the flush end of the group, or past its far
// end. A hint, not a promise — the panel may change shape as it lands.
function previewRect(target, ins, pw, ph) {
  var f = FLUSH[target.zone], w = drag.w, h = drag.h, R = ins.rect;
  var bottom = ph - statusH();
  if (!R) {
    return {
      x: f.indexOf("left") >= 0 ? 0 : f.indexOf("right") >= 0 ? pw - w : (pw - w) / 2,
      y: f.indexOf("top") >= 0 ? 0 : f.indexOf("bottom") >= 0 ? bottom - h : (bottom - h) / 2,
      w: w, h: h,
    };
  }
  if (ins.flow === "row") {
    var atEnd = f.indexOf("right") >= 0;
    return {
      x: ins.lead ? (atEnd ? R.r - w : R.x) : atEnd ? R.x - w : R.r,
      y: R.y, w: w, h: R.h,
    };
  }
  var atBottom = f.indexOf("bottom") >= 0;
  return {
    x: R.x,
    y: ins.lead ? (atBottom ? R.b - h : R.y) : atBottom ? R.y - h : R.b,
    w: R.w, h: h,
  };
}

/* ---- the drag ---- */

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
  drag = {
    key: key, id: e.pointerId, w: r.width, h: r.height,
    dx: e.clientX - r.left, dy: e.clientY - r.top,
    sx: e.clientX, sy: e.clientY, moved: false,
    target: { zone: st.panels[key].zone, axis: zoneState(st.panels[key].zone).axis },
    ins: { flow: zoneState(st.panels[key].zone).flow, lead: true, rect: null },
  };
  /* Fixed to the size it had while docked: out of the zone's flex box it would
     otherwise snap to its natural width and jump out from under the pointer. */
  w.style.width = r.width + "px";
  w.style.height = r.height + "px";
  // in the air it belongs to no group: a whole card, not a tiled piece of one
  w.removeAttribute("data-flush");
  w.removeAttribute("data-join");
  w.classList.add("pt-floating");
  layer.classList.add("pt-dragging");
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
  // preview the shape it will take, so the drop holds no surprises
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
  st.panels[key].zone = zone;
  var rest = members(zone, false).filter(function (k) { return k !== key; });
  rest.splice(lead === false ? rest.length : 0, 0, key);
  rest.forEach(function (k, i) { st.panels[k].order = i; });
  save();
  place();
}

/* ---- grip without a pointer ---- */

// One press = the next dock position, all the way round the eight.
function cycle(key) {
  if (compact()) return;
  var i = RING.indexOf(st.panels[key].zone);
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
  var list = EDGE_ZONES[dir], at = list.indexOf(st.panels[key].zone);
  var next = list[at < 0 ? 0 : (at + 1) % list.length];
  dock(key, next, dir === "top" || dir === "bottom" ? "h" : "v", null, false);
  if (grips[key]) grips[key].focus();
}

function label() {
  PANELS.forEach(function (p) {
    var g = grips[p.key], el = els[p.key];
    if (!g) return;
    var s = t("dock_grip");
    g.title = s;
    /* Three grips look alike and sit in three different panels, so the
       accessible name has to say which one this is. The panel's own label is
       the name the rest of the app already gives it. */
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
