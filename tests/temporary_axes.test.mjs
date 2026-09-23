import test from 'node:test';
import assert from 'node:assert/strict';
import {temporaryAxes} from '../js/core/temporary_axes.js';
const face=(surface,origin,axis,range)=>({kind:'face',descriptor:{surface,referenceOrigin:origin,axis,axisRange:range}});
test('temporary axes merge reversed coaxial faces and keep offset bores separate',()=>{
 const axes=temporaryAxes([
  face('cylinder',{x:0,y:0,z:2},{x:0,y:0,z:1},[0,2]),
  face('cone',{x:0,y:0,z:2},{x:0,y:0,z:-1},[0,3]),
  face('cylinder',{x:2,y:0,z:0},{x:0,y:0,z:1},[0,1]),
  {kind:'face',descriptor:{surface:'plane'}}
 ]);
 assert.equal(axes.length,2);
 assert.deepEqual(axes[0],{from:{x:0,y:0,z:-1.75},to:{x:0,y:0,z:4.75}});
 assert.equal(axes[1].from.x,2);
});
test('temporary axes preserve oblique directions',()=>{
 const a=Math.SQRT1_2;
 const [axis]=temporaryAxes([face('cylinder',{x:1,y:2,z:3},{x:a,y:a,z:0},[0,4])]);
 assert.ok(Math.abs((axis.to.x-axis.from.x)-(axis.to.y-axis.from.y))<1e-9);
 assert.equal(axis.to.z,3);
});
