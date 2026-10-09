import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSketchExtrusion,regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {createTopologyReference} from '../js/core/topology.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {shapeMassProperties,brepContainsPoint,validateBrepForExport} from '../js/cad_kernel.js';

function fixture(){
 const sketch={id:'guides',plane:'top',points:[{id:'a',x:.375,y:1},{id:'b',x:2.2,y:1},{id:'c',x:.375,y:-1},{id:'d',x:2.2,y:-1}],entities:[{id:'upper',type:'line',a:'a',b:'b'},{id:'lower',type:'line',a:'c',b:'d'}],constraints:[]};
 sketch.constraints=sketch.points.map(p=>({id:`fix-${p.id}`,type:'fixed',point:p.id,x:p.x,y:p.y}));
 const params={sketchId:'guides',profileEntityIds:['upper'],regionProfileEntityIds:[['lower']],thinFeature:true,thickness:.38,thinMode:'forward',thinRegionModes:['reverse'],axis:'y',from:.5,to:4,endCondition:'blind'};
 return {sketches:[sketch],features:[{id:'walls',type:'extrude',inputs:[],params}]};
}

test('independent thin chains retain selected sides, regenerate edits, and reject missing chains without mutation',async()=>{
 const def=fixture(),params=def.features[0].params,before=structuredClone(def);
 const resolved=resolveSketchExtrusion(def,params);
 assert.equal(resolved.regions.length,1);
 assert.ok(resolved.points.every(p=>p.v>=1 && p.v<=1.38));
 assert.ok(resolved.regions[0].points.every(p=>p.v<=-1 && p.v>=-1.38));
 assert.deepEqual(def,before);
 const uniform=resolveSketchExtrusion(def,{...params,thinRegionModes:undefined});
 assert.ok(uniform.regions[0].points.every(p=>p.v>=-1 && p.v<=-.62));
 assert.throws(()=>resolveSketchExtrusion(def,{...params,regionProfileEntityIds:[['missing']]}),/connected/);
 assert.deepEqual(def,before);
 for(const width of [.38,.4]){
  params.thickness=width;
  const run=await regenerateFeatures(def);
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(Math.abs((await shapeMassProperties(run.finalShape)).volume-2*(2.2-.375)*width*3.5)<1e-8);}
  finally{releaseRegeneration(run);}
 }
});

test('multi-chain Thin Extrude Cut removes both bands and follows an additional chain edit',async()=>{
 const def=fixture(),cut=def.features[0];
 cut.type='extrudeCut';cut.inputs=['base'];cut.references={features:['base']};cut.params.operation='subtract';
 def.features.unshift({id:'base',type:'box',inputs:[],params:{x:0,y:0,z:-2,w:3,h:5,d:4}});
 for(const length of [2.2,2.4]){
  def.sketches[0].points.find(p=>p.id==='d').x=length;
  def.sketches[0].constraints.find(c=>c.point==='d').x=length;
  const compiled=compileKernelFeatureTree(def);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
   assert.equal(run.ok,true,JSON.stringify(run.issues));
   const removed=((2.2-.375)+(length-.375))*.38*3.5;
   assert.ok(Math.abs((await shapeMassProperties(run.finalShape)).volume-(60-removed))<1e-8);
   assert.equal(brepContainsPoint(run.finalShape,{x:1,y:1,z:1.1}),false);
   assert.equal(brepContainsPoint(run.finalShape,{x:1,y:1,z:-1.1}),false);
   assert.equal(brepContainsPoint(run.finalShape,{x:1,y:1,z:0}),true);
  }finally{releaseRegeneration(run);}
 }
});

test('source inclined Up To Face clips single and two thin guides where target passes behind start',async()=>{
 const nx=Math.sqrt(3)/2,ny=.5,cx=.95-.26*nx,cy=2.66506351-.26*ny;
 const height=x=>cy+nx/ny*(cx-x);
 const host={id:'plate',type:'extrude',inputs:[],params:{axis:'z',from:-2,to:2,endCondition:'blind',points:[{u:0,v:height(0)},{u:2.4,v:height(2.4)},{u:2.4,v:height(2.4)+.2},{u:0,v:height(0)+.2}]}};
 const first=await regenerateFeatures({features:[host]});
 try{
  assert.equal(first.ok,true,JSON.stringify(first.issues));
  const face=first.finalShape.topology.find(f=>f.kind==='face' && f.descriptor.surface==='plane' && Math.abs(Math.abs(f.descriptor.normal?.x||0)-nx)<1e-6 && Math.abs(f.descriptor.origin.y-height(f.descriptor.origin.x))<1e-6);
  assert.ok(face,'source back surface');
  for(const start of [.5,0])for(const count of [1,2]){
   const def=fixture(),tool=def.features[0];
   tool.inputs=['plate'];tool.params.targetFeatureId='plate';tool.params.endCondition='up-to-face';
   tool.params.from=start;
   tool.params.endFace=createTopologyReference(face.ownerFeatureId,face.kind,face.persistentId,face.descriptor);
   if(count===1)tool.params.regionProfileEntityIds=[];
   def.features.unshift(host);
   const run=await regenerateFeatures(def);
   try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const xEnd=cx+(cy-start)*ny/nx;
    const expected=count*.38*(xEnd-.375)*(height(.375)-start)/2;
    assert.ok(Math.abs((await shapeMassProperties(run.finalShape)).volume-expected)<1e-7);
    assert.equal(brepContainsPoint(run.finalShape,{x:.5,y:.6,z:1.1}),true);
    assert.equal(brepContainsPoint(run.finalShape,{x:2.1,y:.6,z:1.1}),false,'portion behind the sketch is absent');
    assert.equal(brepContainsPoint(run.finalShape,{x:.5,y:height(.5)+.1,z:1.1}),false,'no material beyond inclined termination');
    if(count===2)assert.equal(brepContainsPoint(run.finalShape,{x:.5,y:.6,z:-1.1}),true);
   }finally{releaseRegeneration(run);}
   def.features.push({id:'base',type:'box',inputs:[],params:{x:0,y:0,z:-2,w:2.4,h:.5,d:4}},
    {id:'host',type:'union',inputs:['base','plate'],params:{}},
    {id:'joined',type:'union',inputs:['host','walls'],params:{}});
   const joined=await regenerateFeatures(def);
   try{
    assert.equal(joined.ok,true,JSON.stringify(joined.issues));
    const proof=await validateBrepForExport(joined.finalShape);
    assert.equal(proof.valid,true,JSON.stringify(proof));
    assert.equal(proof.solidCount,1,'guides contact both base and inclined plate');
   }finally{releaseRegeneration(joined);}
  }
 }finally{releaseRegeneration(first);}
});
