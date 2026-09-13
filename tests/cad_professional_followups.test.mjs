import test from 'node:test';
import assert from 'node:assert/strict';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,makeBrepPrimitive,disposeBrep,extractBrepTopology,filletBrep} from '../js/cad_kernel.js';
import {analyzeSectionBoundaries} from '../js/core/section_boundaries.js';
import {MANUFACTURING_TABLES,validateManufacturingTables,manufacturingTableSupport} from '../js/manufacturing_tables.js';
const box=id=>({id,type:'box',inputs:[],params:{w:4,h:6,d:8}});
test('native failures preserve independent exact bodies, block consumers, and retain repairable history',async()=>{
 const def={parameters:{bad:{value:1,min:2}},features:[box('first'),{...box('broken'),params:{w:'$bad',h:2,d:2}},{id:'dependent',type:'fillet',inputs:['broken'],params:{radius:.1}},box('last')]};
 const run=await regenerateFeatures(def);
 try{assert.equal(run.ok,false);assert.deepEqual([...run.results.keys()],['first','last']);assert.equal(def.features.length,4);assert.match(def.features[2].error,/unavailable/);assert.ok(Math.abs((await shapeMassProperties(run.results.get('last'))).volume-192)<1e-6);
 def.parameters.bad.value=3;const repaired=await regenerateFeatures(def);try{assert.equal(repaired.ok,true,JSON.stringify(repaired.issues));assert.equal(def.features[2].error,null);}finally{releaseRegeneration(repaired);}
 }finally{releaseRegeneration(run);}
});
test('native rollback and suppression block dependent geometry without removing unrelated solids',async()=>{
 const def={features:[{...box('hidden'),suppressed:true},{id:'cut',type:'fillet',inputs:['hidden'],params:{radius:.1}},box('visible'),box('later')]};
 const run=await regenerateFeatures(def,{rollbackId:'visible'});try{assert.deepEqual([...run.results.keys()],['visible']);assert.equal(run.ok,false);}finally{releaseRegeneration(run);}
});
const ring=points=>points.map((a,i)=>({a,b:points[(i+1)%points.length]}));
const square=ring([{u:0,v:0},{u:4,v:0},{u:4,v:4},{u:0,v:4}]);
test('section graph accepts rings and rejects crossings, branches, duplicates and open cuts',()=>{
 assert.equal(analyzeSectionBoundaries(square).loops.length,1);
 for(const edges of [square.slice(1),square.concat(square[0]),square.concat({a:{u:0,v:0},b:{u:-1,v:0}}),ring([{u:0,v:0},{u:4,v:4},{u:0,v:4},{u:4,v:0}])]){const result=analyzeSectionBoundaries(edges);assert.equal(result.ok,false);assert.equal(result.loops.length,0);assert.ok(result.issues.length);}
});
test('section tolerance welds across grid boundaries and accepts nested holes',()=>{
 const edges=structuredClone(square);edges[0].a.u=.00049;edges.at(-1).b.u=.00051;
 assert.equal(analyzeSectionBoundaries(edges,.001).loops.length,1);
 assert.equal(analyzeSectionBoundaries(square.concat(ring([{u:1,v:1},{u:2,v:1},{u:2,v:2},{u:1,v:2}]))).loops.length,2);
});
test('every installed table declares coverage and provenance; unknown editions never certify geometry',()=>{
 assert.ok(Object.keys(MANUFACTURING_TABLES).length>=57);assert.deepEqual(validateManufacturingTables().issues,[]);
 assert.equal(manufacturingTableSupport('holes.METRIC_HOLE_TABLE',{key:'M6'}).ok,true);
 assert.equal(manufacturingTableSupport('holes.METRIC_HOLE_TABLE',{key:'M999'}).code,'size-not-in-table');
 assert.equal(manufacturingTableSupport('holes.METRIC_HOLE_TABLE',{key:'M6',requireVerified:true}).ok,false);
 const bad=structuredClone(MANUFACTURING_TABLES);bad['holes.METRIC_HOLE_TABLE'].data.M6.normalMm=3;assert.equal(validateManufacturingTables(bad).ok,false);
});
test('variable fillet anchors map radii to the chosen physical endpoint and reject stale anchors',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:4,h:6,d:8});
 try{extractBrepTopology(body,{ownerFeatureId:'box'});const edge=body.topology.find(e=>e.kind==='edge'&&e.descriptor.endpoints?.length===2);
 const centers=[];
 for(const point of edge.descriptor.endpoints){const result=await filletBrep(body,.2,{variableRadius:true,endRadius:.4,edgePersistentIds:[edge.persistentId],edgeRadii:[{id:edge.persistentId,startPoint:point}]});try{const mass=await shapeMassProperties(result);assert.ok(mass.volume<192);centers.push(mass.centerOfMass);}finally{disposeBrep(result);}}
 const axis=['x','y','z'].find(k=>Math.abs(edge.descriptor.endpoints[0][k]-edge.descriptor.endpoints[1][k])>1e-3);
 assert.ok(Math.abs(centers[0][axis]-centers[1][axis])>1e-5);
 await assert.rejects(filletBrep(body,.2,{variableRadius:true,endRadius:.4,edgePersistentIds:[edge.persistentId],edgeRadii:[{id:edge.persistentId,startPoint:{x:100,y:100,z:100}}]}),/reselect the edge/);
 }finally{disposeBrep(body);}
});
test('a healthy recovered body retains its exact volume through STEP export/import',async()=>{
 const {exportStep,importStep}=await import('../js/cad_kernel.js');
 const run=await regenerateFeatures({features:[{id:'bad',type:'unsupported',inputs:[],params:{}},box('healthy')]});let imported;
 try{assert.equal(run.ok,false);const bytes=await exportStep(run.results.get('healthy'),'recovered.step');imported=await importStep(bytes,'recovered.step');assert.ok(Math.abs((await shapeMassProperties(imported)).volume-192)<1e-6);}
 finally{if(imported)disposeBrep(imported);releaseRegeneration(run);}
});
test('a section warning is retained in the drawing scene and exported SVG',async()=>{
 const {createSheetDoc,buildSheetScene,sceneToSvg}=await import('../js/cad_sheet.js');
 const doc=createSheetDoc({views:['front']});
 const scene=buildSheetScene(doc,{projection:()=>({visible:[],hidden:[],cuts:square.slice(1),bounds:{u0:0,u1:4,v0:0,v1:4}})});
 assert.ok(scene.diagnostics.some(i=>i.code==='open-section-boundary'));assert.equal(scene.items.some(i=>i.style==='hatch'),false);assert.match(sceneToSvg(scene),/Section boundary needs repair/);
});
