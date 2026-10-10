import { cosmeticThread } from "../cad_thread.js";
import {planFinishRemoval} from "./finish_removal.js";
import { cloneDomain, createDefinition, domainId, mainReferences, migrateDefinition } from "./schema.js";
import { featureDefaults, featureSpec, validateFeatureDefinition } from "./feature_catalog.js";
import {sketchDependencies} from './dependency_graph.js';

export const PARAMETRIC_DOCUMENT_VERSION = 1;

const DEFAULT_UNITS = Object.freeze({ length: "cm", angle: "deg", mass: "kg", precision: 3 });

function historyEntry(kind, target, options = {}) {
  return {
    id: options.id || "history:" + kind + ":" + target.id,
    kind,
    targetId: target.id,
    name: options.name || target.name || (kind === "sketch" ? "Sketch" : target.type || "Feature"),
    suppressed: !!(options.suppressed ?? target.suppressed),
    status: options.status || "pending",
  };
}

function referenceId(reference) {
  return typeof reference === "string" ? reference : reference?.id || reference?.persistentId || null;
}

function sketchHistoryId(sketchId) { return "history:sketch:" + sketchId; }
function featureHistoryId(featureId) { return "history:feature:" + featureId; }

export function createPartDocument(options = {}) {
  const document = createDefinition({ ...options, kind: "part", references: options.references || mainReferences() });
  document.documentVersion = PARAMETRIC_DOCUMENT_VERSION;
  document.context = {
    kind: "part",
    units: { ...DEFAULT_UNITS, ...(options.units || options.context?.units || {}) },
    activeCoordinateSystemId: options.context?.activeCoordinateSystemId || "origin",
  };
  document.sketches = cloneDomain(options.sketches) || [];
  document.features = cloneDomain(options.features) || [];
  document.history = [];
  normalizeHistory(document, options.history);
  return document;
}

export function normalizeHistory(document, sourceHistory = document.history) {
  const sketches = new Map((document.sketches || []).map((sketch) => [sketch.id, sketch]));
  const features = new Map((document.features || []).map((feature) => [feature.id, feature]));
  const output = [];
  const included = new Set();
  const includedTargets = new Set();
  const append = (entry) => {
    if (!entry || included.has(entry.id) || includedTargets.has(entry.kind + ":" + entry.targetId)) return;
    included.add(entry.id);
    includedTargets.add(entry.kind + ":" + entry.targetId);
    output.push(entry);
  };
  const requested = [];
  (Array.isArray(sourceHistory) ? sourceHistory : []).forEach((raw) => {
    if (typeof raw === "string") {
      if (sketches.has(raw)) requested.push({ kind: "sketch", targetId: raw });
      else if (features.has(raw)) requested.push({ kind: "feature", targetId: raw });
      return;
    }
    if (!raw || typeof raw !== "object") return;
    const kind = raw.kind === "sketch" ? "sketch" : "feature";
    const target = kind === "sketch" ? sketches.get(raw.targetId) : features.get(raw.targetId);
    if (target) requested.push({ ...raw, kind, targetId: target.id });
  });
  // A migrated file often listed only solid features.  Put each consumed sketch
  // immediately before its first consumer, then retain unconsumed sketches as
  // editable history nodes at the end.
  const appending=new Set();
  const appendTarget = (kind, targetId, raw = {}) => {
    if (kind === "sketch") {
      const sketch = sketches.get(targetId);
      if(sketch && !appending.has(targetId)){
        appending.add(targetId);
        sketchDependencies(sketch,document).filter(id=>sketches.has(id) && !includedTargets.has('sketch:'+id)).forEach(id=>appendTarget('sketch',id));
        appending.delete(targetId);
      }
      if (sketch) append(historyEntry("sketch", sketch, raw));
      return;
    }
    const feature = features.get(targetId);
    if (!feature) return;
    const sketchIds = feature.references?.sketches || (feature.params?.sketchId ? [feature.params.sketchId] : []);
    sketchIds.map(referenceId).filter(Boolean).forEach((id) => {
      if (sketches.has(id)) appendTarget('sketch',id);
    });
    append(historyEntry("feature", feature, raw));
  };
  requested.forEach((entry) => appendTarget(entry.kind, entry.targetId, entry));
  (document.features || []).forEach((feature) => appendTarget("feature", feature.id));
  (document.sketches || []).forEach((sketch) => append(historyEntry("sketch", sketch)));
  document.history = output;
  return output;
}

function initializeParametricFields(document) {
  if (!document || typeof document !== "object") throw new Error("Parametric document is missing");
  document.kind = "part";
  document.documentVersion ||= PARAMETRIC_DOCUMENT_VERSION;
  document.context ||= { kind: "part", units: { ...DEFAULT_UNITS }, activeCoordinateSystemId: "origin" };
  document.context.units = { ...DEFAULT_UNITS, ...(document.context.units || {}) };
  document.references ||= mainReferences();
  document.sketches ||= [];
  document.features ||= [];
  document.history ||= [];
  return document;
}

export function ensureParametricDocument(source, options = {}) {
  const document = migrateDefinition(source || options);
  document.kind = "part";
  document.documentVersion = PARAMETRIC_DOCUMENT_VERSION;
  document.context = {
    kind: "part",
    units: { ...DEFAULT_UNITS, ...(document.context?.units || options.units || {}) },
    activeCoordinateSystemId: document.context?.activeCoordinateSystemId || "origin",
  };
  document.references = Array.isArray(document.references) && document.references.length ? document.references : mainReferences();
  document.sketches ||= [];
  document.features ||= [];
  for (const feature of document.features) {
    if (["extrude", "extrudeCut"].includes(feature.type) && feature.params?.endCondition == null) feature.params.endCondition = "blind";
  }
  discardIncidentalToolboxSketches(document);
  normalizeHistory(document);
  return document;
}

/* NEW WORK GOES IN AT THE ROLLBACK BAR.
   SOLIDWORKS inserts every new sketch and feature where the bar stands and
   moves the bar down past it. This editor only did that for Fillet and
   Chamfer; everything else was appended after the rolled-back steps, so the
   book's HOUSING Thread (steps 420–451), authored with the bar above Handle,
   landed after Handle and depended on a sketch that came later than itself. */
function insertHistoryEntry(document, entry) {
  document.history ||= [];
  const n = document.history.length;
  const at = document.rollbackIndex != null && document.rollbackIndex < n ? Math.max(0, document.rollbackIndex) : n;
  document.history.splice(at, 0, entry);
  if (at < n) document.rollbackIndex = at + 1;
  return at;
}

const BODY_CONSUMERS = new Set(["extrude", "revolve", "sweep", "loft", "extrudeCut", "revolveCut", "sweepCut", "hole", "fillet", "chamfer", "shell", "draft", "dome", "rib", "thicken", "moveBody", "splitBody"]);
const makesNewBody = (feature) => ["extrude", "revolve", "sweep", "loft"].includes(feature.type) && (feature.params?.mergeResult === false || feature.params?.operation === "new-body");

/* A body feature inserted mid-history becomes the body the later steps build
   on: every later consumer of the same source now reads the new feature, as
   SOLIDWORKS rebuilds Handle on top of a Thread inserted above it. Sketch
   supports and pattern seeds keep their explicit references. Call it once the
   feature's `inputs` are final — some creators set them after creating it. */
export function reconnectLaterBodyConsumers(document, feature) {
  const sourceId = feature?.inputs?.[0];
  if (!sourceId || !BODY_CONSUMERS.has(feature.type) || makesNewBody(feature)) return [];
  const at = (document.history || []).findIndex((entry) => entry.kind === "feature" && entry.targetId === feature.id);
  if (at < 0) return [];
  const laterIds = new Set(document.history.slice(at + 1).filter((entry) => entry.kind === "feature").map((entry) => entry.targetId));
  const moved = [];
  for (const consumer of document.features || []) {
    if (!laterIds.has(consumer.id) || !BODY_CONSUMERS.has(consumer.type) || consumer.inputs?.[0] !== sourceId) continue;
    if (makesNewBody(consumer)) continue;
    consumer.inputs[0] = feature.id;
    consumer.references ||= {};
    consumer.references.features = (consumer.references.features || []).map(ref => referenceId(ref) !== sourceId ? ref
      : typeof ref === "string" ? feature.id : { ...ref, ...(ref.id ? {id:feature.id} : {persistentId:feature.id}) });
    if (consumer.params?.targetFeatureId === sourceId) consumer.params.targetFeatureId = feature.id;
    moved.push(consumer.id);
  }
  return moved;
}

export function createSketchDefinition(document, options = {}) {
  initializeParametricFields(document);
  const support = options.support;
  const supportId = referenceId(support || options.referenceId);
  if (!supportId) throw new Error("A sketch requires an explicit plane or face reference");
  const stableReference = (document.references || []).find((item) => item.id === supportId);
  const topologySupport = support && typeof support === "object" && (support.type === "topology-reference" || support.persistentId);
  if (!stableReference && !topologySupport) throw new Error("Sketch reference does not exist: " + supportId);
  const sketch = {
    id: options.id || domainId("sketch"),
    name: options.name || "Sketch " + ((document.sketches || []).length + 1),
    referenceId: supportId,
    support: topologySupport ? cloneDomain(support) : undefined,
    frame: cloneDomain(options.frame),
    frameSpace: options.frameSpace,
    supportOffset: Number(options.supportOffset) || 0,
    points: cloneDomain(options.points) || [],
    entities: cloneDomain(options.entities) || [],
    constraints: cloneDomain(options.constraints) || [],
    dimensions: cloneDomain(options.dimensions) || [],
    status: "under-defined",
  };
  document.sketches.push(sketch);
  document.activeSketch = sketch.id;
  insertHistoryEntry(document, historyEntry("sketch", sketch));
  document.revision = (Number(document.revision) || 0) + 1;
  return sketch;
}

export function recordSketchInHistory(document, sketch) {
  if (!document || !sketch) return null;
  document.sketches ||= [];
  if (!document.sketches.some(item => item.id === sketch.id)) document.sketches.push(sketch);
  document.history ||= [];
  const existing = document.history.find((entry) => entry.kind === "sketch" && entry.targetId === sketch.id);
  if (existing) return existing;
  const entry = historyEntry("sketch", sketch);
  insertHistoryEntry(document, entry);
  return entry;
}

export function createFeatureDefinition(document, type, options = {}) {
  initializeParametricFields(document);
  const spec = featureSpec(type);
  if (!spec) throw new Error("Unknown parametric feature type: " + type);
  const references = cloneDomain(options.references) || {};
  references.sketches ||= [];
  references.features ||= [];
  references.topology ||= [];
  references.references ||= [];
  const feature = {
    id: options.id || domainId("feature"),
    type,
    name: options.name || spec.label + " " + ((document.features || []).filter((item) => item.type === type).length + 1),
    params: { ...featureDefaults(type), ...(cloneDomain(options.params) || {}) },
    references,
    inputs: cloneDomain(options.inputs) || references.features.map(referenceId).filter(Boolean),
    suppressed: !!options.suppressed,
    state: "pending",
    diagnostics: [],
  };
  const issues = validateFeatureDefinition(feature);
  if (issues.some((issue) => issue.severity === "error")) {
    const error = new Error(issues.map((issue) => issue.message).join("; "));
    error.issues = issues;
    throw error;
  }
  const n = document.history.length;
  const insertion = document.rollbackIndex != null && document.rollbackIndex < n ? Math.max(0, document.rollbackIndex) : n;
  if (insertion < n && ["fillet", "chamfer"].includes(type)) {
    const sourceId = feature.inputs[0];
    if (!document.history.slice(0, insertion).some(entry => entry.kind === "feature" && entry.targetId === sourceId)) {
      throw new Error("A finish inserted at rollback needs an active source body");
    }
  }
  document.features.push(feature);
  insertHistoryEntry(document, historyEntry("feature", feature));
  if (insertion < n) reconnectLaterBodyConsumers(document, feature);
  document.revision = (Number(document.revision) || 0) + 1;
  return feature;
}

export function updateFeatureDefinition(document, featureId, changes = {}) {
  const feature = (document.features || []).find((item) => item.id === featureId);
  if (!feature) throw new Error("Feature does not exist: " + featureId);
  const candidate = {
    ...cloneDomain(feature),
    ...cloneDomain(changes),
    params: { ...(cloneDomain(feature.params) || {}), ...(cloneDomain(changes.params) || {}) },
    references: { ...(cloneDomain(feature.references) || {}), ...(cloneDomain(changes.references) || {}) },
  };
  const issues = validateFeatureDefinition(candidate);
  if (issues.some((issue) => issue.severity === "error")) {
    const error = new Error(issues.map((issue) => issue.message).join("; "));
    error.issues = issues;
    throw error;
  }
  Object.keys(feature).forEach((key) => delete feature[key]);
  Object.assign(feature, candidate, { state: "pending", diagnostics: [] });
  const entry = (document.history || []).find((item) => item.kind === "feature" && item.targetId === featureId);
  if (entry) { entry.name = feature.name; entry.status = "pending"; }
  document.revision = (Number(document.revision) || 0) + 1;
  return feature;
}

export function historyNode(document, historyId) {
  return (document.history || []).find((entry) => entry.id === historyId) || null;
}

function writeSuppression(document, entry, suppressed) {
  entry.suppressed = !!suppressed;
  const collection = entry.kind === "sketch" ? document.sketches : document.features;
  const target = (collection || []).find((item) => item.id === entry.targetId);
  if (target) target.suppressed = entry.suppressed;
}

/* Suppressing a step suppresses what that step feeds.
   A child left building on a parent that no longer builds is not a model state
   any CAD system offers: SolidWorks, Inventor, NX and Creo all take the
   dependants with the parent (Creo names them one by one first). The ones taken
   this way are TAGGED, so releasing the parent releases exactly those and
   leaves a step the user suppressed by hand suppressed — which is the
   "unsuppress with dependents" half of the same pair. */
export function suppressHistoryNode(document, historyId, suppressed = true, options = {}) {
  const entry = historyNode(document, historyId);
  if (!entry) throw new Error("History node does not exist: " + historyId);
  writeSuppression(document, entry, suppressed);
  delete entry.autoSuppressedBy; // an explicit toggle is the user's own choice
  const cascaded = [];
  if (options.cascade !== false) {
    historyDependents(document, historyId).forEach((child) => {
      if (suppressed) {
        if (child.suppressed) return; // already off, and not ours to own
        writeSuppression(document, child, true);
        child.autoSuppressedBy = entry.targetId;
        cascaded.push(child);
      } else if (child.autoSuppressedBy === entry.targetId) {
        writeSuppression(document, child, false);
        delete child.autoSuppressedBy;
        cascaded.push(child);
      }
    });
  }
  entry.cascaded = cascaded.map((child) => child.targetId);
  if (!entry.cascaded.length) delete entry.cascaded;
  document.revision = (Number(document.revision) || 0) + 1;
  return entry;
}

/* Every feature that would break if these targets stopped building — direct
   consumers, their consumers, and so on. Sketch ids and feature ids both count:
   a step consumes a sketch exactly as it consumes an earlier solid. */
export function dependentTargetIds(document, targetIds) {
  const seen = new Set((Array.isArray(targetIds) ? targetIds : [targetIds]).filter(Boolean));
  const out = new Set();
  const features = [...(document?.features || []),...(document?.sketches || [])];
  const consumes = (feature, id) =>
    featureDependencyIds(feature,document).has(id) || sketchDependencies(feature,document).includes(id) ||
    (feature.references?.sketches || []).map(referenceId).includes(id) ||
    (feature.params?.sketchId && feature.params.sketchId === id);
  let frontier = [...seen];
  while (frontier.length) {
    const next = [];
    features.forEach((feature) => {
      if (seen.has(feature.id)) return;
      if (!frontier.some((id) => consumes(feature, id))) return;
      seen.add(feature.id);
      out.add(feature.id);
      next.push(feature.id);
    });
    frontier = next;
  }
  return out;
}

/* The same cone as history entries, in the order the document builds them, so
   a caller can name them to the user before anything is suppressed. */
export function historyDependents(document, historyId) {
  const entry = historyNode(document, historyId);
  if (!entry) return [];
  const ids = dependentTargetIds(document, [entry.targetId]);
  return (document.history || []).filter((item) => ids.has(item.targetId));
}

function featureDependencyIds(feature, document) {
  const ids = new Set(feature.inputs || []);
  (feature.references?.features || []).map(referenceId).filter(Boolean).forEach((id) => ids.add(id));
  (feature.references?.topology || []).forEach((reference) => {
    if (reference?.ownerFeatureId) {
      const owner=reference.ownerFeatureId;
      // Native additive/cut faces can retain their generated tool owner. That
      // is a topology address, not an extra authoring history feature.
      const source=(document?.features || []).find(item=>item.id===owner)
        || (owner.endsWith(':tool') ? (document?.features || []).find(item=>item.id===owner.slice(0,-5)) : null);
      ids.add(source?.id || owner);
    }
  });
  return ids;
}

export function analyzeParametricHistory(document, options = {}) {
  if (options.normalize !== false) normalizeHistory(document);
  const issues = [];
  const order = new Map((document.history || []).map((entry, index) => [entry.id, index]));
  const featureEntries = new Map((document.history || []).filter((entry) => entry.kind === "feature").map((entry) => [entry.targetId, entry]));
  const sketchEntries = new Map((document.history || []).filter((entry) => entry.kind === "sketch").map((entry) => [entry.targetId, entry]));
  const featureById = new Map((document.features || []).map((feature) => [feature.id, feature]));
  const sketchById = new Map((document.sketches || []).map((sketch) => [sketch.id, sketch]));
  (document.features || []).forEach((feature) => {
    issues.push(...validateFeatureDefinition(feature));
    const entry = featureEntries.get(feature.id);
    if (!entry) issues.push({ severity: "error", code: "feature-not-in-history", featureId: feature.id, message: feature.name + " is missing from design history" });
    featureDependencyIds(feature, document).forEach((dependencyId) => {
      const dependency = featureEntries.get(dependencyId);
      if (!featureById.has(dependencyId) || !dependency) issues.push({ severity: "error", code: "missing-feature-dependency", featureId: feature.id, reference: dependencyId, message: feature.name + " depends on missing feature " + dependencyId });
      else if (entry && order.get(dependency.id) >= order.get(entry.id)) issues.push({ severity: "error", code: "future-feature-dependency", featureId: feature.id, reference: dependencyId, message: feature.name + " depends on a later history step" });
      else if (!feature.suppressed && dependency.suppressed) issues.push({ severity: "error", code: "suppressed-feature-dependency", featureId: feature.id, reference: dependencyId, message: feature.name + " depends on a suppressed feature" });
    });
    const sketchIds = (feature.references?.sketches || []).map(referenceId).filter(Boolean);
    sketchIds.forEach((sketchId) => {
      const dependency = sketchEntries.get(sketchId);
      if (!sketchById.has(sketchId) || !dependency) issues.push({ severity: "error", code: "missing-sketch-dependency", featureId: feature.id, sketchId, message: feature.name + " depends on missing sketch " + sketchId });
      else if (entry && order.get(dependency.id) >= order.get(entry.id)) issues.push({ severity: "error", code: "future-sketch-dependency", featureId: feature.id, sketchId, message: feature.name + " depends on a later sketch" });
      else if (!feature.suppressed && dependency.suppressed) issues.push({ severity: "error", code: "suppressed-sketch-dependency", featureId: feature.id, sketchId, message: feature.name + " depends on a suppressed sketch" });
    });
  });
  (document.sketches || []).forEach(sketch=>{
    const entry=sketchEntries.get(sketch.id);
    sketchDependencies(sketch,document).forEach(id=>{
      const dependency=sketchEntries.get(id) || featureEntries.get(id);
      if(!dependency)issues.push({severity:'error',code:'missing-sketch-source',sketchId:sketch.id,reference:id,message:sketch.name+' depends on missing source '+id});
      else if(entry && order.get(dependency.id)>=order.get(entry.id))issues.push({severity:'error',code:'future-sketch-source',sketchId:sketch.id,reference:id,message:sketch.name+' depends on a later history step'});
      else if(!sketch.suppressed && dependency.suppressed)issues.push({severity:'error',code:'suppressed-sketch-source',sketchId:sketch.id,reference:id,message:sketch.name+' depends on a suppressed source'});
    });
  });
  return { ok: !issues.some((issue) => issue.severity === "error"), issues, order, featureEntries, sketchEntries };
}

export function reorderHistoryNode(document, historyId, targetIndex) {
  const history = document.history || [];
  const from = history.findIndex((entry) => entry.id === historyId);
  if (from < 0) return { ok: false, issues: [{ severity: "error", code: "missing-history-node", message: "History node does not exist" }] };
  const snapshot = history.slice();
  const [entry] = history.splice(from, 1);
  history.splice(Math.max(0, Math.min(history.length, targetIndex)), 0, entry);
  const analysis = analyzeParametricHistory(document, { normalize: false });
  if (!analysis.ok) {
    document.history = snapshot;
    return analysis;
  }
  document.revision = (Number(document.revision) || 0) + 1;
  return analysis;
}

export function removeHistoryNode(document, historyId, options = {}) {
  const entry = historyNode(document, historyId);
  if (!entry) return { ok: false, issues: [{ severity: "error", code: "missing-history-node", message: "History node does not exist" }] };
  const dependentIds=dependentTargetIds(document,[entry.targetId]);
  const dependants=[...(document.features || []),...(document.sketches || [])].filter(item=>dependentIds.has(item.id));
  const finishPlan=entry.kind==='feature' ? planFinishRemoval(document,(document.features||[]).find(feature=>feature.id===entry.targetId),options.verifiedTopology) : null;
  if(finishPlan?.issues.length)return {ok:false,issues:finishPlan.issues};
  if (dependants.length && !finishPlan) return { ok: false, issues: [{ severity: "error", code: "history-node-has-dependants", reference: entry.targetId, dependants: dependants.map((item) => item.id), message: entry.name + " is used by " + dependants.map((item) => item.name).join(", ") }] };
  if(finishPlan)finishPlan.apply();
  const removedIndex=document.history.indexOf(entry);
  if(document.rollbackIndex!=null&&removedIndex<document.rollbackIndex)document.rollbackIndex--;
  document.history = document.history.filter((item) => item !== entry);
  if (entry.kind === "feature") document.features = document.features.filter((item) => item.id !== entry.targetId);
  else document.sketches = document.sketches.filter((item) => item.id !== entry.targetId);
  const dirtyPartIds = [];
  // Finish/cut features also live on their source preview body. Deleting only
  // the history entry leaves that body rounded or cut after save and reopen.
  for (const part of document.parts || []) {
    let changed = false;
    for (const key of ["exactOperations", "cuts3d", "merges3d", "holes"]) {
      if (!Array.isArray(part[key])) continue;
      const remaining = part[key].filter(item => !item || Array.isArray(item) ||
        (key === "exactOperations" ? item.id : item.featureId) !== entry.targetId);
      if (remaining.length !== part[key].length) { part[key] = remaining; changed = true; }
    }
    if (changed) {
      delete part.meshData;
      part.exactBuildToken = (part.exactBuildToken || 0) + 1;
      part.exactPending = false;
      part.exactError = null;
      dirtyPartIds.push(part.id);
    }
  }
  document.revision = (Number(document.revision) || 0) + 1;
  return { ok: true, issues: [], dirtyPartIds };
}

export function parametricHistoryIds(document) {
  return {
    sketch: sketchHistoryId,
    feature: featureHistoryId,
    entries: (document.history || []).map((entry) => entry.id),
  };
}

export function historyRollbackIndex(document) {
  const n = (document?.history || []).length;
  if (document?.rollbackIndex == null || document.rollbackIndex > n) return n;
  return Math.max(0, document.rollbackIndex);
}

export function setHistoryRollback(document, index) {
  if (!document) return 0;
  const n = (document.history || []).length;
  if (index == null || index >= n) document.rollbackIndex = null;
  else document.rollbackIndex = Math.max(0, index);
  document.revision = (Number(document.revision) || 0) + 1;
  return historyRollbackIndex(document);
}

export function historyEntryRolled(document, index) {
  if (document?.rollbackIndex == null) return false;
  return index >= historyRollbackIndex(document);
}

export function activeHistoryTargetIds(document) {
  const ids = new Set();
  (document?.history || []).forEach((entry, index) => {
    if (!entry || entry.suppressed || historyEntryRolled(document, index)) return;
    if (entry.targetId) ids.add(entry.targetId);
  });
  let changed=true;
  while(changed){changed=false;[...(document?.features || []),...(document?.sketches || [])].forEach(item=>{
    const deps=[...featureDependencyIds(item,document),...(item.references?.sketches || []).map(referenceId),...sketchDependencies(item,document)];
    if(ids.has(item.id) && deps.some(id=>!ids.has(id) && (document.history || []).some(entry=>entry.targetId===id))){ids.delete(item.id);changed=true;}
  });}
  return ids;
}

export function applyHistoryToPreviewParts(document) {
  if (!document?.history?.length || !Array.isArray(document.parts)) return { dirtyPartIds: [] };
  const active = activeHistoryTargetIds(document);
  const known = new Set((document.history || []).map((entry) => entry.targetId).filter(Boolean));
  const dirty = new Set();
  const features = document.features || [];
  const byId = new Map(features.map(feature => [feature.id, feature]));
  const setFlag = (object, key, next, partId) => {
    if (!object || !!object[key] === !!next) return;
    object[key] = !!next;
    if (partId) dirty.add(partId);
  };
  (document.parts || []).forEach((part) => {
    if (!part) return;
    // Cosmetic annotations are projections of their history feature, just like
    // solid geometry. Never retain the overlay sampled when the tool was created.
    const belongsToPart = (id, seen = new Set()) => {
      if (!id || seen.has(id)) return false;
      if (id === part.featureId || id === part.derivedFeatureId) return true;
      seen.add(id);
      return (byId.get(id)?.inputs || []).some(input => belongsToPart(input, seen));
    };
    const threads = features.filter(feature => feature.type === "thread" && (feature.inputs || []).some(id => belongsToPart(id)));
    if (threads.length) {
      const feature = threads.filter(item => !item.suppressed && (!known.has(item.id) || active.has(item.id))).at(-1);
      if (feature) {
        const annotation = cosmeticThread(feature.params);
        part.cosmeticThread = annotation;
        part.threadGeometry = annotation.threadGeometry;
      } else {
        delete part.cosmeticThread;
        delete part.threadGeometry;
      }
    }
    if (part.featureId && known.has(part.featureId)) setFlag(part, "suppressed", !active.has(part.featureId), part.id);
    if (part.derivedFeatureId && known.has(part.derivedFeatureId)) setFlag(part, "suppressed", !active.has(part.derivedFeatureId), part.id);
    (part.exactOperations || []).forEach((operation) => {
      if (!operation?.id || !known.has(operation.id)) return;
      setFlag(operation, "suppressed", !active.has(operation.id), part.id);
    });
    [...(part.cuts3d || []), ...(part.merges3d || [])].forEach((cut) => {
      if (!cut?.featureId || !known.has(cut.featureId)) return;
      setFlag(cut, "suppressed", !active.has(cut.featureId), part.id);
    });
    (part.holes || []).forEach((hole) => {
      if (!hole || Array.isArray(hole) || !hole.featureId || !known.has(hole.featureId)) return;
      setFlag(hole, "suppressed", !active.has(hole.featureId), part.id);
    });
  });
  return { dirtyPartIds: Array.from(dirty) };
}
import { discardIncidentalToolboxSketches } from "./toolbox_idle_sketch.js";
