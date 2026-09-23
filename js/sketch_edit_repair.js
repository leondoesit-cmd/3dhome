import {solveSketch} from './sketch_solver.js';
// Retain removed relationships as document data, outside the active solver.
export function recordSketchEdit(sketch,operation,entityId,edit){
  const before=structuredClone(sketch),ok=edit();if(!ok)return false;
  const live=new Map(sketch.constraints.map(c=>[c.id,JSON.stringify(c)]));
  const implicitEndpoint=c=>{
    if(c.type!=="pointOnCircle")return false;
    const arc=sketch.entities.find(e=>e.id===c.entity&&e.type==="arc");
    return arc&&(arc.a===c.point||arc.b===c.point);
  };
  const removed=before.constraints.filter(c=>(!live.has(c.id)||live.get(c.id)!==JSON.stringify(c))&&!implicitEndpoint(c));
  if(removed.length){
    sketch.repairs=sketch.repairs||[];
    for(const constraint of removed)sketch.repairs.push({id:`repair_${constraint.id}_${sketch.repairs.length}`,operation,entityId,constraint,points:before.points,entities:before.entities,status:'pending'});
  }
  sketch.lastEdit={operation,entityId,repairCount:removed.length};return true;
}
export function repairReferences(sketch,repair){
  const live=new Set([...sketch.points,...sketch.entities].map(p=>p.id)),refs=new Set();
  for(const k of ['entity','a','b','point','center'])if(repair.constraint[k])refs.add(repair.constraint[k]);
  for(const key of ['pairs','shapes','spins'])for(const pair of repair.constraint[key]||[])pair.forEach(id=>refs.add(id));
  return [...refs].filter(id=>!live.has(id)).map(id=>({id,kind:repair.points.some(p=>p.id===id)?'point':'entity',original:repair.points.find(p=>p.id===id)||repair.entities.find(e=>e.id===id)}));
}
export function restoreSketchConstraint(sketch,repairId,rebindings={},value){
  const repair=(sketch.repairs||[]).find(r=>r.id===repairId&&r.status==='pending');if(!repair)throw new Error('Repair no longer exists');
  const trial=structuredClone(sketch),constraint=structuredClone(repair.constraint);
  for(const ref of repairReferences(sketch,repair)){
    const target=rebindings[ref.id],pool=ref.kind==='point'?sketch.points:sketch.entities;
    if(!pool.some(p=>p.id===target&&(ref.kind==='point'||p.type===ref.original?.type)))throw new Error('Choose a compatible replacement for every missing reference');
  }
  const mapped=id=>rebindings[id]||id;
  for(const k of ['entity','a','b','point','center'])if(constraint[k])constraint[k]=mapped(constraint[k]);
  for(const k of ['pairs','shapes','spins'])if(constraint[k])constraint[k]=constraint[k].map(pair=>pair.map(mapped));
  if(value!==undefined){if(!Number.isFinite(value))throw new Error('Dimension must be finite');constraint.value=value;}
  trial.constraints=trial.constraints.filter(c=>c.id!==constraint.id);trial.constraints.push(constraint);
  const solved=solveSketch(trial);if(!solved.converged||solved.conflicts?.length)throw new Error('That relationship conflicts with the current sketch');
  trial.repairs.find(r=>r.id===repairId).status='restored';Object.assign(sketch,trial);return true;
}
