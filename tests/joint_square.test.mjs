import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { jointInfo, wallGeom } from "../js/geometry.js";
import { placeSquareArm, squarableArm } from "../js/joint_square.js";

function pinnedBranchPlan() {
  S.wallCons = [];
  S.nodes = [
    { x: 390, z: 110 },
    { x: 390, z: 0 },
    { x: 390, z: 196 },
    { x: 645, z: 106.44 },
  ];
  S.walls = [
    { id: 2, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 23, a: 0, b: 2, thickness: 10, height: 270 },
    { id: 34, a: 0, b: 3, thickness: 10, height: 270 },
  ];
  var info = jointInfo(0),
    branch = info.arms.find(function (arm) { return arm.wall.id === 34; }),
    straight = info.arms.find(function (arm) { return arm.wall.id === 2; });
  return { info: info, branch: branch, straight: straight };
}

test("square-joint placement moves only the wall endpoint forming the angle", () => {
  var plan = pinnedBranchPlan(),
    fixedJoint = { x: S.nodes[0].x, z: S.nodes[0].z },
    fixedReferenceEnd = { x: S.nodes[1].x, z: S.nodes[1].z },
    oldLength = wallGeom(plan.branch.wall).L;
  var placed = placeSquareArm(0, {
    move: plan.branch,
    keep: plan.straight,
  }, {});

  assert.ok(placed);
  assert.deepEqual(S.nodes[0], fixedJoint, "the shared joint stayed fixed");
  assert.deepEqual(S.nodes[1], fixedReferenceEnd, "the reference wall stayed fixed");
  assert.ok(Math.abs(S.nodes[3].z - fixedJoint.z) < 1e-9, "the branch became horizontal");
  assert.ok(Math.abs(wallGeom(plan.branch.wall).L - oldLength) < 1e-9, "the branch kept its length");
  assert.ok(Math.abs(placed.targetDeg) < 1e-9, "the wall lock records its actual squared bearing");
  assert.equal(placed.movedEnd, "b", "only the branch's far endpoint moved");
});

test("square-joint placement refuses a pinned wall endpoint instead of moving the joint", () => {
  var plan = pinnedBranchPlan(),
    before = JSON.stringify(S.nodes);
  assert.equal(placeSquareArm(0, {
    move: plan.branch,
    keep: plan.straight,
  }, { 3: 1 }), null);
  assert.equal(JSON.stringify(S.nodes), before);
});

/* ---- which arm swings --------------------------------------------------- */

function at(deg, len) {
  var r = (deg * Math.PI) / 180;
  return { x: Math.cos(r) * len, z: Math.sin(r) * len };
}
/* An L-corner whose two arms leave the origin at the given bearings. */
function lCorner(degA, degB) {
  S.wallCons = [];
  S.nodes = [{ x: 0, z: 0 }, at(degA, 400), at(degB, 300)];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 0, b: 2, thickness: 10, height: 270 },
  ];
  return squarableArm(jointInfo(0));
}

test("the crooked arm swings and the arm already on the grid stays", () => {
  /* Same corner, twice, differing only in which arm has the lower bearing —
     which is the order jointInfo sorts them in. The picker used to take the
     first free-ended arm it found there, so half of all L-corners were squared
     by skewing the wall that was already straight. */
  var pick = lCorner(0, 85);
  assert.equal(pick.move.wall.id, 2, "the 85° arm swings");
  assert.equal(pick.keep.wall.id, 1, "the arm on the grid is the reference");

  pick = lCorner(-5, 90);
  assert.equal(pick.move.wall.id, 1, "the -5° arm swings");
  assert.equal(pick.keep.wall.id, 2, "the arm on the grid is the reference");
});

test("with neither arm on the grid the one further off it swings", () => {
  var pick = lCorner(40, 133); // 40 is 40 off the grid, 133 is 43 off
  assert.equal(pick.move.wall.id, 2);
  assert.equal(pick.keep.wall.id, 1);
});

test("a corner that already reads square offers nothing to swing", () => {
  assert.equal(lCorner(0, 90), null);
  assert.equal(lCorner(40, 130), null, "square to each other counts, off-grid or not");
  assert.equal(lCorner(0, 180), null, "a straight run through is not a corner");
});

test("a straight run through a junction holds; only the branch swings", () => {
  var plan = pinnedBranchPlan(),
    pick = squarableArm(plan.info);
  assert.equal(pick.move.wall.id, 34, "the branch is what swings");
  assert.notEqual(pick.keep.wall.id, 34);

  /* ...and when the branch cannot move, the answer is "nothing", not "then
     break the run instead". */
  S.wallCons = [{ id: 9, type: "fixed", a: { id: 34, end: "b" }, x: 645, z: 106.44 }];
  assert.equal(squarableArm(jointInfo(0)), null);
  S.wallCons = [];
});

test("naming a pair of walls picks the same arm the corner would", () => {
  /* The warning panel fixes the two walls its message names. That used to run
     a looser rule of its own, so the same corner could be squared two
     different ways depending on which button was pressed. */
  lCorner(0, 85);
  var info = jointInfo(0),
    pick = squarableArm(info, [1, 2]);
  assert.equal(pick.move.wall.id, 2);
  assert.equal(pick.keep.wall.id, 1);
  assert.equal(squarableArm(info, [1]), null, "a pair means two walls");

  var plan = pinnedBranchPlan();
  assert.equal(
    squarableArm(plan.info, [2, 23]),
    null,
    "naming the two halves of a straight run is answered by shape, not by name"
  );
});
