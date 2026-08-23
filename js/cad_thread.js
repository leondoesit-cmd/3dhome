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
    crestDiameter: major - 2 * crestTrunc * (2 / Math.sqrt(3)) * 0, // keep major as envelope
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
  const pCm = mmToCm(spec.pitchMm);
  const H = H_FACTOR * pCm;
  const majorR = mmToCm(spec.diameterMm) / 2;
  const rootR = side === "external"
    ? mmToCm(metricThreadBasicDimensions(spec.diameterMm, spec.pitchMm).externalMinorDiameter) / 2
    : majorR;
  const crestR = side === "external" ? majorR : mmToCm(metricThreadBasicDimensions(spec.diameterMm, spec.pitchMm).externalMinorDiameter) / 2;
  const half = pCm / 2;
  if (side === "external") {
    return [
      { x: rootR, y: -half },
      { x: crestR, y: -pCm / 16 },
      { x: crestR, y: pCm / 16 },
      { x: rootR, y: half },
    ];
  }
  return [
    { x: crestR, y: -half },
    { x: rootR, y: -pCm / 16 },
    { x: rootR, y: pCm / 16 },
    { x: crestR, y: half },
  ];
}

export function normalizeThreadSpec(spec = {}) {
  const diameterMm = Number(spec.diameterMm) || cmToMm(Number(spec.diameter) || 0);
  const pitchMm = Number(spec.pitchMm) || cmToMm(Number(spec.pitch) || 0);
  const lengthMm = Number(spec.lengthMm) || cmToMm(Number(spec.length) || Number(spec.height) || 0);
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
  if (!(thread.lengthMm > 0)) issues.push({ code: "thread-length", message: "Thread length must be positive", field: "lengthMm", severity: "error" });
  if (!THREAD_SIDES.includes(thread.side)) issues.push({ code: "thread-side", message: "Thread side must be external or internal", field: "side", severity: "error" });
  return { ok: issues.every((i) => i.severity !== "error"), issues, spec: thread, computed: report.computed };
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
  const profile = threadProfilePoints(thread);
  const perTurn = Math.max(12, Math.min(48, Number(options.segmentsPerTurn) || 24));
  const helix = sampleHelix({
    origin: thread.origin,
    axis: thread.axis,
    radius: 0,
    pitch: thread.pitch,
    turns: thread.turns,
    handedness: thread.handedness,
    startAngle: thread.startAngle,
  }, { segmentsPerTurn: perTurn });
  // Sweep the 2-D form by placing a copy at every helix station. Radius lives
  // in the profile's x; the helix here is the axis walk so the form stays
  // centred.
  const stations = helix.points.map((point, index) => {
    const t = index / Math.max(1, helix.points.length - 1);
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
  return {
    kind: "modeled-thread",
    spec: thread,
    profile,
    stations,
    path: stations.map((s) => s.formOrigin),
    operation: thread.side === "internal" ? "subtract" : "add",
    threadGeometry: {
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
