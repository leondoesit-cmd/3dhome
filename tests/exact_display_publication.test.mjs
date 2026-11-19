import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createExactPublicationDraft} from '../js/core/exact_publication_draft.js';
import {applyCurrentExactDiagnostics,captureExactDiagnostics} from '../js/core/exact_diagnostics.js';
import {captureExactTopology} from '../js/core/exact_topology_cache.js';
import {publishRebuildStatus,withKernelFailures} from '../js/core/parametric_rebuild.js';
import {meshDataBounds} from '../js/core/kernel_body.js';
import {modelerSource} from './helpers/modeler_source.mjs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const names=['exactDisplayBody','queueExactMesh','publishExactBodies','regenerateExactModelNow','rebuildFailureMessage'];
const production=names.map(name=>sourceFunctionText(modelerSource(),name)).join('\n');
const flush=()=>new Promise(setImmediate);
const healthy=()=>({ok:true,issues:[],status:[{historyId:'step',targetId:'base',state:'rebuilt'}]});

function exactRun(label,{failed=false,body=true,native=false}={}) {
  const brep={topology:[{kind:'face',persistentId:label}],
    ...(native ? {shape:{}} : {verifiedSerializedExact:true,workerMeshData:{positions:[0,0,0,1,0,0,0,1,1],indices:[0,1,2]}})};
  return {ok:!failed,issues:failed ? [{code:'regeneration-failed',feature:'base',message:label}] : [],
    results:new Map(body ? [['base',brep]] : []),finalShape:body ? brep : null};
}

function rig() {
  const part={id:'body',featureId:'base',kind:'box'};
  const doc={metadata:{authoringSystem:'parametric-v1',adapter:'cabinet',generatedParameters:{generation:0}},
    parts:[part],features:[{id:'base',type:'box',params:{w:1,h:1,d:1},inputs:[]}],
    history:[{id:'step',targetId:'base',kind:'feature'}],sketches:[]};
  const E={def:doc,docType:'part',massEditRevision:1,mode:'3d'};
  let node={};
  const jobs=[],released=[],disposed=[],counts={status:0,refresh:0,warnings:0,transfers:0};
  const noop=()=>{};
  const context={E,createExactPublicationDraft,captureExactDiagnostics,captureExactTopology,withKernelFailures,
    publishRebuildStatus,meshDataBounds,cloneData:structuredClone,
    currentHistoryNode:()=>node,cutTargetFeatureId:p=>p.featureId,
    compileKernelFeatureTree:d=>({ok:true,document:{...d},features:d.features}),
    regenerateFeatures(document,options){const job=Promise.withResolvers();jobs.push({...job,document,options});return job.promise;},
    releaseRegeneration:run=>released.push(run),disposeBrep:brep=>disposed.push(brep),
    exactBrepForPart:async()=>({shape:{legacy:true}}),
    activeParts:d=>d.parts,isCanonicalAuthoring:()=>true,partSupportsExactMesh:()=>true,
    exactPreviewWasCancelled:()=>false,exactBuildTimers:new Map(),isKernelBody:()=>false,
    syncStatus:()=>counts.status++,refreshChangedPart:()=>counts.refresh++,
    shapeToMeshData:async()=>{counts.transfers++;return {positions:[0,0,0,1,0,0,0,1,1]};},
    clearTopologyCache:noop,syncCommandManager:noop,flash:noop,t:key=>key,root:null,
    refreshParts:noop,renderPreview:noop,modelParameterOverrides:()=>({}),
    rebuildParametricDocument(draft){
      // Exercise the real cabinet status publication that replaces body objects.
      const generated=structuredClone(draft);
      generated.metadata.generatedParameters.generation++;
      return {...healthy(),document:generated};
    },
    synchronizeExtrusionProjections:()=>[],refreshChangedPartPreviews:noop,invalidateDrawing:noop,
    exactRunStamp:()=>({node}),exactSaveCache:{put:noop},syncAuthoringWorkflow:noop,
    console:{warn:()=>counts.warnings++,error:noop},
  };
  vm.runInNewContext(production,context);
  return {part,doc,E,jobs,released,disposed,counts,context,setNode:value=>{node=value;}};
}

async function replaceBody(f) {
  const published=exactRun('published');
  const pending=f.context.regenerateExactModelNow(true);
  f.jobs.at(-1).resolve(published);
  assert.equal(await pending,published);
  assert.notEqual(f.doc.parts[0],f.part);
  assert.equal(f.doc.parts[0].id,f.part.id);
  assert.equal(f.doc.parts[0].exactBuildToken,2);
  assert.equal(f.part.exactBuildToken,2);
  assert.equal(f.E.exactDiagnosticRun,null);
  assert.equal(f.doc.exactTopologyCache.base.topology[0].persistentId,'published');
  return published;
}

async function currentFailure(f) {
  const failed=exactRun('current failure',{failed:true,body:false});
  const pending=f.context.exactDisplayBody(f.doc.parts[0]);
  f.jobs.at(-1).resolve(failed);
  await assert.rejects(pending,/current failure/);
  assert.equal(applyCurrentExactDiagnostics(healthy(),f.E.exactDiagnosticRun,f.doc,
    f.context.currentHistoryNode(),f.E.massEditRevision).ok,false);
  return failed;
}

for(const completion of ['failure','success','partial failure','rejection']) {
  test('replaced body late '+completion+' cannot publish diagnostics or topology through the real display builder',async()=>{
    const f=rig();
    f.context.queueExactMesh(f.part);
    const oldJob=f.jobs[0];
    const published=await replaceBody(f);
    // A stale success must also leave a newer failure visible, even when its
    // requested-head result would normally clear every retained issue.
    const failed=completion==='success' ? await currentFailure(f) : null;
    const diagnostics=f.E.exactDiagnosticRun,topology=f.doc.exactTopologyCache;
    const before=structuredClone(f.doc),counts={...f.counts};
    const oldRun=exactRun('obsolete result',{failed:completion.includes('failure'),body:completion!=='failure'});
    if(completion==='rejection')oldJob.reject(Error('obsolete rejection'));
    else oldJob.resolve(oldRun);
    await flush();
    assert.equal(f.E.exactDiagnosticRun,diagnostics);
    assert.equal(f.doc.exactTopologyCache,topology);
    assert.deepEqual(f.doc,before);
    assert.deepEqual(f.counts,counts);
    assert.equal(f.E.brepRun,published);
    assert.equal(f.released.filter(run=>run===oldRun).length,completion==='rejection'?0:1);
    assert.equal(f.released.includes(published),false,'the adopted run stays owned by the editor');
    if(failed)assert.equal(f.released.filter(run=>run===failed).length,1);
  });
}

for(const change of ['superseded','detached'])for(const failed of [false,true]) {
  test(change+' queue cannot publish late '+(failed?'failure':'success')+' metadata',async()=>{
    const f=rig();
    f.context.queueExactMesh(f.part);
    const oldJob=f.jobs[0];
    if(change==='superseded')f.context.queueExactMesh(f.part);
    else f.doc.parts[0]={...f.part}; // Retain the id and token, change the owner.
    await currentFailure(f);
    const diagnostics=f.E.exactDiagnosticRun;
    const topology=f.doc.exactTopologyCache=captureExactTopology(f.doc,f.doc.features,exactRun('retained topology'));
    const counts={...f.counts},before=structuredClone(f.doc);
    const oldRun=exactRun('obsolete result',{failed,body:!failed});
    oldJob.resolve(oldRun);
    await flush();
    assert.equal(f.E.exactDiagnosticRun,diagnostics);
    assert.equal(f.doc.exactTopologyCache,topology);
    assert.deepEqual(f.doc,before);
    assert.deepEqual(f.counts,counts);
    assert.equal(f.released.filter(run=>run===oldRun).length,1);
    if(change==='superseded'){
      const current=exactRun('current mesh');
      f.jobs[1].resolve(current);
      await flush();
      assert.equal(f.part.exactPending,false);
      assert.equal(f.E.exactDiagnosticRun,null);
      assert.equal(f.doc.exactTopologyCache.base.topology[0].persistentId,'current mesh');
      assert.equal(f.released.filter(run=>run===current).length,1);
    }
  });
}

for(const change of ['document','history','revision','caller'])for(const failed of [false,true]) {
  test(change+' ownership guards '+(failed?'diagnostics':'topology and diagnostic clearing')+' without changing display release',async()=>{
    const f=rig();let current=true;
    const diagnostics=f.E.exactDiagnosticRun=captureExactDiagnostics(f.doc,f.context.currentHistoryNode(),1,
      exactRun('retained failure',{failed:true,body:false}));
    const topology=f.doc.exactTopologyCache=captureExactTopology(f.doc,f.doc.features,exactRun('retained topology'));
    const pending=f.context.exactDisplayBody(f.part,f.doc,null,{isCurrent:()=>current});
    if(change==='document')f.E.def={};
    if(change==='history')f.setNode({});
    if(change==='revision')f.E.massEditRevision++;
    if(change==='caller')current=false;
    const run=exactRun('late result',{failed,body:!failed,native:true});
    f.jobs[0].resolve(run);
    if(failed)await assert.rejects(pending,/late result/);
    else{
      const display=await pending;
      assert.equal(display.brep,run.results.get('base'));
      assert.deepEqual(f.released,[],'successful stale results remain caller-owned until released');
      display.release();
    }
    assert.equal(f.E.exactDiagnosticRun,diagnostics);
    assert.equal(f.doc.exactTopologyCache,topology);
    assert.deepEqual(f.released,[run]);
  });
}

test('current queues publish failures, then clear them and publish verified topology on retry',async()=>{
  const f=rig();
  f.context.queueExactMesh(f.part);
  const failed=exactRun('native failure',{failed:true,body:false});
  f.jobs[0].resolve(failed);
  await flush();
  assert.equal(f.part.exactPending,false);
  assert.equal(f.part.exactError,'native failure');
  assert.equal(f.counts.warnings,1);
  assert.equal(f.E.exactDiagnosticRun.kernelRun.issues[0].message,'native failure');
  f.context.queueExactMesh(f.part);
  const retry=exactRun('retry');
  f.jobs[1].resolve(retry);
  await flush();
  assert.equal(f.E.exactDiagnosticRun,null);
  assert.equal(f.part.exactPending,false);
  assert.equal(f.part.exactError,null);
  assert.ok(f.part.meshData.positions.length);
  assert.equal(f.doc.exactTopologyCache.base.topology[0].persistentId,'retry');
  assert.deepEqual(f.released,[failed,retry]);
});

test('detached candidates and requested heads keep default publication and native release behavior',async()=>{
  const f=rig(),candidate={...f.part};
  const pending=f.context.exactDisplayBody(candidate,f.doc,'base');
  const run=exactRun('candidate',{native:true});
  assert.equal(f.jobs[0].options.requestedHead,'base');
  f.jobs[0].resolve(run);
  const display=await pending;
  assert.equal(display.brep,run.finalShape);
  assert.equal(f.doc.exactTopologyCache.base.topology[0].persistentId,'candidate');
  assert.deepEqual(f.released,[]);
  display.release();
  assert.deepEqual(f.released,[run]);
});

for(const failed of [false,true])test('snapshot '+(failed?'failure':'success')+' cannot publish into the live document',async()=>{
  const f=rig(),snapshot=structuredClone(f.doc);
  const pending=f.context.exactDisplayBody(snapshot.parts[0],snapshot,null,{massProperties:true,restoreMode:'mesh'});
  const run=exactRun('snapshot',{failed,body:!failed});
  assert.equal(f.jobs[0].options.massProperties,true);
  assert.equal(f.jobs[0].options.restoreMode,'mesh');
  f.jobs[0].resolve(run);
  if(failed)await assert.rejects(pending,/snapshot/);
  else(await pending).release();
  assert.equal(f.E.exactDiagnosticRun,undefined);
  assert.equal(f.doc.exactTopologyCache,undefined);
  assert.equal(snapshot.exactTopologyCache,undefined);
  assert.deepEqual(f.released,[run]);
});

test('legacy callers keep their direct BREP disposal contract',async()=>{
  const f=rig();delete f.doc.metadata;
  const display=await f.context.exactDisplayBody(f.part);
  assert.equal(f.jobs.length,0);
  display.release();
  assert.deepEqual(f.disposed,[display.brep]);
  assert.deepEqual(f.released,[]);
});
