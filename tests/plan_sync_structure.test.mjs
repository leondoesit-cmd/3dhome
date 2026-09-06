/* Keeping two people's WALLS in step.
 *
 * Every other op in js/plan_sync.js addresses an entity by a stable id. Walls
 * cannot: they hold their corners as indices into S.nodes, so a corner's
 * identity is a position in an append-only array, and that only means anything
 * while both peers hold the same array. Nothing used to keep them that way —
 * the nodeMove op carried a length and refused when it disagreed, which was an
 * honest guard over the hole rather than a fix for it.
 *
 * These are the claims the structSet op has to make good: the arrays end up
 * identical, indices keep meaning the same corners, nothing arrives by
 * reference, and a peer that adopts a structure does not post it straight back.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { S } from "../js/state.js";
import { applyPlanOp, structurePlanOp, syncStructureIfChanged } from "../js/plan_sync.js";
import { NET } from "../js/net.js";

function blank(state) {
  state.nodes = [];
  state.walls = [];
  state.openings = [];
  state.items = [];
  state.roomMeta = {};
  state.idc = 1;
  return state;
}

function room(state, x0, z0, x1, z1, first) {
  const n = state.nodes.length;
  state.nodes.push({ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 });
  for (let i = 0; i < 4; i++) {
    state.walls.push({
      id: first + i, a: n + i, b: n + ((i + 1) % 4), thickness: 10, height: 270,
      wallTypeId: "generic", kind: "normal", loc: "center", dimSide: 0,
    });
  }
  state.idc = first + 4;
}

/* A peer is any object shaped like the planner's state. applyPlanOp takes one
   explicitly, which is what makes the two-sided claims testable at all. */
function peer() {
  return blank({});
}

test("a peer that has never seen a wall ends up with the same arrays", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  S.openings.push({ id: 20, wall: 2, s: 150, width: 80, height: 205, sill: 0, type: "door" });
  S.roomMeta["1,2,3,4"] = { name: "Bedroom", floor: "wood", preset: "bedroom", cx: 200, cz: 150 };

  const other = peer();
  assert.equal(applyPlanOp(structurePlanOp(), other), true);
  assert.deepEqual(other.nodes, S.nodes);
  assert.deepEqual(other.walls, S.walls);
  assert.deepEqual(other.openings.map((o) => [o.id, o.wall, o.s]), [[20, 2, 150]]);
  assert.equal(other.roomMeta["1,2,3,4"].name, "Bedroom");
  assert.equal(other.idc, S.idc);
});

test("a wall arrives still holding the length it was holding", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  /* What the constraint engine writes on a wall the user has dimensioned. A
     peer that gets the geometry without these has walls that look right and
     hold nothing — they come apart the first time anything is solved. */
  Object.assign(S.walls[0], { lock: 1, lockL: 400, lockClearL: 390, lockAng: 0, clearL: 390 });
  const other = peer();
  applyPlanOp(structurePlanOp(), other);
  assert.deepEqual(
    ["lock", "lockL", "lockClearL", "lockAng", "clearL"].map((k) => other.walls[0][k]),
    [1, 400, 390, 0, 390],
  );
});

test("a corner's stable id travels with it, so dimensions still resolve", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  S.nodes.forEach((n, i) => { n.vid = "v" + (i + 1); });
  const other = peer();
  applyPlanOp(structurePlanOp(), other);
  assert.deepEqual(other.nodes.map((n) => n.vid), ["v1", "v2", "v3", "v4"],
    "an index says where a corner is; a vid says which corner it is");
});

test("a dimension anchored to a wall that did not arrive is dropped, not left dangling", () => {
  const other = peer();
  room(other, 0, 0, 400, 300, 1);
  other.wallCons = [
    { id: 90, type: "length", wall: 1 },
    { id: 91, type: "parallel", wall: 1, ref: 3 },
    { id: 92, type: "alignX", a: { k: "node", id: "v1", wall: 1 }, b: { k: "node", id: "v9", wall: 3 } },
  ];
  // a structure with wall 3 gone
  applyPlanOp({
    type: "structSet",
    nodes: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    walls: [{ id: 1, a: 0, b: 1 }, { id: 2, a: 1, b: 2 }],
    openings: [],
    idc: 9,
  }, other);
  assert.deepEqual(other.wallCons.map((c) => c.id), [90],
    "the two that pointed at wall 3 went with it");
});

test("indices still mean the same corners afterwards, so nodeMove lands", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  const other = peer();
  applyPlanOp(structurePlanOp(), other);

  // the op the existing protocol sends for a dragged corner
  const moved = applyPlanOp({ type: "nodeMove", index: 2, n: 4, x: 480, z: 360 }, other);
  assert.equal(moved, true, "the length guard agrees, because the arrays agree");
  assert.deepEqual(other.nodes[2], { x: 480, z: 360 });
  const wall = other.walls.find((w) => w.id === 2);
  assert.equal(wall.b, 2, "and wall 2 still ends at the corner that moved");
});

test("a structure sent after a split, a weld and an erase replaces the old one whole", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  const other = peer();
  applyPlanOp(structurePlanOp(), other);

  // the kind of surgery a room stamp does: split one wall, drop another
  S.nodes.push({ x: 400, z: 150 });
  S.walls.find((w) => w.id === 2).b = 4;
  S.walls.push({ id: 5, a: 4, b: 2, thickness: 10, height: 270 });
  S.walls = S.walls.filter((w) => w.id !== 3);
  S.idc = 6;

  assert.equal(applyPlanOp(structurePlanOp(), other), true);
  assert.equal(other.nodes.length, 5);
  assert.deepEqual(other.walls.map((w) => w.id).sort(), [1, 2, 4, 5]);
  assert.equal(other.walls.find((w) => w.id === 2).b, 4);
});

test("nothing arrives by reference, and nothing arrives on the prototype", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  S.walls[0].layers = [{ t: 5, mat: "brick" }];
  const other = peer();
  const op = structurePlanOp();
  applyPlanOp(op, other);

  other.nodes[0].x = 999;
  other.walls[0].layers[0].t = 99;
  assert.equal(S.nodes[0].x, 0, "the sender's corner is not the receiver's corner");
  assert.equal(S.walls[0].layers[0].t, 5, "nor its wall layers");

  /* JSON.parse makes __proto__ a real own key, so a hostile or corrupt payload
     can carry one; assigning a wall wholesale would run the prototype setter. */
  const hostile = JSON.parse('{"type":"structSet","nodes":[{"x":0,"z":0},{"x":10,"z":0}],'
    + '"walls":[{"id":1,"a":0,"b":1,"__proto__":{"polluted":true}}],"openings":[],"idc":2}');
  assert.equal(applyPlanOp(hostile, other), true);
  assert.equal(other.walls[0].polluted, undefined);
  assert.equal(({}).polluted, undefined, "and Object.prototype is untouched");
});

test("a wall whose corner does not exist is dropped rather than believed", () => {
  const other = peer();
  const ok = applyPlanOp({
    type: "structSet",
    nodes: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    walls: [
      { id: 1, a: 0, b: 1 },
      { id: 2, a: 0, b: 9 },     // no such corner
      { id: 3, a: 1, b: 1 },     // zero length
    ],
    openings: [
      { id: 5, wall: 1, s: 5, width: 60 },
      { id: 6, wall: 99, s: 5, width: 60 }, // no such wall
    ],
    idc: 7,
  }, other);
  assert.equal(ok, true);
  assert.deepEqual(other.walls.map((w) => w.id), [1]);
  assert.deepEqual(other.openings.map((o) => o.id), [5]);
});

test("the id counter only ever goes forwards", () => {
  const other = peer();
  other.idc = 50;
  applyPlanOp({ type: "structSet", nodes: [], walls: [], openings: [], idc: 3 }, other);
  assert.equal(other.idc, 50, "a peer that has already handed out ids keeps its counter");
});

test("a malformed structure is refused, not half-applied", () => {
  const other = peer();
  room(other, 0, 0, 100, 100, 1);
  const before = JSON.stringify(other);
  assert.equal(applyPlanOp({ type: "structSet", nodes: "nope", walls: [] }, other), false);
  assert.equal(applyPlanOp({ type: "structSet", nodes: [], walls: null }, other), false);
  assert.equal(JSON.stringify(other), before);
});

test("with nobody connected the detector stays quiet but keeps its baseline", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  // NET.connected is false in a bare Node process, which is the offline case
  assert.equal(syncStructureIfChanged(), false);
  S.walls.pop();
  assert.equal(syncStructureIfChanged(), false, "still silent — there is nobody to tell");
});

/* With a peer present. `sendData` is a no-op without a live socket, so the
   detector's decisions can be observed without a relay. */
function shared(run) {
  const was = NET.connected;
  NET.connected = true;
  try { return run(); } finally { NET.connected = was; }
}

test("the structure is sent once per change, not once per render", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  shared(() => {
    assert.equal(syncStructureIfChanged(), true, "the new room is news");
    assert.equal(syncStructureIfChanged(), false, "the same plan, twice, is not");
    assert.equal(syncStructureIfChanged(), false);
  });
});

test("moving a room counts as a change, even though no wall was created", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  shared(() => {
    syncStructureIfChanged();
    S.nodes.forEach((n) => { n.x += 250; });
    assert.equal(syncStructureIfChanged(), true,
      "four corners moved and not one wall changed — the signature has to see it");
  });
});

test("nothing is sent in the middle of a gesture", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  shared(() => {
    syncStructureIfChanged();
    S.action = "room";
    S.nodes[0].x -= 90;
    assert.equal(syncStructureIfChanged(), false,
      "mid-drag the finer-grained nodeMove op carries the corner");
    S.action = null;
    assert.equal(syncStructureIfChanged(), true, "and the release settles up");
  });
});

test("adopting a peer's structure does not post it straight back", () => {
  blank(S);
  room(S, 0, 0, 400, 300, 1);
  const incoming = structurePlanOp();
  blank(S);
  shared(() => {
    syncStructureIfChanged();               // baseline: an empty plan
    assert.equal(applyPlanOp(incoming, S), true);
    assert.equal(syncStructureIfChanged(), false,
      "the structure just adopted is the baseline, so the render that follows is silent");
  });
});
