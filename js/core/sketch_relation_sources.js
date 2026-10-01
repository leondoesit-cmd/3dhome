import {bindIntersectionTargets,bindModelEdgeTargets,bindPierceTargets} from '../sketch_intersection.js';
import {solveSketch} from '../sketch_solver.js';
import {sketchWorldPoint} from './swept_sources.js';
import {bindNativeSectionTargets} from './native_section_relation.js';

export function relationSourceSketchIds(feature,sketchId) {
  const ids=new Set(sketchId?[sketchId]:[]);
  if(feature.params?.sketchSources) {
    for(const id of feature.references?.sketches || [])ids.add(id);
    const visit=value=>{
      if(Array.isArray(value)){value.forEach(visit);return;}
      if(value && typeof value==='object'){
        if(value.sketchId)ids.add(value.sketchId);
        Object.values(value).forEach(visit);
      }
    };
    visit(feature.params.sketchSources);
  }
  return [...ids];
}

export function resolveSketchRelationSources(document,ids,resolveEdge,intersectSection) {
  const updates=[];
  for(const id of ids) {
    const index=document.sketches.findIndex(sketch=>sketch.id===id),sketch=document.sketches[index];
    if(!sketch?.constraints?.some(c=>(c.type==='intersection'&&c.edgeA)||c.type==='onModelEdge'||c.type==='pierce'))continue;
    const updated=structuredClone(sketch);
    bindIntersectionTargets(updated,resolveEdge);
    if(updated.constraints.some(c=>c.sectionFace&&!c.suppressed)) {
      if(!intersectSection)throw new Error('Native surface section resolver is unavailable');
      bindNativeSectionTargets(updated,resolveEdge,intersectSection);
    }
    bindModelEdgeTargets(updated,resolveEdge);
    bindPierceTargets(updated,document.sketches,sketchWorldPoint);
    if(!solveSketch(updated).converged)throw new Error('A relation to model edges or another sketch could not follow its source');
    document.sketches[index]=updated;
    updates.push(updated);
  }
  return updates;
}
