// A cabinet edit may refit linked layouts. Restore the whole affected set.
import { cloneDomain } from "./core/schema.js";
import { rebuildItem } from "./core/project.js";
import { syncCabinetDefinition } from "./parametric_cabinet.js";

export function captureCabinetSession(state, item) {
  const snapshot = (entry) => ({ id: entry.id, definitionId: entry.definitionId, cab: cloneDomain(entry.cab), w: entry.w, h: entry.h, d: entry.d });
  return { ...snapshot(item), linked: (state.items || []).filter((other) => other !== item && item.definitionId && other.definitionId === item.definitionId).map(snapshot) };
}

export function restoreCabinetSession(state, item, snapshot) {
  const restore = (entry, data) => {
    if (data.definitionId) entry.definitionId = data.definitionId;
    entry.cab = cloneDomain(data.cab);
    entry.w = data.w; entry.h = data.h; entry.d = data.d;
    entry.parameterOverrides = { ...entry.parameterOverrides, width: data.w, height: data.h, depth: data.d };
  };
  restore(item, snapshot);
  syncCabinetDefinition(state, item, {propagate:false});
  for (const saved of snapshot.linked || []) {
    const other = (state.items || []).find((entry) => entry !== item && entry.id === saved.id);
    if (other) { restore(other, saved); rebuildItem(state, other); }
  }
}
