import { booleanBrep, chamferBrep, circularPatternBrep, compoundBrep, deserializeBrep, disposeBrep, extractBrepTopology, filletBrep, linearGridPatternBrep, linearPatternBrep, makeBrepExtrusion, makeBrepPrimitive, makeBrepRevolve, makeBrepSweep, makeBrepLoft, mirrorBrep, shellBrep } from "./cad_kernel.js";
import { resolveProfilePoints } from "./sketch_solver.js";
import { createTopologyRegistry, resolveFeatureTopologyReferences, topologyForFeature } from "./core/topology.js";
import { realignFrame } from "./core/frame.js";
import { resolveParameters } from "./core/rebuild.js";
import { decodeBinaryPayload } from "./core/binary_payload.js";
import { resolveAttachmentPayload } from "./core/attachment_store.js";

export function ensureFeatureTree(def) {
  def.features ||= [];
  def.featureVersion ||= 1;
  return def.features;
}

export function addFeature(def, feature) {
  const features = ensureFeatureTree(def);
  const normalized = {
    id: feature.id || "feat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: feature.name || feature.type,
    type: feature.type,
    params: structuredClone(feature.params || {}),
    inputs: (feature.inputs || []).slice(),
    references: structuredClone(feature.references || []),
    suppressed: !!feature.suppressed,
  };
  features.push(normalized);
  return normalized;
}

export function reorderFeature(def, featureId, targetIndex) {
  const features = ensureFeatureTree(def), index = features.findIndex((f) => f.id === featureId);
  if (index < 0) return false;
  const [feature] = features.splice(index, 1);
  features.splice(Math.max(0, Math.min(features.length, targetIndex)), 0, feature);
  return true;
}

function validateOrder(features) {
  const seen = new Set(), issues = [];
  for (const feature of features) {
    for (const input of feature.inputs || []) if (!seen.has(input)) issues.push({ feature: feature.id, code: "future-or-missing-input", input });
    seen.add(feature.id);
  }
  return issues;
}

export async function regenerateFeatures(def, options = {}) {
  const features = ensureFeatureTree(def);
  const orderIssues = validateOrder(features);
  if (orderIssues.length) return { ok: false, results: new Map(), issues: orderIssues };
  const results = new Map(), issues = [], topology = createTopologyRegistry(), topologyBindings = [];
  const parameterRun = resolveParameters(def, options.parameterOverrides || {});
  issues.push(...parameterRun.issues);
  if (parameterRun.issues.some((issue) => issue.severity === "error")) return {ok:false,results,issues,topology:[],topologyBindings};
  const materialize = (value) => {
    if (Array.isArray(value)) return value.map(materialize);
    if (typeof value === "string" && value[0] === "$") return parameterRun.values[value.slice(1)];
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,materialize(item)]));
  };
  const rollbackIndex = options.rollbackId ? features.findIndex((f) => f.id === options.rollbackId) : features.length - 1;
  for (let index = 0; index < features.length; index++) {
    if (options.signal?.aborted) throw new DOMException("Regeneration cancelled", "AbortError");
    if (index > rollbackIndex) break;
    const feature = features[index];
    if (feature.suppressed) continue;
    try {
      const topologyRun = resolveFeatureTopologyReferences(feature, topology);
      issues.push(...topologyRun.issues);
      topologyBindings.push(...topologyRun.resolutions);
      if (topologyRun.issues.some((issue) => issue.severity === "error")) throw new Error(topologyRun.issues.find((issue) => issue.severity === "error").message);
      let result = null, effectiveParams = materialize(feature.params || {});
      if (feature.type === "box") result = await makeBrepPrimitive({ type: "box", ...effectiveParams });
      else if (feature.type === "cylinder") result = await makeBrepPrimitive({ type: "cylinder", ...effectiveParams });
      else if (feature.type === "import") {
        if (!effectiveParams.sourcePayload) throw new Error("Imported mesh has no persistent exact BREP payload");
        if (effectiveParams.sourcePayload.format !== "brep") throw new Error("Unsupported exact import payload: " + effectiveParams.sourcePayload.format);
        const payload=await resolveAttachmentPayload(effectiveParams.sourcePayload);
        result = await deserializeBrep(decodeBinaryPayload(payload), effectiveParams.source?.name || "import.brep");
      }
      else if (feature.type === "extrude") {
        effectiveParams = resolveSketchExtrusion(def, effectiveParams);
        effectiveParams = alignExtrusionToSupport(effectiveParams, topologyRun.resolutions);
        result = await makeBrepExtrusion(effectiveParams);
      }
      else if (feature.type === "revolve") {
        effectiveParams = resolveSketchProfile(def,effectiveParams);
        result = await makeBrepRevolve(effectiveParams);
      }
      else if (feature.type === "sweep") result = await makeBrepSweep(effectiveParams);
      else if (feature.type === "loft") result = await makeBrepLoft(effectiveParams);
      else if (feature.type === "linearPattern") {
        const source=results.get(feature.inputs[0]);result=await linearPatternBrep(source,effectiveParams);
      }
      else if (feature.type === "linearGridPattern") {
        const source=results.get(feature.inputs[0]);result=await linearGridPatternBrep(source,effectiveParams);
      }
      else if(feature.type==="circularPattern") { const source=results.get(feature.inputs[0]);result=await circularPatternBrep(source,effectiveParams); }
      else if(feature.type==="mirror") {
        const source=results.get(feature.inputs[0]);
        let plane=effectiveParams.plane;
        if(typeof plane==="string") plane=(def.references || []).find((reference)=>reference.id===plane);
        result=await mirrorBrep(source,{...effectiveParams,plane});
      }
      else if (feature.type === "assembly") {
        result=await compoundBrep((feature.inputs || []).map((id)=>results.get(id)).filter((entry)=>entry?.shape));
      }
      else if (feature.type === "fillet") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Fillet input is unavailable");
        const edgePersistentIds = topologyRun.resolutions.filter((entry) => entry.reference?.kind === "edge" && entry.topology).map((entry) => entry.topology.persistentId);
        result = await filletBrep(source, effectiveParams.radius, {
          edgePersistentIds,
          propagation: effectiveParams.propagation,
          section: effectiveParams.section,
          continuity: effectiveParams.continuity,
        });
      }
      else if (feature.type === "chamfer") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Chamfer input is unavailable");
        const edgePersistentIds = topologyRun.resolutions.filter((entry) => entry.reference?.kind === "edge" && entry.topology).map((entry) => entry.topology.persistentId);
        result = await chamferBrep(source, effectiveParams.distance, {
          edgePersistentIds,
          mode: effectiveParams.mode,
          secondDistance: effectiveParams.secondDistance,
          angle: effectiveParams.angle,
          flip: effectiveParams.flip,
        });
      }
      else if (feature.type === "shell") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Shell input is unavailable");
        const facePersistentIds = topologyRun.resolutions.filter((entry) => entry.reference?.kind === "face" && entry.topology).map((entry) => entry.topology.persistentId);
        result = await shellBrep(source, effectiveParams.thickness, {
          facePersistentIds,
          direction: effectiveParams.direction,
          tolerance: effectiveParams.tolerance,
          join: effectiveParams.join,
        });
      }
      else if (["union", "subtract", "intersect"].includes(feature.type)) {
        const left = results.get(feature.inputs[0]), right = results.get(feature.inputs[1]);
        if (!left || !right) throw new Error("Boolean input is unavailable");
        result = await booleanBrep(feature.type, left, right);
      } else if (feature.type === "sketch") {
        result = { kind: "sketch", sketchId: effectiveParams.sketchId || "main" };
      } else {
        throw new Error("Unsupported feature type: " + feature.type);
      }
      const inputResults = (feature.inputs || []).map((id) => results.get(id)).filter(Boolean);
      result.topology = topologyForFeature(feature, effectiveParams, inputResults);
      if (result.shape) result.topology = extractBrepTopology(result, { ownerFeatureId: feature.id, expectedTopology: result.topology }).topology;
      result.topology.forEach((item) => {
        if (!topology.byPersistentId.has(item.persistentId)) topology.list.push(item);
        topology.byPersistentId.set(item.persistentId, item);
      });
      results.set(feature.id, result);
      feature.error = null;
      feature.regeneratedAt = Date.now();
    } catch (error) {
      feature.error = String(error?.message || error);
      issues.push({ feature: feature.id, code: "regeneration-failed", message: feature.error });
      break; // downstream topology is invalid; keep the last good prefix only
    }
  }
  const last = Array.from(results.values()).reverse().find((r) => r?.shape) || null;
  return { ok: !issues.some((issue) => issue.severity === "error" || issue.code === "regeneration-failed"), results, finalShape: last, topology: topology.list, topologyBindings, issues };
}

export function releaseRegeneration(run) {
  if (!run?.results) return;
  const seen = new Set();
  run.results.forEach((result) => {
    if (result?.shape && !seen.has(result.shape)) { seen.add(result.shape); disposeBrep(result); }
  });
}

// Resolve a sketch-backed extrusion at regeneration time so editing the source
// sketch updates the solid without rebuilding a disconnected copy of the profile.
export function resolveSketchExtrusion(def, params) {
  if (!params?.profileEntityIds?.length) return params;
  // A profile belongs to one named sketch. Older documents carried a single
  // plane-less `def.sketch`, so fall back to it and then to the first sketch.
  const sketches = Array.isArray(def.sketches) ? def.sketches : [];
  const sketch = (params.sketchId && sketches.find((s) => s.id === params.sketchId))
    || def.sketch || sketches[0] || null;
  if (!sketch) throw new Error("Sketch profile is missing its sketch");
  // Same resolver the live mesh uses, so the exact solid and the drawn one
  // cannot disagree about what the feature currently is.
  const points = resolveProfilePoints(sketch, params.profileEntityIds);
  if (!points) throw new Error("Sketch profile is missing, open or unsupported");
  return { ...params, points };
}

export function resolveSketchProfile(def,params) {
  if (!params?.profileEntityIds?.length) return params;
  const sketches=Array.isArray(def.sketches)?def.sketches:[],sketch=(params.sketchId&&sketches.find((item)=>item.id===params.sketchId))||def.sketch||sketches[0];
  if(!sketch)throw new Error("Feature profile is missing its sketch");
  const points=resolveProfilePoints(sketch,params.profileEntityIds);
  if(!points)throw new Error("Feature profile is missing, open or unsupported");
  return {...params,points};
}

export function alignExtrusionToSupport(params, resolutions = []) {
  if (!params?.support) return params;
  const resolution = resolutions.find((entry) => entry.reference === params.support || entry.reference?.persistentId === params.support.persistentId);
  const descriptor = resolution?.topology?.descriptor;
  if (!descriptor?.origin || !descriptor?.normal) throw new Error("Extrusion support face is unavailable");
  const reversed = params.direction === "reverse" ? -1 : 1;
  const symmetric = !!params.symmetric || params.endCondition === "mid-plane";
  if (params.frame) {
    const baseOffset = Number(params.baseOffset) || 0;
    const depth = Math.max(1e-6, Math.abs(Number(params.depth) || Math.abs(Number(params.to) - Number(params.from))));
    return { ...params, frame: realignFrame(params.frame, descriptor.origin, descriptor.normal), from: symmetric ? baseOffset-depth/2 : baseOffset, to: symmetric ? baseOffset+depth/2 : baseOffset+reversed*depth };
  }
  const axis = params.axis || "y";
  const coordinate = Number(descriptor.origin[axis]) || 0;
  const direction = (Math.sign(Number(descriptor.normal[axis]) || 1) || 1) * reversed;
  const baseOffset = Number(params.baseOffset) || 0;
  const depth = Math.max(1e-6, Math.abs(Number(params.depth) || Math.abs(Number(params.to) - Number(params.from))));
  const center = coordinate + direction * baseOffset;
  return { ...params, from: symmetric ? center-direction*depth/2 : center, to: symmetric ? center+direction*depth/2 : center+direction*depth };
}
