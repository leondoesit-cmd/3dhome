import test from 'node:test';
import assert from 'node:assert/strict';
import {followTrimmedBoundary} from '../js/core/trimmed_boundary_follow.js';
const sketch=()=>({points:[{id:1,x:0,y:2},{id:2,x:2,y:0},{id:3,x:2,y:-2},{id:4,x:0,y:-2},{id:5,x:0,y:0}],entities:[{id:'arc',type:'arc',a:1,b:2,c:5},{id:'right',type:'line',a:2,b:3},{id:'bottom',type:'line',a:3,b:4},{id:'trim',type:'line',a:4,b:1}],constraints:[{type:'fixed',point:1,x:0,y:2},{type:'fixed',point:4,x:0,y:-2}]});
const copy={entityIds:['arc','right','bottom','removed'],associative:true};
const segments=(x,r)=>[{type:'arc',center:{u:x,v:0},radius:r,from:{u:x-r,v:0},to:{u:x+r,v:0}},{type:'line',from:{u:x+r,v:0},to:{u:x+r,v:-2}},{type:'line',from:{u:x+r,v:-2},to:{u:x-r,v:-2}}];
test('mixed trimmed boundary retains manual wall and IDs while source radius and position change',()=>{
 const before=sketch(),after=followTrimmedBoundary(before,copy,segments(1,3));
 assert.equal(after.points.find(p=>p.id===1).x,0);
 assert.ok(Math.abs(after.points.find(p=>p.id===1).y-Math.sqrt(8))<1e-9);
 assert.equal(after.points.find(p=>p.id===2).x,4);
 assert.equal(after.points.find(p=>p.id===3).x,4);
 assert.equal(after.points.find(p=>p.id===4).x,0);
 assert.deepEqual(after.entities,before.entities);
 assert.equal(after.constraints[0].y,after.points[0].y);
 assert.equal(before.points[0].y,2,'input remains unchanged');
 const replay=followTrimmedBoundary(after,copy,segments(1,3));
 assert.deepEqual(replay,after,'replay remains stable');
 const restored=followTrimmedBoundary(after,copy,segments(0,2));
 assert.deepEqual(restored.points,before.points,'upstream edit back restores exact original trim');
});
test('ambiguous source and vanished trim intersection fail explicitly',()=>{
 assert.throws(()=>followTrimmedBoundary(sketch(),copy,[...segments(1,3),segments(1,3)[0]]),/ambiguous/);
 assert.throws(()=>followTrimmedBoundary(sketch(),copy,segments(5,2)),/intersection/);
});
