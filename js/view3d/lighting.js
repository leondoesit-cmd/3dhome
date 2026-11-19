/* The 3D view's bounce lights, practical lights, shadow prewarm and shadow
   sets, split out of js/view3d.js. It shares the editor's state through live
   imports from ../view3d.js. */
import { sceneShadowBudget } from "../light_loop.js";
import { wallPathRecords } from "../light_loop.js";
import { roomSurfaceFinishes } from "../room_bounce.js";
import { admittedSunFlux } from "./backdrop.js";
import { fixtureLamp, lampChromaticity } from "../primitives.js";
import { plannerLampIntensity } from "../gpu.js";
import { FURN } from "../furniture.js";
import { detectRooms, pointInPoly, roomHidden } from "../geometry.js";
import { addPhysicsBody, clearPhysics } from "../physics_facade.js";
import { resolvePhysicsRole } from "../physics/math.js";
import { SKY_ONLY, UNMASKED, lightMaskRoom, pointFlux, roomNumberAt, selectShadowCasters, roomIrradiance, spotFlux } from "../room_bounce.js";
import { S, WALL_H, clamp } from "../state.js";
import { plannerCubePCF } from "./renderer_setup.js";
import { THREE, TSL } from "../three_lazy.js";
import { applyEnv } from "../view3d/gizmo_env.js";
import { hangWindowCloth } from "../view3d/see_through.js";
import { stackedLightStoreys } from "../view3d/floor_stack.js";
import {
  MAX_SHADOW_MAPS, PRACTICAL_SHADOW, PREWARM_IDLE_MS,
  SHADOW_ONLY_LAYER, SETTLE_FRAMES, bounceRooms, camera, drawnShadows, dyn,
  gameRendererLock, hemi, itemsRoot, mepRoot, needsRender,
  plannerShadowsEnabled, prewarmPass, prewarmRun, renderer, roomBounce, scene,
  set_bounceRooms, set_needsRender, set_prewarmDue, set_prewarmRun,
  set_settle, set_starsWarm, settle, stars, starsWarm, structureRoot, sun,
  usePost, windowLights,
} from "../view3d.js";

/* the whole-house view's other storeys the map was last drawn for: each
   keeps its own rooms and light (js/room_bounce.js STOREY_LAYERS) */
var bounceStoreys = [];
var emitterPosition;
function emitterWorld(mesh) {
  if (!emitterPosition) emitterPosition = new THREE.Vector3();
  return mesh.getWorldPosition(emitterPosition);
}
function sameStoreys(a, b) {
  return a.length === b.length && a.every(function (s, i) { return s.place === b[i].place && s.rooms === b[i].rooms && s.dy === b[i].dy; });
}
function buildBounceLights(rooms, relighting) {
  if (!roomBounce) return;
  var shown = rooms.filter(function (r) { return !roomHidden(r.key); });
  var same = shown.length === bounceRooms.length && shown.every(function (r, i) { return r === bounceRooms[i]; });
  var stacked = stackedLightStoreys();
  if (!same || !sameStoreys(stacked, bounceStoreys)) {
    set_bounceRooms(shown);
    bounceStoreys = stacked;
    roomBounce.setRooms(shown, WALL_H, stacked);
  }
  if (relighting) return; // applyEnv fits masks and bounce after setting emitter power
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
    if (!it || !fixtureLamp(FURN[it.type])) return;
    g.traverse(function (o) {
      if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
        var p = emitterWorld(o);
        o.userData.maskRoom = lightMaskRoom(rooms, p.x, p.z, o.castShadow);
        o.userData.maskRoomUnshadowed = lightMaskRoom(rooms, p.x, p.z, false);
      }
    });
  });
  set_needsRender(true);
}
function lightFlux(l) {
  if (l.userData.hemisphereSign) return Math.PI * l.intensity;
  return l.isSpotLight ? spotFlux(l.intensity, l.angle, l.penumbra) : pointFlux(l.intensity);
}
// The indirect field uses the piece's base room and height for reflected
// area and floor contact. Each emitting aperture can be in a different
// room from its base, for example when an arc shade crosses a partition.
// Snapshot the live group's contributions immediately around placeItem.
export function itemBouncePlacement(g) {
  const p = g.position;
  const values = [roomNumberAt(bounceRooms, p.x, p.z), p.y];
  for (const l of g.fixture?.lights || []) {
    if (!l.visible || !l.intensity) continue;
    const at = emitterWorld(l);
    values.push(roomNumberAt(bounceRooms, at.x, at.z), lightFlux(l), l.color.r, l.color.g, l.color.b);
  }
  return values.join("|");
}
function fitBounceLights() {
  if (!roomBounce) return;
  var sources = [];
  function add(x, z, l) {
    sources.push({ x: x, z: z, flux: lightFlux(l), color: [l.color.r, l.color.g, l.color.b] });
  }
  function sunlight(target, a) {
    const flux = admittedSunFlux(a, sun?.userData.toSun, sun?.intensity);
    if (flux > 0) target.push({ x: a.x, z: a.z, flux, color: sun.color.toArray() });
  }
  windowLights.forEach(function (l) {
    if (l.visible && l.intensity > 0) add(l.position.x, l.position.z, l);
    sunlight(sources, l.userData.aperture);
  });
  if (itemsRoot) itemsRoot.children.forEach(function (g) {
    var it = g.userData && g.userData.item;
    if (!it || !fixtureLamp(FURN[it.type])) return;
    g.traverse(function (o) {
      if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null && o.visible) {
        var p = emitterWorld(o);
        add(p.x, p.z, o);
      }
    });
  });
  roomBounce.setPathRecords([wallPathRecords(bounceRooms, S), ...bounceStoreys.map(st => st.wallPaths)]);
  const finishes = roomSurfaceFinishes(bounceRooms, structureRoot, itemsRoot, S, THREE, WALL_H);
  let baseRoom = bounceRooms.length;
  const stackedIrr = bounceStoreys.map(function (st) {
    const own = [];
    function storeySource(light) {
      const p = emitterWorld(light);
      const room = lightMaskRoom(st.rooms, p.x, p.z, false);
      // A room number is unique across atlas layers. A storey beyond the
      // atlas cannot borrow an active room's number or leak into its slab.
      const mask = st.place.w && room > 0 ? baseRoom + room : 65504;
      light.userData.maskRoom = light.userData.maskRoomUnshadowed = mask;
      own.push({ x: p.x, z: p.z, flux: lightFlux(light), color: light.color.toArray() });
    }
    st.practicals.forEach(storeySource);
    st.windows.forEach(a => {
      const sky = sun?.userData.windowSkyColor;
      if (sky) a.light.color.copy(sky);
      a.light.intensity = a.baseI * (S.windowSkyK || 0);
      storeySource(a.light);
      sunlight(own, a);
    });
    baseRoom += st.rooms.length;
    return roomIrradiance(st.rooms, own, st.finishes, st.wallH || WALL_H);
  });
  roomBounce.setIrradiance(roomIrradiance(bounceRooms, sources, finishes, WALL_H), stackedIrr);
  set_needsRender(true);
}
/* the whole-house storeys changed (js/view3d/floor_stack.js syncFloorStack) */
function refitStoreyLights() {
  fitPracticalLights(); // stacked materials share the fragment-stage shadow budget
  buildBounceLights(bounceRooms);
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
var cubeFilter;
let shadowTarget, shadowRotation, shadowAim;
// A missed stationary depth camera sees none of the moved object's old or
// new geometry. Compare against the pose used by three's last shadow draw:
// a moved fixture, or one turning in place, needs its own map redrawn.
export function missesCachedSpotShadow(light, position, box) {
  const sh = light.shadow;
  if (!light.isSpotLight || !(light.userData.win || light.userData.pooledLight) ||
      !drawnShadows.has(sh) || !sh.map || sh.getFrustum().intersectsBox(box)) return false;
  const cam = sh.camera;
  if (cam.parent || !cam.position.equals(position) || cam.far !== light.distance ||
      cam.fov !== THREE.MathUtils.RAD2DEG * 2 * light.angle * sh.focus ||
      cam.aspect !== sh.mapSize.width / sh.mapSize.height * sh.aspect) return false;
  if (!shadowTarget) {
    shadowTarget = new THREE.Vector3();
    shadowRotation = new THREE.Matrix4();
    shadowAim = new THREE.Quaternion();
  }
  light.target.getWorldPosition(shadowTarget);
  shadowRotation.lookAt(position, shadowTarget, cam.up);
  return cam.quaternion.equals(shadowAim.setFromRotationMatrix(shadowRotation));
}
function castSetup(o, kind, moving) {
  var sh = o.shadow;
  sh.camera.layers.enable(SHADOW_ONLY_LAYER);
  if (o.isSpotLight && sun) sh.filterNode = sun.shadow.filterNode;
  if (o.isPointLight) sh.filterNode = cubeFilter || (cubeFilter = plannerCubePCF(TSL));
  if (!sh.map) sh.mapSize.set(512, 512);
  if (kind === "window") {
    sh.radius = 4; // the sky through a window is a big source
    sh.bias = -0.00002;
    sh.normalBias = 0.4;
  } else {
    // Perspective depth: at 250 cm with near=4 a bias of -.002
    // advances the receiver by about 28 cm, through chair legs and walls.
    sh.bias = -0.000025;
    sh.normalBias = 0.35;
    // Angular size projected onto a shadow face at a typical nearby
    // blocker (one metre). The aperture penumbra itself is analytic.
    const slope = o.isSpotLight ? Math.tan(Math.min(o.angle, 1.54)) : 1;
    sh.radius = Math.max(1, Math.min(16, (o.userData.sourceRadius || 1) * sh.mapSize.x / (200 * slope)));
  }
  var far = Math.max(60, o.distance);
  // Three updates far from light.distance when it draws the map. Keep the
  // projection paired with its cached depth until the next regional pass.
  if (moving && sh.map && drawnShadows.has(sh) && sh.camera.near === 4) return;
  if (sh.camera.near !== 4 || sh.camera.far !== far) {
    sh.camera.near = 4;
    sh.camera.far = far;
    if (sh.camera.updateProjectionMatrix) sh.camera.updateProjectionMatrix();
    drawnShadows.delete(sh);
  }
}
// An item's transform cannot change its fixture type or the scene's sampler
// budget. Keep the part of the map allocation that its position can change.
const fixtureRanks = new WeakMap();
function fitPracticalLights(movedGroups) {
  if (!itemsRoot) return;
  var allowed = plannerShadowsEnabled && !gameRendererLock && !!renderer && renderer.shadowMap.enabled;
  var want = [];
  let ranksChanged = false;
  function fitGroup(g) {
    var it = g.userData && g.userData.item;
    const lamp = it && fixtureLamp(FURN[it.type]);
    if (!lamp) return;
    g.traverse(function (o) {
      if (!(o.isPointLight || o.isSpotLight) || o.userData.baseI == null) return;
      // Place the range window well outside the occupied room. At one
      // quarter range three retains more than 99% of inverse-square energy.
      var p = emitterWorld(o);
      var room = roomContaining(p.x, p.z), gap = room ? 0 : distToRooms(p.x, p.z);
      o.distance = 4 * Math.max(lamp.dist || 500, room ? roomReach(room, p.x, p.z, p.y) : 0);
      let rank = null;
      if (!o.userData.diffuseShade && !room && gap < o.distance) {
        // the room outlines run down the wall centre lines
        if (!movedGroups) want.push({ l: o, kind: "lamp", rank: 0, size: 0 });
        rank = Infinity;
      } else if (!o.userData.diffuseShade && room && g.visible) {
        if (!movedGroups) want.push({ l: o, kind: "lamp", size: room.area || 0, room: room.key,
          priority: (PRACTICAL_SHADOW[it.type] || 0) + (o.userData.primaryBeam ? 3 : 0) });
        rank = room.area || 0;
      }
      if (fixtureRanks.get(o) !== rank) ranksChanged = true;
      fixtureRanks.set(o, rank);
      if (movedGroups) {
        if (o.castShadow) castSetup(o, "lamp", true);
        if (roomBounce) {
          const rooms = roomBounce.rooms();
          o.userData.maskRoom = lightMaskRoom(rooms, p.x, p.z, o.castShadow);
          o.userData.maskRoomUnshadowed = lightMaskRoom(rooms, p.x, p.z, false);
        }
      }
    });
  }
  if (movedGroups) {
    movedGroups.forEach(fitGroup);
    if (ranksChanged) return fitPracticalLights();
    set_needsRender(true);
    set_settle(SETTLE_FRAMES);
    return;
  }
  itemsRoot.children.forEach(fitGroup);
  windowLights.forEach(function (l) {
    if (!l.isSpotLight) return;
    var room = roomContaining(l.position.x, l.position.z);
    want.push({ l: l, kind: "window", size: l.userData.aperture?.fullBaseI ?? l.userData.baseI, room: room && room.key });
  });
  var budget = allowed ? sceneShadowBudget([scene, itemsRoot, structureRoot], MAX_SHADOW_MAPS) : 0;
  var slots = Math.max(0, budget - (sun && sun.castShadow ? 1 : 0));
  var casting = selectShadowCasters(want, slots);
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
function startPrewarm() {
  set_prewarmDue(0);
  if (!prewarmPass || !prewarmPass.renderTarget || !renderer || !renderer.initialized || !sun || !itemsRoot || !usePost) return;
  if (gameRendererLock || !plannerShadowsEnabled || !renderer.shadowMap.enabled || !renderer.compileAsync) return;
  var depth = scenePassDepth();
  if (depth < 1) return; // no frame drawn through the scene pass yet
  if (!stars || stars.visible || starsWarm) return;
  var run = set_prewarmRun({ busy: true, stop: false });
  (async function () {
    try {
      var starBuild;
      stars.visible = true;
      try { starBuild = compileForScenePass(stars, depth); } finally { stars.visible = false; }
      await starBuild;
      set_starsWarm(true);
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
function finishPrewarm() {
  var run = prewarmRun;
  if (!run || run.busy) return false;
  set_prewarmRun(null);
  if (run.envPending) applyEnv(); // the time change that came in meanwhile
  if (!run.complete) set_prewarmDue(performance.now() + PREWARM_IDLE_MS);
  set_needsRender(true);
  return true;
}
/* The scene pass target is in use until the compile finishes. */
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
  buildBounceLights, finishPrewarm, fitBounceLights, fitPracticalLights, refitStoreyLights,
  prewarmHolds, roomContaining, roomReach, schedulePrewarm, startPrewarm,
  tagItemPhysicsRole,
};

// Identity, visibility and shadow ownership survive a dimmer, switch, CCT
// or hour edit. The geometry-dependent coefficients are computed at build.
export function driveFixture(group, item, lamp, color = item.lightColor ?? lamp.color) {
  const rig = group.fixture;
  if (!rig) return;
  const flux = item.lightOn === false ? 0 : pointFlux(plannerLampIntensity(item, lamp));
  group.userData.lampOff = item.lightOn === false;
  for (const light of rig.lights) {
    lampChromaticity(light.color, color);
    light.intensity = light.userData.baseI = flux * light.userData.intensityPerFlux;
  }
  for (const s of rig.surfaces) {
    lampChromaticity(s.material.emissive, color);
    s.material.emissiveIntensity = s.material.userData.lampLuminance = flux * s.fraction / (Math.PI * s.area);
  }
}

export function installFixture(group, optics, takeLight) {
  const lights = [];
  for (const part of optics.parts) {
    // A hemispherical lens needs a cube shadow: a perspective camera
    // covering 180 degrees has zero useful resolution around its axis.
    const hemisphere = part.sign && !part.pitch && part.penumbra === 1 && part.angle === Math.PI / 2 ? part.sign : 0;
    const spot = !!part.sign && !hemisphere;
    const l = takeLight(spot ? "SpotLight" : "PointLight", 0xffffff, 0, 0, 2, Math.min(part.angle || 0, Math.PI / 2 - 0.005), part.penumbra);
    l.position.copy(part.position);
    if (spot) {
      l.target.position.copy(l.position);
      l.target.position.y += part.sign * 100 * Math.cos(part.pitch);
      l.target.position.z += 100 * Math.sin(part.pitch);
      group.add(l.target);
    }
    l.userData.hemisphereSign = hemisphere;
    l.userData.intensityPerFlux = part.fraction / (hemisphere ? Math.PI : spot ? spotFlux(1, l.angle, l.penumbra) : pointFlux(1));
    l.userData.primaryBeam = !lights.length;
    l.userData.sourceRadius = part.radius;
    l.userData.diffuseShade = !!part.diffuseShade;
    l.userData.baseI = 0;
    lights.push(l);
    group.add(l);
  }
  group.fixture = { lights, surfaces: optics.surfaces };
}
