import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDocument,createFeatureDefinition,createSketchDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {reorderFinishFeature} from '../js/cad_finish_reorder.js';
async function run(doc){const c=compileKernelFeatureTree(doc);assert.ok(c.ok,JSON.stringify(c.issues));const r=await regenerateFeatures({...c.document,features:c.features});assert.ok(r.ok,JSON.stringify(r.issues));return r;}
test('moving a finish after a cut preserves exact geometry and reconnects its successor',async()=>{
 const doc=createPartDocument();
 createFeatureDefinition(doc,'box',{id:'base',params:{w:6,h:2,d:6}});
 let r=await run(doc),edge=r.results.get('base').topology.find(t=>t.kind==='edge'&&Math.abs(t.descriptor.axis?.y)>.99);
 edge=structuredClone(edge);releaseRegeneration(r);
 createFeatureDefinition(doc,'fillet',{id:'round',inputs:['base'],references:{features:['base'],topology:[edge]},params:{radius:.2}});
 const sk=createSketchDefinition(doc,{id:'hole',referenceId:'plane:top',offset:2,points:[{id:'c',x:0,y:0,fixed:true}],entities:[{id:'circle',type:'circle',c:'c',r:.4,fixed:true}]});
 createFeatureDefinition(doc,'extrudeCut',{id:'cut',inputs:['round'],references:{features:['round'],sketches:[sk.id]},params:{depth:4,direction:'reverse',profileEntityIds:['circle']}});
 createFeatureDefinition(doc,'moveBody',{id:'move',inputs:['cut'],references:{features:['cut']},params:{dx:1,dy:0,dz:0}});
 r=await run(doc);const before=(await shapeMassProperties(r.finalShape)).volume;releaseRegeneration(r);
 const original=JSON.stringify(doc),to=doc.history.findIndex(h=>h.targetId==='move')-1;
 const moved=await reorderFinishFeature(doc,'history:feature:round',to);
 assert.equal(JSON.stringify(doc),original,'source is untouched until UI accepts validated copy');
 assert.deepEqual(moved.history.map(h=>h.targetId),['base','hole','cut','round','move']);
 assert.deepEqual(moved.features.find(f=>f.id==='cut').inputs,['base']);
 assert.deepEqual(moved.features.find(f=>f.id==='round').inputs,['cut']);
 assert.deepEqual(moved.features.find(f=>f.id==='move').inputs,['round']);
 r=await run(JSON.parse(JSON.stringify(moved)));try{assert.ok(Math.abs((await shapeMassProperties(r.finalShape)).volume-before)<1e-6);}finally{releaseRegeneration(r);}
 const invalid=structuredClone(doc);invalid.rollbackIndex=2;const saved=JSON.stringify(invalid);
 await assert.rejects(()=>reorderFinishFeature(invalid,'history:feature:round',to),/Release rollback/);assert.equal(JSON.stringify(invalid),saved);
});
