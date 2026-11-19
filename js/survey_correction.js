import { S } from './state.js';
import { roomResizeCommand } from './commands/room_resize.js';
import { roomMeasurements } from './room_summary.js';
import { wallCurveGeom } from './wall_curves.js';
import { detectRooms, setWallEnd, wallClearLength, wallGeom } from './geometry.js';
import { isLayerLocked, layerOf } from './layers.js';
import { fitWallClearLength } from './constraint_engine.js';
import { solveWallCons, conSatisfied } from './wall_constraints.js';
import { surveyTarget, surveyScene, surveyValueCm } from './survey.js';

const fields=['markers','nodes','walls','wallTypes','openings','items','roomMeta','wallCons','roomCons','planVars'];
const clone=v=>JSON.parse(JSON.stringify(v));
const roomKey=(state,target)=>Object.keys(state.roomMeta||{}).find(k=>k===String(target.id)||String(state.roomMeta[k].hid)===String(target.id));
export function surveyGeometrySnapshot(state=S) { return Object.fromEntries(fields.map(k=>[k,clone(state[k]||(['roomMeta'].includes(k)?{}:[]))])); }
// Existing geometry/constraint math uses S. Evaluate it synchronously on a
// detached document and restore every reference before any frame can paint.
function withGeometry(geometry,fn) {
  const previous=Object.fromEntries(fields.map(k=>[k,S[k]])),revision=S.spatial.revision;
  try {for(const key of fields)S[key]=geometry[key];return fn();}
  finally {for(const key of fields)S[key]=previous[key];S.spatial.revision=revision;}
}
export function currentSurveyDimension(target,field,state=S) {
  const scene=surveyScene(state,target?.floorId);
  const obj=surveyTarget(state,target);if(!obj)return null;
  if(target.kind==='room'&&['width','depth'].includes(field))return withGeometry(surveyGeometrySnapshot(scene),()=>roomMeasurements(S,detectRooms().find(r=>r.key===roomKey(S,target)))?.interior?.[field]??null);
  if(target.kind==='wall'&&field==='length')return withGeometry(surveyGeometrySnapshot(scene),()=>wallClearLength(S.walls.find(w=>String(w.id)===String(target.id))));
  const aliases={width:target.kind==='item'?'w':'width',height:target.kind==='item'?'h':'height',depth:'d',elevation:'elev'};
  const value=obj[aliases[field]||field];return Number.isFinite(value)?value:null;
}
function correctionSignature(state){
  return JSON.stringify([surveyGeometrySnapshot(state),state.workspace?.activeFloor,state.workspace?.role,
    state.structLocked,state.layers,state.workspace?.constraints]);
}
export function prepareSurveyCorrection(state,observation) {
  if(state.workspace?.role==='viewer')return {ok:false,reason:'READ_ONLY'};
  const target=observation.target,original=surveyTarget(state,target);
  // A pre-split reading describes the full former span, not its first fragment.
  if(target?.splitWallIds?.length)return {ok:false,reason:'SURVEY_MORE_MEASUREMENTS'};
  if(!target||target.floorId!==state.workspace.activeFloor||!original)return {ok:false,reason:'SURVEY_TARGET_MISSING'};
  const field=observation.field,value=surveyValueCm(observation.value,observation.unit);
  if(!Number.isFinite(value)||(value<0&&!['x','y','z','elevation'].includes(field)))return {ok:false,reason:'SURVEY_VALUE_INVALID'};
  if((state.structLocked&&['wall','room','opening'].includes(target.kind))||isLayerLocked(layerOf(target.kind))||original.locked||original.lock)return {ok:false,reason:'SURVEY_LOCKED'};
  const before=surveyGeometrySnapshot(state),after=clone(before);
  let reason=null;
  try {withGeometry(after,()=>{
    const obj=surveyTarget(S,target);
    if(target.kind==='room'&&['width','depth'].includes(field)){
      const key=roomKey(S,target),room=detectRooms().find(r=>r.key===key),measurement=roomMeasurements(S,room);
      if(!measurement?.interior)throw new Error('SURVEY_MORE_MEASUREMENTS');
      const dimensions={...measurement.interior};
      dimensions[field]=value-(observation.reference==='center'?measurement[field==='width'?'referenceWidth':'referenceDepth']-dimensions[field]:0);
      const env={state:S,services:{detectRooms}};
      const prepared=roomResizeCommand.prepare({roomKey:key,...dimensions,preserveContents:true},env);
      if(!prepared.ok)throw new Error(['ROOM_LOCKED','RESIZE_OPENING'].includes(prepared.reason)?(prepared.reason==='ROOM_LOCKED'?'SURVEY_LOCKED':'SURVEY_OPENING_CONFLICT'):'SURVEY_MORE_MEASUREMENTS');
      roomResizeCommand.apply(prepared.plan,env);
    }else if(target.kind==='wall'&&field==='length'){
      if(value<=0||wallCurveGeom(obj,S.nodes)?.kind==='arc')throw new Error('SURVEY_MORE_MEASUREMENTS');
      const dimension=()=>observation.reference==='center'?wallGeom(obj).L:wallClearLength(obj);
      if(observation.reference==='center'){const g=wallGeom(obj);setWallEnd(obj,'b',{x:g.a.x+g.ux*value,z:g.a.z+g.uz*value});}
      else fitWallClearLength(obj,value,'b');
      solveWallCons();
      if(Math.abs(dimension()-value)>.3)throw new Error('SURVEY_CONSTRAINT_CONFLICT');
    }else{
      const allowed={wall:['height','thickness'],opening:['width','height','sill','s'],item:['width','depth','height','elevation'],marker:['x','y','z']};
      if(!allowed[target.kind]?.includes(field))throw new Error('SURVEY_MORE_MEASUREMENTS');
      if(value===0&&!['sill','elevation','s','x','y','z'].includes(field))throw new Error('SURVEY_VALUE_INVALID');
      const aliases={width:target.kind==='item'?'w':'width',height:target.kind==='item'?'h':'height',depth:'d',elevation:'elev'};
      obj[aliases[field]||field]=value;
    }
    for(let i=0;i<S.nodes.length;i++){const old=before.nodes[i];if((old?.pinned||old?.locked||old?.fixed)&&JSON.stringify(old)!==JSON.stringify(S.nodes[i]))throw new Error('SURVEY_LOCKED');}
    for(const w of S.walls){
      const g=wallGeom(w);if(!g||g.L<.1)throw new Error('SURVEY_INVALID_GEOMETRY');
      const old=before.walls.find(o=>o.id===w.id);
      if(old?.locked||old?.lock){
        if(JSON.stringify([w,S.nodes[w.a],S.nodes[w.b]])!==JSON.stringify([old,before.nodes[old.a],before.nodes[old.b]]))throw new Error('SURVEY_LOCKED');
      }
      const ops=S.openings.filter(o=>String(o.wall)===String(w.id));
      for(const o of ops){
        if(o.s-o.width/2<-.01||o.s+o.width/2>g.L+.01||(o.sill||0)+o.height>w.height+.01)throw new Error('SURVEY_OPENING_CONFLICT');
        if(ops.some(p=>p!==o&&Math.abs(p.s-o.s)<(p.width+o.width)/2-.01&&Math.min((p.sill||0)+p.height,(o.sill||0)+o.height)>Math.max(p.sill||0,o.sill||0)))throw new Error('SURVEY_OPENING_CONFLICT');
      }
    }
    if((S.wallCons||[]).some(c=>!c.suppressed&&!c.report&&!conSatisfied(c)))throw new Error('SURVEY_CONSTRAINT_CONFLICT');
  });}catch(error){reason=error.message;}
  if(reason)return {ok:false,reason};
  const changedWalls=after.walls.filter(w=>{const old=before.walls.find(o=>o.id===w.id);return JSON.stringify([w,after.nodes[w.a],after.nodes[w.b]])!==JSON.stringify([old,before.nodes[old?.a],before.nodes[old?.b]]);}).map(w=>w.id);
  return {ok:true,before,after,changedWalls,observation:clone(observation),fingerprint:correctionSignature(state)};
}
export function applySurveyCorrection(state,prepared) {
  if(!prepared?.ok||prepared.fingerprint!==correctionSignature(state))throw new Error('SURVEY_PREVIEW_STALE');
  for(const key of fields)state[key]=clone(prepared.after[key]);
}
