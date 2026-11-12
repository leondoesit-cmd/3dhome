// Physical queries use measured geometry regardless of layer visibility or
// camera cutaways. Results describe a selected virtual walker, not code compliance.
import { inside } from './layout_analysis.js';
import { normalizeNavigationProfile } from './navigation_profile.js';
import { projectToWall, wallProfileHeight } from './wall_curves.js';
import { surveyVertexPlane } from './survey_vertex.js';
const local=(o,p)=>{const a=(o.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=p.x-o.x,dz=p.z-o.z;return {x:dx*c+dz*s,z:-dx*s+dz*c};};
function boxDistance(o,p){const q=local(o,p);return Math.hypot(Math.max(0,Math.abs(q.x)-o.w/2),Math.max(0,Math.abs(q.z)-o.d/2));}
export function stairSupport(state,point,profile){
 const p=normalizeNavigationProfile(profile);
 const active=state.workspace?.floors?.find(f=>f.id===state.workspace.activeFloor),items=[...(state.items||[])];
 for(const floor of state.workspace?.floors||[]){if(floor.id===active?.id)continue;const scene=floor.scene?.spatial||floor.scene;for(const it of scene?.instances||scene?.items||[]){if(it.type==='stairs'){const elev=(it.elev||0)+(floor.elevation||0)-(active?.elevation||0);if(elev<=2&&elev+it.h>=-2)items.push({...it,elev});}}}
 for(const it of items){
  if(it.type!=='stairs')continue;const q=local(it,point);
  if(Math.abs(q.x)>it.w/2-p.radius||Math.abs(q.z)>it.d/2+p.radius)continue;
  const riser=it.riserHeight||it.h/(it.configuration?.stepCount||it.steps||10),slope=Math.atan2(it.h,it.d)*180/Math.PI;
  if(riser>p.stepHeight+.01||slope>p.slopeLimit+.01)return {blocked:true,id:it.id};
  // Support the body across the linked void's lip until its trailing edge is
  // clear. The landing stays level; measured stair geometry is unchanged.
  return {id:it.id,y:(it.elev||0)+it.h*Math.max(0,Math.min(1,(it.d/2-q.z)/it.d)),riser,slope};
 }
 return null;
}
export function navigationPosition(state,point,rawProfile,rooms=[]){
 const profile=normalizeNavigationProfile(rawProfile),stair=stairSupport(state,point,profile);
 if(stair?.blocked)return {clear:false,reason:'stairs',id:stair.id};
 const y=stair?.y ?? 0,top=y+profile.height;
 const active=state.workspace?.floors?.find(f=>f.id===state.workspace.activeFloor);
 for(const room of rooms){
  if(!Number.isFinite(room.ceilH)||room.ceilH<=y||room.ceilH>=top||!inside(point,room.pts))continue;
  const stairOpening=stair&&(state.workspace?.floors||[]).some(f=>f.elevation>(active?.elevation||0)&&Math.abs(f.elevation-(active?.elevation||0)-room.ceilH)<2&&(f.scene?.slabOpenings||f.scene?.spatial?.slabOpenings||[]).some(h=>String(h.stairsId)===String(stair.id)&&boxDistance(h,point)===0));
  if(!stairOpening)return {clear:false,reason:'headroom',id:room.key};
 }
 for(const feature of state.surveyFeatures||[]){
  if(feature.kind!=='face'||feature.points.length<3||!inside(point,feature.points))continue;
  const {origin:a,normal:{x:nx,y:ny,z:nz}}=surveyVertexPlane(feature,0);
  if(Math.abs(ny)<.0001)continue;const height=a.y-(nx*(point.x-a.x)+nz*(point.z-a.z))/ny;
  if(height>y+.01&&height<top)return {clear:false,reason:'headroom',id:feature.id};
 }
 for(const w of state.walls||[]){
  if(w.physical===false||w.phase==='demolition'||w.phase==='demolish'||w.phase==='demolished')continue;
  const q=projectToWall(w,point.x,point.z,state.nodes);if(!q)continue;
  const offset=w.loc==='face'&&Math.abs(w.dimSide)===1?-w.dimSide*w.thickness/2:0;
  const distance=offset?Math.hypot(point.x-q.x+q.tangent.z*offset,point.z-q.z-q.tangent.x*offset):q.distance;
  if(distance>=profile.radius+(w.thickness||10)/2)continue;
  const base=w.elev||0;if(top<=base||y>=base+wallProfileHeight(w,q.s,w.height||270))continue;
  const opening=(state.openings||[]).find(o=>String(o.wall)===String(w.id)&&o.type!=='window'&&(o.type==='passage'||o.open===true)&&Math.abs(q.s-o.s)+profile.radius<=o.width/2&&(o.sill||0)<=y+profile.stepHeight&&(o.sill||0)+o.height>=top);
  if(!opening)return {clear:false,reason:'wall',id:w.id};
 }
 for(const it of state.items||[]){
  if(it.blocksPlacement===false||it.physical===false||it.id===stair?.id)continue;
  if(boxDistance(it,point)>=profile.radius)continue;
  const bottom=it.elev||0,upper=bottom+(it.h||0);
  if(y<upper&&top>bottom)return {clear:false,reason:bottom>y?'headroom':'obstacle',id:it.id};
 }
 for(const hole of state.slabOpenings||[]){
  if(stair&&String(hole.stairsId)===String(stair.id))continue;
  if(boxDistance(hole,point)<profile.radius)return {clear:false,reason:'floor-opening',id:hole.id};
 }
 return {clear:true,y,stairId:stair?.id||null};
}
export function moveSurveyWalker(state,from,dx,dz,rawProfile,rooms=[]){
 const profile=normalizeNavigationProfile(rawProfile),steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/Math.max(2,profile.radius/2))),p={...from};
 let hit=false;
 for(let i=0;i<steps;i++){
  let moved=false;
  for(const [x,z] of [[dx/steps,dz/steps],[dx/steps,0],[0,dz/steps]]){
   const q={x:p.x+x,y:p.y,z:p.z+z},check=navigationPosition(state,q,profile,rooms);
   if(!check.clear){hit=true;continue;}
   if(Math.abs(check.y-p.y)>Math.max(profile.stepHeight,Math.hypot(x,z)*Math.tan(profile.slopeLimit*Math.PI/180))+.1){hit=true;continue;}
   Object.assign(p,q,{y:check.y});moved=true;break;
  }
  if(!moved)break;
 }
 return {...p,hit};
}

// Change storeys only at a physical stair endpoint. Proximity to another floor
// while walking across ordinary geometry must never teleport the viewer.
export function navigationFloorTransition(state, point, rawProfile) {
 const floors=state.workspace?.floors||[],active=floors.find(f=>f.id===state.workspace.activeFloor);
 if(!active)return null;
 const stair=stairSupport(state,point,rawProfile);
 if(!stair||stair.blocked)return null;
 const worldY=(active.elevation||0)+stair.y;
 const floor=floors.find(f=>f.id!==active.id&&Math.abs((f.elevation||0)-worldY)<=2);
 if(!floor)return null;
 const scene=floor.scene||{},spatial=scene.spatial||scene;
 const destination={...scene,nodes:scene.nodes||spatial.nodes||[],walls:scene.walls||spatial.walls||[],
  items:scene.items||spatial.instances||[],openings:scene.openings||spatial.openings||[],
  slabOpenings:scene.slabOpenings||spatial.slabOpenings||[],surveyFeatures:scene.surveyFeatures||spatial.surveyFeatures||[],
  roomMeta:scene.roomMeta||spatial.rooms||{},workspace:{...state.workspace,activeFloor:floor.id,
   floors:floors.map(f=>f.id===active.id?{...f,scene:{items:state.items||[]}}:f)}};
 const position={x:point.x,y:worldY-(floor.elevation||0),z:point.z};
 if(!navigationPosition(destination,position,rawProfile).clear)return null;
 return {floorId:floor.id,position};
}
