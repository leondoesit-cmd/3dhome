import test from 'node:test';
import assert from 'node:assert/strict';
import { centerOfMassInSystem } from '../js/cad_mass_properties.js';

test('CSWA Q6A: COM relative to the front-right-bottom vertex with the Y axis reversed', () => {
  // Q6 centre of mass in the part frame (mm): (-15.39, 15.93, -2.65); vertex (65, 0, 20).
  const rel = centerOfMassInSystem({ x: -15.39, y: 15.93, z: -2.65 }, {
    origin: { x: 65, y: 0, z: 20 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: -1, z: 0 }, zAxis: { x: 0, y: 0, z: 1 },
  });
  assert.ok(Math.abs(rel.x + 80.39) < 1e-9 && Math.abs(rel.y + 15.93) < 1e-9 && Math.abs(rel.z + 22.65) < 1e-9);
});

test('default axes only translate', () => {
  assert.deepEqual(centerOfMassInSystem({ x: 1, y: 2, z: 3 }, { origin: { x: 1, y: 1, z: 1 }, xAxis: { x: 1 }, yAxis: { y: 1 }, zAxis: { z: 1 } }), { x: 0, y: 1, z: 2 });
});
