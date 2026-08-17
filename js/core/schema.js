// Canonical project/object schema.  UI modules may keep compatibility fields
// while they migrate, but definitions and instances always pass through here.

import { inferAuthoringMode } from "./authoring_mode.js";

export const PARAMETRIC_SCHEMA_VERSION = 8;

let sequence = 0;
export function domainId(prefix = "id") {
  sequence += 1;
  return prefix + "_" + Date.now().toString(36) + "_" + sequence.toString(36);
}

export function cloneDomain(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function mainReferences() {
  return [
    { id: "origin", type: "origin", name: "Origin", origin: { x: 0, y: 0, z: 0 } },
    { id: "plane:top", type: "plane", name: "Top Plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, xAxis: { x: 1, y: 0, z: 0 } },
    { id: "plane:front", type: "plane", name: "Front Plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xAxis: { x: 1, y: 0, z: 0 } },
    { id: "plane:right", type: "plane", name: "Right Plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 }, xAxis: { x: 0, y: 0, z: 1 } },
    { id: "axis:x", type: "axis", name: "X Axis", origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    { id: "axis:y", type: "axis", name: "Y Axis", origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    { id: "axis:z", type: "axis", name: "Z Axis", origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
  ];
}

export function createParameter(name, value, options = {}) {
  const numeric = Number(value);
  return {
    id: options.id || "param:" + name,
    name,
    label: options.label || name,
    value: Number.isFinite(numeric) ? numeric : value,
    unit: options.unit || (typeof value === "number" ? "cm" : ""),
    role: options.role || "driving",
    exposure: options.exposure || "advanced",
    adjustable: options.adjustable !== false,
    min: Number.isFinite(options.min) ? options.min : undefined,
    max: Number.isFinite(options.max) ? options.max : undefined,
    step: Number.isFinite(options.step) ? options.step : undefined,
    expression: options.expression || undefined,
    fixed: !!options.fixed,
    group: options.group || "Dimensions",
  };
}

export function createDefinition(options = {}) {
  const id = options.id || options.key || domainId("definition");
  const parameters = {};
  const input = options.parameters || {};
  Object.keys(input).forEach((name) => {
    const source = input[name];
    parameters[name] = source && typeof source === "object" && "value" in source
      ? { ...createParameter(name, source.value, source), ...cloneDomain(source) }
      : createParameter(name, source);
  });
  return {
    schemaVersion: PARAMETRIC_SCHEMA_VERSION,
    id,
    key: options.key || id,
    name: options.name || "Untitled object",
    kind: options.kind || "object",
    authoringMode: options.authoringMode || "fully-parametric",
    localFrame: cloneDomain(options.localFrame) || {
      origin: { x: 0, y: 0, z: 0 },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 1, z: 0 },
      zAxis: { x: 0, y: 0, z: 1 },
    },
    references: cloneDomain(options.references || options.referenceGeometry) || mainReferences(),
    parameters,
    sketches: cloneDomain(options.sketches) || [],
    features: cloneDomain(options.features) || [],
    history: cloneDomain(options.history) || (options.features || []).map((feature) => feature.id),
    parts: cloneDomain(options.parts) || [],
    assemblies: cloneDomain(options.assemblies) || [],
    rules: cloneDomain(options.rules) || {},
    metadata: cloneDomain(options.metadata) || {},
    topologyBindings: cloneDomain(options.topologyBindings) || [],
    revision: Number(options.revision) || 1,
    lastRebuild: cloneDomain(options.lastRebuild) || null,
  };
}

export function createInstance(options = {}) {
  return {
    id: options.id || domainId("instance"),
    definitionId: options.definitionId,
    transform: cloneDomain(options.transform) || {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    parameterOverrides: cloneDomain(options.parameterOverrides) || {},
    materialOverrides: cloneDomain(options.materialOverrides) || {},
    configuration: cloneDomain(options.configuration) || {},
    runtimeState: undefined,
  };
}

function legacyReference(ref) {
  if (!ref || typeof ref !== "object") return null;
  if (ref.type === "reference_plane") return { ...cloneDomain(ref), type: "plane" };
  if (ref.type === "reference_axis") return { ...cloneDomain(ref), type: "axis" };
  return cloneDomain(ref);
}

// Turns existing model-editor documents into canonical definitions without
// destroying their part history.  This is intentionally lossless.
export function migrateDefinition(source, options = {}) {
  if (!source || typeof source !== "object") return createDefinition(options);
  const raw = cloneDomain(source);
  const references = mainReferences();
  (raw.references || raw.referenceGeometry || []).forEach((ref) => {
    const normalized = legacyReference(ref);
    if (normalized && !references.some((item) => item.id === normalized.id)) references.push(normalized);
  });
  const parameters = raw.parameters || {};
  if (!Object.keys(parameters).length) {
    if (Number.isFinite(raw.w)) parameters.width = createParameter("width", raw.w, { exposure: "planner", min: 1 });
    if (Number.isFinite(raw.d)) parameters.depth = createParameter("depth", raw.d, { exposure: "planner", min: 1 });
    if (Number.isFinite(raw.h)) parameters.height = createParameter("height", raw.h, { exposure: "planner", min: 1 });
  }
  const def = createDefinition({
    ...raw,
    id: raw.definitionId || raw.id || raw.key || options.id,
    key: raw.key || options.key,
    parameters,
    references,
    authoringMode: inferAuthoringMode(raw),
  });
  // Preserve editor fields which are not part of the core yet (materials,
  // standards audits, rollback markers, sheet-metal settings, and so on).
  Object.keys(raw).forEach((key) => {
    if (!(key in def)) def[key] = raw[key];
  });
  def.definitionId = def.id;
  def.schemaVersion = PARAMETRIC_SCHEMA_VERSION;
  return def;
}

export function validateDefinition(definition) {
  const issues = [];
  if (!definition || typeof definition !== "object") return [{ severity: "error", code: "missing-definition", message: "Definition is missing" }];
  if (!definition.id) issues.push({ severity: "error", code: "missing-id", message: "Definition has no stable id" });
  if (!Array.isArray(definition.references) || !definition.references.some((ref) => ref.id === "origin"))
    issues.push({ severity: "error", code: "missing-origin", message: "Definition has no local origin" });
  if (!Array.isArray(definition.features)) issues.push({ severity: "error", code: "missing-history", message: "Feature history is missing" });
  if (!definition.parameters || typeof definition.parameters !== "object")
    issues.push({ severity: "error", code: "missing-parameters", message: "Parameter table is missing" });
  return issues;
}
