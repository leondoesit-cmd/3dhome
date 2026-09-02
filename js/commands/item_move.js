// Move one explicit item to one explicit plan position. The normalized plan
// records both positions so preview and delayed confirmation cannot drift.

export const ITEM_MOVE_CODES = Object.freeze([
  "AMBIGUOUS_ITEM_TARGET",
  "ITEM_SOURCE_NOT_FOUND",
  "ITEM_LOCKED",
  "PERMISSION_DENIED",
  "PLACEMENT_SERVICE_UNAVAILABLE",
  "ACTIVE_FLOOR_CHANGED",
  "PLACEMENT_GEOMETRY_CHANGED",
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
  if (item.locked) return fail("ITEM_LOCKED");
  if (env && env.services && typeof env.services.canPlaceItem === "function" &&
      !env.services.canPlaceItem(item)) return fail("PERMISSION_DENIED");
  var activeFloor = state && state.workspace && state.workspace.activeFloor != null
    ? state.workspace.activeFloor : null;
  if (params.floorId != null && String(params.floorId) !== String(activeFloor))
    return fail("ACTIVE_FLOOR_CHANGED");
  if (params.placementGuard && env && env.services &&
      typeof env.services.validatePlacementGuard === "function" &&
      !env.services.validatePlacementGuard(params.placementGuard))
    return fail("PLACEMENT_GEOMETRY_CHANGED");
  var fromX = Number(item.x), fromZ = Number(item.z);
  if (params.x == null && params.z == null && params.deltaX == null && params.deltaZ == null && params.rot == null)
    return fail("INVALID_ITEM_POSITION");
  var x = params.x != null ? Number(params.x)
    : params.deltaX != null ? fromX + Number(params.deltaX) : fromX;
  var z = params.z != null ? Number(params.z)
    : params.deltaZ != null ? fromZ + Number(params.deltaZ) : fromZ;
  var hasRotation = params.rot != null, rot = hasRotation ? Number(params.rot) : null;
  if (!finite(fromX) || !finite(fromZ) || !finite(x) || !finite(z) ||
      (hasRotation && !finite(rot)))
    return fail("INVALID_ITEM_POSITION");
  var holdWallId = params.holdWallId != null ? params.holdWallId : null;
  if (holdWallId != null && !(state.walls || []).some(function(wall) {
    return wall && String(wall.id) === String(holdWallId);
  })) return fail("INVALID_ITEM_POSITION");
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
      rotation: rot,
      rotationSpecified: hasRotation,
      markRotationUser: hasRotation && params.rotationProvenance !== "automatic",
      holdWallId: holdWallId,
      floorId: activeFloor,
      placementGuard: params.placementGuard || null,
    },
  } };
}

export function previewItemMove(plan, env) {
  var params = plan && plan.params;
  if (!params) return null;
  var item = env && env.state && Array.isArray(env.state.items) && env.state.items.find(function(entry) {
    return String(entry.id) === String(params.itemId);
  });
  return {
    kind: "item-move",
    itemId: params.itemId,
    type: params.type,
    from: params.from,
    center: params.to,
    width: params.width,
    depth: params.depth,
    rotation: params.rotationSpecified ? params.rotation : Number(item && item.rot) || 0,
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
  if (item.locked) return fail("ITEM_LOCKED");
  if (env && env.services && typeof env.services.canPlaceItem === "function" &&
      !env.services.canPlaceItem(item)) return fail("PERMISSION_DENIED");
  var commit = env && env.services && env.services.commitItemPlacement;
  if (typeof commit !== "function") return fail("PLACEMENT_SERVICE_UNAVAILABLE");
  var committed = commit(item, {
    x: params.to.x, z: params.to.z,
    rotation: params.rotation,
    rotationSpecified: params.rotationSpecified === true,
    markRotationUser: params.markRotationUser === true,
    holdWallId: params.holdWallId,
  }, env);
  if (!committed || committed.ok === false) return committed || fail("INVALID_ITEM_POSITION");
  var changed = (committed.changedIds || [item.id]).map(function(id) { return { kind: "item", id: id }; });
  return { ok: true, created: [], changed: changed, effects: {
    dirty3D: true, refreshTree: true, refreshInspector: true, updateCost: true,
    events: changed.map(function(entry) { return { type: "planner-item-moved", entityId: entry.id }; }),
  } };
}

export const itemMoveCommand = Object.freeze({
  id: "item.move",
  failureCodes: ITEM_MOVE_CODES,
  prepare: prepareItemMove,
  preview: previewItemMove,
  apply: applyItemMove,
});
