/* Night Shift practical-light harvesting, horror grade and moon beams, split
   out of js/zombies_world.js. It shares the editor's state through live imports
   from ../zombies_world.js. */
import * as THREE from "three";
import { Fn, mix, positionLocal, sin, smoothstep, uniform, vec2, vec3, vec4 } from "three/tsl";
import { LUX, legacyIntensity } from "../gpu.js";
import { t } from "../i18n.js";
import { applyEnv, getDynGroup, getMainCamera, getMainScene, getRenderer, getRigLights } from "../view3d.js";
import { Z, hooks, rnd, rr } from "../zombies_state.js";
import { ensureTex } from "../zombies_world/textures.js";
import {
  FLASH_DECAY, FLASH_I, FLESH_SKINS, PRETTY_SKINS, TEX, Zmat, nsQuality,
} from "../zombies_world.js";

/* ===========================================================================
   4. HORROR GRADE — take over the lighting rig, keep the user's own lamps
   =========================================================================== */
/* Harvest the model's own lamps. They stay ON but become sick, low, flickery
   practicals: this is the "uses the lighting already in the model" bit.
   Split out of enterHorror because rebuild3D() (which destruction mode
   triggers to generate rigid bodies) replaces every light in `dyn` — the
   graded originals are gone and the fresh ones are at full planner brightness
   until they are re-harvested. */
export function harvestPracticals() {
  var dyn = getDynGroup();
  Z.lamps = [];
  var lampCap = nsQuality() >= 2 ? 8 : nsQuality() >= 1 ? 3 : 2;
  if (dyn)
    dyn.traverse(function (o) {
      if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
        if (Z.lamps.length >= lampCap) {
          o.intensity = 0;
          o.visible = false;
          return;
        }
        o.visible = true;
        Z.lamps.push({
          l: o,
          i0: o.intensity,
          c0: o.color.getHex(),
          d0: o.distance,
          // most practicals are dying; a couple burn steady
          mode: rnd() < 0.28 ? "steady" : rnd() < 0.6 ? "flicker" : rnd() < 0.84 ? "strobe" : "dead",
          ph: rnd() * 10,
          out: 0,
        });
        o.color.setHex(rnd() < 0.28 ? 0xff4a28 : rnd() < 0.55 ? 0xffc878 : 0xa8c4ff);
        // practicals must not light the whole flat: short throw, low output,
        // so the flashlight stays the thing you actually see by
        var shrunk = Math.min(o.distance || 420, 460) * 0.58;
        // Shrinking `distance` used to dim a light everywhere, because the old
        // falloff was (1 - d/D)^n — D was part of the brightness. Physical
        // lights only use it as a hard cutoff, so the same line no longer dims
        // anything and the practicals blew out to white. Re-apply the dimming
        // the throw change used to imply, on top of the artistic 0.38.
        var throwK = o.distance > 0 ? Math.pow(shrunk / o.distance, o.decay || 2) : 1;
        o.distance = shrunk;
        o.intensity *= 0.38 * throwK;
        if (o.decay != null) o.decay = 2;
      }
    });
  Z.emissives = [];
  if (dyn)
    dyn.traverse(function (o) {
      if (o.isMesh && o.material && o.material.userData && o.material.userData.glow)
        Z.emissives.push({ m: o.material, e0: o.material.emissiveIntensity });
    });
}

/* The scene-level night grade. Split from enterHorror (which snapshots what it
   is overwriting) because rebuild3D() re-applies the planner's daylight
   environment — fog, background and exposure all come back, and the flat turns
   into an overcast afternoon mid-wave. Re-applying is safe; re-saving is not. */
export function applyHorrorGrade() {
  var scene = getMainScene(),
    ren = getRenderer(),
    rig = getRigLights();
  var q = nsQuality();
  scene.fog = new THREE.FogExp2(0x03050a, q === 0 ? 0.00072 : 0.00095);
  scene.background = new THREE.Color(0x010205);
  ren.toneMappingExposure = q === 0 ? 0.62 : 0.48;
  if (rig.sun) {
    rig.sun.intensity = LUX * (q === 0 ? 0.08 : 0.045);
    rig.sun.color.setHex(0x7a92d4);
    rig.sun.castShadow = false;
  }
  if (rig.hemi) {
    rig.hemi.intensity = LUX * (q === 0 ? 0.14 : 0.07);
    rig.hemi.color.setHex(0x1a2848);
    rig.hemi.groundColor.setHex(0x04050a);
  }
  if (rig.fill) {
    rig.fill.intensity = LUX * (q === 0 ? 0.08 : 0.04);
    rig.fill.color.setHex(0x3a5c88);
  }
  if (rig.stars) rig.stars.visible = true;
  scene.environment = null;                    // no soft IBL fill — pure dark
  // The gradient sky dome is an unlit, unfogged basic mesh, so none of the
  // above touches it — it stays a pale daylight backdrop behind every window.
  // That never showed before (you could not see out); now that there is a
  // world out there, it has to be night out there too.
  if (rig.sky && rig.sky.material) {
    rig.sky.material.color.setHex(0x0a1020);
    rig.sky.material.needsUpdate = true;
  }

}

export function enterHorror() {
  var scene = getMainScene(),
    ren = getRenderer(),
    rig = getRigLights(),
    dyn = getDynGroup();
  Z.saved = {
    fog: scene.fog,
    bg: scene.background,
    exposure: ren.toneMappingExposure,
    sunI: rig.sun ? rig.sun.intensity : 0,
    sunC: rig.sun ? rig.sun.color.getHex() : 0,
    sunShadow: rig.sun ? rig.sun.castShadow : false,
    hemiI: rig.hemi ? rig.hemi.intensity : 0,
    hemiSky: rig.hemi ? rig.hemi.color.getHex() : 0,
    hemiGnd: rig.hemi ? rig.hemi.groundColor.getHex() : 0,
    fillI: rig.fill ? rig.fill.intensity : 0,
    fillC: rig.fill ? rig.fill.color.getHex() : 0,
    starsVis: rig.stars ? rig.stars.visible : false,
    skyCol: rig.sky && rig.sky.material ? rig.sky.material.color.getHex() : null,
    env: scene.environment,
  };
  applyHorrorGrade();
  harvestPracticals();

  // moonlight shafts through exterior windows
  buildMoonBeams();
}

export function exitHorror() {
  var scene = getMainScene(),
    ren = getRenderer(),
    rig = getRigLights(),
    sv = Z.saved;
  if (!sv) return;
  scene.fog = sv.fog;
  scene.background = sv.bg;
  scene.environment = sv.env;
  ren.toneMappingExposure = sv.exposure;
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
  if (rig.stars) rig.stars.visible = sv.starsVis;
  if (rig.sky && rig.sky.material && sv.skyCol != null) {
    rig.sky.material.color.setHex(sv.skyCol);
    rig.sky.material.needsUpdate = true;
  }
  Z.lamps.forEach(function (L) {
    L.l.intensity = L.i0;
    L.l.color.setHex(L.c0);
    L.l.distance = L.d0;
  });
  (Z.emissives || []).forEach(function (E) {
    E.m.emissiveIntensity = E.e0;
  });
  Z.lamps = [];
  Z.emissives = [];
  clearMoonBeams();
  Z.saved = null;
  try {
    applyEnv();
  } catch (e) {}
}

export function buildMoonBeams() {
  clearMoonBeams();
  if (!Z.col || !Z.grp) return;
  var beams = [];
  Z.col.windows.forEach(function (w, i) {
    if (i > 3) return;
    var H = 520 + rr(0, 180),
      R = (w.w || 100) * 0.42;
    var cg = new THREE.ConeGeometry(R, H, 18, 1, true);
    cg.rotateX(-Math.PI / 2);
    // aim inward along window normal
    // TSL port (see the particle pools above — raw ShaderMaterial cannot run on
    // WebGPURenderer). uI stays a live uniform so stepMoonBeams can pulse it.
    var uI = uniform(0.55 + rnd() * 0.35);
    var mat = new THREE.NodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.side = THREE.DoubleSide;
    mat.colorNode = Fn(function () {
      // The cone is rotated onto its side, so local -Z runs from its wide
      // window end to its tip. This avoids sampling a UV attribute that the
      // WebGPU node builder may not carry through an instanced render path.
      var beamU = positionLocal.z.negate().add(H / 2).div(H).clamp(0, 1);
      var a = beamU.oneMinus().pow(1.8).mul(0.09).mul(uI);
      return vec4(vec3(0.541, 0.651, 0.878).mul(a), a); // 0x8aa6e0
    })();
    mat.userData.uI = uI;
    var mesh = new THREE.Mesh(cg, mat);
    mesh.position.set(w.x + w.nx * (H * 0.35), (w.sill || 90) + (w.h || 120) * 0.35, w.z + w.nz * (H * 0.35));
    mesh.lookAt(w.x + w.nx * H, mesh.position.y - 40, w.z + w.nz * H);
    mesh.renderOrder = 1;
    Z.grp.add(mesh);
    beams.push({ mesh: mesh, light: null, ph: rnd() * 10 });
  });
  Z.moonBeams = beams;
}
export function clearMoonBeams() {
  if (!Z.moonBeams) return;
  Z.moonBeams.forEach(function (b) {
    if (b.mesh) {
      Z.grp && Z.grp.remove(b.mesh);
      b.mesh.geometry && b.mesh.geometry.dispose();
      b.mesh.material && b.mesh.material.dispose();
    }
    if (b.light) Z.grp && Z.grp.remove(b.light);
  });
  Z.moonBeams = null;
}
export function stepMoonBeams(dt) {
  if (!Z.moonBeams) return;
  Z.moonBeams.forEach(function (b) {
    b.ph += dt;
    var k = 0.85 + 0.15 * Math.sin(b.ph * 0.7 + Math.sin(b.ph * 0.21) * 2);
    // TSL uniform handles now live on material.userData (see buildMoonBeams)
    if (b.mesh && b.mesh.material.userData.uI) b.mesh.material.userData.uI.value = k;
    if (b.light) b.light.intensity = legacyIntensity(0.28 * k, b.light.distance);
  });
}

export function stepLamps(dt) {
  if (Z.blackout) {
    Z.lamps.forEach(function (L) {
      L.l.intensity = 0;
    });
    return;
  }
  Z.lamps.forEach(function (L) {
    L.ph += dt;
    var k = 1;
    if (L.mode === "flicker") {
      // brown-out sag + occasional dropout
      k = 0.55 + 0.45 * Math.sin(L.ph * 7.3 + Math.sin(L.ph * 2.1) * 3);
      if (L.out > 0) {
        L.out -= dt;
        k = 0.04;
      } else if (rnd() < dt * 0.5) L.out = rr(0.05, 0.35);
    } else if (L.mode === "strobe") {
      k = ((L.ph * 11) | 0) % 3 === 0 ? 1.25 : 0.12;
      if (rnd() < dt * 0.2) L.ph += rr(0.2, 0.7);
    } else if (L.mode === "dead") {
      // busted fitting: dark, with the odd arc-spark that lights the room for
      // a single frame — the cheapest jump-scare in the building
      k = 0;
      if (rnd() < dt * 0.35) k = rr(1.6, 3);
    } else {
      k = 0.86 + 0.14 * Math.sin(L.ph * 1.7);
    }
    // the model's own lamps stay recognisable but never light the whole flat
    var comfort = Z.settings && Z.settings.flashes != null ? Z.settings.flashes : 1;
    k = (L.mode === "dead" ? 0 : 0.75) * (1 - comfort) + k * comfort;
    L.l.intensity = L.i0 * 0.3 * k;
  });
  // wave-danger red pulse on the practicals when a horde is closing
  if (Z.wave && Z.wave.state === "fight" && Z.zeds.length) {
    var near = 1e9;
    for (var i = 0; i < Z.zeds.length; i++)
      if (!Z.zeds[i].dead) near = Math.min(near, Z.zeds[i].dist);
    if (near < 320) {
      var pulse = 0.5 + 0.5 * Math.sin(Z.t * 6) * (Z.settings && Z.settings.flashes != null ? Z.settings.flashes : 1);
      Z.lamps.forEach(function (L) {
        L.l.color.setRGB(1, 0.42 - 0.2 * pulse, 0.22 - 0.14 * pulse);
      });
    }
  }
}

/* ---- flashlight: shadow-casting spot + volumetric cone + dying battery ---- */
export function buildFlashlight() {
  var cam = getMainCamera();
  var sp = new THREE.SpotLight(0xfff2dc, FLASH_I, 1950, 0.4, 0.62, FLASH_DECAY);
  var quality = nsQuality();
  sp.castShadow = quality > 0;
  var shadowSize = quality === 2 ? 1024 : 512;
  sp.shadow.mapSize.set(shadowSize, shadowSize);
  sp.shadow.camera.near = 5;
  sp.shadow.camera.far = 2000;
  sp.shadow.bias = -0.0012;
  sp.shadow.normalBias = 1.8;
  sp.shadow.radius = 2.5;
  sp.position.set(8, -6, 1);
  var tgt = new THREE.Object3D();
  tgt.position.set(0, 0, -1000);
  cam.add(sp);
  cam.add(tgt);
  sp.target = tgt;

  // warm fill just in front of the lens so nearby geometry reads.
  // Fast has no shadows and fewer practicals, so the fill has to carry more.
  var fillI = quality === 0 ? 1.15 : 0.55,
    fillD = quality === 0 ? 220 : 140;
  var fill = new THREE.PointLight(0xffe8c8, legacyIntensity(fillI, fillD), fillD, 2);
  fill.position.set(6, -5, -18);
  cam.add(fill);

  // volumetric cone: apex at the lens, additive, soft falloff + dust noise
  var H = 1600,
    Rr = H * Math.tan(0.42);
  var cg = new THREE.ConeGeometry(Rr, H, 36, 1, true);
  cg.rotateX(Math.PI / 2);
  cg.translate(0, 0, -H / 2);
  // TSL port of the volumetric flashlight cone. uI (dip/flicker) and uT (dust
  // drift) stay live uniforms — stepFlashlight writes them every frame.
  var uH = uniform(H), uI = uniform(1), uT = uniform(0);
  var cm = new THREE.NodeMaterial();
  cm.transparent = true;
  cm.depthWrite = false;
  cm.blending = THREE.AdditiveBlending;
  cm.side = THREE.DoubleSide;
  cm.colorNode = Fn(function () {
    var vP = positionLocal;
    var u = vP.z.negate().div(uH).clamp(0, 1);
    var rad = vP.xy.length().div(uH.mul(0.42).mul(u).add(1).max(0.001));
    var edge = smoothstep(0.35, 1.0, rad).oneMinus();
    // cheap value hash, same as the GLSL original
    var h = sin(vP.xy.mul(0.1).add(uT.mul(0.15)).dot(vec2(127.1, 311.7))).mul(43758.5453).fract();
    var dust = h.mul(0.15).add(0.85);
    var a = u.oneMinus().pow(2.1).mul(smoothstep(0.0, 0.07, u)).mul(0.175).mul(uI).mul(edge).mul(dust);
    var c = mix(vec3(1.0, 0.95, 0.82), vec3(0.65, 0.74, 1.0), u.mul(u));
    return vec4(c.mul(a), a);
  })();
  cm.userData.uI = uI;
  cm.userData.uT = uT;
  var cone = new THREE.Mesh(cg, cm);
  cone.position.set(8, -6, 0);
  cone.renderOrder = 2;
  cone.frustumCulled = false;
  cam.add(cone);

  Z.flash = {
    sp: sp, fill: fill, cone: cone, mat: cm, on: true, batt: 100, flick: 0, dip: 0,
    volumetric: quality > 0,
  };
  cone.visible = Z.flash.volumetric;
}

export function stepFlashlight(dt) {
  var F = Z.flash;
  if (!F) return;
  if (F.on) F.batt = Math.max(0, F.batt - dt * 0.72);
  else F.batt = Math.min(100, F.batt + dt * 0.75);   // resting recovers a little
  var live = F.on && F.batt > 0;
  if (!live && F.on && F.batt <= 0) {
    F.on = false;
    hooks.say && hooks.say(t("z_flash_dead"), 1.6);
    hooks.sndClick && hooks.sndClick();
  }
  var k = live ? 1 : 0;
  if (live) {
    // low battery = stutter; getting hit = a hard dip
    var lowK = F.batt < 26 ? 1 : 0;
    F.flick += dt;
    if (lowK && rnd() < dt * 3.2) F.dip = rr(0.05, 0.28);
    if (F.dip > 0) {
      F.dip -= dt;
      k = 0.1;
    } else k = 1 - lowK * 0.25 * (0.5 + 0.5 * Math.sin(F.flick * 21));
    // slight aim sway on the cone
    if (F.cone) {
      F.cone.rotation.z = Math.sin(Z.t * 1.7) * 0.008;
      F.cone.rotation.x = Math.sin(Z.t * 1.1) * 0.006;
    }
  }
  F.sp.intensity = FLASH_I * k;
  if (F.fill) F.fill.intensity = legacyIntensity(0.55, 140) * k;
  F.mat.userData.uI.value = k;
  if (F.mat.userData.uT) F.mat.userData.uT.value = Z.t;
  F.cone.visible = F.volumetric && k > 0.02;
}

export function fleshMat(i) {
  var s = FLESH_SKINS[i % FLESH_SKINS.length];
  if (!Zmat.flesh[i])
    Zmat.flesh[i] = new THREE.MeshStandardMaterial({
      map: TEX.fleshMap,
      normalMap: TEX.fleshNorm || null,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: TEX.fleshRough || null,
      color: s.tint,
      roughness: s.rough,
      metalness: 0.02,
      envMapIntensity: 0.15,
    });
  return Zmat.flesh[i];
}
// Smooth attractive skin — used for the exposed skin under the clothing.
export function prettyMat(i) {
  ensureTex();
  var s = PRETTY_SKINS[i % PRETTY_SKINS.length];
  if (!Zmat.pretty[i])
    Zmat.pretty[i] = new THREE.MeshStandardMaterial({
      map: TEX.prettyMap,
      normalMap: TEX.prettyNorm || null,
      // pores and fine wrinkles only; a hard normal turns skin into orange peel
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: TEX.prettyRough || null,
      color: s.tint,
      roughness: s.rough,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
  return Zmat.pretty[i];
}
