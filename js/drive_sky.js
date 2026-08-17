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

const hooks = {
  focusPos: () => ({ x: 0, z: 0 }),
  surfaceY: () => 0,
  applyNightMat: () => {},
  syncVehicleLights: () => {},
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

// Procedural sky: vertical gradient + sun disc and glow + a drifting fbm cloud
// deck projected onto a plane above the camera (so clouds converge toward the
// horizon like a real overcast), plus stars at night. Also rendered into a
// tiny second scene that PMREM prefilters into the reflection environment.
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = `
precision highp float;
uniform vec3 uZen, uHor, uGnd, uSunC, uSunDir;
uniform float uCloud, uNight, uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sunD = normalize(uSunDir);
  // pow() bases are kept off zero: pow(0.0, n) is undefined in GLSL and some
  // drivers hand back NaN, which would poison the whole sky
  float sd = clamp(dot(d, sunD), 1e-4, 1.0);
  // gradient: horizon band lifts toward the zenith, ground tone below
  vec3 col = mix(uHor, uZen, pow(max(h, 1e-4), 0.55));
  col = mix(col, uGnd, smoothstep(0.0, -0.10, h));
  // sun: hard disc, tight halo, wide warm scatter across the sky
  col += uSunC * (smoothstep(0.9994, 0.99975, sd) * 2.2 + pow(sd, 90.0) * 0.55 +
                  pow(sd, 5.0) * 0.14 * (1.0 - uNight));
  if (uNight > 0.5 && h > 0.0) {
    // round pin-points, not the square cells a bare hash grid would give
    vec2 q = d.xz / max(h, 0.10) * 60.0;
    vec2 f = fract(q) - 0.5;
    float st = hash(floor(q));
    col += vec3(0.82, 0.88, 1.0) * step(0.9968, st) *
           smoothstep(0.16, 0.0, length(f)) * smoothstep(0.06, 0.45, h) * 1.5;
  }
  if (h > 0.012) {
    vec2 p = d.xz / max(h, 0.06);
    float f = fbm(p * 0.5 + vec2(uTime * 0.0055, uTime * 0.0031));
    float c = smoothstep(0.5, 0.86, f) * uCloud * smoothstep(0.015, 0.24, h);
    vec3 lit = mix(uHor, vec3(1.0), 0.5) * (0.62 + 0.65 * pow(sd, 7.0));
    col = mix(col, lit * mix(1.0, 0.22, uNight), clamp(c, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: D.skyUni,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}
// Reflection environment for the car paint and glass: a 3-stop equirect
// gradient (zenith → horizon → ground) with a sun blob painted in, prefiltered
// by PMREM. Costly, so it only runs on a time-of-day switch, never per frame.
// (Prefiltering the sky *scene* would be prettier, but fromScene() on a custom
// shader material comes back unusable here — this canvas path is the one the
// main viewer already ships.)
export function buildEnv() {
  if (!D.renderer) return;
  const p = TOD[D.todIdx];
  if (!D.envCanvas) {
    D.envCanvas = document.createElement("canvas");
    D.envCanvas.width = 128;
    D.envCanvas.height = 64;
    D.envTex = new THREE.CanvasTexture(D.envCanvas);
    D.envTex.mapping = THREE.EquirectangularReflectionMapping;
  }
  const x = D.envCanvas.getContext("2d");
  const hex = (h) => "#" + new THREE.Color(h).getHexString();
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, hex(p.zen));
  g.addColorStop(0.46, hex(p.hor));
  g.addColorStop(0.5, hex(p.gnd));
  g.addColorStop(1, hex(p.gnd));
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 64);
  // the sun itself: a soft hot spot the paint can catch as a highlight
  const d = new THREE.Vector3(p.dir[0], p.dir[1], p.dir[2]).normalize();
  const su = (Math.atan2(d.x, -d.z) / (Math.PI * 2) + 0.5) * 128,
    sv = (0.5 - Math.asin(Math.max(-1, Math.min(1, d.y))) / Math.PI) * 64;
  const sg = x.createRadialGradient(su, sv, 0, su, sv, 22);
  sg.addColorStop(0, hex(p.sunC));
  sg.addColorStop(1, "rgba(0,0,0,0)");
  x.globalAlpha = p.night ? 0.35 : 0.9;
  x.fillStyle = sg;
  x.fillRect(su - 22, sv - 22, 44, 44);
  x.globalAlpha = 1;
  D.envTex.needsUpdate = true;
  // PMREM prefiltering throws on a renderer whose backend has not initialised
  // yet (it is async since r185). Bail out rather than burn the attempt — drive.js
  // re-runs applyTOD once the backend is live.
  if (!D.renderer || !D.renderer.initialized) return;
  try {
    if (!D.pmrem) D.pmrem = new THREE.PMREMGenerator(D.renderer);
    const rt = D.pmrem.fromEquirectangular(D.envTex);
    if (D.envRT) D.envRT.dispose();
    D.envRT = rt;
    setCarEnvMap(D.envRT);
  } catch (_) {}
}
export function applyTOD(i) {
  D.todIdx = ((i % TOD.length) + TOD.length) % TOD.length;
  const p = TOD[D.todIdx];
  D.skyUni.uZen.value.setHex(p.zen);
  D.skyUni.uHor.value.setHex(p.hor);
  D.skyUni.uGnd.value.setHex(p.gnd);
  D.skyUni.uSunC.value.setHex(p.sunC);
  D.skyUni.uSunDir.value.set(p.dir[0], p.dir[1], p.dir[2]);
  D.skyUni.uCloud.value = p.cloud;
  D.skyUni.uNight.value = p.night;
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
  if (D.ses && D.ses.ghosts)
    Object.values(D.ses.ghosts).forEach((g) => {
      const L = g.mesh.userData.lamps;
      if (!L) return;
      L.beams.visible = !!p.night;
      L.head.emissiveIntensity = p.night ? 2.6 : 0.4;
      L.tail.emissiveIntensity = p.night ? 1.1 : 0.3;
    });
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

