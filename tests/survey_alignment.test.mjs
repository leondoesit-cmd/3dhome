import test from 'node:test';
import assert from 'node:assert/strict';
import {alignScanPoints} from '../js/survey_exchange.js';
import {alignRoomScan,scanReconciliation} from '../js/survey_alignment.js';

const pair=[{x:0,z:0},{x:400,z:0}];
const state=()=>({nodes:structuredClone(pair),walls:[{id:1,a:0,b:1,thickness:10,height:270}],openings:[]});
const incoming=(reverse=false)=>({nodes:structuredClone(reverse?[...pair].reverse():pair),walls:[{id:2,a:0,b:1,thickness:10,height:270}],openings:[{id:3,type:'door',wall:2,s:100,width:80,height:205,sill:0,swingDir:'R_IN'}]});

test('alignment rejects missing and nonfinite coordinates before returning any geometry',()=>{
 for(const invalid of [null,{x:NaN,z:0},{x:Infinity,z:0},{x:0},{x:'0',z:0}]){
  assert.throws(()=>alignScanPoints([], [invalid,pair[1]],pair),/ALIGNMENT_POINTS/);
  assert.throws(()=>alignScanPoints([invalid],pair,pair),/ALIGNMENT_POINTS/);
 }
 for(const tolerance of [NaN,Infinity,-1])assert.throws(()=>alignScanPoints([],pair,pair,tolerance),/ALIGNMENT_SCALE/);
 assert.throws(()=>alignScanPoints([],{0:pair[0],1:pair[1],length:2},pair),/ALIGNMENT_POINTS/);
 assert.throws(()=>alignRoomScan({cad:{lines:[]}},null,pair),/ALIGNMENT_POINTS/);
});

test('rigid scan alignment rotates furniture even when zero rotation was omitted',()=>{
 const scan={cad:{lines:[{a:pair[0],b:pair[1]}],objects:[{center:{x:100,z:20},w:50,d:80},{center:{x:0,z:0},rot:30}]}};
 const original=structuredClone(scan);
 const out=alignRoomScan(scan,pair,[{x:10,z:20},{x:10,z:420}]);
 assert.equal(out.cad.objects[0].rot,90);assert.equal(out.cad.objects[1].rot,120);
 assert.ok(Math.abs(out.cad.objects[0].center.x+10)<1e-9);assert.equal(out.cad.objects[0].center.z,120);
 assert.equal(out.cad.objects[0].w,50);assert.equal(out.cad.objects[0].d,80);assert.deepEqual(scan,original);
});

test('reversed shared hosts preserve the physical hinge, swing and opening position',()=>{
 for(const [before,after] of Object.entries({R_IN:'L_OUT',L_IN:'R_OUT',R_OUT:'L_IN',L_OUT:'R_IN'})){
  const source=incoming(true),existing=state();source.openings[0].swingDir=before;
  const unchanged=structuredClone([source,existing]);
  const out=scanReconciliation(source,existing);
  assert.equal(out.conflicts.length,0);assert.equal(out.converted.walls.length,0);
  assert.equal(out.converted.openings[0].s,300);assert.equal(out.converted.openings[0].wall,1);
  assert.equal(out.converted.openings[0].swingDir,after);assert.deepEqual([source,existing],unchanged);
 }
});

test('shared-wall openings deduplicate only when their operation also agrees',()=>{
 const source=incoming(true),existing=state();
 existing.openings=[{...source.openings[0],id:4,wall:1,s:300,swingDir:'L_OUT'}];
 assert.equal(scanReconciliation(source,existing).converted.openings.length,0);
 existing.openings[0].swingDir='R_IN';
 const mismatch=scanReconciliation(source,existing);
 assert.equal(mismatch.conflicts[0].reason,'opening-operation');assert.equal(mismatch.converted.openings.length,1);
 assert.equal(existing.openings[0].swingDir,'R_IN');
});

test('reversed sliding and pocket doors retain their world sliding direction',()=>{
 for(const kind of ['isSliding','isPocket'])for(const direction of [-1,1]){
  const source=incoming(true);Object.assign(source.openings[0],{[kind]:true,slideDir:direction});
  const existing=state();existing.openings=[{...source.openings[0],id:4,wall:1,s:300,slideDir:-direction}];
  assert.equal(scanReconciliation(source,existing).converted.openings.length,0);
  existing.openings[0].slideDir=direction;
  assert.equal(scanReconciliation(source,existing).conflicts[0].reason,'opening-operation');
 }
});

test('an unobserved scan swing does not contradict an existing measured door',()=>{
 const source=incoming(true),existing=state();delete source.openings[0].swingDir;
 existing.openings=[{...source.openings[0],id:4,wall:1,s:300,swingDir:'R_OUT'}];
 const out=scanReconciliation(source,existing);
 assert.equal(out.conflicts.length,0);assert.equal(out.converted.openings.length,0);
 assert.equal(existing.openings[0].swingDir,'R_OUT');
});

test('a scan spanning segmented walls reuses hosts and keeps extension dimensions',()=>{
 const existing={nodes:[{x:100,z:0},{x:200,z:0},{x:300,z:0}],walls:[{id:10,a:0,b:1,height:270,thickness:10},{id:11,a:2,b:1,height:270,thickness:10}],openings:[]};
 const source=incoming();source.nextId=20;source.openings=[{...source.openings[0],s:150,width:60},{...source.openings[0],id:4,s:250,width:60}];
 const before=structuredClone([source,existing]),out=scanReconciliation(source,existing);
 assert.deepEqual(out.conflicts,[]);assert.equal(out.shared.length,2);
 assert.equal(out.converted.walls.length,2);assert.equal(out.converted.nextId,21);
 assert.deepEqual(out.converted.walls.map(w=>[out.converted.nodes[w.a].x,out.converted.nodes[w.b].x]),[[0,100],[300,400]]);
 assert.deepEqual(out.converted.openings.map(o=>[o.wall,o.s,o.swingDir]),[[10,50,'R_IN'],[11,50,'L_OUT']]);
 assert.deepEqual([source,existing],before);
});

test('shared nodes connect neighbouring scan walls to the existing room graph',async()=>{
 const {appendReconciledScan}=await import('../js/survey_alignment.js');
 const existing=state(),source=incoming();source.nodes.push({x:400,z:200},{x:0,z:200});
 source.walls.push({id:4,a:1,b:2},{id:5,a:2,b:3},{id:6,a:3,b:0});
 const out=scanReconciliation(source,existing),before=structuredClone(out.converted);
 appendReconciledScan(existing,out.converted);
 assert.equal(existing.walls[1].a,existing.walls[0].b);
 assert.equal(existing.walls[3].b,existing.walls[0].a);
 assert.equal(existing.nodes.length,4);assert.deepEqual(out.converted,before);
});

test('openings spanning a reused segment junction block the detached merge',()=>{
 const existing=state();existing.nodes=[{x:100,z:0},{x:300,z:0}];
 const source=incoming();source.openings[0].s=100;
 const out=scanReconciliation(source,existing);
 assert.equal(out.conflicts[0].reason,'opening-boundary');assert.equal(existing.walls.length,1);
});

test('new extension openings get stations relative to their new host',()=>{
 const existing=state();existing.nodes=[{x:100,z:0},{x:300,z:0}];
 const source=incoming();source.openings[0].s=350;source.openings[0].width=60;
 const out=scanReconciliation(source,existing);
 assert.deepEqual(out.conflicts,[]);const opening=out.converted.openings[0];
 const host=out.converted.walls.find(w=>w.id===opening.wall);
 assert.equal(out.converted.nodes[host.a].x,300);assert.equal(opening.s,50);
});

test('overlapping existing hosts and incompatible segment dimensions require review',()=>{
 const existing=state(),source=incoming();source.openings=[];
 existing.walls.push({...existing.walls[0],id:5});
 assert.equal(scanReconciliation(source,existing).conflicts[0].reason,'ambiguous-wall');
 existing.walls.pop();existing.nodes=[{x:100,z:0},{x:300,z:0}];existing.walls[0].height=300;
 assert.equal(scanReconciliation(source,existing).conflicts[0].reason,'dimensions');
 existing.walls[0].height=270;source.walls[0].geometry={type:'arc'};
 assert.equal(scanReconciliation(source,existing).conflicts[0].reason,'wall-shape');
});


test('coincident but disconnected existing junctions require topology review',()=>{
 const existing={nodes:[{x:0,z:0},{x:200,z:0},{x:200,z:0},{x:400,z:0}],walls:[{id:10,a:0,b:1,height:270,thickness:10},{id:11,a:2,b:3,height:270,thickness:10}],openings:[]};
 const before=structuredClone(existing),out=scanReconciliation(incoming(),existing);
 assert.equal(out.conflicts[0].reason,'ambiguous-wall');assert.deepEqual(existing,before);
});
