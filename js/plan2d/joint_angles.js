/* The plan view's live corner angles: while a corner or a wall is being
   dragged, every corner whose angle the drag is changing shows it as an arc
   dimension with its value, the way the lengths beside it update. Split out
   of js/plan2d.js as its own piece; it shares the editor's state through live
   imports from ../plan2d.js. */
import { wallGeom, wallTangentAt } from "../geometry.js";
import { sx, sz } from "../plan_view.js";
import { label } from "../plan2d/constraints.js";
import { S } from "../state.js";
import { pc } from "../plan2d.js";

var JOINT_ARC_PX = 26;

/* Directions (plan-frame radians) of the walls leaving corner `ni`. An arc
   wall leaves along its tangent, not toward its far end. */
function jointArms(ni) {
  var arms = [];
  S.walls.forEach(function (w) {
    if (w.a !== ni && w.b !== ni) return;
    if (w.a === w.b) return;
    var g = wallGeom(w);
    if (!(g && g.L > 1)) return;
    var t = w.a === ni ? wallTangentAt(w, 0) : wallTangentAt(w, g.L);
    var sgn = w.a === ni ? 1 : -1;
    arms.push(Math.atan2(t.z * sgn, t.x * sgn));
  });
  return arms.sort(function (p, q) { return p - q; });
}

/* The corners a live drag is reshaping, or [] when nothing is. */
function liveJoints() {
  var out = [];
  function add(n) { if (n != null && S.nodes[n] && out.indexOf(n) === -1) out.push(n); }
  if (S.action === "node" && S.nodeDrag && S.nodeDrag.node != null) {
    var n = S.nodeDrag.node;
    add(n);
    // the far corner of each wall it drags along turns too
    S.walls.forEach(function (w) {
      if (w.a === n) add(w.b);
      else if (w.b === n) add(w.a);
    });
  } else if (S.action === "wall" && S.wallDrag && S.wallDrag.wall && !S.wallAngleGuide) {
    var dw = S.wallDrag.wall, wa = dw.a, wb = dw.b;
    add(wa);
    add(wb);
    // the neighbours' far corners stay put while their walls swing, so their
    // angles change too
    S.walls.forEach(function (w) {
      if (w === dw) return;
      if (w.a === wa || w.a === wb) add(w.b);
      if (w.b === wa || w.b === wb) add(w.a);
    });
  }
  return out;
}

function drawJointSector(J, from, sweep) {
  var deg = Math.round(sweep * 180 / Math.PI * 10) / 10;
  if (deg < 0.5 || deg > 179.5) return; // a straight run is not a corner
  var whole = Math.abs(deg - Math.round(deg)) < 0.05,
    col = whole && Math.round(deg) === 90 ? "#e15a46" : "#2f6f8a",
    X = sx(J.x), Y = sz(J.z), r = JOINT_ARC_PX;
  pc.save();
  pc.strokeStyle = col;
  pc.lineWidth = 1.5;
  pc.beginPath();
  pc.arc(X, Y, r, from, from + sweep, false);
  pc.stroke();
  pc.restore();
  var mid = from + sweep / 2, lr = (r + 15) / S.SC;
  label(J.x + Math.cos(mid) * lr, J.z + Math.sin(mid) * lr,
    (whole ? Math.round(deg) : deg) + "°", col, false);
}

export function drawLiveJointAngles() {
  if (!(S.SC > 0)) return;
  liveJoints().forEach(function (ni) {
    var arms = jointArms(ni), J = S.nodes[ni];
    if (arms.length < 2) return;
    for (var i = 0; i < arms.length; i++) {
      // two arms: only the side under 180°; three or more: every sector
      if (arms.length === 2 && i === 1) break;
      var a0 = arms[i], a1 = i + 1 < arms.length ? arms[i + 1] : arms[0] + Math.PI * 2,
        sweep = a1 - a0;
      if (arms.length === 2 && sweep > Math.PI) { a0 = arms[1]; sweep = Math.PI * 2 - sweep; }
      drawJointSector(J, a0, sweep);
    }
  });
}
