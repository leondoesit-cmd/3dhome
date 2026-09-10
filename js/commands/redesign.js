import { normalizeBaselines, redesignPolicy } from "../redesign.js";

export const redesignCommand = Object.freeze({
  id: "project.redesign",
  prepare(params, env) {
    const state = env.state, workspace = state.workspace;
    if (!workspace || workspace.role === "viewer") return { ok: false, reason: "READ_ONLY" };
    const floorId = workspace.activeFloor;
    const policy = redesignPolicy(state);
    if (params.action === "start") {
      if (!state.walls.length) return { ok: false, reason: "EMPTY_BASELINE" };
      if (!params.id || (workspace.baselines || []).some((entry) => entry.id === params.id)) return { ok: false, reason: "INVALID_BASELINE" };
      const [baseline] = normalizeBaselines([{ id: params.id, name: params.name, createdAt: params.createdAt, floorId,
        scene: env.services.sceneObject(false) }]);
      if (!baseline) return { ok: false, reason: "INVALID_BASELINE" };
      return { ok: true, plan: { command: "project.redesign", params: { action: "start", baseline, floorId } },
        targets: [{ kind: "project", id: workspace.id }] };
    }
    if (params.action !== "scope" || !policy) return { ok: false, reason: "NO_REDESIGN_BASELINE" };
    const ids = [...new Set((params.wallIds || []).map(String))];
    if (!ids.length || ids.some((id) => !state.walls.some((wall) => String(wall.id) === id))) return { ok: false, reason: "INVALID_SCOPE" };
    const allowed = new Set(policy.allowedWallIds);
    ids.forEach((id) => { if (params.allow === true) allowed.add(id); else allowed.delete(id); });
    return { ok: true, plan: { command: "project.redesign", params: { action: "scope", floorId, baselineId: policy.baselineId,
      allowedWallIds: [...allowed].sort() } }, targets: ids.map((id) => ({ kind: "wall", id })) };
  },
  apply(plan, env) {
    const p = plan.params, workspace = env.state.workspace;
    workspace.redesign ||= {};
    if (p.action === "start") {
      const [baseline] = normalizeBaselines([p.baseline]);
      workspace.baselines = Object.freeze([...(workspace.baselines || []), baseline]);
      workspace.redesign[p.floorId] = { version: 1, baselineId: baseline.id, allowedWallIds: [] };
    } else workspace.redesign[p.floorId] = { version: 1, baselineId: p.baselineId, allowedWallIds: p.allowedWallIds.slice() };
    return { ok: true, changed: [{ kind: "project", id: workspace.id }], effects: { refreshInspector: true } };
  },
});
