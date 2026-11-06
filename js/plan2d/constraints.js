/* The plan view's constraint overlays: targets, angle constraints, hit targets
   and labels, split out of js/plan2d.js. It shares the editor's state through
   live imports from ../plan2d.js. */
import { wallById } from "../geometry.js";
import { layerRank } from "../layers.js";
import { planRotRad, rotatePx, sx, sz, unrotatePx } from "../plan_view.js";
import { traceWallCentre } from "../plan2d/walls.js";
import { S } from "../state.js";
import { anchorNode, anchorPos, openingById, openingPos } from "../wall_constraints.js";
import {
  RELATION_CONS, conForLabel, conHits, conHot, conLabelOcc, pc,
} from "../plan2d.js";

/* Reveal the actual pieces a relation touches, not only its small label. This
   is deliberately limited to hover/selection: drawing every referenced wall
   twice all the time would turn a dense constrained plan into blue fog. */
function drawConTargetHighlight(c, col, hot) {
  if (!hot) return;
  var wallIds = {}, points = [], openings = [];
  function wall(id) { if (id != null && wallById(id)) wallIds[id] = 1; }
  function anchor(an) {
    if (!an || typeof an !== "object") return;
    wall(an.wall);
    var p = anchorPos(an);
    if (p) points.push(p);
  }
  function sector(sec) {
    if (!sec) return;
    anchor(sec.joint); wall(sec.w1); wall(sec.w2);
  }
  function opening(id) {
    var o = openingById(id), p = openingPos(o);
    if (!o || !p) return;
    wall(o.wall); openings.push(p);
  }
  wall(c.wall); wall(c.ref); wall(c.w1); wall(c.w2);
  (c.walls || []).forEach(wall);
  if (c.axis) wall(c.axis.id);
  anchor(c.a); anchor(c.b); anchor(c.point); anchor(c.joint);
  sector(c.referenceAngle); sector(c.drivenAngle);
  opening(c.opening);
  if (c.type === "openAlign") { opening(c.a); opening(c.b); }
  (c.openings || []).forEach(opening);

  pc.save();
  pc.shadowBlur = 0;
  pc.setLineDash([]);
  pc.globalAlpha = 0.32;
  pc.strokeStyle = col;
  pc.lineWidth = 8;
  Object.keys(wallIds).forEach(function (id) {
    var w = wallById(isNaN(Number(id)) ? id : Number(id));
    if (!w) return;
    traceWallCentre(w);
    pc.stroke();
  });
  pc.globalAlpha = 0.92;
  pc.lineWidth = 2;
  points.concat(openings).forEach(function (p) {
    pc.beginPath(); pc.arc(sx(p.x), sz(p.z), 8, 0, Math.PI * 2); pc.stroke();
  });
  pc.restore();
}

/* The live opening of a sector, in degrees, for the reference readouts. */
function conAngleOf(sec) {
  if (!sec) return null;
  var ni = anchorNode(sec.joint), w1 = wallById(sec.w1), w2 = wallById(sec.w2);
  if (ni == null || !w1 || !w2) return null;
  var J = S.nodes[ni],
    f1 = w1.a === ni ? S.nodes[w1.b] : S.nodes[w1.a],
    f2 = w2.a === ni ? S.nodes[w2.b] : S.nodes[w2.a];
  if (!J || !f1 || !f2) return null;
  var d = (Math.atan2(f2.z - J.z, f2.x - J.x) - Math.atan2(f1.z - J.z, f1.x - J.x)) * 180 / Math.PI;
  return ((d % 360) + 360) % 360;
}
function fmtDeg(v) {
  return v == null ? "?" : (Math.round(v * 10) / 10) + "\u00b0";
}

function drawAngleConstraint(sec, txt, col, radius) {
  if (!sec) return;
  var ni = anchorNode(sec.joint), w1 = wallById(sec.w1), w2 = wallById(sec.w2);
  if (ni == null || !w1 || !w2) return;
  var J = S.nodes[ni], f1 = w1.a === ni ? S.nodes[w1.b] : S.nodes[w1.a],
    f2 = w2.a === ni ? S.nodes[w2.b] : S.nodes[w2.a];
  if (!J || !f1 || !f2) return;
  var X = sx(J.x), Y = sz(J.z);
  var a1 = Math.atan2(sz(f1.z) - Y, sx(f1.x) - X),
    a2 = Math.atan2(sz(f2.z) - Y, sx(f2.x) - X),
    d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  pc.setLineDash([]); pc.beginPath(); pc.moveTo(X, Y);
  pc.arc(X, Y, radius, a1, a1 + d, d < 0); pc.strokeStyle = col; pc.stroke();
  var mid = a1 + d / 2;
  conLabel(J.x, J.z, txt, col, Math.sin(mid) * (radius + 13));
}

export function conHitTargets() {
  return conHits;
}
/* The constraint whose label box is under this screen point, or null. Boxes
   are small and may overlap on a dense plan, so the LAST one drawn wins —
   that is the one painted on top, i.e. the one the user can see. */
/* Constraint labels are annotations, so a hidden or overridden-unpickable
   annotations layer takes them out of the hit test entirely. Rank 1 still
   picks: an off-work-set constraint label is worth selecting, it just does not
   win over a focused layer, and that ordering is the caller's to apply. */
export function pickCon(sxp, syp) {
  if (!isFinite(layerRank("annotations"))) return null;
  for (var i = conHits.length - 1; i >= 0; i--) {
    var h = conHits[i];
    if (sxp >= h.x - h.w / 2 - 2 && sxp <= h.x + h.w / 2 + 2 &&
      syp >= h.y - 10 && syp <= h.y + 10) return h.con;
  }
  return null;
}

function conLabelOverlaps(x, y, w) {
  var pad = 3, h = 16;
  for (var i = 0; i < conLabelOcc.length; i++) {
    var p = conLabelOcc[i];
    if (Math.abs(x - p.x) < (w + p.w) / 2 + pad && Math.abs(y - p.y) < h + pad)
      return true;
  }
  return false;
}

// a boxed number on the plan — plain text over a wall hatch is unreadable
function conLabel(wxc, wzc, txt, col, dy) {
  var scr = rotatePx(sx(wxc), sz(wzc));
  scr.y += dy || 0;
  pc.save();
  pc.font = "600 11px system-ui, sans-serif";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var wpx = pc.measureText(String(txt)).width + 10;
  var relation = !!(conForLabel && RELATION_CONS[conForLabel.type]);
  var offsets = [0, -18, 18, -34, 34, -50, 50],
    placed = false,
    oy = 0,
    i;
  for (i = 0; i < offsets.length; i++) {
    oy = offsets[i];
    if (!conLabelOverlaps(scr.x, scr.y + oy, wpx)) {
      placed = true;
      break;
    }
  }
  /* Relation glyphs (∥ ⊥ =L …) that would still sit on a number are hidden
     unless the constraint is hovered or selected — otherwise a dense plan
     becomes an unpickable stack of identical boxes. Driving dimensions always
     stay, even if they have to share a slot. */
  if (!placed && relation && !conHot) {
    pc.restore();
    return;
  }
  scr.y += oy;
  var base = unrotatePx(scr.x, scr.y),
    x = base.x,
    y = base.y,
    a = planRotRad();
  if (a) { pc.translate(x, y); pc.rotate(-a); pc.translate(-x, -y); }
  if (conForLabel) {
    conHits.push({ con: conForLabel, x: scr.x, y: scr.y, w: wpx });
    conLabelOcc.push({ x: scr.x, y: scr.y, w: wpx });
  }
  pc.setLineDash([]);
  pc.fillStyle = "rgba(255,255,255,.9)";
  pc.strokeStyle = col;
  pc.lineWidth = 1;
  pc.beginPath();
  if (pc.roundRect) pc.roundRect(x - wpx / 2, y - 8, wpx, 16, 5);
  else pc.rect(x - wpx / 2, y - 8, wpx, 16);
  pc.fill();
  pc.stroke();
  pc.fillStyle = col;
  pc.fillText(txt, x, y);
  pc.restore();
}

function label(wx_, wz_, txt, color, big) {
  var x = sx(wx_),
    y = sz(wz_);
  var a = planRotRad();
  pc.save();
  if (a) { pc.translate(x, y); pc.rotate(-a); pc.translate(-x, -y); } // keep text upright
  pc.font = big ? "bold 12px Arial" : "10px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var tw = pc.measureText(txt).width,
    h = big ? 17 : 14;
  pc.fillStyle = "rgba(255,255,255," + (big ? ".8" : ".75") + ")";
  pc.fillRect(x - tw / 2 - 4, y - h / 2, tw + 8, h);
  pc.fillStyle = color || "#33312c";
  pc.fillText(txt, x, y);
  pc.restore();
}

export {
  conAngleOf, conLabel, drawAngleConstraint, drawConTargetHighlight, fmtDeg,
  label,
};
