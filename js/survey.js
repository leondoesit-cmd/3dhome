// Survey evidence is separate from model geometry. These records are plain
// JSON so the browser, native companions, history and exchange share a format.
import { PLANNING_UNITS } from './planning_units.js';
export const SURVEY_STAGES = Object.freeze(['setup','outline','openings','levels','fixtures','site','review']);
const text=(v,n=300)=>typeof v==='string'?v.trim().slice(0,n):'';
const clone=v=>JSON.parse(JSON.stringify(v));
const statuses=['estimated','entered','checked','unresolved'];
export function normalizeSurvey(raw) {
  const s=raw&&typeof raw==='object'?raw:{};
  const unique=list=>{const seen=new Set();return list.filter(v=>v&&text(v.id)&&!seen.has(v.id)&&seen.add(v.id));};
  return {version:1,enabled:s.enabled===true,paused:s.paused===true,mode:s.mode==='practice'?'practice':'property',
    activeMission:text(s.activeMission,100),unit:Object.hasOwn(PLANNING_UNITS,s.unit)?s.unit:'cm',
    origin:validPoint(s.origin)?clone(s.origin):{x:0,y:0,z:0},north:Number(s.north)||0,datum:Number(s.datum)||0,
    missions:unique((Array.isArray(s.missions)?s.missions:[]).slice(0,2000)).map(m=>({id:text(m.id,100),stage:SURVEY_STAGES.includes(m.stage)?m.stage:'outline',
      title:text(m.title),floorId:text(m.floorId,100),target:m.target&&typeof m.target==='object'?clone(m.target):null,
      state:['pending','checked','skipped'].includes(m.state)?m.state:'pending',note:text(m.note,2000),fingerprint:text(m.fingerprint,20000)})),
    observations:unique((Array.isArray(s.observations)?s.observations:[]).slice(0,20000)).map(o=>({id:text(o.id,100),missionId:text(o.missionId,100),
      target:o.target&&typeof o.target==='object'?clone(o.target):null,field:text(o.field,80),value:Number.isFinite(o.value)?o.value:null,
      unit:Object.hasOwn(PLANNING_UNITS,o.unit)?o.unit:'cm',reference:text(o.reference)||'interior',source:text(o.source)||'manual',
      status:statuses.includes(o.status)?o.status:'entered',note:text(o.note,4000),at:Number(o.at)||0,
      fingerprint:text(o.fingerprint,20000),photos:Array.isArray(o.photos)?o.photos.filter(x=>typeof x==='string').slice(0,40):[],
      previous:Array.isArray(o.previous)?clone(o.previous).slice(-30):[]})),
    captures:Array.isArray(s.captures)?clone(s.captures).slice(-200):[],
    checkpoints:Array.isArray(s.checkpoints)?clone(s.checkpoints).slice(-100):[],
    photos:Array.isArray(s.photos)?s.photos.filter(p=>p&&text(p.id)&&text(p.attachmentId)).map(p=>({id:text(p.id,100),attachmentId:text(p.attachmentId,100),name:text(p.name),mimeType:text(p.mimeType),at:Number(p.at)||0})):[],
    scenario:text(s.scenario,80),completedAt:Number(s.completedAt)||null};
}
export function validPoint(p) {return !!p&&['x','y','z'].every(k=>Number.isFinite(p[k]));}
export function normalizeSurveyFeatures(raw) {
  const seen=new Set();
  return (Array.isArray(raw)?raw:[]).slice(0,5000).flatMap(f=>{
    if(!f||!text(f.id)||seen.has(f.id)||!['point','polyline','face'].includes(f.kind))return [];
    if(!Array.isArray(f.points)||f.points.some(p=>!validPoint(p)))return [];
    const points=f.points.map(p=>({x:p.x,y:p.y,z:p.z}));
    if(points.length<(f.kind==='point'?1:f.kind==='face'?3:2))return [];
    if(f.kind==='point'&&points.length!==1)return [];
    if(f.kind==='face'){
      const a=points[0];let normal=null;
      for(let i=1;i<points.length-1;i++){const b=points[i],c=points[i+1],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},l=Math.hypot(n.x,n.y,n.z);if(l>.001){normal={x:n.x/l,y:n.y/l,z:n.z/l};break;}}
      if(!normal||points.some(p=>Math.abs((p.x-a.x)*normal.x+(p.y-a.y)*normal.y+(p.z-a.z)*normal.z)>.1))return [];
    }
    seen.add(f.id);return [{id:text(f.id,100),kind:f.kind,label:text(f.label),category:text(f.category)||'site',points,locked:!!f.locked}];
  });
}
export function surveyScene(state,floorId) {
  if(!floorId||floorId===state.workspace?.activeFloor)return state;
  const scene=state.workspace?.floors?.find(f=>f.id===floorId)?.scene;
  if(!scene)return null;
  return scene.spatial?{...scene,...scene.spatial,items:scene.spatial.instances,roomMeta:scene.spatial.rooms}:scene;
}
export function surveyTarget(state,target) {
  if(!target)return null;
  const scene=surveyScene(state,target.floorId);if(!scene)return null;
  const lists={wall:'walls',opening:'openings',item:'items',marker:'markers',feature:'surveyFeatures'};
  if(target.kind==='room')return Object.values(scene.roomMeta||{}).find(m=>m.hid===target.id)||scene.roomMeta?.[target.id]||null;
  if(target.kind==='floor')return scene;
  return (scene[lists[target.kind]]||[]).find(e=>String(e.id)===String(target.id))||null;
}
export function surveyFingerprint(state,target) {
  const scene=surveyScene(state,target?.floorId);if(!scene)return 'missing';
  const obj=surveyTarget(state,target);
  if(!obj)return 'missing';
  if(target.kind==='floor'||target.kind==='room')return fingerprint([scene.nodes,scene.walls,scene.openings,scene.items,scene.surveyFeatures]);
  return fingerprint(target.kind==='wall'?[obj,scene.nodes?.[obj.a],scene.nodes?.[obj.b],scene.openings?.filter(o=>String(o.wall)===String(obj.id))]:obj);
}
function fingerprint(value) {const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16);}
export function startSurvey(state,mode='property') {
  const s=normalizeSurvey(state.workspace?.survey);s.enabled=true;s.paused=false;s.mode=mode;
  if(!s.missions.length)s.missions=createSurveyMissions(state.workspace?.activeFloor||'floor-1');
  s.activeMission ||= s.missions[0]?.id||'';return s;
}
export function createSurveyMissions(floorId,target=null,prefix=floorId) {
  return SURVEY_STAGES.map(stage=>({id:`${prefix}-${stage}`,stage,title:'',floorId,target:target||{kind:'floor',id:floorId,floorId},state:'pending',note:'',fingerprint:''}));
}
export function surveyProgress(state) {
  const s=normalizeSurvey(state.workspace?.survey);
  const observations=s.observations.map(o=>({...o,stale:!!o.target&&o.fingerprint!==surveyFingerprint(state,o.target)}));
  const missions=s.missions.map(m=>{
    const evidence=observations.filter(o=>o.missionId===m.id);
    const stale=m.state==='checked'&&m.fingerprint!==surveyFingerprint(state,m.target);
    return {...m,stale,evidence,complete:m.state==='checked'&&!stale&&evidence.some(o=>o.status==='checked'&&!o.stale)};
  });
  return {missions,observations,checked:missions.filter(m=>m.complete).length,total:missions.length,skipped:missions.filter(m=>m.state==='skipped').length};
}
export function recordObservation(state,raw) {
  const s=normalizeSurvey(state.workspace?.survey);
  if(!s.missions.some(m=>m.id===raw.missionId))throw new Error('SURVEY_MISSION_MISSING');
  if(raw.value!=null&&(!Number.isFinite(raw.value)||Math.abs(raw.value)>1e9))throw new Error('SURVEY_VALUE_INVALID');
  if(raw.value==null&&!text(raw.note))throw new Error('SURVEY_EVIDENCE_REQUIRED');
  const prior=s.observations.find(o=>o.id===raw.id);
  const entry={...raw,source:raw.source||'manual',reference:raw.reference||'interior',status:raw.status||'entered',at:Date.now(),
    fingerprint:raw.target?surveyFingerprint(state,raw.target):'',previous:prior?[...(prior.previous||[]),{value:prior.value,note:prior.note,at:prior.at,source:prior.source}]:[]};
  s.observations=s.observations.filter(o=>o.id!==entry.id).concat(entry);
  return normalizeSurvey(s);
}
export function markSurveyMission(state,id,action,note='') {
  const s=normalizeSurvey(state.workspace?.survey),m=s.missions.find(m=>m.id===id);
  if(!m)throw new Error('SURVEY_MISSION_MISSING');
  if(action==='checked'){
    const evidence=surveyProgress(state).observations.filter(o=>o.missionId===id);
    if(!evidence.some(o=>o.status==='checked'&&!o.stale))throw new Error('SURVEY_CHECK_EVIDENCE');
    m.fingerprint=surveyFingerprint(state,m.target);
  }
  if(action==='skipped'&&!text(note))throw new Error('SURVEY_SKIP_REASON');
  m.state=action;m.note=text(note,2000);
  if(action==='checked')s.checkpoints.push({missionId:id,at:Date.now()});
  return normalizeSurvey(s);
}
export function surveyValueCm(value,unit) {
  if(!Object.hasOwn(PLANNING_UNITS,unit)||!Number.isFinite(value))throw new Error('SURVEY_UNIT_INVALID');
  return value*PLANNING_UNITS[unit];
}
