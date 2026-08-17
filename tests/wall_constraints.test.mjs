import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  addDistance, addJointAngle, addOffset, solveWallCons, conCurrent, conError,
  conSatisfied, pruneCons, wallCons, flipHold, consForWall, anchorLabel,
  addWallRelation, addAxisAlignment, addAxisDistance, addPointWallDistance,
  addEqualAngle, angleSectorAtNode, addEqualSpacing, nodeAnchor,
  prepareStableAnchors, rehomeAnchorOwner, mergeAnchorNodes, setConFaces,
  addFixed, pinnedNodes, setConReport, addCoincident, addSymmetric,
  addMidpoint, addPointOnLine, addEqualLengthSet, addWallAngle, removeCon,
  conIssues, setJointAngleTarget, jointAngleLengthImpact,
} from "../js/wall_constraints.js";
import { jointWarnings } from "../js/constraint_engine.js";
import { wallClearLength } from "../js/geometry.js";

/* A plain L: two walls sharing the corner at (0,0).
     w1 runs east  (0,0) -> (300,0)
     w2 runs south (0,0) -> (0,200)   [+z is south in plan coords] */
function lPlan() {
  S.nodes = [
    { x: 0, z: 0 },   // 0 - the shared joint
    { x: 300, z: 0 }, // 1
    { x: 0, z: 200 }, // 2
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 0, b: 2, thickness: 10, height: 270 },
  ];
  S.openings = [];
  S.items = [];
  S.markers = [];
  S.wallCons = [];
}

test("distance holds one side and drives the other", () => {
  lPlan();
  // measure from w2's far end (0,200) to w1's far end (300,0), holding w2's
  const c = addDistance(
    { k: "wall", id: 2, end: "b" },
    { k: "wall", id: 1, end: "b" },
    null,
    "a",
  );
  assert.ok(c);
  // seeded from the drawing, so adding it changes nothing
  assert.equal(Math.round(conCurrent(c)), Math.round(Math.hypot(300, 200)));
  const held = { ...S.nodes[2] };

  c.value = 400;
  solveWallCons();
  assert.ok(conSatisfied(c), "solver reached the requested distance");
  assert.deepEqual(S.nodes[2], held, "the held corner did not move");
  assert.equal(Math.round(Math.hypot(S.nodes[1].x - 0, S.nodes[1].z - 200)), 400);
});

test("flipping the hold drives the other corner instead", () => {
  lPlan();
  const c = addDistance(
    { k: "wall", id: 2, end: "b" },
    { k: "wall", id: 1, end: "b" },
    null,
    "a",
  );
  assert.ok(flipHold(c.id));
  c.value = 400;
  const wasDriven = { ...S.nodes[1] };
  solveWallCons();
  assert.ok(conSatisfied(c));
  assert.deepEqual(S.nodes[1], wasDriven, "previously driven corner is now held");
});

test("a marker is a datum: the wall corner moves, the point never does", () => {
  lPlan();
  S.markers = [{ id: "m1", x: 500, z: 0, name: "datum" }];
  const c = addDistance(
    { k: "marker", id: "m1" },
    { k: "wall", id: 1, end: "b" },
    120,
  );
  assert.ok(c);
  assert.equal(c.hold, "a");
  solveWallCons();
  assert.deepEqual(S.markers[0], { id: "m1", x: 500, z: 0, name: "datum" });
  assert.equal(Math.round(S.nodes[1].x), 380); // 500 - 120, back along the ray
  assert.equal(anchorLabel(c.a), "datum");
});

test("two datums cannot be constrained to each other", () => {
  lPlan();
  S.markers = [
    { id: "m1", x: 0, z: 0 },
    { id: "m2", x: 100, z: 0 },
  ];
  assert.equal(addDistance({ k: "marker", id: "m1" }, { k: "marker", id: "m2" }, 50), null);
});

test("joint angle swings the driven wall without changing its length", () => {
  lPlan();
  // hold w1 (east), swing w2 to open at 135° from it
  const c = addJointAngle({ k: "wall", id: 2, end: "a" }, 1, 2, 135);
  assert.ok(c);
  const lenBefore = Math.hypot(S.nodes[2].x, S.nodes[2].z);
  solveWallCons();
  assert.ok(conSatisfied(c), "joint opens at the requested angle");
  assert.ok(
    Math.abs(Math.hypot(S.nodes[2].x, S.nodes[2].z) - lenBefore) < 0.01,
    "the swung wall kept its length",
  );
  assert.deepEqual({ x: S.nodes[0].x, z: S.nodes[0].z }, { x: 0, z: 0 }, "the joint itself stayed put");
});

test("joint angle refuses walls that don't share a corner", () => {
  lPlan();
  S.nodes.push({ x: 900, z: 900 }, { x: 900, z: 500 });
  S.walls.push({ id: 3, a: 3, b: 4, thickness: 10, height: 270 });
  assert.equal(addJointAngle({ k: "wall", id: 2, end: "a" }, 3, 2, 90), null);
});

test("a numeric corner angle keeps an open wall chain connected without changing lengths", () => {
  lPlan();
  S.nodes.push({ x: 100, z: 200 });
  S.walls.push({ id: 3, a: 2, b: 3, thickness: 10, height: 270 });
  const sector = angleSectorAtNode(0);
  const before = S.walls.map(wallClearLength);
  assert.equal(jointAngleLengthImpact(sector, 120).needsChange, false,
    "the loose side of an open chain can follow rigidly");

  const c = setJointAngleTarget(sector, 120, false);
  solveWallCons();
  assert.ok(conSatisfied(c));
  assert.equal(S.walls[2].a, 2, "the downstream wall still shares the moved corner");
  assert.equal(S.nodes.length, 4, "no private endpoint was created");
  S.walls.forEach((w, i) => assert.ok(Math.abs(wallClearLength(w) - before[i]) < 0.25));
});

test("a numeric angle reports a closed loop before allowing wall lengths to yield", () => {
  S.interiorDims = true;
  S.nodes = [
    { x: 0, z: 0 }, { x: 200, z: 0 },
    { x: 200, z: 120 }, { x: 0, z: 120 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, dimUser: 1 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270, dimUser: 1 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270, dimUser: 1 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270, dimUser: 1 },
  ];
  S.wallCons = []; S.markers = []; S.openings = []; S.items = [];
  const sector = angleSectorAtNode(0);
  const impact = jointAngleLengthImpact(sector, 100);
  assert.equal(impact.needsChange, true);
  assert.ok(impact.walls.length >= 3, "the alternate path around the loop is identified");

  const before = S.walls.map(wallClearLength);
  const c = setJointAngleTarget(sector, 100, true);
  solveWallCons();
  assert.ok(conSatisfied(c), "the accepted numeric angle is reached");
  assert.equal(S.nodes.length, 4, "the closed room stays connected");
  assert.ok(S.walls.some((w, i) => Math.abs(wallClearLength(w) - before[i]) > 0.25),
    "permission lets at least one connected wall length adapt");
});

test("offset makes a wall parallel to another at a signed distance", () => {
  lPlan();
  // a partition roughly parallel to w1 (east-west), a bit off-angle
  S.nodes.push({ x: 20, z: 150 }, { x: 280, z: 165 });
  S.walls.push({ id: 3, a: 3, b: 4, thickness: 10, height: 270 });
  const c = addOffset(3, 1, 120);
  assert.ok(c);
  solveWallCons();
  assert.ok(conSatisfied(c));
  // w1 runs along +x from the origin, so its left normal is +z: both corners
  // of the partition should now sit at z = 120 and be exactly level
  assert.equal(Math.round(S.nodes[3].z), 120);
  assert.equal(Math.round(S.nodes[4].z), 120);
});

test("the offset sign picks a side, so a corridor cannot flip across", () => {
  lPlan();
  S.nodes.push({ x: 20, z: 150 }, { x: 280, z: 150 });
  S.walls.push({ id: 3, a: 3, b: 4, thickness: 10, height: 270 });
  const c = addOffset(3, 1, -90);
  solveWallCons();
  assert.equal(Math.round(S.nodes[3].z), -90);
  assert.ok(conSatisfied(c));
});

test("pruning drops dimensions whose geometry is gone", () => {
  lPlan();
  addDistance({ k: "wall", id: 2, end: "b" }, { k: "wall", id: 1, end: "b" }, 400);
  addOffset(2, 1, 50);
  assert.equal(wallCons().length, 2);
  S.walls = S.walls.filter((w) => w.id !== 1);
  assert.equal(pruneCons(), 2);
  assert.equal(wallCons().length, 0);
});

test("contradictory dimensions stop, and report themselves as unresolved", () => {
  lPlan();
  // the same corner asked to be at two different distances from the origin
  addDistance({ k: "wall", id: 2, end: "a" }, { k: "wall", id: 1, end: "b" }, 300);
  addDistance({ k: "wall", id: 2, end: "b" }, { k: "wall", id: 1, end: "b" }, 1000);
  const r = solveWallCons();
  assert.ok(r.unresolved >= 1, "the conflict is reported, not silently averaged");
  assert.ok(Number.isFinite(S.nodes[1].x) && Number.isFinite(S.nodes[1].z));
});

test("consForWall finds dimensions where the wall is the reference too", () => {
  lPlan();
  addOffset(2, 1, 50);
  assert.equal(consForWall(S.walls[0]).length, 1); // w1 is only the reference
  assert.equal(consForWall(S.walls[1]).length, 1);
});

test("a zero-length dimension is not a dimension", () => {
  lPlan();
  assert.equal(
    addDistance({ k: "wall", id: 1, end: "a" }, { k: "wall", id: 2, end: "a" }, 100),
    null,
    "both anchors resolve to the same corner",
  );
});

test("conError wraps angles the short way round", () => {
  lPlan();
  const c = addJointAngle({ k: "wall", id: 2, end: "a" }, 1, 2, 359);
  c.value = 359;
  // the L currently opens at 90°; nudge the target to just past the wrap
  c.value = 1;
  const err = conError(c);
  assert.ok(err <= 180, "never reports the long way around: " + err);
});

test("persistent vertex anchors survive a wall split and rehome their label", () => {
  lPlan();
  const c = addDistance({ k:"wall", id:2, end:"b" }, { k:"wall", id:1, end:"b" }, null, "a");
  prepareStableAnchors();
  const oldB = S.walls[0].b;
  const middle = S.nodes.push({ x:150, z:0 }) - 1;
  S.walls[0].b = middle;
  S.walls.push({ id:3, a:middle, b:oldB, thickness:10, height:270 });
  rehomeAnchorOwner(oldB, 1, 3, "b");
  assert.equal(Math.round(conCurrent(c)), Math.round(Math.hypot(300, 200)));
  assert.equal(anchorLabel(c.b), "W3·B");
});

test("welding vertices repoints persistent anchors", () => {
  lPlan();
  S.nodes.push({ x:300, z:0 });
  const extra = S.nodes.length - 1;
  S.walls.push({ id:3, a:extra, b:2, thickness:10, height:270 });
  const c = addDistance(nodeAnchor(extra, 3, "a"), nodeAnchor(0, 1, "a"), 300);
  mergeAnchorNodes(1, extra);
  assert.equal(c.a.id, S.nodes[1].vid);
});

test("equal-angle relation drives the second selected corner", () => {
  S.nodes = [
    {x:0,z:0},{x:100,z:0},{x:50,z:86.6025},
    {x:300,z:0},{x:400,z:0},{x:300,z:100},
  ];
  S.walls = [
    {id:1,a:0,b:1,thickness:10},{id:2,a:0,b:2,thickness:10},
    {id:3,a:3,b:4,thickness:10},{id:4,a:3,b:5,thickness:10},
  ]; S.wallCons=[]; S.markers=[];
  const c = addEqualAngle(angleSectorAtNode(0), angleSectorAtNode(3));
  assert.ok(c); solveWallCons();
  assert.ok(conSatisfied(c));
  assert.ok(Math.abs(Math.atan2(S.nodes[5].z,S.nodes[5].x-300)*180/Math.PI - 60) < .2);
});

test("parallel, perpendicular, collinear and equal-length relations solve", () => {
  lPlan();
  S.nodes.push({x:50,z:100},{x:130,z:140});
  S.walls.push({id:3,a:3,b:4,thickness:10,height:270});
  let c = addWallRelation("parallel",3,1); solveWallCons(); assert.ok(conSatisfied(c));
  c.off=true;
  c = addWallRelation("perpendicular",3,1); solveWallCons(); assert.ok(conSatisfied(c));
  c.off=true;
  c = addWallRelation("collinear",3,1); solveWallCons(); assert.ok(conSatisfied(c));
  c.off=true;
  c = addWallRelation("equalLength",3,1); solveWallCons(); assert.ok(conSatisfied(c));
});

test("axis alignment and driving X/Z distances operate on selected corners", () => {
  lPlan();
  let c = addAxisAlignment("alignZ", nodeAnchor(1,1,"b"), nodeAnchor(2,2,"b"));
  solveWallCons(); assert.ok(conSatisfied(c));
  c.off=true;
  c = addAxisDistance("axisDistX", nodeAnchor(0,1,"a"), nodeAnchor(1,1,"b"), 175);
  solveWallCons(); assert.ok(conSatisfied(c)); assert.equal(Math.round(S.nodes[1].x),175);
});

test("corner-to-wall and face-aware offset dimensions solve", () => {
  lPlan();
  S.nodes.push({x:20,z:150},{x:280,z:150});
  S.walls.push({id:3,a:3,b:4,thickness:20,height:270});
  const p = addPointWallDistance(nodeAnchor(2,2,"b"),1,75,1);
  solveWallCons(); assert.ok(conSatisfied(p));
  p.off=true;
  const o = addOffset(3,1,100); setConFaces(o.id,-1,1); solveWallCons();
  assert.ok(conSatisfied(o));
});

test("three parallel walls can be kept equally spaced", () => {
  S.nodes=[{x:0,z:0},{x:100,z:0},{x:0,z:70},{x:100,z:75},{x:0,z:200},{x:100,z:200}];
  S.walls=[1,2,3].map((id,i)=>({id,a:i*2,b:i*2+1,thickness:10,height:270}));
  S.wallCons=[]; S.markers=[];
  const c=addEqualSpacing([1,2,3]); solveWallCons();
  assert.ok(conSatisfied(c));
  assert.equal(Math.round((S.nodes[2].z+S.nodes[3].z)/2),100);
});

test("duplicate relations are refused", () => {
  lPlan();
  assert.ok(addWallRelation("parallel",2,1));
  assert.equal(addWallRelation("parallel",2,1),null);
});

test("a deliberately constrained non-square corner is not a warning", () => {
  lPlan();
  S.nodes[2].x = -100; S.nodes[2].z = 173.205;
  assert.ok(jointWarnings().some((w) => w.kind === "angle"));
  addJointAngle(nodeAnchor(0,1,"a"),1,2,120);
  assert.equal(jointWarnings().some((w) => w.kind === "angle"),false);
});

/* ---- 2026-08-13: pins, reference dimensions and the bay-window relations -- */

/* A three-sided bay hanging off a facade. The front pane runs east; the two
   returns splay back from its ends. Deliberately built ASYMMETRIC so the
   symmetry and equal-angle relations have something to actually fix.
     w1 facade/front (0,0) -> (200,0)
     w2 left return  (0,0) -> (-60,-80)
     w3 right return (200,0) -> (250,-95)   <- longer + shallower than w2 */
function bayPlan() {
  S.nodes = [
    { x: 0, z: 0 },      // 0 front-left
    { x: 200, z: 0 },    // 1 front-right
    { x: -60, z: -80 },  // 2 left return far end
    { x: 250, z: -95 },  // 3 right return far end
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 0, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 1, b: 3, thickness: 10, height: 270 },
  ];
  S.openings = []; S.items = []; S.markers = []; S.wallCons = [];
}

test("a pin turns its corner into a datum the solver drives away from", () => {
  lPlan();
  const pin = addFixed(nodeAnchor(2, 2, "b"));
  assert.ok(pin);
  assert.ok(pinnedNodes()[2], "the node reads as pinned");
  /* Asked to hold corner 1 and drive the PINNED corner 2. A pinned anchor is
     not movable, so authoring flips the hold rather than creating a dimension
     the solver could never satisfy: corner 1 is driven instead. */
  const d = addDistance(nodeAnchor(1, 1, "b"), nodeAnchor(2, 2, "b"), 400, "a");
  assert.equal(d.hold, "b", "hold flipped onto the pinned side");
  solveWallCons();
  assert.deepEqual({ x: S.nodes[2].x, z: S.nodes[2].z }, { x: pin.x, z: pin.z },
    "the pin held its corner");
  assert.ok(conSatisfied(d), "and the free corner moved to satisfy the distance");
  assert.equal(Math.round(Math.hypot(S.nodes[1].x - 0, S.nodes[1].z - 200)), 400);
});

test("two pins cannot both give way, and the plan says so instead of shivering", () => {
  lPlan();
  const d = addDistance(nodeAnchor(1, 1, "b"), nodeAnchor(2, 2, "b"), 400, "a");
  // pin BOTH ends after the fact — neither side may move any more
  addFixed(nodeAnchor(1, 1, "b"));
  addFixed(nodeAnchor(2, 2, "b"));
  const before = JSON.stringify(S.nodes);
  const r = solveWallCons();
  assert.equal(JSON.stringify(S.nodes), before, "nothing was dragged around");
  assert.equal(conSatisfied(d), false);
  assert.ok(r.unresolved >= 1, "reported as unresolved rather than averaged away");
});

test("a pinned corner refuses a new dimension that would have to move it", () => {
  lPlan();
  addFixed(nodeAnchor(1, 1, "b"));
  addFixed(nodeAnchor(2, 2, "b"));
  assert.equal(
    addDistance(nodeAnchor(1, 1, "b"), nodeAnchor(2, 2, "b"), 250, "a"),
    null,
    "two datums cannot be dimensioned to each other",
  );
});

test("a reference dimension measures without driving anything", () => {
  lPlan();
  const c = addDistance(nodeAnchor(2, 2, "b"), nodeAnchor(1, 1, "b"), 400, "a");
  setConReport(c.id, true);
  const before = JSON.stringify(S.nodes);
  solveWallCons();
  assert.equal(JSON.stringify(S.nodes), before, "geometry untouched");
  assert.equal(Math.round(c.value), Math.round(Math.hypot(300, 200)),
    "value re-read from the drawing instead of driving it");
  assert.equal(conError(c), 0);
  assert.equal(conIssues().length, 0, "reference dimensions never report as issues");
});

test("a reference equal-angle compares two corners without equalising them", () => {
  bayPlan();
  const left = angleSectorAtNode(0, 1, 2), right = angleSectorAtNode(1, 1, 3);
  const c = addEqualAngle(left, right);
  setConReport(c.id, true);
  const shape = JSON.stringify(S.nodes);
  solveWallCons();
  assert.equal(JSON.stringify(S.nodes), shape, "the bay was not straightened");
  // the two sectors genuinely differ, and the pair reports both
  assert.notEqual(Math.round(conCurrent(c)), Math.round(c.value));
});

test("coincident keeps two corners together without welding them", () => {
  lPlan();
  S.nodes.push({ x: 400, z: 400 });
  S.walls.push({ id: 3, a: 1, b: 3, thickness: 10, height: 270 });
  const c = addCoincident(nodeAnchor(2, 2, "b"), nodeAnchor(3, 3, "b"), "a");
  solveWallCons();
  assert.ok(conSatisfied(c));
  assert.deepEqual({ x: S.nodes[3].x, z: S.nodes[3].z }, { x: 0, z: 200 });
  assert.equal(S.nodes.length, 4, "both corners still exist — this is not a weld");
  // and it keeps holding: move the held side, the driven one follows
  S.nodes[2].x = 40; S.nodes[2].z = 260;
  solveWallCons();
  assert.deepEqual({ x: S.nodes[3].x, z: S.nodes[3].z }, { x: 40, z: 260 });
});

test("symmetric mirrors a bay return about the front pane's bisector", () => {
  bayPlan();
  const c = addSymmetric(nodeAnchor(2, 2, "b"), nodeAnchor(3, 3, "b"),
    { k: "perp", id: 1 });
  assert.ok(c);
  solveWallCons();
  assert.ok(conSatisfied(c));
  // the front pane spans x 0..200, so its bisector is x = 100
  assert.equal(Math.round(S.nodes[3].x), Math.round(200 - S.nodes[2].x));
  assert.equal(Math.round(S.nodes[3].z), Math.round(S.nodes[2].z));
});

test("wallAngle dimensions two walls that never meet", () => {
  bayPlan();
  // w2 and w3 do not share a corner, so the joint-angle relation refuses them
  assert.equal(addJointAngle(nodeAnchor(0, 1, "a"), 2, 3, 90), null);
  const c = addWallAngle(3, 2, 90);
  assert.ok(c);
  solveWallCons();
  assert.ok(conSatisfied(c), "the two returns now open at 90 to each other");
  assert.equal(Math.round(conError(c) * 10) / 10, 0);
});

test("midpoint and point-on-line differ in what they leave free", () => {
  lPlan();
  S.nodes.push({ x: 140, z: 60 });
  S.walls.push({ id: 3, a: 3, b: 2, thickness: 10, height: 270 });
  const m = addMidpoint(nodeAnchor(3, 3, "a"), 1);
  solveWallCons();
  assert.ok(conSatisfied(m));
  assert.deepEqual({ x: S.nodes[3].x, z: S.nodes[3].z }, { x: 150, z: 0 });
  removeCon(m.id);

  // point-on-line only corrects the perpendicular error: slide along, stay put
  S.nodes[3].x = 80; S.nodes[3].z = 25;
  const l = addPointOnLine(nodeAnchor(3, 3, "a"), 1);
  solveWallCons();
  assert.ok(conSatisfied(l));
  assert.equal(Math.round(S.nodes[3].z), 0, "pulled onto the line");
  assert.equal(Math.round(S.nodes[3].x), 80, "but not along it");
});

test("equal length applies across a set, not just a pair", () => {
  S.nodes = [
    { x: 0, z: 0 }, { x: 300, z: 0 },
    { x: 0, z: 100 }, { x: 180, z: 100 },
    { x: 0, z: 200 }, { x: 90, z: 200 },
  ];
  S.walls = [1, 2, 3].map((id, i) => ({ id, a: i * 2, b: i * 2 + 1, thickness: 10, height: 270 }));
  S.wallCons = []; S.markers = []; S.openings = []; S.items = [];
  const c = addEqualLengthSet([1, 2, 3]);
  solveWallCons();
  assert.ok(conSatisfied(c));
  assert.equal(Math.round(S.nodes[3].x), 300);
  assert.equal(Math.round(S.nodes[5].x), 300);
});

test("a drag pass solves only the sub-graph around the moved corner", () => {
  lPlan();
  // an unrelated pair of walls, far away, with its own relation
  S.nodes.push({ x: 900, z: 900 }, { x: 1200, z: 900 }, { x: 900, z: 1200 });
  S.walls.push(
    { id: 3, a: 3, b: 4, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 5, thickness: 10, height: 270 },
  );
  const far = addWallRelation("perpendicular", 4, 3);
  far.value = undefined;
  S.nodes[5].x = 1000; // knock the far pair out of square
  const near = addDistance(nodeAnchor(0, 1, "a"), nodeAnchor(1, 1, "b"), 250, "a");
  const farBefore = JSON.stringify([S.nodes[4], S.nodes[5]]);
  solveWallCons({ nodes: [0, 1] });
  assert.ok(conSatisfied(near), "the corner being dragged was solved");
  assert.equal(JSON.stringify([S.nodes[4], S.nodes[5]]), farBefore,
    "the far side of the plan was left alone");
});
