import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblyInterferenceScope } from '../js/core/assembly_interference_scope.js';

const assembly = { components: [{ id: 1, name: 'Housing' }, { id: 2, name: 'Battery and plate' }, { id: 3, name: 'Lens' }] };
const leaves = [{ path: [1] }, { path: [2, 20] }, { path: [2, 21] }, { path: [3, 30] }];

test('selected housing and battery subassembly includes both battery leaves and excludes lens', () => {
  const scope = assemblyInterferenceScope(assembly, [{ id: '1' }, { id: 2 }], leaves);
  assert.deepEqual(scope.occurrences.map(leaf => leaf.path), [[1], [2, 20], [2, 21]]);
  assert.equal(scope.wholeAssembly, false);
  assert.deepEqual(scope.roots.map(root => root.name), ['Housing', 'Battery and plate']);
});

test('zero or one selected root still checks the complete visible assembly', () => {
  for (const selection of [[], [{ id: 1 }], [{ id: 999 }, { id: 1 }]]) {
    const scope = assemblyInterferenceScope(assembly, selection, leaves);
    assert.equal(scope.occurrences, leaves);
    assert.equal(scope.wholeAssembly, true);
  }
});

test('selecting a subassembly also includes nested descendants', () => {
  const scope = assemblyInterferenceScope(assembly, [{ id: 1 }, { id: 2 }], [...leaves, { path: [2, 22, 220] }]);
  assert.deepEqual(scope.occurrences.at(-1).path, [2, 22, 220]);
});
