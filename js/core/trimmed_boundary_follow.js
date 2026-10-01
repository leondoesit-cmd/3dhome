// Follow analytic source curves while retaining user trim intersections and IDs.
const dist=(a,b)=>Math.hypot(a.u-b.u,a.v-b.v);
const xy=p=>({u:p.x,v:p.y});
const direction=s=>{const d={u:s.to.u-s.from.u,v:s.to.v-s.from.v},n=Math.hypot(d.u,d.v);return {u:d.u/n,v:d.v/n};};
function supportScore(old,next){
 if(old.type!==next.type)return Infinity;
 if(old.type==='arc')return dist(old.center,next.center)+Math.abs(old.radius-next.radius);
 const a=direction(old),b=direction(next);
 if(!Number.isFinite(a.u)||Math.abs(a.u*b.v-a.v*b.u)>1e-5)return Infinity;
 const mid={u:(old.from.u+old.to.u)/2,v:(old.from.v+old.to.v)/2};
 return Math.abs((mid.u-next.from.u)*b.v-(mid.v-next.from.v)*b.u)
   +.01*Math.min(dist(old.from,next.from)+dist(old.to,next.to),dist(old.from,next.to)+dist(old.to,next.from));
}
function intersections(a,b){
 const shared=[a.from,a.to].filter(p=>[b.from,b.to].some(q=>dist(p,q)<1e-9));
 if(shared.length)return shared;
 if(a.type==='arc'&&b.type==='line')return intersections(b,a);
 if(a.type==='line'&&b.type==='line'){
  const d=direction(a),e=direction(b),cross=d.u*e.v-d.v*e.u;
  if(Math.abs(cross)<1e-8)return [];
  const t=((b.from.u-a.from.u)*e.v-(b.from.v-a.from.v)*e.u)/cross;
  return [{u:a.from.u+t*d.u,v:a.from.v+t*d.v}];
 }
 if(a.type==='line'&&b.type==='arc'){
  const d=direction(a),o={u:a.from.u-b.center.u,v:a.from.v-b.center.v},t=-(o.u*d.u+o.v*d.v);
  let delta=t*t-(o.u*o.u+o.v*o.v-b.radius*b.radius);
  // A native tangent junction is one root. Floating-point cancellation must
  // not turn it into two indistinguishable roots and an ambiguity error.
  const roundoff=16*Number.EPSILON*Math.max(1,t*t,o.u*o.u+o.v*o.v,b.radius*b.radius);
  if(Math.abs(delta)<=roundoff)delta=0;
  if(delta < -1e-8)return [];
  return [...new Set([t-Math.sqrt(Math.max(0,delta)),t+Math.sqrt(Math.max(0,delta))])].map(k=>({u:a.from.u+k*d.u,v:a.from.v+k*d.v}));
 }
 // Adjacent native curves already carry their exact shared endpoints.
 return [a.from,a.to].filter(p=>[b.from,b.to].some(q=>dist(p,q)<1e-6));
}
export function followTrimmedBoundary(sketch,copy,segments){
 const ids=new Set(copy.entityIds),entities=sketch.entities.filter(e=>ids.has(e.id));
 if(!entities.length||entities.length===copy.entityIds.length)return null;
 if(entities.some(e=>!['line','arc'].includes(e.type)||e.projectedCurve))throw new Error('Trimmed linked boundary contains an unsupported curve');
 const points=new Map(sketch.points.map(p=>[p.id,p]));
 const curve=e=>{const from=xy(points.get(e.a)),to=xy(points.get(e.b));return e.type==='line'?{type:'line',from,to}:{type:'arc',from,to,center:xy(points.get(e.c)),radius:dist(from,xy(points.get(e.c)))};};
 const matched=new Map(),used=new Set();
 // Match long/unique supports before short corner arcs. Never resolve a tie.
 const ranked=entities.map(e=>({e,old:curve(e)})).sort((a,b)=>a.e.type===b.e.type?dist(b.old.from,b.old.to)-dist(a.old.from,a.old.to):a.e.type==='arc'?-1:1);
 for(const {e,old} of ranked){
  const candidates=segments.map((s,i)=>({s,i,score:used.has(i)?Infinity:supportScore(old,s)})).filter(c=>Number.isFinite(c.score)).sort((a,b)=>a.score-b.score);
  if(!candidates.length||candidates.length>1&&Math.abs(candidates[0].score-candidates[1].score)<1e-6)throw new Error('Trimmed linked boundary source curve is ambiguous; reselect its source');
  const chosen=candidates[0];matched.set(e.id,chosen.s);used.add(chosen.i);
 }
 const updated=structuredClone(sketch),out=new Map(updated.points.map(p=>[p.id,p])),changed=new Map();
 const put=(id,q)=>{if(changed.has(id)&&dist(changed.get(id),q)>1e-5)throw new Error('Trimmed linked boundary junction no longer meets');changed.set(id,q);out.get(id).x=q.u;out.get(id).y=q.v;};
 for(const e of entities){
  const s=matched.get(e.id),old=curve(e);
  if(e.c)put(e.c,s.center);
  for(const id of [e.a,e.b]){
   if(changed.has(id))continue;
   const before=xy(points.get(id)),neighbors=sketch.entities.filter(n=>n.id!==e.id&&(n.a===id||n.b===id));
   let candidates=[];
   if(neighbors.length){
    const neighbor=neighbors[0],other=matched.get(neighbor.id)||curve(neighbor);
    candidates=intersections(s,other);
   }else candidates=[s.from,s.to];
   candidates.sort((a,b)=>dist(before,a)-dist(before,b));
   if(!candidates.length||candidates.length>1&&Math.abs(dist(before,candidates[0])-dist(before,candidates[1]))<1e-7)throw new Error('Trimmed linked boundary intersection is missing or ambiguous at point '+id+' on entity '+e.id);
   put(id,candidates[0]);
  }
 }
 // Fixed trim anchors retain their chosen support line, with the intersection
 // updated by the source curve rather than dragged off that curve by the solver.
 for(const c of updated.constraints||[])if(c.type==='fixed'&&changed.has(c.point)){const p=out.get(c.point);c.x=p.x;c.y=p.y;}
 return updated;
}
