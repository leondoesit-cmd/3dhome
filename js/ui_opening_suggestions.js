import {S} from './state.js';
import {t} from './i18n.js';
import {detectRooms,wallGeom} from './geometry.js';
import {previewPlannerCommand,executePlannerProposal} from './interaction.js';
import {renderAgentPreview,clearAgentPreview} from './agent_preview.js';
import {currentHistoryId} from './history.js';
import {flash} from './ui.js';
import {watchPlanningSection} from './planning_activity.js';
const stamp=()=>JSON.stringify([currentHistoryId(),S.nodes,S.walls,S.openings,S.workspace,S.sel]);
export function openingSuggestionSection(room,helpers){
 const {section,el,field,button,choices}=helpers,node=section('opening-suggestions','opening_suggest_title');let type='window',preview=null,version=null;
 watchPlanningSection('opening',node,()=>preview?{stamp:version,current:stamp()}:null,()=>{preview=null;clearAgentPreview();});
 const rooms=detectRooms(),walls=S.walls.filter(w=>room.key.split(',').includes(String(w.id))&&rooms.filter(r=>r.key.split(',').includes(String(w.id))).length===1);
 const wall=el('select');walls.forEach(w=>{const option=el('option',t('wall')+' '+w.id);option.value=w.id;wall.append(option);});
 node.append(field('opening_suggest_wall',wall),field('opening_suggest_type',choices([['window','window'],['door','door']],type,value=>{type=value;preview=null;clearAgentPreview();})));
 const exposed=el('input');exposed.type='checkbox';node.append(field('opening_suggest_exposure',exposed));
 const invalidate=()=>{preview=null;version=null;clearAgentPreview();};
 wall.addEventListener('change',invalidate);exposed.addEventListener('change',invalidate);
 node.append(button('opening_suggest_preview',()=>{
  if(!exposed.checked){flash(t('opening_suggest_confirm'),'error');return;}
  const host=S.walls.find(w=>String(w.id)===wall.value);if(!host)return;
  const geometry=wallGeom(host);preview=null;
  for(const fraction of [.5,.25,.75,.125,.875]){
   const candidate=previewPlannerCommand('opening.place',{wallId:host.id,type,s:geometry.L*fraction});
   if(candidate.ok){preview=candidate;break;}
  }
  if(!preview){flash(t('opening_suggest_none'),'error');return;}
  version=stamp();renderAgentPreview(preview.preview);
 }));
 node.append(button('opening_suggest_apply',()=>{
  if(!exposed.checked||!preview||version!==stamp()){flash(t('shape_refresh'),'error');return;}
  const result=executePlannerProposal(preview);if(!result.ok){flash(t('opening_suggest_none'),'error');return;}
  preview=null;clearAgentPreview();
 }));
 node.append(button('layout_discard',()=>{preview=null;clearAgentPreview();}));
 node.append(el('p',t('opening_suggest_scope'),'guide-note'));return node;
}
