/* The Floor is Lava — world: collision, molten plane, gems, ghost, audio. */
import * as THREE from "three";
import {
  uniform, positionLocal, vec2, vec3, float, mix, sin, dot, floor, fract,
  smoothstep, pow,
} from "three/tsl";
import { legacyIntensity, LUX } from "./gpu.js";
import { S, fin, clamp } from "./state.js";
import {
  getMainScene,
  getDynGroup,
  getRenderer,
  getRigLights,
  onRelight,
  applyEnv,
} from "./view3d.js";
import { wallGeom, hiddenSets, usedNodes } from "./geometry.js";
import * as Col2D from "./col2d.js";
import { runtimeCollisionRects, hasRuntimeRepresentation } from "./core/runtime.js";
import {
  L, P_RAD, P_CLEAR, STEP, expandParkourRects, emergencyCrates, highPlatformCount,
  pickExtraction, placeGems, scorchAmount, pickSpawn, lavaDetail, busGains, P_SCALE,
} from "./lava_state.js";

var LAVA_I = legacyIntensity(2.8, 900, 1.4, 0.2);

var _colBox3 = new THREE.Box3();
var _colVec3 = new THREE.Vector3();
var _colDirectOpt = { passes: 4, state: { hit: 0, hard: 0 } };
var _colMoveOpt = { passes: 3, state: { hit: 0, hard: 0 } };
var _webVec = new THREE.Vector3();
var _webUp = new THREE.Vector3(0, 1, 0);

export function floorOpenings(w) {
  return S.openings.filter(function (o) {
    return (
      o.wall === w.id &&
      (o.type === "door" || o.type === "passage") &&
      (o.sill || 0) <= 5 &&
      o.width > 40
    );
  });
}

export function interiorBounds() {
  var u = usedNodes(),
    minx = 1e9,
    minz = 1e9,
    maxx = -1e9,
    maxz = -1e9,
    any = false;
  for (var k in u) {
    var n = S.nodes[k];
    if (!n || !fin(n.x) || !fin(n.z)) continue;
    minx = Math.min(minx, n.x);
    maxx = Math.max(maxx, n.x);
    minz = Math.min(minz, n.z);
    maxz = Math.max(maxz, n.z);
    any = true;
  }
  return any ? { minx: minx, minz: minz, maxx: maxx, maxz: maxz } : null;
}

export function buildCol() {
  var scene = getMainScene();
  if (!scene) return;
  scene.updateMatrixWorld(true);
  var col = { segs: [], doorSegs: [], rects: [], windows: [] };
  var hidden = hiddenSets();
  S.walls.forEach(function (w) {
    if (hidden.walls[w.id]) return;
    var gm = wallGeom(w);
    if (gm.L < 1) return;
    var half = Math.max(w.thickness / 2, 6);
    // wall normal: windows record which way they face, and a door leaf perch
    // is offset off the wall line along it
    var nx = -gm.uz,
      nz = gm.ux;
    function seg(s0, s1, pivot) {
      if (s1 - s0 < 1) return;
      var e = {
        ax: gm.a.x + gm.ux * s0,
        az: gm.a.z + gm.uz * s0,
        bx: gm.a.x + gm.ux * s1,
        bz: gm.a.z + gm.uz * s1,
        half: half,
      };
      if (pivot) {
        e.pivot = pivot;
        col.doorSegs.push(e);
      } else col.segs.push(e);
    }
    S.openings.forEach(function (o) {
      if (o.wall !== w.id) return;
      var cx = gm.a.x + gm.ux * o.s,
        cz = gm.a.z + gm.uz * o.s;
      if (o.type === "window") {
        col.windows.push({
          x: cx, z: cz, nx: nx, nz: nz,
          sill: o.sill || 90, h: o.height || 120, w: o.width || 100,
        });
      }
    });
    var ops = floorOpenings(w).sort(function (a, b) { return a.s - b.s; });
    var pos = 0;
    ops.forEach(function (o) {
      var l = clamp(o.s - o.width / 2 + 4, 0, gm.L),
        r = clamp(o.s + o.width / 2 - 4, 0, gm.L);
      if (r <= pos) return;
      seg(pos, l);
      if (o.type === "door") {
        var cx = gm.a.x + gm.ux * o.s,
          cz = gm.a.z + gm.uz * o.s,
          best = null,
          bd = 1e9;
        (scene.doors || []).forEach(function (d) {
          if (d.geometry) {
            if (!d.geometry.boundingBox) d.geometry.computeBoundingBox();
            if (d.geometry.boundingBox) _colBox3.copy(d.geometry.boundingBox).applyMatrix4(d.matrixWorld);
            else _colBox3.setFromObject(d);
          } else _colBox3.setFromObject(d);
          if (_colBox3.isEmpty()) return;
          _colBox3.getCenter(_colVec3);
          var dd = Math.hypot(_colVec3.x - cx, _colVec3.z - cz);
          if (dd < o.width && dd < bd) {
            bd = dd;
            best = d;
          }
        });
        if (best) {
          seg(l, r, best);
          // door leaf top — a late-game mantle perch
          var top = (o.height || 210);
          var hx = gm.ux * (o.width || 80) * 0.35,
            hz = gm.uz * (o.width || 80) * 0.35,
            px = nx * 10,
            pz = nz * 10;
          col.rects.push({
            x0: Math.min(cx - hx + px, cx + hx + px) - 4,
            x1: Math.max(cx - hx + px, cx + hx + px) + 4,
            z0: Math.min(cz - hz + pz, cz + hz + pz) - 4,
            z1: Math.max(cz - hz + pz, cz + hz + pz) + 4,
            y0: top - 8,
            y1: top,
            kind: "doortop",
            item: { id: "door-" + o.id, type: "doortop" },
          });
        }
      }
      pos = r;
    });
    seg(pos, gm.L);
  });
  var box3 = new THREE.Box3();
  var raw = runtimeCollisionRects(S);
  var dyn = getDynGroup();
  if (dyn)
    dyn.traverse(function (o) {
      if (!o.isMesh) return;
      var p = o, it = null;
      while (p && !it) {
        if (p.userData && p.userData.item) it = p.userData.item;
        p = p.parent;
      }
      if (!it) return;
      if (hasRuntimeRepresentation(S, it)) return;
      if (o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        if (o.geometry.boundingBox) box3.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        else box3.setFromObject(o);
      } else box3.setFromObject(o);
      if (box3.isEmpty()) return;
      if (box3.max.x - box3.min.x < 4 || box3.max.z - box3.min.z < 4) return;
      if (box3.max.y - box3.min.y < 3) return;
      raw.push({
        x0: box3.min.x, z0: box3.min.z, x1: box3.max.x, z1: box3.max.z,
        y0: box3.min.y, y1: box3.max.y, item: it,
      });
    });
  raw = Col2D.padRects(Col2D.mergeItemRects(raw), 2);
  col.rects = expandParkourRects(raw);
  col.windows.forEach(function (win) {
    var hw = (win.w || 100) / 2,
      px = win.nx * 12,
      pz = win.nz * 12,
      ox = -win.nz * hw * 0.7,
      oz = win.nx * hw * 0.7;
    col.rects.push({
      x0: Math.min(win.x + px - ox, win.x + px + ox) - 6,
      x1: Math.max(win.x + px - ox, win.x + px + ox) + 6,
      z0: Math.min(win.z + pz - oz, win.z + pz + oz) - 6,
      z1: Math.max(win.z + pz - oz, win.z + pz + oz) + 6,
      y0: win.sill - 6,
      y1: win.sill,
      kind: "sill",
      item: { id: "sill-" + Math.round(win.x) + "-" + Math.round(win.z), type: "sill" },
    });
  });
  Col2D.buildSpatialIndex(col, 180);
  L.col = col;
  return col;
}

export function groundAt(x, z, y, step) {
  return Col2D.groundAt(L.col, x, z, y, step);
}

export function collideCircle(p, r, y, clear, step) {
  return Col2D.collideCircle(L.col, p, r, y, clear, step, _colDirectOpt);
}

export function moveCircle(p, dx, dz, r, y, clear, step) {
  return Col2D.moveCircle(L.col, p, dx, dz, r, y, clear, step, _colMoveOpt);
}

export function freeSpot(x, z, r) {
  return Col2D.freeSpot(L.col, x, z, r, 0, P_CLEAR, STEP, 280, 18, 16);
}

/* The molten surface, as a TSL node graph rather than the hand-written GLSL it
   used to be. A raw ShaderMaterial does not survive the WebGPU backend: the
   node builder rejects it outright ("Material 'ShaderMaterial' is not
   compatible", once per frame) and the mesh simply does not draw — which in
   this mode means the lava is invisible AND the room it is supposed to be
   lighting reads as a black screen, since the heat grade has already taken the
   sun, the IBL and the house lights away. Same maths, same look, both
   backends. See drive_traffic.js / zombies_world.js for the same port.

   The fbm loops are unrolled in JS: `octaves` is a quality setting, so the
   iteration count is known when the graph is built and never at draw time. */
function nHash(p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
}

function nVnoise(p) {
  var i = floor(p),
    f0 = fract(p);
  var f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  var a = nHash(i),
    b = nHash(i.add(vec2(1, 0))),
    c = nHash(i.add(vec2(0, 1))),
    d = nHash(i.add(vec2(1, 1)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

function nFbm(p, loops, lac, gain) {
  var v = float(0),
    a = 0.5,
    q = p;
  for (var i = 0; i < loops; i++) {
    v = v.add(nVnoise(q).mul(a));
    q = q.mul(lac);
    a *= gain;
  }
  return v;
}

function lavaMaterial(octaves) {
  octaves = Math.max(2, Math.min(5, octaves || 4));
  var vertLoop = octaves >= 4 ? 4 : 2;
  var fragLoop = octaves >= 4 ? 5 : octaves >= 3 ? 3 : 2;
  var uTime = uniform(0),
    uHeat = uniform(0.4),
    uFrozen = uniform(0);
  var frozen = uFrozen.clamp(0, 1);
  var flat = positionLocal.xz;

  // vertex: a slow swell, held still while the melt is frozen
  var swell = nFbm(
    flat.mul(0.018).add(vec2(uTime.mul(0.22), uTime.mul(0.13))),
    vertLoop, 2.03, 0.5
  );
  var chop = nVnoise(flat.mul(0.05).sub(uTime.mul(0.4)));
  var lift = swell.mul(7.5).add(chop.mul(3.4)).mul(float(1).sub(frozen.mul(0.85)));

  // fragment: crust over flow, cooling to ice while frozen
  var uv2 = flat.mul(0.012);
  var n = nFbm(uv2.add(vec2(uTime.mul(0.12), uTime.mul(-0.08))), fragLoop, 2.07, 0.52);
  var flow = nFbm(
    uv2.mul(2.4).add(vec2(uTime.mul(-0.28), uTime.mul(0.19))),
    fragLoop, 2.07, 0.52
  );
  var crust = smoothstep(0.32, 0.72, n);
  var cool = vec3(0.07, 0.015, 0.01),
    hot = vec3(1.0, 0.28, 0.04),
    core = vec3(1.0, 0.82, 0.28),
    ice = vec3(0.18, 0.22, 0.28);
  var col = mix(hot, cool, crust);
  col = mix(col, core, pow(flow, 2.4).mul(0.85));
  col = mix(col, mix(cool.mul(1.6), ice, 0.55), frozen.mul(0.78));
  var em = float(0.55)
    .add(flow.mul(1.55))
    .add(uHeat.mul(0.35))
    .mul(float(1).sub(frozen.mul(0.5)));

  var mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
  mat.positionNode = vec3(positionLocal.x, positionLocal.y.add(lift), positionLocal.z);
  mat.colorNode = col.mul(em);
  // the loop drives these by hand, the way it drove the old uniforms
  mat.userData.lavaUniforms = { uTime: uTime, uHeat: uHeat, uFrozen: uFrozen };
  return mat;
}

export function buildLavaMesh(bounds, quality) {
  var detail = lavaDetail(quality);
  var span = 2400;
  var cx = 0, cz = 0;
  if (bounds) {
    cx = (bounds.minx + bounds.maxx) / 2;
    cz = (bounds.minz + bounds.maxz) / 2;
    span = Math.max(
      1400,
      (bounds.maxx - bounds.minx) * 1.6,
      (bounds.maxz - bounds.minz) * 1.6
    );
  }
  var geo = new THREE.PlaneGeometry(span, span, detail.seg, detail.seg);
  geo.rotateX(-Math.PI / 2);
  var mat = lavaMaterial(detail.octaves);
  var mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  var light = new THREE.PointLight(0xff6a22, LAVA_I, 1400, 1.4);
  light.position.set(0, 40, 0);
  var grp = new THREE.Group();
  grp.position.set(cx, 0, cz);
  grp.add(mesh);
  grp.add(light);
  grp.userData.lava = { mesh: mesh, mat: mat, light: light };
  return grp;
}

export function rebuildLavaMesh(grp, bounds, quality) {
  if (!grp) return null;
  if (L.lavaMesh) {
    grp.remove(L.lavaMesh);
    disposeGroup(L.lavaMesh);
    L.lavaMesh = null;
  }
  var lava = buildLavaMesh(bounds, quality);
  grp.add(lava);
  L.lavaMesh = lava;
  return lava;
}

export function stepLavaVisual(grp, lavaY, time, heat, px, pz, freeze, motion) {
  if (!grp) return;
  grp.position.y = lavaY;
  var vis = grp.userData.lava;
  if (!vis) return;
  var frozen = freeze > 0 ? 1 : 0;
  var u = vis.mat.userData.lavaUniforms;
  if (u) {
    if (motion !== false) u.uTime.value = time;
    u.uHeat.value = heat;
    u.uFrozen.value = frozen;
  }
  vis.light.intensity = LAVA_I * (0.55 + heat * 0.9) * (frozen ? 0.45 : 1);
  vis.light.distance = 700 + heat * 900;
  /* One point light at the centre of a 24m plane lights the middle of the plan
     and nothing else — walk two rooms over and the "molten" grade goes black.
     The light rides under the player instead, which is also where it belongs
     dramatically: the glow is coming from the floor you are standing over. */
  if (px != null && pz != null) {
    /* During the siren the surface is still BELOW the floor slab, which put the
       only warm light in the room underneath it and left the countdown — the
       seconds the player most needs to see the furniture in — almost black.
       The glow floors itself at slab level and rides the melt after that. */
    var localY = Math.max(40, 48 - lavaY);
    vis.light.position.set(px - grp.position.x, localY, pz - grp.position.z);
  }
}

function crateMesh(rc) {
  var w = rc.x1 - rc.x0,
    d = rc.z1 - rc.z0,
    h = rc.y1 - rc.y0;
  var g = new THREE.BoxGeometry(w, h, d);
  var m = new THREE.MeshStandardMaterial({
    color: 0x8a5a32,
    roughness: 0.82,
    metalness: 0.04,
    emissive: new THREE.Color(0x3a1208),
    emissiveIntensity: 0.15,
  });
  var mesh = new THREE.Mesh(g, m);
  mesh.position.set((rc.x0 + rc.x1) / 2, (rc.y0 + rc.y1) / 2, (rc.z0 + rc.z1) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.crate = rc;
  return mesh;
}

function gemMesh(withLight) {
  var geo = new THREE.OctahedronGeometry(11, 0);
  var mat = new THREE.MeshStandardMaterial({
    color: 0x7ef0ff,
    emissive: new THREE.Color(0x1ad4ff),
    emissiveIntensity: 1.4,
    roughness: 0.22,
    metalness: 0.15,
    transparent: true,
    opacity: 0.92,
  });
  var mesh = new THREE.Mesh(geo, mat);
  var grp = new THREE.Group();
  grp.add(mesh);
  if (withLight !== false) {
    var glow = new THREE.PointLight(0x66e8ff, legacyIntensity(0.55, 180, 2, 0.4), 180, 2);
    grp.add(glow);
    grp.userData.gemVis = { mesh: mesh, glow: glow };
  } else {
    grp.userData.gemVis = { mesh: mesh, glow: null };
  }
  return grp;
}

/* Height of the room the beacon has to stand in. The pole and its ring are
   ~126cm tall and extraction is picked as the HIGHEST platform in the plan —
   on a 185cm fridge under a 270cm ceiling that put the ring a foot above the
   slab, so the goal marker read as a halo stuck through the roof. */
function ceilingClearance(y) {
  var ch = 0;
  (S.walls || []).forEach(function (w) {
    if (w && w.height > ch) ch = w.height;
  });
  if (!(ch > 0)) ch = 270;
  return Math.max(0, ch - y - 8);
}

function extractBeacon(clearance) {
  var pole = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 4.4, 110, 8),
    new THREE.MeshStandardMaterial({
      color: 0xf4c14a,
      emissive: new THREE.Color(0xffaa33),
      emissiveIntensity: 0.8,
      roughness: 0.4,
    })
  );
  pole.position.y = 55;
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(22, 2.2, 8, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffe08a,
      emissive: new THREE.Color(0xffcc55),
      emissiveIntensity: 1.2,
      roughness: 0.35,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 118;
  var light = new THREE.PointLight(0xffc14a, legacyIntensity(1.1, 420, 2, 0.3), 420, 2);
  light.position.y = 110;
  var grp = new THREE.Group();
  grp.add(pole);
  grp.add(ring);
  grp.add(light);
  grp.userData.extractVis = { ring: ring, light: light };
  if (clearance != null) grp.scale.setScalar(clamp(clearance / 126, 0.34, 1));
  return grp;
}

/* A flat ring laid on the ledge the player should be heading for. The siren
   is the one moment in the run when the right move is not obvious — you are on
   the floor, everything is lit from below, and the clock is draining. */
function buildStepGuide() {
  var geo = new THREE.RingGeometry(26, 34, 28);
  geo.rotateX(-Math.PI / 2);
  var mat = new THREE.MeshBasicMaterial({
    color: 0xffe08a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
}

export function stepGuide(step, show, time) {
  var m = L.stepMesh;
  if (!m) return;
  m.visible = !!(show && step && step.rc);
  if (!m.visible) return;
  var rc = step.rc;
  m.position.set((rc.x0 + rc.x1) / 2, rc.y1 + 2.5, (rc.z0 + rc.z1) / 2);
  var span = Math.max(30, Math.min(rc.x1 - rc.x0, rc.z1 - rc.z0));
  var pulse = 1 + 0.11 * Math.sin(time * 6);
  m.scale.setScalar((span / 68) * pulse);
  m.material.opacity = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(time * 6));
}

/* The web line. A drawn line would be one pixel wide at any distance, and at
   quarter scale that reads as a scratch on the lens rather than a rope, so it
   is a thin cylinder aimed from the hand to the anchor every frame. */
export function buildWebLine() {
  var geo = new THREE.CylinderGeometry(0.55, 0.55, 1, 5, 1, true);
  geo.translate(0, 0.5, 0); // grows from its base, so it can be aimed and scaled
  var mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xf6f9ff, transparent: true, opacity: 0.92, fog: false })
  );
  mesh.renderOrder = 5;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

export function updateWebLine(from, to) {
  var m = L.webMesh;
  if (!m) return;
  if (!from || !to) {
    m.visible = false;
    return;
  }
  _webVec.set(to.x - from.x, to.y - from.y, to.z - from.z);
  var len = _webVec.length();
  if (!(len > 0.5)) {
    m.visible = false;
    return;
  }
  m.visible = true;
  m.position.set(from.x, from.y, from.z);
  m.quaternion.setFromUnitVectors(_webUp, _webVec.divideScalar(len));
  m.scale.set(1, len, 1);
}

/* Tallest wall in the plan — the height a web can be anchored at, and the top
   of every wall the runner can crawl up. */
export function wallTop() {
  var ch = 0;
  (S.walls || []).forEach(function (w) {
    if (w && w.height > ch) ch = w.height;
  });
  return ch > 0 ? ch : 270;
}

export function sndWeb() {
  var ctx = audioCtx();
  if (!ctx || !L.audio) return;
  var o = ctx.createOscillator();
  var g = envGain(0.14, 0.14);
  if (!g) return;
  o.type = "sawtooth";
  o.frequency.setValueAtTime(1650, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.11);
  var f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1200;
  f.Q.value = 1.6;
  o.connect(f);
  f.connect(g);
  o.start();
  o.stop(ctx.currentTime + 0.16);
  trackNode(o, 0.16);
}

export function buildGhostAvatar() {
  /* The replay marker has to read at a glance, and the molten grade leaves
     almost no light above waist height — lit rather than self-lit, the ghost
     came out as a near-black figure against a dark ceiling. It carries its
     own light instead, so it is legible wherever it happens to be running. */
  var mat = new THREE.MeshStandardMaterial({
    color: 0x8fd4ff,
    emissive: new THREE.Color(0x3f9fd0),
    emissiveIntensity: 1.15,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    roughness: 0.55,
  });
  var grp = new THREE.Group();
  function part(geo, y, sy) {
    var m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    if (sy) m.scale.y = sy;
    m.castShadow = false;
    grp.add(m);
    return m;
  }
  part(new THREE.CylinderGeometry(11, 13, 78, 8), 95);
  part(new THREE.SphereGeometry(12, 10, 8), 148);
  part(new THREE.CylinderGeometry(4, 4, 46, 6), 108).position.x = 16;
  part(new THREE.CylinderGeometry(4, 4, 46, 6), 108).position.x = -16;
  part(new THREE.CylinderGeometry(5, 5, 52, 6), 42).position.x = 7;
  part(new THREE.CylinderGeometry(5, 5, 52, 6), 42).position.x = -7;
  grp.visible = false;
  grp.scale.setScalar(P_SCALE); // the replay is the same runner, same size
  grp.userData.ghostMat = mat;
  return grp;
}

export function layoutCourse(spec) {
  var bounds = interiorBounds() || { minx: -220, minz: -220, maxx: 220, maxz: 220 };
  var rects = (L.col && L.col.rects) || [];
  var segs = (L.col && L.col.segs) || [];
  var crates = emergencyCrates(bounds, highPlatformCount(rects), spec && spec.crates, segs);
  crates.forEach(function (c) { rects.push(c); });
  if (L.col) Col2D.buildSpatialIndex(L.col, 180);
  L.crates = crates;
  L.platforms = rects.slice();
  L.bounds = bounds;
  L.extract = pickExtraction(rects, segs);
  var gemN = spec && spec.gems != null ? spec.gems : 6;
  L.gems = placeGems(rects, L.extract, gemN, {
    isFree: function (x, z, y1) {
      var g = groundAt(x, z, y1 + 10, STEP);
      return Math.abs(g - y1) < 10;
    },
  });
  return { bounds: bounds, crates: crates };
}

/* Keep a run's own course alive across a scene rebuild. Gems already taken and
   the extraction point must NOT move — re-placing them would rewrite the race
   the player is in the middle of — but the crate spine is collision geometry
   living in col.rects, and a freshly built collision set has never heard of
   it. Without this the player falls straight through the crates they were
   standing on. */
export function relayoutAfterRebuild() {
  if (!L.col || !L.platforms || !L.platforms.length) return;
  (L.crates || []).forEach(function (c) { L.col.rects.push(c); });
  Col2D.buildSpatialIndex(L.col, 180);
  L.platforms = L.col.rects.slice();
}

export function spawnCourseMeshes(grp, spec, quality) {
  var laid = layoutCourse(spec);
  var detail = lavaDetail(quality);
  L.crates.forEach(function (c) { grp.add(crateMesh(c)); });
  L.gems.forEach(function (g) {
    var m = gemMesh(detail.gemLight);
    m.position.set(g.x, g.y, g.z);
    g.mesh = m;
    grp.add(m);
  });
  if (L.extract) {
    var b = extractBeacon(ceilingClearance(L.extract.y));
    b.position.set(L.extract.x, L.extract.y, L.extract.z);
    L.extract.mesh = b;
    grp.add(b);
  }
  var lava = buildLavaMesh(laid.bounds, quality);
  grp.add(lava);
  L.lavaMesh = lava;
  L.ghostMesh = buildGhostAvatar();
  grp.add(L.ghostMesh);
  L.stepMesh = buildStepGuide();
  grp.add(L.stepMesh);
  L.webMesh = buildWebLine();
  grp.add(L.webMesh);
  return laid;
}

export function stepCourseVisuals(dt, time, motion) {
  var spin = motion === false ? 0 : 1;
  L.gems.forEach(function (g, i) {
    if (!g.mesh) return;
    g.mesh.visible = !g.taken;
    if (g.taken) return;
    g.mesh.rotation.y += dt * 1.6 * spin;
    g.mesh.position.y = g.y + (spin ? Math.sin(time * 2.4 + i) * 5 : 0);
  });
  if (L.extract && L.extract.mesh) {
    var vis = L.extract.mesh.userData.extractVis;
    if (vis && spin) {
      vis.ring.rotation.z += dt * 1.1;
      vis.ring.scale.setScalar(1 + 0.08 * Math.sin(time * 3));
    }
  }
}

export function applyScorch(lavaY) {
  var dyn = getDynGroup();
  if (!dyn) return;
  dyn.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    var it = null, p = o;
    while (p && !it) {
      if (p.userData && p.userData.item) it = p.userData.item;
      p = p.parent;
    }
    if (!it) return;
    // a piece standing on another one is that much further from the melt
    var y1 = (it.elev || 0) + (it.h || 80);
    var amt = scorchAmount(y1, lavaY);
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(function (m) {
      if (!m.emissive) return;
      if (m.userData && m.userData._lvBase == null) {
        m.userData = m.userData || {};
        m.userData._lvBase = m.emissive.getHex();
        m.userData._lvInt = m.emissiveIntensity || 0;
      }
      if (amt < 0.02) {
        if (m.userData._lvBase != null) {
          m.emissive.setHex(m.userData._lvBase);
          m.emissiveIntensity = m.userData._lvInt;
        }
        return;
      }
      m.emissive.setRGB(0.55 * amt, 0.12 * amt, 0.02 * amt);
      m.emissiveIntensity = 0.2 + amt * 1.4;
    });
  });
}

export function clearScorch() {
  var dyn = getDynGroup();
  if (!dyn) return;
  dyn.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(function (m) {
      if (!m.userData || m.userData._lvBase == null) return;
      m.emissive.setHex(m.userData._lvBase);
      m.emissiveIntensity = m.userData._lvInt;
      delete m.userData._lvBase;
      delete m.userData._lvInt;
    });
  });
}

/* The molten grade.

   Setting fog and a dark background was not enough: the planner's daylight rig
   stayed exactly as it was — a 4.6 sun, a full IBL environment and the house's
   own practicals at tens of thousands of candela — so the room read as an
   overexposed showroom with an orange filter over it, and the lava's own light
   could not be seen at all against it. The floor being lava has to be the
   brightest thing in the room, which means everything else has to give way.

   The hemisphere light does the real work: its GROUND colour lights surfaces
   from below, so tinting that molten and the sky half near-black turns the
   whole flat into something lit by the floor.

   Split from enterHeat() for the same reason Night Shift splits its own grade:
   rebuild3D() re-applies the planner's daylight environment wholesale, so this
   has to be re-appliable — while the snapshot below it must be taken exactly
   once, or the second call would "restore" the grade on exit. */
export function applyHeatGrade() {
  var scene = getMainScene(),
    renderer = getRenderer(),
    rig = getRigLights();
  if (!scene) return;
  scene.fog = new THREE.FogExp2(0x1a0603, 0.00115);
  scene.background = new THREE.Color(0x0b0402);
  scene.environment = null; // no soft daylight IBL fill
  if (renderer) renderer.toneMappingExposure = 0.74;
  if (rig.sun) {
    rig.sun.intensity = LUX * 0.05;
    rig.sun.color.setHex(0xff7a3a);
    rig.sun.castShadow = false;
  }
  if (rig.hemi) {
    rig.hemi.intensity = LUX * 0.16;
    rig.hemi.color.setHex(0x2a0d06); // sky half: almost nothing comes from above
    rig.hemi.groundColor.setHex(0xff5316); // ground half: the melt below
  }
  if (rig.fill) {
    rig.fill.intensity = LUX * 0.04;
    rig.fill.color.setHex(0x50202c);
  }
  // The sky dome is an unlit basic mesh, so nothing above touches it — without
  // this every window stays a rectangle of afternoon.
  if (rig.sky && rig.sky.material) {
    rig.sky.material.color.setHex(0x30100a);
    rig.sky.material.needsUpdate = true;
  }
  (L.practicals || []).forEach(function (pr) {
    // the house is losing power, not throwing a dinner party
    pr.l.intensity = pr.i0 * 0.12;
  });
}

/* House lamps live in the dynamic group and are rebuilt with it, so they are
   re-harvested rather than remembered across a rebuild. */
function harvestPracticals() {
  var dyn = getDynGroup();
  L.practicals = [];
  if (!dyn) return;
  dyn.traverse(function (o) {
    if (o.isLight && o.intensity > 0) L.practicals.push({ l: o, i0: o.intensity });
  });
}

export function enterHeat() {
  var scene = getMainScene();
  var renderer = getRenderer();
  var rig = getRigLights();
  if (!scene) return;
  L.prevGfx = {
    fog: scene.fog,
    bg: scene.background,
    env: scene.environment,
    exposure: renderer ? renderer.toneMappingExposure : 1,
    sunI: rig.sun ? rig.sun.intensity : 0,
    sunC: rig.sun ? rig.sun.color.getHex() : 0,
    sunShadow: rig.sun ? rig.sun.castShadow : false,
    hemiI: rig.hemi ? rig.hemi.intensity : 0,
    hemiSky: rig.hemi ? rig.hemi.color.getHex() : 0,
    hemiGnd: rig.hemi ? rig.hemi.groundColor.getHex() : 0,
    fillI: rig.fill ? rig.fill.intensity : 0,
    fillC: rig.fill ? rig.fill.color.getHex() : 0,
    skyCol: rig.sky && rig.sky.material ? rig.sky.material.color.getHex() : null,
  };
  harvestPracticals();
  applyHeatGrade();
  /* The grade is not a one-shot. applyEnv() is the planner's own lighting
     pass and it lands whenever it likes — the first entry of the session
     finishes the initial build's pass AFTER this one, which put the whole mode
     back into daylight: sun at full, the IBL env map regenerated, exposure at
     1.12, every practical back to party brightness. Re-grade after every
     relight for as long as the mode is up. */
  if (L.unrelight) L.unrelight();
  L.unrelight = onRelight(reheatAfterRebuild);
}

/* After rebuild3D the grade is gone and every practical is a new object.
   Re-harvest at their FULL rebuilt intensity, then re-apply — the exit
   snapshot above is untouched, so leaving still restores the planner's own. */
export function reheatAfterRebuild() {
  if (!L.prevGfx) return;
  harvestPracticals();
  applyHeatGrade();
}

export function exitHeat() {
  // first, before any early return: a hook left registered would keep
  // re-grading the planner's scene for the rest of the session
  if (L.unrelight) {
    L.unrelight();
    L.unrelight = null;
  }
  var scene = getMainScene();
  var renderer = getRenderer();
  var rig = getRigLights();
  if (!scene || !L.prevGfx) return;
  var sv = L.prevGfx;
  scene.fog = sv.fog;
  scene.background = sv.bg;
  scene.environment = sv.env;
  if (renderer && sv.exposure != null) renderer.toneMappingExposure = sv.exposure;
  if (rig.sun) {
    rig.sun.intensity = sv.sunI;
    rig.sun.color.setHex(sv.sunC);
    rig.sun.castShadow = sv.sunShadow;
  }
  if (rig.hemi) {
    rig.hemi.intensity = sv.hemiI;
    rig.hemi.color.setHex(sv.hemiSky);
    rig.hemi.groundColor.setHex(sv.hemiGnd);
  }
  if (rig.fill) {
    rig.fill.intensity = sv.fillI;
    rig.fill.color.setHex(sv.fillC);
  }
  if (rig.sky && rig.sky.material && sv.skyCol != null) {
    rig.sky.material.color.setHex(sv.skyCol);
    rig.sky.material.needsUpdate = true;
  }
  (L.practicals || []).forEach(function (pr) {
    pr.l.intensity = pr.i0;
  });
  L.practicals = [];
  L.prevGfx = null;
  /* The snapshot is only as good as the moment it was taken, and on the first
     entry of a session that moment is mid-build — its `env` was still null
     because the map had not been generated yet. Restoring it verbatim leaves
     the planner with no image-based lighting until something else happens to
     relight; one pass puts the real sky, exposure and shadows back. */
  applyEnv();
}

export function spawnPlayer() {
  var bounds = interiorBounds();
  var x = 0, z = 0;
  if (bounds) {
    x = (bounds.minx + bounds.maxx) / 2;
    z = (bounds.minz + bounds.maxz) / 2;
  }
  // beside a climbable step once the course exists; the centre of the plan is
  // only the fallback, and what the briefing camera uses before the layout
  var start = pickSpawn(L.platforms, bounds, L.extract);
  if (start) {
    x = start.x;
    z = start.z;
  }
  var spot = freeSpot(x, z, P_RAD + 4) || { x: x, z: z };
  var g = groundAt(spot.x, spot.z, 40, STEP);
  return { x: spot.x, y: Math.max(0, g), z: spot.z };
}

/* ---- audio: siren, rumble, gem chime, burn ---- */
function audioCtx() {
  if (L.audio && L.audio.ctx) return L.audio.ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  var ctx = new AC();
  var master = ctx.createGain();
  master.gain.value = busGains(1, vol()).master;
  master.connect(ctx.destination);
  L.audio = { ctx: ctx, master: master, nodes: [] };
  return ctx;
}

function vol() {
  var s = L.settings;
  return s && Number.isFinite(s.volume) ? s.volume / 100 : 0.7;
}

export function audioOpen() {
  var ctx = audioCtx();
  if (!ctx) return;
  try { ctx.resume && ctx.resume(); } catch (e) {}
  if (L.audio.master) L.audio.master.gain.value = vol();
}

export function audioClose() {
  if (!L.audio) return;
  (L.audio.nodes || []).forEach(function (e) {
    var n = e && e.node ? e.node : e;
    try { n.stop && n.stop(); } catch (err) {}
    try { n.disconnect && n.disconnect(); } catch (err) {}
  });
  try { L.audio.ctx && L.audio.ctx.close && L.audio.ctx.close(); } catch (e) {}
  L.audio = null;
}

export function applyAudioVolume() {
  if (L.audio && L.audio.master) L.audio.master.gain.value = busGains(1, vol()).master;
}

function pruneAudioNodes() {
  if (!L.audio || !L.audio.ctx) return;
  var now = L.audio.ctx.currentTime;
  L.audio.nodes = (L.audio.nodes || []).filter(function (e) {
    var node = e && e.node ? e.node : e;
    var until = e && e.until;
    if (typeof until === "number" && until < now) {
      try { node.disconnect && node.disconnect(); } catch (err) {}
      return false;
    }
    return !!node;
  });
}

function trackNode(node, dur) {
  if (!L.audio || !node) return;
  pruneAudioNodes();
  L.audio.nodes.push({
    node: node,
    until: L.audio.ctx.currentTime + (dur || 1) + 0.08,
  });
}

function envGain(dur, peak) {
  var ctx = audioCtx();
  if (!ctx || !L.audio) return null;
  var g = ctx.createGain();
  var voice = busGains(peak, 1).voice;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(voice, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  g.connect(L.audio.master);
  return g;
}

export function sndSiren() {
  var ctx = audioCtx();
  if (!ctx || !L.audio) return;
  var o = ctx.createOscillator();
  var g = envGain(1.1, 0.22);
  if (!g) return;
  o.type = "sawtooth";
  o.frequency.setValueAtTime(620, ctx.currentTime);
  o.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.45);
  o.frequency.linearRampToValueAtTime(540, ctx.currentTime + 1.05);
  var f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1400;
  o.connect(f);
  f.connect(g);
  o.start();
  o.stop(ctx.currentTime + 1.12);
  trackNode(o, 1.12);
}

export function sndGem() {
  var ctx = audioCtx();
  if (!ctx || !L.audio) return;
  var o = ctx.createOscillator();
  var g = envGain(0.28, 0.2);
  if (!g) return;
  o.type = "sine";
  o.frequency.setValueAtTime(880, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
  o.connect(g);
  o.start();
  o.stop(ctx.currentTime + 0.3);
}

export function sndExtract() {
  var ctx = audioCtx();
  if (!ctx || !L.audio) return;
  [523, 659, 784].forEach(function (f, i) {
    var o = ctx.createOscillator();
    var g = envGain(0.45, 0.16);
    if (!g) return;
    o.type = "triangle";
    o.frequency.value = f;
    o.connect(g);
    o.start(ctx.currentTime + i * 0.07);
    o.stop(ctx.currentTime + 0.5 + i * 0.07);
  });
}

export function sndBurn() {
  var ctx = audioCtx();
  if (!ctx || !L.audio) return;
  var buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  var src = ctx.createBufferSource();
  src.buffer = buf;
  var f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 600;
  var g = envGain(0.4, 0.35);
  if (!g) return;
  src.connect(f);
  f.connect(g);
  src.start();
}

export function sndLand() {
  var ctx = audioCtx();
  if (!ctx || !L.audio) return;
  var o = ctx.createOscillator();
  var g = envGain(0.08, 0.08);
  if (!g) return;
  o.type = "sine";
  o.frequency.value = 140;
  o.connect(g);
  o.start();
  o.stop(ctx.currentTime + 0.09);
}

export function startRumble() {
  var ctx = audioCtx();
  if (!ctx || !L.audio || L.audio.rumble) return;
  var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  var src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  var f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 180;
  var g = ctx.createGain();
  g.gain.value = 0.0001;
  src.connect(f);
  f.connect(g);
  g.connect(L.audio.master);
  src.start();
  L.audio.rumble = { src: src, gain: g, filter: f };
  trackNode(src, 1e6);
}

export function stepRumble(heat, rising) {
  if (!L.audio || !L.audio.rumble) return;
  pruneAudioNodes();
  var target = (0.04 + heat * 0.14) * (rising ? 1 : 0.45);
  L.audio.rumble.gain.gain.setTargetAtTime(target, L.audio.ctx.currentTime, 0.12);
  L.audio.rumble.filter.frequency.setTargetAtTime(140 + heat * 220, L.audio.ctx.currentTime, 0.2);
}

export function stopRumble() {
  if (!L.audio || !L.audio.rumble) return;
  try {
    L.audio.rumble.gain.gain.setValueAtTime(0.0001, L.audio.ctx.currentTime);
  } catch (e) {}
}

export function stepGhostVisual(pose, show, fade) {
  var m = L.ghostMesh;
  if (!m) return;
  if (!show || !pose) {
    m.visible = false;
    if (m.userData.ghostMat) m.userData.ghostMat.opacity = 0.42;
    return;
  }
  m.visible = true;
  m.position.set(pose.x, pose.y, pose.z);
  m.rotation.y = pose.yaw;
  if (m.userData.ghostMat)
    m.userData.ghostMat.opacity = 0.42 * clamp(fade == null ? 1 : fade, 0, 1);
}

export function disposeGroup(grp) {
  if (!grp) return;
  grp.traverse(function (o) {
    if (o.geometry && o.geometry.dispose && !o.isSprite) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        m.dispose && m.dispose();
      });
    }
  });
}
