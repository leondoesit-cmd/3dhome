// Cabinet designer elevation: 2D drawing, partition tools, PNG and the 3D preview.

import { clamp, fin } from "./state.js";
import { buildItem } from "./furniture.js";
import { loadThree, threeLoaded } from "./three_lazy.js";
import { createEditorView, createViewportSwap } from "./editor_view.js";
import {
  layoutCab, isFloat, isCorner,
  secLabel,
  famLabel,
  frontLabel,
  cabSummary,
  cabPrice,
  kindLabel,
  normalizeSpec,
  SEC,
  STD,
} from "./cabinet.js";
import { api, E, T, isEn, AXES, sp, formatCm } from "./ui_cabinet_ctx.js";
import { displayUnit, toDisp, fromDisp } from "./display_units.js";

/* Persistent pan & zoom state for the 2D elevation. The base scale `k` auto-
   fits the cabinet to the viewport; these overlay it so a pinch gesture can
   zoom in without losing the auto-fit reset. `resetView()` brings it home. */
var viewZoom = 1, viewPanX = 0, viewPanY = 0;

export function resetElevationView() {
  viewZoom = 1;
  viewPanX = 0;
  viewPanY = 0;
}

export function sizeCanvas() {
  if (!E.cv) return;
  var r = E.cv.parentElement.getBoundingClientRect(),
    dpr = Math.min(2, window.devicePixelRatio || 1),
    // split view: the drawing keeps the left half, the model has the right
    w = E.split ? Math.floor(r.width / 2) : r.width;
  E.cv.width = Math.max(100, w * dpr);
  E.cv.height = Math.max(100, r.height * dpr);
  E.cv.style.width = w + "px";
  E.cv.style.height = r.height + "px";
  E.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  E.vw = w;
  E.vh = r.height;
}

export function css(name, fb) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fb;
}

/* ================= view modes =================
   2 is the drawing, 3 is the model — the same two keys a CAD user reaches for.
   In 2D the drawing looks from whichever direction is picked: the six axes and
   the four 45° corners between the horizontal ones. Only the front view is the
   editable elevation; the rest are orthographic projections of the very same
   layout, so they cannot drift from it.
   Split is the drawing with the model beside it: E.mode stays "2d" — every
   tool and axis works as in the drawing — and the renderer the 3D view
   borrows sits in the right half, so an edit shows up in the round at once. */
export function setMode(m) {
  if (!E.host) return;
  var split = m === "split";
  m = m === "3d" ? "3d" : "2d";
  if (m === E.mode && split === !!E.split && E.modeApplied) return;
  var wasSplit = !!E.split;
  if (!(wasSplit && split)) { viewZoom = 1; viewPanX = 0; viewPanY = 0; }
  E.mode = m;
  E.split = split;
  E.modeApplied = true;
  if (m === "3d") setTool(null);
  /* Switching to the model picks up the drawing's own direction, so the piece
     does not jump to some unrelated angle the moment you want to look at it in
     the round. Straight up and straight down are pulled back off the pole —
     a camera looking exactly along its own up vector has no orientation. */
  if (m === "3d" && E.pv && AXES[E.axis]) E.pv.orbitTo(AXES[E.axis].az, AXES[E.axis].el);
  // one renderer, two homes — see editor_view.js
  if (!E.swapView) {
    E.swapView = createViewportSwap({
      wrap: E.host.querySelector(".cb-prev-wrap"),
      bigHost: E.host.querySelector("#cb3dHost"),
      panelHost: E.host.querySelector(".cb-right"),
    });
  }
  E.host.classList.toggle("cb-is3d", m === "3d");
  E.host.classList.toggle("cb-split", split);
  E.swapView(m === "3d" || split, E.pv);
  if (split !== wasSplit) sizeCanvas();
  E.host.querySelectorAll("#cbViews button[data-mode]").forEach(function (b) {
    var selected = b.getAttribute("data-mode") === (split ? "split" : m);
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  syncHint();
  if (E.view || m === "2d") draw();
  renderPreview();
}

export function setAxis(a) {
  if (!AXES[a]) return;
  viewZoom = 1; viewPanX = 0; viewPanY = 0;
  E.axis = a;
  if (a !== "front") setTool(null);
  E.host.querySelectorAll("#cbViews button[data-ax]").forEach(function (b) {
    var selected = b.getAttribute("data-ax") === a;
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  E.host.querySelectorAll("#cbTools button").forEach(function (b) {
    b.disabled = a !== "front" && !!b.getAttribute("data-tool");
  });
  E.host.querySelector("#cbHid").disabled = a === "front"; // no projection to hide
  setMode(E.split ? "split" : "2d"); // a direction is picked for the drawing half
  syncHint();
  draw();
}

export function syncHint() {
  var h = E.host && E.host.querySelector(".cb-hint");
  if (!h) return;
  /* The compact layout is a touch layout: its hints must not name a wheel, a
     Shift key or a number key, and they have one line to say it in. */
  var cmp = E.host.classList.contains("cb-compact");
  h.textContent =
    E.mode === "3d" ? T(cmp ? "hint3dT" : "hint3d")
      : E.axis !== "front" ? T("hintRO")
      : E.tool ? T(E.tool === "vwall" ? "hintV" : E.tool === "hwall" ? (cmp ? "hintHT" : "hintH") : "hintErase")
      : T(cmp ? "hintT" : "hint");
}

export function syncViewPreferences() {
  if (!E.host) return;
  var snap = E.host.querySelector("#cbSnap"), hidden = E.host.querySelector("#cbHid");
  if (snap) {
    snap.classList.toggle("on", E.snap);
    snap.setAttribute("aria-pressed", E.snap ? "true" : "false");
    snap.querySelector("span").textContent = T(E.snap ? "snapOn" : "snapOff");
  }
  if (hidden) {
    hidden.classList.toggle("on", E.hid);
    hidden.setAttribute("aria-pressed", E.hid ? "true" : "false");
    hidden.querySelector("span").textContent = T(E.hid ? "hidOn" : "hidOff");
  }
}

/* --- the orthographic projection behind every view but the front --- */
function camBasis(az, elv) {
  var dir = [Math.sin(az) * Math.cos(elv), Math.sin(elv), Math.cos(az) * Math.cos(elv)],
    // straight up or straight down leaves no horizon to take "right" from, so
    // a plan view is pinned: width across, depth up the page
    flat = Math.abs(Math.cos(elv)) < 1e-6,
    rt = flat ? [1, 0, 0] : norm([dir[2], 0, -dir[0]]),
    up = [
      dir[1] * rt[2] - dir[2] * rt[1],
      dir[2] * rt[0] - dir[0] * rt[2],
      dir[0] * rt[1] - dir[1] * rt[0],
    ];
  return { dir: dir, rt: rt, up: up };
}
function norm(v) {
  var l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/* Every part reduced to the box it occupies. A rail or a handle is a cylinder
   and a corner board a polygon, but at drawing scale their extent is what
   reads — and one shape here keeps the projector to a single code path. */
function partBox(p) {
  if (p.k === "box") return [p.x0, p.y0, p.z0, p.x1, p.y1, p.z1];
  if (p.k === "poly") {
    var xs = p.pts.map(function (q) { return q.x; }),
      zs = p.pts.map(function (q) { return q.z; });
    return [Math.min.apply(null, xs), p.y0, Math.min.apply(null, zs), Math.max.apply(null, xs), p.y1, Math.max.apply(null, zs)];
  }
  var r = p.r || 1,
    hgt = p.k === "sph" ? 2 * r : p.hgt || 2 * r,
    // a cylinder stands on Y unless it was laid over onto another axis
    ex = p.rz ? hgt / 2 : r,
    ey = p.rx || p.rz ? r : hgt / 2,
    ez = p.rx ? hgt / 2 : r;
  return [p.x - ex, p.y - ey, p.z - ez, p.x + ex, p.y + ey, p.z + ez];
}

// The 8 corners in the cabinet's own frame, through the part's pivot if it has
// one (an open door, a pulled-out drawer) — the same transform buildCab uses.
function partCorners(p, L) {
  var b = partBox(p),
    u = p.unit != null ? L.units[p.unit] : null,
    out = [];
  for (var i = 0; i < 8; i++) {
    var x = i & 1 ? b[3] : b[0],
      y = i & 2 ? b[4] : b[1],
      z = i & 4 ? b[5] : b[2];
    if (u) {
      var lx = x - (u.px || 0),
        ly = y - (u.py || 0),
        lz = z - (u.pz || 0),
        a = u.ang || 0,
        c = Math.cos(a),
        s = Math.sin(a),
        rx = lx, ry = ly, rz = lz;
      if (u.rot === "y") { rx = lx * c + lz * s; rz = -lx * s + lz * c; }
      else if (u.rot === "x") { ry = ly * c - lz * s; rz = ly * s + lz * c; }
      else if (u.rot === "z") { rx = lx * c - ly * s; ry = lx * s + ly * c; }
      x = rx + (u.px || 0) + (u.tx || 0);
      y = ry + (u.py || 0) + (u.ty || 0);
      z = rz + (u.pz || 0) + (u.tz || 0);
    }
    out.push([x, y, z]);
  }
  return out;
}

/* The six faces of the corner cube, as indices into partCorners' order. No
   normals baked in: a door on its hinge is not axis-aligned any more, so the
   normal is taken from the transformed corners and pointed outwards from the
   part's own centre — which is true whatever the pivot did to it. */
var FACES = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
function faceNormal(w3, idx, centre) {
  var a = w3[idx[0]], b = w3[idx[1]], c = w3[idx[2]],
    e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]],
    n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]],
    mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2],
    out = [mid[0] - centre[0], mid[1] - centre[1], mid[2] - centre[2]];
  if (dot3(n, out) < 0) n = [-n[0], -n[1], -n[2]];
  return norm(n);
}

/* Which face sits across each edge of each face, worked out once by matching
   vertex pairs. An edge whose neighbour is turned away from us is a silhouette
   edge — the outline of the part against whatever lies behind it — and those
   are the only edges worth haloing. */
var FACE_NB = (function () {
  function key(a, b) { return a < b ? a + ":" + b : b + ":" + a; }
  var owner = {};
  FACES.forEach(function (f, i) {
    for (var j = 0; j < 4; j++) (owner[key(f[j], f[(j + 1) % 4])] || (owner[key(f[j], f[(j + 1) % 4])] = [])).push(i);
  });
  return FACES.map(function (f, i) {
    var out = [];
    for (var j = 0; j < 4; j++) {
      var o = owner[key(f[j], f[(j + 1) % 4])];
      out.push(o[0] === i ? o[1] : o[0]);
    }
    return out;
  });
})();

/* One colour per material, pulled apart in hue as well as in value: two boards
   of the same brightness sitting edge to edge read as one board otherwise. */
var PROJ_COL = {
  front: [204, 172, 126], doorPanel: [192, 158, 112], batten: [178, 146, 104],
  carcass: [226, 210, 182], back: [186, 174, 152], dark: [96, 88, 80],
  top: [128, 124, 120], metal: [154, 162, 172], rail: [140, 148, 160],
  handle: [104, 116, 132], glazing: [170, 206, 222], glass: [170, 206, 222],
  screen: [62, 70, 84], led: [232, 226, 176], appliance: [190, 196, 204],
  tvPanel: [112, 106, 100], leather: [150, 106, 82], garment: [166, 150, 168],
  fabric: [176, 160, 140],
};

/* A CSS colour to [r,g,b]. Only the forms the themes actually use — #rgb, #rrggbb
   and rgb()/rgba() — with the caller's fallback for anything else. */
function rgbOf(s, fb) {
  s = (s || "").trim();
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = /^rgba?\(([^)]+)\)/i.exec(s);
  if (m) {
    var n = m[1].split(/[,\s/]+/).map(parseFloat);
    if (n.length >= 3 && n.every(function (q) { return isFinite(q); })) return [n[0], n[1], n[2]];
  }
  return fb;
}
function mixC(a, b, t) {
  return Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
}

export function drawProjected(ax) {
  var it = E.it,
    L = layoutCab(it),
    c = E.cx,
    W = E.vw,
    H = E.vh,
    v = AXES[ax],
    B = camBasis(v.az, v.el),
    // Same story as the elevation: on the compact layout the view picker is a
    // sheet, so the strip it owned down the leading edge is the drawing's.
    cmp = E.host && E.host.classList.contains("cb-compact"),
    pad = cmp ? 40 : 92, // the dimension chains and the hint pill live in this margin
    gut = cmp ? 0 : 118; // and the view picker owns this strip down the leading edge
  E.view = null; // nothing here is hit-testable — the front view owns editing

  /* Looking straight down at a closed box shows you a lid, which tells nobody
     anything — so the plan view is a section: the top of the carcass comes off.
     The same courtesy from below. */
  var skip = ax === "top" ? { top: 1, worktop: 1 } : ax === "bottom" ? { bottom: 1, plinth: 1 } : {};

  // every corner first, so the drawing is fitted to what it actually is
  var boxes = [],
    minU = 1e9, maxU = -1e9, minV = 1e9, maxV = -1e9;
  L.parts.forEach(function (p) {
    if (skip[p.role]) return;
    var pts = partCorners(p, L),
      pr = pts.map(function (q) {
        var uu = dot3(q, B.rt), vv = dot3(q, B.up), dd = dot3(q, B.dir);
        if (uu < minU) minU = uu;
        if (uu > maxU) maxU = uu;
        if (vv < minV) minV = vv;
        if (vv > maxV) maxV = vv;
        return [uu, vv, dd];
      });
    /* Sorted on the corner nearest the camera, not the centroid: a side panel
       runs the whole depth of the piece, so its centre sits behind a door that
       it is in fact level with, and the door would be painted over. */
    var dsum = 0,
      dmax = -1e9,
      ctr = [0, 0, 0];
    pr.forEach(function (q) {
      dsum += q[2];
      if (q[2] > dmax) dmax = q[2];
    });
    pts.forEach(function (q) {
      ctr[0] += q[0] / 8;
      ctr[1] += q[1] / 8;
      ctr[2] += q[2] / 8;
    });
    boxes.push({ p: p, pr: pr, w3: pts, ctr: ctr, depth: dmax, mid: dsum / 8 });
  });
  if (!boxes.length) return;
  var k = Math.min((W - gut - pad * 2) / Math.max(1, maxU - minU), (H - pad * 2) / Math.max(1, maxV - minV)),
    ox = gut + (W - gut) / 2 - ((minU + maxU) / 2) * k,
    oy = H / 2 + ((minV + maxV) / 2) * k;

  c.clearRect(0, 0, W, H);
  var muted = css("--text-muted", "#7b838c");

  /* Sorted face by face, not box by box. A whole-box sort is fine looking
     down an axis, but at 45° a door panel's nearest corner sticks out further
     than the handle bolted to its face, so the door won ties and painted over
     its own handle. Each quad carries its own depth instead, which is what the
     painter's algorithm actually wants. */
  var faces = [];
  boxes.forEach(function (bx) {
    var base = PROJ_COL[bx.p.mat] || PROJ_COL.carcass,
      vis = FACES.map(function (f) {
        return dot3(faceNormal(bx.w3, f, bx.ctr), B.dir) > 0.001; // towards us?
      });
    FACES.forEach(function (f, fi) {
      if (!vis[fi]) return;
      var nrm = faceNormal(bx.w3, f, bx.ctr),
        d = 0;
      f.forEach(function (idx) { d += bx.pr[idx][2] / 4; });
      // a flat lambert on the face normal is all the depth cue a shop drawing
      // needs, and it keeps the six axis views readable when faces are edge-on
      faces.push({ f: f, pr: bx.pr, base: base, d: d,
        sil: FACE_NB[fi].map(function (nb) { return !vis[nb]; }),
        sh: 0.62 + 0.38 * Math.max(0, dot3(nrm, norm([0.35, 0.85, 0.4]))) });
    });
  });
  if (!faces.length) return;
  faces.sort(function (a, b) { return a.d - b.d; });

  /* Aerial perspective: everything fades towards the canvas behind it with
     distance, so what is in front of what is readable without spinning the
     model. The near end keeps its full colour — only depth is spent here. */
  var dLo = faces[0].d,
    dHi = faces[faces.length - 1].d,
    span = Math.max(1e-6, dHi - dLo),
    bg = rgbOf(css("--bg-canvas-2d", "#e2e8f0"), [226, 232, 240]);

  c.lineJoin = "round";
  c.lineCap = "round";
  var P = function (idx, pr) { return [ox + pr[idx][0] * k, oy - pr[idx][1] * k]; };

  /* A coarse depth buffer over the drawing, so an edge can be asked whether
     anything stands in front of it. Half resolution is plenty — it decides
     dashed-versus-solid, it does not draw anything. The projection is
     orthographic, so depth across a flat face is an affine function of the
     screen position: three corners give the plane, and no perspective divide
     is needed anywhere here. */
  var ZS = 0.5,
    BW = Math.max(1, Math.ceil(W * ZS)),
    BH = Math.max(1, Math.ceil(H * ZS)),
    zb = new Float32Array(BW * BH).fill(-1e30);
  faces.forEach(function (fc) {
    var q = fc.f.map(function (idx) {
      var p = P(idx, fc.pr);
      return [p[0] * ZS, p[1] * ZS, fc.pr[idx][2]];
    });
    var e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]],
      e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]],
      det = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.abs(det) < 1e-9) return; // edge-on: no area to occlude with
    var a = (e1[2] * e2[1] - e2[2] * e1[1]) / det,
      b = (e2[2] * e1[0] - e1[2] * e2[0]) / det,
      cc = q[0][2] - a * q[0][0] - b * q[0][1],
      ys = q.map(function (p) { return p[1]; }),
      y0 = Math.max(0, Math.floor(Math.min.apply(null, ys))),
      y1 = Math.min(BH - 1, Math.ceil(Math.max.apply(null, ys)));
    for (var y = y0; y <= y1; y++) {
      var yc = y + 0.5, xlo = 1e30, xhi = -1e30;
      for (var i = 0; i < 4; i++) {
        var A = q[i], Bq = q[(i + 1) % 4];
        if ((A[1] <= yc) === (Bq[1] <= yc)) continue;
        var x = A[0] + ((yc - A[1]) / (Bq[1] - A[1])) * (Bq[0] - A[0]);
        if (x < xlo) xlo = x;
        if (x > xhi) xhi = x;
      }
      if (xhi < xlo) continue;
      var xa = Math.max(0, Math.floor(xlo)), xb = Math.min(BW - 1, Math.ceil(xhi));
      for (var xx = xa; xx <= xb; xx++) {
        var d = a * (xx + 0.5) + b * yc + cc, o = y * BW + xx;
        if (d > zb[o]) zb[o] = d;
      }
    }
  });
  // half a board's thickness of slack, so a face never buries its own outline
  var ZEPS = Math.max(0.4, span * 0.004);
  function occluded(X, Y, d) {
    var x = Math.floor(X * ZS), y = Math.floor(Y * ZS);
    if (x < 0 || y < 0 || x >= BW || y >= BH) return false;
    return zb[y * BW + x] > d + ZEPS;
  }

  /* Each face is cut into a grid before it is sorted. One scalar per polygon
     cannot order geometry that interleaves: a drawer box pulled out of its
     carcass is partly in front of the side panel and partly behind it, and
     whichever way the two averages fall, one of them paints straight over the
     other. Cut into tiles the ordering is per tile, so the same board can be
     in front along one edge and behind along another — which is what it is.
     Faces flat-on to the camera stay whole; only depth costs tiles. */
  var tiles = [];
  faces.forEach(function (fc) {
    var pt = fc.f.map(function (idx) { return P(idx, fc.pr); }),
      dz = fc.f.map(function (idx) { return fc.pr[idx][2]; }),
      ext = Math.max.apply(null, dz) - Math.min.apply(null, dz),
      n = Math.max(1, Math.min(8, Math.round(ext / (span * 0.05)))),
      // bilinear over the quad: valid for a planar face under an ortho camera
      at = function (u, vq) {
        var a = 1 - u, b2 = 1 - vq;
        return [
          b2 * (a * pt[0][0] + u * pt[1][0]) + vq * (a * pt[3][0] + u * pt[2][0]),
          b2 * (a * pt[0][1] + u * pt[1][1]) + vq * (a * pt[3][1] + u * pt[2][1]),
          b2 * (a * dz[0] + u * dz[1]) + vq * (a * dz[3] + u * dz[2]),
        ];
      };
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        // a hair of overlap, or antialiasing leaves seams between the tiles
        var u0 = i / n - 0.004, u1 = (i + 1) / n + 0.004,
          v0 = j / n - 0.004, v1 = (j + 1) / n + 0.004,
          q = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)],
          ctr = at((i + 0.5) / n, (j + 0.5) / n);
        /* Dropped only when the centre AND both quarter points are covered. A
           tile that is half visible has to stay, or the cull eats bites out of
           the silhouette and the edge comes out looking sawn. */
        if (occluded(ctr[0], ctr[1], ctr[2]) &&
            occluded.apply(null, at((i + 0.25) / n, (j + 0.25) / n)) &&
            occluded.apply(null, at((i + 0.75) / n, (j + 0.75) / n))) continue;
        tiles.push({ q: q, d: ctr[2], fc: fc });
      }
    }
  });
  tiles.sort(function (a, b) { return a.d - b.d; });

  tiles.forEach(function (tl) {
    // shaded off the whole face, not the tile: a per-tile fade puts a visible
    // step down the middle of a board that the tiling is meant to be invisible
    var t = (dHi - tl.fc.d) / span, // 0 nearest, 1 furthest
      fade = 0.34 * t * t, // squared: the fall-off stays off the front ranks
      base = tl.fc.base,
      sh = tl.fc.sh,
      q = tl.q;

    /* No halo line here any more. It was a per-face trick and it does not
       survive being cut into tiles: along an edge that runs away from the
       camera one tile's halo is stroked after its neighbour's fill and takes a
       notch out of it, which is what serrated every silhouette. The weighted
       outline plus the dashed hidden lines carry the same information without
       painting over anything. */
    c.beginPath();
    q.forEach(function (p, n2) {
      if (n2 === 0) c.moveTo(p[0], p[1]);
      else c.lineTo(p[0], p[1]);
    });
    c.closePath();
    c.fillStyle = "rgb(" + mixC(base[0] * sh, bg[0], fade) + "," + mixC(base[1] * sh, bg[1], fade) + "," + mixC(base[2] * sh, bg[2], fade) + ")";
    c.fill();
  });

  /* Edges last, and every one of them walked against the depth buffer rather
     than drawn end to end: the stretch of an edge you can see comes out solid,
     the stretch running behind another part comes out dashed. That is the
     whole hidden-line convention, and it is also why an edge no longer gets a
     solid line drawn parallel to its own dashed one — one walk decides both.
     A silhouette edge is weighted heavier than a fold, as in a hand drawing.
     Folds are never dashed: hidden internal edges turn a drawing into
     hatching. */
  var hcol = rgbOf(css("--text-muted", "#7b838c"), [123, 131, 140]),
    dash = "rgba(" + hcol[0] + "," + hcol[1] + "," + hcol[2] + ",0.75)";
  c.lineCap = "butt";
  faces.forEach(function (fc) {
    var t = (dHi - fc.d) / span,
      fade = 0.34 * t * t,
      base = fc.base,
      ink = "rgba(" + mixC(base[0] * 0.28, bg[0], fade) + "," + mixC(base[1] * 0.28, bg[1], fade) + "," + mixC(base[2] * 0.28, bg[2], fade) + ",";
    for (var e = 0; e < 4; e++) {
      var i0 = fc.f[e], i1 = fc.f[(e + 1) % 4],
        A = P(i0, fc.pr), Bp = P(i1, fc.pr),
        dA = fc.pr[i0][2], dB = fc.pr[i1][2],
        len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
      if (len < 1) continue;
      var n = Math.min(200, Math.max(2, Math.ceil(len / 3))),
        hit = [];
      for (var s = 0; s < n; s++) {
        var m = (s + 0.5) / n;
        hit.push(occluded(A[0] + (Bp[0] - A[0]) * m, A[1] + (Bp[1] - A[1]) * m, dA + (dB - dA) * m));
      }
      /* De-speckled before anything is drawn. An edge that grazes the surface
         it lies against flips hidden/visible from sample to sample — against a
         2 px depth buffer that is noise, not geometry — and drawing it run by
         run made a solid edge come out looking finely dashed. A stretch has to
         hold for three samples (~9 px) to count as a change. */
      for (var pass = 0; pass < 2; pass++) {
        for (var i2 = 0; i2 < n; i2++) {
          var j2 = i2;
          while (j2 + 1 < n && hit[j2 + 1] === hit[i2]) j2++;
          if (j2 - i2 < 2 && (i2 > 0 || j2 < n - 1)) {
            var fillv = i2 > 0 ? hit[i2 - 1] : hit[j2 + 1];
            for (var z = i2; z <= j2; z++) hit[z] = fillv;
          }
          i2 = j2;
        }
      }
      var run = 0;
      for (var s2 = 1; s2 <= n; s2++) {
        if (s2 < n && hit[s2] === hit[run]) continue;
        seg(run / n, s2 / n, hit[run]);
        run = s2;
      }
      // eslint-disable-next-line no-loop-func
      function seg(t0, t1, hidden) {
        if (hidden && !E.hid) return; // "visible only": it simply is not there
        if (hidden) {
          c.setLineDash([5, 4]);
          c.strokeStyle = dash;
          c.lineWidth = 1;
        } else {
          c.setLineDash([]);
          c.strokeStyle = ink + (fc.sil[e] ? 0.92 - 0.5 * t : 0.5 - 0.3 * t).toFixed(2) + ")";
          c.lineWidth = (fc.sil[e] ? 1.5 : 0.7) - 0.5 * t;
        }
        c.beginPath();
        c.moveTo(A[0] + (Bp[0] - A[0]) * t0, A[1] + (Bp[1] - A[1]) * t0);
        c.lineTo(A[0] + (Bp[0] - A[0]) * t1, A[1] + (Bp[1] - A[1]) * t1);
        c.stroke();
      }
    }
  });
  c.setLineDash([]);
  c.lineCap = "round";
  dims();

  // the two real dimensions of an axis view (a 45° view has none to give)
  function dims() {
    if (!v.hDim) return;
    var hv = it[v.hDim],
      vv2 = it[v.vDim];
    dimTick(c, ox + minU * k, ox + maxU * k, oy - minV * k + 30, Math.round(hv), muted, true);
    dimTickV(c, oy - maxV * k, oy - minV * k, ox + minU * k - 30, Math.round(vv2), muted, true);
  }
}

export function draw() {
  if (!E.open || !E.cx || !E.vw) return;
  if (E.mode === "3d") {
    E.cx.clearRect(0, 0, E.vw || 0, E.vh || 0);
    return;
  }
  if (E.axis !== "front") return drawProjected(E.axis);
  /* The margins exist to clear the chrome that floats over the canvas, and the
     compact layout has different chrome: no tool group in the corner (it is a
     sheet), and the hint pill moved to the top. Reserving the desktop's 112px
     for a rail that is not there wastes a fifth of a phone screen. */
  var cmp = E.host && E.host.classList.contains("cb-compact");
  var it = E.it,
    L = layoutCab(it),
    c = E.cx,
    W = E.vw,
    H = E.vh,
    padX = cmp ? 30 : 58,
    // split view: half the width, so the view picker's strip is the drawing's
    // to avoid, and the tools shrink to one row of icons
    gut = E.split && !cmp ? 118 : 0,
    padT = cmp ? 54 : E.split ? 72 : 112, // desktop: the labelled 2×2 tool group floats here
    padB = cmp ? 46 : 84, // room for the width dimension and the hint pill
    k = Math.min((W - gut - padX * 2) / it.w, (H - padT - padB) / it.h) * viewZoom,
    ox = gut + (W - gut) / 2 + viewPanX,
    /* oy is the BASELINE of the drawing (Y = oy - my*k). Desktop hangs it from
       the top margin, under the tool group; compact centres it in the free band,
       because a tall phone canvas would otherwise leave the cabinet stranded
       against the ceiling with half the screen empty below it. */
    oy = cmp
      ? padT + (H - padT - padB - it.h * k) / 2 + it.h * k + viewPanY
      : padT + it.h * k + viewPanY;
  E.view = { k: k, ox: ox, oy: oy, L: L };
  var X = function (mx) {
      return ox + mx * k;
    },
    Y = function (my) {
      return oy - my * k;
    };

  c.clearRect(0, 0, W, H);
  var line = css("--border-color", "#c9ced4"),
    txt = css("--text-main", "#20242a"),
    muted = css("--text-muted", "#7b838c"),
    accent = css("--accent", "#3b82f6");

  // carcass body — a floating run has none, so its extent is only indicated
  var floating = L.sp.carcass === "float";
  c.fillStyle = "rgba(140,120,90,0.10)";
  c.strokeStyle = line;
  c.lineWidth = 2;
  if (floating) {
    c.save();
    c.setLineDash([5, 4]);
    c.lineWidth = 1;
    c.strokeRect(X(-it.w / 2), Y(it.h), it.w * k, it.h * k);
    c.restore();
  } else {
    c.fillRect(X(-it.w / 2), Y(it.h), it.w * k, it.h * k);
    c.strokeRect(X(-it.w / 2), Y(it.h), it.w * k, it.h * k);
  }

  // plinth
  if (L.sp.plinth > 0) {
    c.fillStyle = "rgba(90,90,90,0.18)";
    c.fillRect(X(-it.w / 2), Y(L.sp.plinth), it.w * k, L.sp.plinth * k);
    c.strokeRect(X(-it.w / 2), Y(L.sp.plinth), it.w * k, L.sp.plinth * k);
  }
  if (L.sp.top) {
    c.fillStyle = "rgba(60,70,80,0.22)";
    c.fillRect(X(-it.w / 2), Y(it.h), it.w * k, L.sp.top * k);
  }

  c.font = "600 11px Inter, Rubik, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";

  L.cols.forEach(function (col, ci) {
    // a filler / blind corner is drawn as one hatched block: no division, no
    // front, exactly what it is on a joinery elevation
    if (col.kind && col.kind !== "normal") {
      var fx = X(col.x0),
        fy = Y(L.yt + L.t),
        fw = (col.x1 - col.x0) * k,
        fh = (L.yt - L.yb + 2 * L.t) * k,
        selF = E.sel && E.sel.col === ci;
      c.fillStyle = "rgba(120,128,136,0.20)";
      c.fillRect(fx, fy, fw, fh);
      c.save();
      c.beginPath();
      c.rect(fx, fy, fw, fh);
      c.clip();
      c.strokeStyle = "rgba(120,128,136,0.55)";
      c.lineWidth = 1;
      for (var hx = -fh; hx < fw; hx += 9) {
        c.beginPath();
        c.moveTo(fx + hx, fy + fh);
        c.lineTo(fx + hx + fh, fy);
        c.stroke();
      }
      c.restore();
      c.strokeStyle = selF ? accent : line;
      c.lineWidth = selF ? 3 : 1;
      c.strokeRect(fx, fy, fw, fh);
      if (fw > 30) {
        c.save();
        c.translate(fx + fw / 2, fy + fh / 2);
        if (fw < 70) c.rotate(-Math.PI / 2);
        c.fillStyle = txt;
        c.fillText(kindLabel(col.kind), 0, 0);
        c.restore();
      }
      dimTick(c, X(col.x0), X(col.x1), Y(it.h) - 26, Math.round(col.w), muted);
      return;
    }
    col.secs.forEach(function (cell, si) {
      var x = X(col.x0),
        y = Y(cell.y1),
        w = (col.x1 - col.x0) * k,
        h = (cell.y1 - cell.y0) * k,
        m = SEC[cell.ref.t] || SEC.shelves,
        selected = E.sel && E.sel.col === ci && E.sel.sec === si;
      if (!cell.floatShelf) {
        c.fillStyle = m.col;
        c.globalAlpha = 0.55;
        c.fillRect(x, y, w, h);
        c.globalAlpha = 1;
        drawSecDetail(c, cell, x, y, w, h, k, line);
      }
      c.strokeStyle = selected ? accent : line;
      c.lineWidth = selected ? 3 : 1;
      c.strokeRect(x, y, w, h);
      /* A floating shelf: the board itself is the only thing there, so it is
         drawn solid at the foot of its compartment and the clear space above it
         is left empty — which is what the elevation of a shelf run looks like. */
      if (cell.floatShelf) {
        c.fillStyle = "rgba(140,120,90,0.55)";
        c.fillRect(x, y + h - L.t * k, w, L.t * k);
        c.strokeStyle = line;
        c.lineWidth = 1;
        c.strokeRect(x, y + h - L.t * k, w, L.t * k);
      }
      if (h > 22 && w > 44) {
        c.fillStyle = txt;
        c.fillText(secLabel(cell.ref.t), x + w / 2, y + h / 2 - 7);
        c.fillStyle = muted;
        c.font = "500 10px Inter, Rubik, sans-serif";
        c.fillText(Math.round(toDisp(cell.y1 - cell.y0, "furniture")) + " " + displayUnit("furniture"), x + w / 2, y + h / 2 + 7);
        c.font = "600 11px Inter, Rubik, sans-serif";
      }
    });
    /* A floating run's compartments each carry the board at their foot, so the
       board that caps the top of the run belongs to no compartment — draw it
       here, or the top shelf would be missing from the drawing. */
    if (floating) {
      c.fillStyle = "rgba(140,120,90,0.55)";
      c.fillRect(X(col.x0), Y(it.h), (col.x1 - col.x0) * k, L.t * k);
      c.strokeStyle = line;
      c.lineWidth = 1;
      c.strokeRect(X(col.x0), Y(it.h), (col.x1 - col.x0) * k, L.t * k);
    }
    if (E.showDoors) drawDoor(c, L, col, X, Y, k, accent);
    dimTick(c, X(col.x0), X(col.x1), Y(it.h) - 26, Math.round(col.w), muted);
    // column selection band
    var selCol = E.sel && E.sel.col === ci && E.sel.sec == null;
    c.fillStyle = selCol ? accent : "rgba(128,128,128,0.35)";
    c.fillRect(X(col.x0) + 1, Y(it.h) - 7, (col.x1 - col.x0) * k - 2, 4);
  });

  // the selected column's compartments, dimensioned down the side
  var selCol2 = E.sel && L.cols[E.sel.col];
  if (selCol2 && selCol2.secs.length) {
    // outside the piece, opposite the overall height, so it never sits on top
    // of the drawing itself
    var dx = X(it.w / 2) + 20;
    selCol2.secs.forEach(function (cell) {
      dimTickV(c, Y(cell.y1), Y(cell.y0), dx, Math.round(cell.y1 - cell.y0), accent);
    });
  }

  // overall dimensions
  dimTick(c, X(-it.w / 2), X(it.w / 2), Y(0) + 26, Math.round(it.w), muted, true);
  dimTickV(c, Y(it.h), Y(0), X(-it.w / 2) - 26, Math.round(it.h), muted, true);
  if (L.sp.elev)
    dimTickV(c, Y(0), Y(0) + L.sp.elev * k, X(-it.w / 2) - 26, Math.round(L.sp.elev), muted, true);

  // the partition about to be drawn, with the two zone sizes it would leave
  var g = E.ghost;
  if (g) {
    c.save();
    c.strokeStyle = g.ok ? accent : "#d9534f";
    c.lineWidth = Math.max(2, L.t * k);
    c.globalAlpha = 0.75;
    if (g.kind === "vwall") {
      var gc = L.cols[g.col];
      c.beginPath();
      c.moveTo(X(g.x), Y(gc.secs[0].y0));
      c.lineTo(X(g.x), Y(gc.secs[gc.secs.length - 1].y1));
      c.stroke();
    } else {
      var full = E.ghostAll,
        gx0 = full ? -it.w / 2 : L.cols[g.col].x0,
        gx1 = full ? it.w / 2 : L.cols[g.col].x1;
      c.beginPath();
      c.moveTo(X(gx0), Y(g.y));
      c.lineTo(X(gx1), Y(g.y));
      c.stroke();
    }
    c.globalAlpha = 1;
    /* When the line landed on something — the middle of the bay, a shelf in
       another column — say so, and for an alignment draw the guide over to the
       column it lined up with, which is the only way to see that it did. */
    if (g.snap === "align" && g.at != null && L.cols[g.at]) {
      var o = L.cols[g.at];
      c.save();
      c.setLineDash([4, 4]);
      c.strokeStyle = accent;
      c.lineWidth = 1;
      c.globalAlpha = 0.6;
      c.beginPath();
      c.moveTo(X(Math.min(o.x0, L.cols[g.col].x0)), Y(g.y));
      c.lineTo(X(Math.max(o.x1, L.cols[g.col].x1)), Y(g.y));
      c.stroke();
      c.restore();
    }
    c.fillStyle = txt;
    c.font = "600 11px system-ui, sans-serif";
    c.textAlign = "center";
    // free sizes are shown to the millimetre, or the readout would lie
    var fmt = function (n) {
      return E.snap ? Math.round(n) : Math.round(n * 10) / 10;
    },
      lab = fmt(g.a) + " | " + fmt(g.b) + (g.snap ? "  " + T("snap_" + g.snap) : "");
    if (g.kind === "vwall") c.fillText(lab, X(g.x), Y(0) - 10);
    else c.fillText(lab, X(L.cols[g.col].x1) + 30, Y(g.y) - 4);
    c.restore();
  }
}

/* Dimension lines the way a shop drawing carries them: a run between two
   ticks with the figure sitting on it. */
function dimTick(c, x0, x1, y, val, col, big) {
  c.save();
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(x1, y);
  c.moveTo(x0, y - 4);
  c.lineTo(x0, y + 4);
  c.moveTo(x1, y - 4);
  c.lineTo(x1, y + 4);
  c.stroke();
  var txt2 = String(val);
  c.font = (big ? "700 12px" : "600 10px") + " Inter, Rubik, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  var tw = c.measureText(txt2).width;
  if (tw + 8 < Math.abs(x1 - x0)) {
    c.clearRect((x0 + x1) / 2 - tw / 2 - 3, y - 7, tw + 6, 14);
    c.fillText(txt2, (x0 + x1) / 2, y);
  } else c.fillText(txt2, (x0 + x1) / 2, y - 9);
  c.restore();
}
function dimTickV(c, y0, y1, x, val, col, big) {
  c.save();
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y0);
  c.lineTo(x, y1);
  c.moveTo(x - 4, y0);
  c.lineTo(x + 4, y0);
  c.moveTo(x - 4, y1);
  c.lineTo(x + 4, y1);
  c.stroke();
  c.translate(x, (y0 + y1) / 2);
  c.rotate(-Math.PI / 2);
  c.font = (big ? "700 12px" : "600 10px") + " Inter, Rubik, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  var txt3 = String(val),
    tw2 = c.measureText(txt3).width;
  if (tw2 + 8 < Math.abs(y1 - y0)) {
    c.clearRect(-tw2 / 2 - 3, -7, tw2 + 6, 14);
    c.fillText(txt3, 0, 0);
  } else c.fillText(txt3, 0, -9);
  c.restore();
}

// Type-specific glyphs, the same ones a joinery elevation would carry.
function drawSecDetail(c, cell, x, y, w, h, k, line) {
  var t = cell.ref.t;
  c.strokeStyle = "rgba(60,60,60,0.45)";
  c.lineWidth = 1;
  if (cell.shelves) {
    for (var i = 1; i <= cell.shelves; i++) {
      var sy = y + h - (h * i) / (cell.shelves + 1);
      c.beginPath();
      if (t === "shoe") {
        c.moveTo(x + 2, sy);
        c.lineTo(x + w - 2, sy);
      } else {
        c.moveTo(x + 2, sy);
        c.lineTo(x + w - 2, sy);
      }
      c.stroke();
    }
  }
  if (cell.drawers) {
    cell.drawers.forEach(function (d) {
      var dy = y + h - (d.y1 - cell.y0) * k,
        dh = (d.y1 - d.y0) * k;
      c.strokeRect(x + 2, dy + 1, w - 4, dh - 2);
      c.beginPath(); // handle mark
      c.moveTo(x + w / 2 - Math.min(18, w / 4), dy + dh / 2);
      c.lineTo(x + w / 2 + Math.min(18, w / 4), dy + dh / 2);
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
    });
  }
  if (t === "hang" || t === "hangS" || t === "hang2") {
    var rails = t === "hang2" ? [0.94, 0.47] : [0.94];
    rails.forEach(function (f) {
      var ry = y + h * (1 - f);
      c.beginPath();
      c.moveTo(x + 3, ry);
      c.lineTo(x + w - 3, ry);
      c.lineWidth = 2.5;
      c.stroke();
      c.lineWidth = 1;
      // a couple of hanger hooks
      for (var i = 1; i <= 3; i++) {
        var hx = x + (w * i) / 4;
        c.beginPath();
        c.moveTo(hx, ry);
        c.lineTo(hx - 6, ry + Math.min(16, h * 0.18));
        c.lineTo(hx + 6, ry + Math.min(16, h * 0.18));
        c.closePath();
        c.stroke();
      }
    });
  }
  if (cell.baskets) {
    for (var b = 0; b < cell.baskets; b++) {
      var by = y + h - ((b + 1) * h) / cell.baskets;
      c.strokeRect(x + 3, by + 2, w - 6, h / cell.baskets - 5);
    }
  }
  /* A television niche is drawn as the set that goes in it — 16:9, to scale,
     with the size in inches — because the only question anyone asks of the
     drawing is "will my TV fit". The cable grommet is on it too, since that is
     a hole somebody has to drill. */
  if (t === "tv") {
    var sw = Math.max(8, w - 8 * (w / (w || 1)) - 8),
      sh = Math.min(h - 6, (sw * 9) / 16);
    if (sh > 8) {
      var sx = x + (w - sw) / 2,
        sy2 = y + h - (h * 0.52 + sh / 2);
      c.fillStyle = "rgba(16,19,24,0.82)";
      c.fillRect(sx, sy2, sw, sh);
      c.strokeStyle = "rgba(60,60,60,0.7)";
      c.strokeRect(sx, sy2, sw, sh);
      if (cell.tvSize && sw > 40 && sh > 18) {
        c.fillStyle = "rgba(255,255,255,0.85)";
        c.font = "600 10px Inter, Rubik, sans-serif";
        c.textAlign = "center";
        c.fillText('~' + cell.tvSize + '"', sx + sw / 2, sy2 + sh / 2);
      }
    }
    c.strokeStyle = "rgba(60,60,60,0.55)";
    c.beginPath(); // the grommet, low and to one side
    c.arc(x + Math.min(14, w * 0.2), y + h - Math.min(12, h * 0.2), 3, 0, Math.PI * 2);
    c.stroke();
  } else if (t === "appl") {
    // the machine's own front, with the feature that identifies it
    c.setLineDash([3, 2]);
    c.strokeRect(x + 2, y + 2, w - 4, h - 4);
    c.setLineDash([]);
    var aH = cell.y1 - cell.y0;
    if (aH >= 72 && aH <= 105) {
      c.beginPath();
      c.arc(x + w / 2, y + h * 0.54, Math.min(w, h) * 0.29, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.strokeRect(x + 5, y + h * 0.28, w - 10, h * 0.5);
      c.beginPath();
      c.lineWidth = 2;
      c.moveTo(x + 6, y + h * 0.18);
      c.lineTo(x + w - 6, y + h * 0.18);
      c.stroke();
      c.lineWidth = 1;
    }
  } else if (t === "laundry" || t === "safe") {
    c.setLineDash([4, 3]);
    c.strokeRect(x + 4, y + 4, w - 8, h - 8);
    c.setLineDash([]);
  }
}

/* Hinged doors get the standard opening triangle; sliding gets arrows. One
   symbol per run of covered compartments — the same runs the 3D build uses, so
   an open niche in a doored column is drawn open here too. */
function drawDoor(c, L, col, X, Y, k, accent) {
  var dr = col.ref.door || { t: "none" };
  if (dr.t === "none" || dr.t === "drawer") return;
  (col.runs || []).forEach(function (run) {
    drawDoorRun(c, L, col, X, Y, k, dr, run);
  });
}

function drawDoorRun(c, L, col, X, Y, k, dr, run) {
  var last = col.secs.length - 1,
    my0 = run.i0 === 0 ? L.yb - L.t : col.secs[run.i0].y0 - L.t / 2,
    my1 = run.i1 === last ? L.yt + L.t : col.secs[run.i1].y1 + L.t / 2,
    y0 = Y(my1),
    y1 = Y(my0),
    // leaves are counted per run in buildDoor; the drawing only needs how many
    // this column's width calls for
    leaves = Math.max(1, dr.leaves || (col.w > STD.maxDoor ? 2 : 1)),
    gapW = ((col.x1 - col.x0) * k) / leaves;
  if (y1 - y0 < 6) return;
  c.save();
  c.strokeStyle = dr.t === "mirror" ? "#8fb6c9" : dr.t === "glass" ? "#7fb2c8" : "rgba(70,80,95,0.75)";
  c.lineWidth = 1.5;
  if (dr.t === "glass" || dr.t === "mirror") {
    c.fillStyle = dr.t === "mirror" ? "rgba(150,190,210,0.22)" : "rgba(140,190,215,0.16)";
    c.fillRect(X(col.x0), y0, (col.x1 - col.x0) * k, y1 - y0);
  }
  for (var i = 0; i < leaves; i++) {
    var lx0 = X(col.x0) + i * gapW,
      lx1 = lx0 + gapW;
    c.strokeRect(lx0 + 1, y0 + 1, gapW - 2, y1 - y0 - 2);
    if (dr.t === "sliding") {
      c.beginPath();
      var my = (y0 + y1) / 2,
        dir = col.i % 2 ? -1 : 1;
      c.moveTo(lx0 + gapW * 0.3, my);
      c.lineTo(lx0 + gapW * 0.7, my);
      c.lineTo(lx0 + gapW * (dir > 0 ? 0.6 : 0.4), my - 6);
      c.stroke();
    } else if (dr.t === "lift") {
      c.beginPath();
      c.moveTo(lx0 + gapW / 2, y1 - 8);
      c.lineTo(lx0 + gapW / 2, y0 + 8);
      c.lineTo(lx0 + gapW / 2 - 5, y0 + 16);
      c.stroke();
    } else {
      // DIN 919 / ISO 128-30 standard: opening triangle vertex points to the hinge
      var hingeLeft = leaves > 1 ? i === 0 : dr.hinge === "L";
      c.setLineDash([5, 4]);
      c.beginPath();
      if (hingeLeft) {
        c.moveTo(lx1 - 1, y0 + 1);
        c.lineTo(lx0 + 2, (y0 + y1) / 2);
        c.lineTo(lx1 - 1, y1 - 1);
      } else {
        c.moveTo(lx0 + 1, y0 + 1);
        c.lineTo(lx1 - 2, (y0 + y1) / 2);
        c.lineTo(lx0 + 1, y1 - 1);
      }
      c.stroke();
      c.setLineDash([]);

      // hardware / handle placement on elevation
      var hwType = L.sp.hw && L.sp.hw.handle;
      if (hwType !== "push") {
        var hxMark = hingeLeft ? lx1 - Math.min(12, gapW * 0.25) : lx0 + Math.min(12, gapW * 0.25);
        var hyMark = (y0 + y1) / 2;
        c.beginPath();
        if (hwType === "knob") {
          c.arc(hxMark, hyMark, 2.5, 0, Math.PI * 2);
          c.fillStyle = "rgba(70,80,95,0.85)";
          c.fill();
        } else {
          var barH = Math.min(28, (y1 - y0) * 0.25);
          c.moveTo(hxMark, hyMark - barH / 2);
          c.lineTo(hxMark, hyMark + barH / 2);
          c.lineWidth = 2.5;
          c.stroke();
          c.lineWidth = 1.5;
        }
      }
    }
  }
  c.restore();
}

/* ================= elevation interaction ================= */

/* One repaint per frame, however many pointer moves arrive in it. */
export function queueDraw() {
  if (E.rafPending) return;
  E.rafPending = true;
  requestAnimationFrame(function () {
    E.rafPending = false;
    draw();
  });
}

function toModel(ev) {
  var r = E.cv.getBoundingClientRect(),
    v = E.view;
  return { x: (ev.clientX - r.left - v.ox) / v.k, y: (v.oy - (ev.clientY - r.top)) / v.k };
}

// What is under the pointer: a divider to drag, or a cell / column to select.
function hit(p) {
  var L = E.view.L,
    tol = 7 / E.view.k; // grab band in cm, from a comfortable 7 px
  for (var i = 0; i < L.cols.length; i++) {
    var col = L.cols[i];
    if (i > 0 && Math.abs(p.x - col.x0 + L.t / 2) < tol + L.t / 2 && p.y > L.yb && p.y < L.yt)
      return { kind: "colDiv", i: i };
  }
  for (var ci = 0; ci < L.cols.length; ci++) {
    var c2 = L.cols[ci];
    if (p.x < c2.x0 - L.t || p.x > c2.x1 + L.t) continue;
    // dividers before cells: the top edge of a compartment is also the bottom
    // of the shelf above it, and grabbing the shelf has to win
    for (var si = 1; si < c2.secs.length; si++)
      if (Math.abs(p.y - c2.secs[si].y0 + L.t / 2) < tol + L.t / 2) return { kind: "secDiv", col: ci, i: si };
    for (var sj = 0; sj < c2.secs.length; sj++) {
      var s = c2.secs[sj];
      if (p.y >= s.y0 && p.y <= s.y1) return { kind: "cell", col: ci, sec: sj };
    }
    if (p.y > L.yt) return { kind: "col", col: ci };
  }
  return null;
}

export function wireCanvas() {
  resetElevationView();
  var cv = E.cv;
  // only the front elevation is editable — every other view is a projection
  function live() {
    return E.open && E.mode === "2d" && E.axis === "front" && E.view;
  }
  cv.addEventListener("pointerdown", function (e) {
    if (!live()) return;
    var p = toModel(e);
    if (E.tool) {
      api.act(T(E.tool === "erase" ? "opErase" : "opDraw"));
      if (E.tool === "erase") eraseAt(p);
      else if (E.tool === "vwall") drawVWall(ghostAt(p));
      else drawHWall(ghostAt(p), e.shiftKey);
      return;
    }
    var h = hit(p);
    if (!h) return;
    if (h.kind === "colDiv" || h.kind === "secDiv") {
      cv.setPointerCapture(e.pointerId);
      api.act(T("opDrag"));
      E.drag = { h: h, start: p, snap: JSON.parse(JSON.stringify(sp().cols)) };
    } else if (h.kind === "cell") {
      E.sel = { col: h.col, sec: h.sec };
      draw();
      api.fillInspector();
    } else if (h.kind === "col") {
      E.sel = { col: h.col };
      draw();
      api.fillInspector();
    }
  });
  cv.addEventListener("pointermove", function (e) {
    if (!live()) return;
    var p = toModel(e);
    if (E.tool) {
      // the ghost line is the whole feedback of the tool, so it follows the
      // pointer — but a pointer emits far more moves than the screen has
      // frames, and a repaint here is a full layout + elevation
      E.ghost = E.tool === "erase" ? null : ghostAt(p);
      E.ghostAll = e.shiftKey;
      cv.style.cursor = "crosshair";
      queueDraw();
      return;
    }
    if (!E.drag) {
      var h = hit(p);
      cv.style.cursor = !h ? "default" : h.kind === "colDiv" ? "ew-resize" : h.kind === "secDiv" ? "ns-resize" : "pointer";
      return;
    }
    var d = E.drag,
      cols = sp().cols;
    if (d.h.kind === "colDiv") {
      var i = d.h.i,
        dx = p.x - d.start.x,
        a = d.snap[i - 1].w + dx,
        b = d.snap[i].w - dx;
      if (a >= 12 && b >= 12) {
        cols[i - 1].w = a;
        cols[i].w = b;
        cols[i - 1].fixed = cols[i].fixed = false;
      }
    } else {
      var c2 = cols[d.h.col],
        j = d.h.i,
        dy = p.y - d.start.y,
        sa = d.snap[d.h.col].secs[j - 1].h + dy,
        sb = d.snap[d.h.col].secs[j].h - dy;
      if (sa >= 8 && sb >= 8) {
        c2.secs[j - 1].h = sa;
        c2.secs[j].h = sb;
      }
    }
    normalizeSpec(sp(), E.it.w, E.it.h, E.it.d);
    queueDraw();
  });
  function endDrag() {
    if (!E.drag) return;
    E.drag = null;
    api.touch();
    api.changed();
  }
  cv.addEventListener("pointerleave", function () {
    if (E.ghost) {
      E.ghost = null;
      draw();
    }
  });
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("dblclick", function (e) {
    if (!live()) return;
    var h = hit(toModel(e));
    if (!h) return;
    if (h.kind === "cell") {
      var u = displayUnit("furniture");
      var s = sp().cols[h.col].secs[h.sec],
        v = prompt(T("secH") + ' (' + u + ')', Math.round(toDisp(s.h, "furniture")));
      if (v != null && fin(+v)) {
        var parsedH = fromDisp(+v, "furniture");
        if (parsedH > 5) {
          s.h = parsedH;
          s.fixed = true;
          api.touch();
          api.changed();
        }
      }
    } else if (h.kind === "col" || h.kind === "colDiv") {
      var u = displayUnit("furniture");
      var ci = h.col != null ? h.col : h.i,
        c2 = sp().cols[ci],
        v2 = prompt(T("colW") + ' (' + u + ')', Math.round(toDisp(c2.w, "furniture")));
      if (v2 != null && fin(+v2)) {
        var parsedW = fromDisp(+v2, "furniture");
        if (parsedW > 10) {
          c2.w = parsedW;
          c2.fixed = true;
          api.touch();
          api.changed();
        }
      }
    }
  });

  /* Two-finger pinch zoom & pan on the 2D elevation canvas. */
  (function () {
    var pinch = null;
    function d2(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function cen(e) {
      var a = e.touches[0], b = e.touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }
    cv.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        pinch = { dist: d2(e), cx: cen(e).x, cy: cen(e).y };
      }
    }, { passive: true });
    cv.addEventListener("touchmove", function (e) {
      if (!pinch || e.touches.length !== 2) { pinch = null; return; }
      e.preventDefault();
      var dist = d2(e), c = cen(e);
      var f = dist / Math.max(pinch.dist, 1);
      var mx = c.x - pinch.cx, my = c.y - pinch.cy;
      pinch.dist = dist;
      pinch.cx = c.x;
      pinch.cy = c.y;
      if (Math.abs(1 - f) > 0.002) {
        viewZoom = clamp(viewZoom * f, 0.5, 5);
      }
      if (Math.hypot(mx, my) > 0.5) {
        viewPanX += mx;
        viewPanY += my;
      }
      queueDraw();
    }, { passive: false });
    function end(e) {
      if (e.touches.length < 2) pinch = null;
    }
    cv.addEventListener("touchend", end);
    cv.addEventListener("touchcancel", end);
  })();
}

/* ================= inspector ================= */
export function setTool(t) {
  E.tool = t || null;
  E.ghost = null;
  if (!E.host) return;
  E.host.querySelectorAll("#cbTools button").forEach(function (b) {
    var selected = (b.getAttribute("data-tool") || null) === E.tool;
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  syncHint();
  if (E.cv) E.cv.style.cursor = E.tool ? "crosshair" : "default";
  if (E.view) draw(); // on the very first open the canvas has no transform yet
}

// Where would a partition drawn at p land? Also what the ghost line draws.
/* Freehand is not how a cabinet gets divided — a joiner lands on the middle of
   the bay, on the line of the shelf next door, or on a round number. So the
   pointer is a suggestion and these candidates are what it lands on, in that
   order of authority; the ghost says which one it took. */
/* Not purely nearest: lining up with the shelf next door or halving the bay is
   worth giving up a little accuracy for, so those pull harder than a round
   number that happens to be a few millimetres closer. */
var SNAP_PULL = { align: 0.5, mid: 0.45, eq: 0.3, round: 0 };
function pickSnap(raw, cands, tol) {
  // switched off, the pointer is the answer — to a tenth of a millimetre, so a
  // hand-measured 47.3 stays 47.3 and never creeps to 47
  if (!E.snap) return { v: Math.round(raw * 100) / 100, why: null };
  var best = null;
  cands.forEach(function (c) {
    var dist = Math.abs(raw - c.v);
    if (dist > tol) return;
    var score = dist - (SNAP_PULL[c.why] || 0) * tol;
    if (!best || score < best.score - 0.001) best = { v: c.v, why: c.why, at: c.at, score: score };
  });
  // failing all of them, whole centimetres — never 37.4183
  return best || { v: Math.round(raw), why: null };
}
function roundCands(from, lo, hi, why) {
  var out = [];
  for (var v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) out.push({ v: from + v, why: why });
  return out;
}

function ghostAt(p) {
  var L = E.view && E.view.L;
  if (!L || isCorner(sp())) return null;
  var tol = 8 / E.view.k; // a comfortable 8 px, in centimetres
  if (E.tool === "vwall") {
    for (var i = 0; i < L.cols.length; i++) {
      var c = L.cols[i];
      if (p.x < c.x0 || p.x > c.x1) continue;
      var t = isFloat(sp()) ? 0 : L.t || sp().panel,
        cands = [{ v: (c.x0 + c.x1) / 2, why: "mid" }];
      // a bay that repeats a neighbour's width, measured from either edge
      L.cols.forEach(function (o) {
        if (o === c) return;
        cands.push({ v: c.x0 + o.w + t / 2, why: "eq", at: o.i });
        cands.push({ v: c.x1 - o.w - t / 2, why: "eq", at: o.i });
      });
      cands = cands.concat(roundCands(c.x0, 5, c.w - 5, "round"));
      var sn = pickSnap(p.x, cands, tol),
        a = sn.v - c.x0 - t / 2,
        b = c.x1 - sn.v - t / 2;
      return { kind: "vwall", col: i, x: sn.v, snap: sn.why, at: sn.at, ok: a >= 12 && b >= 12, a: a, b: b };
    }
    return null;
  }
  if (E.tool === "hwall") {
    for (var ci = 0; ci < L.cols.length; ci++) {
      var c2 = L.cols[ci];
      if (p.x < c2.x0 - L.t || p.x > c2.x1 + L.t) continue;
      for (var sj = 0; sj < c2.secs.length; sj++) {
        var s = c2.secs[sj];
        if (p.y < s.y0 || p.y > s.y1) continue;
        var t2 = sp().shelf || sp().panel,
          hc = [];
        // a shelf that lines up with one in another column reads as one line
        // across the piece — that is worth more than any round number
        L.cols.forEach(function (o) {
          if (o === c2) return;
          o.secs.forEach(function (os, k) {
            // y0 is the top face of that shelf's board; the cut that produces
            // it sits half a board lower, which is what has to match
            if (k > 0 && os.y0 > s.y0 && os.y0 < s.y1) hc.push({ v: os.y0 - t2 / 2, why: "align", at: o.i });
          });
        });
        hc.push({ v: (s.y0 + s.y1) / 2, why: "mid" });
        hc = hc.concat(roundCands(0, s.y0 + 5, s.y1 - 5, "round"));
        var sn2 = pickSnap(p.y, hc, tol),
          ha = sn2.v - s.y0 - t2 / 2,
          hb = s.y1 - sn2.v - t2 / 2;
        return {
          kind: "hwall", col: ci, sec: sj, y: sn2.v, snap: sn2.why, at: sn2.at,
          ok: ha >= 8 && hb >= 8, a: ha, b: hb,
        };
      }
    }
    return null;
  }
  return null;
}

function drawVWall(g) {
  if (!g || !g.ok) return api.flashHint(T("tooSmall"));
  api.touch();
  var cols = sp().cols,
    c = cols[g.col],
    copy = JSON.parse(JSON.stringify(c));
  c.w = g.a;
  copy.w = g.b;
  delete c.fixed;
  delete copy.fixed;
  cols.splice(g.col + 1, 0, copy);
  E.sel = { col: g.col + 1, sec: 0 };
  api.changed();
}

/* One height, every column it can be drawn in — a shelf across the whole piece
   is one gesture, and a column where it would leave a sliver simply keeps its
   compartment whole rather than blocking the others. */
function drawHWall(g, all) {
  if (!g) return;
  if (!all && !g.ok) return api.flashHint(T("tooSmall"));
  var y = g.y,
    L = E.view.L,
    t = sp().shelf || sp().panel,
    targets = all ? L.cols.map(function (_, i) { return i; }) : [g.col],
    done = 0;
  api.touch();
  targets.forEach(function (ci) {
    var lc = L.cols[ci],
      col = sp().cols[ci];
    for (var j = 0; j < lc.secs.length; j++) {
      var ls = lc.secs[j];
      if (y < ls.y0 || y > ls.y1) continue;
      var a = y - ls.y0 - t / 2,
        b = ls.y1 - y - t / 2;
      if (a < 8 || b < 8) return;
      var s = col.secs[j],
        copy = JSON.parse(JSON.stringify(s));
      s.h = a;
      copy.h = b;
      delete s.fixed;
      delete copy.fixed;
      col.secs.splice(j + 1, 0, copy);
      done++;
      return;
    }
  });
  if (!done) return api.flashHint(T("tooSmall"));
  // silently doing less than asked is worse than saying so
  if (done < targets.length)
    api.flashHint(T("partial").replace("$1", done).replace("$2", targets.length));
  E.sel = { col: g.col, sec: 0 };
  api.changed();
}

// Erase: click a partition and the two zones it separated become one.
function eraseAt(p) {
  var h = hit(p);
  if (!h) return;
  if (h.kind === "colDiv") {
    var cols = sp().cols;
    if (cols.length <= 1) return;
    api.touch();
    /* Two bays become one, and one of the two interiors has to go. Losing the
       plainer one is nearly always what was meant — you rub out a divider to
       let the good side spread, not to keep the empty side. */
    var a = cols[h.i - 1],
      b = cols[h.i],
      keep = b.secs.length > a.secs.length ? b : a;
    keep.w = a.w + b.w + (isFloat(sp()) ? 0 : sp().panel);
    delete keep.fixed;
    cols.splice(h.i - 1, 2, keep);
    E.sel = { col: h.i - 1, sec: 0 };
    api.changed();
  } else if (h.kind === "secDiv") {
    var col2 = sp().cols[h.col];
    if (!col2 || col2.secs.length <= 1) return;
    api.touch();
    var sa = col2.secs[h.i - 1],
      sb = col2.secs[h.i],
      keepS = sb.h > sa.h ? sb : sa;
    keepS.h = sa.h + sb.h + (sp().shelf || sp().panel);
    delete keepS.fixed;
    col2.secs.splice(h.i - 1, 2, keepS);
    E.sel = { col: h.col, sec: h.i - 1 };
    api.changed();
  }
}

export function exportPNG() {
  var restoreMode = E.split ? "split" : E.mode, restoreAxis = E.axis;
  // the sheet is the whole drawing, never the half a split view leaves it
  if (restoreMode === "split") setMode("2d");
  if (restoreMode === "3d" || restoreAxis !== "front") setAxis("front");
  sizeCanvas();
  draw();
  var src = E.cv,
    pad = 26,
    head = 54,
    out = document.createElement("canvas");
  out.width = src.width + pad * 2;
  out.height = src.height + pad * 2 + head;
  var c = out.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(src, pad, pad + head);
  c.fillStyle = "#1b1f24";
  c.textBaseline = "middle";
  c.direction = isEn() ? "ltr" : "rtl";
  c.textAlign = isEn() ? "left" : "right";
  var x = isEn() ? pad : out.width - pad;
  c.font = "700 22px Inter, Rubik, sans-serif";
  c.fillText(T("title") + " · " + famLabel(sp().fam), x, pad + 14);
  c.font = "500 14px Inter, Rubik, sans-serif";
  c.fillStyle = "#5b636b";
  c.fillText(
    Math.round(E.it.w) + "×" + Math.round(E.it.d) + "×" + Math.round(E.it.h) +
      "  ·  " + cabSummary(E.it) + "  ·  " + frontLabel(sp().front) + "  ·  ₪" + cabPrice(E.it).toLocaleString("en-US"),
    x, pad + 38,
  );
  c.strokeStyle = "#c9ced4";
  c.lineWidth = 1;
  c.strokeRect(pad * 0.5, pad * 0.5, out.width - pad, out.height - pad);
  var a = document.createElement("a");
  a.href = out.toDataURL("image/png");
  a.download = "cabinet-elevation.png";
  a.click();
  E.axis = restoreAxis;
  if (restoreMode === "split") { setMode("split"); if (restoreAxis !== "front") setAxis(restoreAxis); }
  else if (restoreMode === "3d") setMode("3d");
  else if (restoreAxis !== "front") setAxis(restoreAxis);
}

/* The elevation as a shop drawing: white background, a title block with the
   sizes and the finish, and the same drawing the designer shows. */
export function initPreview() {
  /* three is late-bound (js/three_lazy.js) and openCabinet() stays synchronous,
     so the designer's DOM is built whether or not the renderer has arrived.
     E.pv null is the state every call site already handles (createEditorView
     returns null on a machine with no GPU); when three lands, come back and
     stand the viewport up. */
  if (!threeLoaded()) {
    loadThree().then(function () {
      if (E.host && !E.pv) {
        initPreview();
        if (E.open) { updatePreview(); renderPreview(); }
      }
    }, function () {});
    return;
  }
  E.pv = createEditorView({
    canvas: E.host.querySelector("#cbPrev"),
    fov: 42,
    ambient: 0.6, keyLight: 0.95, fill: 0.35,
    az: 0.55, el: 0.28, dist: 420,
    minEl: -0.2, maxEl: 1.3, minDist: 60, maxDist: 2500,
    pad: 24, ratio: 0.82, fitContainerHeight: function () { return E.host && !E.host.classList.contains("cb-compact"); },
    // the big view is framed with room for an open door to swing into, and
    // pulled back further when split leaves it a tall, narrow half
    bigZoom: function () {
      var r = E.split && E.host && E.host.querySelector("#cb3dHost").getBoundingClientRect();
      return r && r.width > 0 ? 1.3 * Math.max(1, 1.2 * r.height / r.width) : 1.3;
    },
    // centre on where the piece actually is — a wall unit hangs at 145
    center: function () {
      return (sp() && sp().elev ? sp().elev : 0) + (E.it ? E.it.h / 2 : 0);
    },
    active: function () {
      return E.open && !!E.it;
    },
  });
}

export function updatePreview() {
  if (!E.pv || !E.it) return;
  // frame the piece for the size it now is
  E.pv.frame(Math.hypot(E.it.w, E.it.h, E.it.d) * 1.5);
  // buildItem, not build(): it sets the item's style variant and clears it
  // again, which is the only correct way to render a piece
  E.pv.rebuild(function (grp) { buildItem(grp, E.it); });
}

export function renderPreview() {
  if (E.pv) E.pv.render();
}


/* ================= entry points ================= */

api.sizeCanvas = sizeCanvas;
api.setMode = setMode;
api.setAxis = setAxis;
api.syncHint = syncHint;
api.draw = draw;
api.wireCanvas = wireCanvas;
api.setTool = setTool;
api.exportPNG = exportPNG;
api.initPreview = initPreview;
api.updatePreview = updatePreview;
api.renderPreview = renderPreview;
api.resetElevationView = resetElevationView;
