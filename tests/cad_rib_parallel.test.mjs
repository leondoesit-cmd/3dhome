import test from 'node:test';
import assert from 'node:assert/strict';
import { ribGrowthVector, ribSketchReady, ribWebLoop } from '../js/core/rib_profile.js';
import { analyzeSketchChains } from '../js/sketch_profiles.js';
import { featureDefaults } from '../js/core/feature_catalog.js';
import { readFeatureParameterForm } from '../js/modeler_feature_form.js';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { regenerateFeatures, releaseRegeneration } from '../js/cad_feature_tree.js';
import { booleanBrep, disposeBrep, loadCadKernel, makeBrepPrimitive, ribBrep, validateBrepForExport } from '../js/cad_kernel.js';

const inch=2.54;
const points=[{u:.55*inch,v:.5*inch},{u:2.25*inch,v:2*inch},{u:3.25*inch,v:2*inch}];
const recipe={...featureDefaults('rib'),orientation:'parallel',growthDirection:'negative-v',axis:'x',from:1.81*inch,thickness:.38*inch,points};
function volume(brep){const oc=brep.oc,props=new oc.GProp_GProps_1();try{oc.BRepGProp.VolumeProperties_1(brep.shape,props,false,false,false);return props.Mass();}finally{props.delete();}}
function bounds(brep){const oc=brep.oc,box=new oc.Bnd_Box_1();try{oc.BRepBndLib.AddOptimal(brep.shape,box,false,true);const min=box.CornerMin(),max=box.CornerMax();try{return {x0:min.X(),y0:min.Y(),z0:min.Z(),x1:max.X(),y1:max.Y(),z1:max.Z()};}finally{min.delete();max.delete();}}finally{box.delete();}}
function solidCount(brep){const oc=brep.oc,e=new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);let count=0;try{while(e.More()){count++;e.Next();}return count;}finally{e.delete();}}
async function stock(){
  const owned=[];
  try{
    const base=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:4*inch,h:.5*inch,d:5.5*inch});owned.push(base);
    const back=await makeBrepPrimitive({type:'box',x:0,y:.5*inch,z:3.25*inch,w:4*inch,h:1.5*inch,d:2.25*inch});owned.push(back);
    const joined=await booleanBrep('union',base,back);owned.push(joined);
    const cavity=await makeBrepPrimitive({type:'box',x:.25*inch,y:.5*inch,z:3.75*inch,w:3.5*inch,h:1.25*inch,d:1.75*inch});owned.push(cavity);
    return await booleanBrep('subtract',joined,cavity);
  }finally{owned.forEach(disposeBrep);}
}

test('parallel web closes the open upper profile down to its stopping plane, without widening it',()=>{
  const loop=ribWebLoop([{u:.55,v:.5},{u:2.25,v:2},{u:3.25,v:2}],ribGrowthVector('negative-v'),{u:0,v:.5,normal:{u:0,v:1}});
  assert.deepEqual(loop,[{u:.55,v:.5},{u:2.25,v:2},{u:3.25,v:2},{u:3.25,v:.5}]);
  assert.throws(()=>ribWebLoop([{u:0,v:2},{u:3,v:2}],ribGrowthVector('positive-v'),{u:0,v:.5,normal:{u:0,v:1}}),/runs away/);
});

test('switching the form to parallel Rib removes incompatible blind extent and preserves draft settings',()=>{
  const controls=[{field:{key:'orientation',type:'select'},input:{value:'parallel'}},{field:{key:'growthDirection',type:'select'},input:{value:'negative-v'}}];
  const result=readFeatureParameterForm(controls,{...recipe,orientation:'perpendicular',extent:'blind',draftAngle:10});
  assert.equal(result.params.extent,'up-to-body');assert.equal(result.params.draftAngle,10);assert.equal(result.valid,true);
});

test('a consumed open Rib sketch is ready, but unconsumed or broken/branched geometry remains a warning',()=>{
  const sketch={id:'rib-profile',points:[{id:'a',x:0,y:0},{id:'b',x:2,y:2},{id:'c',x:4,y:2}],entities:[{id:'ab',type:'line',a:'a',b:'b'},{id:'bc',type:'line',a:'b',b:'c'}]};
  const feature={type:'rib',references:{sketches:['rib-profile']},params:{chainEntityIds:['ab','bc']}};
  const ready=features=>ribSketchReady(sketch,features,analyzeSketchChains(sketch).chains);
  assert.equal(ready([feature]),true);assert.equal(ready([]),false);assert.equal(ready([{...feature,type:'extrude'}]),false);
  sketch.points.push({id:'d',x:1,y:-1});sketch.entities.push({id:'branch',type:'line',a:'b',b:'d'});
  assert.equal(ready([feature]),false,'a real branch is never hidden by prior Rib consumption');
  sketch.entities.pop();sketch.entities.pop();
  assert.equal(ready([feature]),false,'losing a consumed path entity remains broken');
});

test('Exercise 7.5 side-plane rib fills to the actual base and adds exactly a .38 inch symmetric web',async()=>{
  await loadCadKernel();const body=await stock();let rib=null,added=null;
  try{
    assert.ok(Math.abs(volume(body)-276.01960925)<1e-5);
    rib=await ribBrep(body,recipe);
    assert.equal(solidCount(rib),1,'web and cavity stock are fused into one solid');
    assert.ok(Math.abs(volume(rib)-volume(body)-1.0545*inch**3)<1e-5,'triangular ramp plus flat crown × .38 thickness');
    added=await booleanBrep('subtract',rib,body);const b=bounds(added);
    for(const [key,want] of Object.entries({x0:1.62*inch,x1:2*inch,y0:.5*inch,y1:2*inch,z0:.55*inch,z1:3.25*inch}))assert.ok(Math.abs(b[key]-want)<1e-5,key+' remains book web extent');
    const validation=await validateBrepForExport(rib);assert.equal(validation.valid,true,JSON.stringify(validation));
  }finally{disposeBrep(body);if(rib)disposeBrep(rib);if(added)disposeBrep(added);}
});

test('parallel rib handles an explicit local frame and refuses growth away from the existing body',async()=>{
  const body=await stock();let rib=null;
  try{
    const frame={origin:{x:1.81*inch,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0},normal:{x:-1,y:0,z:0}};
    rib=await ribBrep(body,{...recipe,axis:'frame',from:0,frame});
    assert.ok(Math.abs(volume(rib)-volume(body)-1.0545*inch**3)<1e-5);
    await assert.rejects(ribBrep(body,{...recipe,growthDirection:'positive-v'}),/does not reach/);

  }finally{disposeBrep(body);if(rib)disposeBrep(rib);}
});

test('parallel Rib over a stepped floor grows each stretch of the profile down to its own stopping face',async()=>{
  const base=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:20,h:2,d:20});
  const step=await makeBrepPrimitive({type:'box',x:0,y:2,z:10,w:20,h:2,d:10});let body=null,rib=null;
  try{
    body=await booleanBrep('union',base,step);
    rib=await ribBrep(body,{...recipe,from:10,thickness:2,points:[{u:2,v:6},{u:18,v:6}]});
    // z 2..10 stands 4 above the low floor (y 2), z 10..18 stands 2 above the step (y 4), 2 thick.
    assert.ok(Math.abs(volume(rib)-volume(body)-2*(8*4+8*2))<1e-5,'added '+(volume(rib)-volume(body)));
    assert.equal(solidCount(rib),1);
    assert.equal((await validateBrepForExport(rib)).valid,true);
  }finally{disposeBrep(base);disposeBrep(step);if(body)disposeBrep(body);if(rib)disposeBrep(rib);}
});

test('parallel Rib over a floor and a cylindrical boss fills up to both and never below the floor',async()=>{
  const floor=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:20,h:2,d:20});
  const boss=await makeBrepPrimitive({type:'cylinder',axis:'x',x:0,y:2,z:15,r:2,h:20});let body=null,rib=null;
  try{
    body=await booleanBrep('union',floor,boss);
    rib=await ribBrep(body,{...recipe,from:10,thickness:2,points:[{u:2,v:6},{u:18,v:6}]});
    // 16 long, 4 above the floor, less the half disc of the boss (r 2) above y 2, 2 thick.
    const expected=2*(16*4-Math.PI*4/2);
    assert.ok(Math.abs(volume(rib)-volume(body)-expected)<1e-3,'added '+(volume(rib)-volume(body))+' expected '+expected);
    assert.equal(solidCount(rib),1);
    assert.equal((await validateBrepForExport(rib)).valid,true);
  }finally{disposeBrep(floor);disposeBrep(boss);if(body)disposeBrep(body);if(rib)disposeBrep(rib);}
});

test('compiled Rib retains its sketch link and rebuilds changed open-profile points instead of stored snapshot',async()=>{
  const def={sketches:[{id:'profile',plane:'side',referenceId:'plane:right',offset:5,points:[{id:'a',x:1,y:2,fixed:true},{id:'b',x:9,y:4,fixed:true}],entities:[{id:'line',type:'line',a:'a',b:'b'}],constraints:[]}],features:[
    {id:'base',type:'box',name:'Plate',inputs:[],references:{},params:{x:0,y:0,z:0,w:10,h:2,d:10}},
    {id:'web',type:'rib',name:'Web',inputs:['base'],references:{features:['base'],sketches:['profile']},params:{...recipe,thickness:1,from:99,chainEntityIds:['line'],points:[{u:0,v:99},{u:1,v:99}]}},
  ]};
  const compiled=compileKernelFeatureTree(def);assert.equal(compiled.features.find(f=>f.id==='web').params.sketchId,'profile');
  let run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(Math.abs(volume(run.results.get('web'))-208)<1e-5);}finally{releaseRegeneration(run);}
  def.sketches[0].points[1].y=5;
  const changed=compileKernelFeatureTree(def);
  run=await regenerateFeatures({...changed.document,features:changed.features});
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(Math.abs(volume(run.results.get('web'))-212)<1e-5,'driving profile height changed downstream web volume');}finally{releaseRegeneration(run);}
});

test('parallel Rib outward one-degree draft creates a wider native web',async()=>{
 const body=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:20,h:2,d:20});let plain=null,drafted=null;
 try{
 const p={...recipe,from:10,thickness:2,points:[{u:2,v:6},{u:18,v:6}]};
 plain=await ribBrep(body,p);drafted=await ribBrep(body,{...p,draftAngle:1,draftOutward:true});
 const added=volume(drafted)-volume(body),expected=16*(2*4+Math.tan(Math.PI/180)*16);
 assert.ok(Math.abs(added-expected)<1e-4,'drafted added volume '+added+' expected '+expected);
 assert.ok(volume(drafted)>volume(plain));assert.equal(solidCount(drafted),1);
 assert.equal((await validateBrepForExport(drafted)).valid,true);
 }finally{disposeBrep(body);if(plain)disposeBrep(plain);if(drafted)disposeBrep(drafted);}
});

test('parallel Rib drafts curved multi-surface stops and preserves one-sided neutral wall',async()=>{
 const floor=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:20,h:2,d:20}),boss=await makeBrepPrimitive({type:'cylinder',axis:'x',x:0,y:2,z:15,r:2,h:20});let body=null,rib=null;
 try{
 body=await booleanBrep('union',floor,boss);
 rib=await ribBrep(body,{...recipe,from:10,side:'left',thickness:2,points:[{u:2,v:6},{u:18,v:6}],draftAngle:1,draftOutward:true});
 assert.equal(solidCount(rib),1);assert.equal((await validateBrepForExport(rib)).valid,true);
 assert.ok(volume(rib)>volume(body)+2*(16*4-Math.PI*4/2));
 }finally{disposeBrep(floor);disposeBrep(boss);if(body)disposeBrep(body);if(rib)disposeBrep(rib);}
});

test('parallel draft follows custom local frame and rotates growth with that frame',async()=>{
 const body=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:20,h:2,d:20});let rib=null;
 try{
 const frame={origin:{x:10,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0},normal:{x:-1,y:0,z:0}};
 rib=await ribBrep(body,{...recipe,axis:'frame',frame,from:0,thickness:2,points:[{u:2,v:6},{u:18,v:6}],draftAngle:1,draftOutward:true});
 const expected=16*(2*4+Math.tan(Math.PI/180)*16);
 assert.ok(Math.abs(volume(rib)-volume(body)-expected)<1e-4);assert.equal(solidCount(rib),1);
 assert.equal((await validateBrepForExport(rib)).valid,true);
 }finally{disposeBrep(body);if(rib)disposeBrep(rib);}
});
