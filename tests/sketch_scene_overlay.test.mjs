import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {framePoint,frameFromPlane} from '../js/core/frame.js';
import {analyzeSketchProfiles,analyzeSketchChains} from '../js/sketch_profiles.js';
import {surfaceSketchWorldPolyline,surfacePoint} from '../js/core/surface_uv.js';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const consumed=new Function(sourceFunctionText(source,'consumedSketchIds')+';return consumedSketchIds;')();
const standard=new Function('fin',sourceFunctionText(source,'standardPlaneFrame')+';return standardPlaneFrame;')(Number.isFinite);
function overlays(def,extra={}) {
  const E={docType:'part',mode:'3d',modelPlaneActive:false,...extra};
  const run=new Function('E','ensureSketch','consumedSketchIds','ensureSketchDoc','standardPlaneFrame','framePoint','analyzeSketchProfiles','analyzeSketchChains','surfaceSketchWorldPolyline',sourceFunctionText(source,'documentSketchOverlays')+';return documentSketchOverlays;')(E,d=>d.sketches.find(s=>s.id===d.activeSketch),consumed,d=>d.sketches,standard,framePoint,analyzeSketchProfiles,analyzeSketchChains,surfaceSketchWorldPolyline);
  return run(def);
}
function line(id,plane='front',offset=0) {
  return {id,plane,offset,points:[{id:'a',x:1,y:2},{id:'b',x:3,y:4}],entities:[{id:'edge',type:'line',a:'a',b:'b'}],constraints:[]};
}

test('consumed string and record references hide profiles; explicit Show in 3D still works',()=>{
  const a=line('a'),b=line('b'),c=line('c');
  const def={sketches:[a,b,c],features:[{params:{sketchId:'a'}},{references:{sketches:['b',{id:'c'},null,{}]}}]};
  assert.deepEqual([...consumed(def)].sort(),['a','b','c']);
  assert.deepEqual(overlays(def),[]);
  c.show3d=true;
  assert.deepEqual(overlays(def),[[{x:1,y:2,z:0},{x:3,y:4,z:0}]]);
  c.show3d=false;
  assert.deepEqual(overlays(def),[]);
});

test('unused sketch display follows its attachment and offset independently of camera view',()=>{
  const top=line('top','top',8),front=line('front','front',9),side=line('side','side',10);
  assert.deepEqual(overlays({sketches:[top,front,side]}, {view:'iso'}),[
    [{x:1,y:8,z:2},{x:3,y:8,z:4}],
    [{x:1,y:2,z:9},{x:3,y:4,z:9}],
    [{x:10,y:2,z:1},{x:10,y:4,z:3}],
  ]);
});

test('face-attached sketches use their local frame and the active canvas sketch is omitted',()=>{
  const sketch=line('face');
  sketch.frameSpace='local';sketch.frame=frameFromPlane({x:20,y:30,z:40},{x:1,y:1,z:0});
  const def={sketches:[sketch],activeSketch:'face'};
  assert.deepEqual(overlays(def),[[framePoint(sketch.frame,1,2),framePoint(sketch.frame,3,4)]]);
  assert.deepEqual(overlays(def,{modelPlaneActive:true}),[]);
});

test('finished cylindrical surface sketch follows the curved face with its seam offset',()=>{
  const sketch=line('cylinder');
  sketch.points=[{id:'a',x:0,y:2},{id:'b',x:Math.PI*5,y:2}];
  sketch.frameSpace='surface-uv';sketch.seamOffset=Math.PI*2.5;
  const descriptor={surface:'cylinder',radius:5,axis:{x:0,y:1,z:0},origin:{x:10,y:20,z:30}};
  sketch.surface={descriptor};
  const [curve]=overlays({sketches:[sketch]});
  assert.ok(curve.length>30,'a UV line must have curved surface samples');
  assert.deepEqual(curve[0],surfacePoint(descriptor,sketch.seamOffset,2));
  assert.deepEqual(curve.at(-1),surfacePoint(descriptor,Math.PI*5+sketch.seamOffset,2));
  for(const point of curve){
    assert.ok(Math.abs(Math.hypot(point.x-10,point.z-30)-5)<1e-10);
    assert.equal(point.y,22);
  }
});

for(const surface of ['cone','sphere'])test(`${surface} UV sketch samples remain on the declared rotated surface`,()=>{
  const descriptor={surface,radius:5,angle:.2,axis:{x:1,y:0,z:0},origin:{x:10,y:20,z:30}};
  const sketch={frameSpace:'surface-uv',surface:{descriptor},seamOffset:.3};
  const curve=surfaceSketchWorldPolyline(sketch,[{u:0,v:0},{u:5,v:2}]);
  assert.ok(curve.length>10);
  for(const point of curve){
    const radial=Math.hypot(point.y-20,point.z-30);
    if(surface==='cone')assert.ok(Math.abs(radial-(5+(point.x-10)*Math.tan(.2)))<1e-10);
    else assert.ok(Math.abs(Math.hypot(point.x-10,point.y-20,point.z-30)-5)<1e-10);
  }
});

test('closed surface profiles stay closed and very long UV segments have bounded sampling',()=>{
  const sketch={surface:{descriptor:{surface:'cylinder',radius:5}}};
  const points=[{u:0,v:0},{u:1,v:1},{u:0,v:0}];
  const curve=surfaceSketchWorldPolyline(sketch,points);
  assert.deepEqual(curve[0],curve.at(-1));
  assert.equal(surfaceSketchWorldPolyline(sketch,[{u:0,v:0},{u:1e8,v:1e8}]).length,257);
});
