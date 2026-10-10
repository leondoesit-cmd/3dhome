import {applyConfiguration,circularSweepTableTarget} from '../cad_configurations.js';
import {compileKernelFeatureTree} from './kernel_feature_adapter.js';
import {regenerateInCadWorker} from './cad_worker_client.js';
import {releaseRegeneration} from '../cad_feature_tree.js';
import {meshDataTriangles} from './part_tessellate.js';
import {partAppearanceKeys} from './toolbox_projection_restore.js';

const clone=value=>JSON.parse(JSON.stringify(value));
export function configuredViewId(document,view) {
  const seen=new Set();while(view){if(seen.has(view.id))return null;seen.add(view.id);
    if(view.configurationId)return view.configurationId;view=(document?.drawing?.views||[]).find(v=>v.id===view.parent);}
  return null;
}
export function nativeConfiguredEligibility(document,id) {
  if(!id)return {eligible:false,reason:'Active model geometry'};
  const cfg=document?.configurations?.find(c=>c.id===id),target=circularSweepTableTarget(document);
  if(!cfg || !target || document.designTable?.kind!=='circular-sweep'
    || target.sketch.id!==document.designTable.pathSketchId || target.sweep.id!==document.designTable.sweepFeatureId)
    return {eligible:false,reason:'Native configured geometry supports canonical circular-sweep table rows only'};
  const live=(document.features||[]).filter(f=>!f.suppressed);
  const values=cfg.designTableValues;
  if(live.length!==1 || live[0].id!==target.sweep.id || !(document.history||[]).some(e=>e.kind==='feature'&&e.targetId===target.sweep.id&&!e.suppressed)
    || !values || !Number.isFinite(values.pathDiameterMm) || !Number.isFinite(values.profileDiameterMm)
    || values.pathDiameterMm<=values.profileDiameterMm || values.profileDiameterMm<=0)
    return {eligible:false,reason:'Native configured geometry requires one authored circular sweep and a valid row'};
  return {eligible:true,cfg,target};
}
export function nativeConfiguredKey(document,id) {
  const fields=['id','referenceId','plane','offset','frame','frameSpace','points','entities','constraints','suppressed','units'];
  return JSON.stringify({id,key:document.key,sketches:(document.sketches||[]).map(s=>Object.fromEntries(fields.filter(k=>s[k]!==undefined).map(k=>[k,s[k]]))),
    features:(document.features||[]).map(f=>({id:f.id,type:f.type,params:f.params,inputs:f.inputs,suppressed:f.suppressed})),
    history:(document.history||[]).map(e=>({kind:e.kind,targetId:e.targetId,suppressed:e.suppressed})),
    referenceGeometry:document.referenceGeometry,variables:document.variables,parameterOverrides:document.parameterOverrides,
    rollback:document.rollback,designTable:document.designTable,configuration:document.configurations?.find(c=>c.id===id)});
}

/** Appearance stays live and never invalidates or mutates native meshes. */
export function configuredBodyAppearance(document,bodies) {
  const target=circularSweepTableTarget(document),part=document.parts?.find(p=>p.featureId===target?.sweep.id);
  const appearance=part?Object.fromEntries(partAppearanceKeys.filter(k=>part[k]!==undefined).map(k=>[k,clone(part[k])])):{};
  return bodies.map(body=>({...body,...appearance}));
}

/** Derived, owner-isolated native meshes. No active configuration/parts/history
 * are changed; incomplete/stale work never supplies fallback geometry. */
export function createNativeConfiguredDrawingCache({regenerate=regenerateInCadWorker,release=releaseRegeneration,onChange=()=>{},maxEntries=8}={}) {
  const owners=new WeakMap();let serial=0;
  function entries(document){let m=owners.get(document);if(!m){m=new Map();owners.set(document,m);}return m;}
  function state(document,id){const valid=nativeConfiguredEligibility(document,id);if(!valid.eligible)return {status:'unsupported',reason:valid.reason};
    const entry=entries(document).get(id);return entry?.key===nativeConfiguredKey(document,id)?entry:{status:'missing'};}
  function request(document,id) {
    const valid=nativeConfiguredEligibility(document,id);if(!valid.eligible)return Promise.reject(new Error(valid.reason));
    const map=entries(document),key=nativeConfiguredKey(document,id),previous=map.get(id);
    if(previous?.key===key)return previous.promise;
    previous?.controller.abort();
    if(map.size>=maxEntries&&!map.has(id)){const [old,entry]=map.entries().next().value;entry.controller.abort();map.delete(old);}
    const controller=new AbortController(),entry={key,status:'pending',controller,reason:'Native configuration rebuilding'};map.set(id,entry);
    const current=()=>!controller.signal.aborted&&map.get(id)===entry&&nativeConfiguredKey(document,id)===key;
    entry.promise=(async()=>{
      let run;try {
        const snapshot=clone(document),cfg=snapshot.configurations.find(c=>c.id===id);snapshot.activeConfiguration=id;applyConfiguration(snapshot,cfg);
        const compiled=compileKernelFeatureTree(snapshot);if(!compiled.ok)throw new Error(compiled.issues[0]?.message||'Configured history could not compile');
        run=await regenerate({...compiled.document,features:compiled.features},{restoreMode:'mesh',scope:'drawing-configuration-'+(++serial),signal:controller.signal});
        if(!current())throw new Error('Configured drawing source changed; retry');
        if(!run.ok)throw new Error(run.issues?.find(i=>i.severity==='error')?.message||'Native configuration rebuild failed');
        const body=run.results?.get(valid.target.sweep.id),mesh=body?.workerMeshData;
        if(body?.verifiedSerializedExact!==true||body.invalid||body.approximate||!mesh?.positions?.length)throw new Error('Native configured mesh proof is incomplete');
        const positions=meshDataTriangles(mesh);if(positions.length<9||Array.from(positions).some(n=>!Number.isFinite(n)))throw new Error('Native configured mesh has no valid triangles');
        entry.bodies=[{id:valid.target.sweep.id+':'+id,name:valid.cfg.name,positions:clone(Array.from(positions)),
          ...(mesh.exactBounds?{exactBounds:clone(mesh.exactBounds)}:{}),nativeConfigurationId:id,geometryProof:'exact-native-mesh'}];
        entry.status='ready';entry.reason='Native configuration ready';onChange(document,id,entry);return entry.bodies;
      }catch(error){entry.status='error';entry.reason=String(error.message||error);if(current())onChange(document,id,entry);throw error;}
      finally{if(run)release(run);}
    })();return entry.promise;
  }
  async function prepare(document,views,{assertCurrent=()=>{}}={}) {
    const ids=[...new Set(views.map(v=>configuredViewId(document,v)).filter(Boolean))];
    for(const id of ids){assertCurrent();await request(document,id);assertCurrent();}
    return ids;
  }
  function cancel(document){for(const e of entries(document).values())e.controller.abort();owners.delete(document);}
  return {state,request,prepare,cancel};
}
