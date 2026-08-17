import test from "node:test";
import assert from "node:assert/strict";

import { createDefinition, createParameter, PARAMETRIC_SCHEMA_VERSION } from "../js/core/schema.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import { applyTopologyRebindings, createTopologyReference } from "../js/core/topology.js";
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
