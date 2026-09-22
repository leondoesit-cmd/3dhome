import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  addRun,
  addNode,
  allowedLayersFor,
  computeMEPClashes,
  connectMissingMEP,
  decideAutoGenerate,
  defaultLayerFor,
  effectiveRunLayers,
  generationLayer,
  getMEPState,
  hitMEP,
  isNodeConnected,
  loadMEP,
  nodePos,
  runCrossesOpening,
  runLength,
  runPointY,
  setMEPLayer,
  setNodeKind,
  setRoutingPolicy,
  unconnectedNodes,
} from "../js/mep.js";
import { makeRouter } from "../js/mep_route.js";

function plan() {
  S.nodes = [
    { x: 0, z: 0 },
    { x: 400, z: 0 },
    { x: 400, z: 300 },
    { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [{ id: 20, type: "door", wall: 1, s: 200, width: 90, height: 210 }];
  S.mep = null;
}

test("wall routing treats a door as a hard break and goes around the room", () => {
  plan();
  const router = makeRouter(true);
  const a = router.tap({ x: 50, z: 0 }, 1, 50);
  const b = router.tap({ x: 350, z: 0 }, 1, 350);
  const path = router.path(a, b);
  assert.equal(path.blocked, undefined);
  assert.ok(path.pts.some((p) => p.z > 250), "route should use the clear walls opposite the door");

  S.walls = [S.walls[0]];
  const isolated = makeRouter(true);
  const ia = isolated.tap({ x: 50, z: 0 }, 1, 50);
  const ib = isolated.tap({ x: 350, z: 0 }, 1, 350);
  assert.equal(isolated.path(ia, ib).blocked, true, "router must not fall back through the door");
});

test("routing planes are constrained by service type", () => {
  plan();
  assert.deepEqual(allowedLayersFor("water", "cold", "run"), ["floor", "wall"]);
  assert.equal(defaultLayerFor("water", "cold", "run"), "floor");
  assert.deepEqual(allowedLayersFor("drain", "waste", "run"), ["floor"]);
  const waste = addRun("drain", "waste", [{ x: 20, z: 20 }, { x: 100, z: 20 }], null, null, "wall");
  assert.equal(waste.layer, "floor", "invalid wall drainage is healed to under-floor");
});

test("door conflicts are audited and exposed ducts sit below the ceiling", () => {
  plan();
  const crossing = {
    sys: "power",
    k: "circuit",
    layer: "wall",
    dia: 2,
    pts: [{ x: 40, z: 0 }, { x: 360, z: 0 }],
  };
  assert.equal(runCrossesOpening(crossing), true);
  crossing.layer = "floor";
  assert.equal(runCrossesOpening(crossing), false, "under-floor service may pass below a doorway");

  const duct = addRun("hvac", "duct", [{ x: 40, z: 80 }, { x: 300, z: 80 }]);
  assert.equal(duct.layer, "ceiling");
  assert.equal(duct.exposed, true);
  assert.ok(runPointY(duct)[0] < 255, "duct centre must be visibly below a 270cm ceiling");
});

test("a socket isolated by a door is repaired through a ceiling bridge", () => {
  plan();
  S.walls = [S.walls[0]];
  addNode("power", "panel", 50, 0, 1, 50, "wall");
  addNode("power", "outlet", 350, 0, 1, 350, "wall");
  assert.equal(unconnectedNodes().length, 1);
  const result = connectMissingMEP();
  assert.equal(result.made, 1);
  assert.equal(unconnectedNodes().length, 0);
  assert.equal(S.mep.runs[0].layer, "ceiling", "the repair must pass above, never through, the door");
});

test("preferred and required routing policies control generated run planes", () => {
  plan();
  setRoutingPolicy("power", "circuit", "require", "floor");
  assert.deepEqual(effectiveRunLayers("power", "circuit"), ["floor"]);
  const forced = addRun("power", "circuit", [{ x: 20, z: 40 }, { x: 180, z: 40 }], null, null, "wall");
  assert.equal(forced.layer, "floor");

  setRoutingPolicy("water", "cold", "prefer", "wall");
  const preferred = addRun("water", "cold", [{ x: 20, z: 80 }, { x: 180, z: 80 }], null, null, "floor");
  assert.equal(preferred.layer, "floor", "an explicit plane wins over a preference");
  setRoutingPolicy("water", "cold", "prefer", "wall");
  assert.equal(preferred.layer, "floor", "changing a preference does not move a run already drawn");
  assert.equal(generationLayer("water", "cold", "floor", preferred.pts), "wall");

  setRoutingPolicy("power", "circuit", "auto", "wall");
  const crossing = addRun("power", "circuit", [{ x: 40, z: 0 }, { x: 360, z: 0 }], null, null, "ceiling");
  assert.equal(crossing.layer, "ceiling");
  setRoutingPolicy("power", "circuit", "require", "wall");
  assert.equal(crossing.layer, "ceiling", "a required wall plane must not be pushed through the door");
  assert.equal(crossing.policyViolation, true);
});

test("different systems clash when they share a chase, not when they only cross planes", () => {
  plan();
  addRun("power", "circuit", [{ x: 0, z: 0 }, { x: 200, z: 0 }], null, null, "wall");
  addRun("water", "cold", [{ x: 0, z: 0 }, { x: 200, z: 0 }], null, null, "floor");
  let clashes = computeMEPClashes();
  assert.equal(clashes.length, 1, "a floor pipe traced along a wall chase is a clash");

  S.mep.runs[1].pts = [{ x: 0, z: 5 }, { x: 200, z: 5 }];
  clashes = computeMEPClashes();
  assert.equal(clashes.length, 0, "the hot-water offset of 5cm stays clear of a 4cm gap");

  S.mep.runs[1].layer = "wall";
  S.mep.runs[1].pts = [{ x: 100, z: -40 }, { x: 100, z: 40 }];
  clashes = computeMEPClashes();
  assert.equal(clashes.length, 1, "two services crossing in the same plane clash");

  S.mep.runs[1].layer = "ceiling";
  clashes = computeMEPClashes();
  assert.equal(clashes.length, 0, "a right-angle crossing of different planes is not a clash");

  addRun("power", "circuit", [{ x: 0, z: 40 }, { x: 80, z: 40 }], null, null, "wall");
  clashes = computeMEPClashes();
  assert.equal(clashes.filter((c) => c.sysA === "power" && c.sysB === "power").length, 0);

  S.mep.runs = [];
  addRun("power", "circuit", [{ x: 0, z: 0 }, { x: 100, z: 0 }], null, null, "wall");
  addRun("water", "cold", [{ x: 0, z: 3 }, { x: 100, z: 30 }], null, null, "floor");
  assert.equal(computeMEPClashes().length, 0, "diverging runs are not a shared chase");
});

test("a required wall cannot be applied through a door, and a required ceiling is revealed", () => {
  plan();
  setRoutingPolicy("water", "cold", "require", "wall");
  const blocked = addRun("water", "cold", [{ x: 40, z: 0 }, { x: 360, z: 0 }], null, null, "floor");
  assert.equal(blocked.layer, "floor");
  assert.equal(blocked.policyViolation, true);
  assert.equal(setMEPLayer(blocked, "wall"), false);
  assert.equal(blocked.layer, "floor");

  setRoutingPolicy("power", "circuit", "auto", "wall");
  const run = addRun("power", "circuit", [{ x: 20, z: 40 }, { x: 180, z: 40 }], null, null, "wall");
  S.mep.xray.ceiling = false;
  setRoutingPolicy("power", "circuit", "require", "ceiling");
  assert.equal(run.layer, "ceiling");
  assert.equal(S.mep.xray.ceiling, true);
});

test("a ceiling repair still bridges two walls that do not meet", () => {
  plan();
  S.nodes = [{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 0, z: 400 }, { x: 200, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 2, b: 3, thickness: 10, height: 270 },
  ];
  S.openings = [];
  const net = makeRouter(false);
  const a = net.tap({ x: 40, z: 0 }, 1, 40);
  const b = net.tap({ x: 40, z: 400 }, 2, 40);
  const path = net.pathToSet(b, [a]);
  assert.ok(path && path.pts.length >= 2, "ceiling routing may drop straight across a gap");
  const wall = makeRouter(true);
  const wa = wall.tap({ x: 40, z: 0 }, 1, 40);
  const wb = wall.tap({ x: 40, z: 400 }, 2, 40);
  assert.equal(wall.pathToSet(wb, [wa]), null, "a wall chase still fails closed");
});

test("auto-generate does not run without a room, and asks before replacing a network", () => {
  let asked = 0;
  const ask = () => { asked++; return false; };
  assert.equal(decideAutoGenerate(0, 4, ask), "need-room");
  assert.equal(asked, 0, "no room means there is nothing to replace");
  assert.equal(decideAutoGenerate(1, 0, ask), "run");
  assert.equal(asked, 0, "an empty network does not need confirmation");
  assert.equal(decideAutoGenerate(1, 3, ask), "cancelled");
  assert.equal(asked, 1);
  assert.equal(decideAutoGenerate(1, 3, () => true), "run");
});

test("a passage blocks a wall chase the same way a door does", () => {
  plan();
  S.openings = [{ id: 21, type: "passage", wall: 1, s: 200, width: 90, height: 210 }];
  assert.equal(runCrossesOpening({
    sys: "power", k: "circuit", layer: "wall", dia: 2,
    pts: [{ x: 40, z: 0 }, { x: 360, z: 0 }],
  }), true);
  assert.equal(runCrossesOpening({
    sys: "power", k: "circuit", layer: "ceiling", dia: 2,
    pts: [{ x: 40, z: 0 }, { x: 360, z: 0 }],
  }), false);
});

test("editing a routing rule does not force floor x-ray unless a run moves under the floor", () => {
  plan();
  const run = addRun("power", "circuit", [{ x: 20, z: 40 }, { x: 180, z: 40 }], null, null, "wall");
  S.mep.xray.floor = false;
  setRoutingPolicy("power", "circuit", "prefer", "ceiling");
  assert.equal(run.layer, "wall", "a preference does not move a run already drawn");
  assert.equal(S.mep.xray.floor, false, "a ceiling preference must leave a hidden floor hidden");
  setRoutingPolicy("power", "circuit", "require", "floor");
  assert.equal(run.layer, "floor");
  assert.equal(S.mep.xray.floor, true);
});

test("changing an outlet into a light keeps its place and leaves the wall", () => {
  plan();
  const n = addNode("power", "outlet", 0, 0, 1, 100, "wall");
  assert.equal(nodePos(n).x, 100);
  assert.equal(setNodeKind(n, "light"), true);
  assert.equal(n.k, "light");
  assert.equal(n.layer, "ceiling");
  assert.equal(n.wall, null);
  assert.equal(n.s, null);
  assert.equal(n.x, 100);
  assert.equal(n.z, 0);
  assert.equal(n.elev, 240);
  assert.equal(nodePos(n).x, 100);
});

test("a wall device with a lost station stays where it was stored", () => {
  plan();
  const n = addNode("power", "outlet", 80, 15, 1, 80, "wall");
  n.s = null;
  assert.deepEqual(nodePos(n), { x: 80, z: 15 });
});

test("saved networks keep a device at the wall start and reject corrupt geometry", () => {
  plan();
  loadMEP({
    nodes: [
      { id: 5, sys: "power", k: "outlet", layer: "wall", x: 12, z: 4, wall: 1, s: 0 },
      { id: 5, sys: "power", k: "switch", layer: "wall", x: 80, z: 9, wall: 1 },
      { id: 6, sys: "power", k: "light", layer: "ceiling", x: 40, z: 40, wall: 1, s: 40 },
    ],
    runs: [
      { id: 9, sys: "power", k: "circuit", pts: [{ x: 1, z: 1 }] },
      { id: 9, sys: "power", k: "circuit", layer: "wall", pts: [{ x: 0, z: 0 }, { x: 40, z: 0 }] },
      { id: 8, sys: "drain", k: "waste", layer: "wall", dia: -3, pts: [{ x: 0, z: 0 }, { x: 50, z: 0 }] },
    ],
  });
  const nodes = S.mep.nodes;
  assert.equal(nodes[0].id, 5);
  assert.equal(nodes[0].s, 0);
  assert.equal(nodes[0].wall, 1);
  assert.equal(nodePos(nodes[0]).x, 0);
  assert.notEqual(nodes[1].id, 5);
  assert.equal(nodes[1].wall, null);
  assert.equal(nodes[1].x, 80);
  assert.equal(nodes[2].layer, "ceiling");
  assert.equal(nodes[2].wall, null);
  assert.equal(S.mep.runs.length, 2);
  assert.equal(new Set(S.mep.runs.map((r) => r.id)).size, 2);
  const waste = S.mep.runs.find((r) => r.k === "waste");
  assert.equal(waste.layer, "floor");
  assert.equal(waste.dia, 6);
});

test("touch tolerance and endpoint links agree on what is connected", () => {
  plan();
  const outlet = addNode("power", "outlet", 50, 11.5, null, null, "wall");
  addRun("power", "circuit", [{ x: 0, z: 0 }, { x: 100, z: 0 }], null, null, "wall");
  assert.equal(isNodeConnected(outlet), true, "11.5cm is inside the shared 12cm touch radius");

  const far = addNode("power", "outlet", 380, 0, 1, 380, "wall");
  const panel = addNode("power", "panel", 10, 0, 1, 10, "wall");
  const spur = addRun("power", "circuit", [{ x: 10, z: 0 }, { x: 30, z: 0 }], panel.id, null, "wall");
  assert.equal(getMEPState().status.node[far.id], "orphan");
  spur.b = far.id;
  const after = getMEPState();
  assert.equal(after.status.node[far.id], undefined, "an explicit endpoint link reaches the panel");
  assert.equal(isNodeConnected(far), true);
});

test("waste repaired toward a stack falls downhill, and outlets branch instead of starring", () => {
  plan();
  const trap = addNode("drain", "trap", 80, 40, null, null, "floor");
  const stack = addNode("drain", "stack", 300, 40, null, null, "floor");
  const drain = connectMissingMEP();
  assert.equal(drain.made, 1);
  const waste = S.mep.runs[0];
  assert.equal(waste.k, "waste");
  assert.equal(waste.layer, "floor");
  assert.ok(waste.fall > 0);
  const ys = runPointY(waste);
  assert.ok(ys[0] > ys[ys.length - 1], "the upstream end sits higher");
  const trapP = nodePos(trap), stackP = nodePos(stack);
  const toTrap = Math.hypot(waste.pts[0].x - trapP.x, waste.pts[0].z - trapP.z);
  const toStack = Math.hypot(waste.pts[0].x - stackP.x, waste.pts[0].z - stackP.z);
  assert.ok(toTrap < toStack, "the high end is the trap, not the stack");

  S.mep.nodes = [];
  S.mep.runs = [];
  S.openings = [];
  addNode("power", "panel", 40, 0, 1, 40, "wall");
  addNode("power", "outlet", 90, 0, 1, 90, "wall");
  addNode("power", "outlet", 150, 0, 1, 150, "wall");
  const power = connectMissingMEP();
  assert.equal(power.made, 2);
  assert.equal(unconnectedNodes().length, 0);
  assert.equal(S.mep.runs.length, 2);
  const total = S.mep.runs.reduce((sum, r) => sum + runLength(r), 0);
  assert.ok(total < 140, "the farther outlet spurs off the first circuit, total " + total);
});

test("a diffuser is not repaired to the outdoor condenser", () => {
  plan();
  addNode("hvac", "condenser", 20, 20, null, null, "floor");
  addNode("hvac", "supply", 200, 80, null, null, "ceiling");
  const result = connectMissingMEP();
  assert.equal(result.made, 0);
  assert.equal(result.skipped, 1);
  assert.equal(S.mep.runs.length, 0);
});

test("a run vertex stays grabbable when the stroke is the closer target", () => {
  plan();
  S.layers.mep.vis = "show";
  addRun("power", "circuit", [{ x: 0, z: 0 }, { x: 200, z: 0 }], null, null, "wall");
  const vertex = hitMEP(4, 3);
  assert.equal(vertex.kind, "mepRun");
  assert.equal(vertex.vi, 0, "the handle wins inside its radius");
  const span = hitMEP(100, 3);
  assert.equal(span.vi, -1, "mid-span still selects the whole run");
  S.mep.vis.power = false;
  assert.equal(hitMEP(4, 3), null, "a hidden system leaves the pointer");
});
