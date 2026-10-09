import test from 'node:test';
import assert from 'node:assert/strict';
import {loftSectionSourceRecord,loftSourceRecord,resolveSketchSources}from '../js/core/swept_sources.js';
import {compileKernelFeatureTree}from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration}from '../js/cad_feature_tree.js';
import {shapeMassProperties,validateBrepForExport,extractBrepTopology,serializeBrep,deserializeBrep,disposeBrep}from '../js/cad_kernel.js';
import {toolFeatureRecipe}from '../js/core/tool_recipe.js';
const polygon=(id,offset,vertices)=>({id,plane:'top',offset,points:vertices.map(([x,y],i)=>({id:i,x,y})),entities:vertices.map((_,i)=>({id:'e'+i,type:'line',a:i,b:(i+1)%vertices.length})),constraints:[]});
const top=()=>polygon('top',4,[[1,4],[5,4],[5,1],[2,2]]);
const apex=()=>({id:'apex',plane:'top',offset:1,points:[{id:'tip',x:5,y:4}],entities:[],constraints:[]});
const source=()=>loftSourceRecord([top(),apex()],[['e0','e1','e2','e3'],{sketchId:'apex',pointId:'tip'}]);
const resolve=(s,ids)=>s.points.map(p=>({u:p.x,v:p.y}));
test('terminal point source retains ID and rereads real local frame; invalid/middle endpoints fail',()=>{
 const a=apex();assert.deepEqual(loftSectionSourceRecord(a,[],true),{sketchId:'apex',pointId:'tip'});
 const browserPoint={...apex(),points:[{id:6089,x:5,y:4}],entities:[{id:6090,type:'point',p:6089}]};
 assert.deepEqual(loftSectionSourceRecord(browserPoint,[],true),{sketchId:'apex',pointId:6089});
 assert.equal(loftSectionSourceRecord({...browserPoint,entities:[{id:6090,type:'point',p:'missing'}]},[],true),null);
 assert.equal(loftSectionSourceRecord({...browserPoint,entities:[...browserPoint.entities,{id:6091,type:'point',p:6089}]},[],true),null);
 a.frameSpace='local';a.frame={origin:{x:10,y:7,z:-2},xAxis:{x:0,y:0,z:1},yAxis:{x:1,y:0,z:0},normal:{x:0,y:1,z:0}};
 const d={sketches:[top(),a]},s=source();assert.deepEqual(resolveSketchSources(d,s,resolve).sections[1],[{x:14,y:7,z:3}]);
 a.points[0].x=6;assert.equal(resolveSketchSources(d,s,resolve).sections[1][0].z,4);
 a.points[0].id='replacement';assert.equal(resolveSketchSources(d,s,resolve),null);
 assert.equal(resolveSketchSources({sketches:[top(),apex()]},{kind:'loft',sections:[s.sections[0],s.sections[1],s.sections[0]]},resolve),null);
 assert.equal(loftSectionSourceRecord({...apex(),points:[...apex().points,{id:'other',x:0,y:0}]},[],true),null);
 assert.equal(loftSectionSourceRecord({...apex(),entities:[{id:'edge',type:'line',a:'tip',b:'tip'}]},[],true),null);
 assert.deepEqual(toolFeatureRecipe({kind:'loft',sketchSources:s,sections:[]}).params.sketchSources,s);
});
function document(operation='subtract',tipY=1){
 const stock=polygon('stockSketch',0,[[0,0],[5,0],[5,4],[0,4]]),a=apex();a.offset=tipY;
 return {sketches:[stock,top(),a],features:[{id:'stock',type:'extrude',params:{axis:'y',from:0,to:4,depth:4,sketchId:'stockSketch',profileEntityIds:stock.entities.map(e=>e.id)},references:{sketches:['stockSketch']}},{id:'cut',type:'loft',inputs:['stock'],references:{sketches:['top','apex'],features:['stock']},params:{solid:true,ruled:true,operation,sketchSources:source()}}]};
}
test('associative skew pyramid loft Cut uses explicit body and recomputes apex edits',async()=>{
 for(const tipY of [1,2]){
  const c=compileKernelFeatureTree(document('subtract',tipY));assert.equal(c.ok,true,JSON.stringify(c.issues));
  assert.equal(c.features.find(f=>f.id==='cut').type,'subtract');assert.deepEqual(c.features.find(f=>f.id==='cut').inputs,['stock','cut:tool']);
  const r=await regenerateFeatures({...c.document,features:c.features});let restored;try{assert.equal(r.ok,true,JSON.stringify(r.issues));const v=await validateBrepForExport(r.finalShape);assert.equal(v.valid,true);assert.equal(v.solidCount,1);assert.ok(Math.abs((await shapeMassProperties(r.finalShape)).volume-(80-8.5*(4-tipY)/3))<1e-8);
   restored=await deserializeBrep(await serializeBrep(r.finalShape));assert.ok(Math.abs((await shapeMassProperties(restored)).volume-(await shapeMassProperties(r.finalShape)).volume)<1e-8);
   if(tipY===1){const {topology}=await extractBrepTopology(r.finalShape);for(const axis of [[6,8,3],[1,3,3]]){const len=Math.hypot(...axis);assert.ok(topology.some(t=>{const n=t.descriptor?.normal;return t.kind==='face'&&n&&Math.abs(Math.abs((n.x*axis[0]+n.y*axis[1]+n.z*axis[2])/len)-1)<1e-8;}),'source facet normal '+axis);}}
  }finally{if(restored)disposeBrep(restored);releaseRegeneration(r);}
 }
 const missing=document();missing.features[1].inputs=[];missing.features[1].references.features=[];assert.equal(compileKernelFeatureTree(missing).ok,false);
 const sheet=document();sheet.features[1].params.solid=false;assert.equal(compileKernelFeatureTree(sheet).ok,false);
 for(const operation of ['add','new-body']){const c=compileKernelFeatureTree(document(operation));assert.equal(c.ok,true);assert.equal(c.features.find(f=>f.id==='cut').type,operation==='add'?'union':'loft');}
});

