import { sourceFunctionText } from "./helpers/source_function.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { booleanVolumePlausible, booleanBrep, makeBrepPrimitive, extractBrepTopology, shellBrep, shapeMassProperties, disposeBrep } from '../js/cad_kernel.js';

// HOUSING Boss-Stop (steps 377-379): the .100 in ring (11.371 cm3) fused onto
// Shell1 (917.011 cm3, with one invalid offset face) returned a 37.781 cm3 tube,
// and the rebuild reported success.
test('a union that shrinks below its larger operand is implausible', () => {
  assert.equal(booleanVolumePlausible('union', 917.011, 11.371, 37.781), false);
  assert.equal(booleanVolumePlausible('union', 917.011, 11.371, 926.18), true);
  assert.equal(booleanVolumePlausible('union', 10, 10, 20), true, 'disjoint union');
  assert.equal(booleanVolumePlausible('union', 10, 10, 25), false, 'more than both together');
});

test('cut and common keep their own bounds', () => {
  assert.equal(booleanVolumePlausible('subtract', 100, 30, 70), true);
  assert.equal(booleanVolumePlausible('subtract', 100, 30, 120), false, 'a cut never grows the body');
  assert.equal(booleanVolumePlausible('subtract', 100, 30, 40), false, 'a cut never removes more than the tool');
  assert.equal(booleanVolumePlausible('intersect', 100, 30, 30), true);
  assert.equal(booleanVolumePlausible('intersect', 100, 30, 31), false);
});

test('kernel booleans and shells on valid solids pass the guard unflagged', async () => {
  const a = await makeBrepPrimitive({ type: 'box', w: 10, h: 10, d: 10 });
  const b = await makeBrepPrimitive({ type: 'box', x: 5, w: 10, h: 10, d: 10 });
  const disc = await makeBrepPrimitive({ type: 'cylinder', r: 5.55625, h: 3.302, axis: 'z' });
  let fused = null, shelled = null;
  try {
    fused = await booleanBrep('union', a, b);
    assert.ok(Math.abs((await shapeMassProperties(fused)).volume - 1500) < 1e-6);
    const front = extractBrepTopology(disc, { ownerFeatureId: 'disc' }).topology.find((t) => t.kind === 'face' && t.descriptor.surface === 'plane' && Math.abs(t.descriptor.origin.z - 3.302) < 1e-6);
    shelled = await shellBrep(disc, 0.254, { facePersistentIds: [front.persistentId] });
    assert.equal(shelled.invalid, undefined, 'a clean shell is not flagged');
  } finally {
    [fused, shelled, a, b, disc].filter(Boolean).forEach(disposeBrep);
  }
});

test('the guards are wired into booleans, shells and the rebuild report', () => {
  const kernel = moduleSource("js/cad_kernel.js");
  const boolean = sourceFunctionText(kernel, 'booleanBrep');
  assert.match(boolean, /booleanVolumePlausible\(operation, vl, vr, vs\)/);
  const shell = sourceFunctionText(kernel, 'shellBrep');
  assert.match(shell, /shapeIsValid\(oc, shelled\)/);
  assert.match(shell, /invalid: "Shell produced an invalid solid/);
  const tree = readFileSync(new URL('../js/cad_feature_tree.js', import.meta.url), 'utf8');
  assert.match(tree, /if \(result\.invalid\) issues\.push\(\{ feature: feature\.id, severity: "warning", code: "invalid-solid"/);
});
