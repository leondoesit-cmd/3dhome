import {createTopologyRegistry,resolveTopologyReference} from './topology.js';
import {vertexEntriesFrom} from './topology_selection.js';

// Generated ordinals can name a different physical edge after cold extraction.
// Plane support must recover from retained geometry before following that ID.
export function lookupSupportReference(reference,entries) {
  if(!reference)return null;
  const generated=/^generated-\d+$/.test(reference.semantic || reference.descriptor?.semantic || '')
    || /:generated[:\-]/.test(reference.persistentId || '');
  if(generated && reference.descriptor){
    const wanted={...reference,persistentId:undefined,semantic:undefined,
      descriptor:{...reference.descriptor,semantic:undefined}};
    const resolved=resolveTopologyReference(wanted,createTopologyRegistry(entries));
    return resolved.topology || null;
  }
  return entries.find(item=>item.persistentId===reference.persistentId)
    || (reference.semantic?entries.find(item=>item.kind===(reference.kind || 'edge') && item.semantic===reference.semantic):null)
    || vertexEntriesFrom(entries).find(item=>item.persistentId===reference.persistentId)
    || null;
}

export function supportReferenceResolutionRevision(document,sketchId) {
  const sketch=document.sketches?.find(item=>item.id===sketchId);
  const refs=new Map((document.references || []).map(item=>[item.id,item]));
  const seen=new Set();
  const generated=value=>{
    if(!value || typeof value!=='object')return false;
    if(/^generated-\d+$/.test(value.semantic || value.descriptor?.semantic || '') || /:generated[:\-]/.test(value.persistentId || ''))return true;
    return Object.values(value).some(generated);
  };
  const visit=id=>{
    if(!id || seen.has(id))return false;seen.add(id);
    const plane=refs.get(id);
    return !!plane && (generated(plane.throughEdges) || generated(plane.support) || generated(plane.angleAxis) || visit(plane.baseReferenceId));
  };
  return visit(sketch?.referenceId)?'descriptor-support-1':null;
}
