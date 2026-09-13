import test from 'node:test';
import assert from 'node:assert/strict';
import {circularSweepProfile} from '../js/core/swept_sources.js';
import {featureDefaults,validateFeatureDefinition} from '../js/core/feature_catalog.js';
import {makeBrepSweep,shapeMassProperties,validateBrepForExport,disposeBrep} from '../js/cad_kernel.js';
test('ebook O-ring sweeps an exact round profile along a circular sketch',async()=>{
 for(const plane of ['front','top','side']){
  const sketch={id:'path',plane,points:[{id:'c',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'c',r:5.5245}],constraints:[]};
  const params=circularSweepProfile(sketch,.3175),body=await makeBrepSweep(params);
  try{const mass=await shapeMassProperties(body);assert.ok(Math.abs(mass.volume-2*Math.PI**2*5.5245*(.3175/2)**2)<1e-5,JSON.stringify(mass));await validateBrepForExport(body);}
  finally{disposeBrep(body);}
 }
});

test('circular sweep history derives both path edits and profile diameter edits',async()=>{
 const {compileKernelFeatureTree}=await import('../js/core/kernel_feature_adapter.js');
 const {regenerateFeatures,releaseRegeneration}=await import('../js/cad_feature_tree.js');
 for(const [radius,diameter] of [[5.5245,.3175],[4,.2]]){
  const document={sketches:[{id:'path',plane:'front',points:[{id:'c',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'c',r:radius}],constraints:[{id:'fixed',type:'fixed',point:'c',x:0,y:0},{id:'diameter',type:'diameter',entity:'circle',value:radius*2}]}],features:[{id:'sweep',type:'sweep',references:{sketches:['path']},params:{profileMode:'circular',profileDiameter:diameter,sketchSources:{kind:'circular-sweep',diameter:.3175,path:{sketchId:'path',entityIds:['circle']}}}}]};
  const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(Math.abs((await shapeMassProperties(run.results.get('sweep'))).volume-2*Math.PI**2*radius*(diameter/2)**2)<1e-5);}finally{releaseRegeneration(run);}
 }
});

test('helix sweep accepts one profile sketch plus a helix reference',()=>{
 const params={...featureDefaults('sweep'),profileMode:'sketch',sweepPathMode:'helix',helixId:'helix-1',helix:{radius:2,pitch:1,turns:3}};
 const issues=validateFeatureDefinition({id:'sweep-helix',type:'sweep',params,references:{sketches:['profile'],references:['helix-1']}});
 assert.deepEqual(issues,[]);
 const ordinary=validateFeatureDefinition({id:'sweep-sketches',type:'sweep',params:{...featureDefaults('sweep'),profileMode:'sketch'},references:{sketches:['profile']}});
 assert.equal(ordinary.some(issue=>issue.code==='missing-feature-input'&&issue.role==='sketches'),true);
});
