import {roomResizeCommand} from "./commands/room_resize.js";
import {checkRoomFit} from "./layout_analysis.js";
import {roomMeasurements} from "./room_summary.js";
import {detectRooms,wallPointAt} from "./geometry.js";
import {planningGuide} from './planning_guide.js';
import {openingCorners} from './slab_openings.js';
import {resizeSelectedRoom,editRoomDetails} from "./ui_planning_guide.js";
import {currentHistoryId} from "./history.js";
import {S} from './state.js';
import {FURN,flabel} from './furniture.js';
import {t} from './i18n.js';
import {planningPlacementScene} from './planning_scene.js';
import {doorSwingPolys,doorSwingBand,swingPolysForItem} from './swing_clearance.js';
import {previewPlannerCommand,executePlannerProposal} from './interaction.js';
import {renderAgentPreview,clearAgentPreview} from './agent_preview.js';
import {onAfterRender} from './plan2d.js';
import {roomTypeOf} from './room_types.js';
import {LAYOUT_TYPES,LAYOUT_ACCESS,defaultRequiredItems} from './layout_preferences.js';
let worker=null,revision=0,pending=null,result=null,selectedOption=0,lastRoom=null;
const required=new Map(),optional=new Map(),preferences=new Map();
const fingerprint=()=>JSON.stringify([currentHistoryId(),S.workspace?.activeFloor,S.workspace?.documentKey,S.workspace?.role,S.workspace?.guidance,S.nodes,S.walls,S.wallTypes,S.openings,S.items,S.slabOpenings,S.roomMeta,S.workspace?.redesign]);
const changed=()=>window.dispatchEvent(new CustomEvent('planner-analysis-change'));
export function cancelLayoutAnalysis(){
 worker?.terminate();worker=null;pending=null;result=null;revision++;clearAgentPreview();changed();
}
function present(){
 clearAgentPreview();
 if(result?.size&&pending){
  const prepared=roomResizeCommand.prepare({roomKey:pending.roomKey,...result.size,preserveContents:true},{state:S,services:{detectRooms}});
  if(prepared.ok){
   const moved=new Map(prepared.plan.params.nodes.map(n=>[n.index,n]));
   const ids=new Set(pending.roomKey.split(','));
   const points=S.walls.filter(w=>ids.has(String(w.id))).flatMap(w=>[w.a,w.b]).map(i=>moved.get(i)||S.nodes[i]);
   const x0=Math.min(...points.map(p=>p.x)),x1=Math.max(...points.map(p=>p.x)),z0=Math.min(...points.map(p=>p.z)),z1=Math.max(...points.map(p=>p.z));
   renderAgentPreview({kind:'room',outline:[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}]});
  }
 }
 const option=result?.options?.[selectedOption];
 if(option)renderAgentPreview({kind:'items',items:option.moves.map(i=>({center:{x:i.x,z:i.z},width:i.w,depth:i.d,rotation:i.rot}))});
}
export function roomFitSnapshot(roomKey){
 const scene=planningPlacementScene();
 const guide=planningGuide(S),doors=S.openings.filter(o=>o.type!=='window'&&(o.sill||0)<=0).flatMap(o=>{const wall=S.walls.find(w=>w.id===o.wall);return wall?[{id:o.id,wall:o.wall,s:o.s,width:o.width,center:wallPointAt(wall,o.s)}]:[];});
 const snapshot={scene,roomKey,interiorBounds:roomMeasurements(S,detectRooms().find(r=>r.key===roomKey))?.interiorBounds,preferences:preferences.get(roomKey)||{},required:(required.get(roomKey)||[]).map(type=>({type,w:FURN[type].w,d:FURN[type].d,h:FURN[type].h})),
  optional:(optional.get(roomKey)||[]).filter(type=>!(required.get(roomKey)||[]).includes(type)).map(type=>({type,w:FURN[type].w,d:FURN[type].d,h:FURN[type].h})),
  itemSwings:Object.fromEntries(S.items.map(item=>[item.id,swingPolysForItem(item).map(sw=>({points:sw.poly,elev:sw.band.lo,h:sw.band.hi-sw.band.lo}))])),
  swingTemplates:Object.fromEntries(LAYOUT_TYPES.filter(type=>FURN[type]).map(type=>{const spec=FURN[type],item={id:'template',type,w:spec.w,d:spec.d,h:spec.h,x:0,z:0,rot:0};return [type,swingPolysForItem(item).map(sw=>({points:sw.poly,elev:sw.band.lo,h:sw.band.hi-sw.band.lo}))];})),
  access:{doors,voids:(S.slabOpenings||[]).map(openingCorners),entranceId:guide.details.entrances[S.workspace.activeFloor],width:guide.details.routeWidth},
  fixedIds:S.items.filter(i=>i.pinned||i.fixed||i.rotUser||i.mep).map(i=>i.id),
  doorSwings:S.openings.flatMap(o=>{const band=doorSwingBand(o);return doorSwingPolys(o).map(points=>({id:o.id,points,elev:band.lo,h:band.hi-band.lo}));})};
 return snapshot;
}
export function currentRoomFit(roomKey){return checkRoomFit(roomFitSnapshot(roomKey));}
export function startLayoutAnalysis(roomKey,mode){
 worker?.terminate();clearAgentPreview();result=null;selectedOption=0;
 const snapshot=roomFitSnapshot(roomKey);
 const id=++revision;pending={id,roomKey,mode,fingerprint:fingerprint(),seenVisible:false};
 worker=new Worker(new URL('./layout_worker.js',import.meta.url),{type:'module'});
 worker.onmessage=event=>{
  if(event.data.id!==pending?.id)return;
  worker.terminate();worker=null;
  if(fingerprint()!==pending.fingerprint){result={ok:false,reason:'stale'};pending=null;}
  else result=event.data.result;
  present();changed();
 };
 worker.onerror=()=>{worker?.terminate();worker=null;result={ok:false,reason:'analysis-error'};changed();};
 worker.postMessage({id,snapshot,mode});changed();
}
export function applyLayoutAnalysis(){
 if(!pending||pending.fingerprint!==fingerprint()){cancelLayoutAnalysis();return {ok:false,reason:'PREVIEW_INVALIDATED'};}
 if(result?.size){const applied=resizeSelectedRoom({roomKey:pending.roomKey,...result.size,preserveContents:true,generated:true});if(applied.ok)cancelLayoutAnalysis();return applied;}
 const option=result?.options?.[selectedOption];if(!option)return {ok:false,reason:'NO_OPTION'};
 const commands=option.moves.map(item=>(String(item.id).startsWith('new-')||String(item.id).startsWith('optional-'))
  ?previewPlannerCommand('item.place',{type:item.type,x:item.x,z:item.z,rot:item.rot,w:item.w,d:item.d,h:item.h})
  :previewPlannerCommand('item.move',{itemId:item.id,x:item.x,z:item.z,rot:item.rot,rotationProvenance:'automatic'}));
 if(commands.some(c=>!c.ok))return {ok:false,reason:'PREVIEW_INVALIDATED'};
 const roomKey=pending.roomKey;
 const applied=executePlannerProposal({commands},{postValidate:()=>currentRoomFit(roomKey).length===0?{ok:true}:{ok:false,reason:'LAYOUT_NO_LONGER_FITS'}});
 if(applied.ok)cancelLayoutAnalysis();else{result={ok:false,reason:'apply-failed'};changed();}
 return applied;
}
export function layoutToolsSection(room,helpers){
 const {section,el,button,field}=helpers;
 const node=section('room-layout','layout_title');
 if(lastRoom!==room.key){worker?.terminate();worker=null;pending=null;result=null;clearAgentPreview();lastRoom=room.key;}
 const saved=S.roomMeta[room.key]?.layoutPreferences;
 if(saved){required.set(room.key,saved.required||[]);optional.set(room.key,saved.optional||[]);preferences.set(room.key,saved.access||{});}
 const save=()=>editRoomDetails({roomKey:room.key,layoutPreferences:{required:required.get(room.key)||[],optional:optional.get(room.key)||[],access:preferences.get(room.key)||{}}});
 if(!saved){
  optional.set(room.key,[]);preferences.set(room.key,{});
  required.set(room.key,defaultRequiredItems(roomTypeOf(S.roomMeta[room.key])).filter(type=>FURN[type]));
 }
 const select=el('select');select.multiple=true;select.size=4;
 for(const type of LAYOUT_TYPES.filter(type=>FURN[type])){
  const option=el('option',flabel(type));option.value=type;option.selected=required.get(room.key).includes(type);select.append(option);
 }
 select.addEventListener('change',()=>{required.set(room.key,[...select.selectedOptions].map(o=>o.value));cancelLayoutAnalysis();save();});
 node.append(field('layout_required',select));
 const optionalSelect=select.cloneNode(true);[...optionalSelect.options].forEach(o=>{o.selected=(optional.get(room.key)||[]).includes(o.value);});
 optionalSelect.addEventListener('change',()=>{optional.set(room.key,[...optionalSelect.selectedOptions].map(o=>o.value));cancelLayoutAnalysis();save();});node.append(field('layout_optional',optionalSelect));
 const accessSection=section('layout-access','layout_access_title');
 for(const [type,defaultDepth]of Object.entries(LAYOUT_ACCESS)){
  const input=el('input');input.type='number';input.min='0';input.max='200';input.step='any';input.value=preferences.get(room.key)?.[type]??defaultDepth;
  input.addEventListener('change',()=>{if(input.reportValidity()){preferences.set(room.key,{...(preferences.get(room.key)||{}),[type]:Number(input.value)});cancelLayoutAnalysis();save();}});
  const row=field('layout_access',input);row.firstChild.textContent=t('layout_access').replace('{type}',flabel(type));input.dataset.guideField='layout_access_'+type;accessSection.append(row);
 }
 node.append(accessSection);
 for(const [label,mode]of [['layout_check','check'],['layout_furnish','furnish'],['layout_rearrange','rearrange'],['layout_resize','size']])node.append(button(label,()=>startLayoutAnalysis(room.key,mode)));
 if(worker)node.append(el('p',t('layout_working')));
 if(result?.issues)node.append(el('p',result.issues.length?result.issues.map(issue=>t('layout_issue_'+issue.kind).replace('{id}',issue.itemId)).join(' · '):t('layout_clear')));
 if(result?.review){
  node.append(el('p',t(result.review.walkable==null?'layout_route_unresolved':result.review.walkable.includes(room.key)?'layout_route_found':'layout_route_blocked'),'guide-note'));
  if(result.review.blockedItems?.length)node.append(el('p',t('access_items').replace('{ids}',result.review.blockedItems.join(', ')),'guide-note'));
  node.append(button('access_title',()=>{const review=document.querySelector('[data-guide-section="access-review"]');if(review){review.open=true;review.scrollIntoView({block:'nearest'});}}));
 }
 if(result&&!result.ok)node.append(el('p',t('layout_failure_'+result.reason),'guide-note'));
 if(result?.blockedItems?.length)node.append(el('p',t('layout_blocked_items').replace('{items}',result.blockedItems.map(flabel).join(', ')),'guide-note'));
 if(result?.size){node.append(el('p',t('layout_size_preview').replace('{w}',Number(result.size.width.toFixed(2))).replace('{d}',Number(result.size.depth.toFixed(2)))));node.append(button('layout_apply',applyLayoutAnalysis));}
 if(result?.options){
  node.append(el('p',t('layout_preview_note')));
  const omitted=result.options[selectedOption].omitted||[];if(omitted.length)node.append(el('p',t('layout_omitted').replace('{items}',omitted.map(flabel).join(', '))));
  node.append(button('layout_apply',applyLayoutAnalysis));
  if(result.options.length>1)node.append(button('layout_more',()=>{selectedOption=(selectedOption+1)%result.options.length;present();changed();}));
 }
 if(pending||worker||result)node.append(button('layout_discard',cancelLayoutAnalysis));
 node.append(el('p',t('layout_scope'),'guide-note'));return node;
}
onAfterRender(()=>{
 if(!pending)return;
 const host=document.getElementById('planningGuide');
 if(host?.getClientRects().length)pending.seenVisible=true;
 if((pending.seenVisible&&!host?.getClientRects().length)||S.sel?.kind!=='room'||S.sel.ref!==pending.roomKey||fingerprint()!==pending.fingerprint){cancelLayoutAnalysis();return;}
 if(result?.options||result?.size)present();
});
