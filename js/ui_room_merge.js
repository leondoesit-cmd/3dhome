import {S} from './state.js';
import {t} from './i18n.js';
import {detectRooms,reconcileRoomMeta} from './geometry.js';
import {roomMergeCommand} from './commands/room_merge.js';
import {prepareCommand,executeCommand} from './commands/executor.js';
import {beginHistoryTransaction,commitHistoryTransaction,abortHistoryTransaction,currentHistoryId} from './history.js';
import {renderAgentPreview,clearAgentPreview} from './agent_preview.js';
import {refreshTree,flash} from './ui.js';
import {withoutRoomPrompts} from './ui_tree.js';
import {render2D} from './plan2d.js';
import {watchPlanningSection,planningVersion} from './planning_activity.js';
const env=()=>({state:S,services:{detectRooms},history:{begin:beginHistoryTransaction,commit:commitHistoryTransaction,abort:abortHistoryTransaction,current:currentHistoryId}});
export function roomMergeSection(room,helpers){
 const {section,el,field,button}=helpers,node=section('room-merge','merge_title');
 const own=new Set(room.key.split(',')),neighbors=detectRooms().filter(r=>r.key!==room.key&&r.key.split(',').some(id=>own.has(id)));
 if(!neighbors.length){node.append(el('p',t('merge_no_neighbor'),'guide-note'));return node;}
 const select=el('select');neighbors.forEach(r=>{const option=el('option',S.roomMeta[r.key]?.name||r.key);option.value=r.key;select.append(option);});
 let preview=null,version=null;const note=el('p',t('merge_hint'),'guide-note');
 watchPlanningSection('merge',node,()=>preview?{stamp:version,current:planningVersion()}:null,()=>{preview=null;clearAgentPreview();});
 select.addEventListener('change',()=>{preview=null;clearAgentPreview();});node.append(field('merge_neighbor',select),note);
 node.append(button('merge_preview',()=>{
  const result=prepareCommand(roomMergeCommand,{primary:room.key,secondary:select.value},env());
  if(!result.ok){flash(t('merge_refused'),'error');return;}
  preview=result;version=planningVersion();
  note.textContent=t('merge_effects').replace('{n}',result.plan.params.openingIds.length);
  renderAgentPreview({kind:'batch',previews:result.plan.params.outline.map(outline=>({kind:'room',outline}))});
 }));
 node.append(button('merge_apply',()=>{
  if(!preview||version!==planningVersion()){flash(t('shape_refresh'),'error');return;}
  const fresh=prepareCommand(roomMergeCommand,preview.params,env());
  if(!fresh.ok||JSON.stringify(fresh.plan)!==JSON.stringify(preview.plan)){flash(t('shape_refresh'),'error');preview=null;return;}
  const result=executeCommand(roomMergeCommand,preview.params,env(),{label:t('merge_apply')});
  if(!result.ok){flash(t('merge_refused'),'error');return;}
  preview=null;clearAgentPreview();reconcileRoomMeta();withoutRoomPrompts(refreshTree);S.dirty3D=true;S.sel=null;render2D();
 }));
 node.append(button('shape_discard',()=>{preview=null;clearAgentPreview();note.textContent=t('merge_hint');}));return node;
}
