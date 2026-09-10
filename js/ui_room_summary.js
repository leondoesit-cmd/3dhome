import {authoredShapeSection} from "./ui_shape_tools.js";
import {openingSuggestionSection} from "./ui_opening_suggestions.js";
import {roomSplitSection} from "./ui_room_split.js";
import {roomMergeSection} from "./ui_room_merge.js";
import { layoutToolsSection } from "./ui_layout_tools.js";
import { S } from './state.js';
import { t } from './i18n.js';
import { roomMeasurements, ROOM_FLOORS } from './room_summary.js';
import { ROOM_PRESETS } from './room_presets.js';
import { roomTypeOf } from './room_types.js';
import { select } from './ui_props.js';
import { disarmRoomStamp, setTool } from './interaction.js';
import {planningGuide} from './planning_guide.js';
import {toDisplayLength,fromDisplayLength} from './planning_units.js';

export function selectedRoomSection(room, helpers, edit, resize, area) {
  const {el,field,button,choices,section}=helpers;
  const node=section('selected-room','guide_selected_room');
  if(!room){node.append(el('p',t('guide_select_room_hint'),'guide-note'));return node;}
  const key=room.key, meta=S.roomMeta[key]||{};
  node.classList.add('guide-room');node.dataset.entryId='selected-room-'+key;
  const name=el('input');name.value=meta.name||'';name.maxLength=80;
  name.addEventListener('change',()=>edit({roomKey:key,name:name.value}));
  const types=[['','guide_untyped'],...ROOM_PRESETS.map(p=>[p.id,p.i18n])];
  const type=choices(types,roomTypeOf(meta)||'',value=>{if(value)edit({roomKey:key,roomType:value});});
  type.options[0].disabled=true;
  node.append(field('guide_name',name),field('guide_type',type));
  const unit=planningGuide(S).details.displayUnit||'cm',label=t('guide_unit_'+unit),unitText=key=>t(key).replace(t('guide_cm'),label);
  const measurement=roomMeasurements(S,room),fmt=n=>Number(toDisplayLength(n,unit).toFixed(4));
  if(measurement?.interior)node.append(el('p',unitText('guide_inner_dimensions').replace('{w}',fmt(measurement.interior.width)).replace('{d}',fmt(measurement.interior.depth))));
  else node.append(el('p',t('guide_inner_unavailable'),'guide-note'));
  if(measurement)node.append(el('p',unitText('guide_reference_dimensions').replace('{w}',fmt(measurement.referenceWidth)).replace('{d}',fmt(measurement.referenceDepth)),'guide-note'));
  const areaReadout=el('p',area?.area != null ? t('guide_area_room').replace('{n}',Number(area.area.toFixed(2))) : t('guide_area_unavailable'),'guide-note');
  areaReadout.dataset.guideArea='room';node.append(areaReadout);
  if(measurement?.interior){
    const form=el('div','','guide-actions');
    const width=el('input'),depth=el('input');
    for(const [input,value] of [[width,measurement.interior.width],[depth,measurement.interior.depth]]){
      input.type='number';input.min=String(toDisplayLength(20,unit));input.step='any';input.value=String(toDisplayLength(value,unit));
    }
    form.append(field('guide_resize_width',width),field('guide_resize_depth',depth));
    width.parentElement.firstChild.textContent=unitText('guide_resize_width');depth.parentElement.firstChild.textContent=unitText('guide_resize_depth');
    const apply=button('guide_resize_apply',()=>{
      if(width.reportValidity()&&depth.reportValidity())resize({roomKey:key,width:fromDisplayLength(Number(width.value),unit),depth:fromDisplayLength(Number(depth.value),unit)});
    });
    node.append(form,apply,el('p',t('guide_resize_hint'),'guide-note'));
  }
  const authored=authoredShapeSection(room,helpers);if(authored)node.append(authored);
  const details=section('selected-room-details','guide_room_details');
  const floor=choices(ROOM_FLOORS.map(id=>[id,'floor_'+id]),meta.floor||S.floorTex,value=>edit({roomKey:key,floor:value}));
  details.append(field('floor',floor));
  if(meta.floorTex)details.append(el('p',t('guide_floor_replace'),'guide-note'));
  const color=el('input');color.type='color';color.value='#'+(meta.wall??S.wallColor).toString(16).padStart(6,'0');
  color.addEventListener('change',()=>edit({roomKey:key,wall:parseInt(color.value.slice(1),16)}));
  details.append(field('guide_wall_finish',color));
  const wallIds=new Set(key.split(','));
  const openings=S.openings.filter(o=>wallIds.has(String(o.wall)));
  details.append(el('p',t('guide_room_openings').replace('{n}',openings.length),'guide-note'));
  function inspect(selection){
    disarmRoomStamp();setTool('select');select(selection);
    if(document.body.classList.contains('compact-nav'))document.querySelector('[data-mnav="props"]')?.click();
    else document.body.classList.add('show-right');
  }
  openings.forEach(o=>{
    const control=button('guide_edit_opening',()=>inspect({kind:'opening',ref:o}));
    control.textContent=t(o.type==='passage'?'passage':o.type==='window'?'window':'door')+' · '+fmt(o.width)+' '+label;
    control.dataset.openingId=String(o.id);details.append(control);
  });
  const actions=el('div','','guide-actions');
  for(const [label,tool] of [['guide_add_door','door'],['guide_add_window','window'],['guide_add_passage','passage']])actions.append(button(label,()=>{
    disarmRoomStamp();setTool(tool);window.dispatchEvent(new CustomEvent('planner-guide-place'));
  }));
  details.append(actions,el('p',t('guide_opening_hint'),'guide-note'));
  details.append(button('guide_room_advanced',()=>inspect({kind:'room',ref:key})));
  node.append(layoutToolsSection(room,helpers),roomMergeSection(room,helpers),roomSplitSection(room,helpers),openingSuggestionSection(room,helpers),details);return node;
}
