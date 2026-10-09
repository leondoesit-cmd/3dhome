import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {sketchFitViewport} from '../js/core/sketch_fit_viewport.js';
import {sketchGeometryBounds} from '../js/core/sketch_view_fit.js';
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const canvas=rect(265.333,163.333,2013.333,1132.667);
const overlays={
 '#mdViews':rect(canvas.left+12,canvas.top+52,36,450),
 '#mdCoach':rect(850,174,1000,46),'#mdContextToolbar':rect(1265.333,215.333,13.333,9.333),
 '#mdRailBottom':rect(1134.12,1170.667,275.76,29.333),'#mdRailRow':rect(277.333,1242,1989.333,0),'#mdStatus':rect(781.333,1250,1497.333,46),
};
test('available Sketch viewport excludes actual top coach and bottom hint/status, not the whole canvas centre',()=>{
 const area=sketchFitViewport(canvas,[overlays['#mdCoach'],overlays['#mdContextToolbar']],[overlays['#mdRailBottom'],overlays['#mdRailRow'],overlays['#mdStatus']]);
 assert.ok(Math.abs(area.y-(224.666-163.333))<1e-9);assert.ok(Math.abs(area.y+area.h-(1170.667-163.333))<1e-9);
 assert.equal(area.w,canvas.width);
});
test('invisible zero-area and off-canvas overlays leave fit unchanged',()=>{
 const area=sketchFitViewport(canvas,[rect(0,0,100,100),rect(900,200,0,46)],[rect(100,1300,300,30),overlays['#mdRailRow']]);
 assert.deepEqual(area,{x:0,y:0,w:canvas.width,h:canvas.height});
});
for(const [view,frame] of [['front',null],['top',null],['top',{}]])test('actual fitSketch keeps a 30x50 mm profile within HUD-clear area for '+view+' '+(frame?'attached frame':'datum'),()=>{
 const sketch={id:'s1',points:[{id:'a',x:0,y:0},{id:'b',x:3,y:0},{id:'c',x:3,y:5},{id:'d',x:0,y:5}],entities:[{type:'line',a:'a',b:'b'},{type:'line',a:'b',b:'c'},{type:'line',a:'c',b:'d'},{type:'line',a:'d',b:'a'}]};
 const E={def:{sketches:[sketch]},view,cw:0,ch:0,cv:{getBoundingClientRect:()=>canvas}};const before=JSON.stringify(E.def);
 const root={querySelector:id=>overlays[id]?{hidden:false,getBoundingClientRect:()=>overlays[id]}:null};let measured=0;
 const bindings={E,root,sketchFitViewport,sizeSketch(){measured++;E.cw=canvas.width;E.ch=canvas.height;},sketchProjection:()=>null,renderedParts:()=>[],ensureSketchDoc:()=>[sketch],sameSketchContext:()=>true,ensureSketch:()=>sketch,activeSketchFrame:()=>frame,sketchGeometryBounds,clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),SKETCH_MIN_SCALE:.3,SKETCH_MAX_SCALE:2000,drawSketch(){},syncStatus(){}};
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');const fit=new Function(...Object.keys(bindings),sourceFunctionText(source,'fitSketch')+';return fitSketch;')(...Object.values(bindings));fit();
 assert.equal(measured,1);assert.equal(JSON.stringify(E.def),before);
 const globalY=sketch.points.map(point=>canvas.top+E.oy+(view==='top'&&!frame?1:-1)*point.y*E.scl);
 assert.ok(Math.min(...globalY)>=224.666+40-1e-8);assert.ok(Math.max(...globalY)<=1170.667-40+1e-8);
 assert.ok(Math.abs(E.scl-(1170.667-224.666-80)/5)<1e-8);assert.ok(E.scl<210.534);
 const globalX=sketch.points.map(point=>canvas.left+E.ox+point.x*E.scl);assert.ok(Math.min(...globalX)>=canvas.left+40);assert.ok(Math.max(...globalX)<=canvas.right-40);
});
