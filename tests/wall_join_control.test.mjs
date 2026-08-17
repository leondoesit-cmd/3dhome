import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { wallOutline, wallCuts } from "../js/geometry.js";

function corner(mode) {
  S.nodes = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }];
  const wall = { id: 1, a: 0, b: 1, thickness: 10, height: 270, join: { b: mode } };
  S.walls = [wall, { id: 2, a: 1, b: 2, thickness: 20, height: 270 }];
  S.openings = [];
  return wall;
}

test("manual butt join squares the selected end at the adjoining near face", () => {
  const wall = corner("butt"), outline = wallOutline(wall);
  assert.equal(outline[1].x, 90);
  assert.equal(outline[2].x, 90);
  assert.equal(wallCuts(wall).b, 10);
});

test("manual through join carries the selected wall across the adjoining wall", () => {
  const wall = corner("through"), outline = wallOutline(wall);
  assert.equal(outline[1].x, 110);
  assert.equal(outline[2].x, 110);
  assert.equal(wallCuts(wall).b, -10);
});

