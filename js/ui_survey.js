import { S, uid } from './state.js';
import { st } from './survey_strings.js';
import { onLangChange } from './i18n.js';
import { normalizeSurvey, startSurvey, surveyProgress, recordObservation, markSurveyMission, createSurveyMissions, surveyTarget, surveyFingerprint, normalizeSurveyFeatures } from './survey.js';
import { prepareSurveyCorrection, applySurveyCorrection, currentSurveyDimension } from './survey_correction.js';
import { surveyStore, storeSurveyPhoto, surveyPhotoAttachments } from './survey_store.js';
import { practiceDocument, PRACTICE_SCENARIOS } from './survey_practice.js';
import { createSurveyExchange, parseSurveyExchange, SURVEY_GEOMETRY_FIELDS } from './survey_exchange.js';
import { beginHistoryTransaction, commitHistoryTransaction, abortHistoryTransaction, captureHistorySession, restoreHistorySession, onAfterRestore } from './history.js';
import { sceneObject, serialize, applyData, flash, refreshTree, fillProps } from './ui.js';
import { setTool } from './interaction.js';
import { cancelPlannerGesture } from './planner_input.js';
import { render2D, onAfterRender, fitView } from './plan2d.js';
import { sx, sz, rotatePx, centerOn } from './plan_view.js';
import { pointAtWall, wallCurveGeom } from './wall_curves.js';
import { footprint } from './layout_analysis.js';
import { detectRooms, wallPointAt, wallGeom } from './geometry.js';
import { switchFloor } from './floors.js';
import { select } from './ui_props.js';
import { requestRender, setOrbitCamera, getOrbitCamera, getNavigationView, restoreNavigationView } from './view3d.js';
import { normalizeNavigationProfile, navigationProfile, passageClearance } from './navigation_profile.js';
import { navigationPosition } from './navigation_geometry.js';
import { reviewAccess } from './access_review.js';
import { planningPlacementScene } from './planning_scene.js';
import { openingCorners } from './slab_openings.js';
import { redesignCommand } from './commands/redesign.js';
import { buildSurveyReport } from './survey_report.js';

let panel,body,launch,status,observationTarget=null,preview=null,activePhotos=[],lastSignature='',overlay,routeResult=null,routeOn=false,routeFingerprint='',practiceSaveTimer=null;
const surveyDrafts=new Map();
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
function handle(fn){return async()=>{try{await fn();}catch(error){console.error('Survey action failed',error);flash(st(error.message)==error.message?st('error'):st(error.message),'error');}};}
function button(key,fn){const b=el('button',st(key));b.type='button';b.dataset.surveyAction=key;b.onclick=handle(fn);return b;}
function field(key,input){const label=el('label',null,'survey-field');label.append(el('span',st(key)),input);return label;}
function input(type='text',value=''){const n=el('input');n.type=type;n.value=value;if(type==='number')n.step='any';return n;}
function selectBox(values,value){const n=el('select');for(const v of values){const o=el('option',st(v));o.value=v;n.append(o);}n.value=value;return n;}
function section(key){const n=el('details');n.append(el('summary',st(key)));return n;}
function transact(label,fn){
  if(S.workspace?.role==='viewer')throw new Error('READ_ONLY');
  const token=beginHistoryTransaction(st(label));
  try{fn();commitHistoryTransaction(token,st(label));}catch(e){abortHistoryTransaction(token);throw e;}
  S.dirty3D=true;render2D();refreshTree();fillProps();renderSurvey(true);
}
function targetFromSelection(){
  const sel=S.sel;if(!sel)return null;
  let id=sel.ref?.id;
  if(sel.kind==='room')id=S.roomMeta[sel.ref]?.hid||sel.ref;
  return id!=null?{kind:sel.kind,id,floorId:S.workspace.activeFloor}:null;
}
function focusTarget(target){
  if(!target)return;
  if(target.floorId!==S.workspace.activeFloor){Promise.resolve(switchFloor(target.floorId)).then(()=>focusTarget(target));return;}
  const obj=surveyTarget(S,target);
  if(target.kind==='room'){
    const key=Object.keys(S.roomMeta).find(k=>k===target.id||S.roomMeta[k].hid===target.id);
    if(key)select({kind:'room',ref:key});
  }else if(obj&&target.kind!=='floor')select({kind:target.kind,ref:obj});
  let p=obj?.x!=null?obj:obj?.points?.[0];
  if(target.kind==='wall'&&obj)p=S.nodes[obj.a];
  if(p){centerOn(p.x,p.z);setOrbitCamera({target:{x:p.x,y:80,z:p.z}});}
  render2D();requestRender();
}
export function openSurvey(){
  if(!panel)return;
  panel.hidden=false;renderSurvey(true);
}
export function closeSurvey(){panel.hidden=true;}
export function initSurvey(){
  const bar=document.getElementById('viewModePill');if(!bar)return;
  launch=button('title',openSurvey);launch.id='surveyBtn';launch.className='survey-launch';bar.after(launch);
  panel=el('aside',null,'survey-panel');panel.id='survey-panel';panel.hidden=true;panel.setAttribute('aria-label',st('title'));
  const head=el('div',null,'survey-head');head.append(el('strong',st('title')),button('close',closeSurvey));
  body=el('div',null,'survey-body');status=el('p',null,'survey-status');status.setAttribute('role','status');panel.append(head,status,body);document.body.append(panel);
  overlay=el('canvas');overlay.id='survey-plan-overlay';document.getElementById('view-2d').append(overlay);
  onAfterRender(()=>{paintSurvey2D();if(!panel.hidden)renderSurvey();if(S.workspace?.survey?.mode==='practice'){clearTimeout(practiceSaveTimer);practiceSaveTimer=setTimeout(()=>{surveyStore('put','practice-'+S.workspace.survey.scenario,{document:serialize(),session:captureHistorySession(true)}).catch(()=>{});},1200);}});
  onAfterRestore(()=>{preview=null;routeResult=null;renderSurvey(true);});
  window.addEventListener('planner-overlay-3d',e=>paintSurveyOverlay(e.detail.path,e.detail.label));
  onLangChange(()=>{launch.textContent=st('title');head.querySelector('strong').textContent=st('title');head.querySelector('button').textContent=st('close');renderSurvey(true);});
  surveyStore('get','practice-return').then(saved=>{if(saved&&S.workspace?.survey?.mode==='practice')openSurvey();}).catch(()=>{});
}
function renderSurvey(force=false){
  if(!panel||panel.hidden)return;
  const survey=normalizeSurvey(S.workspace.survey),progress=surveyProgress(S);
  const signature=JSON.stringify([survey,S.sel?.kind,S.sel?.ref?.id,S.sel?.kind==='room'?S.sel.ref:null,progress.missions.map(m=>m.stale),preview?.fingerprint]);
  if(!force&&(signature===lastSignature||body.contains(document.activeElement)))return;
  lastSignature=signature;
  const scroll=body.scrollTop;body.replaceChildren();
  status.textContent=survey.enabled?`${progress.checked}/${progress.total} ${st('progress')}`:'';
  if(!survey.enabled){
    body.append(button('property',()=>transact('property',()=>{S.workspace.survey=startSurvey(S);})),practiceChoices());return;
  }
  if(survey.mode==='practice')body.append(button('back',returnFromPractice));
  else body.append(practiceChoices());
  body.append(button(survey.paused?'resume':'pause',()=>transact('pause',()=>{S.workspace.survey={...survey,paused:!survey.paused};})));
  if(!survey.paused){
    const list=el('ol',null,'survey-missions');
    for(const m of progress.missions){const li=el('li'),b=el('button',`${m.complete?'✓':m.state==='skipped'?'↷':'○'} ${m.title||st(m.stage)}${m.stale?' · '+st('stale'):''}`);b.type='button';b.setAttribute('aria-current',String(m.id===survey.activeMission));b.onclick=()=>{S.workspace.survey.activeMission=m.id;observationTarget=m.target?.kind==='floor'?null:m.target;focusTarget(m.target);renderSurvey(true);};li.append(b);list.append(li);}body.append(list);
    const mission=survey.missions.find(m=>m.id===survey.activeMission)||survey.missions[0];
    if(mission){body.append(el('h3',mission.title||st(mission.stage)),el('p',st(mission.stage+'_help'),'survey-help'));body.append(missionForm(mission,survey));}
  }
  body.append(button('add',()=>transact('add',()=>{const target=targetFromSelection(),s=normalizeSurvey(S.workspace.survey);s.missions.push(...createSurveyMissions(S.workspace.activeFloor,target,'mission-'+uid()));S.workspace.survey=s;})));
  const evidence=section('evidence');for(const o of progress.observations){const row=el('div',null,'survey-evidence');row.append(el('strong',`${st(o.field)}: ${o.value??''} ${o.value==null?'':o.unit}`),el('span',`${st(o.status)}${o.stale?' · '+st('stale'):''} · ${st(o.source)} · ${st(o.reference)}`),el('p',o.note));evidence.append(row);}body.append(evidence);
  const captures=section('capture_records');
  for(const capture of survey.captures){const row=el('div');row.append(el('span',capture.source||capture.id),button('review_capture',async()=>{const {parseRoomScan,roomScanFromPoints}=await import('./room_scan.js');const original=capture.original;if(!original)throw new Error('SURVEY_FORMAT_INVALID');const parsed=original.cad?original:Array.isArray(original)?roomScanFromPoints(original):parseRoomScan({capturedRoom:original,units:capture.units||'m'});const scanner=await import('./ui_room_scan.js');scanner.openRoomScanModal(parsed);}));captures.append(row);}
  body.append(captures);
  const actions=el('div',null,'survey-actions');actions.append(button('capture',async()=>{const m=await import('./ui_room_scan.js');m.openRoomScanModal();}),button('feature',featureForm),button('export',exportSurvey),button('import',importSurvey),button('report',reportSurvey),button('baseline',saveBaseline),button('offline',prepareOffline));const features=section('feature');features.append(el('p',st('vertex_help')));for(const f of S.surveyFeatures||[]){const row=el('div');row.append(el('span',f.label||f.id),button('edit',()=>featureForm(f)),button('remove',()=>transact('feature',()=>{if(f.locked)throw new Error('SURVEY_LOCKED');S.surveyFeatures=S.surveyFeatures.filter(p=>p.id!==f.id);})));features.append(row);}body.append(actions,features,navigationForm());body.scrollTop=scroll;
}
function missionForm(mission,survey){
  const draftKey=JSON.stringify([S.workspace.documentKey||S.workspace.id,S.workspace.activeFloor,mission.id]);
  if(!surveyDrafts.has(draftKey))surveyDrafts.set(draftKey,{});
  const draft=surveyDrafts.get(draftKey);
  const keep=(key,node)=>{if(draft[key]!=null)node.value=draft[key];const remember=()=>{draft[key]=node.value;};node.addEventListener('input',remember);node.addEventListener('change',remember);};
  const form=el('div',null,'survey-form');
  form.append(button('mission_tool',()=>{setTool(({setup:'point',outline:'wall',openings:'door',levels:'slabvoid',fixtures:'select',site:'point',review:'select'})[mission.stage]);}));
  if(mission.stage==='setup'){
    const units=selectBox(['cm','mm','m','in','ft'],survey.unit),north=input('number',survey.north),datum=input('number',survey.datum),origin=Object.fromEntries(['x','y','z'].map(k=>[k,input('number',survey.origin[k])]));
    for(const [key,node] of Object.entries({units,north,datum,...origin}))keep('reference-'+key,node);
    form.append(field('unit',units),field('north',north),field('datum',datum));for(const k of ['x','y','z'])form.append(field('origin_'+k,origin[k]));
    form.append(button('save_reference',()=>transact('setup',()=>{const values=[north,datum,...Object.values(origin)].map(n=>Number(n.value));if(values.some(v=>!Number.isFinite(v)))throw new Error('SURVEY_VALUE_INVALID');S.workspace.survey={...normalizeSurvey(S.workspace.survey),unit:units.value,north:values[0],datum:values[1],origin:{x:values[2],y:values[3],z:values[4]}};})));
  }

  const targetLabel=el('p',observationTarget?`${st(observationTarget.kind)} ${observationTarget.id}`:st('no_target'));
  form.append(targetLabel,button('selected',()=>{observationTarget=targetFromSelection();renderSurvey(true);}));
  const fields=selectBox(['length','width','depth','height','thickness','sill','elevation','diagonal','s','x','y','z','note'],'length'),value=input('number'),unit=selectBox(['cm','mm','m','in','ft'],survey.unit),note=el('textarea');note.rows=3;
  const reference=selectBox(['interior','center'],'interior'),source=selectBox(['manual','scan'],'manual');
  for(const [key,node] of Object.entries({fields,value,unit,note,reference,source}))keep(key,node);
  form.append(field('field',fields),field('value',value),field('unit',unit),field('reference',reference),field('source',source),field('note',note));
  const observation=status=>({id:'observation-'+uid(),missionId:mission.id,target:observationTarget||mission.target,field:fields.value,value:value.value.trim()===''?null:Number(value.value),unit:unit.value,reference:reference.value,source:source.value,status,note:note.value,photos:activePhotos.slice()});
  const save=status=>{
    const o=observation(status);
    if(survey.mode==='practice'&&o.value!=null){const expected=currentSurveyDimension(o.target,o.field,practiceDocument(survey.scenario));if(expected!=null){const delta=Math.abs(o.value*({cm:1,mm:.1,m:100,in:2.54,ft:30.48}[o.unit])-expected);flash(delta<=.3?st('practice_match'):`${st('practice_difference')}: ${delta.toFixed(1)} cm`);if(delta>.3)o.status='entered';}}
    transact('record',()=>{S.workspace.survey=recordObservation(S,o);});activePhotos=[];
  };
  form.append(button('record',()=>save(source.value==='scan'?'estimated':'entered')),button('check',()=>save('checked')));
  form.append(button('correct',()=>{
    const o=observation('checked');if(o.value==null)throw new Error('SURVEY_VALUE_INVALID');
    preview=prepareSurveyCorrection(S,o);if(!preview.ok){const reason=preview.reason;preview=null;throw new Error(reason);}
    renderSurvey(true);requestRender();
  }));
  if(preview){const card=el('div',null,'survey-preview');card.append(el('p',`${st('changed_walls')}: ${preview.changedWalls.join(', ')||'0'}`),button('apply',()=>transact('correct',()=>{applySurveyCorrection(S,preview);S.workspace.survey=recordObservation(S,preview.observation);preview=null;select(null);})),button('discard',()=>{preview=null;renderSurvey(true);requestRender();}));form.append(card);}
  form.append(button('photos',()=>{const picker=input('file');picker.accept='image/jpeg,image/png,image/webp';picker.multiple=true;picker.onchange=handle(async()=>{const photos=[];for(const f of picker.files)photos.push(await storeSurveyPhoto(f));transact('photos',()=>{const s=normalizeSurvey(S.workspace.survey);s.photos.push(...photos);S.workspace.survey=s;});activePhotos.push(...photos.map(p=>p.id));flash(`${photos.length} ${st('photos')}`);});picker.click();}));
  const row=el('div',null,'survey-actions');
  row.append(button('finish',()=>transact('finish',()=>{S.workspace.survey=markSurveyMission(S,mission.id,'checked');const next=S.workspace.survey.missions.find(m=>m.state==='pending');if(next)S.workspace.survey.activeMission=next.id;})),button('skip',()=>transact('skip',()=>{S.workspace.survey=markSurveyMission(S,mission.id,'skipped',note.value);})));form.append(row);
  for(const [key,delta] of [['earlier',-1],['later',1]])form.append(button(key,()=>transact(key,()=>{const s=normalizeSurvey(S.workspace.survey),i=s.missions.findIndex(m=>m.id===mission.id),j=i+delta;if(j>=0&&j<s.missions.length)[s.missions[i],s.missions[j]]=[s.missions[j],s.missions[i]];S.workspace.survey=s;})));
  return form;
}
function practiceChoices(){const row=section('practice'),choice=selectBox(PRACTICE_SCENARIOS,'rectangle');row.append(choice,button('practice',()=>enterPractice(choice.value)));return row;}
export async function enterPractice(kind){
  clearTimeout(practiceSaveTimer);cancelPlannerGesture();
  if(S.workspace?.survey?.mode!=='practice')await surveyStore('put','practice-return',{document:serialize(),session:captureHistorySession(true),selection:targetFromSelection(),view:{mode:document.getElementById('center-canvas')?.classList.contains('max-view-3d')?'3d':document.getElementById('center-canvas')?.classList.contains('max-view-2d')?'plan':'split',SC:S.SC,OX:S.OX,OY:S.OY,orbit:getOrbitCamera(),navigation:getNavigationView()}});
  const saved=await surveyStore('get','practice-'+kind);
  try{await applyData(saved?.document||practiceDocument(kind));if(saved?.session)restoreHistorySession(saved.session);S.workspace.survey=startSurvey(S,'practice');S.workspace.survey.scenario=kind;preview=null;observationTarget=null;fitView();render2D();renderSurvey(true);}
  catch(error){await returnFromPractice();throw new Error('SURVEY_PRACTICE_ERROR',{cause:error});}
}
export async function returnFromPractice(){
  clearTimeout(practiceSaveTimer);const saved=await surveyStore('get','practice-return');if(!saved)return;
  await surveyStore('put','practice-'+S.workspace.survey.scenario,{document:serialize(),session:captureHistorySession(true)});
  await applyData(saved.document);restoreHistorySession(saved.session);
  S.SC=saved.view.SC;S.OX=saved.view.OX;S.OY=saved.view.OY;setOrbitCamera(saved.view.orbit);
  window.__setViewMode?.(saved.view.mode||'plan');restoreNavigationView(saved.view.navigation);
  if(saved.selection){const target=saved.selection,obj=surveyTarget(S,target);if(obj&&target.kind!=='floor')select({kind:target.kind,ref:target.kind==='room'?Object.keys(S.roomMeta).find(k=>k===target.id||S.roomMeta[k].hid===target.id):obj});}
  preview=null;observationTarget=null;await surveyStore('delete','practice-return');renderSurvey(true);render2D();
}
async function exportSurvey(){sceneObject(true);const survey=normalizeSurvey(S.workspace.survey),attachments=await surveyPhotoAttachments(survey);download(JSON.stringify(createSurveyExchange(S,attachments),null,2),'property.mfsurvey.json','application/json');}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importSurvey(){const picker=input('file');picker.accept='.json,.mfsurvey.json';picker.onchange=handle(async()=>{
  const file=picker.files[0];if(!file)return;const data=parseSurveyExchange(await file.text());
  if(data.scan){const scanner=await import('./ui_room_scan.js');scanner.openRoomScanModal(data.scan,data);return;}
  const dialog=el('dialog',null,'survey-dialog');dialog.append(el('h3',st('import')),el('p',`${data.geometry?.walls?.length||0} ${st('wall')} · ${data.survey.observations.length} ${st('evidence')}`));
  dialog.append(button('apply',async()=>{const before=captureHistorySession();try{
    for(const photo of data.attachments)await surveyStore('put',photo.id,photo);
    const token=beginHistoryTransaction(st('import'));
    try{const g=data.geometry||{};for(const key of SURVEY_GEOMETRY_FIELDS)S[key]=g[key]||(key==='roomMeta'?{}:[]);S.idc=Math.max(S.idc,...[...S.walls,...S.openings,...S.items,...S.markers].map(o=>typeof o.id==='number'?o.id+1:0));S.sel=null;if(S.mep){S.mep.nodes=data.mep?.nodes||[];S.mep.runs=data.mep?.runs||[];S.mep.routePolicy=data.mep?.routePolicy||{};}S.workspace.survey=data.survey;S.workspace.navigationProfile=data.navigationProfile;if(data.floors?.length){S.workspace.floors=data.floors;S.workspace.activeFloor=data.activeFloor;}commitHistoryTransaction(token);}catch(e){abortHistoryTransaction(token);throw e;}
    dialog.close();dialog.remove();S.dirty3D=true;fitView();render2D();renderSurvey(true);
  }catch(e){restoreHistorySession(before);throw e;}}),button('close',()=>{dialog.close();dialog.remove();}));document.body.append(dialog);dialog.showModal();
});picker.click();}
async function reportSurvey(){const reportWindow=window.open('','_blank');if(reportWindow)reportWindow.opener=null;try{sceneObject(true);const photos=await surveyPhotoAttachments(normalizeSurvey(S.workspace.survey),{allowMissing:true});const report=buildSurveyReport(S,photos,st);if(!reportWindow){download(report,'property-survey.html','text/html');return;}const url=URL.createObjectURL(new Blob([report],{type:'text/html'}));reportWindow.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){reportWindow?.close();throw error;}}
function saveBaseline(){transact('baseline',()=>{const p=redesignCommand.prepare({action:'start',id:'survey-baseline-'+uid(),name:st('title'),createdAt:Date.now()},{state:S,services:{sceneObject}});if(!p.ok)throw new Error(p.reason);redesignCommand.apply(p.plan,{state:S});S.workspace.survey.completedAt=Date.now();});}
function featureForm(existing=null){
  if(existing?.locked)throw new Error('SURVEY_LOCKED');
  const dialog=el('dialog',null,'survey-dialog'),kind=selectBox(['point','polyline','face'],'polyline'),label=input(),points=el('textarea');points.rows=7;if(existing){kind.value=existing.kind;label.value=existing.label;points.value=existing.points.map(p=>[p.x,p.y,p.z].join(' ')).join('\n');}
  dialog.append(el('h3',st('feature')),field('kind',kind),field('note',label),field('points',points));
  dialog.append(button('save',()=>{const rows=points.value.trim().split('\n').map(row=>row.trim().split(/[ ,]+/).map(Number));if(rows.some(r=>r.length!==3||r.some(v=>!Number.isFinite(v))))throw new Error('SURVEY_INVALID_GEOMETRY');const parsed=normalizeSurveyFeatures([{id:existing?.id||'feature-'+uid(),kind:kind.value,label:label.value,category:existing?.category||'site',points:rows.map(([x,y,z])=>({x,y,z}))}]);if(!parsed.length)throw new Error('SURVEY_INVALID_GEOMETRY');transact('feature',()=>{S.surveyFeatures=[...(S.surveyFeatures||[]).filter(f=>f.id!==existing?.id),...parsed];});dialog.close();dialog.remove();}),button('close',()=>{dialog.close();dialog.remove();}));document.body.append(dialog);dialog.showModal();
}
function navigationForm(){
  const box=section('navigation'),profile=navigationProfile(S),controls={};
  for(const key of ['radius','height','eyeHeight','stepHeight','slopeLimit','cameraDistance','cameraRadius','speed']){controls[key]=input('number',profile[key]);box.append(field(key,controls[key]));}
  box.append(button('save',()=>transact('navigation',()=>{S.workspace.navigationProfile=normalizeNavigationProfile(Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,Number(v.value)])));routeResult=null;})));
  const entrances=el('select');for(const o of S.openings.filter(o=>o.type!=='window')){const option=el('option',`${st('opening')} ${o.id}`);option.value=o.id;entrances.append(option);}box.append(field('entrance',entrances));
  const routes=input('checkbox');routes.checked=routeOn;
  routes.onchange=handle(()=>{routeOn=routes.checked;if(routeOn){const profile=navigationProfile(S),scene=planningPlacementScene(),rooms=detectRooms();const doors=S.openings.filter(o=>o.type!=='window'&&(o.type==='passage'||o.open===true)&&(o.sill||0)<=profile.stepHeight&&o.height>=profile.height).map(o=>({...o,center:wallPointAt(S.walls.find(w=>w.id===o.wall),o.s)}));routeFingerprint=surveyFingerprint(S,{kind:'floor',floorId:S.workspace.activeFloor,id:S.workspace.activeFloor});routeResult=reviewAccess({scene,doors,canOccupy:p=>navigationPosition(S,p,profile,rooms).clear,width:profile.radius*2,bodyHeight:profile.height,entranceId:entrances.value,voids:(S.slabOpenings||[]).map(openingCorners)});}else routeResult=null;render2D();requestRender();});box.append(field('routes',routes));return box;
}
async function prepareOffline(){const mod=await import('./survey_offline.js');await mod.prepareSurveyOffline();flash(st('offline_ready'));}
function paintSurveyOverlay(path,label){
  if(!S.workspace.survey?.enabled)return;
  for(const f of S.surveyFeatures||[])path(f.points,'#909bff',f.kind==='face');
  if(preview){
    const color='#ff9138',after=preview.after,before=preview.before,changed=new Set(preview.changedWalls);
    const prism=(points,bottom,top)=>{const lo=points.map(p=>({...p,y:bottom})),hi=points.map(p=>({...p,y:top}));path(lo,color,true);path(hi,color,true);for(let i=0;i<lo.length;i++)path([lo[i],hi[i]],color);};
    for(const id of changed){
      const w=after.walls.find(w=>w.id===id),g=wallCurveGeom(w,after.nodes);if(!g)continue;
      const n=g.kind==='arc'?Math.max(2,Math.ceil(g.length/20)):1,points=Array.from({length:n+1},(_,i)=>pointAtWall(w,g.length*i/n,after.nodes));
      const bottom=w.elev||0,lo=points.map(p=>({...p,y:bottom})),hi=points.map(p=>({...p,y:bottom+w.height}));
      path(lo,color);path(hi,color);path([lo[0],hi[0]],color);path([lo[n],hi[n]],color);
      label({...points[Math.floor(n/2)],y:bottom+w.height},`${st('height')}: ${w.height.toFixed(1)} cm`);
    }
    for(const o of after.openings){
      if(!changed.has(o.wall)&&JSON.stringify(o)===JSON.stringify(before.openings.find(p=>p.id===o.id)))continue;
      const w=after.walls.find(w=>w.id===o.wall);if(!w)continue;
      const a=pointAtWall(w,o.s-o.width/2,after.nodes),b=pointAtWall(w,o.s+o.width/2,after.nodes),bottom=(w.elev||0)+(o.sill||0);
      path([{...a,y:bottom},{...b,y:bottom},{...b,y:bottom+o.height},{...a,y:bottom+o.height}],color,true);
      label({...a,y:bottom+o.height},`${o.width.toFixed(1)} × ${o.height.toFixed(1)} cm`);
    }
    for(const it of after.items)if(JSON.stringify(it)!==JSON.stringify(before.items.find(p=>p.id===it.id))){prism(footprint(it),it.elev||0,(it.elev||0)+it.h);label({...it,y:(it.elev||0)+it.h},`${it.w} × ${it.d} × ${it.h} cm`);}
    for(const marker of after.markers)if(JSON.stringify(marker)!==JSON.stringify(before.markers.find(p=>p.id===marker.id))){label(marker,`${marker.x}, ${marker.y||0}, ${marker.z} cm`);path([{...marker,x:marker.x-5},{...marker,x:marker.x+5}],color);}
  }
  const mission=S.workspace.survey.missions?.find(m=>m.id===S.workspace.survey.activeMission),target=observationTarget||mission?.target;
  if(target?.floorId===S.workspace.activeFloor){const obj=surveyTarget(S,target);if(target.kind==='wall'&&obj){path([S.nodes[obj.a],S.nodes[obj.b]],'#ffd04b');label(S.nodes[obj.a],st(mission?.stage||'target'));}}
  if(routeResult&&routeFingerprint!==surveyFingerprint(S,{kind:'floor',floorId:S.workspace.activeFloor,id:S.workspace.activeFloor})){routeResult=null;routeOn=false;}
  if(routeOn){for(const p of routeResult?.reachedPoints||[])path([{x:p.x-4,z:p.z-4},{x:p.x+4,z:p.z-4},{x:p.x+4,z:p.z+4},{x:p.x-4,z:p.z+4}],'#27bd9166',true);const profile=navigationProfile(S);for(const o of S.openings){if(o.type==='window')continue;const w=S.walls.find(w=>w.id===o.wall);if(!w)continue;const check=passageClearance(o.width,o.height,profile);if(!check.passable)label({...wallPointAt(w,o.s),y:o.height},`${st('navigation')}: ${check.width.toFixed(0)} / ${check.height.toFixed(0)} cm`);}
    for(const r of detectRooms()){if(routeResult?.walkable?.includes(r.key))path(r.pts,'#27bd91',true);else if(routeResult?.walkable)path(r.pts,'#ef795b',true);}
  }
}
function paintSurvey2D(){
  if(!overlay)return;const parent=overlay.parentElement,w=parent.clientWidth,h=parent.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(!w||!h)return;
  if(overlay.width!==Math.round(w*dpr)||overlay.height!==Math.round(h*dpr)){overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);}
  const c=overlay.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const project=p=>rotatePx(sx(p.x),sz(p.z));
  const path=(points,color,closed)=>{c.beginPath();points.forEach((p,i)=>{const q=project(p);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});if(closed)c.closePath();c.lineWidth=2;c.strokeStyle=color;c.stroke();};
  const label=(p,text)=>{const q=project(p);c.font='12px system-ui';c.fillStyle='#1a3547';c.fillRect(q.x-3,q.y-16,c.measureText(text).width+6,20);c.fillStyle='white';c.fillText(text,q.x,q.y);};
  paintSurveyOverlay(path,label);
}
