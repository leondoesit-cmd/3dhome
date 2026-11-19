import test from 'node:test';
import { moduleSource } from "./helpers/module_source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/three.core.js';
import { sourceFunctionText } from './helpers/source_function.mjs';
import { itemMeshSignature } from '../js/view3d/item_signature.js';

const source = moduleSource("js/view3d.js");
test('item signatures retain canonical definition dependencies and nested geometry at full precision', () => {
  const definition = { revision: 1, features: [{ x: 1, z: 2 }] };
  const item = { id: 'cab', definitionId: 'def', x: 4, z: 5, rot: 8, custom: { x: 2, z: 3 } };
  const context = { S: { parametric: { definitions: { def: definition } } }, catalogRev: 0,
    itemMeshSignature, FURN: {}, isPhysicsEnabled: () => false };
  vm.createContext(context); vm.runInContext(sourceFunctionText(source, 'itemSig'), context);
  const original = context.itemSig(item);
  item.x++; item.z++; item.rot++; assert.equal(context.itemSig(item), original);
  item.custom.x += 1e-10; assert.notEqual(context.itemSig(item), original); item.custom.x = 2;
  definition.features[0].x += 1e-10; assert.notEqual(context.itemSig(item), original);
  definition.features[0].x = 1; definition.revision++; assert.notEqual(context.itemSig(item), original);
  definition.cycle = definition; assert.equal(context.itemSig(item), null);
});
test('warm reconcile serializes each shared canonical definition once and sees edits next time', () => {
  let reads = 0, builds = 0;
  const features = [{ x: 3 }];
  const definition = { get features() { reads++; return features; } };
  const items = Array.from({ length: 129 }, (_, i) => ({ id: String(i), type: 'chair', definitionId: 'shared' }));
  const context = {
    S: { items, parametric: { definitions: { shared: definition } } }, FURN: {}, catalogRev: 0,
    itemMeshSignature, itemCache: new Map(), isPhysicsEnabled: () => false, placeItem() {}, syncUserGhost() {},
    buildAndCache(it) {
      builds++;
      context.itemCache.set(it.id, { g: { userData: { partsMerged: true } }, sig: context.itemSig(it) });
    },
  };
  vm.createContext(context);
  for (const f of ['syncItems', 'itemSig']) vm.runInContext(sourceFunctionText(source, f), context);
  const shown = { items: {} };
  context.syncItems(shown);
  reads = builds = 0;
  context.syncItems(shown);
  assert.deepEqual({ reads, builds }, { reads: 1, builds: 0 });
  definition.lastRebuild = { rebuiltAt: 10, issues: [{ parameter: 'height' }] };
  context.syncItems(shown);
  assert.equal(builds, 0);
  definition.features[0].x++;
  context.syncItems(shown);
  assert.equal(builds, items.length);
  definition.lastRebuild.topology = [{ persistentId: 'face-1' }];
  context.syncItems(shown);
  assert.equal(builds, items.length * 2);
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
    fitBounceLights() { context.reflected = true; },
    FURN: {}, fitPracticalLights() { work.lampFits = (work.lampFits || 0) + 1; },
    markShadowRegion(box) { context.shadowRegion = box; },
    // an edit asks for the other shadow sets' shaders again, once idle
    schedulePrewarm() { context.prewarms = (context.prewarms || 0) + 1; },
    shadowsDirty: false, needsRender: false,
    set_needsRender(value) { return context.needsRender = value; } };
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
  assert.equal(context.reflected, true);
});
test('cabinet runtime reuse updates the signature and skips unrelated scene geometry', () => {
  const { context, item, work } = fixture();
  item.value = 2; context.S.items3D.set('cab', 'build'); context.applyItemOps();
  assert.deepEqual(work, { builds: 0, moves: 1, runtime: 1, ghosts: 0 });
  assert.equal(context.itemCache.get('cab').sig, '0|2'); assert.equal(context.S.dirty3D, false);
});
test('a dependent piece crossing rooms refits the batch even when its host stays in one room', () => {
  const {context, item, group} = fixture();
  const rider = {id: 'lamp', room: 1};
  item.room = 1;
  group.room = 1;
  const mounted = {room: 1};
  context.S.items.push(rider);
  context.itemCache.set(rider.id, {g: mounted});
  context.itemBouncePlacement = g => g.room;
  context.placeItem = (g, it) => { g.room = it.room; };
  let solves = 0;
  context.fitBounceLights = () => { solves++; };
  for (const room of [1, 2, 2]) {
    rider.room = room;
    for (const it of [item, rider]) context.S.items3D.set(it.id, 'move');
    context.applyItemOps();
  }
  assert.equal(solves, 1);
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

test('cutting a ceiling fitting preserves its bulb and its shadow geometry', () => {
  let cut = 150;
  const place = vm.runInNewContext('(' + sourceFunctionText(source, 'placeItem') + ')', {
    FURN: { pendant: { lamp: true } }, SHADOW_ONLY_LAYER: 5,
    cutH: () => cut, elevOffset: () => 0, itemVSpan: () => ({lo: 190, hi: 250})
  });
  const group = new THREE.Group(), shade = new THREE.Mesh(), bulb = new THREE.PointLight();
  group.add(shade, bulb);
  shade.layers.enable(2);
  const layers = shade.layers.mask, item = { type: 'pendant', x: 30, z: 50, rot: 0 };
  let visits = 0;
  const traverse = group.traverse.bind(group);
  group.traverse = visit => { visits++; traverse(visit); };
  for (let i = 0; i < 30; i++) place(group, item);
  assert.equal(visits, 1);
  assert.equal(group.visible, true);
  assert.equal(shade.layers.mask, 1 << 5);
  assert.equal(bulb.layers.mask, 1);
  cut = Infinity;
  place(group, item);
  assert.equal(shade.layers.mask, layers);
  assert.equal(visits, 2);
});

test('moving and mounting a fixture retains mesh, material and bulb identities across reconcile', () => {
  const lamp = { id: 'lamp', type: 'tableLamp', x: 0, z: 0, rot: 0 };
  const other = { ...lamp, id: 'other', x: 400 };
  const root = new THREE.Group(), cache = new Map(), ops = new Map();
  const counts = { meshes: 0, materials: 0, lights: 0, fullFits: 0, partialFits: 0 };
  const ctx = {
    THREE, itemMeshSignature, FURN: { tableLamp: { lamp: true } }, catalogRev: 0, itemsRoot: root, itemCache: cache,
    S: { items: [lamp, other], items3D: ops }, isPhysicsEnabled: () => false,
    buildAndCache(it) {
      cache.get(it.id)?.g.removeFromParent();
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), new THREE.PointLight());
      counts.meshes++; counts.materials++; counts.lights++;
      g.userData.partsMerged = true;
      root.add(g); ctx.placeItem(g, it);
      cache.set(it.id, { g, sig: ctx.itemSig(it), catalogRev: 0 });
      return g;
    },
    cutH: () => Infinity, elevOffset: it => it.elev || 0, isLayerGhosted: () => false,
    updateCabinetRuntimeMesh: () => false, schedulePrewarm() {}, markShadowRegion() {},
    fitPracticalLights(groups) {
      if (!groups) { counts.fullFits++; return; }
      assert.deepEqual(Array.from(groups), [cache.get(lamp.id).g]);
      counts.partialFits++;
    },
    itemBouncePlacement(g) { return g.position.y; }, fitBounceLights() {}, set_needsRender() {},
  };
  vm.createContext(ctx);
  for (const f of ['applyItemOps', 'syncItems', 'syncUserGhost', 'placeItem', 'itemSig']) {
    vm.runInContext(sourceFunctionText(source, f), ctx);
  }
  const visible = { items: {} };
  ctx.syncItems(visible);
  const identities = root.children.map(g => [g, g.children[0], g.children[0].material, g.children[1], g.children[1].shadow]);
  for (let frame = 0; frame < 30; frame++) {
    lamp.x += 10;
    ops.set(lamp.id, 'move'); ctx.applyItemOps();
  }
  Object.assign(lamp, { on: 'table', elev: 70, hold: { wall: 4 } });
  ops.set(lamp.id, 'build'); ctx.applyItemOps(); ctx.syncItems(visible);
  assert.deepEqual(counts, { meshes: 2, materials: 2, lights: 2, fullFits: 0, partialFits: 31 });
  for (const [i, g] of root.children.entries()) {
    [g, g.children[0], g.children[0].material, g.children[1], g.children[1].shadow]
      .forEach((obj, j) => assert.equal(obj, identities[i][j]));
  }
  assert.deepEqual(cache.get(lamp.id).g.position.toArray(), [300, 70, 0]);
  // Structural edits to a fixture must still allocate its replacement.
  lamp.variant = 'different shade';
  ops.set(lamp.id, 'build'); ctx.applyItemOps();
  assert.equal(counts.meshes, 3);
  assert.equal(counts.fullFits, 1);
});
