// Duplicate one or more existing items from a fully serialized snapshot.
// Capturing the source fields in prepare makes delayed confirmation sensitive
// to source edits and lets command logs reproduce custom/cabinet instances.

export const ITEM_DUPLICATE_CODES = Object.freeze([
  "INVALID_ITEM_SOURCE",
  "ITEM_SOURCE_NOT_FOUND",
  "INVALID_ITEM_POSITION",
  "ITEM_DUPLICATE_FAILED",
]);

function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function fail(reason) { return { ok: false, reason: reason }; }

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function versionOf(env) {
  if (env && env.version && typeof env.version.current === "function") return env.version.current();
  return null;
}

export function prepareItemDuplicate(params, env) {
  params = params || {};
  var ids = Array.isArray(params.sourceIds) ? params.sourceIds.slice()
    : params.sourceId != null ? [params.sourceId] : [];
  if (!ids.length || new Set(ids.map(String)).size !== ids.length) return fail("INVALID_ITEM_SOURCE");
  var state = env && env.state, items = state && Array.isArray(state.items) ? state.items : [];
  var sources = ids.map(function(id) {
    return items.find(function(item) { return String(item.id) === String(id); });
  });
  if (sources.some(function(item) { return !item; })) return fail("ITEM_SOURCE_NOT_FOUND");
  var offsetX = params.offsetX == null ? 30 : Number(params.offsetX);
  var offsetZ = params.offsetZ == null ? 30 : Number(params.offsetZ);
  if (!finite(offsetX) || !finite(offsetZ) || sources.some(function(item) {
    return !finite(Number(item.x)) || !finite(Number(item.z));
  })) return fail("INVALID_ITEM_POSITION");
  var copies;
  try { copies = snapshot(sources); }
  catch (_) { return fail("ITEM_DUPLICATE_FAILED"); }
  return { ok: true, plan: {
    command: "item.duplicate",
    expectedVersion: params.expectedVersion != null ? params.expectedVersion : versionOf(env),
    params: {
      sourceIds: ids,
      offsetX: offsetX,
      offsetZ: offsetZ,
      regroup: params.regroup !== false,
      items: copies,
    },
  } };
}

export function previewItemDuplicate(plan) {
  var params = plan && plan.params;
  if (!params) return null;
  return {
    kind: "items",
    items: params.items.map(function(item) {
      return { sourceId: item.id, type: item.type,
        center: { x: Number(item.x) + params.offsetX, z: Number(item.z) + params.offsetZ },
        width: item.w, depth: item.d, rotation: item.rot || 0 };
    }),
    style: "ghost-valid",
  };
}

export function applyItemDuplicate(plan, env) {
  var state = env && env.state, params = plan && plan.params;
  if (!state || !Array.isArray(state.items) || !finite(Number(state.idc)) || !params)
    return fail("ITEM_DUPLICATE_FAILED");
  var grouped = params.regroup && params.items.some(function(item) { return item.groupId != null; });
  var groupId = grouped ? state.idc++ : null;
  var created = [];
  var idMap = new Map();
  params.items.forEach(function(source) { idMap.set(source.id, state.idc++); });
  params.items.forEach(function(source) {
    var item = snapshot(source);
    item.id = idMap.get(source.id);
    if (source.on != null) {
      if (idMap.has(source.on)) item.on = idMap.get(source.on);
      else delete item.on;
    }
    item.x = Number(source.x) + params.offsetX;
    item.z = Number(source.z) + params.offsetZ;
    delete item.locked;
    delete item.runtimeState;
    if (grouped && source.groupId != null) item.groupId = groupId;
    else delete item.groupId;
    state.items.push(item);
    created.push({ kind: "item", id: item.id });
  });
  return { ok: true, created: created, changed: [], effects: {
    dirty3D: true, refreshTree: true, refreshInspector: true, updateCost: true,
    events: created.map(function(entry) { return { type: "planner-item-created", entityId: entry.id }; }),
  } };
}

export const itemDuplicateCommand = Object.freeze({
  id: "item.duplicate",
  failureCodes: ITEM_DUPLICATE_CODES,
  prepare: prepareItemDuplicate,
  preview: previewItemDuplicate,
  apply: applyItemDuplicate,
});
