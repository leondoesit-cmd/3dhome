/* The CAD editor's touch precision drawing, slot outlines, part hit tests and
   the report card, split out of drawing_sheet.js, split out of
   js/modeler/drawing_sheet.js. It shares the editor's state through live
   imports from ./drawing_sheet.js. */
import { holeLoop } from "../modeler_mesh_geometry.js";
import { cloneData } from "../modeler_part_geometry.js";
import { t } from "../modeler_strings.js";
import { E, refreshAll, root } from "../modeler.js";
import { circleData, ellipseData, ensureSketch, lineData } from "../sketch_solver.js";
import { uid } from "../state.js";
import { getTouchPrecisionPrefs } from "../touch_precision_ui.js";
import { directionalSegmentDistances, drawTouchPrecisionLens } from "../touch_precision.js";
import { getDomainUnit } from "../unit_settings.js";
import { pointToLineDistance } from "./dimension_entry.js";
import { activeSketchFrame, axisOfView, cutSkipNote, partUV, pushUndo, sketchProjection, toPx } from "./document_history.js";
import { syncTools } from "./document_save.js";
import { addPart } from "./library_store.js";
import { applyCut } from "./prefs_snap.js";
import { hitSketch } from "./sketch_entities.js";
import { FLASH_MS, reportOpener, set_reportOpener } from "./drawing_sheet.js";

function drawModelerTouchPrecision(c) {
  var tc = E.touchPrecision;
  if (!tc || !E.cv) return;
  drawTouchPrecisionLens(c, E.cv, tc, {
    color: "#2684c7", crosshair: "#e05a46", background: "rgba(246,249,252,.98)",
    distances: modelerTouchDistances(tc), unitLabel: getDomainUnit("details"), handedness:getTouchPrecisionPrefs().handedness,
  });
  c.save();
  c.strokeStyle = "rgba(38,132,199,.68)";
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(tc.ox, tc.oy, 5, 0, Math.PI * 2); c.stroke();
  c.restore();
}

function modelerTouchDistances(tc) {
  var segments = [];
  function addScreenLoop(points, closed) {
    if (!points || points.length < 2) return;
    for (var i = 1; i < points.length; i++) segments.push({ a: points[i - 1], b: points[i] });
    if (closed) segments.push({ a: points[points.length - 1], b: points[0] });
  }
  function addUvLoop(points, closed) {
    addScreenLoop((points || []).map(function (point) {
      return toPx(point.u == null ? point.x : point.u, point.v == null ? point.y : point.v);
    }), closed);
  }
  function addEllipse(center, rx, ry, rotation, start, sweep) {
    var points = [], steps = 48;
    for (var i = 0; i <= steps; i++) {
      var angle = start + sweep * i / steps;
      var x = Math.cos(angle) * rx, y = Math.sin(angle) * ry;
      points.push(toPx(
        center.x + x * Math.cos(rotation) - y * Math.sin(rotation),
        center.y + x * Math.sin(rotation) + y * Math.cos(rotation),
      ));
    }
    addScreenLoop(points, false);
  }

  /* Flat model outlines are visible objects too, not just sketch entities. */
  if (!sketchProjection()) {
    (E.def.parts || []).forEach(function (part) {
      var shape = partUV(part);
      if (!shape) return;
      if (shape.type === "rect") addUvLoop([
        { u: shape.u0, v: shape.v0 }, { u: shape.u1, v: shape.v0 },
        { u: shape.u1, v: shape.v1 }, { u: shape.u0, v: shape.v1 },
      ], true);
      else if (shape.type === "circle") addEllipse({ x: shape.u, y: shape.v }, shape.r, shape.r, 0, 0, Math.PI * 2);
      else if (shape.type === "segments") (shape.segments || []).forEach(function (segment) {
        addUvLoop([segment.a, segment.b], false);
      });
      else {
        addUvLoop(shape.pts, true);
        (shape.holes || part.holes || []).forEach(function (hole) { addUvLoop(holeLoop(hole), true); });
      }
    });
  }

  var sketch = ensureSketch(E.def);
  if (sketch) {
    var points = new Map((sketch.points || []).map(function (point) { return [point.id, point]; }));
    (sketch.entities || []).forEach(function (entity) {
      if (entity.type === "line") {
        var line = lineData(entity, points);
        if (line) addUvLoop([line.a, line.b], false);
        return;
      }
      if (entity.type === "ellipse") {
        var ellipse = ellipseData(entity, points);
        if (ellipse) addEllipse(ellipse.center, ellipse.rx, ellipse.ry, ellipse.rot, 0, Math.PI * 2);
        return;
      }
      var circle = circleData(entity, points);
      if (!circle) return;
      var start = entity.type === "arc" ? circle.start : 0;
      var sweep = entity.type === "arc"
        ? ((circle.end - circle.start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
        : Math.PI * 2;
      addEllipse(circle.center, circle.radius, circle.radius, 0, start, sweep || Math.PI * 2);
    });
  }
  return directionalSegmentDistances(tc.ox, tc.oy, segments, E.scl, 6);
}

/* The slot outline as a path: two parallel sides and two half-circle caps —
   the same shape addSketchSlot builds, so the preview cannot promise geometry
   the commit will not produce. */
function strokeSlotOutline(c, a, b, halfWidth) {
  var dx = b.u - a.u, dy = b.v - a.v, span = Math.hypot(dx, dy);
  if (span < 1e-6 || halfWidth < 1e-6) return;
  // sampled in model space and projected point by point: half the views mirror
  // v, and a canvas arc drawn from an assumed sweep direction caps the wrong end
  var dir = Math.atan2(dy, dx), loop = [];
  var cap = function (centre, from) {
    for (var i = 0; i <= 12; i++) {
      var ang = from + (i / 12) * Math.PI;
      loop.push({ u: centre.u + Math.cos(ang) * halfWidth, v: centre.v + Math.sin(ang) * halfWidth });
    }
  };
  cap(b, dir - Math.PI / 2);
  cap(a, dir + Math.PI / 2);
  c.beginPath();
  loop.forEach(function (p, i) {
    var s = toPx(p.u, p.v);
    if (!i) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
  });
  c.closePath();
  c.stroke();
}

function hitPart(uv, pointerType) {
  // Sketch geometry sits on top of the solids it will become, and is thinner,
  // so it gets first refusal on every pick.
  var sk = hitSketch(uv, pointerType);
  if (sk) return sk;
  // topmost part whose footprint contains uv
  for (var i = E.def.parts.length - 1; i >= 0; i--) {
    var p = E.def.parts[i], f = partUV(p);
    if (f.type === "rect") {
      if (uv.u >= Math.min(f.u0, f.u1) && uv.u <= Math.max(f.u0, f.u1) && uv.v >= Math.min(f.v0, f.v1) && uv.v <= Math.max(f.v0, f.v1)) return p;
    } else if (f.type === "circle") {
      if (Math.hypot(uv.u - f.u, uv.v - f.v) <= f.r) return p;
    } else if (f.type === "segments") {
      var edgeTolerance=(pointerType === "touch" ? 12 : 6)/E.scl;
      if(f.segments.some(function(segment){return pointToLineDistance(uv,segment.a,segment.b)<=edgeTolerance;}))return p;
      if(f.bounds && uv.u>=f.bounds.u0&&uv.u<=f.bounds.u1&&uv.v>=f.bounds.v0&&uv.v<=f.bounds.v1)return p;
    } else {
      var inside = false, pts = f.pts;
      for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        if (pts[a].v > uv.v !== pts[b].v > uv.v &&
          uv.u < ((pts[b].u - pts[a].u) * (uv.v - pts[a].v)) / (pts[b].v - pts[a].v) + pts[a].u) inside = !inside;
      }
      if (inside) return p;
    }
  }
  return null;
}

function openReport(host, focusTarget) {
  if (host.hidden) set_reportOpener(document.activeElement);
  host.hidden = false;
  (focusTarget || host.querySelector("[data-report-close]"))?.focus();
}

function report(kicker, title, body) {
  var host = root && root.querySelector("#mdReport");
  if (!host) { flash(title); return; }
  host.querySelector("#mdUnqualifiedDraftExport")?.remove();
  host.querySelector("#mdExpectedContacts")?.remove();
  root.querySelector("#mdReportKicker").textContent = kicker;
  root.querySelector("#mdReportTitle").textContent = title;
  var pre = root.querySelector("#mdReportBody");
  var pick = root.querySelector("#mdPickList");
  if (pick) { pick.hidden = true; pick.innerHTML = ""; }
  if (pre) { pre.hidden = false; pre.textContent = Array.isArray(body) ? body.join("\n") : String(body || ""); }
  openReport(host);
}

function showPickList(kicker, title, items, onPick, extra) {
  extra = extra || {};
  var host = root && root.querySelector("#mdReport");
  if (!host) { flash(title); return; }
  host.querySelector("#mdUnqualifiedDraftExport")?.remove();
  host.querySelector("#mdExpectedContacts")?.remove();
  root.querySelector("#mdReportKicker").textContent = kicker;
  root.querySelector("#mdReportTitle").textContent = title;
  var pre = root.querySelector("#mdReportBody");
  var pick = root.querySelector("#mdPickList");
  var toolbar = root.querySelector("#mdPickToolbar");
  var search = root.querySelector("#mdPickSearch");
  var back = root.querySelector("#mdPickBack");
  if (pre) { pre.hidden = true; pre.textContent = ""; }
  if (!pick) { flash(title); return; }
  pick.hidden = false;
  var showToolbar = extra.searchable || typeof extra.onBack === "function";
  if (toolbar) toolbar.hidden = !showToolbar;
  if (back) {
    back.hidden = typeof extra.onBack !== "function";
    back.textContent = t("guideBack");
    back.onclick = extra.onBack || null;
  }
  function paintItems(filterText) {
    pick.textContent = "";
    var visible = items || [];
    if (extra.searchable) {
      var query = String(filterText || "").trim();
      if (typeof extra.filter === "function") visible = extra.filter(query, items || []);
      else if (query) {
        var lower = query.toLowerCase();
        visible = (items || []).filter(function (item) {
          return [item.label, item.hint, item.kind, item.size, item.key].join(" ").toLowerCase().indexOf(lower) >= 0;
        });
      }
    }
    visible.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "md-reference-option";
      var wrap = document.createElement("span");
      var label = document.createElement("b");
      label.textContent = item.label == null ? "" : String(item.label);
      wrap.appendChild(label);
      if (item.hint) {
        var hint = document.createElement("small");
        hint.textContent = String(item.hint);
        wrap.appendChild(hint);
      }
      button.appendChild(wrap);
      button.addEventListener("click", function () { closeReport(); onPick(item); });
      pick.appendChild(button);
    });
  }
  if (search) {
    search.hidden = !extra.searchable;
    search.placeholder = t("toolboxSearch");
    if (!extra.searchable) {
      search.value = "";
      search.oninput = null;
    } else {
      search.oninput = function () { paintItems(search.value); };
      if (extra.searchValue != null) search.value = extra.searchValue;
    }
  }
  paintItems(search && extra.searchable ? search.value : "");
  openReport(host, extra.searchable ? search : null);
}

function closeReport() {
  var host = root && root.querySelector("#mdReport");
  if (!host || host.hidden) return;
  host.hidden = true;
  var opener = reportOpener;
  set_reportOpener(null);
  for (const target of [opener, root.querySelector("button.ps-title"), root.querySelector("#mdClose")]) {
    if (!root.contains(target) || target.matches(":disabled, [aria-disabled=true]") ||
        target.closest("[inert]") || !target.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    target.focus();
    if (document.activeElement === target) return;
  }
}

function reportOpen() {
  var host = root && root.querySelector("#mdReport");
  return !!(host && !host.hidden);
}

// `holdMs` keeps a sentence up long enough to read; a one-word hint needs less
function flash(msg, holdMs) {
  var hint = root && root.querySelector("#mdHint");
  if (!hint) return;
  var hold = holdMs || FLASH_MS;
  hint.textContent = msg;
  hint.classList.add("live", "flash");
  E.flashUntil = Date.now() + hold;
  // a held message is a sentence (a refusal naming relations): let it wrap
  hint.classList.toggle("wrap", !!holdMs);
  clearTimeout(E._flashT);
  E._flashT = setTimeout(function () { E.flashUntil = 0; hint.classList.remove("flash", "wrap"); syncTools(); }, hold);
}

// Whether a flashed message is still within its display window.
function flashHolding() {
  return !!(E.flashUntil && Date.now() < E.flashUntil);
}

async function finishPoly() {
  if (E.poly && E.poly.length >= 3 && E.tool === "rev") {
    pushUndo(t("opRevolve"));
    E.sel = addPart({
      id: uid(), kind: "rev", name: "revolve",
      x: 0, z: 0, seg: 32,
      pts: E.poly.map(function (q) { return { u: q.u, v: q.v }; }),
      color: "#b89a6e", metal: 0.08, rough: 0.7,
    });
    E.poly = null;
    refreshAll();
    return;
  }
  if (E.poly && E.poly.length >= 3 && E.tool === "cut") {
    pushUndo(t("opCut"));
    flash(((await applyCut(E.poly)) ? t("cutDone") : t("cutNone")) + cutSkipNote());
    E.poly = null;
    refreshAll();
    return;
  }
  if (E.poly && E.poly.length >= 3) {
    pushUndo(t("opExtrude"));
    var frame=activeSketchFrame(), ax = frame ? "frame" : axisOfView();
    E.sel = addPart({
      id: uid(), kind: "ext", axis: ax, frame:frame ? cloneData(frame) : undefined,
      from: E.baseOff, to: E.baseOff + E.depth,
      pts: E.poly.map(function (q) { return { u: q.u, v: q.v }; }),
      color: "#b89a6e", metal: 0.08, rough: 0.7, name: "extrude",
    });
  }
  E.poly = null;
  refreshAll();
}

/* A cheap fingerprint of everything the profile analysis reads. Any real edit
   moves a point, changes a radius, or adds/removes an entity, and all of those
   land here — so a matching fingerprint means the analysis would return the
   same answer. */
function sketchFingerprint(sketch, selectedIds) {
  var h = 2166136261;
  var mix = function (n) { h = Math.imul(h ^ ((n | 0) + 0x9e3779b9), 16777619) >>> 0; };
  var mixText = function (s) { s = String(s ?? ""); mix(s.length); for (var i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
  var mixPoint = function (p) {
    if (p && typeof p === "object") { mixText(p.x); mixText(p.y); }
    else mixText(p);
  };
  mix(sketch.points.length); mix(sketch.entities.length);
  sketch.points.forEach(function (p) { mix(p.x * 1000); mix(p.y * 1000); });
  sketch.entities.forEach(function (e) {
    mixText(e.id); mixText(e.type || "");
    mixPoint(e.a); mixPoint(e.b); mixPoint(e.c);
    mixPoint(e.p); mixPoint(e.center); mixPoint(e.h1); mixPoint(e.h2);
    if (Array.isArray(e.pts)) { mix(e.pts.length); e.pts.forEach(mixPoint); }
    mix((e.radius || 0) * 1000);
    mix(e.construction ? 1 : 0);
    mix((e.r || 0) * 1000); mix((e.rx || 0) * 1000); mix((e.ry || 0) * 1000); mix((e.rot || 0) * 1000);
  });
  (selectedIds || []).forEach(mixText);
  return h;
}

export {
  closeReport, drawModelerTouchPrecision, finishPoly, flash, flashHolding,
  hitPart, modelerTouchDistances, report, reportOpen, showPickList,
  sketchFingerprint, strokeSlotOutline,
};
