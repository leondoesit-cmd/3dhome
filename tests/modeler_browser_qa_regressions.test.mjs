import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function load(name, context) {
  let start=source.indexOf(`function ${name}(`);
  if(source.slice(start-6,start)==='async ')start-=6;
  const end=source.indexOf('\n}',start)+2;
  return vm.runInNewContext(`(${source.slice(start,end)})`,context);
}
test('opening and accepting a fractional-millimeter dimension preserves its exact value',()=>{
 const controls=new Map();
 const root={querySelector:key=>{
  if(!controls.has(key))controls.set(key,{value:'',focus(){},select(){}});
  return controls.get(key);
 }};
 const E={}, sketch={}, constraint={id:'radius',type:'radius',value:.635};
 const context={root,E,Number,hideDimensionEditor(){E.dimEditor=null;},dimensionEditorUnit:()=> 'cm',positionDimensionEditor(){},requestAnimationFrame:fn=>fn()};
 const show=load('showDimensionEditor',context);
 assert.equal(show(sketch,constraint),true);
 assert.equal(controls.get('#mdDimValue').value,'0.635');
 let undos=0;
 const apply=load('applyDimensionEditor',{...context,fin:Number.isFinite,nameAvailable:()=>true,pushUndo(){undos++;},activateDrawingSketch(){},resolveSketch:()=>true,refreshAll(){}});
 assert.equal(apply(),true);
 assert.equal(constraint.value,.635);
 assert.equal(undos,0);
});
test('explicit new sketch on the same face preserves the earlier profile and owns one outer undo',()=>{
 const old={id:'pocket',entities:[{id:'boundary'}],support:{persistentId:'face'}};
 const E={def:{sketches:[old],activeSketch:old.id}};
 let undos=0;
 const attach=load('attachSketchToSelectedFace',{
  E,faceSketchAttachment:()=>({support:{persistentId:'face'},plane:'top',offset:9.906,frame:{origin:{y:9.906}}}),
  ensureSketch:def=>def.sketches.find(s=>s.id===def.activeSketch),
  addSketch:(def,plane,offset,name,support)=>{const sk={id:'terminals',entities:[],plane,offset,name,support};def.sketches.push(sk);return sk;},
  pushUndo(){undos++;},t:k=>k
 });
 assert.equal(attach(false),true);
 assert.equal(E.def.sketches.length,1);
 assert.equal(attach(true),true);
 assert.equal(E.def.sketches.length,2);
 assert.equal(E.def.activeSketch,'terminals');
 assert.equal(E.def.sketches[0],old);
 assert.equal(old.entities[0].id,'boundary');
 assert.equal(undos,0);
});
test('body modifiers consume the latest result without crossing to another body',()=>{
 const E={def:{features:[
  {id:'base',type:'extrude'}, {id:'round',type:'fillet',inputs:['base']},
  {id:'cut',type:'extrudeCut',inputs:['round']},
  {id:'other',type:'extrude'}, {id:'holes',type:'hole',inputs:['cut']},
  {id:'inactive',type:'chamfer',inputs:['holes'],suppressed:true}
 ]}};
 const head=load('cutTargetFeatureId',{E,Set});
 assert.equal(head({featureId:'base'}),'holes');
 assert.equal(head({featureId:'other'}),'other');
 assert.equal(head(null),null);
});
test('stale instant 3D pose is hidden after preview authoring is cleared',()=>{
 const chip={hidden:false};
 const sync=load('syncInstant3dValue',{
  E:{_instant3dPose:{}},syncFilletEndpoints(){},instant3dValueChip(){return chip;},instant3dAuthoringState(){return null;}
 });
 sync({cam:{}});
 assert.equal(chip.hidden,true);
});
test('finish confirmation requires a successful exact preview',()=>{
 const E={authoring:{featureType:'chamfer',finishPreviewStatus:'error'}};
 const ready=load('featureSelectionReady',{E,selectedSolid:()=>({}),finishFeatureTargets:()=>[{}]});
 assert.equal(ready(),false);
 E.authoring.finishPreviewStatus='pending';assert.equal(ready(),false);
 E.authoring.finishPreviewStatus='ready';assert.equal(ready(),true);
});

import { mergeSmoothTopology } from '../js/core/topology.js';
test('duplicate kernel and mesh rim aliases retain one circumference',()=>{
 const edge=(id)=>({ownerFeatureId:'base',kind:'edge',persistentId:id,descriptor:{curve:'circle',origin:{x:0,y:12,z:0},axis:{x:0,y:1,z:0},radius:6.5,measure:2*Math.PI*6.5}});
 const edges=mergeSmoothTopology([edge('kernel'),edge('mesh')]).filter(e=>e.kind==='edge');
 assert.equal(edges.length,1);
 assert.ok(Math.abs(edges[0].descriptor.measure-2*Math.PI*6.5)<1e-9);
 assert.equal(edges[0].memberPersistentIds.length,2);
});

test('cut rim references depend on the authoring cut and failed preflight leaves history intact',async()=>{
 const E={def:{features:[{id:'cut',type:'extrudeCut'}]},coreRun:{topology:[]}};
 const part={featureId:'base'};
 let undoCount=0, message='';
 const round=load('quickRoundPart',{
  E,featureDefaults:()=>({}),selectedSolid:()=>part,partSupportsExactMesh:()=>true,
  cutTargetFeatureId:()=> 'cut',finishFeatureTargets:()=>[{kind:'edge',persistentId:'mesh-rim',descriptor:{}}],
  cloneData:structuredClone,createTopologyRegistry:()=>({byPersistentId:new Map()}),
  resolveTopologyReference:()=>({topology:{kind:'edge',persistentId:'cut:tool:rim',ownerFeatureId:'cut:tool'}}),
  topologyReferenceFromEntry:structuredClone,isCanonicalAuthoring:()=>true,modelParameterOverrides:()=>({}),
  createFeatureDefinition:(doc,kind,options)=>{
   assert.equal(options.references.topology[0].ownerFeatureId,'cut');
   assert.equal(options.references.topology[0].persistentId,'cut:tool:rim');
   const feature={id:'finish',type:kind};doc.features.push(feature);return feature;
  },
  compileKernelFeatureTree:doc=>({ok:true,document:doc,features:doc.features}),
  regenerateFeatures:async doc=>doc.features.some(f=>f.id==='finish')
   ? {results:new Map(),issues:[{severity:'error',featureId:'finish',message:'Invalid finish'}]}
   : {results:new Map([['cut',{shape:{},topology:[]}]]),issues:[]},
  captureExactTopology:()=>({}),releaseRegeneration:()=>{},
  flash:value=>{message=value;},pushUndo:()=>{undoCount++;}
 });
 assert.equal(await round('chamfer',.3),false);
 assert.equal(E.def.features.length,1);
 assert.equal(part.exactOperations,undefined);
 assert.equal(undoCount,0);
 assert.equal(message,'Invalid finish');
});
