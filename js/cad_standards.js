import {evaluateGearService} from "./cad_gear_validation.js";
import {generatedRackGear,validateGearPair} from "./cad_gear_geometry.js";
// Standards compliance engine. Standard dimensions are stored in millimetres,
// independently of the editor's display units. A part is never certified from
// its name or appearance: it must carry a standard declaration and pass every
// mandatory rule for that declared edition.

import { isToolboxFamily, validateToolboxSpec } from "./toolbox/audit.js";
import { ISO4017_HEX, PREFERRED_LENGTHS_MM } from "./toolbox/fastener_tables.js";

export const STANDARD_CATALOG = Object.freeze({
  "ISO 262:2023": { family:"metric-thread", status:"published", source:"https://www.iso.org/standard/85105.html" },
  "ISO 68-1:2023": { family:"metric-thread-profile", status:"published", source:"https://www.iso.org/standard/73032.html" },
  "ISO 724:2023": { family:"metric-thread-basic-dimensions", status:"published", source:"https://www.iso.org/standard/85103.html" },
  "ISO 965-1:2026": { family:"metric-thread-tolerance", status:"published", source:"https://www.iso.org/standard/87889.html" },
  "ISO 4014:2022": { family:"hex-bolt", status:"published", source:"https://www.iso.org/standard/72583.html" },
  "ISO 4017:2022": { family:"hex-screw", status:"published", source:"https://www.iso.org/standard/72585.html" },
  "ISO 4032:2023": { family:"hex-nut", status:"published", source:"https://www.iso.org/standard/84744.html" },
  "ISO 4035:2023": { family:"jam-nut", status:"published", source:"https://www.iso.org/standard/84746.html" },
  "ISO 4762:2018": { family:"shcs", status:"published", source:"https://www.iso.org/standard/70511.html" },
  "ISO 7040:2012": { family:"nyloc-nut", status:"published", source:"https://www.iso.org/standard/51351.html" },
  "ISO 7089:2000": { family:"washer-flat", status:"published", source:"https://www.iso.org/standard/30148.html" },
  "ISO 7380-1:2022": { family:"button-socket", status:"published", source:"https://www.iso.org/standard/70514.html" },
  "ISO 10642:2019": { family:"csink-socket", status:"published", source:"https://www.iso.org/standard/70513.html" },
  "EN 1057": { family:"pipe-copper", status:"published", source:"https://www.en-standard.eu" },
  "ISO 53:1998": { family:"gear-rack-profile", status:"published-confirmed", source:"https://www.iso.org/standard/22643.html" },
  "ISO 54:1996": { family:"gear-module", status:"published-confirmed", source:"https://www.iso.org/standard/22644.html" },
  "ISO 21771-1:2024": { family:"involute-gear-geometry", status:"published-revision-pending", source:"https://www.iso.org/standard/84949.html" },
});

// Commercial coarse-pitch series used by ISO metric fasteners. Fine pitches
// must be declared explicitly and are rejected unless a licensed table pack is
// installed; guessing a pitch is never treated as compliance.
const COARSE_PITCH = new Map([[1,0.25],[1.2,0.25],[1.4,0.3],[1.6,0.35],[2,0.4],[2.5,0.45],[3,0.5],[3.5,0.6],[4,0.7],[5,0.8],[6,1],[7,1],[8,1.25],[10,1.5],[12,1.75],[14,2],[16,2],[18,2.5],[20,2.5],[22,2.5],[24,3],[27,3],[30,3.5],[33,3.5],[36,4],[39,4],[42,4.5],[45,4.5],[48,5],[52,5],[56,5.5],[60,5.5],[64,6]]);
const ISO54_MODULES = new Set([0.05,0.06,0.08,0.1,0.12,0.15,0.2,0.25,0.3,0.4,0.5,0.6,0.8,1,1.25,1.5,2,2.5,3,4,5,6,8,10,12,16,20,25,32,40,50]);
// Installed, versioned dimensional pack used by the tutorial generator.  A
// size absent from this pack is rejected rather than interpolated.
const ISO4017_PACK = Object.freeze(Object.fromEntries(
  Object.keys(ISO4017_HEX).filter((key) => key.startsWith("M")).map((key) => {
    const row = ISO4017_HEX[key];
    return [key, Object.freeze({
      diameterMm: row.diameterMm, pitchMm: row.pitchMm,
      headAcrossFlatsMm: row.af, headHeightMm: row.h,
      lengthsMm: PREFERRED_LENGTHS_MM.filter((mm) => mm >= row.diameterMm * 1.5 || mm >= 12),
    })];
  }),
));
const near = (a,b,t=1e-6) => Math.abs(Number(a)-Number(b)) <= t;
const issue = (code,message,field,severity="error") => ({code,message,field,severity});

export function metricThreadBasicDimensions(diameterMm, pitchMm) {
  const d=Number(diameterMm), p=Number(pitchMm), H=Math.sqrt(3)*p/2;
  return { majorDiameter:d, pitchDiameter:d-0.75*H, externalMinorDiameter:d-1.4166666667*H, fundamentalTriangleHeight:H, flankAngleDeg:60 };
}

export function validateMetricThread(spec) {
  const issues=[], d=Number(spec.diameterMm), p=Number(spec.pitchMm), expected=COARSE_PITCH.get(d);
  if(!Number.isFinite(d)||d<=0) issues.push(issue("diameter","Nominal diameter must be positive","diameterMm"));
  if(!Number.isFinite(p)||p<=0) issues.push(issue("pitch","Pitch must be positive","pitchMm"));
  if(spec.series!=="fine" && expected==null) issues.push(issue("size-not-in-pack","Diameter is not in the installed ISO 262 coarse-size pack","diameterMm"));
  else if(spec.series!=="fine" && !near(p,expected)) issues.push(issue("wrong-coarse-pitch",`M${d} coarse pitch must be ${expected} mm`,"pitchMm"));
  if(spec.series==="fine") issues.push(issue("licensed-table-required","Fine-pitch verification requires an installed licensed standards table","pitchMm"));
  if(spec.flankAngleDeg!=null && !near(spec.flankAngleDeg,60)) issues.push(issue("wrong-profile-angle","ISO metric thread flank angle must be 60°","flankAngleDeg"));
  if(spec.toleranceClass && !/^(?:[3-9][A-H]|[3-9][a-h])(?:[3-9][A-Ha-h])?$/.test(spec.toleranceClass)) issues.push(issue("tolerance-class","Invalid ISO 965 tolerance-class designation","toleranceClass"));
  return report(spec.standard || "ISO 262:2023",issues,{basic:metricThreadBasicDimensions(d,p),designation:`M${d}${expected===p?"":"×"+p}`});
}

export function validateHexBolt(spec) {
  const issues=[];
  if(spec.standard!=="ISO 4017:2022") issues.push(issue("standard-edition","Hexagon head screw must declare ISO 4017:2022","standard"));
  if(Number(spec.diameterMm)<1.6||Number(spec.diameterMm)>64) issues.push(issue("diameter-range","ISO 4017:2022 covers M1.6 through M64","diameterMm"));
  if(!["A","B"].includes(spec.productGrade)) issues.push(issue("product-grade","Product grade must be A or B","productGrade"));
  const thread=validateMetricThread(spec); issues.push(...thread.issues);
  if(!Number.isFinite(Number(spec.lengthMm))||Number(spec.lengthMm)<=0) issues.push(issue("length","Bolt length must be positive","lengthMm"));
  const pack=ISO4017_PACK[`M${Number(spec.diameterMm)}`];
  if(!pack) issues.push(issue("table-pack","Exact dimensional verification is unavailable for this size in the installed ISO 4017 pack","diameterMm"));
  else {
    if(!pack.lengthsMm.includes(Number(spec.lengthMm))) issues.push(issue("preferred-length","Length is not in the installed ISO 4017 size table","lengthMm"));
    if(!near(spec.headAcrossFlatsMm,pack.headAcrossFlatsMm,1e-4)) issues.push(issue("head-width",`Head across flats must be ${pack.headAcrossFlatsMm} mm`,"headAcrossFlatsMm"));
    if(!near(spec.headHeightMm,pack.headHeightMm,1e-4)) issues.push(issue("head-height",`Head height must be ${pack.headHeightMm} mm`,"headHeightMm"));
  }
  return report("ISO 4017:2022",issues,{thread:thread.computed,dimensions:pack||null});
}

function polygonAcrossFlatsMm(part) {
  if(!part||part.kind!=="ext"||!Array.isArray(part.pts)||part.pts.length!==6)return NaN;
  let minimum=Infinity;
  for(let i=0;i<3;i++){
    const a=part.pts[i],b=part.pts[(i+1)%6],dx=b.u-a.u,dv=b.v-a.v,den=Math.hypot(dx,dv);if(!den)return NaN;
    const nx=-dv/den,nv=dx/den,projections=part.pts.map(p=>p.u*nx+p.v*nv);
    minimum=Math.min(minimum,(Math.max(...projections)-Math.min(...projections))*10);
  }
  return minimum;
}

function validateHexScrewGeometry(part,def,spec) {
  const issues=[],group=(def.parts||[]).filter(p=>p.standardGroupId===part.standardGroupId),shaft=group.find(p=>p.standardRole==="thread"),head=group.find(p=>p.standardRole==="head");
  if(!part.standardGroupId||!shaft||!head){issues.push(issue("geometry-group","Standard screw must contain linked thread and head geometry","standardGroupId"));return issues;}
  if(shaft.kind!=="cyl")issues.push(issue("thread-envelope","Thread envelope must be cylindrical","kind"));
  else {
    if(!near(shaft.r*20,spec.diameterMm,1e-4))issues.push(issue("major-diameter","Measured thread major diameter differs from the declaration","diameterMm"));
    if(!near(shaft.h*10,spec.lengthMm,1e-4))issues.push(issue("measured-length","Measured screw length differs from the declaration","lengthMm"));
  }
  if(head.kind!=="ext"||head.axis!=="y")issues.push(issue("head-form","ISO 4017 head must be a hexagonal prism","head"));
  else {
    if(!near(polygonAcrossFlatsMm(head),spec.headAcrossFlatsMm,1e-3))issues.push(issue("measured-head-width","Measured head width differs from the declaration","headAcrossFlatsMm"));
    if(!near(Math.abs(head.to-head.from)*10,spec.headHeightMm,1e-4))issues.push(issue("measured-head-height","Measured head height differs from the declaration","headHeightMm"));
  }
  const tg=shaft.threadGeometry;
  if(!tg||tg.profile!=="ISO-metric-60"||tg.mode!=="modeled")issues.push(issue("thread-geometry","A cosmetic or missing thread cannot pass exact compliance","threadGeometry"));
  else {
    if(!near(tg.pitchMm,spec.pitchMm,1e-6))issues.push(issue("measured-pitch","Modeled thread pitch differs from the declaration","pitchMm"));
    if(!near(tg.flankAngleDeg,60,1e-6))issues.push(issue("measured-flank","Modeled thread flank angle must be 60°","flankAngleDeg"));
  }
  return issues;
}

export function involuteGearOutline(spec) {
  if(spec.rootGeometry==="rack-generated")return generatedRackGear(spec).points;
  const m=Number(spec.moduleMm),z=Number(spec.teeth),alpha=Number(spec.pressureAngleDeg??20)*Math.PI/180;
  if(!(m>0)||!Number.isInteger(z)||z<5)return [];
  const rp=m*z/2,rb=rp*Math.cos(alpha),ra=rp+m,rf=Math.max(0.05,rp-1.25*m),invA=Math.tan(alpha)-alpha,half=Math.PI/(2*z),pts=[];
  const inv=r=>{const rr=Math.max(r,rb);return Math.sqrt((rr/ rb)**2-1)-Math.acos(rb/rr);};
  const polar=(r,a)=>({u:r*Math.cos(a)/10,v:r*Math.sin(a)/10});
  for(let tooth=0;tooth<z;tooth++){
    const c=tooth*Math.PI*2/z,rootOffset=half+invA-inv(Math.max(rb,rf));
    pts.push(polar(rf,c-rootOffset));
    for(let s=0;s<=6;s++){const r=Math.max(rb,rf)+(ra-Math.max(rb,rf))*s/6;pts.push(polar(r,c-(half+invA-inv(r))));}
    const tip=half+invA-inv(ra);
    for(let s=1;s<=3;s++)pts.push(polar(ra,c-tip+2*tip*s/3));
    for(let s=6;s>=0;s--){const r=Math.max(rb,rf)+(ra-Math.max(rb,rf))*s/6;pts.push(polar(r,c+(half+invA-inv(r))));}
    pts.push(polar(rf,c+rootOffset));
  }
  return cleanGearLoop(pts);
}

function cleanGearLoop(points) {
  const out=[];
  for(const p of points){const last=out[out.length-1];if(!last||Math.hypot(p.u-last.u,p.v-last.v)>1e-10)out.push(p);}
  if(out.length>1&&Math.hypot(out[0].u-out.at(-1).u,out[0].v-out.at(-1).v)<1e-10)out.pop();
  return out;
}

function validateGearGeometry(part,spec,service) {
  let expected;try{expected=involuteGearOutline(spec);}catch(error){return [issue("gear-generation",error.message,"cutter")];}
  const actual=cleanGearLoop(part&&part.pts||[]),issues=[];
  if(part.kind!=="ext"||part.axis!=="y")issues.push(issue("gear-solid","Gear must be an extruded involute profile","kind"));
  if(actual.length!==expected.length)issues.push(issue("profile-samples","Involute profile sample count differs from the verified generator","pts"));
  else for(let i=0;i<expected.length;i++)if(!near(actual[i].u,expected[i].u,1e-6)||!near(actual[i].v,expected[i].v,1e-6)){issues.push(issue("profile-deviation",`Gear profile deviates at sample ${i+1}`,"pts"));break;}
  if(spec.rootGeometry!=="rack-generated")issues.push(issue("unverified-gear-root","Reference involute outline uses a radial root transition; cutter-generated root geometry and mating clearance are not verified","rootGeometry"));
  if(spec.rootGeometry==="rack-generated"){
    if(!spec.mate)issues.push(issue("missing-mating-gear","Specify a mating gear before checking pair geometry","mate"));
    else {const pair=validateGearPair(spec,spec.mate);for(const message of pair.issues)issues.push(issue("gear-meshing",message,"mate"));}
    // Sampled generated geometry still needs production tolerance and load approval.
    if(service)issues.push(...service.issues);
    issues.push(issue("production-validation",service?.screeningPassed?"Material/load screening is within supplied limits; full production rating and process approval remain required":"Complete the material qualification, service load and tolerance checks; full production approval remains separate","manufacturing"));
  }
  return issues;
}

export function validateInvoluteGear(spec) {
  const issues=[], m=Number(spec.moduleMm), z=Number(spec.teeth), alpha=Number(spec.pressureAngleDeg ?? 20);
  if(!ISO54_MODULES.has(m)) issues.push(issue("module-series","Module is not in the installed ISO 54 preferred-module series","moduleMm"));
  if(!Number.isInteger(z)||z<5) issues.push(issue("tooth-count","Tooth count must be an integer of at least 5","teeth"));
  if(!Number.isFinite(alpha)||alpha<=0||alpha>=45) issues.push(issue("pressure-angle","Pressure angle must be explicitly valid","pressureAngleDeg"));
  const pitchDiameter=m*z, baseDiameter=pitchDiameter*Math.cos(alpha*Math.PI/180);
  if(spec.pitchDiameterMm!=null&&!near(spec.pitchDiameterMm,pitchDiameter,1e-4)) issues.push(issue("pitch-diameter",`Pitch diameter must equal module × teeth (${pitchDiameter} mm)`,"pitchDiameterMm"));
  if(spec.profile!=="involute") issues.push(issue("profile","ISO cylindrical gear declaration requires an involute profile","profile"));
  return report("ISO 21771-1:2024",issues,{pitchDiameterMm:pitchDiameter,baseDiameterMm:baseDiameter,standardModule:m});
}

export function validateStandardPart(part,def={parts:[part]}) {
  if(!part.standardCompliance && !part.standardPart) return report(null,[issue("missing-declaration","Recognized standardized part has no standard declaration","standardCompliance")], {status:"noncompliant"});
  const declaration=Object.assign({}, part.standardCompliance||{}, part.standardPart||{});
  if(declaration.family==="metric-thread") return validateMetricThread(declaration);
  if(declaration.family==="hex-screw" && String(declaration.standard||"").indexOf("ISO 4017")===0) {
    const r=validateHexBolt(declaration);r.issues.push(...validateHexScrewGeometry(part,def,declaration));r.ok=r.issues.every(i=>i.severity!=="error");r.status=r.ok?"compliant":"noncompliant";return r;
  }
  if(declaration.family==="involute-gear") { const r=validateInvoluteGear(declaration);r.serviceAssessment=evaluateGearService(part,def);r.issues.push(...validateGearGeometry(part,declaration,r.serviceAssessment));r.ok=r.issues.every(i=>i.severity!=="error");r.status=r.ok?"compliant":"noncompliant";return r; }
  if(isToolboxFamily(declaration.family)) return validateToolboxSpec(declaration);
  return report(declaration.standard,[issue("unsupported-standard","No verified validator is installed for this standard","standard")], {status:"unsupported"});
}

function representativeStandardPart(def, part) {
  const group=part.standardGroupId;
  if(!group) return part;
  const members=(def.parts||[]).filter(p=>p.standardGroupId===group);
  return members.find(p=>p.standardCompliance) || members.find(p=>p.standardRole==="thread") || part;
}

export function auditStandardParts(def) {
  const results=[];
  const seen=new Set();
  for(const part of def.parts||[]){
    // A name is not a declaration of conformance. Audit explicit metadata only.
    if(!(part.standardCompliance||part.standardPart)) continue;
    const group=part.standardGroupId;
    if(group){
      if(seen.has(group)) continue;
      seen.add(group);
    }
    const target=representativeStandardPart(def, part);
    results.push({partId:target.id,name:target.name||target.kind,groupId:group,...validateStandardPart(target,def)});
  }
  return {ok:results.every(r=>r.ok),checked:results.length,results,blocking:results.flatMap(r=>r.issues.filter(i=>i.severity==="error").map(i=>({...i,partId:r.partId,partName:r.name})))};
}

function report(standard,issues,computed={}) {
  const status=computed.status || (issues.some(i=>i.severity==="error")?"noncompliant":"compliant");
  return {ok:issues.every(i=>i.severity!=="error"),standard,edition:standard?.split(":")[1]||null,issues,computed,status};
}

export const STANDARD_DIMENSION_TABLES = Object.freeze({coarsePitch:Object.freeze(Object.fromEntries(COARSE_PITCH)),gearModules:Object.freeze(Array.from(ISO54_MODULES)),hexScrews:ISO4017_PACK});
