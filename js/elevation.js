// Orthographic 2D elevations of the model. The plan view (viewAxis 'top') is the
// existing top-down floor plan; the four side views (front/back/left/right)
// project the model onto a vertical plane and draw it as a flat 2D elevation —
// walls (with door/window openings), furniture silhouettes, and a ground line.
// Elevations are select-only (click a wall/item to inspect it); editing stays in
// the plan and 3D views.
import { S, WALL_H } from "./state.js";
import {
  wallGeom,
  wallPointAt,
  wallTangentAt,
  hiddenSets,
  contentBounds,
  detectRooms,
  pointInPoly,
} from "./geometry.js";
import {
  normalizeWallKind,
  normalizeWallProfile,
  wallProfileHeight,
} from "./wall_curves.js";
import { FURN, flabel, itemVSpan, fcolor } from "./furniture.js";
import { t } from "./i18n.js";
import { markers, markerItem, markerLabel } from "./markers.js";
import { measure4, markerOrigin } from "./measure.js";

export const ELEV_VIEWS = ["front", "back", "left", "right"];
export function isElevation() {
  return S.viewAxis && S.viewAxis !== "top";
}
// hidden rooms drop out of the elevation exactly as they do the plan and 3D —
// including out of the fit, so the view doesn't frame empty space
function shown() {
  var hid = hiddenSets();
  return {
    walls: S.walls.filter(function (w) {
      return !hid.walls[w.id];
    }),
    items: S.items.filter(function (it) {
      return !hid.items[it.id];
    }),
  };
}

// project a world point to elevation coords: u = horizontal, v = height (y),
// depth = distance toward the viewer (bigger = nearer, drawn on top).
function proj(view, x, y, z) {
  if (view === "front") return { u: x, v: y, depth: z };
  if (view === "back") return { u: -x, v: y, depth: -z };
  if (view === "right") return { u: z, v: y, depth: x };
  if (view === "left") return { u: -z, v: y, depth: -x };
  return { u: x, v: y, depth: z };
}
function projU(view, x, z) {
  return proj(view, x, 0, z).u;
}
function projDepth(view, x, z) {
  return proj(view, x, 0, z).depth;
}
// inverse of proj for the horizontal pair: a (u, depth) pair back to world x/z.
// An elevation click only gives u — the depth has to come from whatever the
// click landed on (see elevPick).
function unproj(view, u, depth) {
  if (view === "front") return { x: u, z: depth };
  if (view === "back") return { x: -u, z: -depth };
  if (view === "right") return { x: depth, z: u };
  if (view === "left") return { x: -depth, z: -u };
  return { x: u, z: depth };
}
// Which compass direction of the horizontal clearances runs to the RIGHT of
// this elevation (measure4 dir keys: e=+x, w=-x, s=+z, n=-z).
const U_KEYS = {
  front: { pos: "e", neg: "w" },
  back: { pos: "w", neg: "e" },
  right: { pos: "s", neg: "n" },
  left: { pos: "n", neg: "s" },
};
// Ceiling height for the view: the tallest wall standing, or the default.
export function ceilingHeight() {
  var h = 0;
  S.walls.forEach(function (w) {
    if (normalizeWallKind(w) === "roomDivider") return;
    var top = wallElevationSpan(w).top;
    if (top > h) h = top;
  });
  return h || WALL_H;
}

/* ---- sampled wall projection ------------------------------------------------
   A straight, flat-topped wall can be projected from its two end points.  An
   arc cannot: its horizontal extrema and its nearest depth can both be in the
   middle of the path.  The same is true of a wall whose top/base profile has
   intermediate controls.  These helpers create one shared representation for
   drawing, fitting and hit-testing, so those operations cannot disagree. */

function finiteNumber(value, fallback) {
  value = Number(value);
  return Number.isFinite(value) ? value : fallback;
}

function profileEntries(source) {
  if (!Array.isArray(source)) return [];
  return source.map(function (entry) {
    if (Array.isArray(entry)) return { s: finiteNumber(entry[0], 0), height: finiteNumber(entry[1], 0) };
    return {
      s: finiteNumber(entry && (entry.s ?? entry.distance ?? entry.at ?? entry.position), 0),
      height: finiteNumber(entry && (entry.height ?? entry.h ?? entry.y ?? entry.base), 0),
    };
  }).sort(function (a, b) { return a.s - b.s; });
}

function baseProfile(w, length) {
  var profile = w && w.profile;
  var source = profile && !Array.isArray(profile) && Array.isArray(profile.base)
    ? profile.base
    : Array.isArray(w && w.baseProfile) ? w.baseProfile : [];
  return profileEntries(source).map(function (entry) {
    return { s: Math.max(0, Math.min(length, entry.s)), height: Math.max(0, entry.height) };
  });
}

function interpolateControls(points, s, fallback) {
  if (!points.length) return fallback;
  if (s <= points[0].s) return points[0].height;
  for (var i = 1; i < points.length; i++) {
    if (s > points[i].s) continue;
    var a = points[i - 1], b = points[i], span = b.s - a.s;
    return span > 1e-9 ? a.height + (b.height - a.height) * ((s - a.s) / span) : b.height;
  }
  return points[points.length - 1].height;
}

function wallVerticalAt(w, s, length) {
  var profile = w && w.profile;
  var shaped = Object.assign({}, w, { length: length });
  var topControls = normalizeWallProfile(shaped);
  var top = wallProfileHeight(shaped, s, finiteNumber(w && w.height, WALL_H));
  var bottomControls = baseProfile(w, length);
  var bottom = interpolateControls(bottomControls, s, 0);

  // Compatibility with the compact endpoint profile written by schedules and
  // older saved projects.  The richer {top:[...],base:[...]} form above wins.
  if (!topControls.length && profile && !Array.isArray(profile)) {
    var topA = finiteNumber(profile.topA, finiteNumber(w && w.height, WALL_H));
    var topB = finiteNumber(profile.topB, topA);
    top = topA + (topB - topA) * (length > 1e-9 ? s / length : 0);
  }
  if (!bottomControls.length && profile && !Array.isArray(profile)) {
    var baseA = finiteNumber(profile.baseA, 0), baseB = finiteNumber(profile.baseB, baseA);
    bottom = baseA + (baseB - baseA) * (length > 1e-9 ? s / length : 0);
  }
  bottom = Math.max(0, bottom);
  return { bottom: bottom, top: Math.max(bottom, top) };
}

function sampleDistances(w, g, includeOpenings) {
  var distances = [0, g.L];
  var intervalCount = g.kind === "arc"
    ? Math.max(12, Math.min(96, Math.ceil(Math.abs(g.curve.sweep) / (Math.PI / 36))))
    : 1;
  for (var i = 1; i < intervalCount; i++) distances.push((g.L * i) / intervalCount);

  var shaped = Object.assign({}, w, { length: g.L });
  normalizeWallProfile(shaped).forEach(function (p) { distances.push(p.s); });
  baseProfile(w, g.L).forEach(function (p) { distances.push(p.s); });
  if (includeOpenings !== false) S.openings.forEach(function (o) {
    if (o.wall !== w.id) return;
    var half = Math.max(0, finiteNumber(o.width, 0)) / 2;
    distances.push(o.s - half, o.s, o.s + half);
  });
  return distances.map(function (s) { return Math.max(0, Math.min(g.L, finiteNumber(s, 0))); })
    .sort(function (a, b) { return a - b; })
    .filter(function (s, index, all) { return !index || Math.abs(s - all[index - 1]) > 1e-6; });
}

function wallStation(view, w, g, s) {
  var p = wallPointAt(w, s) || {
    x: g.a.x + (g.b.x - g.a.x) * (g.L ? s / g.L : 0),
    z: g.a.z + (g.b.z - g.a.z) * (g.L ? s / g.L : 0),
  };
  var tangent = wallTangentAt(w, s) || { x: g.ux, z: g.uz };
  var half = Math.max(0, finiteNumber(w.thickness, 0)) / 2;
  var nx = -tangent.z, nz = tangent.x;
  var u = projU(view, p.x, p.z);
  var faceA = projU(view, p.x + nx * half, p.z + nz * half);
  var faceB = projU(view, p.x - nx * half, p.z - nz * half);
  var vertical = wallVerticalAt(w, s, g.L);
  return {
    s: s,
    x: p.x,
    z: p.z,
    u: u,
    depth: projDepth(view, p.x, p.z),
    tangent: tangent,
    lo: Math.min(faceA, faceB),
    hi: Math.max(faceA, faceB),
    bottom: vertical.bottom,
    top: vertical.top,
  };
}

/** Sample the physical path and height profile used by an elevation. */
export function wallElevationSamples(view, w, options) {
  var g = wallGeom(w);
  if (!g || !g.L) return [];
  options = options || {};
  var distances = Array.isArray(options.distances)
    ? options.distances.map(function (s) { return Math.max(0, Math.min(g.L, finiteNumber(s, 0))); })
    : sampleDistances(w, g, options.includeOpenings);
  return distances.sort(function (a, b) { return a - b; })
    .filter(function (s, index, all) { return !index || Math.abs(s - all[index - 1]) > 1e-6; })
    .map(function (s) { return wallStation(view, w, g, s); });
}

/** Overall vertical extent, including intermediate profile control points. */
export function wallElevationSpan(w) {
  var g = wallGeom(w);
  if (!g || !g.L) return { bottom: 0, top: finiteNumber(w && w.height, WALL_H) };
  var distances = sampleDistances(w, g, false);
  var bottom = Infinity, top = 0;
  distances.forEach(function (s) {
    var span = wallVerticalAt(w, s, g.L);
    bottom = Math.min(bottom, span.bottom);
    top = Math.max(top, span.top);
  });
  return { bottom: Number.isFinite(bottom) ? bottom : 0, top: top };
}

// item footprint corners in world (x,z), rotated
function itemCorners(it) {
  var A = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(A), s = Math.sin(A), hw = it.w / 2, hd = it.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function (p) {
    return { x: it.x + p[0] * c - p[1] * s, z: it.z + p[0] * s + p[1] * c };
  });
}

// current fit transform (recomputed each render, reused by hit-testing)
var TF = { sc: 1, ox: 0, y0: 0 };
function computeFit(view, vis) {
  var us = [], vMax = 0;
  vis.walls.forEach(function (w) {
    if (normalizeWallKind(w) === "roomDivider") return;
    var r = wallURange(view, w);
    us.push(r.lo, r.hi);
    var span = wallElevationSpan(w);
    if (span.top > vMax) vMax = span.top;
  });
  vis.items.forEach(function (it) {
    itemCorners(it).forEach(function (p) { us.push(projU(view, p.x, p.z)); });
    var sp = itemVSpan(it);
    if (sp.hi > vMax) vMax = sp.hi;
  });
  if (!us.length) { us = [-200, 200]; vMax = 270; }
  var uMin = Math.min.apply(null, us), uMax = Math.max.apply(null, us);
  var uSpan = uMax - uMin || 1, vSpan = vMax || 1;
  var sc = Math.min((S.CW * 0.86) / uSpan, (S.CH * 0.7) / vSpan);
  TF.sc = sc;
  TF.ox = (S.CW - uSpan * sc) / 2 - uMin * sc;
  TF.y0 = S.CH - Math.max(70, S.CH * 0.14); // ground line near the bottom
  TF.uMin = uMin; TF.uMax = uMax; TF.vMax = vMax;
}
function X(u) { return TF.ox + u * TF.sc; }
function Y(v) { return TF.y0 - v * TF.sc; }

export function drawElevation(pc) {
  var view = S.viewAxis,
    vis = shown();
  computeFit(view, vis);
  // ground line
  pc.strokeStyle = "#b9ad93";
  pc.lineWidth = 2;
  pc.beginPath();
  pc.moveTo(X(TF.uMin) - 30, Y(0));
  pc.lineTo(X(TF.uMax) + 30, Y(0));
  pc.stroke();
  // faint height grid every 50cm
  pc.strokeStyle = "#e4dcc9";
  pc.lineWidth = 1;
  for (var gv = 50; gv <= TF.vMax + 40; gv += 50) {
    pc.beginPath();
    pc.moveTo(X(TF.uMin) - 20, Y(gv));
    pc.lineTo(X(TF.uMax) + 20, Y(gv));
    pc.stroke();
  }

  // collect drawables (walls + items) and paint back-to-front
  var draws = [];
  vis.walls.forEach(function (w) { draws.push({ kind: "wall", ref: w, depth: wallDepth(view, w) }); });
  vis.items.forEach(function (it) { draws.push({ kind: "item", ref: it, depth: projDepth(view, it.x, it.z) }); });
  draws.sort(function (a, b) { return a.depth - b.depth; });
  draws.forEach(function (d) {
    if (d.kind === "wall") drawWallElev(pc, view, d.ref);
    else drawItemElev(pc, view, d.ref);
  });

  // placeholder points sit above everything they are measured against
  drawMarkersElev(pc, view);
  if (S.markerPreview && S.tool === "point") {
    pc.save();
    pc.globalAlpha = 0.5;
    markerGlyphElev(
      pc,
      X(projU(view, S.markerPreview.x, S.markerPreview.z)),
      Y(S.markerPreview.y || 0),
      false,
      false,
    );
    pc.restore();
  }

  // view label
  pc.fillStyle = "#33312c";
  pc.font = "bold 13px Arial";
  pc.textAlign = "left";
  pc.textBaseline = "top";
  pc.fillText(t("elev_" + view) + " · " + t("elev_elevation"), 14, 12);
}

/* ---- placeholder points in elevation ----
   The same crosshair target the plan draws, plus the two measurements only an
   elevation can show: height off the floor and the gap left to the ceiling.
   The horizontal pair comes from the very same measure4 the plan uses, mapped
   onto whichever world axis this view's `u` happens to be. */
const MK_COL = "#d6336c";
function markerGlyphElev(pc, cx, cy, filled, isSel) {
  var R = isSel ? 9.5 : 8,
    arm = R + (isSel ? 6 : 5);
  pc.save();
  pc.strokeStyle = MK_COL;
  pc.lineWidth = isSel ? 2.2 : 1.6;
  pc.setLineDash([]);
  pc.beginPath();
  pc.moveTo(cx - arm, cy); pc.lineTo(cx - R + 1, cy);
  pc.moveTo(cx + R - 1, cy); pc.lineTo(cx + arm, cy);
  pc.moveTo(cx, cy - arm); pc.lineTo(cx, cy - R + 1);
  pc.moveTo(cx, cy + R - 1); pc.lineTo(cx, cy + arm);
  pc.stroke();
  pc.beginPath();
  pc.arc(cx, cy, R, 0, 7);
  pc.fillStyle = filled ? MK_COL : "rgba(255,255,255,.85)";
  pc.fill();
  pc.stroke();
  if (!filled) {
    pc.beginPath();
    pc.arc(cx, cy, 2.4, 0, 7);
    pc.fillStyle = MK_COL;
    pc.fill();
  }
  pc.restore();
}
function elevLabel(pc, cx, cy, txt, color) {
  pc.save();
  pc.font = "10px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var tw = pc.measureText(txt).width;
  pc.fillStyle = "rgba(255,255,255,.8)";
  pc.fillRect(cx - tw / 2 - 4, cy - 7, tw + 8, 14);
  pc.fillStyle = color || "#3f6b78";
  pc.fillText(txt, cx, cy);
  pc.restore();
}
function drawMarkersElev(pc, view) {
  var ms = markers();
  if (!ms.length) return;
  var ceil = ceilingHeight(),
    uk = U_KEYS[view] || U_KEYS.front;
  ms.forEach(function (m) {
    var isSel = S.sel && S.sel.kind === "marker" && S.sel.ref === m;
    if (!(isSel || S.showDims)) {
      markerGlyphElev(pc, X(projU(view, m.x, m.z)), Y(m.y || 0), !!markerItem(m), isSel);
      return;
    }
    var cx = X(projU(view, m.x, m.z)),
      cy = Y(m.y || 0),
      y = m.y || 0;
    var leaders = [];
    // down to the floor + up to the ceiling — the two the plan cannot show
    if (y > 1) leaders.push({ x2: cx, y2: Y(0), txt: Math.round(y) });
    if (ceil - y > 1) leaders.push({ x2: cx, y2: Y(ceil), txt: Math.round(ceil - y) });
    /* left/right, from the shared horizontal clearance measurement. An
       occupied point measures from its object's edges, so each leader also
       STARTS there (ownT out along its own direction) instead of at the
       glyph — the same leader the plan draws, seen from the side. */
    var org = markerOrigin(m, markerItem(m)),
      ocx = X(projU(view, org.ox, org.oz));
    measure4(org.ox, org.oz, org.cs, org.skip).forEach(function (r) {
      var sgn = r.dir.key === uk.pos ? 1 : r.dir.key === uk.neg ? -1 : 0;
      if (!sgn) return;
      leaders.push({
        x1: ocx + sgn * r.ownT * TF.sc,
        x2: ocx + sgn * r.hitT * TF.sc,
        y2: cy,
        txt: Math.round(r.gap),
      });
    });

    pc.save();
    pc.strokeStyle = "rgba(63, 107, 120, 0.7)";
    pc.lineWidth = 1.5;
    pc.setLineDash([4, 4]);
    leaders.forEach(function (l) {
      pc.beginPath();
      pc.moveTo(l.x1 != null ? l.x1 : cx, l.y1 != null ? l.y1 : cy);
      pc.lineTo(l.x2, l.y2);
      pc.stroke();
    });
    pc.restore();
    markerGlyphElev(pc, cx, cy, !!markerItem(m), isSel);
    leaders.forEach(function (l) {
      elevLabel(
        pc,
        ((l.x1 != null ? l.x1 : cx) + l.x2) / 2,
        ((l.y1 != null ? l.y1 : cy) + l.y2) / 2,
        String(l.txt)
      );
    });
    elevLabel(pc, cx + 17, cy - 17, markerLabel(m), MK_COL);
  });
}

function wallDepth(view, w) {
  var samples = wallElevationSamples(view, w, { includeOpenings: false });
  if (!samples.length) return -Infinity;
  return samples.reduce(function (sum, sample) { return sum + sample.depth; }, 0) / samples.length;
}
function wallURange(view, w) {
  var g = wallGeom(w);
  var samples = wallElevationSamples(view, w);
  var lo = Infinity, hi = -Infinity;
  samples.forEach(function (sample) {
    lo = Math.min(lo, sample.lo, sample.u);
    hi = Math.max(hi, sample.hi, sample.u);
  });
  if (!samples.length) {
    lo = Math.min(projU(view, g.a.x, g.a.z), projU(view, g.b.x, g.b.z));
    hi = Math.max(projU(view, g.a.x, g.a.z), projU(view, g.b.x, g.b.z));
  }
  return {
    lo: lo,
    hi: hi,
    ua: samples.length ? samples[0].u : projU(view, g.a.x, g.a.z),
    ub: samples.length ? samples[samples.length - 1].u : projU(view, g.b.x, g.b.z),
    g: g,
    samples: samples,
  };
}

function fillWallStrip(pc, a, b) {
  if (a.top <= a.bottom && b.top <= b.bottom) return;
  pc.beginPath();
  pc.moveTo(X(a.lo), Y(a.bottom));
  pc.lineTo(X(a.lo), Y(a.top));
  pc.lineTo(X(a.hi), Y(a.top));
  pc.lineTo(X(b.hi), Y(b.top));
  pc.lineTo(X(b.hi), Y(b.bottom));
  pc.lineTo(X(b.lo), Y(b.bottom));
  pc.closePath();
  pc.fill();
}

function strokeWallProfile(pc, samples) {
  if (!samples.length) return;
  // Both projected faces are traced.  They collapse to one line when the wall
  // runs across the view and widen naturally when it runs into the view.
  ["lo", "hi"].forEach(function (face) {
    pc.beginPath();
    samples.forEach(function (sample, index) {
      var x = X(sample[face]), y = Y(sample.top);
      if (index) pc.lineTo(x, y); else pc.moveTo(x, y);
    });
    for (var i = samples.length - 1; i >= 0; i--)
      pc.lineTo(X(samples[i][face]), Y(samples[i].bottom));
    pc.closePath();
    pc.stroke();
  });
  var first = samples[0], last = samples[samples.length - 1];
  pc.beginPath();
  pc.moveTo(X(first.lo), Y(first.bottom)); pc.lineTo(X(first.lo), Y(first.top));
  pc.lineTo(X(first.hi), Y(first.top)); pc.lineTo(X(first.hi), Y(first.bottom));
  pc.moveTo(X(last.lo), Y(last.bottom)); pc.lineTo(X(last.lo), Y(last.top));
  pc.lineTo(X(last.hi), Y(last.top)); pc.lineTo(X(last.hi), Y(last.bottom));
  pc.stroke();
}

function openingSamples(view, w, o, g) {
  var half = Math.max(0, finiteNumber(o.width, 0)) / 2;
  var from = Math.max(0, finiteNumber(o.s, 0) - half);
  var to = Math.min(g.L, finiteNumber(o.s, 0) + half);
  if (to - from <= 1e-6) return [];
  var count = g.kind === "arc"
    ? Math.max(2, Math.min(32, Math.ceil((to - from) / Math.max(4, g.L / 48))))
    : 1;
  var distances = [];
  for (var i = 0; i <= count; i++) distances.push(from + ((to - from) * i) / count);
  return wallElevationSamples(view, w, { distances: distances, includeOpenings: false });
}

function drawOpeningElev(pc, view, w, o, r) {
  var samples = openingSamples(view, w, o, r.g);
  if (samples.length < 2) return;
  var sill = Math.max(0, finiteNumber(o.sill, 0));
  var head = sill + Math.max(0, finiteNumber(o.height, 0));
  var visible = [];
  samples.forEach(function (sample) {
    visible.push(Object.assign({}, sample, {
      bottom: Math.max(sample.bottom, sill),
      top: Math.min(sample.top, head),
    }));
  });
  var minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  pc.fillStyle = o.type === "window" ? "#cfe4ee" : "#f4efe4";
  for (var i = 1; i < visible.length; i++) {
    var a = visible[i - 1], b = visible[i];
    if (a.top <= a.bottom && b.top <= b.bottom) continue;
    // Openings cross the whole thickness, so use the same swept strip as the
    // wall rather than a chord-width rectangle.
    fillWallStrip(pc, a, b);
    minU = Math.min(minU, a.lo, b.lo);
    maxU = Math.max(maxU, a.hi, b.hi);
    minV = Math.min(minV, a.bottom, b.bottom);
    maxV = Math.max(maxV, a.top, b.top);
  }
  if (!Number.isFinite(minU) || maxU - minU < 1.5 / TF.sc) return;
  pc.strokeStyle = "#7c8a93";
  pc.lineWidth = 1.2;
  pc.beginPath();
  visible.forEach(function (sample, index) {
    if (index) pc.lineTo(X(sample.u), Y(sample.top));
    else pc.moveTo(X(sample.u), Y(sample.top));
  });
  for (var j = visible.length - 1; j >= 0; j--) pc.lineTo(X(visible[j].u), Y(visible[j].bottom));
  pc.closePath();
  pc.stroke();
  if (o.type === "window") {
    var x0 = X(minU), x1 = X(maxU), yTop = Y(maxV), yBot = Y(minV);
    pc.beginPath();
    pc.moveTo((x0 + x1) / 2, yTop); pc.lineTo((x0 + x1) / 2, yBot);
    pc.moveTo(x0, (yTop + yBot) / 2); pc.lineTo(x1, (yTop + yBot) / 2);
    pc.stroke();
  }
}

function drawWallElev(pc, view, w) {
  if (normalizeWallKind(w) === "roomDivider") return;
  var r = wallURange(view, w);
  var sel = S.sel && S.sel.kind === "wall" && S.sel.ref === w;
  // walls are drawn as light outlines (with openings) so the furniture placed
  // inside the room reads clearly against the room's height/shell
  pc.fillStyle = sel ? "rgba(63,107,120,.16)" : "rgba(184,173,147,.12)";
  for (var si = 1; si < r.samples.length; si++) fillWallStrip(pc, r.samples[si - 1], r.samples[si]);
  pc.strokeStyle = sel ? "#3f6b78" : "#9a8f77";
  pc.lineWidth = sel ? 2.5 : 1.2;
  strokeWallProfile(pc, r.samples);
  // openings on this wall → punch through as lighter rectangles
  S.openings.forEach(function (o) {
    if (o.wall !== w.id) return;
    drawOpeningElev(pc, view, w, o, r);
  });
}

function itemURange(view, it) {
  var us = itemCorners(it).map(function (p) { return projU(view, p.x, p.z); });
  return { lo: Math.min.apply(null, us), hi: Math.max.apply(null, us) };
}
function drawItemElev(pc, view, it) {
  var f = FURN[it.type];
  if (!f) return;
  var r = itemURange(view, it);
  // measured from the piece's own 3D geometry, so a wall TV or ceiling light
  // draws where it actually hangs rather than flat on the floor
  var sp = itemVSpan(it);
  var x0 = X(r.lo), x1 = X(r.hi), yTop = Y(sp.hi), yBot = Y(sp.lo);
  var sel = (S.sel && S.sel.kind === "item" && S.sel.ref === it) ||
    (S.sel && S.sel.kind === "items" && S.sel.refs.indexOf(it) !== -1);
  pc.fillStyle = fcolor(it);
  pc.globalAlpha = it.type === "rug" ? 0.85 : 0.96;
  pc.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  pc.globalAlpha = 1;
  pc.lineWidth = sel ? 3 : 1.3;
  pc.strokeStyle = sel ? "#3f6b78" : "#8a7f68";
  pc.strokeRect(x0, yTop, x1 - x0, yBot - yTop);
  // label if the silhouette is big enough
  if (x1 - x0 > 40 && yBot - yTop > 16) {
    pc.fillStyle = "#2f2d28";
    pc.font = "10px Arial";
    pc.textAlign = "center";
    pc.textBaseline = "middle";
    var nm = flabel(it.type), tw = pc.measureText(nm).width, cx = (x0 + x1) / 2, cy = (yTop + yBot) / 2;
    pc.fillStyle = "rgba(255,255,255,.55)";
    pc.fillRect(cx - tw / 2 - 3, cy - 7, tw + 6, 14);
    pc.fillStyle = "#2f2d28";
    pc.fillText(nm, cx, cy);
  }
}

function openingContains(w, s, y) {
  return S.openings.some(function (o) {
    if (o.wall !== w.id) return false;
    var half = Math.max(0, finiteNumber(o.width, 0)) / 2;
    var sill = Math.max(0, finiteNumber(o.sill, 0));
    var head = sill + Math.max(0, finiteNumber(o.height, 0));
    return s >= finiteNumber(o.s, 0) - half && s <= finiteNumber(o.s, 0) + half && y >= sill && y <= head;
  });
}

// Return the nearest physical branch of a projected wall at (u,v).  A major
// arc can cross the same elevation u more than once, so a global bounding box
// is not a hit test; each sampled branch competes by actual projected depth.
function wallElevationIntersection(view, w, u, v) {
  if (normalizeWallKind(w) === "roomDivider") return null;
  var r = wallURange(view, w), best = null;
  for (var i = 1; i < r.samples.length; i++) {
    var a = r.samples[i - 1], b = r.samples[i];
    var lo = Math.min(a.lo, a.hi, b.lo, b.hi), hi = Math.max(a.lo, a.hi, b.lo, b.hi);
    if (u < lo - 1e-6 || u > hi + 1e-6) continue;
    var du = b.u - a.u;
    var at = Math.abs(du) > 1e-7 ? (u - a.u) / du : 0.5;
    at = Math.max(0, Math.min(1, at));
    var s = a.s + (b.s - a.s) * at;
    var span = wallVerticalAt(w, s, r.g.L);
    if (v < span.bottom - 1e-6 || v > span.top + 1e-6 || openingContains(w, s, v)) continue;
    var p = wallPointAt(w, s) || {
      x: a.x + (b.x - a.x) * at,
      z: a.z + (b.z - a.z) * at,
    };
    var depth = projDepth(view, p.x, p.z);
    if (!best || depth > best.depth) best = {
      w: w,
      r: r,
      s: s,
      x: p.x,
      z: p.z,
      depth: depth,
      bottom: span.bottom,
      top: span.top,
      tangent: wallTangentAt(w, s) || { x: r.g.ux, z: r.g.uz },
    };
  }
  return best;
}

/* Resolve an elevation click into a full 3D point.

   An elevation gives two of the three coordinates for free: `v` IS the height,
   and `u` is one world axis. The depth axis is genuinely not in the picture, so
   it has to be inferred from what the click landed on — which is also what
   makes the result useful rather than arbitrary:

     - on a WALL  → the point lands on that wall's face TOWARD THE VIEWER, and
       carries the wall id plus the outward normal, so a piece seated on it
       faces into the room and stands clear of the wall;
     - on an ITEM → the point lands on that piece's near face (the natural
       "on top of / in front of that" spot);
     - on neither → the depth falls back to the middle of the model, and the
       point is a free floating one the user can slide in the plan view.

   Surface is read off the height: floor at the bottom, ceiling at the top,
   wall in between when a wall was actually hit. */
export function elevPick(px, py) {
  var view = S.viewAxis,
    vis = shown();
  var u = (px - TF.ox) / TF.sc,
    v = (TF.y0 - py) / TF.sc;
  if (!isFinite(u) || !isFinite(v)) return null;
  var ceil = ceilingHeight();
  var y = Math.max(0, Math.min(ceil, v));

  // nearest-to-viewer wall spanning this u at this height
  var bw = null,
    bwd = -Infinity;
  vis.walls.forEach(function (w) {
    var hit = wallElevationIntersection(view, w, u, y);
    if (hit && hit.depth > bwd) {
      bwd = hit.depth;
      bw = hit;
    }
  });
  if (bw) {
    var w = bw.w;
    var cx = bw.x, cz = bw.z;
    var half = (w.thickness || 0) / 2;
    /* Which of the wall's two faces? The one the ROOM is on — things get
       mounted on the inside. Picking the face toward the viewer instead would
       put every point on the front elevation's nearest wall on the building's
       exterior, which is never what "hang it on that wall" means. Elevations
       draw walls translucent precisely so you are looking INTO the room.
       Falls back to the viewer-facing side when neither side is enclosed
       (a free-standing wall), which is the only sensible answer left. */
    var n1x = -bw.tangent.z,
      n1z = bw.tangent.x;
    var probe = half + 6,
      rooms = detectRooms();
    var inPos = rooms.some(function (r) {
      return pointInPoly(cx + n1x * probe, cz + n1z * probe, r.pts);
    });
    var inNeg = rooms.some(function (r) {
      return pointInPoly(cx - n1x * probe, cz - n1z * probe, r.pts);
    });
    var flip;
    if (inPos !== inNeg) flip = inNeg; // exactly one side is a room -> use it
    else
      flip =
        projDepth(view, cx + n1x, cz + n1z) < projDepth(view, cx - n1x, cz - n1z);
    if (flip) {
      n1x = -n1x;
      n1z = -n1z;
    }
    return {
      x: cx + n1x * half,
      y: y,
      z: cz + n1z * half,
      surface: y >= bw.top - 2 ? "ceiling" : y <= bw.bottom + 2 ? "floor" : "wall",
      wall: w.id,
      nx: n1x,
      nz: n1z,
    };
  }

  // nearest-to-viewer item spanning this u at this height → its near face
  var bi = null,
    bid = -Infinity;
  vis.items.forEach(function (it) {
    var r = itemURange(view, it),
      sp = itemVSpan(it);
    if (u < r.lo || u > r.hi || v < sp.lo || v > sp.hi) return;
    var d = projDepth(view, it.x, it.z);
    if (d > bid) {
      bid = d;
      bi = it;
    }
  });
  var depth;
  if (bi) {
    // step to the near face: half the footprint along the depth axis
    var A = ((bi.rot || 0) * Math.PI) / 180,
      c = Math.abs(Math.cos(A)),
      sn = Math.abs(Math.sin(A));
    var hx = c * (bi.w / 2) + sn * (bi.d / 2),
      hz = sn * (bi.w / 2) + c * (bi.d / 2);
    var acrossDepth = view === "front" || view === "back" ? hz : hx;
    depth = bid + acrossDepth;
  } else {
    var bb = contentBounds();
    depth = projDepth(view, bb.cx, bb.cz);
    if (!isFinite(depth)) depth = 0;
  }
  var p = unproj(view, u, depth);
  return {
    x: p.x,
    y: y,
    z: p.z,
    surface: y >= ceil - 2 ? "ceiling" : y <= 2 ? "floor" : "wall",
    wall: null,
    nx: 0,
    nz: 0,
  };
}

// screen pixel → the marker under it, or null. Markers are small, deliberate
// targets, so they win over walls and items (same rule as the plan view).
export function elevationHitMarker(px, py) {
  var view = S.viewAxis,
    thr = 13,
    best = null,
    bd = thr;
  markers().forEach(function (m) {
    var d = Math.hypot(px - X(projU(view, m.x, m.z)), py - Y(m.y || 0));
    if (d < bd) {
      bd = d;
      best = m;
    }
  });
  return best;
}

// screen pixel → the world point a marker DRAG should move to. u and v are the
// two axes an elevation can actually edit; the depth axis is left alone, so a
// point dragged in the front view keeps its z.
export function elevDragTo(m, px, py) {
  var view = S.viewAxis;
  var u = (px - TF.ox) / TF.sc,
    v = (TF.y0 - py) / TF.sc;
  if (!isFinite(u) || !isFinite(v)) return null;
  var p = unproj(view, u, projDepth(view, m.x, m.z));
  return { x: p.x, y: Math.max(0, v), z: p.z };
}

// Arrow-key nudge in elevation space: du runs along the view's horizontal axis
// (whichever world axis that is), dv is height. The depth axis is untouched.
export function elevNudge(m, du, dv) {
  var view = S.viewAxis;
  var p = unproj(view, projU(view, m.x, m.z) + du, projDepth(view, m.x, m.z));
  return { x: p.x, y: Math.max(0, (m.y || 0) + dv), z: p.z };
}

// hit-test a screen pixel in the current elevation → {kind, ref} or null.
// Nearest-to-viewer wins; items take priority over walls.
export function elevationHit(px, py) {
  var view = S.viewAxis,
    vis = shown();
  var mk = elevationHitMarker(px, py);
  if (mk) return { kind: "marker", ref: mk };
  var u = (px - TF.ox) / TF.sc, v = (TF.y0 - py) / TF.sc;
  var best = null, bestDepth = -Infinity;
  vis.items.forEach(function (it) {
    var r = itemURange(view, it), sp = itemVSpan(it);
    if (u >= r.lo && u <= r.hi && v >= sp.lo && v <= sp.hi) {
      var d = projDepth(view, it.x, it.z);
      if (d > bestDepth) { bestDepth = d; best = { kind: "item", ref: it }; }
    }
  });
  if (best) return best;
  var bw = null, bwd = -Infinity;
  vis.walls.forEach(function (w) {
    var hit = wallElevationIntersection(view, w, u, v);
    if (hit && hit.depth > bwd) { bwd = hit.depth; bw = { kind: "wall", ref: w }; }
  });
  return bw;
}
