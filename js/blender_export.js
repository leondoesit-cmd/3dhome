/* Blender-grade glTF/GLB export.
 *
 * The live 3D scene is built for a renderer, not for a DCC app: it is in
 * CENTIMETRES, it is parented under three internal layer roots, nothing has a
 * name, view aids (the dollhouse cut, layer ghosting, MEP x-ray) live in the
 * same graph as the model, and identical furniture carries one copy of its
 * geometry per piece. Handing that straight to GLTFExporter — which is what
 * view3d.exportGLTF() used to do — produces a file Blender opens as a 100x
 * oversized pile of "Object.001 ... Object.842" with translucent walls.
 *
 * This module builds a THROWAWAY scene next to the live one and exports that.
 * Nothing here mutates the scene on screen: geometries and materials are cloned
 * before they are touched, and the clones are disposed as soon as the exporter
 * has read them.
 *
 * What the fixes are, and why each one matters on the Blender side:
 *
 *   units      glTF is metres by spec and Blender's importer believes it. A
 *              270 cm wall arrives 270 m tall unless the whole thing is scaled
 *              by 0.01 — and the scale is baked into the VERTICES, not left on
 *              a root empty, so every object lands at scale 1.0 and nobody has
 *              to remember Ctrl+A.
 *   lights     Point/spot intensity here is candela calibrated for centimetre
 *              throws (js/gpu.js CD). Illuminance goes as 1/d^2, so shrinking
 *              the scene by 100 makes every lamp 10^4 too bright; punctual
 *              intensity is scaled by k^2 to compensate (this is exactly the
 *              CD -> CD_M ratio drive mode already uses for its metre world).
 *   names      Blender takes node names verbatim. See js/blender_names.js.
 *   extras     glTF `extras` become Blender custom properties, so every wall
 *              and every piece of furniture arrives carrying its planner id and
 *              its real dimensions in centimetres, readable from the N-panel or
 *              from bpy.
 *   view aids  Ghosted layers, the MEP x-ray and the see-through cutaway are
 *              ways of LOOKING at the model, not properties of it. The cutaway
 *              wall is exported solid and the ghost's original material is
 *              taken back off userData.ghostBase.
 *   instances  Two identical chairs share one glTF mesh, so Blender links the
 *              mesh datablock instead of duplicating it.
 */
import { THREE } from "./three_lazy.js";
import { S } from "./state.js";
import { getDynGroup, getRigLights, ensureBuilt, has3D } from "./view3d.js";
import { COLLECTIONS, classify, materialName, uniqueNamer, sanitizeBlenderName } from "./blender_names.js";

/** Metres per centimetre — the whole point of the exercise. */
export var CM_TO_M = 0.01;

export function defaultOptions() {
  return {
    format: "glb", // "glb" (single file) | "gltf" (JSON, textures embedded)
    units: "m", // "m" for Blender's metres, "cm" to keep raw model units
    recenter: true, // put the plan's centre on the world origin, floor at Z=0
    lights: true, // sun + window daylight + lamps, as KHR_lights_punctual
    ground: false, // the infinite ground plane and the site overlay
    hidden: false, // layers the planner is currently hiding
    solidifyViewAids: true, // undo ghosting / x-ray translucency
    instances: true, // share one mesh between identical objects
    mergeMaterials: true, // one material per distinct finish, not per mesh
    maxTextureSize: 4096,
    /* The subtree to export. Defaults to the live 3D scene; a test passes its
       own graph so the transformation rules can be checked without standing up
       a renderer. */
    source: null,
  };
}

/* ---- the throwaway scene -------------------------------------------------- */

/* Everything the builder needs to carry through one export. Kept in one object
   rather than in closure variables so disposeScene() below can free exactly
   what was created, without re-traversing and guessing what is a clone. */
function newContext(opts) {
  return {
    opts: opts,
    k: opts.units === "cm" ? 1 : CM_TO_M,
    name: uniqueNamer(),
    matName: uniqueNamer(),
    geoCache: new Map(), // hash -> cloned+scaled geometry
    geoBySrc: new Map(), // source geometry uuid -> hash (skips re-hashing)
    matCache: new Map(), // source material uuid -> cloned material
    matByLook: new Map(), // "what it looks like" -> cloned material
    owned: { geometries: [], materials: [] },
    stats: { objects: 0, meshes: 0, geometries: 0, materials: 0, triangles: 0, lights: 0, skipped: 0 },
  };
}

/* A content hash, not an identity check: the furniture cache builds each piece
   separately, so ten identical chairs arrive as ten distinct BufferGeometries
   holding the same numbers. Hashing the actual buffers is what lets them come
   out the far end as one linked mesh in Blender.

   FNV-1a over the raw bytes of every attribute that can differ, plus the index.
   Sampling would be faster and is not worth it: a hash collision here means one
   object silently wearing another object's shape. */
function geometryHash(geo) {
  var h = 2166136261 >>> 0;
  function feed(bytes) {
    for (var i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  function feedNum(n) {
    h ^= n & 0xffffffff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  var keys = Object.keys(geo.attributes).sort();
  feedNum(keys.length);
  for (var i = 0; i < keys.length; i++) {
    var a = geo.attributes[keys[i]];
    feedNum(a.itemSize);
    feedNum(a.count);
    feed(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  }
  if (geo.index) {
    feedNum(geo.index.count);
    feed(new Uint8Array(geo.index.array.buffer, geo.index.array.byteOffset, geo.index.array.byteLength));
  }
  // draw groups decide which material paints which triangles — part of the shape
  (geo.groups || []).forEach(function (g) {
    feedNum(g.start);
    feedNum(g.count);
    feedNum((g.materialIndex || 0) + 1);
  });
  return h.toString(36) + ":" + (geo.index ? geo.index.count : 0);
}

function scaledGeometry(src, ctx) {
  var k = ctx.k;
  if (k === 1 && !ctx.opts.instances) return src; // nothing to do and nothing to share
  var key;
  if (ctx.opts.instances) {
    key = ctx.geoBySrc.get(src.uuid);
    if (key == null) {
      key = geometryHash(src);
      ctx.geoBySrc.set(src.uuid, key);
    }
    var hit = ctx.geoCache.get(key);
    if (hit) return hit;
  }
  var out = src.clone();
  if (k !== 1) out.scale(k, k, k);
  out.name = src.name || "";
  ctx.owned.geometries.push(out);
  ctx.stats.geometries++;
  if (ctx.opts.instances) ctx.geoCache.set(key, out);
  return out;
}

/* Ghosting and the MEP x-ray both work the same way: clone the material, drop
   the opacity, stop writing depth. `depthWrite === false` on a transparent
   surface is therefore the signature of a VIEW AID rather than of real glass —
   real glass in the catalogue keeps depth writes on. That is the whole test,
   and it is why glass windows survive the pass while a ghosted wall does not. */
function isViewAidMaterial(m) {
  return !!(m && m.transparent && m.depthWrite === false && (m.opacity == null || m.opacity < 0.6));
}

/* Everything about a material that you can SEE, as a string.
 *
 * The furniture builder makes a material per mesh, so a plan exports with about
 * as many materials as it has parts — a real 37-piece flat came out with 103 of
 * them, of which a couple of dozen were distinct. In Blender that is 103 entries
 * in the shader dropdown and 103 things to edit when the client asks for a
 * different oak. Two materials that agree on every one of these fields render
 * identically, so they can be one.
 *
 * Maps are compared by object identity (uuid): the texture cache in view3d
 * already shares one THREE.Texture per finish, so identity is exactly the
 * question being asked, and it never merges two different images. Anything not
 * listed here is a field this app never sets; when that changes, this list is
 * what has to change with it, or two finishes silently become one. */
function materialLook(m) {
  var parts = [
    m.type,
    m.color ? m.color.getHexString() : "",
    m.roughness,
    m.metalness,
    m.opacity,
    m.transparent ? 1 : 0,
    m.depthWrite ? 1 : 0,
    m.side,
    m.flatShading ? 1 : 0,
    m.wireframe ? 1 : 0,
    m.vertexColors ? 1 : 0,
    m.emissive ? m.emissive.getHexString() : "",
    m.emissiveIntensity,
    m.envMapIntensity,
    m.transmission,
    m.thickness,
    m.ior,
    m.clearcoat,
    m.clearcoatRoughness,
    m.sheen,
    m.iridescence,
    m.specularIntensity,
    m.bumpScale,
    m.alphaTest,
    m.normalScale ? m.normalScale.x + "," + m.normalScale.y : "",
  ];
  ["map", "normalMap", "bumpMap", "roughnessMap", "metalnessMap", "alphaMap", "aoMap", "emissiveMap", "displacementMap"].forEach(
    function (slot) {
      var t = m[slot];
      parts.push(t ? slot + ":" + t.uuid + ":" + t.repeat.x + "," + t.repeat.y + ":" + t.offset.x + "," + t.offset.y : "");
    },
  );
  return parts.join("|");
}

function convertMaterial(src, kind, ctx) {
  var hit = ctx.matCache.get(src.uuid);
  if (hit) return hit;
  var look = ctx.opts.mergeMaterials ? materialLook(src) : null;
  if (look != null) {
    var twin = ctx.matByLook.get(look);
    if (twin) {
      ctx.matCache.set(src.uuid, twin);
      return twin;
    }
  }
  var out = src.clone();
  /* The live materials carry engine bookkeeping (physics props, the ghost
     flag). GLTFExporter turns material.userData into glTF extras, which land in
     Blender as custom properties on the material — noise nobody asked for. */
  out.userData = {};
  if (ctx.opts.solidifyViewAids && isViewAidMaterial(src)) {
    out.transparent = false;
    out.opacity = 1;
    out.depthWrite = true;
  }
  /* Backface culling is a viewport decision here (single-sided slabs seen from
     below), but in Blender a double-sided import just means the normals were
     never sorted out. Leave the flag alone — it round-trips — and only make
     sure a fully invisible material never reaches the file. */
  var hex = out.color && out.color.getHexString ? "#" + out.color.getHexString() : "";
  out.name = ctx.matName(
    materialName(src.name || kind, hex, {
      transparent: out.transparent,
      emissive: !!(out.emissive && out.emissive.getHex && out.emissive.getHex()),
    }),
    "Material",
  );
  ctx.matCache.set(src.uuid, out);
  /* Keyed on how the SOURCE looked. The clone may have just been solidified,
     and keying on that would merge a ghosted wall with a real pane of glass. */
  if (look != null) ctx.matByLook.set(look, out);
  ctx.owned.materials.push(out);
  ctx.stats.materials++;
  return out;
}

function materialFor(o, kind, ctx) {
  // a ghosted mesh is pointing at a clone; the real material is parked here
  var src = o.userData && o.userData.ghostBase ? o.userData.ghostBase : o.material;
  if (Array.isArray(src)) {
    return src.map(function (m) {
      return convertMaterial(m, kind, ctx);
    });
  }
  return convertMaterial(src, kind, ctx);
}

function triangleCount(geo) {
  var n = geo.index ? geo.index.count : geo.attributes.position ? geo.attributes.position.count : 0;
  return (n / 3) | 0;
}

/* Is this object worth putting in the file at all? Invisible objects are the
   interesting case: `visible === false` means three different things in this
   scene, and only one of them is "the user does not want to see this".
     - a wall cut away by the dollhouse view (userData.seeThrough) is model,
     - a hidden LAYER is a deliberate choice and follows opts.hidden,
     - the zero-opacity ceiling slab built when ceilings are off is neither. */
function isExportable(o, ctx, inHiddenLayer) {
  if (o.isSprite || o.isLine || o.isPoints) return false; // no glTF representation
  if (o.userData && o.userData.exportSkip) return false;
  if (o.visible === false && !(o.userData && o.userData.seeThrough)) {
    if (!ctx.opts.hidden) return false;
  }
  if (inHiddenLayer && !ctx.opts.hidden) return false;
  return true;
}

/* The planner's room-bounce light is its stand-in for global illumination;
   Blender computes the real thing, so exporting it would count it twice. */
function isBounceLight(src) {
  return !!(src.isRoomBounceLight || (src.userData && src.userData.bounce));
}

function convertLight(src, ctx) {
  var k = ctx.k;
  var out = src.clone();
  out.position.copy(src.position).multiplyScalar(k);
  /* Candela here is calibrated against centimetre throws (js/gpu.js CD), and
     illuminance falls off as 1/d^2 — so a scene shrunk by k has to have its
     punctual intensity scaled by k^2 or every lamp arrives 10,000x too hot.
     Directional light is measured in lux, which has no distance in it. */
  if (out.isPointLight || out.isSpotLight) {
    out.intensity = src.intensity * k * k;
    if (out.distance > 0) out.distance = src.distance * k;
  }
  out.castShadow = src.castShadow;
  out.name = ctx.name(src.name || (out.isSpotLight ? "Spot" : out.isPointLight ? "Lamp" : "Light"), "Light");
  ctx.stats.lights++;
  return out;
}

/* Deep-clone one subtree (a wall group, a furniture group, a lone slab) with
   the unit scale baked in. Scaling every LOCAL translation by k and every
   geometry by k scales the whole hierarchy by k without touching a single
   rotation — which is what keeps every object at scale 1.0 in Blender instead
   of inheriting 0.01 from a parent empty. */
function cloneSubtree(src, ctx, kind) {
  var k = ctx.k,
    out;
  if (src.isMesh) {
    var geo = scaledGeometry(src.geometry, ctx);
    out = new THREE.Mesh(geo, materialFor(src, kind, ctx));
    out.castShadow = src.castShadow;
    out.receiveShadow = src.receiveShadow;
    ctx.stats.meshes++;
    ctx.stats.triangles += triangleCount(geo);
  } else if (src.isLight) {
    if (!ctx.opts.lights || isBounceLight(src)) return null;
    out = convertLight(src, ctx);
    // the light's own position was scaled inside convertLight
    out.quaternion.copy(src.quaternion);
    out.scale.copy(src.scale);
    return out;
  } else {
    out = new THREE.Object3D();
  }
  out.position.copy(src.position).multiplyScalar(k);
  out.quaternion.copy(src.quaternion);
  out.scale.copy(src.scale);
  out.visible = true; // a cut-away wall is still part of the building
  for (var i = 0; i < src.children.length; i++) {
    var c = src.children[i];
    if (!isExportable(c, ctx, false)) {
      ctx.stats.skipped++;
      continue;
    }
    var cc = cloneSubtree(c, ctx, kind);
    if (cc) out.add(cc);
  }
  return out;
}

function hasGeometry(o) {
  var found = false;
  o.traverse(function (n) {
    if (n.isMesh || n.isLight) found = true;
  });
  return found;
}

/**
 * Build the export scene. Returns `{ scene, stats, dispose }`; call dispose()
 * once the exporter has finished with it.
 * @param {object} [options] see defaultOptions()
 */
export function buildBlenderScene(options) {
  var opts = Object.assign(defaultOptions(), options || {});
  var dyn = opts.source || getDynGroup();
  if (!dyn) return null;
  var ctx = newContext(opts);

  var scene = new THREE.Scene();
  scene.name = sanitizeBlenderName((S.workspace && S.workspace.name) || "Home", "Home");

  var groups = {};
  COLLECTIONS.forEach(function (c) {
    var g = new THREE.Group();
    g.name = c.name;
    g.userData = { home3d_kind: "collection", home3d_layer: c.id };
    groups[c.id] = g;
  });

  function place(node, cls) {
    var g = groups[cls.collection] || groups.structure;
    node.name = ctx.name(cls.name, "Object");
    if (cls.extras) node.userData = Object.assign({}, cls.extras, node.userData);
    g.add(node);
    ctx.stats.objects++;
  }

  /* One "thing" — a wall, a slab, a piece of furniture, a conduit run. Which
     layer root it came from decides where it lands when its own userData does
     not say (the MEP builder tags nothing). */
  function emit(src, defaultCollection, inHiddenLayer) {
    if (!isExportable(src, ctx, inHiddenLayer)) {
      ctx.stats.skipped++;
      return;
    }
    var ud = src.userData || {};
    if (ud.role === "ceilingHidden" && !opts.hidden) return; // built at opacity 0
    if ((ud.role === "ground" || ud.role === "site") && !opts.ground) return;
    if (src.isLight) {
      if (!opts.lights || isBounceLight(src)) return;
      var l = convertLight(src, ctx);
      groups.lights.add(l);
      ctx.stats.objects++;
      return;
    }
    var cls = classify(ud);
    if (cls.collection === "structure" && defaultCollection) cls.collection = defaultCollection;
    var node = cloneSubtree(src, ctx, cls.kind);
    if (!node || !hasGeometry(node)) return; // an empty group is noise in an outliner
    place(node, cls);
  }

  dyn.children.forEach(function (child) {
    var layer = child.userData && child.userData.layerRoot;
    if (!layer) {
      emit(child, null, false);
      return;
    }
    var hiddenLayer = child.visible === false;
    var def = layer === "furniture" ? "furniture" : layer === "mep" ? "mep" : null;
    child.children.forEach(function (thing) {
      emit(thing, def, hiddenLayer);
    });
  });

  if (opts.lights && !opts.source) addSun(groups.lights, ctx);

  /* A plan can sit hundreds of metres from the model origin (site-anchored
     work does exactly that), and Blender opens on the origin. Recentre on X/Y
     and drop the lowest point of the building — not of the ground plane — onto
     the floor, so the first thing the user sees is the model. */
  var bounds = new THREE.Box3();
  COLLECTIONS.forEach(function (c) {
    var g = groups[c.id];
    if (c.id === "site" || c.id === "lights" || !g.children.length) return;
    bounds.expandByObject(g);
  });
  var offset = new THREE.Vector3();
  if (opts.recenter && !bounds.isEmpty()) {
    var c = bounds.getCenter(new THREE.Vector3());
    offset.set(-c.x, -bounds.min.y, -c.z);
  }

  COLLECTIONS.forEach(function (cc) {
    var g = groups[cc.id];
    if (!g.children.length) return;
    g.position.copy(offset);
    scene.add(g);
  });

  var size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
  ctx.stats.units = opts.units;
  ctx.stats.size = { x: round3(size.x), y: round3(size.y), z: round3(size.z) };
  ctx.stats.geometries = ctx.geoCache.size || ctx.stats.geometries;

  return {
    scene: scene,
    stats: ctx.stats,
    dispose: function () {
      ctx.owned.geometries.forEach(function (g) {
        g.dispose();
      });
      /* Textures are NOT disposed: the clones share them with the live scene,
         and freeing them here would blank the floor the user is looking at. */
      ctx.owned.materials.forEach(function (m) {
        m.dispose();
      });
      ctx.owned.geometries.length = 0;
      ctx.owned.materials.length = 0;
    },
  };
}

/* The sun lives on the scene, not on `dyn`, so it is added by hand — and glTF
   directional lights point down their own -Z, with no target node of their own.
   The exporter warns unless the target is a child at (0,0,-1), so build that
   shape explicitly rather than cloning three's separate-target arrangement. */
function addSun(parent, ctx) {
  var rig = getRigLights && getRigLights();
  var sun = rig && rig.sun;
  if (!sun || sun.visible === false || !(sun.intensity > 0)) return;
  var dir = new THREE.Vector3()
    .subVectors(sun.target ? sun.target.position : new THREE.Vector3(), sun.position)
    .normalize();
  if (!dir.lengthSq()) dir.set(0, -1, 0);
  var out = new THREE.DirectionalLight(sun.color.getHex(), sun.intensity);
  out.position.copy(sun.position).multiplyScalar(ctx.k);
  out.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  var target = new THREE.Object3D();
  target.position.set(0, 0, -1);
  out.add(target);
  out.target = target;
  out.castShadow = sun.castShadow;
  out.name = ctx.name("Sun", "Sun");
  parent.add(out);
  ctx.stats.lights++;
  ctx.stats.objects++;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/* ---- the file ------------------------------------------------------------- */

/**
 * Export the current 3D view for Blender.
 * @param {object} [options] see defaultOptions()
 * @returns {Promise<{blob: Blob, filename: string, stats: object}>}
 */
export async function exportForBlender(options) {
  var opts = Object.assign(defaultOptions(), options || {});
  if (!has3D()) throw new Error("no3d");
  ensureBuilt(); // a queued rebuild must land before the graph is read
  var built = buildBlenderScene(opts);
  if (!built) throw new Error("no3d");
  try {
    var mod = await import("three/addons/exporters/GLTFExporter.js");
    var exporter = new mod.GLTFExporter();
    var result = await exporter.parseAsync(built.scene, {
      binary: opts.format === "glb",
      // TRS instead of a baked matrix: Blender shows loc/rot/scale in the
      // N-panel either way, but a matrix node cannot be edited numerically.
      trs: true,
      onlyVisible: false, // visibility was decided above, with the context to do it
      maxTextureSize: opts.maxTextureSize,
      includeCustomExtensions: false,
    });
    var isGlb = opts.format === "glb";
    var text = isGlb ? null : JSON.stringify(result, null, 2);
    var blob = isGlb
      ? new Blob([result], { type: "model/gltf-binary" })
      : new Blob([text], { type: "model/gltf+json" });
    return {
      blob: blob,
      filename: exportFilename(opts),
      stats: Object.assign({ bytes: blob.size }, built.stats),
    };
  } finally {
    built.dispose();
  }
}

export function exportFilename(opts) {
  var base = sanitizeBlenderName((S.workspace && S.workspace.name) || "home", "home")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return base + (opts && opts.format === "gltf" ? ".gltf" : ".glb");
}
