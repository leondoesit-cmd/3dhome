import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { addRun, loadMEP } from "../js/mep.js";
import { autoInfrastructure } from "../js/mep_auto.js";
import { validateMEPModel } from "../js/mep_validate.js";
import { GENERIC_RESIDENTIAL_PROFILE } from "../js/mep_profile.js";

function circuitFixture() {
  const nodes = [
    { id: 10, sys: "power", k: "panel" },
    { id: 11, sys: "power", k: "switch", sourceId: 10, circuitId: "lighting" },
    { id: 12, sys: "power", k: "light", sourceId: 10, circuitId: "lighting", switchId: 11, itemId: "lamp" },
  ];
  const runs = [
    { id: 20, sys: "power", k: "circuit", circuitId: "lighting", explicit: true, a: 10, b: 11, pts: [{ x: 0, z: 0 }, { x: 100, z: 0 }] },
    { id: 21, sys: "power", k: "circuit", circuitId: "lighting", explicit: true, a: 11, b: 12, pts: [{ x: 100, z: 0 }, { x: 150, z: 0 }] },
  ];
  return { nodes, runs, circuits: [{ id: "lighting", panelId: 10, deviceIds: [11, 12], estimatedLoadW: 20 }], branches: [] };
}
function codes(model, items = [{ id: "lamp", type: "ceilingLight" }]) {
  return validateMEPModel(model, items, GENERIC_RESIDENTIAL_PROFILE).issues.map(issue => issue.code);
}

test("1. hot and cold branches both remain linked to a generated sink", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 500, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.roomMeta = {}; S.mep = null;
  S.items = [{ id: "sink", type: "sink", x: 120, z: 330, w: 60, d: 50 }];
  autoInfrastructure();
  const fixture = S.mep.nodes.find(n => n.itemId === "sink" && n.sys === "water");
  const branches = S.mep.branches.filter(b => b.deviceIds.includes(fixture.id));
  assert.deepEqual(new Set(branches.map(b => b.kind)), new Set(["cold", "hot"]));
  assert.deepEqual(new Set(fixture.branchIds), new Set(branches.map(b => b.id)));
  loadMEP(structuredClone(S.mep));
  assert.deepEqual(new Set(S.mep.nodes.find(n => n.id === fixture.id).branchIds), new Set(branches.map(b => b.id)));
});

test("2. a newly drawn run retains endpoint ID zero", () => {
  S.mep = null;
  const run = addRun("power", "circuit", [{ x: 0, z: 0 }, { x: 100, z: 0 }], 0, 1, "wall");
  assert.equal(run.a, 0);
});

test("3. loading preserves numeric zero in source and explicit endpoint links", () => {
  S.nodes = []; S.walls = []; S.openings = []; S.items = []; S.mep = null;
  loadMEP({
    nodes: [
      { id: 0, sys: "power", k: "panel", x: 0, z: 0 },
      { id: 1, sys: "power", k: "outlet", x: 100, z: 0, sourceId: 0, circuitId: "c" },
    ],
    runs: [{ id: 2, sys: "power", k: "circuit", layer: "wall", pts: [{ x: 0, z: 0 }, { x: 100, z: 0 }], a: 0, b: 1, explicit: true, circuitId: "c" }],
    circuits: [{ id: "c", panelId: 0, deviceIds: [1], estimatedLoadW: 180 }],
  });
  assert.equal(S.mep.nodes[1].sourceId, 0);
  assert.equal(S.mep.runs[0].a, 0);
});

test("4. partial legacy migration still infers a missing service branch", () => {
  S.nodes = []; S.walls = []; S.openings = []; S.items = []; S.mep = null;
  loadMEP({
    nodes: [
      { id: 1, sys: "power", k: "panel", x: 0, z: 0 },
      { id: 2, sys: "water", k: "manifold", x: 0, z: 100 },
      { id: 3, sys: "water", k: "valve", x: 100, z: 100 },
    ],
    runs: [{ id: 4, sys: "water", k: "cold", layer: "floor", pts: [{ x: 0, z: 100 }, { x: 100, z: 100 }] }],
    circuits: [{ id: "existing", panelId: 1, deviceIds: [], inferred: true }],
  });
  assert.equal(S.mep.branches.length, 1);
  assert.equal(S.mep.nodes.find(n => n.id === 3).branchId, S.mep.branches[0].id);
});

test("5. a circuit source must actually be an electrical panel", () => {
  const model = circuitFixture();
  model.nodes[0].k = "outlet";
  assert.ok(codes(model).includes("INVALID_PANEL"));
});

test("6. a non-null but stale electrical source is reported", () => {
  const model = circuitFixture();
  model.nodes[2].sourceId = "deleted-panel";
  assert.ok(codes(model).includes("INVALID_ELECTRICAL_SOURCE"));
});

test("7. a foreign-system device cannot masquerade as a circuit member", () => {
  const model = circuitFixture();
  model.nodes[2].sys = "water";
  assert.ok(codes(model).includes("INVALID_CIRCUIT_DEVICE"));
});

test("8. an explicit wire with a dangling endpoint is reported even if another path works", () => {
  const model = circuitFixture();
  model.runs.push({ id: 22, sys: "power", k: "circuit", circuitId: "lighting", explicit: true, a: 11, b: "deleted", pts: [{ x: 100, z: 0 }, { x: 110, z: 0 }] });
  assert.ok(codes(model).includes("INVALID_RUN_ENDPOINT"));
});

test("9. a physical light cannot bind to a water node carrying borrowed IDs", () => {
  const model = circuitFixture();
  model.nodes[2].sys = "water";
  assert.ok(codes(model).includes("UNBOUND_LIGHT_FIXTURE"));
});

test("10. a positive but undersized drainage fall is still unsafe", () => {
  const model = circuitFixture();
  model.runs.push({ id: 23, sys: "drain", k: "waste", layer: "floor", pts: [{ x: 0, z: 0 }, { x: 100, z: 0 }], fall: 0.1 });
  assert.ok(codes(model).includes("INSUFFICIENT_GRAVITY_FALL"));
});
