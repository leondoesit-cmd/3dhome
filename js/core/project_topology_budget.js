import {compileKernelFeatureTree} from './kernel_feature_adapter.js';

const DEFAULT_BUDGET=8*1024*1024;

// Topology snapshots accelerate edits; they are not the authored geometry.
// Keep final body names and every explicit associative support even when a
// large imported part exceeds the optional history snapshot budget.
export function compactDocumentTopologySnapshots(document,budget=DEFAULT_BUDGET) {
  const cache=document?.exactTopologyCache;
  if(!cache || JSON.stringify(cache).length<=budget)return document;
  const source={...document,exactTopologyCache:undefined,lastRebuild:undefined,
    parts:(document.parts || []).map(({meshData,...part})=>part)};
  const compiled=compileKernelFeatureTree(source);
  if(!compiled.ok)return document;
  const active=compiled.features.filter(feature=>!feature.suppressed);
  const consumed=new Set(active.flatMap(feature=>feature.inputs || []));
  const required=new Set(active.filter(feature=>!consumed.has(feature.id)).map(feature=>feature.id));
  if(![...required].some(id=>cache[id]))return document;
  const collect=value=>{
    if(!value || typeof value!=='object')return;
    if(value.ownerFeatureId)required.add(value.ownerFeatureId);
    if(Array.isArray(value))value.forEach(collect);
    else Object.values(value).forEach(collect);
  };
  collect(document.sketches);collect(document.features);collect(document.references);
  // Cache insertion order follows feature history. Spend any remaining budget
  // on recent optional prefixes so ordinary edits stay warm.
  const retained=Object.fromEntries(Object.entries(cache).filter(([id])=>required.has(id)));
  let bytes=JSON.stringify(retained).length;
  for(const [id,entry] of Object.entries(cache).reverse()){
    if(required.has(id))continue;
    const size=JSON.stringify(entry).length;
    if(bytes+size>budget)continue;
    retained[id]=entry;bytes+=size;
  }
  return {...document,exactTopologyCache:retained};
}

export function compactAssemblyTopologySnapshots(assembly,budget=DEFAULT_BUDGET) {
  if(!assembly?.components)return assembly;
  return {...assembly,components:assembly.components.map(component=>({...component,
    ...(component.def?{def:compactDocumentTopologySnapshots(component.def,budget)}:{}),
    ...(component.asm?{asm:compactAssemblyTopologySnapshots(component.asm,budget)}:{})}))};
}
