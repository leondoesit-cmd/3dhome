import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The size above the tree was written only by refreshParts(), which runs before
   a merged body's exact mesh lands. Rolling HOUSING back and releasing it left
   the analytic Base Extrude size ("11×3×11 cm") above a 7 cm and an 18 cm body. */
const src = modelerSource();
const body = (name) => { const at = src.indexOf('function ' + name + '('); return src.slice(at, src.indexOf('\n}\n', at)); };

test('the part size readout has one writer (the other is the assembly component count)', () => {
  assert.equal(src.match(/querySelector\("#mdSize"\)/g).length, 2);
  assert.match(body('refreshComponents'), /querySelector\("#mdSize"\)/);
  assert.match(body('syncSizeReadout'), /defBounds\(E\.def\)/);
  assert.match(body('refreshParts'), /syncSizeReadout\(sketchCount\);/);
});

test('it is refreshed where an exact mesh lands or fails', () => {
  assert.match(body('refreshChangedPart'), /if \(part && E\.def\) syncSizeReadout\(\);\s*if \(!part \|\| !E\.pv\) return;/);
});
