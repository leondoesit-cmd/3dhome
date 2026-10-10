import {linearPatternOffsets} from './pattern_geometry.js';
import {worldFrame} from '../cad_mate_model.js';

const find=(asm,id)=>(asm.components || []).find(c=>String(c.id)===String(id));
const childId=(id,indices)=>`component-pattern:${id}:${indices.join(',')}`;

export function componentPatternPlan(assembly, pattern) {
  const seed=find(assembly,pattern.seedId),carrier=find(assembly,pattern.carrierId);
  if (!pattern.id || !seed || !carrier || String(seed.id)===String(carrier.id) || seed.componentPattern || carrier.componentPattern || seed.asm || carrier.asm || seed.suppressed || carrier.suppressed)
    throw new Error('Component Pattern needs existing unsuppressed top-level part seed and carrier');
  if(!seed.def?.parts?.length || !carrier.def?.parts?.length)throw new Error('Pattern seed and carrier need current part geometry');
  if([seed,carrier].some(c=>['x','y','z','rx','ry','rz'].some(key=>c.transform?.[key]!=null && !Number.isFinite(Number(c.transform[key])))))throw new Error('Pattern source poses must be finite');
  const feature=(carrier.def?.features || []).find(f=>String(f.id)===String(pattern.featureId));
  const params=feature?.params;
  if (!feature || feature.suppressed || feature.type!=='pattern' || params?.mode!=='linear' || params.scope!=='feature')
    throw new Error('Source must be an active feature-scope Linear Pattern');
  const hole=(carrier.def.features || []).find(f=>String(f.id)===String(params.seedFeatureId));
  if (!hole || hole.suppressed || !(hole.type==='hole' || hole.type==='extrudeCut' || hole.type==='extrude' && hole.params?.operation==='subtract'))
    throw new Error('Source Linear Pattern must repeat a hole or extruded cut');
  const offsets=linearPatternOffsets(params);
  if (!offsets.length || offsets.some(p=>![p.x,p.y,p.z].every(Number.isFinite) || Math.hypot(p.x,p.y,p.z)<1e-8))
    throw new Error('Source pattern has no finite distinct nonzero offsets');
  if(offsets.some((a,index)=>offsets.slice(index+1).some(b=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-8)))throw new Error('Source pattern contains coincident instances');
  const origin=worldFrame({origin:{x:0,y:0,z:0}},carrier,'component').origin;
  return offsets.map(offset=>{
    const point=worldFrame({origin:offset},carrier,'component').origin;
    return {id:childId(pattern.id,offset.indices),offset:{x:point.x-origin.x,y:point.y-origin.y,z:point.z-origin.z},seed,indices:offset.indices};
  });
}

function references(mate,ids) {
  return ['a','b','c'].some(key=>ids.has(String(typeof mate[key]==='object'?mate[key]?.componentId:mate[key])));
}

/** Replay real occurrences from current source definition and solved poses. */
export function replayComponentPatterns(assembly) {
  if (!assembly?.componentPatterns?.length && !(assembly?.components || []).some(c=>c.componentPattern))return [];
  const old=assembly.components || [],oldById=new Map(old.map(c=>[String(c.id),c]));
  const issues=[],generated=[],claimed=new Set();
  for (const pattern of assembly.componentPatterns || []) {
    try {
      if (claimed.has(String(pattern.id)))throw new Error('Duplicate Component Pattern ID');
      claimed.add(String(pattern.id));
      if (pattern.suppressed)continue;
      const plan=componentPatternPlan(assembly,pattern);
      const ids=new Set(plan.map(p=>p.id));
      if ((assembly.mates || []).concat(assembly.topologyMates || []).some(m=>!m.suppressed && references(m,ids)))
        throw new Error('Generated pattern occurrences cannot have independent mates; mate the seed instead');
      const pending=[];
      for (const item of plan) {
        const previous=oldById.get(item.id);
        if(previous && !previous.componentPattern)throw new Error('Component Pattern occurrence ID collision');
        const presentation=previous?.explodedOffset ? {...previous.explodedOffset} : null;
        // Share the current configured definition; do not retain a stale saved clone.
        const component=Object.assign(previous || {},{...item.seed,id:item.id,name:(item.seed.name || 'Component')+' ['+item.indices.join(',')+']',grounded:true,
          componentPattern:{patternId:pattern.id,seedId:item.seed.id,indices:item.indices},
          transform:{...item.seed.transform,x:(Number(item.seed.transform?.x)||0)+item.offset.x,y:(Number(item.seed.transform?.y)||0)+item.offset.y,z:(Number(item.seed.transform?.z)||0)+item.offset.z}});
        if(presentation)component.explodedOffset=presentation;else delete component.explodedOffset;
        delete component.explode;delete component.explodeOffset;delete component.explodedTransform;
        pending.push(component);
      }
      generated.push(...pending);
    } catch(error) { issues.push({code:'component-pattern-invalid',patternId:pattern.id,message:error.message}); }
  }
  assembly.components=old.filter(c=>!c.componentPattern).concat(generated);
  return issues;
}

export function setComponentPattern(assembly,pattern) {
  componentPatternPlan(assembly,pattern);
  const patterns=assembly.componentPatterns ||= [];
  const index=patterns.findIndex(p=>String(p.id)===String(pattern.id));
  if(index<0)patterns.push({...pattern});else patterns[index]={...pattern};
  return replayComponentPatterns(assembly);
}

export function removeComponentPattern(assembly,id) {
  assembly.componentPatterns=(assembly.componentPatterns || []).filter(p=>String(p.id)!==String(id));
  return replayComponentPatterns(assembly);
}
