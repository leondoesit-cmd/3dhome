import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {threadPlacementFromCircularEdge} from '../js/core/thread_circular_start.js';
import {threadPlacementFromFace} from '../js/core/thread_placement.js';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';
import {canonicalFeatureTopologyReferences} from '../js/core/feature_input_stage.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {topologyReferenceFromEntry} from '../js/modeler_pick_geometry.js';
import {normalizeThreadSpec,validateThreadFeature,cosmeticThread,modeledThreadSolid,threadCallout} from '../js/cad_thread.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=modelerSource();
const fn=(name,ctx)=>new Function(...Object.keys(ctx),sourceFunctionText(source,name)+';return '+name)(...Object.values(ctx));
const edge={kind:'edge',ownerFeatureId:'shaft',persistentId:'rim',descriptor:{curve:'circle',radius:.3175,measure:2*Math.PI*.3175,origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0}}};
const face={kind:'face',ownerFeatureId:'shaft',persistentId:'side',descriptor:{surface:'cylinder',radius:.3175,origin:{x:0,y:2.54,z:0},referenceOrigin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},axisRange:[0,5.08]}};
test('full circle starts at the picked native boundary and points inward at either end',()=>{
 const before=JSON.stringify([edge,face]),start=threadPlacementFromCircularEdge(edge,[face]);assert.deepEqual(start.origin,{x:0,y:0,z:0});assert.deepEqual(start.axis,{x:0,y:1,z:0});
 const end=structuredClone(edge);end.descriptor.origin.y=5.08;end.descriptor.axis.y=-1;assert.deepEqual(threadPlacementFromCircularEdge(end,[face]).axis,{x:0,y:-1,z:0});assert.equal(JSON.stringify([edge,face]),before);
});
test('arc, missing native range, planar cap, wrong axis/radius, interior rim and ambiguity reject without fallback',()=>{
 for(const patch of [{measure:Math.PI*.3175},{curve:'ellipse'},{axis:{x:0,y:0,z:0}},{origin:{x:0,y:1,z:0}}])assert.throws(()=>threadPlacementFromCircularEdge({...edge,descriptor:{...edge.descriptor,...patch}},[face]));
 for(const patch of [{axisRange:undefined},{surface:'plane'},{radius:.4},{radius:undefined},{axis:{x:1,y:0,z:0}},{referenceOrigin:{x:1,y:0,z:0}}])assert.throws(()=>threadPlacementFromCircularEdge(edge,[{...face,descriptor:{...face.descriptor,...patch}}]));
 assert.throws(()=>threadPlacementFromCircularEdge(edge,[face,{...face,persistentId:'other'}]),/ambiguous/);assert.equal(threadPlacementFromCircularEdge(edge,[face,structuredClone(face)]).face,face);
});
test('oblique native boundary uses axis range, never guessed AABB or world Y',()=>{
 const a={x:.6,y:.8,z:0},origin={x:1,y:2,z:3},e={...edge,descriptor:{...edge.descriptor,origin,axis:a}},f={...face,descriptor:{...face.descriptor,axis:a,referenceOrigin:origin,axisRange:[0,5]}};
 assert.deepEqual(threadPlacementFromCircularEdge(e,[f]).axis,a);e.descriptor.origin={x:4,y:6,z:3};assert.deepEqual(threadPlacementFromCircularEdge(e,[f]).axis,{x:-.6,y:-.8,z:0});
});
test('ordinary thread circular-edge selector and creator retain real native references, inward axis, cold annotation and unchanged solid geometry',async()=>{
 const d=createPartDocument({id:'thread-native-boundary'});createFeatureDefinition(d,'cylinder',{id:'shaft',params:{x:0,y:0,z:0,r:.3175,h:5.08}});const c=compileKernelFeatureTree(d),run=await regenerateFeatures({...c.document,features:c.features});let coldRun;
 try{
  assert.ok(run.ok);const entries=run.results.get('shaft').topology,rim=entries.find(e=>e.kind==='edge'&&e.descriptor.curve==='circle'&&Math.abs(e.descriptor.origin.y)<1e-6);assert.ok(rim);
  const native=threadPlacementFromCircularEdge(rim,entries);assert.ok(Math.abs(native.origin.y)<1e-6);assert.deepEqual(native.axis,{x:0,y:1,z:0});
  const body={id:42,featureId:'shaft',kind:'cyl'},E={def:d,topologySelection:[topologyReferenceFromEntry(rim)]},messages=[];let history=0;
  const selected=fn('selectedThreadStart',{E,selectedCylindricalFace:()=>null,selectedSolid:()=>body,topologyEntriesForPart:()=>entries,threadPlacementFromCircularEdge,threadPlacementFromFace,topologyReferenceFromEntry});
  const create=fn('createThreadFeature',{E,selectedThreadStart:selected,selectedSolid:()=>body,featureDefaults:()=>({}),canonicalFeatureTopologyReferences,cutTargetFeatureId:()=> 'shaft',normalizeThreadSpec,validateThreadFeature,modeledThreadSolid,createFeatureDefinition,cosmeticThread,threadCallout,
   flash:m=>messages.push(m),t:k=>k,cloneData:structuredClone,pushUndo:()=>history++,H:{discard(){}},isCanonicalAuthoring:()=>true,refreshAll(){}});
  assert.equal(create({threadPreset:'unc-quarter-20',mode:'cosmetic',side:'external',length:2.54}),true);assert.equal(history,1);
  const feature=d.features.at(-1);assert.deepEqual(feature.references.topology.map(r=>r.kind),['face','edge']);assert.equal(feature.references.topology[1].persistentId,rim.persistentId);assert.deepEqual(feature.params.axis,{x:0,y:1,z:0});assert.equal(feature.params.diameterMm,6.35);
  const cold=JSON.parse(JSON.stringify(d)),compiled=compileKernelFeatureTree(cold);assert.ok(compiled.ok,JSON.stringify(compiled.issues));coldRun=await regenerateFeatures({...compiled.document,features:compiled.features});assert.ok(coldRun.ok,JSON.stringify(coldRun.issues));assert.ok(Math.abs((await shapeMassProperties(coldRun.finalShape)).volume-(await shapeMassProperties(run.finalShape)).volume)<1e-8);assert.equal(coldRun.results.get(feature.id).annotation,'cosmetic-thread');assert.deepEqual(coldRun.results.get(feature.id).spec.axis,feature.params.axis);
  const changed=topologyReferenceFromEntry(rim);changed.descriptor.radius*=2;E.topologySelection=[changed];assert.equal(selected(),null,'same-ID stale geometry is not accepted');
  E.topologySelection=[{...topologyReferenceFromEntry(rim),persistentId:'stale'}];assert.equal(selected(),null);assert.equal(create({threadPreset:'unc-quarter-20'}),false);assert.equal(history,1);assert.equal(d.features.length,2);
 }finally{releaseRegeneration(run);releaseRegeneration(coldRun);}
});
