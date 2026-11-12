import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {inferTangentCircle} from '../js/modeler_inference.js';
import {sketchGeometryBounds,planeBoundsFit} from '../js/core/sketch_view_fit.js';
import {sketchFitViewport} from '../js/core/sketch_fit_viewport.js';

const source=modelerSource();
function load(name,context){const start=source.indexOf('function '+name+'('),open=source.indexOf('{',start);let depth=1,end=open+1;while(depth){const char=source[end++];if(char==='{')depth++;if(char==='}')depth--;}
  runInNewContext(source.slice(start,end)+'\nthis.run='+name+';',context);return context.run;}
test('paperclip outer legs cannot infer tangency to a remote arc or to the undrawn half of a nearby arc',()=>{
  const line={a:{u:0,v:1},b:{u:0,v:3}};
  const oldArc={id:'Arc1',type:'arc',center:{u:.1,v:0},r:.1,startAngle:0,endAngle:Math.PI};
  const wrongHalf={id:'Arc2',type:'arc',center:{u:.1,v:2},r:.1,startAngle:0,endAngle:Math.PI/2};
  const correct={id:'Arc3',type:'arc',center:{u:.1,v:2},r:.1,startAngle:Math.PI/2,endAngle:3*Math.PI/2};
  assert.equal(inferTangentCircle(line,[oldArc,wrongHalf],{scale:500}),null);
  assert.equal(inferTangentCircle(line,[oldArc,wrongHalf,correct],{scale:500}).id,'Arc3');
  assert.equal(inferTangentCircle(line,[{id:'tiny',center:{u:.3,v:2},r:.1}],{scale:1}),null,'a coarse zoom cannot restore the old .45cm capture allowance');
});
test('near-contact tangent tolerance follows pixels at the current zoom',()=>{
  const line={a:{u:-2,v:10.02},b:{u:2,v:10.02}},circle={id:'circle',center:{u:0,v:0},r:10};
  assert.equal(inferTangentCircle(line,[circle],{scale:100,pixelTolerance:4}).id,'circle');
  assert.equal(inferTangentCircle(line,[circle],{scale:1000,pixelTolerance:4}),null);
});
test('sketch bounds include semicircle extrema instead of only their centers and endpoints',()=>{
  const bounds=sketchGeometryBounds({points:[{id:'c',x:0,y:1},{id:'a',x:0,y:0},{id:'b',x:0,y:2}],entities:[{type:'arc',c:'c',a:'a',b:'b'}]});
  assert.ok(Math.abs(bounds.u1-1)<1e-12);assert.ok(Math.abs(bounds.u0)<1e-12);assert.equal(bounds.v0,0);assert.equal(bounds.v1,2);
});
test('a single vertical sketch fits the current canvas height with margins after pane resizing',()=>{
  const sketch={points:[{id:'a',x:10,y:0},{id:'b',x:10,y:3}],entities:[{type:'line',a:'a',b:'b'}]},E={def:{},cw:1200,ch:900,view:'front',cv:{getBoundingClientRect:()=>({left:0,top:0,width:0,height:0})}};let measured=0,drawn=0;
  const fit=load('fitSketch',{E,root:null,sketchFitViewport,sizeSketch:()=>{measured++;E.cw=400;E.ch=300;},sketchProjection:()=>null,renderedParts:()=>[],ensureSketchDoc:()=>[sketch],sameSketchContext:()=>true,ensureSketch:()=>sketch,activeSketchFrame:()=>null,sketchGeometryBounds,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),SKETCH_MIN_SCALE:.3,SKETCH_MAX_SCALE:2000,drawSketch:()=>{drawn++;},syncStatus(){}});
  fit();assert.equal(measured,1);assert.equal(drawn,1);
  assert.ok(Math.abs(E.scl-220/3)<1e-12);assert.ok(Math.abs(E.ox+10*E.scl-200)<1e-12);
  for(const point of sketch.points){const y=E.oy-point.y*E.scl;assert.ok(y>=39.999 && y<=260.001);}
});
test('plane camera fit is limited by both screen axes for vertical and wide sketches',()=>{
  const frame={origin:{x:0,y:0,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}};
  for(const item of [{bounds:{x0:0,x1:0,y0:0,y1:2.4384,z0:0,z1:0},w:1000,h:400},{bounds:{x0:-5,x1:5,y0:0,y1:1,z0:0,z1:0},w:400,h:1000}]){
    const fit=planeBoundsFit(item.bounds,frame,item.w,item.h),scale=item.h/(2*fit.distance*Math.tan(Math.PI/8));
    assert.ok((item.bounds.x1-item.bounds.x0)*scale<=item.w-80+1e-8);
    assert.ok((item.bounds.y1-item.bounds.y0)*scale<=item.h-80+1e-8);
  }
});
test('toolbar zoom changes the same camera as the wheel for projected sketches, and the same scale for flat sketches',()=>{
  const cameraFactors=[],E={mode:'3d',modelPlaneActive:true,scl:100,pv:{zoomBy:value=>cameraFactors.push(value)}};let invalidations=0,draws=0;
  const zoom=load('zoomBy',{E,sketchProjection:()=>({}),invalidateSketchProjection:()=>{invalidations++;},drawSketch:()=>{draws++;},syncStatus(){}});
  zoom('in');zoom('out');assert.deepEqual(cameraFactors,[.8,1.25]);assert.equal(invalidations,2);assert.equal(draws,2);assert.equal(E.scl,100);
  const flat={mode:'2d',modelPlaneActive:false,scl:100,ox:200,oy:150,cw:400,ch:300};
  const zoomFlat=load('zoomBy',{E:flat,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),SKETCH_MIN_SCALE:.3,SKETCH_MAX_SCALE:2000,drawSketch(){},syncStatus(){}});
  zoomFlat('in');assert.equal(flat.scl,125);zoomFlat('out');assert.equal(flat.scl,100);
});

test('the production plane camera fitter respects the large-pane distance factor and centers an off-origin profile',()=>{
  const viewSource=readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8');
  const start=viewSource.indexOf('view.framePlane = function (bounds) {'),end=viewSource.indexOf('\n    };',start)+7;
  assert.ok(start>=0 && end>start);let resized=0,target;
  const frame={origin:{x:7,y:8,z:9},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}},view={fixedFrame:frame,big:true,resize:()=>{resized++;},target:{set:(...values)=>{target=values;}}};
  runInNewContext(viewSource.slice(start,end),{view,planeBoundsFit,cv:{clientWidth:400,clientHeight:300},lastW:400,lastH:300,cam:{fov:45,zoom:1},bigZoom:()=>1.3,minDist:1,maxDist:2000,clamp:(value,min,max)=>Math.max(min,Math.min(max,value))});
  const bounds={x0:7,x1:7,y0:10,y1:13,z0:9,z1:9};view.framePlane(bounds);
  assert.equal(resized,1);assert.deepEqual(target,[0,3.5,0]);
  const physicalDistance=view.dist*1.3,screenHeight=3*300/(2*physicalDistance*Math.tan(Math.PI/8));
  assert.ok(Math.abs(screenHeight-156)<1e-10,'both the orbit-distance multiplier and 72px overlay clearance are applied once');
});

test('model sketch preview uses container height instead of a tall thumbnail ratio while swap state settles',()=>{
  const viewSource=readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8');
  const start=viewSource.indexOf('view.resize = function (force) {'),end=viewSource.indexOf('\n    };',start)+7;
  let size;const view={big:false},cam={updateProjectionMatrix(){}},opts={pad:16,ratio:.75,fitContainerHeight:()=>true};
  runInNewContext('var lastW=0,lastH=0,settling=0,sizeDirty=true;'+viewSource.slice(start,end),{view,cam,opts,cv:{parentElement:{getBoundingClientRect:()=>({width:2013,height:1133})}},rr:{setSize:(...values)=>{size=values;}},requestAnimationFrame(){}});
  view.resize(true);assert.deepEqual(size,[1997,1117,true]);assert.equal(cam.aspect,1997/1117);
  assert.match(source,/fitContainerHeight: function \(\) \{ return E\.mode === "3d"; \}/);
});
