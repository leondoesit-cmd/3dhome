import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDrawingController} from '../js/modeler_drawing.js';
import {createSheetDoc,ensureSheetDoc} from '../js/cad_sheet.js';
import {tessellateParts} from '../js/core/part_tessellate.js';

function rig(withView=false){
 const owner={name:'Pinch drawing',parts:withView?[{kind:'box',x0:0,x1:2,y0:0,y1:2,z0:0,z1:1}]:[],drawing:createSheetDoc({views:withView?['front']:[]})};
 if(withView){owner.drawing.views[0].x=100;owner.drawing.views[0].y=100;}
 owner.drawing.notes=[{id:'n',x:220,y:240,text:'Keep this note',leader:null}];
 owner.drawing.primitives=[{id:'line',type:'line',style:'outline',points:[{x:20,y:20},{x:60,y:20}]}];
 const history={begin:0,cancel:0,commit:0,push:0};
 const c=createDrawingController({doc:()=>ensureSheetDoc(owner),model:()=>owner,bodies:()=>tessellateParts(owner.parts),bodiesToken:()=>1,canvas:()=>({}),width:()=>338,height:()=>638,topology:()=>null,t:k=>k,refresh(){},flash(){},markDirty(){},beginUndo(){history.begin++;},cancelUndo(){history.cancel++;},commitUndo(){history.commit++;},pushUndo(){history.push++;}});
 c.scene();return {owner,c,history};
}
const touch=id=>({button:0,pointerType:'touch',pointerId:id});

function nativePinchListeners(c,rect={left:0,top:0}){
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 const start=source.indexOf('    var pinch = null;',source.indexOf('Two-finger pinch zoom'));
 const end=source.indexOf('  })();',start);assert.ok(start>0&&end>start);
 const listeners=new Map(),cv={addEventListener:(name,fn)=>listeners.set(name,fn),getBoundingClientRect:()=>rect};
 const context={cv,E:{mode:'drawing'},drawingSheet:()=>c,sketchProjection:()=>false,syncStatus(){}};
 vm.createContext(context);vm.runInContext('(function(){'+source.slice(start,end)+'})();',context);
 return listeners;
}

test('actual drawing two-finger pan moves enlarged paper80px without changing scale or document',()=>{
 const {owner,c,history}=rig(),before=JSON.stringify(owner),listeners=nativePinchListeners(c);
 c.zoomBy(2.6);const start={zoom:c.state.zoom,ox:c.state.ox,oy:c.state.oy};
 c.pointerDown(touch(1),160,530);c.pointerDown(touch(2),210,530);
 listeners.get('touchstart')({touches:[{clientX:160,clientY:530},{clientX:210,clientY:530}]});
 for(let step=1;step<=8;step++){
  const dx=10*step;
  listeners.get('touchmove')({touches:[{clientX:160+dx,clientY:530},{clientX:210+dx,clientY:530}],preventDefault(){}});
  c.pointerMove(touch(1),160+dx,530);c.pointerMove(touch(2),210+dx,530);
 }
 assert.equal(c.state.zoom,start.zoom);assert.ok(Math.abs(c.state.ox-start.ox-80)<1e-10);assert.equal(c.state.oy,start.oy);
 listeners.get('touchend')({touches:[]});assert.equal(c.state.pinching,false);
 assert.equal(JSON.stringify(owner),before);assert.deepEqual(history,{begin:0,cancel:0,commit:0,push:0});
});

test('combined drawing pinch and diagonal pan preserve moving paper anchor independent of event frequency and canvas inset',()=>{
 const outcomes=[],rect={left:56,top:40};
 for(const steps of [1,8,100]){
  const {owner,c,history}=rig(),before=JSON.stringify(owner),listeners=nativePinchListeners(c,rect);
  const anchor={x:(185-rect.left-c.state.ox)/c.state.zoom,y:(530-rect.top-c.state.oy)/c.state.zoom};
  const zoom=c.state.zoom;
  listeners.get('touchstart')({touches:[{clientX:160,clientY:530},{clientX:210,clientY:530}]});
  for(let step=1;step<=steps;step++){
   const progress=step/steps,cx=185+80*progress,cy=530-60*progress,spread=50+80*progress;
   listeners.get('touchmove')({touches:[{clientX:cx-spread/2,clientY:cy},{clientX:cx+spread/2,clientY:cy}],preventDefault(){}});
   assert.ok(Math.abs((cx-rect.left-c.state.ox)/c.state.zoom-anchor.x)<1e-9);
   assert.ok(Math.abs((cy-rect.top-c.state.oy)/c.state.zoom-anchor.y)<1e-9);
  }
  assert.ok(Math.abs(c.state.zoom/zoom-2.6)<1e-10);outcomes.push([c.state.zoom,c.state.ox,c.state.oy]);
  assert.equal(JSON.stringify(owner),before);assert.deepEqual(history,{begin:0,cancel:0,commit:0,push:0});
 }
 for(const outcome of outcomes)for(let index=0;index<3;index++)assert.ok(Math.abs(outcome[index]-outcomes[0][index])<1e-9);
});

test('drawing pinch endpoint ratio is independent of touch event frequency',()=>{
 const results=[];
 for(const steps of [1,6,1000]){
  const {owner,c,history}=rig(),before=JSON.stringify(owner),listeners=nativePinchListeners(c);
  const zoom=c.state.zoom;
  listeners.get('touchstart')({touches:[{clientX:95,clientY:430},{clientX:145,clientY:430}]});
  for(let i=1;i<=steps;i++){
   const spread=50+80*i/steps;
   listeners.get('touchmove')({touches:[{clientX:120-spread/2,clientY:430},{clientX:120+spread/2,clientY:430}],preventDefault(){}});
  }
  assert.ok(Math.abs(c.state.zoom/zoom-2.6)<1e-10);
  results.push([c.state.zoom,c.state.ox,c.state.oy]);
  assert.equal(JSON.stringify(owner),before);assert.deepEqual(history,{begin:0,cancel:0,commit:0,push:0});
 }
 for(const result of results)for(let i=0;i<3;i++)assert.ok(Math.abs(result[i]-results[0][i])<1e-9);
});

test('actual canvas pinch listeners preserve a stationary paper anchor despite interleaved pointer moves',()=>{
 const {owner,c,history}=rig(),before=JSON.stringify(owner);
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 const start=source.indexOf('    var pinch = null;',source.indexOf('Two-finger pinch zoom'));
 const end=source.indexOf('  })();',start);assert.ok(start>0&&end>start);
 const listeners=new Map(),cv={addEventListener:(name,fn)=>listeners.set(name,fn),getBoundingClientRect:()=>({left:0,top:0})};
 const context={cv,E:{mode:'drawing'},drawingSheet:()=>c,sketchProjection:()=>false,syncStatus(){}};
 vm.createContext(context);vm.runInContext('(function(){'+source.slice(start,end)+'})();',context);
 c.pointerDown(touch(1),95,430);assert.equal(c.state.drag.mode,'pan');
 c.pointerDown(touch(2),145,430);
 listeners.get('touchstart')({touches:[{clientX:95,clientY:430},{clientX:145,clientY:430}]});
 const anchor={x:(120-c.state.ox)/c.state.zoom,y:(430-c.state.oy)/c.state.zoom};
 for(let i=1;i<=6;i++){
  const a=95-i*40/6,b=145+i*40/6;
  listeners.get('touchmove')({touches:[{clientX:a,clientY:430},{clientX:b,clientY:430}],preventDefault(){}});
  c.pointerMove(touch(1),a,430);c.pointerMove(touch(2),b,430);
  assert.ok(Math.abs((120-c.state.ox)/c.state.zoom-anchor.x)<1e-9);
  assert.ok(Math.abs((430-c.state.oy)/c.state.zoom-anchor.y)<1e-9);
 }
 assert.ok(c.state.zoom>1);assert.equal(c.state.drag,null);assert.equal(JSON.stringify(owner),before);
 c.pointerUp(touch(1),55,430);const offsets=[c.state.ox,c.state.oy];c.pointerMove(touch(2),200,480);
 assert.deepEqual([c.state.ox,c.state.oy],offsets,'remaining pinch finger cannot resume the old pan');
 c.pointerUp(touch(2),185,430);assert.equal(c.state.pinching,true,'pointer bookkeeping cannot end native contact ownership');
 listeners.get('touchend')({touches:[]});assert.equal(c.state.pinching,false);
 c.pointerDown(touch(3),95,430);c.pointerMove(touch(3),105,440);assert.equal(c.state.ox,offsets[0]+10);c.pointerUp(touch(3),105,440);
 assert.deepEqual(history,{begin:0,cancel:0,commit:0,push:0});
});

test('pinch takeover restores moved view and note drags and cancels their provisional history',()=>{
 for(const kind of ['view','note']){
  const {owner,c,history}=rig(true),before=JSON.stringify(owner);
  const point=kind==='view'?c.scene().views[0]:c.scene().items.find(i=>i.noteId==='n'&&i.type==='text');
  c.pointerDown(touch(1),point.x,point.y);assert.equal(c.state.drag.mode,kind);
  c.pointerMove(touch(1),point.x+9,point.y+7);assert.notEqual(JSON.stringify(owner),before);
  c.beginPinch();assert.equal(JSON.stringify(owner),before);assert.equal(c.state.drag,null);assert.equal(c.state.draft,null);
  c.pointerUp(touch(1),point.x+9,point.y+7);assert.equal(history.begin,1);assert.equal(history.cancel,1);assert.equal(history.commit,0);
 }
});

test('second touch cannot commit a first-finger primitive draft; cancellation releases tracking',()=>{
 const {owner,c,history}=rig(),before=JSON.stringify(owner);
 c.setTool('sheetrect');c.pointerDown(touch(1),80,80);assert.equal(c.state.draft.kind,'primitive');
 c.pointerDown(touch(2),120,100);assert.equal(c.state.draft,null);assert.equal(JSON.stringify(owner),before);
 c.pointerCancel(touch(1));assert.equal(c.state.pinching,true);c.pointerCancel(touch(2));assert.equal(c.state.pinching,true);
 const offsets=[c.state.ox,c.state.oy];c.pointerMove(touch(2),200,200);assert.deepEqual([c.state.ox,c.state.oy],offsets);
 c.endPinch();assert.equal(c.state.pinching,false,'native all-contacts-ended releases the guard');
 c.pointerDown(touch(3),80,80);c.pointerUp(touch(3),80,80);
 c.pointerDown(touch(4),120,100);c.pointerUp(touch(4),120,100);
 assert.equal(owner.drawing.primitives.length,2);assert.equal(history.push,1);
});
