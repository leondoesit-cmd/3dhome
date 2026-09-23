import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { detectRooms } from "../js/geometry.js";
import { autoInfrastructure } from "../js/mep_auto.js";
import { apartmentGenerateCommand } from "../js/generator.js";
import { GENERIC_RESIDENTIAL_PROFILE, registerMEPProfile } from "../js/mep_profile.js";
import { validateMEPModel } from "../js/mep_validate.js";

function model() {
  return {
    nodes: [
      { id: "panel", sys: "power", k: "panel" },
      { id: "switch", sys: "power", k: "switch", sourceId: "panel", circuitId: "lights" },
      { id: "light", sys: "power", k: "light", sourceId: "panel", circuitId: "lights", switchId: "switch", itemId: "lamp" },
      { id: "manifold", sys: "water", k: "manifold" },
      { id: "tap", sys: "water", k: "fixture", sourceId: "manifold", branchId: "cold", branchIds: ["cold"], itemId: "sink" },
    ],
    runs: [
      { id: "wire-1", sys: "power", k: "circuit", circuitId: "lights", explicit: true, a: "panel", b: "switch", pts: [{ x: 0, z: 0 }, { x: 50, z: 0 }] },
      { id: "wire-2", sys: "power", k: "circuit", circuitId: "lights", explicit: true, a: "switch", b: "light", pts: [{ x: 50, z: 0 }, { x: 100, z: 0 }] },
      { id: "pipe", sys: "water", k: "cold", branchId: "cold", pts: [{ x: 0, z: 0 }, { x: 100, z: 0 }] },
    ],
    circuits: [{ id: "lights", panelId: "panel", deviceIds: ["switch", "light"], estimatedLoadW: 20 }],
    branches: [{ id: "cold", sys: "water", kind: "cold", sourceId: "manifold", deviceIds: ["tap"] }],
  };
}
const items = [{ id: "lamp", type: "ceilingLight" }, { id: "sink", type: "sink" }];
function codes(m, physical = items) {
  return validateMEPModel(m, physical, GENERIC_RESIDENTIAL_PROFILE).issues.map(issue => issue.code);
}

test("11. profile versions must be positive integers", () => {
  for (const version of [0, -1, 1.5])
    assert.throws(() => registerMEPProfile({ id: "bad-version-" + version, version }), TypeError);
});

test("12. generation rejects an unknown profile without changing the network", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 500, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.items = []; S.roomMeta = {};
  S.mep = structuredClone(model());
  const before = structuredClone(S.mep);
  for (const profileId of ["missing-residential-profile", ""]) {
    const prepared = apartmentGenerateCommand.prepare({ size: "small", profileId }, { state: S });
    assert.equal(prepared.reason, "UNKNOWN_MEP_PROFILE");
    const result = autoInfrastructure({ rooms: detectRooms(), profileId });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "UNKNOWN_MEP_PROFILE");
    assert.deepEqual(S.mep, before);
  }
});

test("13. outlet counts above the standards profile limit are reported", () => {
  const m = model();
  for (let i = 0; i <= GENERIC_RESIDENTIAL_PROFILE.electrical.maxSocketsPerCircuit; i++) {
    const id = "outlet-" + i;
    m.nodes.push({ id, sys: "power", k: "outlet", sourceId: "panel", circuitId: "lights" });
    m.circuits[0].deviceIds.push(id);
  }
  assert.ok(codes(m).includes("TOO_MANY_CIRCUIT_OUTLETS"));
});

test("14. light counts above the standards profile limit are reported", () => {
  const m = model();
  for (let i = 0; i < GENERIC_RESIDENTIAL_PROFILE.electrical.maxLightsPerCircuit; i++) {
    const id = "extra-light-" + i;
    m.nodes.push({ id, sys: "power", k: "light", sourceId: "panel", circuitId: "lights" });
    m.circuits[0].deviceIds.push(id);
  }
  assert.ok(codes(m).includes("TOO_MANY_CIRCUIT_LIGHTS"));
});

test("15. non-finite or negative breaker loads are reported", () => {
  for (const load of [NaN, Infinity, -1]) {
    const m = model(); m.circuits[0].estimatedLoadW = load;
    assert.ok(codes(m).includes("INVALID_CIRCUIT_LOAD"));
  }
});

test("16. a device with a nonexistent circuit ID is reported", () => {
  const m = model(); m.nodes[2].circuitId = "removed-circuit";
  assert.ok(codes(m).includes("MISSING_DEVICE_CIRCUIT"));
});

test("17. a light switch outside the light's circuit is reported", () => {
  const m = model();
  m.circuits[0].deviceIds = ["light"];
  m.circuits.push({ id: "switches", panelId: "panel", deviceIds: ["switch"], estimatedLoadW: 0, inferred: true });
  m.nodes[1].circuitId = "switches";
  assert.ok(codes(m).includes("SWITCH_NOT_ON_LIGHT_CIRCUIT"));
});

test("18. a branch with a missing source is reported", () => {
  const m = model(); m.branches[0].sourceId = "removed-manifold";
  assert.ok(codes(m).includes("MISSING_BRANCH_SOURCE"));
});

test("19. a branch containing another service's device is reported", () => {
  const m = model(); m.branches[0].deviceIds.push("light");
  assert.ok(codes(m).includes("INVALID_BRANCH_DEVICE"));
});

test("20. a wet physical fixture without a water point is reported", () => {
  const m = model(); m.nodes = m.nodes.filter(n => n.id !== "tap");
  assert.ok(codes(m).includes("UNBOUND_WET_FIXTURE"));
});
