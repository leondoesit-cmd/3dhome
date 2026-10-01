import test from "node:test";
import assert from "node:assert/strict";
import { makeBrepPrimitive, makeBrepLoft, disposeBrep, shapeToMeshData } from "../js/cad_kernel.js";
import { binaryStlFromPositions, exportBinaryStl, STL_FINE_MESH, stlMeshOptions } from "../js/cad_stl.js";

test("custom STL resolution converts millimeters and degrees without changing mesh defaults", () => {
  assert.deepEqual(stlMeshOptions(), STL_FINE_MESH);
  assert.deepEqual(stlMeshOptions({quality:'fine'}), STL_FINE_MESH);
  const custom=stlMeshOptions({quality:'custom',deviationMm:0.01,angleDegrees:5});
  assert.equal(custom.deflection,0.001);
  assert.equal(custom.angle,Math.PI/36);
  for(const deviationMm of [0,NaN,Infinity,-1,101]) assert.throws(()=>stlMeshOptions({quality:'custom',deviationMm,angleDegrees:5}),/deviation/);
  for(const angleDegrees of [0,NaN,Infinity,-1,46]) assert.throws(()=>stlMeshOptions({quality:'custom',deviationMm:0.01,angleDegrees}),/angle/);
});

test("custom STL export remeshes curved geometry at the requested resolution", async () => {
  const sphere=await makeBrepPrimitive({type:'sphere',r:1});
  try {
    const coarse=await exportBinaryStl(sphere,'coarse',{quality:'coarse'});
    const custom=await exportBinaryStl(sphere,'custom',{quality:'custom',deviationMm:0.01,angleDegrees:5});
    assert.ok(new DataView(custom.buffer).getUint32(80,true)>new DataView(coarse.buffer).getUint32(80,true)*2);
  } finally {disposeBrep(sphere);}
});

test("binary STL has a valid little-endian triangle record and millimeter coordinates", () => {
  const bytes = binaryStlFromPositions([0, 0, 0, 2, 0, 0, 0, 3, 0], "fixture");
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 134);
  assert.equal(view.getUint32(80, true), 1);
  assert.equal(view.getFloat32(84 + 8, true), 1); // outward +Z normal
  assert.deepEqual([view.getFloat32(96 + 3 * 4, true), view.getFloat32(96 + 7 * 4, true)], [20, 30]);
  assert.equal(view.getUint16(132, true), 0);
  assert.match(new TextDecoder().decode(bytes.subarray(0, 80)), /coordinates in mm/);
  assert.throws(() => binaryStlFromPositions([0, 0, 0]), /complete triangles/);
  assert.throws(() => binaryStlFromPositions([0, 0, 0, 0, 0, 0, 0, 0, 0]), /degenerate/);
});

test("STL tessellates the exact solid at Fine resolution and preserves its metric bounds", async () => {
  const body = await makeBrepPrimitive({ type: "box", w: 2, h: 3, d: 4 });
  try {
    const bytes = await exportBinaryStl(body, "new box");
    const view = new DataView(bytes.buffer);
    const count = view.getUint32(80, true);
    assert.ok(count >= 12);
    assert.equal(bytes.length, 84 + 50 * count);
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < count; t++) {
      for (let vertex = 0; vertex < 3; vertex++) {
        for (let axis = 0; axis < 3; axis++) {
          const value = view.getFloat32(84 + t * 50 + 12 + vertex * 12 + axis * 4, true);
          mins[axis] = Math.min(mins[axis], value);
          maxs[axis] = Math.max(maxs[axis], value);
        }
      }
    }
    assert.deepEqual(maxs.map((value, axis) => value - mins[axis]).sort((a, b) => a - b), [20, 30, 40]);
    assert.deepEqual(STL_FINE_MESH, { deflection: 0.02, angle: 0.08 });
    const mesh = await shapeToMeshData(body, STL_FINE_MESH);
    assert.equal(count, mesh.positions.length / 9);
  } finally { disposeBrep(body); }
});

test("Fine STL produces more curved facets than the editor's display mesh", async () => {
  const sphere = await makeBrepPrimitive({ type: "sphere", r: 2 });
  try {
    const display = await shapeToMeshData(sphere, { deflection: 0.28, angle: 0.18 });
    const stl = await exportBinaryStl(sphere);
    const count = new DataView(stl.buffer).getUint32(80, true);
    assert.ok(count > display.positions.length / 9 * 2, "export must remesh the BREP at Fine resolution");
  } finally { disposeBrep(sphere); }
});

test("STL blocks open sheets instead of exporting misleading surface triangles", async () => {
  const section = y => [{ x: 0, y, z: 0 }, { x: 1, y, z: 0 }, { x: 1, y, z: 1 }, { x: 0, y, z: 1 }];
  const sheet = await makeBrepLoft({ sections: [section(0), section(1)], solid: false, ruled: true });
  try { await assert.rejects(() => exportBinaryStl(sheet), /no closed solid/); }
  finally { disposeBrep(sheet); }
});
