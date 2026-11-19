// js/group_frame.js + js/measure_cache.js liveGroupClearances: a set moved as
// one (a kitchen run, a table with its chairs) is measured and snapped as one
// block in its largest piece's orientation.
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { groupLead, groupOutline, groupProxy } from "../js/group_frame.js";
import { itemOutline } from "../js/item_outline.js";
import { resolveItemDrag } from "../js/item_wall_snap.js";
import { liveGroupClearances, groupMembers } from "../js/measure_cache.js";

function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [1, 2, 3, 4].map((id, i) => ({ id, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
  S.openings = []; S.markers = []; S.wallCons = [];
  S.measureTarget = null; S.measureWalls = [];
}
const dining = () => [
  { id: "t", type: "box", x: 300, z: 200, w: 160, d: 90, h: 75, rot: 0, groupId: "g" },
  { id: "c1", type: "box", x: 260, z: 140, w: 45, d: 45, h: 80, rot: 0, groupId: "g" }, // 2.5 cm off the table's north edge
  { id: "c2", type: "box", x: 340, z: 260, w: 45, d: 45, h: 80, rot: 180, groupId: "g" },
];

test("groupLead is the largest footprint; groupOutline is the members' convex cover", () => {
  const set = dining();
  assert.equal(groupLead(set).id, "t");
  const hull = groupOutline(set, (it) => itemOutline(it));
  const xs = hull.map((p) => p.x), zs = hull.map((p) => p.z);
  assert.equal(Math.min(...xs), 220); assert.equal(Math.max(...xs), 380);
  assert.equal(Math.round(Math.min(...zs) * 10) / 10, 117.5); assert.equal(Math.round(Math.max(...zs) * 10) / 10, 282.5);
});

test("groupProxy covers every member in the lead's orientation", () => {
  // a run of two cabinets along a wall turned 90°: w along the run (z), d across (x)
  const run = [
    { id: "a", x: 30, z: 100, w: 60, d: 60, rot: 90 },
    { id: "b", x: 30, z: 160, w: 60, d: 60, rot: 90 },
  ];
  const box = groupProxy(run, 90);
  assert.ok(Math.abs(box.w - 120) < 1e-9 && Math.abs(box.d - 60) < 1e-9);
  assert.ok(Math.abs(box.x - 30) < 1e-9 && Math.abs(box.z - 130) < 1e-9);
  // the drag's start pose overrides the members' current one
  const moved = groupProxy(run, 90, [{ x: 50, z: 100 }, { x: 50, z: 160 }]);
  assert.ok(Math.abs(moved.x - 50) < 1e-9);
});

test("the group box snaps flush to a wall like one piece", () => {
  const run = [
    { id: "a", type: "base", x: 60, z: 100, w: 60, d: 60, rot: 90 },
    { id: "b", type: "base", x: 60, z: 160, w: 60, d: 60, rot: 90 },
  ];
  const box = groupProxy(run, 90);
  const west = { id: 9, a: { x: 0, z: 0 }, b: { x: 0, z: 400 }, t: 10 }; // inner face x 5
  const r = resolveItemDrag({ item: Object.assign({ type: "base" }, box), target: { x: 55, z: box.z }, walls: [west], mode: "run" });
  assert.equal(r.flush, true);
  assert.ok(Math.abs(r.x - 35) < 1e-6, "back flush to the face at x 5 (half depth 30)");
});

test("liveGroupClearances: a chair is not measured to its own table; the set reads its walls", () => {
  room();
  const set = dining();
  const sofa = { id: "s", type: "box", x: 300, z: 360, w: 200, d: 60, h: 80, rot: 0 };
  S.items = [...set, sofa];
  assert.deepEqual(groupMembers(set[1]).map((it) => it.id), ["t", "c1", "c2"]);
  assert.equal(groupMembers(sofa), null);
  const hits = liveGroupClearances(set).hits;
  assert.ok(!hits.some((h) => ["t", "c1", "c2"].includes(String(h.id))), "no member measured as an obstacle");
  const north = hits.find((h) => h.kind === "wall" && h.id === 1);
  assert.equal(Math.round(north.gap), 113); // the chair's back at z 117.5 -> wall face z 5
  const toSofa = hits.find((h) => h.kind === "item" && h.id === "s");
  assert.equal(Math.round(toSofa.gap), 48); // the chair's front at z 282.5 -> sofa at z 330
  assert.equal(liveGroupClearances(set), liveGroupClearances(set), "cached");
});
