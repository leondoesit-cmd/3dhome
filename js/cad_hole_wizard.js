// Hole Wizard. Standard fastener holes in millimetres, stacked as one or more
// coaxial solids (through / tap-drill, counterbore or spotface, countersink
// cone) plus an optional cosmetic thread. Layouts reuse existing sketch points.

import { metricThreadBasicDimensions } from "./cad_standards.js";
import { threadCallout, threadAnnotation, mmToCm } from "./cad_thread.js";
import { cylinderAxis } from "./core/cylinder_axis.js";

export const HOLE_TYPES = Object.freeze([
  "simple", "counterbore", "countersink", "spotface", "tapped", "tap-counterbore", "tap-countersink",
]);

export const HOLE_STANDARDS = Object.freeze(["ISO 4762", "ISO 4017", "ISO 273"]);

// Preferred metric coarse series used by the wizard. Tap drill follows the
// ISO handbook approximation (D − P). Counterbore numbers are DIN 974-1 / ISO
// 4762 socket-head cap-screw recesses.
// Clearance series checked against Albany County Fasteners ISO 273 chart (2025).
export const METRIC_HOLE_TABLE = Object.freeze({
  M2:  { size: "M2",  diameterMm: 2,  pitchMm: 0.4,  tapDrillMm: 1.6,  closeMm: 2.2,  normalMm: 2.4,  looseMm: 2.6,  cboreDiaMm: 4.4,  cboreDepthMm: 2.2,  csinkDiaMm: 4.4,  hexAfMm: 1.5, headDiaMm: 3.8,  headHeightMm: 2 },
  "M2.5": { size: "M2.5", diameterMm: 2.5, pitchMm: 0.45, tapDrillMm: 2.05, closeMm: 2.7, normalMm: 2.9, looseMm: 3.1, cboreDiaMm: 5.5, cboreDepthMm: 2.7, csinkDiaMm: 5.5, hexAfMm: 2, headDiaMm: 4.5, headHeightMm: 2.5 },
  M3:  { size: "M3",  diameterMm: 3,  pitchMm: 0.5,  tapDrillMm: 2.5,  closeMm: 3.2, normalMm: 3.4, looseMm: 3.6,  cboreDiaMm: 6.5,  cboreDepthMm: 3.4,  csinkDiaMm: 6.0,  hexAfMm: 2.5, headDiaMm: 5.5,  headHeightMm: 3 },
  M4:  { size: "M4",  diameterMm: 4,  pitchMm: 0.7,  tapDrillMm: 3.3,  closeMm: 4.3, normalMm: 4.5, looseMm: 4.8,  cboreDiaMm: 8.0,  cboreDepthMm: 4.4,  csinkDiaMm: 8.0,  hexAfMm: 3,   headDiaMm: 7.0,  headHeightMm: 4 },
  M5:  { size: "M5",  diameterMm: 5,  pitchMm: 0.8,  tapDrillMm: 4.2,  closeMm: 5.3, normalMm: 5.5, looseMm: 5.8,  cboreDiaMm: 10.0, cboreDepthMm: 5.4,  csinkDiaMm: 10.0, hexAfMm: 4,   headDiaMm: 8.5,  headHeightMm: 5 },
  M6:  { size: "M6",  diameterMm: 6,  pitchMm: 1.0,  tapDrillMm: 5.0,  closeMm: 6.4, normalMm: 6.6, looseMm: 7,  cboreDiaMm: 11.0, cboreDepthMm: 6.6,  csinkDiaMm: 12.0, hexAfMm: 5,   headDiaMm: 10.0, headHeightMm: 6 },
  M8:  { size: "M8",  diameterMm: 8,  pitchMm: 1.25, tapDrillMm: 6.8,  closeMm: 8.4, normalMm: 9, looseMm: 10, cboreDiaMm: 15.0, cboreDepthMm: 8.8,  csinkDiaMm: 16.0, hexAfMm: 6,   headDiaMm: 13.0, headHeightMm: 8 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5,  tapDrillMm: 8.5,  closeMm: 10.5, normalMm: 11, looseMm: 12, cboreDiaMm: 18.0, cboreDepthMm: 10.8, csinkDiaMm: 20.0, hexAfMm: 8,   headDiaMm: 16.0, headHeightMm: 10 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, tapDrillMm: 10.2, closeMm: 13, normalMm: 13.5, looseMm: 14.5, cboreDiaMm: 20.0, cboreDepthMm: 13.0, csinkDiaMm: 24.0, hexAfMm: 10,  headDiaMm: 18.0, headHeightMm: 12 },
  M14: { size: "M14", diameterMm: 14, pitchMm: 2.0,  tapDrillMm: 12.0, closeMm: 15, normalMm: 15.5, looseMm: 16.5, cboreDiaMm: 23.0, cboreDepthMm: 15.2, csinkDiaMm: 28.0, hexAfMm: 12,  headDiaMm: 21.0, headHeightMm: 14 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0,  tapDrillMm: 14.0, closeMm: 17, normalMm: 17.5, looseMm: 18.5, cboreDiaMm: 26.0, cboreDepthMm: 17.5, csinkDiaMm: 31.0, hexAfMm: 14,  headDiaMm: 24.0, headHeightMm: 16 },
  M20: { size: "M20", diameterMm: 20, pitchMm: 2.5,  tapDrillMm: 17.5, closeMm: 21, normalMm: 22, looseMm: 24, cboreDiaMm: 33.0, cboreDepthMm: 21.5, csinkDiaMm: 38.0, hexAfMm: 17,  headDiaMm: 30.0, headHeightMm: 20 },
  M24: { size: "M24", diameterMm: 24, pitchMm: 3.0,  tapDrillMm: 21.0, closeMm: 25, normalMm: 26, looseMm: 28, cboreDiaMm: 40.0, cboreDepthMm: 25.5, csinkDiaMm: 45.0, hexAfMm: 19,  headDiaMm: 36.0, headHeightMm: 24 },
});

// Unified 1/4-20 placement used by the inch Hole Wizard. The #7 tap drill is
// 0.201 in; retaining its exact conversion avoids silently changing thread
// engagement when the part is reopened in a metric document.
export const UNIFIED_HOLE_TABLE = Object.freeze({
  "1/4-20": { size:"1/4-20", imperial:true, diameterMm:6.35, pitchMm:1.27,
    tapDrillMm:5.1054, closeMm:6.74624, normalMm:7.14375, looseMm:7.9375,
    cboreDiaMm:11.1125, cboreDepthMm:6.35, csinkDiaMm:12.8778 },
});

const FIT_COLUMN = { close: "closeMm", normal: "normalMm", loose: "looseMm" };

export function holeTableRow(size) {
  const key = String(size || "").toUpperCase().replace(/\s+/g, "");
  const unified = key.replace(/UNC$/, "");
  if (UNIFIED_HOLE_TABLE[unified]) return UNIFIED_HOLE_TABLE[unified];
  const tagged = key.startsWith("M") ? key : "M" + key;
  return METRIC_HOLE_TABLE[tagged] || null;
}

export function listHoleSizes() {
  return Object.keys(METRIC_HOLE_TABLE).concat(Object.keys(UNIFIED_HOLE_TABLE));
}

export function normalizeHoleWizard(params = {}) {
  let type = HOLE_TYPES.includes(params.holeType) ? params.holeType : "simple";
  if (type === "simple" && params.countersink) type = "countersink";
  if ((type === "simple" || type === "countersink") && params.counterbore) type = "counterbore";
  const row = holeTableRow(params.standardSize || params.size);
  const fit = FIT_COLUMN[params.fit] ? params.fit : "normal";
  const diameterMm = pickMm(params.diameterMm, params.diameter) || (row ? row[FIT_COLUMN[fit]] : 10);
  const tapDrillMm = pickMm(params.tapDrillMm, params.tapDrill) || row?.tapDrillMm || (row ? row.diameterMm - row.pitchMm : diameterMm);
  const pitchMm = pickMm(params.pitchMm, params.pitch) || row?.pitchMm || 1.5;
  const threadDiaMm = pickMm(params.threadDiameterMm, params.threadDiameter) || row?.diameterMm || diameterMm;
  const endCondition = params.endCondition === "blind" ? "blind" : "through-all";
  const depthMm = pickMm(params.depthMm, params.depth) || (endCondition === "through-all" ? 0 : threadDiaMm * 2);
  const cboreDiaMm = pickMm(params.cboreDiameterMm, params.cboreDiameter) || row?.cboreDiaMm || diameterMm * 1.8;
  const cboreDepthMm = pickMm(params.cboreDepthMm, params.cboreDepth) || row?.cboreDepthMm || row?.headHeightMm || threadDiaMm;
  /* The feature form spells this field `countersinkDiameter` (see the hole
     entry in core/feature_catalog.js) while the tables and the kernel spell it
     `csink`. Both spellings are accepted here; reading only one of them made
     the countersink diameter uneditable rather than merely mis-scaled. */
  const csinkDiaMm = pickMm(params.csinkDiameterMm ?? params.countersinkDiameterMm, params.csinkDiameter ?? params.countersinkDiameter)
    || row?.csinkDiaMm || diameterMm * 2;
  const csinkAngle = Number(params.csinkAngle) || 90;
  const spotfaceDepthMm = Number(params.spotfaceDepthMm) || Math.max(0.3, cboreDiaMm * 0.05);
  const threaded = type.startsWith("tap");
  const threadDepthMm=pickMm(params.threadDepthMm,params.threadDepth) || 0;
  const recessMm=type==='tap-counterbore'?cboreDepthMm:type==='tap-countersink'?Math.max(0,(csinkDiaMm-threadDiaMm)/2/Math.tan(csinkAngle*Math.PI/360)):0;
  if(threaded && endCondition==='blind' && threadDepthMm>Math.max(0,depthMm-recessMm)+1e-6)throw new Error("Thread engagement exceeds available drill depth after the head recess");
  return {
    holeType: type,
    standardSize: row?.size || params.standardSize || null,
    standard: params.standardSize === "custom" ? "Custom" : params.standard || (row?.imperial ? "ASME B1.1 UNC" : threaded ? "ISO 262:2023" : "ISO 273"),
    fit,
    diameterMm,
    diameter: mmToCm(diameterMm),
    tapDrillMm,
    tapDrill: mmToCm(tapDrillMm),
    pitchMm,
    pitch: mmToCm(pitchMm),
    threadDiameterMm: threadDiaMm,
    threadDiameter: mmToCm(threadDiaMm),
    endCondition,
    threadDepthMm,
    depthMm,
    depth: mmToCm(depthMm || 10),
    cboreDiameterMm: cboreDiaMm,
    cboreDiameter: mmToCm(cboreDiaMm),
    cboreDepthMm,
    cboreDepth: mmToCm(cboreDepthMm),
    csinkDiameterMm: csinkDiaMm,
    csinkDiameter: mmToCm(csinkDiaMm),
    csinkAngle,
    spotfaceDepthMm,
    spotfaceDepth: mmToCm(spotfaceDepthMm),
    direction: params.direction === "reverse" ? "reverse" : "forward",
    handedness: params.handedness === "lh" ? "lh" : "rh",
    toleranceClass: row?.imperial && (!params.toleranceClass || params.toleranceClass === "6H") ? "2B" : params.toleranceClass || (threaded ? "6H" : null),
    threadPreset: row?.imperial ? "unc-quarter-20" : "iso-metric",
    threadMode: params.threadMode === "modeled" ? "modeled" : "cosmetic",
    origin: params.origin || { u: 0, v: 0 },
    axis: params.axis || { x: 0, y: 1, z: 0 },
  };
}

/* Every wizard dimension arrives either as an explicit millimetre value — what
   the standards tables and the kernel speak — or as the centimetre field the
   feature form actually edits. Both spellings must be consulted for every
   field. Consulting only the millimetre key silently dropped whatever the user
   typed and fell through to the table row, so a custom 20 x 10 mm counterbore
   rebuilt itself as the M6 book value (11 x 6.6 mm) with no warning. */
function pickMm(mmValue, cmValue) {
  const mm = Number(mmValue);
  if (Number.isFinite(mm) && mm > 0) return mm;
  const cm = Number(cmValue);
  return Number.isFinite(cm) && cm > 0 ? cm * 10 : 0;
}

export function holeWizardSolids(params) {
  const hole = normalizeHoleWizard(params);
  const solids = [];
  const boreDia = hole.holeType.startsWith("tap") ? hole.tapDrill : hole.diameter;
  const boreDepth = hole.depth;
  solids.push({
    role: "bore",
    kind: "cylinder",
    diameter: boreDia,
    depth: boreDepth,
    endCondition: hole.endCondition,
  });
  if (hole.holeType === "counterbore" || hole.holeType === "tap-counterbore") {
    solids.push({ role: "counterbore", kind: "cylinder", diameter: hole.cboreDiameter, depth: hole.cboreDepth, endCondition: "blind" });
  }
  if (hole.holeType === "spotface") {
    solids.push({ role: "spotface", kind: "cylinder", diameter: hole.cboreDiameter, depth: hole.spotfaceDepth, endCondition: "blind" });
  }
  if (hole.holeType === "countersink" || hole.holeType === "tap-countersink") {
    const extra = (hole.csinkDiameter - boreDia) / 2;
    const half = (hole.csinkAngle * Math.PI) / 360;
    const depth = extra / Math.tan(half || 1e-6);
    solids.push({
      role: "countersink",
      kind: "cone",
      diameter1: hole.csinkDiameter,
      diameter2: boreDia,
      depth: Math.max(0.01, depth),
      angle: hole.csinkAngle,
      endCondition: "blind",
    });
  }
  return { hole, solids };
}

export function holeWizardThread(params, placement = {}) {
  const hole = normalizeHoleWizard(params);
  if (!hole.holeType.startsWith("tap")) return null;
  const basic = metricThreadBasicDimensions(hole.threadDiameterMm, hole.pitchMm);
  let lengthMm=Number(placement.depthMm)||hole.depthMm,threadOrigin=placement.origin || {x:0,y:0,z:0};
  if(hole.endCondition==="through-all"&&placement.bounds){
    const origin=placement.origin||{x:0,y:0,z:0};
    const axis=cylinderAxis(placement.axis || hole.axis),b=placement.bounds;
    let near=0,far=Infinity;
    for(const key of ["x","y","z"]){
      if(Math.abs(axis[key])<1e-12){if(origin[key]<b[key+"0"]||origin[key]>b[key+"1"])far=-1;continue;}
      const a=(b[key+"0"]-origin[key])/axis[key],c=(b[key+"1"]-origin[key])/axis[key];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));
    }
    lengthMm=Number.isFinite(far)&&far>near?(far-near)*10:0;
    if(lengthMm>0)threadOrigin={x:origin.x+axis.x*near,y:origin.y+axis.y*near,z:origin.z+axis.z*near};
  }
  const drillDepthMm=lengthMm;
  const recessMm=hole.holeType==='tap-counterbore'?hole.cboreDepthMm:hole.holeType==='tap-countersink'?Math.max(0,(hole.csinkDiameterMm-hole.threadDiameterMm)/2/Math.tan(hole.csinkAngle*Math.PI/360)):0;
  const availableMm=Math.max(0,drillDepthMm-recessMm);
  if(hole.threadDepthMm>0 && drillDepthMm>0 && hole.threadDepthMm>availableMm+1e-6)throw new Error("Thread engagement exceeds available drill depth after the head recess");
  lengthMm=drillDepthMm>0?(hole.threadDepthMm || availableMm):0;
  if(recessMm>0){const axis=cylinderAxis(placement.axis || hole.axis);threadOrigin={x:threadOrigin.x+axis.x*recessMm/10,y:threadOrigin.y+axis.y*recessMm/10,z:threadOrigin.z+axis.z*recessMm/10};}
  const pendingDepth=!(lengthMm>0);
  const annotation=threadAnnotation({
    threadPreset:hole.threadPreset,
    diameterMm: hole.threadDiameterMm,
    pitchMm: hole.pitchMm,
    lengthMm,
    side: "internal",
    mode: pendingDepth ? "cosmetic" : hole.threadMode,
    handedness: hole.handedness,
    toleranceClass: hole.toleranceClass,
    origin: threadOrigin,
    axis: placement.axis || hole.axis,
    endCondition: hole.threadDepthMm>0?"blind":hole.endCondition,
    series: "coarse",
    standard: "ISO 262:2023",
    basic,
  });
  annotation.drillDepthMm=drillDepthMm;
  annotation.threadDepthMm=lengthMm;
  annotation.engagementEstimated=!hole.threadDepthMm;
  if(pendingDepth){annotation.overlay=[];annotation.modeled=null;annotation.pendingDepth=true;}
  return annotation;
}

export function holeCallout(params) {
  const hole = normalizeHoleWizard(params);
  const thru = hole.endCondition === "through-all";
  const inch = params.displayUnit === "in" || (!params.displayUnit && hole.threadPreset === "unc-quarter-20");
  const dimension = mm => inch ? Number((mm / 25.4).toPrecision(10)) + " in" : round1(mm);
  const depth = thru ? " THRU" : " \u2193" + dimension(hole.depthMm);
  if (hole.holeType === "simple") return "Ø" + dimension(hole.diameterMm) + depth;
  if (hole.holeType === "counterbore") {
    return "Ø" + dimension(hole.diameterMm) + depth + " \u232D Ø" + dimension(hole.cboreDiameterMm) + "\u2193" + dimension(hole.cboreDepthMm);
  }
  if (hole.holeType === "spotface") {
    return "Ø" + dimension(hole.diameterMm) + depth + " SF Ø" + dimension(hole.cboreDiameterMm);
  }
  if (hole.holeType === "countersink") {
    return "Ø" + dimension(hole.diameterMm) + depth + " \u2334 Ø" + dimension(hole.csinkDiameterMm) + " " + hole.csinkAngle + "°";
  }
  const thread = threadCallout({
    threadPreset: hole.threadPreset,
    diameterMm: hole.threadDiameterMm,
    pitchMm: hole.pitchMm,
    lengthMm: hole.threadDepthMm || hole.depthMm,
    side: "internal",
    toleranceClass: hole.toleranceClass,
    endCondition: hole.threadDepthMm>0?"blind":hole.endCondition,
    handedness: hole.handedness,
  });
  if (hole.holeType === "tap-counterbore") {
    return thread + " \u232D Ø" + dimension(hole.cboreDiameterMm) + "\u2193" + dimension(hole.cboreDepthMm);
  }
  if (hole.holeType === "tap-countersink") {
    return thread + " \u2334 Ø" + dimension(hole.csinkDiameterMm) + " " + hole.csinkAngle + "°";
  }
  return thread;
}

export function holeLayoutPoints(params = {}, sketch) {
  if(Array.isArray(params.centres))return params.centres.map(p=>({u:Number(p.u),v:Number(p.v)}));
  if((!params.layout || params.layout==="sketch") && sketch){
    return (sketch.entities || []).filter(e=>e.type==="circle" && !e.construction && (!params.profileEntityIds?.length || params.profileEntityIds.includes(e.id))).map(e=>{
      const point=(sketch.points || []).find(p=>p.id===(e.c ?? e.center));
      if(!point || ![point.x,point.y].every(Number.isFinite))throw new Error("Hole centre is missing or invalid");
      return {u:point.x,v:point.y};
    });
  }
  const layout = params.layout || "sketch";
  if (layout === "linear") {
    const countX = Math.max(1, Math.round(Number(params.countX) || 2));
    const countY = Math.max(1, Math.round(Number(params.countY) || 2));
    const sx = Number(params.spacingX) || 1;
    const sy = Number(params.spacingY) || 1;
    const ox = Number(params.origin?.u) || 0, oy = Number(params.origin?.v) || 0;
    const points = [];
    for (let j = 0; j < countY; j++) {
      for (let i = 0; i < countX; i++) points.push({ u: ox + i * sx, v: oy + j * sy });
    }
    return points;
  }
  if (layout === "circular") {
    const count = Math.max(1, Math.round(Number(params.count) || 4));
    const radius = Number(params.radius) || 1;
    const start = ((Number(params.startAngle) || 0) * Math.PI) / 180;
    const ox = Number(params.origin?.u) || 0, oy = Number(params.origin?.v) || 0;
    return Array.from({ length: count }, (_, i) => {
      const a = start + (i / count) * Math.PI * 2;
      return { u: ox + Math.cos(a) * radius, v: oy + Math.sin(a) * radius };
    });
  }
  if (Array.isArray(params.points) && params.points.length) return params.points.map((p) => ({ u: Number(p.u) || 0, v: Number(p.v) || 0 }));
  return [{ u: Number(params.origin?.u) || 0, v: Number(params.origin?.v) || 0 }];
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}
