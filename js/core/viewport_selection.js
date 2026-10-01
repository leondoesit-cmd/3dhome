const states = new WeakMap();

// Selection is presentation state. Keep geometry and the original material
// values, including full-precision emissive colour, while changing its tint.
export function syncViewportSelectionMaterial(mesh, options = {}) {
  if (!mesh?.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
  let state = states.get(mesh);
  if (!state) {
    const material = mesh.material;
    state = { emissive: material.emissive?.clone(), intensity: material.emissiveIntensity,
      opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite,
      stamp: '', owned: !!options.materialOwned };
    states.set(mesh, state);
  }
  const { partSelected = false, componentSelected = false, dependency = '', dependencyHighlight = false } = options;
  const dimmed = dependencyHighlight && !dependency && !options.preserveAppearanceOpacity;
  const stamp = [partSelected, componentSelected, dependency, dimmed].join(':');
  if (state.stamp === stamp) return;
  state.stamp = stamp;
  const tintChanges = !!mesh.material.emissive && (partSelected || componentSelected || dependency);
  if (!state.owned && (tintChanges || dimmed)) {
    mesh.material = mesh.material.clone();
    state.owned = true;
  }
  const material = mesh.material;
  if (state.emissive && material.emissive) material.emissive.copy(state.emissive);
  if (state.intensity !== undefined) material.emissiveIntensity = state.intensity;
  const transparent = dimmed || state.transparent;
  const depthWrite = dimmed ? false : state.depthWrite;
  if (material.transparent !== transparent || material.depthWrite !== depthWrite) material.needsUpdate = true;
  material.transparent = transparent;
  material.depthWrite = depthWrite;
  material.opacity = dimmed ? Math.min(Number(state.opacity) || 1, .2) : state.opacity;
  if (partSelected && material.emissive) material.emissive.setHex(0x3f2508);
  if (dependency) {
    if (material.emissive) material.emissive.setHex(dependency === 'focus' ? 0x5a3a00 : dependency === 'upstream' ? 0x063a5a : 0x42135f);
    if (material.emissiveIntensity != null) material.emissiveIntensity = .85;
  }
  if (componentSelected && material.emissive) material.emissive.setHex(0x4b2800);
}
