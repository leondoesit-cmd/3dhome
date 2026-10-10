import {isSubassembly,composePlacement} from './assembly_structure.js';
import {componentEditCopy,commitComponentEdit} from './component_edit.js';

export function nestedComponentOccurrence(assembly,path) {
 if(!Array.isArray(path)||!path.length)return null;
 let record=assembly;const chain=[];
 for(let i=0;i<path.length;i++){
  const matches=(record?.components||[]).filter(c=>String(c.id)===String(path[i]));if(matches.length!==1)return null;
  const component=matches[0];chain.push(component);
  if(i<path.length-1){if(!isSubassembly(component))return null;record=component.asm;}
 }
 return {component:chain.at(-1),chain,parents:chain.slice(0,-1),path:chain.map(c=>c.id),placement:composePlacement(chain)};
}
function authoringStamp(component) {
 const def=component.def||{},ignored=new Set(['parts','exactTopologyCache','verifiedExactTopology','lastRebuild','bounds']);
 const source=Object.fromEntries(Object.entries(def).filter(([k])=>!ignored.has(k)));
 for(const name of ['sketches','features','history'])if(Array.isArray(source[name]))source[name]=source[name].map(item=>Object.fromEntries(Object.entries(item).filter(([k])=>!['status','diagnostics','lastResult'].includes(k))));
 source.parts=(def.parts||[]).map(p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['meshData','bounds','exactTopology','topology'].includes(k))));
 return JSON.stringify({id:component.id,name:component.name,modelKey:component.modelKey,customProperties:component.customProperties,transform:component.transform,source});
}
export function createNestedComponentEdit(assembly,path) {
 const occurrence=nestedComponentOccurrence(assembly,path);
 if(!occurrence?.component.def||isSubassembly(occurrence.component))throw new Error('Select a part occurrence');
 return {owner:assembly,assemblyKey:assembly.key,path:occurrence.path,componentId:occurrence.component.id,
  parents:occurrence.parents,parentPose:JSON.stringify(occurrence.parents.map(c=>({transform:c.transform,explodedOffset:c.explodedOffset}))),
  source:occurrence.component,sourceDef:occurrence.component.def,sourceStamp:authoringStamp(occurrence.component),working:componentEditCopy(occurrence.component)};
}
export function nestedEditStillCurrent(assembly,edit) {
 const current=nestedComponentOccurrence(assembly,edit.path||[edit.componentId]);
 return assembly===edit.owner&&assembly?.key===edit.assemblyKey&&current?.parents.length===edit.parents.length&&current.parents.every((c,i)=>c===edit.parents[i])
  &&JSON.stringify(current.parents.map(c=>({transform:c.transform,explodedOffset:c.explodedOffset})))===edit.parentPose&&current?.component===edit.source&&current.component.def===edit.sourceDef&&authoringStamp(current.component)===edit.sourceStamp;
}
export function commitNestedComponentEdit(assembly,edit,working) {
 if(!nestedEditStillCurrent(assembly,edit))throw new Error('The nested occurrence changed; cancel and reopen component edit');
 return commitComponentEdit(nestedComponentOccurrence(assembly,edit.path).component,working);
}
/** Shallow branch copies exclude the edited leaf from ghost rendering only. */
export function assemblyWithoutNestedOccurrence(assembly,path) {
 function omit(record,index){return {...record,components:(record.components||[]).flatMap(c=>{
  if(String(c.id)!==String(path[index]))return [c];
  if(index===path.length-1)return [];
  return isSubassembly(c)?[{...c,asm:omit(c.asm,index+1)}]:[c];
 })};}return omit(assembly,0);
}

export function restoreNestedComponentEdit(assembly,metadata) {
 if(metadata?.assemblyKey&&metadata.assemblyKey!==assembly?.key)throw new Error('Component draft belongs to a different assembly');
 const edit=createNestedComponentEdit(assembly,metadata.componentPath || [metadata.componentId]);
 if(String(edit.componentId)!==String(metadata.componentId))throw new Error('Component draft path does not match its occurrence');
 return edit;
}
