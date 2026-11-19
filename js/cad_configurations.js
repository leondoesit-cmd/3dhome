import { suppressionOwners } from "./core/parametric_document.js";
import { restoreLocalCircleOffsets } from "./core/cone_silhouette.js";
import { circularSweepProfile } from "./core/swept_sources.js";
import { partAppearanceKeys, restoreToolboxProjections } from "./core/toolbox_projection_restore.js";
import { toolboxFastener } from "./cad_toolbox.js";

const copy = value => JSON.parse(JSON.stringify(value));
const appearanceKeys = partAppearanceKeys;
const componentKeys = ["transform", "grounded", "suppressed", "visible", "configurationId", "parameterOverrides", "explodedOffset"];
const assemblyDocument = document => Array.isArray(document.components) ? document : document.assembly;

function automaticSuppression(document) {
  return new Set((document.history || []).filter(e => e.autoSuppressedBy).map(e => e.targetId));
}

function capturedFeatureRoots(document) {
  const automatic = automaticSuppression(document);
  return (document.features || []).filter(f => f.suppressed && !automatic.has(f.id)).map(f => f.id);
}

// Store authored values only. Native meshes and topology caches belong to the
// rebuilt document, never to a configuration snapshot.
export function configurationModelValues(document) {
  const assembly = assemblyDocument(document);
  const automatic = automaticSuppression(document);
  return {
    sketches: (document.sketches || []).map(sketch => copy(automatic.has(sketch.id) ? {...sketch, suppressed:false} : sketch)),
    featureParameters: (document.features || []).map(feature => ({ id: feature.id, params: copy(feature.params || {}) })),
    appearances: (document.parts || []).map((part, index) => ({ id: part.id, ...(part.toolboxFeatureId ? { toolboxFeatureId: part.toolboxFeatureId, toolboxProjectionIndex: part.toolboxProjectionIndex ?? document.parts.slice(0, index).filter(previous => previous.toolboxFeatureId === part.toolboxFeatureId).length } : {}), values: Object.fromEntries(appearanceKeys.filter(key => part[key] !== undefined).map(key => [key, copy(part[key])])) })),
    customProperties: copy(document.customProperties || {}),
    ...(assembly ? { assembly: {
      components: (assembly.components || []).map(component => ({ id: component.id, values: Object.fromEntries(componentKeys.filter(key => component[key] !== undefined).map(key => [key, copy(component[key])])) })),
      topologyMates: copy(assembly.topologyMates || []),
      mates: copy(assembly.mates || []),
    } } : {}),
  };
}

export function updateConfiguration(document, configurationId, options = {}) {
  const cfg = ensureConfigurations(document).find(item => item.id === configurationId);
  if (!cfg) throw new Error("Configuration does not exist: " + configurationId);
  const name = String(options.name ?? cfg.name).trim();
  if (!name || document.configurations.some(item => item.id !== cfg.id && item.name === name)) throw new Error("Enter a unique configuration name");
  cfg.name = name;
  cfg.description = String(options.description ?? cfg.description ?? "");
  if (options.capture) {
    cfg.modelValues = configurationModelValues(document);
    cfg.explodedViewId = assemblyDocument(document)?.activeExplodedView || null;
    cfg.parameterOverrides = { ...(document.parameterOverrides || {}) };
    cfg.suppressedFeatureIds = capturedFeatureRoots(document);
  }
  return cfg;
}

// Named configurations: a parameter-override set plus optional feature
// suppression and an exploded-view pointer. Switching configuration never
// forks the feature tree; it only changes which values a rebuild consumes.

export function createConfiguration(options = {}) {
  return {
    id: options.id || "cfg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: options.name || "Default",
    parameterOverrides: { ...(options.parameterOverrides || {}) },
    suppressedFeatureIds: (options.suppressedFeatureIds || []).slice(),
    explodedViewId: options.explodedViewId || null,
    description: options.description || "",
    ...(options.designTableValues ? { designTableValues: { ...options.designTableValues } } : {}),
    ...(options.modelValues ? { modelValues: copy(options.modelValues) } : {}),
  };
}

export function ensureConfigurations(document) {
  if (!document) return [];
  document.configurations ||= [];
  if (!document.configurations.length) {
    document.configurations.push(createConfiguration({
      id: "cfg_default",
      name: "Default",
      parameterOverrides: { ...(document.parameterOverrides || {}) },
      suppressedFeatureIds: capturedFeatureRoots(document),
      explodedViewId: assemblyDocument(document)?.activeExplodedView || null,
      modelValues: configurationModelValues(document),
    }));
  }
  if (!document.activeConfiguration) document.activeConfiguration = document.configurations[0].id;
  return document.configurations;
}

export function activeConfiguration(document) {
  const list = ensureConfigurations(document);
  return list.find((item) => item.id === document.activeConfiguration) || list[0];
}

export function setActiveConfiguration(document, configurationId) {
  ensureConfigurations(document);
  const found = document.configurations.find((item) => item.id === configurationId);
  if (!found) throw new Error("Configuration does not exist: " + configurationId);
  document.activeConfiguration = found.id;
  applyConfiguration(document, found);
  return found;
}

export function applyConfiguration(document, configuration) {
  const cfg = configuration || activeConfiguration(document);
  if (!cfg) return document;
  document.parameterOverrides = { ...(cfg.parameterOverrides || {}) };
  if (cfg.modelValues) {
    const values = cfg.modelValues;
    const sketches = new Map((values.sketches || []).map(sketch => [sketch.id, sketch]));
    document.sketches = (document.sketches || []).map(sketch => sketches.has(sketch.id) ? copy(sketches.get(sketch.id)) : sketch);
    document.sketches.forEach(restoreLocalCircleOffsets);
    const parameters = new Map((values.featureParameters || []).map(feature => [feature.id, feature.params]));
    (document.features || []).forEach(feature => { if (parameters.has(feature.id)) feature.params = copy(parameters.get(feature.id)); });
    const savedAppearances = values.appearances || [];
    const appearances = new Map(savedAppearances.filter(part => part.id != null).map(part => [part.id, part.values]));
    const toolboxIds = new Set((document.parts || []).map(part => part.toolboxFeatureId));
    const legacySingleToolbox = toolboxIds.size === 1 && !toolboxIds.has(undefined) && savedAppearances.length === document.parts.length;
    (document.parts || []).forEach((part, index) => {
      const projectionIndex = part.toolboxProjectionIndex ?? document.parts.slice(0, index).filter(previous => previous.toolboxFeatureId === part.toolboxFeatureId).length;
      const role = savedAppearances.find(saved => saved.toolboxFeatureId === part.toolboxFeatureId && part.toolboxFeatureId && saved.toolboxProjectionIndex === projectionIndex);
      const legacy = legacySingleToolbox && savedAppearances[index]?.id == null ? savedAppearances[index].values : undefined;
      const appearance = appearances.get(part.id) || role?.values || legacy;
      if (!appearance) return;
      appearanceKeys.forEach(key => { delete part[key]; });
      Object.assign(part, copy(appearance));
      delete part.meshData;
    });
    (document.features || []).filter(feature => feature.type === "toolbox").forEach(feature => {
      const generated = toolboxFastener(copy(feature.params || {}));
      if (generated?.ok && generated.parts?.length) restoreToolboxProjections(document, feature, generated);
    });
    document.customProperties = copy(values.customProperties || {});
    const assembly = assemblyDocument(document);
    if (assembly && values.assembly) {
      const saved = values.assembly;
      const components = new Map((saved.components || []).map(component => [component.id, component.values]));
      (assembly.components || []).forEach(component => {
        if (!components.has(component.id)) { component.suppressed = true; return; }
        componentKeys.forEach(key => { delete component[key]; });
        Object.assign(component, copy(components.get(component.id)));
      });
      // Retain mates created in later configurations so switching back can
      // reactivate them. A mate absent from this snapshot is suppressed.
      const mates = new Map((saved.topologyMates || []).map(mate => [mate.id, mate]));
      assembly.topologyMates = (assembly.topologyMates || []).map(mate => {
        const restored = mates.get(mate.id);
        mates.delete(mate.id);
        return restored ? copy(restored) : { ...mate, suppressed: true };
      }).concat([...mates.values()].map(copy));
      // Legacy axis mates predate suppression; restore their authored list.
      assembly.mates = copy(saved.mates || []);
      delete assembly.diagnostics;
    }
  }
  // Old override-only rows inherit independent live sketch toggles. A row
  // with a saved sketch uses its own suppression flag.
  const automatic = automaticSuppression(document);
  const savedSketches = new Set((cfg.modelValues?.sketches || []).map(s => s.id));
  const sketchRoots = (document.sketches || []).filter(s => s.suppressed &&
    (savedSketches.has(s.id) || !automatic.has(s.id))).map(s => s.id);
  applyConfigurationSuppression(document, [...(cfg.suppressedFeatureIds || []), ...sketchRoots]);
  const assembly = assemblyDocument(document);
  if (assembly) assembly.activeExplodedView = cfg.explodedViewId || null;
  if (document.designTable?.kind === "circular-sweep" && cfg.designTableValues) {
    applyCircularSweepRow(document, cfg.designTableValues);
  }
  return document;
}

export function applyConfigurationSuppression(document, targetIds) {
  const roots = new Set(targetIds || []);
  const owners = suppressionOwners(document, roots);
  const suppressed = new Set([...roots, ...owners.keys()]);
  for (const target of [...(document.features || []), ...(document.sketches || [])]) {
    target.suppressed = suppressed.has(target.id);
  }
  for (const entry of document.history || []) {
    if (!entry || !["feature", "sketch"].includes(entry.kind)) continue;
    entry.suppressed = suppressed.has(entry.targetId);
    delete entry.cascaded;
    if (owners.has(entry.targetId)) entry.autoSuppressedBy = owners.get(entry.targetId);
    else delete entry.autoSuppressedBy;
  }
}

/* The book's O-RING design table drives two *model dimensions*: the path
   sketch's diameter and the sweep's circular section. A parameter override
   alone cannot change either because the authored sketch stores a radius and
   the circular profile is generated from a feature parameter. */
export function circularSweepTableTarget(document) {
  const sweep = (document?.features || []).find(feature => feature.type === "sweep" && feature.params?.profileMode === "circular" && feature.params?.sketchSources?.kind === "circular-sweep");
  const source = sweep?.params?.sketchSources?.path;
  const sketch = (document?.sketches || []).find(item => item.id === source?.sketchId);
  const circle = sketch?.entities?.find(entity => entity.type === "circle" && !entity.construction && source?.entityIds?.includes(entity.id));
  if (!sweep || !sketch || !circle || !(Number(circle.r) > 0) || !(Number(sweep.params.profileDiameter) > 0)) return null;
  return { sweep, sketch, circle };
}

export function circularSweepTableRows(document) {
  const target = circularSweepTableTarget(document);
  if (!target) return null;
  const saved = document.designTable?.kind === "circular-sweep" ? document.designTable.rows : null;
  if (Array.isArray(saved) && saved.length) return saved.map(row => ({ ...row }));
  const path = Number((target.circle.r * 20).toFixed(6));
  const profile = Number((target.sweep.params.profileDiameter * 10).toFixed(6));
  return [
    { name: "Default", pathDiameterMm: path, profileDiameterMm: profile },
    { name: "Small", pathDiameterMm: 100, profileDiameterMm: 3 },
    { name: "Medium", pathDiameterMm: 150, profileDiameterMm: 4 },
    { name: "Large", pathDiameterMm: 200, profileDiameterMm: 10 },
  ];
}

function validateCircularSweepRows(rows) {
  const names = ["Default", "Small", "Medium", "Large"];
  if (!Array.isArray(rows) || rows.length !== names.length) throw new Error("Design table needs Default, Small, Medium and Large rows");
  return rows.map((row, index) => {
    const pathDiameterMm = Number(row.pathDiameterMm), profileDiameterMm = Number(row.profileDiameterMm);
    if (row.name !== names[index] || !Number.isFinite(pathDiameterMm) || !Number.isFinite(profileDiameterMm) || pathDiameterMm <= 0 || profileDiameterMm <= 0 || profileDiameterMm >= pathDiameterMm) {
      throw new Error("Invalid " + names[index] + " path or profile diameter");
    }
    return { name: names[index], pathDiameterMm, profileDiameterMm };
  });
}

function applyCircularSweepRow(document, row) {
  const target = circularSweepTableTarget(document);
  if (!target) throw new Error("Circular sweep design table lost its path or feature");
  const radius = row.pathDiameterMm / 20, profileDiameter = row.profileDiameterMm / 10;
  const entityIds = target.sweep.params.sketchSources.path.entityIds;
  const sketch = { ...target.sketch, entities: target.sketch.entities.map(entity => entity.id === target.circle.id ? { ...entity, r: radius } : entity) };
  const generated = circularSweepProfile(sketch, profileDiameter, entityIds);
  target.circle.r = radius;
  (target.sketch.constraints || []).forEach(constraint => {
    if (constraint.type === "diameter" && constraint.entity === target.circle.id && !constraint.driven) constraint.value = row.pathDiameterMm / 10;
  });
  Object.assign(target.sweep.params, generated, { profileDiameter });
  target.sweep.params.sketchSources.diameter = profileDiameter;
  (document.parts || []).filter(part => part.featureId === target.sweep.id && part.sketchSources?.kind === "circular-sweep").forEach(part => {
    part.sketchSources.diameter = profileDiameter;
    if (part.kernel?.params) Object.assign(part.kernel.params, generated);
    delete part.meshData;
  });
}

export function setCircularSweepDesignTable(document, rows) {
  if (!circularSweepTableTarget(document)) throw new Error("Select a circular-profile sweep with a circle path");
  const checked = validateCircularSweepRows(rows);
  ensureConfigurations(document);
  const activeName = activeConfiguration(document)?.name;
  for (const row of checked) {
    let cfg = document.configurations.find(item => item.name === row.name);
    if (!cfg) {
      cfg = createConfiguration({ name: row.name });
      document.configurations.push(cfg);
    }
    cfg.designTableValues = { pathDiameterMm: row.pathDiameterMm, profileDiameterMm: row.profileDiameterMm };
  }
  document.designTable = {
    kind: "circular-sweep",
    pathSketchId: circularSweepTableTarget(document).sketch.id,
    sweepFeatureId: circularSweepTableTarget(document).sweep.id,
    rows: checked,
  };
  const selected = document.configurations.find(item => item.name === activeName) || document.configurations[0];
  setActiveConfiguration(document, selected.id);
  return document.designTable;
}

export function captureConfiguration(document, options = {}) {
  ensureConfigurations(document);
  const name = String(options.name || "Default").trim();
  if (!name || document.configurations.some(item => item.name === name)) throw new Error("Enter a unique configuration name");
  const snapshot = createConfiguration({
    ...options,
    name,
    parameterOverrides: { ...(document.parameterOverrides || options.parameterOverrides || {}) },
    suppressedFeatureIds: capturedFeatureRoots(document),
    explodedViewId: assemblyDocument(document)?.activeExplodedView || options.explodedViewId || null,
    modelValues: configurationModelValues(document),
  });
  document.configurations.push(snapshot);
  document.activeConfiguration = snapshot.id;
  return snapshot;
}

export function configurationOverrides(document) {
  return { ...(activeConfiguration(document)?.parameterOverrides || {}) };
}
