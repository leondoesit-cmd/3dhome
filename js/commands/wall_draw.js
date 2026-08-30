// Pure command contract for one straight planner wall. Rich topology landing
// (split/weld/join) is injected by the planner; the fallback intentionally does
// only exact endpoint reuse so programmatic and Node clients stay predictable.

export const WALL_DRAW_CODES = Object.freeze([
  "INVALID_WALL_POINT",
  "ZERO_LENGTH_WALL",
  "INVALID_WALL_VALUE",
  "WALL_MATERIALIZATION_FAILED",
]);

const DEFAULTS = Object.freeze({
  type: "generic",
  kind: "normal",
  loc: "center",
  dimSide: 0,
  height: 270,
  thickness: 10,
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function point(value) {
  if (!value || !finite(Number(value.x)) || !finite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

function failure(reason) {
  return { ok: false, reason: reason };
}

function versionOf(env) {
  if (env && env.version && typeof env.version.current === "function")
    return env.version.current();
  if (env && env.version != null && typeof env.version !== "object") return env.version;
  return null;
}

export function prepareWallDraw(params, env) {
  params = params || {};
  var from = point(params.from), to = point(params.to);
  if (!from || !to) return failure("INVALID_WALL_POINT");
  if (Math.hypot(to.x - from.x, to.z - from.z) <= 1e-9)
    return failure("ZERO_LENGTH_WALL");

  var type = params.type == null ? DEFAULTS.type : String(params.type).trim();
  var kind = params.kind == null ? DEFAULTS.kind : String(params.kind).trim();
  var height = params.height == null ? DEFAULTS.height : Number(params.height);
  var thickness = params.thickness == null ? DEFAULTS.thickness : Number(params.thickness);
  var loc = params.loc === "face" ? "face" : params.loc == null || params.loc === "center" ? "center" : "";
  var dimSide = params.dimSide == null ? (loc === "face" ? -1 : 0) : Number(params.dimSide);
  if (!type || !kind || !finite(height) || height <= 0 || !finite(thickness) || thickness <= 0 ||
      !loc || (dimSide !== -1 && dimSide !== 0 && dimSide !== 1))
    return failure("INVALID_WALL_VALUE");
  if (loc === "face" && dimSide === 0) dimSide = -1;
  if (dimSide === 0) loc = "center";

  var normalized = {
    from: from,
    to: to,
    type: type,
    kind: kind,
    loc: loc,
    dimSide: dimSide,
    height: height,
    thickness: thickness,
  };
  if (params.datum != null && String(params.datum).trim()) normalized.datum = String(params.datum).trim();
  if (params.phase != null && String(params.phase).trim()) normalized.phase = String(params.phase).trim();
  return {
    ok: true,
    plan: {
      command: "wall.draw",
      expectedVersion: params.expectedVersion != null ? params.expectedVersion : versionOf(env),
      params: normalized,
    },
  };
}

export function previewWallDraw(plan) {
  var params = plan && plan.params;
  if (!params) return null;
  return {
    kind: "wall",
    from: { x: params.from.x, z: params.from.z },
    to: { x: params.to.x, z: params.to.z },
    wallType: params.type,
    wallKind: params.kind,
    thickness: params.thickness,
    height: params.height,
    loc: params.loc,
    dimSide: params.dimSide,
    style: "ghost-valid",
  };
}

function exactNodeIndex(nodes, p) {
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node && node.x === p.x && node.z === p.z) return i;
  }
  return -1;
}

export function materializeWallFallback(params, env) {
  var state = env && env.state;
  if (!state || !Array.isArray(state.nodes) || !Array.isArray(state.walls) ||
      !finite(Number(state.idc))) return failure("WALL_MATERIALIZATION_FAILED");
  var createdNodeIds = [];
  function nodeAt(p) {
    var index = exactNodeIndex(state.nodes, p);
    if (index >= 0) return index;
    index = state.nodes.length;
    state.nodes.push({ x: p.x, z: p.z });
    createdNodeIds.push(index);
    return index;
  }
  var a = nodeAt(params.from), b = nodeAt(params.to);
  if (a === b) return failure("ZERO_LENGTH_WALL");
  var wall = {
    id: state.idc++,
    a: a,
    b: b,
    thickness: params.thickness,
    height: params.height,
    wallTypeId: params.type,
    kind: params.kind,
    loc: params.loc,
    dimSide: params.dimSide,
  };
  if (params.datum) wall.datum = params.datum;
  if (params.phase) wall.phase = params.phase;
  state.walls.push(wall);
  return { ok: true, wall: wall, createdNodeIds: createdNodeIds, changedNodeIds: [] };
}

function semanticNodes(ids) {
  return (ids || []).map(function (id) { return { kind: "node", id: id }; });
}

export function applyWallDraw(plan, env) {
  var params = plan && plan.params;
  if (!params) return failure("WALL_MATERIALIZATION_FAILED");
  var service = env && env.services && env.services.materializeWall;
  var result;
  try {
    result = typeof service === "function"
      ? service(params, env)
      : materializeWallFallback(params, env);
  } catch (_) {
    return failure("WALL_MATERIALIZATION_FAILED");
  }
  if (!result || result.ok === false || !result.wall || result.wall.id == null)
    return failure(result && result.reason || "WALL_MATERIALIZATION_FAILED");
  var created = semanticNodes(result.createdNodeIds);
  created.push({ kind: "wall", id: result.wall.id });
  return {
    ok: true,
    created: created,
    changed: semanticNodes(result.changedNodeIds),
    effects: {
      dirty3D: true,
      refreshTree: true,
      refreshInspector: true,
      events: [{ type: "planner-wall-created", entityId: result.wall.id }],
    },
  };
}

export const wallDrawCommand = Object.freeze({
  id: "wall.draw",
  failureCodes: WALL_DRAW_CODES,
  prepare: prepareWallDraw,
  preview: previewWallDraw,
  apply: applyWallDraw,
});
