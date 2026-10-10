import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetDoc,createView,ensureSheetDoc,canRemoveViewFromSheet,removeViewFromSheet,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {makeBrepExtrusion,shapeToMeshData,disposeBrep} from '../js/cad_kernel.js';

const fixture=()=>({name:'DRAWING SOURCE',features:[{id:'unchanged-source'}],sketches:[],parts:[],drawing:createSheetDoc({views:[],scale:'1:1'})});
const setup=(def,bodies=[])=>{
 let controller;const history=[],messages=[];
 const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>bodies,bodiesToken:()=>1,t:k=>k,canvas:()=>({}),width:()=>900,height:()=>600,refresh(){},flash:m=>messages.push(m),markDirty:()=>controller.invalidate(),
  pushUndo:()=>{history.push(JSON.stringify(def.drawing));def.drawing=JSON.parse(JSON.stringify(def.drawing));}};
 controller=createDrawingController(host);return {controller,host,history,messages};
};

test('actual normalized controller deletes last principal with three independent isometric native projections',async()=>{
 let shape;try {
  shape=await makeBrepExtrusion({axis:'z',from:0,to:1,points:[{u:0,v:0},{u:2,v:0},{u:2,v:1},{u:0,v:1}],holes:[]});
  const mesh=await shapeToMeshData(shape,{deflection:.01,angle:.1}),bodies=[{id:'native',positions:mesh.positions,faceRanges:mesh.faceRanges}],bytes=JSON.stringify(bodies);
  const def=fixture(),cad=JSON.stringify({...def,drawing:undefined});
  def.drawing.views=[createView('right',{id:'right',primary:true}),...['Default','Medium','Large'].map((label,i)=>createView('iso',{id:'iso'+i,label,x:60+90*i,y:70}))];
  def.drawing.dims=[{id:'old',viewId:'right',type:'horizontal',refs:[{u:0,v:0},{u:2,v:0}],offset:10}];
  const {controller,history,messages}=setup(def,bodies);controller.select({kind:'view',id:'right'});assert.equal(controller.deleteSelection(),true);
  assert.equal(history.length,1);assert.equal(messages.length,0);assert.equal(def.drawing.views.length,3);assert.equal(def.drawing.dims.length,0);
  assert.equal(def.drawing.views.filter(v=>v.primary).length,1);assert.equal(def.drawing.views[0].primary,true);
  const scene=controller.scene();assert.equal(scene.views.length,3);assert.ok(scene.views.every(v=>v.projection.visible.length>0));
  assert.equal(controller.svg(),sceneToSvg(scene));assert.ok(scene.views.every(v=>[v.x,v.y,v.w,v.h].every(Number.isFinite)));
  assert.equal(JSON.stringify(bodies),bytes);assert.equal(JSON.stringify({...def,drawing:undefined}),cad);
  const cold=JSON.parse(JSON.stringify(def));assert.equal(createDrawingController({...setup(cold,bodies).host}).svg(),controller.svg());
  def.drawing=JSON.parse(history[0]);controller.invalidate();assert.equal(controller.scene().views.length,4);assert.equal(def.drawing.views[0].id,'right');assert.equal(def.drawing.dims[0].id,'old');
 } finally {if(shape)disposeBrep(shape);}
});

test('last independent base stays even when only dependent drawings would remain',()=>{
 const def=fixture();def.drawing.views=[createView('front',{id:'base',primary:true}),createView('detail',{id:'detail',parent:'base',detail:{from:'base',u:0,v:0,radius:1}}),createView('detail',{id:'nested',parent:'detail',detail:{from:'detail',u:0,v:0,radius:.5}})];
 ensureSheetDoc(def);const {controller,history,messages}=setup(def),before=JSON.stringify(def.drawing);controller.select({kind:'view',id:'base'});assert.equal(controller.deleteSelection(),true);
 assert.equal(history.length,0);assert.equal(JSON.stringify(def.drawing),before);assert.deepEqual(messages,['drawKeepOneView']);
 assert.equal(canRemoveViewFromSheet(def.drawing,'base'),false);
});

test('final isometric base and nonprimary last base are protected, unknown directions are not usable substitutes',()=>{
 for(const primary of [true,false]) {
  const def=fixture();def.drawing.views=[createView('iso',{id:'base',primary}),createView('unknown',{id:'invalid',primary:!primary})];
  const {controller,history,messages}=setup(def);controller.select({kind:'view',id:'base'});controller.deleteSelection();assert.equal(history.length,0);assert.equal(messages.length,1);assert.equal(def.drawing.views.length,2);
 }
});

test('deletion cascades dependent descendants/annotations and picks independent primary, not an earlier surviving detail',()=>{
 const doc=createSheetDoc({views:[]});doc.views=[createView('front',{id:'removed',primary:true}),createView('detail',{id:'child',parent:'removed',detail:{from:'removed'}}),createView('detail',{id:'grandchild',parent:'child',detail:{from:'child'}}),createView('detail',{id:'survivor-detail',parent:'iso',detail:{from:'iso'}}),createView('iso',{id:'iso'})];
 doc.dims=[{id:'remove',viewId:'grandchild'},{id:'keep',viewId:'iso'}];doc.notes=[{id:'removed-note',leader:{viewId:'child'}},{id:'free-note',text:'SOURCE NOTE'},{id:'kept-note',leader:{viewId:'survivor-detail'}}];
 assert.equal(canRemoveViewFromSheet(doc,'removed'),true);removeViewFromSheet(doc,'removed');
 assert.deepEqual(doc.views.map(v=>v.id),['survivor-detail','iso']);assert.equal(doc.views[1].primary,true);assert.equal(doc.views[0].primary,false);
 assert.deepEqual(doc.dims.map(d=>d.id),['keep']);assert.deepEqual(doc.notes.map(n=>n.id),['free-note','kept-note']);assert.equal(canRemoveViewFromSheet(doc,'iso'),false);
});

test('nonprimary independent view deletion preserves selected primary and derived-only deletion remains possible',()=>{
 const def=fixture();def.drawing.views=[createView('iso',{id:'main',primary:true}),createView('iso',{id:'copy'}),createView('detail',{id:'derived',parent:'main',detail:{from:'main',u:0,v:0,radius:1}})];
 const {controller,history}=setup(def);controller.select({kind:'view',id:'copy'});controller.deleteSelection();assert.equal(def.drawing.views[0].primary,true);
 controller.select({kind:'view',id:'derived'});controller.deleteSelection();assert.equal(def.drawing.views.length,1);assert.equal(history.length,2);assert.equal(def.drawing.views[0].id,'main');
 assert.equal(canRemoveViewFromSheet(def.drawing,'missing'),false);
 const scene=buildSheetScene(def.drawing,{model:def});assert.equal(scene.views.length,1);
});
