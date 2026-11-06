/* The 3D view's window cloth, see-through fades, warm fade pipelines, dollhouse
   cutaway and framing, split out of js/view3d.js. It shares the editor's state
   through live imports from ../view3d.js. */
import { ceilingHeight } from "../elevation.js";
import { contentBounds, roomByKey, wallById, wallGeom } from "../geometry.js";
import { spawnHangingCloth } from "../physics_facade.js";
import { S, clamp } from "../state.js";
import { THREE } from "../three_lazy.js";
import { ghostSwap } from "../view3d/items_layers.js";
import { cutH, makeShadowOnly, shadowCopy } from "../view3d/site_cutaway.js";
import { buildWall } from "../view3d/wall_build.js";
import { nearSideWall } from "../wall_cut.js";
import { wallThickness } from "../wall_types.js";
import { FADE_LEVEL, STUB_HEIGHT, cutStyle, nearCutOn } from "../wall_view.js";
import {
  DEFr, SEE_FADE_MS, camera, dyn, extTick, framedInterior, navFwd, navHit,
  navPlane, navRay, navRight, navUp, overviewRadiusLimit, phi, plannerCompact,
  radius, ready3D, renderer, scene, seeAimV, seeFading, seeHeld, seeStubs,
  set_framedInterior, set_navFwd, set_navHit, set_navPlane, set_navRay,
  set_navRight, set_navUp, set_needsRender, set_overviewRadiusLimit, set_phi,
  set_radius, set_seeAimV, set_structureRoot, set_stubBuildH, set_tgtTween,
  set_theta, set_userMoved, set_warmGeo, set_warmQueued, set_warmRoot,
  shadowRoot, shadowStandIns, structureRoot, stubRoot, sun, tgt, theta, walk,
  wallBuildArgs, warmGeo, warmKeys, warmQueued, warmRoot,
} from "../view3d.js";

function hangWindowCloth(container) {
  if (!container || !S.openings || !S.openings.length) return;
  var o = S.openings.find(function (op) { return op.type === "window"; });
  if (!o) return;
  var w = wallById(o.wall);
  if (!w) return;
  var gm = wallGeom(w);
  if (!gm || !(gm.L > 1)) return;
  var s = clamp(o.s, (o.width || 80) / 2, gm.L - (o.width || 80) / 2);
  var nx = -gm.uz, nz = gm.ux;
  var thick = (w.thickness || 12) / 2 + 4;
  spawnHangingCloth(container, {
    x: gm.a.x + gm.ux * s + nx * thick,
    y: (o.sill || 90) + (o.height || 120) - 4,
    z: gm.a.z + gm.uz * s + nz * thick,
    width: Math.min(o.width || 80, 90) - 8,
    height: Math.max(70, (o.height || 120) - 10),
    nx: nx,
    nz: nz,
  });
}

function cP() {
  set_phi(Math.max(0.12, Math.min(Math.PI / 2, phi)));
}

function cR() {
  set_radius(Math.max(180, Math.min(overviewRadiusLimit, radius)));
}
function upd() {
  if (extTick) return; // an external mode (RC race) owns the camera
  if (!isFinite(radius) || !isFinite(theta) || !isFinite(phi)) {
    set_radius(DEFr);
    set_theta(0.92);
    set_phi(0.95);
  }
  if (!isFinite(tgt.x) || !isFinite(tgt.y) || !isFinite(tgt.z))
    tgt.set(200, 70, 150);
  var sp = Math.sin(phi);
  camera.position.set(
    tgt.x + radius * sp * Math.cos(theta),
    tgt.y + radius * Math.cos(phi),
    tgt.z + radius * sp * Math.sin(theta),
  );
  camera.lookAt(tgt);
  updateSeeThrough();
  set_needsRender(true);
}

/* Walls that stand between the camera and what it is looking at are the whole
   reason a piece "can only be dragged from certain angles": you cannot aim at
   what you cannot see. While the Walls switch (js/wall_view.js) is on Cutaway,
   the near side of the house steps out of the way in 3D edit mode (which walls
   count is nearSideWall() in js/wall_cut.js).

   - What it opens towards is the selected room or piece when one is on screen,
     else the orbit target: the cut follows what you are working on, not where
     the last pan happened to leave the camera's pivot.
   - The selected wall (or the wall of a selected door or window) never steps
     away: you cannot edit a wall that vanishes when you pick it.
   - A cut wall becomes a knee-high stub, a faint ghost, or nothing, by the
     user's choice (cutStyle), and walls fade over SEE_FADE_MS rather than pop.

   No rebuild is triggered, so this is safe to run on every camera move. */
function updateSeeThrough(instant) {
  if (!dyn || !camera || !tgt) return;
  // the dollhouse cut already opens every room; hiding whole walls on top of
  // it would take their caps away too
  var on = ((!!S.edit3D && nearCutOn()) || framedInterior) && !walk && !extTick && !isFinite(cutH());
  var changed = false;
  /* Wall groups are children of structureRoot, not of `dyn` — a one-level scan
     aimed at `dyn` would match nothing at all and the dollhouse cut would
     silently stop happening, which is the same trap the humans pass fell into
     when furniture moved under itemsRoot (see updateHumans). */
  if (!structureRoot) return;
  var cam = camera.position, aim = on ? seeAim() : tgt, keep = on ? keptWalls() : null;
  structureRoot.children.forEach(function (g) {
    var w = g.userData && g.userData.wall;
    if (!w) return;
    /* A floor switch replaces S.nodes/S.walls before rebuild3D replaces dyn.
       Compact mode can frame the interior during that one-frame handoff, so a
       stale mesh must not resolve its old node indices against the new floor.
       The live wall objects are authoritative; the old group disappears on
       the rebuild immediately afterwards. */
    if (S.walls.indexOf(w) < 0) return;
    var was = !!g.userData.seeThrough, cut = false;
    if (on && keep.indexOf(w) < 0) {
      var gm = wallGeom(w);
      if (!gm || gm.L < 1) return;
      cut = nearSideWall({ ax: gm.a.x, az: gm.a.z, ux: gm.ux, uz: gm.uz, L: gm.L, half: wallThickness(w, S) / 2 }, cam, aim, was);
    }
    if (cut === was && !seeOutOfStep(g, cut)) return;
    setSeeThrough(g, cut, instant);
    changed = true;
  });
  /* Visibility is a render input just like camera position. toggleEdit3D()
     calls this directly, outside upd(), so without this wake-up the cutaway
     did not appear until the next orbit or Frame action. */
  if (changed) set_needsRender(true);
}

// How far a cut wall fades: a faint ghost in the "fade" style, out otherwise.
function seeRest(cut) {
  return !cut ? 1 : cutStyle() === "fade" ? FADE_LEVEL : 0;
}
/* Does this wall's picture disagree with its state? True after the cut style
   changed, or when something else touched its visibility: a wall is re-synced
   then, not only when its cut state flips. A wall still moving is in step as
   long as it is moving towards the right place. */
function seeOutOfStep(g, cut) {
  var rest = seeRest(cut), f = g.userData.seeFade;
  if (f) return f.to !== rest;
  var stub = seeStubs.get(g);
  if ((cut && cutStyle() === "stub") !== !!(stub && stub.visible)) return true;
  return rest === 1 ? !g.visible : rest === 0 ? g.visible : true;
}

function setSeeThrough(g, cut, instant) {
  g.userData.seeThrough = cut;
  // the wall stepped out of the view, not out of the sunlight
  var standIn = shadowStandIns.get(g);
  if (cut && !standIn && shadowRoot) {
    standIn = makeShadowOnly(shadowCopy(g));
    shadowStandIns.set(g, standIn);
    shadowRoot.add(standIn);
  }
  if (standIn) standIn.visible = cut;
  // a wall coming back loses its stub at once; one going away gets it when it
  // lands (endSeeFade), so the two never stand in the same place
  if (!cut && seeStubs.has(g)) seeStubs.get(g).visible = false;
  fadeWall(g, seeRest(cut), instant);
  if (!g.userData.seeFade) syncStub(g);
}

function syncStub(g) {
  var want = !!g.userData.seeThrough && cutStyle() === "stub";
  var stub = want ? stubFor(g) : seeStubs.get(g);
  if (stub) stub.visible = want;
}

/* The walls the cut leaves alone whatever the camera does: the one being
   edited. A selected door or window keeps its wall for the same reason. */
function keptWalls() {
  var sel = S.sel, out = [];
  if (!sel) return out;
  if (sel.kind === "wall" && sel.ref) out.push(sel.ref);
  else if (sel.kind === "walls" && sel.refs) out = sel.refs.slice();
  else if (sel.kind === "opening" && sel.ref) {
    var w = wallById(sel.ref.wall);
    if (w) out.push(w);
  }
  return out;
}

function seeAim() {
  var p = selectionAim();
  if (!p) return tgt;
  if (!seeAimV) set_seeAimV(new THREE.Vector3());
  seeAimV.set(p.x, tgt.y, p.z).project(camera);
  if (seeAimV.z > 1 || Math.abs(seeAimV.x) > 1 || Math.abs(seeAimV.y) > 1) return tgt;
  return { x: p.x, y: tgt.y, z: p.z };
}
function selectionAim() {
  var sel = S.sel;
  if (!sel) return null;
  var pts = null;
  if (sel.kind === "room") {
    var room = roomByKey(sel.ref);
    pts = room && room.nidx && room.nidx.map(function (i) { return S.nodes[i]; });
  } else if (sel.kind === "item" && sel.ref) pts = [sel.ref];
  else if (sel.kind === "items" && sel.refs) pts = sel.refs;
  pts = (pts || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.z); });
  if (!pts.length) return null;
  var x = 0, z = 0;
  pts.forEach(function (p) { x += p.x; z += p.z; });
  return { x: x / pts.length, z: z / pts.length };
}

function stubFor(g) {
  if (seeStubs.has(g)) return seeStubs.get(g);
  var w = g.userData.wall;
  if (!stubRoot || !w) return null;
  var keepRoot = structureRoot, doorCount = scene.doors ? scene.doors.length : 0;
  var tmp = new THREE.Group(), args = wallBuildArgs[w.id] || [S.wallColor, w.tex];
  set_structureRoot(tmp);
  set_stubBuildH(STUB_HEIGHT);
  try {
    buildWall(w, args[0], args[1]);
  } finally {
    set_stubBuildH(0);
    set_structureRoot(keepRoot);
    if (scene.doors) scene.doors.length = doorCount;
  }
  var stub = new THREE.Group();
  tmp.children.slice().forEach(function (c) { stub.add(c); });
  stub.traverse(function (o) {
    o.userData = {};
  });
  stub.visible = false;
  // built after the structure layer was ghosted: ghost it too, as the rest are
  if (structureRoot.userData.ghostHeld) ghostSwap(stub, true);
  stubRoot.add(stub);
  seeStubs.set(g, stub);
  return stub;
}

function fadeWall(g, to, instant) {
  var f = g.userData.seeFade;
  var from = f ? f.k : g.visible ? 1 : 0;
  if (!f && from === to) return;
  var mode = (to > 0 && to < 1) || (from > 0 && from < 1 && !f) || cutStyle() === "fade" ? "alpha" : "sink";
  if (f && f.mode !== mode) {
    // the style changed mid-way: land where this one was going, then move anew
    endSeeFade(g);
    f = null;
    from = g.visible ? 1 : 0;
    if (from === to) return;
  }
  if (instant || !renderer || !renderer.initialized) {
    // a brand-new wall takes its predecessor's state as it is, and nothing
    // drawn yet has a movement to watch
    if (f) {
      f.to = to > 0 ? 1 : 0;
      endSeeFade(g);
    }
    if (to === 0 || to === 1) {
      g.visible = to > 0;
      return;
    }
    f = holdSeeFade(g, to, "alpha");
    seeFading.delete(g);
    g.visible = true;
    paintSeeFade(g);
    return;
  }
  if (!f) f = holdSeeFade(g, from, mode);
  f.to = to;
  g.visible = true;
  seeFading.add(g);
  paintSeeFade(g);
}
function holdSeeFade(g, k, mode) {
  var w = g.userData.wall,
    H = (w && Number(w.height)) || 250;
  var f = (g.userData.seeFade = {
    k: k,
    to: k,
    mode: mode,
    y0: g.position.y,
    drop: Math.max(0, H - (cutStyle() === "stub" ? STUB_HEIGHT : 0)),
  });
  if (mode === "alpha") seeMaterials(g, true);
  seeHeld.add(g);
  return f;
}
function seeMaterials(g, on) {
  g.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    if (on) {
      if (o.userData.seeBase) return;
      o.userData.seeBase = o.material;
      var fades = [].concat(o.material).map(function (m) {
        var c = m.clone();
        c.userData.seeOpacity = c.transparent ? c.opacity : 1;
        c.transparent = true;
        c.depthWrite = false; // a fading wall must not hide what it is uncovering
        return c;
      });
      o.material = Array.isArray(o.userData.seeBase) ? fades : fades[0];
    } else {
      if (!o.userData.seeBase) return;
      [].concat(o.material).forEach(function (m) {
        m.dispose();
      });
      o.material = o.userData.seeBase;
      delete o.userData.seeBase;
    }
  });
}
function paintSeeFade(g) {
  var f = g.userData.seeFade,
    k = f.k,
    e = k * k * (3 - 2 * k); // smoothstep: no visible kink at either end
  if (f.mode === "sink") {
    g.position.y = f.y0 - (1 - e) * f.drop;
    return;
  }
  g.traverse(function (o) {
    if (!o.userData.seeBase) return;
    [].concat(o.material).forEach(function (m) {
      m.opacity = m.userData.seeOpacity * e;
    });
  });
}
function endSeeFade(g) {
  var f = g.userData.seeFade;
  seeFading.delete(g);
  seeHeld.delete(g);
  if (!f) return;
  if (f.mode === "alpha") seeMaterials(g, false);
  else g.position.y = f.y0;
  delete g.userData.seeFade;
  g.visible = f.to > 0;
  syncStub(g);
}
// Advance every running movement by one frame; true while any is still running.
function stepSeeFades(delta) {
  var step = delta / SEE_FADE_MS;
  Array.from(seeFading).forEach(function (g) {
    var f = g.userData.seeFade;
    if (!f) return void seeFading.delete(g);
    f.k = f.to > f.k ? Math.min(f.to, f.k + step) : Math.max(f.to, f.k - step);
    if (f.k !== f.to) paintSeeFade(g);
    else if (f.to === 0 || f.to === 1) endSeeFade(g);
    else {
      paintSeeFade(g);
      seeFading.delete(g); // resting faded: clones stay, frames stop
    }
  });
  return seeFading.size > 0;
}
/* Land every wall mid-way or resting faded: before the layer ghost swaps the
   same materials, and before a rebuild disposes them. A resting faded wall
   comes back shown; updateSeeThrough(true) puts it back afterwards. */
function settleSeeFades() {
  Array.from(seeHeld).forEach(function (g) {
    var f = g.userData.seeFade;
    if (f) f.to = f.to > 0 ? 1 : 0;
    endSeeFade(g);
  });
}

function warmKey(m) {
  return [m.type, m.side, m.vertexColors ? 1 : 0]
    .concat(["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap"].map(function (k) {
      return m[k] ? 1 : 0;
    }))
    .join("|");
}
function warmFadePipelines() {
  if (warmQueued || cutStyle() !== "fade" || !renderer || !renderer.compileAsync || !structureRoot || !scene || !camera) return;
  set_warmQueued(true);
  var run = function () {
    set_warmQueued(false);
    if (!structureRoot || !scene) return;
    if (!warmRoot) {
      set_warmRoot(new THREE.Group());
      warmRoot.name = "fade pipeline warm-up";
      warmRoot.userData.physicsRole = "ignore";
      warmRoot.userData.exportSkip = true;
      set_warmGeo(new THREE.BoxGeometry(0.01, 0.01, 0.01));
    }
    var fresh = [];
    structureRoot.traverse(function (o) {
      if (!o.isMesh || !o.material || o.userData.seeBase) return;
      [].concat(o.material).forEach(function (m) {
        if (!m || m.transparent) return;
        var key = warmKey(m);
        if (warmKeys.has(key)) return;
        warmKeys.add(key);
        var c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        c.opacity = 0.001;
        var mesh = new THREE.Mesh(warmGeo, c);
        mesh.frustumCulled = false;
        mesh.castShadow = mesh.receiveShadow = false;
        mesh.position.copy(tgt);
        mesh.raycast = function () {};
        warmRoot.add(mesh);
        fresh.push(mesh);
      });
    });
    if (!fresh.length) return;
    if (warmRoot.parent !== scene) scene.add(warmRoot);
    renderer.compileAsync(warmRoot, camera, scene).catch(function () {
      /* a failed warm-up only means the first fade compiles on the spot */
    });
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 200);
}

/* Is this hit on something the near-side cut has taken away? THREE.Raycaster
   tests neither `visible` nor an ancestor's, so a wall group that is hidden
   (or fading, or resting faded) still answers every ray with its own meshes —
   and so do the doors and windows hung in it. */
function cutAway(o) {
  for (var a = o; a; a = a.parent) if (!a.visible || (a.userData && a.userData.seeThrough)) return true;
  return false;
}

/* The presentation cutaway camera: three-quarter azimuth, steep from above,
   the whole house in frame — the view a dollhouse render is shot from. */
export function frameDollhouse() {
  if (!ready3D) return;
  var bb = contentBounds();
  set_framedInterior(false);
  tgt.set(bb.cx, 0, bb.cz);
  sun.target.position.set(bb.cx, 0, bb.cz);
  // a tall, narrow pane fits the house by its width: pull back to suit
  var aspect = camera && camera.aspect > 0 ? camera.aspect : 1.6;
  var distance = (Math.hypot(bb.w, bb.d) * 1.08 + 160) * Math.max(1, Math.pow(1.5 / aspect, 0.85));
  // A cover screen needs more than the normal 40 m orbit ceiling to fit an
  // entire apartment. Keep that range available when the user then zooms.
  set_overviewRadiusLimit(Math.max(4000, Math.min(12000, distance * 1.2)));
  set_radius(clamp(distance, 300, overviewRadiusLimit));
  set_theta(0.78);
  set_phi(0.62);
  set_userMoved(true);
  set_tgtTween(null);
  upd();
}

export function frameView() {
  if (!ready3D) return;
  set_overviewRadiusLimit(4000);
  var bb = contentBounds();
  var diag = Math.hypot(bb.w, bb.d);
  var compact = plannerCompact();
  set_framedInterior(compact);
  /* Phone 3D is a look INTO the room, not a dollhouse from above. Keep the
     shallower polar angle, but aim near the upper wall line: aiming at 80 cm
     made the sightline hit the near wall below its top, so Frame showed almost
     nothing except the exterior wall it was meant to look over. */
  var targetY = compact
    ? clamp(ceilingHeight() * 0.78, 180, 230)
    : Math.min(120, bb.d * 0.2 + 60);
  tgt.set(bb.cx, targetY, bb.cz);
  sun.target.position.set(bb.cx, 0, bb.cz);
  set_radius(clamp(diag * (compact ? 1.08 : 1.15) + (compact ? 180 : 220), 200, 4000));
  set_theta(compact ? 0.78 : 0.92);
  set_phi(compact ? 1.05 : 0.95);
  set_userMoved(true);
  set_tgtTween(null);
  upd();
}

// Keep the target near the model. Without a leash a fast pan sends the camera
// into empty space with no landmark to navigate back by.
function clampTarget() {
  var bb = contentBounds(),
    diag = Math.hypot(bb.w, bb.d),
    m = Math.max(1200, diag * 0.9);
  tgt.x = clamp(tgt.x, bb.cx - m, bb.cx + m);
  tgt.z = clamp(tgt.z, bb.cz - m, bb.cz + m);
  tgt.y = clamp(tgt.y, -100, 1400);
}
// world-space camera axes for the current orientation
function navBasis() {
  if (!navRight) {
    set_navRight(new THREE.Vector3());
    set_navUp(new THREE.Vector3());
    set_navFwd(new THREE.Vector3());
  }
  navRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  navUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  navFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
}
// pixels -> world units at the target's distance (so a drag tracks the cursor)
function pxScale() {
  var h = (renderer.domElement.clientHeight || 600);
  return (2 * radius * Math.tan(((camera.fov || 55) * Math.PI) / 360)) / h;
}
// drag-pan: slide the target across the screen plane
function panPixels(dx, dy) {
  if (extTick) return; // RC/race mode owns the camera
  navBasis();
  var k = pxScale();
  tgt.addScaledVector(navRight, -dx * k);
  tgt.addScaledVector(navUp, dy * k);
  clampTarget();
  set_tgtTween(null);
  upd();
}
// normalized device coords for a client point inside the canvas
function ndc(cx, cy) {
  var r = renderer.domElement.getBoundingClientRect();
  return {
    x: ((cx - r.left) / Math.max(1, r.width)) * 2 - 1,
    y: -((cy - r.top) / Math.max(1, r.height)) * 2 + 1,
  };
}
function pointerRay(cx, cy) {
  if (!navRay) set_navRay(new THREE.Raycaster());
  var n = ndc(cx, cy);
  navRay.setFromCamera(new THREE.Vector2(n.x, n.y), camera);
  return navRay;
}
// where the pointer ray meets the horizontal plane through the target — the
// pivot for zoom-to-cursor (a plane, not the geometry: cheap on every wheel tick)
function pointerGround(cx, cy) {
  var ray = pointerRay(cx, cy);
  if (!navPlane) set_navPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  navPlane.constant = -tgt.y;
  if (!navHit) set_navHit(new THREE.Vector3());
  var p = ray.ray.intersectPlane(navPlane, navHit);
  return p && isFinite(p.x) && isFinite(p.z) ? p : null;
}
// wheel/pinch zoom. With a pointer position the point under the cursor stays
// put, so you zoom INTO the corner you are looking at instead of the center.
function zoomBy(factor, cx, cy) {
  if (extTick) return;
  var r0 = radius;
  set_radius(r0 * factor);
  cR();
  if (cx != null) {
    var piv = pointerGround(cx, cy);
    if (piv) {
      var f = clamp(1 - radius / r0, -0.6, 0.6);
      tgt.x += (piv.x - tgt.x) * f;
      tgt.z += (piv.z - tgt.z) * f;
      clampTarget();
    }
  }
  set_tgtTween(null);
  upd();
}

export {
  cP, cR, clampTarget, cutAway, hangWindowCloth, navBasis, panPixels,
  pointerGround, pointerRay, pxScale, settleSeeFades, stepSeeFades, upd,
  updateSeeThrough, warmFadePipelines, zoomBy,
};
