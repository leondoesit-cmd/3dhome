import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepPrimitive,extractBrepTopology,domeBrep,shapeMassProperties,disposeBrep,validateBrepForExport} from '../js/cad_kernel.js';

test('circular face dome adds an exact spherical cap along the outward normal',async()=>{
 for(const axis of ['x','y','z']){
  const r=.3302,h=.254,body=await makeBrepPrimitive({type:'cylinder',axis,r,h:1.27});
  let result;
  try{
   const topology=extractBrepTopology(body,{ownerFeatureId:'base'}).topology;
   const face=topology.find(t=>t.kind==='face' && t.descriptor?.surface==='plane' && t.descriptor.normal[axis]>.9);
   assert.ok(face,JSON.stringify(topology));
   result=await domeBrep(body,h,{facePersistentIds:[face.persistentId]});
   const mass=await shapeMassProperties(result),expected=Math.PI*r*r*1.27+Math.PI*h*(3*r*r+h*h)/6;
   assert.ok(Math.abs(mass.volume-expected)<1e-7,JSON.stringify({mass,expected}));
   await validateBrepForExport(result);
   await assert.rejects(domeBrep(body,0,{facePersistentIds:[face.persistentId]}),/positive/);
  }finally{if(result)disposeBrep(result);disposeBrep(body);}
 }
});
test('dome rejects rectangular faces instead of inventing a circular base',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:2,h:2,d:2});
 try{const faces=extractBrepTopology(body,{ownerFeatureId:'base'}).topology.filter(t=>t.kind==='face');await assert.rejects(domeBrep(body,.2,{facePersistentIds:[faces[0].persistentId]}),/circular face/);}finally{disposeBrep(body);}
});

test('dome survives canonical history compilation and height edits',async()=>{
 const {compileKernelFeatureTree}=await import('../js/core/kernel_feature_adapter.js');
 const {regenerateFeatures,releaseRegeneration}=await import('../js/cad_feature_tree.js');
 const {createFeatureDefinition}=await import('../js/core/parametric_document.js');
 const base={id:'base',type:'cylinder',params:{r:.3302,h:1.27,axis:'z'}};
 const seed=await regenerateFeatures({features:[base]});
 try{
  const face=seed.results.get('base').topology.find(t=>t.kind==='face' && t.descriptor?.surface==='plane' && t.descriptor.normal.z>.9);
  for(const height of [.254,.15]){
   const def={features:[base],sketches:[]};
   createFeatureDefinition(def,'dome',{inputs:['base'],references:{features:['base'],topology:[{...face,featureId:'base'}]},params:{height}});
   const run=await regenerateFeatures(compileKernelFeatureTree(def));
   try{assert.equal(run.ok,true,JSON.stringify(run.issues));const result=run.results.get(def.features.at(-1).id);assert.ok(result?.shape);assert.ok(Math.abs((await shapeMassProperties(result)).bounds.max.z-(1.27+height))<1e-5);}finally{releaseRegeneration(run);}
  }
 }finally{releaseRegeneration(seed);}
});

test('cut scope uses the supplied history body and leaves it owned by the caller',async()=>{
 const {exactCutIntersection}=await import('../js/modeler_part_geometry.js');
 const body=await makeBrepPrimitive({type:'cylinder',axis:'z',r:.4,h:1});
 let capped;
 try{
  const face=extractBrepTopology(body,{ownerFeatureId:'base'}).topology.find(t=>t.kind==='face' && t.descriptor?.normal?.z>.9);
  capped=await domeBrep(body,.2,{facePersistentIds:[face.persistentId]});
  const stale={kind:'cyl',axis:'z',r:.4,h:1,x:0,y:0,z:0,exactOperations:[{type:'dome',amount:.2,targets:[]}]};
  const check=await exactCutIntersection(stale,{axis:'z',from:1.02,to:1.3,loop:[{u:-.1,v:-.1},{u:.1,v:-.1},{u:.1,v:.1},{u:-.1,v:.1}]},capped);
  assert.equal(check.intersects,true);
  assert.ok((await shapeMassProperties(capped)).volume>Math.PI*.16);
 }finally{if(capped)disposeBrep(capped);disposeBrep(body);}
});
