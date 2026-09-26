import { sx, sz, rotatePx, onAfterRender } from "./plan2d.js";
import { S } from "./state.js";
import { requestRender } from "./view3d.js";
import { footprint } from "./layout_analysis.js";
import { wallGeom } from "./geometry.js";

var active = null;

function point(value) {
  var p = rotatePx(sx(value.x), sz(value.z));
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}
function svgEl(name, attrs) {
  var node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
  return node;
}
function polygonPoints(points) {
  return points.map(function (entry) { var p = point(entry); return p.x + "," + p.y; }).join(" ");
}
function appendItemPreview(svg, spec, extraClass) {
  var c = spec.center, hw = Number(spec.width || 0) / 2, hd = Number(spec.depth || 0) / 2;
  var angle = Number(spec.rotation || 0) * Math.PI / 180, ca = Math.cos(angle), sa = Math.sin(angle);
  var corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function (entry) {
    return { x: c.x + entry[0] * ca - entry[1] * sa, z: c.z + entry[0] * sa + entry[1] * ca };
  });
  svg.appendChild(svgEl("polygon", { points: polygonPoints(corners), class: "agent-preview-shape agent-preview-item" + (extraClass ? " " + extraClass : "") }));
  if (extraClass && extraClass.indexOf("destination") !== -1) {
    var front = [
      { x: c.x + hw * ca - hd * sa, z: c.z + hw * sa + hd * ca },
      { x: c.x + -hw * ca - hd * sa, z: c.z + -hw * sa + hd * ca },
    ];
    var a = point(front[0]), b = point(front[1]);
    svg.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "agent-preview-shape agent-preview-front" }));
  }
}

export function clearAgentPreview() {
  if (active && active.parentNode) active.parentNode.removeChild(active);
  active = null;
  if (shown3D) { shown3D = null; requestRender(); }
}
onAfterRender(function () { refreshAgentPreview(); });

function appendPreview(svg, spec) {
  if (!spec) return;
  if (spec.kind === "batch" && Array.isArray(spec.previews)) {
    spec.previews.forEach(function(entry) { appendPreview(svg, entry); });
  } else if (spec.kind === "wall" && spec.from && spec.to) {
    var a = point(spec.from), b = point(spec.to);
    svg.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "agent-preview-shape agent-preview-wall" }));
  } else if (spec.kind === "room" && Array.isArray(spec.outline)) {
    svg.appendChild(svgEl("polygon", { points: polygonPoints(spec.outline), class: "agent-preview-shape agent-preview-room" }));
  } else if (spec.kind === "item" && spec.center) {
    appendItemPreview(svg, spec);
  } else if (spec.kind === "item-move" && spec.center) {
    if (spec.from) appendItemPreview(svg, Object.assign({}, spec, { center: spec.from }), "agent-preview-origin");
    appendItemPreview(svg, spec, "agent-preview-destination");
    if (spec.from) {
      var origin = point(spec.from), destination = point(spec.center);
      svg.appendChild(svgEl("line", { x1: origin.x, y1: origin.y, x2: destination.x, y2: destination.y,
        class: "agent-preview-shape agent-preview-motion" }));
    }
  } else if (spec.kind === "items" && Array.isArray(spec.items)) {
    spec.items.forEach(function(item) { if (item && item.center) appendItemPreview(svg, item); });
  } else if (spec.kind === "opening" && spec.center) {
    var center = point(spec.center);
    svg.appendChild(svgEl("circle", { cx: center.x, cy: center.y, r: 13, class: "agent-preview-shape agent-preview-opening" }));
    svg.appendChild(svgEl("line", { x1: center.x - 18, y1: center.y, x2: center.x + 18, y2: center.y, class: "agent-preview-shape" }));
  }
}

export function renderAgentPreview(spec) {
  return renderAgentCandidates([{ spec: spec, tags: [] }], 0);
}

/* A name tag pinned to a plan point: "A · Sofa F12 → Living room". Width is
   measured once the svg is in the document, so the pill fits the text. */
function appendTag(svg, tag) {
  if (!tag || !tag.at || !tag.text) return;
  var p = point(tag.at);
  var g = svgEl("g", { class: "agent-tag" + (tag.tone ? " agent-tag-" + tag.tone : ""), transform: "translate(" + p.x + "," + (p.y - 16) + ")" });
  var rect = svgEl("rect", { x: 0, y: -11, height: 22, rx: 11, ry: 11, class: "agent-tag-bg" });
  var text = svgEl("text", { x: 0, y: 4, "text-anchor": "middle", class: "agent-tag-text" });
  text.textContent = tag.text;
  g.appendChild(rect);
  g.appendChild(text);
  svg.appendChild(g);
}
function sizeTags(svg) {
  svg.querySelectorAll(".agent-tag").forEach(function (g) {
    var text = g.querySelector("text"), rect = g.querySelector("rect"), w = 0;
    try { w = text.getComputedTextLength(); } catch (_) { w = 0; }
    if (!(w > 0)) w = text.textContent.length * 6.4;
    rect.setAttribute("x", String(-w / 2 - 9));
    rect.setAttribute("width", String(w + 18));
  });
}

/* Every lettered candidate at once, so they can be compared side by side: the
   focused one solid, the others dimmed, each with its tags. The plan repaints
   on pan and zoom, so the last set is redrawn after every render. */
var lastSet = null;
export function renderAgentCandidates(list, focus) {
  clearAgentPreview();
  lastSet = { list: list, focus: focus };
  // The same set is drawn in the 3D view (paint3D below), which works with or
  // without the plan pane on screen.
  shown3D = list && list.length ? lastSet : null;
  requestRender();
  var host = document.getElementById("view-2d"), plan = document.getElementById("plan");
  if (!host || !plan || !list || !list.length) return { dispose: clearAgentPreview };
  var svg = svgEl("svg", {
    class: "agent-canvas-preview", viewBox: "0 0 " + Math.max(1, plan.clientWidth) + " " + Math.max(1, plan.clientHeight),
    "aria-hidden": "true",
  });
  // dimmed candidates first, so the focused one draws on top
  list.map(function (entry, i) { return i; }).sort(function (a, b) { return (a === focus) - (b === focus); }).forEach(function (i) {
    var entry = list[i];
    var g = svgEl("g", { class: "agent-candidate" + (list.length > 1 ? (i === focus ? " agent-candidate-focus" : " agent-candidate-dim") : "") });
    appendPreview(g, entry.spec);
    (entry.tags || []).forEach(function (tag) { appendTag(g, tag); });
    if (g.childNodes.length) svg.appendChild(g);
  });
  if (!svg.childNodes.length) return { dispose: clearAgentPreview };
  host.appendChild(svg); active = svg;
  sizeTags(svg);
  return { dispose: clearAgentPreview };
}
export function refreshAgentPreview() {
  if (!active || !lastSet) return;
  var set = lastSet;
  renderAgentCandidates(set.list, set.focus);
}

/* ---- 3D ----------------------------------------------------------------

   The same candidates and tags in the 3D view, so a proposal can be judged in
   3D as well as on the plan: each piece as a box at its real height (walls as
   a ghost wall, openings as a frame, rooms as a floor outline), the focused
   candidate solid and the others faint, the same "A · Sofa F8" tag on top.
   Drawn on the planner's 3D overlay canvas (js/planner_3d.js fires
   planner-overlay-3d after every 3D frame with its projector), so nothing is
   added to the scene and nothing can be picked, saved or exported by mistake. */
var shown3D = null;
var WALL_H = 270;
function cssVar(name, fallback) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
  catch (_) { return fallback; }
}
function itemHeight(spec) {
  if (spec.height > 0) return Number(spec.height);
  var id = spec.itemId != null ? spec.itemId : spec.sourceId;
  var it = id != null && (S.items || []).find(function (entry) { return String(entry.id) === String(id); });
  return it && it.h > 0 ? Number(it.h) : 80;
}
function itemElev(spec) {
  var id = spec.itemId != null ? spec.itemId : spec.sourceId;
  var it = id != null && (S.items || []).find(function (entry) { return String(entry.id) === String(id); });
  return it && it.elev > 0 ? Number(it.elev) : 0;
}
function box3D(o, spec, center, color, dashed) {
  var base = footprint({ x: Number(center.x), z: Number(center.z), w: Number(spec.width) || 0, d: Number(spec.depth) || 0, rot: Number(spec.rotation) || 0 });
  var lo = itemElev(spec), hi = lo + itemHeight(spec);
  var bottom = base.map(function (p) { return { x: p.x, y: lo + 1, z: p.z }; });
  var top = base.map(function (p) { return { x: p.x, y: hi, z: p.z }; });
  var c = o.context;
  c.save();
  if (dashed) c.setLineDash([6, 5]);
  o.path(bottom, color, true);
  o.path(top, color, true);
  for (var i = 0; i < 4; i++) o.path([bottom[i], top[i]], color);
  // a faint lid so the box reads as a volume, not a wire cage
  var ps = top.map(o.project);
  if (!dashed && ps.every(Boolean)) {
    c.globalAlpha *= 0.18;
    c.fillStyle = color;
    c.beginPath();
    ps.forEach(function (q, j) { if (j) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); });
    c.closePath();
    c.fill();
  }
  c.restore();
  return hi;
}
function spec3D(o, spec, color) {
  if (!spec) return;
  if (spec.kind === "batch" && Array.isArray(spec.previews)) spec.previews.forEach(function (entry) { spec3D(o, entry, color); });
  else if (spec.kind === "item" && spec.center) box3D(o, spec, spec.center, color);
  else if (spec.kind === "item-move" && spec.center) {
    if (spec.from) {
      box3D(o, spec, spec.from, color, true);
      o.path([{ x: spec.from.x, y: 2, z: spec.from.z }, { x: spec.center.x, y: 2, z: spec.center.z }], color);
    }
    box3D(o, spec, spec.center, color);
  } else if (spec.kind === "items" && Array.isArray(spec.items)) spec.items.forEach(function (item) { if (item && item.center) box3D(o, item, item.center, color); });
  else if (spec.kind === "wall" && spec.from && spec.to) {
    var h = Number(spec.height) > 0 ? Number(spec.height) : WALL_H;
    var a = spec.from, b = spec.to;
    o.path([{ x: a.x, y: 2, z: a.z }, { x: b.x, y: 2, z: b.z }, { x: b.x, y: h, z: b.z }, { x: a.x, y: h, z: a.z }], color, true);
  } else if (spec.kind === "opening" && spec.center) {
    // An upright frame in the plane of its host wall.
    var half = (Number(spec.width) || 90) / 2, oh = Number(spec.height) || 210, sill = Number(spec.sill) || 0;
    var wall = (S.walls || []).find(function (w) { return String(w.id) === String(spec.wallId); });
    var g = wall && wallGeom(wall), tx = 1, tz = 0;
    if (g && g.L > 0) { tx = (g.b.x - g.a.x) / g.L; tz = (g.b.z - g.a.z) / g.L; }
    var cx = Number(spec.center.x), cz = Number(spec.center.z);
    var l = { x: cx - tx * half, z: cz - tz * half }, r = { x: cx + tx * half, z: cz + tz * half };
    o.path([{ x: l.x, y: sill + 2, z: l.z }, { x: r.x, y: sill + 2, z: r.z }, { x: r.x, y: sill + oh, z: r.z }, { x: l.x, y: sill + oh, z: l.z }], color, true);
  } else if (spec.kind === "room" && Array.isArray(spec.outline)) {
    o.path(spec.outline.map(function (p) { return { x: p.x, y: 2, z: p.z }; }), color, true);
  }
}
function tagHeight(entry) {
  var spec = entry.spec || {};
  if (spec.kind === "item" || spec.kind === "item-move") return itemElev(spec) + itemHeight(spec) + 12;
  if (spec.kind === "items" && spec.items && spec.items[0]) return itemElev(spec.items[0]) + itemHeight(spec.items[0]) + 12;
  if (spec.kind === "wall") return (Number(spec.height) || WALL_H) + 12;
  if (spec.kind === "opening") return (Number(spec.height) || 210) + 12;
  return 20;
}
function paint3D(e) {
  var o = e && e.detail;
  if (!shown3D || !o || !o.context || !o.project) return;
  var accent = cssVar("--accent", "#5b8cff"), warn = cssVar("--warn", "#e0a030");
  var list = shown3D.list, focus = shown3D.focus, c = o.context;
  // faint candidates first, so the focused one draws on top
  list.map(function (entry, i) { return i; }).sort(function (a, b) { return (a === focus) - (b === focus); }).forEach(function (i) {
    var entry = list[i], dim = list.length > 1 && i !== focus;
    var warned = (entry.tags || []).some(function (tag) { return tag.tone === "warn"; });
    c.save();
    c.globalAlpha = dim ? 0.35 : 1;
    spec3D(o, entry.spec, warned && !dim ? warn : accent);
    var y = tagHeight(entry);
    (entry.tags || []).forEach(function (tag) {
      if (tag.at && tag.text) o.label({ x: tag.at.x, y: y, z: tag.at.z }, tag.text);
    });
    c.restore();
  });
}
if (typeof window !== "undefined") window.addEventListener("planner-overlay-3d", paint3D);
