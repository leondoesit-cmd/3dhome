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
  // dimension and readout labels drawn after this step around it
  planLabelBoxes.push({ x: scr.x, y: scr.y, w: wpx, h: 16 });
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

/* Every boxed number on the plan registers its true-screen box here, and the
   next one steps off any box it would cover. Wall lengths, the overall
   dimensions, the live draw readout and the cursor's measuring leaders used to
   land on the same few pixels (a corner is where all of them meet), so the plan
   showed "2000" printed through "2050". The model pass and the HUD pass paint
   two canvases at different rates: the HUD starts from the model pass's boxes,
   so a live readout steps around the static dimension under it. */
var planLabelBoxes = [], planModelLabelBoxes = [];
function beginPlanLabels(hud) {
  planLabelBoxes = hud ? planModelLabelBoxes.slice() : [];
}
function keepModelPlanLabels() {
  planModelLabelBoxes = planLabelBoxes.map(function (b) {
    return { x: b.x, y: b.y, w: b.w, h: b.h, model: true };
  });
}
/* A model-pass box centred exactly where a HUD label wants to go is that same
   label's own copy under it (the HUD repaints a selected wall's dimension on
   top of the model's): the repaint covers it, so it is not an obstacle.
   Without this the selected copy was pushed aside and both showed. */
function planLabelFree(x, y, w, h) {
  for (var i = 0; i < planLabelBoxes.length; i++) {
    var b = planLabelBoxes[i];
    if (b.model && Math.abs(x - b.x) < 1.5 && Math.abs(y - b.y) < 1.5) continue;
    if (Math.abs(x - b.x) < (w + b.w) / 2 + 2 && Math.abs(y - b.y) < (h + b.h) / 2 + 1)
      return false;
  }
  return true;
}
/* Try the spot asked for, then each nudge in `steps` (screen-pixel offsets);
   the first free one wins and is reserved. Nothing free: the label keeps its
   own spot — a number that wanders far from what it measures is worse than one
   that overlaps. */
function placePlanLabel(x, y, w, h, steps) {
  var pick = { x: x, y: y };
  for (var i = -1; i < steps.length; i++) {
    var cx = i < 0 ? x : x + steps[i][0], cy = i < 0 ? y : y + steps[i][1];
    if (planLabelFree(cx, cy, w, h)) { pick = { x: cx, y: cy }; break; }
  }
  planLabelBoxes.push({ x: pick.x, y: pick.y, w: w, h: h });
  return pick;
}

var PLAN_LABEL_FONT = "'Inter', system-ui, 'Segoe UI', sans-serif";

function planPill(x, y, w, h, color, strong) {
  pc.beginPath();
  if (pc.roundRect) pc.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  else pc.rect(x - w / 2, y - h / 2, w, h);
  pc.fillStyle = strong ? "rgba(255,255,255,.96)" : "rgba(255,255,255,.92)";
  pc.shadowColor = "rgba(15,23,32,.28)";
  pc.shadowBlur = 3;
  pc.shadowOffsetY = 1;
  pc.fill();
  pc.shadowColor = "transparent";
  pc.shadowBlur = 0;
  pc.shadowOffsetY = 0;
  pc.globalAlpha = strong ? 0.75 : 0.4;
  pc.strokeStyle = color;
  pc.lineWidth = 1;
  pc.stroke();
  pc.globalAlpha = 1;
}

/* A label's pill size in pixels, as label() draws it. */
function labelSize(txt, big) {
  pc.save();
  pc.font = (big ? "700 13px " : "600 12px ") + PLAN_LABEL_FONT;
  var w = Math.ceil(pc.measureText(String(txt)).width) + (big ? 14 : 12);
  pc.restore();
  return { w: w, h: big ? 22 : 20 };
}

// `shift` (optional): { dx, dy } screen pixels to move it by and an `alpha`
// (a room stamp moved off, or left faint under, an MEP badge).
function label(wx_, wz_, txt, color, big, shift) {
  txt = String(txt);
  var a = planRotRad(),
    scr = rotatePx(sx(wx_), sz(wz_));
  if (shift) { scr.x += shift.dx || 0; scr.y += shift.dy || 0; }
  pc.save();
  if (shift && shift.alpha != null) pc.globalAlpha *= shift.alpha;
  pc.font = (big ? "700 13px " : "600 12px ") + PLAN_LABEL_FONT;
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var w = Math.ceil(pc.measureText(txt).width) + (big ? 14 : 12),
    h = big ? 22 : 20,
    dy = h + 3, dx = w + 4;
  var at = placePlanLabel(scr.x, scr.y, w, h,
    [[0, -dy], [0, dy], [dx, 0], [-dx, 0], [0, -2 * dy], [0, 2 * dy]]);
  var base = unrotatePx(at.x, at.y), x = base.x, y = base.y;
  if (a) { pc.translate(x, y); pc.rotate(-a); pc.translate(-x, -y); } // keep text upright
  color = color || "#33312c";
  planPill(x, y, w, h, color, big);
  pc.fillStyle = color;
  pc.fillText(txt, x, y + 0.5);
  pc.restore();
  return { x: at.x, y: at.y, w: w, h: h }; // its true-screen box (clickable pills, js/keep_paint.js)
}

/* A dimension's number set ALONG its line, the drafting convention: text
   parallel to what it measures, turned so it never reads upside down. `ang` is
   the line's direction on the plan (radians, plan frame). Nudges slide along
   the line first, so a crowded number stays on its own dimension. */
function alignedLabel(wx_, wz_, txt, color, ang, strong) {
  txt = String(txt);
  var a = planRotRad(),
    scr = rotatePx(sx(wx_), sz(wz_)),
    t = ang + a;
  // [-90°, 90°): a vertical dimension reads bottom-to-top, from the right
  // edge of the sheet (ISO 129 / ASME aligned dimensioning)
  while (t >= Math.PI / 2 - 1e-6) t -= Math.PI;
  while (t < -Math.PI / 2 - 1e-6) t += Math.PI;
  pc.save();
  pc.font = (strong ? "700 12px " : "600 12px ") + PLAN_LABEL_FONT;
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var W = Math.ceil(pc.measureText(txt).width) + 12, H = 20,
    c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t)),
    bw = c * W + s * H, bh = s * W + c * H,
    ux = Math.cos(t), uy = Math.sin(t), step = W + 6,
    nx = -uy, ny = ux, nstep = H + 3;
  var at = placePlanLabel(scr.x, scr.y, bw, bh, [
    [ux * step, uy * step], [-ux * step, -uy * step],
    [ux * 2 * step, uy * 2 * step], [-ux * 2 * step, -uy * 2 * step],
    [nx * nstep, ny * nstep], [-nx * nstep, -ny * nstep],
  ]);
  var base = unrotatePx(at.x, at.y), x = base.x, y = base.y;
  pc.translate(x, y);
  pc.rotate(t - a);
  color = color || "#33312c";
  planPill(0, 0, W, H, color, strong);
  pc.fillStyle = color;
  pc.fillText(txt, 0, 0.5);
  pc.restore();
}

export {
  alignedLabel, beginPlanLabels, conAngleOf, conLabel, drawAngleConstraint,
  drawConTargetHighlight, fmtDeg, keepModelPlanLabels, label, labelSize,
};
