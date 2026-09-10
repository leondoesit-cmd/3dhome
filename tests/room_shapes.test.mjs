import test from 'node:test';
import assert from 'node:assert/strict';
import {shapePoints,validLoop} from '../js/room_shapes.js';
import {roomShapeCommand} from '../js/commands/room_shape.js';
import {executeCommand} from '../js/commands/executor.js';
import {polygonDifferenceArea} from '../js/polygon_area.js';
import {roomShapeEditCommand} from '../js/commands/room_shape_edit.js';
const blank=()=>({nodes:[],walls:[],openings:[],items:[],roomMeta:{},workspace:{},idc:1});
const params={type:'L',x:0,z:0,width:400,depth:400,arm:150,roomType:'living'};
test('L T U are single simple closed boundaries without internal rectangle seams',()=>{
 for(const type of ['L','T','U']){
  const state=blank(),points=shapePoints(type,params);assert.equal(validLoop(points),true);
  const result=executeCommand(roomShapeCommand,{...params,type},{state,services:{detectRooms:()=>[]}},{history:false});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(state.walls.length,points.length);
  assert.equal(Object.values(state.roomMeta)[0].shape.type,type);
 }
 assert.equal(polygonDifferenceArea([shapePoints('L',params)]),97500);
});
test('self intersections, repeated vertices and zero-size loops are refused',()=>{
 assert.equal(validLoop([{x:0,z:0},{x:100,z:100},{x:0,z:100},{x:100,z:0}]),false);
 assert.equal(shapePoints('U',{...params,arm:250}),null);
 assert.equal(validLoop([{x:0,z:0},{x:100,z:0},{x:0,z:0},{x:0,z:100}]),false);
});
test('overlap and opening-bearing subdivision refuse before mutation',()=>{
 const state=blank(),before=JSON.stringify(state);
 const room={key:'a',pts:shapePoints('L',params)};
 assert.equal(roomShapeCommand.prepare(params,{state,services:{detectRooms:()=>[room]}}).reason,'ROOM_OVERLAPS');assert.equal(JSON.stringify(state),before);
 state.nodes=[{x:-100,z:0},{x:500,z:0}];state.walls=[{id:1,a:0,b:1,thickness:10}];state.openings=[{id:2,wall:1,s:100,width:80}];
 assert.equal(roomShapeCommand.prepare(params,{state,services:{detectRooms:()=>[]}}).reason,'SHAPE_OPENING');
});

test('authored shape dimensions preserve identity and reject growth through loose walls',()=>{
 const state=blank();executeCommand(roomShapeCommand,params,{state,services:{detectRooms:()=>[]}},{history:false});
 const key=Object.keys(state.roomMeta)[0];state.roomMeta[key].hid='stable-room';
 const room=()=>({key,pts:state.roomMeta[key].shape.cornerNodes.map(i=>state.nodes[i])});
 const env={state,services:{detectRooms:()=>[room()]}};
 const request={roomKey:key,width:500,depth:400,arm:150};
 assert.equal(executeCommand(roomShapeEditCommand,request,env,{history:false}).ok,true);
 assert.equal(state.roomMeta[key].hid,'stable-room');assert.equal(state.roomMeta[key].shape.parameters.width,500);
 const a=state.nodes.length;state.nodes.push({x:550,z:20},{x:550,z:120});state.walls.push({id:999,a,b:a+1,thickness:10});
 const before=JSON.stringify(state);
 assert.equal(roomShapeEditCommand.prepare({...request,width:600},env).reason,'ROOM_OVERLAPS');
 assert.equal(JSON.stringify(state),before);
});
