import {S} from './state.js';
import {livePlacementScene} from './agent_context.js';
import {wallLayerBands} from './wall_types.js';

// Placement and access use the full material envelope, including asymmetric
// datums, rather than assuming every wall straddles its reference centerline.
export function planningPlacementScene(){
 const scene=livePlacementScene(),catalog=JSON.parse(JSON.stringify({wallTypes:S.wallTypes||[],walls:[]}));
 scene.walls=scene.walls.map(record=>{
  const original=S.walls.find(w=>String(w.id)===String(record.id));if(!original)return record;
  const wall=JSON.parse(JSON.stringify(original)),bands=wallLayerBands(wall,catalog);
  const low=Math.min(...bands.map(b=>b.start)),high=Math.max(...bands.map(b=>b.end)),shift=(low+high)/2;
  return {...record,thickness:high-low,points:record.points.map((p,i)=>{
   const a=record.points[Math.max(0,i-1)],b=record.points[Math.min(record.points.length-1,i+1)],length=Math.hypot(b.x-a.x,b.z-a.z)||1;
   return {x:p.x-(b.z-a.z)/length*shift,z:p.z+(b.x-a.x)/length*shift};
  })};
 });
 return scene;
}
