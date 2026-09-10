import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCorridor} from '../js/corridor_route.js';
const box=(x,z,w,d)=>[{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];
test('bounded orthogonal routing returns a validated corridor without carving rooms',()=>{
 const params={permitted:box(0,0,1000,800),start:{x:100,z:100},end:{x:900,z:700},rooms:[{pts:box(400,200,200,400)}],width:80,thickness:10,step:50};
 const a=routeCorridor(params),b=routeCorridor(params);assert.equal(a.ok,true,JSON.stringify(a));assert.deepEqual(a,b);assert.ok(a.path.length>=3);
});
test('missing permission area and infeasible endpoints fail without a candidate',()=>{
 assert.equal(routeCorridor({permitted:[],start:{x:0,z:0},end:{x:100,z:100}}).ok,false);
 assert.equal(routeCorridor({permitted:box(0,0,100,100),start:{x:10,z:10},end:{x:90,z:90}}).reason,'blocked-endpoint');
});
test('a floor void or loose solid spanning the permitted area blocks circulation',()=>{
 const params={permitted:box(0,0,600,300),start:{x:100,z:150},end:{x:500,z:150},width:80,step:20};
 assert.equal(routeCorridor(params).ok,true);
 assert.equal(routeCorridor({...params,obstacles:[box(280,0,40,300)]}).reason,'no-route');
});
test('existing exterior doors can terminate the corridor without carving either room',()=>{
 const a={center:{x:300,z:150},normal:{x:1,z:0}},b={center:{x:800,z:150},normal:{x:-1,z:0}};
 const result=routeCorridor({permitted:box(-100,-100,1300,800),start:{x:382,z:150},end:{x:718,z:150},rooms:[{pts:box(0,0,300,300)},{pts:box(800,0,300,300)}],width:94,thickness:10,connections:{start:a,end:b}});
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.path[0],a.center);assert.deepEqual(result.path.at(-1),b.center);
});
