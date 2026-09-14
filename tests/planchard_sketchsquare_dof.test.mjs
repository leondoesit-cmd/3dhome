import test from 'node:test';
import assert from 'node:assert/strict';
import { solveSketch } from '../js/sketch_solver.js';
import { mirrorEntities } from '../js/sketch_pattern.js';

/* HOUSING Sketchsquare after mirror + trim (book steps 311–321), rebuilt from
   the browser draft: right half drawn, left half mirrored about the vertical
   construction centerline, the converted circle trimmed to the lower arc. The
   width (3.100 in) and height (1.600 in) are dimensioned only at 326/330. */
function sketchsquare() {
  const P = (id, x, y) => ({ id, x, y });
  return {
    points: [P(29, 0, 0), P(36, 0, 5.55625), P(43, 3.80863, 4.045522), P(47, 3.55463, 5.55625), P(48, 3.80863, 5.30225), P(49, 3.55463, 5.30225),
      P('m1', -3.55463, 5.55625), P('m2', -3.55463, 5.30225), P('m3', -3.80863, 5.30225), P('m4', -3.80863, 4.045522)],
    entities: [
      { id: 30, type: 'arc', a: 'm4', b: 43, c: 29 },
      { id: 37, type: 'line', a: 29, b: 36, construction: true },
      { id: 41, type: 'line', a: 36, b: 47 },
      { id: 44, type: 'line', a: 48, b: 43 },
      { id: 50, type: 'arc', a: 48, b: 47, c: 49 },
      { id: 'L58', type: 'line', a: 36, b: 'm1' },
      { id: 'A60', type: 'arc', a: 'm3', b: 'm1', c: 'm2' },
      { id: 'L7w', type: 'line', a: 'm3', b: 'm4' },
    ],
    constraints: [
      { id: 1, type: 'fixed', point: 29, x: 0, y: 0 }, { id: 2, type: 'diameter', entity: 30, value: 11.1125 },
      { id: 3, type: 'vertical', entity: 37 }, { id: 4, type: 'horizontal', entity: 41 }, { id: 5, type: 'vertical', entity: 44 },
      { id: 6, type: 'tangent', a: 41, b: 50 }, { id: 7, type: 'tangent', a: 44, b: 50 }, { id: 8, type: 'radius', entity: 50, value: 0.254 },
      { id: 10, type: 'symmetric', a: 47, b: 'm1', entity: 37 }, { id: 11, type: 'symmetric', a: 49, b: 'm2', entity: 37 },
      { id: 12, type: 'symmetric', a: 48, b: 'm3', entity: 37 }, { id: 13, type: 'symmetric', a: 43, b: 'm4', entity: 37 },
    ],
  };
}
const pt = (s, id) => s.points.find((p) => p.id === id);

test('before its dimensions the mirrored, trimmed Sketchsquare solves with no conflicts and still moves', () => {
  const s = sketchsquare();
  const r = solveSketch(s);
  assert.equal(r.converged, true);
  assert.deepEqual(r.conflicts, []);
  assert.notEqual(r.status, 'over-constrained');
  // the width is genuinely free: nudge it and the sketch settles on a new, valid width
  pt(s, 43).x = 3.2; pt(s, 48).x = 3.2;
  const moved = solveSketch(s);
  assert.equal(moved.converged, true);
  assert.ok(Math.abs(pt(s, 43).x - 3.80863) > 0.05, 'did not spring back to the drawn width');
});

/* Width and height are still free here. A forward-difference Jacobian reported
   0: the fillet's tangent rows had an exact slope of zero (a line ending on the
   arc can only reach tangency as a maximum of |distance| − radius) and the
   mirrored arc's radius rule duplicated them, and ~1e-5 noise counted both. */
test('the Sketchsquare DOF count before dimensioning is 2', () => {
  const r = solveSketch(sketchsquare());
  assert.equal(r.degreesOfFreedom, 2, JSON.stringify(r));
});

test('the book width 3.100 in and height 1.600 in fully define it, not over-define it', () => {
  const s = sketchsquare();
  s.constraints.push({ id: 98, type: 'distance', a: 29, b: 36, value: 4.064 }, { id: 99, type: 'distance', a: 48, b: 'm3', value: 7.874 });
  const r = solveSketch(s);
  assert.equal(r.status, 'fully-constrained', JSON.stringify(r));
  assert.equal(r.degreesOfFreedom, 0);
  assert.deepEqual(r.conflicts, []);
  assert.ok(Math.abs(pt(s, 36).y - 4.064) < 1e-6);
  assert.ok(Math.abs(pt(s, 48).x - pt(s, 'm3').x - 7.874) < 1e-6);
  assert.ok(Math.abs(Math.hypot(pt(s, 43).x, pt(s, 43).y) - 5.55625) < 1e-6, 'side line still ends on the arc');
});

test('a relation the user adds that the others already imply is still reported over-constrained', () => {
  const s = sketchsquare();
  s.constraints.push({ id: 98, type: 'distance', a: 29, b: 36, value: 4.064 }, { id: 99, type: 'distance', a: 48, b: 'm3', value: 7.874 });
  s.constraints.push({ id: 97, type: 'horizontal', entity: 'L58' }); // implied by horizontal 41 + symmetry
  assert.equal(solveSketch(s).status, 'over-constrained');
});

test('mirroring a line that starts on the axis reuses that point and pairs only the off-axis ones', () => {
  const s = {
    points: [{ id: 'o', x: 0, y: 0 }, { id: 't', x: 0, y: 5 }, { id: 'p', x: 3, y: 5 }],
    entities: [{ id: 'axis', type: 'line', a: 'o', b: 't', construction: true }, { id: 'top', type: 'line', a: 't', b: 'p' }],
    constraints: [],
  };
  const made = mirrorEntities(s, ['top'], 'axis');
  const copy = made.entities[0];
  assert.equal(copy.a, 't', 'on-axis start is the same point');
  assert.notEqual(copy.b, 'p');
  assert.equal(s.points.length, 4, 'only the off-axis end was copied');
  const symmetric = s.constraints.filter((c) => c.type === 'symmetric');
  assert.deepEqual(symmetric.map((c) => [c.a, c.b === copy.b]), [['p', true]]);
});
