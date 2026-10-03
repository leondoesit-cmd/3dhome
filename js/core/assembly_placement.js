import {eulerMatrix,setRotation} from '../cad_mate_model.js';

/* A typed occurrence placement is a temporary driver, not a Ground mate.
   Apply all six fields together; a one-coordinate intermediate may be outside
   the linkage's travel even when the final entered pose is valid. */
export function applyDrivenAssemblyPlacement(assembly,component,values,solve) {
  if(!assembly || !component || component.grounded)return {ok:false,reason:'grounded'};
  const before=(assembly.components || []).map(c=>({component:c,transform:structuredClone(c.transform || {})}));
  const restore=()=>before.forEach(({component:c,transform})=>{c.transform=transform;});
  const tr=component.transform ||= {};
  Object.assign(tr,values);
  setRotation(tr,eulerMatrix(tr));
  let result;
  try{result=solve({fixedComponentIds:[component.id]});}
  catch(error){restore();throw error;}
  /* `settled` is the stricter numeric optimizer threshold. A complete mate
     audit can still pass its physical linear/angular tolerances when a large
     closed linkage stalls above that threshold; `ok` is the acceptance gate. */
  if(!result?.ok){
    restore();
    return {ok:false,reason:'mate-conflict',result};
  }
  return {ok:true,result};
}
