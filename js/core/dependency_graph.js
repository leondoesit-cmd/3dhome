import {offsetPlaneOwners} from './offset_planes.js';
// Stable dependency ordering for feature histories.  The history order is the
// tie-breaker, so an identical document always rebuilds identically.

export function featureDependencies(feature) {
  const deps = new Set(feature?.inputs || []);
  if(typeof feature?.sketch === "string")deps.add(feature.sketch);
  if(feature?.params?.sketchId)deps.add(feature.params.sketchId);
  for(const id of feature?.references?.sketches || [])deps.add(id);
  const sources=feature?.params?.sketchSources;
  if(sources?.helixFeatureId)deps.add(sources.helixFeatureId);
  for(const source of [sources?.profile,sources?.path,...(sources?.sections||[])])if(source?.sketchId)deps.add(source.sketchId);
  const visit = (value, key) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (typeof value !== "object") {
      if (["featureRef", "sourceFeature", "featureId", "ownerFeatureId"].includes(key) && typeof value === "string") deps.add(value);
      return;
    }
    if (typeof value.ownerFeatureId === "string" && typeof value.persistentId === "string") deps.add(value.ownerFeatureId);
    if ((key === "featureRef" || key === "sourceFeature" || key === "featureId") && typeof value.id === "string") deps.add(value.id);
    Object.keys(value).forEach((child) => visit(value[child], child));
  };
  visit(feature?.references, "references");
  return Array.from(deps);
}

export function datumReferenceIds(definition) {
  return new Set(["top","front","right","bottom","back","left"].map(plane=>"plane:"+plane).concat((definition?.references||[]).filter(r=>!r.ownerFeatureId).map(r=>r.id)));
}

export function buildDependencyGraph(definition) {
  const datums=datumReferenceIds(definition);
  const features = Array.isArray(definition?.features) ? definition.features : [];
  const byId = new Map();
  const index = new Map();
  const issues = [];
  features.forEach((feature, at) => {
    if (!feature?.id) {
      issues.push({ severity: "error", code: "feature-without-id", featureId: null, message: "A feature has no id" });
      return;
    }
    if (byId.has(feature.id)) issues.push({ severity: "error", code: "duplicate-feature-id", featureId: feature.id, message: "Duplicate feature id: " + feature.id });
    byId.set(feature.id, feature);
    index.set(feature.id, at);
  });
  const sketches=new Map((definition?.sketches || []).map(s=>[s.id,s]));
  const incoming = new Map();
  const outgoing = new Map();
  features.forEach((feature) => {
    if (!feature?.id) return;
    incoming.set(feature.id, new Set());
    outgoing.set(feature.id, new Set());
  });
  features.forEach((feature) => {
    if (!feature?.id) return;
    featureDependencies(feature).flatMap(dependency=>{
      if(!sketches.has(dependency)||byId.has(dependency))return [dependency];
      const sketch=sketches.get(dependency);return [sketch.pierce?.featureId,sketch.support?.ownerFeatureId,...offsetPlaneOwners(sketch.referenceId,definition.references),...[...(sketch.silhouetteCopies || []),...(sketch.circleCopies || [])].map(copy=>copy.source.ownerFeatureId)].filter(Boolean);
    }).forEach((dependency) => {
      if (!byId.has(dependency) && datums.has(dependency)) return;
      if (!byId.has(dependency)) {
        issues.push({ severity: "error", code: "missing-feature-reference", featureId: feature.id, reference: dependency, message: feature.name + " references missing feature " + dependency });
        return;
      }
      incoming.get(feature.id).add(dependency);
      outgoing.get(dependency).add(feature.id);
    });
  });
  const ready = features.filter((feature) => feature?.id && incoming.get(feature.id)?.size === 0)
    .sort((a, b) => index.get(a.id) - index.get(b.id));
  const order = [];
  while (ready.length) {
    const feature = ready.shift();
    order.push(feature);
    outgoing.get(feature.id).forEach((next) => {
      incoming.get(next).delete(feature.id);
      if (!incoming.get(next).size) {
        ready.push(byId.get(next));
        ready.sort((a, b) => index.get(a.id) - index.get(b.id));
      }
    });
  }
  if (order.length !== byId.size) {
    const blocked = features.filter((feature) => feature?.id && !order.includes(feature)).map((feature) => feature.id);
    issues.push({ severity: "error", code: "feature-cycle", featureIds: blocked, message: "Feature history contains a dependency cycle" });
  }
  return { order, byId, issues };
}

export function stableStringify(value) {
  const seen = new WeakSet();
  const normalize = (input) => {
    if (!input || typeof input !== "object") return input;
    if (seen.has(input)) return "[circular]";
    seen.add(input);
    if (Array.isArray(input)) return input.map(normalize);
    const output = {};
    Object.keys(input).sort().forEach((key) => {
      if (key !== "lastRebuild" && key !== "regeneratedAt") output[key] = normalize(input[key]);
    });
    return output;
  };
  return JSON.stringify(normalize(value));
}
