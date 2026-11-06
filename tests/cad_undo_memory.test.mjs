import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { documentHistoryText, withSetters } from './helpers/source_function.mjs';
import { createHistory } from '../js/edit_history.js';
import { createHistorySnapshotCodec } from '../js/core/history_value_pool.js';

// A rolled hinge part the way an assembly embeds it: a recipe plus derived
// mesh and exact topology caches that dominate its serialized size.
function hingePart(seed) {
  const positions = Array.from({length:12000}, (_, i) => +(Math.sin(i + seed) * 40).toFixed(6));
  const topology = Array.from({length:400}, (_, i) => ({kind:'face', persistentId:'face:' + seed + ':' + i, descriptor:{surface:i % 2 ? 'cylinder' : 'plane', area:i * 0.25}}));
  return {key:'hinge', name:'Sheet hinge', sketches:[{id:'s1', points:[{x:0, y:0}]}], features:[{id:'f1', type:'extrude', params:{depth:0.15}}],
    sheetMetal:{thickness:0.15, hinge:{count:13}},
    parts:[{id:7, kind:'ext', featureId:'f1', meshData:{positions, topology}}],
    exactTopologyCache:{f1:{topology}, 'f1:tool':{topology:topology.slice(0, 50)}}};
}
function vanity() {
  const door = id => ({id, kind:'assembly', name:'Door', transform:{x:100, y:0, z:0, rx:0, ry:0, rz:0},
    asm:{key:'door', components:[{id:1, name:'Door panel', def:{key:'panel', parts:[{id:'leaf', kind:'box', x0:0, x1:40, y0:0, y1:1.8, z0:0, z1:70}]}},
      {id:2, name:'Sheet hinge', def:hingePart(id)}], mates:[]}});
  return {key:'vanity', name:'Vanity', components:[
    {id:11, name:'Carcass side', grounded:true, def:{key:'side', parts:[{id:'side', kind:'box', x0:0, x1:1.8, y0:0, y1:50, z0:0, z1:80}]}, transform:{x:0, y:0, z:0}},
    door(15), door(16)], mates:[]};
}
const KEYS = ['meshData', 'exactTopologyCache'];

test('history snapshot codec stores unchanged derived caches once and decodes independent copies', () => {
  const codec = createHistorySnapshotCodec(KEYS);
  const doc = {d:{name:'@model-history:1', parts:[]}, a:vanity()};
  const full = JSON.stringify(doc).length;
  const snapshots = [];
  for (let i = 0; i < 60; i++) {
    doc.a.components[1].transform.x = 100 + i * 0.5;
    snapshots.push(codec.stringify(doc));
  }
  // Two hinge bodies, each with one mesh and one topology cache.
  assert.equal(codec.entries().length, 4);
  const pooledBytes = codec.entries().reduce((sum, [, raw]) => sum + raw.length, 0);
  const snapshotBytes = snapshots.reduce((sum, snapshot) => sum + snapshot.length, 0);
  assert.ok(snapshotBytes + pooledBytes < 2 * full, `60 snapshots retain ${snapshotBytes + pooledBytes} bytes; one plain snapshot is ${full}`);
  assert.ok(snapshots.every(snapshot => snapshot.length < full / 20));

  const first = codec.parse(snapshots[0]), last = codec.parse(snapshots[59]);
  assert.equal(first.a.components[1].transform.x, 100);
  assert.equal(last.a.components[1].transform.x, 129.5);
  assert.equal(first.d.name, '@model-history:1', 'only the named derived keys are decoded');
  assert.deepEqual(last.a, doc.a);
  first.a.components[1].asm.components[1].def.parts[0].meshData.positions[0] = 1e9;
  assert.notEqual(codec.parse(snapshots[0]).a.components[1].asm.components[1].def.parts[0].meshData.positions[0], 1e9,
    'a restored state can be edited without changing older snapshots');

  const small = codec.stringify({part:{meshData:{positions:[1, 2, 3]}}});
  assert.deepEqual(JSON.parse(small), {part:{meshData:{positions:[1, 2, 3]}}}, 'small caches stay inline');

  codec.retain(snapshots.slice(59));
  assert.equal(codec.entries().length, 4, 'values still referenced by a retained snapshot survive');
  codec.retain([]);
  assert.equal(codec.entries().length, 0);
  const released = codec.parse(snapshots[59]).a.components[1].asm.components[1].def;
  assert.equal(released.parts[0].meshData, undefined, 'a released token decodes as absent derived data');
  assert.equal(released.exactTopologyCache, undefined);
  assert.equal(released.sheetMetal.hinge.count, 13);
});

test('CAD Undo pools vanity hinge caches across placement edits and restores them on Undo', () => {
  const source = modelerSource();
  const E = {mode:'model', docType:'assembly', def:{name:'Part', parts:[]}, assembly:vanity()};
  const noop = () => {};
  const context = {E, createHistory, createHistorySnapshotCodec, scanDoc:() => [], docSubtree:() => [], flash:noop,
    syncUndoButtons:noop, syncHead:noop, invalidateDrawing:noop, invalidateInterference:noop, resolveSketch:noop,
    closeEvalCard:noop, refreshAll:noop, syncSheetPanel:noop};
  vm.createContext(context);
  vm.runInContext(withSetters(documentHistoryText(source, { snapshots: true })) +'\nthis.history=H;this.codec=historySnapshots;', context);
  const {history, codec} = context;
  const full = JSON.stringify({d:E.def, a:E.assembly}).length;
  const original = structuredClone(E.assembly);
  history.seed();
  for (let i = 1; i <= 60; i++) {
    history.push('Apply component placement');
    E.assembly.components[1].transform.x = 100 + i * 0.5;
  }
  const retained = new Set(history.retainedSnapshots().filter(Boolean));
  const bytes = [...retained].reduce((sum, snapshot) => sum + snapshot.length, 0)
    + codec.entries().reduce((sum, [, raw]) => sum + raw.length, 0);
  // Before pooling each of the 61 history nodes held a full copy (~61 x full).
  assert.ok(bytes < 2 * full, `history retains ${bytes} bytes for 61 nodes; one plain snapshot is ${full}`);
  assert.equal(codec.entries().length, 4);

  for (let i = 0; i < 10; i++) assert.equal(history.undo(), true);
  assert.equal(E.assembly.components[1].transform.x, 125);
  const hinge = E.assembly.components[1].asm.components[1].def;
  assert.deepEqual(hinge, original.components[1].asm.components[1].def, 'Undo restores the embedded mesh and exact topology cache');
  assert.notEqual(hinge.parts[0].meshData, E.assembly.components[2].asm.components[1].def.parts[0].meshData);
  for (let i = 0; i < 10; i++) assert.equal(history.redo(), true);
  assert.equal(E.assembly.components[1].transform.x, 130);
  assert.deepEqual(E.assembly.components[2], original.components[2]);

  history.clear();
  assert.equal(codec.entries().length, 0, 'a new editing session releases the previous session\'s pooled caches');
});
