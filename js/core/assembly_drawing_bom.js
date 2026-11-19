import {generateOccurrenceBOM} from '../cad_interference.js';
import {flattenAssembly,isSubassembly} from './assembly_structure.js';

export const occurrenceBOMKey=path=>JSON.stringify(path.map(String));
// Table rows and leaf balloon labels share one numbering pass. Quantities
// count occurrences in the assembly, including repeated nested occurrences.
export function assemblyDrawingBOM(assembly,scope='partsOnly') {
 const itemByPath=new Map(),rows=[];
 const visible=component=>component&&!component.suppressed&&component.visible!==false;
 // Resolve recipes on their actual owners, including nested assemblies, once.
 const leaves=flattenAssembly(assembly,{visibleOnly:true}).filter(leaf=>visible(leaf.component)&&leaf.parents.every(visible));
 if(scope!=='indented'){
  const flat=generateOccurrenceBOM(leaves.map(leaf=>leaf.component));
  const itemByIdentity=new Map(flat.map((row,index)=>[row.key,index+1]));
  rows.push(...flat.map((row,index)=>({...row,item:index+1,depth:0})));
  for(const leaf of leaves){
   const identity=generateOccurrenceBOM([leaf.component])[0];
   if(identity && itemByIdentity.has(identity.key))itemByPath.set(occurrenceBOMKey(leaf.path),itemByIdentity.get(identity.key));
  }
  return {rows,itemByPath};
 }
 const visit=(entries,prefix='',depth=0)=>{
  const groups=new Map();
  for(const entry of entries){
   if(!visible(entry.component))continue;
   const identity=generateOccurrenceBOM([entry.component])[0];
   if(!identity)continue;
   if(!groups.has(identity.key))groups.set(identity.key,{row:identity,entries:[]});
   groups.get(identity.key).entries.push(entry);
  }
  let index=0;
  for(const group of groups.values()){
   const item=prefix+(++index);
   rows.push({...group.row,item,depth,quantity:group.entries.length});
   const children=[];
   for(const entry of group.entries){
    if(isSubassembly(entry.component)){
     for(const child of entry.component.asm.components||[])children.push({component:child,path:entry.path.concat(child.id)});
    }else itemByPath.set(occurrenceBOMKey(entry.path),item);
   }
   if(children.length)visit(children,item+'.',depth+1);
  }
 };
 visit((assembly?.components||[]).map(component=>({component,path:[component.id]})));
 return {rows,itemByPath};
}
