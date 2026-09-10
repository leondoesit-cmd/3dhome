import {LAYOUT_TYPES} from '../layout_preferences.js';
import { roomPreset } from '../room_presets.js';
import { planningGuide } from '../planning_guide.js';
import { ROOM_FLOORS } from '../room_summary.js';

export const roomDetailsCommand=Object.freeze({
  id:'room.details',
  prepare(params,env){
    const state=env.state;
    if(state.workspace?.role==='viewer')return {ok:false,reason:'READ_ONLY'};
    const room=env.services.detectRooms().find(r=>r.key===params.roomKey);
    if(!room)return {ok:false,reason:'ROOM_NOT_FOUND'};
    const changes={};
    if(params.name!==undefined){
      if(typeof params.name!=='string')return {ok:false,reason:'INVALID_ROOM_NAME'};
      changes.name=params.name.trim().slice(0,80);
    }
    if(params.roomType!==undefined){
      if(!roomPreset(params.roomType))return {ok:false,reason:'INVALID_ROOM_TYPE'};
      changes.roomType=params.roomType;
    }
    if(params.floor!==undefined){
      if(!ROOM_FLOORS.includes(params.floor))return {ok:false,reason:'INVALID_FLOOR'};
      changes.floor=params.floor;
    }
    if(params.layoutPreferences!==undefined){
      const value=params.layoutPreferences,types=LAYOUT_TYPES;
      if(!value||!Array.isArray(value.required)||!Array.isArray(value.optional)||[...value.required,...value.optional].some(type=>!types.includes(type))||Object.entries(value.access||{}).some(([type,depth])=>!types.includes(type)||!Number.isFinite(depth)||depth<0||depth>200))return {ok:false,reason:'INVALID_LAYOUT_PREFERENCES'};
      changes.layoutPreferences={version:1,required:[...new Set(value.required)],optional:[...new Set(value.optional)].filter(type=>!value.required.includes(type)),access:{...(value.access||{})}};
    }
    if(params.wall!==undefined){
      if(!Number.isInteger(params.wall)||params.wall<0||params.wall>0xffffff)return {ok:false,reason:'INVALID_COLOR'};
      changes.wall=params.wall;
    }
    if(!Object.keys(changes).length)return {ok:false,reason:'EMPTY_EDIT'};
    return {ok:true,plan:{command:'room.details',params:{roomKey:room.key,changes}}};
  },
  apply(plan,env){
    const state=env.state,{roomKey,changes}=plan.params;
    const meta=state.roomMeta[roomKey] ||= {};
    Object.assign(meta,changes);
    if(changes.floor!==undefined)delete meta.floorTex;
    // An assigned checklist entry and its live room share identity and labels.
    const guide=planningGuide(state);
    guide.rooms.forEach(entry=>{
      if(meta.hid && entry.roomHid===meta.hid && entry.floorId===state.workspace.activeFloor){
        if(changes.name!==undefined)entry.name=changes.name;
        if(changes.roomType!==undefined)entry.type=changes.roomType;
      }
    });
    state.workspace.guidance=guide;
    return {ok:true,changed:[{kind:'room',id:roomKey},{kind:'project',id:state.workspace.id}],effects:{dirty3D:true,refreshInspector:true,refreshTree:true}};
  }
});
