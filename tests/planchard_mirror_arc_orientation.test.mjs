import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorEntities, linearPatternEntities } from '../js/sketch_pattern.js';

// HOUSING Sketchsquare step 312 mirrors an R .1 in corner fillet about the
// centerline. The copy kept a/b in source order, and a reflection reverses an
// arc's counter-clockwise sense, so at R .5 in the mirrored fillet was a 270°
// loop bulging into the profile instead of a 90° corner.
function corner() {
  return {
    points: [
      { id: 'o', x: 0, y: 0 }, { id: 't', x: 0, y: 4.064 },
      { id: 'c', x: 2.667, y: 2.794 }, { id: 'a', x: 3.937, y: 2.794 }, { id: 'b', x: 2.667, y: 4.064 },
    ],
    entities: [
      { id: 'AXIS', type: 'line', a: 'o', b: 't', construction: true },
      { id: 'F', type: 'arc', c: 'c', a: 'a', b: 'b' },
    ],
    constraints: [],
  };
}

const at = (s, id) => s.points.find((p) => p.id === id);
function ccwSweep(s, arc) {
  const c = at(s, arc.c), a = at(s, arc.a), b = at(s, arc.b);
  let d = Math.atan2(b.y - c.y, b.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x);
  while (d <= 0) d += 2 * Math.PI;
  return d * 180 / Math.PI;
}

test('a mirrored quarter-circle fillet is still a 90° arc', () => {
  const s = corner();
  assert.ok(Math.abs(ccwSweep(s, s.entities[1]) - 90) < 1e-6, 'source is a quarter');
  const made = mirrorEntities(s, ['F'], 'AXIS');
  const copy = made.entities.find((e) => e.type === 'arc');
  assert.ok(Math.abs(ccwSweep(s, copy) - 90) < 1e-6, `copy sweeps ${ccwSweep(s, copy)}°`);
  // the reflected ends: the copy starts at the reflection of the source END
  assert.ok(Math.abs(at(s, copy.a).x + 2.667) < 1e-9 && Math.abs(at(s, copy.a).y - 4.064) < 1e-9);
  assert.ok(Math.abs(at(s, copy.b).x + 3.937) < 1e-9 && Math.abs(at(s, copy.b).y - 2.794) < 1e-9);
});

test('a mirrored arc keeps symmetric pairs point for point', () => {
  const s = corner();
  const made = mirrorEntities(s, ['F'], 'AXIS');
  const sym = s.constraints.filter((c) => c.type === 'symmetric');
  assert.equal(sym.length, 3, 'centre and both ends');
  sym.forEach((c) => {
    const p = at(s, c.a), q = at(s, c.b);
    assert.ok(Math.abs(p.x + q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9, `${c.a} ↔ ${c.b}`);
  });
  assert.ok(made.entities.length === 1);
});

test('a linear pattern copy of an arc keeps its sweep direction', () => {
  const s = corner();
  const made = linearPatternEntities(s, ['F'], { count: 2, spacing: 10, direction: 'u' });
  assert.ok(made && made.copies.length === 1, 'pattern made one copy');
  const copy = made.copies[0].entities.find((e) => e.type === 'arc');
  assert.ok(copy, 'the arc was patterned');
  assert.ok(Math.abs(ccwSweep(s, copy) - 90) < 1e-6, `pattern copy sweeps ${ccwSweep(s, copy)}°`);
});
