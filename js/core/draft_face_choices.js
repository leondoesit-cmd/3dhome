// Input-stage native faces, including curved faces, are valid Draft targets.
// Keep their persistent references intact; displayed labels never rename them.
import { documentLengthUnit, lengthToDocument } from './document_length_units.js';
export function draftFaceChoices(entries,features=[],unit='cm') {
  unit=documentLengthUnit(unit);
  const display=value=>Number(lengthToDocument(value,unit).toFixed(4));
  const names=new Map(features.map(feature=>[feature.id,feature.name || feature.type]));
  const unique=new Map();
  for(const entry of entries || []){
    if(entry.kind!=='face' || !entry.persistentId || !entry.descriptor?.surface)continue;
    if(unique.has(entry.persistentId))continue;
    const d=entry.descriptor,origin=d.centroid || d.origin;
    const position=origin && ['x','y','z'].every(axis=>Number.isFinite(origin[axis]))
      ? ' · ('+[origin.x,origin.y,origin.z].map(display).join(', ')+') '+unit : '';
    const radius=Number.isFinite(d.radius)?' · R '+display(d.radius)+' '+unit:'';
    unique.set(entry.persistentId,{entry,label:(names.get(entry.ownerFeatureId) || 'Upstream face')+' · '+d.surface+' · '+(entry.semantic || entry.persistentId)+radius+position});
  }
  return [...unique.values()];
}
