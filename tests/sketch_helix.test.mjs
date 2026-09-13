import test from 'node:test';
import assert from 'node:assert/strict';
import {helixFromSketch} from '../js/core/sketch_helix.js';
import {helixPoint} from '../js/cad_helix.js';
test('LENSCAP circle drives an inward tapered helix from the offset rear plane',()=>{
 const document={sketches:[{id:'s',frameSpace:'local',frame:{origin:{x:0,y:0,z:-3.2385},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:-1,z:0},normal:{x:0,y:0,z:-1}},points:[{id:'p',x:0,y:0}],entities:[{id:'c',type:'circle',c:'p',r:6.22387622113482}]}]};
 const params={sketchId:'s',circleId:'c',pitch:.635,turns:2.5,definition:'pitch-turns',reverse:true,taperMode:'angle',taperAngle:5,taperOutward:false,startAngle:0,handedness:'rh'};
 const spec=helixFromSketch(document,params),start=helixPoint(spec,0),end=helixPoint(spec,1);
 assert.equal(spec.height,1.5875);assert.ok(Math.abs(end.z+1.651)<1e-9);assert.equal(start.y,0);assert.ok(Math.abs(end.y)<1e-12);
 assert.ok(Math.abs(spec.radiusEnd-(spec.radius-1.5875*Math.tan(Math.PI/36)))<1e-10);
 document.sketches[0].entities[0].r+=.2;assert.ok(Math.abs(helixFromSketch(document,params).radius-spec.radius-.2)<1e-9);
 assert.equal(helixFromSketch(document,{...params,startAngle:90}).startAngle,Math.PI/2);
});
