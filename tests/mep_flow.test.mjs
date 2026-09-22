import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { addNode, addRun, computeMEPFlow } from "../js/mep.js";

function bare() {
  S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [];
  S.mep = null;
}

test("each service moves the way that service moves in a building", () => {
  bare();
  const panel = addNode("power", "panel", 0, 0, null, null, "wall");
  addNode("power", "outlet", 120, 0, null, null, "wall");
  const circuit = addRun("power", "circuit", [{ x: 0, z: 0 }, { x: 120, z: 0 }], panel.id, null, "wall");

  const manifold = addNode("water", "manifold", 0, 40, null, null, "floor");
  addNode("water", "fixture", 160, 40, null, null, "wall");
  const cold = addRun("water", "cold", [{ x: 0, z: 40 }, { x: 160, z: 40 }], manifold.id, null, "floor");

  const stack = addNode("drain", "stack", 0, 80, null, null, "floor");
  addNode("drain", "trap", 200, 80, null, null, "floor");
  const waste = addRun("drain", "waste", [{ x: 200, z: 80 }, { x: 0, z: 80 }], null, stack.id, "floor");
  waste.fall = 4;
  const backwards = addRun("drain", "waste", [{ x: 0, z: 100 }, { x: 200, z: 100 }], stack.id, null, "floor");
  backwards.fall = 4;
  const level = addRun("drain", "waste", [{ x: 200, z: 120 }, { x: 0, z: 120 }], null, stack.id, "floor");

  addNode("drain", "vent", 140, 80, null, null, "ceiling");
  const vent = addRun("drain", "vent", [{ x: 0, z: 80 }, { x: 140, z: 80 }], stack.id, null, "ceiling");

  const rack = addNode("comms", "rack", 0, 160, null, null, "wall");
  addNode("comms", "port", 100, 160, null, null, "wall");
  const data = addRun("comms", "cat6", [{ x: 0, z: 160 }, { x: 100, z: 160 }], rack.id, null, "wall");
  const coax = addRun("comms", "coax", [{ x: 0, z: 180 }, { x: 100, z: 180 }], rack.id, null, "wall");

  const unit = addNode("hvac", "unit", 0, 220, null, null, "ceiling");
  addNode("hvac", "supply", 150, 220, null, null, "ceiling");
  addNode("hvac", "return", 150, 250, null, null, "ceiling");
  const supply = addRun("hvac", "branch", [{ x: 0, z: 220 }, { x: 150, z: 220 }], unit.id, null, "ceiling");
  const ret = addRun("hvac", "return", [{ x: 0, z: 250 }, { x: 150, z: 250 }], unit.id, null, "ceiling");
  const condensate = addRun("hvac", "condensate", [{ x: 0, z: 260 }, { x: 80, z: 260 }], unit.id, null, "ceiling");

  const flow = computeMEPFlow();
  assert.equal(flow[circuit.id].flow, "supply");
  assert.equal(flow[circuit.id].dir, 1, "power leaves the panel");
  assert.equal(flow[cold.id].flow, "supply");
  assert.equal(flow[cold.id].dir, 1, "water leaves the manifold");
  assert.equal(flow[cold.id].uphill, false);

  assert.equal(flow[waste.id].flow, "gravity");
  assert.equal(flow[waste.id].dir, 1, "waste runs from the trap toward the stack");
  assert.equal(flow[waste.id].uphill, false);
  assert.equal(flow[backwards.id].uphill, true, "a stack at the high end is uphill");
  assert.equal(flow[backwards.id].dir, -1, "the arrow still points at the stack");
  assert.equal(flow[level.id].uphill, true, "a level waste pipe does not fall");

  const other = addNode("drain", "stack", 200, 90, null, null, "floor");
  const towardFar = addRun("drain", "waste", [{ x: 0, z: 140 }, { x: 200, z: 140 }], null, other.id, "floor");
  towardFar.fall = 4;
  assert.equal(computeMEPFlow()[towardFar.id].uphill, false, "a second stack nearer the high end does not count");

  assert.equal(flow[vent.id].flow, "vent");
  assert.equal(flow[vent.id].dir, 1, "the vent leaves the stack instead of draining into it");
  assert.equal(flow[vent.id].uphill, false);

  assert.equal(flow[data.id].flow, "signal");
  assert.equal(flow[data.id].alive, true);
  assert.equal(flow[coax.id].flow, "supply");
  assert.equal(flow[coax.id].dir, 1, "coax still leaves the source");

  assert.equal(flow[supply.id].flow, "supply");
  assert.equal(flow[supply.id].dir, 1, "supply air leaves the fan coil");
  assert.equal(flow[ret.id].flow, "return");
  assert.equal(flow[ret.id].dir, -1, "return air comes back to the fan coil");
  assert.equal(flow[condensate.id].flow, "gravity");
  assert.equal(flow[condensate.id].uphill, true, "condensate with no fall is flagged");
});
