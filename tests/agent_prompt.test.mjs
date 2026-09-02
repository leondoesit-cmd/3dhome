import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_WORKFLOW,
  buildAgentSystemPrompt,
  itemPlanBounds,
  operationsFromAssistantContent,
  spatialDigest,
} from "../js/agent_prompt.js";

const scene = {
  nodes: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }],
  walls: [
    { id: "top", a: 0, b: 1, thickness: 10 },
    { id: "right", a: 1, b: 2, thickness: 10 },
    { id: "bottom", a: 2, b: 3, thickness: 10 },
    { id: "left", a: 3, b: 0, thickness: 10 },
  ],
  items: [
    { id: 10, type: "tv", x: 200, z: 28, w: 120, d: 40, h: 55, rot: 0 },
    { id: 15, type: "fridge", x: 355, z: 55, w: 70, d: 70, h: 185, rot: 0 },
  ],
};

test("system prompt makes semantic placement tool-only and treats the digest as descriptive", () => {
  const prompt = buildAgentSystemPrompt({ domain: "planner" });
  assert.match(AGENT_WORKFLOW, /preview_item_snap/);
  assert.match(prompt, /Never paste command JSON/);
  assert.match(prompt, /x,z is the CENTER/);
  assert.match(prompt, /face omitted \(defaults to both\)/);
  assert.match(prompt, /descriptive only; it is never placement authority/);
  assert.match(prompt, /Never use it to infer snap, beside, wall, or facing geometry/);
  assert.doesNotMatch(prompt, /namedWalls|interior face/);
  assert.match(prompt, /Live project context/);
  assert.match(prompt, /"domain":"planner"/);
});

test("spatial digest reports descriptive walls and rotated item bounds without a fake named-wall model", () => {
  const spatial = spatialDigest(scene, { labelOf: (it) => it.type === "tv" ? "TV" : it.type });
  assert.equal(spatial.units, "cm");
  assert.deepEqual(spatial.planBounds, { minx: 0, maxx: 400, minz: 0, maxz: 300, width: 400, depth: 300 });
  assert.equal(spatial.walls.length, 4);
  assert.equal("namedWalls" in spatial, false);
  const tv = spatial.items.find((item) => item.id === 10);
  assert.equal(tv.label, "TV");
  assert.deepEqual(tv.bounds, { minx: 140, maxx: 260, minz: 8, maxz: 48 });
});

test("item AABB follows rotation for descriptive context", () => {
  const flat = itemPlanBounds({ x: 200, z: 28, w: 120, d: 40, rot: 0 });
  const turned = itemPlanBounds({ x: 375, z: 28, w: 120, d: 40, rot: 90 });
  assert.equal(Math.round(flat.maxx - flat.minx), 120);
  assert.equal(Math.round(turned.maxx - turned.minx), 40);
});

test("dumped assistant JSON is recovered as preview operations", () => {
  const dumped = "```json\n" + JSON.stringify([
    { commandId: "item.move", params: { itemId: 10, x: 375, z: 28, rot: 90 } },
    { commandId: "item.move", params: { itemId: 15, x: 240, z: 42 } },
  ], null, 2) + "\n```";
  assert.deepEqual(operationsFromAssistantContent(dumped), [
    { commandId: "item.move", params: { itemId: 10, x: 375, z: 28, rot: 90 } },
    { commandId: "item.move", params: { itemId: 15, x: 240, z: 42 } },
  ]);
  assert.deepEqual(operationsFromAssistantContent(JSON.stringify({
    mode: "propose", proposedOperations: [{ commandId: "item.place", params: { type: "sofa", x: 200, z: 200 } }],
  })), [{ commandId: "item.place", params: { type: "sofa", x: 200, z: 200 } }]);
  assert.deepEqual(operationsFromAssistantContent("I need a wall first."), []);
});
