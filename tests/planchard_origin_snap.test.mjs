import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { solveSketch } from '../js/sketch_solver.js';

const source = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
function fnSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

function builders(sketch) {
  let n = 0;
  const context = {
    Math,
    E: { wallWidth: 5 },
    uid: () => 'id' + (++n),
    sketchForView: () => sketch,
    sketchPoint: (s, id) => s.points.find((p) => p.id === id),
    resolveSketch: () => true,
  };
  const names = ['newSketchPoint', 'snappedSketchPoint', 'addSketchCircle', 'addSketchPolygon', 'addSketchRectangle'];
  vm.runInNewContext(names.map(fnSource).join('\n'), context);
  return context;
}

const blank = () => ({ points: [], entities: [], constraints: [] });

test('a circle started on the origin is fixed there (book step 274: circle centred at the Origin)', () => {
  const sketch = blank();
  const b = builders(sketch);
  // the snap put the click exactly on the origin; the solver must keep it there
  const circle = b.addSketchCircle({ u: 0, v: 0 }, { u: 3, v: 0 }, { k: 'o', pointId: null });
  const fixed = sketch.constraints.find((c) => c.type === 'fixed');
  assert.ok(fixed, 'origin relation recorded');
  assert.equal(fixed.point, circle.c);
  sketch.constraints.push({ id: 'd', type: 'diameter', entity: circle.id, value: 11.113 });
  const result = solveSketch(sketch);
  assert.equal(result.degreesOfFreedom, 0, JSON.stringify(result));
  assert.equal(result.status, 'fully-constrained');
});

test('a circle started away from any snap gets no relation, and one on an existing point reuses it', () => {
  const sketch = blank();
  const b = builders(sketch);
  b.addSketchCircle({ u: 4, v: 2 }, { u: 6, v: 2 }, null);
  assert.equal(sketch.constraints.length, 0);
  sketch.points.push({ id: 'corner', x: 10, y: 10 });
  const onPoint = b.addSketchCircle({ u: 10, v: 10 }, { u: 12, v: 10 }, { k: 'e', pointId: 'corner' });
  assert.equal(onPoint.c, 'corner');
  assert.equal(sketch.constraints.length, 0);
});

test('polygon centre and rectangle first corner take the same origin relation', () => {
  const poly = blank();
  const guide = builders(poly).addSketchPolygon({ u: 0, v: 0 }, { u: 2, v: 0 }, 6, { k: 'o' });
  assert.ok(poly.constraints.some((c) => c.type === 'fixed' && c.point === poly.entities[0].c), JSON.stringify(guide && poly.constraints));
  const rect = blank();
  const lines = builders(rect).addSketchRectangle({ u: 0, v: 0 }, { u: 4, v: 2 }, { k: 'o' });
  assert.ok(rect.constraints.some((c) => c.type === 'fixed' && c.point === lines[0].a && c.x === 0 && c.y === 0));
});
