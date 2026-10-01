import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeBodyCacheEvictions,createNativeBodyStore} from '../js/core/native_body_store.js';

test('native persisted cache evicts oldest entries for byte and count limits',()=>{
  const records=[{key:'new',at:3,bytes:6},{key:'old',at:1,bytes:4},{key:'middle',at:2,bytes:4}];
  assert.deepEqual(nativeBodyCacheEvictions(records,10,24),['old']);
  assert.deepEqual(nativeBodyCacheEvictions(records,64,1),['old','middle']);
  assert.deepEqual(nativeBodyCacheEvictions(records,5,24),['old','middle','new']);
  assert.deepEqual(records.map(r=>r.key),['new','old','middle']);
});

test('unavailable local persistence only disables the cache optimization',async()=>{
  const store=createNativeBodyStore(null);
  await store.put('key',{bytes:new Uint8Array([1,2]),metadata:{}});
  assert.equal(await store.get('key'),null);
});
