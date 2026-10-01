import test from 'node:test';import assert from 'node:assert/strict';
import {solveTopologyMates,captureLockPose} from '../js/cad_mates.js';
import {rotationOf,apply,mul,transpose} from '../js/cad_mate_model.js';
test('Lock mate holds all six relative freedoms and follows moved reader',()=>{
 const a={id:'a',grounded:true,transform:{x:4,y:2,z:-3,rx:10,ry:25,rz:45}},b={id:'b',transform:{x:8,y:7,z:2,rx:-30,ry:70,rz:120}};
 const mate={id:'lock',type:'lock',a:{componentId:'a',kind:'body'},b:{componentId:'b',kind:'body'}};
 captureLockPose(mate,a,b);const relative=structuredClone(mate.relativePose);
 const asm={components:[a,b],topologyMates:[mate]};
 let result=solveTopologyMates(asm);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
 Object.assign(a.transform,{x:-4,y:8,z:11,rx:80,ry:-15,rz:160});delete a.transform.q;
 Object.assign(b.transform,{x:100,y:-25,z:6,rx:180,ry:0,rz:0});delete b.transform.q;
 result=solveTopologyMates(asm);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,0);
 const inv=transpose(rotationOf(a.transform)),position=apply(inv,{x:b.transform.x-a.transform.x,y:b.transform.y-a.transform.y,z:b.transform.z-a.transform.z});
 for(const key of ['x','y','z'])assert.ok(Math.abs(position[key]-relative.position[key])<1e-6);
 const rotation=mul(inv,rotationOf(b.transform));rotation.forEach((row,i)=>row.forEach((v,j)=>assert.ok(Math.abs(v-relative.rotation[i][j])<1e-6)));
 const loaded=JSON.parse(JSON.stringify(asm));assert.equal(solveTopologyMates(loaded).ok,true);assert.deepEqual(loaded.topologyMates[0].relativePose,relative);
});
