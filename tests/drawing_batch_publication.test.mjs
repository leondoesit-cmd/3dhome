import {createExactPublicationDraft} from '../js/core/exact_publication_draft.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { modelerSource } from './helpers/modeler_source.mjs';
import { sourceFunctionText } from './helpers/source_function.mjs';
import { publishRebuildStatus } from '../js/core/parametric_rebuild.js';
import { createDrawingController } from '../js/modeler_drawing.js';
import { synchronizeExtrusionProjections } from '../js/core/extrusion_projection.js';
import { createSheetDoc } from '../js/cad_sheet.js';
import { tessellateParts } from '../js/core/part_tessellate.js';

const names = ['refreshChangedPart', 'refreshChangedParts','refreshChangedPartPreviews','refreshSavedPartMeshes',
  'publishExactBodies','regenerateExactModelNow','invalidateDrawing'];
const production = names.map(name => sourceFunctionText(modelerSource(), name)).join('\n');
function rig() {
  const parts = Array.from({length:20}, (_, i) => ({id:'p'+i, kind:'box',x0:i*2,x1:i*2+1,y0:0,y1:1,z0:0,z1:1}));
  const saved = parts.map((p,i) => ({...p,meshData:tessellateParts([{...p,z1:2+i/10}])[0]}));
  const doc = {parts,drawing:createSheetDoc({views:['front','top','right','iso']})};
  const E = {def:doc,docType:'part',mode:'drawing',sheetToken:0};
  const counts = {paints:0, projections:0, panels:0, sizes:0, topology:0};
  const host = {doc:()=>doc.drawing, bodies:()=>tessellateParts(doc.parts), bodiesToken:()=>E.sheetToken,
    bodiesForView:(_view,bodies)=>{counts.projections++;return bodies;}};
  E.sheet = createDrawingController(host);
  const original = E.sheet.svg();
  counts.projections = 0;
  const noop = () => {};
  const run = {ok:true, finalShape:{}, results:new Map(saved.map(p=>[p.id,{verifiedSerializedExact:true, workerMeshData:p.meshData}]))};
  const context = {createExactPublicationDraft,E, activeParts:d=>d.parts, flash:noop,t:k=>k,syncCommandManager:noop,syncStatus:noop,
    currentHistoryNode:()=>1,releaseExactRun:noop,isCanonicalAuthoring:()=>true,compileKernelFeatureTree:()=>({ok:true,document:{},features:[]}),
    modelParameterOverrides:()=>({}),rebuildParametricDocument:()=>({}),publishRebuildStatus:noop,
    regenerateFeatures:async()=>run,captureExactDiagnostics:noop,synchronizeExtrusionProjections:()=>[],captureExactTopology:noop,
    withKernelFailures:noop,exactBuildTimers:new Map(),clearTopologyCache:()=>counts.topology++,isKernelBody:()=>false,
    cutTargetFeatureId:p=>p.id,meshDataBounds:noop,cloneData:structuredClone,retainExactPreview:()=>false,syncLiveDownstreamBadge:noop,
    syncSizeReadout:()=>counts.sizes++,drawSketch(){counts.paints++;context.drawn=E.sheet.svg();},syncSheetPanel:()=>counts.panels++,
    refreshParts:noop,exactRunStamp:noop,exactSaveCache:{put:noop},syncAuthoringWorkflow:noop,console};
  vm.runInNewContext(production, context);
  return {E,counts,host,context,original,saved,run};
}

for (const path of ['publication', 'save']) test(path+' of 20 exact meshes repaints the complete four-view sheet once', async () => {
  const {E,counts,host,context,original,saved,run} = rig();
  if (path === 'publication') assert.equal(await context.regenerateExactModelNow(), run);
  else context.refreshSavedPartMeshes({parts:saved});
  assert.deepEqual(counts,{paints:1,projections:4,panels:1,sizes:1,topology:20});
  assert.equal(E.sheetToken, 1);
  assert.equal(E.def.parts.filter(p=>p.meshData).length,20);
  assert.notEqual(context.drawn,original);
  assert.equal(context.drawn,createDrawingController(host).svg());
  context.refreshSavedPartMeshes({parts:[]});
  assert.equal(counts.paints,1);
});

test('interrupted multi-body transfer leaves the previously drawn generation intact', async () => {
  for (const failure of ['stale','rejected']) {
    const {E,context,run,counts,original} = rig();
    let calls=0, current=true;
    const work = context.publishExactBodies(E.def.parts,run,E.def,async body=>{
      if (++calls === 2) {
        if (failure === 'rejected') throw Error('mesh transfer failed');
        current=false;
      }
      return body.workerMeshData;
    },()=>current);
    if (failure === 'rejected') await assert.rejects(work,/mesh transfer failed/);
    else assert.equal((await work).length,0);
    assert.equal(E.def.parts.some(p=>p.meshData),false);
    assert.equal(E.sheet.svg(), original);
    assert.equal(counts.projections,0);
  }
});


test('hidden drawing batches keep unaffected viewport bodies and refresh the inspector once', () => {
  const {E,context,counts} = rig();
  const rebuilt = [], removed = [], painted = [];
  const changed = E.def.parts.slice(0,2);
  E.mode = '3d';
  E.pv = {grp:{}};
  Object.assign(context,{
    dropCommittedGpu:matches=>removed.push(...E.def.parts.filter(matches)),
    gpuChildMatchesPartIds:(part,ids)=>!!ids[part.id],
    dropDecoMatching(){}, rebuildCommittedPartsById:ids=>rebuilt.push(...Object.keys(ids)),
    paintViewportAfterPartialRebuild:()=>painted.push(true),
  });
  context.refreshChangedParts(changed);
  assert.deepEqual(removed,changed);
  assert.deepEqual(rebuilt,changed.map(p=>p.id));
  assert.equal(painted.length,1);
  assert.equal(counts.paints,0);
  assert.equal(counts.sizes,1);
  assert.equal(E.sheetToken,1);
});

for (const failure of ['reject','stale']) test('exact rebuild preserves the live sheet through a '+failure+' on its second transfer', async () => {
  const {E,host,context,saved,run,counts} = rig();
  const first=E.def.parts[0], previousRun={ok:true}, previousTopology={old:['named edge']};
  first.meshData=saved[4].meshData; // Losing this mesh would visibly change the cold projection.
  first.cuts3d=[{featureId:'cut',axis:'x',from:2,to:5}];
  const oldMesh=first.meshData, oldCut=structuredClone(first.cuts3d[0]);
  E.def.exactTopologyCache=previousTopology;
  E.brepRun=previousRun;
  E.sheet.invalidate();
  const original=E.sheet.svg();
  const reached=Promise.withResolvers(), transfer=Promise.withResolvers();
  const tool={id:'cut:tool',type:'extrude',params:{axis:'y',from:7,to:9}};
  run.results.set(tool.id,{});
  run.resolvedExtrusions=new Map([[tool.id,tool.params]]);
  for (const body of run.results.values()) { body.shape={}; body.verifiedSerializedExact=false; }
  let reads=0, releases=0, captures=0, current=true;
  Object.assign(context,{
    compileKernelFeatureTree:()=>({ok:true,document:{},features:[tool]}),
    synchronizeExtrusionProjections,
    invalidatePartMeshAfterEdit:part=>{delete part.meshData;},
    captureExactTopology:()=>{captures++;return {new:['replacement edge']};},
    shapeToMeshData:async body=>{
      if (++reads===2) { reached.resolve(); await transfer.promise; }
      return structuredClone(body.workerMeshData);
    },
    releaseRegeneration:r=>{if(r===run) releases++; else assert.equal(r,previousRun);},
    console:{error(){}},
  });
  function assertOriginal(){
    assert.equal(first.meshData,oldMesh);
    assert.deepEqual(first.cuts3d[0],oldCut);
    assert.equal(E.def.exactTopologyCache,previousTopology);
    assert.equal(E.brepRun,previousRun);
    assert.equal(captures,0);
    assert.equal(E.sheet.svg(),original);
    assert.equal(createDrawingController(host).svg(),original);
  }
  const work=context.regenerateExactModelNow(true,()=>current);
  await reached.promise;
  assertOriginal();
  if(failure==='reject')transfer.reject(Error('second mesh transfer failed'));
  else {current=false;transfer.resolve();}
  assert.equal(await work,null);
  assertOriginal();
  assert.equal(reads,2);
  assert.equal(releases,1);
  assert.equal(counts.paints,0);
  assert.equal(E.sheetToken,0);

  assert.equal(await context.regenerateExactModelNow(true),run);
  assert.equal(first.cuts3d[0].axis,'y');
  assert.equal(first.cuts3d[0].from,7);
  assert.notEqual(first.meshData,oldMesh);
  assert.equal(captures,1);
  assert.equal(counts.paints,1);
  assert.equal(E.sheet.svg(),createDrawingController(host).svg());
});

for (const failure of ['diagnostics','projection','mesh invalidation','topology','lightweight rebuild','kernel diagnostics','status','write plan','ownership check']) {
  test('post-transfer '+failure+' failure preserves the entire previous generation and retries once', async () => {
    const {E,host,context,saved,run,counts}=rig();
    const doc=E.def,part=doc.parts[0];
    part.meshData=saved[4].meshData;
    const cut={featureId:'cut',axis:'x',from:2,to:5};
    part.cuts3d=[cut];
    part.pts=[{u:0,v:0}];doc.parameters=[{id:'d',value:2}];
    const sketch={id:'s',points:[{x:1,y:1}]};
    doc.sketches=[sketch];
    doc.features=[{id:'cut',params:{},references:{}}];
    doc.history=[{id:'step',status:'rebuilt'}];
    doc.references=[{id:'plane',origin:{x:1}}];
    doc.exactTopologyCache={old:{topology:[{name:'previous'}]}};
    doc.lastRebuild={ok:true};
    const oldMesh=part.meshData,oldTopology=doc.exactTopologyCache,oldRun={generation:1};
    const oldCore={old:true},oldDiagnostics={old:true},oldStamp={old:true};
    Object.assign(E,{brepRun:oldRun,coreRun:oldCore,exactDiagnosticRun:oldDiagnostics,brepStamp:oldStamp});
    if (failure==='write plan') Object.defineProperty(part,'exactBuildToken',
      {value:1,writable:false,configurable:true,enumerable:true});
    E.sheet.invalidate();
    const original=E.sheet.svg(), before=structuredClone(doc);
    const timer={}, timers=new Map([[part,timer]]), cleared=[],released=[];
    const tool={id:'cut:tool',type:'extrude',params:{axis:'y',from:7,to:9}};
    run.results.set(tool.id,{});
    run.resolvedExtrusions=new Map([[tool.id,tool.params]]);
    run.referenceUpdates=[{id:'plane',origin:{x:4}}];
    const retryRun={...run};
    let calls=0, transfers=0, inject=true, hit=0, current=true;
    function boundary(name){
      if(name===failure && inject){
        hit++;
        assert.equal(transfers,20);
        assert.equal(E.brepRun,oldRun);
        assert.deepEqual(doc,before);
        throw Error('injected '+name);
      }
    }
    Object.assign(context,{
      compileKernelFeatureTree:()=>({ok:true,document:{},features:[tool]}),
      regenerateFeatures:async()=>++calls===1?run:retryRun,
      cloneData(value){if(value?.positions)transfers++;return structuredClone(value);},
      captureExactDiagnostics(d){boundary('diagnostics');return {document:d};},
      synchronizeExtrusionProjections(d,features,r){
        const ids=synchronizeExtrusionProjections(d,features,r);
        boundary('projection');return ids;
      },
      invalidatePartMeshAfterEdit(p,schedule){assert.equal(schedule,false);delete p.meshData;boundary('mesh invalidation');},
      captureExactTopology(d){
        d.exactTopologyCache.old.topology[0].name='staged';
        boundary('topology');return {new:{topology:['edge']}};
      },
      rebuildParametricDocument(d){
        d.sketches[0].points[0].x=3;d.parts[0].pts[0].u=2;d.parameters[0].value=3;
        boundary('lightweight rebuild');return {ok:true};
      },
      withKernelFailures(core){boundary('kernel diagnostics');return core;},
      publishRebuildStatus(d){
        d.lastRebuild={ok:true,updated:true};d.history[0].status='ready';
        d.features[0].diagnostics=['new'];boundary('status');
        if (inject && failure==='ownership check') {hit++;current=false;}
        if (inject && failure==='write plan') hit++;
      },
      exactBuildTimers:timers,clearTimeout:t=>cleared.push(t),releaseRegeneration:r=>released.push(r),
      console:{error(){}},
    });
    assert.equal(await context.regenerateExactModelNow(true,()=>current),null);
    assert.equal(hit,1);
    assert.equal(transfers,20);
    assert.deepEqual(doc,before);
    assert.equal(part.meshData,oldMesh);
    assert.equal(doc.exactTopologyCache,oldTopology);
    assert.equal(E.brepRun,oldRun);assert.equal(E.coreRun,oldCore);
    assert.equal(E.exactDiagnosticRun,oldDiagnostics);assert.equal(E.brepStamp,oldStamp);
    assert.deepEqual(released,[run]);assert.equal(timers.get(part),timer);assert.equal(cleared.length,0);
    assert.equal(counts.paints,0);assert.equal(counts.topology,0);assert.equal(E.sheetToken,0);
    assert.equal(E.sheet.svg(),original);
    assert.equal(createDrawingController(host).svg(),original);

    inject=false;current=true;
    if (failure==='write plan') Object.defineProperty(part,'exactBuildToken',{writable:true});
    assert.equal(await context.regenerateExactModelNow(true),retryRun);
    assert.deepEqual(released,[run,oldRun]);
    assert.equal(transfers,40);assert.deepEqual(cleared,[timer]);assert.equal(timers.size,0);
    assert.equal(E.sheetToken,1);assert.equal(counts.paints,1);assert.equal(counts.topology,20);
    assert.equal(E.exactDiagnosticRun.document,doc);
    assert.equal(part.pts[0].u,2);assert.equal(doc.parameters[0].value,3);
    assert.equal(doc.sketches[0],sketch);assert.equal(sketch.points[0].x,3);
    assert.equal(part.cuts3d[0],cut);assert.equal(cut.axis,'y');assert.equal(cut.from,7);
    assert.equal(doc.references[0].origin.x,4);assert.equal(doc.history[0].status,'ready');
    assert.notEqual(part.meshData,oldMesh);assert.deepEqual(doc.exactTopologyCache,{new:{topology:['edge']}});
    assert.notEqual(context.drawn,original);
    assert.equal(context.drawn,createDrawingController(host).svg());
  });
}

test('an aliased body keeps its live point and array identities after exact publication', async()=>{
  const {E,context,run}=rig(), doc=E.def, part=doc.parts[0];
  const point={u:4,v:2}, points=[point];
  part.pts=points;
  doc.authoringAliases={part,point,points,parts:doc.parts};
  context.publishRebuildStatus=d=>{d.parts[0].pts[0].u=7;};
  assert.equal(await context.regenerateExactModelNow(true),run);
  assert.equal(doc.authoringAliases.part,part);
  assert.equal(doc.authoringAliases.parts,doc.parts);
  assert.equal(doc.parts[0].pts,points);
  assert.equal(doc.authoringAliases.points,points);
  assert.equal(points[0],point);
  assert.equal(doc.authoringAliases.point,point);
  assert.equal(point.u,7);
});

test('a new binding publishes references to the live nested point, including through a new array',async()=>{
  const {E,context,run}=rig(),point={x:4}, points=[point];
  E.def.sketches=[{id:'sketch',points}];
  let binding, draftPoint;
  context.publishRebuildStatus=d=>{
    draftPoint=d.sketches[0].points[0];
    binding={anchors:[{point:draftPoint,points:d.sketches[0].points}]};
    d.bindings=[binding,binding];
  };
  assert.equal(await context.regenerateExactModelNow(true),run);
  assert.notEqual(draftPoint,point);
  point.x=7;
  assert.equal(E.def.bindings[0].anchors[0].point.x,7);
  assert.equal(E.def.bindings[0],binding);
  assert.equal(E.def.bindings[1],binding);
  assert.equal(binding.anchors[0].point,point);
  assert.equal(binding.anchors[0].points,points);
});

test('successful exact publication cancels the timer owned by a replaced body',async()=>{
  const {E,context,counts,run}=rig(), old=E.def.parts[0], other={id:old.id};
  const timer={}, unrelatedTimer={}, cleared=[];
  const timers=new Map([[old,timer],[other,unrelatedTimer]]);
  Object.assign(context,{exactBuildTimers:timers,clearTimeout:t=>cleared.push(t),
    publishRebuildStatus(d){d.parts[0]={...d.parts[0],name:'generated replacement'};}});
  assert.equal(await context.regenerateExactModelNow(true),run);
  assert.notEqual(E.def.parts[0],old);
  assert.equal(E.def.parts[0].meshData.positions.length>0,true);
  assert.deepEqual(cleared,[timer]);
  assert.equal(timers.has(old),false);
  assert.equal(timers.get(other),unrelatedTimer);
  assert.equal(counts.paints,1);
});

test('cabinet regeneration retires detached timer owners only after the replacement commits',async()=>{
  const {E,host,context,counts,run,original}=rig(), doc=E.def;
  const old=doc.parts, replaced=old[0], removed=old[1], outside={id:removed.id};
  doc.metadata={adapter:'cabinet',generatedParameters:{width:1}};
  const generated={...doc,parts:[{...replaced,x1:3}],metadata:{adapter:'cabinet',generatedParameters:{width:3}}};
  const timers=new Map([[replaced,0],[removed,1],[outside,2]]);
  let reject=true;
  const cleared=[];
  Object.assign(context,{exactBuildTimers:timers,clearTimeout:t=>cleared.push(t),
    withKernelFailures:()=>({ok:true,status:[],issues:[],document:generated}),
    publishRebuildStatus(d,core){publishRebuildStatus(d,core);if(reject)throw Error('injected after cabinet body replacement');},
    releaseRegeneration(){},console:{error(){}},
  });
  assert.equal(await context.regenerateExactModelNow(true),null);
  assert.equal(doc.parts,old);
  assert.equal(timers.size,3);assert.deepEqual(cleared,[]);
  assert.equal(E.sheet.svg(),original);assert.equal(counts.paints,0);
  reject=false;
  assert.equal(await context.regenerateExactModelNow(true),run);
  assert.equal(doc.parts.length,1);assert.notEqual(doc.parts[0],replaced);
  assert.equal(doc.parts[0].id,replaced.id);assert.ok(doc.parts[0].meshData);
  assert.deepEqual(cleared,[0,1]);assert.equal(timers.has(replaced),false);
  assert.equal(timers.has(removed),false);assert.equal(timers.get(outside),2);
  assert.notEqual(context.drawn,original);
  assert.equal(context.drawn,createDrawingController(host).svg());
});

test('a point reachable only through new publication records still receives its staged edit',async()=>{
  const {E,context,run}=rig(),point={x:4};
  E.def.sketches=[{points:[point]}];
  let group;
  context.publishRebuildStatus=d=>{
    const staged=d.sketches.pop().points[0];
    staged.x=7;
    group=[{point:staged}];
    d.newBindings={first:group,second:group};
  };
  assert.equal(await context.regenerateExactModelNow(true),run);
  assert.equal(E.def.sketches.length,0);
  assert.equal(E.def.newBindings.first,group);
  assert.equal(E.def.newBindings.second,group);
  assert.equal(group[0].point,point);
  assert.equal(point.x,7);
});
