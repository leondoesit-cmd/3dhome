import test from 'node:test';
import assert from 'node:assert/strict';
import {roomResizeCommand} from '../js/commands/room_resize.js';
import {executeCommand,prepareCommand,executePrepared} from '../js/commands/executor.js';
import {roomMeasurements} from '../js/room_summary.js';
function rig(){
 const state={nodes:[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}],walls:[
 {id:1,a:0,b:1,thickness:10},{id:2,a:1,b:2,thickness:20},{id:3,a:2,b:3,thickness:30},{id:4,a:3,b:0,thickness:40}],
 openings:[],items:[],roomMeta:{'1,2,3,4':{}},workspace:{activeFloor:'f',role:'owner'}};
 const face=()=>({key:'1,2,3,4',pts:state.nodes.slice(0,4),area:(state.nodes[1].x-state.nodes[0].x)*(state.nodes[3].z-state.nodes[0].z)});
 const env={state,services:{detectRooms:()=>[face()]}};
 const resize=(width,depth)=>executeCommand(roomResizeCommand,{roomKey:'1,2,3,4',width,depth},env,{history:false});
 return {state,env,face,resize};
}
test('exact dimensions preserve decimals, wall thickness and semantic identity',()=>{
 const r=rig();r.state.roomMeta['1,2,3,4']={name:'Survey',hid:'r'};
 const result=r.resize(321.75,245.125);assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(roomMeasurements(r.state,r.face()).interior,{width:321.75,depth:245.125});
 assert.equal(r.state.nodes.length,4);assert.equal(r.state.roomMeta['1,2,3,4'].hid,'r');
 assert.deepEqual(r.state.walls.map(w=>w.thickness),[10,20,30,40]);
});
test('an opening that no longer fits refuses before any mutation',()=>{
 const r=rig();r.state.openings=[{id:5,wall:1,s:250,width:80,height:210,sill:0}];const before=JSON.stringify(r.state);
 assert.equal(r.resize(100,280).reason,'RESIZE_OPENING');assert.equal(JSON.stringify(r.state),before);
});
test('shared corners remain fixed, the free edge moves and opening world station survives',()=>{
 const r=rig();r.state.nodes.push({x:800,z:0},{x:800,z:300});
 r.state.walls.push({id:6,a:1,b:4,thickness:10},{id:7,a:4,b:5,thickness:10},{id:8,a:5,b:2,thickness:10});
 r.state.openings=[{id:5,wall:1,s:200,width:80,height:210,sill:0}];
 const fixed=JSON.stringify(r.state.nodes.slice(1,3));
 assert.equal(r.resize(420,280).ok,true);assert.equal(JSON.stringify(r.state.nodes.slice(1,3)),fixed);
 assert.equal(r.state.nodes[0].x+r.state.openings[0].s,200);
 const before=JSON.stringify(r.state);assert.equal(r.resize(420,320).reason,'ROOM_SIDE_SHARED');assert.equal(JSON.stringify(r.state),before);
});
test('contents, constraints, locks and invalid dimensions refuse without edits',()=>{
 for(const [setup,reason]of [[s=>s.items.push({id:8}),'RESIZE_CONTENTS'],[s=>s.wallCons=[{}],'RESIZE_CONSTRAINTS'],[s=>s.roomMeta['1,2,3,4'].locked=true,'ROOM_LOCKED']]){
  const r=rig();setup(r.state);const before=JSON.stringify(r.state);assert.equal(r.resize(500,300).reason,reason);assert.equal(JSON.stringify(r.state),before);
 }
 const r=rig();assert.equal(r.resize(0,300).reason,'INVALID_ROOM_SIZE');
});
test('newly added content invalidates a prepared resize',()=>{
 const r=rig(),prepared=prepareCommand(roomResizeCommand,{roomKey:'1,2,3,4',width:500,depth:300},r.env);
 assert.equal(prepared.ok,true);r.state.items.push({id:9});
 const before=JSON.stringify(r.state);const result=executePrepared(prepared,r.env,{history:false});
 assert.equal(result.ok,false);assert.equal(JSON.stringify(r.state),before);
});
test('nearby independent walls cannot be swallowed or overlapped by a resize',()=>{
 const r=rig();r.state.nodes.push({x:500,z:20},{x:500,z:280});r.state.walls.push({id:9,a:4,b:5,thickness:20});
 const before=JSON.stringify(r.state);assert.equal(r.resize(600,280).reason,'RESIZE_NEIGHBOUR');assert.equal(JSON.stringify(r.state),before);
 assert.equal(r.resize(430,280).ok,true);
});
test('a resize preserves space for the adjacent wall at an opening jamb',()=>{
 const r=rig();r.state.openings=[{id:5,wall:1,s:250,width:80,height:210,sill:0}];
 // The new reference end is 295; the inner face of its 20cm wall is 285.
 // The opening ends at 290, so a reference-line-only check would accept it.
 const before=JSON.stringify(r.state);assert.equal(r.resize(265,280).reason,'RESIZE_OPENING');assert.equal(JSON.stringify(r.state),before);
});
