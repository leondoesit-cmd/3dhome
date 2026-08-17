import test from "node:test";
import assert from "node:assert/strict";
import { convertCadToWalls } from "../js/cad_to_walls.js";

test("parallel CAD surface lines become a typed wall at their centre", () => {
  const out = convertCadToWalls({ lines: [
    { x1: 0, z1: 0, x2: 300, z2: 0, layer: "ext" },
    { x1: 0, z1: 20, x2: 300, z2: 20, layer: "ext" },
  ] }, { wallTypeByLayer: { ext: "exterior" } });
  assert.equal(out.walls.length, 1);
  assert.equal(out.walls[0].thickness, 20);
  assert.equal(out.walls[0].wallTypeId, "exterior");
  assert.deepEqual(out.nodes, [{ x: 0, z: 10 }, { x: 300, z: 10 }]);
});

test("CAD opening markers attach to the nearest converted wall", () => {
  const out = convertCadToWalls({
    lines: [{ x1: 0, z1: 0, x2: 300, z2: 0 }, { x1: 0, z1: 10, x2: 300, z2: 10 }],
    doors: [{ x: 100, z: 5, width: 90 }],
  });
  assert.equal(out.openings.length, 1);
  assert.equal(out.openings[0].wall, out.walls[0].id);
  assert.equal(out.openings[0].s, 100);
});

test("CAD arcs remain analytic curved walls", () => {
  const out = convertCadToWalls({ arcs: [{ cx: 0, z: 0, radius: 100, startAngle: 0, endAngle: Math.PI / 2 }] });
  assert.equal(out.walls.length, 1);
  assert.equal(out.walls[0].geometry.type, "arc");
  assert.ok(Math.abs(out.nodes[1].z - 100) < 1e-9);
});
