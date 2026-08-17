import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCornerRestore, applyCornerTreatmentUpdate, applyWallChamfer, applyWallFillet,
  proposeCornerRestore, proposeCornerTreatmentUpdate, proposeWallChamfer, proposeWallFillet,
} from "../js/wall_fillet.js";
import { wallCurveGeom } from "../js/wall_curves.js";

function scene(extra = {}) {
  const walls = [
    { id: 10, a: 0, b: 1, thickness: 20, height: 280, wallTypeId: "exterior", phase: "new" },
    { id: 11, a: 1, b: 2, thickness: 10, height: 250, wallTypeId: "interior" },
  ];
  return { nodes: [{ x: -100, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 100 }], walls, openings: [], ...extra };
}

function near(actual, expected, epsilon = 1e-6) { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`); }

test("a shared right-angle corner becomes two trimmed walls and one tangent arc", () => {
  const state = scene();
  const result = applyWallFillet(state, state.walls[0], state.walls[1], 25, { makeId: () => 99 });
  assert.equal(result.ok, true);
  assert.equal(state.walls.length, 3);
  assert.equal(result.wall.id, 99);
  assert.equal(result.wall.wallTypeId, "exterior");
  assert.equal(result.wall.height, 280);
  near(state.nodes[state.walls[0].b].x, -25);
  near(state.nodes[state.walls[1].a].z, 25);
  const curve = wallCurveGeom(result.wall, state.nodes);
  near(curve.radius, 25);
  near(Math.abs(curve.sweep), Math.PI / 2);
});

test("all endpoint orientations are accepted", () => {
  const state = scene();
  state.walls[0] = { ...state.walls[0], a: 1, b: 0 };
  state.walls[1] = { ...state.walls[1], a: 2, b: 1 };
  const result = applyWallFillet(state, state.walls[0], state.walls[1], 10);
  assert.equal(result.ok, true);
  near(state.nodes[state.walls[0].a].x, -10);
  near(state.nodes[state.walls[1].b].z, 10);
});

test("invalid topology and oversized radii are reported without mutation", () => {
  const state = scene();
  const count = state.nodes.length;
  assert.equal(proposeWallFillet(state, state.walls[0], { ...state.walls[1], a: 3 }, 10).reason, "not-shared");
  assert.equal(applyWallFillet(state, state.walls[0], state.walls[1], 150).reason, "too-large");
  assert.equal(state.nodes.length, count);
  assert.equal(state.walls.length, 2);
});

test("openings in the removed corner block the edit, surviving hosts are reparameterized", () => {
  const blocked = scene({ openings: [{ id: 1, wall: 10, s: 92, width: 12 }] });
  assert.equal(proposeWallFillet(blocked, blocked.walls[0], blocked.walls[1], 20).reason, "hosted");

  const state = scene({ openings: [{ id: 2, wall: 10, s: 50, width: 20 }] });
  state.walls[0] = { ...state.walls[0], a: 1, b: 0 };
  const result = applyWallFillet(state, state.walls[0], state.walls[1], 20);
  assert.equal(result.ok, true);
  near(state.openings[0].s, 30);
});

test("an equal-setback chamfer creates a real diagonal wall", () => {
  const state = scene();
  const result = applyWallChamfer(state, state.walls[0], state.walls[1], 30, { makeId: () => 77 });
  assert.equal(result.ok, true);
  assert.equal(result.wall.id, 77);
  assert.equal(result.wall.curve, undefined);
  assert.equal(result.wall.wallTypeId, "exterior");
  near(state.nodes[result.wall.a].x, -30);
  near(state.nodes[result.wall.b].z, 30);
  near(wallCurveGeom(result.wall, state.nodes).length, Math.hypot(30, 30));
});

test("chamfers honor reversed wall endpoints and hosted-content safety", () => {
  const state = scene({ openings: [{ id: 3, wall: 10, s: 80, width: 10 }] });
  assert.equal(proposeWallChamfer(state, state.walls[0], state.walls[1], 25).reason, "hosted");
  state.openings[0].s = 40;
  state.walls[0] = { ...state.walls[0], a: 1, b: 0 };
  const result = applyWallChamfer(state, state.walls[0], state.walls[1], 25);
  assert.equal(result.ok, true);
  near(state.openings[0].s, 15);
  near(state.nodes[state.walls[0].a].x, -25);
});

test("a chamfer refuses collinear runs and impossible setbacks", () => {
  const collinear = scene();
  collinear.nodes[2] = { x: 100, z: 0 };
  assert.equal(proposeWallChamfer(collinear, collinear.walls[0], collinear.walls[1], 10).reason, "collinear");
  const state = scene();
  assert.equal(applyWallChamfer(state, state.walls[0], state.walls[1], 100).reason, "too-large");
  assert.equal(state.walls.length, 2);
});

test("a generated fillet can be restored to its original sharp topology", () => {
  const state = scene({ openings: [{ id: 4, wall: 11, s: 50, width: 10 }] });
  const rounded = applyWallFillet(state, state.walls[0], state.walls[1], 20);
  assert.equal(rounded.wall.cornerTreatment.type, "fillet");
  const restored = applyCornerRestore(state, rounded.wall);
  assert.equal(restored.ok, true);
  assert.equal(state.walls.length, 2);
  assert.equal(state.walls[0].b, 1);
  assert.equal(state.walls[1].a, 1);
  near(state.openings[0].s, 50);
});

test("restoring a treatment reparameterizes an arm extended at its A end", () => {
  const state = scene({ openings: [{ id: 5, wall: 10, s: 40, width: 10 }] });
  state.walls[0] = { ...state.walls[0], a: 1, b: 0 };
  const cut = applyWallChamfer(state, state.walls[0], state.walls[1], 15);
  near(state.openings[0].s, 25);
  const restored = applyCornerRestore(state, cut.wall);
  assert.equal(restored.ok, true);
  near(state.openings[0].s, 40);
});

test("restore refuses ordinary walls and treatments carrying hosted content", () => {
  const state = scene();
  assert.equal(proposeCornerRestore(state, state.walls[0]).reason, "not-treatment");
  const cut = applyWallChamfer(state, state.walls[0], state.walls[1], 10);
  state.openings.push({ id: 6, wall: cut.wall.id, s: 5, width: 2 });
  assert.equal(applyCornerRestore(state, cut.wall).reason, "connector-hosted");
  assert.equal(state.walls.length, 3);
});

test("an authored fillet radius can be edited without changing its wall id", () => {
  const state = scene();
  const first = applyWallFillet(state, state.walls[0], state.walls[1], 10, { makeId: () => 88 });
  first.wall.material = "painted-corner";
  const updated = applyCornerTreatmentUpdate(state, first.wall, "fillet", 35);
  assert.equal(updated.ok, true);
  assert.equal(updated.wall.id, 88);
  assert.equal(updated.wall.material, "painted-corner");
  assert.equal(updated.wall.cornerTreatment.value, 35);
  near(wallCurveGeom(updated.wall, state.nodes).radius, 35);
  assert.equal(state.walls.length, 3);
});

test("a rounded corner converts directly to a straight chamfer and back", () => {
  const state = scene();
  const rounded = applyWallFillet(state, state.walls[0], state.walls[1], 20);
  const cut = applyCornerTreatmentUpdate(state, rounded.wall, "chamfer", 15);
  assert.equal(cut.ok, true);
  assert.equal(cut.wall.cornerTreatment.type, "chamfer");
  assert.equal(wallCurveGeom(cut.wall, state.nodes).kind, "line");
  const roundAgain = applyCornerTreatmentUpdate(state, cut.wall, "fillet", 12);
  assert.equal(roundAgain.ok, true);
  near(wallCurveGeom(roundAgain.wall, state.nodes).radius, 12);
});

test("an unsafe treatment resize is rejected before any model mutation", () => {
  const state = scene({ openings: [{ id: 7, wall: 10, s: 60, width: 10 }] });
  const rounded = applyWallFillet(state, state.walls[0], state.walls[1], 10);
  const before = JSON.stringify({ nodes: state.nodes, walls: state.walls, openings: state.openings });
  assert.equal(proposeCornerTreatmentUpdate(state, rounded.wall, "fillet", 50).reason, "hosted");
  assert.equal(applyCornerTreatmentUpdate(state, rounded.wall, "fillet", 50).reason, "hosted");
  assert.equal(JSON.stringify({ nodes: state.nodes, walls: state.walls, openings: state.openings }), before);
});
