import test from 'node:test';
import assert from 'node:assert/strict';
import { roomInspectionFill, roomIrradiance } from '../js/room_bounce.js';

test('daylight dollhouse inspection lights an unlit room without changing physical flux', () => {
  const room = { pts: [{x:0,z:0},{x:500,z:0},{x:500,z:400},{x:0,z:400}] };
  assert.deepEqual(roomIrradiance([room], [], 0.5, 270), [[0,0,0]], 'physical flux stays zero');
  assert.equal(roomInspectionFill({ daylight: 1 }), 0.35);
  assert.equal(roomInspectionFill({ daylight: 0.5 }), 0.175);
});

test('inspection fill is absent in physical, covered and night views', () => {
  for (const flag of ['walk', 'showCeiling', 'covered', 'physicalMode'])
    assert.equal(roomInspectionFill({ daylight: 1, [flag]: true }), 0, flag);
  for (const daylight of [0, -1, undefined, NaN])
    assert.equal(roomInspectionFill({ daylight }), 0);
  assert.equal(roomInspectionFill({ daylight: 2 }), 0.35);
});
