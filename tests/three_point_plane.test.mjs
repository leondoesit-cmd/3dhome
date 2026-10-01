import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOffsetPlanes, threePointPlane, offsetPlaneOwners} from '../js/core/offset_planes.js';

const v = (x, y, z, owner = 'base') => ({ownerFeatureId: owner, kind: 'vertex', persistentId: `${owner}:${x},${y},${z}`, descriptor: {point: {x, y, z}}});

function doc(points) {
  return {
    references: [
      {id: 'top', type: 'plane', origin: {x: 0, y: 0, z: 0}, normal: {x: 0, y: 1, z: 0}},
      {id: 'tri', type: 'plane', baseReferenceId: 'top', refType: 'three-points', threePoints: points},
    ],
    referenceGeometry: [{id: 'tri', type: 'reference_plane'}],
    sketches: [{id: 's', referenceId: 'tri'}],
  };
}

test('a three-point plane sits on the first point with the right-hand normal', () => {
  const d = doc([v(4, 0, 1.25), v(4, 1, -0.75), v(1.5, 2.125, 1.25)]);
  assert.equal(resolveOffsetPlanes(d).ok, true);
  const p = d.references[1];
  assert.deepEqual(p.origin, {x: 4, y: 0, z: 1.25});
  const n = p.normal, len = Math.hypot(n.x, n.y, n.z);
  assert.ok(Math.abs(len - 1) < 1e-12);
  // every defining point satisfies n . (p - origin) = 0
  for (const pt of d.references[1].threePoints) {
    const q = pt.descriptor.point;
    assert.ok(Math.abs(n.x * (q.x - 4) + n.y * (q.y - 0) + n.z * (q.z - 1.25)) < 1e-12);
  }
  assert.deepEqual(d.sketches[0].frame.normal, n);
  assert.deepEqual(d.referenceGeometry[0].origin, p.origin);
});

test('collinear or missing points are refused and leave the document untouched', () => {
  const bad = doc([v(0, 0, 0), v(1, 1, 1), v(2, 2, 2)]);
  const before = JSON.stringify(bad);
  const run = resolveOffsetPlanes(bad);
  assert.equal(run.ok, false);
  assert.match(run.issues[0].message, /collinear/);
  assert.equal(JSON.stringify(bad), before);
  assert.throws(() => threePointPlane({threePoints: [v(0, 0, 0), v(1, 0, 0)]}), /three points/);
});

test('a rebuilt vertex moves the plane; a lost vertex keeps its stored point', () => {
  const pts = [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)];
  const moved = threePointPlane({threePoints: pts}, (ref) => ref === pts[2] ? v(0, 1, 1) : null);
  assert.ok(Math.abs(Math.hypot(moved.normal.x, moved.normal.y, moved.normal.z) - 1) < 1e-12);
  assert.ok(Math.abs(moved.normal.z) < 1);
  const kept = threePointPlane({threePoints: pts}, () => null);
  assert.deepEqual(kept.normal, {x: 0, y: 0, z: 1});
});

test('owning features of the points are dependencies of the plane', () => {
  const d = doc([v(0, 0, 0, 'a'), v(1, 0, 0, 'b'), v(0, 1, 0, 'a')]);
  assert.deepEqual(offsetPlaneOwners('tri', d.references).sort(), ['a', 'b']);
});

test('typed free points (no owner feature) define the plane and are not dependencies', () => {
  const free = (x, y, z) => ({kind: 'vertex', descriptor: {point: {x, y, z}}});
  const d = doc([v(4, 0, 1.25), free(4, 1, -0.75), free(1.5, 2.125, 1.25)]);
  const run = resolveOffsetPlanes(d, () => null);
  assert.equal(run.ok, true);
  const n = d.references[1].normal;
  // Planchard CSWA Q1: normal proportional to (4.25, 5, 2.5)
  assert.ok(Math.abs(n.x / n.y - 4.25 / 5) < 1e-12 && Math.abs(n.z / n.y - 2.5 / 5) < 1e-12);
  assert.deepEqual(offsetPlaneOwners('tri', d.references), ['base']);
});
