// Detached preparation only. Existing endpoints and opening/service identities
// survive; unsupported constraints never get silently reassigned to a fragment.
const clone=value=>JSON.parse(JSON.stringify(value));
export function surveyHeldFootprint(item){
 if(![item.x,item.z,item.w,item.d,item.rot??0].every(Number.isFinite)||item.w<=0||item.d<=0)return [];
 const angle=(item.rot||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>({x:item.x+x*item.w*c/2-z*item.d*s/2,z:item.z+x*item.w*s/2+z*item.d*c/2}));
}
export function splitReviewSignature(state){
 return JSON.stringify([state.idc,state.markers,state.planVars,state.nodes,state.walls,state.openings,state.mep,state.roomMeta,state.wallCons,state.roomCons,state.items,state.layers,state.structLocked,state.workspace?.role,state.workspace?.constraints,state.workspace?.activeFloor,state.workspace?.survey]);
}
const pointRelations=new Set(['dist','alignX','alignZ','axisDistX','axisDistZ','coincident','fixed']);
const wallRelations=new Set(['symmetric','angle','equalAngle','pointWallDist','midpoint','pointOnLine','equalSpacing','equalLengthSet','openCentre','openDist','openAlign','openSpacing','offset','wallAngle','horizontal','vertical','parallel','perpendicular','equalLength']);
const sameId=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
function validAnchor(anchor,state){
 if(!anchor)return false;
 if(anchor.k==='marker')return (state.markers||[]).some(m=>sameId(m.id,anchor.id));
 if(anchor.k==='node')return state.nodes.some(n=>sameId(n.vid,anchor.id));
 return anchor.k==='wall'&&['a','b'].includes(anchor.end)&&state.walls.some(w=>sameId(w.id,anchor.id));
}
function referencesSplit(value,wall,state){
 if(!value||typeof value!=='object')return false;
 if(value.k==='marker')return false;
 if(value.k==='wall')return sameId(value.id,wall.id);
 if(value.k==='node')return sameId(value.wall,wall.id)||[state.nodes[wall.a]?.vid,state.nodes[wall.b]?.vid].some(id=>sameId(value.id,id));
 return Object.entries(value).some(([key,v])=>
  ['wall','ref','w1','w2'].includes(key)?sameId(v,wall.id):key==='walls'&&Array.isArray(v)?v.some(id=>sameId(id,wall.id)):typeof v==='object'&&referencesSplit(v,wall,state));
}
function splitConstraintConflict(state,wall){
 for(const c of state.wallCons||[]){
  if(pointRelations.has(c.type)){
   if(!validAnchor(c.a,state)||(c.type!=='fixed'&&!validAnchor(c.b,state)))return true;
   continue;
  }
  if(!wallRelations.has(c.type)||referencesSplit(c,wall,state))return true;
  if(c.type.startsWith('open')){
   const ids=[c.opening,c.a,c.b,...(c.openings||[])];
   if((state.openings||[]).some(o=>sameId(o.wall,wall.id)&&ids.some(id=>sameId(id,o.id))))return true;
  }
 }
 for(const c of state.roomCons||[]){
  if(!['roomArea','roomMinDim','roomRect'].includes(c.type))return true;
  if(c.type==='roomRect'&&String(c.room).split(',').includes(String(wall.id)))return true;
 }
 for(const c of state.workspace?.constraints||[]){
  if(!['wallLength','wallAngle','alignX','alignZ','itemDistance'].includes(c.type)||sameId(c.wall,wall.id))return true;
 }
 return false;
}
function rekeyRoom(key,wallId,fragments){
 return String(key).split(',').flatMap(id=>sameId(id,wallId)?fragments.map(f=>String(f.wall.id)):[id]).sort((a,b)=>Number(a)-Number(b)).join(',');
}
function rehomePointConstraints(constraints,original,fragments){
 const last=fragments.at(-1).wall.id;
 for(const c of constraints)if(pointRelations.has(c.type))for(const anchor of [c.a,c.b]){
  if(anchor?.end!=='b')continue;
  if(anchor.k==='wall'&&sameId(anchor.id,original.id))anchor.id=last;
  if(anchor.k==='node'&&sameId(anchor.wall,original.id))anchor.wall=last;
 }
}
export function prepareScanWallSplits(converted,state,tolerance){
 const draft={...state,nodes:clone(state.nodes),walls:clone(state.walls),openings:clone(state.openings||[]),mep:clone(state.mep||{}),roomMeta:clone(state.roomMeta||{}),wallCons:clone(state.wallCons||[]),roomCons:clone(state.roomCons||[]),items:clone(state.items||[])};
 const splits=[],conflicts=[];
 let nextId=converted.nextId??Math.max(0,...[...state.walls,...converted.walls,...(converted.openings||[])].map(x=>Number(x.id)||0))+1;
 for(const original of state.walls){
  const a=state.nodes[original.a],b=state.nodes[original.b];if(!a||!b)continue;
  const length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)continue;
  const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,project=p=>(p.x-a.x)*ux+(p.z-a.z)*uz;
  const cuts=[];let incoming=null;
  for(const wall of converted.walls){
   const c=converted.nodes[wall.a],d=converted.nodes[wall.b];if(!c||!d)continue;
   if([c,d].some(p=>Math.abs((p.x-a.x)*uz-(p.z-a.z)*ux)>tolerance))continue;
   const cs=project(c),ds=project(d);
   if(Math.min(length,Math.max(cs,ds))-Math.max(0,Math.min(cs,ds))<=tolerance)continue;
   for(const station of [cs,ds])if(station>tolerance&&station<length-tolerance&&!cuts.some(s=>Math.abs(s-station)<=tolerance)){cuts.push(station);incoming=wall.id;}
  }
  if(!cuts.length)continue;
  cuts.sort((x,y)=>x-y);
  const roomEntries=Object.entries(state.roomMeta||{}).filter(([key])=>key.split(',').includes(String(original.id)));
  let reason=null;
  if(original.curve||original.geometry?.type==='arc'||original.geometry?.kind==='arc')reason='wall-shape';
  else if(state.workspace?.role==='viewer'||state.structLocked||state.layers?.structure?.locked||original.lock!==false||original.locked||roomEntries.some(([,m])=>m.locked))reason='split-locked';
  else if(splitConstraintConflict(draft,original))reason='split-constraints';
  else if((state.openings||[]).some(o=>String(o.wall)===String(original.id)&&cuts.some(s=>Math.abs(o.s-s)<=o.width/2+tolerance)))reason='opening-boundary';
  else if((state.mep?.nodes||[]).some(n=>String(n.wall)===String(original.id)&&!Number.isFinite(n.s)))reason='split-services';
  const stations=[0,...cuts,length],held=[];
  for(const item of draft.items){
   if(!sameId(item.hold?.wall,original.id))continue;
   const observed=(state.items||[]).find(old=>sameId(old.id,item.id))||item;
   const points=surveyHeldFootprint(observed);if(!points.length||!Number.isFinite(observed.hold.gap??0)||![-1,1].includes(observed.hold.side??1)){reason=reason||'split-held';continue;}
   const positions=points.map(project),low=Math.min(...positions),high=Math.max(...positions);
   const index=stations.findIndex((lo,i)=>i<stations.length-1&&low>=lo-tolerance&&high<=stations[i+1]+tolerance);
   if(index<0||(index>0&&(item.locked||item.lock||state.layers?.furniture?.locked))){reason=reason||'split-held';continue;}
   held.push({item,index});
  }
  if(reason){conflicts.push({incoming,existing:original.id,reason});continue;}
  const indices=[original.a,...cuts.map(s=>draft.nodes.push({x:a.x+ux*s,z:a.z+uz*s})-1),original.b];
  const fragments=stations.slice(0,-1).map((lo,i)=>{
   const wall={...clone(original),id:i?nextId++:original.id,a:indices[i],b:indices[i+1]};
   // These cached dimensions belong to the former full span. Unlocked
   // fragments acquire their own values through normal constraint syncing.
   delete wall.lockL;delete wall.lockClearL;delete wall.lockAng;delete wall.clearL;
   return {wall,lo,hi:stations[i+1]};
  });
  for(const entry of held)entry.item.hold.wall=fragments[entry.index].wall.id;
  draft.walls.splice(draft.walls.findIndex(w=>w.id===original.id),1,...fragments.map(f=>f.wall));
  for(const object of [...draft.openings,...(draft.mep.nodes||[])]){
   if(String(object.wall)!==String(original.id))continue;
   const host=fragments.find(f=>object.s<=f.hi)??fragments.at(-1);
   object.wall=host.wall.id;object.s-=host.lo;
  }
  for(const [key,meta] of Object.entries(draft.roomMeta)){
   const ids=key.split(',');if(!ids.includes(String(original.id)))continue;
   const nextKey=rekeyRoom(key,original.id,fragments);
   delete draft.roomMeta[key];draft.roomMeta[nextKey]=meta;
  }
  rehomePointConstraints(draft.wallCons,original,fragments);
  for(const c of draft.roomCons)if(String(c.room).split(',').includes(String(original.id)))c.room=rekeyRoom(c.room,original.id,fragments);
  splits.push({units:'cm',wall:original.id,original:clone(original),endpoints:clone([a,b]),fragments:fragments.map(f=>({id:f.wall.id,lo:f.lo,hi:f.hi})),points:cuts.map(s=>({x:a.x+ux*s,z:a.z+uz*s}))});
 }
 return {state:draft,splits,conflicts,nextId,before:splitReviewSignature(state)};
}
export function applyScanWallSplits(state,patch){
 if(splitReviewSignature(state)!==patch.before)throw new Error('SURVEY_SPLIT_STALE');
 for(const key of ['nodes','walls','openings','mep','roomMeta','wallCons','roomCons'])state[key]=clone(patch[key]);
 const items=new Map((state.items||[]).map(item=>[String(item.id),item]));
 for(const next of patch.items||[]){const item=items.get(String(next.id));if(item&&next.hold&&JSON.stringify(item.hold)!==JSON.stringify(next.hold))item.hold=clone(next.hold);}
 const affected=new Map(patch.splits.map(s=>[String(s.wall),s]));
 for(const observation of state.workspace?.survey?.observations||[]){
  if(observation.target?.kind!=='wall'||(observation.target.floorId&&observation.target.floorId!==state.workspace.activeFloor))continue;
  const ids=observation.target.splitWallIds||[observation.target.id],changed=ids.map(id=>affected.get(String(id))).filter(Boolean);
  if(!changed.length)continue;
  observation.previous=[...(observation.previous||[]),...changed.map(split=>({reason:'wall-split',target:clone(observation.target),value:observation.value,status:observation.status,geometry:clone(split)}))].slice(-30);
  observation.target={...observation.target,splitWallIds:ids.flatMap(id=>affected.get(String(id))?.fragments.map(f=>f.id)||[id])};
  observation.status='unresolved';
 }
}
