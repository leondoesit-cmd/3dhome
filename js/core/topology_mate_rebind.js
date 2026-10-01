export function rebindTopologyMate(mate, first, second) {
  const candidates=[first,second];
  const a=candidates.find(reference=>reference.componentId===mate.a?.componentId);
  const b=candidates.find(reference=>reference.componentId===mate.b?.componentId);
  if(!a || !b || a===b)throw new Error('Select references on the two components of this mate');
  mate.a=JSON.parse(JSON.stringify(a));mate.b=JSON.parse(JSON.stringify(b));
  return mate;
}
