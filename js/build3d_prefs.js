/* How the 3D pane previews what a planner tool is about to build
   (js/build3d_ghost.js describes it, js/view3d/build_ghost.js draws it).

     mode     "ghost"   transparent volumes (default)
              "solid"   opaque volumes
              "outline" the thin HUD lines only, as before the volumes existed
     opacity  0.15–0.9, used by "ghost"

   Kept per viewer in localStorage. Every read and write is guarded: a private
   window, blocked site data or junk in the key falls back to the defaults.
   A change fires `build3d:prefs` on window with the new prefs as detail. */

export const BUILD3D_PREFS_KEY = "mf_build3d_preview";
export const PREVIEW_MODES = Object.freeze(["ghost", "solid", "outline"]);
export const OPACITY_MIN = 0.15;
export const OPACITY_MAX = 0.9;
export const DEFAULT_BUILD3D_PREFS = Object.freeze({ mode: "ghost", opacity: 0.45 });

export function clampOpacity(value) {
  const n = value == null || typeof value === "boolean" || (typeof value === "string" && value.trim() === "") ? NaN : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BUILD3D_PREFS.opacity;
  return Math.round(Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, n)) * 100) / 100;
}

export function parseMode(value) {
  return PREVIEW_MODES.includes(value) ? value : DEFAULT_BUILD3D_PREFS.mode;
}

/** A stored value (JSON text or an object) to a complete, valid prefs object. */
export function parseBuild3dPrefs(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch (_) { value = null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_BUILD3D_PREFS };
  return { mode: parseMode(value.mode), opacity: clampOpacity(value.opacity ?? DEFAULT_BUILD3D_PREFS.opacity) };
}

function storageOf(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; }
}

export function loadBuild3dPrefs(storage) {
  try {
    const store = storageOf(storage);
    return parseBuild3dPrefs(store ? store.getItem(BUILD3D_PREFS_KEY) : null);
  } catch (_) {
    return { ...DEFAULT_BUILD3D_PREFS };
  }
}

export function saveBuild3dPrefs(prefs, storage) {
  const clean = parseBuild3dPrefs(prefs);
  try {
    const store = storageOf(storage);
    if (store) store.setItem(BUILD3D_PREFS_KEY, JSON.stringify(clean));
  } catch (_) { /* the setting still applies for this page */ }
  return clean;
}

let current = null;

/** The live prefs (read once from storage, then kept in memory). */
export function build3dPrefs() {
  if (!current) current = loadBuild3dPrefs();
  return current;
}

/** Merge a patch, store it and announce it. Returns the new prefs. */
export function setBuild3dPrefs(patch, storage) {
  const next = parseBuild3dPrefs({ ...build3dPrefs(), ...(patch || {}) });
  const prev = current;
  current = saveBuild3dPrefs(next, storage);
  if ((!prev || prev.mode !== current.mode || prev.opacity !== current.opacity) &&
      typeof window !== "undefined" && typeof window.dispatchEvent === "function" &&
      typeof CustomEvent === "function")
    window.dispatchEvent(new CustomEvent("build3d:prefs", { detail: { ...current } }));
  return current;
}
