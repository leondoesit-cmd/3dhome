import test from 'node:test';
import assert from 'node:assert/strict';
import {scanReconciliation,appendReconciledScan} from '../js/survey_alignment.js';
import {normalizeSurvey} from '../js/survey.js';
const state=()=>({idc:10,nodes:[{x:0,z:0},{x:400,z:0}],walls:[{id:1,a:0,b:1,height:270,thickness:10,lock:false,tex:'brick',lockL:400,clearL:390}],openings:[{id:2,wall:1,s:250,width:60,height:205,type:'door',swingDir:'R_IN'}],mep:{nodes:[{id:3,wall:1,s:350,kind:'socket'}],runs:[{id:4,a:3,b:8}]},roomMeta:{'1,7,8,9':{name:'Kitchen',hid:'room-1'}},workspace:{activeFloor:'ground',survey:normalizeSurvey({enabled:true,observations:[{id:'measurement',target:{kind:'wall',id:1,floorId:'ground'},field:'length',value:400,status:'checked'}]})}});
const scan=()=>({nodes:[{x:100,z:0},{x:300,z:0}],walls:[{id:10,a:0,b:1,height:270,thickness:10}],openings:[],nextId:11});

test('partial overlap prepares detached cuts and preserves opening, service and room identities',()=>{
 const existing=state(),source=scan(),before=structuredClone([existing,source]);
 const review=scanReconciliation(source,existing);
 assert.deepEqual(review.conflicts,[]);assert.equal(review.splits.length,1);assert.deepEqual([existing,source],before);
 const converted=structuredClone(review.converted);appendReconciledScan(existing,review.converted);
 assert.deepEqual(existing.walls.map(w=>[w.id,existing.nodes[w.a].x,existing.nodes[w.b].x]),[[1,0,100],[11,100,300],[12,300,400]]);
 assert.deepEqual(existing.openings.map(o=>[o.id,o.wall,o.s,o.swingDir]),[[2,11,150,'R_IN']]);
 assert.deepEqual(existing.mep.nodes.map(n=>[n.id,n.wall,n.s]),[[3,12,50]]);assert.deepEqual(existing.mep.runs,before[0].mep.runs);
 assert.equal(existing.roomMeta['7,8,9,1'],undefined);assert.deepEqual(existing.roomMeta['1,7,8,9,11,12'],{name:'Kitchen',hid:'room-1'});
 assert.ok(existing.walls.every(w=>w.tex==='brick'&&w.lock===false&&w.lockL===undefined&&w.clearL===undefined));
 const observation=normalizeSurvey(existing.workspace.survey).observations[0];
 assert.deepEqual(observation.target.splitWallIds,[1,11,12]);
 assert.equal(observation.value,400);assert.equal(observation.status,'unresolved');assert.equal(observation.previous[0].geometry.endpoints[1].x,400);
 assert.deepEqual(review.converted,converted);
});

test('reverse incoming wall deduplicates an opening after the existing host is split',()=>{
 const existing=state(),source=scan();source.nodes.reverse();
 source.openings=[{...existing.openings[0],id:13,wall:10,s:50,swingDir:'L_OUT'}];source.nextId=14;
 const review=scanReconciliation(source,existing);assert.deepEqual(review.conflicts,[]);assert.equal(review.converted.openings.length,0);
});

test('multiple incoming observations split an existing span once at each distinct junction',()=>{
 const existing=state();existing.openings=[];
 const source=scan();source.nodes.push({x:200,z:0});source.walls=[{...source.walls[0],b:2},{...source.walls[0],id:11,a:2}];source.nextId=12;
 const review=scanReconciliation(source,existing);assert.deepEqual(review.conflicts,[]);
 assert.deepEqual(review.splits[0].fragments.map(f=>[f.lo,f.hi]),[[0,100],[100,200],[200,300],[300,400]]);
 assert.equal(review.converted.walls.length,0);
});

test('protected walls, constrained plans and held furniture cannot be split implicitly',()=>{
 for(const protect of [s=>{delete s.walls[0].lock;},s=>s.walls[0].lock=true,s=>s.structLocked=true,s=>s.layers={structure:{locked:true}},s=>s.workspace.role='viewer',s=>s.roomMeta['1,7,8,9'].locked=true,s=>s.wallCons=[{type:'distance'}],s=>s.items=[{id:9,hold:{wall:1,gap:0}}]]){
  const existing=state();protect(existing);const before=structuredClone(existing),review=scanReconciliation(scan(),existing);
  assert.ok(review.conflicts.some(c=>['split-locked','split-constraints','split-held'].includes(c.reason)));assert.equal(review.splits.length,0);assert.deepEqual(existing,before);
 }
});

test('cuts through opening clearances and unlocated services require another measurement',()=>{
 const existing=state();existing.openings[0].s=100;
 assert.equal(scanReconciliation(scan(),existing).conflicts[0].reason,'opening-boundary');
 existing.openings=[];delete existing.mep.nodes[0].s;
 assert.equal(scanReconciliation(scan(),existing).conflicts[0].reason,'split-services');
});

test('a stale split preview refuses to change any geometry',()=>{
 for(const mutate of [s=>s.walls[0].height=280,s=>s.workspace.role='viewer',s=>s.mep.nodes[0].s=340,s=>s.workspace.survey.observations[0].value=401]){
  const existing=state(),review=scanReconciliation(scan(),existing);mutate(existing);const before=structuredClone(existing);
  assert.throws(()=>appendReconciledScan(existing,review.converted),/SPLIT_STALE/);assert.deepEqual(existing,before);
 }
});


test('further cuts retain every fragment reference of an earlier full-span reading',()=>{
 const existing=state();appendReconciledScan(existing,scanReconciliation(scan(),existing).converted);
 const source={nodes:[{x:150,z:0},{x:200,z:0}],walls:[{id:20,a:0,b:1,height:270,thickness:10}],openings:[],nextId:21};
 const review=scanReconciliation(source,existing);assert.deepEqual(review.conflicts,[]);appendReconciledScan(existing,review.converted);
 const reading=existing.workspace.survey.observations[0];
 assert.deepEqual(reading.target.splitWallIds,[1,11,21,22,12]);assert.equal(reading.previous.length,2);assert.equal(reading.value,400);
});

test('legacy endpoint dimensions retain the full original span after splitting',async()=>{
 const existing=state();existing.wallCons=[{id:30,type:'dist',a:{k:'wall',id:1,end:'a'},b:{k:'wall',id:1,end:'b'},value:400,expr:'span',hold:'a'}];
 existing.roomCons=[{id:31,type:'roomArea',room:'1,7,8,9',value:8,mode:'exact'},{id:32,type:'roomMinDim',room:'1,7,8,9',value:190}];
 const before=structuredClone(existing),review=scanReconciliation(scan(),existing);assert.deepEqual(review.conflicts,[]);assert.deepEqual(existing,before);
 appendReconciledScan(existing,review.converted);
 assert.deepEqual(existing.wallCons[0],{...before.wallCons[0],b:{k:'wall',id:12,end:'b'}});
 assert.ok(existing.roomCons.every(c=>c.room==='1,7,8,9,11,12'));assert.deepEqual(existing.roomCons.map(c=>[c.id,c.value]),[[31,8],[32,190]]);
 const {createSurveyExchange,parseSurveyExchange}=await import('../js/survey_exchange.js');
 const portable=parseSurveyExchange(JSON.stringify(createSurveyExchange(existing)));
 assert.deepEqual(portable.geometry.wallCons,existing.wallCons);assert.deepEqual(portable.geometry.roomCons,existing.roomCons);
});

test('stable vertex identities survive while their wall owner follows the endpoint',()=>{
 const existing=state();existing.nodes[0].vid='left';existing.nodes[1].vid='right';
 existing.wallCons=[{id:30,type:'axisDistX',a:{k:'node',id:'left',wall:1,end:'a'},b:{k:'node',id:'right',wall:1,end:'b'},value:400,hold:'a'}];
 const review=scanReconciliation(scan(),existing);assert.deepEqual(review.conflicts,[]);appendReconciledScan(existing,review.converted);
 assert.deepEqual(existing.wallCons[0].b,{k:'node',id:'right',wall:12,end:'b'});assert.equal(existing.wallCons[0].value,400);
});

test('unrelated known wall, opening, workspace and room constraints no longer block a split',()=>{
 const existing=state();existing.wallCons=[{id:30,type:'horizontal',wall:99},{id:31,type:'openCentre',opening:90}];
 existing.roomCons=[{id:32,type:'roomRect',room:'91,92,93,94'}];existing.workspace.constraints=[{id:'c',type:'wallLength',wall:99,value:500}];
 const review=scanReconciliation(scan(),existing);assert.deepEqual(review.conflicts,[]);appendReconciledScan(existing,review.converted);
 assert.equal(existing.wallCons[0].wall,99);assert.equal(existing.roomCons[0].room,'91,92,93,94');assert.equal(existing.workspace.constraints[0].value,500);
});

test('whole-wall relations, opening stations, rectangle drivers and missing anchors require review',()=>{
 for(const configure of [
  s=>s.wallCons=[{id:30,type:'equalLengthSet',walls:[1,99]}],
  s=>s.wallCons=[{id:30,type:'angle',w1:1,w2:99,joint:{k:'wall',id:1,end:'b'}}],
  s=>s.wallCons=[{id:30,type:'openDist',opening:2,end:'b',value:150}],
  s=>s.wallCons=[{id:30,type:'fixed',a:{k:'node',id:'missing'}}],
  s=>s.workspace.constraints=[{id:'c',type:'wallLength',wall:1,value:400}],
  s=>s.roomCons=[{id:31,type:'roomRect',room:'1,7,8,9'}]
 ]){
  const existing=state();configure(existing);const before=structuredClone(existing),review=scanReconciliation(scan(),existing);
  assert.equal(review.conflicts[0].reason,'split-constraints');assert.equal(review.splits.length,0);assert.deepEqual(existing,before);
 }
});

test('held furniture keeps its pose and attachment settings when its host is split',()=>{
 const existing=state();existing.items=[{id:40,x:350,z:40,w:60,d:60,h:80,rot:0,hold:{wall:1,gap:5,side:1},name:'Chair'}];
 const item=existing.items[0],before=structuredClone(existing),review=scanReconciliation(scan(),existing);
 assert.deepEqual(review.conflicts,[]);assert.deepEqual(existing,before);appendReconciledScan(existing,review.converted);
 assert.equal(existing.items[0],item);assert.deepEqual(item,{...before.items[0],hold:{wall:12,gap:5,side:1}});
});

test('held footprints project onto an oblique wall using their actual rotation',()=>{
 const existing=state(),source=scan(),r=Math.SQRT2;
 for(const p of [...existing.nodes,...source.nodes]){p.z=p.x/r;p.x/=r;}
 existing.items=[{id:40,x:390/r,z:310/r,w:60,d:120,rot:45,hold:{wall:1,gap:5,side:-1}}];
 const review=scanReconciliation(source,existing);assert.deepEqual(review.conflicts,[]);appendReconciledScan(existing,review.converted);
 assert.equal(existing.items[0].hold.wall,12);assert.equal(existing.items[0].rot,45);assert.equal(existing.items[0].hold.side,-1);
});

test('straddling, unmeasured and locked held furniture requires attachment review',()=>{
 for(const change of [i=>i.x=300,i=>i.w=undefined,i=>i.rot=Infinity,i=>i.hold.gap=Infinity,i=>i.hold.side=3,i=>i.locked=true]){
  const existing=state();existing.items=[{id:40,x:350,z:40,w:60,d:60,rot:0,hold:{wall:1,gap:5,side:1}}];change(existing.items[0]);
  const review=scanReconciliation(scan(),existing);assert.equal(review.conflicts[0].reason,'split-held');assert.equal(review.splits.length,0);assert.equal(existing.items[0].hold.wall,1);
 }
});

test('a locked held item on the unchanged first section needs no attachment edit',()=>{
 const existing=state();existing.items=[{id:40,x:50,z:30,w:40,d:40,locked:true,hold:{wall:1,gap:5,side:1}}];
 const before=structuredClone(existing.items),review=scanReconciliation(scan(),existing);assert.deepEqual(review.conflicts,[]);appendReconciledScan(existing,review.converted);assert.deepEqual(existing.items,before);
});
