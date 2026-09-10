import test from 'node:test';
import assert from 'node:assert/strict';
import {requirementDraft} from '../js/draft_requirements.js';
import {generationPlan} from '../js/generation_layout.js';
import {polygonBooleanArea} from '../js/polygon_area.js';
const box=(w,d)=>[{x:0,z:0},{x:w,z:0},{x:w,z:d},{x:0,z:d}];
test('packing retries keep checklist identity and exact dimensions when the original order cannot fit',()=>{
 const requirements=[[100,100],[100,200],[300,200]].map(([width,depth],i)=>({id:`room-${i}`,type:'bedroom',width,depth}));
 const before=JSON.stringify(requirements),result=requirementDraft(requirements,box(500,400));
 assert.equal(result.ok,true);assert.deepEqual(result,requirementDraft(requirements,box(500,400)));
 assert.equal(JSON.stringify(requirements),before);
 assert.deepEqual(result.layout.rooms.map(r=>r.checklistId),requirements.map(r=>r.id));
 result.layout.rooms.forEach((r,i)=>assert.deepEqual([r.x1-r.x0-10,r.z1-r.z0-10],[requirements[i].width,requirements[i].depth]));
 assert.ok(result.layout.rooms[0].z0>result.layout.rooms[2].z0);
});
test('a concave outline can place a room away from its unavailable lower-left corner',()=>{
 const boundary=[{x:0,z:200},{x:200,z:200},{x:200,z:0},{x:500,z:0},{x:500,z:500},{x:0,z:500}];
 const result=requirementDraft([{type:'bedroom',width:250,depth:250}],boundary);
 assert.equal(result.ok,true);
 const r=result.layout.rooms[0],outer=[{x:r.x0-5,z:r.z0-5},{x:r.x1+5,z:r.z0-5},{x:r.x1+5,z:r.z1+5},{x:r.x0-5,z:r.z1+5}];
 assert.equal(polygonBooleanArea([[outer],[boundary]],s=>s[0]&&!s[1]),0);
 assert.ok(r.x0>=205||r.z0>=205);
});
test('draft requirements retain exact interior dimensions and explicit room types',()=>{
 const rooms=[{type:'bedroom',name:'Small existing bedroom',width:181.25,depth:202.75},{type:'bathroom',width:150,depth:200}];
 const before=JSON.stringify(rooms),a=requirementDraft(rooms,box(500,500)),b=requirementDraft(rooms,box(500,500));
 assert.equal(a.ok,true);assert.deepEqual(a,b);assert.equal(JSON.stringify(rooms),before);
 assert.equal(a.layout.rooms.length,2);assert.equal(a.layout.rooms[0].x1-a.layout.rooms[0].x0-10,181.25);assert.equal(a.layout.rooms[0].roomType,'bedroom');
});
test('an impossible boundary never drops or scales a requirement',()=>{
 const result=requirementDraft([{type:'bedroom',name:'Required room',width:500,depth:400}],box(300,300));
 assert.equal(result.ok,false);assert.equal(result.unplaced,'Required room');assert.equal(result.layout,undefined);
});
test('concave boundaries and malformed requirements are checked before packing',()=>{
 assert.equal(requirementDraft([{type:'bedroom',width:200,depth:200}],[{x:0,z:0},{x:500,z:0},{x:500,z:100},{x:100,z:100},{x:100,z:500},{x:0,z:500}]).ok,false);
 assert.equal(requirementDraft([{type:'unknown'}],box(500,500)).ok,false);
});
test('boundary-based drafts cannot swallow existing furniture on an otherwise empty floor',()=>{
 const state={nodes:[],items:[{x:100,z:100,w:60,d:60,rot:0}]};
 assert.throws(()=>generationPlan('small',false,state,1,{requirements:[{type:'bedroom',width:200,depth:200}],boundary:box(500,500)}),/requirements-existing/);
 const layout=generationPlan('small',false,state,1,{requirements:[{type:'bedroom',width:200,depth:200}]});
 assert.ok(layout.rooms[0].x0>630);
});
