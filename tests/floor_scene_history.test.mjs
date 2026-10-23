import test from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../js/state.js';
import { createHistory } from '../js/edit_history.js';
import { configureFloorIO, addSlabOpeningToFloor, updateStairVoidsOnFloors } from '../js/floors.js';
import { applyStairMoveTo } from '../js/slab_openings.js';

const clone = value => JSON.parse(JSON.stringify(value));
const opening = { id: 9, stairsId: 7, x: 100, z: 150, w: 100, d: 250, rot: 0 };

// Match history.js: inactive scenes are interned by identity, not copied on
// capture. Copies are made only when restoring a pooled snapshot.
function setup(scene) {
  S.workspace = { activeFloor: 'ground', floors: [
    { id: 'ground', elevation: 0, scene: {} },
    { id: 'upper', elevation: 300, scene },
    { id: 'other', elevation: 600, scene: { slabOpenings: [] } },
  ] };
  configureFloorIO({ sceneObject: () => ({ slabOpenings: [] }), applyData: () => true });
  const tokens = new WeakMap(), pool = new Map();
  const history = createHistory({
    get() {
      return JSON.stringify({ ...S.workspace, floors: S.workspace.floors.map(f => {
        if (f.id === S.workspace.activeFloor) return { ...f, scene: null };
        let token = tokens.get(f.scene);
        if (!token) { token = '@floor:' + pool.size; tokens.set(f.scene, token); pool.set(token, f.scene); }
        return { ...f, scene: token };
      }) });
    },
    set(snapshot) {
      S.workspace = JSON.parse(snapshot);
      for (const f of S.workspace.floors) {
        if (!pool.has(f.scene)) continue;
        const token = f.scene;
        f.scene = clone(pool.get(token));
        tokens.set(f.scene, token);
      }
    },
  });
  return history;
}

for (const format of ['legacy', 'spatial', 'both']) {
  const sceneWith = list => ({
    ...(format !== 'spatial' ? { slabOpenings: clone(list) } : {}),
    ...(format !== 'legacy' ? { spatial: { slabOpenings: clone(list), nodes: [] } } : {}),
    roomMeta: { room: { floor: 'tiles' } },
  });
  test(`undo/redo Slab from stairs preserves pooled ${format} scene`, () => {
    const before = sceneWith([]), history = setup(before);
    history.push('Slab from stairs');
    addSlabOpeningToFloor('upper', opening);
    const after = clone(S.workspace.floors[1].scene);
    assert.equal(after.slabOpenings.length, 1);
    history.undo();
    assert.deepEqual(S.workspace.floors[1].scene, sceneWith([]));
    history.redo();
    assert.deepEqual(S.workspace.floors[1].scene, after);
    assert.deepEqual(before, sceneWith([]));
  });
  test(`undo/redo stair movement preserves pooled ${format} scene`, () => {
    const before = sceneWith([opening]), history = setup(before);
    const other = S.workspace.floors[2].scene;
    history.push('Move stairs');
    assert.equal(updateStairVoidsOnFloors({ id: 7, x: 250, z: 300, w: 120, d: 280, rot: 90 }, applyStairMoveTo), true);
    const after = clone(S.workspace.floors[1].scene);
    assert.equal((after.spatial || after).slabOpenings[0].x, 250);
    assert.equal(S.workspace.floors[2].scene, other, 'no-op floors retain their pooled identity');
    history.undo();
    assert.deepEqual(S.workspace.floors[1].scene, sceneWith([opening]));
    history.redo();
    assert.deepEqual(S.workspace.floors[1].scene, after);
    assert.deepEqual(before, sceneWith([opening]));
  });
}
