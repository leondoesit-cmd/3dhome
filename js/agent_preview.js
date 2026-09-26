import { sx, sz, rotatePx, onAfterRender } from "./plan2d.js";

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

/* A name tag pinned to a plan point: "A · Sofa #12 → Living room". Width is
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
