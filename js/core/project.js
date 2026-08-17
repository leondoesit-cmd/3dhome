import { PARAMETRIC_SCHEMA_VERSION, createDefinition, createParameter, cloneDomain, mainReferences, migrateDefinition } from "./schema.js";
import { rebuildDefinition } from "./rebuild.js";
import { createRuntimeRepresentation } from "./runtime.js";
import { inferProductRules, evaluateDimensionRequest, applyDimensionAlternative } from "./smart_dimension.js";
import { createImportedDefinition } from "./import_normalization.js";
import { installSpatialProject } from "./spatial_project.js";

export function ensureParametricProject(state) {
  installSpatialProject(state);
  if (!state.parametric || typeof state.parametric !== "object") state.parametric = {};
  state.parametric.schemaVersion = PARAMETRIC_SCHEMA_VERSION;
  state.parametric.definitions ||= {};
  state.parametric.derived ||= {};
  state.parametric.runtime ||= {};
  state.parametric.revision = Number(state.parametric.revision) || 1;
  return state.parametric;
}

function envelopeSketch(width, depth) {
  const hw = width / 2, hd = depth / 2;
  return {
    id: "sketch:envelope", name: "Overall envelope", referenceId: "plane:top", plane: "top", offset: 0,
    points: [
      { id: "env:p0", x: -hw, y: -hd, fixed: true }, { id: "env:p1", x: hw, y: -hd },
      { id: "env:p2", x: hw, y: hd }, { id: "env:p3", x: -hw, y: hd },
    ],
    entities: [
      { id: "env:e0", type: "line", a: "env:p0", b: "env:p1" }, { id: "env:e1", type: "line", a: "env:p1", b: "env:p2" },
      { id: "env:e2", type: "line", a: "env:p2", b: "env:p3" }, { id: "env:e3", type: "line", a: "env:p3", b: "env:p0" },
    ],
    constraints: [
      { id: "env:c0", type: "horizontal", entity: "env:e0" }, { id: "env:c1", type: "vertical", entity: "env:e1" },
      { id: "env:c2", type: "horizontal", entity: "env:e2" }, { id: "env:c3", type: "vertical", entity: "env:e3" },
      { id: "env:width", type: "distance", entity: "env:e0", name: "OverallWidth", value: width, parameter: "width" },
      { id: "env:depth", type: "distance", entity: "env:e1", name: "OverallDepth", value: depth, parameter: "depth" },
    ],
  };
}

function genericDefinition(item, catalogEntry = {}) {
  const width = Number(catalogEntry.w) || Number(item.w) || 100;
  const depth = Number(catalogEntry.d) || Number(item.d) || 60;
  const height = Number(catalogEntry.h) || Number(item.h) || 100;
  const id = item.definitionId || (item.cab ? "cabinet:" + item.id : "builtin:" + item.type);
  const rules = inferProductRules(item.type, { width, depth, height }, catalogEntry.parametricRules);
  return createDefinition({
    id,
    key: "cm_" + String(item.type || "object").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) + "_parametric",
    name: catalogEntry.label || item.type || "Object",
    kind: item.cab ? "cabinet" : "furniture",
    authoringMode: catalogEntry.custom?.authoringMode || (catalogEntry.custom ? "fully-parametric" : "hybrid"),
    references: mainReferences(),
    parameters: {
      width: createParameter("width", width, { label: "Width", exposure: "planner", min: 5, max: 800 }),
      depth: createParameter("depth", depth, { label: "Depth", exposure: "planner", min: 5, max: 800 }),
      height: createParameter("height", height, { label: "Height", exposure: "planner", min: 2, max: 600 }),
    },
    sketches: [envelopeSketch(width, depth)],
    features: [
      { id: "feature:envelope-sketch", type: "sketch", name: "Envelope sketch", params: { sketchId: "sketch:envelope" }, inputs: [] },
      { id: "feature:procedural-body", type: "procedural", name: "Parametric body", params: { adapter: item.type, width: "$width", depth: "$depth", height: "$height" }, inputs: ["feature:envelope-sketch"] },
    ],
    rules,
    metadata: { adapter: item.cab ? "cabinet" : "catalog", catalogType: item.type, source: catalogEntry.custom ? "model-editor" : "built-in-library", rulePack: rules.id, rulePackVersion: rules.version },
    parts: catalogEntry.custom?.parts || [],
  });
}

export function registerDefinition(state, source) {
  const project = ensureParametricProject(state);
  const definition = migrateDefinition(source);
  definition.revision = Math.max(1, Number(definition.revision) || 1);
  project.definitions[definition.id] = definition;
  project.revision += 1;
  return definition;
}

export function registerImportedDefinition(state, source, options = {}) {
  const definition=createImportedDefinition(source,options);
  return registerDefinition(state,definition);
}

export function ensureItemDefinition(state, item, catalogEntry = {}) {
  if (!item) return null;
  const project = ensureParametricProject(state);
  let definition = item.definitionId && project.definitions[item.definitionId];
  if (!definition && catalogEntry.custom) {
    definition = migrateDefinition(catalogEntry.custom, { id: item.definitionId || catalogEntry.custom.key });
    project.definitions[definition.id] = definition;
  }
  if (!definition) {
    definition = genericDefinition(item, catalogEntry);
    project.definitions[definition.id] = definition;
  }
  if (definition.metadata?.source === "built-in-library" && (!definition.rules?.source || definition.rules.source === "inferred")) {
    const upgradedRules = inferProductRules(item.type, {
      width: Number(definition.parameters?.width?.value) || Number(item.w),
      depth: Number(definition.parameters?.depth?.value) || Number(item.d),
      height: Number(definition.parameters?.height?.value) || Number(item.h),
    }, catalogEntry.parametricRules);
    if (upgradedRules.source === "catalogue") {
      definition.rules = upgradedRules;
      definition.metadata.rulePack = upgradedRules.id;
      definition.metadata.rulePackVersion = upgradedRules.version;
      definition.revision = Math.max(1, Number(definition.revision) || 1) + 1;
    }
  }
  item.definitionId = definition.id;
  item.parameterOverrides ||= {};
  // Compatibility fields are projections.  Legacy builders may have edited
  // them directly, so adopt a changed value before the next local rebuild.
  [["width", "w"], ["depth", "d"], ["height", "h"]].forEach(([parameter, field]) => {
    if (Number.isFinite(item[field])) item.parameterOverrides[parameter] = item[field];
  });
  item.configuration ||= cloneDomain(definition.rules?.configuration) || {};
  return definition;
}

export function definitionForItem(state, item) {
  return item?.definitionId ? ensureParametricProject(state).definitions[item.definitionId] || null : null;
}

export function rebuildItem(state, item, catalogEntry = {}, options = {}) {
  const project = ensureParametricProject(state);
  const definition = ensureItemDefinition(state, item, catalogEntry);
  if (!definition) return null;
  const run = rebuildDefinition(definition, item.parameterOverrides || {}, options);
  project.derived[item.id] = {
    definitionId: definition.id,
    definitionRevision: definition.revision,
    signature: run.signature,
    bounds: run.bounds,
    issues: run.issues,
    parameters: run.parameters,
    topology: run.topology,
    topologyBindings: run.topologyBindings,
    mesh: {
      adapter: definition.metadata?.adapter || "catalog", signature: run.signature,
      representation: definition.authoringMode === "direct-only" ? "persisted-mesh" : "derived",
      partIds: (definition.parts || []).filter((part) => !part.suppressed).map((part) => part.id),
      lod: definition.metadata?.derivedRepresentation?.lod || "generated",
      exactSource: !!definition.metadata?.import?.exactSource,
    },
  };
  project.runtime[item.id] = createRuntimeRepresentation(item, run, definition);
  if (run.ok) {
    if (Number.isFinite(run.parameters.width)) item.w = run.parameters.width;
    if (Number.isFinite(run.parameters.depth)) item.d = run.parameters.depth;
    if (Number.isFinite(run.parameters.height)) item.h = run.parameters.height;
  }
  return run;
}

export function rebuildProject(state, catalog = {}) {
  ensureParametricProject(state);
  const runs = [];
  (state.items || []).forEach((item) => runs.push(rebuildItem(state, item, catalog[item.type] || {})));
  const live = new Set((state.items || []).map((item) => String(item.id)));
  Object.keys(state.parametric.derived).forEach((id) => { if (!live.has(String(id))) delete state.parametric.derived[id]; });
  Object.keys(state.parametric.runtime).forEach((id) => { if (!live.has(String(id))) delete state.parametric.runtime[id]; });
  return runs;
}

export function requestItemDimension(state, item, dimension, requested, catalogEntry = {}) {
  const definition = ensureItemDefinition(state, item, catalogEntry);
  return evaluateDimensionRequest(definition, item, dimension, Number(requested));
}

export function applyItemDimension(state, item, result, alternativeId, catalogEntry = {}) {
  if (!applyDimensionAlternative(item, result, alternativeId)) return null;
  // Keep the legacy builder projection in lockstep before ensure/rebuild sees
  // it, so it cannot mistake this intentional override for a stale field.
  if (Number.isFinite(item.parameterOverrides.width)) item.w = item.parameterOverrides.width;
  if (Number.isFinite(item.parameterOverrides.depth)) item.d = item.parameterOverrides.depth;
  if (Number.isFinite(item.parameterOverrides.height)) item.h = item.parameterOverrides.height;
  const run = rebuildItem(state, item, catalogEntry);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("parametric:rebuilt", { detail: { itemId: item.id, definitionId: item.definitionId, run } }));
  return run;
}

export function commitDefinition(state, source) {
  const project = ensureParametricProject(state);
  const existing = project.definitions[source.definitionId || source.id || source.key];
  const definition = migrateDefinition(source, { id: source.definitionId || source.id || source.key });
  definition.revision = Math.max(Number(existing?.revision) || 0, Number(source.revision) || 0) + 1;
  project.definitions[definition.id] = definition;
  const affected = [];
  (state.items || []).forEach((item) => {
    if (item.definitionId !== definition.id) return;
    rebuildItem(state, item, {});
    affected.push(item);
  });
  project.revision += 1;
  return { definition, affected };
}

export function exportParametricProject(state) {
  const project = ensureParametricProject(state);
  return {
    schemaVersion: project.schemaVersion,
    definitions: cloneDomain(project.definitions),
    revision: project.revision,
  };
}

export function importParametricProject(state, source) {
  const project = ensureParametricProject(state);
  project.definitions = {};
  Object.values(source?.definitions || {}).forEach((definition) => {
    const migrated = migrateDefinition(definition);
    project.definitions[migrated.id] = migrated;
  });
  project.revision = Number(source?.revision) || 1;
  project.derived = {};
  project.runtime = {};
  return project;
}
