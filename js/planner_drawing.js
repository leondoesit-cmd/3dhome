// Drawing edges live outside the model: no picking, export or shadow changes.
// Inject the late-loaded three namespace so this stays off the boot graph.
export function createPlannerDrawing(THREE) {
  const group = new THREE.Group();
  group.name = "Planner drawing overlay";
  const material = new THREE.LineBasicMaterial({
    color: 0x263840, transparent: true, opacity: 0.85,
    depthTest: true, depthWrite: false, toneMapped: false,
  });
  const meshes = new Map();
  const geometries = new Map();

  function sync(roots) {
    const live = new Set(), used = new Set();
    for (const root of roots) {
      if (!root) continue;
      let ancestor = root, visible = true;
      while (ancestor) {
        if (!ancestor.visible) { visible = false; break; }
        ancestor = ancestor.parent;
      }
      if (!visible) continue;
      root.updateWorldMatrix(true, true);
      root.traverseVisible(mesh => {
        if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || !mesh.geometry) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (!materials.some(m => m && m.visible && (!m.transparent || m.opacity >= 0.5))) return;
        const source = mesh.geometry;
        const revision = `${source.attributes.position?.version}:${source.index?.version}`;
        let geometry = geometries.get(source);
        if (geometry && geometry.userData.sourceRevision !== revision) {
          geometry.dispose();
          geometry = null;
        }
        if (!geometry) {
          // Keep creases and boundaries; suppress triangulation and smooth curves.
          geometry = new THREE.EdgesGeometry(source, 25);
          geometry.userData.sourceRevision = revision;
          geometries.set(source, geometry);
        }
        used.add(source);
        let line = meshes.get(mesh);
        if (!line) {
          line = new THREE.LineSegments(geometry, material);
          line.matrixAutoUpdate = false;
          line.raycast = () => {};
          group.add(line);
          meshes.set(mesh, line);
        }
        line.geometry = geometry;
        line.matrix.copy(mesh.matrixWorld);
        line.matrixWorldNeedsUpdate = true;
        line.layers.mask = mesh.layers.mask;
        live.add(mesh);
      });
    }
    for (const [mesh, line] of meshes) {
      if (!live.has(mesh)) { group.remove(line); meshes.delete(mesh); }
    }
    for (const [source, geometry] of geometries) {
      if (!used.has(source)) { geometry.dispose(); geometries.delete(source); }
    }
  }

  function dispose() {
    group.removeFromParent();
    group.clear();
    meshes.clear();
    for (const geometry of geometries.values()) geometry.dispose();
    geometries.clear();
    material.dispose();
  }
  return { group, sync, dispose };
}
