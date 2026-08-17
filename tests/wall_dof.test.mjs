import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  addDistance, addFixed, addWallRelation, addCoincident, addJointAngle,
  nodeAnchor, solveWallCons, setConReport, addPointOnLine, conSatisfied,
  addOpeningCentre, addOpeningFromCorner, addOpeningAlign, addOpeningSpacing,
  openingPos,
} from "../js/wall_constraints.js";
import { planDof, conResiduals } from "../js/wall_dof.js";

/* A free-standing rectangle: 4 corners, 4 walls, nothing stated about it. */
function boxPlan() {
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.items = []; S.markers = []; S.wallCons = [];
}

test("an undimensioned plan is all freedoms", () => {
  boxPlan();
  const d = planDof();
  assert.equal(d.variableCount, 8, "two coordinates per corner");
  assert.equal(d.degreesOfFreedom, 8);
  assert.equal(d.status, "under-constrained");
});

test("a pin closes two freedoms and stops being a variable", () => {
  boxPlan();
  addFixed(nodeAnchor(0, 1, "a"));
  const d = planDof();
  assert.equal(d.variableCount, 6, "the pinned corner is no longer a variable");
  assert.equal(d.degreesOfFreedom, 6);
});

test("coincident removes two freedoms, a distance removes one", () => {
  boxPlan();
  const before = planDof().degreesOfFreedom;
  addDistance(nodeAnchor(0, 1, "a"), nodeAnchor(1, 1, "b"), 400, "a");
  assert.equal(planDof().degreesOfFreedom, before - 1);

  boxPlan();
  S.nodes.push({ x: 900, z: 900 });
  S.walls.push({ id: 5, a: 2, b: 4, thickness: 10, height: 270 });
  const withArm = planDof().degreesOfFreedom;
  addCoincident(nodeAnchor(0, 1, "a"), nodeAnchor(4, 5, "b"), "a");
  assert.equal(planDof().degreesOfFreedom, withArm - 2,
    "a coincident constraint is two equations, not one");
});

test("a fully pinned, fully dimensioned plan reports no freedoms left", () => {
  boxPlan();
  addFixed(nodeAnchor(0, 1, "a"));
  addFixed(nodeAnchor(1, 1, "b"));
  addFixed(nodeAnchor(2, 2, "b"));
  addFixed(nodeAnchor(3, 3, "b"));
  const d = planDof();
  assert.equal(d.variableCount, 0);
  assert.equal(d.degreesOfFreedom, 0);
  assert.equal(d.status, "fully-constrained");
});

test("contradictory dimensions are named, not just counted", () => {
  boxPlan();
  const a = addDistance(nodeAnchor(0, 1, "a"), nodeAnchor(1, 1, "b"), 400, "a");
  addFixed(nodeAnchor(0, 1, "a"));
  addFixed(nodeAnchor(1, 1, "b"));
  a.value = 999; // neither end may move, so this cannot be met
  solveWallCons();
  const d = planDof();
  assert.equal(d.status, "conflicting");
  assert.ok(d.conflicts.includes(a.id), "the offending dimension is identified by id");
});

test("stating the same thing twice reads as over-constrained", () => {
  boxPlan();
  addFixed(nodeAnchor(0, 1, "a"));
  addFixed(nodeAnchor(1, 1, "b"));
  addFixed(nodeAnchor(2, 2, "b"));
  addFixed(nodeAnchor(3, 3, "b"));
  // wall 1 is already horizontal by virtue of its two pinned ends
  addWallRelation("horizontal", 1);
  const d = planDof();
  assert.equal(d.degreesOfFreedom, 0);
  assert.ok(d.redundant, "the extra equation was noticed");
  assert.equal(d.status, "over-constrained");
});

test("suppressed and reference dimensions constrain nothing", () => {
  boxPlan();
  const c = addDistance(nodeAnchor(0, 1, "a"), nodeAnchor(1, 1, "b"), 400, "a");
  const free = 8;
  assert.equal(planDof().degreesOfFreedom, free - 1);
  setConReport(c.id, true);
  assert.equal(planDof().degreesOfFreedom, free, "a reference dimension is not an equation");
  assert.deepEqual(conResiduals(c), []);
  c.report = false; c.off = true;
  assert.equal(planDof().degreesOfFreedom, free, "nor is a suppressed one");
});

test("point-on-line removes exactly one freedom, midpoint two", () => {
  boxPlan();
  S.nodes.push({ x: 200, z: 40 });
  S.walls.push({ id: 5, a: 4, b: 2, thickness: 10, height: 270 });
  const base = planDof().degreesOfFreedom;
  const l = addPointOnLine(nodeAnchor(4, 5, "a"), 1);
  assert.equal(planDof().degreesOfFreedom, base - 1,
    "the corner may still slide along the line");
  assert.equal(conResiduals(l).length, 1);
});

test("a joint angle is one equation", () => {
  boxPlan();
  const base = planDof().degreesOfFreedom;
  addJointAngle(nodeAnchor(1, 1, "b"), 1, 2, 90);
  assert.equal(planDof().degreesOfFreedom, base - 1);
});

/* ---- openings ---------------------------------------------------------- */

function boxWithWindows() {
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [
    { id: "o1", type: "window", wall: 1, s: 60, width: 80, height: 120 },
    { id: "o2", type: "window", wall: 1, s: 190, width: 80, height: 120 },
    { id: "o3", type: "window", wall: 1, s: 330, width: 80, height: 120 },
    { id: "o4", type: "window", wall: 3, s: 100, width: 80, height: 120 },
  ];
  S.items = []; S.markers = []; S.wallCons = [];
}

test("an undimensioned opening is not counted as a freedom", () => {
  boxWithWindows();
  assert.equal(planDof().variableCount, 8, "only the four corners");
});

/* Regression: opening ids are numbers in the running app (uid()), and the
   variable set used to be collected in an object, whose keys are strings. The
   lookup back to the opening then failed and the freedom the constraint closed
   was never counted, so the plan read one degree of freedom too few. */
test("openings with NUMERIC ids are still counted as variables", () => {
  boxWithWindows();
  S.openings.forEach(function (o, i) { o.id = 1000 + i; });
  const free = planDof().variableCount;
  addOpeningCentre(1000);
  const d = planDof();
  assert.equal(d.variableCount, free + 1, "the opening became a variable");
  assert.equal(d.degreesOfFreedom, free, "and its own dimension closed it again");
});

test("centring a window in its wall costs it its freedom, and holds", () => {
  boxWithWindows();
  const c = addOpeningCentre("o1");
  assert.ok(c);
  const d = planDof();
  assert.equal(d.variableCount, 9, "the dimensioned opening became a variable");
  assert.equal(d.degreesOfFreedom, 8, "and its own dimension closed it again");
  solveWallCons();
  /* Centred BETWEEN THE FACES: with an equal corner cut at each end that is
     still the middle of the 400 wall, but the constraint is now stated on the
     same reference face as every other length on the plan (js/geometry.js
     openFaceDist), so it no longer drifts when a neighbour changes thickness. */
  assert.equal(S.openings[0].s, 200, "wall 1 is 400 long, so centre is 200");
  assert.ok(conSatisfied(c));

  // the wall grows: the window stays centred instead of drifting
  S.nodes[1].x = 600;
  solveWallCons();
  assert.ok(conSatisfied(c), "still centred between the faces");
  assert.ok(Math.abs(S.openings[0].s - 300) < 3, "and still near the middle");
});

test("a window can be held a fixed distance from a NAMED corner", () => {
  boxWithWindows();
  const c = addOpeningFromCorner("o1", "b", 90);
  solveWallCons();
  assert.ok(conSatisfied(c));
  /* 90 from the FINISHED FACE at end b. The corner cut there is half the
     neighbouring wall (5 cm), so the centreline distance is 400 − 5 − 90. */
  assert.equal(Math.round(S.openings[0].s), 305, "90 from the face at end b");
  // redrawing the wall longer moves it, because it is pinned to the FAR corner
  S.nodes[1].x = 500;
  solveWallCons();
  /* 500 long now, and dragging that corner sideways also left the joint
     oblique, which deepens the mitre cut there — the window tracks the FACE,
     which is the whole point of the constraint. */
  assert.equal(Math.round(S.openings[0].s), 403);
  assert.ok(conSatisfied(c));
});

test("three windows on one wall can be evenly spaced", () => {
  boxWithWindows();
  const c = addOpeningSpacing(["o1", "o2", "o3"]);
  solveWallCons();
  assert.ok(conSatisfied(c));
  assert.equal(Math.round(S.openings[1].s), 195, "midway between 60 and 330");
});

test("two windows on different walls can be lined up on an axis", () => {
  boxWithWindows();
  // wall 1 runs along x at z=0; wall 3 runs back along x at z=300
  const c = addOpeningAlign("o1", "o4", "x");
  solveWallCons();
  assert.ok(conSatisfied(c));
  const p1 = openingPos(S.openings[0]), p4 = openingPos(S.openings[3]);
  assert.equal(Math.round(p1.x), Math.round(p4.x));
});

test("an opening is never solved off the end of its own wall", () => {
  boxWithWindows();
  // ask for a distance far beyond the wall; the clamp keeps it on the wall
  const c = addOpeningFromCorner("o1", "a", 5000);
  solveWallCons();
  assert.ok(S.openings[0].s <= 400, "still inside the wall");
  assert.ok(S.openings[0].s >= 0);
  assert.equal(conSatisfied(c), false, "and it says so rather than pretending");
});
