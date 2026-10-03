import test from 'node:test';
import assert from 'node:assert/strict';
import {addCenterSlot} from '../js/sketch_center_slot.js';
import {circularSweepProfile} from '../js/core/swept_sources.js';
import {makeBrepSweep,shapeMassProperties,validateBrepForExport,disposeBrep} from '../js/cad_kernel.js';

test('human Center slot perimeter supplies one exact closed capsule sweep with a round section',async()=>{
 let serial=0;
 const sketch={id:'belt-path',plane:'front',offset:2,points:[],entities:[],constraints:[]};
 addCenterSlot(sketch,{length:10,width:6,x:0,y:6.5,fixCenter:true},()=>String(++serial));
 const params=circularSweepProfile(sketch,.4);
 assert.deepEqual(params.pathSegments.map(segment=>segment.type),['line','arc','line','arc']);
 assert.deepEqual(params.pathSegments[0].from,{x:-5,y:3.5,z:2});
 assert.deepEqual(params.pathSegments.at(-1).to,params.pathSegments[0].from);
 const body=await makeBrepSweep({...params,orientation:'follow-path',twistAngle:0,scale:1,solid:true});
 try{
  const mass=await shapeMassProperties(body),expected=(20+6*Math.PI)*Math.PI*.2**2;
  assert.ok(Math.abs(mass.volume-expected)<1e-5,JSON.stringify(mass));
  for(const [axis,value] of Object.entries({x:0,y:6.5,z:2}))assert.ok(Math.abs(mass.centerOfMass[axis]-value)<1e-6);
  await validateBrepForExport(body);
 }finally{disposeBrep(body);}
});
