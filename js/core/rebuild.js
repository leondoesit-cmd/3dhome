import { cylinderBounds } from "./cylinder_axis.js";
import { materializeCabinetDefinition } from "./cabinet_definition.js";
import { evaluateExpression, resolveEquations } from "../sketch_equations.js";
import { resolveProfilePoints, solveSketch } from "../sketch_solver.js";
import { buildDependencyGraph, featureDependencies, stableStringify } from "./dependency_graph.js";
import { validateDefinition } from "./schema.js";
import { realignFrame } from "./frame.js";
import { supportsSurfaceUV } from "./surface_uv.js";
import {
  createTopologyRegistry,
  resolveTopologyReference,
  resolveFeatureTopologyReferences,
  topologyForFeature,
} from "./topology.js";

const SUPPORTED_FEATURES = new Set([
  "sketch", "box", "cylinder", "sphere", "extrude", "cut", "revolve", "sweep", "loft",
  "fillet", "chamfer", "shell", "dome", "draft", "thicken", "rib", "splitBody", "moveBody", "mirror", "linearPattern", "linearGridPattern", "circularPattern", "curvePattern", "pattern", "extrudeCut", "revolveCut", "sweepCut", "boolean",
  "union", "subtract", "intersect", "procedural", "direct", "import", "component", "assembly",
  "hole", "holeTool", "helix", "thread", "knurl", "insert", "cone", "toolbox",
]);

function parameterValue(parameter) {
  return parameter && typeof parameter === "object" && "value" in parameter ? parameter.value : parameter;
}

export function resolveParameters(definition, overrides = {}) {
  const parameters = definition?.parameters || {};
  const values = {};
  const issues = [];
  const visiting = new Set();
  const resolved = new Set();
  const valueOf = (name) => {
    if (resolved.has(name)) return values[name];
    const parameter = parameters[name];
    if (!parameter) return undefined;
    if (visiting.has(name)) throw new Error("Circular parameter expression: " + name);
    visiting.add(name);
    try {
    let value = Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : parameterValue(parameter);
    const expression = parameter && typeof parameter === "object" ? parameter.expression : null;
    if (!Object.prototype.hasOwnProperty.call(overrides, name) && expression) value = evaluateExpression(expression, valueOf);
    if (typeof value === "number") {
      if (Number.isFinite(parameter.min) && value < parameter.min) {
        issues.push({ severity: "error", code: "parameter-below-minimum", parameter: name, value, limit: parameter.min, message: name + " is below its minimum" });
      }
      if (Number.isFinite(parameter.max) && value > parameter.max) {
        issues.push({ severity: "error", code: "parameter-above-maximum", parameter: name, value, limit: parameter.max, message: name + " is above its maximum" });
      }
    }
    if (issues.some(issue => issue.severity === "error" && issue.parameter === name)) throw new Error("Invalid parameter: " + name);
    values[name] = value;
    resolved.add(name);
    return value;
    } finally { visiting.delete(name); }
  };
  Object.keys(parameters).forEach((name) => {
    try { valueOf(name); }
    catch (error) { issues.push({ severity: "error", code: "parameter-expression", parameter: name, message: String(error.message || error) }); }
  });
  Object.keys(overrides).forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(parameters, name))
      issues.push({ severity: "warning", code: "unknown-override", parameter: name, message: "Unknown instance override: " + name });
  });
  return { values, issues };
}

function replaceParameters(value, parameters) {
  if (Array.isArray(value)) return value.map((item) => replaceParameters(item, parameters));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value[0] === "$") {if(parameters[value.slice(1)]===undefined)throw new Error("Unavailable parameter: "+value.slice(1));return parameters[value.slice(1)];}
    return value;
  }
  const output = {};
  Object.keys(value).forEach((key) => { output[key] = replaceParameters(value[key], parameters); });
  return output;
}

export function sketchDiagnostics(definition, parameters) {
  const issues = [];
  const document = typeof structuredClone === "function" ? structuredClone(definition) : JSON.parse(JSON.stringify(definition));
  (document.sketches || []).forEach((sketch) => (sketch.constraints || []).forEach((constraint) => {
    if (!constraint.parameter) return;
    if (!Object.prototype.hasOwnProperty.call(parameters, constraint.parameter)) {
      issues.push({ severity: "error", code: "missing-sketch-parameter", sketchId: sketch.id, constraintId: constraint.id, parameter: constraint.parameter, message: (constraint.name || constraint.id) + " references missing parameter " + constraint.parameter });
      return;
    }
    constraint.value = parameters[constraint.parameter];
  }));
  try {
    const equations = resolveEquations(document);
    equations.errors.forEach((error) => {
      const sketch=(document.sketches || []).find(s=>(s.constraints || []).some(c=>c.name===error.name || c.id===error.name));
      issues.push({severity:"error",code:"sketch-equation",sketchId:sketch?.id,reference:error.name,message:error.message});
    });
  } catch (error) {
    issues.push({ severity: "error", code: "sketch-equation", message: String(error.message || error) });
  }
  (document.sketches || []).forEach((sketch) => {
    const reference = sketch.referenceId || (sketch.plane ? "plane:" + sketch.plane : null);
    const support = sketch.support && sketch.support.type === "topology-reference" ? sketch.support : null;
    if(sketch.frameSpace==="surface-uv" && (!support || !supportsSurfaceUV(sketch.surface?.descriptor || support.descriptor)))issues.push({severity:"error",code:"invalid-surface-sketch",sketchId:sketch.id,message:(sketch.name || sketch.id)+" has no supported cylindrical, conical or spherical UV surface"});
    if (support && sketch.frameSpace === "local") {
      const vectors = [sketch.frame?.origin, sketch.frame?.xAxis, sketch.frame?.yAxis, sketch.frame?.normal];
      const valid = vectors.every((vector) => vector && [vector.x, vector.y, vector.z].every(Number.isFinite));
      if (!valid) issues.push({ severity:"error", code:"invalid-sketch-frame", sketchId:sketch.id, message:(sketch.name || sketch.id) + " has an invalid local support frame" });
    }
    if (support && !(definition.features || []).some((feature) => feature.id === support.ownerFeatureId))
      issues.push({ severity: "error", code: "missing-sketch-support-feature", sketchId: sketch.id, reference: support.persistentId, message: (sketch.name || sketch.id) + " is attached to a missing feature" });
    else if (!support && reference && !(definition.references || []).some((item) => item.id === reference))
      issues.push({ severity: "error", code: "missing-sketch-reference", sketchId: sketch.id, reference, message: (sketch.name || sketch.id) + " is attached to a missing reference" });
    try {
      const result = solveSketch(sketch);
      if (result.status === "conflict" || result.ok === false)
        issues.push({ severity: "error", code: "over-constrained-sketch", sketchId: sketch.id, constraints: result.conflicts || [], message: (sketch.name || sketch.id) + " is over-constrained" });
      else {
        const dof = Number(result.degreesOfFreedom ?? result.dof);
        if (dof > 0) issues.push({
          severity: "warning", code: "under-constrained-sketch", sketchId: sketch.id, dof,
          message: (sketch.name || sketch.id) + " has " + dof + " " + (dof === 1 ? "degree" : "degrees") + " of freedom",
        });
      }
    } catch (error) {
      issues.push({ severity: "error", code: "sketch-solve-failed", sketchId: sketch.id, message: String(error.message || error) });
    }
  });
  return { issues, sketches: document.sketches || [] };
}

function alignExtrusionToResolvedSupport(params, resolutions = []) {
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

/* A sketch-driven feature stores which entities it was built from, not their
   coordinates — the whole point of a parametric profile. Topology naming needs
   the coordinates, though, so a feature whose points were never resolved named
   no faces at all: every reference to one of them ("sketch on this face",
   "extrude cut on this body") then failed to resolve, and one failure stops the
   rebuild for everything after it. That is what "Extrude / Boss 2 has a missing
   topology reference" was, on a model where nothing was actually wrong. */
function resolveProfileParams(params, sketches) {
  if (!params?.profileEntityIds?.length || (params.points || []).length >= 3) return params;
  const list = Array.isArray(sketches) ? sketches : [];
  const sketch = (params.sketchId && list.find((item) => item.id === params.sketchId)) || list[0] || null;
  const points = sketch ? resolveProfilePoints(sketch, params.profileEntityIds) : null;
  return points && points.length >= 3 ? { ...params, points } : params;
}

function featureResult(feature, parameters, previous, topologyResolutions, sketches) {
  if (!SUPPORTED_FEATURES.has(feature.type)) throw new Error("Unsupported feature type: " + feature.type);
  if (feature.type === "sketch") return { kind: "sketch", sketchId: feature.params?.sketchId || feature.sketchId };
  let params = replaceParameters(feature.params || {}, parameters);
  if (["extrude", "revolve"].includes(feature.type)) {
    const sketchId=params.sketchId || feature.sketch || (feature.inputs || []).find(id=>(sketches || []).some(s=>s.id===id));
    params = resolveProfileParams({...params,sketchId}, sketches);
  }
  if (feature.type === "extrude") params = alignExtrusionToResolvedSupport(params, topologyResolutions);
  const inputs = (feature.inputs || []).map((id) => previous.get(id)).filter(Boolean);
  const result = {
    kind: "feature",
    featureId: feature.id,
    type: feature.type,
    name: feature.name || feature.type,
    params,
    inputs,
    role: feature.role || params.role,
    metadata: feature.metadata || {},
  };
  result.topology = topologyForFeature(feature, params, inputs);
  return result;
}

/* The measured extent of an analytic primitive.
   A box is written two ways in this codebase — corner+size by the modeler's own
   projection and by the cabinet adapter, min/max corners by older documents —
   so both are read here rather than only one. Cylinders, cones and spheres were
   measured by nothing at all, which is why a document built from them fell back
   to the crude width/depth/height envelope below and the migration gate had no
   real bounds to compare. */
function primitiveBounds(type, p) {
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
  if (type === "box") {
    const x0 = number(p.x0) ?? number(p.x), y0 = number(p.y0) ?? number(p.y), z0 = number(p.z0) ?? number(p.z);
    if (x0 == null || y0 == null || z0 == null) return null;
    const x1 = number(p.x1) ?? (number(p.w ?? p.width) == null ? null : x0 + Number(p.w ?? p.width));
    const y1 = number(p.y1) ?? (number(p.h ?? p.height) == null ? null : y0 + Number(p.h ?? p.height));
    const z1 = number(p.z1) ?? (number(p.d ?? p.depth) == null ? null : z0 + Number(p.d ?? p.depth));
    if (x1 == null || y1 == null || z1 == null) return null;
    return { x0:Math.min(x0,x1), x1:Math.max(x0,x1), y0:Math.min(y0,y1), y1:Math.max(y0,y1), z0:Math.min(z0,z1), z1:Math.max(z0,z1) };
  }
  // A cone names its base radius r1 (what the exact kernel reads); everything
  // else names it r. Both spellings are accepted so one measurement serves the
  // migration's trial build, the body list and the viewport frame.
  const x = number(p.x), y = number(p.y), z = number(p.z), r = number(p.r ?? p.r1 ?? p.radius);
  if (x == null || y == null || z == null || r == null) return null;
  if (type === "sphere") return { x0:x-r, x1:x+r, y0:y-r, y1:y+r, z0:z-r, z1:z+r };
  const height = number(p.h ?? p.height);
  if (height == null) return null;
  if (p.axis && typeof p.axis === "object") return cylinderBounds({ ...p, x, y, z, r, h: height });
  const radius = Math.max(r, number(p.r2) ?? r), axis = p.axis || "y";
  const lo = Math.min(0, height), hi = Math.max(0, height);
  if (axis === "x") return { x0:x+lo, x1:x+hi, y0:y-radius, y1:y+radius, z0:z-radius, z1:z+radius };
  if (axis === "z") return { x0:x-radius, x1:x+radius, y0:y-radius, y1:y+radius, z0:z+lo, z1:z+hi };
  return { x0:x-radius, x1:x+radius, y0:y+lo, y1:y+hi, z0:z-radius, z1:z+radius };
}

const ANALYTIC_PRIMITIVES = new Set(["box", "cylinder", "cone", "sphere"]);

function boundsFromResults(results, parameters) {
  const boxes = [];
  results.forEach((result) => {
    const p = result?.params;
    if (!p) return;
    if (ANALYTIC_PRIMITIVES.has(result.type)) {
      const bounds = primitiveBounds(result.type, p);
      if (bounds) boxes.push(bounds);
    }
    else if (["direct", "import"].includes(result.type) && p.bounds?.min && p.bounds?.max) boxes.push({
      x0:Number(p.bounds.min.x),x1:Number(p.bounds.max.x),y0:Number(p.bounds.min.y),y1:Number(p.bounds.max.y),z0:Number(p.bounds.min.z),z1:Number(p.bounds.max.z),
    });
  });
  if (boxes.length) return {
    min: { x: Math.min(...boxes.map((p) => p.x0)), y: Math.min(...boxes.map((p) => p.y0)), z: Math.min(...boxes.map((p) => p.z0)) },
    max: { x: Math.max(...boxes.map((p) => p.x1)), y: Math.max(...boxes.map((p) => p.y1)), z: Math.max(...boxes.map((p) => p.z1)) },
  };
  const w = Number(parameters.width) || 0, d = Number(parameters.depth) || 0, h = Number(parameters.height) || 0;
  return { min: { x: -w / 2, y: 0, z: -d / 2 }, max: { x: w / 2, y: h, z: d / 2 } };
}

/* Results that never stand as a body of their own: a sketch is a profile, a
   helix is a path, a knurl is a decoration on a face that already exists. */
const NON_BODY_RESULTS = new Set(["sketch", "helix", "knurl"]);

/* The bodies a rebuild leaves standing.
   A feature history answers "how was this built"; a body list answers "what
   exists now, and what can I select or hide". Those are different questions, so
   the body set is published by the rebuild rather than guessed at in the panel
   that draws it — otherwise the list has no stable identity and re-labels
   itself every regeneration. A body is a solid-producing result that no later
   feature consumed, and it carries the id of the feature that last shaped it,
   which is what keeps its name steady across rebuilds. */
export function bodiesFromResults(definition, results) {
  if (!results || typeof results.get !== "function") return [];
  /* Only steps that actually built are read. A step the rebuild never reached —
     one below the rollback bar, or one the compiler dropped — has no result,
     and counting it as a consumer of its own input erased the body that IS
     standing: with the bar dragged above a cut, the base extrude was "consumed"
     by a cut that no longer runs and the model left the body list entirely. */
  const features = (definition?.features || []).filter((feature) => !feature.suppressed && results.has(feature.id));
  const consumed = new Set();
  features.forEach((feature) => (feature.inputs || []).forEach((id) => consumed.add(id)));
  const bodies = [];
  features.forEach((feature) => {
    if (consumed.has(feature.id)) return;
    const result = results.get(feature.id);
    if (!result || result.kind === "sketch" || NON_BODY_RESULTS.has(result.type)) return;
    bodies.push({
      id: "body:" + feature.id,
      featureId: feature.id,
      name: result.name || feature.name || feature.type,
      type: result.type,
      index: bodies.length,
    });
  });
  return bodies;
}

export function rebuildDefinition(definition, overrides = {}, options = {}) {
  const startedAt = options.now || Date.now();
  const issues = validateDefinition(definition);
  const parameterRun = resolveParameters(definition, overrides);
  issues.push(...parameterRun.issues);
  if (!parameterRun.issues.some((issue) => issue.severity === "error")) definition = materializeCabinetDefinition(definition, parameterRun.values);
  issues.push(...(definition.metadata?.parameterIssues || []));
  const sketchRun = sketchDiagnostics(definition, parameterRun.values);
  issues.push(...sketchRun.issues);
  const graph = buildDependencyGraph(definition);
  issues.push(...graph.issues);
  const results = new Map();
  const topology = createTopologyRegistry();
  const topologyBindings = [];
  const hardFailure = () => issues.some((issue) => issue.severity === "error");
  const sketchIds=new Set((definition.sketches || []).map(s=>s.id));
  const badSketches=new Set(issues.filter(i=>i.severity==='error' && i.sketchId).map(i=>i.sketchId));
  const invalidFeatures=new Set(issues.filter(i=>i.severity==='error' && i.featureId).map(i=>i.featureId));
  if (!issues.some(i=>i.severity==='error' && ['missing-definition','missing-id','missing-origin','missing-history','missing-parameters','duplicate-feature-id'].includes(i.code))) {
    for (const feature of graph.order) {
      if (feature.suppressed || invalidFeatures.has(feature.id)) continue;
      const profiles=[feature.sketch,feature.params?.sketchId,...(feature.references?.sketches || []),...(feature.inputs || []).filter(id=>sketchIds.has(id))].filter(Boolean);
      if(profiles.some(id=>badSketches.has(id))){issues.push({severity:"error",code:"unavailable-sketch-input",featureId:feature.id,message:"Driving sketch could not rebuild"});continue;}

      /* A failure stops THIS feature, not the regeneration: the loop is in
         build order, so anything downstream reports its own unavailable input
         when it is reached, and independent branches still build. Breaking here
         threw away every body after the first bad step. */
      const dependencies = featureDependencies(feature).map(id => sketchIds.has(id) && !graph.byId.has(id)
        ? (definition.sketches || []).find(sketch => sketch.id === id)?.support?.ownerFeatureId : id).filter(Boolean);
      const missingInput = dependencies.find(id => !results.has(id));
      if (missingInput) {
        issues.push({ severity: "error", code: "unavailable-feature-input", featureId: feature.id, reference: missingInput, message: (feature.name || feature.id) + " cannot rebuild because " + missingInput + " is unavailable" });
        continue;
      }
      const topologyRun = resolveFeatureTopologyReferences(feature, topology);
      issues.push(...topologyRun.issues);
      topologyBindings.push(...topologyRun.resolutions);
      if (topologyRun.issues.some((issue) => issue.severity === "error")) continue;
      try {
        const result = featureResult(feature, parameterRun.values, results, topologyRun.resolutions, sketchRun.sketches);
        if(options.exactTopology?.has(feature.id))result.topology=options.exactTopology.get(feature.id);
        results.set(feature.id, result);
        (result.topology || []).forEach((item) => {
          if (!topology.byPersistentId.has(item.persistentId)) topology.list.push(item);
          topology.byPersistentId.set(item.persistentId, item);
        });
      }
      catch (error) {
        issues.push({ severity: "error", code: "feature-rebuild-failed", featureId: feature.id, message: String(error.message || error) });
        continue;
      }
    }
  }
  if (!hardFailure()) {
    (definition.sketches || []).forEach((sketch) => {
      const support = sketch.support && sketch.support.type === "topology-reference" ? sketch.support : null;
      if (!support) return;
      const resolution = resolveTopologyReference(support, topology);
      topologyBindings.push(resolution);
      if ((resolution.status === "exact" || resolution.status === "resolved" || resolution.status === "rebound") && sketch.frameSpace === "surface-uv") {
        sketch.surface={type:resolution.topology.descriptor.surface,descriptor:structuredClone(resolution.topology.descriptor)};
      } else if ((resolution.status === "exact" || resolution.status === "resolved" || resolution.status === "rebound") && sketch.frameSpace === "local") {
        const descriptor=resolution.topology?.descriptor, solved=sketchRun.sketches.find((item) => item.id===sketch.id);
        if (descriptor?.origin && descriptor?.normal && solved) {
          const offset=Number(sketch.supportOffset)||0;
          const origin={x:descriptor.origin.x+descriptor.normal.x*offset,y:descriptor.origin.y+descriptor.normal.y*offset,z:descriptor.origin.z+descriptor.normal.z*offset};
          solved.frame=realignFrame(solved.frame,origin,descriptor.normal);
        }
      }
      if (resolution.status === "rebound") issues.push({
        severity: "warning", code: "sketch-support-rebound", sketchId: sketch.id,
        reference: support.persistentId, reboundTo: resolution.topology.persistentId,
        message: (sketch.name || sketch.id) + " rebound to " + resolution.topology.persistentId,
      });
      else if (resolution.status === "missing" || resolution.status === "ambiguous") issues.push({
        severity: "error", code: resolution.status === "ambiguous" ? "ambiguous-sketch-support" : "missing-sketch-support",
        sketchId: sketch.id, reference: support.persistentId,
        candidates: resolution.candidates?.map((item) => item.persistentId) || [],
        message: (sketch.name || sketch.id) + " has an " + resolution.status + " support face: " + support.persistentId,
      });
    });
  }
  const ok = !hardFailure();
  const signature = stableStringify({ id: definition.id, revision: definition.revision, parameters: parameterRun.values, features: definition.features, sketches: definition.sketches });
  const output = {
    ok,
    document: definition,
    definitionId: definition.id,
    revision: definition.revision,
    signature,
    parameters: parameterRun.values,
    solvedSketches: sketchRun.sketches,
    results,
    resultList: Array.from(results.values()),
    topology: topology.list,
    topologyBindings,
    bounds: boundsFromResults(results, parameterRun.values),
    bodies: bodiesFromResults(definition, results),
    issues,
    rebuiltAt: startedAt,
  };
  definition.lastRebuild = {
    ok, signature, rebuiltAt: startedAt,
    issues: issues.map((issue) => ({ ...issue })),
  };
  return output;
}
