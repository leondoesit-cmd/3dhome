import { dependentTargetIds } from "./core/parametric_document.js";
import { circularSweepProfile } from "./core/swept_sources.js";

const copy = value => JSON.parse(JSON.stringify(value));
const appearanceKeys = ["color", "metal", "rough", "opacity", "density", "materialName", "materialCatalogId", "densitySource", "customProperties"];
const componentKeys = ["transform", "grounded", "suppressed", "visible", "configurationId", "parameterOverrides", "explodedOffset"];
const assemblyDocument = document => Array.isArray(document.components) ? document : document.assembly;

// Store authored values only. Native meshes and topology caches belong to the
// rebuilt document, never to a configuration snapshot.
export function configurationModelValues(document) {
  const assembly = assemblyDocument(document);
  return {
    sketches: (document.sketches || []).map(sketch => copy(sketch)),
    featureParameters: (document.features || []).map(feature => ({ id: feature.id, params: copy(feature.params || {}) })),
    appearances: (document.parts || []).map(part => ({ id: part.id, values: Object.fromEntries(appearanceKeys.filter(key => part[key] !== undefined).map(key => [key, copy(part[key])])) })),
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
    cfg.suppressedFeatureIds = (document.features || []).filter(feature => feature.suppressed).map(feature => feature.id);
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
      suppressedFeatureIds: (document.features || []).filter((feature) => feature.suppressed).map((feature) => feature.id),
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
    const parameters = new Map((values.featureParameters || []).map(feature => [feature.id, feature.params]));
    (document.features || []).forEach(feature => { if (parameters.has(feature.id)) feature.params = copy(parameters.get(feature.id)); });
    const appearances = new Map((values.appearances || []).map(part => [part.id, part.values]));
    (document.parts || []).forEach(part => {
      if (!appearances.has(part.id)) return;
      appearanceKeys.forEach(key => { delete part[key]; });
      Object.assign(part, copy(appearances.get(part.id)));
      delete part.meshData;
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
  /* A configuration names the steps it removes; what those steps feed goes with
     them, the same cascade the tree's own suppress applies. Listing only the
     parent left its children building on a step this configuration does not
     have. No tag is needed here: every switch recomputes the whole set. */
  const suppressed = new Set(cfg.suppressedFeatureIds || []);
  dependentTargetIds(document, [...suppressed]).forEach((id) => suppressed.add(id));
  (document.features || []).forEach((feature) => {
    feature.suppressed = suppressed.has(feature.id);
  });
  /* A canonical document is suppressed through its HISTORY: the compiled tree,
     the preview parts the viewport draws and the tree row all read the entry,
     not the feature. Writing only the feature made a configuration switch a
     change nothing could see — the boss the configuration removes stayed on
     screen, and a step suppressed in the tree stayed hidden after switching
     back to a configuration that does not suppress it. */
  (document.history || []).forEach((entry) => {
    if (!entry || entry.kind !== "feature") return;
    entry.suppressed = suppressed.has(entry.targetId);
  });
  const assembly = assemblyDocument(document);
  if (assembly) assembly.activeExplodedView = cfg.explodedViewId || null;
  if (document.designTable?.kind === "circular-sweep" && cfg.designTableValues) {
    applyCircularSweepRow(document, cfg.designTableValues);
  }
  return document;
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
    suppressedFeatureIds: (document.features || []).filter((feature) => feature.suppressed).map((feature) => feature.id),
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
