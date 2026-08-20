// RC track editor — the 2D map: canvas sizing, the world⇄screen transform,
// every pointer gesture on the plan, and the painter.
//
// Edits go out through rc_editor_actions.js; redraws of the OTHER views go
// through that module's shared `views` registry. Nothing here imports the
// editor core, so the map can be reasoned about (and repainted) on its own.
import * as THREE from "three";

import { ST, GHOST_SEG, HIT_PX, copyAnchor, fin, clamp, editorActive, rooms, L } from "./rc_editor_state.js";
import { anchorAt, ghostLine, insertSpot, segmentAt, segmentY } from "./rc_editor_geom.js";
import {
  addAnchor, applySnap, delAnchor, noteUserEdit, pushHist, restoreEntry, scheduleBuild,
  setSegmentHeight, snapFree, snapTip, undo, views, writeThrough,
} from "./rc_editor_actions.js";
import { facesClick, facesHover, paintFaces, pickTarget } from "./rc_editor_faces.js";

export function resizeCanvas() {
  if (!ST.D || !ST.D.canvas) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = ST.D.canvas.clientWidth || 320,
    h = ST.D.canvas.clientHeight || 220;
  ST.D.canvas.width = Math.round(w * dpr);
  ST.D.canvas.height = Math.round(h * dpr);
  ST.D.dpr = dpr;
  // The dock is laid out after the editor opens (and again whenever the 3D
  // pane is resized), so the first fit runs against the wrong box. Re-fit until
  // the user takes the view over by panning or zooming.
  if (!ST.D.userView) fitView();
}

export function worldBounds() {
  var b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 },
    any = false;
  function add(x, z) {
    any = true;
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.z0 = Math.min(b.z0, z);
    b.z1 = Math.max(b.z1, z);
  }
  rooms().forEach(function (r) {
    (r.pts || []).forEach(function (p) {
      add(p.x, p.z);
    });
  });
  ST.D.anchors.forEach(function (a) {
    add(a.x, a.z);
  });
  if (!any) {
    b = { x0: -300, x1: 300, z0: -300, z1: 300 };
  }
  return b;
}

export function fitView() {
  if (!ST.D.canvas) return;
  var b = worldBounds();
  var w = ST.D.canvas.clientWidth || 320,
    h = ST.D.canvas.clientHeight || 220;
  var pad = 26;
  var s = Math.min(
    (w - pad * 2) / Math.max(40, b.x1 - b.x0),
    (h - pad * 2) / Math.max(40, b.z1 - b.z0),
  );
  ST.D.view.s = clamp(s, 0.02, 6);
  ST.D.view.cx = (b.x0 + b.x1) / 2;
  ST.D.view.cz = (b.z0 + b.z1) / 2;
}

export function w2s(x, z) {
  var v = ST.D.view;
  return {
    x: (x - v.cx) * v.s + ST.D.canvas.clientWidth / 2,
    y: (z - v.cz) * v.s + ST.D.canvas.clientHeight / 2,
  };
}

export function s2w(sx, sy) {
  var v = ST.D.view;
  return {
    x: (sx - ST.D.canvas.clientWidth / 2) / v.s + v.cx,
    z: (sy - ST.D.canvas.clientHeight / 2) / v.s + v.cz,
  };
}

export function evPos(e) {
  var r = ST.D.canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function zoomAt(sx, sy, f) {
  ST.D.userView = true;
  var before = s2w(sx, sy);
  ST.D.view.s = clamp(ST.D.view.s * f, 0.02, 8);
  var after = s2w(sx, sy);
  ST.D.view.cx += before.x - after.x;
  ST.D.view.cz += before.z - after.z;
  draw();
}

export function heightFromScreen(sy) {
  var u = ST.D.heightUi;
  if (!u) return 0.7;
  var f = clamp((u.bottom - sy) / Math.max(1, u.bottom - u.top), 0, 1);
  return 0.7 + f * 159.3;
}

export function finishVisualDrag() {
  ST.D.dragging = false;
  ST.D.ghostPts = null;
  noteUserEdit();
  writeThrough();
  views.sync3d();
  views.stats();
  views.refreshSelection();
  draw();
  scheduleBuild(0);
}

export function bindCanvas() {
  var cv = ST.D.canvas;
  cv.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  cv.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      e.stopPropagation();
      var p = evPos(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    { passive: false },
  );
  // The common edit no longer needs a tool switch: double-clicking empty map
  // space inserts a control point into the nearest leg while Edit stays active.
  cv.addEventListener("dblclick", function (e) {
    if (e.button !== 0 || ST.D.mode !== "shape") return;
    var p = evPos(e),
      w = s2w(p.x, p.y);
    var hit = anchorAt(ST.D.anchors, w.x, w.z, HIT_PX / ST.D.view.s);
    var seg = hit < 0 ? segmentAt(ST.D.anchors, w.x, w.z, 18 / ST.D.view.s) : -1;
    if (hit >= 0 || seg >= 0) return;
    e.preventDefault();
    e.stopPropagation();
    addAnchor(w.x, w.z, e.shiftKey);
    views.tip(ST.D.mode === "shape" ? "✓ " + L("נוספה נקודה", "Point added") : "＋");
  });
  // Touch: one finger edits exactly like a mouse, two fingers pinch-zoom and
  // pan. The second finger also cancels whatever the first one had started —
  // on a phone a pinch always begins as an accidental drag of something.
  ST.D.touches = new Map();
  function pinchMetrics() {
    var a = [];
    ST.D.touches.forEach(function (v) {
      a.push(v);
    });
    return {
      d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y),
      mx: (a[0].x + a[1].x) / 2,
      my: (a[0].y + a[1].y) / 2,
    };
  }
  function startPinch() {
    if (ST.D.drag >= 0 || ST.D.segDrag || ST.D.heightDrag) {
      if (ST.D.hist.length) restoreEntry(ST.D.hist.pop()); // undo the accidental drag
      views.refreshFoot();
    }
    ST.D.drag = -1;
    ST.D.segDrag = ST.D.heightDrag = ST.D.mapPress = ST.D.pan = null;
    ST.D.dragging = false;
    ST.D.ghostPts = null;
    var m = pinchMetrics();
    ST.D.pinch = { d: Math.max(1, m.d), mx: m.mx, my: m.my, s: ST.D.view.s };
    ST.D.userView = true;
    views.editorStatus(ST.D.anchors.length >= 3 ? "ready" : "warning");
    views.sync3d();
    draw();
  }

  cv.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
    cv.setPointerCapture(e.pointerId);
    var p = evPos(e),
      w = s2w(p.x, p.y);
    if (e.pointerType === "touch") {
      ST.D.touches.set(e.pointerId, p);
      if (ST.D.touches.size >= 2) {
        startPinch();
        return;
      }
    }
    if (
      e.button === 0 &&
      ST.D.heightUi &&
      Math.hypot(p.x - ST.D.heightUi.x, p.y - ST.D.heightUi.knobY) < 18
    ) {
      pushHist();
      ST.D.heightDrag = { i: ST.D.heightUi.i };
      ST.D.dragging = true;
      views.editorStatus("preview");
      return;
    }
    var idx = anchorAt(ST.D.anchors, w.x, w.z, HIT_PX / ST.D.view.s);
    var seg = idx < 0 ? segmentAt(ST.D.anchors, w.x, w.z, 18 / ST.D.view.s) : -1;
    // Faces mode owns the plan itself: a press on a model or a room picks the
    // side to drive along. Points still win — an anchor you can see is an
    // anchor you can drag, in any mode.
    if (ST.D.mode === "faces" && idx < 0 && !e.altKey && (e.button === 0 || e.button === 2)) {
      if (facesClick(w.x, w.z, e)) return;
    }
    if (e.button === 2 || (e.button === 0 && e.altKey)) {
      if (idx >= 0 && e.button === 2) {
        delAnchor(idx);
        return;
      }
      ST.D.pan = { x: p.x, y: p.y, cx: ST.D.view.cx, cz: ST.D.view.cz };
      return;
    }
    if (e.button === 1) {
      ST.D.pan = { x: p.x, y: p.y, cx: ST.D.view.cx, cz: ST.D.view.cz };
      return;
    }
    if (e.button !== 0) return;
    if (idx >= 0) {
      ST.D.drag = idx;
      ST.D.sel = idx;
      ST.D.seg = -1;
      ST.D.dragging = true;
      ST.D.ghostPts = ghostLine(ST.D.anchors);
      pushHist();
      views.editorStatus("preview");
      views.sync3d();
      views.refreshSelection();
      draw();
      return;
    }
    if (ST.D.mode === "shape" && seg >= 0) {
      var j = (seg + 1) % ST.D.anchors.length;
      ST.D.sel = -1;
      ST.D.seg = seg;
      ST.D.segDrag = {
        i: seg,
        wx: w.x,
        wz: w.z,
        a: copyAnchor(ST.D.anchors[seg]),
        b: copyAnchor(ST.D.anchors[j]),
      };
      ST.D.dragging = true;
      ST.D.ghostPts = ghostLine(ST.D.anchors);
      pushHist();
      views.editorStatus("preview");
      views.refreshSelection();
      draw();
      return;
    }
    ST.D.mapPress = { x: p.x, y: p.y, w: w, shift: e.shiftKey, moved: 0 };
  });
  cv.addEventListener("pointermove", function (e) {
    var p = evPos(e),
      w = s2w(p.x, p.y);
    if (e.pointerType === "touch" && ST.D.touches.has(e.pointerId)) ST.D.touches.set(e.pointerId, p);
    if (ST.D.pinch && ST.D.touches.size >= 2) {
      var m = pinchMetrics();
      var before = s2w(m.mx, m.my);
      ST.D.view.s = clamp((ST.D.pinch.s * Math.max(1, m.d)) / ST.D.pinch.d, 0.02, 8);
      var after = s2w(m.mx, m.my);
      // zoom about the pinch centre, then follow it as the fingers travel
      ST.D.view.cx += before.x - after.x - (m.mx - ST.D.pinch.mx) / ST.D.view.s;
      ST.D.view.cz += before.z - after.z - (m.my - ST.D.pinch.my) / ST.D.view.s;
      ST.D.pinch.mx = m.mx;
      ST.D.pinch.my = m.my;
      draw();
      return;
    }
    if (ST.D.heightDrag) {
      setSegmentHeight(ST.D.heightDrag.i, heightFromScreen(p.y), true);
      return;
    }
    if (ST.D.segDrag) {
      var sd = ST.D.segDrag,
        sj = (sd.i + 1) % ST.D.anchors.length,
        dx = w.x - sd.wx,
        dz = w.z - sd.wz;
      if (e.shiftKey) {
        // move the whole leg in whole grid steps
        var gs = ST.D.gridStep || 25;
        dx = Math.round(dx / gs) * gs;
        dz = Math.round(dz / gs) * gs;
      }
      ST.D.anchors[sd.i] = Object.assign(copyAnchor(sd.a), { x: sd.a.x + dx, z: sd.a.z + dz });
      ST.D.anchors[sj] = Object.assign(copyAnchor(sd.b), { x: sd.b.x + dx, z: sd.b.z + dz });
      ST.D.ghostPts = ghostLine(ST.D.anchors);
      views.sync3d();
      views.stats();
      views.refreshSelection();
      draw();
      return;
    }
    if (ST.D.pan) {
      ST.D.userView = true;
      ST.D.view.cx = ST.D.pan.cx - (p.x - ST.D.pan.x) / ST.D.view.s;
      ST.D.view.cz = ST.D.pan.cz - (p.y - ST.D.pan.y) / ST.D.view.s;
      draw();
      return;
    }
    if (ST.D.drag >= 0) {
      var old = ST.D.anchors[ST.D.drag],
        sp = applySnap(w.x, w.z, ST.D.drag, e);
      // copyAnchor, not a fresh {x,z}: a dragged point keeps its height, its
      // pass-by rule and its "this one is ON the furniture" flag
      var moved = copyAnchor(old);
      moved.x = sp.x;
      moved.z = sp.z;
      ST.D.anchors[ST.D.drag] = moved;
      ST.D.ghostPts = ghostLine(ST.D.anchors);
      views.sync3d();
      views.stats();
      views.refreshSelection();
      draw();
      snapTip(e);
      return;
    }
    if (ST.D.mapPress) {
      ST.D.mapPress.moved += Math.abs(p.x - ST.D.mapPress.x) + Math.abs(p.y - ST.D.mapPress.y);
      ST.D.mapPress.x = p.x;
      ST.D.mapPress.y = p.y;
      if (ST.D.mapPress.moved > 6) {
        ST.D.pan = { x: p.x, y: p.y, cx: ST.D.view.cx, cz: ST.D.view.cz };
        ST.D.mapPress = null;
      }
      return;
    }
    var hv = anchorAt(ST.D.anchors, w.x, w.z, HIT_PX / ST.D.view.s);
    if (ST.D.mode === "faces" && hv < 0) {
      facesHover(w.x, w.z);
      ST.D.hover = -1;
      ST.D.segHover = -1;
      draw();
      return;
    }
    if (ST.D.faceHover) ST.D.faceHover = null;
    var sv = hv < 0 ? segmentAt(ST.D.anchors, w.x, w.z, 18 / ST.D.view.s) : -1;
    var ins = ST.D.mode === "draw" && hv < 0 && ST.D.anchors.length >= 2 ? insertSpot(ST.D.anchors, w.x, w.z) : null;
    var changed = hv !== ST.D.hover || sv !== ST.D.segHover;
    ST.D.hover = hv;
    ST.D.segHover = sv;
    ST.D.insert = ins ? { i: ins.i, x: w.x, z: w.z } : null;
    if (changed) views.sync3d();
    draw();
    views.tip(
      hv >= 0
        ? L("● גרור כדי לעצב את הפנייה · קליק ימני למחיקה", "● Drag to shape the turn · right-click to delete")
        : sv >= 0
          ? L("═ גרור כדי להזיז את כל המקטע · ידית ↕ משנה גובה", "═ Drag to move this section · the ↕ handle changes height")
          : ST.D.mode === "draw"
            ? L("＋ לחץ כדי להוסיף נקודה", "＋ Click to add a point")
            : L("גרור להזזת המפה · לחיצה כפולה מוסיפה נקודה", "Drag to pan · double-click to add a point"),
    );
  });
  function endPointer(e) {
    if (e.pointerType === "touch") ST.D.touches.delete(e.pointerId);
    if (ST.D.pinch) {
      if (ST.D.touches.size < 2) ST.D.pinch = null;
      ST.D.mapPress = null;
      return;
    }
    if (ST.D.pan) {
      ST.D.pan = null;
      return;
    }
    if (ST.D.heightDrag) {
      ST.D.heightDrag = null;
      finishVisualDrag();
      return;
    }
    if (ST.D.segDrag) {
      var sd = ST.D.segDrag,
        sj = (sd.i + 1) % ST.D.anchors.length;
      ST.D.segDrag = null;
      ST.D.anchors[sd.i] = snapFree(
        ST.D.anchors[sd.i].x, ST.D.anchors[sd.i].z, ST.D.anchors[sd.i].y, ST.D.anchors[sd.i],
      );
      ST.D.anchors[sj] = snapFree(
        ST.D.anchors[sj].x, ST.D.anchors[sj].z, ST.D.anchors[sj].y, ST.D.anchors[sj],
      );
      finishVisualDrag();
      return;
    }
    if (ST.D.drag >= 0) {
      var i = ST.D.drag;
      ST.D.drag = -1;
      ST.D.dragging = false;
      ST.D.anchors[i] = snapFree(
        ST.D.anchors[i].x, ST.D.anchors[i].z, ST.D.anchors[i].y, ST.D.anchors[i],
      );
      ST.D.ghostPts = null;
      noteUserEdit();
      writeThrough();
      views.sync3d();
      views.stats();
      views.refreshSelection();
      draw();
      scheduleBuild(0);
      return;
    }
    if (ST.D.mapPress && ST.D.mapPress.moved <= 6 && ST.D.mode === "draw") {
      addAnchor(ST.D.mapPress.w.x, ST.D.mapPress.w.z, ST.D.mapPress.shift);
    } else if (ST.D.mapPress && ST.D.mapPress.moved <= 6) {
      var click = ST.D.mapPress.w;
      var pick = ST.D.mode === "shape" ? pickTarget(click.x, click.z) : null;
      if (pick && pick.tg && pick.tg.kind === "item") {
        ST.D.faceSel = pick.tg.key;
        ST.D.sel = ST.D.seg = -1;
        views.refreshFaces();
        views.refreshSelection();
        views.tip(
          pick.tg.name +
            " · " +
            L("בחר נסיעה מעל או צד למטה", "pick Drive over or a side below"),
        );
        draw();
      } else {
        ST.D.sel = ST.D.seg = -1;
        views.refreshSelection();
        draw();
      }
    }
    ST.D.mapPress = null;
  }
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);
  cv.addEventListener("pointerleave", function () {
    if (ST.D.drag < 0 && !ST.D.pan) {
      ST.D.insert = null;
      ST.D.segHover = -1;
      if (ST.D.hover >= 0) {
        ST.D.hover = -1;
        views.sync3d();
      }
      draw();
    }
  });
}

export function draw() {
  if (!editorActive() || !ST.D.ctx) return;
  if (ST.D.drawReq) return;
  var D = ST.D;
  D.drawReq = requestAnimationFrame(function () {
    if (ST.D !== D) return; // the editor closed before this frame fired
    D.drawReq = 0;
    paint();
  });
}

export function heightCol(y) {
  // floor → deck: cool blue climbing to hot magenta
  var f = clamp(y / Math.max(30, (ST.E.track() && ST.E.track().high) || 105), 0, 1);
  var r = Math.round(60 + f * 195),
    g = Math.round(150 - f * 90),
    b = Math.round(240 - f * 40);
  return "rgb(" + r + "," + g + "," + b + ")";
}

export function paint() {
  var ctx = ST.D.ctx,
    cv = ST.D.canvas;
  var W = cv.clientWidth,
    H = cv.clientHeight;
  ST.D.lastDraw = performance.now();
  ctx.setTransform(ST.D.dpr, 0, 0, ST.D.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0f1218";
  ctx.fillRect(0, 0, W, H);
  var s = ST.D.view.s;

  // grid — step chosen so lines stay ~40px apart
  var step = 25;
  while (step * s < 26) step *= 2;
  ST.D.gridStep = step; // Shift-drag snaps to whatever the map is showing
  var o0 = s2w(0, 0),
    o1 = s2w(W, H);
  ctx.strokeStyle = "rgba(120,150,200,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var gx = Math.floor(o0.x / step) * step; gx <= o1.x; gx += step) {
    var px = w2s(gx, 0).x;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
  }
  for (var gz = Math.floor(o0.z / step) * step; gz <= o1.z; gz += step) {
    var py = w2s(0, gz).y;
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
  }
  ctx.stroke();

  // rooms
  ctx.lineWidth = 1.2;
  rooms().forEach(function (r) {
    if (!r.pts || r.pts.length < 3) return;
    ctx.beginPath();
    r.pts.forEach(function (p, i) {
      var q = w2s(p.x, p.z);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(46,64,102,0.28)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,160,225,0.35)";
    ctx.stroke();
  });

  var col = ST.E.col();
  // furniture footprints — taller boxes read stronger, and in faces mode they
  // are the thing being clicked, so they come forward
  if (col && col.rects) {
    var pickable = ST.D.mode === "faces";
    col.rects.forEach(function (rc) {
      var a = w2s(rc.x0, rc.z0),
        b = w2s(rc.x1, rc.z1);
      var tall = clamp((rc.y1 - rc.y0) / 90, 0.15, 1);
      ctx.fillStyle =
        "rgba(190,205,235," + ((pickable ? 0.14 : 0.07) + tall * (pickable ? 0.26 : 0.16)).toFixed(3) + ")";
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    });
  }
  // walls + doors
  if (col) {
    ctx.lineCap = "butt";
    ctx.strokeStyle = "rgba(210,220,240,0.55)";
    (col.segs || []).forEach(function (g) {
      var a = w2s(g.ax, g.az),
        b = w2s(g.bx, g.bz);
      ctx.lineWidth = Math.max(1, g.half * 2 * s);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    ctx.strokeStyle = "rgba(235,175,80,0.75)";
    (col.doorSegs || []).forEach(function (g) {
      var a = w2s(g.ax, g.az),
        b = w2s(g.bx, g.bz);
      ctx.lineWidth = Math.max(1, g.half * 2 * s);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  // water pools
  (ST.E.waters() || []).forEach(function (p) {
    var q = w2s(p.x, p.z);
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(2, p.r * s), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(60,150,190,0.35)";
    ctx.fill();
  });

  // The real built surface. In “drive the house” mode most of this centreline
  // is NOT a road: it is a direction painted over the actual floor/furniture.
  // Showing that at road width was the editor's biggest visual lie, so the map
  // now draws real deck as a wide ribbon and real surfaces as a thin dashed
  // route. Full-road mode remains a continuous ribbon.
  var tr = ST.E.track();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (tr && tr.center && tr.center.length > 1) {
    var C = tr.center,
      wpx = Math.max(1.5, (ST.E.cfg.roadWidth || 26) * s),
      homeSurface = !!ST.E.cfg.homeMode;
    if (homeSurface) {
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = Math.max(2, Math.min(4, wpx * 0.18));
      strokeCategorized(
        ctx,
        C,
        function (c) {
          return c.gap || c.deck ? null : Math.min(5, Math.floor(clamp(c.y / Math.max(30, tr.high || 105), 0, 0.999) * 6));
        },
        function (bk) {
          ctx.strokeStyle = heightCol((bk + 0.5) / 6 * (tr.high || 105));
        },
      );
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(8,10,14,0.75)";
    ctx.lineWidth = wpx + 2;
    if (homeSurface)
      strokeCategorized(ctx, C, function (c) { return !c.gap && c.deck ? 1 : null; }, function () {});
    else strokeRun(ctx, C, null);
    var bucket = -1,
      run = [];
    for (var i = 0; i < C.length; i++) {
      var c = C[i];
      var bk = homeSurface && !c.deck
        ? -3
        : c.gap
          ? -2
          : Math.min(5, Math.floor(clamp(c.y / Math.max(30, tr.high || 105), 0, 0.999) * 6));
      if (bk !== bucket) {
        if (run.length > 1 && bucket !== -3) {
          ctx.strokeStyle = bucket === -2 ? "rgba(255,255,255,0.12)" : heightCol((bucket + 0.5) / 6 * (tr.high || 105));
          ctx.lineWidth = wpx;
          strokeRun(ctx, run, null);
        }
        var tail = run.length ? run[run.length - 1] : null;
        run = tail && bucket !== -3 && bk !== -3 ? [tail] : [];
        bucket = bk;
      }
      if (bk !== -3) run.push(c);
    }
    if (run.length > 1 && bucket !== -3) {
      ctx.strokeStyle = bucket === -2 ? "rgba(255,255,255,0.12)" : heightCol((bucket + 0.5) / 6 * (tr.high || 105));
      ctx.lineWidth = wpx;
      strokeRun(ctx, run, null);
    }
  } else if (!ST.D.dragging && ST.D.anchors.length >= 3) {
    ctx.strokeStyle = "rgba(120,140,180,0.4)";
    ctx.lineWidth = Math.max(1.5, (ST.E.cfg.roadWidth || 26) * s);
    strokeRun(ctx, ghostLine(ST.D.anchors), null);
  }

  // route polygon + ghost while dragging
  var gp = ST.D.dragging && ST.D.ghostPts ? ST.D.ghostPts : null;
  if (gp) {
    ctx.strokeStyle = "rgba(56,245,208,0.95)";
    ctx.lineWidth = Math.max(1.5, (ST.E.cfg.roadWidth || 26) * s * 0.5);
    strokeRun(ctx, gp, null);
  }
  // problem legs, under the route line: a fat red ribbon where the deck would
  // be laid through a wall, amber where it is merely awkward
  if (ST.D.issues && !ST.D.dragging && ST.D.anchors.length >= 3) {
    var gl = ghostLine(ST.D.anchors);
    for (var bi = 0; bi < ST.D.anchors.length; bi++) {
      var bad = ST.D.issues.segs[bi];
      if (!bad) continue;
      var span = gl.slice(bi * GHOST_SEG, bi * GHOST_SEG + GHOST_SEG + 1);
      if (span.length < 2) continue;
      ctx.strokeStyle = bad.sev > 1 ? "rgba(239,68,68,0.5)" : "rgba(245,158,11,0.4)";
      ctx.lineWidth = Math.max(3, (ST.E.cfg.roadWidth || 26) * s);
      strokeRun(ctx, span, null);
    }
  }

  if (ST.D.anchors.length >= 2) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ST.D.anchors.forEach(function (a, i) {
      var q = w2s(a.x, a.z);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    // Each leg is a real draggable section. Its pill follows the section angle
    // and contains an arrow, so movement and driving direction read at once.
    for (var k = 0; k < ST.D.anchors.length; k++) {
      var a1 = ST.D.anchors[k],
        a2 = ST.D.anchors[(k + 1) % ST.D.anchors.length];
      var m = w2s((a1.x + a2.x) / 2, (a1.z + a2.z) / 2);
      var an = Math.atan2(w2s(a2.x, a2.z).y - w2s(a1.x, a1.z).y, w2s(a2.x, a2.z).x - w2s(a1.x, a1.z).x);
      var activeSeg = k === ST.D.seg,
        hoverSeg = k === ST.D.segHover;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(an);
      capsule(ctx, -14, -7, 28, 14);
      ctx.fillStyle = activeSeg ? "#f59e0b" : hoverSeg ? "#67e8f9" : "rgba(15,23,42,.68)";
      ctx.fill();
      ctx.strokeStyle = activeSeg ? "#fde68a" : "rgba(103,232,249,.72)";
      ctx.lineWidth = activeSeg ? 2 : 1.2;
      ctx.stroke();
      ctx.fillStyle = activeSeg ? "#1f1300" : "#e6fbff";
      arrow(ctx, 1, 0, 0, 4.5);
      ctx.restore();

      if (activeSeg) {
        var hx = m.x < W - 70 ? m.x + 38 : m.x - 38;
        var ht = clamp(m.y - 55, 24, Math.max(24, H - 116));
        var hb = ht + 92;
        var hf = clamp((segmentY(k) - 0.7) / 159.3, 0, 1);
        var hy = hb - hf * (hb - ht);
        ST.D.heightUi = { i: k, x: hx, top: ht, bottom: hb, knobY: hy };
        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(255,255,255,.38)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(hx, ht);
        ctx.lineTo(hx, hb);
        ctx.stroke();
        var grad = ctx.createLinearGradient(0, hb, 0, ht);
        grad.addColorStop(0, "#38bdf8");
        grad.addColorStop(1, "#ec4899");
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(hx, hb);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, hy, 10, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.fill();
        ctx.strokeStyle = "#fff7d6";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#271600";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("↕", hx, hy + .5);
        ctx.fillStyle = "rgba(8,12,20,.88)";
        capsule(ctx, hx - 22, hy - 25, 44, 15);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 9px system-ui, sans-serif";
        ctx.fillText(Math.round(segmentY(k)) + "cm", hx, hy - 17.5);
        ctx.restore();
      }
    }
  } else ST.D.heightUi = null;

  if (ST.D.seg < 0) ST.D.heightUi = null;

  // pending-insert preview
  if (ST.D.insert && ST.D.anchors.length >= 2 && ST.D.hover < 0 && !ST.D.dragging) {
    var pi = ST.D.insert;
    var pa = ST.D.anchors[(pi.i - 1 + ST.D.anchors.length) % ST.D.anchors.length],
      pb = ST.D.anchors[pi.i % ST.D.anchors.length];
    var q0 = w2s(pa.x, pa.z),
      q1 = w2s(pb.x, pb.z),
      qm = w2s(pi.x, pi.z);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(56,245,208,0.8)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(qm.x, qm.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(qm.x, qm.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56,245,208,0.9)";
    ctx.fill();
  }

  // pass-by rules (and, in faces mode, the face under the cursor)
  paintFaces(ctx, w2s);

  // Curve handles: quiet rings instead of numbered technical markers. The
  // green start handle carries the direction arrow; selected section ends glow.
  ST.D.anchors.forEach(function (a, i) {
    var q = w2s(a.x, a.z);
    var segEnd = ST.D.seg >= 0 && (i === ST.D.seg || i === (ST.D.seg + 1) % ST.D.anchors.length);
    var r = i === ST.D.sel || i === ST.D.hover ? 9 : segEnd ? 8 : 6.5;
    var bad = ST.D.issues && ST.D.issues.pts[i];
    if (bad) {
      ctx.beginPath();
      ctx.arc(q.x, q.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = bad.sev > 1 ? "rgba(239,68,68,0.85)" : "rgba(245,158,11,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? "#22c55e" : segEnd ? "#f59e0b" : i === ST.D.sel ? "#38bdf8" : "#101826";
    ctx.fill();
    ctx.strokeStyle = i === ST.D.hover ? "#fff" : fin(a.y) ? heightCol(a.y) : "#67e8f9";
    ctx.lineWidth = i === ST.D.sel || segEnd ? 2.5 : 1.8;
    ctx.stroke();
    if (i === 0 && ST.D.anchors.length > 1) {
      var n1 = w2s(ST.D.anchors[1].x, ST.D.anchors[1].z);
      ctx.fillStyle = "#fff";
      arrow(ctx, q.x, q.y, Math.atan2(n1.y - q.y, n1.x - q.x), 4.2);
    }
  });

  // cars
  (ST.E.cars() || []).forEach(function (c) {
    if (!fin(c.x)) return;
    var q = w2s(c.x, c.z);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(-c.heading + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 3.6);
    ctx.lineTo(-4, -3.6);
    ctx.closePath();
    ctx.fillStyle = c.ai ? "#f97316" : "#facc15";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });

  // 3D camera wedge — ties the two views together at a glance
  var cam = ST.E.camera();
  if (cam) {
    var cp = w2s(cam.position.x, cam.position.z);
    var dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    var ca = Math.atan2(dir.z, dir.x);
    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(ca);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 26, -0.5, 0.5);
    ctx.closePath();
    ctx.fillStyle = "rgba(120,190,255,0.13)";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(150,200,255,0.85)";
    ctx.fill();
  }

  // scale readout
  var lab = ST.D.mapRoot && ST.D.mapRoot.querySelector("#rcEdScale");
  if (lab) lab.textContent = step >= 100 ? step / 100 + " m" : step + " cm";
}

export function strokeRun(ctx, pts, _) {
  ctx.beginPath();
  var pen = false;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    if (p.gap) {
      pen = false;
      continue;
    }
    var q = w2s(p.x, p.z);
    if (!pen) {
      ctx.moveTo(q.x, q.y);
      pen = true;
    } else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}

// Draw contiguous runs that share a visual category. A null category is a
// deliberate break (for example, floor between two short access ramps).
export function strokeCategorized(ctx, pts, category, style) {
  var key = null,
    run = [];
  function flush() {
    if (key != null && run.length > 1) {
      style(key);
      strokeRun(ctx, run, null);
    }
  }
  for (var i = 0; i < pts.length; i++) {
    var next = category(pts[i]);
    if (next !== key) {
      flush();
      run = [];
      key = next;
    }
    if (next != null) run.push(pts[i]);
  }
  flush();
}

export function arrow(ctx, x, y, a, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.7, r * 0.6);
  ctx.lineTo(-r * 0.7, -r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function capsule(ctx, x, y, w, h) {
  var r = Math.min(h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}
