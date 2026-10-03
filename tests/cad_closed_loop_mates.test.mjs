import test from 'node:test';
import assert from 'node:assert/strict';
import { solveTopologyMates, topologyReference } from '../js/cad_mates.js';

const axis = { x: 0, y: 0, z: 1 };
const T = (x = 0, y = 0, rz = 0) => ({ x, y, z: 0, rx: 0, ry: 0, rz });
const at = (x, y) => ({ x, y, z: 0 });
const ref = (part, id, point, kind) => topologyReference(part, 'face', id, kind === 'axis'
  ? { surface: 'cylinder', origin: point, axis, radius: 0.3 }
  : { surface: 'plane', origin: point, normal: axis });

function hinge(name, fixed, moving, point) {
  return [
    { id: `${name}-axis`, type: 'concentric', a: ref(fixed, `${name}-a`, point, 'axis'), b: ref(moving, `${name}-b`, point, 'axis') },
    { id: `${name}-axial`, type: 'coincident', aligned: true, a: ref(fixed, `${name}-face-a`, point, 'plane'), b: ref(moving, `${name}-face-b`, point, 'plane') },
  ];
}

test('grounded four-bar closes as one one-DOF linkage after handle motion', () => {
  // An educational clamp: A-D 4 cm, A-B 1.8, B-C 3.8, C-D 2.4.
  // The last D joint reads the grounded bracket and moves the rocker, as the UI
  // requires. The physical cycle still runs through that grounded bracket.
  const A = at(0, 8), D = at(0, 4);
  const B = at(0.4658742811845373, 9.738666487320323);
  const C = at(-0.9399532749187187, 6.008277135035306);
  const delta = 7 * Math.PI / 180;
  const assembly = {
    components: [
      { id: 'bracket', grounded: true, transform: T() },
      { id: 'handle', transform: T(8 * Math.sin(delta), 8 * (1 - Math.cos(delta)), 7) },
      { id: 'link', transform: T() },
      { id: 'arm', transform: T() },
    ],
    topologyMates: [
      ...hinge('A', 'bracket', 'handle', A),
      ...hinge('B', 'handle', 'link', B),
      ...hinge('C', 'link', 'arm', C),
      ...hinge('D', 'bracket', 'arm', D),
    ],
  };
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.unsatisfied.length, 0, 'no closure mate may be dropped');
  assert.equal(result.degreesOfFreedom, 1, 'the closed loop has one input angle');
  assert.equal(result.clusters.length, 1, 'all moving links solve simultaneously');
  const bracket = assembly.components[0].transform;
  assert.equal(Math.hypot(bracket.x, bracket.y, bracket.z, bracket.rx, bracket.ry, bracket.rz), 0,
    'grounded bracket remains fixed');
  const again = solveTopologyMates(assembly);
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.degreesOfFreedom, 1);

  const marker = { x: Math.cos(75 * Math.PI / 180), y: Math.sin(75 * Math.PI / 180), z: 0 };
  assembly.topologyMates.push({
    id: 'handle-travel', type: 'angle', angleMin: 0, angleMax: 175, value: 0,
    a: topologyReference('bracket', 'face', 'travel-fixed', { surface: 'plane', origin: A, normal: marker }),
    b: topologyReference('handle', 'face', 'travel-moving', { surface: 'plane', origin: A, normal: marker }),
  });
  const ranged = solveTopologyMates(assembly);
  assert.equal(ranged.ok, true, JSON.stringify(ranged));
  assert.equal(ranged.degreesOfFreedom, 1, 'an interior limit range leaves the crank free');

  // A fixed angle is an optional motor input. It removes exactly the one
  // remaining freedom while retaining all four hinge contacts.
  delete assembly.topologyMates.at(-1).angleMin;
  delete assembly.topologyMates.at(-1).angleMax;
  assembly.topologyMates.at(-1).value = 10;
  const driven = solveTopologyMates(assembly);
  assert.equal(driven.ok, true, JSON.stringify(driven));
  assert.equal(driven.degreesOfFreedom, 0);
});

test('a joint chain still decomposes instead of becoming one dense system', () => {
  const parts = [{ id: 'ground', grounded: true, transform: T() }];
  const mates = [];
  for (let n = 0; n < 12; n++) {
    const next = `link${n}`;
    parts.push({ id: next, transform: T() });
    mates.push(...hinge(`joint${n}`, n ? `link${n - 1}` : 'ground', next, at(n, 0)));
  }
  const result = solveTopologyMates({ components: parts, topologyMates: mates });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.clusters.length, 12, 'bridge joints retain the chain fast path');
  assert.equal(result.degreesOfFreedom, 12);
});
