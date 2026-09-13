import {helixPoint} from '../cad_helix.js';
import {sketchWorldPoint} from './swept_sources.js';
export function pierceSketchToHelix(sketch,anchorId,helix,position=0){
 const next=structuredClone(sketch),anchor=next.points.find(p=>p.id===anchorId);if(!anchor)throw new Error('Select a sketch point');
 const target=helixPoint(helix,position),o=sketchWorldPoint(next,0,0),u=sketchWorldPoint(next,1,0),v=sketchWorldPoint(next,0,1),x={x:u.x-o.x,y:u.y-o.y,z:u.z-o.z},y={x:v.x-o.x,y:v.y-o.y,z:v.z-o.z},q={x:target.x-o.x,y:target.y-o.y,z:target.z-o.z},dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const tx=dot(q,x),ty=dot(q,y),reconstructed=sketchWorldPoint(next,tx,ty);
 if(Math.hypot(target.x-reconstructed.x,target.y-reconstructed.y,target.z-reconstructed.z)>1e-6)throw new Error('The chosen curve point does not cross this sketch plane');
 const dx=tx-anchor.x,dy=ty-anchor.y;
 for(const point of next.points){point.x+=dx;point.y+=dy;}
 for(const constraint of next.constraints || [])if(constraint.type==='fixed'){constraint.x+=dx;constraint.y+=dy;}
 return next;
}
