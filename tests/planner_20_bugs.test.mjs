import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parse} from '../vendor/acorn/acorn.mjs';
import {moduleSource as moduleText} from './helpers/module_source.mjs';
import {S} from '../js/state.js';
import {refLocked} from '../js/user_layers.js';
import {prepareItemDuplicate,applyItemDuplicate} from '../js/commands/item_duplicate.js';
import {toScheduleCSV} from '../js/exports_pro.js';
import {roomClearArea} from '../js/room_area.js';
import {parseLength} from '../js/planning_units.js';
import {dockFaces} from '../js/room_dock.js';
import {resolveNode} from '../js/room_graph.js';
import {roomSplitCommand} from '../js/commands/room_split.js';
import {roomMergeCommand} from '../js/commands/room_merge.js';
import {applyPlanOp} from '../js/plan_sync.js';
import {patternFill} from '../js/plan_patterns.js';
import {shapePoints} from '../js/room_shapes.js';
import {holesForRoom} from '../js/slab_openings.js';
import {drawingSVG,drawingDXF} from '../js/drawing_export.js';
import {solveRoomRect} from '../js/room_cons.js';
import {detectRooms} from '../js/geometry.js';

// UI entry points and GPU materials have browser-only dependencies. Execute
// their actual parsed functions with controlled services, rather than testing
// copies of the algorithm or merely matching the source text.
const modules=new Map();
function moduleSource(file){
  if(!modules.has(file)){
    const source=file==='js/interaction.js'||file==='js/view3d.js'?moduleText(file):readFileSync(new URL('../'+file,import.meta.url),'utf8');
    modules.set(file,{source,ast:parse(source,{ecmaVersion:'latest',sourceType:'module'})});
  }
  return modules.get(file);
}
function nodesMatching(node,predicate,out=[]){
  if(!node||typeof node!=='object')return out;
  if(predicate(node))out.push(node);
  for(const value of Object.values(node)){
    if(Array.isArray(value))value.forEach(n=>nodesMatching(n,predicate,out));
    else if(value&&typeof value==='object')nodesMatching(value,predicate,out);
  }
  return out;
}
function functionSource(file,name){
  const {source,ast}=moduleSource(file);
  const node=nodesMatching(ast,n=>n.type==='FunctionDeclaration'&&n.id.name===name)[0];
  assert.ok(node,`${file}: ${name} exists`);
  return source.slice(node.start,node.end);
}
function loadFunction(file,name,services){
  return runInNewContext('('+functionSource(file,name)+')',services);
}
const ids=list=>Array.from(list,it=>it.id);
function fixture(){
  const nodes=[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}];
  const walls=nodes.map((_,i)=>({id:i+1,a:i,b:(i+1)%4,thickness:10,height:270}));
  const room={key:'1,2,3,4',pts:nodes.slice(),area:120000,cx:200,cz:150};
  const state={nodes,walls,items:[],openings:[],roomMeta:{},wallCons:[],roomCons:[],
    mep:{nodes:[],runs:[]},slabOpenings:[],workspace:{},idc:10};
  return {state,room,env:{state,services:{detectRooms:()=>[room]}}};
}

test('Bug 1: bulk delete preserves individually pinned and user-layer locked items',()=>{
  S.workspace={userLayers:[{id:'locked-layer',locked:true,vis:'show'}]};
  const layerLocked={id:1,ulayer:'locked-layer',locked:false};
  const pinned={id:2,locked:true},free={id:3},unselected={id:4};
  S.items=[layerLocked,pinned,free,unselected];
  const messages=[];
  const remove=loadFunction('js/interaction.js','applyRemove',{
    S,refLocked,orphanChildren:()=>{},flash:message=>messages.push(message),t:(_key,params)=>params.n,
  });
  assert.equal(remove({kind:'items',refs:[layerLocked,pinned,free]}),true);
  assert.deepEqual(ids(S.items),[1,2,4]);
  assert.deepEqual(messages,[2]);
});

test('Bug 2: duplicates detach from external hosts and remap an entire stack regardless of source order',()=>{
  const table={id:1,x:10,z:20},lamp={id:2,x:10,z:20,on:1},shade={id:3,x:10,z:20,on:2};
  for(const sourceIds of [[2],[3,2,1]]){
    const state={items:structuredClone([table,lamp,shade]),idc:100},before=structuredClone([table,lamp,shade]);
    const env={state},prepared=prepareItemDuplicate({sourceIds,offsetX:30,offsetZ:40},env);
    assert.equal(prepared.ok,true);
    const result=applyItemDuplicate(prepared.plan,env);
    assert.equal(result.ok,true);
    const copies=state.items.slice(3);
    assert.deepEqual(state.items.slice(0,3),before);
    if(copies.length===1)assert.equal(Object.hasOwn(copies[0],'on'),false);
    else {assert.equal(copies[0].on,copies[1].id);assert.equal(copies[1].on,copies[2].id);}
    copies.forEach(copy=>{assert.equal(copy.x,40);assert.equal(copy.z,60);});
  }
});

test('Bug 3: schedule CSV neutralizes all six formula prefixes while preserving numbers and quoting',()=>{
  S.openings=[];S.mep={nodes:[]};
  S.items=['=SUM(1,2)','+cmd','-cmd','@cmd','\tcmd','\rcmd','a,"b"'].map((type,id)=>({id,type,x:-25,z:0}));
  const result=toScheduleCSV();
  assert.ok(result.includes('"\'=SUM(1,2)"'));
  for(const prefix of ['+','-','@','\t'])assert.ok(result.includes("'"+prefix+'cmd'));
  assert.ok(result.includes('"\'\rcmd"'));
  assert.ok(result.includes('"a,""b"""'));
  assert.ok(result.includes(',-25,0'));
  assert.ok(!result.includes("'-25"));
});

test('Bug 4: distant arcs leave room clear area valid; intersecting arc solids remain unresolved',()=>{
  const {state,room}=fixture(),before=roomClearArea(state,room).area;
  state.nodes.push({x:1000,z:1000},{x:1100,z:1000});
  state.walls.push({id:5,a:4,b:5,thickness:10,bulge:1});
  const snapshot=JSON.stringify(state);
  assert.equal(roomClearArea(state,room).area,before);
  assert.equal(JSON.stringify(state),snapshot);
  state.nodes[4]={x:100,z:100};state.nodes[5]={x:200,z:100};
  assert.equal(roomClearArea(state,room).reason,'solids');
  // The circle itself misses the room, but a thick wall face touches it.
  state.nodes[4]={x:401,z:100};state.nodes[5]={x:501,z:100};state.walls.at(-1).thickness=20;
  assert.equal(roomClearArea(state,room).reason,'solids');
});

test('Bug 5: invalid explicit units fail instead of using the display unit',()=>{
  for(const unit of ['cm','m','ft'])for(const value of ['100km','50foo','3yards'])
    assert.ok(Number.isNaN(parseLength(value,unit)),`${value} / ${unit}`);
  assert.equal(parseLength('2','m'),200);
  assert.equal(parseLength('2cm','m'),2);
  assert.equal(parseLength('2 metres','ft'),200);
  assert.ok(Math.abs(parseLength(`5'-6"`,'cm')-167.64)<1e-9);
});

test('Bug 6: all arc encodings are excluded from docking and straight-wall subdivision',()=>{
  for(const curve of [{geometry:{type:'arc'}},{curve:{type:'arc'}},{bulge:.2},{bulge:-.2}]){
    const state={nodes:[{x:0,z:0},{x:200,z:0}],walls:[{id:1,a:0,b:1,...curve}],idc:2};
    assert.deepEqual(dockFaces(state),[]);
    const resolved=resolveNode(state,{x:100,z:0},{tol:1e-6});
    assert.equal(resolved.split,undefined);
    assert.equal(state.walls.length,1);
    assert.equal(state.walls[0].b,1);
  }
  const state={nodes:[{x:0,z:0},{x:200,z:0}],walls:[{id:1,a:0,b:1,bulge:0}],idc:2};
  assert.equal(dockFaces(state).length,1);
  assert.equal(resolveNode(state,{x:100,z:0},{tol:1e-6}).split,1);
  assert.equal(state.walls.length,2);
});

test('Bug 7: unrelated contents allow a split; each kind of room-local content blocks it',()=>{
  const {state,room,env}=fixture(),params={roomKey:room.key,axis:'x',offset:100};
  state.items=[{x:900,z:900}];state.mep={nodes:[{x:900,z:900}],runs:[{a:1,b:2}]};
  state.slabOpenings=[{x:900,z:900}];state.wallCons=[{wall:999}];state.roomCons=[{room:'other'}];
  const snapshot=JSON.stringify(state);
  assert.equal(roomSplitCommand.prepare(params,env).ok,true);
  assert.equal(JSON.stringify(state),snapshot);
  const localCases=[['items',{x:100,z:100}],['slabOpenings',{x:100,z:100}],
    ['mep.nodes',{x:100,z:100}],['wallCons',{wall:1}],['roomCons',{room:room.key}]];
  for(const [path,content] of localCases){
    const list=path==='mep.nodes'?state.mep.nodes:state[path];
    list.push(content);
    assert.equal(roomSplitCommand.prepare(params,env).reason,'SPLIT_CONTENTS',path);
    list.pop();
  }
});

test('Bug 8: failed merge restores the original wall and opening arrays without changing metadata',()=>{
  const {state}=fixture();state.openings=[{id:9,wall:2,s:50,width:80}];
  state.roomMeta={'1,2':{hid:'a'},'2,3,4':{hid:'b'}};
  const walls=state.walls,openings=state.openings,before=JSON.stringify(state);
  const result=roomMergeCommand.apply({params:{primary:'1,2',secondary:'2,3,4',shared:['2'],openingIds:[9]}},
    {state,services:{detectRooms:()=>{assert.equal(state.walls.length,3);assert.equal(state.openings.length,0);return [];}}});
  assert.equal(result.reason,'MERGE_TOPOLOGY');
  assert.equal(state.walls,walls);assert.equal(state.openings,openings);
  assert.equal(JSON.stringify(state),before);
});

test('Bug 9: structure sync preserves curve, bulge, radius and corner treatment without aliasing',()=>{
  const {state}=fixture();
  const wall={...state.walls[0],curve:{type:'arc',bulge:.2},bulge:.2,radius:200,
    cornerTreatment:{type:'fillet',radius:30}};
  const op={type:'structSet',nodes:state.nodes,walls:[wall],openings:[]};
  assert.equal(applyPlanOp(op,state),true);
  for(const field of ['curve','bulge','radius','cornerTreatment'])assert.deepEqual(state.walls[0][field],wall[field]);
  wall.curve.bulge=.9;wall.cornerTreatment.radius=999;
  assert.equal(state.walls[0].curve.bulge,.2);assert.equal(state.walls[0].cornerTreatment.radius,30);
});

test('Bug 10: canvas contexts own separate cached patterns and transforms',t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'DOMMatrix');
  globalThis.DOMMatrix=class {constructor(values){this.values=values;}};
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'DOMMatrix',previous);else delete globalThis.DOMMatrix;});
  let creates=0;
  const context=()=>({createPattern(){creates++;return {setTransform(matrix){this.matrix=matrix;}};}});
  const a=context(),b=context(),view={SC:1,dpr:1,OX:1,OY:2},source=()=>({});
  const pa=patternFill(a,'oak',source,'white',50,view);
  const pb=patternFill(b,'oak',source,'white',50,{...view,OX:200});
  assert.notEqual(pa,pb);assert.equal(creates,2);
  assert.equal(pa.matrix.values[4],1);assert.equal(pb.matrix.values[4],200);
  assert.equal(patternFill(a,'oak',source,'white',50,{...view,OX:20}),pa);
  assert.equal(creates,2);assert.equal(pb.matrix.values[4],200);
});

test('Bug 11: PBR map application resets tint deterministically for both material kinds',()=>{
  const apply=loadFunction('js/pbr_material.js','applyPbrMaps',{
    pbrTextures:()=>({map:{},normalMap:{},ormMap:{}}),repeated:tx=>tx,
  });
  for(const tintable of [false,true])for(const tint of [undefined,0x123456,0]){
    let color=0xabcd12;
    const mat={color:{setHex(value){color=value;}}};
    assert.equal(apply(mat,{tint:tintable,metal:0},1,1,{tint}),true);
    assert.equal(color,tintable&&tint!=null?tint:0xffffff);
  }
});

test('Bug 12: dielectric node materials use zero metalness while metal retains the ORM blue channel',()=>{
  const zero={value:0},blue={channel:'blue'};
  const sample={rgb:{mul:()=>({})},r:{},g:{},b:blue};
  class Material {constructor(){this.userData={};}}
  const surface=loadFunction('js/pbr_material.js','pbrSurfaceMaterial',{
    pbrTextures:()=>({map:{},normalMap:{},ormMap:{}}),
    THREE:{MeshStandardNodeMaterial:Material,Vector2:class {},Color:class {}},
    TSL:{uv:()=>({mul:()=>({})}),uniform:v=>v,texture:()=>sample,normalMap:v=>v,float:n=>{assert.equal(n,0);return zero;}},
  });
  for(const metal of [undefined,0,-1,.8]){
    const mat=surface({id:'test',metal},{antiTile:false});
    assert.equal(mat.metalnessNode,metal>0?blue:zero);
  }
});

test('Bug 13: layer panel creates valid wall or item selections and tolerates absent/empty collections',()=>{
  const state={walls:[null,{id:1},{id:2}],items:[null,{id:3},{id:4}],openings:[{id:5}]};
  let selection;
  const services={S:state,hiddenSets:()=>({walls:{2:true},items:{4:true}}),itemUserUnpickable:()=>false,
    closePopover:()=>{},select:sel=>{selection=sel;},render2D:()=>{},flash:()=>{},t:()=>''};
  services.selectableOn=loadFunction('js/ui_layers.js','selectableOn',services);
  services.selectRefs=loadFunction('js/ui_layers.js','selectRefs',services);
  const selectLayer=loadFunction('js/ui_layers.js','selectLayer',services);
  selectLayer('structure');assert.equal(selection.kind,'wall');assert.equal(selection.ref,state.walls[1]);
  selectLayer('furniture');assert.equal(selection.kind,'item');assert.equal(selection.ref,state.items[1]);
  state.walls.push({id:6});selectLayer('structure');assert.equal(selection.kind,'walls');assert.deepEqual(ids(selection.refs),[1,6]);
  delete state.walls;delete state.items;
  assert.equal(services.selectableOn('structure').length,0);
  assert.equal(services.selectableOn('furniture').length,0);
  assert.equal(services.selectableOn('unknown').length,0);
});

test('Bug 14: a faded user layer can be selected from its name while hidden room/layer items stay excluded',()=>{
  const {source,ast}=moduleSource('js/ui_layers.js');
  const listeners=nodesMatching(ast,n=>n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&
    n.callee.object.name==='name'&&n.callee.property.name==='addEventListener'&&
    n.arguments[0]?.value==='click'&&source.slice(n.start,n.end).includes('itemsOnUserLayer(L.id)'));
  assert.equal(listeners.length,1);
  const callback=listeners[0].arguments[1],items=[{id:1},{id:2}];
  let selection;
  const services={L:{id:'faded',vis:'ghost'},itemsOnUserLayer:()=>items,
    hiddenSets:()=>({items:{2:true}}),itemUserUnpickable:()=>true,selectRefs:refs=>{selection=refs;}};
  const click=runInNewContext('('+source.slice(callback.start,callback.end)+')',services);
  click();assert.deepEqual(ids(selection),[1]);
  services.hiddenSets=()=>({items:{1:true,2:true}});
  click();assert.equal(selection.length,0);
});

test('Bug 15: both right-click and pointer group selections exclude hidden and faded members',()=>{
  const {source,ast}=moduleSource('js/interaction.js');
  const branches=nodesMatching(ast,n=>n.type==='IfStatement'&&n.test.type==='MemberExpression'&&
    n.test.object.name==='hi'&&n.test.property.name==='groupId');
  assert.equal(branches.length,2);
  const items=[{id:1,groupId:8},{id:2,groupId:8},{id:3,groupId:8},{id:4,groupId:99}];
  for(const branch of branches){
    const selected=runInNewContext('var toSelect=[];'+source.slice(branch.start,branch.end)+';toSelect',{
      S:{items},hi:items[0],hiddenSets:()=>({items:{2:true}}),itemUserUnpickable:it=>it.id===3,
    });
    assert.deepEqual(ids(selected),[1]);
  }
});

test('Bug 16: shape-specific arm limits accept broad L/T arms and retain minimum recess widths',()=>{
  assert.equal(shapePoints('L',{width:400,depth:300,arm:180}).length,6);
  assert.equal(shapePoints('L',{width:400,depth:300,arm:280}),null);
  assert.equal(shapePoints('U',{width:500,depth:200,arm:100}).length,8);
  assert.equal(shapePoints('U',{width:400,depth:300,arm:190}),null);
  assert.equal(shapePoints('U',{width:800,depth:300,arm:280}),null);
  assert.equal(shapePoints('T',{width:400,depth:300,arm:180}).length,8);
  assert.equal(shapePoints('T',{width:400,depth:500,arm:360}),null);
  assert.equal(shapePoints('L',{width:400,depth:300,arm:19}),null);
});

// A one-sided watch used to be enough to message any friend code (and so
// anyone could, by listing it): delivery now needs a mutual watch or a room.
test('Bug 17: only mutual friends or room-mates can deliver direct messages',()=>{
  const client=code=>({code,watch:new Set(),room:null});
  const a=client('A'),b=client('B'),c=client('C'),messages=[];
  const mutualWatch=loadFunction('server/relay.mjs','mutualWatch',{});
  const toCode=loadFunction('server/relay.mjs','toCode',{
    clients:new Set([a,b,c]),mutualWatch,sendObj:(recipient,message)=>messages.push([recipient.code,message]),
  });
  a.watch.add('B');
  toCode(a,'B','one-sided');toCode(b,'A','one-sided reply');
  assert.deepEqual(messages,[],'a one-sided watch delivers nothing');
  b.watch.add('A');
  toCode(a,'B','request');toCode(b,'A','reply');toCode(c,'A','blocked');toCode(a,'missing','blocked');
  assert.deepEqual(messages,[['B','request'],['A','reply']]);
  a.watch.clear();b.watch.clear();a.room=b.room='shared';
  toCode(b,'A','room');assert.deepEqual(messages.at(-1),['A','room']);
});

test('Bug 18: slab voids on shared edges and vertices belong to both rooms, with correct hole winding',()=>{
  const left=[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}];
  const right=left.map(p=>({x:p.x+400,z:p.z}));
  const area=pts=>pts.reduce((sum,p,i)=>{const q=pts[(i+1)%pts.length];return sum+p.x*q.z-q.x*p.z;},0);
  for(const z of [0,150,300])for(const rot of [0,45]){
    const openings=[{x:400,z,w:80,d:100,rot}];
    for(const room of [left,right,left.slice().reverse()]){
      const holes=holesForRoom(room,openings);
      assert.equal(holes.length,1);
      assert.ok(area(room)*area(holes[0])<0);
    }
  }
  assert.equal(holesForRoom(left,[{x:900,z:900,w:80,d:100}]).length,0);
  assert.equal(holesForRoom(left,[{x:100,z:100,w:undefined,d:100}]).length,0);
});

test('Bug 19: SVG and DXF room dimensions use custom formatting and preserve cm defaults',()=>{
  const snapshot={walls:[],openings:[],swings:[],voids:[],items:[],rooms:[
    {points:[{x:0,z:0},{x:400,z:0},{x:400,z:300}],cx:200,cz:150,name:'Room',width:400,depth:300},
  ]};
  const bounds={minx:0,maxx:400,minz:0,maxz:300};
  const fmt=cm=>`${cm/100} m`;
  assert.ok(drawingSVG(snapshot,bounds,{fmt}).includes('4 m x 3 m'));
  assert.ok(drawingDXF(snapshot,{fmt}).includes('4 m x 3 m'));
  assert.ok(drawingSVG(snapshot,bounds).includes('400 × 300 cm'));
  assert.ok(drawingDXF(snapshot).includes('400 x 300 cm'));
  const escaped=drawingSVG(snapshot,bounds,{fmt:cm=>`<${cm}>`});
  assert.ok(escaped.includes('&lt;400&gt; x &lt;300&gt;'));
});

test('Bug 20: rectangle solving preserves pinned nodes and cyclic corner order for skewed/rotated quads',()=>{
  const {state}=fixture();Object.assign(S,state);
  S.nodes[2].x=445;S.nodes[2].z=330;S.nodes[2].locked=true;
  const pinned={...S.nodes[2]},room=detectRooms()[0];
  assert.ok(room);
  solveRoomRect({room:room.key});assert.deepEqual(S.nodes[2],pinned);
  // This convex quad gives two corners the same independent projection signs.
  const skew=[{x:0,z:0},{x:400,z:0},{x:450,z:10},{x:350,z:100}];
  const signedArea=pts=>pts.reduce((sum,p,i)=>{const q=pts[(i+1)%4];return sum+p.x*q.z-q.x*p.z;},0);
  for(const reverse of [false,true])for(const angle of [0,.7,2])for(const start of [0,1,2,3]){
    const cycle=(reverse?skew.slice().reverse():skew).map(p=>({
      x:p.x*Math.cos(angle)-p.z*Math.sin(angle),z:p.x*Math.sin(angle)+p.z*Math.cos(angle),
    }));
    const nodes=cycle.slice(start).concat(cycle.slice(0,start));
    const fakeRoom={pts:structuredClone(nodes),nidx:[0,1,2,3]},state={nodes};
    const solve=loadFunction('js/room_cons.js','solveRoomRect',{S:state,roomByKeyLive:()=>fakeRoom});
    assert.ok(solve({room:'quad'})>0);
    assert.equal(new Set(nodes.map(p=>`${p.x},${p.z}`)).size,4);
    assert.ok(signedArea(nodes)*signedArea(fakeRoom.pts)>0,'winding retained');
    for(let i=0;i<4;i++){
      const a=nodes[i],b=nodes[(i+1)%4],c=nodes[(i+2)%4];
      const dot=(b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z);
      assert.ok(Math.abs(dot)<1e-6,'adjacent edges are perpendicular');
    }
  }
  const sparseRoom={pts:skew,nidx:[0,1,2,3]};
  const solveSparse=loadFunction('js/room_cons.js','solveRoomRect',{
    S:{nodes:[null,{...skew[1]},{...skew[2]},{...skew[3]}]},roomByKeyLive:()=>sparseRoom,
  });
  assert.doesNotThrow(()=>solveSparse({room:'sparse'}));
});
