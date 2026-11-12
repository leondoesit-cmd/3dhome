/* The 3D view's bounce lights, practical lights, shadow prewarm and shadow
   sets, split out of js/view3d.js. It shares the editor's state through live
   imports from ../view3d.js. */
import { FURN, elevOffset } from "../furniture.js";
import { detectRooms, pointInPoly, roomHidden } from "../geometry.js";
import { forgetLightKeys } from "../gpu.js";
import { addPhysicsBody, clearPhysics } from "../physics_facade.js";
import { resolvePhysicsRole } from "../physics/math.js";
import { SKY_ONLY, UNMASKED, lightMaskRoom, pointFlux, roomIrradiance, spotFlux } from "../room_bounce.js";
import { S, WALL_H, clamp } from "../state.js";
import { THREE } from "../three_lazy.js";
import { applyEnv } from "../view3d/gizmo_env.js";
import { hangWindowCloth } from "../view3d/see_through.js";
import {
  BOUNCE_RHO, MAX_SHADOW_MAPS, PRACTICAL_SHADOW, PREWARM_IDLE_MS,
  SETTLE_FRAMES, SHADOW_SETS, bounceRooms, camera, drawnShadows, dyn,
  gameRendererLock, hemi, itemsRoot, mepRoot, needsRender,
  plannerShadowsEnabled, prewarmPass, prewarmRun, renderer, roomBounce, scene,
  set_bounceRooms, set_needsRender, set_prewarmDue, set_prewarmRun,
  set_settle, set_starsWarm, settle, stars, starsWarm, structureRoot, sun,
  usePost, windowLights,
} from "../view3d.js";

function buildBounceLights(rooms) {
  if (!roomBounce) return;
  var shown = rooms.filter(function (r) { return !roomHidden(r.key); });
  var same = shown.length === bounceRooms.length && shown.every(function (r, i) { return r === bounceRooms[i]; });
  if (!same) {
    set_bounceRooms(shown);
    roomBounce.setRooms(shown, WALL_H);
  }
  fitLightMasks(); // the rooms may have been renumbered
  fitBounceLights();
}
/* Which room each unshadowed light may light (see js/room_bounce.js): its
   own, numbered as the plan map numbers them. A casting light is stopped by
   its shadow map, so it keeps reaching through a doorway into the next room. */
function fitLightMasks() {
  if (!roomBounce) return;
  var rooms = roomBounce.rooms();
  // the sky's own light reaches only what is under the open sky, and the sun
  // too whenever it has no shadow map to stop it at the roof (shadows off)
  // maskRoomUnshadowed: the mask in a renderer that draws no shadow maps
  // (the inspector preview), see effectiveMaskRoom
  if (hemi) hemi.userData.maskRoom = SKY_ONLY;
  if (sun) {
    sun.userData.maskRoom = sun.castShadow && renderer && renderer.shadowMap.enabled ? UNMASKED : SKY_ONLY;
    sun.userData.maskRoomUnshadowed = SKY_ONLY;
  }
  windowLights.forEach(function (l) {
    l.userData.maskRoom = lightMaskRoom(rooms, l.position.x, l.position.z, l.castShadow);
    l.userData.maskRoomUnshadowed = lightMaskRoom(rooms, l.position.x, l.position.z, false);
  });
  if (itemsRoot) itemsRoot.children.forEach(function (g) {
    var it = g.userData && g.userData.item;
    if (!it || !FURN[it.type] || !FURN[it.type].lamp) return;
    g.traverse(function (o) {
      if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
        o.userData.maskRoom = lightMaskRoom(rooms, it.x, it.z, o.castShadow);
        o.userData.maskRoomUnshadowed = lightMaskRoom(rooms, it.x, it.z, false);
      }
    });
  });
  set_needsRender(true);
}
function lightFlux(l) {
  return l.isSpotLight ? spotFlux(l.intensity, l.angle, l.penumbra) : pointFlux(l.intensity);
}
function fitBounceLights() {
  if (!roomBounce) return;
  var sources = [];
  function add(x, z, l) {
    sources.push({ x: x, z: z, flux: lightFlux(l), color: [l.color.r, l.color.g, l.color.b] });
  }
  windowLights.forEach(function (l) { if (l.visible && l.intensity > 0) add(l.position.x, l.position.z, l); });
  if (itemsRoot) itemsRoot.children.forEach(function (g) {
    var it = g.userData && g.userData.item;
    if (!it || !FURN[it.type] || !FURN[it.type].lamp) return;
    g.traverse(function (o) { if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null && o.visible) add(it.x, it.z, o); });
  });
  roomBounce.setIrradiance(roomIrradiance(bounceRooms, sources, BOUNCE_RHO, WALL_H));
  set_needsRender(true);
}
function roomContaining(x, z) {
  var rooms = detectRooms();
  for (var i = 0; i < rooms.length; i++) if (pointInPoly(x, z, rooms[i].pts)) return rooms[i];
  return null;
}
function roomReach(room, x, z, y) {
  var far = 0;
  room.pts.forEach(function (p) { far = Math.max(far, Math.hypot(p.x - x, p.z - z, y || 0)); });
  return Math.max(220, far + 40);
}

function distToRooms(x, z) {
  var best = Infinity;
  detectRooms().forEach(function (r) {
    var n = r.pts.length;
    for (var i = 0; i < n; i++) {
      var p = r.pts[i], q = r.pts[(i + 1) % n], dx = q.x - p.x, dz = q.z - p.z;
      var t = clamp(((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      best = Math.min(best, Math.hypot(x - p.x - t * dx, z - p.z - t * dz));
    }
  });
  return best;
}
function castSetup(o, kind) {
  var sh = o.shadow;
  if (kind === "window") {
    // a pooled light keeps the map it already has (see takeLight)
    if (!sh.map) sh.mapSize.set(512, 512);
    sh.radius = 4; // the sky through a window is a big source
    sh.bias = -0.0006;
    sh.normalBias = 3;
    sh.camera.near = 12; // clears the window's own frame and sill trim
  } else {
    if (!sh.map) sh.mapSize.set(512, 512);
    sh.camera.near = 4;
    sh.bias = -0.002;
    sh.normalBias = 2.5;
    sh.radius = 5;
  }
  var far = Math.max(60, o.distance);
  if (sh.camera.far !== far) {
    sh.camera.far = far;
    if (sh.camera.updateProjectionMatrix) sh.camera.updateProjectionMatrix();
    drawnShadows.delete(sh);
  }
}
/* over: { night, day } fits a shadow set other than the hour's (the
   prewarm below); without it the set follows S.artK / S.dayK */
function fitPracticalLights(over) {
  if (!itemsRoot) return;
  var allowed = plannerShadowsEnabled && !gameRendererLock && !!renderer && renderer.shadowMap.enabled;
  var night = over ? over.night : (S.artK || 0) > 0.5;
  var want = [], shadowRooms = {};
  itemsRoot.children.forEach(function (g) {
    var it = g.userData && g.userData.item;
    if (!it || !FURN[it.type] || !FURN[it.type].lamp) return;
    var room = roomContaining(it.x, it.z), gap = room ? 0 : distToRooms(it.x, it.z);
    g.traverse(function (o) {
      if (!(o.isPointLight || o.isSpotLight) || o.userData.baseI == null) return;
      if (o.userData.throwCm == null) o.userData.throwCm = o.distance;
      var y = o.position.y + elevOffset(it);
      o.distance = room ? Math.min(o.userData.throwCm, roomReach(room, it.x, it.z, y)) : o.userData.throwCm;
      if (!room && gap < o.distance) {
        // the room outlines run down the wall centre lines
        want.push({ l: o, kind: "lamp", rank: 0, size: 0 });
      } else if (room && night && o.isPointLight && PRACTICAL_SHADOW[it.type] && !shadowRooms[room.key]) {
        shadowRooms[room.key] = true;
        want.push({ l: o, kind: "lamp", rank: 1, size: room.area || 0 });
      }
    });
  });
  if (!night && (over ? over.day : (S.dayK || 0) > 0.02))
    windowLights.forEach(function (l) {
      if (l.isSpotLight) want.push({ l: l, kind: "window", rank: 2, size: l.userData.baseI });
    });
  want.sort(function (a, b) { return a.rank - b.rank || b.size - a.size; });
  var slots = allowed ? MAX_SHADOW_MAPS - (sun && sun.castShadow ? 1 : 0) : 0;
  var casting = new Set();
  want.slice(0, Math.max(0, slots)).forEach(function (w) { casting.add(w.l); });
  var lights = windowLights.slice();
  itemsRoot.traverse(function (o) { if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) lights.push(o); });
  lights.forEach(function (o) {
    var cast = casting.has(o);
    if (cast) castSetup(o, o.userData.win ? "window" : "lamp");
    if (o.castShadow !== cast) o.castShadow = cast;
  });
  fitLightMasks(); // whatever does not cast now stops at its room's walls
  set_needsRender(true);
  set_settle(SETTLE_FRAMES);
}

function schedulePrewarm() {
  set_prewarmDue(performance.now() + PREWARM_IDLE_MS);
  if (prewarmRun) prewarmRun.stop = true;
}
/* the call depth the scene pass draws at, read off the context three keeps
   for it (the post chain nests it, and the depth is in every shader key) */
function scenePassDepth() {
  var mrt = prewarmPass && prewarmPass._mrt, ctxs = renderer && renderer._renderContexts;
  if (!mrt || !ctxs || !ctxs._renderContexts) return -1;
  var tag = "-" + mrt.id + "-", keys = Object.keys(ctxs._renderContexts);
  for (var i = 0; i < keys.length; i++) {
    var at = keys[i].lastIndexOf(tag);
    if (at >= 0) return Number(keys[i].slice(at + tag.length));
  }
  return -1;
}
/* one mesh per shader it can ask for: three keys a lit shader on the
   material's settings, the geometry's attributes and the shadow flags */
function prewarmMeshes() {
  var out = [], seen = new Set();
  (function walk(o) {
    if (!o.visible) return;
    if (o.isMesh && o.layers.test(camera.layers) && o.material && o.geometry) {
      var g = o.geometry, key = [].concat(o.material).map(function (m) { return m.id; }).join("+") +
        "|" + Object.keys(g.attributes).sort().join(",") + "|" + (g.index ? 1 : 0) +
        "|" + Object.keys(g.morphAttributes || {}).length + "|" + (o.receiveShadow ? 1 : 0) + (o.castShadow ? 1 : 0) +
        "|" + (o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh ? o.id : "");
      if (!seen.has(key)) { seen.add(key); out.push(o); }
    }
    for (var i = 0; i < o.children.length; i++) walk(o.children[i]);
  })(dyn);
  return out;
}
function applyShadowSet(set) {
  var nr = needsRender, st = settle; // trying a set is not a reason to draw
  sun.castShadow = set.sun;
  fitPracticalLights({ night: set.night, day: !set.night });
  forgetLightKeys(renderer); // no draw since: three would key the next one on the old set
  set_needsRender(nr);
  set_settle(st);
}
function startPrewarm() {
  set_prewarmDue(0);
  if (!prewarmPass || !prewarmPass.renderTarget || !renderer || !renderer.initialized || !sun || !itemsRoot || !usePost) return;
  if (gameRendererLock || !plannerShadowsEnabled || !renderer.shadowMap.enabled || !renderer.compileAsync) return;
  var depth = scenePassDepth();
  if (depth < 1) return; // no frame drawn through the scene pass yet
  var night = (S.artK || 0) > 0.5;
  var sets = SHADOW_SETS.filter(function (s) { return s.night !== night || s.sun !== sun.castShadow; });
  var meshes = prewarmMeshes();
  if (!sets.length || !meshes.length) return;
  var run = set_prewarmRun({ sets: sets, meshes: meshes, depth: depth, sun: sun.castShadow, busy: true, stop: false });
  (async function () {
    try {
      /* The star field is hidden all day, so the walk above never meets it
         and the first night frame built its shader on the spot. It is unlit:
         one build serves every shadow set. compileAsync reads visibility
         before its first await, so it is shown for that call only (nothing is
         drawn while a run holds the frame). */
      if (stars && !stars.visible && !starsWarm) {
        var starBuild;
        stars.visible = true;
        try { starBuild = compileForScenePass(stars, depth); } finally { stars.visible = false; }
        await starBuild;
        set_starsWarm(true);
      }
      for (var s = 0; s < sets.length && !run.stop; s++) {
        applyShadowSet(sets[s]);
        for (var i = 0; i < meshes.length && !run.stop; i++) {
          await compileForScenePass(meshes[i], depth);
          await new Promise(function (r) { requestAnimationFrame(r); }); // a frame between builds
        }
      }
    } catch (e) {
      // a failed warm-up only means the handoff builds on the spot
    }
    run.complete = !run.stop;
    run.busy = false;
  })();
}
/* compile one mesh's shaders as the scene pass will ask for them */
function compileForScenePass(mesh, depth) {
  var rt = renderer.getRenderTarget(), mrt = renderer.getMRT();
  var ctxs = renderer._renderContexts, get = ctxs.get, p;
  renderer.setRenderTarget(prewarmPass.renderTarget);
  renderer.setMRT(prewarmPass._mrt);
  ctxs.get = function (target, m, d) { return get.call(this, target, m, d === undefined ? depth : d); };
  try {
    p = renderer.compileAsync(mesh, camera, scene); // takes its context before its first await
  } finally {
    ctxs.get = get;
  }
  var done = function () { renderer.setRenderTarget(rt); renderer.setMRT(mrt); };
  return Promise.resolve(p).then(done, done);
}
/* after the build in flight, the hour's own lights back; the next frame
   re-keys to them */
function finishPrewarm() {
  var run = prewarmRun;
  if (!run || run.busy) return false;
  set_prewarmRun(null);
  sun.castShadow = run.sun;
  fitPracticalLights();
  forgetLightKeys(renderer); // or the next frame's first object keys on the last set
  if (run.envPending) applyEnv(); // the time change that came in meanwhile
  /* An interrupted run starts again after the next quiet spell. Only a rebuild
     used to re-arm it, so a single time change or orbit during the warm-up
     left the dusk handoff to build on the spot (4–6 s frozen) until the plan
     was next edited. Shaders it already built are cached and cost nothing. */
  if (!run.complete) set_prewarmDue(performance.now() + PREWARM_IDLE_MS);
  set_needsRender(true);
  return true;
}
/* hold the frame until a run is over: a frame now would draw the set
   being built, and the scene pass target is in use */
function prewarmHolds() {
  var run = prewarmRun;
  if (!run) return false;
  if (needsRender || settle > 0) run.stop = true;
  return !finishPrewarm();
}

function tagItemPhysicsRole(g, it) {
  if (it) g.userData.item = it;
  var minY;
  g.updateMatrixWorld(true);
  var bb = new THREE.Box3().setFromObject(g);
  if (!bb.isEmpty()) minY = bb.min.y;
  g.userData.physicsRole = resolvePhysicsRole(g.userData, minY);
}

export function initPhysicsForScene() {
  if (!dyn) return;
  clearPhysics();
  /* One body per BUILT THING, so this wants the wall groups, floor slabs,
     conduits and furniture groups — not the three layer roots that now stand
     between `dyn` and most of them. Flatten the roots back out by one level;
     everything reachable is exactly what `dyn.children` held before the split
     (the roots' own children are still the individual groups and meshes). */
  var items = itemsRoot ? itemsRoot.children : [];
  dyn.children
    .filter(function (c) { return c !== itemsRoot && c !== structureRoot && c !== mepRoot; })
    .concat(structureRoot ? structureRoot.children : [])
    .concat(mepRoot ? mepRoot.children : [])
    .concat(items)
    .forEach(function(c) {
      var minY;
      if (c.userData.item && c.userData.physicsRole !== "dynamic" && c.userData.physicsRole !== "static") {
        var ibb = new THREE.Box3().setFromObject(c);
        if (!ibb.isEmpty()) minY = ibb.min.y;
      }
      var role = resolvePhysicsRole(c.userData, minY);
      if (role === "ignore") return;
      var hasGeometry = false;
      c.traverse(function(node) {
        if (node.isMesh) hasGeometry = true;
      });
      if (hasGeometry) addPhysicsBody(c, role === "dynamic");
    });
  hangWindowCloth(dyn);
}

export {
  buildBounceLights, finishPrewarm, fitBounceLights, fitPracticalLights,
  prewarmHolds, roomContaining, roomReach, schedulePrewarm, startPrewarm,
  tagItemPhysicsRole,
};
