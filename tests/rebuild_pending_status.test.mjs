import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createExactPublicationDraft} from '../js/core/exact_publication_draft.js';
import {createExactRebuildQueue} from '../js/core/exact_rebuild_queue.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();
function fixture(){
 const part={id:1},st={},E={docType:'part',mode:'3d',def:{parts:[part]},coreRun:{issues:[],bodies:[{}]}};
 const bindings={E,root:{querySelector:()=>st},t:key=>key,activeParts:def=>def.parts,
  inferAuthoringMode:()=> 'parametric',nativeSolidSummary:()=>({known:true,count:1}),hasSingleToolboxKernelRecipe:()=>false,
  topologyStatusCaption:()=>'',documentDirty:()=>true};
 const names=['displayedCoreIssues','modelRebuildPending','rebuildStatusCaption','syncStatusLine'];
 const api=new Function(...Object.keys(bindings),names.map(name=>sourceFunctionText(source,name)).join('\n')+';return {'+names.join(',')+'};')(...Object.values(bindings));
 return {E,part,st,api};
}
test('support edit retains old healthy core run but cannot report success or its solid counts while exact restore is pending',()=>{
 const f=fixture();f.api.syncStatusLine();assert.match(f.st.innerHTML,/rebuildOk/);assert.match(f.st.innerHTML,/Native solids: 1/);
 f.E.exactRestoring=true;f.api.syncStatusLine();assert.match(f.st.innerHTML,/rebuildPending/);
 assert.doesNotMatch(f.st.innerHTML,/rebuildOk|Native solids:|1 parts/);
 f.E.exactRestoring=false;f.api.syncStatusLine();assert.match(f.st.innerHTML,/rebuildOk/);assert.match(f.st.innerHTML,/Native solids: 1/);
});
test('native busy and per-part mesh builds mask previous success, then failures remain visible',()=>{
 const f=fixture();f.E.kernelBusy=true;assert.match(f.api.rebuildStatusCaption(),/rebuildPending/);
 f.E.kernelBusy=false;f.part.exactPending=true;f.part.exactError='Slow computation';assert.match(f.api.rebuildStatusCaption(),/rebuildPending/);
 f.part.exactPending=false;f.part.exactError='Failed native branch';assert.match(f.api.rebuildStatusCaption(),/rebuildFail/);assert.doesNotMatch(f.api.rebuildStatusCaption(),/rebuildOk/);
 delete f.part.exactError;f.E.coreRun=null;assert.match(f.api.rebuildStatusCaption(),/rebuildUnchecked/);
 f.E.coreRun={issues:[{severity:'warning'}]};assert.match(f.api.rebuildStatusCaption(),/rebuildWarn/);
 f.E.coreRun.issues=[{severity:'error'}];assert.match(f.api.rebuildStatusCaption(),/rebuildFail/);
});
// Execute the production functions with deferred worker/mesh results so status
// and ownership can be checked on either side of their awaits.
const production=['regenerateExactModelNow','publishExactBodies','queueExactMesh']
 .map(name=>sourceFunctionText(source,name)).join('\n');
function exactFixture(){
 const f=fixture(),{E,part}=f,work=Promise.withResolvers();
 const commandStates=[],statuses=[],released=[],messages=[],errors=[];
 const mesh={positions:[0,0,0,1,1,1]},body={verifiedSerializedExact:true,workerMeshData:mesh};
 const run={ok:true,finalShape:body,results:new Map([[part.id,body]])};
 const previousRun={ok:true,finalShape:{}},previousStamp={node:'previous'};
 E.massEditRevision=0;E.kernelBusy=false;E.brepRun=previousRun;E.brepStamp=previousStamp;
 let node={};
 const noop=()=>{};
 const context={E,createExactPublicationDraft,activeParts:def=>def.parts,t:key=>key,
  syncCommandManager:()=>commandStates.push(E.kernelBusy),
  syncStatus:()=>statuses.push({busy:E.kernelBusy,caption:f.api.rebuildStatusCaption()}),
  flash:message=>messages.push(message),console:{error:error=>errors.push(error),warn:noop},
  currentHistoryNode:()=>node,isCanonicalAuthoring:()=>true,
  compileKernelFeatureTree:()=>({ok:true,document:{},features:[]}),
  regenerateFeatures:()=>work.promise,releaseRegeneration:result=>released.push(result),
  cloneData:structuredClone,cutTargetFeatureId:p=>p.id,meshDataBounds:()=>({}),
  captureExactDiagnostics:noop,synchronizeExtrusionProjections:()=>[],captureExactTopology:noop,
  modelParameterOverrides:()=>({}),rebuildParametricDocument:()=>E.coreRun,withKernelFailures:core=>core,
  publishRebuildStatus:noop,exactBuildTimers:new Map(),clearTopologyCache:noop,
  invalidateDrawing:noop,refreshChangedPartPreviews:noop,refreshParts:noop,
  exactRunStamp:()=>({node}),exactSaveCache:{put:noop},syncAuthoringWorkflow:noop,
  rebuildFailureMessage:()=> 'Native branch failed',
  exactPreviewWasCancelled:()=>false,partSupportsExactMesh:()=>true,isKernelBody:()=>false,
  refreshChangedPart:noop,renderPreview:noop};
 vm.runInNewContext(production,context);
 return {...f,context,work,run,body,commandStates,statuses,released,messages,errors,previousRun,previousStamp,
  editHistory(){node={};}};
}

test('native rebuild publishes pending before compilation and clears it after adopting a current result',async()=>{
 const f=exactFixture();
 f.context.compileKernelFeatureTree=()=>{
  assert.deepEqual(f.commandStates,[true]);
  assert.equal(f.statuses.length,1);
  assert.match(f.statuses[0].caption,/rebuildPending/);
  return {ok:true,document:{},features:[]};
 };
 const rebuilding=f.context.regenerateExactModelNow(true);
 assert.equal(f.E.kernelBusy,true);
 f.work.resolve(f.run);
 assert.equal(await rebuilding,f.run);
 assert.equal(f.E.brepRun,f.run);
 assert.deepEqual(f.released,[f.previousRun],'the adopted native result stays alive');
 assert.deepEqual(f.commandStates,[true,false]);
 assert.equal(f.statuses.at(-1).busy,false);
 assert.match(f.statuses.at(-1).caption,/rebuildOk/);
 assert.deepEqual(f.errors,[]);
});

for(const failure of ['compilation','worker','mesh transfer'])
 test('current '+failure+' failure clears busy status and releases only an unused result',async()=>{
  const f=exactFixture(),error=Error(failure);
  if(failure==='compilation')f.context.compileKernelFeatureTree=()=>{throw error;};
  if(failure==='mesh transfer'){
   f.body.verifiedSerializedExact=false;f.body.shape={};
   f.context.shapeToMeshData=async()=>{throw error;};
  }
  const rebuilding=f.context.regenerateExactModelNow(true);
  if(failure==='worker')f.work.reject(error);else f.work.resolve(f.run);
  assert.equal(await rebuilding,null);
  assert.equal(f.E.brepRun,f.previousRun);
  assert.equal(f.E.brepStamp,f.previousStamp);
  assert.deepEqual(f.released,failure==='mesh transfer'?[f.run]:[]);
  assert.deepEqual(f.commandStates,[true,false]);
  assert.equal(f.statuses.at(-1).busy,false);
  assert.doesNotMatch(f.statuses.at(-1).caption,/rebuildPending/);
  assert.deepEqual(f.errors,[error]);
 });

test('a failed adopted run remains available for branch diagnostics while busy status clears',async()=>{
 const f=exactFixture();f.run.ok=false;
 f.work.resolve(f.run);
 assert.equal(await f.context.regenerateExactModelNow(true),null);
 assert.equal(f.E.brepRun,f.run);
 assert.equal(f.E.brepStamp,null);
 assert.deepEqual(f.released,[f.previousRun]);
 assert.deepEqual(f.commandStates,[true,false]);
 assert.equal(f.statuses.at(-1).busy,false);
 assert.equal(f.errors.length,1);
});

for(const phase of ['worker','mesh transfer'])for(const change of ['history','edit revision','document'])
 test(change+' changes during '+phase+' preserve the live model and discard the unused result',async()=>{
  const f=exactFixture(),transfer=Promise.withResolvers(),entered=Promise.withResolvers();
  if(phase==='mesh transfer'){
   f.body.verifiedSerializedExact=false;f.body.shape={};
   f.context.shapeToMeshData=()=>{entered.resolve();return transfer.promise;};
  }
  const rebuilding=f.context.regenerateExactModelNow(true);
  if(phase==='mesh transfer'){f.work.resolve(f.run);await entered.promise;}
  if(change==='history')f.editHistory();
  if(change==='edit revision')f.E.massEditRevision++;
  if(change==='document')f.E.def={parts:[{id:2}]};
  f.E.def.parts[0].meshData={positions:['newer edit']};
  const document=f.E.def,before=structuredClone(document),core=f.E.coreRun;
  if(phase==='worker')f.work.resolve(f.run);else transfer.resolve(f.body.workerMeshData);
  assert.equal(await rebuilding,null);
  assert.equal(f.E.def,document);
  assert.deepEqual(document,before,'an obsolete native result must not overwrite edits');
  assert.equal(f.E.coreRun,core);
  assert.equal(f.E.brepRun,f.previousRun);
  assert.equal(f.E.brepStamp,f.previousStamp);
  assert.deepEqual(f.released,[f.run]);
  assert.deepEqual(f.commandStates,[true,false],'the current queue still owns its busy flag after an edit');
  assert.equal(f.statuses.at(-1).busy,false);
  assert.equal(f.messages.some(message=>message.includes('kernelReady')),false);
  assert.deepEqual(f.errors,[]);
 });

for(const completion of ['result','error'])
 test('an obsolete worker '+completion+' cannot clear a newer queue generation busy status',async()=>{
  const f=exactFixture(),queue=createExactRebuildQueue();
  const entered=Promise.withResolvers(),newer=Promise.withResolvers();
  const old=queue.run(current=>{entered.resolve();return f.context.regenerateExactModelNow(true,current);});
  await entered.promise;
  queue.reset();
  // Keep the new job pending until the old completion has been observed.
  const newWork=Promise.withResolvers();
  f.context.regenerateFeatures=()=>{newer.resolve();return newWork.promise;};
  const current=queue.run(isCurrent=>f.context.regenerateExactModelNow(true,isCurrent));
  await newer.promise;
  const before=f.statuses.slice();
  if(completion==='result')f.work.resolve(f.run);else f.work.reject(Error('obsolete worker'));
  assert.equal(await old,null);
  assert.equal(f.E.kernelBusy,true);
  assert.deepEqual(f.commandStates,[true,true]);
  assert.deepEqual(f.statuses,before,'obsolete work must not republish current status');
  assert.deepEqual(f.released,completion==='result'?[f.run]:[]);
  assert.equal(f.E.brepRun,f.previousRun);
  assert.deepEqual(f.errors,[]);
  const newRun={...f.run};newWork.resolve(newRun);
  assert.equal(await current,newRun);
  assert.deepEqual(f.commandStates,[true,true,false]);
  assert.equal(f.statuses.at(-1).busy,false);
  assert.deepEqual(f.released,completion==='result'?[f.run,f.previousRun]:[f.previousRun]);
 });

for(const completion of ['mesh','error'])test('per-part '+completion+' completion republishes status after pending clears',async()=>{
 const f=exactFixture(),display=Promise.withResolvers();let releases=0;
 f.context.exactDisplayBody=()=>display.promise;
 f.context.queueExactMesh(f.part);
 assert.match(f.statuses.at(-1).caption,/rebuildPending/);
 assert.equal(f.part.exactPending,true);
 if(completion==='mesh')display.resolve({brep:f.body,release(){releases++;}});
 else display.reject(Error('Native branch failed'));
 await new Promise(setImmediate);
 assert.equal(f.part.exactPending,false);
 assert.match(f.statuses.at(-1).caption,completion==='mesh'?/rebuildOk/:/rebuildFail/);
 assert.doesNotMatch(f.statuses.at(-1).caption,/rebuildPending/);
 assert.equal(releases,completion==='mesh'?1:0);
});
test('same coach button changes both accessible and visible action from finish sketch to save',()=>{
 const node=()=>({classList:{toggle(){}},setAttribute(name,value){this[name]=value;}});
 const nodes=Object.fromEntries(['mdCoach','mdCoachIcon','mdCoachLabel','mdCoachText','mdCoachGo','mdCoachDots'].map(id=>['#'+id,node()]));
 const E={open:true,coachEnabled:true,tour:{active:false},docType:'part',mode:'3d'};
 let suggestion={icon:'ph-check',text:'finish',act:'Finish sketch',run:()=> 'finish'};
 const bindings={root:{querySelector:id=>nodes[id]},E,clearCoachTarget(){},coachSuggestion:()=>suggestion,t:key=>key,
  isCanonicalAuthoring:()=>true,currentWorkflowStep:()=> 'history',syncEmptyStart(){},syncModelerMobile(){}};
 const sync=new Function(...Object.keys(bindings),sourceFunctionText(source,'syncCoach')+';return syncCoach;')(...Object.values(bindings));
 sync();const button=nodes['#mdCoachGo'];assert.equal(button['aria-label'],'Finish sketch');assert.match(button.innerHTML,/Finish sketch/);
 suggestion={icon:'ph-save',text:'save',act:'Save to library',run:()=> 'save'};sync();
 assert.equal(button['aria-label'],'Save to library');assert.match(button.innerHTML,/Save to library/);assert.doesNotMatch(button.innerHTML,/Finish sketch/);
 assert.equal(E._coachSug.run(),'save','click handler consumes the new command suggestion');
});
