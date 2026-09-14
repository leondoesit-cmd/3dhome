import {splineControls,bezierCircleHits} from "./sketch_spline.js";
import {circleData,pruneOrphanPoints} from './sketch_solver.js';
const TAU=2*Math.PI,EPS=1e-7;
const positive=a=>(a%TAU+TAU)%TAU;
let serial=0;
const uid=()=>`trim_round_${Date.now().toString(36)}_${serial++}`;
export function pointOnArc(hit,arc){
  if(arc.entity.type!=='arc')return true;
  const span=positive(arc.end-arc.start)||TAU;
  return positive(Math.atan2(hit.y-arc.center.y,hit.x-arc.center.x)-arc.start)<=span+EPS;
}
function circleIntersections(a,b){
  const dx=b.center.x-a.center.x,dy=b.center.y-a.center.y,d=Math.hypot(dx,dy);
  if(d<EPS||d>a.radius+b.radius+EPS||d<Math.abs(a.radius-b.radius)-EPS)return [];
  const along=(a.radius*a.radius-b.radius*b.radius+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.radius*a.radius-along*along));
  const x=a.center.x+along*dx/d,y=a.center.y+along*dy/d;
  return [{x:x-h*dy/d,y:y+h*dx/d},{x:x+h*dy/d,y:y-h*dx/d}];
}
export function editRoundEntity(sketch,entity,pick,extend,lineCircle){
  if(extend&&entity.type==='circle')return false; // A closed circle has no end to extend.
  const points=new Map((sketch.points||[]).map(p=>[p.id,p])),round=circleData(entity,points);
  if(!round||round.radius<EPS)return false;
  const start=round.start||0,span=entity.type==='circle'?TAU:positive(round.end-round.start)||TAU,hits=[];
  for(const other of sketch.entities||[]){
    if(other===entity||other.construction)continue;
    let candidates=[];
    if(other.type==='line'){const a=points.get(other.a),b=points.get(other.b);if(a&&b)candidates=lineCircle({a,b},round,true);}
    else if(other.type==="spline"){const c=splineControls(other,points);if(c)candidates=bezierCircleHits(c,round.center,round.radius);}
    else {const boundary=circleData(other,points);if(boundary)candidates=circleIntersections(round,boundary).filter(hit=>pointOnArc(hit,boundary));}
    for(const hit of candidates){const t=positive(Math.atan2(hit.y-round.center.y,hit.x-round.center.x)-start);if(!hits.some(h=>Math.abs(h-t)<EPS))hits.push(t);}
  }
  hits.sort((a,b)=>a-b);
  const picked=positive(Math.atan2(pick.y-round.center.y,pick.x-round.center.x)-start);
  /* A cut lands where another entity meets the curve — usually a line END
     (HOUSING Sketchsquare side lines). Reuse that point, as SOLIDWORKS trims to
     a coincident endpoint; a fresh point on top of it left the profile
     branched and two extra degrees of freedom sliding along the arc. */
  const centreId=entity.c??entity.center,snapTol=1e-5*Math.max(1,round.radius);
  const pointAt=t=>{
    const x=round.center.x+round.radius*Math.cos(start+t),y=round.center.y+round.radius*Math.sin(start+t);
    const existing=(sketch.points||[]).find(p=>p.id!==centreId&&Math.hypot(p.x-x,p.y-y)<=snapTol);
    return existing?{id:existing.id,reused:true}:{id:uid(),x,y};
  };
  const setArc=(target,a,b)=>{const pa=pointAt(a),pb=pointAt(b);[pa,pb].forEach(p=>{if(!p.reused&&!sketch.points.some(q=>q.id===p.id))sketch.points.push({id:p.id,x:p.x,y:p.y});});target.type='arc';target.a=round.a&&Math.abs(a)<EPS?round.a.id:pa.id;target.b=round.b&&Math.abs(b-span)<EPS?round.b.id:pb.id;target.c=centreId;delete target.r;};
  // an arc endpoint is on the arc by definition; an explicit relation to the same curve is redundant
  const dropImplicitOnCurve=target=>{sketch.constraints=(sketch.constraints||[]).filter(c=>!(c.type==='pointOnCircle'&&c.entity===target.id&&(c.point===target.a||c.point===target.b)));};
  if(extend){
    const outside=hits.filter(t=>t>span+EPS&&t<TAU-EPS);if(!outside.length)return false;
    const nearStart=Math.hypot(pick.x-round.a.x,pick.y-round.a.y)<=Math.hypot(pick.x-round.b.x,pick.y-round.b.y);
    const t=nearStart?outside.at(-1)-TAU:outside[0];
    setArc(entity,nearStart?t:0,nearStart?span:t);
  }else if(entity.type==='circle'){
    if(hits.length<2)return false;
    let left=hits.filter(t=>t<=picked).at(-1)??hits.at(-1)-TAU;
    let right=hits.find(t=>t>picked)??hits[0]+TAU;
    setArc(entity,right,left+TAU);
  }else{
    const interior=hits.filter(t=>t>EPS&&t<span-EPS);
    if(!interior.length){sketch.entities=sketch.entities.filter(e=>e!==entity);}
    else{
      const left=interior.filter(t=>t<=picked).at(-1)??0,right=interior.find(t=>t>picked)??span;
      if(left>EPS&&right<span-EPS){const copy={...entity,id:uid()};setArc(entity,0,left);setArc(copy,right,span);sketch.entities.push(copy);}
      else if(left>EPS)setArc(entity,0,left);else setArc(entity,right,span);
    }
  }
  sketch.constraints=(sketch.constraints||[]).filter(c=>!(c.entity===entity.id&&['distance','angle'].includes(c.type)));
  (sketch.entities||[]).filter(e=>e.type==='arc'&&(e===entity||e.c===centreId)).forEach(dropImplicitOnCurve);
  /* A kept piece that starts and ends on the same point is a zero-length sliver
     between two cuts that resolved to one point (both top lines of HOUSING's
     Sketchsquare leave the circle at the quadrant). It branched the profile. */
  sketch.entities=(sketch.entities||[]).filter(e=>!(e.type==='arc'&&(e===entity||String(e.id).startsWith('trim_round_'))&&e.a!=null&&e.a===e.b));
  pruneOrphanPoints(sketch);return true;
}
