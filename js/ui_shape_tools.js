import {roomShapeEditCommand} from "./commands/room_shape_edit.js";
import {captureLock} from "./constraint_engine.js";
import {S} from './state.js';
import {t} from './i18n.js';
import {roomShapeCommand} from './commands/room_shape.js';
import {prepareCommand,executeCommand} from './commands/executor.js';
import {detectRooms,reconcileRoomMeta} from './geometry.js';
import {beginHistoryTransaction,commitHistoryTransaction,abortHistoryTransaction,currentHistoryId} from './history.js';
import {renderAgentPreview,clearAgentPreview} from './agent_preview.js';
import {render2D} from './plan2d.js';
import {refreshTree,flash} from './ui.js';
import {withoutRoomPrompts} from './ui_tree.js';
import {cancelLayoutAnalysis} from './ui_layout_tools.js';
import {resolveWallDrawDefaults} from './wall_draw.js';
import {watchPlanningActivity,planningVersion} from './planning_activity.js';
let draft={type:'L',x:0,z:0,width:400,depth:400,arm:150,roomType:'living',name:''},preview=null;
const env=()=>({state:S,services:{detectRooms,captureLock},history:{begin:beginHistoryTransaction,commit:commitHistoryTransaction,abort:abortHistoryTransaction,current:currentHistoryId}});
const stamp=planningVersion;
watchPlanningActivity(()=>preview?{stamp:preview.stamp,current:stamp()}:null,()=>{preview=null;clearAgentPreview();});
export function shapeToolsSection(helpers){
 const {section,field,el,button,choices}=helpers,node=section('room-shape','shape_title');
 node.append(field('shape_kind',choices(['L','T','U','custom'].map(id=>[id,'shape_'+id]),draft.type,value=>{draft.type=value;preview=null;clearAgentPreview();})));
 for(const key of ['x','z','width','depth','arm']){
  const input=el('input');input.type='number';input.step='any';input.value=draft[key];
  input.addEventListener('change',()=>{draft[key]=Number(input.value);preview=null;clearAgentPreview();});node.append(field('shape_'+key,input));
 }
 const points=el('textarea');points.rows=3;points.placeholder='0,0\n400,0\n400,300\n0,300';points.value=(draft.points||[]).map(p=>p.x+','+p.z).join('\n');
 points.addEventListener('change',()=>{draft.points=points.value.trim().split(/\n+/).map(line=>{const [x,z]=line.split(',').map(Number);return {x,z};});preview=null;clearAgentPreview();});node.append(field('shape_points',points));
 node.append(el('p',t('shape_hint'),'guide-note'));
 node.append(button('shape_preview',()=>{
  cancelLayoutAnalysis();const defaults=resolveWallDrawDefaults();
  const params={...draft,spec:{thickness:defaults.thickness,height:defaults.height,wallTypeId:defaults.typeId,kind:defaults.kind,loc:defaults.loc,dimSide:defaults.dimSide,datum:defaults.datum}};
  const prepared=prepareCommand(roomShapeCommand,params,env());
  if(!prepared.ok){flash(t('shape_invalid'),'error');preview=null;return;}
  preview={prepared,stamp:stamp()};renderAgentPreview({kind:'room',outline:prepared.plan.params.points});
 }));
 node.append(button('shape_place',()=>{
  if(!preview||preview.stamp!==stamp()){flash(t('shape_refresh'),'error');return;}
  const result=executeCommand(roomShapeCommand,preview.prepared.params,env(),{label:t('shape_place'),postValidate:()=>{
   const rooms=detectRooms();return rooms.some(room=>S.roomMeta[room.key]?.shape)?{ok:true}:{ok:false,reason:'NO_ROOM'};
  }});
  if(result.ok){reconcileRoomMeta();withoutRoomPrompts(refreshTree);S.dirty3D=true;preview=null;clearAgentPreview();render2D();}
  else flash(t('shape_invalid'),'error');
 }));
 node.append(button('shape_discard',()=>{preview=null;clearAgentPreview();}));return node;
}

export function authoredShapeSection(room,helpers){
 const shape=S.roomMeta[room.key]?.shape;
 if(!shape||!['L','T','U'].includes(shape.type))return null;
 const {section,field,el,button}=helpers,node=section('authored-shape','shape_edit_title'),inputs={};
 node.append(el('p',t('shape_'+shape.type)));
 for(const key of ['width','depth','arm']){
  const input=el('input');input.type='number';input.step='any';input.value=shape.parameters[key];inputs[key]=input;node.append(field('shape_'+key,input));
 }
 node.append(button('shape_apply_params',()=>{
  const result=executeCommand(roomShapeEditCommand,{roomKey:room.key,...Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,Number(input.value)]))},env(),{label:t('shape_apply_params'),postValidate:()=>detectRooms().some(r=>r.key===room.key)?{ok:true}:{ok:false,reason:'NO_ROOM'}});
  if(!result.ok){flash(t('shape_edit_refused'),'error');return;}
  reconcileRoomMeta();withoutRoomPrompts(refreshTree);S.dirty3D=true;render2D();
 }));return node;
}
