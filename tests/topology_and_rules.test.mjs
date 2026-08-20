import test from "node:test";
import assert from "node:assert/strict";

import { createDefinition, createParameter, PARAMETRIC_SCHEMA_VERSION } from "../js/core/schema.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import { applyTopologyRebindings, createTopologyReference, createTopologyRegistry, edgesBoundingFace, fitProfileCircle, mergeSmoothTopology, resolveFinishTargetIds, resolveMergedTopology, topologyForFeature, topologyMemberIds } from "../js/core/topology.js";
import { ensureItemDefinition, ensureParametricProject, requestItemDimension } from "../js/core/project.js";
import { authoredProductRules } from "../js/core/product_rules.js";

function topologyDefinition(reference) {
  const features = [{
    id: "body", type: "box", name: "Body", inputs: [],
    params: { x0: 0, x1: "$width", y0: 0, y1: "$height", z0: 0, z1: "$depth" },
  }];
  if (reference) features.push({
    id: "finish", type: "fillet", name: "Edge finish", inputs: ["body"],
    params: { radius: 2, targets: [reference] },
  });
  return createDefinition({
    id: "definition:topology",
    parameters: {
      width: createParameter("width", 120),
      depth: createParameter("depth", 60),
      height: createParameter("height", 90),
    },
    features,
  });
}

test("analytic topology names survive dimension changes and selected faces resolve exactly", () => {
  const first = rebuildDefinition(topologyDefinition(), { width: 120 }, { now: 1 });
  const second = rebuildDefinition(topologyDefinition(), { width: 240 }, { now: 1 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.topology.map((entry) => entry.persistentId), second.topology.map((entry) => entry.persistentId));
  assert.notEqual(
    first.topology.find((entry) => entry.persistentId === "body:face:right").descriptor.origin.x,
    second.topology.find((entry) => entry.persistentId === "body:face:right").descriptor.origin.x,
  );
});

test("a stale face name rebinds by semantic role and is healed only on explicit save", () => {
  const seed = rebuildDefinition(topologyDefinition(), {}, { now: 2 });
  const front = seed.topology.find((entry) => entry.persistentId === "body:face:front");
  const stale = createTopologyReference("body", "face", "body:face:legacy-front", front.descriptor);
  const definition = topologyDefinition(stale);
  const preview = rebuildDefinition(definition, {}, { now: 2 });
  assert.equal(preview.ok, true);
  assert.ok(preview.issues.some((issue) => issue.code === "topology-reference-rebound"));
  assert.equal(stale.persistentId, "body:face:legacy-front", "preview rebuilds must be side-effect free");
  const storedReference = definition.features[1].params.targets[0];

  const audit = applyTopologyRebindings(preview.topologyBindings);
  assert.deepEqual(audit.map(({ from, to }) => ({ from, to })), [{ from: "body:face:legacy-front", to: "body:face:front" }]);
  assert.equal(storedReference.persistentId, "body:face:front");
  const saved = rebuildDefinition(definition, {}, { now: 2 });
  assert.equal(saved.ok, true);
  assert.equal(saved.issues.some((issue) => issue.code === "topology-reference-rebound"), false);
});

test("an unresolved topology selection blocks its downstream feature", () => {
  const missing = createTopologyReference("body", "edge", "body:edge:removed", {
    curve: "circle", semantic: "removed", origin: { x: 10000, y: 10000, z: 10000 }, axis: { x: 1, y: 0, z: 0 }, measure: 1,
  });
  const run = rebuildDefinition(topologyDefinition(missing), {}, { now: 3 });
  assert.equal(run.ok, false);
  assert.ok(run.issues.some((issue) => issue.code === "missing-topology-reference"));
  assert.equal(run.results.has("finish"), false);
});

test("built-in catalogue objects receive versioned authored rule packs", () => {
  const state = { items: [], parametric: null };
  ensureParametricProject(state);
  const sofa = { id: "sofa", type: "sofa", w: 180, d: 90, h: 85 };
  state.items.push(sofa);
  const definition = ensureItemDefinition(state, sofa, { label: "Sofa", w: 180, d: 90, h: 85 });
  assert.equal(definition.schemaVersion, PARAMETRIC_SCHEMA_VERSION);
  assert.equal(definition.rules.source, "catalogue");
  assert.equal(definition.rules.id, "seating.modular");
  assert.equal(definition.metadata.rulePack, "seating.modular");

  const first = requestItemDimension(state, sofa, "width", 400, {});
  const second = requestItemDimension(state, sofa, "width", 400, {});
  assert.equal(first.status, "proposal");
  assert.deepEqual(first.alternatives.map((choice) => choice.id), second.alternatives.map((choice) => choice.id));
});

test("authored casework rules coordinate module and door counts", () => {
  const state = { items: [], parametric: null };
  ensureParametricProject(state);
  const cabinet = { id: "base", type: "base", w: 60, d: 60, h: 90 };
  state.items.push(cabinet);
  ensureItemDefinition(state, cabinet, { label: "Base cabinet", w: 60, d: 60, h: 90 });
  const proposal = requestItemDimension(state, cabinet, "width", 240, {});
  assert.equal(proposal.status, "proposal");
  assert.equal(proposal.code, "configuration-change");
  assert.ok(proposal.alternatives.some((choice) => choice.configuration.moduleCount === 4 && choice.configuration.doorCount === 4));
});

test("authored linked dimensions preserve a round table envelope", () => {
  const state = { items: [], parametric: null };
  ensureParametricProject(state);
  const table = { id: "round", type: "roundTable", w: 100, d: 100, h: 75 };
  state.items.push(table);
  ensureItemDefinition(state, table, { label: "Round table", w: 100, d: 100, h: 75 });
  const proposal = requestItemDimension(state, table, "width", 140, {});
  assert.equal(proposal.code, "linked-dimension-change");
  assert.deepEqual(proposal.alternatives[0].parameters, { width: 140, depth: 140 });
});

test("specialist catalogue families use authored policies instead of inference",()=>{
  for (const type of ["acDucted","ceilingLight","nft_pipe_110","tower_commercial","sink","desktop_pc","stairs","man"]) {
    const rules=authoredProductRules(type,{width:120,depth:60,height:100});
    assert.equal(rules.source,"catalogue",type);
    assert.ok(rules.invariants.length,type);
  }
});

test("sketch dimensions can be driven by canonical parameters without mutating the definition", () => {
  const definition = createDefinition({
    id: "definition:sketch-parameter",
    parameters: { width: createParameter("width", 100) },
    sketches: [{
      id: "sketch", referenceId: "plane:top",
      points: [{ id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 100, y: 0 }],
      entities: [{ id: "line", type: "line", a: "a", b: "b" }],
      constraints: [{ id: "horizontal", type: "horizontal", entity: "line" }, { id: "width", type: "distance", entity: "line", value: 100, parameter: "width" }],
    }],
    features: [],
  });
  const run = rebuildDefinition(definition, { width: 160 }, { now: 4 });
  assert.equal(run.ok, true);
  const solved = run.solvedSketches[0];
  const a = solved.points.find((point) => point.id === "a"), b = solved.points.find((point) => point.id === "b");
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 160) < 1e-3);
  assert.equal(definition.sketches[0].constraints.find((constraint) => constraint.id === "width").value, 100);
});

test("a face-supported sketch and extrusion follow the rebuilt upstream face", () => {
  function supportedDefinition(height) {
    const body = { id: "body", type: "box", params: { x: 0, y: 0, z: 0, w: 40, h: height, d: 20 }, inputs: [] };
    const top = rebuildDefinition(createDefinition({ id: "seed", features: [body] }), {}, { now: 5 }).topology.find((entry) => entry.persistentId === "body:face:top");
    const support = createTopologyReference(top.ownerFeatureId, top.kind, top.persistentId, top.descriptor);
    return createDefinition({
      id: "definition:face-supported",
      sketches: [{ id: "on-top", name: "Top face sketch", plane: "top", offset: height, referenceId: support.persistentId, support, points: [], entities: [], constraints: [] }],
      features: [
        body,
        { id: "pad", type: "extrude", inputs: ["body"], params: { axis: "y", from: height, to: height + 10, baseOffset: 0, depth: 10, support, points: [{ u: 5, v: 5 }, { u: 15, v: 5 }, { u: 15, v: 15 }, { u: 5, v: 15 }] } },
      ],
    });
  }

  const first = rebuildDefinition(supportedDefinition(30), {}, { now: 5 });
  const second = rebuildDefinition(supportedDefinition(55), {}, { now: 5 });
  assert.equal(first.ok, true, JSON.stringify(first.issues));
  assert.equal(second.ok, true, JSON.stringify(second.issues));
  assert.equal(first.results.get("pad").params.from, 30);
  assert.equal(first.results.get("pad").params.to, 40);
  assert.equal(second.results.get("pad").params.from, 55);
  assert.equal(second.results.get("pad").params.to, 65);
  assert.equal(second.topologyBindings.filter((binding) => binding.reference.persistentId === "body:face:top").every((binding) => binding.status === "exact"), true);
});

test("a sketch attached to a deleted owner feature fails with a support diagnostic", () => {
  const support = createTopologyReference("removed-body", "face", "removed-body:face:top", { surface: "plane", semantic: "top", origin: { x: 0, y: 10, z: 0 }, normal: { x: 0, y: 1, z: 0 }, measure: 100 });
  const definition = createDefinition({
    id: "definition:missing-sketch-support",
    sketches: [{ id: "orphan", name: "Orphan sketch", plane: "top", offset: 10, referenceId: support.persistentId, support, points: [], entities: [], constraints: [] }],
    features: [],
  });
  const run = rebuildDefinition(definition, {}, { now: 6 });
  assert.equal(run.ok, false);
  assert.ok(run.issues.some((issue) => issue.code === "missing-sketch-support-feature"));
});

test("a sampled circle is recognised as one profile circle, not a polygon", () => {
  const points = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return { u: 12 + Math.cos(a) * 6, v: -3 + Math.sin(a) * 6 };
  });
  const fit = fitProfileCircle(points);
  assert.ok(fit);
  assert.ok(Math.abs(fit.radius - 6) < 0.05);
  assert.equal(fitProfileCircle([{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 4 }, { u: 0, v: 4 }]), null);
  const square = [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 10 }, { u: 0, v: 10 }];
  assert.equal(fitProfileCircle(square), null);
});

test("tessellated circular hole edges and cylindrical staves merge into one pick target", () => {
  const radius = 8, count = 24;
  const edges = Array.from({ length: count }, (_, i) => {
    const a0 = (i / count) * Math.PI * 2, a1 = ((i + 1) / count) * Math.PI * 2;
    const a = { x: Math.cos(a0) * radius, y: 10, z: Math.sin(a0) * radius };
    const b = { x: Math.cos(a1) * radius, y: 10, z: Math.sin(a1) * radius };
    return {
      ownerFeatureId: "cut", kind: "edge", persistentId: "cut:edge:" + i,
      descriptor: { curve: "line", origin: { x: (a.x + b.x) / 2, y: 10, z: (a.z + b.z) / 2 }, endpoints: [a, b], measure: Math.hypot(b.x - a.x, b.z - a.z) },
    };
  });
  const faces = Array.from({ length: count }, (_, i) => {
    const a = ((i + 0.5) / count) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    return {
      ownerFeatureId: "cut", kind: "face", persistentId: "cut:face:" + i,
      descriptor: { surface: "plane", origin: { x: nx * radius, y: 5, z: nz * radius }, normal: { x: nx, y: 0, z: nz }, measure: 4 },
    };
  });
  const boxEdge = {
    ownerFeatureId: "body", kind: "edge", persistentId: "body:edge:x:top:front",
    descriptor: { curve: "line", origin: { x: 0, y: 20, z: 15 }, endpoints: [{ x: -20, y: 20, z: 15 }, { x: 20, y: 20, z: 15 }], measure: 40 },
  };
  const merged = mergeSmoothTopology(edges.concat(faces, [boxEdge]));
  const circular = merged.filter((entry) => entry.kind === "edge" && entry.descriptor.curve === "circle");
  const cylinders = merged.filter((entry) => entry.kind === "face" && entry.descriptor.surface === "cylinder");
  assert.equal(circular.length, 1);
  assert.equal(circular[0].memberPersistentIds.length, count);
  assert.ok(Math.abs(circular[0].descriptor.radius - radius) < 0.2);
  assert.equal(cylinders.length, 1);
  assert.equal(cylinders[0].memberPersistentIds.length, count);
  assert.equal(resolveMergedTopology(merged, "cut:edge:7").persistentId, circular[0].persistentId);
  assert.deepEqual(topologyMemberIds(circular[0]).sort(), edges.map((edge) => edge.persistentId).sort());
  assert.equal(merged.some((entry) => entry.persistentId === "body:edge:x:top:front"), true);
});

test("coarse circular tessellation and split circle arcs merge into one edge", () => {
  const radius = 10, count = 12;
  const chords = Array.from({ length: count }, (_, i) => {
    const a0 = (i / count) * Math.PI * 2, a1 = ((i + 1) / count) * Math.PI * 2;
    const a = { x: Math.cos(a0) * radius, y: 4, z: Math.sin(a0) * radius };
    const b = { x: Math.cos(a1) * radius, y: 4, z: Math.sin(a1) * radius };
    return {
      ownerFeatureId: "cut", kind: "edge", persistentId: "cut:edge:" + i,
      descriptor: { curve: "line", origin: { x: (a.x + b.x) / 2, y: 4, z: (a.z + b.z) / 2 }, endpoints: [a, b], measure: Math.hypot(b.x - a.x, b.z - a.z) },
    };
  });
  const coarse = mergeSmoothTopology(chords).filter((entry) => entry.kind === "edge" && entry.descriptor.curve === "circle");
  assert.equal(coarse.length, 1);
  assert.equal(coarse[0].memberPersistentIds.length, count);

  const half = (id, start, end) => ({
    ownerFeatureId: "body", kind: "edge", persistentId: "body:edge:" + id,
    descriptor: {
      curve: "circle", origin: { x: 0, y: 8, z: 0 }, axis: { x: 0, y: 1, z: 0 },
      radius: 6, measure: Math.PI * 6, endpoints: [start, end],
    },
  });
  const arcs = mergeSmoothTopology([
    half("a", { x: 6, y: 8, z: 0 }, { x: -6, y: 8, z: 0 }),
    half("b", { x: -6, y: 8, z: 0 }, { x: 6, y: 8, z: 0 }),
  ]).filter((entry) => entry.kind === "edge");
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].descriptor.curve, "circle");
  assert.equal(arcs[0].memberPersistentIds.length, 2);
});

test("fillet targets resolve by geometry when the stored persistent id is stale", () => {
  const body = { id: "body", type: "box", params: { x: 0, y: 0, z: 0, w: 40, h: 20, d: 10 } };
  const topology = topologyForFeature(body, body.params);
  const edge = topology.find((item) => item.persistentId === "body:edge:y:right:front");
  const stale = createTopologyReference("body", "edge", "body:edge:generated:line:9", edge.descriptor);
  const ids = resolveFinishTargetIds([stale], createTopologyRegistry(topology), "edge");
  assert.deepEqual(ids, ["body:edge:y:right:front"]);
  assert.deepEqual(resolveFinishTargetIds([
    createTopologyReference("body", "edge", edge.persistentId, edge.descriptor),
  ], createTopologyRegistry(topology), "edge"), ["body:edge:y:right:front"]);
});

test("a selected face expands to every bounding edge for fillet and chamfer", () => {
  const box = { id: "body", type: "box", params: { x: 0, y: 0, z: 0, w: 40, h: 20, d: 10 } };
  const boxTopology = topologyForFeature(box, box.params);
  const top = boxTopology.find((item) => item.persistentId === "body:face:top");
  const topEdges = edgesBoundingFace(top, createTopologyRegistry(boxTopology)).map((item) => item.persistentId).sort();
  assert.deepEqual(topEdges, [
    "body:edge:x:top:back", "body:edge:x:top:front", "body:edge:z:left:top", "body:edge:z:right:top",
  ].sort());
  assert.deepEqual(
    resolveFinishTargetIds([createTopologyReference("body", "face", top.persistentId, top.descriptor)], createTopologyRegistry(boxTopology), "edge").sort(),
    topEdges,
  );

  const cylinder = { id: "body", type: "cylinder", params: { x: 0, y: 0, z: 0, r: 8, h: 20 } };
  const cylTopology = topologyForFeature(cylinder, cylinder.params);
  const cap = cylTopology.find((item) => item.persistentId === "body:face:top");
  const wall = cylTopology.find((item) => item.persistentId === "body:face:side");
  assert.deepEqual(edgesBoundingFace(cap, createTopologyRegistry(cylTopology)).map((item) => item.persistentId), ["body:edge:top-rim"]);
  assert.deepEqual(edgesBoundingFace(wall, createTopologyRegistry(cylTopology)).map((item) => item.persistentId).sort(), [
    "body:edge:bottom-rim", "body:edge:top-rim",
  ]);

  const noisyTop = { ...top, descriptor: { ...top.descriptor, normal: { x: 0.04, y: 1, z: -0.03 } } };
  assert.equal(edgesBoundingFace(noisyTop, createTopologyRegistry(boxTopology)).length, 4);

  const extrusion = { id: "body", type: "extrude", params: { axis: "y", from: 0, to: 20, points: [
    { u: 0, v: 0 }, { u: 40, v: 0 }, { u: 40, v: 10 }, { u: 0, v: 10 },
  ] } };
  const extTopology = topologyForFeature(extrusion, extrusion.params);
  const start = extTopology.find((item) => item.persistentId === "body:face:start");
  assert.equal(edgesBoundingFace(start, createTopologyRegistry(extTopology)).length, 4);
});
