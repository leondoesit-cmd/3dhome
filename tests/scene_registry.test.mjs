import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from '../vendor/three/three.core.js';
import { createSceneRegistry } from '../js/core/scene_registry.js';

test('registry follows additions, removals, nested edits, and reparenting', () => {
  const root = new Group(), a = new Group(), b = new Group(), human = new Group();
  human.userData.isHuman = true; a.add(human); root.add(a, b);
  const registry = createSceneRegistry(root, o => !!o.userData.isHuman);
  const compare = () => {
    const expected = []; root.traverse(o => { if (o.userData.isHuman) expected.push(o); });
    assert.deepEqual(new Set(expected), registry.members);
  };
  compare(); b.add(human); compare(); root.remove(b); compare();
  root.add(b); compare(); root.clear(); compare();
  root.add(a); a.add(human); compare();
  registry.dispose(); assert.equal(registry.members.size, 0);
  root.add(b); assert.equal(registry.members.size, 0);
});
