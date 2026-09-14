import test from 'node:test';
import assert from 'node:assert/strict';
import { inferLineRelations, sketchSnapTargets, pickSnap } from '../js/modeler_inference.js';
import { solveSketch } from '../js/sketch_solver.js';

test('a circle quadrant beats a nearer model footprint vertex inside the capture radius', () => {
  const sketch = { points: [{ id: 'c', x: 0, y: 0 }], entities: [{ id: 'C', type: 'circle', c: 'c', r: 5.5565 }], constraints: [] };
  // the extruded base's 48-gon footprint puts a plain vertex a hair from the click
  const targets = sketchSnapTargets(sketch, { includeOrigin: false }).concat([{ u: 0.05, v: 5.555, k: 'e' }]);
  const snap = pickSnap({ u: 0.06, v: 5.55 }, targets, { scale: 18 }).snap;
  assert.equal(snap.k, 'q');
  assert.equal(snap.entityId, 'C');
});

test('a line ending on a circle quadrant is related to the circle, not left free', () => {
  const sketch = {
    points: [{ id: 'c', x: 0, y: 0 }, { id: 'b', x: 0, y: 5.5565 }],
    entities: [{ id: 'C', type: 'circle', c: 'c', r: 5.5565 }, { id: 'L', type: 'line', a: 'c', b: 'b' }],
    constraints: [{ id: 'f', type: 'fixed', point: 'c', x: 0, y: 0 }, { id: 'd', type: 'diameter', entity: 'C', value: 11.1125 }],
  };
  const snap = pickSnap({ u: 0.02, v: 5.55 }, sketchSnapTargets(sketch, { excludeEntity: sketch.entities[1] }), { scale: 18 }).snap;
  assert.equal(snap.k, 'q');
  const relations = inferLineRelations(sketch.entities[1], { u: 0, v: 0 }, { u: 0, v: 5.5565 }, snap);
  assert.deepEqual(relations.map((r) => r.type).sort(), ['pointOnCircle', 'vertical']);
  relations.forEach((r, i) => sketch.constraints.push({ id: 'r' + i, ...r }));
  const result = solveSketch(sketch);
  assert.equal(result.degreesOfFreedom, 0, JSON.stringify(result));
});
