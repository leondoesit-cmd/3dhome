// ISO metric thread geometry (ISO 68-1 / 724 / 965) plus cosmetic and modeled
// representations. Dimensions travel in millimetres at the ISO boundary and
// centimetres inside the document. A cosmetic thread is the SolidWorks-style
// annotation: the cylinder stays smooth, a helical overlay and a callout carry
// the specification. A modeled thread is a helical triangular solid used as a
// cut (internal) or boss (external).

import { metricThreadBasicDimensions, validateMetricThread } from "./cad_standards.js";
import { helixPoint, normalizeHelixSpec, sampleHelix } from "./cad_helix.js";

const H_FACTOR = Math.sqrt(3) / 2; // 0.8660254… × pitch = fundamental triangle height

export const THREAD_HANDS = Object.freeze(["rh", "lh"]);
export const THREAD_MODES = Object.freeze(["cosmetic", "modeled"]);
export const THREAD_SIDES = Object.freeze(["external", "internal"]);

export function mmToCm(mm) { return Number(mm) / 10; }
export function cmToMm(cm) { return Number(cm) * 10; }

export function threadDesignation(diameterMm, pitchMm, options = {}) {
  const d = Number(diameterMm), p = Number(pitchMm);
  const coarse = options.series !== "fine";
  const pitchPart = coarse && options.omitCoarsePitch ? "" : "×" + p;
  const hand = options.handedness === "lh" ? " LH" : "";
  const cls = options.toleranceClass ? " " + options.toleranceClass : "";
  return "M" + d + pitchPart + cls + hand;
}

export function isoMetricProfile(diameterMm, pitchMm, side = "external") {
  const basic = metricThreadBasicDimensions(diameterMm, pitchMm);
  const p = Number(pitchMm), H = H_FACTOR * p;
  const crestTrunc = H / 8, rootTrunc = H / 4;
  const major = basic.majorDiameter;
  const minorExt = basic.externalMinorDiameter;
  const pitchD = basic.pitchDiameter;
  if (side === "internal") {
    // Internal: crest at minor, root at major. Truncations inverted vs bolt.
    const minor = major - 5 / 4 * H; // ISO 68-1 internal minor (approx D1)
    return {
      ...basic,
      side: "internal",
      crestDiameter: minor,
      rootDiameter: major,
      pitchDiameter: pitchD,
      profileHeight: H - crestTrunc - rootTrunc,
      pitch: p,
    };
  }
  return {
    ...basic,
    side: "external",
    crestDiameter: major,
    rootDiameter: minorExt,
    pitchDiameter: pitchD,
    profileHeight: H - crestTrunc - rootTrunc,
    pitch: p,
  };
}

// 2D thread-form triangle in a plane whose x is radial (cm from axis) and y
// is axial (cm). The helix sweep carries this around the cylinder.
export function threadProfilePoints(spec) {
  const side = spec.side === "internal" ? "internal" : "external";
  const pCm = mmToCm(spec.pitchMm), basic=metricThreadBasicDimensions(spec.diameterMm,spec.pitchMm);
  const limits=spec.fitLimits;
  const midpoint=(range,fallback)=>range ? (Number(range.min)+Number(range.max))/2 : fallback;
  const majorR=mmToCm(midpoint(limits?.majorDiameter,basic.majorDiameter))/2;
  const minorDefault=side==="external"?basic.externalMinorDiameter:basic.majorDiameter-1.25*basic.fundamentalTriangleHeight;
  const minorR=mmToCm(midpoint(limits?.minorDiameter,minorDefault))/2;
  const pitchR=mmToCm(midpoint(limits?.pitchDiameter,basic.pitchDiameter))/2;
  // Straight 60-degree flanks through the pitch diameter. Root rounding is
  // separately specified by tooling; this representation has a flat root.
  const halfWidth=r=>pCm/4+(side==="external"?-1:1)*(r-pitchR)/Math.sqrt(3);
  const minorWidth=halfWidth(minorR),majorWidth=halfWidth(majorR);
  if(!(minorR>0&&majorR>minorR&&minorWidth>0&&majorWidth>0&&minorWidth<pCm/2&&majorWidth<pCm/2))throw new Error("Thread limits do not define a valid 60-degree profile");
  return [{x:minorR,y:-minorWidth},{x:majorR,y:-majorWidth},{x:majorR,y:majorWidth},{x:minorR,y:minorWidth}];
}

export function normalizeThreadSpec(spec = {}) {
  const diameterMm = spec.diameterMm != null ? Number(spec.diameterMm) : cmToMm(Number(spec.diameter ?? 0));
  const pitchMm = spec.pitchMm != null ? Number(spec.pitchMm) : cmToMm(Number(spec.pitch ?? 0));
  const lengthMm = spec.lengthMm != null ? Number(spec.lengthMm) : cmToMm(Number(spec.length ?? spec.height ?? 0));
  const side = spec.side === "internal" || spec.internal ? "internal" : "external";
  const mode = spec.mode === "modeled" ? "modeled" : "cosmetic";
  const handedness = spec.handedness === "lh" || spec.handedness === "left" ? "lh" : "rh";
  const origin = spec.origin || { x: 0, y: 0, z: 0 };
  const axis = spec.axis || { x: 0, y: 1, z: 0 };
  const turns = pitchMm > 0 ? lengthMm / pitchMm : 0;
  const standard = {
    family: "metric-thread",
    standard: spec.standard || "ISO 262:2023",
    diameterMm,
    pitchMm,
    flankAngleDeg: 60,
    toleranceClass: spec.toleranceClass || (side === "internal" ? "6H" : "6g"),
    series: spec.series || "coarse",
    handedness,
  };
  return {
    ...standard,
    side,
    mode,
    fitLimits: spec.useFitLimits === false ? null : spec.useFitLimits ? {
      source:spec.fitSource, units:"mm", diameterMm,pitchMm,toleranceClass:standard.toleranceClass,
      majorDiameter:{min:Number(spec.majorMinMm),max:Number(spec.majorMaxMm)},
      pitchDiameter:{min:Number(spec.pitchMinMm),max:Number(spec.pitchMaxMm)},
      minorDiameter:{min:Number(spec.minorMinMm),max:Number(spec.minorMaxMm)},
    } : spec.fitLimits ? structuredClone(spec.fitLimits) : null,
    runoutStartMm: Number(spec.runoutStartMm ?? 0),
    runoutEndMm: Number(spec.runoutEndMm ?? 0),
    endCondition:spec.endCondition,
    lengthMm,
    length: mmToCm(lengthMm),
    diameter: mmToCm(diameterMm),
    pitch: mmToCm(pitchMm),
    origin,
    axis,
    turns,
    startAngle: Number(spec.startAngle) || 0,
    designation: threadDesignation(diameterMm, pitchMm, {
      handedness,
      toleranceClass: standard.toleranceClass,
      series: standard.series,
    }),
  };
}

export function validateThreadFeature(spec) {
  const thread = normalizeThreadSpec(spec);
  const report = validateMetricThread(thread);
  const issues = report.issues.slice();
  if (!Number.isFinite(thread.lengthMm) || !(thread.lengthMm > 0)) issues.push({ code: "thread-length", message: "Thread length must be positive", field: "lengthMm", severity: "error" });
  if (!THREAD_SIDES.includes(thread.side)) issues.push({ code: "thread-side", message: "Thread side must be external or internal", field: "side", severity: "error" });
  const fail=(code,message,field)=>issues.push({code,message,field,severity:"error"});
  if(spec.side!=null&&!THREAD_SIDES.includes(spec.side))fail("thread-side","Unknown thread side","side");
  if(![thread.origin.x,thread.origin.y,thread.origin.z,thread.axis.x,thread.axis.y,thread.axis.z].every(Number.isFinite)||Math.hypot(thread.axis.x,thread.axis.y,thread.axis.z)<1e-12)fail("thread-axis","Thread placement requires finite coordinates and a nonzero axis","axis");
  const classPattern=thread.side==="internal"?/^(?:[3-9][GH]){1,2}$/:/^(?:[3-9][efgh]){1,2}$/;
  if(!classPattern.test(thread.toleranceClass))fail("thread-class-side","Tolerance class must match the internal or external thread side","toleranceClass");
  if(![thread.runoutStartMm,thread.runoutEndMm].every(n=>Number.isFinite(n)&&n>=0)||thread.runoutStartMm+thread.runoutEndMm>=thread.lengthMm)fail("thread-runout","Runouts must be nonnegative and leave a positive full-form thread length","runoutStartMm");
  const limits=thread.fitLimits;
  if(limits){
    if(!limits.source||limits.units!=="mm"||limits.toleranceClass!==thread.toleranceClass||Number(limits.diameterMm)!==thread.diameterMm||Number(limits.pitchMm)!==thread.pitchMm)fail("thread-fit-source","Fit limits need a source, millimetre units, and matching size, pitch and class","fitLimits");
    for(const key of ["majorDiameter","pitchDiameter","minorDiameter"]){
      const range=limits[key];
      if(!range||![range.min,range.max].every(n=>Number.isFinite(n)&&n>0)||range.min>range.max)fail("thread-fit-range","Invalid "+key+" limits","fitLimits");
    }
    if(!issues.some(i=>i.code==="thread-fit-range"))for(const bound of ["min","max"])if(!(limits.minorDiameter[bound]<limits.pitchDiameter[bound]&&limits.pitchDiameter[bound]<limits.majorDiameter[bound]))fail("thread-fit-order","Thread diameters must increase from minor to pitch to major","fitLimits");
  }
  return { ok: issues.every((i) => i.severity !== "error"), issues, spec: thread, computed: {...report.computed,fitStatus:limits?"supplied-limits":"basic-profile-only"} };
}

export function cosmeticThread(spec) {
  const thread = normalizeThreadSpec(spec);
  const helix = sampleHelix({
    origin: thread.origin,
    axis: thread.axis,
    radius: thread.diameter / 2,
    pitch: thread.pitch,
    turns: thread.turns,
    handedness: thread.handedness,
    startAngle: thread.startAngle,
  }, { segmentsPerTurn: 24 });
  return {
    kind: "cosmetic-thread",
    spec: thread,
    overlay: helix.points,
    callout: threadCallout(thread),
    threadGeometry: {
      mode: "cosmetic",
      profile: "ISO-metric-60",
      pitchMm: thread.pitchMm,
      flankAngleDeg: 60,
      toleranceClass: thread.toleranceClass,
      side: thread.side,
      handedness: thread.handedness,
    },
  };
}

export function modeledThreadSolid(spec, options = {}) {
  const thread = normalizeThreadSpec(spec);
  const validation=validateThreadFeature(thread);
  if(!validation.ok)throw new Error(validation.issues[0].message);
  let profile = threadProfilePoints(thread);
  const externalCutter=options.asCutter && thread.side==="external";
  if(![thread.diameter,thread.pitch,thread.length].every(value=>Number.isFinite(value)&&value>0))throw new Error("Modeled thread requires positive diameter, pitch and length");
  const radialToleranceCm=options.radialToleranceCm == null ? 0.0005 : Number(options.radialToleranceCm);
  if(!Number.isFinite(radialToleranceCm)||!(radialToleranceCm>0))throw new Error("Thread radial tolerance must be positive");
  if(externalCutter){
    const root=profile[0].x,major=profile[1].x,outer=major+2*radialToleranceCm;
    const pitchR=thread.fitLimits?(thread.fitLimits.pitchDiameter.min+thread.fitLimits.pitchDiameter.max)/40:metricThreadBasicDimensions(thread.diameterMm,thread.pitchMm).pitchDiameter/20;
    const halfWidth=r=>thread.pitch/4+(r-pitchR)/Math.sqrt(3);
    profile=[{x:outer,y:-halfWidth(outer)},{x:root,y:-halfWidth(root)},{x:root,y:halfWidth(root)},{x:outer,y:halfWidth(outer)}];
    // The complementary groove is half a pitch from the crest.
    thread.startAngle+=Math.PI;
  }
  if(options.asCutter && thread.side==='internal'){
    // Complement of the inward nut tooth: wide at the bore entry, narrow
    // at the major-diameter root, with overlap into the predrilled hole.
    const minor=profile[0].x,major=profile[1].x,inner=Math.max(1e-8,minor-2*radialToleranceCm);
    const pitchR=thread.fitLimits?(thread.fitLimits.pitchDiameter.min+thread.fitLimits.pitchDiameter.max)/40:metricThreadBasicDimensions(thread.diameterMm,thread.pitchMm).pitchDiameter/20;
    const halfWidth=r=>thread.pitch/4-(r-pitchR)/Math.sqrt(3);
    profile=[{x:inner,y:-halfWidth(inner)},{x:major,y:-halfWidth(major)},{x:major,y:halfWidth(major)},{x:inner,y:halfWidth(inner)}];
    thread.startAngle+=Math.PI;
  }
  const maximumRadius=Math.max(...profile.map(p=>p.x));
  const required=Math.ceil(Math.PI/Math.acos(1-Math.min(radialToleranceCm/maximumRadius,1)));
  const perTurn = Math.max(12,required,Math.round(Number(options.segmentsPerTurn)||0));
  if(perTurn>128)throw new Error("Thread tolerance requires more than 128 stations per turn");
  const segmentCount = Math.max(1, Math.ceil(perTurn * thread.turns));
  if(segmentCount>20000)throw new Error("Thread exceeds the 20000-section modeling budget; shorten it or use a cosmetic thread");
  const times=[...new Set([...Array.from({length:segmentCount+1},(_,i)=>i/segmentCount),thread.runoutStartMm/thread.lengthMm,1-thread.runoutEndMm/thread.lengthMm])].sort((a,b)=>a-b);
  const maxStep=times.slice(1).reduce((maximum,t,i)=>Math.max(maximum,t-times[i]),0);
  const axisPoints = times.map(t=>helixPoint({...thread,radius:0},t));
  // Sweep the 2-D form by placing a copy at every helix station. Radius lives
  // in the profile's x; the helix here is the axis walk so the form stays
  // centred.
  const stations = axisPoints.map((point, index) => {
    const t = times[index];
    const located = helixPoint({
      origin: thread.origin,
      axis: thread.axis,
      radius: thread.diameter / 2,
      pitch: thread.pitch,
      turns: thread.turns,
      handedness: thread.handedness,
      startAngle: thread.startAngle,
    }, t);
    return { axisPoint: point, formOrigin: located, t };
  });
  // Place the radial/axial section at the actual first helix station.
  // The kernel consumes world points, not offsets from the spine.
  const axisLength=Math.hypot(thread.axis.x,thread.axis.y,thread.axis.z);
  if(!(axisLength>0))throw new Error("Thread axis must have a direction");
  const sections=stations.map(station=>{
    const axialMm=station.t*thread.lengthMm;
    const factor=Math.min(1,thread.runoutStartMm>0?axialMm/thread.runoutStartMm:1,thread.runoutEndMm>0?(thread.lengthMm-axialMm)/thread.runoutEndMm:1);
    const section=factor<=1e-12?[{x:profile[0].x,y:0}]:profile.map(p=>({x:profile[0].x+(p.x-profile[0].x)*factor,y:p.y*factor}));
    return section.map(p=>{
      const axialOffset=Math.max(-mmToCm(axialMm),Math.min(thread.length-mmToCm(axialMm),p.y));
      return {
        x:station.axisPoint.x+(station.formOrigin.x-station.axisPoint.x)*p.x/(thread.diameter/2)+thread.axis.x/axisLength*axialOffset,
        y:station.axisPoint.y+(station.formOrigin.y-station.axisPoint.y)*p.x/(thread.diameter/2)+thread.axis.y/axisLength*axialOffset,
        z:station.axisPoint.z+(station.formOrigin.z-station.axisPoint.z)*p.x/(thread.diameter/2)+thread.axis.z/axisLength*axialOffset,
      };
    });
  });
  return {
    kind: "modeled-thread",
    worldProfile:sections[0],
    sections,
    spec: thread,
    profile,
    stations,
    path: stations.map((s) => s.formOrigin),
    operation: thread.side === "internal" || externalCutter ? "subtract" : "add",
    threadGeometry: {
      fitStatus:thread.fitLimits?"supplied-limits-midpoint":"basic-profile-only",
      fitLimits:thread.fitLimits,
      runout:{type:"linear-depth",startMm:thread.runoutStartMm,endMm:thread.runoutEndMm},
      rootForm:"flat",
      approximation:{method:"ruled-helical-sections",segmentsPerTurn:perTurn,radialDeflectionCm:maximumRadius*(1-Math.cos(Math.PI*thread.turns*maxStep))},
      mode: "modeled",
      profile: "ISO-metric-60",
      pitchMm: thread.pitchMm,
      flankAngleDeg: 60,
      toleranceClass: thread.toleranceClass,
      side: thread.side,
      handedness: thread.handedness,
    },
  };
}

export function threadCallout(spec) {
  const thread = normalizeThreadSpec(spec);
  const thru = spec.endCondition === "through-all" ? " THRU" : "";
  const depth = thread.lengthMm > 0 && spec.endCondition !== "through-all"
    ? " \u2193" + round1(thread.lengthMm)
    : "";
  return thread.designation + thru + depth;
}

export function threadAnnotation(spec) {
  const cosmetic = cosmeticThread(spec);
  const modeled = spec.mode === "modeled" ? modeledThreadSolid(spec) : null;
  return {
    ...cosmetic,
    modeled,
    callout: threadCallout(spec),
  };
}

export function documentThreadOverlays(def) {
  const curves = [];
  (def?.parts || []).forEach((part) => {
    const overlay = part.cosmeticThread?.overlay;
    if (overlay && overlay.length > 1) curves.push({ id: part.id, kind: "thread", points: overlay, callout: part.cosmeticThread.callout });
    else if (part.cosmeticThread?.spec) {
      const sampled = cosmeticThread(part.cosmeticThread.spec);
      curves.push({ id: part.id, kind: "thread", points: sampled.overlay, callout: sampled.callout });
    }
  });
  return curves;
}

export function helixSpecForThread(spec) {
  const thread = normalizeThreadSpec(spec);
  return normalizeHelixSpec({
    origin: thread.origin,
    axis: thread.axis,
    radius: thread.diameter / 2,
    pitch: thread.pitch,
    turns: thread.turns,
    handedness: thread.handedness,
    startAngle: thread.startAngle,
  });
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

// Worst-case diametral clearances from documented limits, not from class names.
export function validateThreadFit(external, internal) {
  const bolt=validateThreadFeature(external),nut=validateThreadFeature(internal),issues=[...bolt.issues,...nut.issues];
  const fail=message=>issues.push({code:"thread-fit",message,severity:"error"});
  if(bolt.spec.side!=="external"||nut.spec.side!=="internal")fail("Fit requires an external and an internal thread");
  for(const key of ["diameterMm","pitchMm","handedness"])if(bolt.spec[key]!==nut.spec[key])fail("Mating threads disagree on "+key);
  if(!bolt.spec.fitLimits||!nut.spec.fitLimits)fail("Numerical fit verification requires sourced limits for both threads");
  const clearances={};
  if(!issues.some(i=>i.severity==="error"))for(const key of ["majorDiameter","pitchDiameter","minorDiameter"]){
    const a=bolt.spec.fitLimits[key],b=nut.spec.fitLimits[key];
    clearances[key]={min:b.min-a.max,max:b.max-a.min};
    if(clearances[key].min<0)fail("Worst-case interference at "+key);
  }
  return {ok:!issues.some(i=>i.severity==="error"),issues,clearances,units:"mm"};
}
