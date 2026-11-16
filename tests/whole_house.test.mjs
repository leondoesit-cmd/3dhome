import test from "node:test";
import assert from "node:assert/strict";
import { boxArrays, floorSpatial, openingCut, stackedFloors, toggleWholeHouse, wallSolidPieces, wholeHouseOn, withFloorScene } from "../js/floor_stack.js";

const ws = () => ({
  activeFloor: "b",
  floors: [
    { id: "a", elevation: 0, scene: { spatial: { walls: [1] } } },
    { id: "b", elevation: 300, scene: {} },
    { id: "c", elevation: 600, scene: { spatial: { walls: [2] } } },
  ],
});

test("whole house is off until toggled and needs a second storey", () => {
  const w = ws();
  assert.equal(wholeHouseOn(w), false);
  assert.deepEqual(stackedFloors(w), []);
  assert.equal(toggleWholeHouse(w), true);
  assert.equal(wholeHouseOn(w), true);
  assert.equal(wholeHouseOn({ showAllFloors: true, floors: [{ id: "a" }] }), false);
});

test("other storeys stack at their level relative to the active one", () => {
  const w = ws();
  w.showAllFloors = true;
  assert.deepEqual(stackedFloors(w).map((e) => [e.floor.id, e.dy]), [["a", -300], ["c", 300]]);
  // the dollhouse cut looks into the active storey: nothing above it
  assert.deepEqual(stackedFloors(w, { hideAbove: true }).map((e) => e.floor.id), ["a"]);
});

test("a stored storey stands in for the live one, and is always put back", () => {
  const live = { walls: ["live"] };
  const state = { spatial: live, floorTex: "wood" };
  const seen = withFloorScene(state, { spatial: { walls: ["other"] }, floorTex: "tiles" }, () => [state.spatial.walls[0], state.floorTex]);
  assert.deepEqual(seen, ["other", "tiles"]);
  assert.equal(state.spatial, live);
  assert.equal(state.floorTex, "wood");
  assert.throws(() => withFloorScene(state, {}, () => { throw new Error("x"); }));
  assert.equal(state.spatial, live);
  // a legacy scene keeps its arrays at the top level
  assert.deepEqual(floorSpatial({ items: [1], roomMeta: { k: 1 } }).instances, [1]);
});

test("walls are cut around a door and a window", () => {
  const door = openingCut({ type: "door", s: 100, width: 80, height: 210 }, 260);
  const win = openingCut({ type: "window", s: 300, width: 100, height: 120, sill: 90 }, 260);
  assert.deepEqual(win, { s: 300, width: 100, y0: 90, y1: 210 });
  const pieces = wallSolidPieces(400, 0, 260, [door, win]);
  const at = (s) => pieces.filter((p) => p.s0 <= s && p.s1 >= s).map((p) => [p.y0, p.y1]);
  assert.deepEqual(at(20), [[0, 260]]);
  assert.deepEqual(at(100), [[210, 260]]); // lintel only over the door
  assert.deepEqual(at(300), [[0, 90], [210, 260]]); // under and over the window
  const area = pieces.reduce((s, p) => s + (p.s1 - p.s0) * (p.y1 - p.y0), 0);
  assert.equal(area, 400 * 260 - 80 * 210 - 100 * 120);
});

test("boxes become one triangle list whose faces point outwards", () => {
  const { positions, normals, indices } = boxArrays([{ a: { x: 0, z: 0 }, b: { x: 100, z: 0 }, y0: 0, y1: 50, t: 10 }]);
  assert.equal(positions.length, 24 * 3);
  assert.equal(indices.length, 36);
  for (let f = 0; f < 12; f++) {
    const v = [0, 1, 2].map((k) => indices[f * 3 + k]);
    const p = v.map((i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
    const e1 = p[1].map((c, i) => c - p[0][i]), e2 = p[2].map((c, i) => c - p[0][i]);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const n = [normals[v[0] * 3], normals[v[0] * 3 + 1], normals[v[0] * 3 + 2]];
    assert.ok(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0, "face " + f + " winds against its normal");
  }
});
