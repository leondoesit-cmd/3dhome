import {modelEdgeSketchLine,projectWorldToSketch} from '../sketch_intersection.js';
import {sketchWorldPoint} from './swept_sources.js';

// The projected model edge supplies a line IN the sketch plane. Intersecting
// that line with the trimmed native face is the intersection of the face's
// true plane section and the edge projection, including offset planes.
export function nativeSectionTarget(sketch, edge, face, intersect, branch='lower') {
  const line=modelEdgeSketchLine(sketch,edge);
  if(!line)throw new Error('Select a straight or edge-on circular model edge');
  const origin=sketchWorldPoint(sketch,line.a.x,line.a.y),end=sketchWorldPoint(sketch,line.b.x,line.b.y);
  const direction={x:end.x-origin.x,y:end.y-origin.y,z:end.z-origin.z};
  const hits=intersect(face,origin,direction).map(point=>projectWorldToSketch(sketch,point))
    .filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&Math.abs(point.w)<1e-5);
  if(!hits.length)throw new Error('The selected surface section does not meet this edge on the sketch plane');
  hits.sort((a,b)=>a.y-b.y || a.x-b.x);
  const target=branch==='upper'?hits[hits.length-1]:hits[0];
  return {x:target.x,y:target.y};
}

export function bindNativeSectionTargets(sketch,resolveEdge,intersect) {
  for(const constraint of sketch.constraints || []) {
    if(constraint.suppressed || constraint.type!=='intersection' || !constraint.sectionFace)continue;
    const edge=resolveEdge(constraint.edgeA);
    if(!edge)throw new Error('The section intersection model edge is unavailable');
    Object.assign(constraint,nativeSectionTarget(sketch,edge,constraint.sectionFace,intersect,constraint.sectionBranch));
  }
  return sketch;
}
