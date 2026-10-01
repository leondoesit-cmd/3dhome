// Full structural comparison for runtime pivot updates. Driving dimensions,
// materials and part topology remain dependencies; only placement and the
// cabinet's runtime opening fraction are allowed to vary without rebuilding.
export function cabinetRuntimeMeshKey(item, layout, definition) {
  try {
    const cab = { ...item.cab }, runtimeState = { ...item.runtimeState };
    delete cab.open; delete runtimeState.cabinetOpen;
    const input = { ...item, cab, runtimeState };
    delete input.x; delete input.z; delete input.rot;
    const units = layout.units.map(unit => {
      const structural = { ...unit };
      for (const key of ['ang', 'tx', 'ty', 'tz']) delete structural[key];
      return structural;
    });
    return JSON.stringify({ item: input, definition, parts: layout.parts, units });
  } catch { return null; }
}

export function placeCabinetUnit(group, unit, elevation) {
  group.position.set((unit.px || 0) + (unit.tx || 0), elevation + (unit.py || 0) + (unit.ty || 0), (unit.pz || 0) + (unit.tz || 0));
  group.rotation.set(0, 0, 0);
  if (unit.rot) group.rotation[unit.rot] = unit.ang || 0;
}
