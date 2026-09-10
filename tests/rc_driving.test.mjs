import test from 'node:test';
import assert from 'node:assert/strict';
import { motorDrag, passedGate, courseAhead, courseFingerprint } from '../js/rc_driving.js';

test('full throttle reaches racing and drift speed, release provides engine braking', () => {
  const runs = [30, 60, 120].map(hz => {
    let v = 0;
    for (let i = 0; i < 6 * hz; i++) {
      v += 88 * (1 - 0.55 * v / 78) / hz;
      v -= v * motorDrag(1, 1.65) / hz;
      v = Math.min(78, v);
    }
    assert.ok(v > 70);
    const powered = v;
    for (let i = 0; i < hz; i++) v -= v * motorDrag(0, 1.65) / hz;
    assert.ok(v < powered * 0.22);
    return powered;
  });
  assert.ok(Math.max(...runs) - Math.min(...runs) < 1);
});

const gate = { x: 0, z: 0, y: 0, ux: 0, uz: 1 }, next = { x: 0, z: 20 };
test('checkpoints require a forward crossing within the lane for every racer', () => {
  const p = (x, z, y = 0) => ({ x, z, y });
  assert.equal(passedGate(p(0, -20), p(0, 20), gate, next, 13), true);
  assert.equal(passedGate(p(0, 20), p(0, -20), gate, next, 13), false);
  assert.equal(passedGate(p(0, -2), p(0, -1), gate, next, 13), false);
  assert.equal(passedGate(p(16, -20), p(16, 20), gate, next, 13), false);
  assert.equal(passedGate(p(0, -2, 20), p(0, 2, 20), gate, next, 13), false);
  assert.equal(passedGate(p(0, 0), p(0, 1), gate, next, 13), true);
});

test('corner planning reduces speed for tighter radii and chooses a forward target', () => {
  function circle(radius) {
    return Array.from({length: 160}, (_, i) => ({x: radius * Math.cos(i * Math.PI / 80), z: radius * Math.sin(i * Math.PI / 80), y: 0}));
  }
  const tight = courseAhead(circle(25), {x: 25, z: 0, y: 0, v: 60}, 78);
  const wide = courseAhead(circle(150), {x: 150, z: 0, y: 0, v: 60}, 78);
  assert.ok(tight.speed < 45);
  assert.ok(wide.speed > tight.speed + 25);
  assert.ok(tight.target.z > 0);
  assert.equal(tight.turn, -1);
  assert.equal(tight.off, 0);
});

test('stacked courses choose the surface at the car height', () => {
  const points = [{x:0,z:0,y:0}, {x:0,z:10,y:0}, {x:10,z:10,y:0},
    {x:0,z:0,y:40}, {x:0,z:-10,y:40}, {x:-10,z:-10,y:40}];
  const route = courseAhead(points, {x:0,z:0,y:40,v:0}, 78);
  assert.equal(route.target.y, 40);
  assert.ok(route.target.z < 0);
});


test('records distinguish direction, position and elevation even for equal length courses', () => {
  const C = [{x:0,z:0,y:0}, {x:100,z:0,y:0}, {x:100,z:100,y:0}];
  const key = courseFingerprint(C);
  assert.equal(courseFingerprint(C.map(p => ({...p}))), key);
  assert.notEqual(courseFingerprint([...C].reverse()), key);
  assert.notEqual(courseFingerprint(C.map(p => ({...p, x:p.x + 100}))), key);
  assert.notEqual(courseFingerprint(C.map(p => ({...p, y:20}))), key);
});
