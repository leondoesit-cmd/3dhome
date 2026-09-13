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
      id:sketch.id,points:sketch.points,entities:sketch.entities,constraints:sketch.constraints,
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
