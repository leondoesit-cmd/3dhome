import { mateFrameSupports, planarDirection, rotationOf } from "./cad_mate_model.js";

/* Exact topology is often easier to identify in a list than on a narrow or
   occluded shoulder. Keep the list restricted to real planar faces: a mesh
   patch with a guessed normal must not silently become a mate reference. */
export function planarMateFaceChoices(entries, featureHistory = []) {
  const names = new Map(featureHistory.map((feature) => [feature.id, feature.name || feature.type || feature.id]));
  const seen = new Set();
  return (entries || []).filter((entry) => {
    if (!entry || entry.kind !== "face" || !entry.persistentId || seen.has(entry.persistentId)) return false;
    if (!mateFrameSupports("planar", entry.descriptor)) return false;
    seen.add(entry.persistentId);
    return true;
  }).map((entry) => {
    const d = entry.descriptor;
    const axis = ["x", "y", "z"].find((key) => Math.abs(Number(d.normal[key])) > 0.9);
    const at = axis && Number.isFinite(Number(d.origin[axis]))
      ? ` · ${axis.toUpperCase()} ${Number(d.origin[axis]).toFixed(3)} cm` : "";
    const owner = entry.ownerFeatureId || "";
    const producingFeature = [...names.keys()].find((id) => owner === id || owner.startsWith(`${id}:`));
    const name = names.get(producingFeature) || owner || "Face";
    return { entry, label: `${name} · ${entry.semantic || d.semantic || entry.persistentId}${at}` };
  });
}

export function exactMateReferenceChoices(entries, featureHistory = []) {
  const planar=planarMateFaceChoices(entries,featureHistory),seen=new Set(planar.map(choice=>choice.entry.persistentId));
  const names=new Map(featureHistory.map(feature=>[feature.id,feature.name || feature.type || feature.id]));
  const round=(entries || []).filter(entry=>{
    if(!entry || !entry.persistentId || seen.has(entry.persistentId)
      || !((entry.kind==='face' && ['cylinder','torus'].includes(entry.descriptor?.surface)) || (entry.kind==='edge' && entry.descriptor?.curve==='circle'))
      || !mateFrameSupports('round',entry.descriptor))return false;
    seen.add(entry.persistentId);return true;
  }).map(entry=>{
      const d=entry.descriptor,owner=entry.ownerFeatureId || '';
      const producing=[...names.keys()].find(id=>owner===id || owner.startsWith(`${id}:`));
      const type=entry.kind==='edge'?'Circular edge':d.surface==='torus'?'Torus':'Cylinder';
      const at=['x','y','z'].map(key=>`${key.toUpperCase()} ${Number(d.origin[key]).toFixed(3)}`).join(' · ');
      const radii=d.surface==='torus'?`R ${Number(d.majorRadius).toFixed(3)} / wire ${Number(d.minorRadius).toFixed(3)}`:`R ${Number(d.radius).toFixed(3)}`;
      return {entry,label:`${names.get(producing) || owner || type} · ${type} · ${entry.semantic || d.semantic || entry.persistentId} · ${radii} cm · ${at} cm`};
    });
  const roundRank=choice=>choice.entry.descriptor.surface==='cylinder'?0:choice.entry.kind==='edge'?1:2;
  const planarRank=choice=>{
    const semantic=String(choice.entry.semantic || choice.entry.descriptor.semantic || '');
    if(/(^|:)(start|end|cap|top|bottom)($|:|-)/i.test(semantic))return 0;
    return String(choice.entry.persistentId).startsWith('plane:')?1:2;
  };
  // Axes and cap planes must stay reachable on gears with thousands of tooth
  // side faces. Keep every native face, with stable order inside each group.
  const axes=round.filter(choice=>choice.entry.kind==='face' && choice.entry.descriptor.surface==='cylinder').map(choice=>{
    const face=choice.entry,d=face.descriptor;
    return {entry:{kind:'axis',ownerFeatureId:face.ownerFeatureId,persistentId:'axis:'+face.persistentId,
      descriptor:{surface:'axis',origin:{...d.origin},axis:{...d.axis},sourceFace:{kind:'face',ownerFeatureId:face.ownerFeatureId,persistentId:face.persistentId,semantic:face.semantic,descriptor:structuredClone(d)}}},
      label:choice.label.replace(' · Cylinder · ',' · Exact axis · ')};
  });
  // Keep the native edge and endpoint index: a saved coordinate alone cannot
  // follow a vertex when its feature dimensions change.
  const vertices=[],points=new Set();
  for(const edge of entries || []){
    if(edge.kind!=='edge' || !edge.persistentId || !Array.isArray(edge.descriptor?.endpoints))continue;
    edge.descriptor.endpoints.forEach((point,index)=>{
      if(index!==0 && index!==edge.descriptor.endpoints.length-1)return;
      if(!point || !['x','y','z'].every(key=>Number.isFinite(Number(point[key]))))return;
      const key=['x','y','z'].map(axis=>Math.round(Number(point[axis])*1e7)).join(':');
      if(points.has(key))return;points.add(key);
      const owner=edge.ownerFeatureId || '',producing=[...names.keys()].find(id=>owner===id || owner.startsWith(`${id}:`));
      const at=['x','y','z'].map(axis=>`${axis.toUpperCase()} ${Number(point[axis]).toFixed(3)}`).join(' · ');
      vertices.push({entry:{kind:'vertex',ownerFeatureId:owner,persistentId:`vertex:${edge.persistentId}:${index}`,
        descriptor:{surface:'point',origin:{...point},endpointIndex:index,sourceEdge:{kind:'edge',persistentId:edge.persistentId,ownerFeatureId:owner,semantic:edge.semantic,descriptor:structuredClone(edge.descriptor)}}},
        label:`${names.get(producing) || owner || 'Body'} · Vertex · ${at} cm`});
    });
  }
  return [...axes,...round.sort((a,b)=>roundRank(a)-roundRank(b)),...planar.sort((a,b)=>planarRank(a)-planarRank(b)),...vertices];
}

/* With only the axial slide left, existing mates already fixed orientation.
   A new face mate must use the same normal relationship, even when an exact
   kernel gives both mating faces equal normals. The default opposed setting
   would demand a 180° turn and contradict the earlier plane mates. */
export function mateAlignmentForLockedOrientation(frameA, frameB, transformA, transformB, freedom) {
  if (freedom !== 1 && freedom !== 0) return null;
  const a = planarDirection(frameA), b = planarDirection(frameB);
  if (!a || !b) return null;
  const world = (normal, transform) => {
    const matrix = rotationOf(transform || {});
    return {
      x: matrix[0][0] * normal.x + matrix[0][1] * normal.y + matrix[0][2] * normal.z,
      y: matrix[1][0] * normal.x + matrix[1][1] * normal.y + matrix[1][2] * normal.z,
      z: matrix[2][0] * normal.x + matrix[2][1] * normal.y + matrix[2][2] * normal.z,
    };
  };
  const wa = world(a, transformA), wb = world(b, transformB);
  return wa.x * wb.x + wa.y * wb.y + wa.z * wb.z >= 0;
}
