import { sx, sz, rotatePx } from "./plan2d.js";

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
}

export function clearAgentPreview() {
  if (active && active.parentNode) active.parentNode.removeChild(active);
  active = null;
}

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
  clearAgentPreview();
  var host = document.getElementById("view-2d"), plan = document.getElementById("plan");
  if (!host || !plan || !spec) return { dispose: clearAgentPreview };
  var svg = svgEl("svg", {
    class: "agent-canvas-preview", viewBox: "0 0 " + Math.max(1, plan.clientWidth) + " " + Math.max(1, plan.clientHeight),
    "aria-hidden": "true",
  });
  appendPreview(svg, spec);
  if (!svg.childNodes.length) return { dispose: clearAgentPreview };
  host.appendChild(svg); active = svg;
  return { dispose: clearAgentPreview };
}
