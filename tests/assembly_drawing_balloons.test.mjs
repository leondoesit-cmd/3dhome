import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeOccurrenceBalloonTarget,resolveComponentBalloon} from '../js/core/assembly_balloon.js';
import {assemblyDrawingBOM} from '../js/core/assembly_drawing_bom.js';
import {createSheetDoc,createView,ensureSheetDoc,sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {makeBrepExtrusion,shapeToMeshData,disposeBrep} from '../js/cad_kernel.js';

const frame=(x=0)=>({origin:{x,y:0,z:0},x:{x:1,y:0,z:0},y:{x:0,y:1,z:0},z:{x:0,y:0,z:1}});
function setup(mesh) {
 const def={name:'ASSEMBLY SOURCE',features:[],components:Array.from({length:8},(_,i)=>({id:'component'+i,modelKey:i===7?'part6':'part'+i,name:'Part '+i,def:{parts:[]}})),drawing:createSheetDoc({views:[],scale:'1:4'})};
 def.drawing.views=[createView('iso',{id:'iso',primary:true})];
 const bom=assemblyDrawingBOM(def),history=[],messages=[];
 let targets=def.components.map((c,i)=>nativeOccurrenceBalloonTarget({path:[c.id],placement:frame(i*3)},[{meshData:mesh}],bom.itemByPath.get(JSON.stringify([c.id]))));
 let chains=Array.from({length:7},(_,i)=>({id:'chain'+i,from:{x:i,y:0,z:0},to:{x:i,y:2,z:0}}));
 let controller;
 const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>[{id:'native',positions:mesh.positions,faceRanges:mesh.faceRanges}],bodiesToken:()=>1,
  componentBalloons:()=>targets,explodeLines:()=>chains,bom:()=>bom.rows,t:k=>k,width:()=>900,height:()=>600,canvas:()=>({}),refresh(){},flash:m=>messages.push(m),markDirty:()=>controller.invalidate(),historyToken:()=>history.length,
  pushUndo:()=>{history.push(JSON.stringify(def.drawing));def.drawing=JSON.parse(JSON.stringify(def.drawing));}};
 controller=createDrawingController(host);
 return {def,bom,history,messages,controller,host,setTargets:v=>{targets=v;},getTargets:()=>targets,setChains:v=>{chains=v;}};
}

test('native mesh occurrence anchors remain real transformed triangle centroids, fail closed without native mesh',()=>{
 const mesh={positions:[0,0,0,3,0,0,0,3,0]},occurrence={path:['nested','leaf'],placement:frame(10)};
 const bytes=JSON.stringify(mesh),target=nativeOccurrenceBalloonTarget(occurrence,[{meshData:mesh}],2,{x:0,y:4,z:0});
 assert.deepEqual(target.point,{x:11,y:5,z:0});assert.equal(target.key,'["nested","leaf"]');assert.equal(JSON.stringify(mesh),bytes);
 assert.equal(nativeOccurrenceBalloonTarget(occurrence,[{kind:'box',x0:0,x1:3}],2),null);
 assert.equal(nativeOccurrenceBalloonTarget(occurrence,[{meshData:{positions:[NaN,0,0,1,0,0,0,1,0]}}],2),null);
 const note={text:'old',componentBalloon:{path:target.path},leader:{viewId:'iso'}},basis={right:{x:1,y:0,z:0},up:{x:0,y:1,z:0}};
 const live=resolveComponentBalloon(note,[{...target,item:4}],basis);assert.equal(live.note.text,'4');assert.equal(live.note.leader.u,11);assert.equal(live.note.leader.v,5);
 assert.equal(resolveComponentBalloon(note,[],basis).dangling,true);
});

test('normalized interactive assembly draws eight native BOM-linked balloons and seven chains with source/history/cold preservation',async()=>{
 let shape;try {
  shape=await makeBrepExtrusion({axis:'z',from:0,to:1,points:[{u:0,v:0},{u:2,v:0},{u:2,v:1},{u:0,v:1}],holes:[]});
  const mesh=await shapeToMeshData(shape,{deflection:.01,angle:.1}),s=setup(mesh),source=JSON.stringify(s.def.components),meshBytes=JSON.stringify(mesh);
  assert.equal(s.bom.rows.length,7);assert.equal(s.bom.rows.at(-1).quantity,2);
  assert.equal(s.controller.autoComponentBalloons(),8);assert.equal(s.history.length,1);assert.equal(s.controller.autoComponentBalloons(),0);
  assert.equal(s.def.drawing.notes.length,8);assert.equal(new Set(s.def.drawing.notes.map(n=>JSON.stringify(n.componentBalloon.path))).size,8);
  let scene=s.controller.scene();assert.equal(scene.items.filter(i=>i.type==='circle'&&i.noteId).length,8);assert.equal(scene.items.filter(i=>i.explodeLeader).length,7);
  assert.equal(s.controller.svg(),sceneToSvg(scene));assert.equal(JSON.stringify(s.def.components),source);assert.equal(JSON.stringify(mesh),meshBytes);
  const nominal=s.controller.svg(),saved=JSON.stringify(s.def.drawing);
  s.def.drawing=JSON.parse(saved);s.controller.invalidate();assert.equal(s.controller.svg(),nominal,'cold Drawing serialization preserves shared SVG');
  const changed=s.getTargets().map((t,i)=>i===0?{...t,item:9,point:{...t.point,x:t.point.x+2}}:t);s.setTargets(changed);
  scene=s.controller.scene();assert.notEqual(s.controller.svg(),nominal,'live occurrence driver invalidates cached scene without relying on body token');
  assert.ok(scene.items.some(i=>i.noteId===s.def.drawing.notes[0].id&&i.type==='text'&&i.text==='9'));
  s.setTargets(changed.slice(1));scene=s.controller.scene();assert.equal(scene.items.filter(i=>i.type==='circle'&&i.noteId).length,7);assert.ok(scene.diagnostics.some(d=>d.code==='missing-component-balloon'));
  s.setChains([]);assert.equal(s.controller.scene().items.filter(i=>i.explodeLeader).length,0);
  s.def.drawing=JSON.parse(s.history[0]);s.controller.invalidate();assert.equal(s.def.drawing.notes.length,0);assert.equal(JSON.stringify(s.def.components),source);
 } finally {if(shape)disposeBrep(shape);}
});

test('auto command refuses partial native targets and special projections without taking history',()=>{
 const s=setup({positions:[0,0,0,3,0,0,0,3,0]});s.setTargets([{path:['missing'],item:1}]);
 assert.equal(s.controller.autoComponentBalloons(),0);assert.equal(s.history.length,0);assert.equal(s.def.drawing.notes.length,0);
 s.setTargets([{key:'["component0"]',path:['component0'],item:1,point:{x:0,y:0,z:0}}]);
 s.def.drawing.views[0].cropSketch={points:[{u:0,v:0},{u:1,v:0},{u:1,v:1}]};s.controller.invalidate();assert.equal(s.controller.autoComponentBalloons(),0);assert.equal(s.history.length,0);
});

test('ordinary balloon position dialog changes only layout, supports Undo and rejects stale edit',async()=>{
 const s=setup({positions:[0,0,0,3,0,0,0,3,0]});s.controller.autoComponentBalloons();
 const id=s.def.drawing.notes[0].id;
 const click=()=>{const circle=s.controller.scene().items.find(i=>i.type==='circle'&&i.noteId===id);const state=s.controller.state;assert.equal(s.controller.doubleClick({},state.ox+circle.cx*state.zoom,state.oy+circle.cy*state.zoom),true);};
 s.host.promptFields=async(title,fields)=>{assert.equal(title,'Component balloon position');assert.deepEqual(fields.map(f=>f.key),['auto','dx','dy']);return {auto:false,dx:25,dy:-20};};
 click();await new Promise(r=>setTimeout(r,0));
 const edited=s.def.drawing.notes.find(n=>n.id===id);assert.equal(edited.dx,25);assert.equal(edited.dy,-20);assert.equal(edited.autoBalloon,false);assert.equal(edited.text,'1');assert.equal(s.history.length,2);
 s.def.drawing=JSON.parse(s.history[1]);s.controller.invalidate();assert.equal(s.def.drawing.notes.find(n=>n.id===id).autoBalloon,true);
 let finish;s.host.promptFields=()=>new Promise(r=>{finish=r;});click();s.def.drawing.notes.find(n=>n.id===id).dx=3;finish({auto:false,dx:99,dy:99});await new Promise(r=>setTimeout(r,0));
 assert.equal(s.history.length,2);assert.equal(s.def.drawing.notes.find(n=>n.id===id).dx,3);assert.ok(s.messages.some(m=>m.includes('Drawing changed')));
});

test('balloon drag stores paper offsets while Escape and a plain click restore automatic layout',()=>{
 const s=setup({positions:[0,0,0,3,0,0,0,3,0]});s.controller.autoComponentBalloons();
 const id=s.def.drawing.notes[0].id,before=JSON.stringify(s.def.drawing.notes[0]);
 const c=s.controller.scene().items.find(i=>i.type==='circle'&&i.noteId===id),state=s.controller.state,x=state.ox+c.cx*state.zoom,y=state.oy+c.cy*state.zoom;
 s.controller.pointerDown({button:0},x,y);assert.equal(state.drag.mode,'note');s.controller.pointerMove({},x+20,y+10);
 assert.equal(s.def.drawing.notes[0].autoBalloon,false);assert.ok(Number.isFinite(s.def.drawing.notes[0].dx));
 s.controller.keyDown({key:'Escape',preventDefault(){}});assert.equal(JSON.stringify(s.def.drawing.notes[0]),before);
 s.controller.pointerDown({button:0},x,y);s.controller.pointerUp({},x,y);assert.equal(JSON.stringify(s.def.drawing.notes[0]),before);
});

