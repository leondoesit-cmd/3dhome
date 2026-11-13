// Stacking storeys: a new storey lands on top of the highest one, is named
// "Floor N", cuts the stairwells of stairs that reach it, and "copy walls from
// the floor below" copies walls only, with valid node references.
import test from "node:test";
import assert from "node:assert/strict";
import {
  cutStairwellVoids,
  floorsByElevation,
  followReferenceFloor,
  nextFloorElevation,
  nextFloorName,
  referenceShown,
  stairsReachingStorey,
  storeyHeight,
  toggleReferenceFloor,
} from "../js/floors.js";
import { copyStoreyWalls } from "../js/floor_copy.js";
import { FLOOR_TEXT_KEYS } from "../js/floor_strings.js";
import { readFile } from "node:fs/promises";

const square = () => ({
  nodes: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }],
  walls: [
    { id: 1, a: 0, b: 1, thickness: 20, height: 270, wallTypeId: "ext" },
    { id: 2, a: 1, b: 2, thickness: 20, height: 270, wallTypeId: "ext" },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ],
  wallTypes: [{ id: "ext", layers: [{ thickness: 20 }] }, { id: "unused", layers: [] }],
  openings: [{ id: 9, wall: 1, s: 100, width: 90 }],
  items: [{ id: 7, type: "sofa", x: 100, z: 100, w: 200, d: 90 }],
});

test("a new storey goes on top of the highest one, by its tallest wall", () => {
  const ground = { id: "g", name: "Ground", elevation: 0, scene: { spatial: { walls: [{ height: 270 }, { height: 330 }] } } };
  const first = { id: "f1", name: "Floor 1", elevation: 350, scene: { walls: [] } };
  const ws = { activeFloor: "g", floors: [first, ground] };
  assert.equal(storeyHeight(ground, ws), 350, "tallest wall 330 + 20");
  assert.equal(storeyHeight(first, ws), 300, "never under 300");
  assert.deepEqual(floorsByElevation(ws).map((f) => f.id), ["g", "f1"]);
  assert.equal(nextFloorElevation(ws), 650);
  // the active storey is read from the live scene, not its stale snapshot
  const solo = { activeFloor: "g", floors: [ground] };
  assert.equal(nextFloorElevation(solo, { walls: [{ height: 400 }] }), 420);
  assert.equal(nextFloorElevation(solo), 350);
  assert.equal(nextFloorElevation({ floors: [{ id: "x", elevation: 0, scene: {} }] }), 300, "no walls: a 300 storey");
  assert.equal(nextFloorElevation({ floors: [] }), 0);
});

test("new storeys are named Floor 1, Floor 2… and never clash", () => {
  const fmt = (n) => "Floor " + n;
  assert.equal(nextFloorName({ floors: [{ id: "g", name: "Ground" }] }, fmt), "Floor 1");
  assert.equal(nextFloorName({ floors: [{ id: "g" }, { id: "a", name: "Floor 1" }] }, fmt), "Floor 2");
  assert.equal(nextFloorName({ floors: [{ id: "g" }, { id: "a", name: "Floor 2" }] }, fmt), "Floor 3");
  assert.equal(nextFloorName({ floors: [{ id: "g" }] }, (n) => "קומה " + n), "קומה 1");
});

test("stairs that reach the new storey get one stairwell void each, idempotently", () => {
  const below = { spatial: { instances: [
    { id: 11, type: "stairs", x: 50, z: 60, w: 100, d: 250, h: 260 },
    { id: 12, type: "stairs", x: 0, z: 0, w: 100, d: 250, h: 120 }, // a short flight
    { id: 13, type: "stairs", x: 0, z: 0, w: 100, d: 250 }, // catalogue height
    { id: 14, type: "sofa", x: 0, z: 0, w: 100, d: 100, h: 260 },
  ] } };
  assert.deepEqual(stairsReachingStorey(below, 300).map((it) => it.id), [11, 13]);
  assert.deepEqual(stairsReachingStorey(below, 400).map((it) => it.id), []);
  const openings = [];
  let n = 100;
  const make = (it) => ({ id: n++, stairsId: it.id, x: it.x, z: it.z, w: it.w, d: it.d });
  assert.equal(cutStairwellVoids(below, 300, openings, make), 2);
  assert.equal(cutStairwellVoids(below, 300, openings, make), 0, "second run adds nothing");
  assert.deepEqual(openings.map((o) => o.stairsId), [11, 13]);
});

test("copying the walls of the floor below copies walls only, with valid references", () => {
  const source = { spatial: square() };
  const before = JSON.stringify(source);
  const target = { nodes: [{ x: -50, z: -50 }], walls: [], wallTypes: [{ id: "int", layers: [] }] };
  let id = 40;
  const done = copyStoreyWalls(source, target, () => id++);
  assert.deepEqual(done, { walls: 4, nodes: 4, wallTypes: 1 });
  assert.equal(JSON.stringify(source), before, "source scene untouched");
  const len = (w, nodes) => Math.hypot(nodes[w.b].x - nodes[w.a].x, nodes[w.b].z - nodes[w.a].z);
  const src = square();
  target.walls.forEach((w, i) => {
    assert.ok(target.nodes[w.a] && target.nodes[w.b], "node references resolve");
    assert.equal(len(w, target.nodes), len(src.walls[i], src.nodes), "same length");
    assert.equal(w.thickness, src.walls[i].thickness);
    assert.equal(w.height, 270);
  });
  assert.equal(new Set(target.walls.map((w) => w.id)).size, 4, "fresh unique ids");
  assert.ok(target.walls.every((w) => w.id >= 40));
  assert.deepEqual(target.wallTypes.map((t) => t.id), ["int", "ext"], "only the wall types it needs");
  assert.equal(target.nodes[0].x, -50, "existing nodes keep their indices");
  // copied objects are not shared with the source
  target.walls[0].thickness = 99;
  assert.equal(source.spatial.walls[0].thickness, 20);
});

test("the reference toggle is one implementation for both controls", async () => {
  const ws = {
    activeFloor: "f1",
    floors: [{ id: "g", elevation: 0, scene: {} }, { id: "f1", elevation: 300, scene: {} }, { id: "f2", elevation: 600, scene: {} }],
  };
  assert.equal(referenceShown(ws), false);
  assert.equal(toggleReferenceFloor(ws), true);
  assert.equal(ws.referenceFloor, "g", "the floor below first");
  assert.equal(ws.referenceFollows, true);
  assert.equal(referenceShown(ws), true);
  ws.activeFloor = "f2";
  assert.equal(followReferenceFloor(ws), true);
  assert.equal(ws.referenceFloor, "f1", "it follows to the new floor below");
  assert.equal(toggleReferenceFloor(ws), true);
  assert.equal(referenceShown(ws), false);
  assert.equal(followReferenceFloor(ws), false, "a hidden reference does not move");

  const layers = await readFile(new URL("../js/ui_layers.js", import.meta.url), "utf8");
  const chrome = await readFile(new URL("../js/planner_chrome.js", import.meta.url), "utf8");
  assert.match(layers, /toggleReferenceFloor\(\)/, "the Layers row uses the shared toggle");
  assert.match(chrome, /toggleReferenceFloor\(S\.workspace\)/, "and so does the floor strip");
});

test("floor strings exist in both languages", async () => {
  const src = await readFile(new URL("../js/floor_strings.js", import.meta.url), "utf8");
  assert.ok(FLOOR_TEXT_KEYS.length > 5);
  for (const key of FLOOR_TEXT_KEYS) assert.match(src, new RegExp("\\b" + key + ': \\["[^"]+", "[^"]+"\\]'), key);
});
