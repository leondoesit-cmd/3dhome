import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/trimmed-boundary-upstream-edit.json',import.meta.url)));
test('original browser-authored native tangent junction remains one intersection on clean replay',async()=>{
 const document=JSON.parse(readFileSync(new URL('./fixtures/trimmed-boundary-native-tangent.json',import.meta.url)));
 const execute=createCadWorkerExecutor({bodyStore:{get:async()=>null,put:async()=>{},remove:async()=>{}}});
 const result=await execute({kind:'regenerate',canonical:true,document,massProperties:true,meshOnly:true});
 assert.equal(result.ok,true,JSON.stringify(result.issues));
 const mass=result.results.at(-1)[1].massProperties;
 assert.ok(Math.abs(mass.volume-111.05943)<.002,'source Q6 volume remains within native rounding: '+mass.volume);
 const before=document.sketches[2].points.find(p=>p.id===1650);
 const after=new Map(result.boundaryUpdates).get(document.sketches[2].id).sketch.points.find(p=>p.id===1650);
 assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1e-9,'native tangent remains the original unique common endpoint');
 assert.ok(Math.abs(mass.centerOfMass.y*10-15.93)<.01,'original COM remains within printed precision');
});
test('native upstream length and fillet edits follow mixed trimmed converted arcs without moving manual wall',async()=>{
 const document=fixture(),before=structuredClone(document.sketches[2]);
 const compiled=compileKernelFeatureTree(document);
 assert.equal(compiled.features.find(f=>f.id==='feature_munkvcz1_5:tool').params.trimmedBoundaryFollowRevision,'1');
 assert.ok(compiled.features.filter(f=>f.params?.trimmedBoundaryFollowRevision).every(f=>f.params.sketchId===before.id),'unchanged prefixes are not invalidated');
 const execute=createCadWorkerExecutor({bodyStore:{get:async()=>null,put:async()=>{},remove:async()=>{}}});
 const result=await execute({kind:'regenerate',canonical:true,document,massProperties:true,meshOnly:true});
 assert.equal(result.ok,true,JSON.stringify(result.issues));
 const after=new Map(result.boundaryUpdates).get(before.id).sketch;
 assert.deepEqual(after.entities,before.entities,'preserve existing sketch and entity IDs');
 const p=id=>after.points.find(p=>p.id===id),old=id=>before.points.find(p=>p.id===id);
 assert.ok(Math.abs(p(1661).x-old(1661).x)>.7,'R32 offset centre follows source saddle, not frozen copied curve');
 assert.ok(Math.abs(p(1660).y-old(1660).y)>.05,'trim intersection follows updated circle');
 assert.ok(Math.abs(p(1660).x+2.05)<1e-8,'manual wall stays at authored local X');
 const arc=after.entities.find(e=>e.id===1659),a=p(arc.a),c=p(arc.c);
 assert.ok(Math.abs(Math.hypot(a.x-c.x,a.y-c.y)-3.2)<1e-7,'exact 2mm offset of updated R30 remains circular');
 const mass=result.results.at(-1)[1].massProperties;
 assert.ok(Math.abs(mass.bounds.max.x-mass.bounds.min.x-14)<1e-8);
 assert.ok(Math.abs(mass.volume-115.7071)>.01,'old frozen pocket is not accepted as fresh: '+mass.volume);
 // A persisted sample-index alias can point at the adjacent physical corner.
 // It must not defeat migration of the consumer's accurate geometric reference.
 const withLegacy=structuredClone(document);
 const reference=document.features.find(f=>f.id==='feature_munk97pz_3').references.topology.find(r=>r.persistentId.endsWith('depth:20'));
 withLegacy.exactTopologyCache={feature_munk5lbu_1:{signature:'legacy',topology:[{
   ...reference,semantic:'depth:20',descriptor:{...reference.descriptor,
     origin:{x:-6.5,y:3,z:0},endpoints:[{x:-6.5,y:3,z:-2},{x:-6.5,y:3,z:2}],
     bounds:{min:{x:-6.5000001,y:2.9999999,z:-2.0000001},max:{x:-6.4999999,y:3.0000001,z:2.0000001}}}
 }]}};
 const replay=await execute({kind:'regenerate',canonical:true,document:withLegacy,massProperties:true,meshOnly:true});
 assert.equal(replay.ok,true,JSON.stringify(replay.issues));
 assert.ok(Math.abs(replay.results.at(-1)[1].massProperties.volume-mass.volume)<1e-7,'legacy sampled aliases cannot change native geometry');
});
