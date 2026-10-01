import test from 'node:test';
import assert from 'node:assert/strict';
import { cadWorkerTransferList, cadWorkerWireResult, installCadWorkerBootstrap } from '../js/cad_worker.js';
import { restoreCadWorkerWireResult, createCadWorkerClient } from '../js/core/cad_worker_client.js';
import { createCadWorkerExecutor } from '../js/core/cad_worker_runtime.js';
import { deserializeBrep, disposeBrep, shapeMassProperties, hydrateSerializedBrepTopology, exportStep } from '../js/cad_kernel.js';

test('binary transfers preserve complete results and plain double-precision saved positions', async () => {
  const execute = createCadWorkerExecutor(), document = { features: [{ id: 'box', type: 'box', params: { w: 2, h: 3, d: 4 } }] };
  const result = await execute({ kind: 'regenerate', document, massProperties: true });
  const payload = result.results[0][1], topologyIds = payload.topology.map(item => item.persistentId);
  payload.meshData.positions[0] = .12345678912345678;
  const positions = payload.meshData.positions.slice(), wire = cadWorkerWireResult(result), transfers = cadWorkerTransferList(wire);
  assert.ok(wire.results[0][1].meshData.positions instanceof Float64Array);
  assert.ok(Array.isArray(payload.meshData.positions), 'wire packing cannot mutate the executor display format');
  assert.ok(transfers.includes(payload.bytes.buffer));
  assert.ok(transfers.includes(payload.meshData.normals.buffer));
  assert.equal(new Set(transfers).size, transfers.length);
  const received = restoreCadWorkerWireResult(structuredClone(wire, { transfer: transfers })), packed = received.results[0][1];
  assert.equal(payload.bytes.byteLength, 0);
  assert.ok(Array.isArray(packed.meshData.positions)); assert.deepEqual(packed.meshData.positions, positions);
  assert.deepEqual(JSON.parse(JSON.stringify(packed.meshData.positions)), positions);
  const body = await deserializeBrep(packed.bytes);
  try {
    hydrateSerializedBrepTopology(body, packed.topology, { ownerFeatureId: 'box' });
    assert.deepEqual(body.topology.map(item => item.persistentId), topologyIds);
    assert.ok(Math.abs((await shapeMassProperties(body)).volume - 24) < 1e-7);
    assert.ok((await exportStep(body, 'box.step')).byteLength > 100);
  } finally { disposeBrep(body); }
  const second = await execute({ kind: 'regenerate', document });
  assert.ok(second.results[0][1].bytes.byteLength, 'a later job still produces exact geometry');
});

test('client restores lossless wire coordinates before exposing a result to saved-model readers', async () => {
  const coordinates=[.12345678912345678,Number.MIN_VALUE,1e100,-0,Math.PI];
  let worker;
  const client=createCadWorkerClient(()=>worker={postMessage(){},terminate(){}});
  const pending=client.request({kind:'regenerate'});
  const result={results:[['body',{meshData:{positions:Float64Array.from(coordinates)}}]]};
  worker.onmessage({data:{id:1,result}});
  const received=await pending;
  assert.ok(Array.isArray(received.results[0][1].meshData.positions));
  assert.deepEqual(received.results[0][1].meshData.positions,coordinates);
  assert.equal(received.results[0][1].meshData.positions[0],coordinates[0]);
});

test('bootstrap transfer detaches fresh buffers but retains aliased finish caches across requests', async () => {
  const bytes = new Uint8Array([1, 2, 3]), normals = new Float32Array([0, 1, 0]);
  const cached = { body: { bytes, meshData: { normals, positions: [0, 0, 0] } } }, messages = [];
  const scope = { postMessage(message, transfer = []) { messages.push(structuredClone(message, { transfer })); } };
  installCadWorkerBootstrap(scope, async () => ({ createCadWorkerExecutor: () => async () => cached }));
  for (const id of [1, 2]) await scope.onmessage({ data: { id, request: { kind: 'finish' } } });
  assert.equal(bytes.byteLength, 3); assert.equal(normals.byteLength, 12);
  assert.equal(messages.filter(message => message.result).length, 2);
  assert.deepEqual(cadWorkerTransferList(cached), []);
  const fresh = { bytes: new Uint8Array([4, 5]) };
  assert.equal(cadWorkerTransferList(fresh).length, 1);
  const received = structuredClone(fresh, { transfer: cadWorkerTransferList(fresh) });
  assert.deepEqual([...received.bytes], [4, 5]); assert.equal(fresh.bytes.byteLength, 0);
});
