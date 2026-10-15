import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as THREE from '../vendor/three/three.module.js';
import {normalToFrustum} from '../js/core/editor_projection.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function listeners(E,extra={}){
 const start=source.indexOf('    var pinch = null;',source.indexOf('Two-finger pinch zoom')),end=source.indexOf('  })();',start),events={};
 const cv={addEventListener:(n,f)=>events[n]=f,getBoundingClientRect:()=>({left:10,top:20})};
 const context={E,cv,sketchProjection:()=>null,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),SKETCH_MIN_SCALE:.1,SKETCH_MAX_SCALE:1000,drawSketch(){},syncStatus(){},takeOverSketchNavigation(){E._sketchPinching=true;E.drag=null;},...extra};
 vm.createContext(context);vm.runInContext('(function(){'+source.slice(start,end)+'})();',context);return events;
}
const event=(x,y,d)=>({touches:[{clientX:x-d/2,clientY:y},{clientX:x+d/2,clientY:y}],preventDefault(){}});
test('flat sketch combined pan/pinch preserves moving anchor, exact ratio and event-frequency independence',()=>{
 for(const steps of [1,12]){
  const E={mode:'2d',scl:10,ox:195,oy:528,drag:{mode:'draw'}},l=listeners(E);
  l.touchstart(event(205,548,60));assert.equal(E.drag,null);assert.equal(E._sketchPinching,true);
  for(let n=1;n<=steps;n++)l.touchmove(event(205-95*n/steps,548+72*n/steps,60+90*n/steps));
  near(E.scl,25);near(E.ox,100);near(E.oy,600);
  l.touchend({touches:[]});assert.equal(E._sketchPinching,false);
 }
});
test('flat sketch two-finger equal-spacing translation is not ignored',()=>{
 const E={mode:'2d',scl:10,ox:195,oy:528},l=listeners(E);l.touchstart(event(205,548,60));l.touchmove(event(125,608,60));near(E.scl,10);near(E.ox,115);near(E.oy,588);
});
function cameraRig(orthographic){
 const cv={clientWidth:390,clientHeight:844};
 const cam=orthographic?new THREE.OrthographicCamera(-1,1,1,-1,.01,10000):new THREE.PerspectiveCamera(45,390/844,.01,10000);
 cam.fov=45;cam.aspect=390/844;cam.zoom=1.3;
 const view={dist:50,big:true,target:new THREE.Vector3(),place(){
  cam.position.set(this.target.x,this.target.y,this.target.z+this.dist*1.2);cam.lookAt(this.target);
  if(orthographic)Object.assign(cam,normalToFrustum(this.dist*1.2,cam.fov,cam.aspect));cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
 },render(){this.place();}};
 const src=fs.readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8');
 const chunk=src.slice(src.indexOf('    view.worldPerPixelAtDistance ='),src.indexOf('    view.resetPan ='));
 new Function('view','cv','cam','THREE','bigZoom','clamp','minDist','maxDist',chunk)(view,cv,cam,THREE,()=>1.2,(x,a,b)=>Math.max(a,Math.min(b,x)),1,1000);
 view.place();return {view,cam,cv};
}
for(const ortho of [true,false])test(`${ortho?'orthographic':'perspective'} actual camera pinch anchors plane point and pan matches pixels`,()=>{
 const {view,cam,cv}=cameraRig(ortho),anchor=new THREE.Vector3(4,-3,ortho?0:9);
 const pixel=p=>{const n=p.clone().project(cam);return{x:(n.x*.5+.5)*cv.clientWidth,y:(-n.y*.5+.5)*cv.clientHeight};};
 const before=pixel(anchor);view.pinchAt(.4,anchor,before.x-95,before.y+72);const after=pixel(anchor);
 near(after.x,before.x-95);near(after.y,before.y+72);
 const targetPoint=new THREE.Vector3(view.target.x,view.target.y,view.target.z),panBefore=pixel(targetPoint);view.panBy(35,-27,true);const panAfter=pixel(targetPoint);
 near(panAfter.x,panBefore.x+35);near(panAfter.y,panBefore.y-27);
});

test('projected sketch native listener forwards previous midpoint plane anchor and current viewport midpoint',()=>{
 const calls=[],E={mode:'3d',pv:{rr:{domElement:{getBoundingClientRect:()=>({left:30,top:40})}},pinchAt(...args){calls.push(args);}}};
 const frame={origin:{x:1,y:2,z:3}},l=listeners(E,{sketchProjection:()=>({frame}),toUV:(x,y)=>({u:x,v:y}),framePoint:(f,u,v,w)=>{assert.equal(f,frame);return{x:u,y:v,z:w};},invalidateSketchProjection(){}});
 l.touchstart(event(205,548,60));l.touchmove(event(110,620,150));
 assert.equal(calls.length,1);near(calls[0][0],.4);assert.deepEqual(calls[0][1],{x:195,y:528,z:0});near(calls[0][2],80);near(calls[0][3],580);
 l.touchmove(event(120,630,150));assert.deepEqual(calls[1][1],{x:100,y:600,z:0});near(calls[1][0],1);
});
import {createHistory} from '../js/edit_history.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
test('actual first-touch point drag rolls back before second pointerdown, with no geometry or history residue',()=>{
 const E={mode:'3d',modelPlaneActive:true,tool:'select',scl:10,def:{sketches:[{points:[{id:'p',x:4,y:5,fixed:false}]}]}};
 const original=JSON.stringify(E.def),H=createHistory({get:()=>JSON.stringify(E.def),set:s=>{E.def=JSON.parse(s);}});H.seed();
 const captures={},cv={addEventListener:(name,fn,capture)=>{if(capture)captures[name]=fn;}},context={E,H,cv,Set,
  cancel2DPointerMove(){},threeFinger:()=>false,getCanvasRect:()=>({left:0,top:0}),sketchProjection:()=>({}),modelerTouchPrecisionKind:()=>null,getTouchPrecisionMode:()=> 'lens',beginTouchPrecision:()=>null,touchPrecisionPoint:(p,x,y)=>({x,y}),precisionModelPoint:()=>null,toUV:(x,y)=>({u:x,v:y}),hitSketch:()=>null,smartDimensionOriginWins:()=>true,snapPt:uv=>uv,
  hitPart:()=>E.def.sketches[0].points[0],isSketchObject:()=>true,selectSketch:p=>{E.sel=p;},t:k=>k,refreshAll(){},pushUndo(){throw Error('Touch point drag must be provisional');}};
 vm.createContext(context);
 const takeoverStart=source.indexOf('  var sketchContacts=new Set();'),takeoverEnd=source.indexOf('  function getCanvasRect()',takeoverStart);
 vm.runInContext(source.slice(takeoverStart,takeoverEnd),context);
 const downStart=source.indexOf('  cv.addEventListener("pointerdown", function (e) {',takeoverEnd),downEnd=source.indexOf('  var pointerMoveRaf',downStart);
 context.cv.addEventListener=(name,fn)=>{context.down=fn;};vm.runInContext(source.slice(downStart,downEnd),context);
 const first={pointerType:'touch',pointerId:1,clientX:140,clientY:380,button:0},second={...first,pointerId:2,clientX:200,clientY:400};
 captures.pointerdown(first);context.down(first);assert.equal(E.drag.mode,'spoint');assert.equal(H.isPending(),true);
 E.drag.pt.x=14;E.drag.pt.y=38;E.drag.moved=true;E.def.sketches[0].points.push({id:'solver-dependent',x:1,y:2});
 captures.pointerdown(second);context.down(second);
 assert.equal(JSON.stringify(E.def),original);assert.equal(E.drag,null);assert.equal(H.isPending(),false);assert.equal(H.canUndo(),false);
 captures.pointerup(first);captures.pointerup(second);assert.equal(H.canUndo(),false);
});
