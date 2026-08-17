import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  addRun,
  addNode,
  allowedLayersFor,
  connectMissingMEP,
  defaultLayerFor,
  effectiveRunLayers,
  runCrossesOpening,
  runPointY,
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
  // Preferences are applied to existing/generated runs as soon as the setting changes.
  setRoutingPolicy("water", "cold", "prefer", "wall");
  assert.equal(preferred.layer, "wall");
});
