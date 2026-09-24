import {stableStringify} from './dependency_graph.js';

// Exact generated edges cannot be inferred by the lightweight history pass.
// Reuse verified topology only while every preceding modeling input matches.
function signatures(document, features) {
  const prefix=[],sketchIds=new Set(),result=new Map();
  for(const feature of features) {
    prefix.push({id:feature.id,type:feature.type,params:feature.params,inputs:feature.inputs,references:feature.references,suppressed:feature.suppressed});
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
    result.set(feature.id,stableStringify({features:prefix,sketches,parameters:document.parameters,variables:document.variables}));
  }
  return result;
}

export function captureExactTopology(document, features, run) {
  const stamps=signatures(document,features),cache={};
  for(const [id,result] of run.results || []) {
    if(result.shape && result.topology?.length && stamps.has(id))cache[id]={signature:stamps.get(id),topology:structuredClone(result.topology)};
  }
  return cache;
}

export function verifiedExactTopology(document, features) {
  const stamps=signatures(document,features),topology=new Map();
  for(const [id,entry] of Object.entries(document.exactTopologyCache || {})) {
    if(entry.signature===stamps.get(id) && Array.isArray(entry.topology))topology.set(id,entry.topology);
  }
  return topology;
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
