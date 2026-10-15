/* Which baked texture tier a device loads: "2k" (2048 px) on desktops,
   "1k" (1024 px) on phones and tablets. A 2k set is ~4x the download and GPU
   memory of 1k; a phone screen cannot show the difference on a floor seen
   across a room, and its memory budget is what kills a WebGPU tab first.

   Only DEVICE signals decide it (touch-first pointer, small physical screen,
   low memory) — never the window width: the posture classes follow a
   resizable window, and the tier is read once per session, so a desktop
   started in a narrow window would be stuck on 1k.

   pickMaterialTier() is pure (tested in Node); materialTier() reads the
   browser and the user override (localStorage home3d_matTier = "2k" | "1k"). */

export const MATERIAL_TIER_KEY = "home3d_matTier";

/**
 * @param {object} env
 * @param {boolean} [env.coarse]       (pointer: coarse) matches — touch-first device
 * @param {number}  [env.deviceMemory] navigator.deviceMemory in GB (absent on Firefox/Safari)
 * @param {number}  [env.minScreen]    min(screen.width, screen.height) in CSS px
 * @param {boolean} [env.software]     the GPU is a software rasteriser (SwiftShader,
 *   llvmpipe, Microsoft Basic Render): it decodes and uploads 2k maps on the CPU
 * @param {string}  [env.override]     "2k" | "1k" forced by the user
 * @returns {"2k"|"1k"}
 */
export function pickMaterialTier(env) {
  const e = env || {};
  if (e.override === "2k" || e.override === "1k") return e.override;
  if (e.coarse) return "1k";
  if (e.software) return "1k";
  if (typeof e.deviceMemory === "number" && e.deviceMemory > 0 && e.deviceMemory < 8) return "1k";
  if (typeof e.minScreen === "number" && e.minScreen > 0 && e.minScreen < 600) return "1k";
  return "2k";
}

let cached = null;
let software = false;

/** The tier for this browser session (stable once read, so caches stay valid). */
export function materialTier() {
  if (cached) return cached;
  const env = {};
  try {
    env.coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  } catch (e) { /* no matchMedia */ }
  try { env.deviceMemory = navigator.deviceMemory; } catch (e) { /* not exposed */ }
  env.software = software = softwareRenderer();
  try { env.minScreen = Math.min(screen.width, screen.height); } catch (e) { /* no screen */ }
  try { env.override = localStorage.getItem(MATERIAL_TIER_KEY) || undefined; } catch (e) { /* storage blocked */ }
  cached = pickMaterialTier(env);
  return cached;
}

/* Whether to use the baked library at all. A CPU rasteriser (headless
   Chrome, a VM, a broken driver) cannot afford it at any tier: each frame of
   a scene full of 2-3 maps per surface plus the anti-tiling noise took
   seconds and froze the page, so those machines keep the procedural
   textures they always had. */
export function materialLibraryEnabled() {
  materialTier();
  return !software;
}

/* Is WebGL running on a CPU rasteriser? Asked of a throwaway 1x1 context. */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render/i;
export function isSoftwareRendererName(name) {
  return SOFTWARE_GPU.test(String(name || ""));
}
function softwareRenderer() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return true; // no WebGL at all: certainly no GPU worth 2k
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return isSoftwareRendererName(name);
  } catch (e) {
    return false;
  }
}

/** Force a tier ("2k" | "1k" | null to go back to auto). Takes effect on reload. */
export function setMaterialTierOverride(tier) {
  try {
    if (tier === "2k" || tier === "1k") localStorage.setItem(MATERIAL_TIER_KEY, tier);
    else localStorage.removeItem(MATERIAL_TIER_KEY);
  } catch (e) { /* storage blocked */ }
}
