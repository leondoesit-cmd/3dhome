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

// Both lower corners of a mirrored profile: the left side line has no Vertical
// of its own, only its Symmetric corners hold it upright.
function mirrored() {
  return {
    points: [
      { id: 'o', x: 0, y: 0 }, { id: 'up', x: 0, y: 5 },
      { id: 'V', x: X, y: Y }, { id: 'T', x: X, y: 2.794 },
      { id: 'VL', x: -X, y: Y }, { id: 'TL', x: -X, y: 2.794 },
    ],
    entities: [
      { id: 'AX', type: 'line', a: 'o', b: 'up', construction: true },
      { id: 'ARC', type: 'arc', c: 'o', a: 'VL', b: 'V' },
      { id: 'RIGHT', type: 'line', a: 'V', b: 'T' },
      { id: 'LEFT', type: 'line', a: 'VL', b: 'TL' },
    ],
    constraints: [
      { id: 'fo', type: 'fixed', point: 'o', x: 0, y: 0 },
      { id: 'fu', type: 'fixed', point: 'up', x: 0, y: 5 },
      { id: 'ft', type: 'fixed', point: 'T', x: X, y: 2.794 },
      { id: 'rad', type: 'radius', entity: 'ARC', value: R },
      { id: 'vr', type: 'vertical', entity: 'RIGHT' },
      { id: 'st', type: 'symmetric', a: 'T', b: 'TL', entity: 'AX' },
      { id: 'sv', type: 'symmetric', a: 'V', b: 'VL', entity: 'AX' },
    ],
  };
}

test('filleting mirrored lower corners keeps the profile fully defined, one corner at a time', () => {
  const s = mirrored();
  const start = solveSketch(JSON.parse(JSON.stringify(s)));
  assert.equal(start.degreesOfFreedom, 0, 'fixture starts fully defined');
  filletSketchCorner(s, { vertexId: 'VL', radius: r }, ids);
  let report = solveSketch(JSON.parse(JSON.stringify(s)));
  assert.equal(report.converged, true);
  assert.equal(report.redundant, false, 'no repeated rule after the first fillet');
  assert.equal(report.degreesOfFreedom, 0, 'the left side line did not come loose');
  assert.ok(s.points.some((p) => p.id === 'VL'), 'corner kept as a virtual sharp');
  assert.ok(s.constraints.some((c) => c.id === 'sv'), 'its Symmetric relation kept');
  filletSketchCorner(s, { vertexId: 'V', radius: r }, ids);
  assert.ok(s.points.some((p) => p.id === 'VL' && p.virtualSharp), 'the first virtual sharp survives the second fillet');
  assert.ok(s.constraints.some((c) => c.type === 'pointOnLine' && c.point === 'VL' && c.entity === 'LEFT'), '... still held on its line');
  report = solveSketch(JSON.parse(JSON.stringify(s)));
  assert.equal(report.converged, true);
  assert.equal(report.redundant, false, 'no repeated rule after the second fillet');
  assert.equal(report.degreesOfFreedom, 0, 'both fillets placed, nothing free');
  assert.equal(s.entities.filter((e) => e.type === 'arc').length, 3);
});

test('a corner with no relations is simply removed', () => {
  const s = corner();
  filletSketchCorner(s, { vertexId: 'V', radius: r }, ids);
  assert.equal(s.points.some((p) => p.id === 'V'), false);
});

test('a dimensioned corner is kept on the line with its dimension', () => {
  const measured = corner();
  // the fixed arc end already sets the radius; a radius dimension on top would
  // make the fixture itself over-defined before any fillet
  measured.constraints = measured.constraints.filter((c) => c.id !== 'rad');
  measured.constraints.push({ id: 'd', type: 'distance', a: 'V', b: 'T', value: 2.794 - Y });
  assert.equal(solveSketch(JSON.parse(JSON.stringify(measured))).redundant, false, 'fixture is not over-defined');
  filletSketchCorner(measured, { vertexId: 'V', radius: r }, ids);
  assert.ok(measured.points.some((p) => p.id === 'V'), 'virtual sharp kept');
  assert.ok(measured.constraints.some((c) => c.type === 'pointOnLine' && c.point === 'V'));
  assert.ok(measured.constraints.some((c) => c.id === 'd'));
  // the length along the fixed line already places the corner, so an
  // on-circle row would repeat that rule and must not be added
  assert.equal(measured.constraints.some((c) => c.type === 'pointOnCircle' && c.point === 'V'), false);
  const report = solveSketch(JSON.parse(JSON.stringify(measured)));
  assert.equal(report.redundant, false);
});

test('a radius that cannot fit between the corner and the line end is refused', () => {
  assert.throws(() => filletSketchCorner(corner(), { vertexId: 'V', radius: 20 }), /too large/);
});
