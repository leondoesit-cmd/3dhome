import test from 'node:test';
import { moduleSource } from "./helpers/module_source.mjs";
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { sourceFunctionText } from './helpers/source_function.mjs';
import {computeMassProperties,componentBounds} from '../js/cad_interference.js';
import {involuteGearOutline} from '../js/cad_standards.js';
import {knurlBandMesh} from '../js/cad_knurl.js';
import {insertBody} from '../js/cad_appearances.js';
import {tessellatePart} from '../js/core/part_tessellate.js';
import {revolveBounds,revolveRecipe} from '../js/core/revolve_geometry.js';
import {holeWizardThread} from '../js/cad_hole_wizard.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {makeBrepRevolve,makeBrepPrimitive,makeBrepCone,makeBrepExtrusion,disposeBrep,validateBrepForExport} from '../js/cad_kernel.js';
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function nativeMass(body){const {oc,shape}=body,props=new oc.GProp_GProps_1();try{oc.BRepGProp.VolumeProperties_1(shape,props,false,false,false);const c=props.CentreOfMass();try{return {volume:props.Mass(),x:c.X(),y:c.Y(),z:c.Z()};}finally{c.delete();}}finally{props.delete();}}
const profile=[{u:2,v:0},{u:4,v:0},{u:4,v:2},{u:2,v:2}];
test('partial-revolve volume and centroid agree with the native solid on every axis',async()=>{
 for(const axis of ['x','y','z'])for(const mode of [{angle:90},{angle:180,direction:'reverse'},{angle:120,symmetric:true},{angle:360}]){
  const part={kind:'rev',axis,x:7,y:11,z:13,pts:profile,...mode};
  const body=await makeBrepRevolve(revolveRecipe(part));
  try{const actual=nativeMass(body),mass=computeMassProperties({parts:[part]});near(mass.volumeCm3,actual.volume,.006);for(const k of ['x','y','z'])near(mass.centerOfMass[k],actual[k],.006);
   const mesh=tessellatePart(part),meshMass=computeMassProperties({parts:[{kind:'mesh',meshData:mesh}]});near(meshMass.volumeCm3,actual.volume,.25);
   const b=revolveBounds(part);for(let i=0;i<mesh.positions.length;i++)assert.ok(mesh.positions[i]>=b['xyz'[i%3]+'0']-1e-8&&mesh.positions[i]<=b['xyz'[i%3]+'1']+1e-8);
   await validateBrepForExport(body);
  }finally{disposeBrep(body);}
 }
});
test('cylinder and frustum mass follows their axis and signed height',async()=>{
 for(const axis of ['x','z',{x:1,y:2,z:3}])for(const h of [-5,5]){
  const part={kind:'cyl',axis,h,r:2,r2:1,x:4,y:5,z:6};
  const body=await makeBrepCone({axis,h,r1:2,r2:1,origin:{x:4,y:5,z:6}});
  try{const actual=nativeMass(body),mass=computeMassProperties({parts:[part]});near(mass.volumeCm3,actual.volume,.006);for(const key of ['x','y','z'])near(mass.centerOfMass[key],actual[key],.006);}finally{disposeBrep(body);}
 }
 const bounds=componentBounds({parts:[{kind:'cyl',axis:'x',h:-10,r:2,x:0,y:0,z:0}]});assert.deepEqual(bounds,{x0:-10,y0:-2,z0:-2,x1:0,y1:2,z1:2});
 const body=await makeBrepPrimitive({type:'cylinder',axis:'z',h:-3,r:1});try{near(nativeMass(body).z,-1.5);}finally{disposeBrep(body);}
});
test('gear profiles contain no zero-length edges and extrude into valid solids',async()=>{
 for(const teeth of [12,20,50,100]){
  const points=involuteGearOutline({moduleMm:2,teeth});for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];assert.ok(Math.hypot(a.u-b.u,a.v-b.v)>1e-10);}
  if(teeth===20){const body=await makeBrepExtrusion({axis:'y',points,from:0,to:1});try{await validateBrepForExport(body);}finally{disposeBrep(body);}}
 }
});
test('knurl triangle normals point outside on arbitrary axes',()=>{
 for(const axis of [{x:0,y:1,z:0},{x:1,y:0,z:0},{x:0,y:0,z:1}]){
  const mesh=knurlBandMesh({diameterMm:20,lengthMm:10,axis});
  for(let i=0;i<mesh.indices.length;i+=3){const points=Array.from(mesh.indices.slice(i,i+3),j=>Array.from(mesh.positions.slice(3*j,3*j+3)));const [a,b,c]=points,u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],along=a[0]*axis.x+a[1]*axis.y+a[2]*axis.z;const r=a.map((v,j)=>v-along*axis['xyz'[j]]);assert.ok(n.reduce((sum,v,j)=>sum+v*r[j],0)>0);}
 }
});
test('insert outline and bore both follow the requested world origin',()=>{
 const part=insertBody({origin:{x:50,y:10,z:80},innerMm:6,outerMm:10,lengthMm:12});const mesh=tessellatePart(part);
 const x=mesh.positions.filter((_,i)=>i%3===0),z=mesh.positions.filter((_,i)=>i%3===2);near(Math.min(...x),49.5);near(Math.max(...z),80.5);
 const mass=computeMassProperties({parts:[part]});near(mass.centerOfMass.x,50);near(mass.centerOfMass.y,10.6);near(mass.centerOfMass.z,80);
});
test('through-all tap overlays use target extent and mark unresolved depth explicitly',()=>{
 const params={holeType:'tapped',standardSize:'M6',endCondition:'through-all'};
 const unresolved=holeWizardThread(params);assert.equal(unresolved.pendingDepth,true);assert.deepEqual(unresolved.overlay,[]);assert.match(unresolved.callout,/THRU/);
 const thread=holeWizardThread(params,{origin:{x:1,y:12,z:1},axis:{x:0,y:-1,z:0},bounds:{x0:0,x1:2,y0:0,y1:12,z0:0,z1:2}});
 assert.equal(thread.spec.lengthMm,120);assert.equal(thread.spec.turns,120);assert.ok(thread.overlay.length>100);assert.match(thread.callout,/THRU/);
 const horizontal=holeWizardThread(params,{origin:{x:-2,y:1,z:1},axis:'x',bounds:{x0:0,x1:12,y0:0,y1:2,z0:0,z1:2}});
 assert.equal(horizontal.spec.lengthMm,120);assert.deepEqual(horizontal.spec.origin,{x:0,y:1,z:1});
});
test('hole wizard cuts exact blind, through, stepped and countersunk holes without sketch polygons',async()=>{
 for(const params of [
  {holeType:'simple',diameter:1,depth:2,endCondition:'blind'},
  {holeType:'simple',diameter:1,depth:.1,endCondition:'through-all'},
  // Offset is signed along the sketch normal whatever the cut direction
  // (see hole_start_offset): +10 places the reverse cutter at the upper Y10
  // face before it drills back into the stock.
  {holeType:'simple',diameter:1,depth:2,endCondition:'blind',direction:'reverse',offset:10},
  {holeType:'counterbore',diameter:1,depth:2,endCondition:'blind',cboreDiameter:2,cboreDepth:1},
  {holeType:'countersink',diameter:1,depth:2,endCondition:'blind',csinkDiameter:2,csinkAngle:90},
 ]){
  const doc={kind:'part',features:[{id:'stock',type:'box',inputs:[],params:{w:4,h:10,d:4}},{id:'hole',type:'hole',inputs:['stock'],references:{features:['stock']},params:{axis:'y',origin:{u:2,v:2},...params}}],history:[{id:'hs',kind:'feature',targetId:'stock'},{id:'hh',kind:'feature',targetId:'hole'}]};
  const compiled=compileKernelFeatureTree(doc);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));const run=await regenerateFeatures({...doc,features:compiled.features});
  try{assert.equal(run.ok,true,JSON.stringify({params,issues:run.issues}));const mass=nativeMass(run.finalShape);let removed=Math.PI*.25*(params.endCondition==='through-all'?10:2);
   if(params.holeType==='counterbore')removed+=Math.PI*.75;
   if(params.holeType==='countersink')removed+=Math.PI*.5*(1+.5+.25)/3-Math.PI*.25*.5;
   near(mass.volume,160-removed);await validateBrepForExport(run.finalShape);
  }finally{releaseRegeneration(run);}
 }
});

test('dimension text stays on its exterior side in local text coordinates and SVG',async()=>{
 const source=moduleSource('js/cad_sheet.js'),fn=sourceFunctionText(source,'dimensionItems');
 const text=(x,y,text,opts)=>({type:'text',x,y,text,...opts}),line=(x1,y1,x2,y2,style)=>({type:'line',x1,y1,x2,y2,style});
 const dimension=Function('num','dimensionText','measureDim','TEXT_SIZES','LINE_STYLES','text','line','arrowHead','ARROW_LENGTH','return ('+fn+')')((v,d)=>v??d,()=>'20',()=>20,{dim:2.5},{dim:{color:'#000'}},text,line,()=>({type:'arrow'}),3.2);
 const {sceneToSvg}=await import('../js/cad_sheet.js');
 for(const offset of [-10,10])for(const reverse of [false,true]){
  const refs=[{u:0,v:0},{u:20,v:0}];if(reverse)refs.reverse();
  const items=dimension({type:'horizontal',offset,refs},{toSheet:p=>({x:p.u,y:p.v})},{}),label=items.find(i=>i.type==='text');
  assert.equal(label.baseline,offset<0?'top':'bottom');assert.equal(Math.sign(label.y-(-offset)),offset<0?1:-1);
  const svg=sceneToSvg({paper:{w:100,h:100},items});assert.match(svg,new RegExp('dominant-baseline="text-'+(offset<0?'before':'after')+'-edge"'));
 }
});
test('section arrows agree with projection sight after the sheet Y inversion',()=>{
 const source=moduleSource('js/cad_sheet.js'),fn=sourceFunctionText(source,'sectionMarker');
 const marker=Function('num','line','arrowHead','text','TEXT_SIZES','return ('+fn+')')((v,d)=>v??d,()=>({type:'line'}),(x,y,dx,dy)=>({type:'arrow',dx,dy}),()=>({type:'text'}),{view:3});
 for(const flip of [false,true])for(const axis of ['horizontal','vertical']){
  const arrows=marker({parent:'p',section:{axis,flip,at:0}},[{id:'p',box:{x:0,y:0,w:20,h:20},centre:{u:0,v:0},toSheet:p=>({x:p.u,y:-p.v})}],{}).filter(i=>i.type==='arrow');
  assert.equal(arrows.length,2);for(const arrow of arrows)assert.equal(axis==='vertical'?arrow.dx:-arrow.dy,flip?-1:1);
 }
});
test('the part-to-BREP entry point preserves partial revolution placement',async()=>{
 const {exactBrepForPart}=await import('../js/modeler_part_geometry.js');
 const part={id:'rev-native',kind:'rev',axis:'z',angle:90,x:4,y:5,z:6,pts:profile};
 const body=await exactBrepForPart(part);try{const mass=computeMassProperties({parts:[part]}),actual=nativeMass(body);near(mass.volumeCm3,actual.volume,.006);near(mass.centerOfMass.z,actual.z,.006);}finally{disposeBrep(body);}
});

test('hole positions come from circular sketches and through-all depth follows a resized target',async()=>{
 const doc={kind:'part',sketches:[{id:'centres',plane:'top',points:[{id:'centre',x:3,y:2}],entities:[{id:'circle',type:'circle',c:'centre',r:.1}]}],features:[
  {id:'stock',type:'box',params:{w:6,h:2,d:4},inputs:[]},
  {id:'hole',type:'hole',inputs:['stock'],references:{features:['stock'],sketches:['centres']},params:{holeType:'simple',diameter:1,depth:.1,endCondition:'through-all',profileEntityIds:['circle']}}
 ],history:[{id:'s',kind:'feature',targetId:'stock'},{id:'h',kind:'feature',targetId:'hole'}]};
 for(const height of [2,20]){
  doc.features[0].params.h=height;
  const compiled=compileKernelFeatureTree(doc),run=await regenerateFeatures({...doc,features:compiled.features});
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));near(nativeMass(run.finalShape).volume,24*height-Math.PI*.25*height);const tool=nativeMass(run.results.get('hole:tool'));near(tool.x,3);near(tool.z,2);}finally{releaseRegeneration(run);}
 }
});
test('a face-supported bore drills inward along its arbitrary frame',async()=>{
 const {frameFromPlane}=await import('../js/core/frame.js'),{makeBrepHoleTool,booleanBrep}=await import('../js/cad_kernel.js');
 const body=await makeBrepPrimitive({type:'box',w:4,h:4,d:4});let tool,cut;
 try{
  tool=await makeBrepHoleTool({kind:'cylinder',diameter:1,endCondition:'through-all',frame:frameFromPlane({x:4,y:2,z:2},{x:1,y:0,z:0}),support:true,origin:{u:0,v:0}},body);
  cut=await booleanBrep('subtract',body,tool);near(nativeMass(cut).volume,64-Math.PI);
 }finally{[body,tool,cut].forEach(disposeBrep);}
});

test('a negative-normal support without a frame keeps its resolved drilling direction',async()=>{
 const {holeToolPlacements}=await import('../js/core/hole_geometry.js');
 const [placement]=holeToolPlacements({axis:'y',support:true,from:0,to:-1,endCondition:'through-all'},{min:{x:-1,y:0,z:-1},max:{x:1,y:5,z:1}});
 near(placement.axis.y,1);near(placement.depth,5.00001);
});
