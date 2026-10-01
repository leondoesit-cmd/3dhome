import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('an intermediate disconnected sweep path retains the last preview and recovers after its joints reconnect', () => {
  const source = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
  const start = source.indexOf('function syncSweptSourceParts() {');
  const end = source.indexOf('\nfunction syncFaceSupportedSketchFrames()', start);
  assert.ok(start >= 0 && end > start);
  const originalKernel = { type: 'sweep', params: { profile: 'last-good' } };
  const part = { kernel: originalKernel, sketchSources: { path: 'editing' }, meshData: 'last-good-mesh' };
  let connected = false;
  let queued = 0;
  const context = {
    E: { def: { parts: [part] } },
    isKernelBody: () => true,
    resolveSweptSources: () => {
      if (!connected) throw new Error('Select one connected sweep path');
      return { profile: 'reconnected-profile', path: 'reconnected-path' };
    },
    resolveProfilePoints: () => null,
    kernelBodySpec: (type, params) => ({ type, params }),
    queueKernelBody: () => { queued += 1; },
    scheduleExactMesh: () => { throw new Error('not a merged body'); },
  };
  runInNewContext(source.slice(start, end) + '\nthis.sync = syncSweptSourceParts;', context);
  assert.equal(context.sync(), true);
  assert.equal(part.profileError, true);
  assert.equal(part.kernel, originalKernel);
  assert.equal(part.meshData, 'last-good-mesh');
  assert.equal(queued, 0);
  connected = true;
  assert.equal(context.sync(), true);
  assert.equal(part.profileError, false);
  assert.equal(part.kernel.params.path, 'reconnected-path');
  assert.equal(part.meshData, undefined);
  assert.equal(queued, 1);
});
