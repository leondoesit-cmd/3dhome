import test from "node:test";
import assert from "node:assert/strict";

import { createDefinition, createParameter, PARAMETRIC_SCHEMA_VERSION } from "../js/core/schema.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import { applyTopologyRebindings, createTopologyReference, createTopologyRegistry, cutWallTopology, edgesBoundingFace, fitProfileCircle, isCylinderTessellationSeam, mergeSmoothTopology, resolveFinishTargetIds, resolveMergedTopology, topologyForFeature, topologyMemberIds } from "../js/core/topology.js";
import { createFeatureDefinition, createPartDocument, createSketchDefinition } from "../js/core/parametric_document.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { frameFromPlane } from "../js/core/frame.js";
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

test("full-cylinder facet seams are neither displayed nor selectable as CAD edges", () => {
  const radius = 10, height = 30, count = 24;
  const faces = [], seams = [];
  for (let i = 0; i < count; i++) {
    const angle = (i + 0.5) / count * Math.PI * 2;
    faces.push({
      ownerFeatureId:"cylinder",kind:"face",persistentId:"cylinder:face:facet:"+i,
      descriptor:{surface:"plane",origin:{x:Math.cos(angle)*radius,y:height/2,z:Math.sin(angle)*radius},normal:{x:Math.cos(angle),y:0,z:Math.sin(angle)},measure:2*Math.PI*radius*height/count},
    });
    const seamAngle = i / count * Math.PI * 2, x = Math.cos(seamAngle) * radius, z = Math.sin(seamAngle) * radius;
    seams.push({
      ownerFeatureId:"cylinder",kind:"edge",persistentId:"cylinder:edge:seam:"+i,
      descriptor:{curve:"line",origin:{x,y:height/2,z},endpoints:[{x,y:0,z},{x,y:height,z}],measure:height},
    });
  }
  const merged = mergeSmoothTopology(faces.concat(seams));
  assert.equal(merged.filter((entry) => entry.kind === "face" && entry.descriptor.surface === "cylinder").length, 1);
  assert.equal(merged.some((entry) => entry.kind === "edge" && entry.persistentId.includes(":seam:")), false);
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

test("a 16-point extruded circle is one cylindrical wall, not a stave per chord", () => {
  const points = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return { u: 10 * Math.cos(a), v: 10 * Math.sin(a) };
  });
  const topology = topologyForFeature({ id: "body", type: "extrude" }, { axis: "y", from: 0, to: 25, points });
  const walls = topology.filter((item) => item.kind === "face" && item.descriptor.surface === "cylinder");
  const planes = topology.filter((item) => item.kind === "face" && item.descriptor.surface === "plane");
  assert.equal(walls.length, 1, "the side is one cylinder");
  assert.equal(planes.length, 2, "caps stay planar");
  assert.ok(Math.abs(walls[0].descriptor.radius - 10) < 0.15);
});

test("small-radius 16-gon staves still merge into one cylinder", () => {
  const radius = 3, height = 12, count = 16;
  const faces = Array.from({ length: count }, (_, i) => {
    const angle = (i + 0.5) / count * Math.PI * 2;
    const inset = radius * Math.cos(Math.PI / count);
    return {
      ownerFeatureId: "body", kind: "face", persistentId: "body:face:stave:" + i,
      descriptor: {
        surface: "plane",
        origin: { x: Math.cos(angle) * inset, y: height / 2, z: Math.sin(angle) * inset },
        normal: { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
        measure: 2 * Math.PI * radius * height / count,
      },
    };
  });
  const merged = mergeSmoothTopology(faces);
  const walls = merged.filter((entry) => entry.kind === "face" && entry.descriptor.surface === "cylinder");
  assert.equal(walls.length, 1);
  assert.equal(walls[0].memberPersistentIds.length, count);
});

test("coaxial cylindrical lands stay separate when they do not overlap along the axis", () => {
  const cylinder = (id, y, height = 4) => ({
    ownerFeatureId: "shaft", kind: "face", persistentId: "shaft:face:" + id,
    descriptor: {
      surface: "cylinder", origin: { x: 0, y, z: 0 }, axis: { x: 0, y: 1, z: 0 },
      radius: 3, measure: 2 * Math.PI * 3 * height,
      along: { min: -height / 2, max: height / 2 },
    },
  });
  const merged = mergeSmoothTopology([cylinder("lower", 5), cylinder("upper", 25)]);
  const walls = merged.filter((entry) => entry.kind === "face" && entry.descriptor.surface === "cylinder");
  assert.equal(walls.length, 2, "two lands on a stepped shaft are two faces");
  assert.deepEqual(walls.map((wall) => wall.persistentId).sort(), ["shaft:face:lower", "shaft:face:upper"]);
});

test("tessellated coaxial lands at different heights do not become one wall", () => {
  const staves = (tag, y, radius = 3, count = 16, height = 4) => Array.from({ length: count }, (_, i) => {
    const angle = (i + 0.5) / count * Math.PI * 2;
    const inset = radius * Math.cos(Math.PI / count);
    return {
      ownerFeatureId: "shaft", kind: "face", persistentId: "shaft:face:" + tag + ":" + i,
      descriptor: {
        surface: "plane",
        origin: { x: Math.cos(angle) * inset, y, z: Math.sin(angle) * inset },
        normal: { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
        measure: 2 * Math.PI * radius * height / count,
      },
    };
  });
  const merged = mergeSmoothTopology(staves("lower", 5).concat(staves("upper", 25)));
  const walls = merged.filter((entry) => entry.kind === "face" && entry.descriptor.surface === "cylinder");
  assert.equal(walls.length, 2);
  walls.forEach((wall) => {
    assert.equal(wall.memberPersistentIds.length, 16);
    const recoveredHeight = wall.descriptor.along.max - wall.descriptor.along.min;
    assert.ok(recoveredHeight > 3.8 && recoveredHeight < 4.2, "facet area recovers the full axial height");
  });
});

test("All mode only suppresses edges that are tessellation seams of a cylinder", () => {
  const wall = {
    ownerFeatureId: "body", kind: "face", persistentId: "body:face:side",
    descriptor: {
      surface: "cylinder", origin: { x: 0, y: 5, z: 0 }, axis: { x: 0, y: 1, z: 0 },
      radius: 4, measure: 2 * Math.PI * 4 * 10,
      along: { min: -5, max: 5 },
      arc: { start: 0, sweep: Math.PI, step: Math.PI / 8, closed: false },
    },
  };
  const seam = {
    ownerFeatureId: "body", kind: "edge", persistentId: "body:edge:seam",
    descriptor: {
      curve: "line", origin: { x: 4, y: 5, z: 0 },
      endpoints: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 10, z: 0 }],
      measure: 10,
    },
  };
  const boundary = {
    ownerFeatureId: "body", kind: "edge", persistentId: "body:edge:generatrix",
    descriptor: {
      curve: "line", origin: { x: 4, y: 5, z: 0 },
      endpoints: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 10, z: 0 }],
      measure: 10,
    },
  };
  /* A closed full cylinder treats every vertical wall line as a seam. */
  const closed = { ...wall, descriptor: { ...wall.descriptor, arc: { start: 0, sweep: Math.PI * 2, step: Math.PI / 8, closed: true } } };
  assert.equal(isCylinderTessellationSeam(seam, [closed]), true);
  /* A half-cylinder's straight side is a real boundary, not a facet join. */
  assert.equal(isCylinderTessellationSeam(boundary, [wall]), false);

  /* A disconnected full cylinder on the same infinite axis must not classify a
     real boundary of the partial cylinder above it as one of its own seams. */
  const upperWall = {
    ...wall,
    persistentId: "body:face:upper-half",
    descriptor: { ...wall.descriptor, origin: { x: 0, y: 25, z: 0 } },
  };
  const upperBoundary = {
    ...boundary,
    persistentId: "body:edge:upper-generatrix",
    descriptor: {
      ...boundary.descriptor,
      origin: { x: 4, y: 25, z: 0 },
      endpoints: [{ x: 4, y: 20, z: 0 }, { x: 4, y: 30, z: 0 }],
    },
  };
  assert.equal(isCylinderTessellationSeam(upperBoundary, [closed, upperWall]), false);
});

test("a sphere is one face, so a click selects the whole surface", () => {
  const sphere = { id: "body", type: "sphere", params: { x: 2, y: 4, z: -1, r: 7 } };
  const topology = topologyForFeature(sphere, sphere.params);
  const faces = topology.filter((item) => item.kind === "face");
  assert.equal(faces.length, 1);
  assert.equal(faces[0].persistentId, "body:face:surface");
  assert.equal(faces[0].descriptor.surface, "sphere");
  assert.equal(faces[0].descriptor.radius, 7);
  assert.deepEqual(faces[0].descriptor.center, { x: 2, y: 4, z: -1 });
});

test("a hole loop gets its own wall face, so a bore picks as one round face", () => {
  const circle = (count, radius) => Array.from({ length: count }, (_, i) => ({
    u: radius * Math.cos(2 * Math.PI * i / count), v: radius * Math.sin(2 * Math.PI * i / count),
  }));

  const bore = cutWallTopology({ id: "body" }, { points: circle(41, 6), axis: "y", from: 0, to: 65, tag: "profile:0" });
  assert.equal(bore.length, 1, "a round hole is one wall, not one face per chord");
  const coarseBore = cutWallTopology({ id: "body" }, { points: circle(16, 6), axis: "y", from: 0, to: 65, tag: "profile:1" });
  assert.equal(coarseBore.length, 1, "a 16-point hole is still one wall");
  assert.equal(coarseBore[0].descriptor.surface, "cylinder");
  assert.equal(bore[0].kind, "face");
  assert.equal(bore[0].persistentId, "body:face:hole:profile:0:wall:0");
  assert.equal(bore[0].descriptor.surface, "cylinder");
  assert.ok(Math.abs(bore[0].descriptor.radius - 6) < 0.05);
  assert.deepEqual(bore[0].descriptor.axis, { x: 0, y: 1, z: 0 });
  // mid-height on the axis: what a picker measures its radial distance from
  assert.ok(Math.hypot(bore[0].descriptor.origin.x, bore[0].descriptor.origin.z) < 1e-6);
  assert.ok(Math.abs(bore[0].descriptor.origin.y - 32.5) < 1e-6);

  // A square pocket keeps four flat walls — merging is for smooth runs only.
  const pocket = cutWallTopology({ id: "body" }, {
    points: [{ u: -5, v: -4 }, { u: 5, v: -4 }, { u: 5, v: 4 }, { u: -5, v: 4 }],
    axis: "y", from: 20, to: 65, tag: "cut:0",
  });
  assert.equal(pocket.length, 4);
  assert.ok(pocket.every((face) => face.descriptor.surface === "plane"));
  assert.equal(new Set(pocket.map((face) => face.persistentId)).size, 4);

  // Caps belong to the body the hole was cut into, never to the hole itself.
  assert.ok(!bore.concat(pocket).some((face) => /:face:(start|end)$/.test(face.persistentId)));

  // And the bore survives the smooth merge next to the block it was cut from.
  const block = topologyForFeature({ id: "body", type: "extrude" }, {
    axis: "y", from: 0, to: 65,
    points: [{ u: -26, v: -15 }, { u: 26, v: -15 }, { u: 26, v: 15 }, { u: -26, v: 15 }],
  });
  const merged = mergeSmoothTopology(block.concat(bore));
  const cylinders = merged.filter((entry) => entry.kind === "face" && entry.descriptor.surface === "cylinder");
  assert.equal(cylinders.length, 1);
  assert.equal(cylinders[0].persistentId, "body:face:hole:profile:0:wall:0");
});

test("a bore's staves merge into the bore, and near-parallel faces do not invent a wall", () => {
  const radius = 6, height = 24, count = 20, centre = { x: 3, z: -2 };
  const bore = [];
  for (let i = 0; i < count; i++) {
    const angle = (i + 0.5) / count * Math.PI * 2;
    const x = centre.x + Math.cos(angle) * radius * Math.cos(Math.PI / count);
    const z = centre.z + Math.sin(angle) * radius * Math.cos(Math.PI / count);
    bore.push({
      ownerFeatureId: "body", kind: "face", persistentId: "body:face:bore:" + i,
      descriptor: {
        surface: "plane", origin: { x, y: height / 2, z },
        // a bore faces its own axis; a boss faces away from it
        normal: { x: -Math.cos(angle), y: 0, z: -Math.sin(angle) },
        measure: 2 * Math.PI * radius * height / count,
      },
    });
  }
  const merged = mergeSmoothTopology(bore).filter((entry) => entry.kind === "face");
  assert.equal(merged.length, 1, "twenty staves, one wall");
  assert.equal(merged[0].descriptor.surface, "cylinder");
  assert.ok(Math.abs(merged[0].descriptor.radius - radius) < 0.2);
  assert.ok(Math.abs(merged[0].descriptor.origin.x - centre.x) < 0.05, "the axis is the bore's, not its mirror image");
  assert.ok(Math.abs(merged[0].descriptor.origin.z - centre.z) < 0.05);
  assert.equal((merged[0].memberPersistentIds || []).length, count);

  /* A flat wall beside a few facets of something else fits some enormous circle
     — it always did, and the biggest fit always collected the most faces. */
  const flat = [
    { origin: { x: 0, y: 10, z: 3.4 }, normal: { x: 0, y: 0, z: -1 }, measure: 387 },
    { origin: { x: 8.8, y: 10, z: 3.37 }, normal: { x: -0.07, y: 0, z: -1 }, measure: 22 },
    { origin: { x: 10.2, y: 10, z: 3.05 }, normal: { x: -0.37, y: 0, z: -0.93 }, measure: 22 },
    { origin: { x: -6.3, y: 10, z: 3.05 }, normal: { x: 0.37, y: 0, z: -0.93 }, measure: 22 },
    { origin: { x: -4.9, y: 10, z: 3.37 }, normal: { x: 0.07, y: 0, z: -1 }, measure: 22 },
  ].map((descriptor, index) => ({
    ownerFeatureId: "body", kind: "face", persistentId: "body:face:flat:" + index,
    descriptor: { surface: "plane", ...descriptor },
  }));
  const flatMerged = mergeSmoothTopology(flat).filter((entry) => entry.kind === "face");
  assert.equal(flatMerged.length, flat.length, "each stays its own flat face");
  assert.ok(!flatMerged.some((entry) => entry.descriptor.surface === "cylinder"));
});

/* The tree a modeller actually builds: rectangle → boss, circle on the boss's
   own top face → second boss, slot on that face → cut. Every step after the
   first refers to a face of the step before it. */
test("a sketch-driven boss names its faces, so what is built on them still resolves", () => {
  const document = createPartDocument({ id: "part:stack" });
  const plate = createSketchDefinition(document, {
    id: "sk:plate", name: "Top Plane sketch", referenceId: "plane:top",
    points: [
      { id: "p0", x: -30, y: -12, fixed: true }, { id: "p1", x: 30, y: -12, fixed: true },
      { id: "p2", x: 30, y: 12, fixed: true }, { id: "p3", x: -30, y: 12, fixed: true },
    ],
    entities: [
      { id: "e0", type: "line", a: "p0", b: "p1" }, { id: "e1", type: "line", a: "p1", b: "p2" },
      { id: "e2", type: "line", a: "p2", b: "p3" }, { id: "e3", type: "line", a: "p3", b: "p0" },
    ],
  });
  const boss1 = createFeatureDefinition(document, "extrude", {
    id: "feature:boss1", name: "Extrude / Boss 1",
    references: { sketches: [plate.id], features: [], topology: [], references: [] },
    params: { depth: 20, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });

  // the profile lives in the sketch, so the feature has to be resolved through
  // it before anything can be said about the faces it makes
  const first = rebuildParametricDocument(document, {}, { now: 1 });
  assert.equal(first.ok, true, JSON.stringify(first.issues));
  const faces = (first.core?.topology || []).filter((entry) => entry.kind === "face");
  assert.ok(faces.length >= 6, "a sketch-driven extrude names its faces: " + faces.length);
  const top = faces.find((entry) => entry.persistentId === "feature:boss1:face:end");
  assert.ok(top, "including the one a sketch would be put on");

  const support = createTopologyReference(top.ownerFeatureId, top.kind, top.persistentId, top.descriptor);
  const onFace = (id, name, points, entities) => createSketchDefinition(document, {
    id, name, referenceId: support.persistentId, support, frameSpace: "local", plane: "top", offset: 0,
    frame: frameFromPlane(top.descriptor.origin, top.descriptor.normal, { x: 1, y: 0, z: 0 }),
    points, entities,
  });

  const disc = onFace("sk:disc", "end sketch",
    [{ id: "c", x: -6, y: 0, fixed: true }], [{ id: "circle", type: "circle", c: "c", r: 9, fixed: true }]);
  const boss2 = createFeatureDefinition(document, "extrude", {
    id: "feature:boss2", name: "Extrude / Boss 2", inputs: [boss1.id],
    references: { sketches: [disc.id], features: [boss1.id], topology: [], references: [] },
    params: { depth: 4, profileEntityIds: ["circle"], sketchId: disc.id },
  });

  const slot = onFace("sk:slot", "slot sketch", [
    { id: "a1", x: -20, y: -2, fixed: true }, { id: "b1", x: 10, y: -2, fixed: true },
    { id: "b0", x: 10, y: 2, fixed: true }, { id: "a0", x: -20, y: 2, fixed: true },
    { id: "ca", x: -20, y: 0, fixed: true }, { id: "cb", x: 10, y: 0, fixed: true },
  ], [
    { id: "side1", type: "line", a: "a1", b: "b1" }, { id: "capB", type: "arc", c: "cb", a: "b1", b: "b0" },
    { id: "side0", type: "line", a: "b0", b: "a0" }, { id: "capA", type: "arc", c: "ca", a: "a0", b: "a1" },
  ]);
  createFeatureDefinition(document, "extrudeCut", {
    id: "feature:cut", name: "Extrude Cut 1", inputs: [boss2.id],
    references: { sketches: [slot.id], features: [boss2.id], topology: [], references: [] },
    params: { depth: 5, endCondition: "blind", direction: "reverse", sketchId: slot.id,
      profileEntityIds: ["side1", "capB", "side0", "capA"], operation: "subtract" },
  });

  const run = rebuildParametricDocument(document, {}, { now: 2 });
  assert.equal(run.ok, true, JSON.stringify(run.issues));
  assert.ok(
    !run.issues.some((issue) => issue.code === "missing-topology-reference" || issue.code === "missing-sketch-support"),
    "nothing in the tree lost the face it was built on: " + JSON.stringify(run.issues.map((issue) => issue.code)),
  );
  // and the cut still ran: one failed reference used to stop the whole rebuild
  assert.equal(run.status.every((entry) => entry.state === "rebuilt"), true, JSON.stringify(run.status));
});
