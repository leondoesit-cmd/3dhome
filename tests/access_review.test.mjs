import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewAccess} from '../js/access_review.js';
const room=(key,x)=>({key,wallIds:key.split(','),pts:[{x,z:0},{x:x+300,z:0},{x:x+300,z:300},{x,z:300}]});
const snapshot=()=>({scene:{rooms:[room('1,2',0),room('2,3',300)],walls:[{id:2,thickness:10,points:[{x:300,z:0},{x:300,z:300}]}],items:[]},doors:[{id:1,wall:1,s:150,width:100,center:{x:0,z:150}},{id:2,wall:2,s:150,width:100,center:{x:300,z:150}}],entranceId:1,width:60});
test('door connectivity and clear routes are separate results',()=>{
 const s=snapshot(),r=reviewAccess(s);assert.deepEqual(r.disconnected,[]);assert.equal(r.walkable.length,2);
 s.doors[1].width=40;const narrow=reviewAccess(s);assert.deepEqual(narrow.disconnected,[]);assert.equal(narrow.walkable.length,1);
});
test('missing entrance is unresolved and a missing door is actionable',()=>{
 const s=snapshot();s.entranceId=null;assert.equal(reviewAccess(s).walkable,null);
 s.entranceId=1;s.doors.pop();assert.deepEqual(reviewAccess(s).disconnected,['2,3']);
});
test('furniture blocks physical circulation without deleting graph links',()=>{
 const s=snapshot();s.scene.items=[{id:4,x:300,z:150,w:100,d:250,h:200,elev:0,rot:0}];
 const r=reviewAccess(s);assert.deepEqual(r.disconnected,[]);assert.equal(r.walkable.length,1);
});
