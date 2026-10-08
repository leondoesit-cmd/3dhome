import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {solveTopologyMates,topologyReference} from '../js/cad_mates.js';
import {applyDrivenAssemblyPlacement} from '../js/core/assembly_placement.js';

const P=(x,y)=>({x,y,z:0});
const pose=(x=0,y=0,rz=0)=>({x,y,z:0,rx:0,ry:0,rz});
const axis={x:0,y:0,z:1};
const ref=(part,id,point,kind)=>topologyReference(part,'face',id,kind==='axis'
  ?{surface:'cylinder',origin:point,axis,radius:.3}
  :{surface:'plane',origin:point,normal:axis});
const hinge=(name,a,b,point)=>[
  {id:`${name}-axis`,type:'concentric',a:ref(a,`${name}-a`,point,'axis'),b:ref(b,`${name}-b`,point,'axis')},
  {id:`${name}-plane`,type:'coincident',aligned:true,a:ref(a,`${name}-pa`,point,'plane'),b:ref(b,`${name}-pb`,point,'plane')},
];

test('typed component pose drives a closed linkage for one solve without grounding it in the document',()=>{
  const A=P(0,8),D=P(0,4),B=P(.4658742811845373,9.738666487320323),C=P(-.9399532749187187,6.008277135035306);
  const assembly={components:[
    {id:'base',grounded:true,transform:pose()},
    {id:'handle',transform:pose()},
    {id:'link',transform:pose()},
    {id:'arm',transform:pose()},
  ],topologyMates:[
    ...hinge('A','base','handle',A),...hinge('B','handle','link',B),
    ...hinge('C','link','arm',C),...hinge('D','base','arm',D),
  ]};
  const handle=assembly.components[1],angle=20*Math.PI/180;
  const typed=pose(8*Math.sin(angle),8*(1-Math.cos(angle)),20);
  const options=[];
  const solved=applyDrivenAssemblyPlacement(assembly,handle,typed,opts=>{
    options.push(opts);return solveTopologyMates(assembly,opts);
  });
  assert.equal(solved.ok,true,JSON.stringify(solved));
  assert.deepEqual(options,[{fixedComponentIds:['handle']}]);
  assert.equal(solved.result.settled,true);
  assert.equal(solved.result.unsatisfied.length,0);
  const requested=structuredClone(handle.transform);
  for(const key of ['x','y','z'])assert.equal(handle.transform[key],requested[key],'the typed location remains the driver');
  assert.ok(Math.abs(handle.transform.rz-requested.rz)<1e-10,'the typed angle remains the driver');
  assert.equal(handle.grounded,undefined,'the driver is temporary');
  const reopened=structuredClone(assembly);
  const replay=solveTopologyMates(reopened);
  assert.equal(replay.ok,true,JSON.stringify(replay));
  assert.ok(Math.hypot(...['x','y'].map(key=>reopened.components[1].transform[key]-requested[key]))<1e-6);
  const before=assembly.components.map(c=>structuredClone(c.transform));
  let failedSolveCalls=0;
  const rejected=applyDrivenAssemblyPlacement(assembly,handle,pose(10,10,0),opts=>{
    failedSolveCalls++;return solveTopologyMates(assembly,opts);
  });
  assert.equal(rejected.ok,false,'an impossible entered pose is refused');
  assert.equal(rejected.reason,'mate-conflict');
  assert.equal(failedSolveCalls,1,'rollback does not launch an unanchored solve that could drift the old pose');
  assembly.components.forEach((c,i)=>{
    assert.ok(Math.hypot(...['x','y','z'].map(key=>c.transform[key]-before[i][key]))<1e-6,
      'a refused placement restores every linked component');
  });
});

test('fresh 55-occurrence five-loop crank converges to exact home and preserves every pose on a cold solve',()=>{
  const assembly=JSON.parse(fs.readFileSync(new URL('./fixtures/re75_native_mates.json',import.meta.url),'utf8'));
  const journal=assembly.components.find(c=>c.id===assembly.journalId);
  const entered={...Object.fromEntries(['x','y','z','rx','ry','rz'].map(key=>[key,journal.transform[key]])),rz:0};
  const driven=applyDrivenAssemblyPlacement(assembly,journal,entered,opts=>solveTopologyMates(assembly,opts));
  assert.equal(driven.ok,true,JSON.stringify(driven.result?.unsatisfied));
  assert.equal(driven.result.ok,true);
  assert.equal(driven.result.settled,true,'tiny nonzero rotational corrections must reach numerical convergence');
  assert.equal(driven.result.degreesOfFreedom,0);
  assert.ok(driven.result.clusters.every(c=>c.converged&&c.rank===c.variableCount));
  assert.deepEqual(driven.result.issues,[]);
  assert.deepEqual(driven.result.unsatisfied,[]);
  assert.ok(Math.abs(journal.transform.rz)<1e-10);
  const crankpin=assembly.components.find(c=>c.name==='RE10 eccentric crankpin');
  assert.ok(Math.abs(crankpin.transform.x)<1e-6);
  assert.ok(Math.abs(crankpin.transform.y-1.8)<1e-6);
  assert.equal(journal.grounded,false);
  const reopened=structuredClone(assembly);
  const replay=solveTopologyMates(reopened,{fixedComponentIds:[journal.id]});
  assert.equal(replay.ok,true,JSON.stringify(replay));
  assert.equal(replay.settled,true);
  assert.deepEqual(replay.unsatisfied,[]);
  reopened.components.forEach((component,i)=>{
    for(const key of ['x','y','z','rx','ry','rz']){
      assert.ok(Math.abs(component.transform[key]-assembly.components[i].transform[key])<1e-6,
        `cold solve preserves ${component.name||component.id} ${key}`);
    }
  });
});
