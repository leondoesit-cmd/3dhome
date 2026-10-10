import { triangulatePolygon, polygonArea } from './part_tessellate.js';

const cross = (a,b,c) => (b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u);
const lerp = (a,b,t) => ({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t,...(Number.isFinite(a.w)&&Number.isFinite(b.w)?{w:a.w+(b.w-a.w)*t}:{})});

export function canCropView(view, document, {exploded=false}={}) {
  return !!view && !view.detail && !view.brokenOut && !view.breakView && !exploded && !view.exploded
    && !(document.views || []).some(child=>child.detail && (child.detail.from===view.id || child.parent===view.id));
}

export function cropSplinePoints(sketch) {
  const points=sketch?.points;
  if(sketch?.type!=='closed-spline' || !Array.isArray(points) || points.length<3 || points.length>64
    || points.some(p=>!Number.isFinite(p.u)||!Number.isFinite(p.v))) throw new Error('Crop needs 3–64 finite closed-spline points');
  for(let i=0;i<points.length;i++) if(Math.hypot(points[i].u-points[(i+1)%points.length].u,points[i].v-points[(i+1)%points.length].v)<1e-7) throw new Error('Crop boundary has repeated adjacent points');
  const result=[];
  // Periodic Catmull–Rom: saved control points drive the closed boundary, no external renderer.
  for(let i=0;i<points.length;i++) {
    const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length],d=points[(i+2)%points.length];
    for(let j=0;j<12;j++) {
      const t=j/12,t2=t*t,t3=t2*t;
      const coordinate=key=>.5*(2*b[key]+(-a[key]+c[key])*t+(2*a[key]-5*b[key]+4*c[key]-d[key])*t2+(-a[key]+3*b[key]-3*c[key]+d[key])*t3);
      result.push({u:coordinate('u'),v:coordinate('v')});
    }
  }
  if(Math.abs(polygonArea(result))<1e-8) throw new Error('Crop boundary has no enclosed area');
  for(let i=0;i<result.length;i++) for(let j=i+2;j<result.length;j++) {
    if(i===0&&j===result.length-1) continue;
    const a=result[i],b=result[(i+1)%result.length],c=result[j],d=result[(j+1)%result.length];
    if(cross(a,b,c)*cross(a,b,d)<-1e-14 && cross(c,d,a)*cross(c,d,b)<-1e-14) throw new Error('Crop boundary crosses itself');
  }
  return result;
}

export function pointInCrop(point, boundary) {
  let inside=false;
  for(let i=0,j=boundary.length-1;i<boundary.length;j=i++) {
    const a=boundary[j],b=boundary[i];
    if(Math.abs(cross(a,b,point))<1e-8 && point.u>=Math.min(a.u,b.u)-1e-8 && point.u<=Math.max(a.u,b.u)+1e-8 && point.v>=Math.min(a.v,b.v)-1e-8 && point.v<=Math.max(a.v,b.v)+1e-8) return true;
    if((a.v>point.v)!==(b.v>point.v) && point.u<(b.u-a.u)*(point.v-a.v)/(b.v-a.v)+a.u) inside=!inside;
  }
  return inside;
}

function clipEdge(edge,boundary,outside=false) {
  const {a,b}=edge, du=b.u-a.u,dv=b.v-a.v, ts=[0,1];
  for(let i=0;i<boundary.length;i++) {
    const c=boundary[i],d=boundary[(i+1)%boundary.length],eu=d.u-c.u,ev=d.v-c.v,den=du*ev-dv*eu;
    if(Math.abs(den)<1e-12) continue;
    const t=((c.u-a.u)*ev-(c.v-a.v)*eu)/den,s=((c.u-a.u)*dv-(c.v-a.v)*du)/den;
    if(t>0&&t<1&&s>=-1e-9&&s<=1+1e-9) ts.push(t);
  }
  ts.sort((a,b)=>a-b);
  const out=[];
  for(let i=1;i<ts.length;i++) if(ts[i]-ts[i-1]>1e-10 && pointInCrop(lerp(a,b,(ts[i]+ts[i-1])/2),boundary)!==outside) out.push({...edge,a:lerp(a,b,ts[i-1]),b:lerp(a,b,ts[i])});
  return out;
}

export const clipCropEdges = (edges,boundary) => edges.flatMap(edge=>clipEdge(edge,boundary));

function clipSurface(points,triangle) {
  let polygon=points;
  for(let i=0;i<3;i++) {
    const a=triangle[i],b=triangle[(i+1)%3],out=[];
    for(let j=0;j<polygon.length;j++) {
      const p=polygon[j],q=polygon[(j+1)%polygon.length],sp=cross(a,b,p),sq=cross(a,b,q);
      if(sp>=-1e-9) out.push(p);
      if((sp>=0)!==(sq>=0)) out.push(lerp(p,q,sp/(sp-sq)));
    }
    polygon=out;
  }
  return polygon;
}

export function cropDrawingProjection(projection,sketch,{outside=false}={}) {
  if(!projection) return null;
  const boundary=cropSplinePoints(sketch), clip=edges=>(edges || []).flatMap(edge=>clipEdge(edge,boundary,outside));
  const visible=clip(projection.visible),hidden=clip(projection.hidden),circles=[];
  for(const circle of projection.circles || []) {
    // Projected edge-on rims and unabsorbed fits are metadata for centres/axes,
    // not drawable circles. Masking must never invent round ink from them.
    if(circle.kind!=='round' || !['visible','hidden'].includes(circle.drawn)) {
      if(pointInCrop(circle,boundary)!==outside)circles.push(circle);
      continue;
    }
    const ring=Array.from({length:256},(_,i)=>({u:circle.u+circle.radius*Math.cos(i*Math.PI/128),v:circle.v+circle.radius*Math.sin(i*Math.PI/128)}));
    const pieces=ring.flatMap((a,i)=>clipEdge({a,b:ring[(i+1)%ring.length]},boundary,outside));
    if(pieces.length===256 && pieces.every((edge,i)=>Math.hypot(edge.a.u-ring[i].u,edge.a.v-ring[i].v)<1e-8 && Math.hypot(edge.b.u-ring[(i+1)%256].u,edge.b.v-ring[(i+1)%256].v)<1e-8)) circles.push(circle);
    else (circle.drawn==='hidden'?hidden:visible).push(...pieces);
  }
  const triangles=triangulatePolygon(boundary),surfaces=[];
  for(const surface of outside ? [] : projection.surfaces || []) for(const triangle of triangles) {
    const points=clipSurface(surface.points,triangle);
    if(points.length>=3 && Math.abs(polygonArea(points))>1e-10) surfaces.push({...surface,points});
  }
  return {...projection,visible,hidden,cuts:clip(projection.cuts),circles,surfaces,
    bounds:outside ? projection.bounds : {u0:Math.min(...boundary.map(p=>p.u)),u1:Math.max(...boundary.map(p=>p.u)),v0:Math.min(...boundary.map(p=>p.v)),v1:Math.max(...boundary.map(p=>p.v))},cropBoundary:boundary,cropSourceCuts:projection.cuts};
}
