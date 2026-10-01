import test from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../js/state.js';
import { makeSpec, layoutCab, PRESETS, cutList } from '../js/cabinet.js';
import { cabinetRuntimeMeshKey, placeCabinetUnit } from '../js/core/cabinet_mesh_reuse.js';

function cabinet(preset = 'w_classic') {
  const item = { id: 'reuse-test', type: 'cabsys', x: 0, z: 0, rot: 0, w: 120, h: 240, d: 60 };
  item.cab = makeSpec(preset, item.w, item.h, item.d);
  S.items = [item];
  return item;
}
test('runtime mesh keys retain exact driving inputs and permit only placement and unit motion', () => {
  const item = cabinet(), layout = layoutCab(item);
  const key = cabinetRuntimeMeshKey(item, layout);
  const pose = { parts: structuredClone(layout.parts), units: structuredClone(layout.units) };
  item.x = 234; item.z = -35; item.rot = 33; item.cab.open = .3; item.runtimeState = { cabinetOpen: .3 };
  pose.units.forEach(unit => Object.assign(unit, { ang: .123456789, tx: 4, ty: 5, tz: 6 }));
  assert.equal(cabinetRuntimeMeshKey(item, pose), key);
  for (const edit of [it => it.w += 1e-10, it => it.cab.panel += 1e-10, it => it.variant = 'white',
    it => it.tex = 'texture', it => it.runtimeState.lightOn = false, it => it.cab.productionOverrides = { a: { rough: 1 } }]) {
    const changed = structuredClone(item); edit(changed);
    assert.notEqual(cabinetRuntimeMeshKey(changed, pose), key);
  }
  for (const edit of [L => L.parts[0].x0 += 1e-10, L => L.parts.push({ k: 'box' }),
    L => L.units[0].px = (L.units[0].px || 0) + 1e-10, L => L.units[0].rot = 'z']) {
    const changed = structuredClone(pose); edit(changed);
    assert.notEqual(cabinetRuntimeMeshKey(item, changed), key);
  }
});

test('a garment reveal or topology change misses while continuous motion preserves the cut list', () => {
  const item = cabinet();
  item.runtimeState = { cabinetOpen: .2 };
  const key = cabinetRuntimeMeshKey(item, layoutCab(item));
  item.runtimeState.cabinetOpen = .4;
  assert.notEqual(cabinetRuntimeMeshKey(item, layoutCab(item)), key);
  const openKey = cabinetRuntimeMeshKey(item, layoutCab(item)), before = cutList(item);
  item.runtimeState.cabinetOpen = .45;
  assert.equal(cabinetRuntimeMeshKey(item, layoutCab(item)), openKey);
  assert.deepEqual(cutList(item), before);
});

test('every preset preserves unit pivots and parts in the structural comparison', () => {
  for (const preset of PRESETS) {
    const item = cabinet(preset.id), layout = layoutCab(item), key = cabinetRuntimeMeshKey(item, layout);
    assert.ok(key, preset.id);
    const parsed = JSON.parse(key);
    assert.deepEqual(parsed.parts, JSON.parse(JSON.stringify(layout.parts)), preset.id);
    for (let i = 0; i < layout.units.length; i++) {
      const expected = { ...layout.units[i] };
      for (const name of ['ang', 'tx', 'ty', 'tz']) delete expected[name];
      assert.deepEqual(parsed.units[i], expected, preset.id);
    }
  }
});

test('unit updates reset old rotation axes and reproduce the builder transform exactly', () => {
  const position = { set(...values) { this.values = values; } }, rotation = { x: 1, y: 2, z: 3,
    set(x, y, z) { Object.assign(this, { x, y, z }); } };
  const group = { position, rotation }, unit = { px: .123456789, py: 8, pz: -2, tx: 3, ty: 4, tz: 5, rot: 'x', ang: -.7654321 };
  placeCabinetUnit(group, unit, 145);
  assert.deepEqual(position.values, [3.123456789, 157, 3]);
  assert.deepEqual([rotation.x, rotation.y, rotation.z], [-.7654321, 0, 0]);
});

test('unserializable structural input never accepts cached geometry', () => {
  const item = cabinet(), layout = layoutCab(item); item.cycle = item;
  assert.equal(cabinetRuntimeMeshKey(item, layout), null);
});
