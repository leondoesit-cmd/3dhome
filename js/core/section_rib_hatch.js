import {sectionBodies} from './hidden_line.js';
import {analyzeSectionBoundaries} from './section_boundaries.js';

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
export function sectionRibMasks(bodies,plane,basis) {
  const groups=[],issues=[];
  for(const body of bodies || []) {
    if(body.sectionRibIssue)issues.push(body.sectionRibIssue);
    for(const rib of body.sectionRibs || []) {
      const n=rib.normal,den=n&&Math.hypot(n.x,n.y,n.z)*Math.hypot(plane.normal.x,plane.normal.y,plane.normal.z);
      if(!den || Math.abs(dot(n,plane.normal))/den<1-1e-6)continue; // transverse sections hatch normally
      const cuts=sectionBodies([{positions:rib.positions}],plane).cuts.map(edge=>({a:{u:dot(edge.a,basis.right),v:dot(edge.a,basis.up)},b:{u:dot(edge.b,basis.right),v:dot(edge.b,basis.up)}}));
      if(!cuts.length)continue;
      const boundary=analyzeSectionBoundaries(cuts,1e-5);
      if(!boundary.ok){issues.push('Rib hatch boundary is unavailable: '+rib.featureId);continue;}
      groups.push({featureId:rib.featureId,loops:boundary.loops});
    }
  }
  return {groups,issues};
}

function inside(p,loops) {
  let hit=false;
  for(const loop of loops)for(let i=0,j=loop.length-1;i<loop.length;j=i++) {
    const a=loop[i],b=loop[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }
  return hit;
}

// Subtract the union of feature regions, each with its own even/odd holes.
// Never toggle the material loops themselves: masks may overlap or touch them.
export function excludeRibHatch(segment,groups) {
  if(!groups?.length)return [segment];
  const a={x:segment.x1,y:segment.y1},dx=segment.x2-a.x,dy=segment.y2-a.y,ts=[0,1];
  for(const loops of groups)for(const loop of loops)for(let i=0;i<loop.length;i++) {
    const p=loop[i],q=loop[(i+1)%loop.length],ex=q.x-p.x,ey=q.y-p.y,den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-12)continue;
    const px=p.x-a.x,py=p.y-a.y,t=(px*ey-py*ex)/den,u=(px*dy-py*dx)/den;
    if(t>0&&t<1&&u>=-1e-9&&u<=1+1e-9)ts.push(t);
  }
  ts.sort((x,y)=>x-y);const out=[];
  for(let i=1;i<ts.length;i++) {
    const lo=ts[i-1],hi=ts[i];if(hi-lo<1e-10)continue;
    const mid=(lo+hi)/2;
    if(groups.some(loops=>inside({x:a.x+dx*mid,y:a.y+dy*mid},loops)))continue;
    out.push({...segment,x1:a.x+dx*lo,y1:a.y+dy*lo,x2:a.x+dx*hi,y2:a.y+dy*hi});
  }
  return out;
}
