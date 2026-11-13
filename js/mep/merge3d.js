/* The 3D infrastructure, drawn in a few draw calls instead of hundreds.

   buildMEP3D() makes one small mesh per pipe segment, duct collar, hanger,
   riser and device marker: ~400 meshes in a generated apartment, each a draw
   call of its own in every pass. They are static and share a handful of
   materials (one per system colour), so after the build every opaque mesh is
   baked into one geometry per material: the same triangles at the same world
   positions, drawn with the same material, so the picture does not change.

   Left alone: transparent meshes (the under-floor x-ray guides sort and blend
   per object), anything with children or a non-default render order, and
   any material used by a single mesh. Not run while physics is on: the
   sandbox makes one rigid body per mesh, and a pipe should stay its own
   collider (enabling physics rebuilds the scene, so it never sees a merged
   one).

   Pure: takes THREE as an argument (tested in Node). */

function mepMergeKey(o) {
  if (!o.isMesh || o.isInstancedMesh || o.children.length) return null;
  var m = o.material, g = o.geometry;
  if (!m || Array.isArray(m) || !g || !g.isBufferGeometry || g.morphAttributes && Object.keys(g.morphAttributes).length) return null;
  // a transparent guide is sorted and blended per object: merged, two
  // colours that overlap swap which one is on top (measured: ~760 pixels of a
  // generated apartment's x-ray view changed by more than 32 levels)
  if (m.transparent) return null;
  if (o.visible === false || o.castShadow || o.receiveShadow) return null;
  if (!g.attributes.position || !g.attributes.normal) return null;
  return m.uuid + "|" + o.renderOrder;
}

// one geometry from several, each moved by its mesh's own transform
function mepBakeGeometries(meshes, THREE) {
  var names = ["position", "normal", "uv"].filter(function (n) {
    return meshes.every(function (o) { return !!o.geometry.attributes[n]; });
  });
  var total = 0, totalIdx = 0;
  meshes.forEach(function (o) {
    var g = o.geometry;
    total += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  });
  var out = {}, sizes = {};
  names.forEach(function (n) {
    sizes[n] = meshes[0].geometry.attributes[n].itemSize;
    out[n] = new Float32Array(total * sizes[n]);
  });
  var index = total > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  var v = new THREE.Vector3(), nm = new THREE.Matrix3(), base = 0, ii = 0;
  meshes.forEach(function (o) {
    o.updateMatrix();
    var g = o.geometry, M = o.matrix, count = g.attributes.position.count;
    nm.getNormalMatrix(M);
    var pos = g.attributes.position, nor = g.attributes.normal;
    for (var i = 0; i < count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      out.position[(base + i) * 3] = v.x; out.position[(base + i) * 3 + 1] = v.y; out.position[(base + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      out.normal[(base + i) * 3] = v.x; out.normal[(base + i) * 3 + 1] = v.y; out.normal[(base + i) * 3 + 2] = v.z;
    }
    if (out.uv) {
      var uv = g.attributes.uv;
      for (var k = 0; k < count; k++) { out.uv[(base + k) * 2] = uv.getX(k); out.uv[(base + k) * 2 + 1] = uv.getY(k); }
    }
    if (g.index) for (var j = 0; j < g.index.count; j++) index[ii++] = g.index.getX(j) + base;
    else for (var q = 0; q < count; q++) index[ii++] = q + base;
    base += count;
  });
  var merged = new THREE.BufferGeometry();
  names.forEach(function (n) { merged.setAttribute(n, new THREE.BufferAttribute(out[n], sizes[n])); });
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/* Merge `group`'s direct mesh children per material. Returns how many meshes
   were folded away. The originals' geometries are disposed. */
export function mergeMEPMeshes(group, THREE) {
  if (!group || !THREE) return 0;
  var buckets = new Map(), order = [];
  group.children.forEach(function (o) {
    var key = mepMergeKey(o);
    if (!key) return;
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key).push(o);
  });
  var folded = 0;
  order.forEach(function (key) {
    var meshes = buckets.get(key);
    if (meshes.length < 2) return;
    var mesh = new THREE.Mesh(mepBakeGeometries(meshes, THREE), meshes[0].material);
    mesh.renderOrder = meshes[0].renderOrder;
    mesh.userData.mepMerged = meshes.length;
    // where the first of them was, so draw order among the rest is kept
    var at = group.children.indexOf(meshes[0]);
    meshes.forEach(function (o) {
      group.remove(o);
      o.geometry.dispose();
    });
    group.add(mesh);
    // put it back at its first member's place in the child list
    group.children.splice(group.children.indexOf(mesh), 1);
    group.children.splice(Math.min(at, group.children.length), 0, mesh);
    folded += meshes.length - 1;
  });
  return folded;
}
