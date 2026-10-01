import test from 'node:test';
import assert from 'node:assert/strict';
import {installCadWorkerBootstrap} from '../js/cad_worker.js';
import {readFileSync} from 'node:fs';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(loader){const messages=[],scope={postMessage:value=>messages.push(value)};installCadWorkerBootstrap(scope,loader);return {messages,send:(id,request={kind:'regenerate'})=>scope.onmessage({data:{id,request}})};}

test('the real worker entry acknowledges admission before delayed runtime import and serializes jobs',async()=>{
  const runtime=deferred(),loading=deferred(),first=deferred(),executing=deferred();let imports=0,creates=0;const started=[];
  const f=fixture(()=>{imports++;loading.resolve();return runtime.promise;});
  const a=f.send(1),b=f.send(2);
  assert.deepEqual(f.messages.map(m=>[m.id,m.progress.stage]),[[1,'queued'],[2,'queued']]);
  await loading.promise;
  assert.equal(imports,1);assert.ok(f.messages.some(m=>m.id===1 && m.progress.stage==='loading-runtime'));
  runtime.resolve({createCadWorkerExecutor(){creates++;return async request=>{started.push(request.kind);if(started.length===1){executing.resolve();await first.promise;}return started.length;};}});
  await executing.promise;assert.equal(started.length,1,'second job must remain queued while first native job runs');
  first.resolve();await Promise.all([a,b]);
  assert.equal(imports,1);assert.equal(creates,1);assert.deepEqual(f.messages.filter(m=>'result' in m).map(m=>m.result),[1,2]);
});

test('runtime import failure explicitly rejects its request and a later admission can retry',async()=>{
  let imports=0;const f=fixture(async()=>{if(++imports===1)throw new TypeError('Runtime module unavailable');return {createCadWorkerExecutor:()=>async()=>({ok:true})};});
  await f.send(1);assert.deepEqual(f.messages.at(-1),{id:1,error:{name:'TypeError',message:'Runtime module unavailable'}});
  await f.send(2);assert.equal(imports,2);assert.deepEqual(f.messages.at(-1),{id:2,result:{ok:true}});
});

test('a failed geometry request does not discard the loaded executor or strand the next job',async()=>{
  let imports=0;const f=fixture(async()=>{imports++;return {createCadWorkerExecutor:()=>async request=>{if(request.fail)throw new Error('Invalid feature');return {ok:true};}};});
  await Promise.all([f.send(1,{kind:'regenerate',fail:true}),f.send(2)]);
  assert.equal(imports,1);assert.equal(f.messages.find(m=>m.id===1 && m.error).error.message,'Invalid feature');
  assert.deepEqual(f.messages.at(-1),{id:2,result:{ok:true}});
});

test('worker startup imports no runtime module before registering its message handler',()=>{
  const source=readFileSync(new URL('../js/cad_worker.js',import.meta.url),'utf8');
  assert.equal(/^\s*import\s+(?!\()/m.test(source),false);
  assert.match(source,/scope\.onmessage\s*=/);
});

test('superseded queued viewport snapshots skip native work without cancelling active or explicit tasks',async()=>{
 const started=[],busy=deferred(),running=deferred();
 const f=fixture(async()=>({createCadWorkerExecutor:()=>async request=>{started.push(request.label);if(request.label==='active'){running.resolve();await busy.promise;}return request.label;}}));
 const a=f.send(1,{kind:'regenerate',coalesceKey:'viewport:body',label:'active'});await running.promise;
 const old=f.send(2,{kind:'regenerate',coalesceKey:'viewport:body',label:'obsolete'});
 const save=f.send(3,{kind:'regenerate',label:'save'});
 const latest=f.send(4,{kind:'regenerate',coalesceKey:'viewport:body',label:'latest'});
 const other=f.send(5,{kind:'regenerate',coalesceKey:'viewport:other',label:'other'});
 busy.resolve();await Promise.all([a,old,save,latest,other]);
 assert.deepEqual(started,['active','save','latest','other']);
 assert.equal(f.messages.find(m=>m.id===2&&m.error).error.name,'AbortError');
 assert.equal(f.messages.find(m=>m.id===1&&'result' in m).result,'active');
});
