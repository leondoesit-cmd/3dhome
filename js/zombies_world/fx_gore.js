/* Night Shift FX: quality, fire and particles, blood, flesh chunks, severing,
   gibs, tracers and decals, split out of js/zombies_world.js. It shares the
   editor's state through live imports from ../zombies_world.js. */
import * as THREE from "three";
import { Discard, Fn, attribute, float, mix, positionGeometry, positionLocal, positionView, screenDPR, sin, smoothstep, texture, vec2, vec3, vec4 } from "three/tsl";
import { legacyIntensity } from "../gpu.js";
import { clamp } from "../state.js";
import { GRAV, STEP, Z, rnd, rr } from "../zombies_state.js";
import { fleshMat } from "../zombies_world/atmosphere.js";
import { instancedQuad, noRaycast, organicDecalGeometry } from "../zombies_world/textures.js";
import { boneMat, boxGeo, cy, ownsGeo, sp, sphGeo, stumpMat } from "../zombies_world/zombie_build.js";
import {
  NO_RAYCAST, TEX, _gibMat, _gibPos, _gibQuat, _gibScl, groundAt, nsQuality,
} from "../zombies_world.js";

export function initFX() {
  var g = Z.grp;
  // --- particles: one Points system, two visual classes via per-vertex color
  var N = 1200;
  var geo = instancedQuad(N);
  var pos = new Float32Array(N * 3),
    col = new Float32Array(N * 3),
    siz = new Float32Array(N);
  for (var i = 0; i < N; i++) pos[i * 3 + 1] = -99999;
  // Instance attributes are prefixed so they cannot collide with the quad's own
  // `position`/`uv`. stepFX writes these arrays directly, by name.
  geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute("iCol", new THREE.InstancedBufferAttribute(col, 3));
  geo.setAttribute("iSize", new THREE.InstancedBufferAttribute(siz, 1));
  // INSTANCED SPRITES, not THREE.Points. three's own PointsNodeMaterial docs
  // are explicit: "WebGPU only supports point primitives with 1 pixel size...
  // If an application wants to render points with a size larger than 1 pixel,
  // the material should be used with Sprite and instancing." So on the WebGPU
  // backend a Points cloud is invisible (1px dots) no matter what sizeNode says
  // — which is why the blood and the flamethrower rendered as nothing useful.
  // PointsNodeMaterial on a MESH, not SpriteNodeMaterial. The billboard-quad
  // expansion (setupVertexSprite) lives in PointsNodeMaterial and runs for any
  // object that is NOT isPoints. SpriteNodeMaterial has no setupVertex at all,
  // so the quad stays at its raw 1cm local size and is invisible at any range.
  var mat = new THREE.PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  mat.positionNode = attribute("iPos"); // per-instance billboard centre
  var partDist = positionView.z.negate().max(1);
  // Faithful port of the original gl_PointSize. setupVertexSprite ends with
  //   pointSize = sizeNode * screenDPR          (sizeAttenuation off)
  // and pointSize is in PHYSICAL pixels — the same units gl_PointSize used — so
  // dividing by screenDPR here cancels three's multiply and reproduces the old
  // `size * 380 / dist` exactly, keeping the hand-tuned particle scale.
  mat.sizeAttenuation = false;
  mat.sizeNode = attribute("iSize").mul(380).div(partDist).div(screenDPR);
  mat.colorNode = Fn(function () {
    // Derive the unit-quad coordinates from local position. Besides avoiding
    // an unnecessary vertex attribute, this also keeps the WebGPU node path
    // from asking for `uv` on an instanced particle carrier.
    var puv = positionLocal.xy.add(vec2(0.5));
    var d = puv.sub(vec2(0.5)).length();
    var tx = texture(TEX.spray, puv);
    // GLSL smoothstep with edge0 > edge1 is undefined; written as an explicit
    // inverted ramp instead of relying on driver leniency.
    var vA = smoothstep(180, 2200, partDist).oneMinus();
    Discard(tx.a.lessThan(0.02).or(d.greaterThan(0.5)));
    var soft = smoothstep(0.15, 0.5, d).oneMinus();
    var a = tx.a.mul(soft).mul(vA);
    return vec4(attribute("iCol").mul(a.mul(0.45).add(0.55)), a);
  })();
  var pts = new THREE.Mesh(geo, mat);
  pts.frustumCulled = false;
  noRaycast(pts);
  g.add(pts);
  Z.parts = {
    pts: pts,
    geo: geo,
    n: N,
    activeN: N,
    head: 0,
    life: new Float32Array(N),
    max: new Float32Array(N),
    vx: new Float32Array(N),
    vy: new Float32Array(N),
    vz: new Float32Array(N),
    gr: new Float32Array(N),
    s0: new Float32Array(N),
    c0: new Float32Array(N * 3),
  };

  // Fire has its own additive pool. Reusing the blood/dust shader made flames
  // read as sparse grey dots; these particles have a tapered, white-hot core
  // and a soft orange crown, so both the jet and burning bodies stay legible.
  var FN = 720;
  var fg = instancedQuad(FN);
  var fp = new Float32Array(FN * 3),
    fs = new Float32Array(FN),
    fh = new Float32Array(FN),
    fa = new Float32Array(FN);
  for (var fi = 0; fi < FN; fi++) fp[fi * 3 + 1] = -99999;
  fg.setAttribute("iPos", new THREE.InstancedBufferAttribute(fp, 3));
  fg.setAttribute("iSize", new THREE.InstancedBufferAttribute(fs, 1));
  fg.setAttribute("iHeat", new THREE.InstancedBufferAttribute(fh, 1));
  fg.setAttribute("iAlpha", new THREE.InstancedBufferAttribute(fa, 1));
  // Same TSL port as the blood pool above — this one is the flamethrower jet
  // and burning bodies, which is why the fire weapons rendered as junk.
  var fm = new THREE.PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  fm.positionNode = attribute("iPos");
  fm.sizeAttenuation = false;
  var fireDist = positionView.z.negate().max(1);
  // .max(1/dpr): the original clamped gl_PointSize (physical px) to 1
  fm.sizeNode = attribute("iSize").mul(420).div(fireDist).div(screenDPR).max(float(1).div(screenDPR));
  fm.colorNode = Fn(function () {
    var puv = positionLocal.xy.add(vec2(0.5));
    var y = puv.y;
    var x = puv.x.sub(0.5).abs();
    var vHeat = attribute("iHeat");
    var vAlpha = attribute("iAlpha");
    // tapered flame: narrow at the tip, wide at the base
    var width = mix(float(0.12), float(0.47), y.oneMinus());
    var edge = smoothstep(width.mul(0.62), width, x).oneMinus();
    var cap = smoothstep(0.0, 0.12, y).mul(smoothstep(0.72, 1.0, y).oneMinus());
    var flick = sin(puv.x.mul(17).add(puv.y.mul(29)).add(vHeat.mul(19))).mul(0.16).add(0.84);
    var mask = edge.mul(cap).mul(flick).mul(vAlpha);
    Discard(mask.lessThan(0.015));
    var orange = vec3(1.0, 0.16, 0.015);
    var yellow = vec3(1.0, 0.62, 0.035);
    var white = vec3(1.0, 0.94, 0.58);
    var col = mix(orange, yellow, smoothstep(0.12, 0.62, vHeat));
    col = mix(col, white, smoothstep(0.62, 1.0, vHeat).mul(smoothstep(0.08, 0.38, x).oneMinus()));
    return vec4(col.mul(mask).mul(1.55), mask.mul(0.9));
  })();
  var fpts = new THREE.Mesh(fg, fm);
  fpts.frustumCulled = false;
  fpts.renderOrder = 12;
  noRaycast(fpts);
  g.add(fpts);
  Z.fireParts = {
    pts: fpts, geo: fg, n: FN, activeN: FN, head: 0,
    life: new Float32Array(FN), max: new Float32Array(FN),
    vx: new Float32Array(FN), vy: new Float32Array(FN), vz: new Float32Array(FN),
    s0: new Float32Array(FN), heat0: new Float32Array(FN),
  };

  // --- tracers: a fixed pool of fading line segments
  var TN = 64;
  var tg = new THREE.BufferGeometry();
  var tp = new Float32Array(TN * 6),
    tc = new Float32Array(TN * 6);
  tg.setAttribute("position", new THREE.BufferAttribute(tp, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(tc, 3));
  var tl = new THREE.LineSegments(
    tg,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    })
  );
  tl.frustumCulled = false;
  noRaycast(tl);
  g.add(tl);
  Z.tracers = { m: tl, geo: tg, n: TN, head: 0, life: new Float32Array(TN) };

  // --- blood decals: lit, organically clipped stains rather than unlit quads
  var DN = 96;
  var decals = [];
  for (var d = 0; d < DN; d++) {
    var dmat = new THREE.MeshStandardMaterial({
      map: TEX.blood[d % TEX.blood.length],
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.045,
      opacity: 0.92,
      roughness: 0.48,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    var m = new THREE.Mesh(organicDecalGeometry(d + 11, 16), dmat);
    m.visible = false;
    m.renderOrder = 3;
    noRaycast(m);
    g.add(m);
    decals.push(m);
  }
  Z.decals = { list: decals, head: 0, activeN: DN };

  /* --- bullet holes: their own ring buffer, deliberately NOT sharing the
     blood pool. Two differences carry the whole effect:
       * the material is LIT. Blood is unlit on purpose (it should stay vivid
         in the dark), but an unlit grey mark keeps its own brightness while
         the wall around it swings with the flashlight, and the eye reads
         anything that ignores the light as pasted on. A standard material
         means the hole darkens and glints exactly like the plaster it is in.
       * the quad sits 0.35cm off the surface instead of 1.4. At the range you
         actually inspect a wall, 1.4cm of parallax is visible as the mark
         sliding over the surface as you strafe. polygonOffset, not distance,
         is what keeps it out of z-fighting. */
  var IN = 48;
  var impacts = [];
  for (var q = 0; q < IN; q++) {
    var imat = new THREE.MeshStandardMaterial({
      map: TEX.impact[q % TEX.impact.length],
      transparent: true,
      alphaTest: 0.025,
      roughness: 0.95,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    var im = new THREE.Mesh(organicDecalGeometry(q + 101, 13), imat);
    im.visible = false;
    im.renderOrder = 2; // under blood — a wall gets shot before it gets bled on
    noRaycast(im);
    g.add(im);
    impacts.push(im);
  }
  Z.impacts = { list: impacts, head: 0, activeN: IN };

  // --- dust motes: the flashlight beam needs something to catch
  var MN = 440,
    mg = instancedQuad(MN),
    mp = new Float32Array(MN * 3),
    mc = new Float32Array(MN * 3);
  for (var k = 0; k < MN; k++) {
    mp[k * 3] = rr(-700, 700);
    mp[k * 3 + 1] = rr(0, 280);
    mp[k * 3 + 2] = rr(-700, 700);
    var warm = rnd() < 0.35;
    mc[k * 3] = warm ? 1 : 0.72;
    mc[k * 3 + 1] = warm ? 0.92 : 0.82;
    mc[k * 3 + 2] = warm ? 0.7 : 1;
  }
  // Instanced sprites, like the particle pools above: a 3px Points cloud is
  // 1px dots on WebGPU. PointsNodeMaterial keeps PointsMaterial's size and
  // sizeAttenuation meaning; the old vertex colour and sprite map become a
  // per-instance colour times the spray texture across the quad.
  mg.setAttribute("iPos", new THREE.InstancedBufferAttribute(mp, 3));
  mg.setAttribute("iCol", new THREE.InstancedBufferAttribute(mc, 3));
  var moteMat = new THREE.PointsNodeMaterial({
    size: 3.1,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    alphaTest: 0.02,
  });
  moteMat.positionNode = attribute("iPos");
  moteMat.colorNode = vec4(attribute("iCol"), 1).mul(
    texture(TEX.spray, positionGeometry.xy.add(vec2(0.5)))
  );
  var motes = new THREE.Mesh(mg, moteMat);
  motes.frustumCulled = false;
  noRaycast(motes);
  g.add(motes);
  Z.motes = { m: motes, geo: mg, n: MN, activeN: MN, phase: 0 };
  setFXDensity((Z.settings && Z.settings.fx ? Z.settings.fx : 50) / 100);
}

export function setFXDensity(value) {
  var k = clamp(Number(value) || 0.5, 0.25, 1);
  // FX is its own accessibility/gameplay setting, but render quality must
  // still be able to reduce the per-frame particle and decal draw load.
  // Previously the fixed minima kept Fast drawing almost the same amount of
  // fire as High (and made the graphics slider look ineffective).
  var visual = clamp(k * (Z.qualityFxScale == null ? 1 : Z.qualityFxScale), 0.1, 1);
  Z.fxDensity = visual;
  var q = nsQuality();
  var partMin = q === 0 ? 32 : 100;
  var fireMin = q === 0 ? 24 : 100;
  var moteMin = q === 0 ? 24 : 70;
  if (Z.parts) {
    Z.parts.activeN = Math.max(partMin, Math.round(Z.parts.n * visual));
    if (Z.parts.geo) Z.parts.geo.instanceCount = Z.parts.activeN;
  }
  if (Z.fireParts) {
    Z.fireParts.activeN = Math.max(fireMin, Math.round(Z.fireParts.n * visual));
    if (Z.fireParts.geo) Z.fireParts.geo.instanceCount = Z.fireParts.activeN;
  }
  if (Z.decals) Z.decals.activeN = Math.max(q === 0 ? 8 : 16, Math.round(Z.decals.list.length * visual));
  if (Z.impacts) Z.impacts.activeN = Math.max(q === 0 ? 6 : 12, Math.round(Z.impacts.list.length * visual));
  if (Z.motes) {
    Z.motes.activeN = Math.max(moteMin, Math.round(Z.motes.n * visual));
    Z.motes.geo.instanceCount = Z.motes.activeN;
  }
}

function applyZedShadowQuality(root) {
  if (!root) return;
  var shadows = (Z.renderQuality || 0) > 0;
  root.traverse(function (o) {
    if (!o.isMesh) return;
    // Preserve the detail trim's deliberate shadow exclusions.  The setting
    // only switches off work that was otherwise going to be rendered.
    if (o.userData.zShadow == null) o.userData.zShadow = !!o.castShadow;
    o.castShadow = shadows && o.userData.zShadow;
  });
}

// Night Shift has a moving flashlight and a large pile of alpha/instanced FX
// that are outside the planner's generic renderer preset.  Give the in-game
// slider ownership of those costs too, so Fast is materially faster instead
// of merely changing a canvas option.
export function setNightShiftQuality(value) {
  var quality = Math.round(clamp(Number(value) || 0, 0, 2));
  Z.renderQuality = quality;
  Z.qualityFxScale = [0.45, 0.72, 1][quality];

  if (Z.flash) {
    var size = quality === 2 ? 1024 : 512;
    Z.flash.sp.castShadow = quality > 0;
    Z.flash.sp.shadow.mapSize.set(size, size);
    Z.flash.volumetric = quality > 0;
    if (Z.flash.cone) Z.flash.cone.visible = Z.flash.volumetric;
    if (Z.flash.fill) {
      Z.flash.fill.intensity = quality === 0 ? legacyIntensity(1.15, 220) : legacyIntensity(0.55, 140);
      Z.flash.fill.distance = quality === 0 ? 220 : 140;
    }
  }
  Z.zeds.forEach(function (zed) { applyZedShadowQuality(zed.rig && zed.rig.root); });
  setFXDensity((Z.settings && Z.settings.fx ? Z.settings.fx : 50) / 100);
}

export function spawnFirePart(x, y, z, vx, vy, vz, size, life, heat) {
  var F = Z.fireParts;
  if (!F || rnd() > Math.max(0.55, Z.fxDensity || 0.5)) return;
  var i = F.head;
  F.head = (F.head + 1) % (F.activeN || F.n);
  F.life[i] = F.max[i] = life;
  F.vx[i] = vx;
  F.vy[i] = vy;
  F.vz[i] = vz;
  F.s0[i] = size;
  F.heat0[i] = heat == null ? 1 : heat;
  var p = F.geo.attributes.iPos.array;
  p[i * 3] = x;
  p[i * 3 + 1] = y;
  p[i * 3 + 2] = z;
}

export function spawnPart(x, y, z, vx, vy, vz, size, r, g, b, life, grav) {
  var P = Z.parts;
  if (!P) return;
  if (rnd() > (Z.fxDensity || 0.5)) return;
  var i = P.head;
  P.head = (P.head + 1) % (P.activeN || P.n);
  P.life[i] = life;
  P.max[i] = life;
  P.vx[i] = vx;
  P.vy[i] = vy;
  P.vz[i] = vz;
  P.gr[i] = grav;
  P.s0[i] = size;
  P.c0[i * 3] = r;
  P.c0[i * 3 + 1] = g;
  P.c0[i * 3 + 2] = b;
  var pa = P.geo.attributes.iPos.array;
  pa[i * 3] = x;
  pa[i * 3 + 1] = y;
  pa[i * 3 + 2] = z;
}

export function bloodBurst(x, y, z, dx, dy, dz, amount) {
  for (var i = 0; i < amount; i++) {
    var sp = rr(70, 420);
    var mist = rnd() < 0.35;
    spawnPart(
      x + rr(-4, 4), y + rr(-3, 3), z + rr(-4, 4),
      (dx + rr(-0.75, 0.75)) * sp,
      (dy + rr(-0.15, 0.95)) * sp * (mist ? 0.55 : 1),
      (dz + rr(-0.75, 0.75)) * sp,
      mist ? rr(2.4, 7.5) : rr(1.4, 5.8),
      rr(0.42, 0.72), rr(0.01, 0.05), rr(0.02, 0.06),
      mist ? rr(0.35, 0.8) : rr(0.55, 1.45),
      GRAV * (mist ? 0.55 : 1.15)
    );
  }
}
export function goreChunks(x, y, z, amount) {
  for (var i = 0; i < amount; i++) {
    spawnPart(
      x, y, z,
      rr(-220, 220), rr(80, 380), rr(-220, 220),
      rr(5, 14),
      rr(0.28, 0.55), rr(0.03, 0.08), rr(0.04, 0.09),
      rr(1.0, 2.2),
      GRAV * 1.3
    );
  }
}
export function sparkBurst(x, y, z, nx, ny, nz, amount, warm) {
  for (var i = 0; i < amount; i++) {
    spawnPart(
      x, y, z,
      (nx + rr(-0.55, 0.55)) * rr(60, 320),
      (ny + rr(-0.25, 0.85)) * rr(60, 320),
      (nz + rr(-0.55, 0.55)) * rr(60, 320),
      rr(1.0, 3.2),
      warm ? 1 : 0.7, warm ? 0.78 : 0.68, warm ? 0.32 : 0.72,
      rr(0.2, 0.55),
      GRAV * 0.55
    );
  }
}
/* Pulverised plaster/board off a bullet strike: slow, near-weightless grey
   motes that hang in the flashlight cone for a moment. Sparks alone read as
   metal, which made every wall hit look like a ricochet off a girder. */
export function dustBurst(x, y, z, nx, ny, nz, amount) {
  for (var i = 0; i < amount; i++) {
    var g = rr(0.32, 0.5);
    spawnPart(
      x, y, z,
      (nx + rr(-0.7, 0.7)) * rr(18, 90),
      (ny + rr(-0.2, 0.9)) * rr(18, 90),
      (nz + rr(-0.7, 0.7)) * rr(18, 90),
      rr(2.2, 6),
      g, g * 0.95, g * 0.88,
      rr(0.3, 0.75),
      GRAV * 0.14
    );
  }
}
export function boneBurst(x, y, z, amount) {
  for (var i = 0; i < amount; i++) {
    spawnPart(
      x, y, z,
      rr(-160, 160), rr(40, 260), rr(-160, 160),
      rr(2.2, 5.5),
      rr(0.75, 0.95), rr(0.7, 0.88), rr(0.55, 0.72),
      rr(0.7, 1.4),
      GRAV * 1.1
    );
  }
}

export function ensureGibs() {
  if (!Z.gibs) Z.gibs = [];
}

export function clearGibs() {
  if (!Z.gibs) return;
  Z.gibs.forEach(function (g) {
    if (!g || !g.mesh) return;
    if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
    g.mesh.traverse(function (o) {
      if (o.isMesh && o.geometry && o.userData && o.userData.gibOwnedGeo) o.geometry.dispose();
    });
  });
  Z.gibs = [];
}

// Reparent a limb/head group into world space, keeping its pose.
export function detachToWorld(obj) {
  if (!obj || !Z.grp) return null;
  obj.updateWorldMatrix(true, true);
  _gibMat.copy(obj.matrixWorld);
  _gibMat.decompose(_gibPos, _gibQuat, _gibScl);
  if (obj.parent) obj.parent.remove(obj);
  Z.grp.add(obj);
  obj.position.copy(_gibPos);
  obj.quaternion.copy(_gibQuat);
  obj.scale.copy(_gibScl);
  obj.updateMatrixWorld(true);
  // severed parts no longer count as living hit targets
  obj.traverse(function (o) {
    if (!o.userData) o.userData = {};
    o.userData.zed = true; // zedOf treats `true` as non-entity
    o.userData.gib = true;
    o.userData.part = null;
    o.raycast = NO_RAYCAST;
    if (o.isMesh && o.geometry) o.userData.gibOwnedGeo = ownsGeo(o.geometry);
  });
  return obj;
}

// Soft stretch of flesh strands at the cut plane for a brief moment.
export function fleshStrings(x, y, z, dx, dy, dz, amount) {
  var len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  for (var i = 0; i < amount; i++) {
    var side = rr(-40, 40),
      up = rr(-20, 50);
    spawnPart(
      x + rr(-6, 6),
      y + rr(-4, 4),
      z + rr(-6, 6),
      dx * rr(30, 90) + rr(-50, 50),
      dy * rr(20, 80) + up,
      dz * rr(30, 90) + rr(-50, 50),
      rr(3, 8),
      rr(0.45, 0.7),
      0.04,
      0.05,
      rr(0.25, 0.55),
      GRAV * 0.7
    );
  }
}

// Procedural meat chunk mesh (not a full limb) — blown flesh pieces.
export function spawnFleshChunk(x, y, z, vx, vy, vz, size, mode) {
  ensureGibs();
  if (Z.gibs.length > 48) {
    var old = Z.gibs.shift();
    if (old && old.mesh) {
      if (old.mesh.parent) old.mesh.parent.remove(old.mesh);
      old.mesh.traverse(function (o) {
        if (o.isMesh && o.geometry && o.userData.gibOwnedGeo) o.geometry.dispose();
      });
    }
  }
  var g = new THREE.Group();
  var s = size || rr(5, 14);
  var mat = stumpMat();
  var flesh = fleshMat((rnd() * 4) | 0);
  // irregular cluster of blobs
  var core = new THREE.Mesh(
    sphGeo(s * 0.55, 8, 6),
    flesh
  );
  core.scale.set(rr(0.7, 1.3), rr(0.6, 1.2), rr(0.7, 1.4));
  g.add(core);
  var n = 2 + ((rnd() * 3) | 0);
  for (var i = 0; i < n; i++) {
    var bit = new THREE.Mesh(
      boxGeo(s * rr(0.3, 0.7), s * rr(0.25, 0.55), s * rr(0.3, 0.7)),
      rnd() < 0.35 ? boneMat() : rnd() < 0.5 ? mat : flesh
    );
    bit.position.set(rr(-s, s) * 0.4, rr(-s, s) * 0.35, rr(-s, s) * 0.4);
    bit.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    g.add(bit);
  }
  // bloody stump face
  var stump = new THREE.Mesh(sphGeo(s * 0.35, 8, 6), mat);
  stump.position.set(0, s * 0.2, 0);
  g.add(stump);
  g.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = true;
      o.userData.gib = true;
      o.userData.zed = true;
      // the blob geometry now comes from the shared cache; only geometry this
      // gib actually owns may be disposed when it is recycled
      if (ownsGeo(o.geometry)) o.userData.gibOwnedGeo = true;
    }
  });
  g.position.set(x, y, z);
  noRaycast(g);
  Z.grp.add(g);
  var force = mode === "blow" ? 1.35 : 0.85;
  var gib = {
    mesh: g,
    x: x,
    y: y,
    z: z,
    vx: (vx + rr(-40, 40)) * force,
    vy: (vy + rr(40, 160)) * force,
    vz: (vz + rr(-40, 40)) * force,
    wx: rr(-10, 10),
    wy: rr(-8, 8),
    wz: rr(-10, 10),
    life: rr(4.5, 7.5),
    maxLife: 7,
    bounce: 0,
    settled: false,
    dripT: 0,
    mode: mode || "blow",
    owned: true,
  };
  Z.gibs.push(gib);
  return gib;
}

// Detach a living limb/head mesh and fling it as a gib.
// partKey: "armL"|"armR"|"legL"|"legR"|"head"|"leg" (both legs)
export function severPart(zd, partKey, dir, mode, forceMul) {
  if (!zd || !zd.rig || !Z.grp) return null;
  ensureGibs();
  mode = mode || "blow";
  forceMul = forceMul == null ? 1 : forceMul;
  var r = zd.rig;
  var targets = [];

  if (partKey === "leg") {
    if (zd.limbs.legL) targets.push({ key: "legL", obj: r.legL && r.legL.hip });
    if (zd.limbs.legR) targets.push({ key: "legR", obj: r.legR && r.legR.hip });
  } else if (partKey === "armL" && zd.limbs.armL) {
    targets.push({ key: "armL", obj: r.armL && r.armL.sh });
  } else if (partKey === "armR" && zd.limbs.armR) {
    targets.push({ key: "armR", obj: r.armR && r.armR.sh });
  } else if (partKey === "head" && zd.limbs.head) {
    targets.push({ key: "head", obj: r.head });
  } else if (partKey === "legL" && zd.limbs.legL) {
    targets.push({ key: "legL", obj: r.legL && r.legL.hip });
  } else if (partKey === "legR" && zd.limbs.legR) {
    targets.push({ key: "legR", obj: r.legR && r.legR.hip });
  }

  if (!targets.length) return null;

  var dx = (dir && dir.x) || 0,
    dy = (dir && dir.y) || 0.3,
    dz = (dir && dir.z) || 1;
  var dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;

  var last = null;
  targets.forEach(function (t, ti) {
    if (!t.obj || !t.obj.parent) return;
    // world position before detach (for FX)
    t.obj.updateWorldMatrix(true, true);
    var wp = new THREE.Vector3();
    t.obj.getWorldPosition(wp);

    var mesh = detachToWorld(t.obj);
    if (!mesh) return;

    // stump on the remaining body
    addStump(zd, t.key, wp);

    // mark limb gone
    zd.limbs[t.key] = false;
    if (t.key === "legL" || t.key === "legR") {
      if (!zd.limbs.legL && !zd.limbs.legR) {
        zd.crawler = true;
        zd.spd *= 0.75;
      }
    }
    if (t.key === "armL" || t.key === "armR") zd.dmg *= 0.72;
    if (t.key === "head") {
      // headless: eyes already on the flying head
      if (r.eyes) r.eyes = [];
    }

    // velocity profile by mode
    var base =
      mode === "cut"
        ? rr(180, 340)
        : mode === "explode"
        ? rr(380, 720)
        : rr(260, 520);
    base *= forceMul;
    // side scatter so multi-limb gibs fan out
    var side = (ti - (targets.length - 1) * 0.5) * 0.55;
    var sx = -dz * side + rr(-0.35, 0.35);
    var sz = dx * side + rr(-0.35, 0.35);
    var vx = (dx + sx) * base;
    var vy = (dy + (mode === "cut" ? 0.55 : 0.85) + rr(0.1, 0.5)) * base * 0.75;
    var vz = (dz + sz) * base;

    // spin: cut spins hard around the blade plane; blow tumbles chaotically
    var wx, wy, wz;
    if (mode === "cut") {
      wx = rr(-4, 4);
      wy = rr(8, 18) * (rnd() < 0.5 ? 1 : -1);
      wz = rr(-5, 5);
    } else {
      wx = rr(-14, 14);
      wy = rr(-12, 12);
      wz = rr(-14, 14);
    }

    // cap pool
    if (Z.gibs.length > 40) {
      var old = Z.gibs.shift();
      if (old && old.mesh && old.mesh.parent) old.mesh.parent.remove(old.mesh);
    }

    var gib = {
      mesh: mesh,
      x: wp.x,
      y: wp.y,
      z: wp.z,
      vx: vx,
      vy: vy,
      vz: vz,
      wx: wx,
      wy: wy,
      wz: wz,
      life: mode === "explode" ? rr(5, 8) : rr(5.5, 9),
      maxLife: 9,
      bounce: 0,
      settled: false,
      dripT: 0,
      mode: mode,
      part: t.key,
      owned: true, // we own disposal after detach
    };
    // snap mesh to exact world pos (detach already did)
    mesh.position.set(wp.x, wp.y, wp.z);
    Z.gibs.push(gib);
    last = gib;

    // FX at the cut
    bloodBurst(wp.x, wp.y, wp.z, dx, 0.4, dz, mode === "blow" || mode === "explode" ? 28 : 18);
    goreChunks(wp.x, wp.y, wp.z, mode === "explode" ? 12 : 8);
    fleshStrings(wp.x, wp.y, wp.z, dx, dy, dz, mode === "cut" ? 14 : 8);
    if (mode !== "cut") boneBurst(wp.x, wp.y, wp.z, 4);
    decal(wp.x, 0.8, wp.z, 0, 1, 0, rr(30, 60));

    // a few free meat chunks peel off the stump
    var chunks = mode === "explode" ? 5 : mode === "blow" ? 3 : 2;
    for (var c = 0; c < chunks; c++) {
      spawnFleshChunk(
        wp.x + rr(-8, 8),
        wp.y + rr(-6, 6),
        wp.z + rr(-8, 8),
        dx * rr(80, 280) + rr(-100, 100),
        rr(60, 280),
        dz * rr(80, 280) + rr(-100, 100),
        rr(4, 11),
        mode === "cut" ? "cut" : "blow"
      );
    }
  });

  return last;
}

function addStump(zd, key, worldHit) {
  var r = zd.rig;
  if (!r) return;
  var stump;
  if (key === "head") {
    stump = sp(r.neck, 6.2, 0, 12, 0, stumpMat(), "body", 10);
    // bone ring
    var bone = cy(r.neck, 4.2, 3.6, 4, 0, 10, 0, boneMat(), "body", 8);
    bone.position.y = 9;
  } else if (key === "armL") {
    stump = sp(r.torso, 6.5, -19, 56, 0, stumpMat(), "body", 10);
    sp(r.torso, 3.5, -19, 56, 2, boneMat(), "body", 6);
  } else if (key === "armR") {
    stump = sp(r.torso, 6.5, 19, 56, 0, stumpMat(), "body", 10);
    sp(r.torso, 3.5, 19, 56, 2, boneMat(), "body", 6);
  } else if (key === "legL" || key === "legR") {
    var sx = key === "legL" ? -1 : 1;
    stump = sp(r.torso, 7.5, sx * 10, 4, 2, stumpMat(), "body", 10);
    sp(r.torso, 4, sx * 10, 2, 2, boneMat(), "body", 6);
  }
  if (stump) {
    // pulse the stump briefly via scale (no shared-mat emissive)
    stump.userData.stumpPulse = 0.35;
  }
  // arterial spray from stump location
  if (worldHit) {
    bloodBurst(worldHit.x, worldHit.y, worldHit.z, 0, 1, 0, 10);
  }
}

// Full-body catastrophic break: every remaining limb flies off + torso chunks.
export function explodeBody(zd, dir, power) {
  if (!zd || !zd.rig) return;
  power = power || 1;
  var d = dir || { x: rr(-1, 1), y: 0.5, z: rr(-1, 1) };
  var order = ["head", "armL", "armR", "legL", "legR"];
  order.forEach(function (k, i) {
    if (!zd.limbs[k]) return;
    var ang = (i / order.length) * Math.PI * 2 + rr(-0.4, 0.4);
    var ld = {
      x: d.x * 0.5 + Math.sin(ang) * 0.85,
      y: 0.55 + rr(0, 0.4),
      z: d.z * 0.5 + Math.cos(ang) * 0.85,
    };
    severPart(zd, k, ld, "explode", power * rr(0.9, 1.25));
  });
  // torso meat explosion
  var tx = zd.x,
    ty = zd.y + 110,
    tz = zd.z;
  for (var i = 0; i < 10; i++) {
    spawnFleshChunk(
      tx + rr(-20, 20),
      ty + rr(-30, 40),
      tz + rr(-20, 20),
      rr(-400, 400),
      rr(120, 480),
      rr(-400, 400),
      rr(6, 16),
      "blow"
    );
  }
  bloodBurst(tx, ty, tz, 0, 1, 0, 40);
  goreChunks(tx, ty, tz, 22);
  boneBurst(tx, ty, tz, 12);
  decal(tx, 0.8, tz, 0, 1, 0, rr(80, 140));
  shake(0.55);
}

export function stepGibs(dt) {
  ensureGibs();
  if (!Z.gibs.length) return;
  for (var i = Z.gibs.length - 1; i >= 0; i--) {
    var g = Z.gibs[i];
    if (!g || !g.mesh) {
      Z.gibs.splice(i, 1);
      continue;
    }
    g.life -= dt;
    if (g.life <= 0) {
      if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
      if (g.owned) {
        g.mesh.traverse(function (o) {
          if (o.isMesh && o.geometry && o.userData.gibOwnedGeo) o.geometry.dispose();
        });
      }
      Z.gibs.splice(i, 1);
      continue;
    }

    if (!g.settled) {
      g.vy -= GRAV * 1.05 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;

      // floor bounce
      var floor = 4;
      try {
        floor = Math.max(4, groundAt(g.x, g.z, g.y, STEP));
      } catch (e) {}
      if (g.y < floor + 3) {
        g.y = floor + 3;
        if (Math.abs(g.vy) > 40) {
          g.vy *= -0.32;
          g.vx *= 0.55;
          g.vz *= 0.55;
          g.wx *= 0.6;
          g.wy *= 0.7;
          g.wz *= 0.6;
          g.bounce++;
          if (g.bounce === 1) {
            decal(g.x, floor + 0.6, g.z, 0, 1, 0, rr(18, 40));
            bloodBurst(g.x, g.y, g.z, 0, 0.4, 0, 6);
          }
        } else {
          g.vy = 0;
          g.vx *= 0.82;
          g.vz *= 0.82;
          g.wx *= 0.75;
          g.wy *= 0.75;
          g.wz *= 0.75;
          if (Math.hypot(g.vx, g.vz) < 12 && Math.hypot(g.wx, g.wy, g.wz) < 0.8) {
            g.settled = true;
            g.vx = g.vy = g.vz = 0;
            g.wx = g.wy = g.wz = 0;
          }
        }
      }

      // tumble
      g.mesh.rotation.x += g.wx * dt;
      g.mesh.rotation.y += g.wy * dt;
      g.mesh.rotation.z += g.wz * dt;
      g.mesh.position.set(g.x, g.y, g.z);

      // cut mode: slight stretch squash while spinning fast
      if (g.mode === "cut" && !g.settled) {
        var spin = Math.min(1.15, 0.9 + Math.hypot(g.wx, g.wy, g.wz) * 0.01);
        g.mesh.scale.setScalar(spin);
      }
    } else {
      g.mesh.position.set(g.x, g.y, g.z);
    }

    // arterial drip while flying / freshly landed
    g.dripT -= dt;
    if (g.dripT <= 0 && g.life > 1.2 && g.y > 10) {
      g.dripT = g.settled ? rr(0.12, 0.28) : rr(0.04, 0.1);
      spawnPart(
        g.x + rr(-4, 4),
        g.y + rr(-6, 2),
        g.z + rr(-4, 4),
        rr(-20, 20),
        rr(-80, -20),
        rr(-20, 20),
        rr(1.4, 3.5),
        rr(0.4, 0.65),
        0.02,
        0.03,
        rr(0.35, 0.7),
        GRAV * 1.2
      );
    }

    // fade scale near end of life
    if (g.life < 1.2) {
      var fade = Math.max(0.05, g.life / 1.2);
      g.mesh.scale.setScalar(fade);
    }
  }
}

export function tracer(x0, y0, z0, x1, y1, z1) {
  var T = Z.tracers;
  if (!T) return;
  var i = T.head;
  T.head = (T.head + 1) % T.n;
  T.life[i] = 0.09;
  var a = T.geo.attributes.position.array,
    c = T.geo.attributes.color.array;
  a[i * 6] = x0; a[i * 6 + 1] = y0; a[i * 6 + 2] = z0;
  a[i * 6 + 3] = x1; a[i * 6 + 4] = y1; a[i * 6 + 5] = z1;
  c[i * 6] = 1; c[i * 6 + 1] = 0.85; c[i * 6 + 2] = 0.45;
  c[i * 6 + 3] = 1; c[i * 6 + 4] = 0.6; c[i * 6 + 5] = 0.2;
  T.geo.attributes.position.needsUpdate = true;
  T.geo.attributes.color.needsUpdate = true;
}

export function decal(x, y, z, nx, ny, nz, size) {
  var D = Z.decals;
  if (!D) return;
  var m = D.list[D.head];
  D.head = (D.head + 1) % (D.activeN || D.list.length);
  m.visible = true;
  m.scale.set(size, size * rr(0.75, 1.2), 1);
  var n = new THREE.Vector3(nx, ny, nz).normalize();
  // polygonOffset handles z-fighting; a tiny physical offset avoids the
  // parallax that made the old 1.4cm-away card slide over a wall when strafing.
  m.position.set(x + n.x * 0.12, y + n.y * 0.12, z + n.z * 0.12);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  m.rotateZ(rnd() * 6.3);
  if (m.material && m.material.opacity != null) m.material.opacity = rr(0.72, 0.95);
}

/* A bullet hole. Round — the blood quad's 0.75–1.2 aspect jitter is right for
   a splatter and wrong here, since a stretched hole is the other giveaway that
   you are looking at a stamped image. Variety comes from the three textures
   and the spin instead. */
export function impactMark(x, y, z, nx, ny, nz, size) {
  var I = Z.impacts;
  if (!I) return;
  var m = I.list[I.head];
  I.head = (I.head + 1) % (I.activeN || I.list.length);
  m.visible = true;
  m.scale.set(size * rr(0.92, 1.08), size * rr(0.88, 1.12), 1);
  var n = new THREE.Vector3(nx, ny, nz).normalize();
  m.position.set(x + n.x * 0.08, y + n.y * 0.08, z + n.z * 0.08);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  m.rotateZ(rnd() * 6.3);
  if (m.material && m.material.opacity != null) m.material.opacity = rr(0.82, 1);
}

export function shake(amount) {
  Z.shake = Math.min(1.6, Z.shake + amount);
}

export function stepFX(dt) {
  var P = Z.parts;
  if (P) {
    var pa = P.geo.attributes.iPos.array,
      ca = P.geo.attributes.iCol.array,
      sa = P.geo.attributes.iSize.array,
      partDirty = false;
    for (var i = 0; i < (P.activeN || P.n); i++) {
      if (P.life[i] <= 0) {
        if (sa[i] !== 0) {
          sa[i] = 0;
          partDirty = true;
        }
        continue;
      }
      partDirty = true;
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        sa[i] = 0;
        // blood that lands leaves a small stain
        if (P.c0[i * 3] > 0.3 && P.c0[i * 3 + 1] < 0.1 && pa[i * 3 + 1] < 12 && rnd() < 0.28)
          decal(pa[i * 3], 0.7, pa[i * 3 + 2], 0, 1, 0, rr(14, 34));
        continue;
      }
      P.vy[i] -= P.gr[i] * dt;
      pa[i * 3] += P.vx[i] * dt;
      pa[i * 3 + 1] += P.vy[i] * dt;
      pa[i * 3 + 2] += P.vz[i] * dt;
      if (pa[i * 3 + 1] < 1.2) {
        pa[i * 3 + 1] = 1.2;
        P.vy[i] *= -0.24;
        P.vx[i] *= 0.5;
        P.vz[i] *= 0.5;
      }
      var k = P.life[i] / P.max[i];
      sa[i] = P.s0[i] * (0.45 + 0.55 * k);
      ca[i * 3] = P.c0[i * 3] * (0.35 + 0.65 * k);
      ca[i * 3 + 1] = P.c0[i * 3 + 1] * (0.35 + 0.65 * k);
      ca[i * 3 + 2] = P.c0[i * 3 + 2] * (0.35 + 0.65 * k);
    }
    // A quiet frame used to re-upload all three full 1,200-instance buffers
    // even though every size was already zero. Avoiding those idle transfers
    // removes a persistent GPU/driver cost between combat bursts.
    if (partDirty) {
      P.geo.attributes.iPos.needsUpdate = true;
      P.geo.attributes.iCol.needsUpdate = true;
      P.geo.attributes.iSize.needsUpdate = true;
    }
  }
  var F = Z.fireParts;
  if (F) {
    var fpa = F.geo.attributes.iPos.array,
      fsa = F.geo.attributes.iSize.array,
      fha = F.geo.attributes.iHeat.array,
      faa = F.geo.attributes.iAlpha.array,
      fireDirty = false;
    for (var f = 0; f < (F.activeN || F.n); f++) {
      if (F.life[f] <= 0) {
        if (fsa[f] !== 0) {
          fsa[f] = 0;
          fireDirty = true;
        }
        continue;
      }
      fireDirty = true;
      F.life[f] -= dt;
      if (F.life[f] <= 0) {
        fsa[f] = 0;
        continue;
      }
      var fk = F.life[f] / F.max[f];
      fpa[f * 3] += F.vx[f] * dt;
      fpa[f * 3 + 1] += F.vy[f] * dt;
      fpa[f * 3 + 2] += F.vz[f] * dt;
      // Hot fuel travels forward first; cooling fire curls upward and widens.
      F.vx[f] *= Math.max(0, 1 - dt * 1.9);
      F.vz[f] *= Math.max(0, 1 - dt * 1.9);
      F.vy[f] += 115 * dt;
      fsa[f] = F.s0[f] * (0.72 + (1 - fk) * 0.72);
      fha[f] = Math.max(0.05, F.heat0[f] * fk);
      faa[f] = Math.min(1, (1 - fk) * 5) * Math.min(1, fk * 3.2);
    }
    if (fireDirty) {
      F.geo.attributes.iPos.needsUpdate = true;
      F.geo.attributes.iSize.needsUpdate = true;
      F.geo.attributes.iHeat.needsUpdate = true;
      F.geo.attributes.iAlpha.needsUpdate = true;
    }
  }
  stepGibs(dt);
  var T = Z.tracers;
  if (T) {
    var live = false,
      tc = T.geo.attributes.color.array;
    for (var j = 0; j < T.n; j++) {
      if (T.life[j] <= 0) continue;
      T.life[j] -= dt;
      live = true;
      var kk = Math.max(0, T.life[j] / 0.09);
      tc[j * 6] = kk; tc[j * 6 + 1] = 0.85 * kk; tc[j * 6 + 2] = 0.45 * kk;
      tc[j * 6 + 3] = kk; tc[j * 6 + 4] = 0.6 * kk; tc[j * 6 + 5] = 0.2 * kk;
    }
    if (live) T.geo.attributes.color.needsUpdate = true;
  }
  // dust drifts and follows the player so the beam always has motes in it
  var M = Z.motes;
  if (M) {
    M.updateT = (M.updateT || 0) + dt;
    // Dust moves slowly. Updating and uploading its buffer at 20 Hz is smooth
    // in a flashlight beam and much kinder to mobile unified-memory GPUs.
    if (M.updateT >= 0.05) {
      var moteDt = M.updateT;
      M.updateT = 0;
      M.phase += moteDt * 0.35;
      var ma = M.geo.attributes.iPos.array,
        px = Z.p.x,
        pz = Z.p.z,
        moteScale = moteDt * 60;
      for (var q = 0; q < (M.activeN || M.n); q++) {
        ma[q * 3 + 1] += Math.sin(M.phase + q) * 0.22 * moteScale;
        ma[q * 3] += Math.cos(M.phase * 0.7 + q * 0.3) * 0.16 * moteScale;
        var dx = ma[q * 3] - px,
          dz = ma[q * 3 + 2] - pz;
        if (dx > 620) ma[q * 3] -= 1240;
        else if (dx < -620) ma[q * 3] += 1240;
        if (dz > 620) ma[q * 3 + 2] -= 1240;
        else if (dz < -620) ma[q * 3 + 2] += 1240;
        if (ma[q * 3 + 1] > 265) ma[q * 3 + 1] = 4;
        else if (ma[q * 3 + 1] < 2) ma[q * 3 + 1] = 262;
      }
      M.geo.attributes.iPos.needsUpdate = true;
    }
  }
  Z.shake = Math.max(0, Z.shake - dt * 2.6);
  Z.shakeV.x = (rnd() - 0.5) * Z.shake * 0.045;
  Z.shakeV.y = (rnd() - 0.5) * Z.shake * 0.045;
}

export { applyZedShadowQuality };
