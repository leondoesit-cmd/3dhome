import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMaterialProfile,assignMaterialProfile} from '../js/engineering_materials.js';
import {evaluateMassProperties} from '../js/cad_mass_properties.js';
const box=()=>({id:'body',kind:'box',x0:0,x1:2,y0:0,y1:2,z0:0,z1:2,density:7.85});
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
