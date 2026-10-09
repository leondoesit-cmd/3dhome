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
