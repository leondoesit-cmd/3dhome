/* ==========================================================================
   PBR MATERIALS FROM THE BAKED LIBRARY (pbr_material.js)
   --------------------------------------------------------------------------
   Turns a catalogue entry (material_library.js) into textures and materials:

   - pbrEntryFor(value)        "mat:<id>" | "floor:<key>" | "pbr:<family>" → entry
   - pbrTextures(entry)        the shared color / normal / ORM textures once all
                               three bitmaps are in, else null (and starts the
                               load; a finished load flags a 3D rebuild)
   - applyPbrMaps(mat, entry, ru, rv)
                               plain MeshStandard/Physical material: map,
                               normalMap and ORM (glTF layout: R=AO, G=rough,
                               B=metal). Works on every backend, including the
                               preview renderers.
   - pbrSurfaceMaterial(entry, opts)
                               node material for large planner surfaces
                               (floors, walls, ground, roof, ceiling). Organic
                               materials get a TSL anti-tiling shader so a
                               5 m floor does not show the same marble vein
                               every 3 m. Compiles to WGSL on WebGPU and GLSL
                               on the WebGL2 fallback.

   Until the bitmaps arrive (or if they 404 / the app is offline) callers keep
   the procedural texture they always had — the library is an upgrade, never a
   dependency.
   ========================================================================== */
import { THREE, TSL } from "./three_lazy.js";
import { S } from "./state.js";
import { materialFromRef, materialForLegacy, materialById, materialUrl, isOrganic } from "./material_library.js";
import { materialTier, materialLibraryEnabled } from "./material_tier.js";
import { PRESET_TEXTURES, getTexturePresetDataUrl } from "./textures.js";

/** Catalogue entry for a saved value, or null when it is not a library material. */
export function pbrEntryFor(value) {
  if (!value || typeof value !== "string") return null;
  return materialFromRef(value) || materialForLegacy(value) || null;
}
export { materialById };

var texCache = new Map(); // url → THREE.Texture (shared, never disposed)
var failedIds = new Set();
var inFlight = new Set(); // one promise per load still on the wire
var quiet = 0;
/* How many times a build asked for a bitmap that had not arrived yet (and
   so drew a stand-in). The planner compares it around each piece it builds:
   only a piece that missed needs building again when a load lands. */
var misses = 0;
export function textureMisses() {
  return misses;
}
export function noteTextureMiss() {
  misses++;
}

function onLoaded() {
  S.dirty3D = true;
  S.repaint3D = true;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customTextureLoaded"));
}

/* Run a build whose texture loads nobody else is waiting on (the library
   thumbnail warm-up). A finished load normally rebuilds the whole 3D view and
   re-bakes the plan sprites; the warm-up starts a few hundred of them, so it
   asks quietly and waits with pbrLoading() instead. A load that a normal
   build also asks for before it lands announces itself as usual. */
export function quietPbrLoads(fn, rebuilds) {
  quiet++;
  if (rebuilds) deferring++;
  try { return fn(); } finally { quiet--; if (rebuilds) deferring--; }
}
var deferring = 0;
/* True inside a quiet build that will be redone once its loads land (the
   warm-up's: see pbrLoading) while `entry`'s bitmaps are still on the wire:
   a stand-in made now would be thrown away, so callers may skip an
   expensive one (primitives.js's procedural detail, ~60 ms per family). */
export function pbrDeferFallback(entry) {
  return deferring > 0 && !!entry && !failedIds.has(entry.id) && inFlight.size > 0 && materialLibraryEnabled();
}

/** Settles once every texture load in flight right now has finished (or
 *  failed); null when nothing is loading. */
export function pbrLoading() {
  return inFlight.size ? Promise.all(Array.from(inFlight)) : null;
}

function loadTexture(url, srgb, id) {
  var tx = texCache.get(url);
  if (tx) {
    if (!quiet && !tx.image) tx.userData.announce = true;
    return tx;
  }
  var settle;
  var wait = new Promise(function (resolve) { settle = function () { inFlight.delete(wait); resolve(); }; });
  inFlight.add(wait);
  var done = function (t) {
    settle();
    if (t.userData.announce) onLoaded();
  };
  var fail = function () {
    failedIds.add(id);
    settle();
  };
  /* Decoded off the main thread. An <img> is decoded by the upload itself
     (copyExternalImageToTexture / texImage2D), on the main thread, the first
     time a material using it is drawn: the house's 2k colour, normal and ORM
     maps made opening the 3D view freeze for over a second. An ImageBitmap
     arrives decoded. It is flipped here because WebGL2 ignores UNPACK_FLIP_Y
     for bitmaps, and left uncorrected (the normal and ORM maps are data, the
     colour map is tagged sRGB on the texture). */
  if (typeof createImageBitmap === "function" && typeof fetch === "function") {
    tx = new THREE.Texture();
    tx.flipY = false;
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + url);
        return r.blob();
      })
      .then(function (blob) {
        return createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
      })
      .then(function (bmp) {
        tx.image = bmp;
        tx.needsUpdate = true;
        done(tx);
      }, fail);
  } else {
    tx = new THREE.TextureLoader().load(url, done, undefined, fail);
  }
  tx.userData.announce = !quiet;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 8;
  tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texCache.set(url, tx);
  return tx;
}

/** Shared textures for an entry, or null until every bitmap is decoded. */
export function pbrTextures(entry) {
  // no DOM (Node tests, workers): nothing can load an image — callers keep
  // their procedural texture, the same guard primitives.js pbrTex() has
  if (!entry || failedIds.has(entry.id) || !THREE.TextureLoader || typeof document === "undefined") return null;
  if (!materialLibraryEnabled()) return null;
  var tier = materialTier();
  var map = loadTexture(materialUrl(entry.id, "color", tier), true, entry.id);
  var normalMap = loadTexture(materialUrl(entry.id, "normal", tier), false, entry.id);
  var ormMap = loadTexture(materialUrl(entry.id, "orm", tier), false, entry.id);
  // Same wait-for-bitmap rule as applyTextureToMaterial: a texture handed to
  // a material before its image exists kills the render pass on upload.
  if (!map.image || !normalMap.image || !ormMap.image) {
    misses++;
    return null;
  }
  return { map: map, normalMap: normalMap, ormMap: ormMap };
}

/* What a library material looked like before the library: the gallery
   preset's generated canvas (a data URL) or a floor painter key. Callers use
   it while the bitmaps load and when they cannot load at all. */
export function legacyTextureUrl(entry) {
  if (!entry || !entry.legacy || !entry.legacy.startsWith("preset:")) return null;
  var id = entry.legacy.slice(7);
  var preset = PRESET_TEXTURES.find(function (p) { return p.id === id; });
  return preset ? getTexturePresetDataUrl(preset) : null;
}
export function legacyFloorKey(entry) {
  return entry && entry.legacy && entry.legacy.startsWith("floor:") ? entry.legacy.slice(6) : null;
}

/** True when the entry's bitmaps failed to load (404, offline): use the fallback. */
export function pbrFailed(entry) {
  return !!entry && failedIds.has(entry.id);
}

/* ---- one GPU texture per image and repeat ----
   WebGPURenderer uploads a texture per Texture OBJECT, on both backends.
   Classic WebGLRenderer shared the upload through the Source, so a clone per
   material used to be free; here it is a full 2k colour + normal + ORM
   upload with mipmaps, per mesh. The generated large apartment held ~650 of
   them (11 GB) from 18 images, and opening the cabinet designer on the
   WebGL2 fallback then ran the GPU process out of memory and lost every
   context in the page at once.

   So a repeat the texture already has IS the texture, and any other repeat
   gets one clone per distinct value, remembered per image. Size-driven
   repeats (a custom finish scaled to each part) can take many values, so
   the memory is a short most-recent list. A clone that falls off it is
   disposed once no material holds it any more: pass the material as `owner`
   and the clone counts it until that material is disposed. (A renderer keeps
   every uploaded texture until it is disposed, so merely forgetting a clone
   leaked its GPU copy.) A clone handed out without an owner is never freed.
   Callers must treat the result as shared: never change its repeat, offset
   or rotation, and never dispose it — isSharedTexture() says which these are. */
var REPEAT_KEEP = 48;
var repeatClones = new WeakMap(); // base texture → Map("ru,rv" → clone), oldest first
var sharedTextures = new WeakSet(); // everything sharedRepeat has handed out
var cloneUsers = new WeakMap(); // clone → owner materials still holding it (or Infinity)
var retired = new WeakSet(); // clones that fell off their recent list

/** True for a texture other materials may share (from sharedRepeat): a
 *  material's owner must not dispose it. */
export function isSharedTexture(t) {
  return !!t && sharedTextures.has(t);
}

function releaseClone(c) {
  var n = cloneUsers.get(c);
  if (n === Infinity) return;
  n = Math.max(0, (n || 0) - 1);
  cloneUsers.set(c, n);
  if (!n && retired.has(c)) c.dispose();
}

/* A material clone (material.clone()) holds its original's maps but not its
   dispose listener, so it would not count as an owner: the clone could be
   left drawing a texture freed with its original, or keep an upload nobody
   ever releases. Every clone therefore adopts the counted maps it copied.
   Material is the only class in three that defines clone(), so one hook
   covers all of them, including clones made by code that never heard of
   sharedRepeat (a fade warm-up, a transparency override). */
var MAP_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "bumpMap"];
export function adoptSharedMaps(mat) {
  if (!mat || !mat.addEventListener) return;
  var held = [];
  MAP_SLOTS.forEach(function (slot) {
    var t = mat[slot],
      n = t && cloneUsers.get(t);
    if (typeof n !== "number" || n === Infinity || held.indexOf(t) >= 0) return;
    held.push(t);
    cloneUsers.set(t, n + 1);
  });
  if (!held.length) return;
  mat.addEventListener("dispose", function onDispose() {
    mat.removeEventListener("dispose", onDispose);
    held.forEach(releaseClone);
  });
}
var cloneHooked = false;
function hookMaterialClone() {
  if (cloneHooked || !THREE.Material) return;
  cloneHooked = true;
  var clone = THREE.Material.prototype.clone;
  THREE.Material.prototype.clone = function () {
    var copy = clone.apply(this, arguments);
    adoptSharedMaps(copy);
    return copy;
  };
}

export function sharedRepeat(tx, ru, rv, owner) {
  if (!tx) return tx;
  hookMaterialClone();
  sharedTextures.add(tx);
  if (tx.repeat.x === ru && tx.repeat.y === rv) return tx;
  var byRepeat = repeatClones.get(tx);
  if (!byRepeat) repeatClones.set(tx, (byRepeat = new Map()));
  var key = ru + "," + rv,
    c = byRepeat.get(key);
  if (c) byRepeat.delete(key);
  else {
    c = tx.clone();
    c.repeat.set(ru, rv);
    sharedTextures.add(c);
    cloneUsers.set(c, 0);
    if (byRepeat.size >= REPEAT_KEEP) {
      var oldKey = byRepeat.keys().next().value,
        old = byRepeat.get(oldKey);
      byRepeat.delete(oldKey);
      retired.add(old);
      if (cloneUsers.get(old) === 0) old.dispose();
    }
  }
  byRepeat.set(key, c);
  if (owner && owner.addEventListener) {
    if (cloneUsers.get(c) !== Infinity) cloneUsers.set(c, cloneUsers.get(c) + 1);
    owner.addEventListener("dispose", function onDispose() {
      owner.removeEventListener("dispose", onDispose);
      releaseClone(c);
    });
  } else {
    cloneUsers.set(c, Infinity); // unknown holders: keep it alive
  }
  return c;
}

var repeated = sharedRepeat;

/**
 * Put an entry's maps on an existing MeshStandardMaterial / MeshPhysicalMaterial.
 * Returns false (material untouched) until the textures are ready.
 * @param {number} ru  texture repeats along u
 * @param {number} rv  texture repeats along v
 * @param {object} [o]
 * @param {number} [o.tint]         hex colour multiplied into the map (tintable details, item texColor)
 * @param {number} [o.normalScale]  default 1 (0.7 for small furniture detail)
 */
export function applyPbrMaps(mat, entry, ru, rv, o) {
  var t = pbrTextures(entry);
  if (!mat || !t) return false;
  o = o || {};
  mat.map = repeated(t.map, ru, rv, mat);
  mat.normalMap = repeated(t.normalMap, ru, rv, mat);
  var ns = o.normalScale != null ? o.normalScale : 1;
  if (mat.normalScale && mat.normalScale.set) mat.normalScale.set(ns, ns);
  var orm = repeated(t.ormMap, ru, rv, mat); // one owner count; the three slots share it
  mat.roughnessMap = orm;
  mat.metalnessMap = orm;
  mat.aoMap = orm;
  mat.aoMapIntensity = 1;
  // the maps carry the values; the scalars become plain multipliers
  mat.roughness = 1;
  mat.metalness = entry.metal > 0 ? 1 : 0;
  if (!entry.tint) mat.color.setHex(0xffffff);
  else mat.color.setHex(o.tint != null ? o.tint : 0xffffff);
  if ((entry.kind === "clearcoat" || entry.kind === "polished") && "clearcoat" in mat) {
    mat.clearcoat = 0.45;
    mat.clearcoatRoughness = 0.06;
  }
  mat.needsUpdate = true;
  return true;
}

/* ---- TSL anti-tiling ----
   After Inigo Quilez's "texture repetition" technique 3: a slow noise picks a
   discrete variant index; each variant samples the same texture with a hashed
   offset, and the two nearest variants are blended where the index changes.
   Explicit gradients (taken from the UNoffset uv) keep mip selection
   continuous across the offset jumps — without them each jump draws a
   one-pixel seam at the coarsest mip. */
function antiTileSampler(uvNode, variation) {
  var T = TSL;
  var k = T.mx_noise_float(T.vec3(uvNode.mul(0.35), 0)).mul(0.5).add(0.5); // 0..1, ~3 tiles per cell
  var l = k.mul(variation);
  var f = T.fract(l);
  var ia = T.floor(l);
  var ib = ia.add(1);
  var offA = T.sin(T.vec2(3.0, 7.0).mul(ia));
  var offB = T.sin(T.vec2(3.0, 7.0).mul(ib));
  var gx = T.dFdx(uvNode), gy = T.dFdy(uvNode);
  function sample(tex) {
    var a = T.texture(tex, uvNode.add(offA)).grad(gx, gy);
    var b = T.texture(tex, uvNode.add(offB)).grad(gx, gy);
    return { a: a, b: b };
  }
  return function (texMain, others) {
    var c = sample(texMain);
    var diff = c.a.rgb.sub(c.b.rgb);
    var w = T.smoothstep(0.2, 0.8, f.sub(T.dot(diff, T.vec3(0.1, 0.1, 0.1))));
    var out = { main: T.mix(c.a, c.b, w) };
    Object.keys(others).forEach(function (name) {
      var s = sample(others[name]);
      out[name] = T.mix(s.a, s.b, w);
    });
    return out;
  };
}

/**
 * Node material for a large planner surface, or null until textures are ready.
 * @param {object} entry   catalogue entry
 * @param {object} [o]
 * @param {number[]} [o.repeat]   [u, v] multiplier applied to the mesh uv (floors: 1 = one tile per uv unit)
 * @param {number}   [o.tint]     hex tint (multiplies the colour map)
 * @param {number}   [o.side]     THREE side constant
 * @param {number}   [o.envMapIntensity]
 * @param {boolean}  [o.antiTile] force on/off; default: on for organic materials
 */
export function pbrSurfaceMaterial(entry, o) {
  var t = pbrTextures(entry);
  if (!t || !THREE.MeshStandardNodeMaterial || !TSL.texture) return null;
  o = o || {};
  var T = TSL;
  var rep = o.repeat || [1, 1];
  /* Repeat and tint are UNIFORMS, not literals. A literal is part of the
     shader text, so every surface size (a lawn fitted to the house, a wall
     finish at its own scale) and every tint compiled its own ~100 KB program
     — and re-compiled whenever the house bounds moved. As uniforms, all the
     surfaces of one kind share a single program. */
  var uvNode = T.uv().mul(T.uniform(new THREE.Vector2(rep[0], rep[1])));
  var anti = o.antiTile != null ? o.antiTile : isOrganic(entry.id);
  var color, normal, orm;
  if (anti) {
    var s = antiTileSampler(uvNode, 8)(t.map, { normal: t.normalMap, orm: t.ormMap });
    color = s.main;
    normal = s.normal;
    orm = s.orm;
  } else {
    color = T.texture(t.map, uvNode);
    normal = T.texture(t.normalMap, uvNode);
    orm = T.texture(t.ormMap, uvNode);
  }
  var physical = (entry.kind === "clearcoat" || entry.kind === "polished") && THREE.MeshPhysicalNodeMaterial;
  var mat = physical ? new THREE.MeshPhysicalNodeMaterial() : new THREE.MeshStandardNodeMaterial();
  var tint = T.uniform(new THREE.Color(o.tint != null ? o.tint : 0xffffff));
  mat.colorNode = color.rgb.mul(tint);
  mat.normalNode = T.normalMap(normal.rgb);
  mat.roughnessNode = orm.g;
  mat.metalnessNode = entry.metal > 0 ? orm.b : T.float(0);
  mat.aoNode = orm.r;
  if (physical) {
    mat.clearcoat = 0.45;
    mat.clearcoatRoughness = 0.06;
  }
  if (o.side != null) mat.side = o.side;
  if (o.envMapIntensity != null) mat.envMapIntensity = o.envMapIntensity;
  mat.userData.pbrMaterial = entry.id;
  return mat;
}
