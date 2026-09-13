import { dependentTargetIds } from "./core/parametric_document.js";

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
  if (document.assembly) document.assembly.activeExplodedView = cfg.explodedViewId || null;
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
