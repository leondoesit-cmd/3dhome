import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { synchronizeExtrusionProjections } from '../js/core/extrusion_projection.js';

// HOUSING BatteryLoftPlane collapsed onto the Base Extrude's back face after a
// rebuild: the plane display patch had no offset, and applying it wrote
// `offset: undefined` over the plane reference, which a save then dropped.
function doc() {
  return {
    parts: [], sketches: [], features: [],
    references: [{ id: 'plane_32', type: 'plane', name: 'BatteryLoftPlane', origin: { x: 0, y: 0, z: -3.302 }, normal: { x: 0, y: 0, z: -1 }, offset: 3.302, refType: 'offset', support: { persistentId: 'base:face:start' } }],
    referenceGeometry: [{ id: 'plane_32', type: 'reference_plane', name: 'BatteryLoftPlane', origin: { x: 0, y: 0, z: -3.302 }, normal: { x: 0, y: 0, z: -1 }, offset: 3.302, refType: 'offset' }],
  };
}

test('a plane display patch without an offset leaves the plane offset intact', () => {
  const d = doc();
  synchronizeExtrusionProjections(d, [], { ok: true, referenceUpdates: [{ id: 'plane_32', origin: { x: 0, y: 0, z: -3.302 }, normal: { x: 0, y: 0, z: -1 } }] });
  const reference = d.references[0];
  assert.equal(reference.offset, 3.302);
  assert.ok('offset' in JSON.parse(JSON.stringify(reference)), 'offset survives serialisation');
  assert.equal(d.referenceGeometry[0].offset, 3.302);
});

test('a patch that does carry an offset still updates it', () => {
  const d = doc();
  synchronizeExtrusionProjections(d, [], { ok: true, referenceUpdates: [{ id: 'plane_32', origin: { x: 0, y: 0, z: -4 }, normal: { x: 0, y: 0, z: -1 }, offset: 4 }] });
  assert.equal(d.references[0].offset, 4);
  assert.equal(d.references[0].origin.z, -4);
});

test('the rebuild includes the plane offset in its display patch', () => {
  const src = readFileSync(new URL('../js/cad_feature_tree.js', import.meta.url), 'utf8');
  const at = src.indexOf('const display = { id: plane.id, origin: moved.frame.origin, normal: moved.frame.normal };');
  assert.ok(at > 0);
  assert.match(src.slice(at, at + 260), /display\.offset = Number\(plane\.offset\)/);
});
