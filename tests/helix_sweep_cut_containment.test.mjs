import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {brepContainsPoint,shapeMassProperties,validateBrepForExport,booleanBrep,shapeSolidCount,exportStep,importStep,disposeBrep} from '../js/cad_kernel.js';
const actual=new URL('../artifacts/planchard/HOOK-custom-helix-cut-qualified-browser-2026-10-10.mforge',import.meta.url);
const outside=[{x:-.22868072875185402,y:.2091891407941827,z:-.0043918852993386605},{x:-.2162403445400467,y:.365760279907564,z:.02361389812848663},{x:-.21265826998392098,y:.44085687673917934,z:.04565680709709542},{x:-.191235901821436,y:.1926166866865358,z:.1036409554420729}];
test('actual helical cut excludes exterior cutter boundary and retains stock envelope through native STEP and edits',async()=>{
 const protectedBytes=readFileSync(actual),document=JSON.parse(protectedBytes).mainModel,volumes=[];
 for(const edited of [false,true]){
  const d=structuredClone(document);
  if(edited){d.sketches.find(x=>x.id==='sk_2tzxl').entities[0].r=.03;d.sketches.find(x=>x.id==='sk_2tzxl').constraints.find(x=>x.type==='diameter').value=.06;d.features.find(x=>x.type==='helix').params.pitch=.10;}
  const compiled=compileKernelFeatureTree(d);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features}),owned=[];
  try{
   assert.equal(run.ok,true,JSON.stringify(run.issues));const shape=run.finalShape,stock=run.results.get('feature_mukhddsw_2'),mass=await shapeMassProperties(shape),stockMass=await shapeMassProperties(stock);
   const valid=await validateBrepForExport(shape);assert.equal(valid.solidCount,1);assert.ok(mass.volume<stockMass.volume-.001,'a genuine groove removes material');
   assert.ok(Math.abs(mass.bounds.min.x-stockMass.bounds.min.x)<1e-5);assert.ok(Math.abs(mass.bounds.max.x-stockMass.bounds.max.x)<1e-5,'cut cannot inherit the exterior cutter width');
   for(const p of outside)for(const delta of [0,-.005,-.02]){const q={...p,x:p.x+delta};assert.equal(brepContainsPoint(stock,q,1e-7),false);assert.equal(brepContainsPoint(shape,q,1e-7),false,'exterior cutter skin is not part of the cut solid');}
   const extra=await booleanBrep('subtract',shape,stock);owned.push(extra);assert.equal(await shapeSolidCount(extra),0);
   if(!edited){const step=await exportStep(shape),imported=await importStep(step,'contained-cut.step');owned.push(imported);assert.equal((await validateBrepForExport(imported)).solidCount,1);for(const p of outside)assert.equal(brepContainsPoint(imported,p,1e-7),false);for(const [a,b] of [[shape,imported],[imported,shape]]){const difference=await booleanBrep('subtract',a,b);owned.push(difference);assert.equal(await shapeSolidCount(difference),0);}}
   volumes.push(mass.volume);
  }finally{owned.forEach(disposeBrep);releaseRegeneration(run);}
 }
 assert.ok(Math.abs(volumes[0]-volumes[1])>1e-4,'real profile/pitch edits change the native groove');assert.ok(protectedBytes.equals(readFileSync(actual)),'actual browser fixture stays untouched');
});
