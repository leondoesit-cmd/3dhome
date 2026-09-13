import test from 'node:test';
import assert from 'node:assert/strict';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {domeBrep,disposeBrep,validateBrepForExport,shapeMassProperties} from '../js/cad_kernel.js';
test('SWITCH loft retains exact circular rims and follows dependent plane edits',async()=>{
 for(const offset of [1.27,.3175]){
 const square={id:'square',plane:'top',referenceId:'plane:top',points:[{id:'a',x:-.635,y:-.635},{id:'b',x:.635,y:-.635},{id:'c',x:.635,y:.635},{id:'d',x:-.635,y:.635}],entities:[['a','b'],['b','c'],['c','d'],['d','a']].map(([a,b],i)=>({id:'l'+i,type:'line',a,b})),constraints:[]};
 const circle=(id,referenceId,r)=>({id,referenceId,plane:'top',points:[{id:'c',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'c',r}],constraints:[]});
 const document={references:[{id:'plane:top',type:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}},{id:'p1',type:'plane',baseReferenceId:'plane:top',offset},{id:'p2',type:'plane',baseReferenceId:'p1',offset:1.27}],sketches:[square,circle('middle','p1',.635),circle('upper','p2',.635/Math.sqrt(2))],features:[{id:'loft',type:'loft',references:{sketches:['square','middle','upper']},params:{solid:true,matchProfiles:true}}]};
 const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});let domed;
 try{assert.equal(run.ok,true,JSON.stringify(run.issues));const body=run.results.get('loft');const face=body.topology.find(t=>t.kind==='face' && t.descriptor?.surface==='plane' && t.descriptor.normal.y>.9);assert.ok(face);assert.ok(Math.abs(face.descriptor.origin.y-offset-1.27)<1e-6,JSON.stringify(face));domed=await domeBrep(body,.508,{facePersistentIds:[face.persistentId]});await validateBrepForExport(domed);assert.ok((await shapeMassProperties(domed)).volume>0);}finally{if(domed)disposeBrep(domed);releaseRegeneration(run);}
 }
});
