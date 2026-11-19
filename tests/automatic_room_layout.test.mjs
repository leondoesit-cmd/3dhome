import test from 'node:test';
import assert from 'node:assert/strict';
import {checkRoomFit, suggestRoomLayout, footprint, inside} from '../js/layout_analysis.js';
import {defaultRequiredItems} from '../js/layout_preferences.js';
import {S} from '../js/state.js';
import {generateLayouts,applyLayout} from '../js/layouts.js';

function installPlannerTestDOM() {
  const noop=()=>{}, classList={add:noop,remove:noop,toggle:noop};
  globalThis.window={addEventListener:noop,removeEventListener:noop,dispatchEvent:noop,
    matchMedia:()=>({matches:false,addEventListener:noop,removeEventListener:noop}),location:{href:'http://localhost/'}};
  globalThis.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
    createElement:()=>({getContext:()=>null,style:{},classList,addEventListener:noop,appendChild:noop}),
    addEventListener:noop,body:{classList}};
  globalThis.CustomEvent=class{constructor(type,params){this.type=type;Object.assign(this,params);}};
  globalThis.requestAnimationFrame=()=>0;
  globalThis.cancelAnimationFrame=noop;
}

function plan(vertices, angle=0) {
  const c=Math.cos(angle),s=Math.sin(angle);
  const rotate=([x,z])=>({x:x*c-z*s,z:x*s+z*c});
  const pts=vertices.map(rotate);
  const walls=pts.map((p,i)=>({id:i+1,physical:true,thickness:16,points:[p,pts[(i+1)%pts.length]]}));
  const room={key:'layout',cx:pts.reduce((n,p)=>n+p.x,0)/pts.length,cz:pts.reduce((n,p)=>n+p.z,0)/pts.length,pts,wallIds:walls.map(w=>w.id)};
  return {roomKey:room.key,scene:{rooms:[room],walls,items:[]},searchStep:32};
}
function assertWallContact(item,walls) {
  const [left,right]=footprint(item);
  const touches=walls.some(({points:[a,b],thickness})=>{
    const l=Math.hypot(b.x-a.x,b.z-a.z);
    return [left,right].every(p=>{
      const u=((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/l;
      const dist=Math.abs((p.x-a.x)*(b.z-a.z)-(p.z-a.z)*(b.x-a.x))/l;
      return u>=0 && u<=l && Math.abs(dist-thickness/2)<=2;
    });
  });
  assert.ok(touches,JSON.stringify(item)+' back must touch the finished face');
}
test('furnishing an oblique L-shaped room puts each bed head on a physical wall facing into clear floor',()=>{
  const s=plan([[0,0],[420,0],[420,190],[260,190],[260,420],[0,420]],Math.PI/7);
  s.required=[{type:'bed',w:140,d:190,h:75}];
  const result=suggestRoomLayout(s,'furnish');assert.ok(result.ok);
  for(const {moves} of result.options){
    assertWallContact(moves[0],s.scene.walls);
    assert.ok(footprint(moves[0],60).every(p=>inside(p,s.scene.rooms[0].pts)));
    assert.deepEqual(checkRoomFit(s,moves),[]);
  }
});
test('a furnishing suggestion places a desk chair facing the desk across a usable gap',()=>{
  const s=plan([[0,0],[420,0],[420,360],[0,360]]);
  s.required=[{type:'desk',w:140,d:70,h:75},{type:'chair',w:48,d:50,h:90}];
  const result=suggestRoomLayout(s,'furnish');assert.ok(result.ok);
  for(const {moves:[desk,chair]} of result.options){
    assertWallContact(desk,s.scene.walls);
    const a=chair.rot*Math.PI/180,dx=desk.x-chair.x,dz=desk.z-chair.z,length=Math.hypot(dx,dz);
    assert.ok((-Math.sin(a)*dx+Math.cos(a)*dz)/length>.99);
    assert.ok(length>=(chair.d+desk.d)/2-.1&&length<=(chair.d+desk.d)/2+25);
  }
});
test('automatic kitchen units share a contiguous wall run and individually face the aisle',()=>{
  const s=plan([[0,0],[570,0],[570,350],[0,350]]);
  s.required=['fridge','sink','cooktop'].map(type=>({type,w:60,d:60,h:90}));
  const result=suggestRoomLayout(s,'furnish');assert.ok(result.ok);
  for(const {moves} of result.options){
    for(const unit of moves){assertWallContact(unit,s.scene.walls);assert.equal(unit.rot,moves[0].rot);}
    const distances=moves.flatMap((v,i)=>moves.slice(i+1).map(w=>Math.hypot(v.x-w.x,v.z-w.z))).sort((a,b)=>a-b);
    assert.ok(distances.slice(0,2).every(d=>Math.abs(d-60)<1));
  }
});
test('bathrooms use a bathroom basin and dining defaults include a chair',()=>{
  assert.ok(defaultRequiredItems('bathroom').includes('vanity'));
  assert.ok(defaultRequiredItems('dining').includes('chair'));
});
test('workspace alternatives keep supports, riders and wall-held items together and respect locked state at apply',()=>{
  S.nodes=[{x:0,z:0},{x:520,z:0},{x:520,z:320},{x:0,z:320}];
  S.walls=S.nodes.map((p,i)=>({id:i+1,a:i,b:(i+1)%4,thickness:12,height:270}));
  S.openings=[];
  const host={id:1,type:'nightstand',x:44,z:36,rot:0,w:60,d:60,h:55,hold:{wall:1}};
  const lamp={id:2,type:'tableLamp',x:44,z:36,rot:0,w:15,d:15,h:30,elev:55,on:1};
  const table={id:3,type:'table',x:260,z:160,rot:0,w:120,d:75,h:76};
  S.items=[host,lamp,table];
  const before=structuredClone(S.items);
  for(const option of generateLayouts()){
    applyLayout(option);
    assert.deepEqual(host,before[0]);assert.deepEqual(lamp,before[1]);
    Object.assign(table,before[2]);
  }
});
import { resolvePlacementIntent, placementBatchFitsScene } from '../js/placement_resolver.js';
test('semantic wall placement follows a curved wall without penetrating any neighboring chord',()=>{
  const boundary=Array.from({length:21},(_,i)=>{const x=20*i;return {x,z:20*((x-200)/200)**2};});
  const room={key:'curved',pts:[...boundary,{x:400,z:350},{x:0,z:350}],cx:200,cz:170,wallIds:[1]};
  const wall={id:1,points:boundary,curved:true,physical:true,thickness:16};
  const scene={rooms:[room],walls:[wall],items:[{id:1,type:'sofa',x:200,z:150,rot:0,w:180,d:80,h:80}]};
  const result=resolvePlacementIntent({itemId:1,wall:'top',face:'into-room'},scene);
  assert.equal(result.ok,true);
  const move=result.moves[0];
  assert.ok(Math.abs(move.z-50)<6);
  assert.ok(placementBatchFitsScene(scene,[move]));
  assert.equal(placementBatchFitsScene(scene,[{...move,z:move.z-2}]),false);
});
test('an AI wall pose cannot block a door approach or a leaf through its vertical span',()=>{
  const s=plan([[0,0],[420,0],[420,300],[0,300]]);
  const desk={id:77,type:'desk',x:210,z:140,rot:0,w:70,d:60,h:80};
  s.scene.items=[desk];
  s.scene.walls[0].openingZones=[{elev:0,h:205,points:[{x:156,z:0},{x:264,z:0},{x:264,z:70},{x:156,z:70}]}];
  assert.equal(resolvePlacementIntent({itemId:77,wall:'top',face:'into-room'},s.scene).ok,false);
  desk.elev=215;
  assert.equal(resolvePlacementIntent({itemId:77,wall:'top',face:'into-room'},s.scene).ok,true);
});
test('furnishing an open room or a rotated room seats a chair at its desk',()=>{
  for(const angle of [0,Math.PI/7]){
    const s=plan([[0,0],[500,0],[500,420],[0,420]],angle);
    if(!angle)s.scene.walls=[];
    s.required=[{type:'desk',w:140,d:70,h:75},{type:'officeChair',w:55,d:58,h:90}];
    const result=suggestRoomLayout(s,'furnish');assert.ok(result.ok);
    for(const {moves:[desk,chair]} of result.options){
      const a=desk.rot*Math.PI/180,dx=chair.x-desk.x,dz=chair.z-desk.z;
      assert.ok((-Math.sin(a)*dx+Math.cos(a)*dz)/Math.hypot(dx,dz)>.99);
      assert.ok(Math.cos((chair.rot-desk.rot)*Math.PI/180)<-.99999);
      if(angle)assertWallContact(desk,s.scene.walls);
    }
  }
});
test('furnishing leaves bedside access and pairs the nightstands when the floor is clear',()=>{
  const s=plan([[0,0],[620,0],[620,480],[0,480]],Math.PI/7);
  s.required=[{type:'bed',w:150,d:205,h:90},{type:'nightstand',w:44,d:40,h:52}];
  const result=suggestRoomLayout(s,'furnish');assert.ok(result.ok);
  const {moves}=result.options[0],bed=moves[0],stands=moves.filter(i=>i.type==='nightstand');
  assert.equal(stands.length,2);
  const a=bed.rot*Math.PI/180;
  assert.ok(stands.every(p=>Math.abs(-Math.sin(a)*(p.x-bed.x)+Math.cos(a)*(p.z-bed.z)-(p.d-bed.d)/2)<3));
  assert.ok(Math.hypot(stands[0].x-stands[1].x,stands[0].z-stands[1].z)>bed.w);
});
test('the room furnish batch creates distinct independently selectable pieces with one explicit set id',async()=>{
  installPlannerTestDOM();
  const {beforePlacementCommandBatch,afterPlacementCommandBatch,cleanupPlacementCommandBatch}=await import('../js/interaction/layout_drag.js');
  const {executeCommandBatch,itemPlaceCommand}=await import('../js/commands/index.js');
  const {layoutSetId}=await import('../js/group_frame.js');
  const s=plan([[0,0],[520,0],[520,420],[0,420]]);
  S.items=[];S.idc=100;S.walls=[];S.openings=[];S.nodes=[];
  const itemCatalog={table:{w:130,d:80,h:75},chair:{w:46,d:50,h:85}};
  s.required=Object.entries(itemCatalog).map(([type,spec])=>({type,...spec}));
  const result=suggestRoomLayout(s,'furnish');assert.ok(result.ok);
  const {moves}=result.options[0];assert.equal(moves.length,5);
  const requests=moves.map(({type,x,z,rot})=>({command:itemPlaceCommand,params:{type,x,z,rot}}));
  const batch=executeCommandBatch(requests,{domain:'planner',state:S,itemCatalog,services:{
    beforeCommandBatchApply:beforePlacementCommandBatch,afterCommandBatchApply:afterPlacementCommandBatch,cleanupCommandBatchApply:cleanupPlacementCommandBatch
  }},{history:false});
  assert.equal(batch.ok,true,JSON.stringify(batch));assert.equal(new Set(S.items.map(it=>it.id)).size,5);
  const set=layoutSetId(S.items[0]);assert.notEqual(set,undefined);
  assert.ok(S.items.every(i=>i.groupId==null&&i.on==null&&layoutSetId(i)===set));
});
test('AI beside places a chair opposite a wall-backed desk without attaching the chair to the desk wall',()=>{
  const s=plan([[0,0],[500,0],[500,350],[0,350]]);
  const desk={id:3,type:'desk',x:240,z:43,w:140,d:70,h:75,rot:0,hold:{wall:1}};
  const chair={id:4,type:'officeChair',x:100,z:200,w:50,d:52,h:90,rot:0};
  s.scene.items=[desk,chair];
  const r=resolvePlacementIntent({itemId:4,beside:{itemId:3}},s.scene);
  assert.ok(r.ok);assert.equal(r.moves[0].holdWallId,null);
  assert.equal(r.moves[0].rot,180);assert.equal(r.moves[0].x,desk.x);
  assert.equal(r.moves[0].z,desk.z+(desk.d+chair.d)/2+12);
  chair.hold={wall:2,gap:0,side:1};
  assert.equal(resolvePlacementIntent({itemId:4,beside:{itemId:3}},s.scene).ok,false);
});
test('furnishing a living room with a mounted TV faces the sofa toward the screen',()=>{
  const s=plan([[0,0],[550,0],[550,390],[0,390]],Math.PI/7);
  const a=Math.PI/7,cos=Math.cos(a),sin=Math.sin(a);
  const x=186,z=12;s.scene.items=[{id:1,type:'tvWall',x:x*cos-z*sin,z:x*sin+z*cos,w:100,d:8,h:65,elev:120,rot:a*180/Math.PI,hold:{wall:1}}];
  s.required=[{type:'sofa',w:184,d:90,h:85}];
  const r=suggestRoomLayout(s,'furnish');assert.ok(r.ok);
  const tv=s.scene.items[0];
  for(const {moves:[sofa]} of r.options){
    assertWallContact(sofa,s.scene.walls);
    const angle=sofa.rot*Math.PI/180,dx=tv.x-sofa.x,dz=tv.z-sofa.z;
    assert.ok((-Math.sin(angle)*dx+Math.cos(angle)*dz)/Math.hypot(dx,dz)>.9);
  }
});
test('every room furnish option retains a 60 cm route through the furnished room to its neighbor',async()=>{
  const {layoutWalkableRooms}=await import('../js/layout_analysis.js');
  const s=plan([[0,0],[400,0],[400,200],[0,200]]);
  const first=s.scene.rooms[0];
  const pts=[{x:400,z:0},{x:650,z:0},{x:650,z:200},{x:400,z:200}];
  s.scene.rooms.push({key:'next',cx:525,cz:100,wallIds:[2,5,6,7],pts});
  s.scene.walls.push(...pts.slice(0,3).map((p,i)=>({id:i+5,physical:true,thickness:16,points:[p,pts[i+1]]})));
  s.access={width:60,doors:[{id:11,wall:4,s:100,width:90,center:{x:0,z:100}},{id:12,wall:2,s:100,width:90,center:{x:400,z:100}}]};
  const table={type:'table',w:145,d:84,h:75};s.preferences={table:0};
  assert.deepEqual(layoutWalkableRooms(s),[first.key,'next']);
  assert.deepEqual(layoutWalkableRooms(s,[{...table,id:1,x:200,z:100,rot:90}]),[first.key]);
  s.required=[table];
  const result=suggestRoomLayout(s,'furnish');assert.ok(result.ok);
  for(const {moves} of result.options)assert.deepEqual(layoutWalkableRooms(s,moves),[first.key,'next']);
});
test('furnish and workspace proposals apply their previewed poses in an occupied office',async()=>{
  installPlannerTestDOM();
  const {roomFitSnapshot}=await import('../js/ui_layout_tools.js');
  const {previewPlannerCommand,executePlannerProposal}=await import('../js/interaction/wall_edit.js');
  const {detectRooms}=await import('../js/geometry.js');
  const {FURN,mkItem}=await import('../js/furniture.js');
  S.nodes=[{x:0,z:0},{x:540,z:0},{x:540,z:460},{x:0,z:460}];
  S.walls=S.nodes.map((_,i)=>({id:i+1,a:i,b:(i+1)%4,height:270,thickness:12}));
  S.openings=[{id:10,type:'door',wall:4,s:230,width:90,height:205,sill:0}];
  S.items=[];S.idc=100;S.roomMeta={};
  const key=detectRooms()[0].key;S.roomMeta[key]={roomType:'office',name:'Office'};
  const shelf=mkItem('bookshelf',100,28,0);shelf.z=6+shelf.d/2;shelf.locked=true;S.items.push(shelf);
  const s=roomFitSnapshot(key);
  s.required=['desk','officeChair'].map(type=>({type,w:FURN[type].w,d:FURN[type].d,h:FURN[type].h}));
  const furnished=suggestRoomLayout(s,'furnish');assert.ok(furnished.ok,JSON.stringify(furnished));
  const moves=furnished.options[0].moves,requests=moves.map(it=>previewPlannerCommand('item.place',{type:it.type,x:it.x,z:it.z,rot:it.rot,w:it.w,d:it.d,h:it.h}));
  assert.ok(requests.every(q=>q.ok),JSON.stringify(requests));
  const applied=executePlannerProposal({commands:requests},{postValidate:()=>!checkRoomFit(roomFitSnapshot(key)).length});
  assert.ok(applied.ok,JSON.stringify(applied));
  const coords=it=>[it.x,it.z,it.rot];
  assert.deepEqual(S.items.slice(1).map(coords),moves.map(coords));
  const loose=mkItem('table',330,280,0);S.items.push(loose);
  const previous=S.items.map(coords),options=generateLayouts(),alt=options.find(o=>o.id!=='original');
  assert.ok(alt,'a loose meeting table can be rearranged beside the fixed work area');
  assert.equal(applyLayout(alt),true);
  assert.deepEqual(S.items.map(coords),alt.items.map(coords));
  assert.deepEqual(S.items.slice(0,3).map(coords),previous.slice(0,3));
  assert.notDeepEqual(coords(loose),previous[3]);
});
