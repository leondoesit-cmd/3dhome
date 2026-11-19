import { normalizeSurvey, normalizeSurveyFeatures, surveyValueCm } from './survey.js';
import { normalizeNavigationProfile } from './navigation_profile.js';
import { parseRoomScan } from './room_scan.js';
export const SURVEY_GEOMETRY_FIELDS=['nodes','walls','wallTypes','openings','items','roomMeta','markers','slabOpenings','wallCons','roomCons','planVars','surveyFeatures'];
const copy=v=>JSON.parse(JSON.stringify(v));
export function createSurveyExchange(state,attachments=[]) {
  return copy({format:'ModelForge.Survey',version:1,units:'cm',sourceId:state.workspace?.documentKey||state.workspace?.id,createdAt:Date.now(),
    transform:{translation:{x:0,y:0,z:0},rotationY:0},survey:normalizeSurvey(state.workspace?.survey),capture:null,
    navigationProfile:normalizeNavigationProfile(state.workspace?.navigationProfile),mep:state.mep?{nodes:state.mep.nodes,runs:state.mep.runs,routePolicy:state.mep.routePolicy}:null,
    geometry:Object.fromEntries(SURVEY_GEOMETRY_FIELDS.map(k=>[k,state[k]||(k==='roomMeta'?{}:[])])),
    floors:state.workspace?.floors||[],activeFloor:state.workspace?.activeFloor,attachments});
}
const bad=()=>{throw new Error('SURVEY_INVALID_GEOMETRY');};
function geometry(raw,scale){
  if(!raw||typeof raw!=='object')bad();
  const g=raw.spatial?{...raw,...raw.spatial,items:raw.spatial.instances,roomMeta:raw.spatial.rooms}:raw;
  for(const key of SURVEY_GEOMETRY_FIELDS){
    if(key==='roomMeta'){g[key] ||= {};continue;}
    if(g[key]==null)g[key]=[];
    if(!Array.isArray(g[key])||g[key].length>100000)bad();
  }
  const number=(obj,key,required=false)=>{if(obj[key]==null&&!required)return;if(!Number.isFinite(obj[key])||Math.abs(obj[key])>1e9)bad();obj[key]*=scale;};
  const ids=list=>{const seen=new Set();for(const x of list){if(!x||!['string','number'].includes(typeof x.id)||seen.has(String(x.id)))bad();seen.add(String(x.id));}};
  for(const key of ['walls','openings','items','markers','slabOpenings','surveyFeatures'])ids(g[key]);
  for(const n of g.nodes){number(n,'x',true);number(n,'z',true);number(n,'y');}
  for(const w of g.walls){
    if(!Number.isInteger(w.a)||!Number.isInteger(w.b)||!g.nodes[w.a]||!g.nodes[w.b]||w.a===w.b)bad();
    for(const k of ['thickness','height']){number(w,k,true);if(w[k]<=0)bad();}
    for(const k of ['clearL','lockL','lockClearL','elev'])number(w,k);
    for(const spec of [w.geometry,w.curve].filter(Boolean)){for(const k of ['cx','cz','radius','r'])number(spec,k);if(spec.center&&typeof spec.center==='object'){number(spec.center,'x');number(spec.center,'z');}}
    for(const p of Array.isArray(w.profile)?w.profile:[]){number(p,'s');number(p,'height');}
    if(w.geometry?.through){number(w.geometry.through,'x',true);number(w.geometry.through,'z',true);}
  }
  for(const meta of Object.values(g.roomMeta))for(const key of ['ceilH'])number(meta,key);
  for(const type of g.wallTypes)for(const layer of type.layers||[])number(layer,'thickness');
  for(const o of g.openings){if(!g.walls.some(w=>String(w.id)===String(o.wall)))bad();for(const k of ['s','width','height'])number(o,k,true);number(o,'sill');if(o.frame)for(const k of ['jamb','head','sillW','depth'])number(o.frame,k);if(o.width<=0||o.height<=0||o.s<0)bad();}
  for(const o of [...g.items,...g.markers,...g.slabOpenings])for(const k of ['x','y','z','w','d','h','elev'])number(o,k);
  for(const f of g.surveyFeatures){if(!Array.isArray(f.points))bad();for(const p of f.points)for(const k of ['x','y','z'])number(p,k,true);}
  const features=normalizeSurveyFeatures(g.surveyFeatures);if(features.length!==g.surveyFeatures.length)bad();g.surveyFeatures=features;
  // Constraint expressions have declared project units; scaling them blindly
  // would silently change their meaning. Such files require explicit review.
  if(scale!==1&&(g.wallCons.length||g.roomCons.length||g.planVars.length))throw new Error('SURVEY_SCALE_CONSTRAINTS');
  return Object.fromEntries(SURVEY_GEOMETRY_FIELDS.map(k=>[k,g[k]]));
}
function serviceGeometry(raw,scale){if(!raw)return null;const mep=copy(raw);if(!Array.isArray(mep.nodes)||!Array.isArray(mep.runs))bad();for(const n of mep.nodes){for(const k of ['x','y','z','s','elev','h'])if(n[k]!=null){if(!Number.isFinite(n[k]))bad();n[k]*=scale;}}for(const r of mep.runs){if(r.dia!=null)r.dia*=scale;for(const p of r.pts||[])for(const k of ['x','y','z'])if(p[k]!=null){if(!Number.isFinite(p[k]))bad();p[k]*=scale;}}return mep;}
export function parseSurveyExchange(raw) {
  const data=typeof raw==='string'?JSON.parse(raw):raw;
  if(data?.format!=='ModelForge.Survey'||data.version!==1)throw new Error('SURVEY_FORMAT_INVALID');
  if(!['mm','cm','m','in','ft'].includes(data.units))throw new Error('SURVEY_FORMAT_INVALID');
  const scale=surveyValueCm(1,data.units),result=copy(data);result.units='cm';result.survey=normalizeSurvey(data.survey);
  result.navigationProfile=normalizeNavigationProfile(data.navigationProfile);
  if(data.capture)result.scan=parseRoomScan(data.capture);
  if(data.geometry)result.geometry=geometry(result.geometry,scale);
  if(!result.scan&&!result.geometry)throw new Error('SURVEY_FORMAT_INVALID');
  const seen=new Set();
  result.floors=(result.floors||[]).map(f=>{if(typeof f.id!=='string'||seen.has(f.id)||!Number.isFinite(f.elevation))bad();seen.add(f.id);return {...f,elevation:f.elevation*scale,scene:{...f.scene,...geometry(f.scene,scale),spatial:undefined}};});
  if(result.floors.length&&!result.floors.some(f=>f.id===result.activeFloor))bad();
  const photos=new Set();
  result.attachments=(data.attachments||[]).map(a=>{
    if(!a||typeof a.id!=='string'||photos.has(a.id)||typeof a.data!=='string'||a.data.length>42000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data))throw new Error('SURVEY_PHOTO_INVALID');
    photos.add(a.id);return copy(a);
  });
  if(result.survey.photos.some(p=>!photos.has(p.attachmentId)))throw new Error('SURVEY_PHOTO_MISSING');
  result.mep=serviceGeometry(data.mep,scale);
  for(const floor of result.floors)if(floor.scene.mep)floor.scene.mep=serviceGeometry(floor.scene.mep,scale);
  const transform=data.transform||{translation:{x:0,y:0,z:0},rotationY:0},translation=transform.translation||{x:0,y:0,z:0},angle=transform.rotationY||0;
  if(transform.matrix||!['x','y','z'].every(k=>Number.isFinite(translation[k]))||!Number.isFinite(angle))bad();
  const dx=translation.x*scale,dz=translation.z*scale,dy=translation.y*scale,c=Math.cos(angle),sin=Math.sin(angle);
  const point=p=>{const x=p.x,z=p.z;p.x=x*c-z*sin+dx;p.z=x*sin+z*c+dz;};
  if(dx||dz||dy||angle){
    for(const g of [result.geometry,...result.floors.map(f=>f.scene)].filter(Boolean)){
      for(const p of [...g.nodes,...g.markers])point(p);
      for(const p of [...g.items,...g.slabOpenings]){point(p);p.rot=(p.rot||0)+angle*180/Math.PI;}
      for(const f of g.surveyFeatures)for(const p of f.points)point(p);
      for(const w of g.walls)for(const spec of [w.geometry,w.curve].filter(Boolean)){if(spec.center&&typeof spec.center==='object')point(spec.center);if(spec.cx!=null&&spec.cz!=null){const p={x:spec.cx,z:spec.cz};point(p);spec.cx=p.x;spec.cz=p.z;}if(spec.through)point(spec.through);}
    }
    for(const mep of [result.mep,...result.floors.map(f=>f.scene.mep)].filter(Boolean)){for(const n of mep.nodes)if(Number.isFinite(n.x)&&Number.isFinite(n.z))point(n);for(const run of mep.runs)for(const p of run.pts||[])point(p);}
    for(const f of result.floors)f.elevation+=dy;
    result.survey.datum+=dy;result.sourceTransform=copy(transform);result.transform={translation:{x:0,y:0,z:0},rotationY:0};
  }
  return result;
}

// Rigid alignment preserves measured lengths. A scale change is a separate,
// explicit calibration operation, never a side effect of room placement.
export function alignScanPoints(points,sourcePair,targetPair,tolerance=2) {
  const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
  if(!Array.isArray(points)||!Array.isArray(sourcePair)||!Array.isArray(targetPair)||sourcePair.length!==2||targetPair.length!==2||
    ![...sourcePair,...targetPair,...points].every(finitePoint))throw new Error('SURVEY_ALIGNMENT_POINTS');
  if(!Number.isFinite(tolerance)||tolerance<0)throw new Error('SURVEY_ALIGNMENT_SCALE');
  const [a,b]=sourcePair,[c,d]=targetPair,ls=Math.hypot(b.x-a.x,b.z-a.z),lt=Math.hypot(d.x-c.x,d.z-c.z);
  if(ls<1||lt<1||Math.abs(ls-lt)>tolerance)throw new Error('SURVEY_ALIGNMENT_SCALE');
  const angle=Math.atan2(d.z-c.z,d.x-c.x)-Math.atan2(b.z-a.z,b.x-a.x),cos=Math.cos(angle),sin=Math.sin(angle);
  return points.map(p=>({...p,x:c.x+(p.x-a.x)*cos-(p.z-a.z)*sin,z:c.z+(p.x-a.x)*sin+(p.z-a.z)*cos}));
}

export class StableScanPoint {
  constructor(){this.samples=[];this.lastAt=0;}
  reset(){this.samples=[];this.lastAt=0;}
  add(point,at){
    if(!point||!['x','y','z'].every(k=>Number.isFinite(point[k]))){this.reset();return null;}
    if(at-this.lastAt>500)this.reset();this.lastAt=at;
    this.samples.push({...point,at});this.samples=this.samples.filter(p=>at-p.at<=350).slice(-30);
    if(this.samples.length<5||at-this.samples[0].at<120)return null;
    const mean={x:0,y:0,z:0};for(const p of this.samples)for(const k of ['x','y','z'])mean[k]+=p[k]/this.samples.length;
    return this.samples.every(p=>Math.hypot(p.x-mean.x,p.y-mean.y,p.z-mean.z)<=3)?mean:null;
  }
}
