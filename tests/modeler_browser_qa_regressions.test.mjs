import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {frameFromPlane,framePoint} from '../js/core/frame.js';
import {alignExtrusionToSupport} from '../js/cad_feature_tree.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function load(name, context) {
  let start=source.indexOf(`function ${name}(`);
  if(source.slice(start-6,start)==='async ')start-=6;
  const end=source.indexOf('\n}',start)+2;
  return vm.runInNewContext(`(${source.slice(start,end)})`,context);
}
test('face-local extrusion previews agree with exact support direction on reversed and oblique faces',()=>{
 for(const normal of [{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:-.6,y:0,z:-.8}]) {
  const frame=frameFromPlane({x:2,y:3,z:4},normal);
  const support={persistentId:'rim',ownerFeatureId:'shell'};
  const sketch={plane:'front',frameSpace:'local',frame,support};
  const preview=load('extrudePreviewParts',{
   E:{def:{}},ensureSketch:()=>sketch,planeAxis:()=> 'z',cloneData:structuredClone,
   sketchFeatureAreas:()=>[{points:[{u:0,v:0},{u:1,v:0},{u:0,v:1}],holes:[]}],
   resolveExtrudeExtent:params=>params,isUpToFace:()=>false,featureTypeLabel:type=>type,
  });
  for(const direction of ['forward','reverse']) {
   const params={direction,depth:.635,endCondition:'blind'};
   const actual=preview('extrude',params)[0];
   const exact=alignExtrusionToSupport({...params,frame,support},[{reference:support,topology:{descriptor:{origin:frame.origin,normal}}}]);
   assert.deepEqual(framePoint(actual.frame,0,0,actual.to),framePoint(exact.frame,0,0,exact.to));
   const end=framePoint(actual.frame,0,0,actual.to),sign=direction==='reverse'?-1:1;
   assert.ok(Math.abs((end.x-2)*normal.x+(end.y-3)*normal.y+(end.z-4)*normal.z-sign*.635)<1e-9);
  }
 }
});
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
test('Front uses its world camera preset even while a top face remains selected',()=>{
 const calls=[];
 const E={
  view:'top',mode:'3d',poly:null,arcPts:null,dimPick:[],dimSel:null,
  pv:{orbitTo:(az,el)=>calls.push({az,el})},def:{},
 };
 const setView=load('setView',{
  E,CAMERA_ONLY_VIEWS:['iso','back','left'],VIEW_PRESETS:[
   {id:'front',az:0,el:.05},{id:'top',az:0,el:1.5},{id:'right',az:Math.PI/2,el:.05},
  ],adoptSketchForView:()=>false,orientStandardView:load('orientStandardView',{E,VIEW_PRESETS:[
   {id:'front',az:0,el:.05},{id:'top',az:0,el:1.5},{id:'right',az:Math.PI/2,el:.05},
  ]}),syncTools(){},drawSketch(){},fitSketch(){},pruneAbandonedSketches(){},
 });
 setView('front');
 assert.equal(E.view,'front');
 assert.deepEqual(calls,[{az:0,el:.05}]);
});
test('standard views preserve a feature profile while choosing its terminating face',()=>{
 const calls=[];
 const E={view:'side',mode:'3d',def:{activeSketch:'rib'},authoring:{featureType:'extrude'},
  pv:{clearFixedFrame:()=>calls.push('clear'),orbitTo:(az,el)=>calls.push([az,el])}};
 const setView=load('setView',{E,CAMERA_ONLY_VIEWS:['iso','back','left'],
  VIEW_PRESETS:[{id:'front',az:0,el:.05},{id:'top',az:0,el:1.5},{id:'right',az:Math.PI/2,el:.05}],
  adoptSketchForView(){throw new Error('Feature profile must remain active');},drawSketch(){}});
 setView('front');setView('top');setView('side');
 assert.equal(E.def.activeSketch,'rib');
 assert.equal(E.view,'side');
 assert.deepEqual(calls,['clear',[0,.05],'clear',[0,1.5],'clear',[Math.PI/2,.05]]);
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

test('Zoom to fit centers an off-origin sketch in its plane camera',()=>{
 let target;
 const E={def:{},pv:{fixedFrame:{origin:{x:7,y:8,z:9}},target:{set(...v){target=v;}},frame(){},render(){}}};
 const fit=load('fitPreview',{E,activeSketchWorldBounds:()=>({x0:7,x1:7,y0:8,y1:13.08,z0:9,z1:14.08}),renderedParts:()=>[]});
 fit();
 assert.ok(Math.abs(target[1]-2.54)<1e-12);assert.ok(Math.abs(target[2]-2.54)<1e-12);assert.equal(target[0],0);
});

test('view indicators follow the camera without changing the sketch plane',()=>{
 const buttons=['top','front','side','back','left'].map(id=>({id,on:false,attrs:{},getAttribute(){return id;},classList:{toggle(_name,on){buttons.find(b=>b.id===id).on=on;}},setAttribute(key,value){this.attrs[key]=value;}}));
 const E={view:'front',mode:'3d',pv:{az:Math.PI,el:.05}};
 const sync=load('syncViewButtons',{E,root:{querySelectorAll:()=>buttons},VIEW_PRESETS:[{id:'back',az:Math.PI,el:.05},{id:'right',az:Math.PI/2,el:.05}]});
 sync();
 assert.deepEqual(buttons.filter(b=>b.on).map(b=>b.id),['back']);
 assert.equal(buttons.find(b=>b.id==='back').attrs['aria-pressed'],'true');
 assert.equal(E.view,'front');
 E.pv.az=Math.PI/2+2*Math.PI;sync();
 assert.deepEqual(buttons.filter(b=>b.on).map(b=>b.id),['side']);
 E.pv.az=.7;sync();assert.equal(buttons.some(b=>b.on),false);
 E.pv.az=Math.PI;E.pv.fixedFrame={};sync();assert.equal(buttons.some(b=>b.on),false);
 E.mode='2d';sync();assert.deepEqual(buttons.filter(b=>b.on).map(b=>b.id),['front']);
});
