import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeToMeshData,shapeMassProperties} from '../js/cad_kernel.js';

// Browser-authored BULB: base, merged Bezier cap, thin cut, then Dome.
// Its retained display and temporary save/preview builds coexist.
test('Bezier BULB survives disposal of retained and temporary history builds',async()=>{
 const document=JSON.parse(readFileSync(new URL('./fixtures/bulb-bezier-history.json',import.meta.url),'utf8'));
 async function build(){
  const compiled=compileKernelFeatureTree(document);
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
   assert.equal(run.ok,true,JSON.stringify(run.issues));
   const mesh=await shapeToMeshData(run.finalShape,{deflection:.28,angle:.18});
   assert.ok(mesh.positions.length>0&&mesh.positions.every(Number.isFinite));
   const mass=await shapeMassProperties(run.finalShape);
   assert.ok(Math.abs(mass.volume-2.52875624059722)<1e-7);
   assert.ok(Math.abs(mass.bounds.min.z+1.524)<1e-6);
   return run;
  }catch(error){releaseRegeneration(run);throw error;}
 }
 let retained;
 try{
  retained=await build();
  for(let i=0;i<3;i++){
   const temporary=await build();releaseRegeneration(temporary);
   releaseRegeneration(retained);retained=null;
   retained=await build();
  }
 }finally{if(retained)releaseRegeneration(retained);}
});
