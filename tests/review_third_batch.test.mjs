import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mateResidual,topologyReference } from '../js/cad_mate_model.js';
import { solveTopologyMates } from '../js/cad_mates.js';
import { auditStandardParts,involuteGearOutline } from '../js/cad_standards.js';
import { createSheetMetalPart,addEdgeFlange,flatPattern,bendDeduction } from '../js/cad_sheet_metal.js';
import { regenerateFeatures,releaseRegeneration } from '../js/cad_feature_tree.js';
import { mainReferences } from '../js/core/schema.js';
import { modeledThreadSolid } from '../js/cad_thread.js';
import { makeBrepPrimitive,transformBrep,compoundBrep,disposeBrep,shapeToMeshData,exportStep,extractBrepTopology } from '../js/cad_kernel.js';
const origin={x:0,y:0,z:0},axis={x:0,y:1,z:0};
const plane={surface:'plane',origin,normal:axis},round={surface:'cylinder',origin,axis,radius:10};
function pair(type,position,fa=round,fb=round){return {components:[{id:'a',grounded:true,transform:{...origin}},{id:'b',transform:{...position}}],topologyMates:[{id:'m',type,aligned:type!=='tangent',a:topologyReference('a','face','fa',fa),b:topologyReference('b','face','fb',fb)}]};}
test('planar, concentric and tangent mates preserve their physical free motions',()=>{
 for(const [type,position,fa,fb,dof] of [
  ['coincident',{x:20,y:0,z:30},plane,plane,3],
  ['concentric',{x:0,y:50,z:0},round,round,2],
  ['tangent',{x:9,y:50,z:12},round,{...round,radius:5},3],
 ]){
  const assembly=pair(type,position,fa,fb),result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result.issues));assert.equal(result.degreesOfFreedom,dof,type);
  for(const key of ['x','y','z'])assert.ok(Math.abs(assembly.components[1].transform[key]-position[key])<1e-6,type+' '+key);
 }
});
test('concentric plus axial distance and two orthogonal planar mates solve together',()=>{
 const assembly=pair('concentric',{x:0,y:50,z:0});
 assembly.topologyMates.push({id:'distance',type:'distance',value:50,aligned:true,a:topologyReference('a','face','pa',plane),b:topologyReference('b','face','pb',plane)});
 assert.equal(solveTopologyMates(assembly).ok,true);assert.equal(assembly.components[1].transform.y,50);
 const floor=pair('coincident',{x:20,y:0,z:30},plane,plane),wall={...plane,normal:{x:1,y:0,z:0}};
 floor.topologyMates.push({id:'wall',type:'distance',value:20,aligned:true,a:topologyReference('a','face','wa',wall),b:topologyReference('b','face','wb',wall)});
 assert.equal(solveTopologyMates(floor).ok,true);assert.equal(floor.components[1].transform.z,30);
});
test('mate residuals still reject displacement in constrained directions',()=>{
 assert.equal(mateResidual({type:'coincident',aligned:true},plane,{...plane,origin:{x:20,y:3,z:30}}).linear,3);
 assert.equal(mateResidual({type:'concentric'},round,{...round,origin:{x:3,y:50,z:4}}).linear,5);
});
test('angle arc and label follow the minor angle across the atan2 branch cut',()=>{
 const source=readFileSync(new URL('../js/cad_sheet.js',import.meta.url),'utf8');
 const fn=source.match(/function dimensionItems\([^]*?\n\}\n/)[0];
 const dimension=Function('num','dimensionText','measureDim','TEXT_SIZES','LINE_STYLES','text','return ('+fn+')')((v,d)=>v??d,()=>'',()=>0,{dim:3},{dim:{color:'#000'}},(x,y)=>({type:'text',x,y}));
 const items=dimension({type:'angle',refs:[{u:-10,v:1},{u:0,v:0},{u:-10,v:-1}]},{toSheet:p=>({x:p.u,y:p.v})},{});
 const arc=items.find(i=>i.type==='arc');assert.ok(arc.a1-arc.a0<.21);
 assert.ok(items.find(i=>i.type==='text').x<0);
});
test('custom engineering names never declare conformance',()=>{
 for(const name of ['Gear cover','Nut retainer','Lead screw collar'])assert.equal(auditStandardParts({parts:[{id:name,name,kind:'box'}]}).ok,true);
 assert.equal(auditStandardParts({parts:[{id:'declared',kind:'box',standardCompliance:{standard:'invalid'}}]}).ok,false);
});
test('flat patterns include opposite flange development and reject unsupported hems and corners',()=>{
 const sheet=createSheetMetalPart({thickness:.1,insideRadius:.2,kFactor:.33,base:{width:10,height:5}});
 addEdgeFlange(sheet,'right',3,90);addEdgeFlange(sheet,'left',2,90);
 const pattern=flatPattern(sheet),xs=pattern.outline.map(p=>p.x);
 assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-(15-2*bendDeduction(90,.2,.1,.33)))<1e-9);
 assert.throws(()=>bendDeduction(180,.2,.1),/Hems/);
 assert.throws(()=>addEdgeFlange(sheet,'top',2,90),/corner-relief/);assert.equal(sheet.flanges.length,2);
});
test('gear involutes stay above root radius for low and high tooth counts',()=>{
 for(const teeth of [12,20,42,50,100]){
  const points=involuteGearOutline({moduleMm:2,teeth,pressureAngleDeg:20}),root=(teeth-2.5)/10;
  assert.ok(points.every(p=>Math.hypot(p.u,p.v)>=root-1e-9));
 }
});
test('raw mirror records honor plane references and reject missing planes',async()=>{
 for(const [id,key] of [['plane:top','y'],['plane:front','z'],['plane:right','x'],['missing',null]]){
  const run=await regenerateFeatures({references:mainReferences(),features:[{id:'box',type:'box',inputs:[],params:{x:2,y:3,z:4,w:1,h:1,d:1}},{id:'mirror',type:'mirror',inputs:['box'],references:{references:[id]},params:{keepOriginal:false}}]});
  try{
   if(!key){assert.equal(run.ok,false);continue;}
   assert.equal(run.ok,true,JSON.stringify(run.issues));const data=await shapeToMeshData(run.finalShape),index={x:0,y:1,z:2}[key];
   assert.ok(data.positions.filter((_n,i)=>i%3===index).every(n=>n<0));
  }finally{releaseRegeneration(run);}
 }
});
test('modeled thread section is placed at the helix start and builds within nominal radius',async()=>{
 const params={diameterMm:6,pitchMm:1,lengthMm:2,mode:'modeled',origin:{x:2,y:3,z:4},axis:{x:0,y:1,z:0},startAngle:.7};
 const solid=modeledThreadSolid(params);assert.ok(solid.worldProfile.every(p=>Math.hypot(p.x-2,p.z-4)<=.300001));
 const run=await regenerateFeatures({features:[{id:'thread',type:'thread',inputs:[],params}]});
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));const mesh=await shapeToMeshData(run.finalShape);
  const radii=[];for(let i=0;i<mesh.positions.length;i+=3)radii.push(Math.hypot(mesh.positions[i]-2,mesh.positions[i+2]-4));
  assert.ok(Math.max(...radii)<.30001,Math.max(...radii));assert.ok(Math.max(...radii)>.28);
 }finally{releaseRegeneration(run);}
});
test('compound geometry survives disposal of source wrappers and transform builders',async()=>{
 const seed=await makeBrepPrimitive({type:'box',w:2,h:3,d:4}),copy=await transformBrep(seed,{origin:{x:-5,y:0,z:0}});
 let compound;
 try{compound=await compoundBrep([seed,copy]);}finally{disposeBrep(seed);disposeBrep(copy);}
 try{
  assert.ok((await shapeToMeshData(compound)).positions.length>0);
  assert.ok(extractBrepTopology(compound,{ownerFeatureId:'compound'}).topology.length>0);
  assert.ok((await exportStep(compound,'lifetime.step')).length>100);
 }finally{disposeBrep(compound);}
});

test('fractional thread turns honor the declared radial tolerance',()=>{
 const solid=modeledThreadSolid({diameterMm:6,pitchMm:1,lengthMm:2.13});
 const approximation=solid.threadGeometry.approximation;
 const actual=.3*(1-Math.cos(Math.PI*solid.spec.turns/(solid.stations.length-1)));
 assert.ok(actual<=.0005);
 assert.equal(approximation.radialDeflectionCm,actual);
 assert.throws(()=>modeledThreadSolid({diameterMm:6,pitchMm:1,lengthMm:2},{radialToleranceCm:0}),/tolerance/);
});
