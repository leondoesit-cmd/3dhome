/* The plan view's glyphs, item drawing (cabinets, symbols, stairs), room labels
   and motion cones, split out of js/plan2d.js. It shares the editor's state
   through live imports from ../plan2d.js. */
import { FURN, fcolor, flabel, isLamp, knownVSpan, lampColor, measureVSpanSoon, vspec } from "../furniture.js";
import { roomHidden, roomName, roomsTopologyKey, wallById, wallGeom } from "../geometry.js";
import { t } from "../i18n.js";
import { roomLabelFont, roomLabelLines } from "../plan_labels.js";
import { spriteMode } from "../plan_sprite_key.js";
import { itemSprite } from "../plan_sprites.js";
import { isPresentation, planTheme } from "../plan_style.js";
import { symbolPrims } from "../plan_symbols.js";
import { planRotRad, rotatePx, sx, sz } from "../plan_view.js";
import { conAngleOf, conLabel, drawAngleConstraint, drawConTargetHighlight, fmtDeg } from "../plan2d/constraints.js";
import { eraseHover, planLen } from "../plan2d/overlays.js";
import { canvasDpr, traceWallCentre } from "../plan2d/walls.js";
import { roomMeasurements } from "../room_summary.js";
import { devicePowered, isSmartType } from "../smarthome.js";
import { S, hexStr } from "../state.js";
import { itemUserVis } from "../user_layers.js";
import { anchorNode, anchorPos, conSatisfied, openingById, openingPos, wallCons } from "../wall_constraints.js";
import {
  ERASE_COL, GLYPH, LN, chromeOn, conHits, labelMeasCache, pc, rr,
  set_conForLabel, set_conHits, set_conHot, set_conLabelOcc,
  set_labelMeasCache,
} from "../plan2d.js";

/* One short line naming a warning — shared by the canvas label and the list. */
export function warnLabel(wr) {
  if (wr.kind === "openEnd")
    return wr.ignored ? t("cw_intentionalEnd") : (wr.near ? t("cw_openEndNear") : t("cw_openEnd"));
  var a = wr && wr.angle;
  return t("cw_angle", { a: Number.isFinite(a) ? Number(a).toFixed(1) : "?" });
}

function gStroke(lw) {
  pc.strokeStyle = LN;
  pc.lineWidth = lw || 1.2;
  pc.lineCap = "butt";
}
function gCirc(x, y, r, fill) {
  pc.beginPath();
  pc.arc(x, y, r, 0, 7);
  if (fill) {
    pc.fillStyle = fill;
    pc.fill();
  }
  pc.stroke();
}
function doorsGlyph(w, d, n) {
  gStroke();
  for (var i = 1; i < n; i++) {
    var x = -w / 2 + (i * w) / n;
    pc.beginPath();
    pc.moveTo(x, -d / 2 + 2);
    pc.lineTo(x, d / 2 - 2);
    pc.stroke();
  }
}

export function drawCabinetPlanSwings(context,P,sx,sz) {
  var seen=new Set();
  (P.swings||[]).forEach(function(sw){
    var key=[sw.pivot.x,sw.pivot.z,sw.start,sw.sweep,sw.reach].join("|");if(seen.has(key))return;seen.add(key);
    context.save();context.strokeStyle="rgba(91,122,134,.85)";context.setLineDash([3,3]);context.beginPath();
    // Polyline sampling retains the actual quarter-turn under different X/Z scales.
    for(var i=0;i<=24;i++){var angle=sw.start+sw.sweep*i/24,x=(sw.pivot.x+sw.reach*Math.cos(angle))*sx,z=(sw.pivot.z+sw.reach*Math.sin(angle))*sz;
      if(i===0)context.moveTo(x,z);else context.lineTo(x,z);}
    context.stroke();context.setLineDash([]);context.beginPath();context.moveTo(sw.pivot.x*sx,sw.pivot.z*sz);
    context.lineTo((sw.pivot.x+sw.reach*Math.cos(sw.start+sw.sweep))*sx,(sw.pivot.z+sw.reach*Math.sin(sw.start+sw.sweep))*sz);
    context.stroke();context.restore();
  });
}

/* A piece on a faded user layer (js/user_layers.js) draws at a third of its
   strength; the hidden ones never get here (hiddenSets). */
function drawItem(it) {
  if (it && it.ulayer && itemUserVis(it) === "ghost") {
    pc.save();
    pc.globalAlpha *= 0.35;
    try {
      drawItemInner(it);
    } finally {
      pc.restore();
    }
    return;
  }
  drawItemInner(it);
}
function drawItemInner(it) {
  var f = FURN[it.type],
    isSelL = (chromeOn && S.sel && S.sel.kind === "item" && S.sel.ref === it) ||
      (chromeOn && S.sel && S.sel.kind === "items" && S.sel.refs.indexOf(it) !== -1) ||
      eraseHover("item", it);
  if (isLamp(it)) {
    /* Presentation: a ceiling fitting is not furniture you would draw on a
       plan of the floor, so it shows only while selected; floor and table
       lamps are pictured like any other piece. */
    if (isPresentation() && it.w > 0 && it.d > 0) {
      var lv = null;
      try { lv = knownVSpan(it); } catch (e) { lv = null; }
      // not measured yet (a fresh plan): wait for it rather than build the
      // model inside this paint, and do not flash a ceiling fitting meanwhile
      if (!lv) {
        measureVSpanSoon(it);
        if (isSelL) drawLamp(it, f, isSelL);
        return;
      }
      if (lv.lo >= 150) {
        if (isSelL) drawLamp(it, f, isSelL);
        return;
      }
      pc.save();
      pc.translate(sx(it.x), sz(it.z));
      pc.rotate(((it.rot || 0) * Math.PI) / 180);
      var drawn = drawItemPresentation(it, it.w * S.SC, it.d * S.SC, isSelL);
      pc.restore();
      if (drawn) return;
    }
    drawLamp(it, f, isSelL);
    return;
  }
  if (!(it.w > 0) || !(it.d > 0)) return;
  var A = ((it.rot || 0) * Math.PI) / 180;
  pc.save();
  pc.translate(sx(it.x), sz(it.z));
  pc.rotate(A);
  var w = it.w * S.SC,
    d = it.d * S.SC,
    isSel = isSelL;
  if (isPresentation() && drawItemPresentation(it, w, d, isSel)) {
    pc.restore();
    if (it.type === "motionSensor") drawMotionCone(it);
    if (isSmartType(it.type) && !isLamp(it)) drawSmartPip(it);
    if (it.locked) drawLock(it);
    return;
  }
  rr(-w / 2, -d / 2, w, d, 5);
  pc.fillStyle = fcolor(it);
  pc.globalAlpha = it.type === "rug" ? 0.85 : 1;
  pc.fill();
  pc.globalAlpha = 1;
  pc.lineWidth = isSel ? 3 : 1.4;
  pc.strokeStyle = isSel && eraseHover("item", it) ? ERASE_COL : isSel ? "#3f6b78" : "#b3a586";
  pc.stroke();
  var glyphFn = it.cab ? GLYPH.cabsys : GLYPH[it.type];
  if (glyphFn && w > 16 && d > 12) glyphFn(w, d, it);
  if (it.type !== "rug" && it.type !== "cabsys" && !it.cab) {
    pc.strokeStyle = "#5b7a86";
    pc.lineWidth = 2.6;
    pc.lineCap = "round";
    pc.beginPath();
    pc.moveTo(-w / 2 + 6, d / 2 - 3);
    pc.lineTo(w / 2 - 6, d / 2 - 3);
    pc.stroke();
  }
  if (w > 44 && d > 26) {
    pc.rotate(-A - planRotRad()); // upright: cancel item + plan rotation
    pc.fillStyle = "#2f2d28";
    pc.textAlign = "center";
    pc.textBaseline = "middle";
    pc.font = it.type === "island" ? "bold 12px Arial" : "10px Arial";
    var nm2 = flabel(it.type);
    var tw = pc.measureText(nm2).width;
    pc.fillStyle = "rgba(255,255,255,.55)";
    pc.fillRect(-tw / 2 - 3, -7, tw + 6, 14);
    pc.fillStyle = "#2f2d28";
    pc.fillText(nm2, 0, 1);
  }
  pc.restore();
  if (it.type === "motionSensor") drawMotionCone(it);
  if (isSmartType(it.type) && !isLamp(it)) drawSmartPip(it);
  if (it.locked) drawLock(it);
}
/* Presentation furniture, drawn in the item's rotated frame (origin at its
   centre, +y toward its front). Returns false to let drawItem fall back to the
   technical glyph — while the picture is still being baked, or for the pieces
   (sensors, small smart devices) whose symbol says more than a render. */
function drawItemPresentation(it, w, d, isSel) {
  // lamps reach here only when they stand on the floor (see drawItem)
  var mode = spriteMode(it, { lamp: false });
  if (mode === "sprite") {
    // whether it hangs above the plan cut needs its measured height; not
    // measured yet (a fresh plan) → its line glyph until it is, rather than
    // building the model inside this paint
    var vspan = null;
    try { vspan = knownVSpan(it); } catch (e) { vspan = null; }
    if (!vspan) {
      measureVSpanSoon(it);
      return false;
    }
    mode = spriteMode(it, { lamp: false, vspan: vspan });
  }
  if (mode === "glyph") return false;
  if (mode === "overhead") {
    // hung above the plan cut: outline only, dashed, like a drafted upper
    pc.save();
    pc.setLineDash([6, 4]);
    pc.strokeStyle = isSel ? "#3f6b78" : "rgba(55,50,44,.7)";
    pc.lineWidth = isSel ? 2.2 : 1;
    pc.strokeRect(-w / 2, -d / 2, w, d);
    pc.beginPath();
    pc.moveTo(-w / 2, -d / 2); pc.lineTo(w / 2, d / 2);
    pc.moveTo(w / 2, -d / 2); pc.lineTo(-w / 2, d / 2);
    pc.globalAlpha = 0.35;
    pc.stroke();
    pc.restore();
    return true;
  }
  var dpr = canvasDpr(),
    sp = itemSprite(it, S.SC, dpr);
  if (!sp) return false;
  var kx = sp.w > 0 ? it.w / sp.w : 1, kz = sp.d > 0 ? it.d / sp.d : 1, r = sp.rect;
  pc.save();
  if (it.type !== "rug") {
    pc.shadowColor = planTheme().itemShadow;
    pc.shadowBlur = 7 * dpr;
    pc.shadowOffsetX = 2.5 * dpr;
    pc.shadowOffsetY = 2.5 * dpr;
  }
  pc.imageSmoothingEnabled = true;
  pc.drawImage(sp.img, r.x0 * kx * S.SC, r.z0 * kz * S.SC, (r.x1 - r.x0) * kx * S.SC, (r.z1 - r.z0) * kz * S.SC);
  pc.restore();
  if (it.type === "stairs") {
    // the walking line and UP over the render, following the flight's plan
    var sit = { steps: it.steps, configuration: it.configuration, shape: vspec(it).shape };
    pc.save();
    pc.strokeStyle = "rgba(38,35,31,.85)";
    drawSymbolPrims(symbolPrims("stairs", it.w, it.d, sit).filter(function (p) {
      return p.k === "text" || (p.k === "line" && p.weight === "heavy");
    }), S.SC, it);
    pc.restore();
  }
  if (isSel) {
    rr(-w / 2, -d / 2, w, d, 5);
    pc.lineWidth = 2.4;
    pc.strokeStyle = eraseHover("item", it) ? ERASE_COL : "#3f6b78";
    pc.stroke();
  }
  return true;
}

/* Draft symbol primitives (js/plan_symbols.js) on the canvas, in an item's
   rotated frame, cm scaled by k. "UP" labels go through drawStairsUp-style
   upright text. */
function drawSymbolPrims(prims, k, it) {
  var A = ((it.rot || 0) * Math.PI) / 180;
  prims.forEach(function (p) {
    pc.lineWidth = p.weight === "heavy" ? 1.6 : 1;
    pc.beginPath();
    if (p.k === "line") { pc.moveTo(p.x1 * k, p.z1 * k); pc.lineTo(p.x2 * k, p.z2 * k); pc.stroke(); }
    else if (p.k === "rect") { pc.strokeRect(p.x * k, p.z * k, p.w * k, p.d * k); }
    else if (p.k === "circle") { pc.arc(p.x * k, p.z * k, p.r * k, 0, Math.PI * 2); pc.stroke(); }
    else if (p.k === "poly") {
      p.pts.forEach(function (q, i) { if (i) pc.lineTo(q.x * k, q.z * k); else pc.moveTo(q.x * k, q.z * k); });
      if (p.closed) pc.closePath();
      pc.stroke();
    } else if (p.k === "text") {
      pc.save();
      pc.translate(p.x * k, p.z * k);
      pc.rotate(-A - planRotRad());
      pc.font = "bold " + Math.max(9, Math.min(13, Math.round(p.size * k))) + "px Arial";
      pc.textAlign = "center";
      pc.textBaseline = "middle";
      var txt = p.upLabel ? t("plan_stairs_up") : p.s, tw = pc.measureText(txt).width;
      pc.fillStyle = "rgba(255,255,255,.8)";
      pc.fillRect(-tw / 2 - 3, -8, tw + 6, 16);
      pc.fillStyle = "#26231f";
      pc.fillText(txt, 0, 0);
      pc.restore();
    }
  });
}

/* "UP" at the foot of a flight, upright whatever the flight's and the plan's
   rotation. The arrow (GLYPH.stairs) runs from the +y end to the -y end. */
function drawStairsUp(it, w, d) {
  if (w < 22 || d < 30) return;
  var A = ((it.rot || 0) * Math.PI) / 180;
  pc.save();
  pc.translate(0, d / 2 - Math.min(16, d * 0.12));
  pc.rotate(-A - planRotRad());
  pc.font = "bold " + Math.max(9, Math.min(13, Math.round(w * 0.14))) + "px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var txt = t("plan_stairs_up"), tw = pc.measureText(txt).width;
  pc.fillStyle = "rgba(255,255,255,.8)";
  pc.fillRect(-tw / 2 - 3, -8, tw + 6, 16);
  pc.fillStyle = "#26231f";
  pc.fillText(txt, 0, 0);
  pc.restore();
}

function roomMeasFor(r) {
  var k = roomsTopologyKey();
  if (labelMeasCache.key !== k) set_labelMeasCache({ key: k, byRoom: {} });
  if (!(r.key in labelMeasCache.byRoom)) {
    var m = null;
    try { m = roomMeasurements(S, r); } catch (e) { m = null; }
    labelMeasCache.byRoom[r.key] = m;
  }
  return labelMeasCache.byRoom[r.key];
}
function drawPresentationRoomLabels(rooms) {
  var th = planTheme(), a = planRotRad(),
    fTitle = roomLabelFont(S.SC, true), fSize = roomLabelFont(S.SC, false);
  rooms.forEach(function (r) {
    if (roomHidden(r.key)) return;
    var nm = roomName(r.key);
    var lines = roomLabelLines({
      name: nm,
      meas: S.showDims ? roomMeasFor(r) : null,
      fmt: function (cm) { return planLen(cm, { suffix: false }); },
      fmtLast: function (cm) { return planLen(cm); },
    });
    if (!lines.title && !lines.size) return;
    var x = sx(r.cx), y = sz(r.cz);
    pc.save();
    if (a) { pc.translate(x, y); pc.rotate(-a); pc.translate(-x, -y); }
    pc.textAlign = "center";
    pc.textBaseline = "middle";
    pc.lineJoin = "round";
    pc.strokeStyle = th.halo;
    var ty = lines.size ? y - fTitle * 0.55 : y;
    if (lines.title) {
      pc.font = "700 " + fTitle + "px 'Inter', 'Helvetica Neue', Arial, sans-serif";
      pc.lineWidth = Math.max(3, fTitle * 0.28);
      pc.strokeText(lines.title, x, ty);
      pc.fillStyle = th.roomTitle;
      pc.fillText(lines.title, x, ty);
    }
    if (lines.size) {
      var sy = lines.title ? ty + fTitle * 0.62 + fSize * 0.55 : y;
      pc.font = "500 " + fSize + "px 'Inter', 'Helvetica Neue', Arial, sans-serif";
      pc.lineWidth = Math.max(3, fSize * 0.3);
      pc.strokeText(lines.size, x, sy);
      pc.fillStyle = th.roomSub;
      pc.fillText(lines.size, x, sy);
    }
    pc.restore();
  });
}

function drawMotionCone(it) {
  var A = ((it.rot || 0) * Math.PI) / 180;
  var range = 180 * S.SC;
  var halfFov = (45 * Math.PI) / 180;
  var isMotion = it.smart && it.smart.motion;
  pc.save();
  pc.translate(sx(it.x), sz(it.z));
  pc.rotate(A);
  pc.beginPath();
  pc.moveTo(0, 0);
  pc.arc(0, 0, range, Math.PI / 2 - halfFov, Math.PI / 2 + halfFov);
  pc.closePath();
  var grad = pc.createRadialGradient(0, 0, 4, 0, 0, range);
  if (isMotion) {
    grad.addColorStop(0, "rgba(16, 185, 129, 0.32)");
    grad.addColorStop(1, "rgba(16, 185, 129, 0.02)");
    pc.fillStyle = grad;
    pc.fill();
    pc.strokeStyle = "rgba(16, 185, 129, 0.65)";
    pc.lineWidth = 1.4;
    pc.stroke();
  } else {
    grad.addColorStop(0, "rgba(56, 189, 248, 0.15)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0.01)");
    pc.fillStyle = grad;
    pc.fill();
    pc.strokeStyle = "rgba(56, 189, 248, 0.35)";
    pc.lineWidth = 1.0;
    pc.setLineDash([4, 4]);
    pc.stroke();
  }
  pc.restore();
}
function drawLock(it) {
  pc.save();
  pc.font = "12px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  pc.fillText(
    "🔒",
    sx(it.x),
    sz(it.z) - (Math.min(it.w, it.d) * S.SC * 0.5 + 9),
  );
  pc.restore();
}
function drawSmartPip(it) {
  var on = devicePowered(it);
  var st = it.smart || {};
  pc.save();
  pc.translate(sx(it.x) + Math.max(6, it.w * S.SC * 0.38), sz(it.z) - Math.max(6, it.d * S.SC * 0.38));

  if (it.type === "smartLock") {
    var isLocked = st.locked !== false;
    pc.font = "10px sans-serif";
    pc.textAlign = "center";
    pc.textBaseline = "middle";
    pc.fillText(isLocked ? "🔒" : "🔓", 0, 0);
  } else if (it.type === "smokeDetector" && st.smoke) {
    pc.beginPath();
    pc.arc(0, 0, 6, 0, 7);
    pc.fillStyle = "rgba(239, 68, 68, 0.85)";
    pc.fill();
    pc.strokeStyle = "#991b1b";
    pc.lineWidth = 1.5;
    pc.stroke();
  } else {
    if (on) {
      pc.beginPath();
      pc.arc(0, 0, 6.5, 0, 7);
      pc.fillStyle = "rgba(61, 214, 140, 0.25)";
      pc.fill();
    }
    pc.beginPath();
    pc.arc(0, 0, 4.2, 0, 7);
    pc.fillStyle = on ? "#3dd68c" : "rgba(80,80,80,0.55)";
    pc.fill();
    pc.strokeStyle = on ? "#1f8a54" : "rgba(255,255,255,0.35)";
    pc.lineWidth = 1.2;
    pc.stroke();
  }
  pc.restore();
}
function drawLamp(it, f, isSel) {
  var on = it.lightOn !== false,
    col = hexStr(lampColor(it)),
    r = Math.max((Math.min(it.w, it.d) * S.SC) / 2, 11);
  pc.save();
  pc.translate(sx(it.x), sz(it.z));
  if (on) {
    var g = pc.createRadialGradient(0, 0, 2, 0, 0, r * 2.4);
    g.addColorStop(0, "rgba(255,236,150,.55)");
    g.addColorStop(1, "rgba(255,236,150,0)");
    pc.fillStyle = g;
    pc.beginPath();
    pc.arc(0, 0, r * 2.4, 0, 7);
    pc.fill();
  }
  if (on) {
    pc.strokeStyle = "#cfa441";
    pc.lineWidth = 1.6;
    for (var k = 0; k < 8; k++) {
      var aa = (k * Math.PI) / 4;
      pc.beginPath();
      pc.moveTo(Math.cos(aa) * (r + 2), Math.sin(aa) * (r + 2));
      pc.lineTo(Math.cos(aa) * (r + 6), Math.sin(aa) * (r + 6));
      pc.stroke();
    }
  }
  pc.beginPath();
  pc.arc(0, 0, r, 0, 7);
  pc.fillStyle = on ? "#fff1c0" : "#dad5c8";
  pc.fill();
  pc.lineWidth = isSel ? 3 : 1.6;
  pc.strokeStyle = isSel ? "#3f6b78" : on ? "#caa14e" : "#9a9384";
  pc.stroke();
  pc.beginPath();
  pc.arc(0, 0, r * 0.42, 0, 7);
  pc.fillStyle = on ? col : "#b7b1a3";
  pc.fill();
  pc.fillStyle = "#2f2d28";
  pc.font = "10px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "top";
  pc.rotate(-planRotRad()); // keep lamp label upright when the plan is rotated
  pc.fillText(flabel(it.type), 0, r + 7);
  pc.restore();
  if (it.locked) drawLock(it);
}
/* The explicit dimensions, drawn on the plan (js/wall_constraints.js).
   A dimension that only exists in the inspector is a dimension nobody trusts —
   you cannot see whether it points where you meant. Blue when satisfied, red
   when the solver could not honour it, which is the same colour language the
   constraint-engine warnings already use. */
function drawWallCons() {
  var list = wallCons();
  /* Rebuilt every frame, including the empty one. Keeping this reset behind
     the early return left a deleted dimension's old label clickable until
     some other constraint happened to be drawn. */
  set_conHits([]);
  set_conLabelOcc([]);
  if (!list.length) return;
  pc.save();
  pc.lineWidth = 1.2;
  pc.font = "600 11px system-ui, sans-serif";
  pc.textAlign = "center";
  pc.textBaseline = "middle";

  list.forEach(function (c) {
    try {
    var sel = S.sel && S.sel.kind === "con" && S.sel.ref && S.sel.ref.id === c.id,
      hover = S.conHover === c.id,
      hot = sel || hover;
    /* Suppression switches a relation off, but it must still be locatable.
       Keep it hidden during ordinary drafting and reveal it in grey when its
       row is selected or hovered. */
    if (c.off && !hot) return;
    set_conForLabel(c);
    set_conHot(hot);
    /* Three states, three colours. A reference dimension is drawn in the
       muted grey every CAD uses for one, because a value that does NOT drive
       the drawing must never look like a value that does — that is the whole
       distinction the type exists to make. */
    var ok = conSatisfied(c),
      report = !!c.report,
      col = c.off ? "rgba(105,112,124,.95)"
        : report ? "rgba(120,128,140,.85)"
        : ok ? "rgba(60,120,220,.85)" : "rgba(225,70,70,.95)";
    pc.strokeStyle = col;
    pc.lineWidth = sel ? 3 : hover ? 2.4 : 1.2;
    pc.setLineDash(c.off || report ? [2, 3] : [5, 4]);
    pc.shadowColor = hot ? col : "transparent";
    pc.shadowBlur = hot ? 8 : 0;
    drawConTargetHighlight(c, col, hot);

    /* Opening constraints are first-class constraints too. They previously
       appeared in the inspector and solver but had no canvas glyph, so they
       could neither be seen nor picked from the drawing. */
    if (c.type === "openCentre" || c.type === "openDist") {
      var oo = openingById(c.opening), op = openingPos(oo);
      if (!op) return;
      var from = c.type === "openCentre"
        ? { x: (op.g.a.x + op.g.b.x) / 2, z: (op.g.a.z + op.g.b.z) / 2 }
        : c.end === "b" ? op.g.b : op.g.a;
      pc.beginPath();
      pc.moveTo(sx(from.x), sz(from.z));
      pc.lineTo(sx(op.x), sz(op.z));
      pc.stroke();
      conLabel((from.x + op.x) / 2, (from.z + op.z) / 2,
        c.type === "openCentre" ? "C" : Math.round(c.value) + "", col, -14);
      return;
    }
    if (c.type === "openAlign") {
      var oaa = openingPos(openingById(c.a)), obb = openingPos(openingById(c.b));
      if (!oaa || !obb) return;
      pc.beginPath(); pc.moveTo(sx(oaa.x), sz(oaa.z)); pc.lineTo(sx(obb.x), sz(obb.z)); pc.stroke();
      conLabel((oaa.x + obb.x) / 2, (oaa.z + obb.z) / 2,
        c.axis === "z" ? "Z=" : "X=", col, -14);
      return;
    }
    if (c.type === "openSpacing") {
      var ops = (c.openings || []).map(openingById).map(openingPos).filter(Boolean);
      if (ops.length < 3) return;
      pc.beginPath();
      ops.forEach(function (p, i) {
        if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
      });
      pc.stroke();
      var om = ops[Math.floor(ops.length / 2)];
      conLabel(om.x, om.z, "= =", col, -16);
      return;
    }

    /* A pin is not a dimension between two things, so it gets its own mark
       rather than a line and a number: the corner in a ring, which is how a
       grounded point reads in every sketcher. */
    if (c.type === "fixed") {
      var fp = anchorPos(c.a);
      if (!fp) return;
      var fx = sx(fp.x), fy = sz(fp.z);
      pc.setLineDash([]);
      pc.beginPath();
      pc.arc(fx, fy, 7, 0, Math.PI * 2);
      pc.stroke();
      pc.beginPath();
      pc.arc(fx, fy, 2.5, 0, Math.PI * 2);
      pc.fillStyle = col;
      pc.fill();
      /* The ring sits ON the corner, so it cannot also be the pick target —
         clicking there has to keep selecting the corner, which is the far more
         common intent. The pin therefore carries a small tag offset clear of
         the corner's own grab radius, and THAT is what selects the pin. What
         you click is what you can see. Drawn upright against plan rotation so
         the tag stays a square, not a diamond. */
      var aFix = planRotRad();
      pc.save();
      if (aFix) { pc.translate(fx, fy); pc.rotate(-aFix); pc.translate(-fx, -fy); }
      pc.beginPath();
      pc.rect(fx + 7, fy - 15, 8, 8);
      pc.fill();
      pc.restore();
      var corner = rotatePx(fx, fy);
      conHits.push({ con: c, x: corner.x + 11, y: corner.y - 11, w: 10 });
      return;
    }

    if (c.type === "coincident" || c.type === "symmetric") {
      var ca = anchorPos(c.a), cb = anchorPos(c.b);
      if (!ca || !cb) return;
      pc.beginPath();
      pc.moveTo(sx(ca.x), sz(ca.z));
      pc.lineTo(sx(cb.x), sz(cb.z));
      pc.stroke();
      if (c.type === "symmetric") {
        // show the mirror line the pair is measured about
        var axw = wallById(c.axis.id);
        if (axw) {
          var ag = wallGeom(axw), amx = (ag.a.x + ag.b.x) / 2, amz = (ag.a.z + ag.b.z) / 2,
            adx = c.axis.k === "perp" ? -ag.uz : ag.ux,
            adz = c.axis.k === "perp" ? ag.ux : ag.uz,
            half = Math.max(ag.L, 120) / 2;
          pc.save();
          pc.setLineDash([9, 4, 2, 4]);
          pc.beginPath();
          pc.moveTo(sx(amx - adx * half), sz(amz - adz * half));
          pc.lineTo(sx(amx + adx * half), sz(amz + adz * half));
          pc.stroke();
          pc.restore();
        }
      }
      conLabel((ca.x + cb.x) / 2, (ca.z + cb.z) / 2,
        c.type === "coincident" ? "\u2299" : "\u21C4", col);
      return;
    }

    if (c.type === "midpoint" || c.type === "pointOnLine") {
      var mw = wallById(c.ref), mp = anchorPos(c.point);
      if (!mw || !mp) return;
      var mg = wallGeom(mw);
      pc.beginPath();
      pc.moveTo(sx(mg.a.x), sz(mg.a.z));
      pc.lineTo(sx(mg.b.x), sz(mg.b.z));
      pc.stroke();
      conLabel(mp.x, mp.z, c.type === "midpoint" ? "\u25B3" : "\u2500\u25CB", col, -16);
      return;
    }

    if (c.type === "equalLengthSet") {
      (c.walls || []).map(wallById).filter(Boolean).forEach(function (ew) {
        var eg = wallGeom(ew);
        conLabel((eg.a.x + eg.b.x) / 2, (eg.a.z + eg.b.z) / 2, "=L", col, -18);
      });
      return;
    }

    if (c.type === "wallAngle") {
      var aw = wallById(c.wall), ar = wallById(c.ref);
      if (!aw || !ar) return;
      var awg = wallGeom(aw), arg = wallGeom(ar),
        am = { x: (awg.a.x + awg.b.x) / 2, z: (awg.a.z + awg.b.z) / 2 },
        rm = { x: (arg.a.x + arg.b.x) / 2, z: (arg.a.z + arg.b.z) / 2 };
      pc.beginPath();
      pc.moveTo(sx(rm.x), sz(rm.z));
      pc.lineTo(sx(am.x), sz(am.z));
      pc.stroke();
      conLabel((am.x + rm.x) / 2, (am.z + rm.z) / 2,
        Math.round(c.value) + "\u00b0", col);
      return;
    }

    if (["dist", "alignX", "alignZ", "axisDistX", "axisDistZ"].indexOf(c.type) !== -1) {
      var pa = anchorPos(c.a),
        pb = anchorPos(c.b);
      if (!pa || !pb) return;
      var x1 = sx(pa.x),
        z1 = sz(pa.z),
        x2 = sx(pb.x),
        z2 = sz(pb.z);
      pc.beginPath();
      pc.moveTo(x1, z1);
      pc.lineTo(x2, z2);
      pc.stroke();
      // a tick at the held end, so which side the solver pins is visible
      // without opening the inspector
      var hp = c.hold === "b" ? pb : pa;
      pc.setLineDash([]);
      pc.beginPath();
      pc.arc(sx(hp.x), sz(hp.z), 4, 0, Math.PI * 2);
      pc.fillStyle = col;
      pc.fill();
      conLabel((pa.x + pb.x) / 2, (pa.z + pb.z) / 2,
        c.type === "dist" ? (report ? "(" + Math.round(c.value) + ")" : Math.round(c.value) + "") :
          c.type === "axisDistX" ? "ΔX " + Math.round(c.value) :
            c.type === "axisDistZ" ? "ΔZ " + Math.round(c.value) :
              c.type === "alignX" ? "X=" : "Z=", col);
    } else if (c.type === "angle") {
      drawAngleConstraint({ joint: c.joint, w1: c.w1, w2: c.w2 }, Math.round(c.value) + "\u00b0", col, 26);
    } else if (c.type === "equalAngle") {
      if (report) {
        /* Comparing, not equalising: show what each corner actually measures
           and the difference between them. "=" would be a lie here — they are
           precisely what is NOT being forced equal. */
        var refA = conAngleOf(c.referenceAngle), drvA = conAngleOf(c.drivenAngle);
        drawAngleConstraint(c.referenceAngle, fmtDeg(refA), col, 24);
        drawAngleConstraint(c.drivenAngle, fmtDeg(drvA), col, 31);
        if (refA != null && drvA != null) {
          var jn = anchorNode(c.drivenAngle.joint), jp = jn != null && S.nodes[jn];
          if (jp) conLabel(jp.x, jp.z, "\u0394 " + fmtDeg(Math.abs(drvA - refA)), col, -46);
        }
      } else {
        drawAngleConstraint(c.referenceAngle, "=", col, 24);
        drawAngleConstraint(c.drivenAngle, "=", col, 31);
      }
    } else if (c.type === "pointWallDist") {
      var pp = anchorPos(c.point), pr = wallById(c.ref);
      if (!pp || !pr) return;
      var pgr = wallGeom(pr), ps = (pp.x - pgr.a.x) * pgr.ux + (pp.z - pgr.a.z) * pgr.uz,
        pfx = pgr.a.x + pgr.ux * ps, pfz = pgr.a.z + pgr.uz * ps;
      if (c.refFace === 1 || c.refFace === -1) {
        pfx += -pgr.uz * c.refFace * (pr.thickness || 0) / 2;
        pfz += pgr.ux * c.refFace * (pr.thickness || 0) / 2;
      }
      pc.beginPath(); pc.moveTo(sx(pp.x), sz(pp.z)); pc.lineTo(sx(pfx), sz(pfz)); pc.stroke();
      conLabel((pp.x + pfx) / 2, (pp.z + pfz) / 2, Math.abs(Math.round(c.value)) + "", col);
    } else if (c.type === "equalSpacing") {
      var centres = (c.walls || []).map(wallById).filter(Boolean).map(function (sw) {
        var sg = wallGeom(sw); return { x: (sg.a.x + sg.b.x) / 2, z: (sg.a.z + sg.b.z) / 2 };
      });
      if (centres.length < 3) return;
      pc.beginPath();
      centres.forEach(function (p, i) { if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z)); });
      pc.stroke();
      var sc = centres[Math.floor(centres.length / 2)]; conLabel(sc.x, sc.z, "= =", col, -18);
    } else {
      var w = wallById(c.wall),
        r = wallById(c.ref);
      if (!w) return;
      var gw = wallGeom(w),
        gr = r ? wallGeom(r) : null;
      var mx = (gw.a.x + gw.b.x) / 2,
        mz = (gw.a.z + gw.b.z) / 2;
      if (c.type !== "offset") {
        var relationLabels = {
          parallel: "∥", perpendicular: "⊥", collinear: "—", equalLength: "=L",
          horizontal: "H", vertical: "V",
        };
        conLabel(mx, mz,
        report ? "(" + (relationLabels[c.type] || c.type) + ")"
          : relationLabels[c.type] || c.type, col, -18);
        traceWallCentre(w);
        pc.stroke();
        pc.setLineDash([]);
        return;
      }
      if (!r || !gr) return;
      // foot of the perpendicular on the reference wall's centreline
      var tpar = (mx - gr.a.x) * gr.ux + (mz - gr.a.z) * gr.uz;
      var fx = gr.a.x + gr.ux * tpar,
        fz = gr.a.z + gr.uz * tpar;
      var onx = -gr.uz, onz = gr.ux;
      if (c.refFace === 1 || c.refFace === -1) {
        fx += onx * c.refFace * (r.thickness || 0) / 2;
        fz += onz * c.refFace * (r.thickness || 0) / 2;
      }
      if (c.wallFace === 1 || c.wallFace === -1) {
        mx += onx * c.wallFace * (w.thickness || 0) / 2;
        mz += onz * c.wallFace * (w.thickness || 0) / 2;
      }
      pc.beginPath();
      pc.moveTo(sx(fx), sz(fz));
      pc.lineTo(sx(mx), sz(mz));
      pc.stroke();
      conLabel((fx + mx) / 2, (fz + mz) / 2, Math.abs(Math.round(c.value)) + "", col);
    }
    pc.setLineDash([]);
    } catch (err) {
      pc.shadowBlur = 0;
      pc.setLineDash([]);
    }
  });
  set_conForLabel(null);
  pc.restore();
}

export {
  doorsGlyph, drawItem, drawPresentationRoomLabels, drawStairsUp,
  drawSymbolPrims, drawWallCons, gCirc, gStroke,
};
