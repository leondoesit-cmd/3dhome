// A Break changes drawing presentation only. All returned geometry stays in
// original model centimetres; the piecewise map is applied at paper placement.
export function canBreakView(view, doc={views:[]}) {
  return !!view && ['front','back','left','right','top','bottom'].includes(view.dir)
    && !view.section && !view.detail && !view.cropSketch && !view.brokenOut
    && !view.exploded && !['shaded','shadedEdges'].includes(view.displayStyle)
    && (doc.views || []).length===1;
}

export function breakMapping(modifier,bounds,k) {
  const m=modifier;
  if(m?.version!==1 || !['u','v'].includes(m.axis) || !['zigzag','wave'].includes(m.style)
    || ![m.from,m.to,m.gapMm,k].every(Number.isFinite) || !(k>0) || !(m.gapMm>0)
    || !(m.to>m.from) || !bounds) throw new Error('Break needs a finite interval, positive paper gap and supported style');
  const lo=bounds[m.axis+'0'],hi=bounds[m.axis+'1'],gap=m.gapMm/k;
  if(!(lo<m.from && m.to<hi) || !(gap<m.to-m.from)) throw new Error('Break must retain both ends and shorten the view at this scale');
  const reduction=m.to-m.from-gap,axis=m.axis;
  const epsilon=1e-10*Math.max(1,Math.abs(lo),Math.abs(hi));
  const retained=p=>!!p && Number.isFinite(p[axis]) && (p[axis]<=m.from+epsilon || p[axis]>=m.to-epsilon);
  const forward=p=>retained(p)?{...p,[axis]:p[axis]-(p[axis]>=m.to-epsilon?reduction:0)}:null;
  const inverse=p=>!p || (p[axis]>m.from && p[axis]<m.from+gap)?null:{...p,[axis]:p[axis]+(p[axis]>=m.from+gap?reduction:0)};
  return {axis,from:m.from,to:m.to,gap,reduction,retained,forward,inverse,
    bounds:{...bounds,[axis+'1']:hi-reduction}};
}

export function clipBreakEdges(edges,map) {
  const out=[];
  for(const edge of edges || []) {
    const {a,b}=edge,delta=b[map.axis]-a[map.axis],ts=[0,1];
    if(delta) for(const boundary of [map.from,map.to]) {
      const t=(boundary-a[map.axis])/delta;if(t>0&&t<1)ts.push(t);
    }
    ts.sort((a,b)=>a-b);
    const at=t=>({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});
    for(let i=1;i<ts.length;i++) {
      const t0=ts[i-1],t1=ts[i];
      if(t1-t0>1e-12 && map.retained(at((t0+t1)/2))) out.push({...edge,a:at(t0),b:at(t1),breakClipped:t0!==0||t1!==1});
    }
  }
  return out;
}

export function breakProjection(projection,modifier,k) {
  const map=breakMapping(modifier,projection.bounds,k),circles=[];
  const visible=clipBreakEdges(projection.visible,map),hidden=clipBreakEdges(projection.hidden,map);
  for(const circle of projection.circles || []) {
    const c=circle[map.axis],r=circle.radius;
    if(c+r<=map.from || c-r>=map.to) {circles.push(circle);continue;}
    if(c-r>map.from && c+r<map.to)continue;
    const ring=Array.from({length:256},(_,i)=>({u:circle.u+r*Math.cos(i*Math.PI/128),v:circle.v+r*Math.sin(i*Math.PI/128)}));
    const pieces=clipBreakEdges(ring.map((a,i)=>({a,b:ring[(i+1)%ring.length]})),map);
    if(circle.drawn==='hidden')hidden.push(...pieces);
    else if(circle.drawn==='visible')visible.push(...pieces);
  }
  return {...projection,visible,hidden,cuts:clipBreakEdges(projection.cuts,map),circles,surfaces:[],
    sourceBounds:projection.bounds,displayBounds:map.bounds,breakMap:map,breakModifier:modifier};
}

// Break boundaries are paper graphics, never model topology or snaps.
export function breakBoundaryItems(place) {
  const map=place.projection?.breakMap;if(!map)return [];
  const axis=map.axis,other=axis==='u'?'v':'u',bounds=place.projection.sourceBounds;
  const amplitude=Math.min(.8,place.projection.breakModifier.gapMm/5)/place.k;
  const low=bounds[other+'0']-1.5/place.k,high=bounds[other+'1']+1.5/place.k;
  const count=Math.max(8,Math.ceil((high-low)*place.k/2)),items=[];
  for(const boundary of [map.from,map.to]) {
    // Map the seam first; oscillations may go into the blank paper gap.
    const base=place.toSheet({[axis]:boundary,[other]:low});
    let previous=null;
    for(let i=0;i<=count;i++) {
      const t=i/count,offset=place.projection.breakModifier.style==='wave'?Math.sin(t*Math.PI*count/2):i===0||i===count?0:i%2?1:-1;
      const p=axis==='u'?{x:base.x+offset*amplitude*place.k,y:base.y-(high-low)*t*place.k}
        :{x:base.x+(high-low)*t*place.k,y:base.y-offset*amplitude*place.k};
      if(previous)items.push({type:'line',x1:previous.x,y1:previous.y,x2:p.x,y2:p.y,style:'outline',viewId:place.id,breakBoundary:true});
      previous=p;
    }
  }
  return items;
}
