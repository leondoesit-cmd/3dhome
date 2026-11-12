import {isOrthoView,viewBasis,sectionBodies} from './hidden_line.js';
import {analyzeSectionBoundaries} from './section_boundaries.js';

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export function canAlignedSectionParent(view) {
  return !!view && isOrthoView(view.dir)&&!['section','alignedSection','detail','auxiliary','cropSketch','brokenOut','breakView','alternatePosition','exploded'].some(key=>view[key])&&!['shaded','shadedEdges'].includes(view.displayStyle);
}

export function alignedSectionFrame(view,doc) {
  const m=view.alignedSection,parent=doc.views.find(v=>v.id===m?.from);
  if(m?.version!==1||!canAlignedSectionParent(parent)||view.id===parent.id||view.configurationId!==parent.configurationId
    ||['section','detail','auxiliary','cropSketch','brokenOut','breakView','alternatePosition','exploded'].some(key=>view[key])||['shaded','shadedEdges'].includes(view.displayStyle)
    ||!Array.isArray(m.points)||m.points.length!==3||m.points.some(p=>![p?.u,p?.v].every(Number.isFinite)))throw new Error('Aligned Section needs three finite points on an unmodified principal parent of the same configuration');
  const [a,h,b]=m.points,unit=p=>{const du=p.u-h.u,dv=p.v-h.v,length=Math.hypot(du,dv);if(length<1e-6)throw new Error('Aligned Section legs must have distinct endpoints and hinge');return {u:du/length,v:dv/length};};
  const first=unit(a),second=unit(b);
  if(Math.abs(first.u*second.v-first.v*second.u)<1e-6)throw new Error('Aligned Section needs two noncollinear cutting legs');
  const basis=viewBasis(parent.dir),world=p=>({x:basis.right.x*p.u+basis.up.x*p.v,y:basis.right.y*p.u+basis.up.y*p.v,z:basis.right.z*p.u+basis.up.z*p.v});
  return {hinge:world(h),rays:[world(first),world(second)],depth:basis.forward,parent,
    basis:{right:basis.forward,up:world(second),forward:cross(basis.forward,world(second))}};
}

function positiveHalf(loop,epsilon) {
  const source=loop.slice();if(source.length>1&&Math.hypot(source[0].u-source.at(-1).u,source[0].v-source.at(-1).v)<epsilon)source.pop();
  const out=[];
  for(let i=0;i<source.length;i++) {
    const a=source[i],b=source[(i+1)%source.length],insideA=a.v>=-epsilon,insideB=b.v>=-epsilon;
    if(insideA)out.push({u:a.u,v:Math.max(0,a.v)});
    if(insideA!==insideB){const t=-a.v/(b.v-a.v);out.push({u:a.u+(b.u-a.u)*t,v:0});}
  }
  const clean=out.filter((p,i)=>!i||Math.hypot(p.u-out[i-1].u,p.v-out[i-1].v)>epsilon);
  const area=clean.reduce((sum,p,i)=>{const q=clean[(i+1)%clean.length];return sum+p.u*q.v-q.u*p.v;},0)/2;
  return clean.length>=3&&Math.abs(area)>epsilon*epsilon?clean:null;
}

// Two radial half-plane cut faces, genuinely unfolded about their common
// depth-parallel hinge. This finite release draws cut faces, not unseen solids.
export function projectAlignedSection(bodies,view,doc) {
  const frame=alignedSectionFrame(view,doc),regions=[],visible=[];
  if(!Array.isArray(bodies)||!bodies.length||bodies.some(b=>!b?.positions?.length||b.positions.length%9!==0||Array.from(b.positions).some(n=>!Number.isFinite(n))))throw new Error('Aligned Section needs finite triangle source geometry');
  let span=1;
  for(const b of bodies||[])for(const value of b.positions||[])if(Number.isFinite(value))span=Math.max(span,Math.abs(value));
  const epsilon=span*1e-8;
  for(let leg=0;leg<2;leg++) {
    const ray=frame.rays[leg],normal=cross(frame.depth,ray);
    const cut=sectionBodies(bodies,{normal,origin:frame.hinge});
    const project=p=>({u:dot(p,frame.depth),v:dot({x:p.x-frame.hinge.x,y:p.y-frame.hinge.y,z:p.z-frame.hinge.z},ray)});
    const edgesByBody=new Map();
    const pointKey=p=>Math.round(p.u/epsilon)+','+Math.round(p.v/epsilon);
    for(const edge of cut.cuts) {
      const bodyIndex=edge.bodyIndex??0, a=project(edge.a), b=project(edge.b);
      if(!edgesByBody.has(bodyIndex))edgesByBody.set(bodyIndex,new Map());
      const edges=edgesByBody.get(bodyIndex), key=[pointKey(a),pointKey(b)].sort().join('|');
      if(!edges.has(key))edges.set(key,{a,b});
    }
    const legStart=regions.length;
    for(const [bodyIndex,edges] of edgesByBody) {
      const boundary=analyzeSectionBoundaries(edges.values(),epsilon);
      if(!boundary.ok||!boundary.loops.length)throw new Error('Aligned Section leg '+(leg+1)+' has no unambiguous closed material section');
      const loops=boundary.loops.map(loop=>positiveHalf(loop,epsilon)).filter(Boolean).map(loop=>loop.map(p=>({u:p.u,v:(leg===0?-1:1)*p.v})));
      if(!loops.length)continue;
      regions.push({leg,bodyIndex,loops});
      for(const loop of loops)for(let i=0;i<loop.length;i++) {
        const a=loop[i],b=loop[(i+1)%loop.length];
        // These hinge closures exist only to delimit hatch regions; unfolding
        // does not invent a visible seam inside continuous source material.
        if(Math.abs(a.v)<=epsilon&&Math.abs(b.v)<=epsilon)continue;
        visible.push({a,b});
      }
    }
    if(regions.length===legStart)throw new Error('Aligned Section leg '+(leg+1)+' does not intersect material beyond the hinge');
  }
  const points=regions.flatMap(r=>r.loops.flat()),bounds={u0:Infinity,u1:-Infinity,v0:Infinity,v1:-Infinity};
  for(const p of points){bounds.u0=Math.min(bounds.u0,p.u);bounds.u1=Math.max(bounds.u1,p.u);bounds.v0=Math.min(bounds.v0,p.v);bounds.v1=Math.max(bounds.v1,p.v);}
  return {visible,hidden:[],circles:[],cuts:[],surfaces:[],bounds,basis:frame.basis,sectionRegions:regions,nonlinearProjection:true,alignedSectionFrame:frame};
}

export function alignedSectionMarkerItems(view,placements) {
  const parent=placements.find(p=>p.id===view.alignedSection?.from);if(!parent)return [];
  const points=view.alignedSection.points.map(parent.toSheet),items=[],tag=view.alignedSection.tag||'A';
  for(let i=1;i<points.length;i++)items.push({type:'line',x1:points[i-1].x,y1:points[i-1].y,x2:points[i].x,y2:points[i].y,style:'cutline',viewId:parent.id,alignedSectionMarker:true});
  for(const index of [0,2]) {
    // The first radial half is rotated onto the negative side of the second;
    // the corresponding pre-unfold sight direction is therefore reversed.
    const end=points[index],hinge=points[1],dx=end.x-hinge.x,dy=end.y-hinge.y,len=Math.hypot(dx,dy),sign=index===0?-1:1,nx=-dy/len*sign,ny=dx/len*sign;
    items.push({type:'poly',closed:true,pts:[end,{x:end.x-nx*3+dx/len,y:end.y-ny*3+dy/len},{x:end.x-nx*3-dx/len,y:end.y-ny*3-dy/len}],fill:'#101418',viewId:parent.id,alignedSectionMarker:true});
    items.push({type:'text',x:end.x+nx*5,y:end.y+ny*5,text:tag,size:3,anchor:'middle',viewId:parent.id,alignedSectionMarker:true});
  }
  return items;
}
