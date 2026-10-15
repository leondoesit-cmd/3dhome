import {isOrthoView,viewBasis,sectionBodies,projectSolid} from './hidden_line.js';
import {cropSplinePoints,cropDrawingProjection} from './drawing_crop.js';
import {analyzeSectionBoundaries} from './section_boundaries.js';
import {triangulatePolygon,polygonArea} from './part_tessellate.js';
import {pointInCrop} from './drawing_crop.js';

export function canBreakOutView(view,{exploded=false}={}) {
  return !!view && isOrthoView(view.dir) && !view.section && !view.alignedSection && !view.detail && !view.cropSketch && !view.breakView && !view.alternatePosition
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

// Clip the visible break line to the union of projected mesh triangles. A
// bounding box would still draw through empty gaps, notches and through holes.
export function clipBreakBoundaryToBodies(boundary,bodies,dir) {
  const basis=viewBasis(dir),project=(p,i)=>({u:p[i]*basis.right.x+p[i+1]*basis.right.y+p[i+2]*basis.right.z,v:p[i]*basis.up.x+p[i+1]*basis.up.y+p[i+2]*basis.up.z});
  const cross=(a,b,c)=>(b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u),triangles=[];
  for(const body of bodies)for(let i=0;i<(body.positions?.length || 0);i+=9) {
    const tri=[project(body.positions,i),project(body.positions,i+3),project(body.positions,i+6)],area=cross(...tri);
    if(Math.abs(area)>1e-12)triangles.push({points:tri,sign:Math.sign(area)});
  }
  const result=[];
  for(let i=0;i<boundary.length;i++) {
    const a=boundary[i],b=boundary[(i+1)%boundary.length],intervals=[];
    for(const tri of triangles) {
      let lo=0,hi=1;
      for(let j=0;j<3 && hi>lo;j++) {
        const c=tri.points[j],d=tri.points[(j+1)%3],fa=cross(c,d,a)*tri.sign,fb=cross(c,d,b)*tri.sign;
        if(fa<0 && fb<0){hi=-1;break;}
        if(fa<0)lo=Math.max(lo,fa/(fa-fb));
        if(fb<0)hi=Math.min(hi,fa/(fa-fb));
      }
      if(hi-lo>1e-10)intervals.push([lo,hi]);
    }
    intervals.sort((x,y)=>x[0]-y[0]);const merged=[];
    for(const interval of intervals){const last=merged.at(-1);if(last && interval[0]<=last[1]+1e-9)last[1]=Math.max(last[1],interval[1]);else merged.push(interval.slice());}
    const point=t=>({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});
    for(const [lo,hi]of merged)result.push({a:point(lo),b:point(hi)});
  }
  return result;
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
    brokenOutBoundarySegments:clipBreakBoundaryToBodies(inside.cropBoundary,bodies,view.dir),
    brokenOutPlane:{front,depth,offset,datum:'front-envelope'}};
}
