import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCurrentExactDiagnostics,captureExactDiagnostics} from '../js/core/exact_diagnostics.js';
import {publishRebuildStatus} from '../js/core/parametric_rebuild.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {captureExactTopology} from '../js/core/exact_topology_cache.js';

const healthy=()=>({ok:true,issues:[],status:[{targetId:'rib',historyId:'step4',state:'rebuilt'}]});
const failure={ok:false,issues:[{code:'regeneration-failed',feature:'rib:tool',message:'Curved stopping surface failed'}]};
test('ordinary refresh after native failure retains exact feature and document failure status',()=>{
  const document={features:[{id:'rib',type:'rib'}],history:[{id:'step4',targetId:'rib'}]},node={};
  const anchor=captureExactDiagnostics(document,node,2,failure);
  const run=applyCurrentExactDiagnostics(healthy(),anchor,document,node,2);publishRebuildStatus(document,run);
  assert.equal(run.ok,false);assert.equal(document.features[0].state,'failed');assert.equal(document.history[0].status,'failed');
  assert.equal(document.features[0].diagnostics[0].message,'Curved stopping surface failed');
});
test('prior native failure cannot follow another document, another history node or a coalesced edit',()=>{
  const document={},node={},anchor=captureExactDiagnostics(document,node,2,failure);
  for(const [doc,history,revision] of [[{},node,2],[document,{},2],[document,node,3]]){
    const run=healthy();assert.equal(applyCurrentExactDiagnostics(run,anchor,doc,history,revision),run);
  }
});
test('a successful exact run clears diagnostic ownership and retains no released native handles',()=>{
  const anchor=captureExactDiagnostics({},'node',0,{...failure,results:new Map(),finalShape:{native:true}});
  assert.equal(anchor.kernelRun.results,undefined);assert.equal(anchor.kernelRun.finalShape,undefined);
  assert.equal(captureExactDiagnostics({},'node',0,{ok:true,issues:[]}),null);
  failure.issues[0].message='Changed source issue';assert.equal(anchor.kernelRun.issues[0].message,'Curved stopping surface failed');
});

function displayFunction(context){
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),start=source.indexOf('async function exactDisplayBody('),end=source.indexOf('\nfunction queueExactMesh(',start);
  runInNewContext(source.slice(start,end)+';this.display=exactDisplayBody;',context);return context.display;
}
test('background body failure retains feature diagnostics before releasing native run, and a complete retry clears it',async()=>{
  const document={metadata:{authoringSystem:'parametric-v1'},features:[{id:'rib'}]},node={},E={def:document,massEditRevision:1};let released=0;
  const run={ok:false,issues:[{code:'regeneration-failed',feature:'rib',message:'Native stop failed'}],results:new Map()};
  const context={E,currentHistoryNode:()=>node,cutTargetFeatureId:()=> 'rib',compileKernelFeatureTree:()=>({ok:true,document:{},features:[]}),regenerateFeatures:async()=>run,releaseRegeneration:()=>{released++;},captureExactDiagnostics,captureExactTopology};
  const display=displayFunction(context);await assert.rejects(display({featureId:'rib'}),/Native stop failed/);assert.equal(released,1);
  assert.equal(applyCurrentExactDiagnostics(healthy(),E.exactDiagnosticRun,document,node,1).ok,false);
  run.ok=true;run.issues=[];run.results.set('rib',{shape:{}});
  const result=await display({featureId:'rib'});assert.equal(E.exactDiagnosticRun,null);result.release();assert.equal(released,2);
});
test('late background failure cannot attach diagnostics to an edited sketch revision',async()=>{
  const document={metadata:{authoringSystem:'parametric-v1'},features:[{id:'rib'}]},node={},E={def:document,massEditRevision:1};let finish;
  const context={E,currentHistoryNode:()=>node,cutTargetFeatureId:()=> 'rib',compileKernelFeatureTree:()=>({ok:true,document:{},features:[]}),regenerateFeatures:()=>new Promise(resolve=>{finish=resolve;}),releaseRegeneration(){},captureExactDiagnostics};
  const pending=displayFunction(context)({featureId:'rib'});E.massEditRevision=2;
  finish({ok:false,issues:[{code:'regeneration-failed',feature:'rib',message:'Old stop failed'}],results:new Map()});
  await assert.rejects(pending,/Old stop failed/);assert.equal(E.exactDiagnosticRun,undefined);
});
