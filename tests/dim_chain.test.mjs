import { test } from "node:test";
import assert from "node:assert/strict";
import { chainCovers, chainSegsOf, dimChain } from "../js/dim_chain.js";

// a wall as dimChain sees it: direction + footprint rectangle
function wall(id, x0, z0, x1, z1) {
  var horiz = Math.abs(z1 - z0) < Math.abs(x1 - x0);
  return {
    id, ang: horiz ? 0 : Math.PI / 2,
    pts: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }],
  };
}

/* 600 x 400 outside, 20 cm shell, a 10 cm partition at x 300..310 and a stub
   wall from the left shell to x 150 (a free end in open floor). */
const plan = [
  wall("top", 0, 0, 600, 20), wall("bottom", 0, 380, 600, 400),
  wall("left", 0, 0, 20, 400), wall("right", 580, 0, 600, 400),
  wall("mid", 300, 20, 310, 380),
  wall("stub", 20, 200, 150, 210),
];

const brief = (segs) => segs.map((s) => [s.kind, +(s.b - s.a).toFixed(2)]);

test("the x chain reads wall thickness and clear span in plan order", () => {
  const c = dimChain(plan, "x");
  assert.deepEqual(brief(c.segs), [
    ["wall", 20], ["clear", 130], ["clear", 150], ["wall", 10], ["clear", 270], ["wall", 20],
  ]);
  assert.equal(c.segs[0].a, 0);
  assert.equal(c.segs.at(-1).b, 600);
});

test("the z chain ignores walls running along it except their free ends", () => {
  const c = dimChain(plan, "z");
  assert.deepEqual(brief(c.segs), [["wall", 20], ["clear", 180], ["wall", 10], ["clear", 170], ["wall", 20]]);
});

test("a wall's own segments: its thickness across, its whole make-up along", () => {
  const x = dimChain(plan, "x");
  assert.deepEqual(brief(chainSegsOf(x, "mid")), [["wall", 10]]);
  assert.deepEqual(brief(chainSegsOf(x, "top")).length, x.segs.length);
  assert.deepEqual(chainSegsOf(x, "nope"), []);
});

test("diagonal walls are left to their own dimension", () => {
  const diag = { id: "d", ang: Math.PI / 4, pts: [{ x: 0, z: 0 }, { x: 100, z: 100 }, { x: 90, z: 110 }] };
  const chains = { x: dimChain([...plan, diag], "x"), z: dimChain([...plan, diag], "z") };
  assert.equal(chainCovers(chains, "d"), false);
  assert.equal(chainCovers(chains, "mid"), true);
  assert.equal(chainCovers(chains, "stub"), true);
});

test("touching or overlapping walls merge into one thickness", () => {
  const c = dimChain([wall("a", 0, 0, 20, 100), wall("b", 20, 0, 30, 100), wall("c", 200, 0, 220, 100)], "x");
  assert.deepEqual(brief(c.segs), [["wall", 30], ["clear", 170], ["wall", 20]]);
  assert.deepEqual(c.segs[0].ids, ["a", "b"]);
});

test("no crossing walls, no chain", () => {
  assert.deepEqual(dimChain([wall("h", 0, 0, 300, 20)], "x").segs, []);
  assert.deepEqual(dimChain(null, "z").segs, []);
});
