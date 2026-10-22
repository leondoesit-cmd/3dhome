// Renderer construction, shared by every canvas in the app.
//
// three r185's WebGPURenderer replaced WebGLRenderer here. It drives a real
// WebGPU backend where the browser has one and falls back to its own WebGL2
// backend where it does not (WebKitGTK, Safari < 26) — same API either way, so
// there is a single code path to maintain. That fallback is the reason this
// migration works at all on the Linux/older-Apple targets.
//
// The one behavioural difference that matters: the backend initialises
// ASYNCHRONOUSLY, and `renderer.render()` THROWS if called before it lands.
// Every render site in the app therefore has to be guarded. Use `ready(r)` to
// await it, or `render(r, scene, cam)` which no-ops until the backend is live.
import { THREE } from "./three_lazy.js";

/* ---------------------------------------------------------------------------
   LIGHT UNITS — three r155+ lights are physical, and this scene is in CM.
   ---------------------------------------------------------------------------
   Two independent things changed under the r185 migration, both measured
   against the old r128 renderer rather than derived on paper:

   1. Physical lights convert irradiance to Lambertian radiance by dividing by
      PI. Every light type is PI times dimmer than it used to be at the same
      `intensity`.  (measured: x3.03 needed to match, PI = 3.1416)

   2. Point/Spot intensity is CANDELA and falls off as 1/d^2 — where d is in
      SCENE UNITS. This scene is in CENTIMETRES, so at a typical 250cm throw the
      falloff divides by 62500 instead of 6.25. Punctual lights that used to
      light a room now render EXACTLY ZERO. This is what made Night Shift pitch
      black while emissive materials (zombie eyes, blood) stayed visible: those
      do not depend on lights at all.
      (measured: x2.02e5 needed to match, PI * 250^2 = 1.96e5)

   A third change is deliberately NOT compensated: ColorManagement now treats
   material colours as sRGB and linearises them, which darkens every non-white
   albedo (~2.3x for mid-grey). That is correct behaviour and the whole point of
   colour management — fixing it per-light would re-break mid-tones. If the
   overall image reads dark, that is an EXPOSURE decision, not a light one.

   Multiply legacy intensity literals by these. LUX for ambient/hemisphere/
   directional, CD for point/spot (which must also keep decay = 2). */
export const LUX = Math.PI;
/** Reference throw in cm that CD is calibrated for — roughly ceiling to table. */
export const CD_REF_CM = 250;
/** Punctual intensity scale for the CENTIMETRE scenes: the planner 3D view,
 *  Night Shift (played inside the planner's own floor plan), the modeler. */
export const CD = Math.PI * CD_REF_CM * CD_REF_CM; // ~196350
/** Punctual intensity scale for the METRE scenes — drive mode and its weapon
 *  viewmodel (js/drive.js: "World: local tangent plane in METERS"). Using CD
 *  here would be 10^4 too bright. Same reference throw, expressed in metres. */
export const CD_M = Math.PI * (CD_REF_CM / 100) * (CD_REF_CM / 100); // ~19.6

/** Unit-correct punctual scale for a scene. Prefer the explicit constant when
 *  the module's units are obvious; this exists so call sites can be readable. */
export function cd(meters) { return meters ? CD_M : CD; }

/**
 * Convert a pre-r185 punctual light's authored (intensity, distance, decay)
 * into the physical intensity that reproduces its old look.
 *
 * This is the accurate form of CD, and the one to prefer. CD alone assumes the
 * light works at CD_REF_CM; a light with a SHORT throw (a 140cm fill, a 267cm
 * practical) is then wildly over-bright, because the same candela value spread
 * over a much smaller working distance is far more irradiance. That mistake is
 * what made Night Shift's practicals blow out to white after the units fix.
 *
 * The old renderer's falloff was a smooth cutoff, not inverse-square:
 *     legacy(d)   = i * (1 - d/D)^n            (D > 0, else no falloff at all)
 * The new one is physical, with the Lambertian /PI:
 *     physical(d) = I / (PI * d^n)
 * Equating at a reference distance ref = refFrac * D and solving for I gives
 * the expression below.
 *
 * @param {number} i          authored (legacy) intensity
 * @param {number} distance   the light's cutoff distance, in scene units
 * @param {number} [decay=2]  the light's decay exponent
 * @param {number} [refFrac=0.5]  where in its own throw to match the old look
 */
export function legacyIntensity(i, distance, decay, refFrac) {
  var n = decay === undefined ? 2 : decay;
  var f = refFrac === undefined ? 0.5 : refFrac;
  // distance 0 means "never cut off" — the old light had no falloff at all, so
  // there is no throw to calibrate against; fall back to the nominal reference.
  if (!(distance > 0)) return i * Math.PI * Math.pow(CD_REF_CM, n);
  var ref = f * distance;
  return i * Math.pow(1 - f, n) * Math.PI * Math.pow(ref, n);
}

/**
 * Punctual scale for a light whose `decay` is NOT 2.
 *
 * CD assumes inverse-square, so it is only correct for decay = 2. A light with
 * a softer decay attenuates by 1/d^decay instead, which is a completely
 * different number in centimetres — using CD on it is wrong by orders of
 * magnitude. Falloff at the reference distance is d^decay, so the scale is
 * PI * refCm^decay.
 *
 * Softer decay is a legitimate artistic choice for BEAMS: a flashlight has to
 * stay readable both at arm's length and across a room, and true inverse-square
 * blows out the near field by the same factor it kills the far field.
 *
 * @param {number} decay  the light's decay exponent
 * @param {number} [refCm=CD_REF_CM]  distance the intensity is calibrated for
 */
export function cdFor(decay, refCm) {
  return Math.PI * Math.pow(refCm === undefined ? CD_REF_CM : refCm, decay);
}

// ?forceWebGL (or localStorage home3d_forceWebGL=1) pins the WebGL2 fallback so
// the path real users on WebKitGTK and Safari < 26 will hit can be exercised on
// a machine that has WebGPU. The localStorage form survives a reload, which the
// query form does not when something rewrites the URL.
var FORCE_WEBGL =
  (typeof location !== "undefined" && /[?&]forceWebGL\b/.test(location.search)) ||
  (function () {
    try { return localStorage.getItem("home3d_forceWebGL") === "1"; } catch (e) { return false; }
  })();

/**
 * @param {object} opts  WebGPURenderer options (canvas, antialias, alpha, ...).
 *
 * Every 3D canvas in the app comes through here, so every one gets the same
 * backend policy. Each renderer keeps its own GPUDevice on purpose: three's
 * GPU resource caches are per renderer whether or not the device is shared,
 * and a renderer that created its device destroys it on dispose(), which
 * would take every other view down with the one that closed.
 */
/* three r185: when a light stops casting (castShadow -> false), the next
   shader build for ANY object disposes that light's shadow node — its map
   included — while every shader built before still references it, and
   cached ones are re-used if the light casts again. The next frame then
   throws in ShadowNode.updateShadow (shadowMap is null), and the planner
   falls back to a bare render with no AO or anti-aliasing. Lights here
   switch shadows on and off as a matter of course (the sun at dusk, the
   shadow budget handing maps between windows and lamps), so the node is
   kept instead: idle while the light does not cast, and the very same node
   (and map) when it casts again. Disposing the light still frees it. */
function keepShadowNodes() {
  var A = THREE.AnalyticLightNode && THREE.AnalyticLightNode.prototype;
  if (A && A.__keepsShadowNode) return;
  /* This leans on three's internals (tests/three_shadow_patch_guard pins them
     against the vendored copy). Say so if an upgrade moved them, rather than
     quietly losing the AO/TRAA pipeline the first time a light stops casting. */
  if (!A || typeof A.setup !== "function" || String(A.setup).indexOf("shadowNode") < 0) {
    if (!keepShadowNodes.warned) console.warn("gpu.js: three's AnalyticLightNode changed; the keep-shadow-node patch is off (re-check it against this three)");
    keepShadowNodes.warned = true;
    return;
  }
  var setup = A.setup;
  A.setup = function (builder) {
    if (this.light && !this.light.castShadow && this.shadowNode !== null) {
      var keep = this.shadowNode;
      this.shadowNode = null; // so setup() takes its no-shadow path without disposing
      try { return setup.call(this, builder); } finally { this.shadowNode = keep; }
    }
    return setup.call(this, builder);
  };
  A.__keepsShadowNode = true;
}

export function createRenderer(opts) {
  keepShadowNodes();
  opts = Object.assign({}, opts || {});
  opts.forceWebGL = FORCE_WEBGL;
  var r = new THREE.WebGPURenderer(opts);
  // Kick init immediately so it overlaps with the caller's scene building.
  r._readyPromise = r.init().then(function () { return r; });
  r._readyPromise.catch(function (e) {
    if (window.console && console.error) console.error("GPU backend init failed:", e);
  });
  return r;
}

/** Resolves with the renderer once its backend is live. */
export function ready(r) {
  if (!r) return Promise.resolve(null);
  return r._readyPromise || Promise.resolve(r);
}

/** render() that no-ops instead of throwing while the backend is still coming up. */
export function render(r, scene, camera) {
  if (!r || !r.initialized) return false;
  r.render(scene, camera);
  return true;
}

/** "WebGPU" | "WebGL2" | null (null until the backend is up). */
export function backendName(r) {
  if (!r || !r.initialized) return null;
  return r.backend && r.backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
}
