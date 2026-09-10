import {onAfterRender} from './plan2d.js';
import {S} from './state.js';
import {currentHistoryId} from './history.js';
const activities=new Set(),sections=new Map();let scheduled=false;
export const planningVersion=()=>JSON.stringify([currentHistoryId(),S.workspace,S.nodes,S.walls,S.wallTypes,S.openings,S.items,S.slabOpenings,S.mep,S.roomMeta,S.sel]);
function check(){
 scheduled=false;
 const shown=!!document.getElementById('planningGuide')?.getClientRects().length;
 for(const entry of activities){
  const activity=entry.status();
  if(!activity){entry.visible=false;entry.previous=null;continue;}
  if(entry.previous!==activity.stamp){entry.previous=activity.stamp;entry.visible=shown;}
  if(activity.stamp!==activity.current||(entry.visible&&!shown)||(entry.node&&!entry.node.isConnected)){
   entry.cancel();entry.visible=false;entry.previous=null;
  }else entry.visible=entry.visible||shown;
 }
}
function schedule(){if(typeof requestAnimationFrame!=='function')return;if(!scheduled){scheduled=true;requestAnimationFrame(check);}}
onAfterRender(schedule);
window.addEventListener('click',schedule);
window.addEventListener('keydown',schedule);
window.addEventListener('planner-analysis-change',schedule);
// Checks also run after UI-only gestures: closing a sheet need not render a plan.
export function watchPlanningActivity(status,cancel){activities.add({status,cancel,visible:false,previous:null});}
export function watchPlanningSection(key,node,status,cancel){
 const previous=sections.get(key);
 if(previous){if(previous.status())previous.cancel();activities.delete(previous);}
 const entry={node,status,cancel,visible:false,previous:null};sections.set(key,entry);activities.add(entry);
}
