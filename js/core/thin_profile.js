import {sketchProfileSegments,segmentProfilePoints} from './profile_curves.js';

// Preserve analytic circular walls and flat end caps for a thin open curve.
export function thinSketchProfile(sketch, entityIds, thickness, mode='mid-plane') {
  const width=Number(thickness);
  if(!(width>0))throw new Error('Thin feature thickness must be positive');
  const entities=(entityIds || []).map(id=>sketch.entities.find(e=>e.id===id));
  if(!entities.length || entities.some(entity=>!entity||entity.construction||entity.projectedCurve||!['line','arc'].includes(entity.type)))throw new Error('Select connected open lines or an arc for the thin revolve');
  const segments=sketchProfileSegments(sketch,entityIds,1e-6,{open:true});
  const source=segments?.[0];
  if(!source)throw new Error('Thin feature curve is missing');
  const a=mode==='mid-plane'?-width/2:mode==='reverse'?-width:0,b=a+width;
  const line=(from,to)=>({type:'line',from,to});
  let loop;
  if(segments.length>1){
    if(segments.some(segment=>segment.type!=='line'))throw new Error('Mixed line and arc thin profiles are not supported yet');
    const offsetChain=d=>{
      const shifted=segments.map(segment=>{
        const dx=segment.to.u-segment.from.u,dy=segment.to.v-segment.from.v,length=Math.hypot(dx,dy);
        if(length<1e-8)throw new Error('Thin feature curve has no length');
        const shift=p=>({u:p.u-d*dy/length,v:p.v+d*dx/length});
        return {from:shift(segment.from),to:shift(segment.to)};
      });
      const points=[shifted[0].from];
      for(let i=1;i<shifted.length;i++){
        const left=shifted[i-1],right=shifted[i];
        const x=left.to.u-left.from.u,y=left.to.v-left.from.v;
        const u=right.to.u-right.from.u,v=right.to.v-right.from.v,det=x*v-y*u;
        if(Math.abs(det)<1e-10){
          if(x*u+y*v<=0)throw new Error('Thin profile doubles back at a corner');
          points.push(left.to);continue;
        }
        const t=((right.from.u-left.from.u)*v-(right.from.v-left.from.v)*u)/det;
        const point={u:left.from.u+t*x,v:left.from.v+t*y};
        if(Math.hypot(point.u-segments[i].from.u,point.v-segments[i].from.v)>width*100)throw new Error('Thin profile corner is too sharp for this thickness');
        points.push(point);
      }
      points.push(shifted.at(-1).to);return points;
    };
    const points=offsetChain(a).concat(offsetChain(b).reverse());
    loop=points.map((point,index)=>line(point,points[(index+1)%points.length]));
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
