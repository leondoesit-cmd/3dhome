// Drive-mode graphics: time-of-day presets, procedural sky, IBL, sun rig.
//
// One-way dependency by design: this module never imports drive.js. The three
// things it needs from the world/traffic side (ground height under the focus
// point, the focus point itself, per-material night switching, vehicle lights)
// arrive through setSkyHooks(), so there is no import cycle to reason about.
import * as THREE from "three";
import { LUX } from "./gpu.js";
import { D, SHADOW_HALF } from "./drive_state.js";
import { setCarEnvMap, setCarMeshNightFn } from "./drive_car_mesh.js";
import { prefilterInto } from "./sky_model.js";

const hooks = {
  focusPos: () => ({ x: 0, z: 0 }),
  surfaceY: () => 0,
  applyNightMat: () => {},
  syncVehicleLights: () => {},
  syncLamps: () => {},
  syncBloom: () => {},
  bldMats: [],
};
export function setSkyHooks(h) {
  Object.assign(hooks, h);
}

// ---- graphics: sky, sun, atmosphere, image-based lighting ------------------
// Three time-of-day presets — T cycles them. One preset re-grades the whole
// world: the sky shader, the sun rig, the fog, the tone-mapping exposure, the
// prefiltered environment the car paint reflects, and the night dressing
// (headlights, lit windows).
export const TOD = [
  {
    key: "dr_tod_day",
    zen: 0x2f6ec4, hor: 0xc4dcf0, gnd: 0x59604f,
    sunC: 0xfff3dc, sunI: 1.25,
    skyC: 0x9cc3e8, gndC: 0x585440, hemiI: 0.45,
    dir: [0.36, 0.66, -0.66],
    fog: 0xb2cee6, near: 340, far: 2500,
    exposure: 1.0, cloud: 0.5, night: 0,
  },
  {
    key: "dr_tod_dusk",
    zen: 0x25407e, hor: 0xf6a45c, gnd: 0x40382e,
    sunC: 0xffb070, sunI: 1.2,
    skyC: 0xdb9160, gndC: 0x3a3226, hemiI: 0.4,
    dir: [0.86, 0.17, -0.48],
    fog: 0xd99a6a, near: 200, far: 1900,
    exposure: 1.05, cloud: 0.62, night: 0,
  },
  {
    key: "dr_tod_night",
    zen: 0x05080f, hor: 0x131e31, gnd: 0x0b0d12,
    sunC: 0x93a9d6, sunI: 0.45,
    skyC: 0x2c3f5e, gndC: 0x0e1016, hemiI: 0.42,
    dir: [-0.42, 0.6, -0.58],
    fog: 0x0b1422, near: 60, far: 1250,
    exposure: 1.22, cloud: 0.4, night: 1,
  },
];

// Painted sky: the same picture the old GLSL dome drew — vertical gradient,
// sun disc + halo + scatter, a cloud deck that converges toward the horizon,
// and stars at night — but rasterised into an equirectangular CANVAS instead of
// a fragment shader.
//
// Why: a raw ShaderMaterial does not survive the WebGPU backend. The node
// builder rejects it ("Material 'ShaderMaterial' is not compatible", once per
// frame) and the mesh renders flat — the sky kept a washed-out gradient and
// silently lost its sun, clouds and stars. A canvas costs one paint per
// time-of-day switch instead of a 4-octave fbm per pixel per FRAME, and looks
// identical on both backends.
const SKY_W = 1024,
  SKY_H = 512,
  CLOUD_W = 512,
  CLOUD_H = 256;
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6)));
  return t * t * (3 - 2 * t);
}
// the same value-noise fbm the shader used, so the cloud shapes are unchanged
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = x - ix,
    fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy),
    b = hash2(ix + 1, iy),
    c = hash2(ix, iy + 1),
    d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a + (a - b + d - c) * fx) * fy;
}
function fbm(x, y) {
  let sum = 0,
    amp = 0.5;
  for (let i = 0; i < 4; i++) {
    sum += amp * vnoise(x, y);
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
function ensureSkyCanvas() {
  if (D.skyCanvas) return;
  D.skyCanvas = document.createElement("canvas");
  D.skyCanvas.width = SKY_W;
  D.skyCanvas.height = SKY_H;
  D.skyTex = new THREE.CanvasTexture(D.skyCanvas);
  D.skyTex.colorSpace = THREE.SRGBColorSpace;
  D.cloudCanvas = document.createElement("canvas");
  D.cloudCanvas.width = CLOUD_W;
  D.cloudCanvas.height = CLOUD_H;
  D.cloudTex = new THREE.CanvasTexture(D.cloudCanvas);
  D.cloudTex.colorSpace = THREE.SRGBColorSpace;
  D.cloudTex.wrapS = THREE.RepeatWrapping;
}
// Sphere UVs: canvas row 0 is the zenith (flipY puts the top row at uv.y = 1),
// and three builds x = -cos(2πu)·sinθ, z = sin(2πu)·sinθ.
function skyRowElevation(py, h) {
  return Math.cos((Math.PI * py) / (h - 1));
}
function sunUV(dir) {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  let u = Math.atan2(d.z, -d.x) / (Math.PI * 2);
  u = ((u % 1) + 1) % 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, d.y)));
  return { u, v: theta / Math.PI, theta, d };
}
export function paintSky() {
  ensureSkyCanvas();
  const p = TOD[D.todIdx];
  const x = D.skyCanvas.getContext("2d");
  const zen = new THREE.Color(p.zen),
    hor = new THREE.Color(p.hor),
    gnd = new THREE.Color(p.gnd),
    sunC = new THREE.Color(p.sunC);
  const c = new THREE.Color();
  x.globalCompositeOperation = "source-over";
  x.globalAlpha = 1;
  for (let py = 0; py < SKY_H; py++) {
    const h = skyRowElevation(py, SKY_H);
    c.copy(hor).lerp(zen, Math.pow(Math.max(h, 1e-4), 0.55));
    const g = smoothstep(0, -0.1, h); // ground tone below the horizon
    if (g > 0) c.lerp(gnd, g);
    x.fillStyle = "#" + c.getHexString();
    x.fillRect(0, py, SKY_W, 1);
  }
  // stars first, so the sun's glow paints over them
  if (p.night) {
    x.fillStyle = "#d2e0ff";
    for (let i = 0; i < 1100; i++) {
      const py = hash2(i, 3.7) * SKY_H * 0.52;
      const h = skyRowElevation(py, SKY_H);
      const a = (0.3 + hash2(i, 11.3) * 0.7) * smoothstep(0.06, 0.45, h);
      if (a <= 0.02) continue;
      x.globalAlpha = a;
      x.fillRect(hash2(i, 5.1) * SKY_W, py, 1.3, 1.3);
    }
    x.globalAlpha = 1;
  }
  // sun: wide scatter, tight halo, hard disc — drawn three times across the
  // seam so a sun near u=0 is not sliced in half, and stretched horizontally
  // by 1/sinθ because equirect squeezes the sky as it climbs
  const sun = sunUV(p.dir);
  const sx = sun.u * SKY_W,
    sy = sun.v * SKY_H;
  const stretch = 1 / Math.max(0.28, Math.sin(sun.theta));
  const hexSun = "#" + sunC.getHexString();
  x.globalCompositeOperation = "lighter";
  const blob = (r, alpha) => {
    if (alpha <= 0.002) return;
    for (let k = -1; k <= 1; k++) {
      x.save();
      x.translate(sx + k * SKY_W, sy);
      x.scale(stretch, 1);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, hexSun);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.globalAlpha = alpha;
      x.fillStyle = g;
      x.fillRect(-r, -r, r * 2, r * 2);
      x.restore();
    }
  };
  blob(SKY_W * 0.3, p.night ? 0.05 : 0.16); // scatter across the sky
  blob(62, 0.55); // halo
  blob(15, 0.95); // disc
  x.globalCompositeOperation = "source-over";
  x.globalAlpha = 1;
  D.skyTex.needsUpdate = true;
  if (D.envTex) D.envTex.needsUpdate = true;
  paintClouds(p, sun);
}
function paintClouds(p, sun) {
  const x = D.cloudCanvas.getContext("2d");
  const img = x.createImageData(CLOUD_W, CLOUD_H);
  const lit = new THREE.Color(p.hor).lerp(new THREE.Color(0xffffff), 0.5);
  const dim = p.night ? 0.22 : 1;
  for (let py = 0; py < CLOUD_H; py++) {
    const el = skyRowElevation(py, CLOUD_H);
    const band = smoothstep(0.015, 0.5, el); // thin out toward the horizon haze
    if (el <= 0.012 || band <= 0) continue;
    const ce = Math.sqrt(Math.max(0, 1 - el * el));
    // Dividing by the elevation is what makes the deck converge toward the
    // horizon. The shader's 0.5 scale left the zenith sampling less than ONE
    // noise cell — a flat, empty sky — so the deck is wound up until it reads:
    // measured coverage 5% → 26% of the dome.
    const k = Math.max(el, 0.12);
    for (let px = 0; px < CLOUD_W; px++) {
      const az = (px / CLOUD_W) * Math.PI * 2;
      const dx = -Math.cos(az) * ce,
        dz = Math.sin(az) * ce;
      const f = fbm((dx / k) * 1.8 + 12.3, (dz / k) * 1.8 + 4.7);
      const cover = smoothstep(0.4, 0.72, f) * p.cloud * band;
      if (cover <= 0.004) continue;
      // clouds facing the sun pick up its light, same falloff as the shader
      const sd = Math.max(0, dx * sun.d.x + el * sun.d.y + dz * sun.d.z);
      const brightness = (0.62 + 0.65 * Math.pow(sd, 7)) * dim;
      const o = (py * CLOUD_W + px) * 4;
      img.data[o] = Math.min(255, lit.r * 255 * brightness);
      img.data[o + 1] = Math.min(255, lit.g * 255 * brightness);
      img.data[o + 2] = Math.min(255, lit.b * 255 * brightness);
      img.data[o + 3] = Math.min(1, cover) * 255;
    }
  }
  x.putImageData(img, 0, 0);
  D.cloudTex.needsUpdate = true;
}
// Two domes: the painted sky, and the cloud deck on a slightly smaller sphere
// that turns slowly — rotating the mesh IS the cloud drift, and it costs one
// matrix update instead of a per-pixel time offset.
export function buildSky() {
  ensureSkyCanvas();
  paintSky();
  D.sky = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 48, 32),
    new THREE.MeshBasicMaterial({
      map: D.skyTex, side: THREE.BackSide, depthWrite: false, fog: false,
    }),
  );
  D.sky.frustumCulled = false;
  D.sky.renderOrder = -2;
  D.scene.add(D.sky);
  D.skyClouds = new THREE.Mesh(
    new THREE.SphereGeometry(2560, 48, 24),
    new THREE.MeshBasicMaterial({
      map: D.cloudTex, side: THREE.BackSide, transparent: true,
      depthWrite: false, fog: false,
    }),
  );
  D.skyClouds.frustumCulled = false;
  D.skyClouds.renderOrder = -1;
  D.scene.add(D.skyClouds);
}
export function skyFollow(dt) {
  if (!D.sky) return;
  D.sky.position.copy(D.camera.position);
  if (D.skyClouds) {
    D.skyClouds.position.copy(D.camera.position);
    D.skyClouds.rotation.y += dt * 0.0055; // wind
  }
}
// Reflection environment for the car paint and glass: a 3-stop equirect
// gradient (zenith → horizon → ground) with a sun blob painted in, prefiltered
// by PMREM. Costly, so it only runs on a time-of-day switch, never per frame.
// (Prefiltering the sky *scene* would be prettier, but fromScene() on a custom
// shader material comes back unusable here — this canvas path is the one the
// main viewer already ships.)
export function buildEnv() {
  if (!D.renderer) return;
  ensureSkyCanvas();
  // A second texture over the SAME canvas: `map` ignores texture.mapping, but
  // PMREM needs the equirect mapping, and one texture cannot be both.
  if (!D.envTex) {
    D.envTex = new THREE.CanvasTexture(D.skyCanvas);
    D.envTex.mapping = THREE.EquirectangularReflectionMapping;
    D.envTex.colorSpace = THREE.SRGBColorSpace;
  }
  D.envTex.needsUpdate = true;
  // PMREM prefiltering throws on a renderer whose backend has not initialised
  // yet (it is async since r185). Bail out rather than burn the attempt — drive.js
  // re-runs applyTOD once the backend is live.
  if (!D.renderer.initialized) return;
  try {
    if (!D.pmrem) D.pmrem = new THREE.PMREMGenerator(D.renderer);
    /* Into the target the cars already hold (see prefilterInto): same
       texture, new pixels. A new target per switch re-keyed every car
       material, and three rebuilt their shaders on the next frame. */
    const rt = prefilterInto(D.pmrem, D.envTex, D.envRT);
    if (rt === D.envRT) return;
    // A new target only when the size changed. Do NOT dispose the outgoing
    // one here. WebGPU still has its cubeUv texture bound in bind groups that
    // are in flight; destroying it in the same tick raises "Destroyed texture
    // used in a submit" on every following frame and the picture freezes on
    // the spot (pressing T at night did it every time). Retire it a beat
    // later, once every material has been rebuilt against the new one.
    if (D.envRT) envRetire.push({ rt: D.envRT, at: performance.now(), frame: D.frameNo || 0 });
    D.envRT = rt;
    setCarEnvMap(D.envRT);
  } catch (_) {}
}

// outgoing PMREM targets waiting out their last frames (see buildEnv)
const envRetire = [];
const ENV_RETIRE_MS = 1200;
const ENV_RETIRE_FRAMES = 3;
export function envRetireTick(now) {
  // Frames, not just wall time: what makes an old target safe to destroy is
  // that the frames referencing it have finished. A tab whose rAF is paused
  // (or several rebuilds inside one tick) would otherwise hit the timer with
  // the texture still bound.
  while (
    envRetire.length &&
    now - envRetire[0].at > ENV_RETIRE_MS &&
    (D.frameNo || 0) - envRetire[0].frame > ENV_RETIRE_FRAMES
  )
    envRetire.shift().rt.dispose();
}
export function applyTOD(i) {
  D.todIdx = ((i % TOD.length) + TOD.length) % TOD.length;
  const p = TOD[D.todIdx];
  D.sun.color.setHex(p.sunC);
  D.sun.intensity = LUX * p.sunI;
  D.hemi.color.setHex(p.skyC);
  D.hemi.groundColor.setHex(p.gndC);
  D.hemi.intensity = LUX * p.hemiI;
  D.scene.fog.color.setHex(p.fog);
  D.scene.fog.near = p.near;
  D.scene.fog.far = p.far;
  D.renderer.toneMappingExposure = p.exposure;
  hooks.bldMats.forEach((m) => hooks.applyNightMat(m, !!p.night)); // windows on/off
  D.vehicles.forEach(hooks.syncVehicleLights);
  hooks.syncLamps(); // street lamps burn from dusk
  hooks.syncBloom(); // and bleed harder against a dark sky
  if (D.ses && D.ses.ghosts)
    Object.values(D.ses.ghosts).forEach((g) => {
      const L = g.mesh.userData.lamps;
      if (!L) return;
      L.beams.visible = !!p.night;
      L.head.emissiveIntensity = p.night ? 2.6 : 0.4;
      L.tail.emissiveIntensity = p.night ? 1.1 : 0.3;
    });
  paintSky(); // gradient, sun, stars and clouds are all baked per preset
  buildEnv();
}
export function isNight() {
  return TOD[D.todIdx].night > 0.5;
}
setCarMeshNightFn(isNight);
// The sun tracks whoever we're following so the shadow frustum stays tight
// (it only has to cover what the chase cam can see). The target snaps to the
// shadow map's texel grid, otherwise every shadow edge crawls as you drive.
export function sunFollow() {
  envRetireTick(performance.now());
  const fp = hooks.focusPos();
  const p = TOD[D.todIdx];
  const texel = (SHADOW_HALF * 2) / (D.sun.shadow.mapSize.x || 2048);
  const gx = Math.round(fp.x / texel) * texel,
    gz = Math.round(fp.z / texel) * texel;
  const gy = hooks.surfaceY(fp.x, fp.z);
  D.sun.target.position.set(gx, gy, gz);
  D.sun.position.set(gx + p.dir[0] * 240, gy + p.dir[1] * 240, gz + p.dir[2] * 240);
  D.sun.target.updateMatrixWorld();
}

