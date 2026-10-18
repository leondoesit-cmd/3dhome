import test from 'node:test';
import assert from 'node:assert/strict';
import {convertCadToWalls} from '../js/cad_to_walls.js';
import {convertGeoJsonToWalls} from '../js/geojson_to_walls.js';
import {simplify,pathLength} from '../js/mep_route.js';

test('P01 CAD import splits every T junction beyond the twentieth',()=>{
 const lines=[{x1:0,z1:0,x2:3000,z2:0,layer:'base'},...Array.from({length:25},(_,i)=>({x1:(i+1)*100,z1:0,x2:(i+1)*100,z2:100,layer:'branch'+i}))];
 const out=convertCadToWalls({lines},{singleLineWalls:true});
 assert.equal(out.walls.filter(w=>w.sourceLayer==='base').length,26);
 assert.equal(convertCadToWalls({lines:[{x1:0,z1:0,x2:1.2,z2:0}]},{singleLineWalls:true}).walls.length,1);
});
test('P02 CAD import joins crossing wall centerlines',()=>{
 const out=convertCadToWalls({lines:[{x1:0,z1:0,x2:400,z2:0},{x1:200,z1:-200,x2:200,z2:200}]},{singleLineWalls:true});
 assert.equal(out.walls.length,4);
 const center=out.nodes.findIndex(p=>p.x===200&&p.z===0);
 assert.equal(out.walls.filter(w=>w.a===center||w.b===center).length,4);
});
test('P03 CAD openings attach to analytic curved walls',()=>{
 const out=convertCadToWalls({arcs:[{cx:0,cz:0,radius:300,startAngle:0,endAngle:Math.PI/2}],doors:[{x:300/Math.sqrt(2),z:300/Math.sqrt(2),width:90}]});
 assert.equal(out.openings.length,1);
 assert.ok(Math.abs(out.openings[0].s-300*Math.PI/4)<1e-6);
});
test('P04 paired CAD surfaces retain source wall height',()=>{
 const out=convertCadToWalls({lines:[{x1:0,z1:0,x2:300,z2:0,height:320},{x1:0,z1:20,x2:300,z2:20,height:320}]});
 assert.equal(out.walls[0].height,320);
});
test('P05 GeoJSON accepts bare Polygon geometry',()=>{
 const out=convertGeoJsonToWalls({type:'Polygon',coordinates:[[[200,100],[600,100],[600,400],[200,400],[200,100]]]});
 assert.equal(out.walls.length,4);
 assert.equal(convertGeoJsonToWalls({type:'MultiPolygon',coordinates:[[[[200,100],[600,100],[600,400],[200,400],[200,100]]]]}).walls.length,4);
 assert.equal(convertGeoJsonToWalls({type:'LineString',coordinates:[[200,100],[600,100]]}).walls.length,1);
});
test('P06 explicit metre GeoJSON coordinates take priority over geographic guessing',()=>{
 const out=convertGeoJsonToWalls({type:'Feature',geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,3],[0,3],[0,0]]]}},{unit:'m'});
 assert.equal(out.bounds.widthCm,400);
 assert.equal(out.bounds.depthCm,300);
 for(const [unit,factor] of [['cm',1],['mm',.1],['ft',30.48],['in',2.54]]){
  const v=convertGeoJsonToWalls({type:'LineString',coordinates:[[0,0],[40,0]]},{unit});assert.equal(v.bounds.widthCm,40*factor);
 }
});
test('P07 MEP simplification preserves collinear overshoot device taps',()=>{
 const points=[{x:0,z:0},{x:200,z:0},{x:100,z:0}];
 assert.deepEqual(simplify(points),points);
 assert.equal(pathLength(simplify(points)),300);
 assert.deepEqual(simplify([{x:0,z:0},{x:100,z:0},{x:200,z:0}]),[{x:0,z:0},{x:200,z:0}]);
});

import {S} from '../js/state.js';
import {contentBounds} from '../js/geometry.js';
import {practiceDocument} from '../js/survey_practice.js';
import {navigationFloorTransition} from '../js/navigation_geometry.js';
import {prepareCommand} from '../js/commands/executor.js';
import {roomShapeCommand} from '../js/commands/room_shape.js';
import {prepareItemPlace,applyItemPlace} from '../js/commands/item_place.js';
import {createSurveyExchange,parseSurveyExchange} from '../js/survey_exchange.js';

test('P08 floor transitions check spatial destination slab voids',()=>{
 const s=practiceDocument('multilevel'),scene=s.workspace.floors[1].scene;
 scene.spatial={nodes:scene.nodes,walls:scene.walls,instances:scene.items,openings:scene.openings,slabOpenings:[{id:'other',x:200,z:126,w:100,d:100}]};
 for(const k of ['nodes','walls','items','openings','slabOpenings'])delete scene[k];
 assert.equal(navigationFloorTransition(s,{x:200,y:299,z:126},{stepHeight:20,slopeLimit:45}),null);
});
test('P09 fit-to-content bounds enclose rotated furniture corners',()=>{
 S.nodes=[];S.walls=[];S.slabOpenings=[];S.items=[{id:1,x:0,z:0,w:100,d:100,rot:45}];
 const b=contentBounds();assert.ok(b.maxx>=Math.sqrt(5000)-1e-9);assert.ok(b.minz<=-Math.sqrt(5000)+1e-9);
});
test('P10 wall thickness edits invalidate content bounds cache',()=>{
 S.nodes=[{x:0,z:0},{x:300,z:0}];S.walls=[{id:101,a:0,b:1,thickness:10,height:270}];S.items=[];S.slabOpenings=[];
 const before=contentBounds();S.walls[0].thickness=100;const after=contentBounds();assert.ok(after.d>before.d);assert.ok(after.maxz>=50);
});
test('P11 item placement respects explicit requested rotation over automatic facing',()=>{
 const state={idc:1,items:[]},env={state,catalog:{chair:{w:50,d:50,h:80}},services:{applyAutoFace:it=>{if(!it.rotUser)it.rot=180;}}};
 for(const rot of [0,90]){const p=prepareItemPlace({type:'chair',x:0,z:0,rot},env);assert.equal(p.ok,true);applyItemPlace(p.plan,env);assert.equal(state.items.at(-1).rot,rot);}
 applyItemPlace(prepareItemPlace({type:'chair',x:0,z:0},env).plan,env);assert.equal(state.items.at(-1).rot,180);
});
test('P12 shape command preserves the default dimensions accepted by shapePoints',()=>{
 const state={nodes:[],walls:[],openings:[],items:[],roomMeta:{},workspace:{},idc:1};
 const p=prepareCommand(roomShapeCommand,{type:'L',roomType:'living'}, {state,services:{detectRooms:()=>[]}});
 assert.equal(p.ok,true,JSON.stringify(p));assert.deepEqual(p.plan.params.dimensions,{width:400,depth:400,arm:150});
});
test('P13 survey exchange unit conversion scales semantic room ceiling heights',()=>{
 const s=practiceDocument('rectangle');s.roomMeta[Object.keys(s.roomMeta)[0]||'room']={ceilH:2.4};
 const exchange=createSurveyExchange(s);exchange.units='m';const parsed=parseSurveyExchange(exchange);
 assert.equal(Object.values(parsed.geometry.roomMeta)[0].ceilH,240);
});

import {parseRoomScan} from '../js/room_scan.js';
import {executeCommandBatch} from '../js/commands/executor.js';
import {openingPlaceCommand} from '../js/commands/opening_place.js';
import {makeRouter} from '../js/mep_route.js';
import {detectRooms} from '../js/geometry.js';
import {roofMeshTriangles} from '../js/roof.js';
const scanWalls=[{start:[0,0],end:[400,0]},{start:[400,0],end:[400,300]},{start:[400,300],end:[0,300]},{start:[0,300],end:[0,0]}];
test('P14 RoomPlan ground-reaching windows retain a measured zero sill',()=>{
 const scan=parseRoomScan({unit:'cm',walls:scanWalls,windows:[{position:{x:100,y:100,z:0},dimensions:{x:100,y:200,z:10}}]});
 assert.equal(scan.cad.windows[0].sill,0);
});
test('P15 nested RoomPlan payload honors its declared units alias',()=>{
 const scan=parseRoomScan({capturedRoom:{units:'cm',walls:scanWalls}});
 assert.equal(Math.hypot(scan.cad.lines[0].b.x-scan.cad.lines[0].a.x,scan.cad.lines[0].b.z-scan.cad.lines[0].a.z),400);
});
test('P16 GeoJSON narrow outlines do not collapse into wall face pairs',()=>{
 const out=convertGeoJsonToWalls({type:'Polygon',coordinates:[[[200,100],[600,100],[600,140],[200,140],[200,100]]]});
 assert.equal(out.walls.length,4);
});
test('P17 GeoJSON room labels bind to actual imported room wall keys',()=>{
 const out=convertGeoJsonToWalls({type:'Feature',properties:{name:'Kitchen'},geometry:{type:'Polygon',coordinates:[[[200,100],[600,100],[600,400],[200,400],[200,100]]]}});
 Object.assign(S,out);const room=detectRooms()[0];assert.ok(room);assert.equal(out.roomMeta[room.key]?.name,'Kitchen');
});
test('P18 opening command batches cannot commit mutually overlapping doorways',()=>{
 const state={nodes:[{x:0,z:0},{x:500,z:0}],walls:[{id:1,a:0,b:1,thickness:10,height:270}],openings:[],items:[],idc:2,workspace:{}};
 const before=structuredClone(state);let snapshot;
 const history={begin:()=>{snapshot=structuredClone(state);return {};},commit:()=>{},abort:()=>{Object.assign(state,snapshot);}};
 const result=executeCommandBatch([{command:openingPlaceCommand,params:{wallId:1,type:'door',s:200}},{command:openingPlaceCommand,params:{wallId:1,type:'door',s:220}}],{state,history});
 assert.equal(result.ok,false);assert.deepEqual(state,before);
 const separated=executeCommandBatch([200,400].map(station=>({command:openingPlaceCommand,params:{wallId:1,type:'door',s:station}})),{state,history});assert.equal(separated.ok,true);assert.equal(state.openings.length,2);
});
test('P19 MEP wall routing follows curved centerlines',()=>{
 S.nodes=[{x:300,z:0},{x:0,z:300}];S.walls=[{id:1,a:0,b:1,thickness:10,height:270,bulge:Math.tan(Math.PI/8)}];S.openings=[];
 const router=makeRouter(false),a=router.tap({x:300,z:0},1,0),b=router.tap({x:0,z:300},1,300*Math.PI/2),path=router.path(a,b);
 assert.ok(Math.abs(path.pts.at(-1).x)<1e-6);assert.ok(Math.abs(path.pts.at(-1).z-300)<1e-6);
 assert.ok(pathLength(path.pts)>460);
 for(const p of path.pts)assert.ok(Math.abs(Math.hypot(p.x,p.z)-300)<1e-6);
 const projected=makeRouter(false),mid=projected.tap({x:300/Math.sqrt(2),z:300/Math.sqrt(2)},1);assert.ok(Math.abs(projected.vertex(mid).x-300/Math.sqrt(2))<1e-6);
 S.openings=[{id:2,wall:1,type:'door',s:300*Math.PI/4,width:90,height:205}];const blocked=makeRouter(true),first=blocked.tap({x:300,z:0},1,0),last=blocked.tap({x:0,z:300},1,300*Math.PI/2);assert.equal(blocked.path(first,last).blocked,true);
});
test('P20 hip roof triangles follow both diagonal hip ridges',()=>{
 for(const [width,depth] of [[400,400],[800,400],[400,800]])for(const p of [{x:100,z:100},{x:width-100,z:100},{x:100,z:depth-100},{x:width-100,z:depth-100}]){
 const roof={type:'hip',x0:0,x1:width,z0:0,z1:depth,base:270,pitch:45};
 const tris=roofMeshTriangles(roof);
 const heights=[];
 for(const [a,b,c] of tris){const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den,w=1-u-v;if(u>=-1e-9&&v>=-1e-9&&w>=-1e-9)heights.push(u*a.y+v*b.y+w*c.y);}
 assert.ok(heights.length);for(const h of heights)assert.ok(Math.abs(h-370)<1e-6);
 }
});
test('P21 GeoJSON retains short measured outline segments needed to close rooms',()=>{
 const out=convertGeoJsonToWalls({type:'Polygon',coordinates:[[[200,100],[208,100],[600,100],[600,400],[200,400],[200,100]]]});
 Object.assign(S,out);assert.equal(detectRooms().length,1);
});
test('P22 adjacent GeoJSON room polygons reuse their common wall',()=>{
 const out=convertGeoJsonToWalls({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[200,100],[600,100],[600,400],[200,400],[200,100]]]}},{type:'Feature',geometry:{type:'Polygon',coordinates:[[[600,100],[1000,100],[1000,400],[600,400],[600,100]]]}}]});
 assert.equal(out.walls.length,7);Object.assign(S,out);assert.equal(detectRooms().length,2);
});

import {roomResizeCommand} from '../js/commands/room_resize.js';
import {parseLength,parseArea} from '../js/planning_units.js';
test('P23 room shape authoring permits unrelated distant curved walls',()=>{
 const state={nodes:[{x:2000,z:2000},{x:2400,z:2000}],walls:[{id:1,a:0,b:1,thickness:10,height:270,geometry:{type:'arc',bulge:.2}}],openings:[],items:[],roomMeta:{},workspace:{},idc:2};
 const prepared=roomShapeCommand.prepare({type:'L',roomType:'living',width:400,depth:400,arm:150},{state,services:{detectRooms:()=>[]}});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 state.nodes=[{x:100,z:100},{x:300,z:100}];assert.equal(roomShapeCommand.prepare({type:'L',roomType:'living',width:400,depth:400,arm:150},{state,services:{detectRooms:()=>[]}}).reason,'UNSUPPORTED_SHAPE_NEIGHBOUR');
});
test('P24 exact room resize ignores diagonal walls whose bounding boxes overlap at a distance',()=>{
 const nodes=[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300},{x:390,z:1000},{x:1000,z:290}];
 const walls=nodes.slice(0,4).map((n,i)=>({id:i+1,a:i,b:(i+1)%4,thickness:10,height:270}));walls.push({id:5,a:4,b:5,thickness:10,height:270});
 const room={key:'1,2,3,4',pts:nodes.slice(0,4),area:120000},state={nodes,walls,items:[],openings:[],roomMeta:{},workspace:{}};
 const prepared=roomResizeCommand.prepare({roomKey:room.key,width:410,depth:290},{state,services:{detectRooms:()=>[room]}});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 nodes[4]={x:200,z:-100};nodes[5]={x:200,z:400};assert.equal(roomResizeCommand.prepare({roomKey:room.key,width:410,depth:290},{state,services:{detectRooms:()=>[room]}}).reason,'RESIZE_NEIGHBOUR');
});
test('P25 planner dimension fields accept leading decimal quantities',()=>{
 assert.equal(parseLength('.5 m','cm'),50);assert.equal(parseLength('-.5m','cm'),-50);assert.equal(parseArea('.5 m2','cm'),.5);assert.equal(parseLength("-.5'-.5\"",'cm'),-(.5*30.48+.5*2.54));assert.ok(Number.isNaN(parseLength('1..5m','cm')));
});

import {stairSupport,navigationPosition} from '../js/navigation_geometry.js';
import {prepareSurveyCorrection,applySurveyCorrection,currentSurveyDimension} from '../js/survey_correction.js';
test('P26 GeoJSON import returns the next unused entity id',()=>{
 const out=convertGeoJsonToWalls({type:'Polygon',coordinates:[[[200,100],[600,100],[600,400],[200,400],[200,100]]]},{firstId:3});
 assert.ok(Number.isInteger(out.nextId));assert.ok(out.nextId>Math.max(...out.walls.map(w=>w.id)));
});
test('P27 walking below unrelated upper-floor stairs remains on the ground',()=>{
 const state={nodes:[],walls:[],items:[],workspace:{activeFloor:'ground',floors:[{id:'ground',elevation:0,scene:{}},{id:'upper',elevation:300,scene:{items:[{id:'upstairs',type:'stairs',x:0,z:0,w:110,d:400,h:300,configuration:{stepCount:18}}]}}]}};
 assert.equal(stairSupport(state,{x:0,y:0,z:0},{stepHeight:20,slopeLimit:45}),null);
 assert.equal(navigationPosition(state,{x:0,y:0,z:0},{stepHeight:20,slopeLimit:45}).y,0);
 const s=practiceDocument('multilevel'),upper={...s.workspace.floors[1].scene,workspace:{...s.workspace,activeFloor:'practice-upper'}};
 assert.equal(navigationFloorTransition(upper,{x:200,y:-299,z:524},{stepHeight:20,slopeLimit:45}).floorId,'practice-ground');
});
test('P28 survey correction preview cannot overwrite markers edited after preparation',()=>{
 const s=practiceDocument('rectangle');Object.assign(S,s);S.markers=[];S.wallTypes=[];S.wallCons=[];S.roomCons=[];S.planVars=[];S.layers={structure:{vis:'show'}};
 const p=prepareSurveyCorrection(S,{target:{kind:'wall',id:S.walls[0].id,floorId:S.workspace.activeFloor},field:'height',value:280,unit:'cm'});
 assert.equal(p.ok,true,JSON.stringify(p));S.markers.push({id:123,x:20,z:30});
 assert.throws(()=>applySurveyCorrection(S,p),/SURVEY_PREVIEW_STALE/);assert.equal(S.markers.length,1);
 const fresh=prepareSurveyCorrection(S,{target:{kind:'wall',id:S.walls[0].id,floorId:S.workspace.activeFloor},field:'height',value:280,unit:'cm'});assert.equal(fresh.ok,true);applySurveyCorrection(S,fresh);assert.equal(S.walls[0].height,280);
 const switchPreview=prepareSurveyCorrection(S,{target:{kind:'wall',id:S.walls[0].id,floorId:S.workspace.activeFloor},field:'height',value:290,unit:'cm'});S.workspace.activeFloor='other';assert.throws(()=>applySurveyCorrection(S,switchPreview),/SURVEY_PREVIEW_STALE/);assert.equal(S.walls[0].height,280);
});
test('P29 survey dimensions for stored-floor walls use that floor geometry',()=>{
 const state=practiceDocument('multilevel');state.workspace.floors[1].scene.nodes[1].x=700;state.workspace.floors[1].scene.nodes[2].x=700;
 const target={kind:'wall',id:state.walls[0].id,floorId:'practice-upper'};
 const refs={nodes:S.nodes,walls:S.walls,roomMeta:S.roomMeta,revision:S.spatial.revision};
 const value=currentSurveyDimension(target,'length',state);
 assert.equal(S.nodes,refs.nodes);assert.equal(S.walls,refs.walls);assert.equal(S.roomMeta,refs.roomMeta);assert.equal(S.spatial.revision,refs.revision);
 assert.ok(value>600,`stored floor wall is700cm, got${value}`);
 const upper=state.workspace.floors[1].scene,key=upper.walls.map(w=>w.id).sort().join(',');upper.roomMeta[key]={hid:'upper-room'};assert.equal(currentSurveyDimension({kind:'room',id:'upper-room',floorId:'practice-upper'},'width',state),690);
});
