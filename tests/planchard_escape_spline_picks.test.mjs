import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// HOUSING step 331: a stray double-click armed the Cubic spline tool with two
// picks, and two Escapes left the dashed handle following the cursor. Only a
// tool switch cleared E.splinePts.
const src = modelerSource().replace(/\r\n/g, '\n');

test('Escape abandons half-picked spline points before it drops the tool', () => {
  const start = src.indexOf('if (e.key === "Escape") {\n    /* Before any of the branches that return');
  assert.ok(start > 0, 'editor Escape branch found');
  const branch = src.slice(start, src.indexOf('While a sketch is being edited, Escape never leaves its surface', start));
  assert.match(branch, /if \(E\.splinePts && E\.splinePts\.length\) \{ E\.splinePts = null; drawSketch\(\);/);
  assert.ok(branch.indexOf('E.splinePts = null') < branch.indexOf('E.drag && E.drag.sticky'), 'before the sticky-drag branch');
});

test('the in-progress cancel routine clears spline picks with the other multi-click tools', () => {
  assert.match(src, /E\.ellPts = null;\n  E\.splinePts = null;\n  E\.dynInput = null;/);
});
