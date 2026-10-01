import test from 'node:test';
import assert from 'node:assert/strict';
import {createExactRebuildQueue} from '../js/core/exact_rebuild_queue.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
test('rejected exact jobs do not poison later rebuilds',async()=>{
  const queue=createExactRebuildQueue();
  const failed=queue.run(()=>{throw new Error('bad feature');});
  const next=queue.run(()=>42);
  await assert.rejects(failed,/bad feature/);assert.equal(await next,42);
});
test('opening another document detaches a blocked task and suppresses obsolete queued work',async()=>{
  const queue=createExactRebuildQueue(),gate=deferred(),entered=deferred();let obsoleteRan=false,oldIsCurrent;
  const old=queue.run(async isCurrent=>{oldIsCurrent=isCurrent;entered.resolve();await gate.promise;return isCurrent()?'old':'obsolete';});
  await entered.promise;
  const obsolete=queue.run(()=>{obsoleteRan=true;});
  queue.reset();
  assert.equal(await queue.run(()=> 'fresh'),'fresh');assert.equal(oldIsCurrent(),false);
  gate.resolve();assert.equal(await old,'obsolete');assert.equal(await obsolete,null);assert.equal(obsoleteRan,false);
});
