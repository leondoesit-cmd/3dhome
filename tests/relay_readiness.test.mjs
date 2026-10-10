import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForRelay} from './helpers/relay_readiness.mjs';
const options={attempts:2,delay:async()=>{}};
test('readiness waits for a successful HTTP response after temporary unavailability',async()=>{
  let calls=0;await waitForRelay('http://127.0.0.1:1234/api/ping',{exitCode:null},{...options,fetchImpl:async()=>++calls===1?{ok:false,status:503}:{ok:true,status:200}});assert.equal(calls,2);
});
test('a running relay with denied network access still fails and exposes the actual EACCES cause',async()=>{
  let calls=0;await assert.rejects(waitForRelay('http://127.0.0.1:1234/api/ping',{exitCode:null},{...options,fetchImpl:async()=>{calls++;throw new TypeError('fetch failed',{cause:{code:'EACCES'}});}}),/fetch failed \(EACCES\); child has not exited/);assert.equal(calls,2);
});
test('early child exit rejects without polling and an unhealthy HTTP endpoint retains its response status',async()=>{
  let calls=0;await assert.rejects(waitForRelay('http://127.0.0.1:1234/api/ping',{exitCode:1},{...options,fetchImpl:async()=>{calls++;return {ok:true};}}),/exited before readiness: code 1/);assert.equal(calls,0);
  await assert.rejects(waitForRelay('http://127.0.0.1:1234/api/ping',{exitCode:null},{...options,fetchImpl:async()=>({ok:false,status:500})}),/HTTP 500/);
});
