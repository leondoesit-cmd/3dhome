// A Break changes drawing presentation only. All returned geometry stays in
// original model centimetres; the piecewise map is applied at paper placement.
import {viewAxes} from './hidden_line.js';

export function canBreakView(view, doc={views:[]}) {
  return !!view && ['front','back','left','right','top','bottom'].includes(view.dir)
    && !view.section && !view.detail && !view.cropSketch && !view.brokenOut
    && !view.auxiliary && !view.exploded && !['shaded','shadedEdges'].includes(view.displayStyle);
}

function projectedAxis(view,worldAxis) {
  const axes=viewAxes(view.dir);
  if(axes.horizontal.axis===worldAxis)return {axis:'u',sign:axes.horizontal.sign};
  if(axes.vertical.axis===worldAxis)return {axis:'v',sign:axes.vertical.sign};
  return null; // Looking along the shortened axis: no shortening in this view.
}

// One Front principal cluster; independent derived views never inherit a Break.
// Return a complete, validated plan before the controller mutates any document.
export function alignedBreakPlan(doc,selected,modifier,projections,k,scale) {
  const principal=doc.views.find(v=>v.primary)||doc.views[0];
  if(doc.views.length===1) {
    breakProjection(projections.get(selected.id),modifier,k);
    return new Map([[selected.id,modifier]]);
  }
  if(principal?.dir!=='front' || !canBreakView(principal))throw new Error('Aligned Break needs a Front principal view');
  if(selected.id!==principal.id && !selected.breakView?.group)throw new Error('Start an aligned Break on the principal Front view');
  const a=viewAxes(selected.dir),direction=modifier.axis==='u'?a.horizontal:a.vertical;
  if(!['x','y'].includes(direction.axis))throw new Error('This principal cluster supports width or height Breaks');
  const worldFrom=direction.sign>0?modifier.from:-modifier.to,worldTo=direction.sign>0?modifier.to:-modifier.from;
  const candidates=doc.views.filter(v=>['front','back','left','right','top','bottom'].includes(v.dir));
  for(const v of candidates) {
    if(!canBreakView(v) || v.configurationId!==selected.configurationId)throw new Error('Aligned principal views need the same configuration and ordinary edge projections');
    if(v.scale && v.scale!==scale)throw new Error('Aligned Break needs the same view scale in the principal cluster');
  }
  const affected=candidates.filter(v=>projectedAxis(v,direction.axis));
  let lo=Infinity,hi=-Infinity;
  for(const v of affected) {
    const axis=projectedAxis(v,direction.axis),p=projections.get(v.id),b=p?.sourceBounds||p?.bounds;
    if(!b)throw new Error('An aligned view has no source projection');
    lo=Math.min(lo,axis.sign>0?b[axis.axis+'0']:-b[axis.axis+'1']);
    hi=Math.max(hi,axis.sign>0?b[axis.axis+'1']:-b[axis.axis+'0']);
  }
  const group={id:principal.id,worldAxis:direction.axis,from:worldFrom,to:worldTo,lo,hi,scale,members:affected.map(v=>v.id)};
  const plan=new Map();
  for(const v of affected) {
    const axis=projectedAxis(v,direction.axis),m={...modifier,axis:axis.axis,from:axis.sign>0?worldFrom:-worldTo,to:axis.sign>0?worldTo:-worldFrom,groupSign:axis.sign,group};
    const p=projections.get(v.id);
    breakProjection({...p,bounds:p.sourceBounds||p.bounds},m,k);
    plan.set(v.id,m);
  }
  return plan;
}

export function validateAlignedBreak(view,doc) {
  const g=view.breakView?.group;if(!g)return;
  if(!['x','y'].includes(g.worldAxis)||![g.from,g.to,g.lo,g.hi].every(Number.isFinite)
    ||!(g.lo<g.from&&g.from<g.to&&g.to<g.hi)||!Array.isArray(g.members)||!g.members.includes(view.id))throw new Error('Invalid aligned Break metadata');
  const principal=doc.views.find(v=>v.primary)||doc.views[0];
  if(principal?.id!==g.id || principal.dir!=='front')throw new Error('Aligned Break principal changed; reapply the Break');
  const candidates=doc.views.filter(v=>['front','back','left','right','top','bottom'].includes(v.dir));
  if(candidates.some(v=>!canBreakView(v)||v.configurationId!==view.configurationId||(v.scale && v.scale!==g.scale)))throw new Error('Aligned principal cluster changed; reapply the Break');
  const expected=candidates.filter(v=>projectedAxis(v,g.worldAxis));
  if(expected.length!==g.members.length)throw new Error('Aligned Break cluster changed; reapply the Break');
  for(const v of expected) {
    const m=v.breakView,a=projectedAxis(v,g.worldAxis);
    if(!canBreakView(v)||v.configurationId!==view.configurationId||v.scale!==g.scale||!g.members.includes(v.id)
      ||JSON.stringify(m?.group)!==JSON.stringify(g)||m.groupSign!==a.sign||m.axis!==a.axis||m.from!==(a.sign>0?g.from:-g.to)||m.to!==(a.sign>0?g.to:-g.from)
      ||m.gapMm!==view.breakView.gapMm||m.style!==view.breakView.style)throw new Error('Aligned Break members differ; reapply the Break');
  }
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
  const inverse=p=>{
    if(!p || !Number.isFinite(p[axis]) || (p[axis]>m.from+epsilon && p[axis]<m.from+gap-epsilon))return null;
    const s=p[axis];
    return {...p,[axis]:Math.abs(s-(m.from+gap))<=epsilon?m.to:Math.abs(s-m.from)<=epsilon?m.from:s+(s>=m.from+gap?reduction:0)};
  };
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
  let breakCentre=null;
  if(modifier.group) {
    const g=modifier.group,sign=modifier.groupSign;
    if(![1,-1].includes(sign))throw new Error('Invalid aligned Break direction');
    const midpoint=(g.lo+g.hi)/2;
    breakCentre={axis:map.axis,value:sign*midpoint-map.reduction/2};
  }
  return {...projection,visible,hidden,cuts:clipBreakEdges(projection.cuts,map),circles,surfaces:[],breakCentre,
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
