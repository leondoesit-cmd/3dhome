import { S } from "./state.js";
import { historyTree, historyTargets, historyObjects, currentHistoryId } from "./history.js";
import { listCapabilities } from "./core/tool_registry.js";
import { plannerCommandManifest } from "./commands/index.js";
import { plannerTutorialProgress } from "./planner_tutorial.js";
import { getLang } from "./i18n.js";
import { FURN } from "./furniture.js";
import { tutorAttention } from "./tutor/attention_tracker.js";
import { tutorProgressSnapshot } from "./tutor/progress.js";

function plain(value) {
  if (value == null) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}
function selected() {
  var sel = S.sel;
  if (!sel) return null;
  if (Array.isArray(sel.refs)) return {
    kind: sel.kind || "unknown",
    ids: sel.refs.map(function (entry) { return entry && entry.id != null ? entry.id : entry; }).filter(function (id) { return id != null; }),
  };
  var ref = sel.ref;
  return { kind: sel.kind || "unknown", id: ref && ref.id != null ? ref.id : ref, value: plain(ref) };
}
function entityLists() {
  return {
    nodes: (S.nodes || []).map(function (n, id) { return Object.assign({ id: id }, plain(n) || {}); }),
    walls: (S.walls || []).map(function (w) {
      return Object.assign({ type: w.wallTypeId || "generic" }, plain(w) || {});
    }),
    openings: (S.openings || []).map(function (o) {
      return Object.assign({ wallId: o.wall }, plain(o) || {});
    }),
    items: (S.items || []).map(function (it) { return plain(it); }).filter(Boolean),
    markers: plain(S.markers || []), slabOpenings: plain(S.slabOpenings || []),
    wallConstraints: plain(S.wallCons || []), roomConstraints: plain(S.roomCons || []),
    planVariables: plain(S.planVars || []),
    mepNodes: plain(S.mep && S.mep.nodes || []), mepRuns: plain(S.mep && S.mep.runs || []),
  };
}
function limitedEntities(limit) {
  var lists = entityLists(), out = {}, truncated = {};
  Object.keys(lists).forEach(function (kind) {
    var entries = Array.isArray(lists[kind]) ? lists[kind] : [];
    out[kind] = entries.slice(0, limit);
    if (entries.length > limit) truncated[kind] = { total: entries.length, returned: limit };
  });
  return { values: out, truncated: truncated };
}
function capabilityProjection(entry) {
  return {
    id: entry.id, class: entry.capability, status: entry.status,
    target: entry.target || null, modelCommandId: entry.modelCommandId || null,
    label: entry.label || entry.title || null, help: entry.help || null,
    location: entry.location || "", prerequisites: entry.prerequisites || [],
    effects: entry.effects || [], reversible: entry.reversible,
    availableWhen: entry.availableWhen || "always",
  };
}
function counts() {
  return {
    nodes: (S.nodes || []).length, walls: (S.walls || []).length,
    openings: (S.openings || []).length, items: (S.items || []).length,
    markers: (S.markers || []).length, slabOpenings: (S.slabOpenings || []).length,
    wallConstraints: (S.wallCons || []).length, roomConstraints: (S.roomCons || []).length,
    planVariables: (S.planVars || []).length,
    mepNodes: S.mep && S.mep.nodes ? S.mep.nodes.length : 0,
    mepRuns: S.mep && S.mep.runs ? S.mep.runs.length : 0,
    floors: S.workspace && S.workspace.floors ? S.workspace.floors.length : 1,
  };
}

export function projectAgentContext(options = {}) {
  var compact = options.compact === true, entityLimit = Math.max(1, Math.min(5000, options.entityLimit || 250));
  var tree = historyTree(), historyLimit = Math.max(1, Math.min(2000, options.historyLimit || 60));
  var context = {
    schemaVersion: 2, domain: "planner", documentVersion: currentHistoryId(),
    workspace: {
      id: S.workspace && S.workspace.id || null, name: S.workspace && S.workspace.name || "",
      role: S.workspace && S.workspace.role || "owner", activeFloor: S.workspace && S.workspace.activeFloor || null,
      floors: plain(S.workspace && S.workspace.floors || []),
    },
    locale: getLang(), units: "cm", activeTool: S.tool || "select", selection: selected(), counts: counts(),
    interaction: {
      viewAxis: S.viewAxis || "top", drawing: !!S.drawing, drawFrom: S.drawFrom,
      placeType: S.placeType || null,
      wallProbe: S.wallProbe ? { wallId: S.wallProbe.wall && S.wallProbe.wall.id, x: S.wallProbe.x, z: S.wallProbe.z } : null,
      hover: S.hoverPt ? { x: S.hoverPt.x, z: S.hoverPt.z } : null,
      viewport: { scale: S.SC, offsetX: S.OX, offsetY: S.OY },
    },
    warnings: Object.keys(S.ignoredWarnings || {}), commands: plannerCommandManifest(),
    capabilities: listCapabilities().map(capabilityProjection),
    projectSettings: {
      roomMeta: plain(S.roomMeta || {}), wallTypes: plain(S.wallTypes || []),
      snapping: { enabled: S.osnap !== false, kinds: plain(S.snapKinds || {}), strength: S.snapStrength },
      northAngle: S.northAngle, activeLevel: S.activeLevel,
    },
    budgets: { compact: compact, entityLimit: entityLimit, historyLimit: historyLimit },
  };
  if (options.includeAttention !== false) {
    context.attention = tutorAttention.snapshot(S);
    context.mastery = tutorProgressSnapshot(S);
  }
  if (!compact && options.includeEntities !== false) {
    var entities = limitedEntities(entityLimit);
    context.entities = entities.values; context.entityTruncation = entities.truncated;
  }
  if (!compact && options.includeHistory !== false) {
    context.history = tree.slice(-historyLimit);
    context.historyTruncation = { total: tree.length, returned: Math.min(tree.length, historyLimit) };
  }
  if (options.includeTutorial !== false) context.tutorial = plannerTutorialProgress();
  return plain(context);
}

export function queryAgentObjects(args = {}) {
  var lists = entityLists(), kind = String(args.kind || ""), source = lists[kind];
  if (!source) return { ok: false, reason: "UNKNOWN_ENTITY_KIND", kinds: Object.keys(lists) };
  var ids = Array.isArray(args.ids) ? new Set(args.ids.map(String)) : null;
  var limit = Math.max(1, Math.min(500, Number(args.limit) || 100));
  var filtered = source.filter(function (entry, index) {
    if (!ids) return true;
    var id = entry && entry.id != null ? entry.id : index;
    return ids.has(String(id));
  });
  return { ok: true, kind: kind, objects: filtered.slice(0, limit), total: filtered.length, truncated: filtered.length > limit };
}

export function searchAgentTools(args = {}) {
  var query = String(args.query || "").trim().toLowerCase(), limit = Math.max(1, Math.min(100, Number(args.limit) || 30));
  var entries = listCapabilities().map(capabilityProjection).filter(function (entry) {
    return !query || JSON.stringify(entry).toLowerCase().includes(query);
  });
  return { ok: true, tools: entries.slice(0, limit), total: entries.length, truncated: entries.length > limit };
}

export function getAgentHistorySummary(args = {}) {
  var tree = historyTree(), limit = Math.max(1, Math.min(200, Number(args.limit) || 40));
  var nodes = tree.slice(-limit).map(function (node) {
    return { id: node.id, parent: node.parent, label: node.label || node.op || "", targets: historyTargets(node.id) };
  });
  return { ok: true, current: currentHistoryId(), nodes: nodes, total: tree.length, truncated: tree.length > limit };
}

export function getAgentObjectHistory(args = {}) {
  var objectId = args.objectId != null ? String(args.objectId) : "";
  if (objectId && !objectId.includes(":") && args.kind) objectId = String(args.kind) + ":" + objectId;
  if (!objectId) return { ok: false, reason: "OBJECT_ID_REQUIRED" };
  var tree = historyTree(), limit = Math.max(1, Math.min(200, Number(args.limit) || 60));
  var nodes = tree.filter(function (node) {
    return historyTargets(node.id).some(function (target) { return String(target.id || target) === objectId; });
  });
  return { ok: true, objectId: objectId, object: historyObjects().find(function (entry) { return entry.id === objectId; }) || null, nodes: nodes.slice(-limit), total: nodes.length, truncated: nodes.length > limit };
}

export function compareAgentHistory(args = {}) {
  if (args.from == null || args.to == null) return { ok: false, reason: "HISTORY_NODES_REQUIRED" };
  var a = historyTargets(args.from), b = historyTargets(args.to), ids = new Set();
  a.concat(b).forEach(function (entry) { ids.add(String(entry.id || entry)); });
  return { ok: true, from: args.from, to: args.to, touchedObjects: Array.from(ids).sort(), fromTargets: a, toTargets: b };
}

export function searchAgentCatalog(args = {}) {
  var query = String(args.query || "").trim().toLowerCase(), limit = Math.max(1, Math.min(100, Number(args.limit) || 30));
  var entries = Object.keys(FURN || {}).map(function (id) {
    var entry = FURN[id] || {};
    return { id: id, width: entry.w || entry.width, depth: entry.d || entry.depth, height: entry.h || entry.height };
  }).filter(function (entry) { return !query || entry.id.toLowerCase().includes(query); });
  return { ok: true, items: entries.slice(0, limit), total: entries.length, truncated: entries.length > limit };
}
