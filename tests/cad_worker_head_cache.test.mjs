import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';

// A shared in-memory body store, so a second executor (a fresh worker) starts
// with an empty in-memory cache and has to read what the first one persisted.
function memoryStore(){
 const map=new Map(),reads=[];
 return {reads,store:{
  async get(key){reads.push(key);return map.get(key) || null;},
  async put(key,payload){map.set(key,payload);},
  async remove(key){map.delete(key);},
 }};
}

const document=()=>({features:[
 {id:'a',type:'box',params:{w:3,h:3,d:3},inputs:[]},
 {id:'b',type:'box',params:{x:2,w:3,h:3,d:3},inputs:[]},
 {id:'joined',type:'union',params:{},inputs:['a','b']},
]});

test('an earlier head does not read or restore cached bodies downstream of it',async()=>{
 const {reads,store}=memoryStore();
 const full=await createCadWorkerExecutor({bodyStore:store})({kind:'regenerate',document:document()});
 assert.equal(full.ok,true);
 reads.length=0;
 const early=await createCadWorkerExecutor({bodyStore:store})({kind:'regenerate',document:document(),head:'a'});
 assert.deepEqual(early.results.map(([id])=>id),['a']);
 assert.equal(reads.length,0,'the union after head "a" is never read from the store');
 // the full history still restores it
 const again=await createCadWorkerExecutor({bodyStore:store})({kind:'regenerate',document:document()});
 assert.equal(again.ok,true);
 assert.equal(reads.length,1,'the full rebuild reads the cached union once');
});

test('a head that no longer exists restores the whole history, as regeneration rebuilds it',async()=>{
 const {reads,store}=memoryStore();
 await createCadWorkerExecutor({bodyStore:store})({kind:'regenerate',document:document()});
 reads.length=0;
 await createCadWorkerExecutor({bodyStore:store})({kind:'regenerate',document:document(),head:'gone'});
 assert.equal(reads.length,1);
});
