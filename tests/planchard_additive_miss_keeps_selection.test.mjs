import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// HOUSING step 312 builds a four-entity Mirror selection with Ctrl/Cmd-clicks.
// A Ctrl/Cmd-click that lands on neither sketch geometry nor a model edge used
// to empty E.ssel, throwing the whole selection away.
const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');

test('a Ctrl/Cmd-click miss in a canonical sketch keeps the sketch selection', () => {
  const start = src.indexOf('if (isCanonicalAuthoring() && E.authoring && E.authoring.phase === "sketch") {\n      var modelEdge = hitProjectedModelEdge(');
  assert.ok(start > 0, 'select-tool canonical sketch branch found');
  const branch = src.slice(start, src.indexOf('E.ssel = [];\n    if (p && !p.sketch && partEditableInSketch(p))', start));
  assert.match(branch, /if \(!\(e\.ctrlKey \|\| e\.metaKey \|\| E\.mobileAddSelection\)\) \{\s*E\.ssel = \[\];\s*E\.sel = null;\s*\}/);
  assert.doesNotMatch(branch, /\n      E\.ssel = \[\];\n      E\.sel = null;\n      refreshAll\(\);/);
});
