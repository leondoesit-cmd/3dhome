// A quarter-circle with a radial leaf identifies a door without image-specific
// geometry. The shared ridge test rejects filled furniture shadows.
import { blueprintDoorSwing } from './blueprint_door_swing.js';
export function refineBlueprintOpenings(result,image){
 const graph=result.reconstruction,cal=result.referenceCalibration;if(!graph||!cal?.cmPerPx)return result;
 const scale=cal.cmPerPx;let corrected=0;
 for(const opening of graph.openings){
  const wall=graph.walls.find(w=>w.id===opening.wall);if(!wall)continue;
  const a=graph.nodes[wall.a],b=graph.nodes[wall.b],L=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/L,uy=(b.z-a.z)/L,radius=opening.width/scale;
  if(radius<18||radius>Math.min(image.width,image.height)*.35)continue;
  const point=s=>({x:(a.x+ux*s-cal.originX)/scale,y:(a.z+uy*s-cal.originZ)/scale});
  const evidence=blueprintDoorSwing(image,point(opening.s-opening.width/2),point(opening.s+opening.width/2),wall.thickness/scale/2);
  if(!evidence)continue;
  if(opening.type!=='door'){opening.type='door';opening.height=205;opening.sill=0;corrected++;}
  opening.swingDir=(evidence.end<0?'L':'R')+'_'+(evidence.side<0?'IN':'OUT');opening.source='image-swing-symbol';
 }
 result.recognition.swingSymbols=graph.openings.filter(o=>o.source==='image-swing-symbol').length;
 if(corrected)result.warnings.push(corrected+' opening classifications were corrected from visible door swing symbols.');
 return result;
}
