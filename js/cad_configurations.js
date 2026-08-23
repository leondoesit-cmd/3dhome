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
      explodedViewId: document.assembly?.activeExplodedView || null,
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
  const suppressed = new Set(cfg.suppressedFeatureIds || []);
  (document.features || []).forEach((feature) => {
    feature.suppressed = suppressed.has(feature.id);
  });
  if (document.assembly && cfg.explodedViewId) document.assembly.activeExplodedView = cfg.explodedViewId;
  return document;
}

export function captureConfiguration(document, options = {}) {
  ensureConfigurations(document);
  const snapshot = createConfiguration({
    ...options,
    parameterOverrides: { ...(document.parameterOverrides || options.parameterOverrides || {}) },
    suppressedFeatureIds: (document.features || []).filter((feature) => feature.suppressed).map((feature) => feature.id),
    explodedViewId: document.assembly?.activeExplodedView || options.explodedViewId || null,
  });
  document.configurations.push(snapshot);
  document.activeConfiguration = snapshot.id;
  return snapshot;
}

export function configurationOverrides(document) {
  return { ...(activeConfiguration(document)?.parameterOverrides || {}) };
}
