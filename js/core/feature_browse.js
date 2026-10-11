import {sketchReferenceIds} from './tree_model.js';

export function featureBrowseNodes(model) {
  const out=[],seen=new Set();
  function visit(nodes){for(const node of nodes || []){
    if(['feature','sketch'].includes(node.kind)&&!seen.has(node.id)){out.push(node);seen.add(node.id);}
    visit(node.children);
  }}
  visit(model?.nodes);
  return out.sort((a,b)=>(a.index??Infinity)-(b.index??Infinity));
}

export function featureTreeContext(feature,definition,formatLength=value=>String(value),typeLabel=type=>type) {
  const params=feature.params || {},details=[typeLabel(feature.type)];
  if(params.endCondition && !['blind','mid-plane'].includes(params.endCondition))details.push(String(params.endCondition).replaceAll('-',' '));
  for(const [key,label] of [['depth','Depth'],['h','Height'],['r','R'],['diameter','Ø'],['angle','Angle'],['count','Count']]){
    const value=params[key];if(value==null||value==='')continue;
    const numeric=typeof value==='number'&&Number.isFinite(value);
    details.push(label+' '+(numeric?(key==='angle'?value+'°':key==='count'?String(value):formatLength(value)):String(value)));
    if(details.length>=3)break;
  }
  const sketch=(definition.sketches || []).find(item=>sketchReferenceIds(feature).includes(item.id));
  if(sketch){
    const reference=(definition.references || []).find(item=>item.id===sketch.referenceId);
    const plane=reference?.name || (/^plane:/.test(sketch.referenceId || '')?sketch.referenceId.slice(6)+' plane':sketch.support?'Face sketch':sketch.plane?sketch.plane+' plane':'');
    if(plane)details.push(plane);
  }
  return details.join(' · ');
}
