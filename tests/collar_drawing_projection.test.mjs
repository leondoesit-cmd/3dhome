import test from "node:test";
import assert from "node:assert/strict";
import { booleanBrep, disposeBrep, makeBrepExtrusion, shapeToMeshData } from "../js/cad_kernel.js";
import { projectSolid } from "../js/core/hidden_line.js";

test("a cut collar retains outlines and bore hidden lines when a tessellation facet is edge-on", async () => {
  const ring = (radius) => Array.from({ length: 64 }, (_, i) => ({ u: radius * Math.cos(i * Math.PI / 32), v: radius * Math.sin(i * Math.PI / 32) }));
  const owned = [];
  try {
    const outer = await makeBrepExtrusion({ axis: "z", from: 0, to: .635, points: ring(.55626) }); owned.push(outer);
    const inner = await makeBrepExtrusion({ axis: "z", from: 0, to: .635, points: ring(.23876) }); owned.push(inner);
    const collar = await booleanBrep("subtract", outer, inner); owned.push(collar);
    const mesh = await shapeToMeshData(collar);
    // Match the viewport's Float32 positions supplied to the drawing sheet.
    mesh.positions = new Float32Array(mesh.positions);
    for (const view of ["top", "right"]) {
      const projection = projectSolid([mesh], view);
      assert.equal(projection.visible.length, 4, view + " has a complete rectangular outline");
      assert.equal(projection.hidden.length, 2, view + " has both bore walls");
    }
  } finally { owned.reverse().forEach(disposeBrep); }
});
