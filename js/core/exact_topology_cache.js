import {stableStringify} from './dependency_graph.js';
import {nativeOperationRevision} from './native_operation_revision.js';

function normalizedStamp(value) {
  // Resolving attached sketch frames can introduce round-off at nonzero
  // coordinates too. Normalize only resolved frames, never driving dimensions
  // or sketch point values. Twelve decimal places are below kernel tolerance.
  const normalizeFrames=(item,inFrame=false)=>{
    if(typeof item==='number' && inFrame && Number.isFinite(item))return Number(item.toFixed(12));
    if(Array.isArray(item))return item.map(entry=>normalizeFrames(entry,inFrame));
    if(item && typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,normalizeFrames(entry,inFrame || key==='frame' || key==='localFrame')]));
    return item;
  };
  value=normalizeFrames(value);
  for(const feature of value.features || []){
    if(feature.params?.sketchSources){
      const derived=feature.type==='loft'?['sections','sectionSegments']:feature.type==='sweep'?['profile','profileSegments','path','pathSegments']:[];
      derived.forEach(key=>delete feature.params[key]);
    }
    // Hole tools began stamping holeOffsetNormal, which only moves a reversed
    // cut off a support face (alignExtrusionToSupport). Anywhere else it is
    // the same geometry as none and must not expire Holes saved before it.
    const params=feature.params;
    if(params?.holeOffsetNormal && !(Number(params.baseOffset) && params.direction==='reverse'))delete params.holeOffsetNormal;
  }
  // Frame resolution can leave signed zero and round-off at the origin after
  // a JSON reopen. This threshold is far below the kernel modeling tolerance;
  // every driving value or geometry edit above this bound remains stamped.
  // A zero supportOffset is the same geometry as none. Attached-face offsets began
  // stamping an explicit 0 on every face-supported feature, which must not expire
  // the verified topology of documents saved before that field existed.
  return stableStringify(JSON.parse(JSON.stringify(value,(key,item)=>key==='supportOffset' && item===0?undefined:typeof item==='number' && Math.abs(item)<1e-12?0:item)));
}
function savedStamp(signature) {
  if(typeof signature!=='string' || signature.includes('"[circular]"'))return null;
  try{return normalizedStamp(JSON.parse(signature));}catch{return null;}
}

// Exact generated edges cannot be inferred by the lightweight history pass.
// Reuse verified topology only while every preceding modeling input matches.
function signatures(document, features) {
  const prefix=[],sketchIds=new Set(),result=new Map();
  for(const feature of features) {
    const params={...feature.params};
    if(params.sketchSources){
      // resolveSketchSources replaces these viewport snapshots with the source
      // sketches on every exact rebuild. Reference-plane creation can refresh
      // the snapshots without changing the source geometry.
      const derived=feature.type==='loft'?['sections','sectionSegments']:feature.type==='sweep'?['profile','profileSegments','path','pathSegments']:[];
      derived.forEach(key=>delete params[key]);
      const visit=value=>{
        if(Array.isArray(value)){value.forEach(visit);return;}
        if(value && typeof value==='object'){
          if(value.sketchId)sketchIds.add(value.sketchId);
          Object.values(value).forEach(visit);
        }
      };
      visit(params.sketchSources);
    }
    const kernelRevision=nativeOperationRevision(feature);
    prefix.push({id:feature.id,type:feature.type,params,inputs:feature.inputs,references:feature.references,suppressed:feature.suppressed,...(kernelRevision?{kernelRevision}:{})});
    if(feature.params?.sketchId)sketchIds.add(feature.params.sketchId);
    for(const id of feature.references?.sketches || [])sketchIds.add(id);
    const sketches=(document.sketches || []).filter(sketch=>sketchIds.has(sketch.id)).map(sketch=>({
      id:sketch.id,points:sketch.points,entities:sketch.entities,
      // A dimension label is an address for equations, not geometry. Renaming
      // it must not hide a verified loft face from the lightweight rebuild
      // while the exact kernel catches up. The resolved value and expression
      // remain in the stamp, so changes that move geometry still expire it.
      constraints:(sketch.constraints || []).map(({name,exprError,...constraint})=>constraint),
      plane:sketch.plane,offset:sketch.offset,frame:sketch.frame,frameSpace:sketch.frameSpace,
      support:sketch.support,supportOffset:sketch.supportOffset,
    }));
    // Shared frame/vector object identity is not geometry. A saved JSON clone
    // must receive the same stamp as the live authoring document.
    result.set(feature.id,normalizedStamp(JSON.parse(JSON.stringify({features:prefix,sketches,parameters:document.parameters,variables:document.variables}))));
  }
  return result;
}

export function captureExactTopology(document, features, run) {
  const stamps=signatures(document,features),cache={};
  // A requested-head preview contains only that result. Preserve independently
  // verified upstream names, never an entry whose current geometry changed.
  for(const [id,entry] of Object.entries(document.exactTopologyCache || {})){
    if(savedStamp(entry.signature)===stamps.get(id) && Array.isArray(entry.topology))cache[id]={signature:stamps.get(id),topology:structuredClone(entry.topology)};
  }
  for(const [id,result] of run.results || []) {
    if(result.invalid || result.approximate){delete cache[id];continue;}
    const exact=!!result.shape || result.verifiedSerializedExact===true;
    if(exact && result.topology?.length && stamps.has(id))cache[id]={signature:stamps.get(id),topology:structuredClone(result.topology)};
  }
  return cache;
}

export function verifiedExactTopology(document, features) {
  const stamps=signatures(document,features),topology=new Map();
  for(const [id,entry] of Object.entries(document.exactTopologyCache || {})) {
    if(savedStamp(entry.signature)===stamps.get(id) && Array.isArray(entry.topology))topology.set(id,entry.topology);
  }
  return topology;
}

// An assembly occurrence needs the surviving bodies, not the faces of every
// consumed history result. Saved canonical parts can have these exact faces
// before their display meshes have been regenerated in the assembly tab.
export function verifiedFinalTopology(document, features) {
  const verified = verifiedExactTopology(document, features);
  const active = features.filter(feature => !feature.suppressed
    && !["sketch", "helix", "knurl"].includes(feature.type)
    && !(feature.type === "thread" && feature.params?.mode !== "modeled"));
  const consumed = new Set(active.flatMap(feature => feature.inputs || []));
  return active.filter(feature => !consumed.has(feature.id))
    .flatMap(feature => verified.get(feature.id) || []);
}

/* A parameter edit invalidates a cached result as geometry, but its topology
   names are still valuable as one-run naming hints.  The exact kernel uses
   these records only to match old subshape identities onto newly-built
   subshapes; it never reuses the cached shape or treats an old signature as a
   successful rebuild. */
export function cachedExactTopology(document) {
  const topology=new Map();
  for(const [id,entry] of Object.entries(document?.exactTopologyCache || {})){
    if(Array.isArray(entry?.topology))topology.set(id,structuredClone(entry.topology));
  }
  return topology;
}
