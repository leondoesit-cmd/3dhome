import {prepareScanWallSplits,applyScanWallSplits} from './survey_wall_split.js';
import { alignScanPoints } from './survey_exchange.js';
const clone=x=>JSON.parse(JSON.stringify(x));
export function alignRoomScan(scan,sourcePair,targetPair){
 alignScanPoints([],sourcePair,targetPair);
 const copy=clone(scan),angle=Math.atan2(targetPair[1].z-targetPair[0].z,targetPair[1].x-targetPair[0].x)-Math.atan2(sourcePair[1].z-sourcePair[0].z,sourcePair[1].x-sourcePair[0].x);
 const transform=p=>alignScanPoints([p],sourcePair,targetPair)[0];
 for(const line of copy.cad.lines){line.a=transform(line.a);line.b=transform(line.b);}
 for(const list of [copy.cad.doors,copy.cad.windows,copy.cad.objects])for(const o of list||[]){if(o.center)o.center=transform(o.center);if(o.a)o.a=transform(o.a);if(o.b)o.b=transform(o.b);if(o.rot!=null)o.rot+=angle*180/Math.PI;}
 for(const o of copy.cad.objects||[])if(o.rot==null)o.rot=angle*180/Math.PI;
 copy.alignment={source:clone(sourcePair),target:clone(targetPair),rotation:angle};return copy;
}
export function scanReconciliation(converted,state,tolerance=2){
 if(!Number.isFinite(tolerance)||tolerance<0)throw new Error('SURVEY_ALIGNMENT_SCALE');
 const preparation=prepareScanWallSplits(converted,state,tolerance);
 state=preparation.state;
 const merged=clone(converted),shared=[],conflicts=[...preparation.conflicts],mapping=new Map(),walls=[];
 merged.nextId=preparation.nextId;
 if(preparation.splits.length)merged.existingPatch={before:preparation.before,splits:preparation.splits,...Object.fromEntries(['nodes','walls','openings','mep','roomMeta','wallCons','roomCons','items'].map(key=>[key,clone(state[key])]))};
 merged.nodeBindings={};
 const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<=tolerance;
 let nextId=merged.nextId??Math.max(0,...merged.walls.map(w=>Number(w.id)||0),...(merged.openings||[]).map(o=>Number(o.id)||0))+1;
 const curved=w=>w.geometry?.type==='arc'||w.geometry?.kind==='arc'||w.curve;
 const bind=index=>{
  const point=state.nodes[index];
  let local=merged.nodes.findIndex(n=>close(n,point));
  if(local<0){local=merged.nodes.length;merged.nodes.push(clone(point));}
  merged.nodeBindings[local]=index;return local;
 };
 for(const w of merged.walls){
  const a=merged.nodes[w.a],b=merged.nodes[w.b],length=Math.hypot(b.x-a.x,b.z-a.z);
  if(!length){walls.push(w);continue;}
  const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,station=p=>(p.x-a.x)*ux+(p.z-a.z)*uz;
  const matches=[];
  for(const old of state.walls||[]){
   const c=state.nodes[old.a],d=state.nodes[old.b];if(!c||!d)continue;
   const cross=p=>Math.abs((p.x-a.x)*uz-(p.z-a.z)*ux);
   if(cross(c)>tolerance||cross(d)>tolerance)continue;
   const cs=station(c),ds=station(d),lo=Math.min(cs,ds),hi=Math.max(cs,ds);
   if(Math.min(length,hi)-Math.max(0,lo)<=tolerance)continue;
   matches.push({old,lo,hi,reversed:cs>ds,cs,ds});
  }
  if(!matches.length){walls.push(w);continue;}
  matches.sort((x,y)=>x.lo-y.lo);
  let invalid=false;
  for(let i=0;i<matches.length;i++){
   const m=matches[i];let reason=null;
   if(curved(w)||curved(m.old))reason='wall-shape';
   else if(Math.abs(w.thickness-m.old.thickness)>tolerance||Math.abs(w.height-m.old.height)>tolerance)reason='dimensions';
   else if(m.lo < -tolerance||m.hi > length+tolerance)reason='partial-wall';
   else if(i){
    const previous=matches[i-1];
    const previousEnd=previous.reversed?previous.old.a:previous.old.b,nextStart=m.reversed?m.old.b:m.old.a;
    if(m.lo<previous.hi-tolerance||(m.lo-previous.hi<=tolerance&&previousEnd!==nextStart))reason='ambiguous-wall';
   }
   if(reason){invalid=true;conflicts.push({incoming:w.id,existing:m.old.id,reason});}
  }
  if(invalid){walls.push(w);continue;}
  const segments=[];let cursor=0,start=w.a,usedOriginal=false;
  const gap=(end,node)=>{
   if(end-cursor>tolerance){
    const id=usedOriginal?nextId++:w.id;usedOriginal=true;
    walls.push({...clone(w),id,a:start,b:node});
    segments.push({id,lo:cursor,hi:end,origin:-cursor,reversed:false});
   }
  };
  for(const m of matches){
   const lowNode=bind(m.reversed?m.old.b:m.old.a),highNode=bind(m.reversed?m.old.a:m.old.b);
   gap(m.lo,lowNode);
   const c=state.nodes[m.old.a],d=state.nodes[m.old.b],oldLength=Math.hypot(d.x-c.x,d.z-c.z);
   const origin=((a.x-c.x)*(d.x-c.x)+(a.z-c.z)*(d.z-c.z))/oldLength;
   segments.push({id:m.old.id,lo:Math.max(0,m.lo),hi:Math.min(length,m.hi),origin,reversed:m.reversed});
   shared.push({incoming:w.id,existing:m.old.id});cursor=m.hi;start=highNode;
  }
  gap(length,w.b);mapping.set(w.id,segments);
 }
 merged.walls=walls;merged.nextId=nextId;
 merged.openings=merged.openings.flatMap(o=>{
  const segments=mapping.get(o.wall);if(!segments)return [o];
  const host=segments.find(h=>o.s-o.width/2>=h.lo-tolerance&&o.s+o.width/2<=h.hi+tolerance);
  if(!host){conflicts.push({incoming:o.id,existing:o.wall,reason:'opening-boundary'});return [o];}
  const operationRecorded=o.swingDir!=null||o.isSliding!=null||o.isPocket!=null;
  o.wall=host.id;o.s=host.origin+(host.reversed?-o.s:o.s);if(host.reversed){
   // The host's tangent and normal both reverse. Keep the physical hinge
   // jamb and swing face fixed when changing the opening's wall reference.
   if(o.type==='door'){
    const reversedSwing={R_IN:'L_OUT',L_IN:'R_OUT',R_OUT:'L_IN',L_OUT:'R_IN'};
    o.swingDir=reversedSwing[o.swingDir||'R_IN']||o.swingDir;
    if(o.isSliding||o.isPocket)o.slideDir=(o.slideDir===-1?1:-1);
   }
  }
  const existing=(state.openings||[]).filter(p=>String(p.wall)===String(o.wall));
  const same=existing.find(p=>Math.abs(p.s-o.s)<=tolerance&&Math.abs(p.width-o.width)<=tolerance&&Math.abs(p.height-o.height)<=tolerance&&Math.abs((p.sill||0)-(o.sill||0))<=tolerance&&p.type===o.type);
  if(same){
   if(operationRecorded&&o.type==='door'&&((!!o.isSliding!==!!same.isSliding)||(!!o.isPocket!==!!same.isPocket)||
     (o.isSliding||o.isPocket?(o.slideDir===-1?-1:1)!==(same.slideDir===-1?-1:1):(o.swingDir||'R_IN')!==(same.swingDir||'R_IN')))){
    conflicts.push({incoming:o.id,existing:same.id,reason:'opening-operation'});return [o];
   }
   return [];
  }
  if(existing.some(p=>Math.abs(p.s-o.s)<(p.width+o.width)/2))conflicts.push({incoming:o.id,existing:o.wall,reason:'openings'});
  return [o];
 });
 return {converted:merged,shared,conflicts,splits:preparation.splits};
}

// Reuse actual graph nodes, not just their coordinates: room detection traces
// node indices. The detached preview remains reusable after this transaction.
export function appendReconciledScan(state,converted){
 if(converted.existingPatch)applyScanWallSplits(state,converted.existingPatch);
 const indices=converted.nodes.map((node,index)=>{
  const bound=converted.nodeBindings?.[index];
  if(bound!=null)return bound;
  state.nodes.push(clone(node));return state.nodes.length-1;
 });
 state.walls.push(...converted.walls.map(w=>({...clone(w),a:indices[w.a],b:indices[w.b]})));
 state.openings.push(...clone(converted.openings));
}
