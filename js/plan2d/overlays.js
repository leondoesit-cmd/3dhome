/* The plan view's after-render overlays: lengths and sizes, touch readouts and
   lenses, overall dimensions, measure overlay, cursors and info cards, split
   out of js/plan2d.js. It shares the editor's state through live imports from
   ../plan2d.js. */
import { fmtLen, unitLabel } from "../display_units.js";
import { ceilingHeight } from "../elevation.js";
import { flabel, isLamp } from "../furniture.js";
import { jointInfo, pendingCuts, wallById, wallClearLength, wallCuts, wallDimSide, wallGeom, wallOutline, wallPointAt, wallTangentAt } from "../geometry.js";
import { t } from "../i18n.js";
import { hitMarker, markerInfo, markerItem, markerLabel, markers } from "../markers.js";
import { itemCorners, measure4 } from "../measure.js";
import { isPresentation, planTheme } from "../plan_style.js";
import { cursors, pruneCursors } from "../plan_sync.js";
import { niceScaleCm, planRotRad, sx, sz, wx, wz } from "../plan_view.js";
import { label } from "../plan2d/constraints.js";
import { clipOutsideOpenings, traceWallCentre, wallBandPolygon, wallPath } from "../plan2d/walls.js";
import { openingCorners, slabOpenings } from "../slab_openings.js";
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
  var turnDeg = Math.round((metrics.turn * 180) / Math.PI);
  var angTxt = metrics.hasPrev
    ? (turnDeg > 0 ? "+" : "") + turnDeg + "°"
    : "∠" + Math.round((metrics.absAng * 180) / Math.PI) + "°";
  /* On a finger, the same numbers ride the draw point (drawTouchReadout); the
     midpoint copy would sit under the hand AND collide with the parallel and
     close-loop labels below. */
  if (!touchDrawing())
    label((from.x + preview.x) / 2, (from.z + preview.z) / 2, drawLen(d) + "  " + angTxt, "#3f6b78");
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
    if (!touchDrawing())
      label((preview.x + metrics.close.x) / 2, (preview.z + metrics.close.z) / 2,
        drawLen(metrics.close.dist), "#6b8a92");
  }
}

/* A small arc at the origin corner whenever the segment is locked to a
   cardinal-ish bearing — the visual confirmation that the snap took, without
   which a 90.0 and an 89.6 look identical on screen. */
function drawAngleArc(a, p) {
  var brg = segBearing(a, p);
  if (brg % 15 !== 0) return;
  var r = 22,
    X = sx(a.x),
    Y = sz(a.z);
  var to = (brg * Math.PI) / 180;
  pc.save();
  pc.strokeStyle = brg % 90 === 0 ? "#e15a46" : "#3f6b78";
  pc.lineWidth = 1.5;
  pc.beginPath();
  pc.arc(X, Y, r, Math.min(0, to), Math.max(0, to));
  pc.stroke();
  pc.restore();
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
    var turnDeg = Math.round((m.turn * 180) / Math.PI);
    return {
      main: drawLen(len),
      sub: m.hasPrev
        ? (turnDeg > 0 ? "+" : "") + turnDeg + "\u00b0"
        : "\u2220" + Math.round((m.absAng * 180) / Math.PI) + "\u00b0",
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
  var off = 18,
    ext = 6;
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
  if (S.action === "pan" || S.action === "pinch") return;
  if (!(S.SC > 0) || !isFinite(S.SC)) return;
  var origins = [],
    seen = [];
  function add(it, pt, skip) {
    origins.push({ it: it, pt: pt, skip: skip || it || null });
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
  if (S.sel && S.sel.kind === "item") add(S.sel.ref, null);
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
      if (seen.indexOf(S.hoverItem) === -1) add(S.hoverItem, null);
    } else if (S.hoverPt && !hitMarker(S.hoverPt.x, S.hoverPt.z)) {
      // resting the cursor ON a point would draw a second, nearly identical set
      // of leaders over the point's own — and the point's is the better one
      // (it measures past the object standing there)
      add(null, S.hoverPt);
    }
  }
  origins.forEach(function (o) {
    if (o.it) drawMeasureFrom(o.it.x, o.it.z, itemCorners(o.it), o.skip);
    else drawMeasureFrom(o.pt.x, o.pt.z, null, o.skip);
  });
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
    labels.push({
      x: ox + d.dx * (r.ownT + r.gap / 2),
      z: oz + d.dz * (r.ownT + r.gap / 2),
      txt: Math.round(r.gap) + "",
      color: item ? "#b45309" : "#3f6b78",
    });
  });
  pc.restore();

  // labels last -> above the leaders and every other layer
  labels.forEach(function (l) {
    label(l.x, l.z, l.txt, l.color, false);
  });
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
    pc.save();
    pc.beginPath();
    cs.forEach(function (p, i) {
      var X = sx(p.x), Z = sz(p.z);
      if (i) pc.lineTo(X, Z); else pc.moveTo(X, Z);
    });
    pc.closePath();
    pc.fillStyle = isSel ? "rgba(196,92,74,.22)" : "rgba(50,48,44,.14)";
    pc.fill();
    pc.save();
    pc.clip();
    var minx = Math.min(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
    var maxx = Math.max(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
    var minz = Math.min(cs[0].z, cs[1].z, cs[2].z, cs[3].z);
    var maxz = Math.max(cs[0].z, cs[1].z, cs[2].z, cs[3].z);
    pc.strokeStyle = isSel ? "rgba(196,92,74,.55)" : "rgba(80,76,70,.4)";
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
    pc.strokeStyle = isSel ? "#c45c4a" : "#6a6560";
    pc.lineWidth = isSel ? 2.4 : 1.6;
    pc.setLineDash([6, 4]);
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    label(o.x, o.z, o.name || t("sv_void"), isSel ? "#c45c4a" : "#6a6560");
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
  pc.save();
  pc.font = "10px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2,
    tw = pc.measureText(txt).width;
  pc.fillStyle = "rgba(255,255,255,.85)";
  pc.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 14);
  pc.fillStyle = "#6b6356";
  pc.fillText(txt, mx, my);
  pc.restore();
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
    y0 = S.CH - bottomReservedPx() - 21,
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

function bottomReservedPx() {
  if (typeof document === "undefined" || !plan) return 0;
  var el = document.getElementById("cad-status");
  if (!el || el.hidden || !el.offsetParent) return 0;
  var host = el.closest && el.closest('.pt-panel[data-panel="cad"]');
  if (!host) host = el;
  var pr = plan.getBoundingClientRect(), er = host.getBoundingClientRect();
  if (!er.height || er.top >= pr.bottom || er.bottom < pr.bottom - 10) return 0;
  return Math.max(0, Math.min(pr.height, pr.bottom - er.top));
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

function drawWall(w) {
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
    th = w.thickness || 0;
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
  var demolish = phase === "demolition" || phase === "demolish";
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
    bands.forEach(function (band) {
      var out = wallBandPolygon(w, band.start, band.end);
      pc.fillStyle = phase === "demolition" || phase === "demolish"
        ? "rgba(194,76,67,.25)"
        : (band.color || col);
      pc.beginPath();
      out.forEach(function (p, i) {
        if (i) pc.lineTo(sx(p.x), sz(p.z));
        else pc.moveTo(sx(p.x), sz(p.z));
      });
      pc.closePath(); pc.fill();
      pc.strokeStyle = "rgba(80,73,64,.35)"; pc.lineWidth = .65; pc.stroke();
    });
    {
      // A stronger perimeter distinguishes the wall from its internal layers.
      var outline = wallOutline(w);
      pc.save();
      pc.strokeStyle = isSel ? "#3f6b78" : isErase ? ERASE_COL :
        phase === "demolition" || phase === "demolish" ? "#b43d35" : "#635b50";
      pc.lineWidth = isSel || isErase ? 2.3 : 1.1;
      if (phase === "demolition" || phase === "demolish") pc.setLineDash([8, 5]);
      pc.beginPath();
      outline.forEach(function (p, i) { if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z)); });
      pc.closePath(); pc.stroke(); pc.restore();
    }
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
  if (S.showDims && S.SC > 0.32 && (!isPresentation() || isSel)) {
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
    [[p0,n0], [p1,n1]].forEach(function (entry) {
      var p = entry[0], n = entry[1];
      pc.moveTo(sx(p.x + n.x * (face - 1)), sz(p.z + n.z * (face - 1)));
      pc.lineTo(sx(p.x + n.x * (face + 9)), sz(p.z + n.z * (face + 9)));
    });
    var dimSteps = gm.kind === "arc" ? Math.max(12, Math.ceil(gm.L / 25)) : 1;
    for (var di = 0; di <= dimSteps; di++) {
      var ds = c.a + (gm.L - c.a - c.b) * di / dimSteps,
        dp = wallPointAt(w, ds), dt = wallTangentAt(w, ds), dn = { x: -dt.z * (side || 1), z: dt.x * (side || 1) };
      if (di) pc.lineTo(sx(dp.x + dn.x * (face + 4)), sz(dp.z + dn.z * (face + 4)));
      else pc.moveTo(sx(dp.x + dn.x * (face + 4)), sz(dp.z + dn.z * (face + 4)));
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
    var off = face + 12, midS = (c.a + gm.L - c.b) / 2,
      midP = wallPointAt(w, midS), midT = wallTangentAt(w, midS), midN = { x: -midT.z * (side || 1), z: midT.x * (side || 1) };
    label(
      midP.x + midN.x * off,
      midP.z + midN.z * off,
      planLen(wallClearLength(w), { suffix: false }),
      isSel ? "#2c5560" : "#6b6356",
    );
  }
}

export {
  drawAngleArc, drawFreeAnnotations, drawGhostWall, drawLen, drawMarkers,
  drawMeasureOverlay, drawOverallDims, drawPlanCursors, drawPreviewDims,
  drawRank, drawScale, drawSize, drawSlabOpenings, drawSnapMark,
  drawTouchGuide, drawWalker, drawWall, eraseHover, markerCard, nodeCard,
  planLen,
};
