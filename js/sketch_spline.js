// Cubic Bezier splines: four persistent control points, no fitted preview curve.
let serial=0;
const uid=()=>`spline_${Date.now().toString(36)}_${serial++}`;
export function splineControls(entity,points){
  if(entity?.type!=='spline'||entity.degree!==3)return null;
  const controls=[entity.a,entity.h1,entity.h2,entity.b].map(id=>points.get(id));
  return controls.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))?controls:null;
}
export function bezierPoint(p,t){
  const s=1-t;
  return {x:s*s*s*p[0].x+3*s*s*t*p[1].x+3*s*t*t*p[2].x+t*t*t*p[3].x,y:s*s*s*p[0].y+3*s*s*t*p[1].y+3*s*t*t*p[2].y+t*t*t*p[3].y};
}
export function splitBezier(p,t){
  const mix=(a,b)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const a=mix(p[0],p[1]),b=mix(p[1],p[2]),c=mix(p[2],p[3]),d=mix(a,b),e=mix(b,c),f=mix(d,e);
  return [[p[0],a,d,f],[f,e,c,p[3]]];
}
export function sampleBezier(p,tolerance=.005){
  const result=[{...p[0],t:0}];
  const visit=(q,lo,hi,depth)=>{
    const dx=q[3].x-q[0].x,dy=q[3].y-q[0].y,len=Math.hypot(dx,dy);
    const distance=r=>len?Math.abs(dx*(q[0].y-r.y)-(q[0].x-r.x)*dy)/len:Math.hypot(r.x-q[0].x,r.y-q[0].y);
    const polygon=q.slice(1).reduce((s,r,i)=>s+Math.hypot(r.x-q[i].x,r.y-q[i].y),0);
    if(depth>=18||(Math.max(distance(q[1]),distance(q[2]))<=tolerance&&polygon-len<=tolerance)){result.push({...q[3],t:hi});return;}
    const [a,b]=splitBezier(q,.5),mid=(lo+hi)/2;visit(a,lo,mid,depth+1);visit(b,mid,hi,depth+1);
  };
  visit(p,0,1,0);return result;
}
export function addCubicSpline(sketch,controls){
  if(!sketch||typeof sketch!=="object")throw new Error("Sketch is required");
  sketch.points ||= [];
  sketch.entities ||= [];
  if(controls.length!==4||!controls.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new Error('Spline requires four finite control points');
  if(Math.hypot(controls[1].x-controls[0].x,controls[1].y-controls[0].y)<1e-8||Math.hypot(controls[3].x-controls[2].x,controls[3].y-controls[2].y)<1e-8)throw new Error('Spline endpoint handles must have length');
  const points=controls.map(p=>({id:uid(),x:p.x,y:p.y}));
  const entity={id:uid(),name:'Cubic spline',type:'spline',degree:3,a:points[0].id,h1:points[1].id,h2:points[2].id,b:points[3].id};
  sketch.points.push(...points);sketch.entities.push(entity);return entity;
}
// Cubic polynomial roots on [0,1], isolated by derivative roots. Includes tangencies.
export function bezierLineHits(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;if(den<1e-16)return [];
  const v=p.map(q=>(q.x-a.x)*dy-(q.y-a.y)*dx),c=[v[0],3*(v[1]-v[0]),3*(v[2]-2*v[1]+v[0]),v[3]-3*v[2]+3*v[1]-v[0]];
  const f=t=>((c[3]*t+c[2])*t+c[1])*t+c[0],cuts=[0,1],A=3*c[3],B=2*c[2],C=c[1];
  if(Math.abs(A)<1e-14){if(Math.abs(B)>1e-14)cuts.push(-C/B);}else{const d=B*B-4*A*C;if(d>=0)cuts.push((-B-Math.sqrt(d))/(2*A),(-B+Math.sqrt(d))/(2*A));}
  const spans=cuts.filter(t=>t>=0&&t<=1).sort((a,b)=>a-b),roots=[];
  if(c.every(n=>Math.abs(n)<1e-12))return []; // Coincident curves have no unique trim point.
  for(const t of spans)if(Math.abs(f(t))<1e-10)roots.push(t);
  for(let i=1;i<spans.length;i++){let lo=spans[i-1],hi=spans[i];if(f(lo)*f(hi)>=0)continue;for(let j=0;j<55;j++){const mid=(lo+hi)/2;if(f(lo)*f(mid)<=0)hi=mid;else lo=mid;}roots.push((lo+hi)/2);}
  return roots.filter((t,i)=>roots.findIndex(r=>Math.abs(r-t)<1e-8)===i).map(t=>{const q=bezierPoint(p,t);return {...q,t,u:((q.x-a.x)*dx+(q.y-a.y)*dy)/den};});
}
// Isolate roots by the polynomial's stationary points, including tangencies.
function polynomialRoots(coefficients){
  const c=coefficients.slice();while(c.length>1&&Math.abs(c.at(-1))<1e-14)c.pop();
  if(c.length===1)return [];
  if(c.length===2){const t=-c[0]/c[1];return t>=0&&t<=1?[t]:[];}
  const f=t=>c.reduceRight((v,a)=>v*t+a,0),cuts=[0,...polynomialRoots(c.slice(1).map((v,i)=>v*(i+1))),1].sort((a,b)=>a-b),roots=[],eps=1e-10*Math.max(1,...c.map(Math.abs));
  for(const t of cuts)if(Math.abs(f(t))<=eps)roots.push(t);
  for(let i=1;i<cuts.length;i++){let lo=cuts[i-1],hi=cuts[i];if(f(lo)*f(hi)>=0)continue;for(let j=0;j<55;j++){const mid=(lo+hi)/2;if(f(lo)*f(mid)<=0)hi=mid;else lo=mid;}roots.push((lo+hi)/2);}
  return roots.filter((t,i)=>roots.findIndex(r=>Math.abs(r-t)<1e-7)===i);
}
export function bezierCircleHits(p,center,radius){
  const power=key=>[p[0][key]-center[key],3*(p[1][key]-p[0][key]),3*(p[2][key]-2*p[1][key]+p[0][key]),p[3][key]-3*p[2][key]+3*p[1][key]-p[0][key]];
  const c=Array(7).fill(0);for(const v of [power('x'),power('y')])for(let i=0;i<4;i++)for(let j=0;j<4;j++)c[i+j]+=v[i]*v[j];c[0]-=radius*radius;
  return polynomialRoots(c).map(t=>({...bezierPoint(p,t),t}));
}
export function trimSplineAtLines(sketch,entity,pick){
  if(!sketch?.points||!sketch?.entities||!pick||!Number.isFinite(pick.x)||!Number.isFinite(pick.y))return false;
  const points=new Map(sketch.points.map(p=>[p.id,p])),p=splineControls(entity,points);if(!p)return false;
  const hits=sketch.entities.filter(e=>e!==entity&&!e.construction).flatMap(e=>{
    const a=points.get(e.a),b=points.get(e.b);
    if(e.type==='line')return a&&b?bezierLineHits(p,a,b).filter(h=>h.u>=-1e-8&&h.u<=1+1e-8):[];
    if(e.type!=='circle'&&e.type!=='arc')return [];
    const center=points.get(e.c??e.center);if(!center)return [];
    const radius=e.type==='circle'?e.r:a?Math.hypot(a.x-center.x,a.y-center.y):0;
    return bezierCircleHits(p,center,radius).filter(h=>{if(e.type==='circle')return true;if(!a||!b)return false;const tau=2*Math.PI,angle=q=>Math.atan2(q.y-center.y,q.x-center.x),span=(angle(b)-angle(a)+tau)%tau||tau;return (angle(h)-angle(a)+tau)%tau<=span+1e-8;});
  }).filter(h=>h.t>1e-8&&h.t<1-1e-8).map(h=>h.t).sort((a,b)=>a-b);
  if(!hits.length)return false;
  const samples=sampleBezier(p,.001),nearest=samples.reduce((best,q)=>Math.hypot(q.x-pick.x,q.y-pick.y)<Math.hypot(best.x-pick.x,best.y-pick.y)?q:best);
  const lo=hits.filter(t=>t<=nearest.t).at(-1)??0,hi=hits.find(t=>t>nearest.t)??1;
  const pieces=[];if(lo>0)pieces.push(splitBezier(p,lo)[0]);if(hi<1)pieces.push(splitBezier(p,hi)[1]);
  const handleOk=controls=>Math.hypot(controls[1].x-controls[0].x,controls[1].y-controls[0].y)>=1e-8&&Math.hypot(controls[3].x-controls[2].x,controls[3].y-controls[2].y)>=1e-8;
  if(pieces.some(piece=>!handleOk(piece)))return false;
  const index=sketch.entities.indexOf(entity);if(index<0)return false;
  const savedEntities=sketch.entities.slice(),savedPoints=sketch.points.slice();
  sketch.entities.splice(index,1);
  try{pieces.forEach((piece,i)=>{const e=addCubicSpline(sketch,piece);Object.assign(e,{construction:entity.construction,name:entity.name});if(piece[0]===p[0])e.a=entity.a;if(piece[3]===p[3])e.b=entity.b;if(i===0)e.id=entity.id;});}
  catch(error){sketch.entities.splice(0,sketch.entities.length,...savedEntities);sketch.points.splice(0,sketch.points.length,...savedPoints);return false;}
  return true;
}
