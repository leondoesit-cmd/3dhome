import { toolFeatureRecipe, translateToolRecord } from "../js/core/tool_recipe.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferSmartMate } from '../js/modeler_smartmates.js';
import { sampleSketchPath } from '../js/core/swept_sources.js';
import { createMotionStudy,addRotaryMotor,evaluateMotionStudy } from '../js/cad_motion_study.js';
import { axisAngleMatrix,rotationOf } from '../js/cad_mate_model.js';
import { detectInterference } from '../js/cad_interference.js';
import { makeBrepPrimitive,disposeBrep } from '../js/cad_kernel.js';
import { regenerateFeatures,releaseRegeneration,addFeature } from '../js/cad_feature_tree.js';
const source=file=>readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8');
function extract(file,name,bindings={}){
 const text=source(file).match(new RegExp('(?:export )?function '+name+'\\([^]*?\\n\\}\\n'))[0];
 return Function(...Object.keys(bindings),'return ('+text.replace(/^export /,'')+')')(...Object.values(bindings));
}
test('SmartMate does not offer concentric for a plane and a straight edge',()=>{
 const face={componentId:'a',kind:'face',frame:{surface:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}}};
 const edge={componentId:'b',kind:'edge',frame:{curve:'line',origin:{x:0,y:0,z:0},dir:{x:1,y:0,z:0}}};
 assert.equal(inferSmartMate(face,edge),null);
 const round={...face,frame:{origin:{x:0,y:0,z:0},surface:'cylinder',axis:{x:0,y:1,z:0}}};
 assert.equal(inferSmartMate(round,{...edge,frame:{origin:{x:0,y:0,z:0},curve:'circle',axis:{x:0,y:1,z:0}}}).type,'concentric');
});
test('sweep samples the arc circumference, ignoring center and construction points',()=>{
 const sketch={plane:'front',points:[{id:'c',x:0,y:0},{id:'b',x:0,y:10},{id:'extra',x:99,y:99},{id:'a',x:10,y:0}],entities:[{id:'arc',type:'arc',c:'c',a:'a',b:'b'}]};
 const path=sampleSketchPath(sketch);assert.ok(path.length>3);
 assert.ok(path.every(p=>Math.abs(Math.hypot(p.x,p.y)-10)<1e-6));
 assert.equal(sampleSketchPath(sketch,['missing']),null);
});
test('sweep follows connected edges rather than point registry order',()=>{
 const sketch={plane:'front',points:[{id:'b',x:3,y:0},{id:'a',x:0,y:0},{id:'c',x:3,y:4}],entities:[{id:'ab',type:'line',a:'a',b:'b'},{id:'bc',type:'line',a:'b',b:'c'}]};
 assert.deepEqual(sampleSketchPath(sketch),[{x:0,y:0,z:0},{x:3,y:0,z:0},{x:3,y:4,z:0}]);
});
test('clockwise full circles do not duplicate the seed',()=>{
 const expression=source('modeler').match(/var step = (\(Math.abs\(total\)[^;]+);/)[1];
 const step=Function('total','n','return '+expression);
 assert.equal(step(-360,4),-Math.PI/2);assert.equal(step(360,4),Math.PI/2);
 assert.equal(step(-180,4),-Math.PI/3);
});
test('assembly autosave reaches the writer without a part definition',()=>{
 let saved;
 const E={open:true,docType:'assembly',def:null,assembly:{name:'assembly',components:[]}};
 const flush=extract('modeler','flushModelerDraft',{
   E,draftSaveTimer:0,draftFailureReported:false,modelerDraftStorage:()=>({}),
   parseModelerDraft:d=>d,serializeModelerDraft:p=>p,MODELER_DRAFT_KEY:'k',
   saveModelerDraftRecord:d=>{saved=d;return {then(){return {catch(){}};}};},
   writeModelerDraft:()=>false,syncDraftStatus:()=>{},
 });
 flush();assert.equal(saved.assembly,E.assembly);
});
test('axis cuts follow framed and primitive hosts in all three dimensions',()=>{
 const move=extract('modeler_part_geometry','movePart',{isKernelBody:()=>false,fin:Number.isFinite,translateToolRecord});
 for(const host of [{kind:'box',x0:0,x1:5,y0:0,y1:5,z0:0,z1:5},{kind:'ext',frame:{origin:{x:0,y:0,z:0}}}]){
   const p={...host,cuts3d:['x','y','z'].map(axis=>({axis,from:1,to:2,loop:[{u:4,v:5}]}))};
   move(p,10,20,30);
   assert.deepEqual(p.cuts3d.map(c=>[c.from,c.to,c.loop[0].u,c.loop[0].v]),[[11,12,34,25],[21,22,14,35],[31,32,14,25]]);
 }
});
const recipe=extract('modeler','mergeFeatureRecipe',{toolFeatureRecipe});
const rebuild=extract('modeler','rebuildFeatureTreeFromDocument',{
 activeParts:d=>d.parts,cloneData:structuredClone,addFeature,fin:Number.isFinite,
 emitPartMerges:(_d,_p,f)=>f,emitPartPatternTurn:(_d,_p,f)=>f,mergeFeatureRecipe:recipe,toolFeatureRecipe,partBounds:()=>({x0:0,x1:10,y0:0,y1:10,z0:0,z1:10}),
});
test('swept, revolved and lofted cuts preserve their recipes on primitive hosts',()=>{
 for(const cut of [{kind:'sweep',profile:[{x:0,y:0,z:0}],path:[{x:0,y:0,z:1}]},{kind:'revolve',axis:'y',loop:[{u:1,v:1}],angle:90},{kind:'loft',sections:[]}]){
   const doc={parts:[{id:'base',kind:'box',x0:0,x1:10,y0:0,y1:10,z0:0,z1:10,cuts3d:[cut]}]};
   const result=rebuild(doc);assert.equal(result.type,'subtract');assert.equal(doc.features[1].type,cut.kind);
   assert.deepEqual(doc.features[1].params,recipe(cut).params);
 }
});
test('toolbox history survives rebuild once, including editable metadata',()=>{
 const feature={id:'bolt',type:'toolbox',params:{sizeKey:'M6'},toolboxAutoName:'M6 bolt',references:{sketches:[]}};
 const doc={features:[feature],parts:[1,2].map(i=>({id:'p'+i,kind:'cyl',featureId:'bolt',toolboxFeatureId:'bolt'}))};
 rebuild(doc);assert.deepEqual(doc.features,[feature]);assert.notEqual(doc.features[0],feature);
});
test('raw Boolean feature records regenerate for each supported operation',async()=>{
 for(const operation of ['union','subtract','intersect']){
  const run=await regenerateFeatures({features:[{id:'a',type:'box',params:{w:10,h:10,d:10}},{id:'b',type:'box',params:{x:5,w:10,h:10,d:10}},{id:'bool',type:'boolean',inputs:['a','b'],params:{operation}}]});
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));}finally{releaseRegeneration(run);}
 }
});
test('exact interference excludes separation and face contact but finds overlap',async()=>{
 const a=await makeBrepPrimitive({type:'box',w:10,h:10,d:10});
 try{for(const [x,expected] of [[100,0],[10,0],[5,1]]){
  const b=await makeBrepPrimitive({type:'box',x,w:10,h:10,d:10});
  try{assert.equal((await detectInterference([{id:'a',brep:a},{id:'b',brep:b}])).length,expected);}finally{disposeBrep(b);}
 }}finally{disposeBrep(a);}
});
test('motors follow X, Y, Z and oblique axes and seeking is repeatable',()=>{
 for(const axis of [{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:1,y:2,z:3}]){
  const assembly={components:[{id:'wheel',transform:{}}]},study=createMotionStudy(assembly);
  addRotaryMotor(study,'wheel',60,axis);evaluateMotionStudy(assembly,study.id,.25);
  const expected=axisAngleMatrix(axis,Math.PI/2),actual=rotationOf(assembly.components[0].transform);
  actual.flat().forEach((n,i)=>assert.ok(Math.abs(n-expected.flat()[i])<1e-6));
  evaluateMotionStudy(assembly,study.id,.5);evaluateMotionStudy(assembly,study.id,.25);
  assert.deepEqual(rotationOf(assembly.components[0].transform),actual);
 }
});
