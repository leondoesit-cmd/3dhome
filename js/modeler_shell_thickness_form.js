import {shellFaceThicknesses} from './core/planar_shell_overrides.js';
import {featureControlValue} from './modeler_feature_form.js';

export function createShellOpeningFaceBrowser(host,{el,btn,getEntries,getSelected,onChange,label}) {
 const box=el('details','md-edge-browser'),summary=el('summary','','Browse body faces · Shell openings');
 box.appendChild(summary);host.appendChild(box);
 const choices=el('div','md-edge-browser-choices');box.appendChild(choices);
 const status=el('p','md-field-hint');status.setAttribute('role','status');box.appendChild(status);
 let signature='',buttons=[];
 function read(){
  const available=new Set(getEntries().filter(entry=>entry.kind==='face').map(entry=>entry.persistentId));
  const selected=getSelected();
  if(selected.some(entry=>!available.has(entry.persistentId)))throw new Error('Shell opening face is unavailable. Refresh exact faces or remove the selection; no face is substituted.');
  return selected;
 }
 function sync(){
  const entries=getEntries().filter(entry=>entry.kind==='face'),next=entries.map(entry=>entry.persistentId+'|'+label(entry)).join(';');
  if(signature!==next){
   const scroll=choices.scrollTop || 0;choices.innerHTML='';buttons=[];signature=next;
   entries.forEach((entry,index)=>{
    const button=btn('',()=>{
     const selected=getSelected(),active=selected.some(face=>face.persistentId===entry.persistentId);
     onChange(active?selected.filter(face=>face.persistentId!==entry.persistentId):selected.concat(entry));sync();
    },'md-wide');
    const marker=el('span','md-edge-browser-marker');marker.setAttribute('aria-hidden','true');button.appendChild(marker);
    button.appendChild(el('span','md-edge-browser-label',(index+1)+' · '+label(entry)));choices.appendChild(button);buttons.push({entry,button,marker});
   });choices.scrollTop=scroll;
  }
  const ids=new Set(getSelected().map(entry=>entry.persistentId));
  buttons.forEach(({entry,button,marker})=>{const selected=ids.has(entry.persistentId);button.setAttribute('aria-pressed',String(selected));marker.textContent=selected?'✓':'';});
  try{read();status.textContent=ids.size+' opening faces selected · thickness overrides are separate';status.removeAttribute('data-error');}
  catch(error){status.textContent=error.message;status.setAttribute('data-error','true');}
 }
 sync();return {sync,read,box};
}

export function readShellFaceThicknessRows(params,rows,choices,openingIds=[]) {
 const values=shellFaceThicknesses(rows,params.thickness,params.direction);
 const available=new Set(choices.filter(choice=>choice.entry.descriptor?.surface==='plane').map(choice=>choice.entry.persistentId)),removed=new Set(openingIds);
 for(const row of values){
  if(removed.has(row.facePersistentId))throw new Error('A thickness override cannot use a removed opening face');
  if(!available.has(row.facePersistentId))throw new Error('Retained face reference is unavailable. Refresh exact faces or remove the row; no face is substituted.');
 }
 return values;
}

export function createShellFaceThicknessEditor(host,options) {
 const {el,btn,field,t,getParams,getChoices,getOpeningIds,onChange,refresh,unit}=options;
 const box=el('div','md-shell-thicknesses'),rowHost=el('div','md-shell-thickness-rows'),status=el('p','md-field-hint');
 box.appendChild(el('b','',t('shellFaceThicknessTitle')));
 box.appendChild(el('p','md-field-hint',t('shellFaceThicknessHint')));
 const picker=field(box,{key:'$shellRetainedFace',label:t('shellRetainedFace'),type:'select',choices:[]},'');
 status.setAttribute('role','status');
 let controls=[];
 const choices=()=>getChoices();
 function read(){
  if(getParams().faceThicknesses!=null && !Array.isArray(getParams().faceThicknesses))
   throw new Error('Shell face thicknesses must be a list');
  const rows=controls.map(control=>({facePersistentId:control.id,thickness:featureControlValue(control)}));
  return readShellFaceThicknessRows(getParams(),rows,choices(),getOpeningIds());
 }
 function sync(){
  const selected=picker.value,used=new Set(controls.map(control=>control.id)),removed=new Set(getOpeningIds());
  picker.innerHTML='';
  const blank=el('option','',t('shellChooseRetainedFace'));blank.value='';picker.appendChild(blank);
  for(const choice of choices())if(!used.has(choice.entry.persistentId) && !removed.has(choice.entry.persistentId)){
   const option=el('option','',choice.label);option.value=choice.entry.persistentId;picker.appendChild(option);
  }
  picker.value=Array.from(picker.options).some(option=>option.value===selected)?selected:'';
  try{read();status.textContent=t('shellFaceThicknessReady');status.removeAttribute('data-error');}
  catch(error){status.textContent=error.message;status.setAttribute('data-error','true');}
 }
 function commit(){
  try{const rows=read();getParams().faceThicknesses=rows;sync();onChange();return true;}
  catch(error){status.textContent=error.message;status.setAttribute('data-error','true');return false;}
 }
 function render(){
  controls=[];rowHost.innerHTML='';
  const currentChoices=choices();
  for(const [index,saved] of (Array.isArray(getParams().faceThicknesses)?getParams().faceThicknesses:[]).entries()){
   const row=saved || {};
   const choice=currentChoices.find(item=>item.entry.persistentId===row.facePersistentId);
   const wrapper=el('div','md-shell-thickness-row');
   const label=el('p','md-field-hint',choice?.label || t('shellMissingFace'));label.title=row.facePersistentId;wrapper.appendChild(label);
   const definition={key:'$shellThickness'+index,label:t('shellFaceThickness')+' '+(index+1),type:'number',unit:'length',inputUnit:unit,min:1e-6,step:.1};
   const input=field(wrapper,definition,row.thickness),control={id:row.facePersistentId,input,field:definition};controls.push(control);
   input.addEventListener('input',commit);input.addEventListener('change',commit);
   wrapper.appendChild(btn(t('shellRemoveThickness'),()=>{getParams().faceThicknesses=(getParams().faceThicknesses || []).filter(item=>item.facePersistentId!==row.facePersistentId);render();onChange();},'md-wide'));
   rowHost.appendChild(wrapper);
  }
  sync();
 }
 box.appendChild(btn(t('shellAddThickness'),()=>{
  if(!picker.value)return;
  try{
   const rows=readShellFaceThicknessRows(getParams(),[...read(),{facePersistentId:picker.value,thickness:Number(getParams().thickness)}],choices(),getOpeningIds());
   getParams().faceThicknesses=rows;render();onChange();
  }catch(error){status.textContent=error.message;status.setAttribute('data-error','true');}
 },'md-wide'));
 const refreshButton=btn(t('shellRefreshFaces'),async()=>{
  refreshButton.disabled=true;status.textContent=t('shellRefreshingFaces');
  try{await refresh();sync();}
  catch(error){status.textContent=error.message;status.setAttribute('data-error','true');}
  finally{refreshButton.disabled=false;}
 },'md-wide');box.appendChild(refreshButton);box.appendChild(rowHost);box.appendChild(status);host.appendChild(box);render();
 return {read,sync,box};
}
