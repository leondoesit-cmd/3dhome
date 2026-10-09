import {analyzeSketchChains} from './sketch_profiles.js';
import {thinSketchProfile} from './core/thin_profile.js';

export function thinExtrudeChainKey(entityIds) { return [...entityIds].sort().join('|'); }

// Selection is per connected chain; its traversal is left intact so the two
// thickness sides have identical meaning in preview and native regeneration.
export function thinExtrudeAreas(sketch,params,{selectedIds=[],chainKeys=[]}={}) {
 let chains=analyzeSketchChains(sketch,{selectedIds}).chains;
 if(selectedIds.length)chains=chains.filter(chain=>chain.selected);
 if(chainKeys.length)chains=chains.filter(chain=>chainKeys.includes(thinExtrudeChainKey(chain.entityIds)));
 if(!chains.length)throw new Error('Select an open line or arc chain for Thin Extrude');
 return chains.map(chain=>{
  const mode=params.thinChainModes?.[thinExtrudeChainKey(chain.entityIds)] || params.thinMode || 'mid-plane';
  if(!['mid-plane','forward','reverse'].includes(mode))throw new Error('Unsupported Thin Extrude thickness side');
  return {...thinSketchProfile(sketch,chain.entityIds,params.thickness,mode),entityIds:chain.entityIds,thinMode:mode,holes:[],holeEntityIds:[]};
 });
}

// Path availability is not a successful solid build. Only an active or saved
// Thin feature validates its actual thickness and side before claiming ready.
export function thinExtrudeSketchReadiness(sketch,{type,params,selectedIds=[],chainKeys=[],features=[]}={}) {
 const entities=(sketch?.entities || []).filter(entity=>!entity.construction);
 const chains=analyzeSketchChains(sketch).chains;
 const chainIds=new Set(chains.flatMap(chain=>chain.entityIds));
 const complete=entities.length>0 && entities.every(entity=>chainIds.has(entity.id) && ['line','arc'].includes(entity.type));
 if(!complete)return null;
 if(['extrude','extrudeCut'].includes(type)) {
  if(!params?.thinFeature || !Number.isFinite(Number(params.thickness)) || !(Number(params.thickness)>0))return null;
  try {
   const areas=thinExtrudeAreas(sketch,params,{selectedIds,chainKeys});
   const used=new Set(areas.flatMap(area=>area.entityIds));
   if(selectedIds.some(id=>!used.has(id)))return null;
   return {kind:'thin',entityIds:[...used]};
  }catch{return null;}
 }
 const used=new Set();
 for(const feature of features) {
  if(feature.suppressed || !['extrude','extrudeCut'].includes(feature.type) || !feature.params?.thinFeature)continue;
  const p=feature.params;
  if(!Number.isFinite(Number(p.thickness)) || !(Number(p.thickness)>0))continue;
  if(p.sketchId!==sketch.id && !(feature.references?.sketches || []).some(ref=>(typeof ref==='string'?ref:ref?.id)===sketch.id))continue;
  const groups=[p.profileEntityIds,...(p.regionProfileEntityIds || [])];
  try {
   const valid=groups.map((ids,index)=>{
    if(!Array.isArray(ids) || !ids.length || ids.some(id=>!chainIds.has(id)))throw new Error('Invalid saved Thin path');
    const mode=(index ? p.thinRegionModes?.[index-1] || p.thinMode : p.thinMode) || 'mid-plane';
    if(!['mid-plane','forward','reverse'].includes(mode))throw new Error('Invalid saved Thin side');
    thinSketchProfile(sketch,ids,p.thickness,mode);
    return ids;
   });
   valid.flat().forEach(id=>used.add(id));
  }catch{/* A stale saved feature cannot turn a broken sketch green. */}
 }
 return entities.every(entity=>used.has(entity.id)) ? {kind:'thin',entityIds:[...used]} : {kind:'path',entityIds:[...chainIds]};
}
