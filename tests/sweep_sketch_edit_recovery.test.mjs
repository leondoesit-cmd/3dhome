import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { sourceFunctionText } from './helpers/source_function.mjs';
import { isKernelBody, kernelBodySpec } from '../js/core/kernel_body.js';
import { resolveSketchSources, savedLoftSources, sweepSourceRecord } from '../js/core/swept_sources.js';
import { resolveProfilePoints } from '../js/sketch_solver.js';

const syncSource = sourceFunctionText(modelerSource(), 'syncSweptSourceParts');

for (const mode of ['sketch', 'circular']) for (const target of ['kernel', 'merges3d', 'cuts3d']) {
test(`${mode} sweep in ${target} retains its preview while disconnected and recovers when reconnected`, () => {
  const profile = {
    id: 'profile', plane: 'front',
    points: [{ id: 'center', x: 0, y: 0 }],
    entities: [{ id: 'circle', type: 'circle', c: 'center', r: 1 }],
  };
  const path = {
    id: 'path', plane: 'front',
    points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 },
      { id: 'c', x: 10, y: 0 }, { id: 'd', x: 20, y: 10 }],
    entities: [{ id: 'ab', type: 'line', a: 'a', b: 'b' },
      { id: 'cd', type: 'line', a: 'c', b: 'd' }],
  };
  const sources = mode === 'sketch' ? sweepSourceRecord(profile, ['circle'], path)
    : { kind: 'circular-sweep', diameter: 2, path: { sketchId: path.id, entityIds: ['ab', 'cd'] } };
  const def = { sketches: [profile, path], parts: [] };
  const resolve = () => resolveSketchSources(def, sources, resolveProfilePoints);
  const original = resolve();
  assert.ok(original, 'the connected fixture must resolve before editing');
  const sweepOptions = { orientation: 'fixed', twistAngle: 37, scale: 0.65, solid: false };
  const originalKernel = kernelBodySpec('sweep', { ...original, ...sweepOptions });
  const originalMesh = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    bounds: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 0 },
  };
  const meshSnapshot = structuredClone(originalMesh);
  const entry = { kind: 'sweep', ...original, ...sweepOptions, sketchSources: sources };
  const part = target === 'kernel'
    ? { kind: 'kernel', kernel: originalKernel, sketchSources: sources, meshData: originalMesh }
    : { kind: 'box', [target]: [entry], meshData: originalMesh };
  def.parts.push(part);
  const queued = [], scheduled = [];
  const context = {
    E: { def }, isKernelBody, kernelBodySpec, savedLoftSources, resolveProfilePoints,
    resolveSweptSources: resolveSketchSources,
    queueKernelBody: p => queued.push(p),
    scheduleExactMesh: p => scheduled.push(p),
  };
  runInNewContext(syncSource + '\nthis.sync = syncSweptSourceParts;', context);

  // Moving only one endpoint leaves the two path edges disconnected.
  Object.assign(path.points[1], { x: 12, y: 2 });
  if (mode === 'circular') assert.throws(resolve, /Select one connected sweep path/);
  else assert.equal(resolve(), null);
  assert.equal(context.sync(), target === 'kernel');
  if (target === 'kernel') {
    assert.equal(part.profileError, true);
    assert.equal(part.kernel, originalKernel);
  } else assert.deepEqual(entry, { kind: 'sweep', ...original, ...sweepOptions, sketchSources: sources });
  assert.equal(part.meshData, originalMesh);
  assert.deepEqual(part.meshData, meshSnapshot, 'an invalid path preserves the preview contents in place');
  assert.deepEqual(queued, []);
  assert.deepEqual(scheduled, []);
  assert.equal(context.sync(), false, 'an unchanged invalid path does not trigger another update');
  assert.equal(part.meshData, originalMesh);
  assert.deepEqual(part.meshData, meshSnapshot, 'repeated invalid sync preserves the preview contents in place');

  Object.assign(path.points[2], { x: 12, y: 2 });
  const reconnected = resolve();
  assert.ok(reconnected);
  assert.notDeepEqual(reconnected.path, original.path);
  assert.equal(context.sync(), true);
  if (target === 'kernel') {
    assert.equal(part.profileError, false);
    assert.deepEqual(part.kernel, kernelBodySpec('sweep', { ...reconnected, ...sweepOptions }));
  } else for (const key of ['profile', 'path', 'profileSegments', 'pathSegments']) {
    assert.deepEqual(entry[key], reconnected[key]);
  }
  const recoveredParams = target === 'kernel' ? part.kernel.params : entry;
  for (const [key, value] of Object.entries(sweepOptions)) {
    assert.equal(recoveredParams[key], value, `${key} survives recovery`);
  }
  assert.equal(part.meshData, undefined);
  assert.deepEqual(queued, target === 'kernel' ? [part] : []);
  assert.deepEqual(scheduled, target === 'kernel' ? [] : [part]);
  assert.equal(context.sync(), false, 'an unchanged recovered path does not rebuild again');
  assert.equal(queued.length + scheduled.length, 1);
});
}
