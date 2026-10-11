import {sketchProfileSegments,segmentProfilePoints} from './profile_curves.js';
import {sketchWorldPoint} from './swept_sources.js';

// A revolve's "outward" side is away from its axis, regardless of which end
// of an open chain the user drew first. The generic offset below is oriented
// by chain order, so resolve the side once for both preview and regeneration.
export function revolveThinProfile(sketch, entityIds, thickness, mode='mid-plane', axis='y') {
  if(mode==='mid-plane')return thinSketchProfile(sketch,entityIds,thickness,mode);
  const chain=sketchProfileSegments(sketch,entityIds,1e-6,{open:true});
  const first=chain?.[0];
  if(!first || !['line','arc'].includes(first.type))return thinSketchProfile(sketch,entityIds,thickness,mode);
  const radial=q=>{const p=sketchWorldPoint(sketch,q.u,q.v);return axis==='x'?Math.hypot(p.y,p.z):axis==='z'?Math.hypot(p.x,p.y):Math.hypot(p.x,p.z);};
  const width=Number(thickness);
  let plus,minus;
  if(first.type==='arc'){
    // Arc offsets change its radius. Which change points away from the revolve
    // axis depends on where the circle centre lies; it is not encoded by the
    // order in which the arc endpoints were drawn.
    const du=first.mid.u-first.center.u,dv=first.mid.v-first.center.v;
    const length=Math.hypot(du,dv);
    if(length<1e-8)throw new Error('Thin feature curve has no length');
    const step=Math.min(width/2,length/2);
    plus=radial({u:first.mid.u+step*du/length,v:first.mid.v+step*dv/length});
    minus=radial({u:first.mid.u-step*du/length,v:first.mid.v-step*dv/length});
  }else{
    const dx=first.to.u-first.from.u,dy=first.to.v-first.from.v,length=Math.hypot(dx,dy);
    if(length<1e-8)throw new Error('Thin feature curve has no length');
    const center={u:(first.from.u+first.to.u)/2,v:(first.from.v+first.to.v)/2};
    plus=radial({u:center.u-width*dy/length,v:center.v+width*dx/length});
    minus=radial({u:center.u+width*dy/length,v:center.v-width*dx/length});
  }
  let outward=plus>=minus?'forward':'reverse';
  // A chain offset decreases the radius of an anticlockwise arc when d is positive.
  // A lone arc does the opposite, so only multi-segment chains need the flip.
  if(chain.length>1 && first.type==='arc' && arcTraversal(first)>0)outward=outward==='forward'?'reverse':'forward';
  return thinSketchProfile(sketch,entityIds,thickness,mode==='forward'?outward:outward==='forward'?'reverse':'forward');
}

function arcTraversal(segment) {
  const angle=p=>Math.atan2(p.v-segment.center.v,p.u-segment.center.u),tau=2*Math.PI;
  const start=angle(segment.from),end=(angle(segment.to)-start+tau)%tau;
  const middle=(angle(segment.mid)-start+tau)%tau;
  return middle<=end+1e-9?1:-1;
}

function offsetSegment(segment,d) {
  if(segment.type==='arc'){
    const radius=segment.radius-arcTraversal(segment)*d;
    if(radius<=1e-7)throw new Error('Thin feature thickness collapses the inner arc');
    const shift=p=>({u:segment.center.u+(p.u-segment.center.u)*radius/segment.radius,v:segment.center.v+(p.v-segment.center.v)*radius/segment.radius});
    return {...segment,radius,from:shift(segment.from),mid:shift(segment.mid),to:shift(segment.to)};
  }
  const dx=segment.to.u-segment.from.u,dy=segment.to.v-segment.from.v,length=Math.hypot(dx,dy);
  if(length<1e-8)throw new Error('Thin feature curve has no length');
  const shift=p=>({u:p.u-d*dy/length,v:p.v+d*dx/length});
  return {...segment,from:shift(segment.from),to:shift(segment.to)};
}

function offsetIntersections(left,right) {
  if(left.type==='line' && right.type==='line'){
    const x=left.to.u-left.from.u,y=left.to.v-left.from.v,u=right.to.u-right.from.u,v=right.to.v-right.from.v,det=x*v-y*u;
    if(Math.abs(det)<1e-10){
      if(x*u+y*v<=0)throw new Error('Thin profile doubles back at a corner');
      return [left.to];
    }
    const t=((right.from.u-left.from.u)*v-(right.from.v-left.from.v)*u)/det;
    return [{u:left.from.u+t*x,v:left.from.v+t*y}];
  }
  if(left.type==='line' || right.type==='line'){
    const line=left.type==='line'?left:right,arc=left.type==='arc'?left:right;
    const dx=line.to.u-line.from.u,dy=line.to.v-line.from.v,x=line.from.u-arc.center.u,y=line.from.v-arc.center.v;
    const a=dx*dx+dy*dy,b=2*(x*dx+y*dy),c=x*x+y*y-arc.radius*arc.radius,disc=b*b-4*a*c;
    if(disc < -1e-9*Math.max(1,a*a))return [];
    return [(-b-Math.sqrt(Math.max(0,disc)))/(2*a),(-b+Math.sqrt(Math.max(0,disc)))/(2*a)].map(t=>({u:line.from.u+t*dx,v:line.from.v+t*dy}));
  }
  const dx=right.center.u-left.center.u,dy=right.center.v-left.center.v,d=Math.hypot(dx,dy);
  if(d<1e-9)return Math.abs(left.radius-right.radius)<1e-8?[left.to]:[];
  const along=(left.radius*left.radius-right.radius*right.radius+d*d)/(2*d),height2=left.radius*left.radius-along*along;
  if(height2 < -1e-9*Math.max(1,left.radius*left.radius))return [];
  const h=Math.sqrt(Math.max(0,height2)),u=left.center.u+along*dx/d,v=left.center.v+along*dy/d;
  return [{u:u-h*dy/d,v:v+h*dx/d},{u:u+h*dy/d,v:v-h*dx/d}];
}

function offsetOpenChain(segments,d,width) {
  const shifted=segments.map(segment=>offsetSegment(segment,d));
  for(let i=1;i<shifted.length;i++){
    const left=shifted[i-1],right=shifted[i],corner=segments[i].from;
    const candidates=offsetIntersections(left,right).sort((p,q)=>Math.hypot(p.u-corner.u,p.v-corner.v)-Math.hypot(q.u-corner.u,q.v-corner.v));
    const point=candidates[0];
    if(!point || Math.hypot(point.u-corner.u,point.v-corner.v)>width*100)throw new Error('Thin profile corner cannot be joined at this thickness');
    left.to=point;right.from=point;
  }
  shifted.forEach((segment,index)=>{
    if(segment.type!=='arc')return;
    const start=Math.atan2(segment.from.v-segment.center.v,segment.from.u-segment.center.u);
    const end=Math.atan2(segment.to.v-segment.center.v,segment.to.u-segment.center.u),direction=arcTraversal(segments[index]);
    const span=(direction*(end-start)+2*Math.PI)%(2*Math.PI);
    if(span<1e-8)throw new Error('Thin profile arc is consumed at this thickness');
    const middle=start+direction*span/2;
    segment.mid={u:segment.center.u+segment.radius*Math.cos(middle),v:segment.center.v+segment.radius*Math.sin(middle)};
  });
  return shifted;
}

// Preserve analytic circular walls and flat end caps for a thin open curve.
export function thinSketchProfile(sketch, entityIds, thickness, mode='mid-plane') {
  const width=Number(thickness);
  if(!(width>0))throw new Error('Thin feature thickness must be positive');
  const entities=(entityIds || []).map(id=>sketch.entities.find(e=>e.id===id));
  if(!entities.length || entities.some(entity=>!entity||entity.construction||entity.projectedCurve||!['line','arc'].includes(entity.type)))throw new Error('Select connected open lines or an arc for the thin feature');
  const segments=sketchProfileSegments(sketch,entityIds,1e-6,{open:true});
  const source=segments?.[0];
  if(!source)throw new Error('Thin feature curve is missing');
  const a=mode==='mid-plane'?-width/2:mode==='reverse'?-width:0,b=a+width;
  const line=(from,to)=>({type:'line',from,to});
  let loop;
  if(segments.length>1){
    const first=offsetOpenChain(segments,a,width),second=offsetOpenChain(segments,b,width);
    const reverse=second.slice().reverse().map(segment=>({...segment,from:segment.to,to:segment.from}));
    loop=first.concat(line(first.at(-1).to,second.at(-1).to),reverse,line(second[0].from,first[0].from));
  }else if(source.type==='line'){
    const dx=source.to.u-source.from.u,dy=source.to.v-source.from.v,length=Math.hypot(dx,dy);
    if(length<1e-8)throw new Error('Thin feature curve has no length');
    const shift=(p,d)=>({u:p.u-d*dy/length,v:p.v+d*dx/length});
    const p=shift(source.from,a),q=shift(source.to,a),r=shift(source.to,b),s=shift(source.from,b);
    loop=[line(p,q),line(q,r),line(r,s),line(s,p)];
  }else{
    if(source.radius+a<=1e-7)throw new Error('Thin feature thickness collapses the inner arc');
    const arc=d=>{const radius=source.radius+d,shift=p=>({u:source.center.u+(p.u-source.center.u)*radius/source.radius,v:source.center.v+(p.v-source.center.v)*radius/source.radius});return {...source,radius,from:shift(source.from),mid:shift(source.mid),to:shift(source.to)};};
    const inner=arc(a),outer=arc(b);
    loop=[inner,line(inner.to,outer.to),{...outer,from:outer.to,to:outer.from},line(outer.from,inner.from)];
  }
  return {segments:loop,points:segmentProfilePoints(loop)};
}
