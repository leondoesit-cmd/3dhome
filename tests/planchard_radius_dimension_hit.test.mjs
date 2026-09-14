import test from 'node:test';
import assert from 'node:assert/strict';
import { hitSketchDimensionHit, hitSketchDimension } from '../js/sketch_dimensions.js';

// HOUSING step 331: "Double-click the .100 fillet dimension." Only linear
// dimensions answered the hit test, so a radius label could not be opened.
const toPx = (x, y) => ({ x: 400 + x * 50, y: 300 - y * 50 });

function fillet() {
  return {
    points: [{ id: 'c', x: 0, y: 0 }, { id: 'a', x: 1, y: 0 }, { id: 'b', x: 0, y: 1 }, { id: 'p', x: -2, y: -2 }, { id: 'q', x: 2, y: -2 }],
    entities: [
      { id: 'arc', type: 'arc', c: 'c', a: 'a', b: 'b' },
      { id: 'circ', type: 'circle', c: 'p', r: 0.5 },
      { id: 'L', type: 'line', a: 'p', b: 'q' },
    ],
    constraints: [
      { id: 'r', type: 'radius', entity: 'arc', value: 1 },
      { id: 'd', type: 'diameter', entity: 'circ', value: 1 },
      { id: 'ang', type: 'angle', entity: 'L', value: 0 },
    ],
  };
}

// The label is drawn at the rim point in the -45° direction, offset (+4, -4) px.
function labelAnchor(cx, cy, r) {
  const rim = toPx(cx + Math.cos(-Math.PI / 4) * r, cy + Math.sin(-Math.PI / 4) * r);
  return { x: rim.x + 4, y: rim.y - 4 };
}

test('double-click on a radius label finds the radius dimension', () => {
  const s = fillet();
  const at = labelAnchor(0, 0, 1);
  const hit = hitSketchDimensionHit(s, at.x + 12, at.y - 4, toPx, 10);
  assert.ok(hit, 'label hit');
  assert.equal(hit.constraint.id, 'r');
  assert.equal(hit.kind, 'label');
});

test('a diameter label on a circle is hit too, and its leader counts as the line', () => {
  const s = fillet();
  const at = labelAnchor(-2, -2, 0.5);
  assert.equal(hitSketchDimension(s, at.x + 10, at.y - 4, toPx, 10)?.id, 'd');
  const centre = toPx(-2, -2), rim = toPx(-2 + Math.cos(-Math.PI / 4) * 0.5, -2 + Math.sin(-Math.PI / 4) * 0.5);
  const mid = { x: (centre.x + rim.x) / 2, y: (centre.y + rim.y) / 2 };
  assert.equal(hitSketchDimensionHit(s, mid.x, mid.y, toPx, 10)?.kind, 'line');
});

test('an angle label is hit beside the line midpoint', () => {
  const s = fillet();
  const mid = toPx(0, -2);
  assert.equal(hitSketchDimension(s, mid.x + 20, mid.y - 10, toPx, 10)?.id, 'ang');
});

test('empty space far from every label still misses', () => {
  assert.equal(hitSketchDimension(fillet(), 780, 20, toPx, 10), null);
});
