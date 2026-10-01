import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/* A worker-restored Shell keeps the exact face names it was verified with.
   Re-deriving them from lightweight hints once renamed a coplanar face
   (LENS: BaseRevolve plane:1 became plane:3), so a linked circular boundary
   that referenced plane:1 reported "source face is unavailable" on the second,
   cache-assisted rebuild. */
const source = readFileSync(new URL('../js/cad_feature_tree.js', import.meta.url), 'utf8');

test('cached worker bodies keep their verified topology instead of re-extracting names', () => {
  assert.match(source, /keepRestoredNames = restoredTopology\.length > 0/);
  assert.match(source, /result\.topology = keepRestoredNames \? restoredTopology : topologyForFeature/);
  assert.match(source, /if \(result\.shape && !keepRestoredNames\) result\.topology = extractBrepTopology/);
});

test('a cached rebuild resolves the same linked boundary face as the cold one', async () => {
  const {createCadWorkerExecutor} = await import('../js/core/cad_worker_runtime.js');
  const {createPartDocument, createFeatureDefinition} = await import('../js/core/parametric_document.js');
  const doc = createPartDocument();
  createFeatureDefinition(doc, 'box', {id: 'solid', params: {w: 2, h: 3, d: 4}});
  const exec = createCadWorkerExecutor();
  const request = {kind: 'regenerate', document: doc, canonical: true, options: {}, meshOnly: true};
  const cold = await exec(request, () => {});
  const warm = await exec(request, () => {});
  assert.equal(cold.ok, true);
  assert.equal(warm.ok, true);
});
