import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=modelerSource();
const functionSource=source.slice(source.indexOf('function queueKernelBody(p)'),source.indexOf('function addKernelBodyPart('));
test('canonical bare Loft previews use authoritative worker history rather than main-thread recipe builds',()=>{
  const part={kind:'kernel',kernel:{type:'loft'},featureId:'loft'};
  let queued=null,legacyCalls=0;
  const run=new Function('isKernelBody','isCanonicalAuthoring','E','queueExactMesh','partNeedsExactMesh','kernelBodyMeshData','exactPreviewWasCancelled',functionSource+';return queueKernelBody;')(
    ()=>true,()=>true,{def:{features:[{id:'loft',type:'loft'}]}},value=>{queued=value;},()=>false,()=>{legacyCalls++;},()=>false);
  run(part);assert.equal(queued,part);assert.equal(legacyCalls,0);
});
