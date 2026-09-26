import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBrepPrimitive, extractBrepTopology, shellBrep, shapeMassProperties, brepContainsPoint, disposeBrep } from '../js/cad_kernel.js';

// HOUSING Shell1 (steps 361-366): after the .100 in shell, Mass properties read
// 111.145 x 111.145 x 177.81 mm for a body that is 111.125 x 111.125 x 177.8 mm.
// The reported box had been padded by the offset faces' shape tolerances.
test('mass properties report tolerance-free bounds', () => {
  const src = readFileSync(new URL('../js/cad_kernel.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function shapeMassProperties'), src.indexOf('export async function makeBrepHoleTool'));
  assert.match(body, /bounds:shapeBounds\(oc, brep\.shape, false\)/);
  assert.match(src, /function shapeBounds\(oc, shape, useShapeTolerance = true\)/, 'geometry checks keep the padded default');
});

test('a shelled Ø4.375 in disc still measures exactly Ø111.125 x 33.02 mm', async () => {
  const R = 5.55625, H = 3.302;
  const disc = await makeBrepPrimitive({ type: 'cylinder', r: R, h: H, axis: 'z' });
  let shelled = null;
  try {
    const topology = extractBrepTopology(disc, { ownerFeatureId: 'disc' }).topology;
    const front = topology.find((t) => t.kind === 'face' && t.descriptor.surface === 'plane' && Math.abs(t.descriptor.origin.z - H) < 1e-6);
    assert.ok(front, 'front cap found');
    shelled = await shellBrep(disc, 0.254, { facePersistentIds: [front.persistentId] });
    const mass = await shapeMassProperties(shelled);
    const b = mass.bounds;
    assert.ok(Math.abs((b.max.x - b.min.x) - 2 * R) < 1e-6, `X ${b.max.x - b.min.x}`);
    assert.ok(Math.abs((b.max.y - b.min.y) - 2 * R) < 1e-6, `Y ${b.max.y - b.min.y}`);
    assert.ok(Math.abs((b.max.z - b.min.z) - H) < 1e-6, `Z ${b.max.z - b.min.z}`);
    const expected = Math.PI * (R * R - (R - 0.254) ** 2) * H + Math.PI * (R - 0.254) ** 2 * 0.254;
    assert.ok(Math.abs(mass.volume - expected) / expected < 1e-6, `volume ${mass.volume} vs ${expected}`);
  } finally {
    if (shelled) disposeBrep(shelled);
    disposeBrep(disc);
  }
});

test('shelling the reversed start cap opens its centre instead of leaving a valid-looking solid', async () => {
  const disc = await makeBrepPrimitive({ type: 'cylinder', r: 5.55625, h: 3.302, axis: 'z' });
  let shelled;
  try {
    const start = extractBrepTopology(disc, { ownerFeatureId: 'disc' }).topology.find((item) =>
      item.kind === 'face' && item.descriptor.surface === 'plane' && Math.abs(item.descriptor.origin.z) < 1e-6);
    assert.ok(start);
    shelled = await shellBrep(disc, 0.254, { facePersistentIds: [start.persistentId] });
    const mass = await shapeMassProperties(shelled);
    const expected = Math.PI * (5.55625 ** 2 - (5.55625 - 0.254) ** 2) * 3.302
      + Math.PI * (5.55625 - 0.254) ** 2 * 0.254;
    assert.ok(Math.abs(mass.volume - expected) < 1e-4, `shell volume ${mass.volume}`);
    assert.equal(brepContainsPoint(shelled, { x: 0, y: 0, z: 0.508 }), false);
    assert.equal(brepContainsPoint(shelled, { x: 0, y: 0, z: 3.175 }), true);
  } finally {
    if (shelled) disposeBrep(shelled);
    disposeBrep(disc);
  }
});
