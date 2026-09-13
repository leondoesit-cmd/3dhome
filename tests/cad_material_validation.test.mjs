import test from 'node:test';
import assert from 'node:assert/strict';
import {ENGINEERING_MATERIALS,engineeringMaterial,initialMaterialProfile,validateMaterialProfile,upsertMaterialProfile} from '../js/engineering_materials.js';
import {generatedRackGear} from '../js/cad_gear_geometry.js';
import {evaluateGearService,gearQualificationSignature,gearToleranceEnvelope} from '../js/cad_gear_validation.js';
import {STOCK_MATERIALS} from '../js/cad_appearances.js';
import {TOOLBOX_MATERIALS} from '../js/toolbox/schema.js';
import {auditStandardParts} from '../js/cad_standards.js';
// Deliberately synthetic qualification values: these are not material tables.
function profile(catalogId,id){return {...initialMaterialProfile(catalogId,id),grade:'Synthetic grade',condition:'Test condition',source:'Synthetic regression fixture',environment:'dry',lubrication:'oil',minTemperatureC:0,maxTemperatureC:80,maxCycles:1e9,maxHours:2000,maxRpm:10000,model:'isotropic-elastic',youngModulusMPa:200000,poissonRatio:.3,allowableBendingMPa:120,allowableContactMPa:800};}
function fixture(catalog='stock:steel'){
 const spec={family:'involute-gear',rootGeometry:'rack-generated',profile:'involute',moduleMm:2,teeth:20,pressureAngleDeg:20,backlashMm:.1};spec.mate={...spec};
 const part={id:'gear',kind:'ext',axis:'y',from:0,to:.8,pts:generatedRackGear(spec).points,standardCompliance:spec,materialQualificationId:'a',materialCatalogId:catalog};
 const setup={method:'elastic-screening',mateMaterialProfileId:'b',torqueNm:1,rpm:100,hours:100,temperatureC:20,environment:'dry',lubrication:'oil',mateWidthMm:8,applicationFactor:1,dynamicFactor:1,faceLoadFactor:1,bendingSafety:1.5,contactSafety:1.5,driverFormFactor:.33,mateFormFactor:.33,formFactorSource:'Synthetic Y fixture',centerToleranceMm:0,driverToothToleranceMm:0,mateToothToleranceMm:0,minimumBacklashMm:0,maximumBacklashMm:.2,profileToleranceMm:.02,measuredProfileErrorMm:.01,measurementSource:'Synthetic inspection fixture'};
 part.gearVerification=setup;return {part,setup,def:{parts:[part],engineeringMaterials:[profile(catalog,'a'),profile(catalog,'b')]}};
}
test('every stock and toolbox material has a distinct engineering identity, including custom',()=>{
 assert.equal(ENGINEERING_MATERIALS.length,Object.keys(STOCK_MATERIALS).length+Object.keys(TOOLBOX_MATERIALS).length+1);
 assert.equal(new Set(ENGINEERING_MATERIALS.map(m=>m.id)).size,ENGINEERING_MATERIALS.length);
 assert.equal(engineeringMaterial('stock:aluminum').name,'Aluminum 6061');assert.equal(engineeringMaterial('toolbox:aluminum').name,'Aluminum 6063');
 for(const row of ENGINEERING_MATERIALS){const p=initialMaterialProfile(row.id,'p');assert.equal(p.allowableBendingMPa,0);assert.ok(validateMaterialProfile(p).length);}
});
test('all materials can use a supplied configuration rating without invented elastic properties',()=>{
 for(const material of ENGINEERING_MATERIALS){const {part,setup,def}=fixture(material.id);setup.method='qualified-rating';for(const p of def.engineeringMaterials){p.model='qualified-rating';p.youngModulusMPa=0;p.allowableBendingMPa=0;p.allowableContactMPa=0;}
  setup.rating={source:'Synthetic configuration test',driverTorqueNm:10,mateTorqueNm:10,signature:gearQualificationSignature(part,def)};
  const report=evaluateGearService(part,def);assert.equal(report.status,'within-declared-rating',material.id+JSON.stringify(report.issues));assert.equal(report.productionApproved,false);
 }
});
test('elastic screening uses torque units, both materials, Lewis factors and stress safety factors',()=>{
 const {part,setup,def}=fixture(),result=evaluateGearService(part,def);
 assert.equal(result.screeningPassed,true,JSON.stringify(result.issues));assert.equal(result.productionApproved,false);
 assert.ok(Math.abs(result.computed.tangentialForceN-50)<1e-9);assert.ok(Math.abs(result.computed.driverBendingMPa-50/(8*2*.33))<1e-9);
 const alpha=20*Math.PI/180,normal=50/Math.cos(alpha),effectiveE=200000/(2*(1-.3**2)),radius=10*Math.sin(alpha);
 assert.ok(Math.abs(result.computed.contactMPa-Math.sqrt(normal*effectiveE/(Math.PI*8*radius)))<1e-8);
 setup.torqueNm=4;const higher=evaluateGearService(part,def);assert.ok(Math.abs(higher.computed.driverBendingMPa/result.computed.driverBendingMPa-4)<1e-8);assert.ok(Math.abs(higher.computed.contactMPa/result.computed.contactMPa-2)<1e-8);
 def.engineeringMaterials[1].allowableContactMPa=1;assert.ok(evaluateGearService(part,def).issues.some(i=>i.code==='stress-limit'));
});
test('missing strength data and unsupported elastic assumptions never report a pass',()=>{
 for(const id of ['stock:steel','stock:plastic','toolbox:beech','toolbox:chrome','custom']){
  const {part,def}=fixture(id);def.engineeringMaterials[0]=initialMaterialProfile(id,'a');assert.equal(evaluateGearService(part,def).screeningPassed,false);
 }
 const wood=fixture('toolbox:beech');assert.ok(evaluateGearService(wood.part,wood.def).issues.some(i=>i.field==='driver.model'));
});
test('qualification limits include static duration, cycles, temperature, speed and environment',()=>{
 for(const [key,value,code]of [['hours',3000,'duration-limit'],['rpm',20000,'speed-limit'],['temperatureC',81,'temperature-limit'],['environment','wet','condition-mismatch'],['lubrication','dry','condition-mismatch']]){
  const {part,setup,def}=fixture();setup[key]=value;assert.ok(evaluateGearService(part,def).issues.some(i=>i.code===code),key);
 }
 const {part,setup,def}=fixture();setup.rpm=0;setup.hours=10000;assert.ok(evaluateGearService(part,def).issues.some(i=>i.code==='duration-limit'));
 def.engineeringMaterials[0].maxCycles=1;setup.rpm=100;setup.hours=1;assert.ok(evaluateGearService(part,def).issues.some(i=>i.code==='life-limit'));
});
test('ratings are stale after geometry, face width, or either material changes and survive JSON unchanged',()=>{
 for(const mutate of [x=>x.setup.mateWidthMm=7,x=>x.part.to=1,x=>x.def.engineeringMaterials[1].condition='Changed treatment',x=>x.part.holes=[[{u:0,v:0},{u:.1,v:0},{u:0,v:.1}]]]){
  const x=fixture();x.setup.method='qualified-rating';x.setup.rating={source:'Synthetic report',driverTorqueNm:10,mateTorqueNm:10,signature:gearQualificationSignature(x.part,x.def)};
  const saved=JSON.parse(JSON.stringify(x.def));assert.equal(evaluateGearService(saved.parts[0],saved).screeningPassed,true);mutate(x);assert.ok(evaluateGearService(x.part,x.def).issues.some(i=>i.code==='rating-stale'));
 }
});
test('load changes do not silently requalify a rating and overload is caught',()=>{
 const {part,setup,def}=fixture();setup.method='qualified-rating';setup.rating={source:'Synthetic report',driverTorqueNm:2,mateTorqueNm:2,signature:gearQualificationSignature(part,def)};
 setup.torqueNm=5;const report=evaluateGearService(part,def);assert.ok(report.issues.some(i=>i.code==='torque-limit'));assert.ok(!report.issues.some(i=>i.code==='rating-stale'));
});
test('center and tooth tolerances are checked against operating backlash and mesh limits',()=>{
 const {part,setup,def}=fixture(),nominal=gearToleranceEnvelope(part.standardCompliance,part.standardCompliance.mate,setup);
 assert.ok(Math.abs(nominal.minimumBacklashMm-.1)<1e-10);
 setup.centerToleranceMm=.02;setup.driverToothToleranceMm=.01;setup.mateToothToleranceMm=.01;
 const envelope=gearToleranceEnvelope(part.standardCompliance,part.standardCompliance.mate,setup);assert.ok(envelope.minimumBacklashMm<.1);assert.ok(envelope.maximumBacklashMm>.1);
 setup.minimumBacklashMm=.09;assert.ok(evaluateGearService(part,def).issues.some(i=>i.code==='backlash-limit'));
 setup.centerToleranceMm=100;assert.ok(evaluateGearService(part,def).issues.some(i=>i.code==='mesh-tolerance'));
});
test('numeric corruption, missing evidence, edited outlines and profile errors fail closed',()=>{
 for(const mutate of [x=>x.setup.torqueNm=NaN,x=>x.setup.applicationFactor=Infinity,x=>x.setup.hours=-1,x=>x.setup.measurementSource='',x=>x.def.engineeringMaterials[0].source='',x=>x.part.pts[0].u+=.1,x=>x.setup.measuredProfileErrorMm=.03]){const x=fixture();mutate(x);assert.equal(evaluateGearService(x.part,x.def).screeningPassed,false);}
});
test('material changes invalidate cached reports and audit includes the live service assessment',()=>{
 const {part,def}=fixture();part.gearVerificationReport={status:'old'};def.lastStandardsAudit={ok:true};upsertMaterialProfile(def,{...def.engineeringMaterials[0],condition:'Changed'});
 assert.equal(part.gearVerificationReport,undefined);assert.equal(def.lastStandardsAudit,undefined);
 const audit=auditStandardParts(def);assert.equal(audit.ok,false);assert.equal(audit.results[0].serviceAssessment.screeningPassed,true);assert.ok(audit.blocking.some(i=>i.code==='production-validation'));
 part.materialCatalogId='stock:plastic';assert.ok(evaluateGearService(part,def).issues.some(i=>i.code==='material-changed'));
});

test('corrupt outline vertices and non-text rating evidence return issues instead of throwing',()=>{
 const x=fixture();x.part.pts[0]=null;assert.ok(evaluateGearService(x.part,x.def).issues.some(i=>i.code==='gear-model'));
 const y=fixture();y.setup.method='qualified-rating';y.setup.rating={source:42,driverTorqueNm:10,mateTorqueNm:10,signature:gearQualificationSignature(y.part,y.def)};assert.ok(evaluateGearService(y.part,y.def).issues.some(i=>i.code==='rating-data'));
});
