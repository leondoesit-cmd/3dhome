import test from 'node:test';
import assert from 'node:assert/strict';
import { solveSketch, circleData } from '../js/sketch_solver.js';
import { filletSketchCorner, findFilletCorner } from '../js/sketch_fillet.js';

// HOUSING Sketchsquare steps 333–337: Sketch Fillet .500 in [12.7] on the lower
// corners, where each vertical side line meets the trimmed Ø4.375 in arc.
// Sketch Fillet only knew two lines, so the corner pick was refused.
const R = 5.55625, r = 1.27, X = 3.937, Y = -Math.sqrt(R * R - X * X);

function corner() {
  return {
    points: [
      { id: 'o', x: 0, y: 0 },
      { id: 'L', x: -X, y: Y }, { id: 'V', x: X, y: Y }, { id: 'T', x: X, y: 2.794 },
    ],
    entities: [
      { id: 'ARC', type: 'arc', c: 'o', a: 'L', b: 'V' },           // bottom arc, CCW through -90°
      { id: 'SIDE', type: 'line', a: 'V', b: 'T' },
    ],
    constraints: [
      { id: 'fo', type: 'fixed', point: 'o', x: 0, y: 0 },
      { id: 'fl', type: 'fixed', point: 'L', x: -X, y: Y },
      { id: 'ft', type: 'fixed', point: 'T', x: X, y: 2.794 },
      { id: 'rad', type: 'radius', entity: 'ARC', value: R },
      { id: 'v', type: 'vertical', entity: 'SIDE' },
    ],
  };
}

const at = (s, id) => s.points.find((p) => p.id === id);
let n = 0;
const ids = (prefix = 'f') => `${prefix}${n++}`;

test('a vertex where a line meets an arc end is a fillet corner', () => {
  const found = findFilletCorner(corner(), { vertexId: 'V' });
  assert.equal(found.kind, 'line-arc');
  assert.equal(found.line.id, 'SIDE');
  assert.equal(found.arc.id, 'ARC');
});

test('R .5 in at the lower corner lands where the book geometry says', () => {
  const s = corner();
  const made = filletSketchCorner(s, { vertexId: 'V', radius: r }, ids);
  const map = new Map(s.points.map((p) => [p.id, p]));
  const f = circleData(made.arc, map);
  // centre r inside the side line and R - r from the arc centre
  const cy = -Math.sqrt((R - r) ** 2 - (X - r) ** 2);
  assert.ok(Math.abs(f.center.x - (X - r)) < 1e-9 && Math.abs(f.center.y - cy) < 1e-9, JSON.stringify(f.center));
  assert.ok(Math.abs(f.radius - r) < 1e-9);
  assert.ok(ccw(f) < 180, `fillet is a minor arc (${ccw(f)}°)`);
  const side = s.entities.find((e) => e.id === 'SIDE');
  assert.ok(Math.abs(at(s, side.a).x - X) < 1e-9 && Math.abs(at(s, side.a).y - cy) < 1e-9, 'side line now starts at the tangent point');
  const arc = s.entities.find((e) => e.id === 'ARC');
  const end = at(s, arc.b);
  assert.ok(Math.abs(Math.hypot(end.x, end.y) - R) < 1e-9, 'bottom arc now ends on its own circle');
  assert.ok(Math.abs(Math.hypot(end.x - f.center.x, end.y - f.center.y) - r) < 1e-9, '... at the fillet');
  assert.equal(s.points.some((p) => p.id === 'V'), false, 'the sharp corner is gone');
  assert.equal(s.constraints.filter((c) => c.type === 'tangent').length, 2);
  assert.ok(s.constraints.some((c) => c.type === 'radius' && c.entity === made.arc.id && c.value === r));

  const before = s.points.map((p) => [p.id, p.x, p.y]);
  const report = solveSketch(s);
  assert.equal(report.converged, true, JSON.stringify(report));
  s.points.forEach((p) => {
    const b = before.find((q) => q[0] === p.id);
    assert.ok(Math.abs(p.x - b[1]) < 1e-6 && Math.abs(p.y - b[2]) < 1e-6, `${p.id} stayed put`);
  });
});

function ccw(circle) {
  let d = circle.end - circle.start;
  while (d <= 0) d += 2 * Math.PI;
  return d * 180 / Math.PI;
}

test('a relation-only corner is dropped, a dimensioned corner is kept on both curves', () => {
  const plain = corner();
  plain.constraints.push({ id: 'sym', type: 'symmetric', a: 'V', b: 'L', entity: 'nope' });
  filletSketchCorner(plain, { vertexId: 'V', radius: r }, ids);
  assert.equal(plain.constraints.some((c) => c.id === 'sym'), false);

  const measured = corner();
  measured.constraints.push({ id: 'd', type: 'distance', a: 'V', b: 'T', value: 2.794 - Y });
  filletSketchCorner(measured, { vertexId: 'V', radius: r }, ids);
  assert.ok(measured.points.some((p) => p.id === 'V'), 'virtual sharp kept');
  assert.ok(measured.constraints.some((c) => c.type === 'pointOnLine' && c.point === 'V'));
  assert.ok(measured.constraints.some((c) => c.type === 'pointOnCircle' && c.point === 'V'));
  assert.ok(measured.constraints.some((c) => c.id === 'd'));
});

test('a radius that cannot fit between the corner and the line end is refused', () => {
  assert.throws(() => filletSketchCorner(corner(), { vertexId: 'V', radius: 20 }), /too large/);
});
