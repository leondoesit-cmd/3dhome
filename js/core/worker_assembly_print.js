import {compileKernelFeatureTree} from './kernel_feature_adapter.js';
import {releaseRegeneration} from '../cad_feature_tree.js';
import {placeBrep,disposeBrep,shapeToMeshData,validateBrepForExport} from '../cad_kernel.js';
import {stlMeshOptions} from '../cad_stl.js';
import {assemblyPrintBytes,assemblyPrintPreview,assemblyPrintMeshes} from './assembly_print.js';

function requireRigidPlacement(placement) {
  const m=placement?.matrix,t=placement?.translation;
  if(!Array.isArray(m)||m.length!==9||m.some(x=>!Number.isFinite(x))||!t||['x','y','z'].some(k=>!Number.isFinite(t[k])))throw new Error('Print component needs a finite rigid placement');
  const dot=(a,b)=>[0,1,2].reduce((sum,i)=>sum+m[i*3+a]*m[i*3+b],0);
  const determinant=m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
  if([0,1,2].some(i=>Math.abs(dot(i,i)-1)>1e-7)||Math.abs(dot(0,1))>1e-7||Math.abs(dot(0,2))>1e-7||Math.abs(dot(1,2))>1e-7||Math.abs(determinant-1)>1e-7)throw new Error('Print placement must preserve scale and winding');
}

export async function workerAssemblyPrint(components,settings,rebuild,progress=()=>{},dependencies={}) {
  if(!Array.isArray(components)||!components.length)throw new Error('Assembly print needs exact components');
  const compile=dependencies.compile || compileKernelFeatureTree,place=dependencies.place || placeBrep,release=dependencies.release || releaseRegeneration,dispose=dependencies.dispose || disposeBrep;
  const validate=dependencies.validate || (body=>validateBrepForExport(body,{maxToleranceCm:.005})),mesh=dependencies.mesh || shapeToMeshData;
  const options=stlMeshOptions(settings),sources=new Map(),remaining=new Map(),occurrences=[];
  const keys=components.map(item=>item.document?JSON.stringify(item.document):null);
  keys.forEach(key=>remaining.set(key,(remaining.get(key)||0)+1));
  const ids=new Set();
  try{
    for(let index=0;index<components.length;index++){
      const item=components[index],key=keys[index],id=String(item.occurrenceId || item.id);
      if(!item.document)throw new Error('Print export needs an exact feature-built body for '+(item.label || id));
      if(ids.has(id))throw new Error('Print occurrence identifiers must be unique');ids.add(id);
      requireRigidPlacement(item.placement);
      let run=sources.get(key);
      if(!run){
        progress({stage:'rebuild',name:item.label,componentId:item.id});
        const compiled=compile(item.document);if(!compiled.ok)throw new Error(compiled.issues[0]?.message || 'Invalid print feature history');
        let rebuilt;
        try{
          ({run:rebuilt}=await rebuild({...compiled.document,features:compiled.features},{},value=>progress({...value,componentId:item.id})));
          if(!rebuilt.ok||!rebuilt.finalShape?.shape)throw new Error(rebuilt.issues?.[0]?.message || 'Exact print body could not rebuild');
          sources.set(key,rebuilt);run=rebuilt;
        }catch(error){if(rebuilt)release(rebuilt);throw error;}
      }
      let body;
      try{
        progress({stage:'placement',name:item.label,componentId:item.id});
        body=await place(run.finalShape,item.placement);
        const proof=await validate(body);if(proof?.valid===false)throw new Error('Native component is invalid');
        const triangles=await mesh(body,options);
        occurrences.push({occurrenceId:id,name:item.label || id,positions:triangles.positions});
      }catch(error){throw new Error((item.label || id)+': '+error.message);}
      finally{
        if(body)dispose(body);
        const left=remaining.get(key)-1;remaining.set(key,left);
        if(left===0){sources.delete(key);release(run);}
      }
    }
    const preview=assemblyPrintPreview(occurrences);
    if(settings?.layerAnalysisOnly)return {...preview,meshes:assemblyPrintMeshes(occurrences,settings.printSetup)};
    if(settings?.previewOnly)return preview;
    progress({stage:'export',name:(settings?.format || 'stl').toUpperCase()});
    return {...preview,bytes:assemblyPrintBytes(occurrences,settings),occurrences:occurrences.map(item=>({id:item.occurrenceId,name:item.name})),qualification:'Placed exact component snapshot; separate print meshes; CAD feature history remains in source assembly.'};
  }finally{sources.forEach(release);}
}
