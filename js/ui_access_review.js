import {S} from './state.js';
import {t} from './i18n.js';
import {planningPlacementScene} from './planning_scene.js';
import {wallPointAt} from './geometry.js';
import {openingCorners} from './slab_openings.js';
import {watchPlanningActivity} from './planning_activity.js';
let worker=null,result=null,stamp=null;
const fingerprint=()=>JSON.stringify([S.nodes,S.walls,S.wallTypes,S.items,S.openings,S.slabOpenings,S.workspace]);
const notify=()=>window.dispatchEvent(new CustomEvent('planner-analysis-change'));
export function accessReviewSection(helpers,guide,edit){
 const {section,el,field,button}=helpers,node=section('access-review','access_title');
 if(stamp&&stamp!==fingerprint()){worker?.terminate();worker=null;result=null;stamp=null;}
 const select=el('select'),empty=el('option',t('access_choose'));empty.value='';select.append(empty);
 S.openings.filter(o=>o.type!=='window'&&(o.sill||0)<=0).forEach(o=>{const option=el('option',(o.type==='door'?t('door'):t('passage'))+' '+o.id);option.value=o.id;select.append(option);});
 select.value=guide.details.entrances[S.workspace.activeFloor]||'';
 select.addEventListener('change',()=>edit({action:'settings',entranceOpeningId:select.value}));node.append(field('access_entrance',select));
 const width=el('input');width.type='number';width.min='30';width.max='200';width.step='any';width.value=guide.details.routeWidth;
 width.addEventListener('change',()=>{if(width.reportValidity())edit({action:'settings',routeWidth:Number(width.value)});});node.append(field('access_width',width));
 node.append(button('access_check',()=>{
  worker?.terminate();result=null;stamp=fingerprint();const requested=stamp;
  const scene=planningPlacementScene(),doors=S.openings.filter(o=>o.type!=='window'&&(o.sill||0)<=0).map(o=>{
   const wall=S.walls.find(w=>w.id===o.wall);return wall?{id:o.id,wall:o.wall,s:o.s,width:o.width,center:wallPointAt(wall,o.s)}:null;
  }).filter(Boolean);
  worker=new Worker(new URL('./layout_worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{worker?.terminate();worker=null;if(requested===fingerprint())result=event.data.result.review;notify();};
  worker.onerror=()=>{worker?.terminate();worker=null;result={reason:'analysis-error',missingEntrance:false,walkable:null};notify();};
  worker.postMessage({id:1,mode:'review',snapshot:{scene,doors,voids:(S.slabOpenings||[]).map(openingCorners),entranceId:select.value,width:Number(width.value)}});notify();
 }));
 if(worker)node.append(el('p',t('layout_working')));
 if(result){
  if(result.missingEntrance)node.append(el('p',t('access_choose')));
  else{
   node.append(el('p',t('access_disconnected').replace('{n}',result.disconnected?.length||0)));
   node.append(el('p',result.walkable===null?t('guide_not_measurable'):t('access_walkable').replace('{n}',result.walkable.length)));
   if(result.blockedItems?.length)node.append(el('p',t('access_items').replace('{ids}',result.blockedItems.join(', '))));
   if(result.reason)node.append(el('p',t('access_unresolved')));
  }
 }
 node.append(button('layout_discard',()=>{worker?.terminate();worker=null;result=null;stamp=null;notify();}));
 node.append(el('p',t('access_scope'),'guide-note'));return node;
}
watchPlanningActivity(()=>stamp&&(worker||result)?{stamp,current:fingerprint()}:null,()=>{worker?.terminate();worker=null;result=null;stamp=null;notify();});
