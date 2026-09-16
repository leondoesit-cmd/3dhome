import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryValuePool} from '../js/core/history_value_pool.js';
test('large unchanged definitions share one token and undo remains isolated from edits',()=>{
 const pool=createHistoryValuePool(), first={definitions:{sink:{positions:Array(10000).fill(23),height:23}}};
 const token=pool.pack(first);
 assert.equal(pool.pack(structuredClone(first)),token);
 first.definitions.sink.height=24;
 const changed=pool.pack(first);
 assert.notEqual(changed,token);
 const restored=pool.unpack(token);restored.definitions.sink.positions[0]=99;
 assert.equal(pool.unpack(token).definitions.sink.positions[0],23);
 assert.equal(pool.unpack(token).definitions.sink.height,23);
 assert.equal(pool.unpack(changed).definitions.sink.height,24);
 assert.equal(pool.unpack('@unrelated'),'@unrelated');
});
