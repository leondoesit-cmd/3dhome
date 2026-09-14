import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filletSketchCorner } from '../js/sketch_fillet.js';

// HOUSING Sketchsquare steps 335–336: the lower corners join a side line and
// an arc. The Sketch Fillet tool refused an arc pick outright, and its
// selection only forwarded lines, so "pick the line, pick the arc" never worked.
const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');

test('the Sketch Fillet tool accepts an arc as a pick and forwards selected arcs', () => {
  const branch = src.slice(src.indexOf('if (E.tool === "sketchfillet") {'), src.indexOf('if (E.tool === "trim" || E.tool === "extend"'));
  assert.match(branch, /filletHit\.type === "line" \|\| filletHit\.type === "arc"/);
  assert.match(src, /function selFilletCurves\(\) \{ return E\.ssel\.filter\(function \(o\) \{ return o\.type === "line" \|\| o\.type === "arc"; \}\); \}/);
  const ready = src.slice(src.indexOf('function sketchFilletSelectionReady()'), src.indexOf('function applySketchFilletFromSelection('));
  assert.match(ready, /curves\.length === 2 && curves\.some/);
  const apply = src.slice(src.indexOf('function applySketchFilletFromSelection('), src.indexOf('function openSketchFillet('));
  assert.match(apply, /entityIds: selFilletCurves\(\)\.map/);
});

test('a line and an arc passed as two entities fillet their shared corner', () => {
  const R = 5.55625, X = 3.937, Y = -Math.sqrt(R * R - X * X);
  const s = {
    points: [{ id: 'o', x: 0, y: 0 }, { id: 'L', x: -X, y: Y }, { id: 'V', x: X, y: Y }, { id: 'T', x: X, y: 2.794 }],
    entities: [{ id: 'ARC', type: 'arc', c: 'o', a: 'L', b: 'V' }, { id: 'SIDE', type: 'line', a: 'V', b: 'T' }],
    constraints: [],
  };
  let n = 0;
  const made = filletSketchCorner(s, { entityIds: ['SIDE', 'ARC'], radius: 1.27 }, (p = 'f') => p + (n++));
  assert.equal(made.arc.type, 'arc');
  assert.equal(s.entities.filter((e) => e.type === 'arc').length, 2);
});
