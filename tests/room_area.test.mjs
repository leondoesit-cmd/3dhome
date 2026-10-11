import test from 'node:test';
import assert from 'node:assert/strict';
import {roomClearArea,floorClearAreas} from '../js/room_area.js';
function fixture(){
 const nodes=[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}];
 const walls=nodes.map((_,i)=>({id:i+1,a:i,b:(i+1)%4,thickness:[10,20,30,40][i]}));
 const room={key:'1,2,3,4',pts:nodes.slice(),area:120000};
 const state={nodes,walls,openings:[],items:[],roomMeta:{[room.key]:{hid:'r',name:'Original',floorTex:'custom'}},workspace:{id:'p',activeFloor:'f',guidance:{rooms:[{id:'entry',name:'Original',type:'bedroom',floorId:'f',roomHid:'r'}]}}};
 return {state,room};
}

test('clear floor area uses individual wall faces and includes furniture without mutating state',()=>{
 const {state,room}=fixture();state.items.push({type:'sofa',x:100,z:100});
 const before=JSON.stringify(state);
 assert.equal(roomClearArea(state,room).area,10.36);
 assert.equal(JSON.stringify(state),before);
 state.walls.forEach(w=>{[w.a,w.b]=[w.b,w.a];});
 assert.equal(roomClearArea(state,room).area,10.36);
});
test('voids and interior wall solids remain unresolved',()=>{
 const {state,room}=fixture();
 state.slabOpenings=[{id:'far',x:5000,z:5000,w:40,d:40}];
 assert.equal(roomClearArea(state,room).area,10.36);
 state.slabOpenings=[{id:'void',x:200,z:150,w:40,d:40}];
 assert.equal(roomClearArea(state,room).reason,'voids');state.slabOpenings=[];
 state.nodes.push({x:100,z:100},{x:200,z:100});
 state.walls.push({id:5,a:4,b:5,thickness:10});
 assert.equal(roomClearArea(state,room).reason,'solids');
 state.nodes[4].z=state.nodes[5].z=1000;
 assert.equal(roomClearArea(state,room).area,10.36);
});
test('semantic outdoor types and unclassified rooms stay separate',()=>{
 const {state,room}=fixture();
 assert.equal(floorClearAreas(state,[room]).unclassified,10.36);
 state.roomMeta[room.key].roomType='balcony';
 assert.equal(floorClearAreas(state,[room]).outdoor,10.36);
 state.roomMeta[room.key].roomType='bedroom';
 const report=floorClearAreas(state,[room]);assert.equal(report.indoor,10.36);assert.equal(report.unresolved,0);
 state.walls[0].kind='half';assert.equal(floorClearAreas(state,[room]).unresolved,1);
});
test('overlapping derived rooms cannot be counted twice',()=>{
 const {state,room}=fixture();const report=floorClearAreas(state,[room,room]);
 assert.equal(report.unresolved,2);assert.equal(report.unclassified,0);
});
