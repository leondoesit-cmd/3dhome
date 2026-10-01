import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';

test('cut preflight stays native in the worker and excludes downstream geometry',async()=>{
  const execute=createCadWorkerExecutor(),document={features:[{id:'stock',type:'box',params:{w:2,h:2,d:2}},{id:'later',type:'unsupported',inputs:['stock'],params:{}}]};
  const cut={axis:'y',from:-1,to:3,loop:[{u:0,v:0},{u:1,v:0},{u:1,v:1},{u:0,v:1}]},progress=[];
  const report=await execute({kind:'cut-intersection',document,head:'stock',cut},value=>progress.push(value));
  assert.equal(report.intersects,true);assert.ok(report.volume>0);assert.equal(report.bytes,undefined);
  assert.equal(progress.some(value=>value.name==='unsupported'),false,'later history is outside the requested target');
  const miss=await execute({kind:'cut-intersection',document,head:'stock',cut:{...cut,loop:cut.loop.map(p=>({u:p.u+20,v:p.v}))}});
  assert.equal(miss.intersects,false);
  const run=await execute({kind:'regenerate',document,head:'stock'});
  assert.equal(run.ok,true);assert.equal(run.results.length,1);assert.equal(run.finalId,'stock');
});
