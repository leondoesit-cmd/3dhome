import { sourceFunctionText } from "./helpers/source_function.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planarFaceNameAgrees } from '../js/core/topology.js';

// HOUSING Boss-Loft1 merged into the Base Extrude. The exact result named the
// loft's rounded-square back cap "Base Extrude face:end" and the extrude's real
// front cap "face:start", so the book's "back face of Boss-Loft1" (step 350)
// bound to the wrong feature. These are the saved descriptors.
const plane = (z, nz) => ({ descriptor: { surface: 'plane', origin: { x: 0, y: 0, z }, normal: { x: 0, y: 0, z: nz }, measure: 96.99 } });
const extrudeStart = plane(0, -1);       // expected name: consumed by the merge
const extrudeEnd = plane(3.302, 1);      // expected name: still on the solid
const frontCap = plane(3.302, 1);        // exact face at the front
const loftBackCap = plane(-3.302, -1);   // exact face made by the loft

test('the old start cap, gone from the merged solid, names neither remaining cap', () => {
  assert.equal(planarFaceNameAgrees(extrudeStart, frontCap), false, 'opposite normal');
  assert.equal(planarFaceNameAgrees(extrudeStart, loftBackCap), false, 'same normal, 3.302 cm off the plane');
});

test('the end cap keeps its name only on the face that is really there', () => {
  assert.equal(planarFaceNameAgrees(extrudeEnd, frontCap), true);
  assert.equal(planarFaceNameAgrees(extrudeEnd, loftBackCap), false);
});

test('non-planar faces and incomplete descriptors are left to the existing score', () => {
  const cylinder = { descriptor: { surface: 'cylinder', origin: { x: 0, y: 0, z: 1.651 }, normal: { x: -1, y: 0, z: 0 } } };
  assert.equal(planarFaceNameAgrees(cylinder, frontCap), true);
  assert.equal(planarFaceNameAgrees({ descriptor: { surface: 'plane' } }, frontCap), true);
});

test('a face moved within the tolerance still keeps its name', () => {
  assert.equal(planarFaceNameAgrees(extrudeEnd, plane(3.3025, 1)), true);
  assert.equal(planarFaceNameAgrees(extrudeEnd, plane(3.31, 1)), false);
});

test('exact topology naming applies the plane gate before assigning a name', () => {
  const src = moduleSource("js/cad_kernel.js");
  const body = sourceFunctionText(src, 'extractBrepTopology');
  assert.match(body, /planarFaceNameAgrees\(reference, /);
});
