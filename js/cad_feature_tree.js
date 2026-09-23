import {pierceSketchToHelix} from './core/sketch_pierce.js';
import {helixFromSketch} from './core/sketch_helix.js';
import {isThroughVertexPlane,resolveOffsetSketch} from './core/offset_planes.js';
import {linkedEdgeLookup,updateSilhouetteSketch} from './core/cone_silhouette.js';
import {bindIntersectionTargets,bindModelEdgeTargets,bindPierceTargets} from './sketch_intersection.js';
import {revolveThinProfile} from './core/thin_profile.js';
import {resolveAssociativeBoundary,updateCircularBoundarySketch} from './cad_associative_boundary.js';
import {resolveSketchSources,sketchWorldPoint} from "./core/swept_sources.js";
import { buildDependencyGraph, featureDependencies, datumReferenceIds } from "./core/dependency_graph.js";
import { booleanBrep, chamferBrep, circularPatternBrep, compoundBrep, curvePatternBrep, deserializeBrep, disposeBrep, domeBrep, draftBrep, extractBrepTopology, filletBrep, linearGridPatternBrep, linearPatternBrep, makeBrepCone, makeBrepHoleTool, makeBrepExtrusion, makeBrepPrimitive, makeBrepRevolve, makeBrepSweep, makeBrepLoft, mirrorBrep, moveBodyBrep, placeBrep, rayHitsBrepFace, rayHitsExtendedBrepFace, resolveBrepSubshape, ribBrep, splitBrep, shellBrep, thickenBrep } from "./cad_kernel.js";
import {resolveProfilePoints, solveSketch} from "./sketch_solver.js";
import { sketchProfileSegments } from "./core/profile_curves.js";
import { createTopologyRegistry, resolveFeatureTopologyReferences, topologyForFeature } from "./core/topology.js";
import { vertexEntriesFrom } from "./core/topology_selection.js";
import { realignFrame } from "./core/frame.js";
import { aabbFromTopology, extrusionAxisVector, extrusionMapPoint, isUpToFace, profileBoundarySamples, resolveExtrudeExtent, resolvedEndFace, UP_TO_FACE_MISSING, UP_TO_FACE_MISSED, UP_TO_NEXT_MISSED } from "./core/extrude_extent.js";
import { resolveParameters, sketchDiagnostics } from "./core/rebuild.js";
import { decodeBinaryPayload } from "./core/binary_payload.js";
import { resolveAttachmentPayload } from "./core/attachment_store.js";
import { helixSweepPath, sampleHelix } from "./cad_helix.js";
import { helixSpecForThread, modeledThreadSolid, normalizeThreadSpec } from "./cad_thread.js";
import { knurlBandMesh, normalizeKnurlSpec } from "./cad_knurl.js";
import { insertBody, normalizeInsertFeature } from "./cad_appearances.js";
import { cachedExactTopology } from "./core/exact_topology_cache.js";

export function ensureFeatureTree(def) {
  def.features ||= [];
  def.featureVersion ||= 1;
  return def.features;
}

function featureReferenceSlots(feature) {
  const params = feature?.params || {};
  const raw = feature?.references;
  const references = raw && !Array.isArray(raw)
    ? structuredClone(raw)
    : { sketches: [], features: [], topology: [], references: [] };
  references.sketches ||= [];
  references.features ||= [];
  references.topology ||= [];
  references.references ||= [];
  if (params.sketchId && !references.sketches.length) references.sketches = [params.sketchId];
  return references;
}

export function addFeature(def, feature) {
  const features = ensureFeatureTree(def);
  const normalized = {
    id: feature.id || "feat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: feature.name || feature.type,
    type: feature.type,
    params: structuredClone(feature.params || {}),
    inputs: (feature.inputs || []).slice(),
    references: featureReferenceSlots(feature),
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

function resolvedSubshapeIds(resolutions, kind) {
  const ids = [];
  (resolutions || []).forEach((entry) => {
    if (entry.reference?.kind !== kind && entry.topology?.kind !== kind) return;
    if (entry.topology?.persistentId) ids.push(entry.topology.persistentId);
    const members = entry.reference?.memberPersistentIds || entry.topology?.memberPersistentIds;
    if (Array.isArray(members) && members.length) ids.push(...members);
  });
  return [...new Set(ids)];
}

export async function regenerateFeatures(def, options = {}) {
  const features = ensureFeatureTree(def);
  const results = new Map(), issues = [], topology = createTopologyRegistry(), topologyBindings = [], resolvedExtrusions = new Map(), boundaryUpdates = new Map();
  const topologyHints=cachedExactTopology(def);
  const parameterRun = resolveParameters(def, options.parameterOverrides || {});
  issues.push(...parameterRun.issues);
  const sketchRun = sketchDiagnostics({
    sketches:def.sketches || [], variables:def.variables || [], parameters:def.parameters || {},
    features:features.map(feature => ({id:feature.id})),
    references:(def.references || []).concat(["top","front","right","bottom","back","left"].map(plane => ({id:"plane:"+plane}))),
  }, parameterRun.values);
  issues.push(...sketchRun.issues);
  const executionDef = {...def, sketches:sketchRun.sketches,referenceGeometry:structuredClone(def.referenceGeometry || [])};
  const badSketches = new Set(sketchRun.issues.filter(i => i.severity === "error" && i.sketchId).map(i => i.sketchId));
  const sketches = new Map((def.sketches || []).map(s => [s.id, s]));
  const materialize = (value) => {
    if (Array.isArray(value)) return value.map(materialize);
    if (typeof value === "string" && value[0] === "$") {
      if (parameterRun.values[value.slice(1)] === undefined) throw new Error("Unavailable parameter: " + value.slice(1));
      return parameterRun.values[value.slice(1)];
    }
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,materialize(item)]));
  };
  let rollbackIndex = options.rollbackId ? features.findIndex((f) => f.id === options.rollbackId) : features.length - 1;
  if(options.rollbackId && rollbackIndex<0){issues.push({severity:"warning",code:"missing-rollback-feature",message:"Rollback feature no longer exists; rebuilding full history"});rollbackIndex=features.length-1;}
  const datums=datumReferenceIds(def);
  const active = features.slice(0, rollbackIndex + 1);
  const graph = buildDependencyGraph({...def, features:active});
  issues.push(...graph.issues);
  const invalid = new Set(graph.issues.filter(i => i.severity === "error" && i.featureId).map(i => i.featureId));
  for (const issue of graph.issues) for (const id of issue.featureIds || []) invalid.add(id);
  for (const feature of active) {
    if (invalid.has(feature.id)) feature.error = "Feature dependency is unavailable";
  }
  const ordered = graph.issues.some(i => i.code === "duplicate-feature-id") ? [] : graph.order;
  for (const feature of ordered) {
    if (options.signal?.aborted) throw new DOMException("Regeneration cancelled", "AbortError");
    if (feature.suppressed || invalid.has(feature.id)) continue;
    let result = null;
    try {
      for (const id of featureDependencies(feature)) {
        const sketch = sketches.get(id);
        if (sketch && !graph.byId.has(id)) {
          if (badSketches.has(id)) throw new Error("Driving sketch is unavailable: " + id);
          if (sketch.support?.ownerFeatureId && !results.has(sketch.support.ownerFeatureId)) throw new Error("Sketch support is unavailable: " + sketch.support.ownerFeatureId);
        } else if (!results.has(id) && !(datums.has(id)&&!graph.byId.has(id))) throw new Error("Feature input is unavailable: " + id);
      }
      const topologyRun = resolveFeatureTopologyReferences(feature, topology);
      issues.push(...topologyRun.issues);
      topologyBindings.push(...topologyRun.resolutions);
      if (topologyRun.issues.some((issue) => issue.severity === "error")) throw new Error(topologyRun.issues.find((issue) => issue.severity === "error").message);
      let effectiveParams = materialize(feature.params || {});
      const sketchId = effectiveParams.sketchId || feature.sketch || (feature.inputs || []).find(id => sketches.has(id));
      if (sketchId) effectiveParams.sketchId = sketchId;
      const sketchIndex=executionDef.sketches.findIndex(s=>s.id===sketchId);
      let linkedSketch=executionDef.sketches[sketchIndex];
      const topologyLookup=ref=>{
        if(!ref)return null;
        const topology=results.get(ref.ownerFeatureId)?.topology || [];
        return topology.find(item=>item.persistentId===ref.persistentId)
          || (ref.semantic ? topology.find(item=>item.kind===(ref.kind||"edge")&&item.semantic===ref.semantic) : null)
          || vertexEntriesFrom(topology).find(item=>item.persistentId===ref.persistentId);
      };
      if(linkedSketch){const moved=resolveOffsetSketch(linkedSketch,executionDef.references,topologyLookup);
        if(moved!==linkedSketch){linkedSketch=moved;executionDef.sketches[sketchIndex]=moved;boundaryUpdates.set(moved.id,{sketch:moved,oldEntityIds:[],newEntityIds:[]});}
        if(feature.type==="rib" && moved.frame)effectiveParams={...effectiveParams,frame:moved.frame,axis:"frame"};}

      const circularBoundary=updateCircularBoundarySketch(linkedSketch,results);
      if(circularBoundary){
        const report=solveSketch(circularBoundary);
        if(!report.converged)throw new Error("Converted circular boundary relations could not follow the source");
        linkedSketch=circularBoundary;executionDef.sketches[sketchIndex]=circularBoundary;
        boundaryUpdates.set(circularBoundary.id,{sketch:circularBoundary,oldEntityIds:[],newEntityIds:[]});
      }

      if(linkedSketch?.pierce){
        const link=linkedSketch.pierce,curve=results.get(link.featureId)?.spec;if(!curve)throw new Error('Pierce curve is unavailable');
        linkedSketch=pierceSketchToHelix(linkedSketch,link.anchorId,curve,link.position);executionDef.sketches[sketchIndex]=linkedSketch;
        boundaryUpdates.set(linkedSketch.id,{sketch:linkedSketch,oldEntityIds:[],newEntityIds:[]});
      }
      if(linkedSketch?.silhouetteCopies?.length || linkedSketch?.circleCopies?.length){
        const updated=updateSilhouetteSketch(linkedSketch,ref=>linkedEdgeLookup(results.get(ref.ownerFeatureId)?.topology,ref));
        executionDef.sketches[sketchIndex]=updated;
        const ids=[...(updated.silhouetteCopies || []),...(updated.circleCopies || [])].map(c=>c.entityId);boundaryUpdates.set(updated.id,{sketch:updated,oldEntityIds:ids,newEntityIds:ids});
        linkedSketch=updated;
      }
      if(linkedSketch?.constraints?.some(constraint=>(constraint.type==="intersection"&&constraint.edgeA)||constraint.type==="onModelEdge"||constraint.type==="pierce")){
        const updated=structuredClone(linkedSketch);
        const edgeLookup=ref=>{
          const topology=results.get(ref.ownerFeatureId)?.topology || [];
          return topology.find(item=>item.persistentId===ref.persistentId)
            || (ref.semantic ? topology.find(item=>item.kind==="edge"&&item.semantic===ref.semantic) : null);
        };
        bindIntersectionTargets(updated,edgeLookup);
        bindModelEdgeTargets(updated,edgeLookup);
        bindPierceTargets(updated,executionDef.sketches || [],sketchWorldPoint);
        const report=solveSketch(updated);
        if(!report.converged)throw new Error("A relation to model edges or another sketch could not follow its source");
        executionDef.sketches[sketchIndex]=updated;
        boundaryUpdates.set(updated.id,{sketch:updated,oldEntityIds:[],newEntityIds:[]});
      }
      if (feature.type === "box") result = await makeBrepPrimitive({ type: "box", ...effectiveParams });
      else if (feature.type === "cylinder") result = await makeBrepPrimitive({ type: "cylinder", ...effectiveParams });
      else if (feature.type === "sphere") result = await makeBrepPrimitive({ type: "sphere", ...effectiveParams });
      else if (feature.type === "import") {
        if (!effectiveParams.sourcePayload) throw new Error("Imported mesh has no persistent exact BREP payload");
        if (effectiveParams.sourcePayload.format !== "brep") throw new Error("Unsupported exact import payload: " + effectiveParams.sourcePayload.format);
        const payload=await resolveAttachmentPayload(effectiveParams.sourcePayload);
        result = await deserializeBrep(decodeBinaryPayload(payload), effectiveParams.source?.name || "import.brep");
      }
      else if (feature.type === "extrude") {
        effectiveParams = resolveSketchExtrusion(executionDef, effectiveParams);
        effectiveParams = alignExtrusionToSupport(effectiveParams, topologyRun.resolutions);
        const boundary=resolveAssociativeBoundary(executionDef.sketches.find(sketch=>sketch.id===effectiveParams.sketchId),effectiveParams,results);
        if(boundary){effectiveParams=boundary.params;boundaryUpdates.set(boundary.sketch.id,boundary);}
        effectiveParams = alignExtrusionEndCondition(feature, effectiveParams, topologyRun.resolutions, results);
        result = await makeBrepExtrusion(effectiveParams);
        const stored = { ...effectiveParams };
        delete stored.untilFace;
        resolvedExtrusions.set(feature.id, stored);
      }
      else if (feature.type === "holeTool") {
        let params=effectiveParams.centres ? effectiveParams : alignExtrusionToSupport(effectiveParams,topologyRun.resolutions);
        // A circular sketch supplies its centre, not the cutter's polygon.
        if(params.sketchId && (!params.layout || params.layout==="sketch")){
          const sketch=(def.sketches||[]).find(s=>s.id===params.sketchId)||def.sketch;
          const circles=(sketch?.entities||[]).filter(e=>e.type==="circle"&&!e.construction&&(!params.profileEntityIds?.length||params.profileEntityIds.includes(e.id)));
          if(!circles.length)throw new Error("Hole placement sketch requires a circle");
          params={...params,centres:circles.map(circle=>{const point=sketch.points.find(p=>p.id===circle.c);if(!point)throw new Error("Hole centre is missing");return {u:point.x,v:point.y};})};
        }
        result=await makeBrepHoleTool(params,results.get(params.targetFeatureId || feature.inputs[0]));
      }
      else if (feature.type === "revolve") {
        effectiveParams = resolveSketchProfile(executionDef,effectiveParams);
        result = await makeBrepRevolve(effectiveParams);
      }
      else if (feature.type === "sweep") {
        if(effectiveParams.sketchSources){const resolved=resolveSketchSources(executionDef,effectiveParams.profileMode==="circular"?{...effectiveParams.sketchSources,diameter:effectiveParams.profileDiameter}:effectiveParams.sketchSources,resolveProfilePoints);if(!resolved)throw new Error("Sweep source sketch is missing or invalid");effectiveParams={...effectiveParams,...resolved};}
        // A helix path without its smooth segments is the old polyline spine,
        // which cannot turn the section (see helixSweepPath); rebuild it from
        // the helix so documents saved that way repair themselves.
        const helixPath = effectiveParams.helix && !effectiveParams.pathSegments
          ? helixSweepPath(effectiveParams.helix)
          : null;
        result = await makeBrepSweep(helixPath ? { ...effectiveParams, ...helixPath } : effectiveParams);
      }
      else if (feature.type === "loft") {
        if(effectiveParams.sketchSources){const resolved=resolveSketchSources(executionDef,effectiveParams.sketchSources,resolveProfilePoints);if(!resolved)throw new Error("Loft source sketch is missing or invalid");effectiveParams={...effectiveParams,...resolved};}
        result = await makeBrepLoft(effectiveParams);
      }
      else if (feature.type === "cone") result = await makeBrepCone(effectiveParams);
      else if (feature.type === "helix") {
        const helix = sampleHelix(helixFromSketch(executionDef,effectiveParams));
        for(const reference of executionDef.referenceGeometry)if(reference.featureId===feature.id)Object.assign(reference,helix.spec);
        result = { kind: "curve", points: helix.points, spec: helix.spec };
      }
      else if (feature.type === "thread") {
        const thread = normalizeThreadSpec(effectiveParams);
        if (thread.mode === "modeled") {
          const source = results.get(feature.inputs[0]);
          const solid = modeledThreadSolid(thread,{asCutter:!!source?.shape});
          const pipe = await makeBrepLoft({sections:solid.sections,solid:true,ruled:true,matchProfiles:false});
          if(source?.shape){
            try{result=await booleanBrep(solid.operation === "add" ? "union" : "subtract",source,pipe);}
            finally{disposeBrep(pipe);}
          }else result=pipe;
          result.threadGeometry=solid.threadGeometry;
        } else {
          result = { kind: "annotation", annotation: "cosmetic-thread", spec: thread, helix: helixSpecForThread(thread) };
        }
      }
      else if (feature.type === "knurl") {
        const knurl = normalizeKnurlSpec(effectiveParams);
        result = { kind: "annotation", annotation: "knurl", spec: knurl, mesh: knurlBandMesh(knurl) };
      }
      else if (feature.type === "insert") {
        const insert = normalizeInsertFeature(effectiveParams);
        const body = insertBody(insert);
        let outer,inner;
        try {
          outer = await makeBrepPrimitive({type:"cylinder",r:insert.outer/2,h:insert.length,axis:insert.axis,...insert.origin});
          inner = await makeBrepPrimitive({type:"cylinder",r:insert.inner/2,h:insert.length+.02,axis:insert.axis,x:insert.origin.x-insert.axis.x*.01,y:insert.origin.y-insert.axis.y*.01,z:insert.origin.z-insert.axis.z*.01});
          result = await booleanBrep("subtract",outer,inner);
        } finally {if(outer)disposeBrep(outer);if(inner)disposeBrep(inner);}
        result.insert = body;
      }
      else if (feature.type === "linearPattern") {
        const source=results.get(feature.inputs[0]);result=await linearPatternBrep(source,effectiveParams);
      }
      else if (feature.type === "linearGridPattern") {
        const source=results.get(feature.inputs[0]);result=await linearGridPatternBrep(source,effectiveParams);
      }
      else if(feature.type==="circularPattern") { const source=results.get(feature.inputs[0]);result=await circularPatternBrep(source,effectiveParams); }
      else if(feature.type==="curvePattern") { const source=results.get(feature.inputs[0]);result=await curvePatternBrep(source,effectiveParams); }
      else if (feature.type === "placedBody") {
        /* A body that is a copy of another body under one rigid transform, and
           the fused run of such copies a merged pattern produces. The builder
           lives with exactBrepForPart because that is what rebuilds the shape
           being copied — holes, 3D cuts and finish operations included — and a
           second implementation here would be a second answer. Imported at the
           point of use: only a model-editor document contains this row, and a
           static import would put the editor's geometry module on the boot
           graph of every consumer of the exact tree. */
        const { placedBodyBrep } = await import("./modeler_part_geometry.js");
        result = await placedBodyBrep(effectiveParams);
      }
      else if (feature.type === "transformBody") {
        /* The body it was handed, put where the viewport draws it: one rigid
           transform, matrix and shift, with no pivot of its own — the pivot is
           already folded into the shift by rigidTransformAboutPivot. This is
           what carries a part's `patternRotations` into the exact tree, so a
           circular or curve pattern copy is EXPORTED at its own angle instead
           of at the seed's. It is not moveBody: that turns a body about its own
           centre of mass, which is not where a pattern pivots. */
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Transform input is unavailable");
        result = await placeBrep(source, effectiveParams);
      }
      else if(feature.type==="mirror") {
        const source=results.get(feature.inputs[0]);
        let plane=effectiveParams.plane ?? effectiveParams.planeReference ?? feature.references?.plane ?? feature.references?.references?.[0];
        if(typeof plane==="string" || plane?.id && !plane.normal) {
          const id=typeof plane==="string"?plane:plane.id;plane=(def.references || []).find((reference)=>reference.id===id);
          if(!plane)throw new Error("Mirror plane is unavailable: " + id);
        }
        result=await mirrorBrep(source,{...effectiveParams,plane});
      }
      else if (feature.type === "assembly") {
        result=await compoundBrep((feature.inputs || []).map((id)=>results.get(id)).filter((entry)=>entry?.shape));
      }
      else if (feature.type === "fillet") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Fillet input is unavailable");
        const edgePersistentIds = resolvedSubshapeIds(topologyRun.resolutions, "edge");
        const facePersistentIds = effectiveParams.fullRound ? topologyRun.resolutions.filter(entry=>entry.reference?.kind==="face" || entry.topology?.kind==="face").map(entry=>entry.topology.persistentId) : resolvedSubshapeIds(topologyRun.resolutions, "face");
        result = await filletBrep(source, effectiveParams.radius, {
          edgePersistentIds,
          facePersistentIds,
          propagation: effectiveParams.propagation,
          section: effectiveParams.section,
          continuity: effectiveParams.continuity,
          fullRound: effectiveParams.fullRound,
          variableRadius: effectiveParams.variableRadius,
          endRadius: effectiveParams.endRadius,
          edgeRadii: effectiveParams.edgeRadii,
        });
      }
      else if (feature.type === "chamfer") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Chamfer input is unavailable");
        const edgePersistentIds = resolvedSubshapeIds(topologyRun.resolutions, "edge");
        const facePersistentIds = resolvedSubshapeIds(topologyRun.resolutions, "face");
        result = await chamferBrep(source, effectiveParams.distance, {
          edgePersistentIds,
          facePersistentIds,
          mode: effectiveParams.mode,
          secondDistance: effectiveParams.secondDistance,
          angle: effectiveParams.angle,
          flip: effectiveParams.flip,
        });
      }
      else if (feature.type === "shell") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Shell input is unavailable");
        const facePersistentIds = resolvedSubshapeIds(topologyRun.resolutions, "face");
        result = await shellBrep(source, effectiveParams.thickness, {
          facePersistentIds,
          direction: effectiveParams.direction,
          tolerance: effectiveParams.tolerance,
          join: effectiveParams.join,
        });
      }
      else if (feature.type === "splitBody") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Split input is unavailable");
        result = await splitBrep(source, effectiveParams);
      }
      else if (feature.type === "moveBody") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Move body input is unavailable");
        result = await moveBodyBrep(source, effectiveParams);
        effectiveParams={...effectiveParams,placement:result.placement};
      }
      else if (feature.type === "rib") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Rib input is unavailable");
        result = await ribBrep(source, effectiveParams);
      }
      else if (feature.type === "thicken") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Thicken input is unavailable");
        result = await thickenBrep(source, effectiveParams.thickness, {
          facePersistentIds: resolvedSubshapeIds(topologyRun.resolutions, "face"),
          direction: effectiveParams.direction,
        });
      }
      else if (feature.type === "dome") {
        const source=results.get(feature.inputs[0]);
        result=await domeBrep(source,effectiveParams.height,{facePersistentIds:resolvedSubshapeIds(topologyRun.resolutions,"face")});
      }
      else if (feature.type === "draft") {
        const source = results.get(feature.inputs[0]);
        if (!source?.shape) throw new Error("Draft input is unavailable");
        /* The neutral face is a topology reference in params, so the resolver
           rebinds it with the rest; it is split back out here so it pivots the
           draft instead of being drafted. */
        const neutralRef = effectiveParams.neutralFace, neutralHit = neutralRef ? topologyRun.resolutions.find((entry) => entry.reference === neutralRef || (neutralRef.persistentId && entry.reference?.persistentId === neutralRef.persistentId)) : null;
        if (neutralRef && !neutralHit?.topology) throw new Error("Draft neutral plane face is unavailable");
        const neutralFaceId = neutralHit?.topology?.persistentId || null;
        result = await draftBrep(source, effectiveParams.angle, {
          neutralFaceId,
          facePersistentIds: resolvedSubshapeIds(topologyRun.resolutions.filter((entry) => entry !== neutralHit), "face"),
          pullAxis: effectiveParams.pullAxis,
          pullDirection: effectiveParams.pullDirection,
          neutral: effectiveParams.neutral,
          neutralOffset: effectiveParams.neutralOffset,
        });
      }
      else if (feature.type === "boolean" || ["union", "subtract", "intersect"].includes(feature.type)) {
        const operation = feature.type === "boolean" ? effectiveParams.operation || "union" : feature.type;
        if (!["union", "subtract", "intersect"].includes(operation)) throw new Error("Unsupported Boolean operation: " + operation);
        const left = results.get(feature.inputs[0]), right = results.get(feature.inputs[1]);
        if (!left || !right) throw new Error("Boolean input is unavailable");
        result = await booleanBrep(operation, left, right);
      } else if (feature.type === "sketch") {
        result = { kind: "sketch", sketchId: effectiveParams.sketchId || "main" };
      } else {
        throw new Error("Unsupported feature type: " + feature.type);
      }
      const inputResults = (feature.inputs || []).map((id) => results.get(id)).filter(Boolean);
      result.topology = topologyForFeature(feature, effectiveParams, inputResults) || [];
      if (result.shape) result.topology = extractBrepTopology(result, {
        ownerFeatureId: feature.id,
        // Preserve the last verified exact names before assigning lightweight
        // analytic names.  Generated fillet/offset edges do not exist in the
        // lightweight topology and must get first choice of the raw subshapes.
        expectedTopology: (topologyHints.get(feature.id) || []).concat(result.topology),
      }).topology || [];
      (result.topology || []).forEach((item) => {
        if (!topology.byPersistentId.has(item.persistentId)) topology.list.push(item);
        topology.byPersistentId.set(item.persistentId, item);
      });
      results.set(feature.id, result);
      if (result.invalid) issues.push({ feature: feature.id, severity: "warning", code: "invalid-solid", message: String(result.invalid) });
      if (result.approximate) issues.push({ feature: feature.id, severity: "warning", code: "approximate-shell", message: String(result.approximate) });
      if (result.looseTolerance) issues.push({ feature: feature.id, severity: "warning", code: "loose-shell-tolerance", message: "Shell is exact but its edges are " + Number(result.looseTolerance).toFixed(4) + " cm loose; export checks will block it until that is under 0.001 cm" });
      feature.error = null;
      feature.regeneratedAt = Date.now();
    } catch (error) {
      if (result?.shape && !Array.from(results.values()).some(prior => prior.shape === result.shape)) disposeBrep(result);
      feature.error = String(error?.message || error);
      issues.push({ feature: feature.id, code: "regeneration-failed", message: feature.error });
      continue; // Consumers fail explicitly; independent branches still rebuild.
    }
  }
  const last = Array.from(results.values()).reverse().find((r) => r?.shape) || null;
  const lookup = (ref) => {
    if (!ref) return null;
    const topology = results.get(ref.ownerFeatureId)?.topology || [];
    return topology.find((item) => item.persistentId === ref.persistentId)
      || (ref.semantic ? topology.find((item) => item.kind === (ref.kind || "edge") && item.semantic === ref.semantic) : null)
      || vertexEntriesFrom(topology).find((item) => item.persistentId === ref.persistentId);
  };
  const helixUpdates = (executionDef.referenceGeometry || []).filter((r) => r.featureId && results.has(r.featureId));
  const planeDisplays = [];
  for (const plane of executionDef.references || []) {
    if (!plane?.id || (!plane.baseReferenceId && !plane.support && !isThroughVertexPlane(plane))) continue;
    try {
      const moved = resolveOffsetSketch({ id: "_display", referenceId: plane.id }, executionDef.references, lookup);
      if (!moved?.frame) continue;
      const display = { id: plane.id, origin: moved.frame.origin, normal: moved.frame.normal };
      if (plane.offset != null && Number.isFinite(Number(plane.offset))) display.offset = Number(plane.offset);
      planeDisplays.push(display);
      const geometry = (executionDef.referenceGeometry || []).find((item) => item.id === plane.id);
      if (geometry) Object.assign(geometry, display);
    } catch (_) {}
  }
  return { ok: !issues.some((issue) => issue.severity === "error" || issue.code === "regeneration-failed"), results, finalShape: last, topology: topology.list, topologyBindings, resolvedExtrusions, boundaryUpdates, referenceUpdates: helixUpdates.concat(planeDisplays), issues };
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
  const holes = Array.isArray(params.holeProfileEntityIds) && params.holeProfileEntityIds.length
    ? params.holeProfileEntityIds.map(ids=>{const loop=resolveProfilePoints(sketch,ids);if(!loop)throw new Error("Inner profile is missing or open");return loop;}) : params.holes;
  return withProfileSegments({ ...params, points, holes }, sketch, params.profileEntityIds);
}

/* The sampled points are what the mesh draws; the typed segments are what the
   sketch actually drew. Handing both down lets the exact kernel build a real
   cylinder where the mesh shows tangent chords — without them the two sides
   disagree about how many faces a round wall has. A sketch we cannot describe
   exactly just keeps the points. */
function withProfileSegments(params, sketch, entityIds) {
  const segments = sketchProfileSegments(sketch, entityIds);
  const holeIds = Array.isArray(params.holeProfileEntityIds) ? params.holeProfileEntityIds : null;
  const holes = holeIds && Array.isArray(params.holes)
    ? params.holes.map((hole, index) => {
      const inner = sketchProfileSegments(sketch, holeIds[index]);
      if (!inner) return hole;
      return { points: Array.isArray(hole) ? hole : hole?.points || hole?.loop || [], segments: inner };
    })
    : params.holes;
  const next = segments ? { ...params, segments } : params;
  return holes === params.holes ? next : { ...next, holes };
}

export function resolveSketchProfile(def,params) {
  if (!params?.profileEntityIds?.length) return params;
  const sketches=Array.isArray(def.sketches)?def.sketches:[],sketch=(params.sketchId&&sketches.find((item)=>item.id===params.sketchId))||def.sketch||sketches[0];
  if(!sketch)throw new Error("Feature profile is missing its sketch");
  const thin=params.thinFeature ? revolveThinProfile(sketch,params.profileEntityIds,params.thickness,params.thinMode,params.axis) : null;
  const points=thin?.points || resolveProfilePoints(sketch,params.profileEntityIds);
  if(!points)throw new Error("Feature profile is missing, open or unsupported");
  if(params.useSketchPlane){
    const origin=sketchWorldPoint(sketch,0,0),u=sketchWorldPoint(sketch,1,0),v=sketchWorldPoint(sketch,0,1);
    const xAxis={x:u.x-origin.x,y:u.y-origin.y,z:u.z-origin.z},yAxis={x:v.x-origin.x,y:v.y-origin.y,z:v.z-origin.z};
    params={...params,radialProfile:false,profileFrame:{origin,xAxis,yAxis,normal:{x:xAxis.y*yAxis.z-xAxis.z*yAxis.y,y:xAxis.z*yAxis.x-xAxis.x*yAxis.z,z:xAxis.x*yAxis.y-xAxis.y*yAxis.x}}};
  }
  return thin ? {...params,points,segments:thin.segments} : withProfileSegments({...params,points},sketch,params.profileEntityIds);
}

export function alignExtrusionToSupport(params, resolutions = []) {
  if (!params?.support) return params;
  const resolution = resolutions.find((entry) => entry.reference === params.support)
    || resolutions.find((entry) => entry.reference?.persistentId === params.support.persistentId && entry.reference?.ownerFeatureId === params.support.ownerFeatureId);
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

function hostFaceShape(host, face) {
  if (!host || !face) return null;
  const id = face.persistentId;
  if (id) {
    const direct = resolveBrepSubshape(host, id, "face");
    if (direct) return direct;
  }
  if (!host.subshapes) return null;
  for (const [persistentId, entry] of host.subshapes) {
    if (entry.kind !== "face") continue;
    if (id && persistentId === id) return entry.shape;
    if (face.semantic && entry.descriptor?.semantic === face.semantic) return entry.shape;
  }
  return null;
}

function pickNextHostFace(host, params) {
  if (!host?.subshapes) return null;
  const reverse = params.direction === "reverse" ? -1 : 1;
  const from = Number.isFinite(Number(params.from)) ? Number(params.from) : (Number(params.offset) || 0);
  const axis = extrusionAxisVector(params);
  const pull = { x: axis.x * reverse, y: axis.y * reverse, z: axis.z * reverse };
  const samples = profileBoundarySamples(params);
  let best = null;
  for (const [persistentId, entry] of host.subshapes) {
    if (entry.kind !== "face" || !entry.shape) continue;
    let nearest = Infinity;
    let missed = false;
    for (const sample of samples) {
      const origin = extrusionMapPoint(params, sample.u, sample.v, from);
      const hit = rayHitsBrepFace(host.oc, origin, pull, entry.shape);
      if (!(hit > 1e-4)) { missed = true; break; }
      if (hit < nearest) nearest = hit;
    }
    if (missed) continue;
    if (!best || nearest < best.distance) best = { shape: entry.shape, persistentId, distance: nearest };
  }
  return best;
}

function firstBrepFaceHit(host, params, faceShape) {
  if (!host?.oc || !faceShape) return null;
  const reverse = params.direction === "reverse" ? -1 : 1;
  const from = Number.isFinite(Number(params.from)) ? Number(params.from) : (Number(params.offset) || 0);
  const axis = extrusionAxisVector(params);
  const pull = { x: axis.x * reverse, y: axis.y * reverse, z: axis.z * reverse };
  let best = Infinity;
  for (const sample of profileBoundarySamples(params)) {
    const origin = extrusionMapPoint(params, sample.u, sample.v, from);
    const hit = rayHitsExtendedBrepFace(host.oc, origin, pull, faceShape);
    if (hit > 1e-4 && hit < best) best = hit;
  }
  return Number.isFinite(best) ? best : null;
}

function alignExtrusionEndCondition(feature, params, resolutions, results) {
  const hostId = params.targetFeatureId || feature.inputs?.[0];
  const host = hostId && hostId !== feature.id ? results.get(hostId) : null;
  const hostFaces = host?.topology || [];
  const hostBounds = aabbFromTopology(hostFaces);
  const options = {
    endFace: resolvedEndFace(params, resolutions),
    hostFaces,
    hostBounds,
    resolutions,
  };
  const condition = params.endCondition || "blind";
  if (!isUpToFace(condition) && condition !== "up-to-next") {
    return resolveExtrudeExtent(params, options);
  }
  const through = resolveExtrudeExtent({ ...params, endCondition: "through-all" }, options);
  const untilDepth = Number(through.to) - Number(through.from);
  const reverse = params.direction === "reverse" ? -1 : 1;
  const from = Number.isFinite(Number(params.from)) ? Number(params.from) : (Number(params.offset) || 0);
  let untilFace = null;
  let display;
  if (isUpToFace(condition)) {
    const face = options.endFace;
    if (!face) throw new Error(UP_TO_FACE_MISSING);
    untilFace = hostFaceShape(host, face);
    if (!untilFace) throw new Error(UP_TO_FACE_MISSING);
    const distance = firstBrepFaceHit(host, params, untilFace);
    if (!(distance > 1e-4)) throw new Error(UP_TO_FACE_MISSED);
    display = { ...params, from, to: from + reverse * distance, endCondition: condition, endFace: params.endFace };
  } else {
    try {
      display = resolveExtrudeExtent(params, options);
    } catch (error) {
      if (!host?.shape) throw error;
      display = { ...through, endCondition: condition };
    }
    const picked = pickNextHostFace(host, display);
    if (!picked) throw new Error(UP_TO_NEXT_MISSED);
    untilFace = picked.shape;
  }
  return { ...display, untilFace, untilDepth: Number.isFinite(untilDepth) ? untilDepth : undefined };
}
