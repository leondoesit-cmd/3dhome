import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  addRoomArea, addRoomMinDim, addRoomRect, roomAreaM2, roomMinDim,
  roomConError, roomConSatisfied, roomIssues, solveRoomCons, pruneRoomCons,
  roomCons,
} from "../js/room_cons.js";
import {
  addPlanVar, setPlanVar, resolvePlanParams, setConExpr, planVars, nameFree,
} from "../js/plan_params.js";
import { addDistance, nodeAnchor, solveWallCons, conSatisfied } from "../js/wall_constraints.js";
import { detectRooms } from "../js/geometry.js";

/* A closed 400 x 300 room: 12 m². */
function roomPlan() {
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.items = []; S.markers = [];
  S.wallCons = []; S.roomCons = []; S.planVars = []; S.roomMeta = {};
  return detectRooms()[0];
}

test("a room's area and narrowest span are measured in brief-friendly units", () => {
  const r = roomPlan();
  assert.equal(Math.round(roomAreaM2(r.key) * 100) / 100, 12, "square metres");
  assert.equal(Math.round(roomMinDim(r.key)), 300, "centimetres");
});

test("an area requirement is a MINIMUM by default, so bigger passes", () => {
  const r = roomPlan();
  const c = addRoomArea(r.key, 11);
  assert.equal(c.mode, "min");
  assert.ok(roomConSatisfied(c), "12 m² meets a minimum of 11");
  c.value = 15;
  assert.equal(roomConSatisfied(c), false);
  assert.equal(Math.round(roomConError(c)), 3);
});

test("an area check never moves anything", () => {
  const r = roomPlan();
  addRoomArea(r.key, 40); // wildly unmet
  const before = JSON.stringify(S.nodes);
  solveRoomCons();
  assert.equal(JSON.stringify(S.nodes), before,
    "the plan was reported on, not rearranged");
  assert.equal(roomIssues().length, 1);
});

test("minimum dimension catches a pinch a bounding box would miss", () => {
  const r = roomPlan();
  const c = addRoomMinDim(r.key, 240);
  assert.ok(roomConSatisfied(c));
  // squeeze one wall in so the room is 90 cm at its narrowest
  S.nodes[3].z = 90; S.nodes[2].z = 90;
  assert.equal(roomConSatisfied(c), false);
  assert.equal(Math.round(roomConError(c)), 150);
});

test("squaring up a four-corner room drives its corners", () => {
  const r = roomPlan();
  S.nodes[2].x = 445; S.nodes[2].z = 330; // knock one corner out
  const c = addRoomRect(r.key);
  assert.ok(c);
  assert.ok(roomConError(c) > 1, "it starts out of square");
  solveRoomCons();
  assert.ok(roomConSatisfied(c), "and is square afterwards");
});

test("squaring up refuses a room that is not four corners", () => {
  roomPlan();
  // add a fifth corner by splitting one wall
  S.nodes.push({ x: 200, z: 300 });
  S.walls[2].b = 4;
  S.walls.push({ id: 5, a: 4, b: 3, thickness: 10, height: 270 });
  const key = detectRooms()[0].key;
  assert.equal(addRoomRect(key), null);
});

test("a requirement about a room that is gone is pruned", () => {
  const r = roomPlan();
  addRoomArea(r.key, 11);
  assert.equal(roomCons().length, 1);
  S.walls = S.walls.filter((w) => w.id !== 3); // open the loop
  assert.equal(pruneRoomCons(), 1);
  assert.equal(roomCons().length, 0);
});

/* ---- named parameters --------------------------------------------------- */

test("a named parameter drives a dimension, and one edit moves everything", () => {
  roomPlan();
  addPlanVar("corridor", "120");
  const a = addDistance(nodeAnchor(0, 1, "a"), nodeAnchor(1, 1, "b"), 400, "a");
  setConExpr(a.id, "corridor * 2");
  resolvePlanParams();
  assert.equal(a.value, 240);
  solveWallCons();
  assert.ok(conSatisfied(a));

  setPlanVar(planVars()[0].id, null, "150");
  resolvePlanParams();
  assert.equal(a.value, 300);
});

test("parameters can be written in terms of each other", () => {
  roomPlan();
  addPlanVar("w", "300");
  addPlanVar("halfW", "w / 2");
  const r = resolvePlanParams();
  assert.equal(r.named.find((v) => v.name === "halfW").value, 150);
  assert.equal(r.errors.length, 0);
});

test("a circular reference is reported, not thrown, and nothing is corrupted", () => {
  roomPlan();
  addPlanVar("a", "b + 1");
  addPlanVar("b", "a + 1");
  const r = resolvePlanParams();
  assert.ok(r.errors.length, "the cycle was reported");
  assert.ok(r.errors.some((e) => /circular/i.test(e.message)));
});

test("a typo leaves the last good value in place instead of stopping the plan", () => {
  roomPlan();
  addPlanVar("w", "300");
  const c = addDistance(nodeAnchor(0, 1, "a"), nodeAnchor(1, 1, "b"), 400, "a");
  setConExpr(c.id, "w");
  resolvePlanParams();
  assert.equal(c.value, 300);
  setConExpr(c.id, "w +");           // mid-typing
  const r = resolvePlanParams();
  assert.ok(r.errors.length);
  assert.equal(c.value, 300, "the dimension kept the number it had");
});

test("expressions never reach eval", () => {
  roomPlan();
  addPlanVar("w", "300");
  const c = addDistance(nodeAnchor(0, 1, "a"), nodeAnchor(1, 1, "b"), 400, "a");
  // anything that is not arithmetic must be refused by the parser, not run
  setConExpr(c.id, "globalThis.__pwned = 1");
  const r = resolvePlanParams();
  assert.ok(r.errors.length, "refused");
  assert.equal(globalThis.__pwned, undefined, "and did not execute");
  assert.equal(c.value, 400, "the dimension is untouched");
});

test("a duplicate parameter name is refused", () => {
  roomPlan();
  addPlanVar("w", "300");
  assert.equal(nameFree("w"), false);
  assert.equal(addPlanVar("w", "400"), null);
  assert.equal(planVars().length, 1);
});
