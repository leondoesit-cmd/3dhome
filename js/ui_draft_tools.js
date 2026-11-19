import {S} from './state.js';
import {t} from './i18n.js';
import {apartmentGenerateCommand} from './generator.js';
import {prepareCommand,executeCommand} from './commands/executor.js';
import {beginHistoryTransaction,commitHistoryTransaction,abortHistoryTransaction,currentHistoryId} from './history.js';
import {renderAgentPreview,clearAgentPreview} from './agent_preview.js';
import {render2D,frameBounds} from './plan2d.js';
import {refreshTree,flash} from './ui.js';
import {withoutRoomPrompts} from './ui_tree.js';
import {roomTypeOf} from './room_types.js';
import {watchPlanningActivity} from './planning_activity.js';
import {checklistStatus} from './planning_guide.js';
import {detectRooms} from './geometry.js';
import {parseXYList} from './display_units.js';
let worker=null,preview=null,size='large',replace=false,activeStamp=null,boundaryText='';
const cancel=()=>{worker?.terminate();worker=null;preview=null;activeStamp=null;clearAgentPreview();};
const env=()=>({state:S,history:{begin:beginHistoryTransaction,commit:commitHistoryTransaction,abort:abortHistoryTransaction,current:currentHistoryId},version:{current:currentHistoryId}});
const fingerprint=()=>JSON.stringify([currentHistoryId(),S.nodes,S.walls,S.items,S.openings,S.slabOpenings,S.mep,S.roomMeta,S.workspace,S.sel]);
const changed=()=>window.dispatchEvent(new CustomEvent('planner-analysis-change'));
export function draftToolsSection(helpers,guide){
 const {section,el,field,choices,button}=helpers,node=section('generate-draft','draft_title');
 node.append(field('draft_size',choices([['large','draft_large'],['small','draft_small'],['random','draft_random']],size,value=>{size=value;cancel();changed();})));
 const replaceInput=el('input');replaceInput.type='checkbox';replaceInput.checked=replace;replaceInput.addEventListener('change',()=>{replace=replaceInput.checked;cancel();changed();});node.append(field('draft_replace',replaceInput));
 const boundaryInput=el('textarea');boundaryInput.value=boundaryText;boundaryInput.rows=3;
 boundaryInput.addEventListener('change',()=>{boundaryText=boundaryInput.value;cancel();changed();});node.append(field('draft_boundary',boundaryInput));
 node.append(button('draft_preview',()=>{
  worker?.terminate();preview=null;clearAgentPreview();if(S.structLocked||S.layers?.structure?.locked||(replace&&(S.walls.some(w=>w.locked)||S.items.some(i=>i.locked)||S.wallCons?.length||S.roomCons?.length))){flash(t('draft_refused'),'error');return;}
  const requirements=checklistStatus(S,detectRooms()).filter(room=>!room.skipped&&(room.status==='unplaced'||replace&&room.status==='placed')).map(({id,type,name,width,depth})=>({id,type,name,...(width!=null?{width}:{}),...(depth!=null?{depth}:{})}));
  if(guide.rooms.some(room=>!room.skipped)&&!requirements.length){flash(t('draft_no_unplaced'),'error');return;}
  const boundary=boundaryText.trim()?parseXYList(boundaryText,'plan'):null;
  if(boundary&&!requirements.length){flash(t('draft_boundary_needs_rooms'),'error');return;}
  const params={size,replace,seed:1,furnish:false,openings:false,requirements,boundary};
  const prepared=prepareCommand(apartmentGenerateCommand,params,env());
  if(!prepared.ok){flash(t(prepared.message?.startsWith('requirements-')?'draft_requirements_failed':'draft_refused'),'error');return;}
  const stamp=fingerprint();activeStamp=stamp;worker=new Worker(new URL('./layout_worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{
   worker?.terminate();worker=null;
   if(stamp!==fingerprint()||!event.data.result.ok){flash(t('shape_refresh'),'error');changed();return;}
   const layout=event.data.result.layout;
   if(JSON.stringify(layout)!==JSON.stringify(prepared.plan.params.layout)){flash(t('draft_refused'),'error');return;}
   preview={prepared,stamp,layout};
   const bounds={minx:Math.min(...layout.rooms.map(r=>r.x0)),maxx:Math.max(...layout.rooms.map(r=>r.x1)),minz:Math.min(...layout.rooms.map(r=>r.z0)),maxz:Math.max(...layout.rooms.map(r=>r.z1))};frameBounds(bounds);
   renderAgentPreview({kind:'batch',previews:layout.rooms.map(r=>({kind:'room',outline:[{x:r.x0,z:r.z0},{x:r.x1,z:r.z0},{x:r.x1,z:r.z1},{x:r.x0,z:r.z1}]}))});changed();
  };
  worker.onerror=()=>{worker?.terminate();worker=null;flash(t('draft_refused'),'error');changed();};
  worker.postMessage({id:1,mode:'draft',snapshot:{...params,state:{nodes:S.nodes,items:S.items}}});changed();
 }));
 if(worker)node.append(el('p',t('layout_working')));
 if(preview){
  const counts={};preview.layout.rooms.forEach(r=>{const type=roomTypeOf(r);counts[type]=(counts[type]||0)+1;});
  const required={};guide.rooms.filter(r=>!r.skipped).forEach(r=>{required[r.type]=(required[r.type]||0)+1;});
  const unmet=Object.entries(required).filter(([type,count])=>(counts[type]||0)<count).map(([type])=>type);
  node.append(el('p',t('draft_summary').replace('{n}',preview.layout.rooms.length).replace('{unmet}',unmet.join(', ')||t('draft_none'))));
  for(const room of preview.layout.rooms){
   const width=Number((room.x1-room.x0-10).toFixed(2)),depth=Number((room.z1-room.z0-10).toFixed(2));
   node.append(el('p',t('draft_room_detail').replace('{name}',room.name).replace('{w}',width).replace('{d}',depth),'guide-note'));
  }
  node.append(button('draft_apply',()=>{
   if(preview.stamp!==fingerprint()){flash(t('shape_refresh'),'error');preview=null;changed();return;}
   const result=executeCommand(apartmentGenerateCommand,preview.prepared.params,env(),{label:t('draft_apply')});
   if(!result.ok){flash(t('draft_refused'),'error');return;}
   preview=null;clearAgentPreview();withoutRoomPrompts(refreshTree);S.dirty3D=true;render2D();changed();
  }));
 }
 node.append(button('layout_discard',()=>{worker?.terminate();worker=null;preview=null;clearAgentPreview();changed();}));
 node.append(el('p',t('draft_scope'),'guide-note'));return node;
}
watchPlanningActivity(()=>activeStamp&&(worker||preview)?{stamp:activeStamp,current:fingerprint()}:null,()=>{cancel();changed();});
