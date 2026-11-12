// Solver transactions carry poses, context diagnostics and mutable mate records.
// Definitions and presentation data remain on the owning occurrence.
const poseKeys = ['transform','grounded','contextIssue'];
const mateKeys = ['mates','topologyMates'];

function ownFields(record,keys) {
  const fields = {};
  for (const key of keys) if (Object.hasOwn(record,key)) fields[key] = record[key];
  return fields;
}

export function captureAssemblySolverState(assembly,rootMates=true) {
  const poses = [], documents = [];
  function visit(owner,path) {
    if (rootMates || path.length) documents.push({path,fields:ownFields(owner,mateKeys)});
    for (const component of owner.components || []) {
      const childPath = [...path,component.id];
      poses.push({path:childPath,fields:ownFields(component,poseKeys)});
      if (component.asm) visit(component.asm,childPath);
    }
  }
  visit(assembly,[]);
  return structuredClone({poses,documents});
}

function occurrence(assembly,path) {
  let owner = assembly, component;
  for (const id of path) {
    const matches = (owner?.components || []).filter(item=>item.id===id);
    if (matches.length!==1) return null;
    component = matches[0];
    owner = component.asm;
  }
  return component;
}

function restoreFields(target,fields,keys) {
  const copy = structuredClone(fields);
  for (const key of keys) {
    if (Object.hasOwn(copy,key)) target[key] = copy[key];
    else delete target[key];
  }
}

export function restoreAssemblySolverState(assembly,state) {
  for (const {path,fields} of state.poses || []) {
    const component = occurrence(assembly,path);
    if (component) restoreFields(component,fields,poseKeys);
  }
  for (const {path,fields} of state.documents || []) {
    const owner = path.length ? occurrence(assembly,path)?.asm : assembly;
    if (!owner) continue;
    for (const key of mateKeys) {
      if (!Object.hasOwn(fields,key)) { delete owner[key]; continue; }
      const saved = fields[key], current = owner[key];
      if (!Array.isArray(saved) || !Array.isArray(current)) {
        owner[key] = structuredClone(saved);
        continue;
      }
      // Keep existing mate objects alive for inspectors and undo callers.
      const rows = saved.map((mate,index)=>{
        const target = current[index]?.id===mate.id ? current[index] : current.find(row=>row.id===mate.id);
        if (!target || target.id!==mate.id) return structuredClone(mate);
        restoreFields(target,mate,new Set([...Object.keys(target),...Object.keys(mate)]));
        return target;
      });
      current.splice(0,current.length,...rows);
    }
  }
}

// A preview may finish after cancellation. Every nested writable record must
// belong to its trial even when the evaluator runs asynchronously.
export function cloneAssemblySolverState(assembly) {
  const trial = {...assembly};
  for (const key of mateKeys) if (Object.hasOwn(assembly,key)) trial[key] = structuredClone(assembly[key]);
  trial.components = (assembly.components || []).map(component=>{
    const copy = {...component};
    if (Object.hasOwn(component,'transform')) copy.transform = structuredClone(component.transform);
    if (component.asm) copy.asm = cloneAssemblySolverState(component.asm);
    return copy;
  });
  return trial;
}
