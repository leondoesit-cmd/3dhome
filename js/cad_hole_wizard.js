// Hole Wizard. Standard fastener holes in millimetres, stacked as one or more
// coaxial solids (through / tap-drill, counterbore or spotface, countersink
// cone) plus an optional cosmetic thread. Layouts reuse existing sketch points.

import { metricThreadBasicDimensions } from "./cad_standards.js";
import { threadCallout, threadAnnotation, mmToCm } from "./cad_thread.js";

export const HOLE_TYPES = Object.freeze([
  "simple", "counterbore", "countersink", "spotface", "tapped", "tap-counterbore", "tap-countersink",
]);

export const HOLE_STANDARDS = Object.freeze(["ISO 4762", "ISO 4017", "ISO 273"]);

// Preferred metric coarse series used by the wizard. Tap drill follows the
// ISO handbook approximation (D − P). Counterbore numbers are DIN 974-1 / ISO
// 4762 socket-head cap-screw recesses.
export const METRIC_HOLE_TABLE = Object.freeze({
  M3:  { size: "M3",  diameterMm: 3,  pitchMm: 0.5,  tapDrillMm: 2.5,  closeMm: 3.4,  normalMm: 3.6,  looseMm: 3.8,  cboreDiaMm: 6.5,  cboreDepthMm: 3.4,  csinkDiaMm: 6.0,  hexAfMm: 2.5, headDiaMm: 5.5,  headHeightMm: 3 },
  M4:  { size: "M4",  diameterMm: 4,  pitchMm: 0.7,  tapDrillMm: 3.3,  closeMm: 4.5,  normalMm: 4.8,  looseMm: 5.0,  cboreDiaMm: 8.0,  cboreDepthMm: 4.4,  csinkDiaMm: 8.0,  hexAfMm: 3,   headDiaMm: 7.0,  headHeightMm: 4 },
  M5:  { size: "M5",  diameterMm: 5,  pitchMm: 0.8,  tapDrillMm: 4.2,  closeMm: 5.5,  normalMm: 5.8,  looseMm: 6.0,  cboreDiaMm: 10.0, cboreDepthMm: 5.4,  csinkDiaMm: 10.0, hexAfMm: 4,   headDiaMm: 8.5,  headHeightMm: 5 },
  M6:  { size: "M6",  diameterMm: 6,  pitchMm: 1.0,  tapDrillMm: 5.0,  closeMm: 6.6,  normalMm: 7.0,  looseMm: 7.0,  cboreDiaMm: 11.0, cboreDepthMm: 6.6,  csinkDiaMm: 12.0, hexAfMm: 5,   headDiaMm: 10.0, headHeightMm: 6 },
  M8:  { size: "M8",  diameterMm: 8,  pitchMm: 1.25, tapDrillMm: 6.8,  closeMm: 9.0,  normalMm: 10.0, looseMm: 11.0, cboreDiaMm: 15.0, cboreDepthMm: 8.8,  csinkDiaMm: 16.0, hexAfMm: 6,   headDiaMm: 13.0, headHeightMm: 8 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5,  tapDrillMm: 8.5,  closeMm: 11.0, normalMm: 12.0, looseMm: 12.0, cboreDiaMm: 18.0, cboreDepthMm: 10.8, csinkDiaMm: 20.0, hexAfMm: 8,   headDiaMm: 16.0, headHeightMm: 10 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, tapDrillMm: 10.2, closeMm: 13.5, normalMm: 14.0, looseMm: 15.0, cboreDiaMm: 20.0, cboreDepthMm: 13.0, csinkDiaMm: 24.0, hexAfMm: 10,  headDiaMm: 18.0, headHeightMm: 12 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0,  tapDrillMm: 14.0, closeMm: 17.5, normalMm: 18.0, looseMm: 19.0, cboreDiaMm: 26.0, cboreDepthMm: 17.5, csinkDiaMm: 31.0, hexAfMm: 14,  headDiaMm: 24.0, headHeightMm: 16 },
  M20: { size: "M20", diameterMm: 20, pitchMm: 2.5,  tapDrillMm: 17.5, closeMm: 22.0, normalMm: 24.0, looseMm: 26.0, cboreDiaMm: 33.0, cboreDepthMm: 21.5, csinkDiaMm: 38.0, hexAfMm: 17,  headDiaMm: 30.0, headHeightMm: 20 },
});

const FIT_COLUMN = { close: "closeMm", normal: "normalMm", loose: "looseMm" };

export function holeTableRow(size) {
  const key = String(size || "").toUpperCase().replace(/\s+/g, "");
  const tagged = key.startsWith("M") ? key : "M" + key;
  return METRIC_HOLE_TABLE[tagged] || null;
}

export function listHoleSizes() {
  return Object.keys(METRIC_HOLE_TABLE);
}

export function normalizeHoleWizard(params = {}) {
  let type = HOLE_TYPES.includes(params.holeType) ? params.holeType : "simple";
  if (type === "simple" && params.countersink) type = "countersink";
  if ((type === "simple" || type === "countersink") && params.counterbore) type = "counterbore";
  const row = holeTableRow(params.standardSize || params.size);
  const fit = FIT_COLUMN[params.fit] ? params.fit : "normal";
  const explicitMm = Number(params.diameterMm);
  const explicitCm = Number(params.diameter);
  const diameterMm = (Number.isFinite(explicitMm) && explicitMm > 0 ? explicitMm : 0)
    || (Number.isFinite(explicitCm) && explicitCm > 0 ? explicitCm * 10 : 0)
    || (row ? row[FIT_COLUMN[fit]] : 10);
  const tapDrillMm = Number(params.tapDrillMm) || row?.tapDrillMm || (row ? row.diameterMm - row.pitchMm : diameterMm);
  const pitchMm = Number(params.pitchMm) || row?.pitchMm || 1.5;
  const threadDiaMm = Number(params.threadDiameterMm) || row?.diameterMm || diameterMm;
  const endCondition = params.endCondition === "blind" ? "blind" : "through-all";
  const depthMm = Number(params.depthMm) || cmToMmSafe(params.depth) || (endCondition === "through-all" ? 0 : threadDiaMm * 2);
  const cboreDiaMm = Number(params.cboreDiameterMm) || row?.cboreDiaMm || diameterMm * 1.8;
  const cboreDepthMm = Number(params.cboreDepthMm) || row?.cboreDepthMm || row?.headHeightMm || threadDiaMm;
  const csinkDiaMm = Number(params.csinkDiameterMm) || row?.csinkDiaMm || diameterMm * 2;
  const csinkAngle = Number(params.csinkAngle) || 90;
  const spotfaceDepthMm = Number(params.spotfaceDepthMm) || Math.max(0.3, cboreDiaMm * 0.05);
  const threaded = type.startsWith("tap");
  return {
    holeType: type,
    standardSize: row?.size || params.standardSize || null,
    standard: params.standard || (threaded ? "ISO 262:2023" : "ISO 273"),
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
    toleranceClass: params.toleranceClass || (threaded ? "6H" : null),
    threadMode: params.threadMode === "modeled" ? "modeled" : "cosmetic",
    origin: params.origin || { u: 0, v: 0 },
    axis: params.axis || { x: 0, y: 1, z: 0 },
  };
}

function cmToMmSafe(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n * 10 : 0;
}

export function holeWizardSolids(params) {
  const hole = normalizeHoleWizard(params);
  const solids = [];
  const boreDia = hole.holeType.startsWith("tap") ? hole.tapDrill : hole.diameter;
  const boreDepth = hole.endCondition === "through-all" ? hole.depth : Math.max(hole.depth, hole.threadDiameter * 1.5);
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
  return threadAnnotation({
    diameterMm: hole.threadDiameterMm,
    pitchMm: hole.pitchMm,
    lengthMm: hole.endCondition === "through-all" ? hole.depthMm : hole.depthMm,
    side: "internal",
    mode: hole.threadMode,
    handedness: hole.handedness,
    toleranceClass: hole.toleranceClass,
    origin: placement.origin || { x: 0, y: 0, z: 0 },
    axis: placement.axis || hole.axis,
    endCondition: hole.endCondition,
    series: "coarse",
    standard: "ISO 262:2023",
    basic,
  });
}

export function holeCallout(params) {
  const hole = normalizeHoleWizard(params);
  const thru = hole.endCondition === "through-all";
  const depth = thru ? " THRU" : " \u2193" + round1(hole.depthMm);
  if (hole.holeType === "simple") return "Ø" + round1(hole.diameterMm) + depth;
  if (hole.holeType === "counterbore") {
    return "Ø" + round1(hole.diameterMm) + depth + " \u232D Ø" + round1(hole.cboreDiameterMm) + "\u2193" + round1(hole.cboreDepthMm);
  }
  if (hole.holeType === "spotface") {
    return "Ø" + round1(hole.diameterMm) + depth + " SF Ø" + round1(hole.cboreDiameterMm);
  }
  if (hole.holeType === "countersink") {
    return "Ø" + round1(hole.diameterMm) + depth + " \u2334 Ø" + round1(hole.csinkDiameterMm) + " " + hole.csinkAngle + "°";
  }
  const thread = threadCallout({
    diameterMm: hole.threadDiameterMm,
    pitchMm: hole.pitchMm,
    lengthMm: hole.depthMm,
    side: "internal",
    toleranceClass: hole.toleranceClass,
    endCondition: hole.endCondition,
    handedness: hole.handedness,
  });
  if (hole.holeType === "tap-counterbore") {
    return thread + " \u232D Ø" + round1(hole.cboreDiameterMm) + "\u2193" + round1(hole.cboreDepthMm);
  }
  if (hole.holeType === "tap-countersink") {
    return thread + " \u2334 Ø" + round1(hole.csinkDiameterMm) + " " + hole.csinkAngle + "°";
  }
  return thread;
}

export function holeLayoutPoints(params = {}) {
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
