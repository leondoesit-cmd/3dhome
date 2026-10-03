import { compileKernelFeatureTree } from './kernel_feature_adapter.js';
import { releaseRegeneration } from '../cad_feature_tree.js';
import { placeBrep, disposeBrep, compoundBrep, exportStep, validateBrepForExport } from '../cad_kernel.js';
import { detectInterference } from '../cad_interference.js';

// Viewport triangles and saved topology are derived data. Transferring them
// before compiling a canonical feature tree can freeze the page for large
// modeled threads; the worker needs only authoring intent.
export function interferenceDocument(source) {
  if(!source)return null;
  const document={...source,parts:[]};
  for(const key of ['exactTopologyCache','verifiedExactTopology','meshData','topology','diagnostics'])delete document[key];
  return document;
}

export async function workerInterference(components,rebuild,progress=()=>{},dependencies={}) {
  const compile=dependencies.compile || compileKernelFeatureTree;
  const place=dependencies.place || placeBrep;
  const release=dependencies.release || releaseRegeneration;
  const dispose=dependencies.dispose || disposeBrep;
  const detect=dependencies.detect || detectInterference;
  const measured=components.map(component=>({...component})),placed=[];
  // A saved part can occur many times in one assembly. Share only its rebuilt
  // source during this check; each occurrence still needs its own placed BREP.
  // The full authoring document is the key, so two instances with different
  // overrides cannot accidentally share geometry merely by model name.
  const keys=measured.map(component=>component.document?JSON.stringify(component.document):null);
  const remaining=new Map(),sources=new Map();
  keys.forEach(key=>{if(key!==null)remaining.set(key,(remaining.get(key)||0)+1);});
  try {
    for(let index=0;index<measured.length;index++){
      const component=measured[index],key=keys[index];
      if(!component.document)continue;
      let run=sources.get(key);
      if(!run){
        progress({stage:'rebuild',name:component.label,componentId:component.id});
        const compiled=compile(component.document);
        if(!compiled.ok)throw new Error(compiled.issues[0]?.message || 'Invalid interference feature history');
        let rebuilt;
        try{
          ({run:rebuilt}=await rebuild({...compiled.document,features:compiled.features},{},value=>progress({...value,componentId:component.id})));
          if(!rebuilt.ok || !rebuilt.finalShape?.shape)throw new Error(rebuilt.issues?.[0]?.message || 'Exact interference body could not be rebuilt');
          sources.set(key,rebuilt);run=rebuilt;
        }catch(error){if(rebuilt)release(rebuilt);throw error;}
      }
      try {
        progress({stage:'placement',name:component.label,componentId:component.id});
        component.brep=await place(run.finalShape,component.placement);
        placed.push(component.brep);
      }finally{
        const left=remaining.get(key)-1;
        remaining.set(key,left);
        if(left===0){sources.delete(key);release(run);}
      }
    }
    return await detect(measured,{onProgress:progress});
  }finally{sources.forEach(release);placed.forEach(dispose);}
}

// One STEP file for the whole assembly: every exact leaf body is rebuilt in the
// worker, placed where its mates put it, and written as a single compound so a
// downstream CAD system opens the assembled product rather than the last part.
export async function workerAssemblyStep(components,rebuild,progress=()=>{},dependencies={}) {
  const compile=dependencies.compile || compileKernelFeatureTree;
  const place=dependencies.place || placeBrep;
  const release=dependencies.release || releaseRegeneration;
  const dispose=dependencies.dispose || disposeBrep;
  const compound=dependencies.compound || compoundBrep;
  const writeStep=dependencies.exportStep || exportStep;
  // Bodies restored from the worker's serialized Shell cache come back with a
  // .0024 cm vertex tolerance (HOUSING), so an assembly is exported at .005 cm
  // (.05 mm); a part export keeps the strict .001 cm gate.
  const limit={maxToleranceCm:dependencies.maxToleranceCm ?? .005};
  const validate=dependencies.validate || (body=>validateBrepForExport(body,limit));
  const placed=[];let assembled=null;
  const keys=components.map(component=>component.document?JSON.stringify(component.document):null);
  const remaining=new Map(),sources=new Map();
  keys.forEach(key=>{if(key!==null)remaining.set(key,(remaining.get(key)||0)+1);});
  try {
    for(let index=0;index<components.length;index++){
      const component=components[index],key=keys[index];
      if(!component.document)throw new Error('STEP export needs an exact feature-built body for '+(component.label || component.id));
      let run=sources.get(key);
      if(!run){
        progress({stage:'rebuild',name:component.label,componentId:component.id});
        const compiled=compile(component.document);
        if(!compiled.ok)throw new Error(compiled.issues[0]?.message || 'Invalid STEP export feature history');
        let rebuilt;
        try{
          ({run:rebuilt}=await rebuild({...compiled.document,features:compiled.features},{},value=>progress({...value,componentId:component.id})));
          if(!rebuilt.ok || !rebuilt.finalShape?.shape)throw new Error(rebuilt.issues?.[0]?.message || 'Exact STEP body could not be rebuilt');
          sources.set(key,rebuilt);run=rebuilt;
        }catch(error){if(rebuilt)release(rebuilt);throw error;}
      }
      try {
        progress({stage:'placement',name:component.label,componentId:component.id});
        const body=await place(run.finalShape,component.placement);
        placed.push(body);
        // Name the component whose body the exporter would refuse, not just the compound.
        try{await validate(body);}catch(error){throw new Error((component.label || component.id)+': '+error.message);}
      }finally{
        const left=remaining.get(key)-1;remaining.set(key,left);
        if(left===0){sources.delete(key);release(run);}
      }
    }
    if(!placed.length)throw new Error('STEP export needs at least one exact component');
    progress({stage:'export',name:'STEP'});
    assembled=await compound(placed);
    return {bytes:await writeStep(assembled,'assembly.step',limit),bodies:placed.length};
  }finally{sources.forEach(release);if(assembled)dispose(assembled);placed.forEach(dispose);}
}
