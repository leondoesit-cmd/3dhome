import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createExactPublicationDraft} from '../js/core/exact_publication_draft.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {createSheetDoc} from '../js/cad_sheet.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {meshDataBounds} from '../js/core/kernel_body.js';
import {modelerSource} from './helpers/modeler_source.mjs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const names = ['queueExactMesh','publishExactBodies','regenerateExactModelNow',
  'refreshChangedPart','refreshChangedParts','refreshChangedPartPreviews','invalidateDrawing'];
const production = names.map(name=>sourceFunctionText(modelerSource(),name)).join('\n');
const flush = ()=>new Promise(setImmediate);

function rig() {
  const parts = Array.from({length:4},(_,i)=>({id:'p'+i,kind:'box',x0:i*2,x1:i*2+1,y0:0,y1:1,z0:0,z1:1}));
  const doc = {parts,drawing:createSheetDoc({views:['front','top','right','iso']})};
  const E = {def:doc,docType:'part',mode:'drawing',sheetToken:0};
  const counts = {paints:0,projections:0,status:0,warnings:0};
  const host = {doc:()=>doc.drawing,bodies:()=>tessellateParts(doc.parts),bodiesToken:()=>E.sheetToken,
    bodiesForView:(_view,bodies)=>{counts.projections++;return bodies;}};
  E.sheet = createDrawingController(host);
  E.sheet.svg();
  const run = {ok:true,finalShape:{},results:new Map(parts.slice(0,3).map(p=>[p.id,
    {verifiedSerializedExact:true,workerMeshData:tessellateParts([{...p,z1:3}])[0]}]))};
  const noop = ()=>{};
  const pending = new Map(), slow = [], cleared = [], released = [], retiredRuns = [];
  const timers = new Map();
  const context = {E,createExactPublicationDraft,activeParts:d=>d.parts,meshDataBounds,
    flash:noop,t:k=>k,syncCommandManager:noop,syncStatus:()=>counts.status++,
    currentHistoryNode:()=>1,isCanonicalAuthoring:()=>true,
    compileKernelFeatureTree:()=>({ok:true,document:{},features:[]}),
    modelParameterOverrides:()=>({}),rebuildParametricDocument:()=>({}),withKernelFailures:noop,
    publishRebuildStatus(d){d.parts=[{...d.parts[0],name:'replacement'},d.parts[2],d.parts[3]];},
    regenerateFeatures:async()=>run,captureExactDiagnostics:noop,synchronizeExtrusionProjections:()=>[],
    captureExactTopology:noop,exactRunStamp:noop,exactSaveCache:{put:noop},syncAuthoringWorkflow:noop,
    exactBuildTimers:timers,clearTopologyCache:noop,isKernelBody:()=>false,
    cutTargetFeatureId:p=>p.id,cloneData:structuredClone,retainExactPreview:()=>false,
    syncLiveDownstreamBadge:noop,syncSizeReadout:noop,refreshParts:noop,
    drawSketch(){counts.paints++;E.sheet.svg();},syncSheetPanel:noop,
    releaseRegeneration:r=>retiredRuns.push(r),
    exactPreviewWasCancelled:()=>false,partSupportsExactMesh:()=>true,
    exactDisplayBody(p){const work=Promise.withResolvers();pending.set(p,work);return work.promise;},
    setTimeout(fn){slow.push(fn);return slow.length;},clearTimeout:id=>cleared.push(id),window:{},root:null,
    console:{warn:()=>counts.warnings++,error:noop},
  };
  vm.runInNewContext(production,context);
  function land(part, native=false) {
    pending.get(part).resolve({brep:{verifiedSerializedExact:!native,
      workerMeshData:tessellateParts([{...part,z1:7}])[0]},release:()=>released.push(part)});
  }
  function resetCounts(){for(const key of Object.keys(counts))counts[key]=0;}
  return {parts,doc,E,counts,run,context,pending,slow,cleared,released,retiredRuns,timers,land,resetCounts};
}

for (const completion of ['mesh','error']) test('publication rejects late '+completion+' callbacks for replaced, removed and superseded bodies',async()=>{
  const f=rig(), [replaced,removed,inPlace,unaffected]=f.parts;
  for(const part of f.parts)f.context.queueExactMesh(part);
  const outsider={id:replaced.id};
  for(const [i,part] of [...f.parts,outsider].entries())f.timers.set(part,'scheduled-'+i);
  f.resetCounts();
  const baseToken=f.E.sheetToken;
  assert.equal(await f.context.regenerateExactModelNow(true),f.run);
  assert.equal(f.doc.parts[0].id,replaced.id);
  assert.notEqual(f.doc.parts[0],replaced);
  assert.equal(f.doc.parts.includes(removed),false);
  assert.equal(f.doc.parts[1],inPlace);
  assert.equal(f.doc.parts[2],unaffected);
  assert.equal(f.counts.paints,1);
  assert.equal(f.counts.projections,4);
  assert.equal(f.E.sheetToken,baseToken+1);
  const beforeCounts={...f.counts}, beforeDoc=structuredClone(f.doc);
  // Slow notices must also be inert even though the original document is current.
  f.slow.slice(0,3).forEach(callback=>callback());
  for(const part of [replaced,removed,inPlace]) {
    if(completion==='mesh')f.land(part);
    else f.pending.get(part).reject(Error('late exact failure'));
  }
  await flush();
  assert.deepEqual(f.counts,beforeCounts,'late callbacks must not invalidate or paint the four-view drawing');
  assert.equal(f.E.sheetToken,baseToken+1);
  assert.deepEqual(f.doc,beforeDoc);
  for(const part of [replaced,removed,inPlace]) {
    assert.equal(part.exactBuildToken,2,'the previous object must lose its in-flight generation');
    assert.equal(part.exactPending,false);
    assert.equal(f.timers.has(part),false);
  }
  assert.equal(f.doc.parts[0].exactBuildToken,2);
  assert.equal(f.released.length,completion==='mesh'?3:0);
  assert.equal(unaffected.exactBuildToken,1);
  assert.equal(unaffected.exactPending,true);
  assert.equal(f.timers.get(unaffected),'scheduled-3');
  assert.equal(f.timers.get(outsider),'scheduled-4');
  assert.ok(f.cleared.includes('scheduled-0'));
  assert.ok(f.cleared.includes('scheduled-1'));
  assert.ok(f.cleared.includes('scheduled-2'));
  f.land(unaffected);
  await flush();
  assert.equal(unaffected.exactPending,false,'an unaffected body can still finish its own build');
  assert.equal(f.counts.paints,2);
  assert.equal(f.E.sheetToken,baseToken+2);
});

for(const field of ['exactBuildToken','exactPending']) test('a read-only retired '+field+' rolls back publication and keeps the old callback valid',async()=>{
  const f=rig(), replaced=f.parts[0],removed=f.parts[1];
  f.context.queueExactMesh(replaced);
  f.context.queueExactMesh(removed);
  Object.defineProperty(removed,field,{writable:false});
  f.timers.set(replaced,0);f.timers.set(removed,1);
  f.resetCounts();
  const before=structuredClone(f.doc), originalParts=f.doc.parts, baseToken=f.E.sheetToken;
  assert.equal(await f.context.regenerateExactModelNow(true),null);
  assert.equal(f.doc.parts,originalParts);
  assert.deepEqual(f.doc,before);
  assert.equal(replaced.exactBuildToken,1);assert.equal(removed.exactBuildToken,1);
  assert.equal(f.timers.get(replaced),0);assert.equal(f.timers.get(removed),1);
  assert.deepEqual(f.cleared,[]);
  assert.equal(f.counts.paints,0);assert.equal(f.E.sheetToken,baseToken);
  assert.deepEqual(f.retiredRuns,[f.run]);
  Object.defineProperty(removed,field,{writable:true});
  f.land(replaced);f.land(removed);
  await flush();
  assert.equal(replaced.exactPending,false);assert.equal(removed.exactPending,false);
  assert.equal(replaced.meshData.positions.length>0,true);
  assert.equal(f.counts.paints,2,'a failed transaction must leave earlier live builds usable');
  f.resetCounts();
  assert.equal(await f.context.regenerateExactModelNow(true),f.run);
  assert.equal(f.counts.paints,1);
  assert.equal(replaced.exactBuildToken,2);assert.equal(removed.exactBuildToken,2);
  assert.equal(f.timers.size,0);
});

for(const completion of ['mesh','error']) test('detachment during native '+completion+' transfer cannot repaint, and always releases the display',async()=>{
  const f=rig(),part=f.parts[0], mesh=Promise.withResolvers(), reached=Promise.withResolvers();
  f.context.shapeToMeshData=()=>{reached.resolve();return mesh.promise;};
  f.context.queueExactMesh(part);
  f.land(part,true);
  await reached.promise;
  f.resetCounts();
  assert.equal(await f.context.regenerateExactModelNow(true),f.run);
  const before={...f.counts},token=f.E.sheetToken;
  if(completion==='mesh')mesh.resolve(tessellateParts([{...part,z1:7}])[0]);
  else mesh.reject(Error('late transfer failure'));
  await flush();
  assert.deepEqual(f.counts,before);
  assert.equal(f.E.sheetToken,token);
  assert.deepEqual(f.released,[part]);
});

for(const completion of ['mesh','error','notice']) test('object ownership rejects a detached '+completion+' even without a token change',async()=>{
  const f=rig(),part=f.parts[0];
  f.context.queueExactMesh(part);
  f.doc.parts[0]={...part}; // same document, body id and token; different owner
  f.resetCounts();
  const before=structuredClone(part),token=f.E.sheetToken;
  if(completion==='mesh')f.land(part);
  else if(completion==='error')f.pending.get(part).reject(Error('detached failure'));
  else f.slow[0]();
  await flush();
  assert.deepEqual(part,before);
  assert.deepEqual(f.counts,{paints:0,projections:0,status:0,warnings:0});
  assert.equal(f.E.sheetToken,token);
  if(completion==='mesh')assert.deepEqual(f.released,[part]);
});

test('retirement survives reattaching an old object before its callback completes',async()=>{
  const f=rig(),part=f.parts[0];
  f.context.queueExactMesh(part);
  assert.equal(await f.context.regenerateExactModelNow(true),f.run);
  f.doc.parts.push(part);
  f.resetCounts();
  f.land(part);
  await flush();
  assert.equal(f.counts.paints,0);
  assert.equal(part.exactPending,false);
  assert.equal(part.meshData,undefined);
  assert.deepEqual(f.released,[part]);
});

test('an already detached object cannot start another exact build',()=>{
  const f=rig(),part=f.parts[0];
  f.doc.parts.shift();
  f.resetCounts();
  f.context.queueExactMesh(part);
  assert.equal(f.pending.size,0);
  assert.equal(part.exactBuildToken,undefined);
  assert.deepEqual(f.counts,{paints:0,projections:0,status:0,warnings:0});
});


test('detached bodies reachable through aliases retire even without scheduled timers',async()=>{
  const f=rig(), [replaced,removed]=f.parts;
  f.doc.aliases={replaced,removed};
  f.context.queueExactMesh(replaced);f.context.queueExactMesh(removed);
  f.resetCounts();
  assert.equal(await f.context.regenerateExactModelNow(true),f.run);
  assert.equal(f.doc.aliases.replaced,replaced);assert.equal(f.doc.aliases.removed,removed);
  assert.equal(replaced.exactBuildToken,2);assert.equal(removed.exactBuildToken,2);
  assert.equal(replaced.exactPending,false);assert.equal(removed.exactPending,false);
  const counts={...f.counts},token=f.E.sheetToken;
  f.land(replaced);f.land(removed);
  await flush();
  assert.deepEqual(f.counts,counts);assert.equal(f.E.sheetToken,token);
  assert.equal(replaced.meshData,undefined);assert.equal(removed.meshData,undefined);
  assert.equal(f.released.length,2);
});

test('switching documents rejects a callback even when the new document holds the same body object',async()=>{
  const f=rig(),part=f.parts[0];
  f.context.queueExactMesh(part);
  f.E.def={parts:[part]};
  f.resetCounts();
  const before=structuredClone(part);
  f.land(part);
  await flush();
  assert.deepEqual(part,before);
  assert.deepEqual(f.counts,{paints:0,projections:0,status:0,warnings:0});
  assert.deepEqual(f.released,[part]);
});
