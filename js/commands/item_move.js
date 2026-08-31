// Move one explicit item to one explicit plan position. The normalized plan
// records both positions so preview and delayed confirmation cannot drift.

export const ITEM_MOVE_CODES = Object.freeze([
  "AMBIGUOUS_ITEM_TARGET",
  "ITEM_SOURCE_NOT_FOUND",
  "INVALID_ITEM_POSITION",
]);

function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function fail(reason) { return { ok: false, reason: reason }; }
function versionOf(env) {
  return env && env.version && typeof env.version.current === "function" ? env.version.current() : null;
}

export function prepareItemMove(params, env) {
  params = params || {};
  if (params.itemId == null) return fail("AMBIGUOUS_ITEM_TARGET");
  var state = env && env.state, items = state && Array.isArray(state.items) ? state.items : [];
  var item = items.find(function(entry) { return String(entry.id) === String(params.itemId); });
  if (!item) return fail("ITEM_SOURCE_NOT_FOUND");
  var fromX = Number(item.x), fromZ = Number(item.z);
  if (params.x == null && params.z == null && params.deltaX == null && params.deltaZ == null)
    return fail("INVALID_ITEM_POSITION");
  var x = params.x != null ? Number(params.x)
    : params.deltaX != null ? fromX + Number(params.deltaX) : fromX;
  var z = params.z != null ? Number(params.z)
    : params.deltaZ != null ? fromZ + Number(params.deltaZ) : fromZ;
  if (!finite(fromX) || !finite(fromZ) || !finite(x) || !finite(z))
    return fail("INVALID_ITEM_POSITION");
  return { ok: true, plan: {
    command: "item.move",
    expectedVersion: params.expectedVersion != null ? params.expectedVersion : versionOf(env),
    params: {
      itemId: item.id,
      from: { x: fromX, z: fromZ },
      to: { x: x, z: z },
      type: item.type,
      width: Number(item.w) || 0,
      depth: Number(item.d) || 0,
      rotation: Number(item.rot) || 0,
    },
  } };
}

export function previewItemMove(plan) {
  var params = plan && plan.params;
  if (!params) return null;
  return {
    kind: "item-move",
    itemId: params.itemId,
    type: params.type,
    from: params.from,
    center: params.to,
    width: params.width,
    depth: params.depth,
    rotation: params.rotation,
    delta: { x: params.to.x - params.from.x, z: params.to.z - params.from.z },
    style: "ghost-valid",
  };
}

export function applyItemMove(plan, env) {
  var state = env && env.state, params = plan && plan.params;
  var item = state && Array.isArray(state.items) && params && state.items.find(function(entry) {
    return String(entry.id) === String(params.itemId);
  });
  if (!item) return fail("ITEM_SOURCE_NOT_FOUND");
  item.x = params.to.x;
  item.z = params.to.z;
  return { ok: true, created: [], changed: [{ kind: "item", id: item.id }], effects: {
    dirty3D: true, refreshTree: true, refreshInspector: true, updateCost: true,
    events: [{ type: "planner-item-moved", entityId: item.id }],
  } };
}

export const itemMoveCommand = Object.freeze({
  id: "item.move",
  failureCodes: ITEM_MOVE_CODES,
  prepare: prepareItemMove,
  preview: previewItemMove,
  apply: applyItemMove,
});
