import { regenerateFeatures, releaseRegeneration } from '../cad_feature_tree.js';
import { compileKernelFeatureTree } from './kernel_feature_adapter.js';
import { stableStringify } from './dependency_graph.js';
import { createTopologyRegistry, resolveTopologyReference } from './topology.js';
import { resolveFinishFace } from './finish_face_reference.js';
import { workerInterference, workerAssemblyStep } from './worker_interference.js';
import { isWorkerCacheBody } from './worker_body_cache.js';
import { createNativeBodyStore } from './native_body_store.js';
import { leavesInputStanding } from './rebuild.js';
import { toolFeatureRecipe } from './tool_recipe.js';
import {collectNativeSections} from './native_section_query.js';
import {nativeOperationRevisions} from './native_operation_revision.js';
import {
  serializeBrep, deserializeBrep, extractBrepTopology, hydrateSerializedBrepTopology, disposeBrep, shapeToMeshData, shapeMassProperties, shapeSolidCount, exportStep,
  shellBrep, filletBrep, chamferBrep, domeBrep, draftBrep, makeBrepExtrusion, brepMaterialIntersection, brepFaceLineIntersections,
} from '../cad_kernel.js';

const resultFields=['kind','operation','invalid','approximate','looseTolerance','placement','threadGeometry','spec','points','mesh','annotation','sketchId'];
// Native algorithm changes must not resurrect older persisted results at
// identical dimensions. Version only changed operations to retain expensive
// unchanged upstream Shell and Boolean bodies.
// Authoring and Save can share or independently clone the same frame object.
// Object identity is not geometry; normalize the serializable protocol first.
function geometryKey(value){
  // Attached-frame resolution can differ by a few floating-point ULPs after
  // Save/reopen. Match topology stamps without rounding driving geometry.
  const normalizeFrames=(item,inFrame=false)=>{
    if(typeof item==='number' && inFrame && Number.isFinite(item))return Number(item.toFixed(12));
    if(Array.isArray(item))return item.map(entry=>normalizeFrames(entry,inFrame));
    if(item && typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,normalizeFrames(entry,inFrame || key==='frame' || key==='localFrame')]));
    return item;
  };
  return stableStringify(normalizeFrames(JSON.parse(JSON.stringify(value))));
}
function sketchGeometry(sketch){
  const value={...sketch};
  for(const field of ['name','diagnostics','status','repairs','lastEdit','material','mat','density','appearance','color','col'])delete value[field];
  return value;
}
function metadata(result) {
  return Object.fromEntries(resultFields.filter(key=>result[key]!==undefined).map(key=>[key,structuredClone(result[key])]));
}
export function cadWorkerGeometryKeys(document,features,options={}) {
  const prefix=[],keys=new Map(),owners=new Set(),usedSketches=new Set(),usedReferences=new Set();
  // Serialize each input once, then assemble the same collision-free canonical
  // JSON prefixes. Never use object identity or a short hash to accept a body:
  // authoring mutates recipes in place and even tiny driving edits must miss.
  const sketchKeys=(document.sketches || []).map(item=>[item.id,geometryKey(sketchGeometry(item))]);
  const referenceKeys=(document.references || []).map(item=>[item.id,geometryKey(item)]);
  const referenceGeometryKeys=(document.referenceGeometry || []).map(item=>[item,geometryKey(item)]);
  const common={localFrame:document.localFrame,attachments:document.attachments,
    parameters:document.parameters,variables:document.variables,parameterOverrides:options.parameterOverrides};
  const commonFields=Object.entries(common).map(([name,value])=>geometryKey({[name]:value}).slice(1,-1)).filter(Boolean);
  const legacySketchKey=document.sketch?geometryKey(sketchGeometry(document.sketch)):null;
  const arrayField=(name,values)=>JSON.stringify(name)+':['+values.join(',')+']';
  let usesLegacySketch=false;
  const sketches=new Map((document.sketches || []).map(item=>[item.id,item]));
  const references=new Map((document.references || []).map(item=>[item.id,item]));
  const visit=value=>{
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(value && typeof value==='object'){Object.values(value).forEach(visit);return;}
    if(typeof value!=='string')return;
    if(sketches.has(value) && !usedSketches.has(value)){usedSketches.add(value);visit(sketches.get(value));}
    if(references.has(value) && !usedReferences.has(value)){usedReferences.add(value);visit(references.get(value));}
  };
  for(const feature of features){
    const params={...feature.params};
    // These snapshots are overwritten by resolveSketchSources on every exact
    // rebuild. Hash the actual source sketches/frames instead of a stale live
    // display projection that cannot affect the requested solid.
    if(params.sketchSources){
      const derived=feature.type==='loft'?['sections','sectionSegments']:feature.type==='sweep'?['profile','profileSegments','path','pathSegments']:[];
      derived.forEach(key=>delete params[key]);
    }
    const kernelRevision=nativeOperationRevisions[feature.type];
    prefix.push(geometryKey({id:feature.id,type:feature.type,params,inputs:feature.inputs,references:feature.references,suppressed:feature.suppressed,...(kernelRevision?{kernelRevision}:{})}));
    owners.add(feature.id);visit(feature);
    const resolvesProfile=['extrude','revolve'].includes(feature.type)
      && (params.profileEntityIds?.length || params.regionProfileEntityIds?.some(ids=>ids?.length));
    const resolvesHole=feature.type==='holeTool' && params.sketchId && (!params.layout || params.layout==='sketch');
    if ((resolvesProfile || resolvesHole) && !sketches.has(params.sketchId)) {
      // Native profile resolvers fall back to the single legacy sketch only
      // when their named source is absent. The editor's active sketch is not
      // a dependency of an explicitly named canonical profile.
      if(document.sketch)usesLegacySketch=true;
      else if(resolvesProfile && document.sketches?.[0])visit(document.sketches[0].id);
    }
    const fields=[arrayField('features',prefix),
      arrayField('sketches',sketchKeys.filter(([id])=>usedSketches.has(id)).map(([,key])=>key)),
      arrayField('references',referenceKeys.filter(([id])=>usedReferences.has(id)).map(([,key])=>key)),
      arrayField('referenceGeometry',referenceGeometryKeys.filter(([item])=>usedReferences.has(item.id) || owners.has(item.ownerFeatureId) || owners.has(item.featureId)).map(([,key])=>key))];
    if(usesLegacySketch)fields.push('"sketch":'+legacySketchKey);
    // Merge already sorted common fields with the dynamic fields without
    // parsing, normalizing or walking the growing feature history again.
    fields.push(...commonFields);
    keys.set(feature.id,'{'+fields.sort().join(',')+'}');
  }
  return keys;
}
function targetKey(targets=[]) {
  return targets.map(({kind,persistentId,ownerFeatureId,semantic,descriptor})=>({kind,persistentId,ownerFeatureId,semantic,descriptor}));
}
function finishKey(sourceKey,type,params,targets) {return geometryKey({sourceKey,type,params,targets:targetKey(targets)});}
export function nativeWorkerHeads(document,run,requestedHead) {
  if(requestedHead)return new Set([requestedHead]);
  const consumed=new Set((document.features || []).filter(feature=>!feature.suppressed && run.results.has(feature.id) && !leavesInputStanding(document,feature)).flatMap(feature=>feature.inputs || []));
  return new Set([...run.results].filter(([id,body])=>body?.shape && (!consumed.has(id) || body===run.finalShape)).map(([id])=>id));
}
async function packBody(body,mesh=false,mass=false,meshOnly=false) {
  if(!body?.shape)return {metadata:metadata(body || {}),topology:body?.topology || []};
  const payload={metadata:metadata(body),topology:structuredClone(body.topology || [])};
  if(!body.invalid && !body.approximate)payload.metadata.nativeSolidCount=await shapeSolidCount(body);
  if(meshOnly && !body.invalid && !body.approximate)payload.proof='exact-native-mesh';
  else payload.bytes=await serializeBrep(body);
  if(mesh)payload.meshData=await shapeToMeshData(body,{deflection:.24,angle:.16});
  if(payload.meshData && payload.metadata.nativeSolidCount!==undefined)payload.meshData.nativeSolidCount=payload.metadata.nativeSolidCount;
  if(mass)payload.massProperties=await shapeMassProperties(body);
  return payload;
}
async function restoreBody(payload,ownerFeatureId) {
  const body=Object.assign(await deserializeBrep(payload.bytes),payload.metadata);
  try {hydrateSerializedBrepTopology(body,payload.topology || [],{ownerFeatureId});return body;}
  catch(error){disposeBrep(body);throw error;}
}

// The worker retains exact serialized results, not mesh stand-ins. Restoring a
// cached Shell gives every run its own handles, so releasing a run is safe.
export function createCadWorkerExecutor({bodyStore=createNativeBodyStore()}={}) {
  const cache=new Map();let cacheBytes=0;
  function remember(key,payload) {
    if(!key || !payload.bytes || payload.metadata.approximate || payload.metadata.invalid)return;
    const prior=cache.get(key);if(prior)cacheBytes-=prior.bytes.byteLength;
    cache.delete(key);cache.set(key,payload);cacheBytes+=payload.bytes.byteLength;
    while(cacheBytes>64*1024*1024 || cache.size>24){const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).bytes.byteLength;cache.delete(oldest);}
  }
  async function rebuild(document,options,progress) {
    const keys=cadWorkerGeometryKeys(document,document.features || [],options),cachedResults=new Map();
    for(const feature of document.features || [])if(isWorkerCacheBody(feature.type)){
      const targets=Array.isArray(feature.references)?feature.references:feature.references?.topology;
      const key=keys.get(feature.id),previewKey=feature.type==='shell'?finishKey(keys.get(feature.inputs?.[0]),'shell',feature.params,targets):null;
      let payload=cache.get(key) || cache.get(previewKey);
      if(!payload){payload=await bodyStore.get(key);if(payload)remember(key,payload);}
      if(payload){
        try{cachedResults.set(feature.id,await restoreBody(payload,feature.id));progress({stage:'cache',name:feature.name || 'Shell'});}
        catch{cache.delete(key);await bodyStore.remove?.(key);}
      }
    }
    let run;
    try {
      run=await regenerateFeatures(document,{...options,cachedResults,onProgress:progress});
      for(const body of cachedResults.values())if(![...run.results.values()].includes(body))disposeBrep(body);
      for(const feature of document.features || [])if(isWorkerCacheBody(feature.type)){
        const body=run.results.get(feature.id);if(body?.shape){
          const payload=await packBody(body),key=keys.get(feature.id);
          remember(key,payload);await bodyStore.put(key,payload);
        }
      }
      return {run,keys};
    } catch(error){if(run)releaseRegeneration(run);else cachedResults.forEach(disposeBrep);throw error;}
  }
  return async function execute(request,progress=()=>{}) {
    if(request.kind==='interference')return workerInterference(request.components,rebuild,progress);
    if(request.kind==='assembly-step')return workerAssemblyStep(request.components,rebuild,progress);
    progress({stage:'start',name:request.kind==='finish'?request.type:'Exact model'});
    let document=request.document;
    if(request.canonical){const compiled=compileKernelFeatureTree(document);if(!compiled.ok)throw new Error(compiled.issues[0]?.message || 'Invalid feature history');document={...compiled.document,features:compiled.features};}
    const {run,keys}=await rebuild(document,{...request.options,...(request.head?{rollbackId:request.head}:{})},progress);
    try {
      if(request.kind==='part-step'){
        if(!run.ok || !run.finalShape?.shape)throw new Error(run.issues.find(issue=>issue.severity==='error')?.message || 'No supported solid features');
        progress({stage:'export',name:'Writing STEP'});
        return {bytes:await exportStep(run.finalShape,request.name || 'model.step')};
      }
      if(request.kind==='topology'){
        const body=run.results.get(request.head) || run.finalShape;
        if(!body?.shape)throw new Error(run.issues.find(issue=>issue.code==='regeneration-failed')?.message || 'The upstream body could not be rebuilt');
        return {topology:body.topology || []};
      }
      if(request.kind==='surface-sections'){
        progress({stage:'surface-sections',name:'Trimmed surface intersections'});
        return collectNativeSections(document,run,request.sketch,request.edge,brepFaceLineIntersections);
      }
      if(request.kind==='cut-intersection'){
        const body=run.results.get(request.head) || run.finalShape;
        if(!body?.shape)throw new Error(run.issues.find(issue=>issue.code==='regeneration-failed')?.message || 'The cut target could not be rebuilt');
        const recipe=toolFeatureRecipe(request.cut);
        if(recipe?.type!=='extrude')throw new Error('Unsupported cut preflight tool');
        let tool;
        try{progress({stage:'intersection',name:'Cut preflight'});tool=await makeBrepExtrusion(recipe.params);return await brepMaterialIntersection(body,tool);}
        finally{if(tool)disposeBrep(tool);}
      }
      if(request.kind==='finish'){
        const body=run.results.get(request.head);if(!body?.shape)throw new Error(run.issues.find(issue=>issue.code==='regeneration-failed')?.message || 'The displayed body could not be rebuilt');
        const key=finishKey(keys.get(request.head),request.type,request.params,request.targets),cached=cache.get(key);
        if(cached){progress({stage:'cache',name:request.type});return {body:cached};}
        const registry=createTopologyRegistry(body.topology || []);
        const rebind=reference=>{
          const descriptor=structuredClone(reference.descriptor || {});delete descriptor.semantic;
          const resolution=resolveTopologyReference({persistentId:reference.persistentId,kind:reference.kind,descriptor},registry,{threshold:.05});
          if(!resolution.topology || ['missing','ambiguous'].includes(resolution.status))throw new Error('The selected geometry could not be matched to the rebuilt body');
          return resolution.topology;
        };
        const targets=request.targets.map(reference=>request.params?.fullRound?resolveFinishFace(reference,body.topology):rebind(reference));
        const neutral=request.type==='draft' && request.params.neutralFace?rebind(request.params.neutralFace):null;
        const options={...request.params,edgePersistentIds:targets.filter(item=>item.kind==='edge').map(item=>item.persistentId),
          facePersistentIds:targets.filter(item=>item.kind==='face' && (!neutral || item.persistentId!==neutral.persistentId)).map(item=>item.persistentId)};
        if(neutral)options.neutralFaceId=neutral.persistentId;
        const operation={shell:shellBrep,fillet:filletBrep,chamfer:chamferBrep,dome:domeBrep,draft:draftBrep}[request.type];
        if(!operation)throw new Error('Unsupported worker finish operation');
        progress({stage:'finish',name:request.type});
        let finished;
        try {
          finished=await operation(body,request.amount,options);
          extractBrepTopology(finished,{ownerFeatureId:'preview:'+request.type});
          const payload=await packBody(finished,true);
          if(request.type==='shell')remember(key,payload);
          return {body:payload};
        }finally{if(finished)disposeBrep(finished);}
      }
      const results=[],nativeHeads=nativeWorkerHeads(document,run,request.head);let finalId=null;
      for(const [id,body] of run.results){
        if(body===run.finalShape)finalId=id;
        if(request.head && id!==request.head)continue;
        progress({stage:'transfer',featureId:id,name:document.features?.find(feature=>feature.id===id)?.name || id});results.push([id,await packBody(body,!!body?.shape,!!request.massProperties,!!request.meshOnly || !nativeHeads.has(id))]);
      }
      return {ok:run.ok,results,finalId,topology:run.topology,topologyBindings:run.topologyBindings,
        resolvedExtrusions:[...run.resolvedExtrusions],boundaryUpdates:[...run.boundaryUpdates],referenceUpdates:run.referenceUpdates,issues:run.issues};
    }finally{releaseRegeneration(run);}
  };
}
