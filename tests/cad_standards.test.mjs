import test from "node:test";
import assert from "node:assert/strict";
import { auditStandardParts, involuteGearOutline, metricThreadBasicDimensions, validateHexBolt, validateInvoluteGear, validateMetricThread } from "../js/cad_standards.js";

test("ISO coarse metric thread validation accepts M8 and rejects a wrong pitch",()=>{
  assert.equal(validateMetricThread({standard:"ISO 262:2023",family:"metric-thread",diameterMm:8,pitchMm:1.25,flankAngleDeg:60,toleranceClass:"6g"}).ok,true);
  const bad=validateMetricThread({diameterMm:8,pitchMm:1.5,flankAngleDeg:60});
  assert.equal(bad.ok,false); assert.ok(bad.issues.some(i=>i.code==="wrong-coarse-pitch"));
});

test("metric basic-profile geometry derives pitch and minor diameters",()=>{
  const d=metricThreadBasicDimensions(10,1.5);
  assert.equal(d.flankAngleDeg,60); assert.ok(d.pitchDiameter<10); assert.ok(d.externalMinorDiameter<d.pitchDiameter);
});

test("ISO 4017 validation requires the current edition and installed exact dimensions",()=>{
  const bolt=validateHexBolt({standard:"ISO 4017:2022",family:"hex-screw",diameterMm:8,pitchMm:1.25,lengthMm:30,flankAngleDeg:60,toleranceClass:"6g",productGrade:"A",headAcrossFlatsMm:13,headHeightMm:5.3});
  assert.equal(bolt.ok,true);
  const short=validateHexBolt({standard:"ISO 4017:2022",family:"hex-screw",diameterMm:24,pitchMm:3,lengthMm:12,flankAngleDeg:60,toleranceClass:"6g",productGrade:"A",headAcrossFlatsMm:36,headHeightMm:15});
  assert.ok(short.issues.some(i=>i.code==="preferred-length"));
});

test("involute gear validation enforces ISO module and pitch diameter",()=>{
  const gear=validateInvoluteGear({standard:"ISO 21771-1:2024",family:"involute-gear",moduleMm:2,teeth:20,pressureAngleDeg:20,profile:"involute",pitchDiameterMm:40});
  assert.equal(gear.ok,true); assert.equal(gear.computed.pitchDiameterMm,40);
  assert.equal(validateInvoluteGear({...gear,moduleMm:1.1}).ok,false);
});

test("names alone do not declare standards compliance",()=>{
  const audit=auditStandardParts({parts:[{id:"g1",name:"gear",kind:"ext"}]});
  assert.equal(audit.ok,true); assert.deepEqual(audit.blocking,[]);
});

test("audit measures linked ISO 4017 screw geometry instead of trusting its label",()=>{
  const group="s1",spec={standard:"ISO 4017:2022",family:"hex-screw",diameterMm:8,pitchMm:1.25,lengthMm:30,flankAngleDeg:60,toleranceClass:"6g",productGrade:"A",headAcrossFlatsMm:13,headHeightMm:5.3};
  const R=13/Math.sqrt(3)/10,head={id:"h",kind:"ext",name:"Hex head",axis:"y",from:3,to:3.53,standardGroupId:group,standardRole:"head",pts:Array.from({length:6},(_,i)=>({u:Math.cos(Math.PI/6+i*Math.PI/3)*R,v:Math.sin(Math.PI/6+i*Math.PI/3)*R}))};
  const shaft={id:"s",kind:"cyl",name:"ISO screw",x:0,y:0,z:0,r:.4,h:3,standardGroupId:group,standardRole:"thread",standardCompliance:spec,threadGeometry:{mode:"modeled",profile:"ISO-metric-60",pitchMm:1.25,flankAngleDeg:60}};
  assert.equal(auditStandardParts({parts:[shaft,head]}).ok,true);
  head.to=3.6;
  assert.equal(auditStandardParts({parts:[shaft,head]}).ok,false);
});

test("audit compares every involute gear profile sample",()=>{
  const spec={standard:"ISO 21771-1:2024",family:"involute-gear",moduleMm:2,teeth:20,pressureAngleDeg:20,profile:"involute",pitchDiameterMm:40};
  const gear={id:"g",kind:"ext",axis:"y",from:0,to:.8,name:"gear",standardCompliance:spec,pts:involuteGearOutline(spec)};
  assert.equal(auditStandardParts({parts:[gear]}).ok,false, "Reference root geometry is not a verified manufacturing profile");
  gear.pts[12].u+=.001;
  assert.ok(auditStandardParts({parts:[gear]}).blocking.some(issue=>issue.code==="profile-deviation"));
});
