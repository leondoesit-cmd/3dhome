import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSketchExtrusion,regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {buildCommandCatalog} from '../js/modeler_commands.js';
import {featureDefaults} from '../js/core/feature_catalog.js';
import {thinSketchProfile} from '../js/core/thin_profile.js';

function document(){
 const sketch={id:'s',plane:'side',referenceId:'plane:right',offset:0,points:[{id:'a',x:0,y:0},{id:'b',x:3,y:0},{id:'c',x:3,y:2}],entities:[{id:'ab',type:'line',a:'a',b:'b'},{id:'bc',type:'line',a:'b',b:'c'}],constraints:[]};
 const params={...featureDefaults('extrude'),sketchId:'s',profileEntityIds:['ab','bc'],thinFeature:true,thickness:.2,thinMode:'mid-plane',depth:4,endCondition:'mid-plane',axis:'x'};
 return {sketches:[sketch],features:[{id:'wall',type:'extrude',inputs:[],references:{sketches:['s'],profileEntityIds:['ab','bc']},params}]};
}
async function volume(def){
 const compiled=compileKernelFeatureTree(def);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{assert.equal(run.ok,true,JSON.stringify(run.issues));return (await shapeMassProperties(run.finalShape)).volume;}finally{releaseRegeneration(run);}
}
test('Thin Extrude compiles an open L section into an exact centred band and follows source/thickness edits',async()=>{
 const def=document(),params=def.features[0].params;
 const band=resolveSketchExtrusion(def,params);assert.equal(band.segments.length,6);assert.equal(band.holes.length,0);
 assert.ok(Math.abs(await volume(def)-5*.2*4)<1e-7);
 def.sketches[0].points[2].y=4;
 assert.ok(Math.abs(await volume(def)-7*.2*4)<1e-7);
 params.thickness=.4;
 assert.ok(Math.abs(await volume(def)-7*.4*4)<1e-7);
});
test('Thin Extrude rejects unsupported or disconnected open profile references',()=>{
 const def=document();assert.throws(()=>resolveSketchExtrusion(def,{...def.features[0].params,thickness:0}),/positive/);
 assert.throws(()=>resolveSketchExtrusion(def,{...def.features[0].params,profileEntityIds:['missing']}),/connected/);
});
test('Thin Extrude Cut removes the exact band from its host body',async()=>{
 const def=document(),cut=def.features[0];
 cut.type='extrudeCut';cut.inputs=['base'];cut.params.operation='subtract';
 cut.references.features=['base'];
 def.features.unshift({id:'base',type:'box',inputs:[],params:{x:-2,y:-1,z:-1,w:4,h:6,d:6}});
 assert.ok(Math.abs(await volume(def)-(4*6*6-5*.2*4))<1e-7);
});
test('Extrude and Extrude Cut are available for an open chain while ordinary solid extrusion defaults remain unchanged',()=>{
 const commands=buildCommandCatalog({t:x=>x,editor:{docType:'part',def:{parts:[{}]}},closedSketchProfile:()=>null,openSketchChain:()=>true,activeParts:d=>d.parts});
 assert.equal(commands.find(c=>c.id==='extrude').available(),true);
 assert.equal(commands.find(c=>c.id==='extrudecut').available(),true);
 assert.equal(featureDefaults('extrude').thinFeature,false);
});

function curvedDocument(){
 const def=document(),sketch=def.sketches[0];
 sketch.points=[{id:'a',x:-2,y:0},{id:'b',x:0,y:0},{id:'c',x:1,y:1},{id:'d',x:1,y:3},{id:'o',x:0,y:1}];
 sketch.entities=[{id:'ab',type:'line',a:'a',b:'b'},{id:'arc',type:'arc',a:'b',b:'c',c:'o'},{id:'cd',type:'line',a:'c',b:'d'}];
 def.features[0].params.profileEntityIds=['ab','arc','cd'];
 return def;
}
test('mixed tangent line-arc-line Thin Extrude retains exact curved walls and associative volume',async()=>{
 const def=curvedDocument(),params=def.features[0].params;
 let band=resolveSketchExtrusion(def,params);
 assert.deepEqual(band.segments.map(s=>s.type),['line','arc','line','line','line','arc','line','line']);
 assert.ok(Math.abs(await volume(def)-(4+Math.PI/2)*.2*4)<1e-7);
 params.thickness=.4;
 assert.ok(Math.abs(await volume(def)-(4+Math.PI/2)*.4*4)<1e-7);
 def.sketches[0].points.find(p=>p.id==='d').y=5;
 assert.ok(Math.abs(await volume(def)-(6+Math.PI/2)*.4*4)<1e-7);
 const points=def.sketches[0].points;
 Object.assign(points.find(p=>p.id==='o'),{x:0,y:2});
 Object.assign(points.find(p=>p.id==='c'),{x:2,y:2});
 Object.assign(points.find(p=>p.id==='d'),{x:2,y:5});
 assert.ok(Math.abs(await volume(def)-(5+Math.PI)*.4*4)<1e-7);
});
test('mixed offsets preserve traversal direction, joined endpoints, and reject collapsed curved walls',()=>{
 const def=curvedDocument(),sketch=def.sketches[0],ids=def.features[0].params.profileEntityIds;
 const profile=thinSketchProfile(sketch,ids,.2);
 for(let i=0;i<profile.segments.length;i++)assert.deepEqual(profile.segments[i].to,profile.segments[(i+1)%profile.segments.length].from);
 assert.ok(Math.abs(profile.segments[1].radius-1.1)<1e-9);
 assert.ok(Math.abs(profile.segments[5].radius-.9)<1e-9);
 const backward={...sketch,entities:[{id:'dc',type:'line',a:'d',b:'c'},sketch.entities[1],{id:'ba',type:'line',a:'b',b:'a'}]};
 const reverse=thinSketchProfile(backward,['dc','arc','ba'],.2);
 assert.ok(Math.abs(reverse.segments[1].radius-.9)<1e-9);
 assert.throws(()=>thinSketchProfile(sketch,ids,3),/collapses/);
});
test('mixed two-arc S section joins opposite curvature analytically',async()=>{
 const def=curvedDocument(),sketch=def.sketches[0];
 sketch.points=[{id:'a',x:-2,y:0},{id:'b',x:0,y:0},{id:'c',x:1,y:1},{id:'d',x:2,y:2},{id:'e',x:4,y:2},{id:'o',x:0,y:1},{id:'p',x:2,y:1}];
 sketch.entities=[{id:'ab',type:'line',a:'a',b:'b'},{id:'arc',type:'arc',a:'b',b:'c',c:'o'},{id:'second',type:'arc',a:'d',b:'c',c:'p'},{id:'de',type:'line',a:'d',b:'e'}];
 const ids=['ab','arc','second','de'];def.features[0].params.profileEntityIds=ids;
 const profile=thinSketchProfile(sketch,ids,.2);
 for(let i=0;i<profile.segments.length;i++)assert.deepEqual(profile.segments[i].to,profile.segments[(i+1)%profile.segments.length].from);
 assert.ok(Math.abs(await volume(def)-(4+Math.PI)*.2*4)<1e-7);
});
test('non-tangent line/arc corners trim their analytic walls to a shared point',async()=>{
 const def=curvedDocument(),sketch=def.sketches[0];
 sketch.points.find(p=>p.id==='a').y=-1;
 const profile=thinSketchProfile(sketch,def.features[0].params.profileEntityIds,.2);
 for(let i=0;i<profile.segments.length;i++)assert.deepEqual(profile.segments[i].to,profile.segments[(i+1)%profile.segments.length].from);
 for(const arc of profile.segments.filter(s=>s.type==='arc')){
  for(const point of [arc.from,arc.mid,arc.to])assert.ok(Math.abs(Math.hypot(point.u-arc.center.u,point.v-arc.center.v)-arc.radius)<1e-8);
 }
 assert.ok(await volume(def)>0);
});
