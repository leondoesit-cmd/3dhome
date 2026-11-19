/* The ink rule (WALL_JUNCTIONS_PLAN.md 3.3): which segments of a wall's cut
   outline are drawn, so one material reads as one area. */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { wallInk, wallInkAll, wallInkClass } from "../js/wall_ink.js";

const CONCRETE = (t = 20) => [{ thickness: t, material: "reinforced-concrete", role: "core", main: true, structural: true }];
const BLOCK = (t = 10) => [{ thickness: t, material: "concrete-block", role: "core", main: true, structural: true }];
const PLASTERED = [
  { thickness: 1.5, material: "plaster", role: "finish-exterior" },
  { thickness: 17, material: "concrete-block", role: "core", main: true, structural: true },
  { thickness: 1.5, material: "plaster", role: "finish-interior" },
];

function wall(id, a, b, layers, extra = {}) {
  const thickness = layers.reduce((s, l) => s + l.thickness, 0);
  return { id, a, b, thickness, height: 270, layers, ...extra };
}
function plan(nodes, walls) {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = nodes;
  S.walls = walls;
}
const near = (p, q, tol = 0.01) => Math.abs(p.x - q.x) < tol && Math.abs(p.z - q.z) < tol;
const segIs = (s, p, q) => (near(s[0], p) && near(s[1], q)) || (near(s[0], q) && near(s[1], p));
// every drawn segment of these walls, normalised
const all = (walls) => walls.flatMap((w) => wallInk(w).segments);
// a drawn segment covering the point
const covers = (segs, p, tol = 0.01) => segs.some(([a, b]) => {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz,
    t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
  return t >= -1e-9 && t <= 1 + 1e-9 && Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) < tol;
});

test("same-assembly L: the diagonal is not drawn, the outer and inner L are", () => {
  for (const layers of [CONCRETE(), PLASTERED]) {
    plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
      [wall(1, 0, 1, layers), wall(2, 1, 2, layers)]);
    const [w1, w2] = S.walls, segs = all([w1, w2]);
    // the mitre diagonal from (390,10) to (410,-10)
    assert.ok(!covers(segs, { x: 400, z: 0 }), "nothing at the diagonal's midpoint");
    assert.ok(!covers(segs, { x: 395, z: 5 }) && !covers(segs, { x: 405, z: -5 }), "nor anywhere on it");
    // outer L: z=-10 to x=410, then x=410 down; inner L: z=10 to 390, x=390 down
    assert.ok(segs.some((s) => segIs(s, { x: 0, z: -10 }, { x: 410, z: -10 })), "outer face of wall 1");
    assert.ok(segs.some((s) => segIs(s, { x: 410, z: -10 }, { x: 410, z: 300 })), "outer face of wall 2");
    assert.ok(segs.some((s) => segIs(s, { x: 0, z: 10 }, { x: 390, z: 10 })), "inner face of wall 1");
    assert.ok(segs.some((s) => segIs(s, { x: 390, z: 10 }, { x: 390, z: 300 })), "inner face of wall 2");
    // and the two free ends; nothing else
    assert.ok(segs.some((s) => segIs(s, { x: 0, z: 10 }, { x: 0, z: -10 })));
    assert.ok(segs.some((s) => segIs(s, { x: 390, z: 300 }, { x: 410, z: 300 })));
    assert.equal(segs.length, 6, `${layers.length}-layer walls: six lines`);
  }
});

test("a split straight wall of one assembly has no line across it", () => {
  for (const [la, lb] of [[CONCRETE(), CONCRETE()], [PLASTERED, PLASTERED], [BLOCK(14), BLOCK(20)]]) {
    plan([{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 400, z: 0 }], [wall(1, 0, 1, la), wall(2, 1, 2, lb)]);
    const segs = all(S.walls);
    assert.ok(!covers(segs, { x: 200, z: 0 }), "no line across the run at the split");
    if (la[0].thickness !== lb[0].thickness)
      assert.ok(covers(segs, { x: 200, z: 8.5 }) && covers(segs, { x: 200, z: -8.5 }),
        "a single-layer step in thickness keeps its two short returns");
  }
});

test("single-layer T of one material: no line across the mouth; block into concrete: the concrete face", () => {
  const nodes = [{ x: 0, z: -200 }, { x: 0, z: 0 }, { x: 0, z: 200 }, { x: 200, z: 0 }];
  plan(nodes, [wall(1, 0, 1, BLOCK(20)), wall(2, 1, 2, BLOCK(20)), wall(3, 1, 3, BLOCK(10))]);
  let segs = all(S.walls);
  assert.ok(!covers(segs, { x: 10, z: 0 }), "no line across the mouth on the through face");
  assert.ok(!covers(segs, { x: 10, z: 2 }) && !covers(segs, { x: 10, z: -2 }));
  assert.ok(covers(segs, { x: 10, z: 50 }) && covers(segs, { x: 10, z: -50 }), "the through face either side");
  assert.ok(covers(segs, { x: 50, z: 5 }) && covers(segs, { x: 50, z: -5 }), "the branch faces");

  plan(nodes, [wall(1, 0, 1, CONCRETE()), wall(2, 1, 2, CONCRETE()), wall(3, 1, 3, BLOCK(10))]);
  segs = all(S.walls);
  const mouth = segs.filter(([a, b]) => Math.abs(a.x - 10) < 0.01 && Math.abs(b.x - 10) < 0.01 &&
    Math.min(a.z, b.z) < 5 && Math.max(a.z, b.z) > -5);
  assert.ok(mouth.length >= 1, "a line on the concrete face across the mouth");
  assert.ok(mouth.every(([a, b]) => Math.abs(a.x - 10) < 0.01 && Math.abs(b.x - 10) < 0.01), "on the concrete face");
  assert.ok(!segs.some(([a, b]) => Math.abs(a.x - b.x) > 0.01 && Math.abs(a.z - b.z) > 0.01), "no diagonal anywhere");
  // the concrete run itself is one area: no line across it at the T node
  assert.ok(!covers(segs, { x: 0, z: 0 }) && !covers(segs, { x: -5, z: 0 }));
});

test("a multi-layer T keeps its line across the mouth", () => {
  plan([{ x: 0, z: -200 }, { x: 0, z: 0 }, { x: 0, z: 200 }, { x: 200, z: 0 }],
    [wall(1, 0, 1, PLASTERED), wall(2, 1, 2, PLASTERED), wall(3, 1, 3, PLASTERED)]);
  const segs = all(S.walls);
  assert.ok(covers(segs, { x: 10, z: 0 }), "the through wall's finish crosses the mouth");
  assert.ok(!covers(segs, { x: 0, z: 0 }) && !covers(segs, { x: -5, z: 0 }), "the split through run is still one");
});

test("a free end is drawn", () => {
  plan([{ x: 0, z: 0 }, { x: 300, z: 0 }], [wall(1, 0, 1, BLOCK(20))]);
  const segs = wallInk(S.walls[0]).segments;
  assert.ok(segs.some((s) => segIs(s, { x: 0, z: 10 }, { x: 0, z: -10 })));
  assert.ok(segs.some((s) => segIs(s, { x: 300, z: 10 }, { x: 300, z: -10 })));
  assert.equal(segs.length, 4);
});

test("a demolition wall next to a new wall of the same type merges with nothing", () => {
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    [wall(1, 0, 1, BLOCK(20)), wall(2, 1, 2, BLOCK(20), { phase: "demolition" })]);
  assert.equal(wallInkClass(S.walls[1]), null);
  const a = wallInk(S.walls[0]), b = wallInk(S.walls[1]);
  assert.equal(a.segments.length, a.outline.length, "every edge of the new wall is drawn");
  assert.equal(b.segments.length, b.outline.length, "every edge of the demolition wall is drawn");
  // and two demolition walls do not merge with each other either
  S.walls[0].phase = "demolition";
  assert.equal(wallInk(S.walls[0]).segments.length, wallInk(S.walls[0]).outline.length);
});

test("layer lines run along the wall only, and meet at a wrap corner", () => {
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    [wall(1, 0, 1, PLASTERED), wall(2, 1, 2, PLASTERED)]);
  const [w1, w2] = S.walls, l1 = wallInk(w1).layers, l2 = wallInk(w2).layers;
  assert.equal(l1.length, 2, "two boundaries inside a three-layer wall");
  l1.forEach(([a, b]) => assert.ok(Math.abs(a.z - b.z) < 1e-9, "along the wall"));
  // each boundary of wall 1 ends where the same boundary of wall 2 starts
  l1.forEach(([, end]) => assert.ok(l2.some(([a, b]) => near(a, end) || near(b, end)), "they meet on the diagonal"));
});

test("the memoised ink follows an edit at a neighbour", () => {
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    [wall(1, 0, 1, BLOCK(20)), wall(2, 1, 2, BLOCK(20))]);
  const w1 = S.walls[0];
  const first = wallInkAll(S.walls).get(w1);
  assert.equal(wallInkAll(S.walls).get(w1), first, "unchanged: the same result object");
  S.walls[1].phase = "existing";
  const next = wallInkAll(S.walls).get(w1);
  assert.notEqual(next, first, "a neighbour's phase change re-inks the wall");
  assert.ok(covers(next.segments, { x: 390, z: 0 }), "the existing wall owns the corner: the new one's end is drawn on its face");
});
