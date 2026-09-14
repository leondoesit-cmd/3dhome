import test from 'node:test';
import assert from 'node:assert/strict';
import { addSmartDimension, currentMeasure } from '../js/sketch_dimensions.js';
import { solveSketch } from '../js/sketch_solver.js';

// HOUSING Sketchsquare step 326: Smart Dimension between the two vertical side lines = 3.100 in [78.74 mm]
function sides() {
  return {
    points: [
      { id: 'o', x: 0, y: 0 },
      { id: 'lt', x: -3.8, y: 5.3 }, { id: 'lb', x: -3.8, y: 4 },
      { id: 'rt', x: 3.8, y: 5.3 }, { id: 'rb', x: 3.8, y: 4 },
    ],
    entities: [{ id: 'L', type: 'line', a: 'lt', b: 'lb' }, { id: 'R', type: 'line', a: 'rt', b: 'rb' }],
    constraints: [
      { id: 'fo', type: 'fixed', point: 'o', x: 0, y: 0 },
      { id: 'vl', type: 'vertical', entity: 'L' }, { id: 'vr', type: 'vertical', entity: 'R' },
      { id: 'sym', type: 'symmetric', a: 'lt', b: 'rt', entity: 'axis' },
    ],
  };
}

test('a line-pair dimension starts at the measured gap and solves as satisfied', () => {
  const s = sides();
  const measured = currentMeasure(s, { type: 'lines', a: 'L', b: 'R' });
  assert.ok(Math.abs(Math.abs(measured) - 7.6) < 1e-9, String(measured));
  const id = addSmartDimension(s, { type: 'lines', a: 'L', b: 'R' }, measured);
  const c = s.constraints.find((k) => k.id === id);
  assert.equal(c.type, 'offset');
  assert.deepEqual([c.a, c.b], ['L', 'R']);
  s.constraints = s.constraints.filter((k) => k.id !== 'sym');
  const before = JSON.stringify(s.points);
  solveSketch(s);
  assert.equal(JSON.stringify(s.points.map((p) => [p.id, +p.x.toFixed(6), +p.y.toFixed(6)])), JSON.stringify(JSON.parse(before).map((p) => [p.id, +p.x.toFixed(6), +p.y.toFixed(6)])));
});

test('changing the line-pair dimension to 3.100 in moves the lines to 7.874 cm apart', () => {
  const s = sides();
  s.constraints = s.constraints.filter((k) => k.id !== 'sym');
  s.constraints.push({ id: 'fl', type: 'fixed', point: 'lt', x: -3.8, y: 5.3 });
  const measured = currentMeasure(s, { type: 'lines', a: 'L', b: 'R' });
  const id = addSmartDimension(s, { type: 'lines', a: 'L', b: 'R' }, measured);
  s.constraints.find((k) => k.id === id).value = Math.sign(measured) * 7.874;
  const r = solveSketch(s);
  assert.equal(r.converged, true, JSON.stringify(r));
  const x = (id) => s.points.find((p) => p.id === id).x;
  assert.ok(Math.abs(Math.abs(x('rt') - x('lt')) - 7.874) < 1e-6, `${x('rt') - x('lt')}`);
  assert.ok(Math.abs(x('rb') - x('rt')) < 1e-6, 'right side stays vertical');
});

test('the Dimension tool keeps a first line pick pending instead of dimensioning its length at once', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
  const branch = src.slice(src.indexOf('if (E.tool === "dim") {'), src.indexOf('var dtarget = dimensionTarget(dhit, uv);'));
  assert.match(branch, /E\.dimPick = \[\{ kind: "line", id: dhit\.id \}\]/);
  assert.match(branch, /type: "lines", a: pendingLine\.id, b: dhit\.id/);
  assert.match(branch, /if \(!dhit\) \{\s*smartDimension\(\{ type: "line", id: pendingLine\.id \}/);
});
