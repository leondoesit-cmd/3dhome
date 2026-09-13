import test from 'node:test';
import assert from 'node:assert/strict';
import { toolFeatureRecipe,translateToolRecord } from '../js/core/tool_recipe.js';
import { createPartDocument,createFeatureDefinition,updateFeatureDefinition } from '../js/core/parametric_document.js';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { regenerateFeatures,releaseRegeneration } from '../js/cad_feature_tree.js';
import { exportStep,importStep,disposeBrep } from '../js/cad_kernel.js';
import { resolveSketchSources,sweepSourceRecord } from '../js/core/swept_sources.js';
import { resolveProfilePoints } from '../js/sketch_solver.js';
function volume(body){
 const props=new body.oc.GProp_GProps_1();
 try{body.oc.BRepGProp.VolumeProperties_1(body.shape,props,false,false,false);return Math.abs(props.Mass());}finally{props.delete();}
}
async function roundtrip(features){
 const run=await regenerateFeatures({features}), imported=[];
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const expected=volume(run.finalShape);assert.ok(expected>0);
  const bytes=await exportStep(run.finalShape,'recipe-roundtrip.step');
  assert.ok(bytes.length>100);
  const copy=await importStep(bytes,'recipe-roundtrip-import.step');imported.push(copy);
  const actual=volume(copy);assert.ok(Math.abs(actual-expected)<Math.max(1e-6,expected*1e-6),`${actual} versus ${expected}`);
  return actual;
 }finally{imported.forEach(disposeBrep);releaseRegeneration(run);}
}
test('saved Toolbox edits survive compile, regeneration, STEP export and reimport',async()=>{
 let doc=createPartDocument({name:'Export bolt'});
 const feature=createFeatureDefinition(doc,'toolbox',{params:{kind:'shcs',sizeKey:'M8',lengthMm:30}});
 const first=compileKernelFeatureTree(doc);assert.equal(first.ok,true);
 const before=await roundtrip(first.features);
 updateFeatureDefinition(doc,feature.id,{params:{lengthMm:50}});
 doc=JSON.parse(JSON.stringify(doc));
 assert.equal(doc.features.find(f=>f.id===feature.id).type,'toolbox');
 const edited=compileKernelFeatureTree(doc);assert.equal(edited.ok,true);
 const after=await roundtrip(edited.features);assert.ok(after>before);
});
test('edited sweep source survives save, resampling, STEP export and reimport',async()=>{
 const profile={id:'profile',plane:'front',points:[{id:'a',x:-1,y:-1},{id:'b',x:1,y:-1},{id:'c',x:1,y:1},{id:'d',x:-1,y:1}],entities:[['a','b'],['b','c'],['c','d'],['d','a']].map(([a,b],i)=>({id:'e'+i,type:'line',a,b}))};
 const path={id:'path',plane:'top',points:[{id:'end',x:0,y:10},{id:'start',x:0,y:0}],entities:[{id:'line',type:'line',a:'start',b:'end'}]};
 let doc={sketches:[profile,path],sources:sweepSourceRecord(profile,profile.entities.map(e=>e.id),path)};
 const run=async()=>{
  const params=resolveSketchSources(doc,doc.sources,resolveProfilePoints);assert.ok(params);
  const recipe=toolFeatureRecipe({kind:'sweep',...params});
  return roundtrip([{id:'sweep',...recipe}]);
 };
 const before=await run();assert.ok(Math.abs(before-40)<1e-5);
 path.points.find(p=>p.id==='end').y=20;doc=JSON.parse(JSON.stringify(doc));
 const after=await run();assert.ok(Math.abs(after-80)<1e-5);
});
test('tool recipes preserve all construction parameters and isolate exported copies',()=>{
 for(const kind of ['revolve','sweep','loft','placed']){
  const tool={kind,axis:'z',angle:90,loop:[{u:1,v:2}],profile:[{x:1,y:2,z:3}],path:[{x:1,y:2,z:5}],sections:[],part:{id:'seed'},placements:[],orientation:'fixed',twistAngle:25,scale:2,solid:false,ruled:true,continuity:'G1',tolerance:.01};
  const recipe=toolFeatureRecipe(tool);assert.ok(recipe);
  assert.equal(recipe.type,kind==='placed'?'placedBody':kind);
  if(kind==='sweep'){assert.equal(recipe.params.twistAngle,25);recipe.params.profile[0].x=99;assert.equal(tool.profile[0].x,1);}
  if(kind==='loft'){assert.equal(recipe.params.solid,false);assert.equal(recipe.params.continuity,'G1');}
 }
 assert.equal(toolFeatureRecipe({kind:'unknown'}),null);
});
test('translation carries draft reference depth and explicit cut extent into export',()=>{
 const tool={axis:'z',loop:[{u:1,v:2}],from:3,to:8,draftBase:3,draftAngle:5};
 translateToolRecord(tool,10,20,30);
 const recipe=toolFeatureRecipe(tool);
 assert.deepEqual(recipe.params.points,[{u:11,v:22}]);
 assert.equal(recipe.params.from,33);assert.equal(recipe.params.to,38);assert.equal(recipe.params.draftBase,33);
 const through=toolFeatureRecipe({axis:'z',loop:[]},{x0:0,x1:2,y0:0,y1:2,z0:10,z1:20});
 assert.equal(through.params.from,8);assert.equal(through.params.to,22);
});

test('viewport tool builds and export feature builds agree after movement',async()=>{
 const {toolSolidBrep}=await import('../js/modeler_part_geometry.js');
 const square=[{x:-1,y:-1,z:0},{x:1,y:-1,z:0},{x:1,y:1,z:0},{x:-1,y:1,z:0}];
 const tools=[
  {axis:'z',from:0,to:4,loop:square.map(p=>({u:p.x,v:p.y}))},
  {kind:'revolve',axis:'y',angle:180,loop:[{u:2,v:0},{u:3,v:0},{u:3,v:2},{u:2,v:2}]},
  {kind:'sweep',profile:square,path:[{x:0,y:0,z:0},{x:0,y:0,z:5}]},
  {kind:'loft',sections:[square,square.map(p=>({...p,z:5}))],ruled:true},
 ];
 for(const original of tools){
  const tool=structuredClone(original);
  if(tool.kind!=='revolve')translateToolRecord(tool,4,6,8);
  const recipe=toolFeatureRecipe(tool), viewport=await toolSolidBrep(tool);
  let run;
  try{
   run=await regenerateFeatures({features:[{id:'tool',...recipe}]});assert.equal(run.ok,true,JSON.stringify(run.issues));
   assert.ok(Math.abs(volume(viewport)-volume(run.finalShape))<1e-6,tool.kind || 'extrude');
  }finally{disposeBrep(viewport);if(run)releaseRegeneration(run);}
 }
});
