import { materializeCabinetDefinition } from "./cabinet_definition.js";
import { stableStringify } from "./dependency_graph.js";
import { bodiesFromResults, rebuildDefinition, resolveParameters } from "./rebuild.js";
import { cloneDomain } from "./schema.js";
import { analyzeParametricHistory, ensureParametricDocument } from "./parametric_document.js";
import { compileKernelFeatureTree } from "./kernel_feature_adapter.js";
import { verifiedExactTopology } from './exact_topology_cache.js';

function issueTargets(issue) {
  return [issue.featureId, issue.sketchId, issue.reference].filter(Boolean);
}

export function rebuildParametricDocument(source, overrides = {}, options = {}) {
  // Rebuild a snapshot.  A failed feature is never allowed to half-mutate the
  // user's authoring document; callers explicitly publish the returned status.
  const parameters = resolveParameters(source, overrides);
  const prepared = parameters.issues.some((issue) => issue.severity === "error") ? source : materializeCabinetDefinition(source, parameters.values);
  const snapshot = ensureParametricDocument(cloneDomain(prepared));
  const historyRun = analyzeParametricHistory(snapshot);
  const compiled = compileKernelFeatureTree(snapshot);
  const issues = [...historyRun.issues, ...compiled.issues.filter((issue) => !historyRun.issues.some((known) => stableStringify(known) === stableStringify(issue)))];
  /* A step that cannot build fails alone.
     Gating the kernel run on the history analysis meant one suppressed parent,
     or one sketch deleted out from under a feature, blanked the entire model —
     including bodies on branches that never touched the broken step. Every CAD
     system reports the failure on its own row and regenerates the rest, so the
     failed steps are dropped from the executable tree and the run goes ahead.
     Whatever consumed them reports its own unavailable input in turn. */
  const dropped = new Set(issues.filter((issue) => issue.severity === "error").flatMap(issueTargets));
  const executable = { ...compiled.document, sketches: (compiled.document.sketches || []).map((s) => ({ ...s })) };
  executable.features = compiled.features.filter((feature) =>
    ![...dropped].some((id) => feature.id === id || feature.id.startsWith(id + ":")));
  const exactTopology=Object.keys(overrides).length ? new Map() : verifiedExactTopology(source,compiled.features);
  const core = rebuildDefinition(executable, overrides, {...options,exactTopology});
  issues.push(...core.issues);
  // Bodies are reported against the *authoring* features, not the lowered ones:
  // a hole compiles into a tool plus a subtract, and only the subtract keeps the
  // authoring id. Reading the compiled tree here would list the tool as a body
  // and name it after an id the tree cannot select.
  const bodies = bodiesFromResults(snapshot, core.results);
  const failed = new Set(issues.filter((issue) => issue.severity === "error").flatMap(issueTargets));
  const warnings = new Set(issues.filter((issue) => issue.severity === "warning").flatMap(issueTargets));
  const status = (snapshot.history || []).map((entry) => ({
    historyId: entry.id,
    targetId: entry.targetId,
    kind: entry.kind,
    state: entry.suppressed ? "suppressed" : failed.has(entry.targetId) ? "failed" : warnings.has(entry.targetId) ? "warning" : "rebuilt",
  }));
  const ok = !issues.some((issue) => issue.severity === "error") && core.ok;
  return {
    ok,
    definitionId: snapshot.id,
    revision: snapshot.revision,
    signature: stableStringify({
      definitionId: snapshot.id,
      revision: snapshot.revision,
      history: snapshot.history.map((entry) => ({ id:entry.id, kind:entry.kind, targetId:entry.targetId, suppressed:entry.suppressed })),
      sketches: snapshot.sketches.map((sketch) => { const { status: _s, diagnostics: _d, ...rest } = sketch; return rest; }),
      features: snapshot.features.map((feature) => { const { state: _st, diagnostics: _diag, ...rest } = feature; return rest; }),
      overrides,
    }),
    document: snapshot,
    compiledFeatures: compiled.features,
    bodies,
    status,
    issues,
    core,
    lastGood: ok ? { signature: core?.signature, resultList: core?.resultList || [], topology: core?.topology || [], bounds: core?.bounds } : options.lastGood || null,
  };
}

/* The core run cannot see a step the exact kernel failed to build. HOUSING's
   Extrude / Boss 3 failed in OpenCascade while the status bar, reading only the
   core run, said "Rebuild succeeded" over a stale mesh. Kernel failures become
   error issues on their authoring feature (a lowered `id:tool` step reports on
   `id`), so the tree row, the status bar and `lastRebuild` all say so. */
export function withKernelFailures(run, kernelRun) {
  const failures = (kernelRun?.issues || []).filter((issue) => issue.code === "regeneration-failed" && issue.feature)
    .map((issue) => ({ featureId: String(issue.feature).split(":")[0], severity: "error", code: "regeneration-failed", message: issue.message, source: "kernel" }))
    .filter((issue, index, list) => list.findIndex((other) => other.featureId === issue.featureId) === index);
  if (!run || !failures.length) return run;
  const failed = new Set(failures.map((issue) => issue.featureId));
  return {
    ...run,
    ok: false,
    issues: [...(run.issues || []), ...failures],
    status: (run.status || []).map((entry) => entry.state !== "suppressed" && failed.has(entry.targetId) ? { ...entry, state: "failed" } : entry),
  };
}

export function publishRebuildStatus(document, run) {
  if (!document || !run) return document;
  if (run.ok && document.metadata?.adapter === "cabinet" && run.document?.metadata?.generatedParameters && JSON.stringify(document.metadata.generatedParameters) !== JSON.stringify(run.document.metadata.generatedParameters)) {
    for (const key of ["parts", "features", "sketches", "history", "metadata", "w", "d", "h"]) document[key] = cloneDomain(run.document[key]);
  }
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
    const redundant = sketchIssues.some((issue) => issue.code === "over-constrained-sketch" && issue.severity === "warning");
    sketch.status = sketchIssues.some((issue) => issue.severity === "error") ? "conflicting" : redundant ? "over-defined" : warning
      ? (sketch.constraints || []).some((constraint) => !constraint.suppressed ? true : false) ? "partially-defined" : "under-defined"
      : "fully-defined";
  });
  document.lastRebuild = { ok: run.ok, signature: run.signature, issues: cloneDomain(run.issues), rebuiltAt: Date.now() };
  return document;
}
