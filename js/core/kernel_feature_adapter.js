import {resolveOffsetPlanes} from './offset_planes.js';
import { revolveRecipe } from "./revolve_geometry.js";
// Integration boundary between authoring intent and the existing exact kernel
// feature executor.  No UI module should translate gestures directly into
// OpenCascade calls; it produces canonical features and this adapter lowers
// them into the small operation vocabulary the kernel already understands.

import { cloneDomain } from "./schema.js";
import { analyzeParametricHistory, ensureParametricDocument, historyEntryRolled } from "./parametric_document.js";
import { circularPatternStepDegrees, curvePatternPlacements, linearPatternOffsets, parseSkippedPatternInstances } from "./pattern_geometry.js";
import { holeWizardSolids } from "../cad_hole_wizard.js";
import { generateToolboxPart } from "../toolbox/generate.js";

export const FEATURE_PATTERN_SEED_TYPES = ["extrudeCut", "revolveCut", "sweepCut", "hole", "extrude", "revolve", "rib"];

function idOf(reference) {
  return typeof reference === "string" ? reference : reference?.id || reference?.persistentId || null;
}

function sketchInput(feature) {
  return (feature.references?.sketches || []).map(idOf).find(Boolean) || feature.params?.sketchId || null;
}

function topologyReferences(feature) {
  return cloneDomain(feature.references?.topology || []);
}

function toolboxPrimitive(part, id, name) {
  const base = { id, name: name || part.name || "Toolbox solid", inputs: [], references: [], suppressed: false };
  if (part.kind === "cyl") {
    if (Number.isFinite(part.r2) && Math.abs(part.r2 - part.r) > 1e-9) {
      const x=Number(part.x)||0,y=Number(part.y)||0,z=Number(part.z)||0,r1=Math.max(1e-7,Number(part.r)||0),r2=Math.max(1e-7,Number(part.r2)||0),h=Number(part.h)||0;
      if (Math.abs(x)<1e-12 && Math.abs(z)<1e-12) return { ...base, type:"revolve", params:{ angle:360, points:[{u:r1,v:y},{u:r2,v:y+h},{u:0,v:y+h},{u:0,v:y}] } };
      const ring=(radius,height)=>Array.from({length:32},(_,index)=>{const angle=index*Math.PI/16;return{x:x+Math.cos(angle)*radius,y:height,z:z+Math.sin(angle)*radius};});
      return { ...base, type:"loft", params:{ sections:[ring(r1,y),ring(r2,y+h)],solid:true,ruled:true,matchProfiles:true } };
    }
    return { ...base, type: "cylinder", params: { x:part.x, y:part.y, z:part.z, r:part.r, h:part.h } };
  }
  if (part.kind === "ext") return { ...base, type: "extrude", params: { axis:part.axis || "y", from:part.from, to:part.to, points:cloneDomain(part.pts || []), holes:cloneDomain(part.holes || []) } };
  if (part.kind === "rev") return { ...base, type: "revolve", params: revolveRecipe(part) };
  if (part.kind === "box") return { ...base, type: "box", params: { x:Math.min(part.x0,part.x1), y:Math.min(part.y0,part.y1), z:Math.min(part.z0,part.z1), w:Math.abs(part.x1-part.x0), h:Math.abs(part.y1-part.y0), d:Math.abs(part.z1-part.z0) } };
  return null;
}

export function lowerToolboxFeature(feature) {
  // LOD is a viewport concern.  Exact BREP generation always consumes the
  // complete recipe, otherwise changing display quality changes STEP output.
  const generated = generateToolboxPart({ ...cloneDomain(feature.params || {}), groupId:feature.params?.groupId || feature.id, lod:2 });
  if (!generated?.ok) throw new Error(generated?.message || "Toolbox part could not be generated");
  const solids = [], cutters = [];
  (generated.parts || []).forEach((part, index) => {
    const primitive = toolboxPrimitive(part, feature.id + ":part:" + index, part.name);
    if (!primitive) throw new Error("Unsupported Toolbox primitive: " + part.kind);
    (part.previewOnly ? cutters : solids).push(primitive);
  });
  if (!solids.length) throw new Error("Toolbox feature generated no solid");
  const compiled = [...solids, ...cutters];
  let current = solids[0].id;
  solids.slice(1).forEach((solid, index) => {
    const finalUnion = index === solids.length - 2 && cutters.length === 0;
    const id = finalUnion ? feature.id : feature.id + ":union:" + index;
    compiled.push({ id, name:feature.name, type:"union", params:{}, inputs:[current,solid.id], references:[], suppressed:false });
    current = id;
  });
  cutters.forEach((cutter, index) => {
    const id = index === cutters.length - 1 ? feature.id : feature.id + ":cut:" + index;
    compiled.push({ id, name:feature.name, type:"subtract", params:{}, inputs:[current,cutter.id], references:[], suppressed:false });
    current = id;
  });
  if (current !== feature.id) {
    const source = compiled.find((item) => item.id === current);
    source.id = feature.id;
  }
  const final = compiled.find((item) => item.id === feature.id);
  if (final) final.metadata = { toolbox:cloneDomain(generated.metadata), sourceOptions:cloneDomain(generated.sourceOptions) };
  return compiled;
}

function lowerExtrudeParams(feature, document) {
  const sketchId = sketchInput(feature);
  const sketch = (document.sketches || []).find((item) => item.id === sketchId);
  const depth = Number(feature.params?.depth) || 0;
  const offset = Number(feature.params?.offset) || 0;
  const reverse = feature.params?.direction === "reverse" ? -1 : 1;
  const symmetric = !!feature.params?.symmetric || feature.params?.endCondition === "mid-plane";
  const storedFrom = Number(feature.params?.from);
  const storedTo = Number(feature.params?.to);
  const hasStoredSpan = Number.isFinite(storedFrom) && Number.isFinite(storedTo) && Math.abs(storedTo - storedFrom) > 1e-9;
  const from = hasStoredSpan ? storedFrom : (symmetric ? offset - depth / 2 : offset);
  const to = hasStoredSpan ? storedTo : (symmetric ? offset + depth / 2 : offset + reverse * depth);
  const target = feature.inputs?.[0] || idOf(feature.references?.features?.[0]);
  const params = {
    ...cloneDomain(feature.params),
    sketchId,
    profileEntityIds: cloneDomain(feature.params?.profileEntityIds || feature.references?.profileEntityIds || []),
    axis: feature.params?.axis || (sketch?.plane === "front" ? "z" : sketch?.plane === "side" ? "x" : "y"),
    from,
    to,
  };
  if (target) params.targetFeatureId = target;
  if (sketch?.frame) { params.axis = "frame"; params.frame = cloneDomain(sketch.frame); }
  if (sketch?.support) { params.support = cloneDomain(sketch.support); params.baseOffset = offset; params.depth = depth || Math.abs(to - from); }
  return params;
}

function revolveToolParams(feature) {
  return {
    ...cloneDomain(feature.params),
    sketchId: sketchInput(feature),
    profileEntityIds: cloneDomain(feature.params?.profileEntityIds || feature.references?.profileEntityIds || []),
  };
}

function loweredFeature(feature, document) {
  const base = { id: feature.id, name: feature.name, suppressed: !!feature.suppressed, inputs: cloneDomain(feature.inputs || []), references: topologyReferences(feature) };
  if (feature.type === "extrude") {
    const params = lowerExtrudeParams(feature, document);
    const target = feature.inputs?.[0];
    if (target && params.mergeResult !== false && params.operation !== "new-body") {
      const toolId = feature.id + ":tool";
      return [
        { ...base, id: toolId, type: "extrude", inputs: [], params },
        { ...base, type: "union", inputs: [target, toolId], params: {} },
      ];
    }
    return [{ ...base, type: "extrude", params }];
  }
  if (feature.type === "extrudeCut" || feature.type === "hole") {
    const target = feature.inputs?.[0] || idOf(feature.references?.features?.[0]);
    if (feature.type === "hole") return lowerHoleFeature(feature, document, base, target);
    const holeParams = lowerExtrudeParams(feature, document);
    const toolId = feature.id + ":tool";
    return [
      { id: toolId, name: feature.name + " tool", type: "extrude", params: holeParams, inputs: target ? [target] : [], references: topologyReferences(feature), suppressed: !!feature.suppressed },
      { ...base, type: "subtract", params: {}, inputs: [target, toolId].filter(Boolean) },
    ];
  }
  if (feature.type === "revolve") {
    const params=revolveToolParams(feature),target=feature.inputs?.[0];
    if(target && params.mergeResult!==false && params.operation!=="new-body"){
      const toolId=feature.id+":tool";
      return [{...base,id:toolId,type:"revolve",inputs:[],params},{...base,type:"union",inputs:[target,toolId],params:{}}];
    }
    return [{...base,type:"revolve",params}];
  }
  if (feature.type === "sweep" || feature.type === "loft") {
    const params=cloneDomain(feature.params);
    if(feature.type==="loft" && !params.sketchSources && feature.references?.sketches?.length>=2)params.sketchSources={kind:"loft",sections:feature.references.sketches.map(sketchId=>({sketchId,entityIds:(document.sketches.find(s=>s.id===sketchId)?.entities || []).filter(e=>!e.construction).map(e=>e.id)}))};
    if(feature.inputs?.[0] && params.mergeResult!==false && params.operation!=="new-body"){
      const toolId=feature.id+":tool";return [{...base,id:toolId,type:feature.type,inputs:[],params},{...base,type:"union",inputs:[feature.inputs[0],toolId],params:{}}];
    }
    return [{ ...base, type: feature.type, params }];
  }
  /* The subtractive twins. One revolve implementation and one sweep
     implementation, each followed by a subtract — the shape of extrudeCut
     above, which is why neither re-states how a profile becomes a solid. */
  if (feature.type === "revolveCut" || feature.type === "sweepCut") {
    const target = feature.inputs?.[0] || idOf(feature.references?.features?.[0]);
    const toolId = feature.id + ":tool";
    const toolType = feature.type === "revolveCut" ? "revolve" : "sweep";
    return [
      { id: toolId, name: feature.name + " tool", type: toolType, params: toolType === "revolve" ? revolveToolParams(feature) : cloneDomain(feature.params), inputs: [], references: topologyReferences(feature), suppressed: !!feature.suppressed },
      { ...base, type: "subtract", params: {}, inputs: [target, toolId].filter(Boolean) },
    ];
  }
  if (feature.type === "rib") {
    const sketchId = sketchInput(feature);
    const sketch = (document.sketches || []).find((item) => item.id === sketchId);
    const params = cloneDomain(feature.params);
    if (sketch?.frame) { params.axis = "frame"; params.frame = cloneDomain(sketch.frame); params.sketchId = sketchId; }
    return [{ ...base, type: "rib", params }];
  }
  if (["fillet", "chamfer", "shell", "dome", "draft"].includes(feature.type)) return [{ ...base, type: feature.type, params: cloneDomain(feature.params) }];
  if (feature.type === "pattern") {
    if(feature.params?.scope==="feature" || feature.params?.seedOnly){
      const seed=document.features.find(item=>item.id===feature.params.seedFeatureId);
      const subtractive=["extrudeCut","revolveCut","sweepCut","hole"].includes(seed?.type);
      if(!seed?.inputs?.[0] || (!subtractive && !FEATURE_PATTERN_SEED_TYPES.includes(seed.type)))throw new Error("Select an additive or cutting feature with a source body");
      const delta=feature.id+":delta",copies=feature.id+":instances";
      const layout=loweredFeature({...feature,id:copies,inputs:[delta],params:{...feature.params,scope:"body",seedOnly:false}},document);
      return [{...base,id:delta,type:"subtract",inputs:subtractive?[seed.inputs[0],seed.id]:[seed.id,seed.inputs[0]],params:{}},...layout,{...base,type:subtractive?"subtract":"union",inputs:[feature.inputs[0],copies],params:{}}];
    }
    /* The curve layout lowers to its own kernel op: its copies are turned as
       well as moved, and the grid op only carries offsets. */
    if (feature.params?.mode === "curve") {
      const placements = curvePatternPlacements(feature.params).map(({ matrix, translation }) => ({ matrix, translation }));
      return [{ ...base, type: "curvePattern", params: { placements } }];
    }
    const mode = feature.params?.mode === "circular" ? "circularPattern" : "linearPattern";
    const count = Math.max(2, Math.round(Number(feature.params?.count) || 2));
    if (mode === "circularPattern") return [{ ...base, type:mode, params:{ count, angle:circularPatternStepDegrees(feature.params, count), axis:feature.params.axis || "y", radialDistance:Number(feature.params?.radialDistance)||0, pivot:cloneDomain(feature.params.pivot??feature.params.origin), skipIndices:[...parseSkippedPatternInstances(feature.params?.skipInstances)] } }];
    const offsets=linearPatternOffsets(feature.params,count).map(({x,y,z})=>({x,y,z}));
    return [{...base,type:"linearGridPattern",params:{offsets}}];
  }
  if (feature.type === "mirror") return [{ ...base, type: "mirror", params: { ...cloneDomain(feature.params), plane: cloneDomain(feature.params?.plane ?? feature.params?.planeReference ?? feature.references?.plane ?? feature.references?.references?.[0]) } }];
  if (feature.type === "boolean") return [{ ...base, type: feature.params?.operation || "union", params: { keepTools: !!feature.params?.keepTools, tolerance: feature.params?.tolerance } }];
  if (feature.type === "toolbox") return lowerToolboxFeature(feature);
  if (["helix", "thread", "knurl", "insert"].includes(feature.type)) {
    return [{ ...base, type: feature.type, params: cloneDomain(feature.params) }];
  }
  // Import and legacy analytic features are accepted only through migration;
  // they remain explicit in the compiled tree and never become UI primitives.
  return [{ ...base, type: feature.type, params: cloneDomain(feature.params) }];
}

function lowerHoleFeature(feature, document, base, target) {
  if(!target)throw new Error("Hole requires a target body");
  const sketchParams=lowerExtrudeParams(feature,document),wizard=holeWizardSolids(feature.params||{});
  const compiled=[];let lastId=target;
  wizard.solids.forEach((solid,index)=>{
    const suffix=wizard.solids.length===1?"":":"+solid.role;
    const toolId=feature.id+":tool"+suffix,last=index===wizard.solids.length-1;
    compiled.push({id:toolId,name:(feature.name||"Hole")+" "+solid.role,type:"holeTool",inputs:[target],references:topologyReferences(feature),suppressed:!!feature.suppressed,
      params:{...sketchParams,...solid,diameter:solid.diameter||solid.diameter1,targetFeatureId:target,requireIntersection:true}});
    const id=last?feature.id:feature.id+":cut:"+solid.role;
    compiled.push({...base,id,type:"subtract",params:{},inputs:[lastId,toolId]});lastId=id;
  });
  return compiled;
}

export function compileKernelFeatureTree(source) {
  const document = ensureParametricDocument(cloneDomain(source));
  const planeRun=resolveOffsetPlanes(document);
  const analysis = analyzeParametricHistory(document);
  const featuresById = new Map((document.features || []).map((feature) => [feature.id, feature]));
  const sketchesById = new Map((document.sketches || []).map((sketch) => [sketch.id, sketch]));
  const compiled = [], issues = [...planeRun.issues,...analysis.issues];
  (document.history || []).forEach((entry, index) => {
    if (entry.suppressed || historyEntryRolled(document, index)) return;
    if (entry.kind === "sketch") {
      const sketch = sketchesById.get(entry.targetId);
      if (sketch) compiled.push({ id: "feature:sketch:" + sketch.id, name: sketch.name, type: "sketch", params: { sketchId: sketch.id }, inputs: [], suppressed: !!sketch.suppressed });
      return;
    }
    const feature = featuresById.get(entry.targetId);
    if (feature) {
      try { compiled.push(...loweredFeature(feature, document)); }
      catch (error) {
        issues.push({ severity:"error", code:"feature-lowering-failed", featureId:feature.id, message:String(error.message || error) });
      }
    }
  });
  return { ok: !issues.some((issue) => issue.severity === "error"), document, features: compiled, issues };
}
