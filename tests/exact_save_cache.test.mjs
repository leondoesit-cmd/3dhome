import {createExactPublicationDraft} from '../js/core/exact_publication_draft.js';
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {createExactSaveCache} from '../js/core/exact_save_cache.js';
import fs from 'node:fs';

function fixture(){
  const document={parts:[{id:'body',density:7.85,color:'#aaa'}],sketches:[{id:'profile',plane:'top',points:[{id:'p',x:1,y:2}],entities:[],constraints:[]}],references:[{id:'plane:top',type:'plane',normal:{x:0,y:1,z:0}}],parameters:{depth:{value:2}}};
  const features=[{id:'solid',type:'extrude',params:{sketchId:'profile',depth:2},references:{sketches:['profile'],references:['plane:top']},inputs:[]}];
  const compiled={ok:true,document,features};
  const body={verifiedSerializedExact:true,workerMeshData:{positions:new Float32Array([0,0,0,1,0,0,0,1,0])},topology:[{persistentId:'solid:face:1',kind:'face'}]};
  return {document,compiled,run:{ok:true,issues:[],results:new Map([['solid',body]]),topologyBindings:[]}};
}

test('material-only repeated save reuses isolated exact mesh and topology byte-for-byte',()=>{
  const {document,compiled,run}=fixture(),cache=createExactSaveCache();
  assert.equal(cache.put(document,compiled,run),true);
  const expected=structuredClone(run);
  document.parts[0].density=2.7;document.parts[0].materialName='Aluminum';document.parts[0].color='#ddd';
  document.name='Renamed';document.description='Updated properties';document.appearances=[{kind:'body',material:'aluminum'}];
  assert.deepEqual(cache.get(document,compiled),expected);
  run.results.get('solid').workerMeshData.positions[0]=123;
  const read=cache.get(document,compiled);
  assert.deepEqual(read,expected,'background publication cannot mutate the saved proof');
  read.results.get('solid').topology[0].persistentId='changed';
  assert.deepEqual(cache.get(document,compiled),expected,'a save receives its own copy');
  assert.equal(cache.get({...document},compiled),null,'another document cannot borrow this proof');
});

for(const change of [
  c=>c.features[0].params.depth=3,
  c=>c.document.sketches[0].points[0].x+=1e-8,
  c=>c.document.references[0].normal.x=.1,
  c=>c.document.parameters.depth.value=3,
  c=>c.features[0].suppressed=true,
  c=>c.features[0].params.sourcePayload={bytes:[1,2,3]},
  c=>c.document.localFrame={origin:{x:1,y:0,z:0}},
  c=>c.features.push({id:'thread',type:'thread',params:{threadPreset:'custom',pitchMm:4,diameterMm:8,length:1.2},inputs:['solid'],references:[]}),
  c=>c.features[0].references.topology=[{ownerFeatureId:'solid',persistentId:'solid:face:changed'}],
])test('changed native input cannot reuse a previous save proof: '+change.toString(),()=>{
  const {document,compiled,run}=fixture(),cache=createExactSaveCache();cache.put(document,compiled,run);
  change(compiled);
  assert.equal(cache.get(document,compiled),null);
});

function viewportFixture(afterPublish=()=>{}) {
  const proof=fixture(),E={docType:'part',def:proof.document,massEditRevision:0,exactRestoring:false};
  proof.run.finalShape=proof.run.results.get('solid');
  const cache=createExactSaveCache(),noop=()=>{};
  const bindings={createExactPublicationDraft,refreshChangedPartPreviews:noop,E,activeParts:()=>[proof.document.parts[0]],flash:noop,t:key=>key,syncCommandManager:noop,syncStatus:noop,
    currentHistoryNode:()=>1,releaseExactRun:noop,isCanonicalAuthoring:()=>true,
    compileKernelFeatureTree:()=>proof.compiled,modelParameterOverrides:()=>({}),rebuildParametricDocument:()=>({ok:true}),
    publishRebuildStatus:noop,regenerateFeatures:async()=>proof.run,releaseRegeneration:noop,captureExactDiagnostics:noop,
    synchronizeExtrusionProjections:()=>[],invalidatePartMeshAfterEdit:noop,captureExactTopology:()=>({}),
    withKernelFailures:validation=>validation,publishExactBodies:async()=>{afterPublish(E,proof);return [];},
    exactBuildTimers:new Map(),clearTopologyCache:noop,refreshChangedParts:noop,refreshParts:noop,invalidateDrawing:noop,
    exactRunStamp:()=> 'current-proof',exactSaveCache:cache,syncAuthoringWorkflow:noop,
    rebuildFailureMessage:()=> 'failed',console:{error:noop}};
  const source=modelerSource();
  const start=source.indexOf('async function regenerateExactModelNow('),end=source.indexOf('\n/* An assembly is exported',start);
  const rebuild=new Function(...Object.keys(bindings),source.slice(start,end)+';return regenerateExactModelNow;')(...Object.values(bindings));
  return {...proof,E,cache,rebuild};
}

test('completed current viewport proof warms Save cache without sharing worker mesh objects',async()=>{
  const proof=viewportFixture();
  assert.ok(await proof.rebuild());
  const cached=proof.cache.get(proof.document,proof.compiled);
  assert.ok(cached,'first Save after native viewport restore reuses the verified proof');
  proof.run.results.get('solid').workerMeshData.positions[0]=123;
  assert.equal(cached.results.get('solid').workerMeshData.positions[0],0);
});

test('document switch during awaited viewport publication never warms another document Save cache',async()=>{
  const proof=viewportFixture(E=>{E.def={name:'new document'};});
  assert.equal(await proof.rebuild(),null);
  assert.equal(proof.cache.get(proof.document,proof.compiled),null);
  assert.equal(proof.cache.get(proof.E.def,proof.compiled),null);
});

test('failed or unverified current viewport results never become Save proof',async()=>{
  for(const update of [run=>run.ok=false,run=>run.results.get('solid').verifiedSerializedExact=false,
    run=>run.results.get('solid').approximate=true,run=>run.results.get('solid').shape={}]){
    const proof=viewportFixture();update(proof.run);
    await proof.rebuild();
    assert.equal(proof.cache.get(proof.document,proof.compiled),null);
  }
});

test('failed, approximate, unverified and native-handle runs cannot enter the save cache',()=>{
  for(const change of [r=>r.ok=false,r=>r.results.get('solid').invalid=true,r=>r.results.get('solid').approximate=true,r=>r.results.get('solid').verifiedSerializedExact=false,r=>r.results.get('solid').shape={}]){
    const {document,compiled,run}=fixture(),cache=createExactSaveCache();change(run);
    assert.equal(cache.put(document,compiled,run),false);
    assert.equal(cache.get(document,compiled),null);
  }
});
