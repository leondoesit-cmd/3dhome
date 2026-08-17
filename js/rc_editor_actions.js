// RC track editor — the command layer: every edit to the track goes through
// here (anchor add/move/delete, heights, presets, undo/redo, autofix, the
// debounced rebuild + write-through to rc.js).
//
// The 2D map, the 3D handles and the side panels all import these directly, so
// none of them needs to know about the others. What the commands need BACK —
// "redraw yourself" — arrives through setViews(): seven callbacks, registered
// once when the editor opens. That is the only edge pointing at the views, and
// it is a hook rather than an import so the graph stays acyclic.

import { t } from "./i18n.js";
import { ST, ANG_SNAP, GHOST_SEG, L, editorActive, fin, clamp, cloneAnchors } from "./rc_editor_state.js";
import {
  anchorY, clearAt, ghostLine, halfRoad, insertSpot, roomySpot, segmentMid,
  validate,
} from "./rc_editor_geom.js";

// The one view registry. Commands call it; sibling views (the 2D map, the 3D
// handles) call it too rather than importing each other — one wiring point,
// no cycles, and every "redraw" edge in the editor is visible in one place.
export const views = {
  sync3d: () => {},
  draw: () => {},
  refreshSelection: () => {},
  refreshFoot: () => {},
  stats: () => {},
  editorStatus: () => {},
  tip: () => {},
  editorSynced: () => {},
  refreshFaces: () => {},
};
export function setViews(v) {
  Object.assign(views, v);
}

export function setSegmentHeight(i, y, live) {
  if (i < 0 || !ST.D.anchors[i]) return;
  y = clamp(y, 0.7, 160);
  if (!live) pushHist();
  var j = (i + 1) % ST.D.anchors.length;
  ST.D.anchors[i].y = y;
  ST.D.anchors[j].y = y;
  ST.D.ghostPts = ghostLine(ST.D.anchors);
  writeThrough(!live);
  ST.D.dragging = !!live;
  views.editorStatus(live ? "preview" : "building");
  views.sync3d();
  views.stats();
  views.refreshSelection();
  views.draw();
  if (!live) scheduleBuild(0);
}

// A single point can own a height too — that is how you get one peak in the
// middle of a leg instead of a whole flat section lifted onto stilts. Dropping
// y again lets the point ride whatever it stands on.
export function setAnchorHeight(i, y, live, auto) {
  if (i < 0 || !ST.D.anchors[i]) return;
  if (!live) pushHist();
  if (auto) delete ST.D.anchors[i].y;
  else ST.D.anchors[i].y = clamp(y, 0.7, 160);
  ST.D.ghostPts = ghostLine(ST.D.anchors);
  writeThrough(!live);
  ST.D.dragging = !!live;
  views.editorStatus(live ? "preview" : "building");
  views.sync3d();
  views.stats();
  views.refreshSelection();
  views.draw();
  if (!live) scheduleBuild(0);
}

export function revalidate() {
  if (!ST.D) return;
  ST.D.issues = validate();
  if (ST.D.issueIx >= ST.D.issues.list.length) ST.D.issueIx = 0;
}

// The ⚠ chip walks the problems: select it, centre the map on it, say what it is.
export function gotoIssue() {
  var list = (ST.D.issues && ST.D.issues.list) || [];
  if (!list.length) return;
  var is = list[ST.D.issueIx % list.length];
  ST.D.issueIx = (ST.D.issueIx + 1) % list.length;
  if (is.at === "pt") {
    ST.D.sel = is.i;
    ST.D.seg = -1;
  } else {
    ST.D.sel = -1;
    ST.D.seg = is.i;
  }
  var c = is.at === "pt" ? ST.D.anchors[is.i] : segmentMid(is.i);
  if (c) {
    ST.D.userView = true;
    ST.D.view.cx = c.x;
    ST.D.view.cz = c.z;
  }
  views.tip(is.msg);
  ST.E.msg("⚠ " + is.msg, 2200);
  views.sync3d();
  views.refreshSelection();
  views.draw();
}

// One press that makes an unbuildable route buildable: crowded points merge,
// everything else moves to the nearest place the full width fits.
export function autoFix() {
  if (ST.D.anchors.length < 3) return;
  var before = ((ST.D.issues && ST.D.issues.list) || []).length;
  var pts = cloneAnchors(ST.D.anchors),
    minLeg = halfRoad() * 1.5;
  for (var i = 0; i < pts.length - 1 && pts.length > 3; ) {
    if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) < minLeg) pts.splice(i + 1, 1);
    else i++;
  }
  pts = pts.map(function (a) {
    var s = roomySpot(a.x, a.z, anchorY(a));
    var out = { x: s.x, z: s.z };
    if (fin(a.y)) out.y = a.y;
    return out;
  });
  // Clear points aren't enough: the smoothed curve between two of them can
  // still cut the corner of a rug. Give each leg that still clips one extra
  // point, pulled out to open floor at its worst sample.
  var need = halfRoad(),
    line = ghostLine(pts),
    adds = [];
  for (i = 0; i < pts.length && adds.length < 6; i++) {
    var worst = null;
    for (var k = 1; k < GHOST_SEG; k++) {
      var p = line[i * GHOST_SEG + k];
      if (!p) break;
      var c = clearAt(p.x, p.z, fin(p.y) ? p.y : anchorY(pts[i]));
      if (!worst || c < worst.c) worst = { c: c, p: p };
    }
    if (worst && worst.c < need * 0.72) {
      var s2 = roomySpot(worst.p.x, worst.p.z, anchorY(pts[i]));
      if (clearAt(s2.x, s2.z, anchorY(pts[i])) > worst.c) adds.push({ at: i + 1, p: s2 });
    }
  }
  for (i = adds.length - 1; i >= 0; i--) pts.splice(adds[i].at, 0, { x: adds[i].p.x, z: adds[i].p.z });
  ST.D.sel = ST.D.seg = -1;
  setAnchors(pts, { delay: 0 });
  var after = ((ST.D.issues && ST.D.issues.list) || []).length;
  ST.E.msg(
    after < before
      ? L("תוקנו " + (before - after) + " בעיות 🩹", "Fixed " + (before - after) + " problems 🩹")
      : after
        ? L("נשארו בעיות — הזז נקודות ידנית", "Some problems remain — move points by hand")
        : L("המסלול נקי ✔", "Route is clean ✔"),
    2000,
  );
  ST.E.beep(after < before ? 700 : 320, 0.07, 0.2);
}

// Modifier snapping while dragging: Shift = the map's own grid, Ctrl = 15° off
// the previous point. Alt is already the map's pan, so it stays out of this.
export function applySnap(x, z, i, e) {
  var out = { x: x, z: z };
  if (!e) return out;
  if ((e.ctrlKey || e.metaKey) && ST.D.anchors.length > 1) {
    var p = ST.D.anchors[(i - 1 + ST.D.anchors.length) % ST.D.anchors.length];
    var dx = x - p.x,
      dz = z - p.z,
      len = Math.hypot(dx, dz);
    if (len > 1) {
      var a = Math.round(Math.atan2(dz, dx) / ANG_SNAP) * ANG_SNAP;
      out.x = p.x + Math.cos(a) * len;
      out.z = p.z + Math.sin(a) * len;
    }
  }
  if (e.shiftKey) {
    var g = ST.D.gridStep || 25;
    out.x = Math.round(out.x / g) * g;
    out.z = Math.round(out.z / g) * g;
  }
  return out;
}

export function snapTip(e) {
  views.tip(e && e.shiftKey ? "▦ " + (ST.D.gridStep || 25) + "cm" : e && (e.ctrlKey || e.metaKey) ? "∠ 15°" : "●");
}

export function writeThrough(save) {
  ST.E.cfg.customAnchors = ST.D.anchors.map(function (a) {
    var out = { x: Math.round(a.x * 10) / 10, z: Math.round(a.z * 10) / 10 };
    if (fin(a.y)) out.y = Math.round(a.y * 10) / 10;
    // the builder needs `ride` (it must not spiral this point off the bed) and
    // the editor needs `f` to know which pass-by rule owns it
    if (a.ride) out.ride = true;
    if (a.f) out.f = a.f;
    return out;
  });
  ST.E.cfg.faceRules = (ST.D.faces || []).map(function (r) {
    return { id: r.id, key: r.key, kind: r.kind, name: r.name, face: r.face, ride: !!r.ride, flip: !!r.flip };
  });
  ST.D.sig = ST.E.cfg.anchorsSig = ST.E.planSig(); // the route belongs to the flat it was drawn on
  if (save !== false) {
    ST.E.save();
    revalidate(); // every commit re-judges the route; live drags don't
  }
}

export function scheduleBuild(delay) {
  if (ST.D.build) clearTimeout(ST.D.build);
  views.editorStatus("building");
  ST.D.build = setTimeout(function () {
    ST.D.build = 0;
    if (!editorActive()) return;
    if (ST.D.anchors.length >= 3) ST.E.rebuild();
    else {
      ST.E.clearTrack();
      views.editorSynced();
    }
  }, delay == null ? 90 : delay);
}

// A history entry is the anchor list — with the pass-by rules riding along on
// the array itself. They are two halves of one state: undoing a face pick has
// to take the rule off the list as well as its points off the route, and
// keeping them in the same entry is what makes that automatic. (The rules are
// never mutated in place, so a snapshot cannot be edited from under itself.)
function histEntry() {
  var snap = cloneAnchors(ST.D.anchors);
  snap.faces = (ST.D.faces || []).slice();
  return snap;
}

export function restoreEntry(entry) {
  ST.D.anchors = entry;
  ST.D.faces = entry.faces ? entry.faces.slice() : [];
}
var restore = restoreEntry;

export function pushHist() {
  ST.D.hist.push(histEntry());
  if (ST.D.hist.length > 60) ST.D.hist.shift();
  ST.D.redo.length = 0;
  views.refreshFoot();
}

export function undo() {
  if (!ST.D.hist.length) return;
  ST.D.redo.push(histEntry());
  restore(ST.D.hist.pop());
  ST.D.sel = ST.D.seg = -1;
  ST.D.ghostPts = ghostLine(ST.D.anchors);
  writeThrough();
  views.sync3d();
  views.stats();
  views.refreshSelection();
  views.refreshFaces();
  scheduleBuild(0);
  views.draw();
  views.refreshFoot();
  ST.E.beep(400, 0.07, 0.18);
}

export function redo() {
  if (!ST.D.redo.length) return;
  ST.D.hist.push(histEntry());
  restore(ST.D.redo.pop());
  ST.D.sel = ST.D.seg = -1;
  ST.D.ghostPts = ghostLine(ST.D.anchors);
  writeThrough();
  views.sync3d();
  views.stats();
  views.refreshSelection();
  views.refreshFaces();
  scheduleBuild(0);
  views.draw();
  views.refreshFoot();
  ST.E.beep(540, 0.07, 0.18);
}

// Edits — all go through here so history, persistence and both views stay in
// step. `live` edits (dragging) skip the rebuild and only refresh the ghost.
export function setAnchors(next, opts) {
  opts = opts || {};
  if (!opts.live) pushHist();
  ST.D.anchors = next;
  ST.D.ghostPts = ghostLine(ST.D.anchors);
  writeThrough(!opts.live);
  views.sync3d();
  views.stats();
  views.refreshSelection();
  views.refreshFaces();
  views.draw();
  if (!opts.live) scheduleBuild(opts.delay);
}

export function addAnchor(x, z, append) {
  var pts = ST.D.anchors.slice();
  var at = append || pts.length < 2 ? pts.length : insertSpot(pts, x, z).i;
  pts.splice(at, 0, snapFree(x, z));
  ST.D.sel = at;
  setAnchors(pts, { delay: 0 });
  ST.E.beep(660, 0.06, 0.2);
}

export function delAnchor(i) {
  if (i < 0 || i >= ST.D.anchors.length) return;
  var pts = ST.D.anchors.slice();
  pts.splice(i, 1);
  if (ST.D.sel === i) ST.D.sel = -1;
  else if (ST.D.sel > i) ST.D.sel--;
  ST.D.seg = -1;
  setAnchors(pts, { delay: 0 });
  ST.E.beep(280, 0.07, 0.22);
}

export function nudgeSelected(dx, dz) {
  if (ST.D.sel < 0 || !ST.D.anchors[ST.D.sel]) return;
  var pts = ST.D.anchors.slice();
  var a = pts[ST.D.sel];
  // Precision controls are deliberately literal. Collision-aware snapping is
  // for map/3D dragging; a 5cm nudge must never turn into a surprising jump.
  pts[ST.D.sel] = { x: a.x + dx, z: a.z + dz };
  setAnchors(pts, { delay: 0 });
  views.tip(L("נקודה הוזזה בדיוק", "Point nudged precisely"));
}

export function setSelectedCoords(x, z) {
  if (ST.D.sel < 0 || !ST.D.anchors[ST.D.sel] || !fin(x) || !fin(z)) {
    views.refreshSelection();
    return;
  }
  var pts = ST.D.anchors.slice();
  pts[ST.D.sel] = { x: x, z: z };
  setAnchors(pts, { delay: 0 });
}

export function snapFree(x, z, y) {
  var s = ST.D && ST.D.noSnap ? null : roomySpot(x, z, fin(y) ? y : 0.7);
  var out = s ? { x: s.x, z: s.z } : { x: x, z: z };
  if (fin(y)) out.y = y;
  return out;
}

export function applyPreset(kind) {
  var rs = ST.E.rooms();
  ST.D.roomCache = rs;
  var pts =
    kind === "oval" ? ST.E.presets.oval(rs) :
    kind === "fig8" ? ST.E.presets.fig8(rs) :
    ST.E.presets.auto(rs);
  if (!pts || pts.length < 3) pts = ST.E.presets.oval(rs);
  ST.D.sel = ST.D.seg = -1;
  setAnchors(cloneAnchors(pts), { delay: 0 });
}
