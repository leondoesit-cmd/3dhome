import test from "node:test";
import assert from "node:assert/strict";
import { disposeBrep, makeBrepPrimitive, mirrorBrep, shapeToMeshData } from "../js/cad_kernel.js";

test("exact mirror reflects a BREP across an explicit plane and retains the seed", async () => {
  const seed = await makeBrepPrimitive({ type: "box", x: 5, y: 0, z: 0, w: 2, h: 3, d: 4 });
  let mirrored;
  try {
    mirrored = await mirrorBrep(seed, { plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } } });
    const mesh = await shapeToMeshData(mirrored, { deflection: 0.2, angle: 0.2 });
    const xs = [];
    for (let index = 0; index < mesh.positions.length; index += 3) xs.push(mesh.positions[index]);
    assert.ok(Math.abs(Math.min(...xs) + 7) < 1e-5);
    assert.ok(Math.abs(Math.max(...xs) - 7) < 1e-5);
  } finally {
    disposeBrep(mirrored);
    disposeBrep(seed);
  }
});
