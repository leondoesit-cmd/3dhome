import {flattenAssembly} from './core/assembly_structure.js';
import {evaluateMassProperties} from './cad_mass_properties.js';

const axes=['x','y','z'];
const zeroTensor=()=>[[0,0,0],[0,0,0],[0,0,0]];
const sourceKey=(def,component)=>JSON.stringify({
  key:def.key,history:def.history,features:def.features,sketches:def.sketches,
  parameters:def.parameters,variables:def.variables,
  parts:(def.parts||[]).map(({meshData,exactTopologyCache,...part})=>part),
  overrides:component.parameterOverrides,configurationId:component.configurationId,
});
const placedPoint=(point,placement)=>Object.fromEntries(axes.map(axis=>[
  axis,(placement.origin[axis]||0)+axes.reduce((sum,local)=>sum+(placement[local]?.[axis]||0)*(point?.[local]||0),0),
]));
const placedTensor=(tensor,placement)=>axes.map(row=>axes.map(column=>
  axes.reduce((sum,_,k)=>sum+axes.reduce((inner,__,l)=>inner+
    (placement[axes[k]]?.[row]||0)*(tensor?.[k]?.[l]||0)*(placement[axes[l]]?.[column]||0),0),0)));
const placedBounds=(bounds,placement)=>{
  if(!bounds?.min||!bounds?.max)return null;
  const out={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const point=placedPoint({x,y,z},placement);
    for(const axis of axes){out.min[axis]=Math.min(out.min[axis],point[axis]);out.max[axis]=Math.max(out.max[axis],point[axis]);}
  }
  return out;
};

/* Each native part body is measured once in its own space, then each visible
 * occurrence contributes its transformed centre, inertia and bounds. An
 * assembly mass is the sum of its parts; an interference check separately
 * establishes whether those placed solids overlap. */
export async function evaluateAssemblyMassProperties(assembly,options={}) {
  const occurrences=flattenAssembly(assembly,{visibleOnly:true}).filter(item=>
    !item.component.suppressed && !item.parents.some(parent=>parent.suppressed));
  const cache=new Map(),rows=[];
  for(const occurrence of occurrences){
    const component=occurrence.component,def=options.resolveDefinition?.(component)||component.def;
    if(!def){rows.push({componentId:component.id,componentName:component.name,accuracy:'unavailable',volume:0,massKg:0,error:'Missing component definition'});continue;}
    const key=sourceKey(def,component);
    if(!cache.has(key))cache.set(key,Promise.resolve((options.evaluateDefinition||evaluateMassProperties)(def,component)));
    const evaluated=await cache.get(key);
    const bodies=evaluated?.bodies?.length ? evaluated.bodies : [{accuracy:'unavailable',volume:0,massKg:0,error:'No measured solid body'}];
    for(const body of bodies)rows.push({...body,
      componentId:component.id,componentName:component.name||def.name||String(component.id),
      componentPath:occurrence.path,definitionKey:def.key,
      centerOfMass:body.centerOfMass?placedPoint(body.centerOfMass,occurrence.placement):undefined,
      inertia:body.inertia?placedTensor(body.inertia,occurrence.placement):undefined,
      bounds:placedBounds(body.bounds,occurrence.placement),
    });
  }
  const measured=rows.filter(row=>row.volume>0),volumeCm3=measured.reduce((sum,row)=>sum+row.volume,0);
  const massKg=measured.reduce((sum,row)=>sum+(row.massKg||0),0);
  const centerOfMass=Object.fromEntries(axes.map(axis=>[axis,massKg?
    measured.reduce((sum,row)=>sum+(row.massKg||0)*(row.centerOfMass?.[axis]||0),0)/massKg:0]));
  const accuracy=!rows.length||rows.some(row=>row.accuracy==='unavailable')?'incomplete':
    rows.every(row=>row.accuracy==='exact')?'exact':'approximate';
  const inertiaKgM2=accuracy==='exact'&&measured.length?zeroTensor():null;
  if(inertiaKgM2)for(const row of measured){
    const delta=axes.map(axis=>row.centerOfMass[axis]-centerOfMass[axis]);
    const distance2=delta.reduce((sum,value)=>sum+value*value,0);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)inertiaKgM2[i][j]+=
      (row.inertia[i][j]+row.volume*((i===j?distance2:0)-delta[i]*delta[j]))*row.density*1e-7;
  }
  const bounds=accuracy==='exact'&&measured.length&&measured.every(row=>row.bounds)?{
    min:Object.fromEntries(axes.map(axis=>[axis,Math.min(...measured.map(row=>row.bounds.min[axis]))])),
    max:Object.fromEntries(axes.map(axis=>[axis,Math.max(...measured.map(row=>row.bounds.max[axis]))])),
  }:null;
  const densities=[...new Set(measured.map(row=>row.density))];
  return {bounds,volumeCm3,massKg,massG:massKg*1000,density:densities.length===1?densities[0]:null,
    densities,centerOfMass,inertiaKgM2,accuracy,
    unmeasured:rows.filter(row=>row.accuracy==='unavailable').length,bodies:rows};
}
