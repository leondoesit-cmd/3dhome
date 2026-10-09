import test from 'node:test';
import assert from 'node:assert/strict';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {chamferBrep,disposeBrep,extractBrepTopology,shapeMassProperties,validateBrepForExport,brepContainsPoint} from '../js/cad_kernel.js';

const inch=v=>v*2.54,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
async function fixture(reverse=false){
 const run=await regenerateFeatures({features:[
  {id:'blank',type:'cylinder',params:{axis:'z',x:0,y:0,z:0,r:inch(2),h:inch(2.6)}},
  {id:'bore',type:'cylinder',params:{axis:'z',x:0,y:0,z:0,r:inch(.375),h:inch(2.6)}},
  {id:'through',type:'subtract',inputs:['blank','bore'],params:{}},
  {id:'recess-tool',type:'cylinder',params:{axis:'z',x:0,y:0,z:inch(reverse?2.6:2.5),r:inch(.75),h:inch(reverse?-.1:.1)}},
  {id:'recess',type:'subtract',inputs:['through','recess-tool'],params:{}},
 ]});
 assert.equal(run.ok,true,JSON.stringify(run.issues));
 const edge=run.finalShape.topology.find(t=>t.kind==='edge'&&t.descriptor.curve==='circle'&&Math.abs(t.descriptor.radius-inch(.75))<1e-8&&Math.abs(t.descriptor.origin.z-inch(2.5))<1e-8);
 assert.ok(edge);return {run,edge};
}

test('exact full-height concave circular Chamfer produces the source45cone in both modes and flips',async()=>{
 const {run,edge}=await fixture(),before=await shapeMassProperties(run.finalShape);
 try{
  for(const mode of ['equal-distance','distance-angle'])for(const flip of [false,true]){
   let result;
   try{
    result=await chamferBrep(run.finalShape,inch(.1),{mode,angle:45,flip,edgePersistentIds:[edge.persistentId]});
    extractBrepTopology(result,{ownerFeatureId:'bevel'});
    const validation=await validateBrepForExport(result);assert.equal(validation.valid,true);assert.equal(validation.solidCount,1);
    const cone=result.topology.find(t=>t.kind==='face'&&t.descriptor.surface==='cone').descriptor;
    near(Math.abs(cone.angle),Math.PI/4);
    const circles=result.topology.filter(t=>t.kind==='edge'&&t.descriptor.curve==='circle');
    assert.ok(circles.some(t=>Math.abs(t.descriptor.radius-inch(.65))<1e-8&&Math.abs(t.descriptor.origin.z-inch(2.5))<1e-8));
    assert.ok(circles.some(t=>Math.abs(t.descriptor.radius-inch(.75))<1e-8&&Math.abs(t.descriptor.origin.z-inch(2.6))<1e-8));
    const after=await shapeMassProperties(result);
    near(after.volume-before.volume,Math.PI*inch(.1)*(inch(.75)*inch(.1)-inch(.1)**2/3));
    near(after.bounds.min.z,0);near(after.bounds.max.z,inch(2.6));
    assert.equal(brepContainsPoint(result,{x:inch(.7),y:0,z:inch(2.51)}),true);
    assert.equal(brepContainsPoint(result,{x:inch(.7),y:0,z:inch(2.59)}),false);
    assert.equal(brepContainsPoint(result,{x:inch(.3),y:0,z:inch(2.55)}),false);
    near((await shapeMassProperties(run.finalShape)).volume,before.volume);
   }finally{if(result)disposeBrep(result);}
  }
 }finally{releaseRegeneration(run);}
});

test('nearby partial chamfer preserves its real distance and cylinder remainder',async()=>{
 const {run,edge}=await fixture();let result;
 try{
  result=await chamferBrep(run.finalShape,inch(.099),{mode:'distance-angle',angle:45,edgePersistentIds:[edge.persistentId]});
  extractBrepTopology(result,{ownerFeatureId:'partial'});
  assert.ok(result.topology.some(t=>t.kind==='edge'&&t.descriptor.curve==='circle'&&Math.abs(t.descriptor.radius-inch(.651))<1e-8&&Math.abs(t.descriptor.origin.z-inch(2.5))<1e-8));
  assert.ok(result.topology.some(t=>t.kind==='face'&&t.descriptor.surface==='cylinder'&&Math.abs(t.descriptor.radius-inch(.75))<1e-8));
 }finally{if(result)disposeBrep(result);releaseRegeneration(run);}
});

test('a reverse-cut cylinder binds the same geometric lower rim and exact cone',async()=>{
 const {run,edge}=await fixture(true);let result;
 try{
  result=await chamferBrep(run.finalShape,inch(.1),{mode:'distance-angle',angle:45,edgePersistentIds:[edge.persistentId]});
  extractBrepTopology(result,{ownerFeatureId:'reverse-bevel'});
  const cone=result.topology.find(t=>t.kind==='face'&&t.descriptor.surface==='cone').descriptor;
  near(cone.referenceOrigin.z,inch(2.5));near(cone.radius,inch(.65));
  near(cone.axis.z,1);near(cone.axisRange[1],inch(.1));
  assert.equal((await validateBrepForExport(result)).solidCount,1);
 }finally{if(result)disposeBrep(result);releaseRegeneration(run);}
});

test('missing and over-height selections do not activate limiting-corner repair',async()=>{
 const {run,edge}=await fixture();
 try{
  await assert.rejects(chamferBrep(run.finalShape,inch(.1),{edgePersistentIds:['missing']}),/no resolved edges/);
  await assert.rejects(chamferBrep(run.finalShape,inch(.101),{mode:'distance-angle',angle:45,edgePersistentIds:[edge.persistentId]}),/chamfer failed/);
  await assert.rejects(chamferBrep(run.finalShape,inch(.1),{mode:'distance-angle',angle:60,edgePersistentIds:[edge.persistentId]}),/chamfer failed/);
 }finally{releaseRegeneration(run);}
});
