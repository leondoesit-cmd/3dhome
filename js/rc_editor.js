// Live 2D + 3D track editor for the micro-RC mode.
//
// One editor, two synchronised views: a dockable 2D map of the flat (rooms,
// walls, furniture, water, the REAL built centreline) and draggable handles in
// the 3D scene itself. Both edit the same anchor list, share one undo stack and
// one selection, and highlight each other on hover.
//
// The thing that makes it usable is that the expensive part is deferred: a full
// buildRoad() is ~90ms, so dragging never rebuilds the road. While a handle is
// moving we draw a cheap Catmull-Rom ghost of the new route (3D line + 2D
// canvas) and only commit — one coalesced rebuild — when the drag ends. Sliders
// debounce the same way.
//
// Like js/kart.js this module NEVER imports rc.js internals; it reads the world
// through the `E` env injected once by rc.js via editorInit().
import * as THREE from "three";
import { t } from "./i18n.js";
export { editorActive } from "./rc_editor_state.js";
import {
  ST, editorActive, SAVE_KEY, THEMES, THEME_COL, PHYS_PRESETS, L, fin, clamp,
  copyAnchor, cloneAnchors, rooms,
} from "./rc_editor_state.js";
import { anchorY, ghostLine, insertSpot, pathLen, segmentY, validate } from "./rc_editor_geom.js";
import {
  addAnchor, applyPreset, applySnap, autoFix, delAnchor, gotoIssue,
  nudgeSelected, pushHist, redo, revalidate, scheduleBuild,
  setAnchorHeight, setAnchors, setSegmentHeight, setSelectedCoords,
  setViews, snapFree, undo, writeThrough,
} from "./rc_editor_actions.js";
import { bindCanvas, draw, fitView, resizeCanvas, s2w, w2s, zoomAt } from "./rc_editor_map.js";
import {
  FACE_GLYPH, faceApply, faceAutoAll, faceGoto, faceName, faceRemove, faceFlip,
  faceRules, facesAdopt, facesInvalidate, facesRelay, findTarget, pickTarget, ruleFor,
  smartFace, targetRide,
} from "./rc_editor_faces.js";

export function editorInit(env) {
  ST.E = env;
}

// ---- geometry helpers (shared by the 2D map and the 3D handles) -------------

// ---- clearance & validation -------------------------------------------------
//
// The editor judges a route the way the road builder will lay it: a centreline
// needs half a road width of clear floor either side, a corner can't be tighter
// than the deck can bend, and a ramp steeper than the truck climbs is a dead
// lap. Everything here reads E.col() — the same wall/furniture snapshot rc.js
// drives against — so a route that validates clean is one the truck can drive.

// ---- open / close -----------------------------------------------------------

export function editorToggle(on) {
  var want = on == null ? !editorActive() : !!on;
  if (want === editorActive()) return want;
  if (want) editorOpen();
  else editorClose();
  return editorActive();
}

export function editorOpen() {
  if (!ST.E || editorActive()) return;
  // register the view callbacks the command layer calls back into (see the
  // note in rc_editor_actions.js — this hook is the one edge pointing at the
  // renderers, and it is wired here rather than imported over there)
  setViews({
    sync3d, draw, refreshSelection, refreshFoot, stats, editorStatus, tip,
    editorSynced, refreshFaces,
  });
  // E.anchors() returns the stored route only when it was drawn on THIS flat
  var seed = ST.E.anchors() || ST.E.presets.auto(ST.E.rooms());
  if (!seed || seed.length < 3) seed = ST.E.presets.oval(ST.E.rooms());
  ST.D = {
    on: true,
    anchors: cloneAnchors(seed),
    sel: -1,
    hover: -1,
    drag: -1,
    dragging: false,
    pressed: null, // 3D press bookkeeping {x,y,idx}
    hist: [],
    redo: [],
    view: { cx: 0, cz: 0, s: 0.3 },
    pan: null,
    insert: null,
    mode: "shape",
    seg: -1,
    segHover: -1,
    segDrag: null,
    heightDrag: null,
    heightUi: null,
    tab: "route",
    grp: null,
    handles: [],
    ghost: null,
    ghostPts: null,
    build: 0, // pending rebuild timer
    issues: null, // last validate() result
    issueIx: 0,
    gridStep: 25,
    touches: null, // live pointers on the map (pinch bookkeeping)
    pinch: null,
    drawReq: 0,
    lastDraw: 0,
    tick: 0,
    sprites: {},
    // pass-by rules: "run down THIS side of the sofa, THIS way round"
    faces: [],
    faceSeq: 0,
    faceSel: null,
    faceHover: null,
    faceCache: null,
    sig: ST.E.planSig(),
  };
  // The stored rules describe points that were saved with them — adopt the ones
  // whose points came back. Must happen before the first writeThrough, which
  // persists D.faces over whatever is in the prefs.
  facesAdopt(ST.E.cfg.faceRules);
  ST.D.overview = true; // open looking at the whole flat — the chase cam is useless for layout
  ST.E.maxView(true); // make sure both the dedicated 2D editor and 3D preview are visible
  buildDom();
  ST.E.overview(true);
  build3d();
  fitView();
  writeThrough(false);
  revalidate();
  stats();
  scheduleBuild(0);
  bindKeys();
  // console/test hook (mirrors window.rcDebug in rc.js)
  window.rcEdDebug = function () {
    return { D: ST.D, w2s: w2s, s2w: s2w, insertSpot: insertSpot, ghostLine: ghostLine, rayHit: rayHit };
  };
  ST.E.msg(L("עורך חי 🛣️", "Live editor 🛣️"), 1400);
}

export function editorClose() {
  if (!editorActive()) return;
  if (ST.D.build) clearTimeout(ST.D.build);
  if (ST.D.overview) ST.E.overview(false);
  ST.E.maxView(false);
  clear3d();
  if (ST.D.root && ST.D.root.parentNode) ST.D.root.parentNode.removeChild(ST.D.root);
  if (ST.D.mapRoot && ST.D.mapRoot.parentNode) ST.D.mapRoot.parentNode.removeChild(ST.D.mapRoot);
  if (ST.D.mapHost) ST.D.mapHost.classList.remove("rc-editor-map-on");
  if (ST.D.controlsHost) ST.D.controlsHost.classList.remove("rc-editor-mode");
  if (ST.D.bar3d && ST.D.bar3d.parentNode) ST.D.bar3d.parentNode.removeChild(ST.D.bar3d);
  if (!ST.D.showRightPrev) document.body.classList.remove("show-right");
  if (ST.D.ro) ST.D.ro.disconnect();
  unbindKeys();
  ST.D = null;
}

// rc.js calls this after every buildTrack() so the map and the handles show the
// road that actually exists.
export function editorSynced() {
  if (!editorActive()) return;
  ST.D.roomCache = null; // the scene may have changed under us
  facesInvalidate(); // ...so the furniture the pass-by rules point at may have too
  reseedForPlan();
  ST.D.ghostPts = null;
  revalidate(); // the walls this route is judged against just moved
  sync3d();
  stats();
  refreshSelection();
  refreshFaces();
  editorStatus(ST.D.anchors.length >= 3 ? "ready" : "warning");
  draw();
}

// The flat can change while the editor is open (a room edited, a new apartment
// generated). A lap drawn for the old walls is meaningless against the new
// ones, so start again from the route this flat deserves.
function reseedForPlan() {
  var sig = ST.E.planSig();
  if (sig === ST.D.sig) return false;
  ST.D.sig = sig;
  var seed = ST.E.anchors() || ST.E.presets.auto(ST.E.rooms());
  if (!seed || seed.length < 3) seed = ST.E.presets.oval(ST.E.rooms());
  ST.D.anchors = cloneAnchors(seed);
  // a pass-by belongs to a piece of furniture in a flat that no longer exists
  ST.D.faces = [];
  ST.D.faceSel = null;
  ST.D.faceHover = null;
  ST.D.sel = -1;
  ST.D.seg = -1;
  ST.D.hover = -1;
  ST.D.hist.length = 0;
  ST.D.redo.length = 0;
  ST.D.userView = false;
  writeThrough(false); // don't persist an auto route as the user's own
  fitView();
  refreshFoot();
  ST.E.msg(L("הדירה השתנתה — מסלול חדש 🛣️", "Flat changed — new route 🛣️"), 2400);
  return true;
}

// ---- rebuild scheduling -----------------------------------------------------

// ---- 3D handles + ghost -----------------------------------------------------

function build3d() {
  var scene = ST.E.scene();
  if (!scene) return;
  ST.D.grp = new THREE.Group();
  ST.D.grp.userData.rc = true; // keep the collision snapshot from seeing handles
  ST.D.grp.renderOrder = 900;
  scene.add(ST.D.grp);
  var gm = new THREE.BufferGeometry();
  gm.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 8), 3));
  ST.D.ghost = new THREE.Line(
    gm,
    new THREE.LineBasicMaterial({
      color: 0x38f5d0,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  ST.D.ghost.frustumCulled = false;
  ST.D.ghost.renderOrder = 901;
  ST.D.ghost.visible = false;
  ST.D.grp.add(ST.D.ghost);
  sync3d();
}

function clear3d() {
  var scene = ST.E.scene();
  if (ST.D.grp) {
    if (scene) scene.remove(ST.D.grp);
    ST.D.grp.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
  ST.D.grp = null;
  ST.D.ghost = null;
  ST.D.handles = [];
  ST.D.sprites = {};
}

function numSprite(n) {
  if (ST.D.sprites[n]) return ST.D.sprites[n];
  var c = document.createElement("canvas");
  c.width = c.height = 64;
  var g = c.getContext("2d");
  g.font = "bold 40px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 7;
  g.strokeStyle = "rgba(8,10,14,0.92)";
  g.strokeText(String(n), 32, 34);
  g.fillStyle = "#ffffff";
  g.fillText(String(n), 32, 34);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
  ST.D.sprites[n] = tex;
  return tex;
}

function makeHandle(i) {
  var g = new THREE.Group();
  g.userData.rc = true;
  g.userData.anchor = i;
  var mat = new THREE.MeshBasicMaterial({
    color: 0xec4899,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  var pil = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 13, 10), mat);
  pil.position.y = 6.5;
  pil.renderOrder = 902;
  g.add(pil);
  var rmat = new THREE.MeshBasicMaterial({
    color: 0xec4899,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });
  var ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 7.5, 22), rmat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.6;
  ring.renderOrder = 902;
  g.add(ring);
  var sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: numSprite(i + 1),
      depthTest: false,
      transparent: true,
      sizeAttenuation: false,
    }),
  );
  sp.scale.set(0.032, 0.032, 1);
  sp.position.y = 16;
  sp.renderOrder = 903;
  g.add(sp);
  // vertical lift knob — Alt-drag also works, but a handle you can grab in 3D
  // is what stops height living only on the 2D slider
  var lmat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  var lift = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 10), lmat);
  lift.position.y = 22;
  lift.renderOrder = 904;
  g.add(lift);
  var liftHit = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 14, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  liftHit.position.y = 22;
  liftHit.userData.anchor = i;
  liftHit.userData.lift = true;
  g.add(liftHit);
  g.userData.parts = { pil: pil, ring: ring, mat: mat, rmat: rmat, sp: sp, lift: lift, lmat: lmat };
  // the pillar is the click target — raycasting a fat invisible cylinder makes
  // grabbing a handle forgiving at any zoom
  var hit = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 20, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = 8;
  hit.userData.anchor = i;
  g.add(hit);
  g.userData.hit = hit;
  g.userData.liftHit = liftHit;
  return g;
}

// Rebuild the handle list to match the anchors and recolour by state.
function sync3d() {
  if (!ST.D.grp) return;
  var n = ST.D.anchors.length;
  while (ST.D.handles.length > n) {
    var h = ST.D.handles.pop();
    ST.D.grp.remove(h);
    h.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  while (ST.D.handles.length < n) {
    var g = makeHandle(ST.D.handles.length);
    ST.D.grp.add(g);
    ST.D.handles.push(g);
  }
  for (var i = 0; i < n; i++) {
    var a = ST.D.anchors[i],
      hg = ST.D.handles[i],
      p = hg.userData.parts;
    var y = fin(a.y) ? a.y : ST.E.groundAt(a.x, a.z, 4, 2.2);
    hg.position.set(a.x, y, a.z);
    var bad = ST.D.issues && ST.D.issues.pts[i];
    var col =
      i === ST.D.sel ? 0x38bdf8
      : i === ST.D.hover ? 0xffffff
      : bad ? (bad.sev > 1 ? 0xef4444 : 0xf59e0b) // a point the road can't be built through
      : i === 0 ? 0x22c55e
      : 0xec4899;
    p.mat.color.setHex(col);
    p.rmat.color.setHex(col);
    if (p.lmat) p.lmat.color.setHex(i === ST.D.sel ? 0x7dd3fc : 0x38bdf8);
    if (p.lift) p.lift.visible = i === ST.D.sel || i === ST.D.hover;
    p.sp.material.map = numSprite(i + 1);
    p.sp.material.needsUpdate = true;
    hg.userData.hit.userData.anchor = i;
    hg.userData.anchor = i;
    if (hg.userData.liftHit) hg.userData.liftHit.userData.anchor = i;
  }
  ghost3d();
}

function ghost3d() {
  if (!ST.D.ghost) return;
  var pts = ST.D.ghostPts || (ST.D.anchors && ST.D.anchors.length >= 2 ? ghostLine(ST.D.anchors) : null);
  if (!pts || pts.length < 2) {
    ST.D.ghost.visible = false;
    return;
  }
  var arr = new Float32Array(pts.length * 3);
  for (var i = 0; i < pts.length; i++) {
    arr[i * 3] = pts[i].x;
    arr[i * 3 + 1] = (fin(pts[i].y) ? pts[i].y : ST.E.groundAt(pts[i].x, pts[i].z, 4, 2.2)) + 1.6;
    arr[i * 3 + 2] = pts[i].z;
  }
  ST.D.ghost.geometry.dispose();
  var gm = new THREE.BufferGeometry();
  gm.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  ST.D.ghost.geometry = gm;
  ST.D.ghost.visible = true;
}

// ---- 3D pointer hooks (called from rc.js's own view handlers) ---------------

function rayHit(e) {
  var v3d = document.getElementById("v3d");
  var cam = ST.E.camera();
  if (!v3d || !cam) return null;
  var rect = v3d.getBoundingClientRect();
  if (!rect.width) {
    var host = document.getElementById("view-3d");
    rect = host ? host.getBoundingClientRect() : rect;
    if (!rect.width) return null;
  }
  var ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  var rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, cam);
  var out = { idx: -1, x: 0, y: 0, z: 0 };
  if (ST.D.handles.length) {
    // handles move between frames — raycasting stale matrices misses them
    if (ST.D.grp) ST.D.grp.updateMatrixWorld(true);
    var handleMeshes = [];
    ST.D.handles.forEach(function (h) {
      if (h.userData.liftHit) handleMeshes.push(h.userData.liftHit);
      handleMeshes.push(h.userData.hit);
    });
    var hits = rc.intersectObjects(handleMeshes, false);
    if (hits.length) {
      out.idx = hits[0].object.userData.anchor;
      out.lift = !!hits[0].object.userData.lift;
      out.x = ST.D.anchors[out.idx] ? ST.D.anchors[out.idx].x : hits[0].point.x;
      out.z = ST.D.anchors[out.idx] ? ST.D.anchors[out.idx].z : hits[0].point.z;
      out.y = hits[0].point.y;
      return out;
    }
  }
  // Dragging a handle: project onto the plane at THAT handle's height so a
  // point sitting on a table stays on the table instead of falling to y=0.
  if (ST.D.drag >= 0 && ST.D.anchors[ST.D.drag] && !ST.D.liftDrag) {
    var a = ST.D.anchors[ST.D.drag];
    var hy = fin(a.y) ? a.y : ST.E.groundAt(a.x, a.z, 4, 2.2);
    var pDrag = new THREE.Vector3();
    if (rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -hy), pDrag)) {
      out.x = pDrag.x;
      out.y = hy;
      out.z = pDrag.z;
      return out;
    }
  }
  // Click the models themselves — the 3D designer is for driving ON furniture,
  // so the hit has to be the mesh, not the floor under it.
  var scene = ST.E.scene && ST.E.scene();
  if (scene) {
    var meshes = [];
    scene.traverse(function (o) {
      if (!o.isMesh || !o.visible) return;
      if (o.userData && o.userData.rc) return;
      if (ST.D.grp && (o === ST.D.grp || o.parent === ST.D.grp)) return;
      meshes.push(o);
    });
    if (meshes.length) {
      var worldHits = rc.intersectObjects(meshes, true);
      if (worldHits.length) {
        var wp = worldHits[0].point;
        out.x = wp.x;
        out.y = wp.y;
        out.z = wp.z;
        out.mesh = true;
        return out;
      }
    }
  }
  var p = new THREE.Vector3();
  if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
  out.x = p.x;
  out.y = 0;
  out.z = p.z;
  return out;
}

// true = consumed (rc.js must not start a camera orbit)
export function editorPointerDown(e) {
  if (!editorActive()) return false;
  var h = rayHit(e);
  if (!h) return false;
  if (e.button === 2) {
    if (h.idx >= 0) delAnchor(h.idx);
    return true;
  }
  if (e.button !== 0) return false;
  if (h.idx >= 0 && (h.lift || e.altKey)) {
    ST.D.liftDrag = {
      i: h.idx,
      sy: e.clientY,
      y0: fin(ST.D.anchors[h.idx].y)
        ? ST.D.anchors[h.idx].y
        : ST.E.groundAt(ST.D.anchors[h.idx].x, ST.D.anchors[h.idx].z, 4, 2.2),
    };
    ST.D.sel = h.idx;
    ST.D.seg = -1;
    pushHist();
    editorStatus("preview");
    refreshSelection();
    return true;
  }
  if (h.idx >= 0) {
    ST.D.drag = h.idx;
    ST.D.sel = h.idx;
    ST.D.seg = -1;
    ST.D.dragging = true;
    ST.D.ghostPts = ghostLine(ST.D.anchors);
    pushHist();
    editorStatus("preview");
    sync3d();
    refreshSelection();
    draw();
    return true;
  }
  // empty ground / a model: remember it — a still click on mouseup adds a
  // point (or rides the model), a drag orbits the camera as usual
  ST.D.pressed = {
    x: e.clientX,
    y: e.clientY,
    wx: h.x,
    wz: h.z,
    wy: h.y,
    mesh: !!h.mesh,
    shift: e.shiftKey,
  };
  return false;
}

export function editorPointerMove(e) {
  if (!editorActive()) return false;
  if (ST.D.liftDrag) {
    var ld = ST.D.liftDrag;
    var y = clamp(ld.y0 - (e.clientY - ld.sy) * 0.35, 0.7, 160);
    setAnchorHeight(ld.i, y, true);
    return true;
  }
  if (ST.D.drag >= 0) {
    var h = rayHit(e);
    if (h && ST.D.anchors[ST.D.drag]) {
      var old = ST.D.anchors[ST.D.drag],
        sp = applySnap(h.x, h.z, ST.D.drag, e);
      var moved = copyAnchor(old); // keep height, pass-by rule and ride flag
      moved.x = sp.x;
      moved.z = sp.z;
      if (!fin(moved.y) && fin(h.y) && h.y > 2) moved.y = h.y;
      ST.D.anchors[ST.D.drag] = moved;
      ST.D.ghostPts = ghostLine(ST.D.anchors);
      sync3d();
      stats();
      refreshSelection();
      draw();
    }
    return true;
  }
  var hv = rayHit(e);
  var idx = hv ? hv.idx : -1;
  if (idx !== ST.D.hover) {
    ST.D.hover = idx;
    sync3d();
    draw();
  }
  return false;
}

export function editorPointerUp(e, moved) {
  if (!editorActive()) return false;
  if (ST.D.liftDrag) {
    var i = ST.D.liftDrag.i;
    ST.D.liftDrag = null;
    ST.D.dragging = false;
    writeThrough();
    sync3d();
    stats();
    refreshSelection();
    draw();
    scheduleBuild(0);
    return true;
  }
  if (ST.D.drag >= 0) {
    var di = ST.D.drag;
    ST.D.drag = -1;
    ST.D.dragging = false;
    ST.D.anchors[di] = snapFree(
      ST.D.anchors[di].x, ST.D.anchors[di].z, ST.D.anchors[di].y, ST.D.anchors[di],
    );
    ST.D.ghostPts = null;
    writeThrough();
    sync3d();
    stats();
    refreshSelection();
    draw();
    scheduleBuild(0);
    return true;
  }
  var pr = ST.D.pressed;
  ST.D.pressed = null;
  if (pr && (moved || 0) < 6 && Math.abs(e.clientX - pr.x) + Math.abs(e.clientY - pr.y) < 8) {
    // Click a model in 3D: ride over it (or pass by a side). That is the
    // designer — you point at the sofa, you do not drop a floor pin under it.
    if (pr.mesh && !pr.shift) {
      var pick = pickTarget(pr.wx, pr.wz);
      if (pick && pick.tg && pick.tg.kind === "item") {
        if (pick.top && pick.ride) faceApply(pick.tg, "top", { ride: true });
        else faceApply(pick.tg, pick.face);
        return true;
      }
    }
    addAnchor(pr.wx, pr.wz, pr.shift, fin(pr.wy) && pr.wy > 2.5 ? pr.wy : undefined);
    return true;
  }
  return false;
}

export function editorContext(e) {
  if (!editorActive()) return false;
  e.preventDefault();
  return true;
}

// pulse the selected handle so it reads as live
export function editorTick(now) {
  if (!editorActive()) return;
  ST.D.tick = now;
  if (ST.D.sel >= 0 && ST.D.handles[ST.D.sel]) {
    var s = 1 + Math.sin(now * 0.006) * 0.16;
    ST.D.handles[ST.D.sel].scale.set(s, 1, s);
  }
  ST.D.handles.forEach(function (h, i) {
    if (i !== ST.D.sel) h.scale.set(1, 1, 1);
  });
  if (now - ST.D.lastDraw > 90) draw(); // keep the map's car dots moving
}

// ---- DOM --------------------------------------------------------------------

function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function buildDom() {
  var mapHost = document.getElementById("view-2d") || document.body;
  var controlsHost = document.getElementById("right-inspector") || document.body;
  var root = el("section", "panel-section rc-ed rc-ed-panel");
  var mapRoot = el("div", "rc-ed-mapstage");
  root.id = "rcEd";
  mapRoot.id = "rcEdMap";
  mapRoot.innerHTML =
    '<div class="rc-ed-mapstage-head"><span><i></i>' + L("מסלול 2D", "2D TRACK") + '</span>' +
    '<small class="rc-ed-visual-key"><b>●</b><b>═</b><b>↕</b></small></div>' +
    '<div class="rc-ed-map">' +
    '<canvas id="rcEdCv" aria-label="' + L("מפת עריכת המסלול", "Track editing map") + '"></canvas>' +
    '<div class="rc-ed-mapbar">' +
    '<button data-mode="shape" class="active" aria-label="' + L("עיצוב וגרירה", "Shape and drag") + '" title="' + L("גרור נקודה או מקטע", "Drag a point or section") + '">✥</button>' +
    '<button data-mode="draw" aria-label="' + L("הוסף נקודה", "Add point") + '" title="' + L("לחץ על המפה להוספה", "Click the map to add") + '">＋</button>' +
    '<button data-mode="faces" aria-label="' + L("בחר צד מעבר", "Pick a pass-by side") + '" title="' +
    L("לחץ על רהיט/חדר ובחר באיזה צד לעבור ובאיזה כיוון", "Click a model or room: which side to pass on, and which way") + '">⇄</button>' +
    '<button id="rcEdMapReverse" aria-label="' + L("הפוך כיוון", "Reverse direction") + '" title="' + L("הפוך כיוון", "Reverse direction") + '">↻</button>' +
    '<button id="rcEdEye" class="active" aria-label="' + L("מבט על", "Overview camera") + '" title="' + L("מבט על", "Overview camera") + '">👁</button>' +
    '<button id="rcEdFit" aria-label="' + L("התאם למסך", "Fit map") + '" title="' + L("התאם", "Fit") + '">⤢</button>' +
    '<button id="rcEdZin" aria-label="' + L("התקרב", "Zoom in") + '" title="+">＋</button>' +
    '<button id="rcEdZout" aria-label="' + L("התרחק", "Zoom out") + '" title="−">−</button>' +
    '<span id="rcEdScale"></span>' +
    "</div>" +
    '<div class="rc-ed-tip" id="rcEdTip"></div>' +
    "</div>";
  root.innerHTML =
    '<div class="rc-ed-head">' +
    '<div class="rc-ed-title"><span><i></i>' + L("עריכה חיה", "LIVE COURSE") + '</span><strong>🛣️ ' +
    L("עורך מסלול", "Track Editor") + "</strong></div>" +
    '<div class="rc-ed-head-actions"><span class="rc-ed-status ready" id="rcEdStatus" aria-live="polite">' +
    L("מוכן", "Ready") + '</span><button class="rc-ed-x" id="rcEdClose" aria-label="' +
    L("סגור", "Close") + '" title="' + L("סגור", "Close") + '">✕</button></div>' +
    "</div>" +
    '<div class="rc-ed-stats" id="rcEdStats"></div>' +
    '<div class="rc-ed-nav" role="tablist">' +
    '<button class="active" role="tab" aria-selected="true" aria-label="' + t("rc_tab_route") + '" title="' + t("rc_tab_route") + '" data-tab="route">⌁</button>' +
    '<button role="tab" aria-selected="false" aria-label="' + t("rc_tab_style") + '" title="' + t("rc_tab_style") + '" data-tab="style">◐</button>' +
    '<button role="tab" aria-selected="false" aria-label="' + t("rc_tab_physics") + '" title="' + t("rc_tab_physics") + '" data-tab="physics">⚡</button>' +
    '<button role="tab" aria-selected="false" aria-label="' + t("rc_tab_presets") + '" title="' + t("rc_tab_presets") + '" data-tab="tracks">▣</button>' +
    "</div>" +
    '<div class="rc-ed-body">' +
    '<div class="rc-ed-pane active" data-pane="route"></div>' +
    '<div class="rc-ed-pane" data-pane="style"></div>' +
    '<div class="rc-ed-pane" data-pane="physics"></div>' +
    '<div class="rc-ed-pane" data-pane="tracks"></div>' +
    "</div>" +
    '<div class="rc-ed-foot">' +
    '<button id="rcEdUndo" aria-label="' + L("בטל", "Undo") + '" title="Ctrl+Z">↩</button>' +
    '<button id="rcEdRedo" aria-label="' + L("בצע שוב", "Redo") + '" title="Ctrl+Y">↪</button>' +
    '<button id="rcEdDrive" class="rc-primary">🏁 ' + L("סע!", "Drive") + "</button>" +
    "</div>";
  ST.D.showRightPrev = document.body.classList.contains("show-right");
  document.body.classList.add("show-right");
  mapHost.classList.add("rc-editor-map-on");
  controlsHost.classList.add("rc-editor-mode");
  mapHost.appendChild(mapRoot);
  controlsHost.insertBefore(root, controlsHost.firstChild);
  ST.D.root = root;
  ST.D.mapRoot = mapRoot;
  ST.D.mapRoot.dataset.mode = ST.D.mode;
  ST.D.mapHost = mapHost;
  ST.D.controlsHost = controlsHost;
  ST.D.canvas = mapRoot.querySelector("#rcEdCv");
  ST.D.ctx = ST.D.canvas.getContext("2d");
  ST.D.tip = mapRoot.querySelector("#rcEdTip");
  ST.D.statsEl = root.querySelector("#rcEdStats");
  ST.D.statusEl = root.querySelector("#rcEdStatus");
  var host3d = document.getElementById("view-3d");
  if (host3d) {
    var bar = el("div", "rc-ed-3dbar");
    bar.innerHTML =
      '<span>' + L("3D · לחץ על רהיט לנסיעה עליו · גרור ידית · Alt/חרוט=גובה", "3D · click a model to drive on it · drag a handle · Alt/cone=height") + "</span>" +
      '<button type="button" id="rcEdShowMap" title="' + L("מפת 2D", "2D map") + '">🗺️</button>';
    host3d.appendChild(bar);
    ST.D.bar3d = bar;
    bar.querySelector("#rcEdShowMap").onclick = function () {
      if (window.__setViewMode) window.__setViewMode("split");
    };
  }

  paneRoute(root.querySelector('[data-pane="route"]'));
  paneStyle(root.querySelector('[data-pane="style"]'));
  panePhysics(root.querySelector('[data-pane="physics"]'));
  paneTracks(root.querySelector('[data-pane="tracks"]'));

  root.querySelectorAll(".rc-ed-nav button").forEach(function (b) {
    b.onclick = function () {
      ST.D.tab = b.dataset.tab;
      root.querySelectorAll(".rc-ed-nav button").forEach(function (o) {
        o.classList.toggle("active", o === b);
        o.setAttribute("aria-selected", o === b ? "true" : "false");
      });
      root.querySelectorAll(".rc-ed-pane").forEach(function (p) {
        p.classList.toggle("active", p.dataset.pane === ST.D.tab);
      });
      if (ST.D.tab === "tracks") refreshSaved();
    };
  });
  root.querySelector("#rcEdClose").onclick = function () {
    editorClose();
    ST.E.onExit();
  };
  root.querySelector("#rcEdDrive").onclick = function () {
    editorClose();
    ST.E.msg(L("סע! P לתפריט", "Go! P for the menu"), 1600);
  };
  root.querySelector("#rcEdUndo").onclick = undo;
  root.querySelector("#rcEdRedo").onclick = redo;
  mapRoot.querySelectorAll("[data-mode]").forEach(function (b) {
    b.onclick = function () {
      ST.D.mode = b.dataset.mode;
      ST.D.mapRoot.dataset.mode = ST.D.mode;
      mapRoot.querySelectorAll("[data-mode]").forEach(function (o) {
        o.classList.toggle("active", o === b);
      });
      if (ST.D.mode !== "faces") ST.D.faceHover = null;
      tip(
        ST.D.mode === "draw" ? "＋"
        : ST.D.mode === "faces" ? L("⇄ לחץ על רהיט או חדר", "⇄ click furniture or a room")
        : "✥",
      );
      refreshFaces();
      draw();
    };
  });
  mapRoot.querySelector("#rcEdMapReverse").onclick = function () {
    ST.D.sel = ST.D.seg = -1;
    setAnchors(ST.D.anchors.slice().reverse(), { delay: 0 });
  };
  mapRoot.querySelector("#rcEdEye").onclick = function (e) {
    ST.D.overview = !ST.D.overview;
    e.currentTarget.classList.toggle("active", ST.D.overview);
    ST.E.overview(ST.D.overview);
    tip(ST.D.overview ? L("מבט על — גרור לסיבוב", "Overview — drag to orbit") : L("מצלמת רדיפה", "Chase camera"));
  };
  mapRoot.querySelector("#rcEdFit").onclick = function () {
    ST.D.userView = false;
    fitView();
    draw();
  };
  mapRoot.querySelector("#rcEdZin").onclick = function () {
    zoomAt(ST.D.canvas.clientWidth / 2, ST.D.canvas.clientHeight / 2, 1.3);
  };
  mapRoot.querySelector("#rcEdZout").onclick = function () {
    zoomAt(ST.D.canvas.clientWidth / 2, ST.D.canvas.clientHeight / 2, 1 / 1.3);
  };
  tip("✥");
  bindCanvas();
  if (window.ResizeObserver) {
    ST.D.ro = new ResizeObserver(function () {
      resizeCanvas();
      draw();
    });
    ST.D.ro.observe(ST.D.canvas.parentNode);
  }
  resizeCanvas();
  stats();
  refreshSelection();
  refreshFaces();
  refreshFoot();
}

function tip(s) {
  if (ST.D.tip) ST.D.tip.textContent = s;
}

function editorStatus(kind) {
  if (!ST.D || !ST.D.statusEl) return;
  var labels = {
    ready: L("מוכן", "Ready"),
    building: L("בונה…", "Building…"),
    preview: L("תצוגה מקדימה", "Preview"),
    warning: L("לא שלם", "Incomplete"),
  };
  ST.D.statusEl.className = "rc-ed-status " + kind;
  ST.D.statusEl.textContent = labels[kind] || labels.ready;
}

function row(html) {
  return '<div class="rc-ed-row">' + html + "</div>";
}
function slider(id, label, min, max, step, val, unit) {
  return (
    '<div class="rc-ed-sl"><label>' + label +
    ' <b id="' + id + 'V">' + val + (unit || "") + "</b></label>" +
    '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>'
  );
}

function paneRoute(p) {
  p.innerHTML =
    '<div class="rc-ed-selection-empty" id="rcEdSelectionEmpty"><span>●</span><span>═</span><span>↕</span></div>' +
    '<div class="rc-ed-point" id="rcEdPoint" hidden>' +
    '<div class="rc-ed-point-head"><span><i></i><b id="rcEdPointTitle"></b></span><em id="rcEdPointCoord"></em></div>' +
    '<div class="rc-ed-nudge" aria-label="' + L("הזז נקודה", "Nudge point") + '">' +
    '<button data-dx="-5" data-dz="0" title="−X">←</button><button data-dx="5" data-dz="0" title="+X">→</button>' +
    '<button data-dx="0" data-dz="-5" title="−Z">↑</button><button data-dx="0" data-dz="5" title="+Z">↓</button>' +
    '<button id="rcEdPrecise" title="' + L("ערכים מדויקים", "Precise values") + '">⌖</button></div>' +
    '<div class="rc-ed-ph"><input id="rcEdPointH" type="range" min="0.7" max="160" step="1" value="0.7" aria-label="' +
    L("גובה הנקודה", "Point height") + '">' +
    '<button id="rcEdPointHAuto" title="' + L("גובה אוטומטי (רצפה/רהיט)", "Follow the floor") + '">▁</button></div>' +
    '<div class="rc-ed-coords"><label>X <input id="rcEdPointX" type="number" step="0.5"></label>' +
    '<label>Z <input id="rcEdPointZ" type="number" step="0.5"></label></div>' +
    "</div>" +
    '<div class="rc-ed-segment" id="rcEdSegment" hidden>' +
    '<div class="rc-ed-point-head"><span><i></i><b id="rcEdSegTitle">═</b></span><em id="rcEdSegHeight"></em></div>' +
    '<input id="rcEdSegH" type="range" min="0.7" max="160" step="1" value="0.7" aria-label="' + L("גובה מקטע", "Section height") + '">' +
    '<div class="rc-ed-height-presets"><button data-height="0.7" title="' + L("רצפה", "Floor") + '">▁</button>' +
    '<button data-height="40" title="40 cm">▃</button><button data-height="90" title="90 cm">▆</button>' +
    '<button data-height="140" title="140 cm">█</button></div></div>' +
    // Pass-by: the route said as intent — "down this side of the sofa, this way
    // round" — instead of as coordinates.
    '<div class="rc-ed-faces" id="rcEdFaces">' +
    '<div class="rc-ed-point-head"><span><i></i><b id="rcEdFaceTitle">⇄</b></span><em id="rcEdFaceInfo"></em></div>' +
    '<div class="rc-ed-facegrid" id="rcEdFaceGrid">' +
    '<button data-face="0" title="' + faceName(0) + '">▲</button>' +
    '<button data-face="1" title="' + faceName(1) + '">▶</button>' +
    '<button data-face="2" title="' + faceName(2) + '">▼</button>' +
    '<button data-face="3" title="' + faceName(3) + '">◀</button>' +
    '<button data-face="top" title="' + L("סע מעל", "Drive over it") + '">⬆</button>' +
    "</div>" +
    '<div class="rc-ed-facebtns">' +
    '<button id="rcEdFaceSmart" title="' + L("בחר צד מומלץ", "Pick the best side") + '">🪄</button>' +
    '<button id="rcEdFaceFlip" title="' + L("הפוך כיוון נסיעה", "Flip the driving direction") + '">⇄</button>' +
    '<button id="rcEdFaceDel" title="' + L("בטל מעבר", "Remove this pass") + '">✕</button>' +
    "</div>" +
    '<div class="rc-ed-facelist" id="rcEdFaceList"></div>' +
    '<div class="rc-ed-facebtns">' +
    '<button id="rcEdFaceAuto" title="' + L("הצע מעברים לרהיטים הגדולים", "Suggest passes for the big items") + '">🪄 ' + L("אוטומטי", "Auto") + "</button>" +
    '<button id="rcEdFaceRelay" title="' + L("עדכן מעברים למצב הנוכחי", "Re-lay every pass on the current plan") + '">↻</button>' +
    "</div>" +
    "</div>" +
    '<div class="rc-ed-presets">' +
    '<button data-pre="auto" title="' + t("rc_preset_auto") + '">🪄</button>' +
    '<button data-pre="oval" title="' + t("rc_preset_oval") + '">◯</button>' +
    '<button data-pre="fig8" title="' + t("rc_preset_fig8") + '">∞</button></div>' +
    '<div class="rc-ed-route-actions">' +
    '<button id="rcEdStart" title="' + L("קבע התחלה", "Set start") + '">🏁</button>' +
    '<button id="rcEdFix" title="' + L("תקן אוטומטית — הרחק נקודות מקירות", "Auto-fix — pull points clear of walls") + '">🩹</button>' +
    '<button id="rcEdDel" title="' + L("מחק", "Delete") + '">⌫</button>' +
    '<button id="rcEdClear" title="' + L("נקה הכל", "Clear all") + '">✕</button>' +
    '<button id="rcEdSnap" class="' + (ST.D.noSnap ? "" : "active") + '" title="' + L("הצמד למקום פנוי", "Snap clear") + '">🧲</button></div>';
  p.querySelectorAll("[data-pre]").forEach(function (b) {
    b.onclick = function () {
      applyPreset(b.dataset.pre);
    };
  });
  p.querySelectorAll("[data-dx]").forEach(function (b) {
    b.onclick = function () {
      nudgeSelected(parseFloat(b.dataset.dx), parseFloat(b.dataset.dz));
    };
  });
  var px = p.querySelector("#rcEdPointX"),
    pz = p.querySelector("#rcEdPointZ");
  function commitCoords() {
    setSelectedCoords(parseFloat(px.value), parseFloat(pz.value));
  }
  px.onchange = commitCoords;
  pz.onchange = commitCoords;
  px.onkeydown = pz.onkeydown = function (e) {
    if (e.key === "Enter") e.currentTarget.blur();
  };
  p.querySelector("#rcEdPrecise").onclick = function () {
    p.querySelector("#rcEdPoint").classList.toggle("precise");
  };
  var ph = p.querySelector("#rcEdPointH");
  ph.onpointerdown = function () {
    if (!ST.D.heightSliderActive) {
      pushHist();
      ST.D.heightSliderActive = true;
    }
  };
  ph.oninput = function () {
    setAnchorHeight(ST.D.sel, parseFloat(ph.value), true);
  };
  ph.onchange = function () {
    ST.D.dragging = false;
    ST.D.ghostPts = null;
    writeThrough();
    sync3d();
    ST.D.heightSliderActive = false;
    scheduleBuild(0);
  };
  p.querySelector("#rcEdPointHAuto").onclick = function () {
    setAnchorHeight(ST.D.sel, 0, false, true);
  };
  var sh = p.querySelector("#rcEdSegH");
  sh.onpointerdown = function () {
    if (!ST.D.heightSliderActive) {
      pushHist();
      ST.D.heightSliderActive = true;
    }
  };
  sh.oninput = function () {
    setSegmentHeight(ST.D.seg, parseFloat(sh.value), true);
  };
  sh.onchange = function () {
    ST.D.dragging = false;
    ST.D.ghostPts = null;
    writeThrough();
    sync3d();
    ST.D.heightSliderActive = false;
    scheduleBuild(0);
  };
  p.querySelectorAll("[data-height]").forEach(function (b) {
    b.onclick = function () {
      setSegmentHeight(ST.D.seg, parseFloat(b.dataset.height), false);
    };
  });
  p.querySelector("#rcEdStart").onclick = function () {
    var start = ST.D.sel >= 0 ? ST.D.sel : ST.D.seg;
    if (start < 0) return;
    if (start === 0) return;
    var a = ST.D.anchors.slice();
    setAnchors(a.slice(start).concat(a.slice(0, start)), { delay: 0 });
    ST.D.sel = 0;
    ST.D.seg = -1;
    sync3d();
    refreshSelection();
    draw();
  };
  p.querySelector("#rcEdFix").onclick = autoFix;
  p.querySelector("#rcEdDel").onclick = function () {
    if (ST.D.sel >= 0) delAnchor(ST.D.sel);
    else if (ST.D.seg >= 0) {
      var at = (ST.D.seg + 1) % ST.D.anchors.length;
      ST.D.seg = -1;
      delAnchor(at);
    }
  };
  p.querySelector("#rcEdClear").onclick = function () {
    ST.D.sel = ST.D.seg = -1;
    setAnchors([], { delay: 0 });
  };
  p.querySelector("#rcEdSnap").onclick = function (e) {
    ST.D.noSnap = !ST.D.noSnap;
    e.currentTarget.classList.toggle("active", !ST.D.noSnap);
  };
  p.querySelectorAll("#rcEdFaceGrid [data-face]").forEach(function (b) {
    b.onclick = function () {
      var tg = selectedTarget();
      if (!tg) return;
      var top = b.dataset.face === "top";
      var rule = ruleFor(tg.key);
      var face = top ? (rule ? rule.face : Math.max(0, smartFace(tg))) : parseInt(b.dataset.face, 10);
      // pressing the side it already uses is the direction toggle, same as on
      // the map — there is one gesture for "this side", not two
      if (rule && rule.face === face && !!rule.ride === top) faceFlip(tg.key);
      else faceApply(tg, face, { ride: top });
      refreshFaces();
      draw();
    };
  });
  p.querySelector("#rcEdFaceSmart").onclick = function () {
    var tg = selectedTarget();
    if (!tg) return;
    var f = smartFace(tg);
    if (f < 0) return;
    faceApply(tg, f, { ride: ruleFor(tg.key) ? ruleFor(tg.key).ride : false });
    refreshFaces();
    draw();
  };
  p.querySelector("#rcEdFaceFlip").onclick = function () {
    var tg = selectedTarget();
    if (tg) faceFlip(tg.key);
    refreshFaces();
    draw();
  };
  p.querySelector("#rcEdFaceDel").onclick = function () {
    var tg = selectedTarget();
    if (tg) faceRemove(tg.key);
    ST.D.faceSel = null;
    refreshFaces();
    draw();
  };
  p.querySelector("#rcEdFaceAuto").onclick = function () {
    faceAutoAll(3);
    refreshFaces();
    draw();
  };
  p.querySelector("#rcEdFaceRelay").onclick = function () {
    var n = facesRelay();
    ST.E.msg(
      n ? L(n + " מעברים עודכנו ↻", n + " passes re-laid ↻") : L("אין מעברים", "No passes yet"),
      1600,
    );
    refreshFaces();
    draw();
  };
}

// The target the pass-by panel is talking about: whatever was last clicked on
// the map, else the one rule that exists.
function selectedTarget() {
  var rules = faceRules();
  var key = ST.D.faceSel || (rules.length === 1 ? rules[0].key : null);
  return key ? findTarget(key) : null;
}

function refreshFaces() {
  if (!ST.D || !ST.D.root) return;
  var host = ST.D.root.querySelector("#rcEdFaces");
  if (!host) return;
  var rules = faceRules(),
    tg = selectedTarget(),
    rule = tg ? ruleFor(tg.key) : null;
  host.classList.toggle("live", ST.D.mode === "faces" || !!rules.length);
  host.querySelector("#rcEdFaceTitle").textContent = tg
    ? (rule ? (rule.ride ? "⬆ " : FACE_GLYPH[rule.face] + " ") : "⇄ ") + tg.name
    : L("⇄ מעברים", "⇄ Pass-by");
  host.querySelector("#rcEdFaceInfo").textContent = tg
    ? rule
      ? (rule.ride ? L("נוסע מעל", "driving over") : faceName(rule.face)) + (rule.flip ? " ⇄" : " →")
      : L("בחר צד", "pick a side")
    : rules.length
      ? rules.length + L(" מעברים", " passes")
      : L("לחץ ⇄ במפה", "press ⇄ on the map");
  var ride = tg ? targetRide(tg) : null;
  var smart = tg ? smartFace(tg) : -1;
  host.querySelectorAll("#rcEdFaceGrid [data-face]").forEach(function (b) {
    var top = b.dataset.face === "top";
    var f = top ? -1 : parseInt(b.dataset.face, 10);
    b.disabled = !tg || (top && !ride);
    b.classList.toggle("active", !!rule && (top ? !!rule.ride : !rule.ride && rule.face === f));
    b.classList.toggle("smart", !top && f === smart && !rule);
    if (top) b.title = ride ? L("סע מעל", "Drive over it") : L("אי אפשר לנסוע מעל זה", "Nothing to drive on up there");
  });
  ["#rcEdFaceFlip", "#rcEdFaceDel"].forEach(function (sel) {
    host.querySelector(sel).disabled = !rule;
  });
  host.querySelector("#rcEdFaceSmart").disabled = !tg;
  var list = host.querySelector("#rcEdFaceList");
  list.innerHTML = rules.length
    ? rules
        .map(function (r) {
          return (
            '<div class="rc-ed-faceitem' + (ST.D.faceSel === r.key ? " on" : "") + '" data-key="' +
            encodeURIComponent(r.key) + '"><b>' + (r.ride ? "⬆" : FACE_GLYPH[r.face]) + "</b><span>" +
            r.name + "</span><em>" + (r.flip ? "⇄" : "→") + "</em>" +
            '<button data-flip="' + encodeURIComponent(r.key) + '" title="' + L("היפוך", "Flip") + '">⇄</button>' +
            '<button data-drop="' + encodeURIComponent(r.key) + '" title="' + L("מחק", "Remove") + '">✕</button></div>'
          );
        })
        .join("")
    : "";
  list.querySelectorAll("[data-key]").forEach(function (row) {
    row.onclick = function (e) {
      if (e.target.dataset.flip || e.target.dataset.drop) return;
      faceGoto(decodeURIComponent(row.dataset.key));
    };
  });
  list.querySelectorAll("[data-flip]").forEach(function (b) {
    b.onclick = function () {
      faceFlip(decodeURIComponent(b.dataset.flip));
      refreshFaces();
      draw();
    };
  });
  list.querySelectorAll("[data-drop]").forEach(function (b) {
    b.onclick = function () {
      faceRemove(decodeURIComponent(b.dataset.drop));
      refreshFaces();
      draw();
    };
  });
}

function paneStyle(p) {
  var cfg = ST.E.cfg;
  p.innerHTML =
    slider("rcEdW", t("rc_road_width"), 16, 44, 1, cfg.roadWidth || 26, " cm") +
    slider("rcEdH", t("rc_flyover_h"), 40, 160, 1, cfg.highElevation || 105, " cm") +
    row(
      '<button id="rcEdJump" class="' + (cfg.hasJump !== false ? "active" : "") + '">🛫 ' +
      t("rc_ramp_jump") + "</button>",
    ) +
    '<div class="rc-ed-themes">' +
    THEMES.map(function (k) {
      return (
        '<div class="rc-ed-theme' + (cfg.roadTheme === k ? " active" : "") + '" data-theme="' + k + '">' +
        '<i style="background:' + THEME_COL[k] + '"></i><span>' + t("rc_theme_" + k) + "</span></div>"
      );
    }).join("") +
    "</div>";
  var w = p.querySelector("#rcEdW"),
    h = p.querySelector("#rcEdH");
  w.oninput = function () {
    cfg.roadWidth = parseInt(w.value, 10);
    p.querySelector("#rcEdWV").textContent = cfg.roadWidth + " cm";
    ST.E.save();
    draw();
    scheduleBuild(220);
  };
  h.oninput = function () {
    cfg.highElevation = parseInt(h.value, 10);
    p.querySelector("#rcEdHV").textContent = cfg.highElevation + " cm";
    ST.E.save();
    scheduleBuild(220);
  };
  p.querySelector("#rcEdJump").onclick = function (e) {
    cfg.hasJump = cfg.hasJump === false;
    e.currentTarget.classList.toggle("active", cfg.hasJump !== false);
    ST.E.save();
    scheduleBuild(0);
  };
  p.querySelectorAll(".rc-ed-theme").forEach(function (c) {
    c.onclick = function () {
      cfg.roadTheme = c.dataset.theme;
      p.querySelectorAll(".rc-ed-theme").forEach(function (o) {
        o.classList.toggle("active", o === c);
      });
      ST.E.save();
      draw();
      scheduleBuild(0);
    };
  });
}

function panePhysics(p) {
  var cfg = ST.E.cfg;
  var pc = cfg.physConfig || (cfg.physConfig = { MAXV: 78, ACC: 88, TURN_MAX: 3.35, GRAV: 600 });
  p.innerHTML =
    row(
      Object.keys(PHYS_PRESETS)
        .map(function (k) {
          return '<button data-phys="' + k + '">' + t("rc_preset_" + (k === "offroad" ? "offroad" : k)) + "</button>";
        })
        .join(""),
    ) +
    slider("rcEdSpd", t("rc_phys_speed"), 45, 140, 1, pc.MAXV, "") +
    slider("rcEdAcc", t("rc_phys_accel"), 40, 180, 1, pc.ACC, "") +
    slider("rcEdTrn", t("rc_phys_turn"), 1.8, 5.5, 0.1, pc.TURN_MAX, "") +
    slider("rcEdGrv", t("rc_phys_grav"), 200, 1200, 10, pc.GRAV, "");
  function push() {
    cfg.physConfig = pc;
    ST.E.applyPhysics();
    ST.E.save();
  }
  function bind(id, key, int) {
    var s = p.querySelector("#" + id),
      v = p.querySelector("#" + id + "V");
    s.oninput = function () {
      pc[key] = int ? parseInt(s.value, 10) : parseFloat(s.value);
      v.textContent = int ? pc[key] : pc[key].toFixed(1);
      push();
    };
    return function () {
      s.value = pc[key];
      v.textContent = int ? pc[key] : Number(pc[key]).toFixed(1);
    };
  }
  var sync = [
    bind("rcEdSpd", "MAXV", true),
    bind("rcEdAcc", "ACC", true),
    bind("rcEdTrn", "TURN_MAX", false),
    bind("rcEdGrv", "GRAV", true),
  ];
  p.querySelectorAll("[data-phys]").forEach(function (b) {
    b.onclick = function () {
      var src = PHYS_PRESETS[b.dataset.phys];
      for (var k in src) pc[k] = src[k];
      sync.forEach(function (f) {
        f();
      });
      push();
      ST.E.beep(600, 0.06, 0.2);
    };
  });
}

function paneTracks(p) {
  p.innerHTML =
    row(
      '<input type="text" id="rcEdName" placeholder="' + L("שם המסלול…", "Track name…") + '">' +
      '<button id="rcEdSave" class="rc-primary">💾 ' + L("שמור", "Save") + "</button>",
    ) +
    '<div class="rc-ed-saved" id="rcEdSaved"></div>' +
    '<textarea id="rcEdJson" spellcheck="false"></textarea>' +
    row(
      '<button id="rcEdCopy">📋 ' + t("rc_export_json") + "</button>" +
      '<button id="rcEdPaste">📥 ' + t("rc_import_json") + "</button>",
    );
  p.querySelector("#rcEdSave").onclick = function () {
    var nm = p.querySelector("#rcEdName").value.trim();
    if (!nm) {
      tip(L("צריך שם", "Name it first"));
      return;
    }
    var all = savedAll();
    all[nm] = snapshot();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(all));
    } catch (err) {}
    p.querySelector("#rcEdName").value = "";
    refreshSaved();
    ST.E.msg(L("המסלול נשמר 💾", "Track saved 💾"), 1500);
  };
  p.querySelector("#rcEdCopy").onclick = function () {
    var ta = p.querySelector("#rcEdJson");
    ta.value = JSON.stringify(snapshot());
    ta.select();
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value);
    ST.E.msg(L("הועתק ללוח 📋", "Copied to clipboard 📋"), 1500);
  };
  p.querySelector("#rcEdPaste").onclick = function () {
    try {
      loadSnapshot(JSON.parse(p.querySelector("#rcEdJson").value));
      ST.E.msg(L("מסלול יובא 📥", "Track imported 📥"), 1500);
    } catch (err) {
      tip(L("JSON לא תקין", "Invalid JSON"));
    }
  };
}

function savedAll() {
  try {
    var o = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

function snapshot() {
  var cfg = ST.E.cfg;
  return {
    anchors: ST.D.anchors.map(function (a) {
      var out = { x: Math.round(a.x), z: Math.round(a.z) };
      if (fin(a.y)) out.y = Math.round(a.y);
      // a saved track keeps its pass-by rules, and a rule is nothing without
      // the points that carry its id
      if (a.f) out.f = a.f;
      if (a.ride) out.ride = true;
      return out;
    }),
    roadWidth: cfg.roadWidth,
    highElevation: cfg.highElevation,
    roadTheme: cfg.roadTheme,
    hasJump: cfg.hasJump,
    physConfig: cfg.physConfig,
    faces: faceRules().map(function (r) {
      return { id: r.id, key: r.key, kind: r.kind, name: r.name, face: r.face, ride: !!r.ride, flip: !!r.flip };
    }),
    sig: ST.E.planSig(), // the flat this lap was drawn for
  };
}

function loadSnapshot(s) {
  if (!s || !Array.isArray(s.anchors)) throw new Error("bad");
  var cfg = ST.E.cfg;
  if (fin(s.roadWidth)) cfg.roadWidth = s.roadWidth;
  if (fin(s.highElevation)) cfg.highElevation = s.highElevation;
  if (s.roadTheme) cfg.roadTheme = s.roadTheme;
  if (s.hasJump != null) cfg.hasJump = !!s.hasJump;
  if (s.physConfig) {
    cfg.physConfig = Object.assign({}, cfg.physConfig, s.physConfig);
    ST.E.applyPhysics();
  }
  ST.D.sel = ST.D.seg = -1;
  setAnchors(
    s.anchors
      .filter(function (a) {
        return fin(a.x) && fin(a.z);
      })
      .map(function (a) {
        return copyAnchor(a);
      }),
    { delay: 0 },
  );
  facesAdopt(s.faces); // the rules whose points came back with the track
  writeThrough();
  refreshFaces();
  // the style/physics panes hold their own inputs — rebuild them from the cfg
  paneStyle(ST.D.root.querySelector('[data-pane="style"]'));
  panePhysics(ST.D.root.querySelector('[data-pane="physics"]'));
  fitView();
}

function refreshSaved() {
  var host = ST.D.root.querySelector("#rcEdSaved");
  if (!host) return;
  var all = savedAll(),
    keys = Object.keys(all);
  if (!keys.length) {
    host.innerHTML = '<div class="rc-ed-note">' + L("אין מסלולים שמורים", "No saved tracks yet") + "</div>";
    return;
  }
  var sig = ST.E.planSig();
  host.innerHTML = keys
    .map(function (k) {
      var n = (all[k].anchors || []).length;
      var mine = all[k].sig === sig;
      return (
        '<div class="rc-ed-saveitem' + (mine ? "" : " foreign") + '"><span title="' + k + '">' +
        (mine ? "" : "⚠ ") + k + "</span>" +
        "<em>" + n + (mine ? "" : " · " + L("דירה אחרת", "other flat")) + "</em>" +
        '<button data-load="' + encodeURIComponent(k) + '">▶</button>' +
        '<button data-del="' + encodeURIComponent(k) + '">✕</button></div>'
      );
    })
    .join("");
  host.querySelectorAll("[data-load]").forEach(function (b) {
    b.onclick = function () {
      try {
        var snap = all[decodeURIComponent(b.dataset.load)];
        loadSnapshot(snap);
        ST.E.msg(
          snap.sig === sig
            ? L("מסלול נטען", "Track loaded")
            : L("מסלול מדירה אחרת — יתכן שיצא מהקירות", "Track from another flat — it may not fit"),
          snap.sig === sig ? 1400 : 2600,
        );
      } catch (e) {}
    };
  });
  host.querySelectorAll("[data-del]").forEach(function (b) {
    b.onclick = function () {
      delete all[decodeURIComponent(b.dataset.del)];
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(all));
      } catch (e) {}
      refreshSaved();
    };
  });
}

function refreshFoot() {
  if (!ST.D.root) return;
  var u = ST.D.root.querySelector("#rcEdUndo"),
    r = ST.D.root.querySelector("#rcEdRedo");
  if (u) u.disabled = !ST.D.hist.length;
  if (r) r.disabled = !ST.D.redo.length;
}

function refreshSelection() {
  if (!ST.D || !ST.D.root) return;
  var host = ST.D.root.querySelector("#rcEdPoint"),
    segHost = ST.D.root.querySelector("#rcEdSegment"),
    empty = ST.D.root.querySelector("#rcEdSelectionEmpty");
  if (!host || !segHost) return;
  var a = ST.D.sel >= 0 ? ST.D.anchors[ST.D.sel] : null;
  var hasSeg = ST.D.seg >= 0 && !!ST.D.anchors[ST.D.seg];
  host.hidden = !a;
  segHost.hidden = !hasSeg;
  if (empty) empty.hidden = !!a || hasSeg;
  var del = ST.D.root.querySelector("#rcEdDel"),
    start = ST.D.root.querySelector("#rcEdStart");
  if (del) del.disabled = !a && !hasSeg;
  if (start) start.disabled = !a && !hasSeg;
  if (a) {
    var bad = ST.D.issues && ST.D.issues.pts[ST.D.sel];
    host.classList.toggle("bad", !!bad);
    host.querySelector("#rcEdPointTitle").textContent =
      (bad ? (bad.sev > 1 ? "⚠ " : "△ ") : "") + (ST.D.sel === 0 ? "🏁" : "● " + (ST.D.sel + 1));
    host.querySelector("#rcEdPointCoord").textContent =
      bad ? bad.msg : Math.round(a.x) + ", " + Math.round(a.z) + (fin(a.y) ? " · ↕" + Math.round(a.y) : "");
    var hs = host.querySelector("#rcEdPointH");
    if (hs && document.activeElement !== hs) hs.value = anchorY(a);
    if (hs) hs.classList.toggle("auto", !fin(a.y));
    var x = host.querySelector("#rcEdPointX"),
      z = host.querySelector("#rcEdPointZ");
    if (document.activeElement !== x) x.value = (Math.round(a.x * 10) / 10).toFixed(1);
    if (document.activeElement !== z) z.value = (Math.round(a.z * 10) / 10).toFixed(1);
  }
  if (hasSeg) {
    var sy = segmentY(ST.D.seg);
    var sbad = ST.D.issues && ST.D.issues.segs[ST.D.seg];
    segHost.classList.toggle("bad", !!sbad);
    segHost.querySelector("#rcEdSegTitle").textContent =
      (sbad ? (sbad.sev > 1 ? "⚠ " : "△ ") : "") + "═ " + (ST.D.seg + 1);
    segHost.querySelector("#rcEdSegHeight").textContent = sbad ? sbad.msg : "↕ " + Math.round(sy) + " cm";
    var range = segHost.querySelector("#rcEdSegH");
    if (document.activeElement !== range) range.value = sy;
  }
}

function stats() {
  if (!ST.D.statsEl) return;
  var tr = ST.E.track();
  var len = ST.D.dragging && ST.D.ghostPts
    ? pathLen(ST.D.ghostPts)
    : tr && tr.center ? pathLen(tr.center) : pathLen(ghostLine(ST.D.anchors));
  var lap = len / Math.max(20, (ST.E.cfg.physConfig && ST.E.cfg.physConfig.MAXV) || 78) / 0.62;
  var f = (tr && tr.feats) || {};
  var chips = [];
  if (f.spiral) chips.push('<i class="ok">🌀 ' + (f.spiralTurns || 1) + "×</i>");
  if (f.jump) chips.push('<i class="ok">🛫</i>');
  // home mode: how much of the lap is driven on the furniture itself
  if (f.rides) chips.push('<i class="ok">🛋 ' + f.rides + "</i>");
  if (f.bridges) chips.push("<i>🌉 " + f.bridges + "</i>");
  var passes = faceRules().length;
  if (passes) chips.push('<i class="ok">⇄ ' + passes + "</i>");
  if (tr && tr.high) chips.push("<i>⬆ " + Math.round(tr.high) + "cm</i>");
  // Problems are the headline number: a route that clips a wall builds into a
  // road you can't drive, and until now nothing said so until you crashed.
  var list = (ST.D.issues && ST.D.issues.list) || [];
  var hard = list.filter(function (q) {
    return q.sev > 1;
  }).length;
  ST.D.statsEl.innerHTML =
    '<span class="rc-ed-stat"><b>● ' + ST.D.anchors.length + "</b></span>" +
    '<span class="rc-ed-stat"><b>↔ ' + (len / 100).toFixed(1) + " m</b></span>" +
    '<span class="rc-ed-stat"><b>◷ ' + lap.toFixed(1) + " s</b></span>" +
    (ST.D.anchors.length < 3
      ? '<span class="rc-ed-stat warn"><b>⚠ ' + L("3 נק׳", "3 pts") + "</b></span>"
      : list.length
        ? '<button class="rc-ed-stat rc-ed-issue' + (hard ? " bad" : "") + '" id="rcEdIssues" title="' +
          L("עבור לבעיה הבאה", "Go to the next problem") + '"><b>⚠ ' + list.length + "</b></button>"
        : '<span class="rc-ed-stat ok"><b>✔</b></span>') +
    (chips.length ? ' <span class="rc-ed-chips">' + chips.join("") + "</span>" : "");
  var ib = ST.D.statsEl.querySelector("#rcEdIssues");
  if (ib) ib.onclick = gotoIssue;
}

// ---- keyboard ---------------------------------------------------------------

function onKey(e) {
  if (!editorActive()) return;
  var tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  var k = e.key;
  if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (k === "y" || k === "Y")) {
    e.preventDefault();
    e.stopPropagation();
    redo();
    return;
  }
  if (k === "Delete" || k === "Backspace") {
    if (ST.D.sel >= 0) {
      e.preventDefault();
      e.stopPropagation();
      delAnchor(ST.D.sel);
    }
    return;
  }
  if (ST.D.sel >= 0 && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown")) {
    e.preventDefault();
    e.stopPropagation();
    var step = e.shiftKey ? 10 : 2;
    nudgeSelected(k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0);
    return;
  }
  // Escape is owned by rc.js's handler (it closes the editor for us)
}

function bindKeys() {
  ST.D.keyH = onKey;
  window.addEventListener("keydown", ST.D.keyH, true);
}
function unbindKeys() {
  if (ST.D && ST.D.keyH) window.removeEventListener("keydown", ST.D.keyH, true);
}

// ---- 2D map -----------------------------------------------------------------

