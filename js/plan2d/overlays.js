/* The plan view's after-render overlays: lengths and sizes, touch readouts and
   lenses, overall dimensions, measure overlay, cursors and info cards, split
   out of js/plan2d.js. It shares the editor's state through live imports from
   ../plan2d.js. */
import { fmtLen, unitLabel } from "../display_units.js";
import { ceilingHeight } from "../elevation.js";
import { flabel, isLamp } from "../furniture.js";
import { jointInfo, pendingCuts, wallById, wallClearLength, wallCuts, wallDimSide, wallGeom, wallPointAt, wallTangentAt } from "../geometry.js";
import { t } from "../i18n.js";
import { hitMarker, markerInfo, markerItem, markerLabel, markers } from "../markers.js";
import { itemCorners, measure4 } from "../measure.js";
import { liveClearances } from "../measure_cache.js";
import { beginPaint, pillLabel2D } from "../keep_paint.js";
import { reachName } from "../wall_plane_strings.js";
import { labelSpots } from "../clearance.js";
import { isOnWall } from "../item_orient.js";
import { isPresentation, planTheme } from "../plan_style.js";
import { cursors, pruneCursors } from "../plan_sync.js";
import { niceScaleCm, planRotRad, sx, sz, wx, wz } from "../plan_view.js";
import { alignedLabel, label } from "../plan2d/constraints.js";
import { OVERALL_DIM_PX, chainCoveredWall } from "../plan2d/dim_chains.js";
import { clipOutsideOpenings, traceWallCentre, wallPath } from "../plan2d/walls.js";
import { fillWallBands, inkWall } from "../plan2d/wall_ink_draw.js";
import { openingCorners, slabOpenings } from "../slab_openings.js";
import { canvasToneIsDark } from "../plan_grid.js";
import { voidDisplayName } from "../stair_strings.js";
import { S, fin } from "../state.js";
import { getTouchPrecisionPrefs } from "../touch_precision_ui.js";
import { drawTouchPrecisionLens } from "../touch_precision.js";
import { inferDomainFromTool } from "../unit_settings.js";
import { makeArcFromThreePoints, normalizeWallKind } from "../wall_curves.js";
import { hatchSide, previewBandPoly, previewCentreline, previewLayerBands, previewMetrics, resolveWallDrawDefaults, touchDrawing } from "../wall_draw.js";
import { normalizeWall, wallLayerBands } from "../wall_types.js";
import {
  ERASE_COL, MK_COL, afterRender, chromeOn, pc, plan, planViewReady,
} from "../plan2d.js";

/* How far (screen px) a wall's own dimension line stands off the face it
   measures; drawOverallDims places the overall size outside it. */
var WALL_DIM_PX = 12;

export function onAfterRender(fn) {
  if (typeof fn === "function") afterRender.push(fn);
}

/* Bearing of a segment in whole degrees. Same convention as the inspector's
   ANGLE field (js/ui_props.js): atan2(dz,dx), so 0 = east and a wall running
   UP the plan reads -90. Two angle conventions in one editor is how a user
   ends up not trusting either number, so this must not be "improved" to a
   compass bearing without changing the inspector with it. */
export function segBearing(a, b) {
  return Math.round((Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI);
}

function planLen(cm, options) {
  return fmtLen(cm, Object.assign({ domain: "plan" }, options || {}));
}

function planSize(w, d) {
  return planLen(w, { suffix: false }) + " × " + planLen(d);
}

/* The live readouts of whatever is being drawn speak the drawing tool's unit
   domain (Settings → Units: "rooms" for walls and rectangles), the same one
   the typed length/size entry in js/cad_hud.js reads. On "plan" they said
   8000 mm while the entry box took metres, so typing what the label showed
   built a room a thousand times too big. */
function drawLen(cm, options) {
  return fmtLen(cm, Object.assign({ domain: inferDomainFromTool(S.tool) }, options || {}));
}

function drawSize(w, d) {
  return drawLen(w, { suffix: false }) + " × " + drawLen(d);
}

function fillPoly(pts, fill, stroke) {
  if (!pts || pts.length < 3) return;
  pc.beginPath();
  pts.forEach(function (p, i) {
    if (i) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
  pc.closePath();
  if (fill) { pc.fillStyle = fill; pc.fill(); }
  if (stroke) { pc.strokeStyle = stroke; pc.lineWidth = 0.7; pc.stroke(); }
}

function drawGhostWall(ax, az, bx, bz) {
  var spec = resolveWallDrawDefaults();
  if (spec.kind === "roomDivider") {
    pc.save();
    pc.strokeStyle = "rgba(91,122,134,.8)";
    pc.lineWidth = 1.6;
    pc.setLineDash([7, 5]);
    pc.beginPath();
    pc.moveTo(sx(ax), sz(az));
    pc.lineTo(sx(bx), sz(bz));
    pc.stroke();
    pc.restore();
    return previewCentreline(ax, az, bx, bz, spec);
  }
  var cl = previewCentreline(ax, az, bx, bz, spec);
  var bands = previewLayerBands(spec);
  pc.save();
  bands.forEach(function (band) {
    fillPoly(previewBandPoly(cl, band.start, band.end), band.color || "rgba(63,107,120,.45)", "rgba(80,73,64,.35)");
  });
  pc.strokeStyle = "rgba(63,107,120,.95)";
  pc.lineWidth = 1.1;
  pc.setLineDash([5, 4]);
  pc.beginPath();
  pc.moveTo(sx(ax), sz(az));
  pc.lineTo(sx(bx), sz(bz));
  pc.stroke();
  pc.setLineDash([]);
  var hs = hatchSide(spec);
  if (hs) {
    var nx = -cl.uz * hs, nz = cl.ux * hs;
    var face = cl.thickness / 2;
    var steps = Math.max(2, Math.floor(cl.L / 18));
    pc.strokeStyle = "rgba(90,82,70,.55)";
    pc.lineWidth = 1;
    for (var i = 1; i < steps; i++) {
      var tt = i / steps;
      var px = cl.a.x + cl.ux * cl.L * tt + nx * face;
      var pz = cl.a.z + cl.uz * cl.L * tt + nz * face;
      pc.beginPath();
      pc.moveTo(sx(px), sz(pz));
      pc.lineTo(sx(px + nx * 8 + cl.ux * 4), sz(pz + nz * 8 + cl.uz * 4));
      pc.stroke();
    }
  }
  pc.restore();
  return cl;
}

function drawPreviewDims(from, preview) {
  var metrics = previewMetrics(S.drawFrom, preview);
  if (!metrics) return;
  var d = Math.max(0, metrics.length -
    (S.interiorDims !== false ? pendingCuts(S.drawFrom, preview) : 0));
  /* On a finger, the same numbers ride the draw point (drawTouchReadout); the
     midpoint copy would sit under the hand AND collide with the parallel and
     close-loop labels below. The angle is no longer glued to the length: it
     is its own dimension, an arc at the corner (drawAngleArc). */
  if (!touchDrawing() && metrics.length > 1) {
    var ux = (preview.x - from.x) / metrics.length, uz = (preview.z - from.z) / metrics.length,
      nx = -uz, nz = ux, side = 1;
    // the side away from the wall this one continues, so the length never
    // lands inside the corner the angle arc is drawn in; a first segment puts
    // it above (or left of) itself
    if (metrics.hasPrev) {
      var back = metrics.absAng - metrics.turn + Math.PI;
      if (nx * Math.cos(back) + nz * Math.sin(back) > 0) side = -1;
    } else if (nz > 1e-9 || (Math.abs(nz) <= 1e-9 && nx > 0)) side = -1;
    var spec = resolveWallDrawDefaults(),
      off = side * ((spec.loc === "face" ? spec.thickness : spec.thickness / 2) + 16 / S.SC);
    alignedLabel((from.x + preview.x) / 2 + nx * off, (from.z + preview.z) / 2 + nz * off,
      drawLen(d), "#2f5f6b", metrics.absAng, true);
  }
  if (metrics.parallel) {
    var par = metrics.parallel, mx = (from.x + preview.x) / 2, mz = (from.z + preview.z) / 2;
    var ox = mx - par.nx * par.dist, oz = mz - par.nz * par.dist;
    pc.save();
    pc.strokeStyle = "rgba(224,129,58,.8)";
    pc.lineWidth = 1;
    pc.setLineDash([3, 3]);
    pc.beginPath();
    pc.moveTo(sx(mx), sz(mz));
    pc.lineTo(sx(ox), sz(oz));
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    if (!touchDrawing())
      label((mx + ox) / 2, (mz + oz) / 2, drawLen(par.abs), "#e0813a");
  }
  if (metrics.close && metrics.close.dist > 8) {
    pc.save();
    pc.strokeStyle = "rgba(63,107,120,.45)";
    pc.lineWidth = 1;
    pc.setLineDash([4, 4]);
    pc.beginPath();
    pc.moveTo(sx(preview.x), sz(preview.z));
    pc.lineTo(sx(metrics.close.x), sz(metrics.close.z));
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    if (!touchDrawing()) {
      label((preview.x + metrics.close.x) / 2, (preview.z + metrics.close.z) / 2,
        drawLen(metrics.close.dist), "#6b8a92");
      drawClosingAngles(from, preview, metrics.close);
    }
  }
}

/* The two corners the dashed close-the-loop line WOULD make if it became the
   last wall: at the cursor (against the wall being drawn) and at the run's
   first corner (against the run's first wall). Dashed, in the close line's
   colour, because they are a forecast — what closing now would give — not
   geometry. */
function drawClosingAngles(from, preview, close) {
  var first = wallById((S.drawWalls || [])[0]), ni = close.node;
  var toStart = Math.atan2(close.z - preview.z, close.x - preview.x);
  ghostCornerAngle(preview, Math.atan2(from.z - preview.z, from.x - preview.x), toStart,
    Math.hypot(from.x - preview.x, from.z - preview.z), close.dist);
  if (!first || (first.a !== ni && first.b !== ni)) return;
  var g = wallGeom(first);
  if (!(g && g.L > 1)) return;
  var t = first.a === ni ? wallTangentAt(first, 0) : wallTangentAt(first, g.L),
    sgn = first.a === ni ? 1 : -1;
  ghostCornerAngle(close, toStart + Math.PI, Math.atan2(t.z * sgn, t.x * sgn), close.dist, g.L);
}
function ghostCornerAngle(J, a1, a2, len1, len2) {
  var sweep = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)),
    deg = Math.round(Math.abs(sweep) * 1800 / Math.PI) / 10,
    shortPx = Math.min(len1, len2) * S.SC;
  if (!(shortPx > 28) || deg < 0.5 || deg > 179.5) return;
  var r = Math.min(ANGLE_ARC_MAX_PX - 8, shortPx * 0.4), X = sx(J.x), Y = sz(J.z),
    whole = Math.abs(deg - Math.round(deg)) < 0.05,
    col = whole && Math.round(deg) === 90 ? "#c4614f" : "#5f7f88";
  pc.save();
  pc.strokeStyle = col;
  pc.lineWidth = 1.3;
  pc.setLineDash([3, 3]);
  pc.beginPath();
  pc.arc(X, Y, r, a1, a1 + sweep, sweep < 0);
  pc.stroke();
  pc.restore();
  var mid = a1 + sweep / 2, lr = (r + 15) / S.SC;
  label(J.x + Math.cos(mid) * lr, J.z + Math.sin(mid) * lr,
    (whole ? Math.round(deg) : deg) + "°", col, false);
}

/* The angle of the segment being drawn, as a dimension of its own: an arc at
   the corner with its value, like every length on the plan. With a previous
   wall in the run it is the corner angle between the two walls (what a plan
   is read by); a first segment measures from the horizontal, drawn as a short
   dashed reference arm. Red at a multiple of 90°, teal at another 15° step:
   the confirmation that the snap took, without which a 90.0 and an 89.6 look
   identical on screen. */
var ANGLE_ARC_MAX_PX = 42;
/* A run started ON an existing corner has no previous wall of its own, but
   the corner does: the angle worth reading is the one the new wall makes with
   the nearest wall already there, not a bearing from east. null when the
   start corner is free. */
function existingArmRef(ni, dir) {
  if (ni == null) return null;
  var best = null, bestD = Infinity, own = S.drawWalls || [];
  S.walls.forEach(function (w) {
    if ((w.a !== ni && w.b !== ni) || w.a === w.b || own.indexOf(w.id) !== -1) return;
    var g = wallGeom(w);
    if (!(g && g.L > 1)) return;
    var t = w.a === ni ? wallTangentAt(w, 0) : wallTangentAt(w, g.L),
      sgn = w.a === ni ? 1 : -1,
      arm = Math.atan2(t.z * sgn, t.x * sgn),
      d = Math.abs(Math.atan2(Math.sin(dir - arm), Math.cos(dir - arm)));
    if (d < bestD) { bestD = d; best = arm; }
  });
  return best;
}
function drawAngleArc(a, p) {
  var m = previewMetrics(S.drawFrom, p);
  if (!m) return;
  var lenPx = m.length * S.SC;
  if (!(lenPx > 28)) return;
  var dir = m.absAng,
    ref = m.hasPrev ? m.absAng - m.turn + Math.PI : existingArmRef(S.drawFrom, dir),
    fromWall = m.hasPrev || ref != null;
  if (ref == null) ref = 0;
  var sweep = Math.atan2(Math.sin(dir - ref), Math.cos(dir - ref)), // short way, signed
    deg = Math.abs(sweep) * 180 / Math.PI,
    shown = Math.round(deg * 10) / 10,
    r = Math.min(ANGLE_ARC_MAX_PX, lenPx * 0.45),
    X = sx(a.x),
    Y = sz(a.z),
    whole = Math.abs(shown - Math.round(shown)) < 0.05,
    col = whole && Math.round(shown) % 90 === 0 ? "#e15a46"
      : whole && Math.round(shown) % 15 === 0 ? "#2f6f8a" : "#55707a";
  if (shown < 0.5 || shown > 179.5) return; // a straight run has no corner to dimension
  pc.save();
  pc.strokeStyle = col;
  pc.lineWidth = 1.5;
  if (!fromWall) {
    pc.setLineDash([4, 3]);
    pc.beginPath();
    pc.moveTo(X, Y);
    pc.lineTo(X + r + 10, Y);
    pc.stroke();
    pc.setLineDash([]);
  }
  pc.beginPath();
  pc.arc(X, Y, r, ref, ref + sweep, sweep < 0);
  pc.stroke();
  // a square corner gets the drafting square mark inside the arc
  if (whole && Math.round(shown) === 90) {
    var q = Math.min(9, r * 0.4), ur = { x: Math.cos(ref), y: Math.sin(ref) },
      ud = { x: Math.cos(dir), y: Math.sin(dir) };
    pc.beginPath();
    pc.moveTo(X + ur.x * q, Y + ur.y * q);
    pc.lineTo(X + (ur.x + ud.x) * q, Y + (ur.y + ud.y) * q);
    pc.lineTo(X + ud.x * q, Y + ud.y * q);
    pc.stroke();
  }
  pc.restore();
  if (touchDrawing()) return; // the finger readout carries the number
  var mid = ref + sweep / 2, lr = (r + 16) / S.SC;
  label(a.x + Math.cos(mid) * lr, a.z + Math.sin(mid) * lr,
    (whole ? Math.round(shown) : shown) + "°", col, true);
}

/* Glyph naming WHICH snap caught the point, in the AutoCAD idiom: a square on
   an endpoint, a triangle on a point along a wall, a cross on the grid. Until
   this existed the cursor jumped and you had to infer why — the single most
   common complaint about a snapping editor that gives no feedback. */
function drawSnapMark() {
  var si = S.snapInfo;
  if (!si || !fin(si.x) || !fin(si.z)) return;
  var live =
    S.tool === "wall" ||
    S.tool === "arcwall" ||
    S.tool === "rect" ||
    S.tool === "walloffset" ||
    S.tool === "wallbreak" ||
    S.tool === "wallbite" ||
    S.tool === "walljoin" ||
    S.tool === "wallpaint" ||
    S.tool === "point" ||
    S.action === "node" ||
    S.action === "marker";
  if (!live) return;
  var X = sx(si.x),
    Y = sz(si.z),
    c = "#e15a46",
    r = 6;
  pc.save();
  pc.strokeStyle = c;
  pc.lineWidth = 2;
  pc.beginPath();
  if (si.type === "corner") pc.rect(X - r, Y - r, r * 2, r * 2);
  else if (si.type === "marker" || si.type === "blueprint") {
    // a datum: the endpoint square, turned 45° so the two read apart at a glance
    pc.moveTo(X, Y - r); pc.lineTo(X + r, Y);
    pc.lineTo(X, Y + r); pc.lineTo(X - r, Y);
    pc.closePath();
  } else if (si.type === "itemCorner") {
    // an L, the corner of the footprint it came from
    pc.moveTo(X - r, Y + r); pc.lineTo(X - r, Y - r); pc.lineTo(X + r, Y - r);
  } else if (si.type === "midpoint") pc.arc(X, Y, r, 0, Math.PI * 2);
  else if (si.type === "wall") {
    pc.moveTo(X - r, Y + r);
    pc.lineTo(X, Y - r);
    pc.lineTo(X + r, Y + r);
    pc.closePath();
  } else if (si.type === "perpendicular") {
    pc.rect(X - r, Y - r, r, r);
  } else if (si.type === "intersection" || si.type === "align" || si.type === "angle" ||
             si.type === "ortho" || si.type === "bisector") {
    pc.moveTo(X - r, Y - r);
    pc.lineTo(X + r, Y + r);
    pc.moveTo(X + r, Y - r);
    pc.lineTo(X - r, Y + r);
  } else if (si.type === "extension") {
    pc.setLineDash([3, 2]); pc.arc(X, Y, r, 0, Math.PI * 2);
  } else if (si.type === "close") {
    pc.arc(X, Y, r + 2, 0, Math.PI * 2);
    pc.moveTo(X - r, Y); pc.lineTo(X + r, Y);
    pc.moveTo(X, Y - r); pc.lineTo(X, Y + r);
  } else if (si.type === "hit") {
    pc.moveTo(X - r, Y); pc.lineTo(X + r, Y);
    pc.moveTo(X, Y - r); pc.lineTo(X, Y + r);
    pc.rect(X - r * 0.6, Y - r * 0.6, r * 1.2, r * 1.2);
  } else {
    // grid / free: a light cross, deliberately quieter than a real object snap
    pc.strokeStyle = "rgba(63,107,120,.75)";
    pc.moveTo(X - 4, Y);
    pc.lineTo(X + 4, Y);
    pc.moveTo(X, Y - 4);
    pc.lineTo(X, Y + 4);
  }
  pc.stroke();
  pc.restore();
}

/* What the fingertip is currently authoring: one headline (the number being
   set) and one qualifier at most.  Deliberately short — this rides with the
   draw point, so anything longer would cover the geometry it describes. */
function touchDrawReadout() {
  if (S.tool === "wall" && S.drawing && S.drawFrom != null && S.nodes[S.drawFrom] && S.previewPt) {
    var m = previewMetrics(S.drawFrom, S.previewPt);
    if (!m) return null;
    var len = Math.max(0, m.length -
      (S.interiorDims !== false ? pendingCuts(S.drawFrom, S.previewPt) : 0));
    // the same corner angle the arc dimension prints with a mouse
    var cornerDeg = Math.round(Math.abs(Math.atan2(Math.sin(m.turn), -Math.cos(m.turn))) * 180 / Math.PI);
    return {
      main: drawLen(len),
      sub: m.hasPrev
        ? "\u2220" + cornerDeg + "\u00b0"
        : "\u2220" + Math.abs(Math.round((m.absAng * 180) / Math.PI)) + "\u00b0",
    };
  }
  if (S.tool === "arcwall" && S.arcDraft && (S.nodes[S.arcDraft.startNode] || S.arcDraft.startPoint) && S.previewPt) {
    var a0 = S.nodes[S.arcDraft.startNode] || S.arcDraft.startPoint;
    var arc = S.arcDraft.through ? makeArcFromThreePoints(a0, S.arcDraft.through, S.previewPt) : null;
    if (arc) return { main: drawLen(arc.L), sub: "R" + Math.round(arc.radius) };
    return { main: drawLen(Math.hypot(S.previewPt.x - a0.x, S.previewPt.z - a0.z)), sub: "" };
  }
  if ((S.tool === "rect" || S.tool === "slabvoid") && S.rectDraft && S.previewPt) {
    return {
      main: drawSize(Math.abs(S.previewPt.x - S.rectDraft.x), Math.abs(S.previewPt.z - S.rectDraft.z)),
      sub: "",
    };
  }
  return null;
}

/* How much of the canvas top edge is covered by DOM chrome (the CAD
   instruction bar). Canvas pixels are CSS pixels here — the context is
   pre-scaled by the device ratio — so the two rects compare directly. */
function topReservedPx() {
  if (typeof document === "undefined") return 0;
  var el = document.getElementById("cad-status");
  if (!el || el.hidden || !el.offsetParent) return 0;
  // a quiet bar keeps its box but paints nothing — it reserves no space
  if (el.classList.contains("cad-quiet")) return 0;
  var pr = plan.getBoundingClientRect(), er = el.getBoundingClientRect();
  if (!er.height || er.bottom <= pr.top) return 0;
  return Math.max(0, Math.min(pr.height, er.bottom - pr.top));
}

/* One card, always in the same place relative to the draw point: directly
   above it, so it travels with the cursor exactly the way the cursor travels
   with the finger.  It is the ONLY copy on the canvas — drawPreviewDims and the
   rect/arc labels stand down while a finger is drawing, since three copies of
   "550 cm" printed over each other is what made the old readout unreadable. */
function drawTouchReadout(ox, oy) {
  var r = touchDrawReadout();
  if (!r) return;
  var W = S.CW || plan.width;
  pc.save();
  pc.textBaseline = "middle";
  pc.font = "700 15px system-ui, Arial";
  var mainW = pc.measureText(r.main).width;
  pc.font = "600 12px system-ui, Arial";
  var subW = r.sub ? pc.measureText(r.sub).width + 10 : 0;
  var padX = 10, h = 28, w = padX * 2 + mainW + subW;
  var x = Math.min(Math.max(6, ox - w / 2), W - w - 6);
  /* Above the draw point — unless that puts it behind the CAD instruction bar,
     which is a DOM element painted OVER the canvas: the card would simply
     vanish under it. Then it goes below the point instead. */
  var top = oy - 16 - h;
  if (top < topReservedPx() + 6) top = oy + 16;
  pc.beginPath();
  if (pc.roundRect) pc.roundRect(x, top, w, h, 14);
  else pc.rect(x, top, w, h);
  pc.fillStyle = "rgba(28, 30, 45, 0.92)";
  pc.fill();
  var cy = top + h / 2;
  pc.textAlign = "left";
  pc.fillStyle = "#fff";
  pc.font = "700 15px system-ui, Arial";
  pc.fillText(r.main, x + padX, cy);
  if (r.sub) {
    pc.font = "600 12px system-ui, Arial";
    pc.fillStyle = "rgba(255,255,255,.72)";
    pc.fillText(r.sub, x + padX + mainW + 10, cy);
  }
  pc.restore();
}

export function touchLensDistanceMap(screenX, screenY, preferPreview) {
  var origin = preferPreview && S.previewPt && (S.tool !== "select" || S.placeType)
    ? S.previewPt
    : { x: wx(screenX, screenY), z: wz(screenX, screenY) };
  var out = { up: null, down: null, left: null, right: null };
  var angle = planRotRad(), ca = Math.cos(angle), sa = Math.sin(angle);
  measure4(origin.x, origin.z, null, null, { target: "nearest" }).forEach(function (hit) {
    var screenX = hit.dir.dx * ca - hit.dir.dz * sa;
    var screenY = hit.dir.dx * sa + hit.dir.dz * ca;
    var key = Math.abs(screenX) > Math.abs(screenY)
      ? (screenX < 0 ? "left" : "right")
      : (screenY < 0 ? "up" : "down");
    if (out[key] === null || hit.gap < out[key]) out[key] = hit.gap;
  });
  return out;
}

function touchLensDistances(tc) {
  return touchLensDistanceMap(tc.ox, tc.oy, true);
}

function drawTouchGuide() {
  if (!S.touchContact || S.touchContact.pointerId == null) return;
  var tc = S.touchContact;
  var ox = tc.ox, oy = tc.oy;
  drawTouchPrecisionLens(pc, plan, tc, {
    color: "#4f46e5",
    crosshair: "#e05a46",
    distances: touchLensDistances(tc),
    unitLabel: unitLabel("plan"),
    handedness: getTouchPrecisionPrefs().handedness,
  });
  pc.save();
  pc.beginPath();
  pc.arc(ox, oy, 5, 0, Math.PI * 2);
  pc.strokeStyle = "#4f46e5";
  pc.lineWidth = 1.5;
  pc.stroke();
  pc.restore();

  drawTouchReadout(ox, oy);
}

function drawOverallDims(bb) {
  pc.strokeStyle = "#9a8f78";
  pc.fillStyle = "#6b6356";
  pc.lineWidth = 1;
  pc.lineCap = "butt";
  // outside the dimension chain (js/plan2d/dim_chains.js), which sits
  // between it and the building
  var off = OVERALL_DIM_PX,
    ext = 5;
  var yT = sz(bb.minz) - off,
    xA = sx(bb.minx),
    xB = sx(bb.maxx);
  dimLine(xA, yT, xB, yT, 0, ext, planLen(bb.w, { suffix: false }));
  pc.beginPath();
  pc.moveTo(xA, sz(bb.minz));
  pc.lineTo(xA, yT - ext);
  pc.moveTo(xB, sz(bb.minz));
  pc.lineTo(xB, yT - ext);
  pc.stroke();
  var xL = sx(bb.minx) - off,
    zA = sz(bb.minz),
    zB = sz(bb.maxz);
  dimLine(xL, zA, xL, zB, ext, 0, planLen(bb.d, { suffix: false }));
  pc.beginPath();
  pc.moveTo(sx(bb.minx), zA);
  pc.lineTo(xL - ext, zA);
  pc.moveTo(sx(bb.minx), zB);
  pc.lineTo(xL - ext, zB);
  pc.stroke();
}
// Decide what the distance overlay measures from, and render it. Runs on every
// repaint (drawn last), so it's always visible: it follows the cursor over empty
// floor (point origin) and snaps to an item's clearances when over/selecting one.
function drawMeasureOverlay() {
  beginPaint("2d"); // the clickable distance pills of this paint (js/distance_pills.js)
  if (S.action === "pan" || S.action === "pinch") return;
  if (!(S.SC > 0) || !isFinite(S.SC)) return;
  var origins = [],
    seen = [];
  function add(it, pt, skip, sides) {
    origins.push({ it: it, pt: pt, skip: skip || it || null, sides: !!sides });
    if (it) seen.push(it);
  }
  // Wall / arc / rectangle tools keep the four-axis overlay on the live
  // cursor, including before the first click: that is when you are choosing
  // where a wall should start, and the CSS crosshair alone does not say how
  // far the nearest walls and objects are. Manual reference walls are also
  // made unmistakable here.
  var draftPt =
    (S.tool === "wall" || S.tool === "arcwall" || S.tool === "rect" || S.tool === "slabvoid") && S.previewPt;
  if (draftPt) {
    add(null, S.previewPt);
    drawLiveMeasureCross(S.previewPt.x, S.previewPt.z);
    if (S.measureTarget === "manual") {
      pc.save();
      pc.strokeStyle = "#d6336c";
      pc.lineWidth = 4;
      (S.measureWalls || []).forEach(function (id) {
        var w = wallById(id), g = w && wallGeom(w);
        if (!g) return;
        pc.beginPath(); pc.moveTo(sx(g.a.x), sz(g.a.z)); pc.lineTo(sx(g.b.x), sz(g.b.z)); pc.stroke();
      });
      pc.restore();
    }
  }
  // a selected item always shows its clearances (even mid-drag)
  if (S.sel && S.sel.kind === "item") add(S.sel.ref, null, null, true);
  /* Placeholder points are placed precisely so their clearances can be read,
     so they carry the overlay permanently rather than only while hovered —
     that IS the point of a point. `showDims` is the switch for anyone who
     wants a quiet plan. An OCCUPIED point measures from its object's outer
     edges rather than from the point: once something stands there, the useful
     number is the clear space left around the thing, not the distance to a
     dot buried inside it. */
  markers().forEach(function (m) {
    var selM =
      (S.sel && S.sel.kind === "marker" && S.sel.ref === m) || S.hoverMarker === m;
    if (!selM && !S.showDims) return;
    var held = markerItem(m);
    if (!held) add(null, m);
    else if (seen.indexOf(held) === -1) add(held, null);
  });
  // plus the always-on cursor overlay when idle: over an item -> its clearances,
  // over empty floor -> distances from the cursor point itself
  if (!S.action && S.tool === "select") {
    if (S.hoverItem) {
      if (seen.indexOf(S.hoverItem) === -1) add(S.hoverItem, null, null, true);
    } else if (S.hoverPt && !hitMarker(S.hoverPt.x, S.hoverPt.z) && !S.wallProbe) {
      // resting the cursor ON a point would draw a second, nearly identical set
      // of leaders over the point's own — and the point's is the better one
      // (it measures past the object standing there). ON a wall the wall probe
      // already says where along it you are; four leaders from inside the wall
      // added only near-copies of its two numbers and the distances to the
      // wall's own faces (the "6" and "4" stacked on a hovered wall).
      add(null, S.hoverPt);
    }
  }
  origins.forEach(function (o) {
    if (o.sides) drawItemSides(o.it);
    else if (o.it) drawMeasureFrom(o.it.x, o.it.z, itemCorners(o.it), o.skip);
    else drawMeasureFrom(o.pt.x, o.pt.z, null, o.skip);
  });
}
/* Leaders from a bare POINT (the hovered floor, the drafting cursor) are a
   glance aid, so they keep only what answers "how far is the next thing":
   - no gap under MEASURE_MIN_GAP — that is the cursor sitting in or against a
     wall, measuring the wall's own faces;
   - one number per direction when the nearest wall and the nearest item are
     the same distance away (the wall wins);
   - while a wall is being drawn, not the leader running back along it: the
     segment's own length label already says that.
   An item's or a point's clearances (ownCs, markers) are not filtered — there a
   3 cm gap is the answer.
   A hidden distance to an ITEM is not simply lost: the number on the opposite
   side carries it as "95/100" — this side's distance over the whole span
   between the two edges — so a cursor 5 cm from an item's edge still says how
   close it is, without a cramped "5" on top of the edge. With nothing on the
   opposite side to carry it, the short one is shown after all. */
var MEASURE_MIN_GAP = 10, MEASURE_LABEL_MIN_PX = 26;
function quietPointHits(ox, oz, hits) {
  var back = null;
  if (S.tool === "wall" && S.drawing && S.drawFrom != null && S.nodes[S.drawFrom]) {
    var a = S.nodes[S.drawFrom], L = Math.hypot(a.x - ox, a.z - oz);
    if (L > 1) back = { x: (a.x - ox) / L, z: (a.z - oz) / L };
  }
  var kept = [], hidden = [];
  hits.forEach(function (r) {
    if (!(r.gap >= MEASURE_MIN_GAP)) {
      if (r.kind === "item") hidden.push(r);
      return;
    }
    if (back && r.dir.dx * back.x + r.dir.dz * back.z > 0.99) return; // within ~8°
    for (var i = 0; i < kept.length; i++) {
      var k = kept[i];
      if (k.dir.dx === r.dir.dx && k.dir.dz === r.dir.dz && Math.abs(k.gap - r.gap) < 3) {
        if (k.kind === "item" && r.kind !== "item") kept[i] = r;
        return;
      }
    }
    kept.push(r);
  });
  // a number whose leader is shorter than the number is unreadable and lands
  // on its neighbours; the dashed leader alone still shows the gap
  kept.forEach(function (r) {
    if (r.gap * S.SC < MEASURE_LABEL_MIN_PX) {
      r.noLabel = true;
      if (r.kind === "item") hidden.push(r);
    }
  });
  hidden.forEach(function (h) {
    var opp = null;
    kept.forEach(function (k) {
      if (!k.noLabel && k.dir.dx === -h.dir.dx && k.dir.dz === -h.dir.dz && (!opp || k.gap < opp.gap)) opp = k;
    });
    if (opp) {
      var span = opp.gap + h.gap;
      if (!opp.span || span < opp.span) opp.span = span;
    } else if (h.noLabel) h.noLabel = false;
    else if (kept.indexOf(h) === -1) kept.push(h);
  });
  return kept;
}

// Small CAD-style target at the live drafting point so the four measurement
// axes are visible even before a ray has hit anything.
function drawLiveMeasureCross(ox, oz) {
  var X = sx(ox),
    Y = sz(oz),
    arm = 12;
  pc.save();
  pc.strokeStyle = "rgba(63,107,120,.9)";
  pc.lineWidth = 1.25;
  pc.setLineDash([]);
  pc.beginPath();
  pc.moveTo(X - arm, Y);
  pc.lineTo(X - 3, Y);
  pc.moveTo(X + 3, Y);
  pc.lineTo(X + arm, Y);
  pc.moveTo(X, Y - arm);
  pc.lineTo(X, Y - 3);
  pc.moveTo(X, Y + 3);
  pc.lineTo(X, Y + arm);
  pc.stroke();
  pc.beginPath();
  pc.arc(X, Y, 2.2, 0, 7);
  pc.fillStyle = "rgba(63,107,120,.95)";
  pc.fill();
  pc.restore();
}

// Dashed leaders from an origin (an item's edges, or a bare point when ownCs is
// null) to the nearest object — wall inner face or another item's edge — along
// +x/-x/+z/-z, each labelled with the gap in cm. The distances themselves come
// from measure4 so the inspector can print the very same numbers. Leader lines
// are drawn first, labels afterward so the numbers sit above every leader.
// Wall-drawing tools in "nearest" mode show BOTH the nearest wall and the
// nearest item on each axis, in two colours, because collapsing them to one
// number hid the wall behind a sofa (or the sofa behind a wall).
function drawMeasureFrom(ox, oz, ownCs, skip) {
  var target = S.measureTarget || "nearest";
  var drafting =
    S.tool === "wall" || S.tool === "arcwall" || S.tool === "rect" || S.tool === "slabvoid";
  var hits = measure4(ox, oz, ownCs, skip, {
    target: drafting && target === "nearest" ? "both" : target,
    wallIds: S.measureWalls || [],
  });
  if (!ownCs) hits = quietPointHits(ox, oz, hits);
  var labels = [];
  pc.save();
  pc.lineWidth = 1.5;
  pc.setLineDash([4, 4]);
  hits.forEach(function (r) {
    var d = r.dir;
    var item = r.kind === "item";
    pc.strokeStyle = item ? "rgba(180, 83, 9, 0.75)" : "rgba(63, 107, 120, 0.7)";
    pc.beginPath();
    pc.moveTo(sx(ox + d.dx * r.ownT), sz(oz + d.dz * r.ownT));
    pc.lineTo(sx(ox + d.dx * r.hitT), sz(oz + d.dz * r.hitT));
    pc.stroke();
    if (r.noLabel) return; // see quietPointHits
    labels.push({
      x: ox + d.dx * (r.ownT + r.gap / 2),
      z: oz + d.dz * (r.ownT + r.gap / 2),
      txt: Math.round(r.gap) + (r.span ? "/" + Math.round(r.span) : ""),
      color: item ? "#b45309" : "#3f6b78",
    });
  });
  pc.restore();

  // labels last -> above the leaders and every other layer
  labels.forEach(function (l) {
    label(l.x, l.z, l.txt, l.color, false);
  });
}

/* A selected or hovered piece measures from its REAL outline in its own
   front / back / left / right (js/measure.js measureSides), the numbers the 3D
   pane paints: leaders between the contact points (square to a wall), plus
   the closest-points lines to the near pieces. A piece on a wall measures along
   the wall instead (js/interaction/wall_plane_guides.js), so none here. */
function drawItemSides(it) {
  if (isOnWall(it)) return;
  // measured once per pose and scene, shared with the 3D pane (js/measure_cache.js)
  var live = liveClearances(it), hits = live.hits;
  pc.save();
  pc.lineWidth = 1.5;
  pc.setLineDash([4, 4]);
  hits.forEach(function (h) {
    pc.strokeStyle = h.kind === "wall" ? "rgba(63, 107, 120, 0.7)" : h.kind === "opening" ? "rgba(13, 128, 96, 0.8)" : "rgba(180, 83, 9, 0.75)";
    pc.beginPath(); pc.moveTo(sx(h.from.x), sz(h.from.z)); pc.lineTo(sx(h.to.x), sz(h.to.z)); pc.stroke();
  });
  pc.restore();
  // crossing lines (several near pieces): a label slides along its own line
  var at = labelSpots(hits, function (p) { return { x: sx(p.x), y: sz(p.z) }; });
  hits.forEach(function (h, i) {
    // a door / window reached, or faced, is named (js/wall_plane_strings.js)
    var what = h.kind === "opening" ? h.what : h.facing, txt = String(Math.round(h.gap)) + (what ? " " + reachName(what) : "");
    pillLabel2D(it, h, at[i].x, at[i].z, txt, h.kind === "wall" ? "#3f6b78" : h.kind === "opening" ? "#0d8060" : "#b45309");
  });
  // the plan cannot draw a vertical: the selected piece's up / down clearance as one pill by it
  if (!(S.sel && S.sel.kind === "item" && S.sel.ref === it)) return;
  var v = live.up;
  var up = v.filter(function (h) { return h.dir === "up" && h.kind !== "opening"; })[0], dn = v.filter(function (h) { return h.dir === "down"; })[0],
    sill = v.filter(function (h) { return h.kind === "opening"; })[0];
  var txt = [up && "↑ " + Math.round(up.gap), sill && "↑ " + Math.round(sill.gap) + " " + reachName(sill.what), dn && "↓ " + Math.round(dn.gap)].filter(Boolean).join("  ");
  if (txt) pillLabel2D(it, [dn, sill, up], it.x, it.z, txt, "#3f6b78");
}

function markerGlyph(X, Y, filled, isSel) {
  var R = isSel ? 9.5 : 8,
    arm = R + (isSel ? 6 : 5);
  pc.save();
  pc.strokeStyle = MK_COL;
  pc.lineWidth = isSel ? 2.2 : 1.6;
  pc.setLineDash([]);
  pc.beginPath();
  pc.moveTo(X - arm, Y);
  pc.lineTo(X - R + 1, Y);
  pc.moveTo(X + R - 1, Y);
  pc.lineTo(X + arm, Y);
  pc.moveTo(X, Y - arm);
  pc.lineTo(X, Y - R + 1);
  pc.moveTo(X, Y + R - 1);
  pc.lineTo(X, Y + arm);
  pc.stroke();
  pc.beginPath();
  pc.arc(X, Y, R, 0, 7);
  pc.fillStyle = filled ? MK_COL : "rgba(255,255,255,.85)";
  pc.fill();
  pc.stroke();
  if (!filled) {
    pc.beginPath();
    pc.arc(X, Y, 2.4, 0, 7);
    pc.fillStyle = MK_COL;
    pc.fill();
  }
  pc.restore();
}
function drawMarkers() {
  // the name sits DIAGONALLY off the glyph: the four axes are already occupied
  // by this point's own clearance labels, and a name on top of a measurement
  // hides the number the point exists to show
  var off = 17 / (S.SC || 1);
  markers().forEach(function (m) {
    var isSel = (S.sel && S.sel.kind === "marker" && S.sel.ref === m) ||
      eraseHover("marker", m);
    markerGlyph(sx(m.x), sz(m.z), !!markerItem(m), isSel);
    // a point up a wall or on the ceiling looks identical from above, so its
    // height rides on the label — otherwise the plan silently lies about it
    var nm = markerLabel(m) + (m.y > 0.5 ? " ↑" + Math.round(m.y) : "");
    label(m.x + off, m.z - off, nm, MK_COL, isSel);
  });
  // ghost of where the next point would land while the tool is armed
  if (S.tool === "point" && S.markerPreview) {
    pc.save();
    pc.globalAlpha = 0.5;
    markerGlyph(sx(S.markerPreview.x), sz(S.markerPreview.z), false, false);
    pc.restore();
  }
}

function drawFreeAnnotations() {
  for (const a of S.annotations || []) {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) continue;
    const x = sx(a.x), y = sz(a.z), x2 = sx(a.x2), y2 = sz(a.z2);
    pc.save();
    pc.strokeStyle = "#234961"; pc.fillStyle = "#234961"; pc.lineWidth = 1.5;
    pc.font = "12px sans-serif";
    if (a.kind === "note") {
      pc.beginPath(); pc.arc(x, y, 3, 0, Math.PI * 2); pc.fill();
      String(a.text || "Note").split("\n").forEach((line, i) => pc.fillText(line, x + 8, y - 7 + i * 15));
    } else if (a.kind === "symbol") {
      const symbol = a.symbol || "north";
      if (symbol === "north") {
        pc.beginPath(); pc.moveTo(x, y - 22); pc.lineTo(x - 10, y + 10); pc.lineTo(x, y + 5); pc.lineTo(x + 10, y + 10); pc.closePath(); pc.stroke();
        pc.fillText("N", x - 5, y - 27);
      } else if (symbol === "level") {
        pc.beginPath(); pc.moveTo(x - 12, y); pc.lineTo(x + 12, y); pc.moveTo(x, y); pc.lineTo(x + 8, y - 8); pc.lineTo(x + 8, y + 8); pc.closePath(); pc.stroke();
        pc.fillText(a.text || "±0.00", x + 14, y + 4);
      } else {
        pc.beginPath(); pc.arc(x, y, 9, 0, Math.PI * 2); pc.stroke();
        pc.fillText(a.text || "A", x - 4, y + 4);
      }
    } else if (Number.isFinite(a.x2) && Number.isFinite(a.z2)) {
      pc.setLineDash(a.kind === "section" ? [7, 5] : []);
      pc.beginPath(); pc.moveTo(x, y); pc.lineTo(x2, y2); pc.stroke(); pc.setLineDash([]);
      const dx = x2 - x, dy = y2 - y, length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
      if (a.kind === "dimension") {
        for (const [px, py] of [[x, y], [x2, y2]]) {
          pc.beginPath(); pc.moveTo(px - nx * 7, py - ny * 7); pc.lineTo(px + nx * 7, py + ny * 7); pc.stroke();
        }
        const distance = Math.hypot(a.x2 - a.x, a.z2 - a.z);
        pc.fillText(a.unit === 'cm' ? Math.round(distance * 10) / 10 + ' cm' : fmtLen(distance, { domain: "plan" }), (x + x2) / 2 + nx * 8, (y + y2) / 2 + ny * 8);
      } else {
        for (const [px, py] of [[x, y], [x2, y2]]) { pc.beginPath(); pc.arc(px, py, 10, 0, Math.PI * 2); pc.stroke(); pc.fillText(a.text || "A", px - 4, py + 4); }
      }
    }
    pc.restore();
  }
}
function drawSlabOpenings() {
  slabOpenings().forEach(function (o) {
    if (!(o.w > 0) || !(o.d > 0)) return;
    var cs = openingCorners(o);
    var isSel = (S.sel && S.sel.kind === "slabvoid" && S.sel.ref === o) ||
      eraseHover("slabvoid", o);
    // the plan's own tone: dark ink vanishes on the dark canvas
    var dark = canvasToneIsDark(plan);
    function outlinePath() {
      pc.beginPath();
      cs.forEach(function (p, i) {
        var X = sx(p.x), Z = sz(p.z);
        if (i) pc.lineTo(X, Z); else pc.moveTo(X, Z);
      });
      pc.closePath();
    }
    pc.save();
    outlinePath();
    // a hole reads dark on a room's floor finish whatever the canvas tone
    pc.fillStyle = isSel ? "rgba(196,92,74,.30)" : "rgba(24,26,32,.42)";
    pc.fill();
    pc.save();
    pc.clip();
    var minx = Math.min(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
    var maxx = Math.max(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
    var minz = Math.min(cs[0].z, cs[1].z, cs[2].z, cs[3].z);
    var maxz = Math.max(cs[0].z, cs[1].z, cs[2].z, cs[3].z);
    pc.strokeStyle = isSel ? "rgba(196,92,74,.7)" : "rgba(235,230,222,.55)";
    pc.lineWidth = 1;
    var step = 18 * S.SC, gx, gz;
    var x0 = sx(minx) - 40, x1 = sx(maxx) + 40, z0 = sz(minz) - 40, z1 = sz(maxz) + 40;
    pc.beginPath();
    for (gx = x0 - (z1 - z0); gx < x1; gx += step) {
      pc.moveTo(gx, z0);
      pc.lineTo(gx + (z1 - z0), z1);
    }
    pc.stroke();
    pc.restore();
    // the current path is the hatch now: rebuild the outline before dashing it
    outlinePath();
    var ink = isSel ? "#c45c4a" : dark ? "#d8d2c8" : "#3a3733";
    pc.strokeStyle = ink;
    pc.lineWidth = isSel ? 2.4 : 1.6;
    pc.setLineDash([6, 4]);
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    // the pill is light on both canvases, so its text keeps a dark ink
    label(o.x, o.z, voidDisplayName(o) || t("sv_void"), isSel ? "#c45c4a" : "#3a3733");
  });
}
function drawPlanCursors() {
  pruneCursors();
  Object.keys(cursors).forEach(function (code) {
    var c = cursors[code];
    if (!c || !fin(c.x) || !fin(c.z)) return;
    var X = sx(c.x), Z = sz(c.z);
    pc.save();
    pc.fillStyle = "#4f46e5";
    pc.beginPath();
    pc.moveTo(X, Z);
    pc.lineTo(X + 11, Z + 4);
    pc.lineTo(X + 4, Z + 11);
    pc.closePath();
    pc.fill();
    pc.strokeStyle = "#fff";
    pc.lineWidth = 1;
    pc.stroke();
    label(c.x + 8 / S.SC, c.z - 8 / S.SC, c.name || code, "#4f46e5");
    pc.restore();
  });
}
/* The hover read-out card for a point: everything the inspector prints, drawn
   next to the glyph so a point can be checked without selecting it. */
function markerCard(m) {
  var info = markerInfo(m, ceilingHeight()),
    held = info.held;
  var lines = [];
  lines.push({ txt: markerLabel(m) + (held ? " · " + flabel(held.type) : ""), head: true });
  lines.push({
    txt:
      planLen(m.x, { suffix: false }) + ", " + planLen(m.z, { suffix: false }) +
      (info.y > 0.5 ? "  ↑" + planLen(info.y, { suffix: false }) : "") +
      "  " + t("mk_sf_" + (m.surface || "floor")),
  });
  var room = info.room ? info.roomName || t("room") : t("mk_outside");
  if (info.near)
    room += "  ·  " + flabel(info.near.item.type) + " " + planLen(info.near.dist);
  lines.push({ txt: room });
  function g(k) {
    return info.dm[k] == null ? "—" : planLen(info.dm[k], { suffix: false });
  }
  lines.push({
    txt: "↑" + g("n") + "  ↓" + g("s") + "  ←" + g("w") + "  →" + g("e") + "  " + unitLabel("plan"),
  });
  if (info.tight.length)
    lines.push({
      txt: t("mk_tight", {
        req: planLen(m.req, { suffix: false }),
        sides: info.tight.map(function (k) { return t("mk_dir_" + k); }).join(", "),
      }),
      warn: true,
    });
  else if (m.req != null) lines.push({ txt: t("mk_req") + ": " + planLen(m.req) });
  if (m.note) lines.push({ txt: m.note });

  infoCard(m.x, m.z, lines);
}

/* Everything a corner has to say, next to the corner: which walls meet here,
   how long they are and which way they run, plus the angle between them —
   flagged when it is neither square nor a straight run, the same complaint the
   warning list makes, at the place the eye already is. */
function nodeCard(ni) {
  var info = jointInfo(ni);
  if (!info) return;
  var lines = [];
  lines.push({
    txt: t("nd_title") + " · " + planLen(info.x, { suffix: false }) + ", " + planLen(info.z, { suffix: false }),
    head: true,
  });
  lines.push({
    txt: info.open ? t("nd_open") : t("nd_walls", { n: info.arms.length }),
    warn: info.open,
  });
  info.arms.forEach(function (arm) {
    lines.push({
      txt:
        t("wall") + " " + arm.wall.id + "  " + planLen(arm.len) +
        "  " + Math.round(arm.ang) + "°",
    });
  });
  info.gaps.forEach(function (g) {
    var deg = Math.round(g.deg * 10) / 10,
      square = Math.abs(deg - 90) < 0.5 || Math.abs(deg - 270) < 0.5,
      straight = Math.abs(deg - 180) < 0.5;
    lines.push({
      txt: g.a.id + " ↔ " + g.b.id + "  " + deg + "°",
      warn: !square && !straight,
    });
  });
  infoCard(info.x, info.z, lines, "#2c5560");
}

/* The card itself: drawn in screen space next to a world point, kept upright
   against plan rotation (same trick as label), and nudged back inside the
   canvas near an edge — a card that runs off the pane is worse than no card. */
function infoCard(wxc, wzc, lines, col) {
  col = col || MK_COL;
  var X = sx(wxc), Y = sz(wzc), a = planRotRad();
  pc.save();
  if (a) { pc.translate(X, Y); pc.rotate(-a); pc.translate(-X, -Y); }
  pc.textBaseline = "middle";
  pc.textAlign = "left";
  var padX = 8, padY = 6, lh = 14, w = 0;
  lines.forEach(function (l) {
    pc.font = (l.head ? "bold 11px" : "10px") + " Arial";
    w = Math.max(w, pc.measureText(l.txt).width);
  });
  var bw = w + padX * 2,
    bh = lines.length * lh + padY * 2,
    bx = X + 16,
    by = Y + 16;
  // flip to the other side of the glyph rather than hang off the pane
  if (bx + bw > (S.CW || plan.width) - 4) bx = X - 16 - bw;
  if (by + bh > (S.CH || plan.height) - 4) by = Y - 16 - bh;
  if (bx < 4) bx = 4;
  if (by < 4) by = 4;
  pc.fillStyle = "rgba(255,255,255,.95)";
  pc.strokeStyle = col;
  pc.lineWidth = 1.2;
  pc.setLineDash([]);
  pc.beginPath();
  pc.rect(bx, by, bw, bh);
  pc.fill();
  pc.stroke();
  lines.forEach(function (l, i) {
    pc.font = (l.head ? "bold 11px" : "10px") + " Arial";
    pc.fillStyle = l.head ? col : l.warn ? "#c92a2a" : "#33312c";
    pc.fillText(l.txt, bx + padX, by + padY + i * lh + lh / 2);
  });
  pc.restore();
}

function dimLine(x0, y0, x1, y1, ax, ay, txt) {
  pc.beginPath();
  pc.moveTo(x0, y0);
  pc.lineTo(x1, y1);
  pc.moveTo(x0 - ax, y0 - ay);
  pc.lineTo(x0 + ax, y0 + ay);
  pc.moveTo(x1 - ax, y1 - ay);
  pc.lineTo(x1 + ax, y1 + ay);
  pc.stroke();
  // base-frame pixels -> plan point (sx/sz inverted; the plan rotation is
  // the context's), so the shared label placement sees it
  var mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2;
  alignedLabel((mx - S.OX) / S.SC, (my - S.OY) / S.SC, txt, "#5f574b",
    Math.atan2(y1 - y0, x1 - x0), true);
}
// You-are-here indicator for walk (fpv/tpv) mode: dot + view cone at the
// walker's plan position, pointing where the 3D camera looks. World dir is
// (sin yaw, cos yaw) in (x,z); canvas x→right, z→down maps it 1:1.
function drawWalker() {
  var w = S.walk2D;
  if (!w) return;
  var X = sx(w.x),
    Y = sz(w.z),
    dx = Math.sin(w.yaw),
    dy = Math.cos(w.yaw),
    half = Math.PI / 6, // 30° half-angle view cone
    R = 46;
  pc.save();
  // view cone
  var a0 = Math.atan2(dy, dx) - half,
    a1 = Math.atan2(dy, dx) + half;
  var grad = pc.createRadialGradient(X, Y, 4, X, Y, R);
  grad.addColorStop(0, "rgba(63,107,120,.45)");
  grad.addColorStop(1, "rgba(63,107,120,0)");
  pc.beginPath();
  pc.moveTo(X, Y);
  pc.arc(X, Y, R, a0, a1);
  pc.closePath();
  pc.fillStyle = grad;
  pc.fill();
  // body dot
  pc.beginPath();
  pc.arc(X, Y, 6, 0, 7);
  pc.fillStyle = "#3f6b78";
  pc.fill();
  pc.lineWidth = 2;
  pc.strokeStyle = "#fff";
  pc.stroke();
  pc.restore();
}

function drawScale() {
  if (!planViewReady()) return;
  var cm = niceScaleCm(S.SC);
  var w = cm * S.SC,
    x0 = S.CW - w - 16,
    /* The CAD strip is user-movable/resizable and its wrapper is taller than
       the inner status row. Reserving a hard-coded 30px drew the scale card
       underneath the wrapper. Measure the live bottom obstruction and leave
       an 8px visual gutter above it. */
    y0 = S.CH - bottomReservedPx(x0 - 6, x0 + w + 6) - 21,
    seg = 4,
    sw = w / seg;
  pc.save();
  pc.fillStyle = "rgba(255,255,255,.7)";
  pc.fillRect(x0 - 6, y0 - 13, w + 12, 26);
  for (var s = 0; s < seg; s++) {
    pc.fillStyle = s % 2 ? "#fff" : "#33312c";
    pc.fillRect(x0 + s * sw, y0 - 4, sw, 5);
  }
  pc.strokeStyle = "#33312c";
  pc.lineWidth = 1;
  pc.strokeRect(x0, y0 - 4, w, 5);
  pc.fillStyle = "#33312c";
  pc.font = "10px Arial";
  pc.textAlign = "left";
  pc.textBaseline = "middle";
  pc.fillText(planLen(cm), x0, y0 + 8);
  pc.restore();
}

/* How far up from the plan's bottom edge the scale card must sit to clear
   whatever floats over that corner: the CAD strip, and the touch layouts'
   tool dock, which on a tablet or an unfolded fold floats 10px above the
   edge and hid the card entirely. Only obstructions under the card's own
   x range [fromX, toX] (plan pixels) count; with no range, any of them does
   (fitView frames the plan above them). */
function bottomReservedPx(fromX, toX) {
  if (typeof document === "undefined" || !plan) return 0;
  var pr = plan.getBoundingClientRect();
  var reserve = 0;
  var cad = document.getElementById("cad-status");
  var hosts = [];
  if (cad && !cad.hidden && cad.offsetParent) hosts.push((cad.closest && cad.closest('.pt-panel[data-panel="cad"]')) || cad);
  var dock = document.querySelector(".ps-dock");
  // fixed on a phone held sideways, so offsetParent is null even when shown
  if (dock && dock.getClientRects().length && getComputedStyle(dock).visibility !== "hidden") hosts.push(dock);
  for (var i = 0; i < hosts.length; i++) {
    var er = hosts[i].getBoundingClientRect();
    if (!er.height || er.top >= pr.bottom || er.bottom < pr.bottom - 24) continue;
    if (fromX != null && (er.right <= pr.left + fromX || er.left >= pr.left + toX)) continue;
    reserve = Math.max(reserve, Math.min(pr.height, pr.bottom - er.top));
  }
  return reserve;
}
function drawRank(it) {
  return isLamp(it) ? 3 : it.type === "rug" ? 0 : it.type === "island" ? 1 : 2;
}

/* Erase-hover red is selection chrome by another name — it tracks the pointer
   — so like every other highlight it is false on the model pass and drawn by
   the HUD pass on top. */
function eraseHover(kind, ref) {
  return !!(chromeOn && S.eraseHover && S.eraseHover.kind === kind && S.eraseHover.ref === ref);
}
function markCol(isSel, isErase, idle) {
  return isSel ? "#3f6b78" : isErase ? ERASE_COL : idle;
}

/* `pass`: the plan fills every wall ("fill") before it inks any ("ink", with
   that wall's result from planWallInk), so no fill covers a neighbour's line;
   with no pass (the HUD redrawing a selected wall) both, in that order. */
function drawWall(w, pass, ink) {
  if (!w || !S.nodes[w.a] || !S.nodes[w.b]) return;
  normalizeWall(w, S);
  var gm = wallGeom(w),
    isSel = chromeOn && S.sel && ((S.sel.kind === "wall" && S.sel.ref === w) ||
      (S.sel.kind === "walls" && S.sel.refs.indexOf(w) !== -1)),
    isErase = eraseHover("wall", w);
  /* Filled as a MITERED quad, not a thick stroke: a stroke can only end square
     across its own direction, which at anything but a right-angle corner
     leaves a wedge of daylight on the outside and a lump on the inside. */
  var col = markCol(isSel, isErase, "#7a7060"),
    kind = normalizeWallKind(w),
    phase = w.phase || "new",
    th = w.thickness || 0,
    demolish = phase === "demolition" || phase === "demolish";
  if (pass === "fill") {
    if (kind !== "roomDivider" && !(isPresentation() && !demolish) && !(th * S.SC < 3))
      fillWallBands(w, wallLayerBands(w, S), demolish, col);
    return;
  }
  if (kind === "roomDivider") {
    pc.save();
    pc.strokeStyle = markCol(isSel, isErase, "rgba(91,122,134,.72)");
    pc.lineWidth = isSel || isErase ? 2.5 : 1.5;
    pc.setLineDash([7, 5]);
    traceWallCentre(w);
    pc.stroke();
    pc.restore();
    return;
  }
  if (isPresentation() && !demolish) {
    /* The model pass filled every wall at once, shadow and all
       (drawPresentationWalls). The HUD redraws a selected wall on top of that
       image, so it paints its own fill — with its openings left open — and
       then the selection outline. */
    if (chromeOn) {
      pc.save();
      clipOutsideOpenings([w]);
      pc.fillStyle = planTheme().wallFill;
      pc.fill(wallPath(w));
      pc.restore();
    }
    if (isSel || isErase) {
      pc.save();
      pc.strokeStyle = isSel ? "#3f6b78" : ERASE_COL;
      pc.lineWidth = 2.3;
      pc.stroke(wallPath(w));
      pc.restore();
    }
  } else if (th * S.SC < 3) {
    pc.lineCap = "butt";
    pc.lineWidth = 3;
    pc.strokeStyle = col;
    traceWallCentre(w);
    pc.stroke();
  } else {
    var bands = wallLayerBands(w, S);
    if (pass !== "ink") fillWallBands(w, bands, demolish, col);
    // layer lines and the inked perimeter (js/wall_ink.js); a selected or
    // erase-hovered wall keeps its whole closed outline
    inkWall(w, ink, bands, demolish, isSel ? "#3f6b78" : isErase ? ERASE_COL : null);
  }
  // the half a typed length/angle edit will move: locked pick (solid) or the
  // half merely under the cursor (dashed preview)
  if (isSel) {
    var half = S.wallEditEnd === "a" || S.wallEditEnd === "b" ? S.wallEditEnd : null;
    var locked = !!half || S.wallEditEnd === "mid";
    if (!half && !locked) half = S.wallHoverHalf;
    var mid = { x: (gm.a.x + gm.b.x) / 2, z: (gm.a.z + gm.b.z) / 2 };
    var ends = S.wallEditEnd === "mid" ? ["a", "b"] : half ? [half] : [];
    ends.forEach(function (h) {
      var p = h === "a" ? gm.a : gm.b;
      pc.save();
      pc.lineCap = "butt";
      pc.lineWidth = Math.max(th * S.SC, 3);
      pc.strokeStyle = locked ? "#e0813a" : "rgba(224,129,58,.55)";
      if (!locked) pc.setLineDash([6, 4]);
      pc.beginPath();
      pc.moveTo(sx(mid.x), sz(mid.z));
      pc.lineTo(sx(p.x), sz(p.z));
      pc.stroke();
      pc.restore();
    });
  }
  /* The dimension is drawn ON THE FACE it is measured along (js/geometry.js
     wallDimSide), with a witness tick at each measured end. Which face a
     number belongs to is a real 10 cm question at every corner, so it is shown
     rather than left to be assumed. */
  // a presentation plan is annotated per room, not per wall: the wall's own
  // dimension appears only while it is selected
  // ...and a wall the outside chains already state, or a wall of a room whose
  // label prints its clear size, stays unlabelled inside the plan unless it is
  // selected (js/plan2d/dim_chains.js)
  if (S.showDims && S.SC > 0.32 && (isSel || (!isPresentation() && !chainCoveredWall(w)))) {
    var side = wallDimSide(w),
      c = wallCuts(w),
      face = side ? w.thickness / 2 : 0, // centreline dims sit on the wall
      p0 = wallPointAt(w, c.a), p1 = wallPointAt(w, gm.L - c.b),
      t0 = wallTangentAt(w, c.a), t1 = wallTangentAt(w, gm.L - c.b),
      n0 = { x: -t0.z * (side || 1), z: t0.x * (side || 1) },
      n1 = { x: -t1.z * (side || 1), z: t1.x * (side || 1) };
    pc.save();
    pc.strokeStyle = isSel ? "#2c5560" : "rgba(107,99,86,.55)";
    pc.lineWidth = 1;
    pc.beginPath();
    /* Offsets in screen pixels, not centimetres: a 12 cm offset was 50 px out
       at room zoom and 4 px at house zoom, where the number then sat on top of
       the overall dimension (drawOverallDims clears WALL_DIM_PX). */
    var tick = (WALL_DIM_PX + 4) / S.SC, lineOff = WALL_DIM_PX / S.SC;
    [[p0,n0], [p1,n1]].forEach(function (entry) {
      var p = entry[0], n = entry[1];
      pc.moveTo(sx(p.x + n.x * (face + 1 / S.SC)), sz(p.z + n.z * (face + 1 / S.SC)));
      pc.lineTo(sx(p.x + n.x * (face + tick)), sz(p.z + n.z * (face + tick)));
    });
    var dimSteps = gm.kind === "arc" ? Math.max(12, Math.ceil(gm.L / 25)) : 1;
    for (var di = 0; di <= dimSteps; di++) {
      var ds = c.a + (gm.L - c.a - c.b) * di / dimSteps,
        dp = wallPointAt(w, ds), dt = wallTangentAt(w, ds), dn = { x: -dt.z * (side || 1), z: dt.x * (side || 1) };
      if (di) pc.lineTo(sx(dp.x + dn.x * (face + lineOff)), sz(dp.z + dn.z * (face + lineOff)));
      else pc.moveTo(sx(dp.x + dn.x * (face + lineOff)), sz(dp.z + dn.z * (face + lineOff)));
    }
    pc.stroke();
    pc.restore();
    /* The selected wall also gets the measured face itself drawn on, end to
       end. "Which line is this number the length of" is the question the whole
       reference-face setting exists to answer, and a witness tick at each end
       only answers it once you already know where to look. A centreline
       dimension (side 0) shows the centreline for the same reason: without it
       the number simply floated over the wall with nothing to point at. */
    if (isSel) {
      pc.save();
      pc.strokeStyle = "#2c5560";
      pc.lineWidth = 2;
      pc.setLineDash(side ? [] : [6, 4]);
      pc.beginPath();
      for (var si = 0; si <= dimSteps; si++) {
        var ss = c.a + (gm.L - c.a - c.b) * si / dimSteps,
          sp = wallPointAt(w, ss), st = wallTangentAt(w, ss), sn = { x: -st.z * (side || 1), z: st.x * (side || 1) };
        if (si) pc.lineTo(sx(sp.x + sn.x * face), sz(sp.z + sn.z * face));
        else pc.moveTo(sx(sp.x + sn.x * face), sz(sp.z + sn.z * face));
      }
      pc.stroke();
      pc.restore();
    }
    var off = face + WALL_DIM_PX / S.SC, midS = (c.a + gm.L - c.b) / 2,
      midP = wallPointAt(w, midS), midT = wallTangentAt(w, midS), midN = { x: -midT.z * (side || 1), z: midT.x * (side || 1) };
    alignedLabel(
      midP.x + midN.x * off,
      midP.z + midN.z * off,
      planLen(wallClearLength(w), { suffix: false }),
      isSel ? "#2c5560" : "#5f574b",
      Math.atan2(midT.z, midT.x),
      isSel,
    );
  }
}

export {
  bottomReservedPx,
  drawAngleArc, drawFreeAnnotations, drawGhostWall, drawLen, drawMarkers,
  drawMeasureOverlay, drawOverallDims, drawPlanCursors, drawPreviewDims,
  drawRank, drawScale, drawSize, drawSlabOpenings, drawSnapMark,
  drawTouchGuide, drawWalker, drawWall, eraseHover, markerCard, nodeCard,
  planLen,
};
