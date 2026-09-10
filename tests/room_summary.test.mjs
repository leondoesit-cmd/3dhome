import test from 'node:test';
import assert from 'node:assert/strict';
import { roomMeasurements } from '../js/room_summary.js';
import { roomDetailsCommand } from '../js/commands/room_details.js';
import { executeCommand } from '../js/commands/executor.js';
function fixture(){
 const nodes=[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}];
 const walls=nodes.map((_,i)=>({id:i+1,a:i,b:(i+1)%4,thickness:[10,20,30,40][i]}));
 const room={key:'1,2,3,4',pts:nodes,area:120000};
 const state={nodes,walls,openings:[],items:[],roomMeta:{[room.key]:{hid:'r',name:'Original',floorTex:'custom'}},workspace:{id:'p',activeFloor:'f',guidance:{rooms:[{id:'entry',name:'Original',type:'bedroom',floorId:'f',roomHid:'r'}]}}};
 return {state,room};
}
test('room dimensions use opposite wall faces, preserve decimals and do not mutate',()=>{
 const {state,room}=fixture(),before=JSON.stringify(state);
 assert.deepEqual(roomMeasurements(state,room).interior,{width:370,depth:280});
 assert.equal(JSON.stringify(state),before);
 state.nodes[1].x=state.nodes[2].x=400.35;room.area=400.35*300;
 assert.equal(roomMeasurements(state,room).interior.width,370.35);
});
test('nonrectangular and partial-height boundaries do not claim rectangular interior dimensions',()=>{
 const {state,room}=fixture();room.area=90000;
 assert.equal(roomMeasurements(state,room).interior,null);
 room.area=120000;state.walls[0].kind='roomDivider';
 assert.equal(roomMeasurements(state,room).interior,null);
});
test('room identity and finish edits preserve assignment and reject invalid or read-only edits',()=>{
 const {state,room}=fixture(),env={state,services:{detectRooms:()=>[room]}};
 const result=executeCommand(roomDetailsCommand,{roomKey:room.key,name:'Study',roomType:'kitchen',floor:'tiles',wall:0x123456},env,{history:false});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(state.roomMeta[room.key].floorTex,undefined);
 assert.equal(state.workspace.guidance.rooms[0].name,'Study');assert.equal(state.workspace.guidance.rooms[0].type,'kitchen');
 const before=JSON.stringify(state);
 assert.equal(executeCommand(roomDetailsCommand,{roomKey:room.key,floor:'invalid'},env,{history:false}).ok,false);
 assert.equal(JSON.stringify(state),before);
 state.workspace.role='viewer';assert.equal(roomDetailsCommand.prepare({roomKey:room.key,name:'Oops'},env).reason,'READ_ONLY');
});
test('reversing wall endpoints preserves dimensions and material datums affect the measured faces',()=>{
 const {state,room}=fixture();const first=roomMeasurements(state,room);
 state.walls.forEach(w=>{[w.a,w.b]=[w.b,w.a];});
 assert.deepEqual(roomMeasurements(state,room),first);
 const original=fixture();original.state.walls[0].datum='interior';
 assert.equal(roomMeasurements(original.state,original.room).interior.depth,285);
});
test('layout requirements and item-specific access preferences are validated document metadata',()=>{
 const {state,room}=fixture(),env={state,services:{detectRooms:()=>[room]}};
 const value={required:['bed'],optional:['wardrobe'],access:{bed:65,wardrobe:90}};
 const result=executeCommand(roomDetailsCommand,{roomKey:room.key,layoutPreferences:value},env,{history:false});
 assert.equal(result.ok,true);assert.equal(state.roomMeta[room.key].layoutPreferences.access.wardrobe,90);
 value.access.wardrobe=5;assert.equal(state.roomMeta[room.key].layoutPreferences.access.wardrobe,90);
 assert.equal(roomDetailsCommand.prepare({roomKey:room.key,layoutPreferences:{required:['bed'],optional:[],access:{bed:-1}}},env).reason,'INVALID_LAYOUT_PREFERENCES');
});
