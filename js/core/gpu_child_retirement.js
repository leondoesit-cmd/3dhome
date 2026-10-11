// Detach obsolete meshes before replacement/picking, but release their shader
// references only after the replacement render has acquired matching programs.
export function withRetiredGpuChildren(group, predicate, createGroup, dispose, replace) {
  const retired=createGroup();
  for(const child of [...group.children])if(predicate(child))retired.add(child);
  try{return replace();}
  finally{dispose(retired);}
}
