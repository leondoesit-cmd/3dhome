import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sourceFunctionText } from './helpers/source_function.mjs';

const source = readFileSync(new URL('../js/view3d.js', import.meta.url), 'utf8');
test('item signatures retain canonical definition dependencies and nested geometry at full precision', () => {
  const definition = { revision: 1, features: [{ x: 1, z: 2 }] };
  const item = { id: 'cab', definitionId: 'def', x: 4, z: 5, rot: 8, custom: { x: 2, z: 3 } };
  const context = { S: { parametric: { definitions: { def: definition } } }, catalogRev: 0 };
  vm.createContext(context); vm.runInContext(sourceFunctionText(source, 'itemSig'), context);
  const original = context.itemSig(item);
  item.x++; item.z++; item.rot++; assert.equal(context.itemSig(item), original);
  item.custom.x += 1e-10; assert.notEqual(context.itemSig(item), original); item.custom.x = 2;
  definition.features[0].x += 1e-10; assert.notEqual(context.itemSig(item), original);
  definition.features[0].x = 1; definition.revision++; assert.notEqual(context.itemSig(item), original);
  definition.cycle = definition; assert.equal(context.itemSig(item), null);
});
function fixture() {
  const item = { id: 'cab', value: 1 }, group = {}, work = { builds: 0, moves: 0, runtime: 0, ghosts: 0 };
  const context = { S: { items: [item], items3D: new Map(), dirty3D: false }, itemsRoot: {},
    itemCache: new Map([['cab', { g: group, sig: '0|1', catalogRev: 0 }]]), catalogRev: 0,
    itemSig: it => `${context.catalogRev}|${it.value}`,
    placeItem(g, it) { work.moves++; g.live = it; },
    buildAndCache() { work.builds++; return {}; },
    updateCabinetRuntimeMesh() { work.runtime++; return true; },
    isLayerGhosted: () => false, ghostSwap() { work.ghosts++; }, isPhysicsEnabled: () => false,
    // shadows: only the region a piece left and landed in is redrawn
    THREE: { Box3: class { union() { return this; } setFromObject() { return this; } } },
    FURN: {}, fitPracticalLights() { work.lampFits = (work.lampFits || 0) + 1; },
    markShadowRegion(box) { context.shadowRegion = box; },
    shadowsDirty: false, needsRender: false };
  vm.createContext(context); vm.runInContext(sourceFunctionText(source, 'applyItemOps'), context);
  return { context, item, group, work };
}
test('unchanged item build requests retain geometry and update the live placement/reference', () => {
  const { context, item, group, work } = fixture();
  context.S.items = [{ ...item }]; context.S.items3D.set('cab', 'build'); context.applyItemOps();
  assert.equal(work.builds, 0); assert.equal(work.runtime, 0); assert.equal(work.moves, 1);
  assert.equal(group.live, context.S.items[0]); assert.equal(context.S.dirty3D, false);
  assert.ok(context.shadowRegion, 'the moved region is marked'); assert.equal(context.shadowsDirty, false);
  assert.equal(context.needsRender, true);
});
test('cabinet runtime reuse updates the signature and skips unrelated scene geometry', () => {
  const { context, item, work } = fixture();
  item.value = 2; context.S.items3D.set('cab', 'build'); context.applyItemOps();
  assert.deepEqual(work, { builds: 0, moves: 1, runtime: 1, ghosts: 0 });
  assert.equal(context.itemCache.get('cab').sig, '0|2'); assert.equal(context.S.dirty3D, false);
});
test('catalogue changes, invalid structural reuse, missing items and physics retain conservative rebuilds', () => {
  for (const reason of ['catalogue', 'structure', 'missing', 'physics', 'no-root']) {
    const { context, item, work } = fixture();
    context.S.items3D.set('cab', 'build');
    if (reason === 'catalogue') context.catalogRev++;
    if (reason === 'structure') { item.value++; context.updateCabinetRuntimeMesh = () => false; }
    if (reason === 'missing') context.S.items = [];
    if (reason === 'physics') context.isPhysicsEnabled = () => true;
    if (reason === 'no-root') context.itemsRoot = null;
    context.applyItemOps();
    if (['catalogue', 'structure'].includes(reason)) assert.equal(work.builds, 1, reason);
    else assert.equal(context.S.dirty3D, true, reason);
    assert.equal(context.S.items3D.size, 0, reason);
  }
});
test('ghosted furniture remains ghosted after a runtime update', () => {
  const { context, item, work } = fixture();
  item.value++; context.isLayerGhosted = () => true;
  context.S.items3D.set('cab', 'build'); context.applyItemOps();
  assert.equal(work.ghosts, 1); assert.equal(work.builds, 0);
});
