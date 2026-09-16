/* Turn an exact sketch selection into the same request Smart Dimension builds
   from canvas picks. This keeps the geometry tree, keyboard selection and the
   canvas as equal front ends to one constraint operation. */
export function dimensionTargetFromSelection(sketch,selection){
 const chosen=(selection || []).filter(Boolean);
 const isPoint=value=>value.type===undefined && Number.isFinite(value.x) && Number.isFinite(value.y);
 const entities=chosen.filter(value=>!isPoint(value));
 const points=chosen.filter(isPoint);

 if(chosen.length===1 && ['line','circle','arc'].includes(chosen[0].type)){
  return {type:chosen[0].type,id:chosen[0].id};
 }
 if(chosen.length===2 && points.length===2){
  return {type:'points',a:points[0].id,b:points[1].id};
 }
 if(chosen.length===2 && points.length===1 && entities.length===1 && entities[0].type==='line'){
  const line=entities[0],point=points[0];
  if(line.a===point.id || line.b===point.id)return null;
  return {type:'pointLine',point:point.id,line:line.id};
 }
 if(chosen.length===2 && entities.length===2 && entities.every(entity=>entity.type==='line')){
  const byId=new Map((sketch?.points || []).map(point=>[point.id,point]));
  const vector=line=>{const a=byId.get(line.a),b=byId.get(line.b);return a&&b?{x:b.x-a.x,y:b.y-a.y}:null;};
  const a=vector(entities[0]),b=vector(entities[1]);
  if(!a || !b)return null;
  const lengths=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);
  const parallel=lengths>1e-12 && Math.abs((a.x*b.y-a.y*b.x)/lengths)<1e-3;
  return {type:parallel?'lines':'angle',a:entities[0].id,b:entities[1].id};
 }
 return null;
}
