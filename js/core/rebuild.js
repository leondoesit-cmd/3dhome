import { evaluateExpression, resolveEquations } from "../sketch_equations.js";
import { resolveProfilePoints, solveSketch } from "../sketch_solver.js";
import { buildDependencyGraph, stableStringify } from "./dependency_graph.js";
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
  "fillet", "chamfer", "shell", "mirror", "linearPattern", "linearGridPattern", "circularPattern", "pattern", "extrudeCut", "boolean",
  "union", "subtract", "intersect", "procedural", "direct", "import", "component", "assembly",
  "hole", "helix", "thread", "knurl", "insert", "cone", "toolbox",
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
    values[name] = value;
    visiting.delete(name);
    resolved.add(name);
    return value;
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
    if (typeof value === "string" && value[0] === "$") return parameters[value.slice(1)];
    return value;
  }
  const output = {};
  Object.keys(value).forEach((key) => { output[key] = replaceParameters(value[key], parameters); });
  return output;
}

function sketchDiagnostics(definition, parameters) {
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
    equations.errors.forEach((error) => issues.push({ severity: "error", code: "sketch-equation", reference: error.name, message: error.message }));
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
  if (["extrude", "revolve"].includes(feature.type)) params = resolveProfileParams(params, sketches);
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

function boundsFromResults(results, parameters) {
  const boxes = [];
  results.forEach((result) => {
    const p = result?.params;
    if (!p) return;
    if (result.type === "box" && [p.x0, p.x1, p.y0, p.y1, p.z0, p.z1].every(Number.isFinite)) boxes.push(p);
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
  const sketchRun = sketchDiagnostics(definition, parameterRun.values);
  issues.push(...sketchRun.issues);
  const graph = buildDependencyGraph(definition);
  issues.push(...graph.issues);
  const results = new Map();
  const topology = createTopologyRegistry();
  const topologyBindings = [];
  const hardFailure = () => issues.some((issue) => issue.severity === "error");
  if (!hardFailure()) {
    for (const feature of graph.order) {
      if (feature.suppressed) continue;
      /* A failure stops THIS feature, not the regeneration: the loop is in
         build order, so anything downstream reports its own unavailable input
         when it is reached, and independent branches still build. Breaking here
         threw away every body after the first bad step. */
      const missingInput = (feature.inputs || []).find((id) => !results.has(id));
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
