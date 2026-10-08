import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMaterialProfile,assignMaterialProfile} from '../js/engineering_materials.js';
import {evaluateMassProperties} from '../js/cad_mass_properties.js';
import {STOCK_MATERIALS,drawingMaterialName,partMaterialDensity} from '../js/cad_appearances.js';
import {validateMaterialProfile} from '../js/engineering_materials.js';
const box=()=>({id:'body',kind:'box',x0:0,x1:2,y0:0,y1:2,z0:0,z1:2,density:7.85});

test('Steel 304 reference keeps the existing density and supplier provenance through assignment and serialization without certifying cast material',async()=>{
 const part=box(),def={parts:[part]},profile=initialMaterialProfile('stock:steel','steel304-reference');
 assert.equal(STOCK_MATERIALS.steel.density,8.00);
 assert.equal(STOCK_MATERIALS.steel.densitySourceUrl,'https://atlassteels.com.au/documents/9-Appendices.pdf#page=7');
 assignMaterialProfile(def,part,profile);const saved=JSON.parse(JSON.stringify(def));
 assert.equal(partMaterialDensity(saved.parts[0]),8.00);assert.equal(drawingMaterialName(saved),'Steel 304');
 assert.match(saved.parts[0].densitySource,/Atlas Steels.*Section 9.*p\. 7.*2016.*304\/S30400.*8000 kg\/m³.*not cast-grade certification/);
 assert.equal(profile.youngModulusMPa,0);assert.equal(profile.allowableBendingMPa,0);
 assert.ok(validateMaterialProfile(profile,{elastic:true}).some(issue=>issue.field==='youngModulusMPa'));
 const mass=await evaluateMassProperties(saved);assert.equal(mass.accuracy,'exact');assert.ok(Math.abs(mass.massG-64)<1e-8);
 assert.equal(partMaterialDensity({materialCatalogId:'stock:steel',density:7.9}),7.9,'existing authored density retains priority');
});
test('SOLIDWORKS Alloy Steel reference remains distinct from Cast Alloy and has no qualified strength',async()=>{
 const part={...box(),density:7.3,materialCatalogId:'stock:castAlloySteel'},def={parts:[part]};
 const profile=initialMaterialProfile('stock:alloySteel','reference');
 assignMaterialProfile(def,part,profile);
 const saved=JSON.parse(JSON.stringify(def));
 assert.equal(partMaterialDensity(saved.parts[0]),7.7);
 assert.equal(drawingMaterialName(saved),'Alloy Steel (SOLIDWORKS reference)');
 assert.match(saved.parts[0].densitySource,/7700 kg\/m³.*grade unspecified.*not a load certification/);
 assert.match(STOCK_MATERIALS.alloySteel.densitySourceUrl,/help\.solidworks\.com/);
 assert.equal(STOCK_MATERIALS.alloySteel.referenceYoungModulusMPa,210000);
 assert.equal(STOCK_MATERIALS.alloySteel.referencePoissonRatio,.28);
 assert.equal(STOCK_MATERIALS.castAlloySteel.density,7.3);
 assert.equal(profile.youngModulusMPa,0,'reference modulus is not promoted to a qualified input');
 assert.equal(profile.allowableBendingMPa,0);
 assert.ok(validateMaterialProfile(profile,{elastic:true}).some(issue=>issue.field==='youngModulusMPa'));
 const mass=await evaluateMassProperties(saved);
 assert.equal(mass.accuracy,'exact');assert.ok(Math.abs(mass.massG-61.6)<1e-8);
});
test('PBT stock assignment replaces stale steel density and preserves reference in saved exact mass',async()=>{
 const part=box(),def={parts:[part]},profile=initialMaterialProfile('stock:pbtGeneralPurpose','pbt');
 assignMaterialProfile(def,part,profile);
 const saved=JSON.parse(JSON.stringify(def));
 assert.equal(saved.parts[0].materialName,'PBT General Purpose (unfilled reference)');
 assert.match(saved.parts[0].densitySource,/Celanese.*2002/);
 assert.match(saved.parts[0].densitySource,/not the SOLIDWORKS library value/);
 const mass=await evaluateMassProperties(saved);
 assert.equal(mass.accuracy,'exact');
 assert.ok(Math.abs(mass.massG-10.48)<1e-8);
});

test('NBR-770 rubber assignment preserves manufacturer grade and reference density without qualifying strength',async()=>{
 const part=box(),def={parts:[part]},profile=initialMaterialProfile('stock:rubber','rubber-reference');
 assignMaterialProfile(def,part,profile);
 const saved=JSON.parse(JSON.stringify(def));
 assert.equal(drawingMaterialName(saved),'Nitrile rubber (NBR-770 reference)');
 assert.equal(partMaterialDensity(saved.parts[0]),1.30);
 assert.match(saved.parts[0].densitySource,/Burly Seal Products.*NBR-770.*70 Shore A.*specific gravity 1\.30/);
 assert.match(saved.parts[0].densitySource,/not the book's unspecified Rubber library value.*certification/);
 assert.equal(STOCK_MATERIALS.rubber.densitySourceUrl,'https://www.burlyseal.com/materials/');
 assert.equal(profile.youngModulusMPa,0);assert.equal(profile.allowableBendingMPa,0);
 assert.ok(validateMaterialProfile(profile,{elastic:true}).some(issue=>issue.field==='youngModulusMPa'));
 const mass=await evaluateMassProperties(saved);
 assert.equal(mass.accuracy,'exact');assert.ok(Math.abs(mass.massG-10.4)<1e-8);
 assert.equal(partMaterialDensity({materialCatalogId:'stock:rubber',density:1.15}),1.15,'existing authored density retains priority');
});
test('1060 assignment replaces stale density and survives library serialization in exact mass',async()=>{
 const part=box(),def={parts:[part]},profile=initialMaterialProfile('stock:aluminum1060','profile');
 assignMaterialProfile(def,part,profile);
 const saved=JSON.parse(JSON.stringify(def));
 assert.equal(saved.parts[0].materialName,'Aluminum 1060');
 assert.match(saved.parts[0].densitySource,/Hydro/);
 assert.equal(profile.allowableBendingMPa,0);
 const mass=await evaluateMassProperties(saved);
 assert.equal(mass.accuracy,'exact');
 assert.ok(Math.abs(mass.massG-8*(.0975*453.59237/2.54**3))<1e-8);
 const custom={...profile,catalogId:'custom',grade:'Test custom material',density:1.25,densitySource:'Synthetic fixture'};
 assignMaterialProfile(saved,saved.parts[0],custom);
 assert.ok(Math.abs((await evaluateMassProperties(JSON.parse(JSON.stringify(saved)))).massG-10)<1e-10);
});
test('invalid density assignment is atomic; shared material profiles update every assigned body',()=>{
 const part=box(),def={parts:[part]},profile=initialMaterialProfile('stock:aluminum1060','profile');
 for(const density of [0,-1,NaN,Infinity,'2.7']){
  const before=JSON.stringify(def);
  assert.throws(()=>assignMaterialProfile(def,part,{...profile,density}),/Density/);
  assert.equal(JSON.stringify(def),before);
 }
 assignMaterialProfile(def,part,profile);
 def.parts.push({...part,id:'other'});
 assignMaterialProfile(def,part,{...profile,catalogId:'custom',grade:'Shared custom',density:1.1});
 assert.ok(def.parts.every(p=>p.density===1.1&&p.materialName==='Shared custom'));
});
