// A view is a camera choice. The stored attachment owns a sketch's plane.
export function sketchPlaneDisplay(sketch, references = [], labels = {}) {
  if (sketch?.support) {
    const face = sketch.support.semantic || sketch.support.persistentId || 'support';
    return {kind:'face', value:'__support_frame__', label:(labels.face || 'Face')+' · '+face};
  }
  const reference = references.find(item => item.id===sketch?.referenceId && !['plane:top','plane:front','plane:right'].includes(item.id));
  if (reference) return {kind:'reference',value:reference.id,label:labels.reference ? labels.reference(reference) : reference.name || reference.id};
  if (sketch?.frameSpace==='local' && sketch.frame) return {kind:'frame',value:'__local_frame__',label:labels.custom || 'Custom sketch frame'};
  const plane=sketch?.plane || 'top';
  return {kind:'principal',value:plane,label:labels.principal ? labels.principal(plane) : plane};
}
