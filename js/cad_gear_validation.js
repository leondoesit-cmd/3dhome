import {validateGearPair,rackGearSpec,generatedRackGear,gearOperatingGeometry} from './cad_gear_geometry.js';
import {materialProfileFor,validateMaterialProfile} from './engineering_materials.js';
const finite=Number.isFinite;
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function gearQualificationSignature(part,def,setup=part.gearVerification||{}){
  const spec=part.standardCompliance||part.standardPart||{};
  return stable({spec,geometry:{kind:part.kind,axis:part.axis,points:part.pts,holes:part.holes,cuts:part.cuts3d,merges:part.merges3d,operations:part.exactOperations},widthMm:Math.abs(part.to-part.from)*10,mateWidthMm:setup.mateWidthMm,
    driver:materialProfileFor(def,part.materialQualificationId),mate:materialProfileFor(def,setup.mateMaterialProfileId)});
}
// Evaluate backlash at actual operating pressure angles, not a linearized
// center-distance correction that can approve a physically impossible mesh.
export function gearToleranceEnvelope(a,b,setup){
  const A=generatedRackGear(a),B=generatedRackGear(b),p=A.spec,q=B.spec,reference=p.rp+q.rp,nominal=gearOperatingGeometry(p,q).distance,stations=[],issues=[];
  const shiftTerm=2*(p.profileShift+q.profileShift)*Math.tan(p.alpha)/(p.z+q.z);
  const inv=x=>Math.tan(x)-x,nominalBacklash=(p.backlash+q.backlash)/2;
  const thickness=setup.driverToothToleranceMm+setup.mateToothToleranceMm;
  for(const distance of [nominal-setup.centerToleranceMm,nominal,nominal+setup.centerToleranceMm]){
    if(distance<=p.rb+q.rb||distance>=p.ra+q.ra){issues.push('Center-distance tolerance leaves no valid involute mesh');continue;}
    const alpha=Math.acos((p.rb+q.rb)/distance),r1=distance*p.z/(p.z+q.z),r2=distance*q.z/(p.z+q.z),path1=Math.sqrt(p.ra**2-p.rb**2),path2=Math.sqrt(q.ra**2-q.rb**2);
    const contactRatio=(path1+path2-distance*Math.sin(alpha))/(Math.PI*p.m*Math.cos(p.alpha));
    if(contactRatio<1)issues.push('Contact ratio falls below one within the center-distance tolerance');
    if(distance-p.ra-q.rf<=0||distance-q.ra-p.rf<=0)issues.push('Tip/root clearance closes within the center-distance tolerance');
    if(path2-r2*Math.sin(alpha)>r1*Math.sin(alpha)-Math.sqrt(Math.max(0,A.rootJoinRadiusMm**2-p.rb**2))+1e-7||path1-r1*Math.sin(alpha)>r2*Math.sin(alpha)-Math.sqrt(Math.max(0,B.rootJoinRadiusMm**2-q.rb**2))+1e-7)issues.push('Mating tip reaches the root transition within the center-distance tolerance');
    const backlash=2*distance*(inv(alpha)-inv(p.alpha)-shiftTerm)+distance/reference*nominalBacklash,spread=distance/reference*thickness;
    stations.push({distance,alpha,r1,r2,contactRatio,minimumBacklashMm:backlash-spread,maximumBacklashMm:backlash+spread});
  }
  return {stations,issues:[...new Set(issues)],minimumBacklashMm:Math.min(...stations.map(s=>s.minimumBacklashMm)),maximumBacklashMm:Math.max(...stations.map(s=>s.maximumBacklashMm))};
}

// Preliminary Lewis/Hertz screening or comparison with a supplied configuration
// rating. Neither method implements the complete ISO 6336 production rating.
export function evaluateGearService(part,def,setup=part?.gearVerification||{}){
  const issues=[],checks=[],computed={},add=(code,field,message)=>issues.push({code,field,message,severity:'error'});
  const result=()=>({version:1,status:issues.length?'needs-attention':setup.method==='qualified-rating'?'within-declared-rating':'screening-passed',
    screeningPassed:!issues.length,productionApproved:false,method:setup.method||null,issues,checks,computed,
    limitations:['No ISO 6336 certification','Thermal distortion, wear, lubrication film, scuffing, rim/hub stress and full fatigue spectra require a separate design review'],
    inputSignature:gearQualificationSignature(part||{},def,setup)});
  const spec=part?.standardCompliance||part?.standardPart;
  if(!spec||spec.family!=='involute-gear'||spec.rootGeometry!=='rack-generated'){add('gear-model','geometry','Service validation requires a rack-generated external spur gear');return result();}
  if(part.kind!=='ext'||part.axis!=='y'){add('gear-model','geometry','Service validation requires the generated extruded gear model');return result();}
  const pair=validateGearPair(spec,spec.mate||{});computed.geometry=pair;
  for(const message of pair.issues)add('gear-geometry','geometry',message);
  if(pair.issues.length)return result();
  const expected=generatedRackGear(spec).points;
  if(!Array.isArray(part.pts)||part.pts.length!==expected.length||part.pts.some((p,i)=>!p||!finite(p.u)||!finite(p.v)||Math.hypot(p.u-expected[i].u,p.v-expected[i].v)>1e-6))add('gear-model','geometry','The actual tooth outline differs from the declared generated gear');
  if(setup.method==='elastic-screening'&&[part.holes,part.cuts3d,part.merges3d,part.exactOperations].some(list=>list?.length))add('unsupported-geometry','geometry','Modified rims and teeth require a configuration-specific rating');
  const width=Math.abs(part.to-part.from)*10;
  const nonnegative=['torqueNm','rpm','centerToleranceMm','driverToothToleranceMm','mateToothToleranceMm','measuredProfileErrorMm','minimumBacklashMm','maximumBacklashMm'];
  const positive=['hours','mateWidthMm','profileToleranceMm'];
  for(const key of nonnegative)if(!finite(setup[key])||setup[key]<0)add('service-input',key,key+' must be nonnegative and finite');
  for(const key of positive)if(!finite(setup[key])||setup[key]<=0)add('service-input',key,key+' must be positive and finite');
  for(const key of ['applicationFactor','dynamicFactor','faceLoadFactor','bendingSafety','contactSafety'])if(!finite(setup[key])||setup[key]<1)add('service-input',key,key+' must be at least one');
  if(!finite(width)||width<=0)add('service-input','width','The gear requires a positive face width');
  if(!finite(setup.temperatureC))add('service-input','temperatureC','Supply a finite operating temperature');
  for(const key of ['environment','lubrication','measurementSource'])if(typeof setup[key]!=='string'||!setup[key].trim())add('service-input',key,'Supply '+key);
  if(!['qualified-rating','elastic-screening'].includes(setup.method))add('service-input','method','Select a validation method');
  if(setup.maximumBacklashMm<setup.minimumBacklashMm)add('tolerance-input','backlash','Backlash limits are reversed');
  const elastic=setup.method==='elastic-screening',driver=materialProfileFor(def,part.materialQualificationId),mate=materialProfileFor(def,setup.mateMaterialProfileId);
  for(const [name,p]of [['driver',driver],['mate',mate]])issues.push(...validateMaterialProfile(p,{elastic}).map(i=>({...i,field:name+'.'+i.field})));
  if(driver&&part.materialCatalogId&&part.materialCatalogId!==driver.catalogId)add('material-changed','driver','Assigned material differs from its qualification');
  if(issues.length)return result();
  const A=rackGearSpec(spec),B=rackGearSpec(spec.mate),ratio=B.z/A.z,K=setup.applicationFactor*setup.dynamicFactor*setup.faceLoadFactor;
  computed.tangentialForceN=2000*setup.torqueNm/(2*A.rp);computed.pitchSpeedMS=Math.PI*(2*A.rp)*setup.rpm/60000;
  computed.driverCycles=setup.rpm*60*setup.hours;computed.mateCycles=computed.driverCycles/ratio;
  computed.mateTorqueNm=setup.torqueNm*ratio;computed.loadFactor=K;
  for(const [name,p,rpm,cycles]of [['driver',driver,setup.rpm,computed.driverCycles],['mate',mate,setup.rpm/ratio,computed.mateCycles]]){
    if(setup.temperatureC<p.minTemperatureC||setup.temperatureC>p.maxTemperatureC)add('temperature-limit',name,'Operating temperature is outside '+name+' qualification');
    if(rpm>p.maxRpm)add('speed-limit',name,'Speed exceeds '+name+' qualification');
    if(setup.hours>p.maxHours)add('duration-limit',name,'Service duration exceeds '+name+' qualification');
    if(cycles>p.maxCycles)add('life-limit',name,'Requested cycles exceed '+name+' qualification');
    for(const key of ['environment','lubrication'])if(setup[key].trim().toLowerCase()!==p[key].trim().toLowerCase())add('condition-mismatch',name+'.'+key,'Operating '+key+' does not match '+name+' qualification');
  }
  const envelope=gearToleranceEnvelope(spec,spec.mate,setup);
  for(const message of envelope.issues)add('mesh-tolerance','centerToleranceMm',message);
  if(envelope.stations.length!==3)return result();
  computed.tangentialForceN=Math.max(...envelope.stations.map(s=>1000*setup.torqueNm/s.r1));
  computed.pitchSpeedMS=Math.max(...envelope.stations.map(s=>2*Math.PI*s.r1*setup.rpm/60000));
  computed.backlashMinimumMm=envelope.minimumBacklashMm;computed.backlashMaximumMm=envelope.maximumBacklashMm;
  if(computed.backlashMinimumMm<setup.minimumBacklashMm-1e-12||computed.backlashMaximumMm>setup.maximumBacklashMm+1e-12)add('backlash-limit','backlash','Worst-case backlash is outside the specified limits');
  if(setup.measuredProfileErrorMm>setup.profileToleranceMm)add('profile-tolerance','profile','Measured profile error exceeds the drawing tolerance');
  checks.push({name:'backlash',actual:[computed.backlashMinimumMm,computed.backlashMaximumMm],limit:[setup.minimumBacklashMm,setup.maximumBacklashMm]},{name:'profile',actual:setup.measuredProfileErrorMm,limit:setup.profileToleranceMm});
  if(elastic){
    for(const key of ['driverFormFactor','mateFormFactor'])if(!finite(setup[key])||setup[key]<=0||setup[key]>=1)add('form-factor',key,'Supply a module-based Lewis form factor between zero and one');
    if(typeof setup.formFactorSource!=='string'||!setup.formFactorSource.trim())add('form-factor','formFactorSource','Supply the form-factor basis for these tooth geometries');
    if(issues.some(i=>i.code==='form-factor'))return result();
    const force=computed.tangentialForceN*K,b=Math.min(width,setup.mateWidthMm);
    computed.driverBendingMPa=force/(b*A.m*setup.driverFormFactor);computed.mateBendingMPa=force/(b*B.m*setup.mateFormFactor);
    const effectiveModulus=1/((1-driver.poissonRatio**2)/driver.youngModulusMPa+(1-mate.poissonRatio**2)/mate.youngModulusMPa);
    computed.contactMPa=Math.max(...envelope.stations.map(station=>{
      const r1=station.r1*Math.sin(station.alpha),r2=station.r2*Math.sin(station.alpha),radius=r1*r2/(r1+r2),normalForce=1000*setup.torqueNm/station.r1*K/Math.cos(station.alpha);
      return Math.sqrt(normalForce*effectiveModulus/(Math.PI*b*radius));
    }));
    for(const [name,actual,allowable,safety]of [['driver bending',computed.driverBendingMPa,driver.allowableBendingMPa,setup.bendingSafety],['mate bending',computed.mateBendingMPa,mate.allowableBendingMPa,setup.bendingSafety],['driver contact',computed.contactMPa,driver.allowableContactMPa,setup.contactSafety],['mate contact',computed.contactMPa,mate.allowableContactMPa,setup.contactSafety]]){
      checks.push({name,actual,limit:allowable/safety});if(actual>allowable/safety)add('stress-limit',name,name+' exceeds the qualified stress limit with the required safety factor');
    }
  }else{
    const rating=setup.rating;
    if(typeof rating?.source!=='string'||!rating.source.trim())add('rating-data','rating','Supply a configuration-specific rating report reference');
    if(rating?.signature!==gearQualificationSignature(part,def,setup))add('rating-stale','rating','The rating must identify the current geometry, face widths and both material qualifications');
    for(const [name,torque,limit]of [['driver',setup.torqueNm,rating?.driverTorqueNm],['mate',computed.mateTorqueNm,rating?.mateTorqueNm]]){
      if(!finite(limit)||limit<=0)add('rating-data',name,'Supply a positive '+name+' rated torque');
      else{const actual=torque*K*setup.bendingSafety;checks.push({name:name+' torque',actual,limit});if(actual>limit)add('torque-limit',name,'Factored '+name+' torque exceeds the supplied rating');}
    }
  }
  if(Object.values(computed).some(v=>typeof v==='number'&&!finite(v)))add('numeric-range','calculation','Inputs exceed the supported numerical range');
  return result();
}
