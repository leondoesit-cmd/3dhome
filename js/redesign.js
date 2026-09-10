// Baselines are immutable floor snapshots, never a second editable wall graph.
// Permissions apply to generated proposals only. Manual capture stays editable.
const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value, max = 100) => typeof value === "string" ? value.trim().slice(0, max) : "";
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function newDocumentKey() {
  return "doc-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
}
export function baselineScene(scene) {
  const spatial = scene?.spatial || scene || {};
  return { nodes: spatial.nodes || [], walls: spatial.walls || [], openings: spatial.openings || [],
    items: spatial.instances || spatial.items || [] };
}
export function normalizeBaselines(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const ids = new Set();
  return Object.freeze(value.flatMap((entry) => {
    const id = text(entry?.id), floorId = text(entry?.floorId);
    const scene = entry?.scene, model = baselineScene(scene);
    if (!id || !floorId || !scene || typeof scene !== "object" || Array.isArray(scene) || ids.has(id) || !Array.isArray(model.nodes) ||
        !Array.isArray(model.walls) || !Array.isArray(model.openings) || !Array.isArray(model.items) ||
        model.nodes.some((node) => !node || !Number.isFinite(node.x) || !Number.isFinite(node.z)) ||
        model.walls.some((wall) => !wall || !model.nodes[wall.a] || !model.nodes[wall.b])) return [];
    ids.add(id);
    // No nested workspace/archive: a baseline is exactly one floor snapshot.
    const copy = clone(scene);
    delete copy.workspace;
    return [freeze({ version: 1, id, floorId, name: text(entry.name) || "Baseline", createdAt: text(entry.createdAt), scene: copy })];
  }));
}
export function mergeBaselineArchives(first, second) {
  const known = new Set((first || []).map((entry) => entry.id));
  const added = (second || []).filter((entry) => !known.has(entry.id));
  return added.length ? Object.freeze([...(first || []), ...added]) : first || Object.freeze([]);
}
export function normalizeRedesign(value, baselines) {
  const result = {};
  for (const [floorId, entry] of Object.entries(value || {})) {
    if (["__proto__", "constructor", "prototype"].includes(floorId)) continue;
    if (!entry || !(baselines || []).some((baseline) => baseline.id === entry.baselineId && baseline.floorId === floorId)) continue;
    result[floorId] = { version: 1, baselineId: entry.baselineId,
      allowedWallIds: [...new Set((Array.isArray(entry.allowedWallIds) ? entry.allowedWallIds : []).map(String))] };
  }
  return result;
}
export function redesignPolicy(state) {
  const workspace = state.workspace || {};
  const policy = workspace.redesign?.[workspace.activeFloor];
  if (!policy || !(workspace.baselines || []).some((baseline) => baseline.id === policy.baselineId && baseline.floorId === workspace.activeFloor)) return null;
  return policy;
}
export function generatedChangePermission(state, commandId, params = {}) {
  const policy = redesignPolicy(state);
  if (!policy) return { ok: true };
  if (["item.move", "item.place", "item.duplicate"].includes(commandId)) return { ok: true };
  const allowed = new Set(policy.allowedWallIds || []);
  const protectedWalls = (state.walls || []).filter((wall) => !allowed.has(String(wall.id)));
  if (commandId === "opening.place") {
    return allowed.has(String(params.wallId)) ? { ok: true } : { ok: false, reason: "PROTECTED_STRUCTURE" };
  }
  if(commandId==='room.resize_exact')return Array.isArray(params.wallIds)&&params.wallIds.every(id=>allowed.has(String(id)))?{ok:true}:{ok:false,reason:'PROTECTED_STRUCTURE'};
  // Whole-layout writers require explicit permission for every existing wall.
  // Localized layout generation is deferred until it can prove spatial isolation.
  if (["wall.draw", "room.create", "room.stamp", "document.generate_apartment", "document.import_blueprint"].includes(commandId)) {
    return protectedWalls.length ? { ok: false, reason: "PROTECTED_STRUCTURE", wallIds: protectedWalls.map((wall) => wall.id) } : { ok: true };
  }
  return { ok: false, reason: "PROTECTED_STRUCTURE" };
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, stable(value[key])]));
  return value;
}
function wallRecord(wall, nodes) {
  return { ...wall, a: nodes[wall.a] ? { x: nodes[wall.a].x, z: nodes[wall.a].z } : null,
    b: nodes[wall.b] ? { x: nodes[wall.b].x, z: nodes[wall.b].z } : null };
}
export function captureProtectedStructure(state) {
  const policy = redesignPolicy(state);
  if (!policy) return null;
  const allowed = new Set(policy.allowedWallIds || []);
  const walls = (state.walls || []).filter((wall) => !allowed.has(String(wall.id)));
  const ids = new Set(walls.map((wall) => String(wall.id)));
  return clone({ walls: walls.map((wall) => wallRecord(wall, state.nodes)),
    openings: (state.openings || []).filter((opening) => ids.has(String(opening.wall))),
    wallTypes: state.wallTypes || [] });
}
export function validateProtectedStructure(before, state) {
  if (!before) return { ok: true };
  const ids = new Set(before.walls.map((wall) => String(wall.id)));
  const after = { walls: (state.walls || []).filter((wall) => ids.has(String(wall.id))).map((wall) => wallRecord(wall, state.nodes)),
    openings: (state.openings || []).filter((opening) => ids.has(String(opening.wall))), wallTypes: state.wallTypes || [] };
  return JSON.stringify(stable(before)) === JSON.stringify(stable(after)) ? { ok: true } : { ok: false, reason: "PROTECTED_STRUCTURE" };
}
export function compareBaseline(baseline, state) {
  if (!baseline || baseline.floorId !== state.workspace?.activeFloor) return null;
  const before = baselineScene(baseline.scene), after = baselineScene(state);
  const report = {};
  for (const kind of ["walls", "openings", "items"]) {
    const record = (entry, model) => kind === "walls" ? wallRecord(entry, model.nodes) : entry;
    const a = new Map(before[kind].map((entry) => [String(entry.id), record(entry, before)]));
    const b = new Map(after[kind].map((entry) => [String(entry.id), record(entry, after)]));
    const added = [], removed = [], changed = [];
    for (const [id, value] of b) {
      if (!a.has(id)) added.push(id);
      else if (JSON.stringify(stable(value)) !== JSON.stringify(stable(a.get(id)))) changed.push(id);
    }
    for (const id of a.keys()) if (!b.has(id)) removed.push(id);
    report[kind] = { before: a.size, after: b.size, added, removed, changed };
  }
  return report;
}
