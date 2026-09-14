import test from 'node:test';
import assert from 'node:assert/strict';
import { inferLineRelations, sketchSnapTargets, pickSnap, onCurveTargets, inferTangentCircle } from '../js/modeler_inference.js';

test('a line drawn down to the circumference lands on the circle and is related to it (step 303)', () => {
  const sketch = {
    points: [{ id: 'c', x: 0, y: 0 }, { id: 'a', x: 3.937, y: 5.5565 }, { id: 'b', x: 3.937, y: 3.9 }],
    entities: [{ id: 'C', type: 'circle', c: 'c', r: 5.5565 }, { id: 'V', type: 'line', a: 'a', b: 'b' }],
    constraints: [{ id: 'f', type: 'fixed', point: 'c', x: 0, y: 0 }, { id: 'd', type: 'diameter', entity: 'C', value: 11.113 },
      { id: 'fa', type: 'fixed', point: 'a', x: 3.937, y: 5.5565 }],
  };
  const click = { u: 3.95, v: 3.85 };
  const targets = sketchSnapTargets(sketch, { excludeEntity: sketch.entities[1] }).concat(onCurveTargets(click, sketch));
  const snap = pickSnap(click, targets, { scale: 18 }).snap;
  assert.equal(snap.k, 'on');
  assert.ok(Math.abs(Math.hypot(snap.u, snap.v) - 5.5565) < 1e-9);
  const relations = inferLineRelations(sketch.entities[1], { u: 3.937, v: 5.5565 }, { u: 3.937, v: snap.v }, snap);
  assert.deepEqual(relations.map((r) => r.type).sort(), ['pointOnCircle', 'vertical']);
  relations.forEach((r, i) => sketch.constraints.push({ id: 'r' + i, ...r }));
  const result = solveSketch(sketch);
  assert.equal(result.degreesOfFreedom, 0, JSON.stringify(result));
  const end = sketch.points.find((p) => p.id === 'b');
  assert.ok(Math.abs(Math.hypot(end.x, end.y) - 5.5565) < 1e-6);
});

test('a nearly vertical line meets the circle straight below its start and keeps Vertical (step 303)', () => {
  const sketch = { points: [{ id: 'c', x: 0, y: 0 }], entities: [{ id: 'C', type: 'circle', c: 'c', r: 5.5563 }], constraints: [] };
  const start = { u: 3.8086, v: 5.5563 };
  const cursor = { u: 3.84, v: 3.95 }; // a hair right of vertical, near the curve
  const [target] = onCurveTargets(cursor, sketch, start, 18);
  assert.equal(target.u, start.u);
  assert.ok(Math.abs(Math.hypot(target.u, target.v) - 5.5563) < 1e-9);
  assert.ok(target.v > 0, 'upper intersection, the one nearer the cursor');
  const relations = inferLineRelations({ id: 'V', a: 'p', b: 'q' }, start, { u: target.u, v: target.v }, { ...target });
  assert.deepEqual(relations.map((r) => r.type).sort(), ['pointOnCircle', 'vertical']);
});

test('a line leaving a point on the circle is not inferred tangent to it; a clear tangent still is', () => {
  const circles = [{ id: 'C', r: 5.5563, center: { u: 0, v: 0 } }];
  // HOUSING top line: from the quadrant to the right, along the top of the circle
  assert.equal(inferTangentCircle({ a: { u: 0, v: 5.5563 }, b: { u: 3.8, v: 5.5563 } }, circles), null);
  assert.equal(inferTangentCircle({ a: { u: -8, v: 5.5563 }, b: { u: 8, v: 5.5563 } }, circles).id, 'C');
});

test('an endpoint or quadrant inside the radius still beats the on-curve spot', () => {
  const sketch = { points: [{ id: 'c', x: 0, y: 0 }], entities: [{ id: 'C', type: 'circle', c: 'c', r: 5 }], constraints: [] };
  const click = { u: 0.1, v: 4.98 };
  const snap = pickSnap(click, sketchSnapTargets(sketch, { includeOrigin: false }).concat(onCurveTargets(click, sketch)), { scale: 18 }).snap;
  assert.equal(snap.k, 'q');
});
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
