import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureParametricDocument } from '../js/core/parametric_document.js';
import { resolveOffsetPlanes } from '../js/core/offset_planes.js';

// HOUSING BatteryLoftPlane: offset 1.300 in [33.02] from the Base Extrude's
// back face. After a save/restore the plane's `references` entry had lost its
// offset, the rebuild resolved it onto the face itself (z = 0), Sketchsquare's
// frame followed, and Boss-Loft1 lofted two coplanar sections into nothing.
function housing() {
  const face = {
    type: 'topology-reference', ownerFeatureId: 'base', kind: 'face', persistentId: 'base:face:start', semantic: 'start',
    descriptor: { surface: 'plane', semantic: 'start', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: -1 } },
  };
  const plane = { id: 'plane_32', type: 'plane', name: 'BatteryLoftPlane', origin: { x: 0, y: 0, z: -3.302 }, normal: { x: 0, y: 0, z: -1 }, offset: 3.302, refType: 'offset', support: face };
  return {
    schemaVersion: 8, kind: 'part', name: 'HOUSING', metadata: { authoringSystem: 'parametric-v1' },
    references: [
      { id: 'plane:front', type: 'plane', name: 'Front Plane', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xAxis: { x: 1, y: 0, z: 0 } },
      plane,
    ],
    referenceGeometry: [{ ...JSON.parse(JSON.stringify(plane)), type: 'reference_plane' }],
    sketches: [{ id: 'sq', name: 'Sketchsquare', referenceId: 'plane_32', frameSpace: 'local', frame: { origin: { x: 0, y: 0, z: -3.302 }, xAxis: { x: -1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: -1 } }, points: [], entities: [], constraints: [] }],
    features: [], history: [],
  };
}

test('an offset plane keeps its offset, type and support through document migration', () => {
  const doc = ensureParametricDocument(JSON.parse(JSON.stringify(housing())));
  const plane = doc.references.find((r) => r.id === 'plane_32');
  assert.ok(plane, 'plane reference kept');
  assert.equal(plane.offset, 3.302, JSON.stringify(plane));
  assert.equal(plane.refType, 'offset');
  assert.equal(plane.support && plane.support.persistentId, 'base:face:start');
});

test('resolving the migrated plane puts it 3.302 cm behind its face, not on it', () => {
  const doc = ensureParametricDocument(JSON.parse(JSON.stringify(housing())));
  const run = resolveOffsetPlanes(doc);
  assert.equal(run.ok, true, JSON.stringify(run.issues));
  const plane = doc.references.find((r) => r.id === 'plane_32');
  assert.ok(Math.abs(plane.origin.z + 3.302) < 1e-9, JSON.stringify(plane.origin));
  const geometry = doc.referenceGeometry.find((r) => r.id === 'plane_32');
  assert.ok(Math.abs(geometry.origin.z + 3.302) < 1e-9 && geometry.offset === 3.302, JSON.stringify(geometry));
  const sketch = doc.sketches.find((s) => s.id === 'sq');
  assert.ok(Math.abs(sketch.frame.origin.z + 3.302) < 1e-9, 'Sketchsquare stays on the plane');
});

test('a plane reference that lost its offset is healed from its reference geometry', () => {
  const broken = housing();
  delete broken.references[1].offset;
  broken.references[1].origin = { x: 0, y: 0, z: 0 };
  const doc = ensureParametricDocument(JSON.parse(JSON.stringify(broken)));
  const run = resolveOffsetPlanes(doc);
  assert.equal(run.ok, true);
  const plane = doc.references.find((r) => r.id === 'plane_32');
  assert.equal(plane.offset, 3.302, 'offset recovered from referenceGeometry');
  assert.ok(Math.abs(plane.origin.z + 3.302) < 1e-9, JSON.stringify(plane.origin));
});
