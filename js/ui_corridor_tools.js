import {S} from './state.js';
import {t} from './i18n.js';
import {detectRooms,wallPointAt,wallTangentAt,reconcileRoomMeta} from './geometry.js';
import {roomShapeCommand} from './commands/room_shape.js';
import {prepareCommand,executeCommand} from './commands/executor.js';
import {captureLock} from './constraint_engine.js';
import {beginHistoryTransaction,commitHistoryTransaction,abortHistoryTransaction,currentHistoryId} from './history.js';
import {generatedChangePermission} from './redesign.js';
import {renderAgentPreview,clearAgentPreview} from './agent_preview.js';
import {render2D} from './plan2d.js';
import {refreshTree,flash} from './ui.js';
import {withoutRoomPrompts} from './ui_tree.js';
import {planningPlacementScene} from './planning_scene.js';
import {footprint} from './layout_analysis.js';
import {openingCorners} from './slab_openings.js';
import {watchPlanningActivity} from './planning_activity.js';
import {toDisp,fromDisp} from './display_units.js';
let worker=null,preview=null,activeStamp=null;const values={x:-500,z:-500,width:2000,depth:2000,clear:90};
let selectedStart=null,selectedEnd=null,permittedConsent=false;
const cancel=()=>{worker?.terminate();worker=null;preview=null;activeStamp=null;clearAgentPreview();};
const env=()=>({state:S,services:{detectRooms,captureLock},history:{begin:beginHistoryTransaction,commit:commitHistoryTransaction,abort:abortHistoryTransaction,current:currentHistoryId}});
const stamp=()=>JSON.stringify([currentHistoryId(),S.nodes,S.walls,S.wallTypes,S.openings,S.items,S.slabOpenings,S.roomMeta,S.workspace]);
const changed=()=>window.dispatchEvent(new CustomEvent('planner-analysis-change'));
export function corridorToolsSection(helpers){
 const {section,el,field,button}=helpers,node=section('corridor-proposal','corridor_title'),rooms=detectRooms();
 const doors=S.openings.filter(o=>o.type!=='window'&&(o.sill||0)<=0).flatMap(o=>{
  const adjacent=rooms.filter(r=>r.key.split(',').includes(String(o.wall)));if(adjacent.length!==1)return [];
  const wall=S.walls.find(w=>w.id===o.wall),center=wallPointAt(wall,o.s),tangent=wallTangentAt(wall,o.s),normal={x:-tangent.z,z:tangent.x};
  if((adjacent[0].cx-center.x)*normal.x+(adjacent[0].cz-center.z)*normal.z>0){normal.x*=-1;normal.z*=-1;}
  if(Math.abs(normal.x)>1e-6&&Math.abs(normal.z)>1e-6)return [];
  return [{id:o.id,wall:o.wall,center,normal,width:o.width}];
 });
 const selects=[];
 for(const label of ['corridor_start','corridor_end']){
  const select=el('select');doors.forEach(door=>{const option=el('option',t('door')+' '+door.id);option.value=door.id;select.append(option);});selects.push(select);node.append(field(label,select));
 }
 if(selectedStart!=null)selects[0].value=selectedStart;
 if(selectedEnd!=null)selects[1].value=selectedEnd;else if(doors.length>1)selects[1].value=doors[1].id;
 selects.forEach((select,index)=>select.addEventListener('change',()=>{if(index===0)selectedStart=select.value;else selectedEnd=select.value;cancel();changed();}));
 for(const key of Object.keys(values)){
  const input=el('input');input.type='number';input.step='any';input.value=Number(toDisp(values[key]).toFixed(4));input.addEventListener('change',()=>{values[key]=fromDisp(Number(input.value));cancel();changed();});node.append(field('corridor_'+key,input));
 }
 const consent=el('input');consent.type='checkbox';node.append(field('corridor_permitted',consent));
 consent.checked=permittedConsent;consent.addEventListener('change',()=>{permittedConsent=consent.checked;cancel();changed();});
 node.append(button('corridor_preview',()=>{
  worker?.terminate();preview=null;clearAgentPreview();
  const from=doors.find(d=>String(d.id)===selects[0].value),to=doors.find(d=>String(d.id)===selects[1].value);
  if(!consent.checked||!from||!to||from.id===to.id||!Object.values(values).every(Number.isFinite)){flash(t('corridor_refused'),'error');return;}
  const width=Math.max(values.clear,from.width+4,to.width+4),radius=(width+10)/2+30;
  const start={x:from.center.x+from.normal.x*radius,z:from.center.z+from.normal.z*radius},end={x:to.center.x+to.normal.x*radius,z:to.center.z+to.normal.z*radius};
  const permitted=[{x:values.x,z:values.z},{x:values.x+values.width,z:values.z},{x:values.x+values.width,z:values.z+values.depth},{x:values.x,z:values.z+values.depth}];
  const scene=planningPlacementScene(),obstacles=[...scene.items.map(item=>footprint(item)),...(S.slabOpenings||[]).map(openingCorners)];
  for(const wall of scene.walls.filter(w=>String(w.id)!==String(from.wall)&&String(w.id)!==String(to.wall))){
   for(let i=1;i<wall.points.length;i++){
    const a=wall.points[i-1],b=wall.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)continue;
    const dx=-(b.z-a.z)/length*wall.thickness/2,dz=(b.x-a.x)/length*wall.thickness/2;
    obstacles.push([{x:a.x+dx,z:a.z+dz},{x:b.x+dx,z:b.z+dz},{x:b.x-dx,z:b.z-dz},{x:a.x-dx,z:a.z-dz}]);
   }
  }
  const version=stamp();activeStamp=version;worker=new Worker(new URL('./layout_worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{
   worker?.terminate();worker=null;const result=event.data.result;
   if(version!==stamp()||!result.ok){flash(t('corridor_refused'),'error');changed();return;}
   const params={type:'custom',points:result.polygon,roomType:'corridor',name:t('corridor'),spec:{thickness:10,height:270}};
   const prepared=prepareCommand(roomShapeCommand,params,env());
   if(!prepared.ok){flash(t('corridor_refused'),'error');changed();return;}
   preview={prepared,version};renderAgentPreview({kind:'room',outline:result.polygon});changed();
  };
  worker.onerror=()=>{worker?.terminate();worker=null;flash(t('corridor_refused'),'error');changed();};
  worker.postMessage({id:1,mode:'corridor',snapshot:{permitted,start,end,rooms,obstacles,width,thickness:10,connections:{start:from,end:to}}});changed();
 }));
 if(worker)node.append(el('p',t('layout_working')));
 if(preview)node.append(button('corridor_apply',()=>{
  if(preview.version!==stamp()||!generatedChangePermission(S,'room.stamp',{}).ok){flash(t('corridor_refused'),'error');return;}
  const result=executeCommand(roomShapeCommand,preview.prepared.params,env(),{label:t('corridor_apply'),postValidate:()=>detectRooms().some(r=>S.roomMeta[r.key]?.roomType==='corridor')?{ok:true}:{ok:false,reason:'NO_CORRIDOR'}});
  if(!result.ok){flash(t('corridor_refused'),'error');return;}
  preview=null;clearAgentPreview();reconcileRoomMeta();withoutRoomPrompts(refreshTree);S.dirty3D=true;render2D();changed();
 }));
 node.append(button('layout_discard',()=>{worker?.terminate();worker=null;preview=null;clearAgentPreview();changed();}));
 node.append(el('p',t('corridor_scope'),'guide-note'));return node;
}
watchPlanningActivity(()=>activeStamp&&(worker||preview)?{stamp:activeStamp,current:stamp()}:null,()=>{cancel();changed();});
