import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';

test('exact face refresh returns current native descriptors without downstream replay or BREP transfer',async()=>{
  const execute=createCadWorkerExecutor();
  const document={features:[{id:'stock',type:'box',params:{w:2,h:3,d:4}},{id:'later',type:'unsupported',inputs:['stock'],params:{}}]};
  const progress=[];
  const report=await execute({kind:'topology',document,head:'stock'},event=>progress.push(event));
  assert.equal(report.topology.filter(entry=>entry.kind==='face').length,6);
  assert.ok(report.topology.every(entry=>entry.persistentId));
  assert.equal(report.bytes,undefined);
  assert.equal(progress.some(event=>event.name==='unsupported'),false);
  assert.deepEqual(structuredClone(report),report);
  const changed=await execute({kind:'topology',document:{features:[{...document.features[0],params:{w:7,h:3,d:4}}]},head:'stock'});
  assert.notDeepEqual(changed.topology.map(entry=>entry.descriptor),report.topology.map(entry=>entry.descriptor));
});
