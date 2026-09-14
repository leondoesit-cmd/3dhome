import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainSketchConflict, solveSketch } from '../js/sketch_solver.js';

/* A sketch that cannot be satisfied used to name every relation left carrying
   error. HOUSING's Sketchsquare refused a size with fourteen red relations; the
   explanation must name a small set, always including the dimension just typed,
   such that removing any one member lets the rest solve. */

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

const suppress = (sketch, ids) => {
  const copy = structuredClone(sketch);
  copy.constraints.forEach((c) => { if (ids.includes(c.id)) c.suppressed = true; });
  return copy;
};

test('two lengths on one line name exactly those two', () => {
  const s = {
    points: [{ id: 'a', x: 0, y: 0, fixed: true }, { id: 'b', x: 10, y: 0 }],
    entities: [{ id: 'l', type: 'line', a: 'a', b: 'b' }, { id: 'm', type: 'line', a: 'a', b: 'b' }],
    constraints: [
      { id: 'h', type: 'horizontal', entity: 'l' },
      { id: 'd1', type: 'distance', entity: 'l', value: 40 },
      { id: 'd2', type: 'distance', entity: 'l', value: 12 },
    ],
  };
  const why = explainSketchConflict(s, { keep: ['d2'] });
  assert.equal(why.kind, 'conflicting');
  assert.deepEqual(why.ids, ['d1', 'd2']);
  assert.equal(why.complete, true);
});

test('Sketchsquare wider than its circle: a short list with the new width, and every member matters', () => {
  const s = sketchsquare();
  s.constraints.push({ id: 99, type: 'distance', a: 48, b: 'm3', value: 11.5 }); // wider than the 4.375 in circle
  const before = structuredClone(s);
  const failed = solveSketch(structuredClone(s));
  assert.equal(failed.status, 'conflicting');
  const why = explainSketchConflict(s, { keep: [99] });
  assert.deepEqual(s, before, 'the sketch passed in is not touched');
  assert.equal(why.kind, 'conflicting');
  assert.ok(why.ids.includes(99), 'names the width just typed');
  assert.ok(why.ids.includes(2), 'names the circle size it runs into');
  assert.ok(why.ids.length <= 6 && why.ids.length < failed.conflicts.length + 1, JSON.stringify({ why, residual: failed.conflicts }));
  assert.equal(solveSketch(suppress(s, why.ids)).converged, true, 'without the named relations it solves');
  // minimal: the named set on its own still fails, and loses that with any one member gone
  const others = s.constraints.map((c) => c.id).filter((id) => !why.ids.includes(id));
  assert.equal(solveSketch(suppress(s, others)).converged, false, 'the named set alone is still impossible');
  for (const id of why.ids) {
    assert.equal(solveSketch(suppress(s, [...others, id])).converged, true, 'the set without ' + id + ' solves');
  }
});

test('a redundant relation is explained as over-constrained, naming the relations it repeats', () => {
  const s = {
    points: [{ id: 'p1', x: 0, y: 0 }, { id: 'p2', x: 40, y: 0 }, { id: 'p3', x: 40, y: 20 }, { id: 'p4', x: 0, y: 20 }],
    entities: [
      { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' },
      { id: 'l3', type: 'line', a: 'p3', b: 'p4' }, { id: 'l4', type: 'line', a: 'p4', b: 'p1' },
    ],
    constraints: [
      { id: 'h1', type: 'horizontal', entity: 'l1' }, { id: 'v2', type: 'vertical', entity: 'l2' },
      { id: 'h3', type: 'horizontal', entity: 'l3' }, { id: 'v4', type: 'vertical', entity: 'l4' },
      { id: 'f', type: 'fixed', point: 'p1', x: 0, y: 0 },
      { id: 'w', type: 'distance', entity: 'l1', value: 40 }, { id: 'ht', type: 'distance', entity: 'l2', value: 20 },
      { id: 'par', type: 'parallel', a: 'l1', b: 'l3' },
    ],
  };
  const why = explainSketchConflict(s, { keep: ['par'] });
  assert.equal(why.kind, 'over-constrained');
  assert.ok(why.ids.includes('par'));
  assert.ok(why.ids.length >= 2 && why.ids.length <= 3, JSON.stringify(why));
  assert.ok(why.ids.every((id) => ['par', 'h1', 'h3'].includes(id)), JSON.stringify(why));
});

test('a sketch that solves has nothing to explain', () => {
  const why = explainSketchConflict(sketchsquare());
  assert.deepEqual([why.kind, why.ids], [null, []]);
});

test('the dimension editor explains a refused value and names the dimension', () => {
  const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
  const apply = src.slice(src.indexOf('function applyDimensionEditor()'), src.indexOf('function deleteDimensionEditor()'));
  assert.match(apply, /explainSketchConflict\(state\.sketch, \{ keep: \[constraint\.id\] \}\)/);
  assert.match(apply, /mdDimError/);
});
