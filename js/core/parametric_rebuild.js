import { stableStringify } from "./dependency_graph.js";
import { rebuildDefinition } from "./rebuild.js";
import { cloneDomain } from "./schema.js";
import { analyzeParametricHistory, ensureParametricDocument } from "./parametric_document.js";
import { compileKernelFeatureTree } from "./kernel_feature_adapter.js";

function issueTargets(issue) {
  return [issue.featureId, issue.sketchId, issue.reference].filter(Boolean);
}

export function rebuildParametricDocument(source, overrides = {}, options = {}) {
  // Rebuild a snapshot.  A failed feature is never allowed to half-mutate the
  // user's authoring document; callers explicitly publish the returned status.
  const snapshot = ensureParametricDocument(cloneDomain(source));
  const historyRun = analyzeParametricHistory(snapshot);
  const compiled = compileKernelFeatureTree(snapshot);
  const issues = [...historyRun.issues, ...compiled.issues.filter((issue) => !historyRun.issues.some((known) => stableStringify(known) === stableStringify(issue)))];
  let core = null;
  if (!issues.some((issue) => issue.severity === "error")) {
    const executable = cloneDomain(snapshot);
    executable.features = compiled.features;
    core = rebuildDefinition(executable, overrides, options);
    issues.push(...core.issues);
  }
  const failed = new Set(issues.filter((issue) => issue.severity === "error").flatMap(issueTargets));
  const warnings = new Set(issues.filter((issue) => issue.severity === "warning").flatMap(issueTargets));
  const status = (snapshot.history || []).map((entry) => ({
    historyId: entry.id,
    targetId: entry.targetId,
    kind: entry.kind,
    state: entry.suppressed ? "suppressed" : failed.has(entry.targetId) ? "failed" : warnings.has(entry.targetId) ? "warning" : "rebuilt",
  }));
  const ok = !issues.some((issue) => issue.severity === "error") && (core ? core.ok : true);
  return {
    ok,
    definitionId: snapshot.id,
    revision: snapshot.revision,
    signature: stableStringify({ definitionId: snapshot.id, revision: snapshot.revision, history: snapshot.history.map((entry) => ({ id:entry.id, kind:entry.kind, targetId:entry.targetId, suppressed:entry.suppressed })), sketches: snapshot.sketches.map((sketch) => { const copy=cloneDomain(sketch); delete copy.status; delete copy.diagnostics; return copy; }), features: snapshot.features.map((feature) => { const copy=cloneDomain(feature); delete copy.state; delete copy.diagnostics; return copy; }), overrides }),
    document: snapshot,
    compiledFeatures: compiled.features,
    status,
    issues,
    core,
    lastGood: ok ? { signature: core?.signature, resultList: core?.resultList || [], topology: core?.topology || [], bounds: core?.bounds } : options.lastGood || null,
  };
}

export function publishRebuildStatus(document, run) {
  if (!document || !run) return document;
  const byId = new Map((run.status || []).map((entry) => [entry.historyId, entry]));
  (document.history || []).forEach((entry) => {
    entry.status = byId.get(entry.id)?.state || "pending";
  });
  const issuesByTarget = new Map();
  (run.issues || []).forEach((issue) => issueTargets(issue).forEach((targetId) => {
    if (!issuesByTarget.has(targetId)) issuesByTarget.set(targetId, []);
    issuesByTarget.get(targetId).push(cloneDomain(issue));
  }));
  (document.features || []).forEach((feature) => {
    feature.diagnostics = issuesByTarget.get(feature.id) || [];
    feature.state = feature.suppressed ? "suppressed" : feature.diagnostics.some((issue) => issue.severity === "error") ? "failed" : feature.diagnostics.length ? "warning" : "rebuilt";
  });
  (document.sketches || []).forEach((sketch) => {
    const sketchIssues = issuesByTarget.get(sketch.id) || [];
    sketch.diagnostics = sketchIssues;
    const warning = sketchIssues.find((issue) => issue.code === "under-constrained-sketch");
    sketch.status = sketchIssues.some((issue) => issue.severity === "error") ? "conflicting" : warning
      ? (sketch.constraints || []).some((constraint) => !constraint.suppressed ? true : false) ? "partially-defined" : "under-defined"
      : "fully-defined";
  });
  document.lastRebuild = { ok: run.ok, signature: run.signature, issues: cloneDomain(run.issues), rebuiltAt: Date.now() };
  return document;
}
