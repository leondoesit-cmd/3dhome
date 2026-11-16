/* Room stamps out from under MEP device badges.

   With services as the work set, the plan shows every device as a badge, and
   one standing on a room's centroid printed over the room's name and area
   (drawRoomLabels, js/plan2d/room_labels.js). There the badges are obstacles
   for the stamp: it takes the nearest free slot inside its room, and when the
   room has none it keeps its spot and is drawn faint so the badge reads. Any
   other work set places stamps exactly as before (mepStampObstacles answers
   null). Boxes are true-screen pixels, centred: { x, y, w, h }. */
import { ensureMEP, nodeKindDef } from "../mep.js";
import { nodePos, withNodePosMemo } from "../mep/topology.js";
import { isLayerVisible } from "../layers.js";
import { rotatePx, sx, sz } from "../plan_view.js";
import { S } from "../state.js";

export var STAMP_FAINT = 0.35; // a stamp left under a badge

// Screen offsets a stamp may move by, nearest first: rings 6 px apart out to
// 96 px, each starting straight up. Built once.
export var STAMP_OFFSETS = (function () {
  var out = [[0, 0]];
  for (var r = 6; r <= 96; r += 6) {
    var n = Math.max(8, Math.round((2 * Math.PI * r) / 10));
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
      out.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
    }
  }
  return out;
})();

function hits(b, dx, dy, obstacles) {
  var x = b.x + dx, y = b.y + dy;
  for (var i = 0; i < obstacles.length; i++) {
    var o = obstacles[i];
    if (Math.abs(x - o.x) < (b.w + o.w) / 2 + 2 && Math.abs(y - o.y) < (b.h + o.h) / 2 + 2) return true;
  }
  return false;
}
// even-odd point-in-polygon over [{ x, y }] screen points
export function insidePoly(x, y, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function boxInside(b, dx, dy, poly) {
  var x0 = b.x + dx - b.w / 2, x1 = b.x + dx + b.w / 2, y0 = b.y + dy - b.h / 2, y1 = b.y + dy + b.h / 2;
  return insidePoly(x0, y0, poly) && insidePoly(x1, y0, poly) && insidePoly(x0, y1, poly) && insidePoly(x1, y1, poly);
}

/* Where a stamp (its pills, `boxes`) goes: [dx, dy] screen pixels to move it
   by — [0, 0] when nothing covers it — or null when every slot inside the
   room's screen polygon `poly` is taken (keep the spot, draw it faint). */
export function stampSlot(boxes, obstacles, poly, offsets) {
  offsets = offsets || STAMP_OFFSETS;
  var clear = function (dx, dy) {
    for (var i = 0; i < boxes.length; i++) if (hits(boxes[i], dx, dy, obstacles)) return false;
    return true;
  };
  if (!obstacles || !obstacles.length || clear(0, 0)) return [0, 0];
  for (var k = 1; k < offsets.length; k++) {
    var dx = offsets[k][0], dy = offsets[k][1];
    if (!clear(dx, dy)) continue;
    var inside = true;
    for (var j = 0; j < boxes.length && inside; j++) inside = boxInside(boxes[j], dx, dy, poly);
    if (inside) return offsets[k];
  }
  return null;
}

/* The visible device badges as stamp obstacles, or null unless services are
   the work set and the MEP layer is shown. Same filters as drawMEP; a badge's
   box covers its disc and the corner tags (js/mep/drawing.js drawNode). */
export function mepStampObstacles() {
  if (S.workSet !== "mep" || !isLayerVisible("mep")) return null;
  var m = ensureMEP();
  if (!m.show || !m.nodes.length) return null;
  var out = [];
  withNodePosMemo(function () {
    m.nodes.forEach(function (n) {
      if (m.vis[n.sys] === false || m.layerVis[n.layer || "wall"] === false) return;
      var def = nodeKindDef(n.sys, n.k) || {}, R = def.hub ? 9 : 7, p = nodePos(n);
      var s = rotatePx(sx(p.x), sz(p.z));
      out.push({ x: s.x, y: s.y, w: 2 * (R + 5), h: 2 * (R + 5) });
    });
  });
  return out;
}

// A room's outline in true-screen pixels.
export function roomScreenPoly(r) {
  return (r.pts || []).map(function (p) {
    return rotatePx(sx(p.x), sz(p.z));
  });
}
