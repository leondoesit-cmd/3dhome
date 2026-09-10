import {S} from './state.js';
import {t} from './i18n.js';
import {detectRooms,reconcileRoomMeta} from './geometry.js';
import {roomSplitCommand} from './commands/room_split.js';
import {captureLock} from './constraint_engine.js';
import {prepareCommand,executeCommand} from './commands/executor.js';
import {beginHistoryTransaction,commitHistoryTransaction,abortHistoryTransaction,currentHistoryId} from './history.js';
import {renderAgentPreview,clearAgentPreview} from './agent_preview.js';
import {refreshTree,flash} from './ui.js';
import {withoutRoomPrompts} from './ui_tree.js';
import {render2D} from './plan2d.js';
import {watchPlanningSection,planningVersion} from './planning_activity.js';
const env=()=>({state:S,services:{detectRooms,captureLock},history:{begin:beginHistoryTransaction,commit:commitHistoryTransaction,abort:abortHistoryTransaction,current:currentHistoryId}});
export function roomSplitSection(room,helpers){
 const {section,el,field,button,choices}=helpers,node=section('room-split','split_title');let axis='x',preview=null,version=null;
 watchPlanningSection('split',node,()=>preview?{stamp:version,current:planningVersion()}:null,()=>{preview=null;clearAgentPreview();});
 node.append(field('split_axis',choices([['x','shape_width'],['z','shape_depth']],axis,value=>{axis=value;preview=null;clearAgentPreview();})));
 const distance=el('input');distance.type='number';distance.min='20';distance.step='any';distance.value=100;
 distance.addEventListener('change',()=>{preview=null;clearAgentPreview();});node.append(field('split_distance',distance),el('p',t('split_hint'),'guide-note'));
 node.append(button('split_preview',()=>{
  const result=prepareCommand(roomSplitCommand,{roomKey:room.key,axis,offset:Number(distance.value)},env());
  if(!result.ok){flash(t('split_refused'),'error');return;}
  preview=result;version=planningVersion();renderAgentPreview({kind:'wall',from:result.plan.params.from,to:result.plan.params.to});
 }));
 node.append(button('split_apply',()=>{
  if(!preview||version!==planningVersion()){flash(t('shape_refresh'),'error');return;}
  const fresh=prepareCommand(roomSplitCommand,preview.params,env());
  if(!fresh.ok||JSON.stringify(fresh.plan)!==JSON.stringify(preview.plan)){flash(t('shape_refresh'),'error');return;}
  const result=executeCommand(roomSplitCommand,preview.params,env(),{label:t('split_apply')});
  if(!result.ok){flash(t('split_refused'),'error');return;}
  preview=null;clearAgentPreview();reconcileRoomMeta();withoutRoomPrompts(refreshTree);S.sel=null;S.dirty3D=true;render2D();
 }));
 node.append(button('shape_discard',()=>{preview=null;clearAgentPreview();}));return node;
}
