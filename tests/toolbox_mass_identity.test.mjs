import test from 'node:test';
import assert from 'node:assert/strict';
import {generateToolboxPart} from '../js/toolbox/generate.js';
import {evaluateMassProperties} from '../js/cad_mass_properties.js';
import {evaluateAssemblyMassProperties} from '../js/cad_assembly_mass_properties.js';

const props={volume:2.38549,centerOfMass:{x:0,y:4,z:0},inertia:[[1,0,0],[0,1,0],[0,0,1]],bounds:{min:{x:-.5,y:0,z:-.5},max:{x:.5,y:7.62,z:.5}}};
function screw(){
 const generated=generateToolboxPart({kind:'shcs',sizeKey:'M6',lengthMm:70,threadMode:'cosmetic',lod:2});
 assert.equal(generated.ok,true);
 const parts=generated.parts.map((part,index)=>({...part,id:'p'+index,featureId:'screw',density:8.8}));
 const material=parts.find(part=>part.standardRole==='head'&&!part.previewOnly);
 Object.assign(material,{density:7.7,materialQualificationId:'assigned-alloy',materialCatalogId:'stock:alloySteel',materialName:'Alloy Steel'});
 return {key:'fresh-screw',parts};
}
test('native Toolbox union is measured once with explicit material, independent of viewport projections',async()=>{
 const def=screw();let builds=0,releases=0;
 assert.ok(def.parts.filter(part=>!part.previewOnly).length>1);
 const mass=await evaluateMassProperties(JSON.parse(JSON.stringify(def)),{
  bodyKey:part=>part.featureId,
  buildSolid:async()=>{builds++;return {workerMassProperties:props};},releaseSolid:()=>{releases++;},
 });
 assert.equal(builds,1);assert.equal(releases,1);assert.equal(mass.bodies.length,1);
 assert.equal(mass.volumeCm3,props.volume);assert.equal(mass.density,7.7);
 assert.ok(Math.abs(mass.massG-props.volume*7.7)<1e-12);
 assert.equal(mass.bodies[0].sourcePartIds.length,def.parts.filter(part=>!part.previewOnly).length);
});
test('native grouping is definition-local: two screw occurrences contribute twice',async()=>{
 const def=screw(),assembly={components:[
  {id:'one',def,visible:true,transform:{x:0,y:0,z:0}},
  {id:'two',def,visible:true,transform:{x:10,y:0,z:0}},
 ]};
 const mass=await evaluateAssemblyMassProperties(assembly,{evaluateDefinition:document=>evaluateMassProperties(document,{
  bodyKey:part=>part.featureId,buildSolid:async()=>({workerMassProperties:props}),releaseSolid:()=>{},
 })});
 assert.equal(mass.bodies.length,2);assert.equal(mass.volumeCm3,2*props.volume);
 assert.ok(Math.abs(mass.massG-2*props.volume*7.7)<1e-12);
 assert.equal(mass.centerOfMass.x,5);
});
test('manual stock appearance without a qualification profile overrides generated Toolbox finish material',async()=>{
 const def=screw();
 for(const part of def.parts)delete part.materialQualificationId;
 const mass=await evaluateMassProperties(def,{bodyKey:part=>part.featureId,buildSolid:async()=>({workerMassProperties:props}),releaseSolid:()=>{}});
 assert.equal(mass.density,7.7);assert.ok(Math.abs(mass.massG-props.volume*7.7)<1e-12);
});
test('without a native body resolver genuinely separate analytic parts remain separate; cutters never add mass',async()=>{
 const def={parts:[{id:'a',featureId:'shared'},{id:'b',featureId:'shared'},{id:'cutter',previewOnly:true}]};
 let builds=0;
 const mass=await evaluateMassProperties(def,{buildSolid:async()=>{builds++;return {workerMassProperties:props};},releaseSolid:()=>{}});
 assert.equal(builds,2);assert.equal(mass.bodies.length,2);assert.equal(mass.volumeCm3,2*props.volume);
});
