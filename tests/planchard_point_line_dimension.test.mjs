import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addSmartDimension, currentMeasure, distanceDimensionLayout } from '../js/sketch_dimensions.js';
import { solveSketch } from '../js/sketch_solver.js';

// HOUSING Sketchsquare step 330: Smart Dimension from the Origin to the top horizontal line = 1.600 in [40.64 mm]
function top() {
  return {
    points: [{ id: 'o', x: 0, y: 0 }, { id: 'l', x: -3.683, y: 5.5563 }, { id: 'r', x: 3.683, y: 5.5563 }],
    entities: [{ id: 'T', type: 'line', a: 'l', b: 'r' }],
    constraints: [
      { id: 'fo', type: 'fixed', point: 'o', x: 0, y: 0 },
      { id: 'h', type: 'horizontal', entity: 'T' },
      { id: 'len', type: 'distance', entity: 'T', value: 7.366 },
      { id: 'mid', type: 'fixed', point: 'l', x: -3.683 },
    ],
  };
}

test('a point-to-line dimension measures the perpendicular distance and starts satisfied', () => {
  const s = top();
  const measured = currentMeasure(s, { type: 'pointLine', point: 'o', line: 'T' });
  assert.ok(Math.abs(measured - 5.5563) < 1e-9, String(measured));
  const id = addSmartDimension(s, { type: 'pointLine', point: 'o', line: 'T' }, measured);
  const c = s.constraints.find((k) => k.id === id);
  assert.deepEqual([c.type, c.point, c.a], ['pointLineDistance', 'o', 'T']);
  assert.equal(solveSketch(s).converged, true);
});

test('setting it to 1.600 in drops the top line to 4.064 cm and keeps its length', () => {
  const s = top();
  s.constraints = s.constraints.filter((k) => k.id !== 'mid');
  const id = addSmartDimension(s, { type: 'pointLine', point: 'o', line: 'T' }, currentMeasure(s, { type: 'pointLine', point: 'o', line: 'T' }));
  s.constraints.find((k) => k.id === id).value = 4.064;
  const r = solveSketch(s);
  assert.equal(r.converged, true, JSON.stringify(r));
  const p = (k) => s.points.find((q) => q.id === k);
  assert.ok(Math.abs(p('l').y - 4.064) < 1e-6 && Math.abs(p('r').y - 4.064) < 1e-6, `${p('l').y} ${p('r').y}`);
  assert.ok(Math.abs(Math.hypot(p('r').x - p('l').x, p('r').y - p('l').y) - 7.366) < 1e-6);
});

test('the dimension is drawn from the point to its foot on the line', () => {
  const s = top();
  const id = addSmartDimension(s, { type: 'pointLine', point: 'o', line: 'T' }, 5.5563);
  const layout = distanceDimensionLayout(s, s.constraints.find((k) => k.id === id), (x, y) => ({ x: x * 10, y: -y * 10 }));
  assert.ok(layout, 'has a layout');
  assert.ok(Math.abs(layout.p1.x - 0) < 1e-9 && Math.abs(layout.p1.y - 0) < 1e-9);
  assert.ok(Math.abs(layout.p2.x - 0) < 1e-6 && Math.abs(layout.p2.y + 55.563) < 1e-6, JSON.stringify(layout.p2));
});

test('the Dimension tool offers point-then-line and line-then-point', () => {
  const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
  const branch = src.slice(src.indexOf('if (E.tool === "dim") {'), src.indexOf('var dtarget = dimensionTarget(dhit, uv);'));
  assert.match(branch, /type: "pointLine", point: pickedPoint\.id, line: dhit\.id/);
  assert.match(branch, /type: "pointLine", point: dhit\.id, line: pendingLine\.id/);
});
