import test from 'node:test';
import assert from 'node:assert/strict';
import {checkRoomFit,suggestRoomLayout} from '../js/layout_analysis.js';
const room={key:'1',cx:200,cz:200,area:160000,pts:[{x:0,z:0},{x:400,z:0},{x:400,z:400},{x:0,z:400}]};
const item={id:1,type:'desk',w:80,d:50,h:80,elev:0,x:200,z:200,rot:0};
const snapshot=()=>({roomKey:'1',scene:{rooms:[room],walls:[],items:[{...item}]}});
test('fit distinguishes physical overlap, access and door swings',()=>{
 const s=snapshot();assert.deepEqual(checkRoomFit(s),[]);
 s.scene.items.push({...item,id:2,z:290});assert.ok(checkRoomFit(s).some(i=>i.kind==='access'));
 s.scene.items[1].z=210;assert.ok(checkRoomFit(s).some(i=>i.kind==='physical'));
 s.scene.items.pop();s.doorSwings=[{id:5,elev:0,h:200,points:[{x:150,z:150},{x:250,z:150},{x:250,z:250},{x:150,z:250}]}];
 assert.ok(checkRoomFit(s).some(i=>i.kind==='door'));
});
test('furniture suggestions preserve required sizes and source snapshot',()=>{
 const s=snapshot();s.scene.items=[];s.required=[{type:'desk',w:80,d:50,h:80}];
 const before=JSON.stringify(s),result=suggestRoomLayout(s,'furnish');assert.equal(result.ok,true);assert.equal(JSON.stringify(s),before);
 for(const option of result.options){assert.equal(option.moves[0].w,80);assert.equal(option.moves[0].d,50);}
 s.required=[{type:'desk',w:800,d:500,h:80}];assert.equal(suggestRoomLayout(s,'furnish').reason,'no-fit');
});
test('locked and anchored furniture is never moved',()=>{
 const s=snapshot();s.scene.items[0].locked=true;assert.equal(suggestRoomLayout(s,'rearrange').reason,'no-items');
 s.scene.items[0].locked=false;s.scene.items[0].hold={wall:1};assert.equal(suggestRoomLayout(s,'rearrange').reason,'no-items');
});
test('optional furniture can be omitted while required pieces are preserved',()=>{
 const s=snapshot();s.scene.items=[];s.required=[{type:'desk',w:80,d:50,h:80}];s.optional=[{type:'wardrobe',w:800,d:800,h:200}];
 const result=suggestRoomLayout(s,'furnish');assert.equal(result.ok,true);assert.deepEqual(result.options[0].omitted,['wardrobe']);assert.equal(result.options[0].moves.length,1);
 s.required=[];const empty=suggestRoomLayout(s,'furnish');assert.equal(empty.ok,false);assert.deepEqual(empty.blockedItems,['wardrobe']);
});
test('operating clearances follow the proposed pose and are checked during rearrangement',()=>{
 const s=snapshot();s.preferences={desk:0};
 s.itemSwings={1:[{elev:0,h:80,points:[{x:160,z:225},{x:240,z:225},{x:240,z:500},{x:160,z:500}]}]};
 assert.ok(checkRoomFit(s).some(issue=>issue.kind==='operation'));
 assert.equal(checkRoomFit(s,[{...item,z:80}]).some(issue=>issue.kind==='operation'),false);
 const result=suggestRoomLayout(s,'rearrange');assert.equal(result.ok,true);
 for(const option of result.options)assert.deepEqual(checkRoomFit(s,option.moves),[]);
});
