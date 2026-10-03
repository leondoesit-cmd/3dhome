// Exploded Views & Step Animations for Assemblies.
import { composePlacement, isSubassembly } from './core/assembly_structure.js';

let explodedIdSequence=0;
function newExplodedId(prefix,records) {
  let id;
  do {
    const suffix=globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+'_'+(++explodedIdSequence).toString(36);
    id=prefix+suffix;
  } while((records||[]).some(record=>record.id===id));
  return id;
}

// Repair ambiguous legacy identities once a view is used. Keep the first
// occurrence and every already distinct ID; vectors/order/placements stay put.
export function normalizeExplodeStepIds(assembly) {
  const steps=(assembly?.explodedViews||[]).flatMap(view=>view.steps||[]),seen=new Set();
  let repaired=0;
  for(const step of steps) {
    if(step.id==null||step.id===''||seen.has(step.id)){step.id=newExplodedId('step_',steps);repaired++;}
    seen.add(step.id);
  }
  return repaired;
}

// Document units are cm. Scale the default separation to the placed bodies,
// leaving saved user-authored steps unchanged.
export function defaultExplodeSpacing(bounds) {
  const widths=(bounds||[]).map(b=>b?.x1-b?.x0).filter(width=>Number.isFinite(width)&&width>0);
  const width=widths.length?Math.max(...widths):1;
  return width+Math.max(.1,width*.2);
}

export function explodeTargets(assembly) {
  normalizeExplodeStepIds(assembly);
  const targets=[];
  const walk=(components,parents,path,labels)=>{
    for(const component of components || []) {
      const next=path.concat(String(component.id)),names=labels.concat(component.name || component.modelKey || String(component.id));
      targets.push({component,parents,path:next,key:next.join('/'),label:names.join(' / ')});
      if(isSubassembly(component))walk(component.asm.components,parents.concat(component),next,names);
    }
  };
  walk(assembly?.components,[],[],[]);
  return targets;
}

const rotate=(frame,v)=>({x:frame.x.x*v.x+frame.y.x*v.y+frame.z.x*v.z,y:frame.x.y*v.x+frame.y.y*v.y+frame.z.y*v.z,z:frame.x.z*v.x+frame.y.z*v.y+frame.z.z*v.z});
const unrotate=(frame,v)=>({x:frame.x.x*v.x+frame.x.y*v.y+frame.x.z*v.z,y:frame.y.x*v.x+frame.y.y*v.y+frame.y.z*v.z,z:frame.z.x*v.x+frame.z.y*v.y+frame.z.z*v.z});

/* Offsets are stored in each component's parent coordinates. Sum them in
   assembly coordinates for drawing/export; mated transforms remain untouched. */
export function explodedOccurrenceOffset(occurrence) {
  const sum={x:0,y:0,z:0},parents=[];
  for(const component of (occurrence.parents || []).concat(occurrence.component)) {
    if(component.explodedOffset) {
      const v=rotate(composePlacement(parents),component.explodedOffset);
      for(const axis of ['x','y','z'])sum[axis]+=v[axis];
    }
    parents.push(component);
  }
  return sum;
}

export function createExplodedView(assembly, name = "ExplodedView1") {
  if (!assembly.explodedViews) assembly.explodedViews = [];
  const ev = {
    id: newExplodedId("ev_",assembly.explodedViews),
    name,
    steps: [],
  };
  assembly.explodedViews.push(ev);
  return ev;
}

export function addExplodeStep(explodedView, componentIds, direction = { x: 0, y: 100, z: 0 }) {
  const step = {
    id: newExplodedId("step_",explodedView.steps),
    components: (componentIds || []).slice(),
    direction: { ...direction },
  };
  explodedView.steps.push(step);
  return step;
}

export function applyExplodedView(assembly, explodedViewId, factor = 1.0, stepFactors = null) {
  if (!assembly || !assembly.components) return;
  normalizeExplodeStepIds(assembly);
  const ev = (assembly.explodedViews || []).find((v) => v.id === explodedViewId);
  const targets=explodeTargets(assembly);
  if (explodedViewId == null) { for (const target of targets) target.component.explodedOffset = null; assembly.exploded=false; return; }
  if (!ev) return;

  const offsets = new Map();
  for (const [index, step] of ev.steps.entries()) {
    const scale = stepFactors ? stepFactors[index] || 0 : factor;
    for (const cid of step.components) {
      const key=Array.isArray(cid)?cid.map(String).join('/'):String(cid);
      const current = offsets.get(key) || { x: 0, y: 0, z: 0 };
      current.x += step.direction.x * scale;
      current.y += step.direction.y * scale;
      current.z += step.direction.z * scale;
      offsets.set(key, current);
    }
  }

  for (const target of targets) {
    const comp=target.component,off = offsets.get(target.key);
    if (off) {
      comp.explodedOffset = unrotate(composePlacement(target.parents),off);
    } else {
      comp.explodedOffset = null;
    }
  }
  assembly.exploded=stepFactors ? stepFactors.some(value=>value>0) : factor!==0;
}

/* Progress runs through the saved steps in order; completed steps retain their
   offsets while the next step moves. No component placement or recipe changes. */
export function applyExplodedProgress(assembly, explodedViewId, progress) {
  const view=assembly?.explodedViews?.find(item=>item.id===explodedViewId);
  if(!view)return;
  const elapsed=Math.max(0,Math.min(1,Number(progress)||0))*view.steps.length;
  applyExplodedView(assembly,explodedViewId,1,view.steps.map((step,index)=>Math.max(0,Math.min(1,elapsed-index))));
}


/* The leader an exploded drawing shows for each moved component: from the middle
   of where the mates put it to the middle of where the view moved it. */
export function explodeLines(assembly, centreOf) {
  const lines = [];
  for (const target of explodeTargets(assembly)) {
    const comp=target.component;
    const off = comp.explodedOffset;
    if (!off || !(off.x || off.y || off.z)) continue;
    const from = centreOf(comp,target);
    if (!from) continue;
    const world=explodedOccurrenceOffset(target);
    lines.push({ id: target.path.length===1?comp.id:target.key, from, to: { x: from.x + world.x, y: from.y + world.y, z: from.z + world.z } });
  }
  return lines;
}
