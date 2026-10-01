// Classic WebGLRenderer clips materials rather than ClippingGroup nodes.
// Keep the CAD root's section semantics while leaving scene helpers unclipped.
const authored = new WeakMap();

export function syncEditorClipping(renderer, group) {
  if (!renderer || !renderer.isWebGLRenderer || !group) return;
  renderer.localClippingEnabled = true;
  const section = group.enabled ? group.clippingPlanes || [] : [];
  group.traverse(function (object) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      let state = authored.get(material);
      if (!state) {
        state = { planes: material.clippingPlanes, shadows: material.clipShadows, section: null, enabled: false };
        authored.set(material, state);
      }
      const enabled = section.length > 0;
      if (state.section === section && state.enabled === enabled) continue;
      const previousCount = material.clippingPlanes ? material.clippingPlanes.length : 0;
      material.clippingPlanes = enabled ? (state.planes || []).concat(section) : state.planes;
      material.clipShadows = enabled ? !!group.clipShadows : state.shadows;
      const count = material.clippingPlanes ? material.clippingPlanes.length : 0;
      if (count !== previousCount) material.needsUpdate = true;
      state.section = section;
      state.enabled = enabled;
    }
  });
}
