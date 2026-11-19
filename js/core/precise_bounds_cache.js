// Reuse exact world-space bounds, never a transformed local AABB. Camera
// changes are absent from this key; geometry and every descendant transform
// are present. Deforming/custom vertex readers take Three's original path.
export function createPreciseBoundsCache(THREE) {
  const entries = new WeakMap();
  const stats = { hits: 0, scans: 0 };
  function bounds(root) {
    root.updateWorldMatrix(true, true);
    const key = [];
    let reusable = true;
    root.traverse(object => {
      key.push(object, ...object.matrixWorld.elements);
      const geometry = object.geometry;
      if (!geometry) return;
      const position = geometry.getAttribute('position');
      key.push(geometry, position, position?.array, position?.version,
        position?.data, position?.data?.array, position?.data?.version, position?.count,
        position?.itemSize, position?.normalized, position?.offset, position?.data?.stride);
      if (!position || object.isSkinnedMesh || object.isInstancedMesh ||
          geometry.morphAttributes.position?.length ||
          (object.isMesh && object.getVertexPosition !== THREE.Mesh.prototype.getVertexPosition)) reusable = false;
    });
    const prior = entries.get(root);
    if (reusable && prior && key.length === prior.key.length && key.every((value, i) => value === prior.key[i])) {
      stats.hits++;
      return prior.box;
    }
    stats.scans++;
    const box = new THREE.Box3().expandByObject(root, true);
    if (reusable) entries.set(root, { key, box });
    else entries.delete(root);
    return box;
  }
  return { bounds, stats };
}
