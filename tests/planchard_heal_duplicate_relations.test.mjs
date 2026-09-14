import test from 'node:test';
import assert from 'node:assert/strict';
import { healSketchEndpoints } from '../js/sketch_profiles.js';

// HOUSING Sketchsquare repair: delete the mirrored side, mirror it again, then
// merge the new lower corner onto the one the trimmed arc still uses. The old
// Symmetric(44, P) survived on P, the re-mirror added Symmetric(44, P'), and
// the merge made them the same rule twice — over-defined.
function remirrored() {
  return {
    points: [
      { id: 'o', x: 0, y: 0 }, { id: 't', x: 0, y: 4 },
      { id: 44, x: 3.937, y: -3.92 }, { id: 'P', x: -3.937, y: -3.92 }, { id: 'Pn', x: -3.937, y: -3.92 },
      { id: 'u', x: -3.937, y: 2.8 }, { id: 'c', x: 0, y: -1 },
    ],
    entities: [
      { id: 'AX', type: 'line', a: 'o', b: 't', construction: true },
      { id: 'ARC', type: 'arc', a: 'P', b: 44, c: 'o' },
      { id: 'SIDE', type: 'line', a: 'u', b: 'Pn' },
    ],
    constraints: [
      { id: 's1', type: 'symmetric', a: 44, b: 'P', entity: 'AX' },
      { id: 's2', type: 'symmetric', a: 44, b: 'Pn', entity: 'AX' },
      { id: 'v', type: 'vertical', entity: 'SIDE' },
      { id: 'r', type: 'radius', entity: 'ARC', value: 5.55625 },
    ],
  };
}

test('merging a corner leaves one Symmetric relation, not two', () => {
  const s = remirrored();
  const merged = healSketchEndpoints(s, ['ARC', 'SIDE']);
  assert.equal(merged, 1);
  const sym = s.constraints.filter((c) => c.type === 'symmetric');
  assert.equal(sym.length, 1, JSON.stringify(sym));
  assert.ok(s.entities.find((e) => e.id === 'SIDE').b === 'P' || s.entities.find((e) => e.id === 'SIDE').b === 'Pn');
  assert.equal(s.points.filter((p) => p.x === -3.937 && p.y === -3.92).length, 1, 'one corner point');
});

test('pair relations match in either order, dimensions and different axes are kept', () => {
  const s = remirrored();
  s.constraints.push({ id: 's3', type: 'symmetric', a: 'Pn', b: 44, entity: 'AX' });
  s.constraints.push({ id: 's4', type: 'symmetric', a: 44, b: 'P', entity: 'OTHER_AXIS' });
  s.constraints.push({ id: 'r2', type: 'radius', entity: 'ARC', value: 5.55625 });
  healSketchEndpoints(s, ['ARC', 'SIDE']);
  const ids = s.constraints.map((c) => c.id);
  assert.equal(s.constraints.filter((c) => c.type === 'symmetric' && c.entity === 'AX').length, 1);
  assert.ok(ids.includes('s4'), 'a symmetric about another axis is a different rule');
  assert.ok(ids.includes('r') && ids.includes('r2'), 'duplicate dimensions are left for the conflict report, not silently dropped');
});

test('nothing merged means nothing is touched', () => {
  const s = remirrored();
  s.points.find((p) => p.id === 'Pn').x = -2;
  const before = JSON.stringify(s.constraints);
  assert.equal(healSketchEndpoints(s, ['ARC', 'SIDE']), 0);
  assert.equal(JSON.stringify(s.constraints), before);
});
