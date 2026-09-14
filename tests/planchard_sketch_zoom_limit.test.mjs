import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// HOUSING step 312 picks an R .1 in [2.54 mm] sketch fillet for Mirror Entities.
// At the old 20 px/cm zoom ceiling that arc is ~5 px and cannot be selected.
const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');

test('wheel, pinch and toolbar zoom share a sketch zoom ceiling far above 20 px/cm', () => {
  const m = src.match(/var SKETCH_MIN_SCALE = ([\d.]+), SKETCH_MAX_SCALE = ([\d.]+);/);
  assert.ok(m, 'limits are declared once');
  assert.ok(Number(m[2]) >= 1000, `ceiling ${m[2]}`);
  const uses = src.match(/clamp\(E\.scl \* k, SKETCH_MIN_SCALE, SKETCH_MAX_SCALE\)/g) || [];
  assert.equal(uses.length, 3, 'toolbar zoomBy, wheel and pinch');
  assert.doesNotMatch(src, /clamp\(E\.scl \* k, 0\.3, 20\)/);
});

test('at the ceiling a 2.54 mm fillet is comfortably pickable', () => {
  const max = Number(src.match(/SKETCH_MAX_SCALE = ([\d.]+)/)[1]);
  const arcPx = 0.254 * 2 * max; // diameter in px
  assert.ok(arcPx > 8 * 10, `${arcPx}px is well beyond the 8 px pick radius`);
});
