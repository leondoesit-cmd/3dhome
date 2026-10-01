/* Late-bound three.js.
 *
 * three.webgpu.js + three.core.js are 3.5 MB of the app's boot payload (~600 KB
 * brotli). Every module that draws anything used to `import * as THREE from
 * "three"` STATICALLY, which put the whole renderer on the synchronous boot
 * module graph: the 2D planner could not paint until three had been fetched,
 * parsed and evaluated, and a phone session that never leaves the plan view
 * downloaded it anyway.
 *
 * There is no build step here, so the fix cannot be a bundler split. Instead
 * the modules that need three at RUN time (not at load time) import the empty
 * `THREE` object below and keep writing `THREE.Vector3` exactly as before;
 * `loadThree()` fills it in from the real namespace the first time something
 * actually wants a scene. Because every one of those call sites lives inside a
 * function body — verified, see the audit in the perf notes — nothing reads a
 * property before the object is populated.
 *
 * THE RULE: any code path that constructs a three object must be downstream of
 * an `await loadThree()` (or an `if (!threeLoaded()) { loadThree().then(retry);
 * return; }` bounce). The gates are:
 *
 *   view3d.init3D()                  the planner's 3D pane
 *   thumbs.gl()                      offscreen catalog-icon renderer
 *   furniture_api.baseVSpan()        vertical-span probe (falls back, re-probes)
 *   modeler.openModeler()            the CAD model editor
 *   ui_cabinet_view open path        the cabinet designer
 *   inspector_preview.ensurePreview  the inspector's mini 3D preview
 *
 * Game modules (zombies/drive/rc/kart/lava/track) are dynamically imported
 * already and keep their plain `import * as THREE from "three"` — by the time
 * one of them loads it is a module-cache hit if three is up, and a normal
 * (blocking, correct) fetch if it is not.
 *
 * The specifiers below are literal strings so tools/link_check.mjs can still
 * follow them.
 */

/** The three namespace. EMPTY until loadThree() resolves. */
export const THREE = {};
/** three/tsl (node-material shader language) — empty until loadThree(). */
export const TSL = {};
/** The handful of addons the app uses. Empty until loadThree(). */
export const ADDONS = {};

let loaded = false;
let pending = null;

/** True once THREE/TSL/ADDONS are populated and safe to construct from. */
export function threeLoaded() {
  return loaded;
}

/** Fetch three (idempotent). Resolves when THREE/TSL/ADDONS are populated. */
export function loadThree() {
  if (pending) return pending;
  pending = Promise.all([
    import("three"),
    import("three/tsl"),
    import("three/addons/tsl/display/GTAONode.js"),
    import("three/addons/tsl/display/TRAANode.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
    import("../vendor/three/three.module.js"),
  ]).then(function (mods) {
    // Object.assign copies the namespace's own value bindings. three exports
    // classes and frozen constants, none of which are reassigned after load,
    // so a snapshot is equivalent to the live namespace and costs nothing at
    // the (very hot) `THREE.x` read sites a Proxy would tax.
    Object.assign(THREE, mods[0]);
    Object.assign(TSL, mods[1]);
    ADDONS.ao = mods[2].ao;
    ADDONS.traa = mods[3].traa;
    ADDONS.RoundedBoxGeometry = mods[4].RoundedBoxGeometry;
    // Both renderer entry points share three.core.js and the same scene classes.
    // CAD previews use the classic GLSL renderer, avoiding node graph builds.
    THREE.WebGLRenderer = mods[5].WebGLRenderer;
    loaded = true;
    return true;
  });
  return pending;
}
