// js/measure_cache.js: the live distances both painters draw are measured
// once per pose and scene; a repaint with nothing changed is a lookup.
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { measureSides } from "../js/measure.js";
import { liveClearances, liveClearanceStats } from "../js/measure_cache.js";

function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.markers = []; S.wallCons = [];
  S.measureTarget = null; S.measureWalls = [];
}

test("repeated paints of an unchanged scene measure once; any change measures again", () => {
  room();
  const sofa = { id: "s", type: "box", x: 200, z: 100, w: 120, d: 60, h: 80, rot: 0 };
  const chair = { id: "c", type: "box", x: 400, z: 100, w: 50, d: 50, h: 80, rot: 0 };
  S.items = [sofa, chair];
  const counts = () => ({ ...liveClearanceStats });
  const c0 = counts();
  const first = liveClearances(sofa);
  for (let i = 0; i < 20; i++) assert.equal(liveClearances(sofa), first); // 2D paint, 3D frame, warning glow...
  let c = counts();
  assert.equal(c.computes - c0.computes, 1);
  assert.equal(c.hits - c0.hits, 20);
  // the same numbers measureSides gives
  assert.deepEqual(first.hits, measureSides(sofa, { target: "nearest", wallIds: [] }));

  const changes = [
    () => { sofa.x += 5; },                         // the piece moved
    () => { chair.x -= 30; },                       // a neighbour moved
    () => { S.nodes[1] = { x: 560, z: 0 }; },       // a wall moved
    () => { S.openings = [{ id: "d", type: "door", wall: 1, s: 350, width: 90, sill: 0, height: 205 }]; },
    () => { S.measureTarget = "wall"; },            // what the plan measures to
    () => { sofa.rot = 90; },
  ];
  changes.forEach((change, i) => {
    const before = counts().computes;
    change();
    const got = liveClearances(sofa);
    assert.equal(counts().computes - before, 1, "change " + i + " measures again");
    assert.equal(liveClearances(sofa), got, "and is cached after it");
  });
  // the selected and the hovered piece alternate in one paint: both stay cached
  const before = counts().computes;
  for (let i = 0; i < 5; i++) { liveClearances(sofa); liveClearances(chair); }
  assert.equal(counts().computes - before, 1);
});
