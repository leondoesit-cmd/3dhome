import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {applyHistoryToPreviewParts,historyEntryRolled,setHistoryRollback} from '../js/core/parametric_document.js';
import {leavesInputStanding} from '../js/core/rebuild.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {captureExactTopology,verifiedFinalTopology} from '../js/core/exact_topology_cache.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeToMeshData,shapeSolidCount} from '../js/cad_kernel.js';
import {meshDataBounds} from '../js/core/kernel_body.js';
import {partSupportsExactMesh} from '../js/modeler_part_geometry.js';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/ch4_rollback_native_source.json',import.meta.url),'utf8')).document;
const fn=(name,context)=>new Function(...Object.keys(context),sourceFunctionText(source,name)+';return '+name)(...Object.values(context));
function historyHost(document){
 const E={def:document},queued=[];
 const sync=fn('syncPreviewFromHistory',{E,isCanonicalAuthoring:()=>true,applyHistoryToPreviewParts,isKernelBody:()=>false,
  queueKernelBody:()=>assert.fail('not a legacy kernel body'),partSupportsExactMesh,
  activeParts:d=>d.parts.filter(p=>!p.suppressed),queueExactMesh:p=>{queued.push(p);p.exactPending=true;}});
 return {E,queued,sync};
}
test('actual cold rollback disk orders native replacement even when flags were already normalized',()=>{
 const d=structuredClone(fixture),h=historyHost(d);h.sync();assert.equal(h.queued.length,1);assert.equal(d.parts[0].bounds,undefined);h.sync();assert.equal(h.queued.length,1,'pending work is not duplicated');
 setHistoryRollback(d,null);h.sync();assert.equal(h.queued.length,2);assert.equal(d.parts[0].bounds,undefined,'discarded pattern bounds cannot survive native rebuild');
 setHistoryRollback(d,3);h.sync();assert.equal(h.queued.length,3);assert.ok(d.parts[0].merges3d[0].suppressed);
});
test('actual disk rollback native mesh, bounds and cold proof describe only the compiled earlier body',async()=>{
 const d=structuredClone(fixture),E={def:d,massEditRevision:0},compiled=compileKernelFeatureTree(d);
 assert.ok(compiled.ok);assert.deepEqual(compiled.features.filter(f=>f.type!=='sketch').map(f=>f.id),[d.features[0].id]);
 const head=fn('cutTargetFeatureId',{E,historyEntryRolled,leavesInputStanding});
 const display=fn('exactDisplayBody',{E,cutTargetFeatureId:head,compileKernelFeatureTree,currentHistoryNode:()=>1,
  regenerateFeatures,releaseRegeneration,captureExactTopology,captureExactDiagnostics:()=>null,exactBrepForPart:()=>assert.fail(),disposeBrep:()=>{}});
 const native=await display(d.parts[0],d,null,{});
 try{
  const mesh=await shapeToMeshData(native.brep,{deflection:.05,angle:.18});
  const bounds=meshDataBounds(mesh.positions);assert.ok(Math.abs(bounds.x0+3)<.01);assert.ok(Math.abs(bounds.x1-3)<.01);assert.ok(Math.abs(bounds.y1-.8)<1e-5);
  assert.ok(verifiedFinalTopology(d,compiled.features).length>0);
  const cold=JSON.parse(JSON.stringify(d));assert.ok(verifiedFinalTopology(cold,compileKernelFeatureTree(cold).features).length>0);
  setHistoryRollback(cold,null);const full=compileKernelFeatureTree(cold);assert.ok(full.ok);assert.ok(full.features.some(f=>f.id===d.features[2].id));assert.equal(verifiedFinalTopology(cold,full.features).length,0,'disk proof cannot validate full pattern');
  const workerSource=fs.readFileSync(new URL('../js/core/cad_worker_runtime.js',import.meta.url),'utf8');
  const pack=new Function('metadata','shapeSolidCount','shapeToMeshData',sourceFunctionText(workerSource,'packBody')+';return packBody;')(()=>({}),shapeSolidCount,shapeToMeshData);
  const payload=await pack(native.brep,true,false,true);assert.equal(payload.proof,'exact-native-mesh');assert.equal(payload.meshData.nativeSolidCount,1);
  native.brep.workerMeshData=payload.meshData;
  const queue=fn('queueExactMesh',{E,exactPreviewWasCancelled:()=>false,partSupportsExactMesh,exactBuildTimers:new Map(),syncStatus(){},isKernelBody:()=>false,clearTopologyCache(){},refreshChangedPart(){},
   exactDisplayBody:async()=>({brep:native.brep,release(){}}),cloneData:structuredClone,shapeToMeshData,meshDataBounds,refreshParts(){},renderPreview(){},root:null});
  queue(d.parts[0]);for(let i=0;i<100 && d.parts[0].exactPending;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(d.parts[0].exactPending,false);assert.equal(d.parts[0].meshData.nativeSolidCount,1);assert.ok(d.parts[0].meshData.positions.length);assert.ok(Math.abs(d.parts[0].bounds.x1-3)<.03,'canonical analytic part bounds refresh from native mesh too');
 }finally{native.release();}
});
test('a requested-head result cannot publish proof into a changed history or owner',async()=>{
 for(const stale of ['history','owner','revision']){
  const d=structuredClone(fixture),E={def:d,massEditRevision:0};let node=1;
  const display=fn('exactDisplayBody',{E,cutTargetFeatureId:()=>d.features[0].id,compileKernelFeatureTree,currentHistoryNode:()=>node,
   regenerateFeatures:async()=>{if(stale==='history')node++;if(stale==='owner')E.def=structuredClone(d);if(stale==='revision')E.massEditRevision++;return {ok:true,results:new Map([[d.features[0].id,{shape:{},topology:[{kind:'face'}]}]])};},
   releaseRegeneration(){},captureExactTopology:()=>({unsafe:true}),captureExactDiagnostics(){},exactBrepForPart(){},disposeBrep(){}});
  const r=await display(d.parts[0]);r.release();assert.equal(d.exactTopologyCache,undefined,stale);
 }
});
