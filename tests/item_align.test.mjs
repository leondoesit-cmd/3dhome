import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  alignItems, distributeItems, matchRotation, halfSpan,
  holdToWall, releaseHold, reseatHeldItems,
} from "../js/item_align.js";
import { wallById } from "../js/geometry.js";

function scene() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
  ];
  S.openings = []; S.markers = []; S.wallCons = [];
  S.items = [
    { id: 1, type: "chair", x: 100, z: 100, w: 40, d: 40, h: 90, rot: 0 },
    { id: 2, type: "chair", x: 220, z: 160, w: 40, d: 40, h: 90, rot: 30 },
    { id: 3, type: "chair", x: 500, z: 250, w: 40, d: 40, h: 90, rot: 0 },
  ];
}

test("align moves everything to the FIRST selected piece", () => {
  scene();
  const n = alignItems(S.items, "centerZ");
  assert.equal(n, 2);
  assert.equal(S.items[1].z, 100);
  assert.equal(S.items[2].z, 100);
  assert.equal(S.items[0].z, 100, "the reference itself never moves");
});

test("edge alignment accounts for rotation", () => {
  scene();
  alignItems([S.items[0], S.items[1]], "left");
  // item 0 spans x 80..120; item 1 is rotated 30 degrees so it is wider
  const h = halfSpan(S.items[1]);
  assert.equal(Math.round(S.items[1].x - h.hx), 80, "left edges line up");
});

test("distribute holds the extremes and is idempotent", () => {
  scene();
  const first = S.items[0].x, last = S.items[2].x;
  assert.equal(distributeItems(S.items, "x"), 1);
  assert.equal(S.items[0].x, first, "the end pieces did not move");
  assert.equal(S.items[2].x, last);
  assert.equal(S.items[1].x, (first + last) / 2);
  assert.equal(distributeItems(S.items, "x"), 0, "running it again changes nothing");
});

test("distribute refuses fewer than three", () => {
  scene();
  assert.equal(distributeItems(S.items.slice(0, 2), "x"), 0);
});

test("a locked piece is never moved", () => {
  scene();
  S.items[1].locked = true;
  alignItems(S.items, "centerZ");
  assert.equal(S.items[1].z, 160, "locked piece stayed put");
  assert.equal(S.items[2].z, 100, "the unlocked one still aligned");
});

test("same rotation copies the first piece's angle", () => {
  scene();
  S.items[0].rot = 45;
  assert.equal(matchRotation(S.items), 2);
  assert.ok(S.items.every((it) => it.rot === 45));
});

test("a held piece follows its wall instead of drifting off it", () => {
  scene();
  const it = S.items[0];
  // stand it flush against wall 1 (which runs along z = 0, thickness 10)
  it.x = 100; it.z = 25; it.rot = 0;
  assert.ok(holdToWall(it, wallById(1), 0));
  reseatHeldItems();
  assert.equal(it.z, 25, "5 (half thickness) + 20 (half depth) = 25");

  // now the wall moves down the plan; the piece has to come with it
  S.nodes[0].z = 100; S.nodes[1].z = 100;
  reseatHeldItems();
  assert.equal(it.z, 125);
  assert.equal(it.x, 100, "it did not slide ALONG the wall");
});

test("a hold with a gap keeps the gap", () => {
  scene();
  const it = S.items[0];
  it.z = 25;
  holdToWall(it, wallById(1), 15);
  reseatHeldItems();
  assert.equal(it.z, 40);
});

test("a hold whose wall is gone releases itself", () => {
  scene();
  const it = S.items[0];
  holdToWall(it, wallById(1), 0);
  S.walls = S.walls.filter((w) => w.id !== 1);
  reseatHeldItems();
  assert.equal(it.hold, undefined, "no dangling hold pointing at nothing");
});

test("releasing a hold leaves the piece where it stands", () => {
  scene();
  const it = S.items[0];
  holdToWall(it, wallById(1), 0);
  reseatHeldItems();
  const where = { x: it.x, z: it.z };
  assert.ok(releaseHold(it));
  reseatHeldItems();
  assert.deepEqual({ x: it.x, z: it.z }, where);
});
