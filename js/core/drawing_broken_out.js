import {isOrthoView,viewBasis,sectionBodies,projectSolid} from './hidden_line.js';
import {cropSplinePoints,cropDrawingProjection} from './drawing_crop.js';
import {analyzeSectionBoundaries} from './section_boundaries.js';
import {triangulatePolygon,polygonArea} from './part_tessellate.js';
import {pointInCrop} from './drawing_crop.js';

export function canBreakOutView(view,{exploded=false}={}) {
  return !!view && isOrthoView(view.dir) && !view.section && !view.detail && !view.cropSketch && !view.breakView
    && !exploded && !view.exploded && !['shaded','shadedEdges'].includes(view.displayStyle);
}

export function brokenOutDepthRange(bodies,dir) {
  const forward=viewBasis(dir).forward;
  let front=-Infinity,back=Infinity;
  for(const body of bodies || []) for(let i=0;i<(body.positions?.length || 0);i+=3) {
    const w=body.positions[i]*forward.x+body.positions[i+1]*forward.y+body.positions[i+2]*forward.z;
    if(!Number.isFinite(w)) throw new Error('Broken-out source mesh has nonfinite coordinates');
    front=Math.max(front,w);back=Math.min(back,w);
  }
  if(!Number.isFinite(front)||!(front>back)) throw new Error('Broken-out needs a nonempty solid depth');
  return {front,back,extent:front-back};
}

export function projectBrokenOutView(bodies,view,options={}) {
  if(!canBreakOutView(view)) throw new Error('Broken-out supports an ordinary orthographic edge view');
  const modifier=view.brokenOut;
  if(modifier?.datum!=='front-envelope') throw new Error('Broken-out needs a front-envelope depth datum');
  cropSplinePoints(modifier.sketch);
  const {front,extent}=brokenOutDepthRange(bodies,view.dir),depth=Number(modifier.depth);
  if(!Number.isFinite(depth)||!(depth>0&&depth<extent)) throw new Error('Broken-out depth must be positive and smaller than source depth');
  const normal=viewBasis(view.dir).forward,offset=front-depth;
  const clipped=sectionBodies(bodies,{normal,origin:{x:normal.x*offset,y:normal.y*offset,z:normal.z*offset}});
  // A retained solid includes its cut face: without this cap HLR sees through
  // the material left at the requested depth and falsely reveals deeper holes.
  const basis=viewBasis(view.dir),dot=(p,v)=>p.x*v.x+p.y*v.y+p.z*v.z;
  const projectedCuts=clipped.cuts.map(edge=>({a:{u:dot(edge.a,basis.right),v:dot(edge.a,basis.up)},b:{u:dot(edge.b,basis.right),v:dot(edge.b,basis.up)}}));
  const boundaries=analyzeSectionBoundaries(projectedCuts,Math.max(1e-7,extent*1e-5));
  if(!boundaries.ok) throw new Error('Broken-out cut face has an invalid boundary');
  const loops=boundaries.loops,areas=loops.map(loop=>Math.abs(polygonArea(loop)));
  const parents=loops.map((loop,i)=>{
    let parent=-1;
    for(let j=0;j<loops.length;j++)if(areas[j]>areas[i]&&pointInCrop(loop[0],loops[j])&&(parent<0||areas[j]<areas[parent]))parent=j;
    return parent;
  });
  const level=i=>parents[i]<0?0:1+level(parents[i]),cap=[];
  for(let i=0;i<loops.length;i++)if(level(i)%2===0) {
    const holes=loops.filter((_,j)=>parents[j]===i);
    for(const triangle of triangulatePolygon(loops[i],holes))for(const p of triangle)cap.push(
      basis.right.x*p.u+basis.up.x*p.v+normal.x*offset,
      basis.right.y*p.u+basis.up.y*p.v+normal.y*offset,
      basis.right.z*p.u+basis.up.z*p.v+normal.z*offset);
  }
  const original=projectSolid(bodies,view.dir,{...options,shaded:false});
  const cut=projectSolid(clipped.bodies.concat(cap.length?[{positions:cap,sectioned:true}]:[]),view.dir,{...options,shaded:false,cuts:clipped.cuts});
  const outside=cropDrawingProjection(original,modifier.sketch,{outside:true});
  const inside=cropDrawingProjection(cut,modifier.sketch);
  return {...original,visible:outside.visible.concat(inside.visible),hidden:outside.hidden.concat(inside.hidden),
    circles:outside.circles.concat(inside.circles),cuts:inside.cuts,surfaces:[],
    cropSourceCuts:cut.cuts,sectionClipBoundary:inside.cropBoundary,brokenOutBoundary:inside.cropBoundary,
    brokenOutPlane:{front,depth,offset,datum:'front-envelope'}};
}
