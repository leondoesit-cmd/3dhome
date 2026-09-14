import test from 'node:test';
import assert from 'node:assert/strict';
import { trimEntity } from '../js/sketch_trim.js';
import { solveSketch } from '../js/sketch_solver.js';
import { healSketchEndpoints } from '../js/sketch_profiles.js';

/* HOUSING Sketchsquare (steps 316–321): two vertical side lines end ON the
   converted circle; trimming the circle's top keeps the lower arc, and the arc
   must end exactly at those line endpoints — one point each, not a duplicate
   sitting on top of it. */
function sketchsquare() {
  return {
    points: [
      { id: 'c', x: 0, y: 0 },
      { id: 'rt', x: 3, y: 6 }, { id: 'rb', x: 3, y: 4 },
      { id: 'lt', x: -3, y: 6 }, { id: 'lb', x: -3, y: 4 },
      { id: 'ct', x: 0, y: 5 },
    ],
    entities: [
      { id: 'C', type: 'circle', c: 'c', r: 5 },
      { id: 'R', type: 'line', a: 'rt', b: 'rb' },
      { id: 'L', type: 'line', a: 'lt', b: 'lb' },
      { id: 'axis', type: 'line', a: 'c', b: 'ct', construction: true },
    ],
    constraints: [
      { id: 'f', type: 'fixed', point: 'c', x: 0, y: 0 },
      { id: 'd', type: 'diameter', entity: 'C', value: 10 },
      { id: 'frt', type: 'fixed', point: 'rt', x: 3, y: 6 },
      { id: 'flt', type: 'fixed', point: 'lt', x: -3, y: 6 },
      { id: 'vr', type: 'vertical', entity: 'R' },
      { id: 'vl', type: 'vertical', entity: 'L' },
      { id: 'onr', type: 'pointOnCircle', point: 'rb', entity: 'C' },
      { id: 'onl', type: 'pointOnCircle', point: 'lb', entity: 'C' },
      { id: 'axv', type: 'vertical', entity: 'axis' },
      { id: 'axon', type: 'pointOnCircle', point: 'ct', entity: 'C' },
    ],
  };
}

test('trimming a circle between two line ends reuses those endpoints and drops the now-implicit on-circle relations', () => {
  const sketch = sketchsquare();
  assert.equal(solveSketch(sketch).degreesOfFreedom, 0);
  assert.equal(trimEntity(sketch, 'C', { x: 0, y: 5 }), true);
  const arc = sketch.entities.find((e) => e.id === 'C');
  assert.equal(arc.type, 'arc');
  assert.deepEqual([arc.a, arc.b].sort(), ['lb', 'rb'], 'arc ends are the side-line endpoints themselves');
  assert.ok(!sketch.constraints.some((c) => c.type === 'pointOnCircle' && c.entity === 'C' && (c.point === 'rb' || c.point === 'lb')));
  // the construction centerline end is not an arc endpoint; its relation stays
  assert.ok(sketch.constraints.some((c) => c.id === 'axon'));
  const result = solveSketch(sketch);
  assert.notEqual(result.status, 'over-constrained', JSON.stringify(result));
  assert.equal(result.conflicts.length, 0, JSON.stringify(result));
  assert.equal(result.degreesOfFreedom, 0, JSON.stringify(result));
  // the lower arc survived: its midpoint is at the bottom of the circle
  assert.ok(sketch.points.every((p) => Math.hypot(p.x, p.y) > 0 || p.id === 'c'));
});

test('healing an arc end onto a line end that was on the circle does not over-define the sketch', () => {
  const sketch = sketchsquare();
  // an older trim: the arc got its own points on top of the line ends
  sketch.points.push({ id: 'ra', x: 3, y: 4 }, { id: 'la', x: -3, y: 4 });
  Object.assign(sketch.entities[0], { type: 'arc', a: 'la', b: 'ra' });
  delete sketch.entities[0].r;
  sketch.constraints = sketch.constraints.filter((c) => c.id !== 'd');
  assert.ok(healSketchEndpoints(sketch, ['C', 'R', 'L'], 0.01) >= 2);
  const arc = sketch.entities[0];
  assert.deepEqual([arc.a, arc.b].map((id) => ['rb', 'lb', 'ra', 'la'].includes(id)), [true, true]);
  const ends = new Set([arc.a, arc.b]);
  assert.ok(!sketch.constraints.some((c) => c.type === 'pointOnCircle' && c.entity === 'C' && ends.has(c.point)));
  const result = solveSketch(sketch);
  assert.equal(result.conflicts.length, 0, JSON.stringify(result));
  assert.notEqual(result.status, 'over-constrained', JSON.stringify(result));
});
