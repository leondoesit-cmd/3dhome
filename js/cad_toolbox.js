// Toolbox fasteners and inserts. Geometry is authored in document centimetres
// with ISO millimetre declarations attached so the standards auditor can
// measure rather than trust the label.

import { METRIC_HOLE_TABLE } from "./cad_hole_wizard.js";
import { mmToCm } from "./cad_thread.js";

export const FASTENER_KINDS = Object.freeze(["shcs", "hex-screw", "hex-nut", "bushing"]);

const ISO4017_HEAD = Object.freeze({
  M3: { af: 5.5, h: 2.0 }, M4: { af: 7, h: 2.8 }, M5: { af: 8, h: 3.5 },
  M6: { af: 10, h: 4.0 }, M8: { af: 13, h: 5.3 }, M10: { af: 16, h: 6.4 },
  M12: { af: 18, h: 7.5 }, M16: { af: 24, h: 10.0 }, M20: { af: 30, h: 12.5 },
});

const ISO4032_NUT = Object.freeze({
  M3: { af: 5.5, h: 2.4 }, M4: { af: 7, h: 3.2 }, M5: { af: 8, h: 4.7 },
  M6: { af: 10, h: 5.2 }, M8: { af: 13, h: 6.8 }, M10: { af: 16, h: 8.4 },
  M12: { af: 18, h: 10.8 }, M16: { af: 24, h: 14.8 }, M20: { af: 30, h: 18 },
});

const BUSHING = Object.freeze({
  M6:  { innerMm: 6,  outerMm: 10, lengthMm: 8 },
  M8:  { innerMm: 8,  outerMm: 12, lengthMm: 10 },
  M10: { innerMm: 10, outerMm: 14, lengthMm: 12 },
  M12: { innerMm: 12, outerMm: 16, lengthMm: 16 },
  M16: { innerMm: 16, outerMm: 22, lengthMm: 20 },
  M20: { innerMm: 20, outerMm: 28, lengthMm: 25 },
});

export const TOOLBOX_SIZES = Object.freeze(Object.keys(METRIC_HOLE_TABLE));

function row(size) {
  const key = String(size || "M8").toUpperCase();
  const tagged = key.startsWith("M") ? key : "M" + key;
  return METRIC_HOLE_TABLE[tagged] || METRIC_HOLE_TABLE.M8;
}

function hexPoints(acrossFlatsCm) {
  const r = acrossFlatsCm / Math.sqrt(3);
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + i * Math.PI / 3;
    return { u: Math.cos(a) * r, v: Math.sin(a) * r };
  });
}

function steel(color) {
  return { color: color || "#aeb7c2", metal: 0.55, rough: 0.38 };
}

export function toolboxFastener(options = {}) {
  const kind = FASTENER_KINDS.includes(options.kind) ? options.kind : "shcs";
  const table = row(options.size);
  const size = table.size;
  const lengthMm = Number(options.lengthMm) || preferredLength(size);
  const group = options.groupId || "fastener_" + size + "_" + lengthMm;
  if (kind === "hex-nut") return hexNutParts(table, group, options);
  if (kind === "bushing") return bushingParts(size, group, options);
  if (kind === "hex-screw") return hexScrewParts(table, lengthMm, group, options);
  return shcsParts(table, lengthMm, group, options);
}

export function preferredLength(size) {
  return ({ M3: 12, M4: 16, M5: 20, M6: 20, M8: 30, M10: 35, M12: 40, M16: 50, M20: 60 })[size] || 30;
}

export const FASTENER_LENGTHS_MM = Object.freeze([12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60]);

export function listToolboxPicker() {
  return FASTENER_KINDS.map((kind) => ({
    kind,
    label: kind === "shcs" ? "ISO 4762 SHCS" : kind === "hex-screw" ? "ISO 4017 hex screw" : kind === "hex-nut" ? "ISO 4032 hex nut" : "Brass bushing",
    sizes: TOOLBOX_SIZES.map((size) => ({
      size,
      lengthMm: kind === "hex-nut" || kind === "bushing" ? null : preferredLength(size),
    })),
  }));
}

function shcsParts(table, lengthMm, group, options) {
  const d = mmToCm(table.diameterMm), h = mmToCm(lengthMm);
  const headR = mmToCm(table.headDiaMm) / 2, headH = mmToCm(table.headHeightMm);
  const spec = {
    family: "hex-screw",
    standard: "ISO 4762:2018",
    diameterMm: table.diameterMm,
    pitchMm: table.pitchMm,
    lengthMm,
    flankAngleDeg: 60,
    toleranceClass: options.toleranceClass || "6g",
    productGrade: "A",
    series: "coarse",
    headAcrossFlatsMm: table.hexAfMm,
    headHeightMm: table.headHeightMm,
  };
  const shank = Object.assign({
    id: options.shankId, kind: "cyl", name: table.size + "×" + lengthMm + " SHCS",
    x: 0, y: 0, z: 0, r: d / 2, h,
    standardGroupId: group, standardRole: "thread", standardCompliance: spec,
    threadGeometry: { mode: options.threadMode || "cosmetic", profile: "ISO-metric-60", pitchMm: table.pitchMm, flankAngleDeg: 60, toleranceClass: spec.toleranceClass, side: "external" },
  }, steel("#9aa3ad"));
  const head = Object.assign({
    id: options.headId, kind: "cyl", name: table.size + " SHCS head",
    x: 0, y: h, z: 0, r: headR, h: headH,
    standardGroupId: group, standardRole: "head",
  }, steel("#b4bcc6"));
  return { kind: "shcs", size: table.size, lengthMm, groupId: group, spec, parts: [shank, head], callout: table.size + "×" + lengthMm + " ISO 4762" };
}

function hexScrewParts(table, lengthMm, group, options) {
  const head = ISO4017_HEAD[table.size] || { af: table.headDiaMm, h: table.headHeightMm };
  const d = mmToCm(table.diameterMm), h = mmToCm(lengthMm);
  const spec = {
    family: "hex-screw",
    standard: "ISO 4017:2022",
    diameterMm: table.diameterMm,
    pitchMm: table.pitchMm,
    lengthMm,
    flankAngleDeg: 60,
    toleranceClass: options.toleranceClass || "6g",
    productGrade: "A",
    series: "coarse",
    headAcrossFlatsMm: head.af,
    headHeightMm: head.h,
  };
  const shank = Object.assign({
    id: options.shankId, kind: "cyl", name: "ISO 4017 " + table.size + "×" + lengthMm,
    x: 0, y: 0, z: 0, r: d / 2, h,
    standardGroupId: group, standardRole: "thread", standardCompliance: spec,
    threadGeometry: { mode: options.threadMode || "modeled", profile: "ISO-metric-60", pitchMm: table.pitchMm, flankAngleDeg: 60, toleranceClass: spec.toleranceClass, side: "external" },
  }, steel("#aeb7c2"));
  const cap = Object.assign({
    id: options.headId, kind: "ext", name: table.size + " hex head", axis: "y",
    from: h, to: h + mmToCm(head.h), pts: hexPoints(mmToCm(head.af)), holes: [],
    standardGroupId: group, standardRole: "head",
  }, steel("#bbc3cc"));
  return { kind: "hex-screw", size: table.size, lengthMm, groupId: group, spec, parts: [shank, cap], callout: table.size + "×" + lengthMm + " ISO 4017" };
}

function hexNutParts(table, group, options) {
  const nut = ISO4032_NUT[table.size] || { af: table.headDiaMm, h: table.headHeightMm };
  const spec = {
    family: "hex-nut",
    standard: "ISO 4032:2023",
    diameterMm: table.diameterMm,
    pitchMm: table.pitchMm,
    flankAngleDeg: 60,
    toleranceClass: options.toleranceClass || "6H",
    series: "coarse",
    headAcrossFlatsMm: nut.af,
    headHeightMm: nut.h,
  };
  const body = Object.assign({
    id: options.headId, kind: "ext", name: table.size + " hex nut", axis: "y",
    from: 0, to: mmToCm(nut.h), pts: hexPoints(mmToCm(nut.af)),
    holes: [circleLoop(0, 0, mmToCm(table.diameterMm) / 2)],
    standardGroupId: group, standardRole: "head", standardCompliance: spec,
    threadGeometry: { mode: options.threadMode || "cosmetic", profile: "ISO-metric-60", pitchMm: table.pitchMm, flankAngleDeg: 60, toleranceClass: spec.toleranceClass, side: "internal" },
  }, steel("#c5ccd4"));
  return { kind: "hex-nut", size: table.size, groupId: group, spec, parts: [body], callout: table.size + " ISO 4032" };
}

function bushingParts(size, group, options) {
  const spec = BUSHING[size] || BUSHING.M8;
  const inner = mmToCm(Number(options.innerMm) || spec.innerMm);
  const outer = mmToCm(Number(options.outerMm) || spec.outerMm);
  const length = mmToCm(Number(options.lengthMm) || spec.lengthMm);
  const material = options.material || { name: "Brass", color: "#c4a35a", metal: 0.65, rough: 0.28 };
  const part = Object.assign({
    id: options.shankId, kind: "ext", name: size + " bushing", axis: "y",
    from: 0, to: length, pts: circleLoop(0, 0, outer / 2),
    holes: [circleLoop(0, 0, inner / 2)],
    standardGroupId: group, standardRole: "insert",
    manufacturingRole: "insert",
    materialName: material.name,
  }, material);
  return {
    kind: "bushing",
    size,
    groupId: group,
    spec: { family: "plain-bushing", innerMm: spec.innerMm, outerMm: spec.outerMm, lengthMm: spec.lengthMm },
    parts: [part],
    callout: "Ø" + spec.innerMm + "/" + spec.outerMm + "×" + spec.lengthMm + " bushing",
  };
}

function circleLoop(u, v, r, segments = 24) {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return { u: u + Math.cos(a) * r, v: v + Math.sin(a) * r };
  });
}

export function listToolboxCatalog() {
  const lengths = FASTENER_LENGTHS_MM;
  const items = [];
  TOOLBOX_SIZES.forEach((size) => {
    items.push({ kind: "hex-nut", size, label: size + " hex nut" });
    items.push({ kind: "bushing", size, label: size + " brass bushing" });
    lengths.forEach((lengthMm) => {
      items.push({ kind: "shcs", size, lengthMm, label: size + "×" + lengthMm + " SHCS" });
      items.push({ kind: "hex-screw", size, lengthMm, label: size + "×" + lengthMm + " hex" });
    });
  });
  return items;
}
