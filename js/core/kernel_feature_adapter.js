// Integration boundary between authoring intent and the existing exact kernel
// feature executor.  No UI module should translate gestures directly into
// OpenCascade calls; it produces canonical features and this adapter lowers
// them into the small operation vocabulary the kernel already understands.

import { cloneDomain } from "./schema.js";
import { analyzeParametricHistory, ensureParametricDocument, historyEntryRolled } from "./parametric_document.js";
import { circularPatternStepDegrees, linearPatternOffsets, parseSkippedPatternInstances } from "./pattern_geometry.js";
import { holeWizardSolids } from "../cad_hole_wizard.js";

function idOf(reference) {
  return typeof reference === "string" ? reference : reference?.id || reference?.persistentId || null;
}

function sketchInput(feature) {
  return (feature.references?.sketches || []).map(idOf).find(Boolean) || feature.params?.sketchId || null;
}

function topologyReferences(feature) {
  return cloneDomain(feature.references?.topology || []);
}

function lowerExtrudeParams(feature, document) {
  const sketchId = sketchInput(feature);
  const sketch = (document.sketches || []).find((item) => item.id === sketchId);
  const depth = Number(feature.params?.depth) || 0;
  const offset = Number(feature.params?.offset) || 0;
  const reverse = feature.params?.direction === "reverse" ? -1 : 1;
  const symmetric = !!feature.params?.symmetric || feature.params?.endCondition === "mid-plane";
  const from = symmetric ? offset - depth / 2 : offset;
  const to = symmetric ? offset + depth / 2 : offset + reverse * depth;
  const params = {
    ...cloneDomain(feature.params),
    sketchId,
    profileEntityIds: cloneDomain(feature.params?.profileEntityIds || feature.references?.profileEntityIds || []),
    axis: feature.params?.axis || (sketch?.plane === "front" ? "z" : sketch?.plane === "side" ? "x" : "y"),
    from,
    to,
  };
  if (sketch?.frame) { params.axis = "frame"; params.frame = cloneDomain(sketch.frame); }
  if (sketch?.support) { params.support = cloneDomain(sketch.support); params.baseOffset = offset; params.depth = depth; }
  return params;
}

function loweredFeature(feature, document) {
  const base = { id: feature.id, name: feature.name, suppressed: !!feature.suppressed, inputs: cloneDomain(feature.inputs || []), references: topologyReferences(feature) };
  if (feature.type === "extrude") return [{ ...base, type: "extrude", params: lowerExtrudeParams(feature, document) }];
  if (feature.type === "extrudeCut" || feature.type === "hole") {
    const target = feature.inputs?.[0] || idOf(feature.references?.features?.[0]);
    if (feature.type === "hole") return lowerHoleFeature(feature, document, base, target);
    const holeParams = lowerExtrudeParams(feature, document);
    const toolId = feature.id + ":tool";
    return [
      { id: toolId, name: feature.name + " tool", type: "extrude", params: holeParams, inputs: [], references: topologyReferences(feature), suppressed: !!feature.suppressed },
      { ...base, type: "subtract", params: {}, inputs: [target, toolId].filter(Boolean) },
    ];
  }
  if (feature.type === "revolve") return [{ ...base, type: "revolve", params: { ...cloneDomain(feature.params), sketchId: sketchInput(feature), profileEntityIds: cloneDomain(feature.params?.profileEntityIds || feature.references?.profileEntityIds || []) } }];
  if (feature.type === "sweep" || feature.type === "loft") return [{ ...base, type: feature.type, params: cloneDomain(feature.params) }];
  if (["fillet", "chamfer", "shell"].includes(feature.type)) return [{ ...base, type: feature.type, params: cloneDomain(feature.params) }];
  if (feature.type === "pattern") {
    const mode = feature.params?.mode === "circular" ? "circularPattern" : "linearPattern";
    const count = Math.max(2, Math.round(Number(feature.params?.count) || 2));
    if (mode === "circularPattern") return [{ ...base, type:mode, params:{ count, angle:circularPatternStepDegrees(feature.params, count), axis:feature.params.axis || "y", radialDistance:Number(feature.params?.radialDistance)||0, skipIndices:[...parseSkippedPatternInstances(feature.params?.skipInstances)] } }];
    const offsets=linearPatternOffsets(feature.params,count).map(({x,y,z})=>({x,y,z}));
    return [{...base,type:"linearGridPattern",params:{offsets}}];
  }
  if (feature.type === "mirror") return [{ ...base, type: "mirror", params: { ...cloneDomain(feature.params), plane: cloneDomain(feature.references?.references?.[0]) } }];
  if (feature.type === "boolean") return [{ ...base, type: feature.params?.operation || "union", params: { keepTools: !!feature.params?.keepTools, tolerance: feature.params?.tolerance } }];
  if (["helix", "thread", "knurl", "insert"].includes(feature.type)) {
    return [{ ...base, type: feature.type, params: cloneDomain(feature.params) }];
  }
  // Import and legacy analytic features are accepted only through migration;
  // they remain explicit in the compiled tree and never become UI primitives.
  return [{ ...base, type: feature.type, params: cloneDomain(feature.params) }];
}

function lowerHoleFeature(feature, document, base, target) {
  const sketchParams = lowerExtrudeParams(feature, document);
  const wizard = holeWizardSolids(feature.params || {});
  const holeParams = {
    ...sketchParams,
    diameter: wizard.hole.diameter,
    endCondition: wizard.hole.endCondition || feature.params?.endCondition || "blind",
    holeType: wizard.hole.holeType,
    callout: feature.params?.callout,
  };
  if (wizard.solids.length <= 1) {
    const toolId = feature.id + ":tool";
    return [
      { id: toolId, name: feature.name + " tool", type: "extrude", params: holeParams, inputs: [], references: topologyReferences(feature), suppressed: !!feature.suppressed },
      { ...base, type: "subtract", params: {}, inputs: [target, toolId].filter(Boolean) },
    ];
  }
  const compiled = [];
  let lastId = target;
  wizard.solids.forEach((solid, index) => {
    const toolId = feature.id + ":tool:" + solid.role;
    const isLast = index === wizard.solids.length - 1;
    compiled.push({
      id: toolId,
      name: feature.name + " " + solid.role,
      type: solid.kind === "cone" ? "cone" : "extrude",
      params: {
        ...holeParams,
        diameter: solid.diameter || solid.diameter1,
        diameter2: solid.diameter2,
        depth: solid.depth,
        endCondition: solid.endCondition,
        from: sketchParams.from,
        to: (sketchParams.from || 0) + (solid.depth || holeParams.depth || 0) * (feature.params?.direction === "reverse" ? -1 : 1),
      },
      inputs: [],
      references: topologyReferences(feature),
      suppressed: !!feature.suppressed,
    });
    compiled.push({
      id: isLast ? feature.id : feature.id + ":cut:" + solid.role,
      name: isLast ? feature.name : feature.name + " " + solid.role + " cut",
      type: "subtract",
      params: {},
      inputs: [lastId, toolId].filter(Boolean),
      references: topologyReferences(feature),
      suppressed: !!feature.suppressed,
    });
    lastId = isLast ? feature.id : feature.id + ":cut:" + solid.role;
  });
  return compiled;
}

export function compileKernelFeatureTree(source) {
  const document = ensureParametricDocument(cloneDomain(source));
  const analysis = analyzeParametricHistory(document);
  const featuresById = new Map((document.features || []).map((feature) => [feature.id, feature]));
  const sketchesById = new Map((document.sketches || []).map((sketch) => [sketch.id, sketch]));
  const compiled = [];
  (document.history || []).forEach((entry, index) => {
    if (entry.suppressed || historyEntryRolled(document, index)) return;
    if (entry.kind === "sketch") {
      const sketch = sketchesById.get(entry.targetId);
      if (sketch) compiled.push({ id: "feature:sketch:" + sketch.id, name: sketch.name, type: "sketch", params: { sketchId: sketch.id }, inputs: [], suppressed: !!sketch.suppressed });
      return;
    }
    const feature = featuresById.get(entry.targetId);
    if (feature) compiled.push(...loweredFeature(feature, document));
  });
  return { ok: analysis.ok, document, features: compiled, issues: analysis.issues };
}
