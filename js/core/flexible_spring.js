import {helixFromSketch} from './sketch_helix.js';
import {helixFrameAt,helixPoint,normalizeVec} from '../cad_helix.js';
import {setActiveConfiguration} from '../cad_configurations.js';
import {rotationOf} from '../cad_mate_model.js';

const copy=value=>structuredClone(value);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const position=component=>({x:Number(component.transform?.x)||0,y:Number(component.transform?.y)||0,z:Number(component.transform?.z)||0});

export function springSource(document){
  const sweeps=(document?.features||[]).filter(f=>f.type==='sweep'&&!f.suppressed);
  if(sweeps.length!==1 || (document.parts||[]).length!==1)throw Error('Flexible spring requires one helix sweep body');
  const sweep=sweeps[0],sources=sweep.params?.sketchSources;
  const reference=(document.referenceGeometry||[]).find(r=>r.id===sources?.helixId);
  const helix=(document.features||[]).find(f=>f.id===(sources?.helixFeatureId||reference?.featureId)&&f.type==='helix');
  if(!helix)throw Error('The sweep must follow an authored helix');
  let diameter=Number(sources.diameter||sweep.params.profileDiameter);
  if(!(diameter>0)){
    const sketch=(document.sketches||[]).find(s=>s.id===sources.profile?.sketchId);
    const entities=(sketch?.entities||[]).filter(e=>!e.construction&&(!sources.profile?.entityIds?.length||sources.profile.entityIds.includes(e.id)));
    if(entities.length!==1||entities[0].type!=='circle')throw Error('Flexible spring requires a circular wire profile');
    diameter=2*Number(entities[0].r);
  }
  const spec=helixFromSketch(document,helix.params||{});
  if(spec.pitchMode==='variable'||Math.abs(spec.radiusEnd-spec.radius)>1e-8||!(spec.turns>0)||!(diameter>0))throw Error('Flexible spring requires a constant-radius, constant-pitch helix');
  if((document.features||[]).some(f=>!f.suppressed&&!['sketch','helix','sweep'].includes(f.type)))throw Error('Flexible preview supports an unfinished helix sweep only');
  return {spec,diameter,helixId:helix.id,sweepId:sweep.id};
}

export function springEndpoints(component){
  const source=springSource(component.def),rows=[];
  for(const config of component.def.configurations||[]){
    const document=copy({features:component.def.features,sketches:component.def.sketches,referenceGeometry:component.def.referenceGeometry,history:component.def.history,configurations:component.def.configurations,activeConfiguration:component.def.activeConfiguration,parts:component.def.parts.map(p=>({id:p.id})),parameterOverrides:component.def.parameterOverrides,designTable:component.def.designTable});setActiveConfiguration(document,config.id);const other=springSource(document);
    if(Math.abs(other.diameter-source.diameter)>1e-8||Math.abs(other.spec.radius-source.spec.radius)>1e-8||Math.abs(other.spec.turns-source.spec.turns)>1e-8||other.spec.handedness!==source.spec.handedness||Math.abs(dot(other.spec.axis,source.spec.axis)-1)>1e-8)throw Error('Spring configurations must preserve wire diameter, coil radius, turns and axis');
    rows.push({configurationId:config.id,height:other.spec.height,name:config.name});
  }
  rows.sort((a,b)=>a.height-b.height);
  if(rows.length<2||rows.at(-1).height-rows[0].height<1e-8)throw Error('Create different compressed and extended configurations first');
  return {source,min:rows[0],max:rows.at(-1)};
}

export function createSpringBinding(component,driver,response=1){
  if(!driver||driver===component)throw Error('Choose another moving component');
  const {source,min,max}=springEndpoints(component),r=rotationOf({rx:0,ry:0,rz:0,...component.transform}),a=source.spec.axis;
  const axis=normalizeVec({x:r[0][0]*a.x+r[0][1]*a.y+r[0][2]*a.z,y:r[1][0]*a.x+r[1][1]*a.y+r[1][2]*a.z,z:r[2][0]*a.x+r[2][1]*a.y+r[2][2]*a.z});
  if(Math.min(Math.abs(source.spec.height-min.height),Math.abs(source.spec.height-max.height))>1e-7)throw Error('Start from an exact endpoint configuration');
  return {driverId:driver.id,response:response<0?-1:1,axis,basePosition:position(driver),baseSpringPosition:position(component),baseHeight:source.spec.height,min,max};
}

export function springMotionState(component,assembly){
  const binding=component.flexibleSpring;if(!binding)return null;
  const driver=assembly.components.find(c=>String(c.id)===String(binding.driverId));
  if(!driver)throw Error('Flexible spring driver is missing');
  const p=position(driver),b=binding.basePosition,s=position(component),zero=binding.baseSpringPosition||position(component),delta={x:p.x-b.x-s.x+zero.x,y:p.y-b.y-s.y+zero.y,z:p.z-b.z-s.z+zero.z};
  const height=binding.baseHeight+binding.response*dot(delta,binding.axis);
  if(height<binding.min.height-1e-7||height>binding.max.height+1e-7)throw Error('Spring travel exceeds its configured height range');
  const endpoint=[binding.min,binding.max].find(row=>Math.abs(row.height-height)<1e-7);
  return {height,configurationId:endpoint?.configurationId||null,exact:false};
}

// Circular sections are reconstructed normal to the changing helix tangent.
// No native mesh is scaled and the wire radius remains unchanged at every ring.
export function springPreviewMesh(document,height){
  if(!Number.isFinite(height)||height<=0)throw Error('Spring preview height must be positive');
  const {spec,diameter}=springSource(document),h={...spec,height,pitch:height/spec.turns},radius=diameter/2;
  const segments=Math.max(32,Math.min(2048,Math.ceil(spec.turns*32))),sides=12,positions=[],normals=[],indices=[];
  for(let i=0;i<=segments;i++){
    const t=i/segments,frame=helixFrameAt(h,t),center=helixPoint(h,t),along=dot(frame.radial,frame.tangent),u=normalizeVec({x:frame.radial.x-along*frame.tangent.x,y:frame.radial.y-along*frame.tangent.y,z:frame.radial.z-along*frame.tangent.z}),v=normalizeVec(cross(frame.tangent,u));
    for(let j=0;j<sides;j++){
      const angle=2*Math.PI*j/sides,normal={x:u.x*Math.cos(angle)+v.x*Math.sin(angle),y:u.y*Math.cos(angle)+v.y*Math.sin(angle),z:u.z*Math.cos(angle)+v.z*Math.sin(angle)};
      positions.push(center.x+radius*normal.x,center.y+radius*normal.y,center.z+radius*normal.z);normals.push(normal.x,normal.y,normal.z);
      if(i<segments){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);}
    }
  }
  return {positions,normals,indices,segments,sides,wireRadius:radius};
}

export function hasUnverifiedSprings(assembly){return (assembly?.components||[]).some(c=>c.flexibleSpringState?.exact===false||hasUnverifiedSprings(c.asm));}

export function restoreSpringEndpoint(component,configurationId){
  const binding=component.flexibleSpring;
  if(!binding||![binding.min.configurationId,binding.max.configurationId].includes(configurationId))throw Error('Choose an exact spring endpoint');
  setActiveConfiguration(component.def,configurationId);component.configurationId=configurationId;
  const height=springSource(component.def).spec.height;component.flexibleSpringState={height,configurationId,exact:false};
}
