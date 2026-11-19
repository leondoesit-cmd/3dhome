/* One piece of furniture in a few draw calls instead of dozens.

   A catalogue model is built from primitives (js/primitives.js), and every
   box, cylinder and sphere gets a material of its own: a kitchen run is ~40
   meshes, a bed ~13, and each one is a draw call in the lit pass and in every
   shadow pass that sees it (672 furniture meshes in the generated apartment).
   Most of those materials are equal by value. After the build, the item's
   direct mesh children whose materials are equal, and that cast and receive
   shadows alike and belong to the same physics class, are baked into one
   geometry: the same triangles in the same place, drawn with one of those
   equal materials, so the picture does not change.

   Left alone: transparent meshes (sorted and blended per object), mirrored
   transforms (baking would turn the faces inside out), meshes with children
   or anything beyond position/normal/uv, and whole items that hold anything
   other than plain meshes (cabinet unit pivots that the runtime update moves,
   animated people). Callers skip it while physics runs: the sandbox breaks a
   piece into its meshes when it is struck.

   Pure: takes THREE as an argument (tested in Node). */
import { mepBakeGeometries } from "../mep/merge3d.js";

var SKIP_KEYS = { uuid: 1, id: 1, name: 1, version: 1, _listeners: 1 };

function sameValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== typeof b) return false;
  if (typeof a === "number") return a !== a && b !== b; // both NaN
  if (typeof a !== "object") return false;
  if (a.isColor) return !!b.isColor && a.equals(b);
  if (a.isVector2 || a.isVector3 || a.isVector4 || a.isEuler) return a.constructor === b.constructor && a.equals(b);
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  // plain data (userData, defines); anything else (textures, nodes) by identity
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var j = 0; j < ka.length; j++) if (!sameValue(a[ka[j]], b[ka[j]])) return false;
  return true;
}

/** Two materials that draw the same: same class and every own property equal
 *  (maps by identity). Ids, names and listeners do not count. */
export function sameMaterial(a, b) {
  if (a === b) return true;
  if (!a || !b || a.constructor !== b.constructor) return false;
  var keys = Object.keys(a), seen = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    seen[k] = 1;
    if (SKIP_KEYS[k]) continue;
    if (!(k in b) || !sameValue(a[k], b[k])) return false;
  }
  var kb = Object.keys(b);
  for (var j = 0; j < kb.length; j++) if (!seen[kb[j]] && !SKIP_KEYS[kb[j]]) return false;
  return true;
}

var ATTRS = { position: 3, normal: 3, uv: 2 };

// the mesh-level part of the key, or null for a mesh that is never merged
function meshKey(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length) return null;
  var m = o.material, g = o.geometry;
  if (!m || Array.isArray(m) || m.transparent || !g || !g.isBufferGeometry) return null;
  if (g.morphAttributes && Object.keys(g.morphAttributes).length) return null;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return null;
  var names = Object.keys(g.attributes);
  if (!g.attributes.position || !g.attributes.normal) return null;
  for (var i = 0; i < names.length; i++) {
    var a = g.attributes[names[i]];
    if (ATTRS[names[i]] !== a.itemSize || a.isInterleavedBufferAttribute) return null;
  }
  var ud = Object.keys(o.userData);
  if (ud.some(function (k) { return k !== "physicsProps"; })) return null;
  if (o.visible === false || !o.matrixAutoUpdate || Object.prototype.hasOwnProperty.call(o, "onBeforeRender")) return null;
  o.updateMatrix();
  if (o.matrix.determinant() <= 0) return null;
  return [o.castShadow, o.receiveShadow, o.renderOrder, o.frustumCulled, o.layers.mask, !!g.attributes.uv].join("|");
}

/** Merge item group `g`'s direct mesh children that draw alike. Returns how
 *  many meshes were folded away (0 when the item is left as built). The
 *  folded meshes' geometries and duplicate materials are disposed. */
export function mergeItemMeshes(g, THREE) {
  if (!g || !THREE || (g.userData && g.userData.isHuman)) return 0;
  var kids = g.children;
  for (var i = 0; i < kids.length; i++) if (!kids[i].isMesh) return 0;
  var buckets = []; // { key, mat, phys, meshes }
  kids.forEach(function (o) {
    var key = meshKey(o);
    if (key == null) return;
    var phys = o.userData.physicsProps;
    for (var b = 0; b < buckets.length; b++) {
      var e = buckets[b];
      if (e.key === key && e.phys === phys && sameMaterial(e.mat, o.material)) {
        e.meshes.push(o);
        return;
      }
    }
    buckets.push({ key: key, mat: o.material, phys: phys, meshes: [o] });
  });
  var folded = 0;
  buckets.forEach(function (e) {
    var meshes = e.meshes;
    if (meshes.length < 2) return;
    var first = meshes[0];
    var mesh = new THREE.Mesh(mepBakeGeometries(meshes, THREE), first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    mesh.layers.mask = first.layers.mask;
    if (e.phys !== undefined) mesh.userData.physicsProps = e.phys;
    mesh.userData.itemMerged = meshes.length;
    var at = kids.indexOf(first);
    meshes.forEach(function (o) {
      g.remove(o);
      o.geometry.dispose();
      if (o.material !== first.material) o.material.dispose();
    });
    // in its first member's place, so the order of the rest is kept
    g.add(mesh);
    kids.splice(kids.indexOf(mesh), 1);
    kids.splice(Math.min(at, kids.length), 0, mesh);
    folded += meshes.length - 1;
  });
  return folded;
}
