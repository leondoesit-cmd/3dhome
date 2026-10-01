import {faceFrameOrigin,frameFromPlane,frameNormalize} from './frame.js';

export function sketchOffsetValue(sketch) {
  return Number(sketch?.frameSpace==='local' ? sketch.supportOffset : sketch?.offset) || 0;
}

export function offsetSketchFrame(frame,origin,normal,offset) {
  const n=frameNormalize(normal),distance=Number(offset)||0;
  const placed={x:(Number(origin?.x)||0)+n.x*distance,y:(Number(origin?.y)||0)+n.y*distance,z:(Number(origin?.z)||0)+n.z*distance};
  // Preserve the sketch's UV axes; an offset cannot mirror its drawn profile.
  return frame ? {...frame,origin:placed,normal:n} : frameFromPlane(placed,n);
}

export function setSketchOffset(document,sketchId,value) {
  const sketch=(document?.sketches || []).find(item=>item.id===sketchId);
  const offset=Number(value);
  if(!sketch || !Number.isFinite(offset))return false;
  const before=JSON.stringify({offset:sketch.offset,supportOffset:sketch.supportOffset,frame:sketch.frame});
  const reference=(document.references || []).find(item=>item.id===sketch.referenceId);
  if(sketch.frameSpace==='local'){
    sketch.supportOffset=offset;
    const descriptor=sketch.support?.descriptor;
    if(descriptor?.normal){
      sketch.frame=offsetSketchFrame(sketch.frame,faceFrameOrigin(descriptor,sketch.frameAnchor),descriptor.normal,offset);
    }else if(reference?.normal){
      sketch.frame=offsetSketchFrame(sketch.frame,reference.origin,reference.normal,offset);
    }else if(sketch.frame){
      // A free local frame stores the previous offset relative to its base.
      const previous=JSON.parse(before).supportOffset || 0;
      sketch.frame=offsetSketchFrame(sketch.frame,sketch.frame.origin,sketch.frame.normal,offset-previous);
    }
  }else{
    sketch.offset=offset;
    if(sketch.frame && reference?.normal)sketch.frame=offsetSketchFrame(sketch.frame,reference.origin,reference.normal,offset);
  }
  if(/^plane:(top|front|right)$/.test(sketch.referenceId) && !sketch.support)sketch.offset=offset;
  const changed=before!==JSON.stringify({offset:sketch.offset,supportOffset:sketch.supportOffset,frame:sketch.frame});
  if(changed){
    document.revision=(Number(document.revision)||0)+1;
    const history=(document.history || []).find(entry=>entry.kind==='sketch' && entry.targetId===sketchId);
    if(history)history.status='pending';
  }
  return changed;
}
