import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';

// Frames and quantized poses only, reduced from the human-authored browser
// checkpoint. No CAD geometry or caches are used by this solver regression.
const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/saved_nested_mate_precision.json', import.meta.url), 'utf8'));

test('saved nested concentric poses remain resolved after repeated JSON reopen', () => {
  let assembly = fixture();
  for (let reopen = 0; reopen < 4; reopen++) {
    const result = solveAssemblyMates(assembly);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.unsatisfied, []);
    assert.ok(result.clusters.some(cluster => cluster.components.includes(2134)), 'nested occurrence remains an active moving component');
    assembly = JSON.parse(JSON.stringify(assembly));
  }
});

test('physical tolerance acceptance still rejects conflicting saved mates', () => {
  const assembly = fixture();
  assembly.topologyMates.push({...structuredClone(assembly.topologyMates[1]), id: 'conflicting-distance', value: 2.8});
  const result = solveAssemblyMates(assembly);
  assert.equal(result.ok, false);
  assert.ok(result.unsatisfied.length > 0);
  assert.ok(result.unsatisfied.some(issue => issue.linear > .1), 'a centimetre contradiction is not accepted as numerical noise');
});
