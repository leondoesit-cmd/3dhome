import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { validateDesign, validationSummary } from "../js/validator.js";
import { addConstraint, applyConstraints } from "../js/constraints.js";
import { generateLayouts, applyLayout } from "../js/layouts.js";
import { toSVG, toDXF, toIFC, toScheduleCSV } from "../js/exports_pro.js";

function fixture() {
  S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [];
  S.items = [
    { id: 10, type: "chair", x: 100, z: 100, w: 50, d: 50, h: 80, rot: 0 },
    { id: 11, type: "table", x: 250, z: 180, w: 80, d: 60, h: 75, rot: 0 },
  ];
  S.mep = { nodes: [], runs: [] };
  S.roomMeta = {};
  S.workspace = { id: "test", name: "Test", activeFloor: "floor-1", floors: [], constraints: [], comments: [], role: "owner", quality: "auto" };
}

test("validator reports collisions, invalid openings, and disconnected MEP", () => {
  fixture();
  S.items[1].x = 110; S.items[1].z = 105;
  S.openings.push({ id: 20, type: "door", wall: 1, s: 390, width: 90, height: 210 });
  S.mep.runs.push({ id: 30, sys: "power", pts: [{ x: 0, z: 0 }, { x: 10, z: 10 }] });
  const issues = validateDesign();
  const summary = validationSummary(issues);
  assert.ok(summary.error >= 1);
  assert.ok(summary.warning >= 1);
  assert.ok(summary.info >= 1);
});

test("constraints preserve a selected wall length and align selected items", () => {
  fixture();
  const wallConstraint = addConstraint("wallLength", { kind: "wall", ref: S.walls[0] });
  wallConstraint.value = 500;
  addConstraint("alignX", { kind: "items", refs: S.items });
  assert.equal(applyConstraints(), 2);
  assert.equal(S.nodes[1].x, 500);
  assert.equal(S.items[1].x, S.items[0].x);
});

test("layout alternatives are scored and can be applied without moving locked items", () => {
  fixture();
  S.items[0].locked = true;
  const before = { x: S.items[0].x, z: S.items[0].z };
  const layouts = generateLayouts();
  assert.equal(layouts.length, 3);
  assert.ok(layouts.every((candidate) => Number.isFinite(candidate.score)));
  applyLayout(layouts.find((candidate) => candidate.id === "rotate"));
  assert.deepEqual({ x: S.items[0].x, z: S.items[0].z }, before);
});

test("professional exports contain the current model and schedules", () => {
  fixture();
  assert.match(toSVG(), /<svg[\s\S]*<line/);
  assert.match(toDXF(), /SECTION[\s\S]*LINE[\s\S]*EOF/);
  assert.match(toIFC(), /IFC4[\s\S]*IFCFURNISHINGELEMENT/);
  assert.match(toScheduleCSV(), /category,type,id[\s\S]*furniture,chair/);
});
