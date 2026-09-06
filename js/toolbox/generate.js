// Parametric toolbox generators. Solids are document centimetres; declarations
// stay in millimetres so the auditor can measure rather than trust a label.

import {
  mmToCm, hexPoints, circleLoop, roundedRectLoop, annulusProfile,
  lookupSize, lookupSizeKey, normalizeLod, lodSegments,
} from "./geom.js";
import {
  paint, matePort, fastenerAxisPorts, pipeEndPorts, standardPartMetadata,
  canonicalDimensionsMm, designationOf,
} from "./schema.js";
import {
  ISO4762_SHCS, ISO4017_HEX, ISO4032_NUT, ISO4035_JAM, ISO7040_NYLOC, ISO4161_FLANGE,
  DIN315_WING, DIN1587_ACORN, ISO7089_WASHER, ISO7093_FENDER, DIN127_LOCK, CSINK_FINISH_WASHER,
  ISO10642_CSINK, ISO7380_BUTTON, ISO7045_PAN, ISO7046_CSINK_MACHINE, DIN7997_WOOD, DIN571_LAG,
  ISO4026_SET, TNUT_WOOD, TSLOT_NUT, PLAIN_BUSHING, DIN1151_NAIL, BRAD_NAIL, DRYWALL_SCREW,
  CONCRETE_NAIL, ISO2338_PIN, WOOD_DOWEL, preferredLengthFor, iso4014ThreadLengthMm,
  PREFERRED_LENGTHS_MM, IMPERIAL_LENGTHS_MM,
} from "./fastener_tables.js";
import {
  EURO_HINGE, BUTT_HINGE, PIANO_HINGE, DRAWER_SLIDE, BAR_PULL, CABINET_KNOB, EDGE_PULL,
  FLUSH_PULL, CAM_LOCK, CORNER_BRACE, MENDING_PLATE, SHELF_SUPPORT,
} from "./hardware_tables.js";
import {
  COPPER_EN1057, COPPER_ASTM_B88, PVC_D1785, PEX_ISO15875, STEEL_EN10255, CONDUIT,
  FLANGE_PN16, FLANGE_CL150, PIPE_LENGTHS_MM, pipeIdMm, elbowBendRadiusMm,
  reducingBranchRows,
} from "./pipe_tables.js";

function nextInstanceId(kind) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return kind + "_i" + cryptoApi.randomUUID();
  }
  return kind + "_i" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
}

const MATERIAL_PROPERTY_CLASSES = Object.freeze({
  "steel-8.8-zinc": "8.8",
  "steel-10.9-black": "10.9",
  "a2-70": "A2-70",
  "a4-80": "A4-80",
});

function fastenerPropertyClass(options, row) {
  if (options.propertyClass != null && String(options.propertyClass).trim()) return String(options.propertyClass).trim();
  if (row && row.imperial) return "";
  return MATERIAL_PROPERTY_CLASSES[options.material || "steel-8.8-zinc"] || "";
}

function sourceOptions(kind, sizeKey, lengthMm, options) {
  const source = { kind, size: sizeKey, sizeKey, lengthMm };
  [
    "groupId", "lod", "material", "finish", "series", "branchKey", "branchSize", "overlay", "angle", "radius",
    "thread", "threadMode", "toleranceClass", "propertyClass", "productGrade", "drawerSideMm",
    "innerMm", "outerMm", "smallOdMm",
  ].forEach((key) => {
    if (options[key] != null) source[key] = options[key];
  });
  return source;
}

// Socket take-out, valve face-to-face and reducer length are not ISO 727 /
// ASME B16.9. These factors build a recognizable placeholder; pack() marks
// those families representative so BOM and audit do not look certified.
const FITTING = Object.freeze({
  SOCKET_OD_FACTOR: 1.15,
  SOCKET_LENGTH_FACTOR: 1.8,
  TEE_RUN_FACTOR: 2.2,
  TEE_BRANCH_FACTOR: 1.2,
  REDUCER_LENGTH_FACTOR: 1.5,
  REDUCER_SMALL_OD_FACTOR: 0.75,
  CAP_OD_FACTOR: 1.12,
  CAP_LENGTH_FACTOR: 0.8,
  VALVE_LENGTH_FACTOR: 2.4,
  VALVE_HEIGHT_FACTOR: 1.6,
  VALVE_BODY_FACTOR: 0.7,
  VALVE_BONNET_FACTOR: 0.45,
});

function catalogDefinitionKey(kind, options, row) {
  return [
    kind,
    options.sizeKey || (row && row.profile ? row.profile + "-" + row.size : "") || options.size || (row && row.size) || "",
    options.lengthMm != null ? options.lengthMm : (row && row.lengthMm) || "",
    options.material || "",
    options.finish || "",
    options.series || (row && row.schedule) || "",
    options.branchKey || options.branchSize || "",
    options.overlay || "",
    options.angle || "",
    options.radius || "",
    options.thread || "",
    options.drawerSideMm || "",
    options.propertyClass || "",
  ].join("\u001f");
}

function fail(code, message, extra = {}) {
  return Object.assign({
    ok: false, error: code, message, parts: [], matePorts: [], metadata: null, callout: message, kind: extra.kind || "",
  }, extra);
}

function groupId(options, kind) {
  return options.groupId || nextInstanceId(kind || options.kind || "part");
}

function threadGeom(row, options, side = "external") {
  return {
    mode: options.threadMode || "cosmetic",
    profile: row.imperial ? "unified-60" : "ISO-metric-60",
    pitchMm: row.pitchMm,
    flankAngleDeg: 60,
    toleranceClass: options.toleranceClass || (side === "internal" ? "6H" : "6g"),
    side,
  };
}

function threadSpec(row, lengthMm, options, family, standard) {
  return {
    family,
    standard,
    diameterMm: row.diameterMm,
    pitchMm: row.pitchMm,
    lengthMm,
    flankAngleDeg: 60,
    toleranceClass: options.toleranceClass || "6g",
    productGrade: options.productGrade || "A",
    series: row.imperial ? "unc" : "coarse",
    headAcrossFlatsMm: row.af || row.hexAfMm || null,
    headHeightMm: row.h || row.headHeightMm || null,
    headDiaMm: row.headDiaMm || null,
  };
}

function pack(kind, family, row, options, parts, extra = {}) {
  const lod = normalizeLod(options.lod);
  const size = row.size || extra.size || options.size;
  const sizeKey = extra.sizeKey || options.sizeKey || options.size || size;
  const lengthMm = extra.lengthMm != null ? extra.lengthMm : (options.lengthMm != null ? Number(options.lengthMm) : null);
  const material = extra.material || options.material || "steel-8.8-zinc";
  const finish = extra.finish || options.finish || "zinc-plated";
  const standard = extra.standard || row.standard || extra.defaultStandard;
  const callout = extra.callout || [standard, size, lengthMm ? "×" + lengthMm : ""].filter(Boolean).join(" ").replace(" ×", " × ");
  const matePorts = extra.matePorts || [];
  const dimensionsMm = canonicalDimensionsMm(extra.dimensionsMm, {
    diameterMm: row.diameterMm, pitchMm: row.pitchMm, headDiaMm: row.headDiaMm,
    headHeightMm: row.headHeightMm || row.h, acrossFlatsMm: row.af || row.hexAfMm,
    lengthMm, odMm: row.odMm, wallMm: row.wallMm, schedule: row.schedule, dn: row.dn,
    profile: row.profile,
  });
  const spec = extra.spec || null;
  const catalogKey = extra.catalogKey || catalogDefinitionKey(kind, options, row);
  const metadata = standardPartMetadata({
    id: extra.id || kind + ":" + sizeKey + (lengthMm ? "x" + lengthMm : ""),
    category: extra.category || "fastener",
    family,
    standard,
    designation: extra.designation || designationOf({
      standard, nominalSize: size, lengthMm,
      propertyClass: extra.propertyClass || options.propertyClass,
    }) || callout,
    nominalSize: size,
    dimensionsMm,
    material,
    finish,
    matePorts,
    lod,
    series: extra.series || (row.imperial ? "imperial" : (row.schedule ? "Sch " + row.schedule : "metric")),
    threadClass: (spec && spec.toleranceClass) || extra.threadClass,
    propertyClass: extra.propertyClass || options.propertyClass || null,
    catalogKey,
    instanceId: extra.group,
    sizeKey,
    representative: !!extra.representative,
  });
  if (spec) {
    if (spec.diameterMm != null) metadata.diameterMm = spec.diameterMm;
    if (spec.pitchMm != null) metadata.pitchMm = spec.pitchMm;
    if (spec.lengthMm != null) metadata.lengthMm = spec.lengthMm;
    if (spec.headAcrossFlatsMm != null) metadata.headAcrossFlatsMm = spec.headAcrossFlatsMm;
    if (spec.headHeightMm != null) metadata.headHeightMm = spec.headHeightMm;
    if (spec.headDiaMm != null) metadata.headDiaMm = spec.headDiaMm;
    if (spec.flankAngleDeg != null) metadata.flankAngleDeg = spec.flankAngleDeg;
    if (spec.toleranceClass != null) metadata.toleranceClass = spec.toleranceClass;
    if (spec.productGrade != null) metadata.productGrade = spec.productGrade;
    if (spec.series) metadata.threadSeries = spec.series;
  }
  const painted = parts.map((part) => paint(part, part.materialId || material));
  painted.forEach((part) => {
    part.standardGroupId = extra.group;
    part.standardPart = metadata;
    part.catalogKey = catalogKey;
    if (part.standardCompliance && typeof part.standardCompliance === "object") {
      part.standardCompliance = Object.assign({}, part.standardCompliance, {
        sizeKey: metadata.sizeKey,
        nominalSize: metadata.nominalSize,
        dimensionsMm: metadata.dimensionsMm,
        catalogKey,
        family: metadata.family,
        standard: metadata.standard || part.standardCompliance.standard,
      });
    }
  });
  return {
    ok: true, kind, family, size, sizeKey, lengthMm, groupId: extra.group, instanceId: extra.group,
    catalogKey, spec: spec || null,
    sourceOptions: sourceOptions(kind, sizeKey, lengthMm, options),
    parts: painted, matePorts, metadata, callout, lod, category: metadata.category,
  };
}

function shankCylinder(row, lengthMm, group, options, name) {
  const d = mmToCm(row.diameterMm), h = mmToCm(lengthMm);
  const core = row.coreMm ? mmToCm(row.coreMm) : d;
  return {
    id: options.shankId, kind: "cyl", name, x: 0, y: 0, z: 0, r: (options.taper ? core : d) / 2, r2: d / 2, h,
    standardGroupId: group, standardRole: "thread",
    threadGeometry: row.pitchMm ? threadGeom(row, options) : undefined,
  };
}

function hexHead(row, y0Cm, group, options, name) {
  const af = mmToCm(row.af || row.hexAfMm), h = mmToCm(row.h || row.headHeightMm);
  return {
    id: options.headId, kind: "ext", name, axis: "y", from: y0Cm, to: y0Cm + h,
    pts: hexPoints(af), holes: [],
    standardGroupId: group, standardRole: "head",
  };
}

function generateShcs(row, options, group) {
  const lod = normalizeLod(options.lod);
  const lengthMm = Number(options.lengthMm) || preferredLengthFor(row.size, row.diameterMm);
  const standard = row.standard || "ISO 4762:2018";
  const h = mmToCm(lengthMm);
  const spec = threadSpec(row, lengthMm, options, "shcs", standard);
  const propertyClass = fastenerPropertyClass(options, row);
  spec.headDiaMm = row.headDiaMm;
  spec.headHeightMm = row.headHeightMm;
  spec.headAcrossFlatsMm = row.hexAfMm;
  const parts = [shankCylinder(row, lengthMm, group, options, row.size + "×" + lengthMm + " SHCS")];
  parts[0].standardCompliance = spec;
  if (lod >= 1) {
    parts.push({
      id: options.headId, kind: "cyl", name: row.size + " SHCS head",
      x: 0, y: h, z: 0, r: mmToCm(row.headDiaMm) / 2, h: mmToCm(row.headHeightMm),
      standardGroupId: group, standardRole: "head",
    });
    if (lod >= 2) {
      const recess = mmToCm(row.socketDepthMm || row.headHeightMm * 0.5);
      parts.push({
        kind: "ext", name: row.size + " hex socket", axis: "y",
        from: h + mmToCm(row.headHeightMm) - recess,
        to: h + mmToCm(row.headHeightMm) + 0.02,
        pts: hexPoints(mmToCm(row.hexAfMm)),
        standardRole: "socket", previewOnly: true, opacity: 0,
      });
    }
  }
  return pack("shcs", "shcs", row, options, parts, {
    group, lengthMm, standard, spec, defaultStandard: standard,
    callout: row.size + "×" + lengthMm + " " + (row.imperial ? "SHCS" : "ISO 4762"),
    designation: [(row.imperial ? "ASME B18.3" : "ISO 4762"), row.size + " x " + lengthMm, propertyClass].filter(Boolean).join(" - "),
    propertyClass,
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { pitch: row.pitchMm, headDia: row.headDiaMm, headHeight: row.headHeightMm, acrossFlats: row.hexAfMm, socketDepth: row.socketDepthMm, diameter: row.diameterMm, length: lengthMm },
  });
}

function generateHexScrew(row, options, group, partial) {
  const lod = normalizeLod(options.lod);
  const lengthMm = Number(options.lengthMm) || preferredLengthFor(row.size, row.diameterMm);
  const standard = row.standard || (partial ? "ISO 4014:2022" : "ISO 4017:2022");
  const family = partial ? "hex-bolt" : "hex-screw";
  const kind = family;
  const threadMm = partial ? iso4014ThreadLengthMm(row.diameterMm, lengthMm) : lengthMm;
  const spec = threadSpec(row, lengthMm, options, family, standard);
  const propertyClass = fastenerPropertyClass(options, row);
  spec.headAcrossFlatsMm = row.af;
  spec.headHeightMm = row.h;
  spec.productGrade = options.productGrade || "A";
  const h = mmToCm(lengthMm);
  const parts = [];
  if (partial && threadMm < lengthMm - 0.5) {
    const shankMm = lengthMm - threadMm;
    parts.push({
      id: options.shankId, kind: "cyl", name: row.size + " shank",
      x: 0, y: mmToCm(threadMm), z: 0, r: mmToCm(row.diameterMm) / 2, h: mmToCm(shankMm),
      standardGroupId: group, standardRole: "shank",
    });
    parts.push({
      kind: "cyl", name: row.size + "×" + lengthMm + " thread",
      x: 0, y: 0, z: 0, r: mmToCm(row.diameterMm) / 2, h: mmToCm(threadMm),
      standardGroupId: group, standardRole: "thread", standardCompliance: spec,
      threadGeometry: threadGeom(row, options),
    });
  } else {
    const shank = shankCylinder(row, lengthMm, group, options, (partial ? "ISO 4014 " : "ISO 4017 ") + row.size + "×" + lengthMm);
    shank.standardCompliance = spec;
    parts.push(shank);
  }
  if (lod >= 1) parts.push(hexHead(row, h, group, options, row.size + " hex head"));
  return pack(kind, family, row, options, parts, {
    group, lengthMm, standard, spec,
    callout: row.size + "×" + lengthMm + " " + (partial ? "ISO 4014" : "ISO 4017"),
    designation: [standard.replace(/:.*$/, ""), row.size + " x " + lengthMm, propertyClass].filter(Boolean).join(" - "),
    propertyClass,
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { pitch: row.pitchMm, acrossFlats: row.af, headHeight: row.h, diameter: row.diameterMm, length: lengthMm, threadLength: threadMm },
  });
}

function generateCsinkSocket(row, options, group) {
  const lengthMm = Number(options.lengthMm) || preferredLengthFor(row.size, row.diameterMm);
  const standard = row.standard || "ISO 10642:2019";
  const spec = threadSpec(row, lengthMm, options, "csink-socket", standard);
  spec.headDiaMm = row.headDiaMm;
  spec.headHeightMm = row.headHeightMm;
  const h = mmToCm(lengthMm);
  const parts = [shankCylinder(row, lengthMm, group, options, row.size + "×" + lengthMm + " csink")];
  parts[0].standardCompliance = spec;
  parts.push({
    id: options.headId, kind: "cyl", name: row.size + " countersunk head",
    x: 0, y: h, z: 0,
    r: mmToCm(row.diameterMm) / 2, r2: mmToCm(row.headDiaMm) / 2, h: mmToCm(row.headHeightMm),
    standardGroupId: group, standardRole: "head",
  });
  return pack("csink-socket", "csink-socket", row, options, parts, {
    group, lengthMm, standard, spec,
    callout: row.size + "×" + lengthMm + " ISO 10642 " + row.angle + "°",
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { pitch: row.pitchMm, headDia: row.headDiaMm, headHeight: row.headHeightMm, angle: row.angle, acrossFlats: row.hexAfMm, diameter: row.diameterMm, length: lengthMm },
  });
}

function generateButton(row, options, group) {
  const lengthMm = Number(options.lengthMm) || preferredLengthFor(row.size, row.diameterMm);
  const standard = "ISO 7380-1:2022";
  const spec = threadSpec(row, lengthMm, options, "button-socket", standard);
  const h = mmToCm(lengthMm);
  const parts = [shankCylinder(row, lengthMm, group, options, row.size + "×" + lengthMm + " button")];
  parts[0].standardCompliance = spec;
  parts.push({
    id: options.headId, kind: "cyl", name: row.size + " button head",
    x: 0, y: h, z: 0, r: mmToCm(row.headDiaMm) / 2, h: mmToCm(row.headHeightMm),
    standardGroupId: group, standardRole: "head",
  });
  return pack("button-socket", "button-socket", row, options, parts, {
    group, lengthMm, standard, spec,
    callout: row.size + "×" + lengthMm + " ISO 7380-1",
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { pitch: row.pitchMm, headDia: row.headDiaMm, headHeight: row.headHeightMm, acrossFlats: row.hexAfMm, diameter: row.diameterMm, length: lengthMm },
  });
}

function generatePan(row, options, group) {
  const lengthMm = Number(options.lengthMm) || preferredLengthFor(row.size, row.diameterMm);
  const standard = "ISO 7045:2011";
  const spec = threadSpec(row, lengthMm, options, "pan-screw", standard);
  const h = mmToCm(lengthMm);
  const parts = [shankCylinder(row, lengthMm, group, options, row.size + "×" + lengthMm + " pan")];
  parts[0].standardCompliance = spec;
  parts.push({
    id: options.headId, kind: "cyl", name: row.size + " pan head",
    x: 0, y: h, z: 0, r: mmToCm(row.headDiaMm) / 2, h: mmToCm(row.headHeightMm),
    standardGroupId: group, standardRole: "head",
  });
  return pack("pan-screw", "pan-screw", row, options, parts, {
    group, lengthMm, standard, spec,
    callout: row.size + "×" + lengthMm + " ISO 7045",
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { pitch: row.pitchMm, headDia: row.headDiaMm, headHeight: row.headHeightMm, diameter: row.diameterMm, length: lengthMm },
  });
}

function generateMachineCsink(row, options, group) {
  const lengthMm = Number(options.lengthMm) || preferredLengthFor(row.size, row.diameterMm);
  const standard = "ISO 7046:2011";
  const spec = threadSpec(row, lengthMm, options, "csink-machine", standard);
  const h = mmToCm(lengthMm);
  const parts = [shankCylinder(row, lengthMm, group, options, row.size + "×" + lengthMm + " csink")];
  parts[0].standardCompliance = spec;
  parts.push({
    id: options.headId, kind: "cyl", name: row.size + " csink head",
    x: 0, y: h, z: 0, r: mmToCm(row.diameterMm) / 2, r2: mmToCm(row.headDiaMm) / 2, h: mmToCm(row.headHeightMm),
    standardGroupId: group, standardRole: "head",
  });
  return pack("csink-machine", "csink-machine", row, options, parts, {
    group, lengthMm, standard, spec,
    callout: row.size + "×" + lengthMm + " ISO 7046",
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { diameter: row.diameterMm, pitch: row.pitchMm, headDia: row.headDiaMm, headHeight: row.headHeightMm, length: lengthMm },
  });
}

function generateWoodScrew(row, options, group) {
  const lengthMm = Number(options.lengthMm) || 40;
  const standard = "DIN 7997";
  const h = mmToCm(lengthMm);
  const parts = [
    { kind: "cyl", name: row.size + "×" + lengthMm + " wood screw", x: 0, y: 0, z: 0, r: mmToCm(row.coreMm) / 2, r2: mmToCm(row.diameterMm) / 2, h, standardRole: "thread" },
    { kind: "cyl", name: "csink head", x: 0, y: h, z: 0, r: mmToCm(row.diameterMm) / 2, r2: mmToCm(row.headDiaMm) / 2, h: mmToCm(row.headHeightMm), standardRole: "head" },
  ];
  return pack("wood-screw", "wood-screw", row, options, parts, {
    group, lengthMm, standard, material: options.material || "steel-zinc",
    callout: "DIN 7997 " + row.size + "×" + lengthMm,
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { pitch: row.pitchMm, coreDia: row.coreMm, headDia: row.headDiaMm, diameter: row.diameterMm, length: lengthMm },
  });
}

function generateLag(row, options, group) {
  const lengthMm = Number(options.lengthMm) || 80;
  const standard = "DIN 571";
  const spec = threadSpec(row, lengthMm, options, "lag-bolt", standard);
  spec.headAcrossFlatsMm = row.af;
  spec.headHeightMm = row.h;
  const h = mmToCm(lengthMm);
  const parts = [
    { kind: "cyl", name: "DIN 571 " + row.size + "×" + lengthMm, x: 0, y: 0, z: 0, r: mmToCm(row.coreMm) / 2, r2: mmToCm(row.diameterMm) / 2, h, standardRole: "thread", standardCompliance: spec },
    hexHead(row, h, group, options, row.size + " lag head"),
  ];
  return pack("lag-bolt", "lag-bolt", row, options, parts, {
    group, lengthMm, standard, spec,
    callout: "DIN 571 " + row.size + "×" + lengthMm,
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { diameter: row.diameterMm, pitch: row.pitchMm, coreMm: row.coreMm, acrossFlats: row.af, headHeight: row.h, length: lengthMm },
  });
}

function generateSetScrew(row, options, group, point) {
  const lengthMm = Number(options.lengthMm) || row.diameterMm * 1.5;
  const standard = point === "cone" ? "ISO 4027:2003" : point === "cup" ? "ISO 4029:2003" : "ISO 4026:2003";
  const family = point === "cone" ? "set-cone" : point === "cup" ? "set-cup" : "set-flat";
  const spec = threadSpec(row, lengthMm, options, family, standard);
  const h = mmToCm(lengthMm);
  const tip = mmToCm(row.diameterMm * 0.35);
  const parts = [{
    kind: "cyl", name: row.size + "×" + lengthMm + " set " + point,
    x: 0, y: point === "flat" ? 0 : tip, z: 0, r: mmToCm(row.diameterMm) / 2, h: h - (point === "flat" ? 0 : tip),
    standardRole: "thread", standardCompliance: spec, threadGeometry: threadGeom(row, options),
  }];
  if (point === "cone") parts.unshift({ kind: "cyl", name: "cone point", x: 0, y: 0, z: 0, r: 0.01, r2: mmToCm(row.diameterMm) / 2, h: tip, standardRole: "point" });
  if (point === "cup") parts.unshift({ kind: "cyl", name: "cup point", x: 0, y: 0, z: 0, r: mmToCm(row.diameterMm) * 0.25, r2: mmToCm(row.diameterMm) / 2, h: tip, standardRole: "point" });
  return pack(family, family, row, options, parts, {
    group, lengthMm, standard, spec,
    callout: row.size + "×" + lengthMm + " " + standard.replace(/:.*$/, ""),
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm, row.pitchMm),
    dimensionsMm: { diameter: row.diameterMm, pitch: row.pitchMm, length: lengthMm, point },
  });
}

function generateHexNut(row, options, group, family, standard) {
  const spec = {
    family, standard, diameterMm: row.diameterMm, pitchMm: row.pitchMm, flankAngleDeg: 60,
    toleranceClass: options.toleranceClass || "6H", series: "coarse",
    headAcrossFlatsMm: row.af, headHeightMm: row.h,
  };
  const body = {
    id: options.headId, kind: "ext", name: row.size + " " + family,
    axis: "y", from: 0, to: mmToCm(row.h),
    pts: hexPoints(mmToCm(row.af)),
    holes: [circleLoop(0, 0, mmToCm(row.diameterMm) / 2, lodSegments(normalizeLod(options.lod)))],
    standardRole: "head", standardCompliance: spec,
    threadGeometry: threadGeom(row, options, "internal"),
  };
  const parts = [body];
  if (family === "nyloc-nut" && row.nylonH) {
    parts.push(paint({
      kind: "cyl", name: "nylon insert", x: 0, y: mmToCm(row.h - row.nylonH), z: 0,
      r: mmToCm(row.af) / 2 * 0.85, h: mmToCm(row.nylonH), standardRole: "insert", materialId: "nylon",
    }, "nylon"));
  }
  if (family === "flange-nut" && row.flangeDiaMm) {
    parts.push({
      kind: "cyl", name: "flange", x: 0, y: 0, z: 0,
      r: mmToCm(row.flangeDiaMm) / 2, h: mmToCm(row.flangeH || 1.2), standardRole: "flange",
    });
  }
  return pack(family, family, row, options, parts, {
    group, standard, spec,
    callout: row.size + " " + standard.replace(/:.*$/, ""),
    matePorts: [
      matePort({ id: "axis", type: "axis", diameterMm: row.diameterMm, gender: "female", thread: "ISO-metric", pitchMm: row.pitchMm }),
      matePort({ id: "seat", type: "plane", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 } }),
    ],
    dimensionsMm: { pitch: row.pitchMm, acrossFlats: row.af, height: row.h, diameter: row.diameterMm, flangeDia: row.flangeDiaMm },
  });
}

function generateWingNut(row, options, group) {
  const standard = "DIN 315";
  const spec = { family: "wing-nut", standard, diameterMm: row.diameterMm, pitchMm: row.pitchMm, flankAngleDeg: 60, toleranceClass: "6H" };
  const span = mmToCm(row.spanMm), h = mmToCm(row.h), boss = mmToCm(row.bossMm);
  const parts = [
    {
      kind: "ext", name: row.size + " wing boss", axis: "y", from: 0, to: h,
      pts: circleLoop(0, 0, boss / 2, 20),
      holes: [circleLoop(0, 0, mmToCm(row.diameterMm) / 2, 16)],
      standardRole: "head", standardCompliance: spec,
    },
    { kind: "box", name: "wing", x0: -span / 2, x1: span / 2, y0: h * 0.25, y1: h, z0: -mmToCm(2), z1: mmToCm(2), standardRole: "wing" },
  ];
  return pack("wing-nut", "wing-nut", row, options, parts, {
    group, standard, spec, callout: "DIN 315 " + row.size,
    matePorts: [matePort({ id: "axis", type: "axis", diameterMm: row.diameterMm, gender: "female", pitchMm: row.pitchMm })],
    dimensionsMm: { diameter: row.diameterMm, span: row.spanMm, height: row.h },
  });
}

function generateAcorn(row, options, group) {
  const standard = "DIN 1587";
  const spec = { family: "acorn-nut", standard, diameterMm: row.diameterMm, pitchMm: row.pitchMm, headAcrossFlatsMm: row.af, headHeightMm: row.hexH };
  const parts = [
    hexHead({ af: row.af, h: row.hexH }, 0, group, options, row.size + " acorn hex"),
    { kind: "cyl", name: "dome", x: 0, y: mmToCm(row.hexH), z: 0, r: mmToCm(row.domeDia) / 2, r2: mmToCm(row.domeDia) * 0.15, h: mmToCm(row.domeH), standardRole: "dome" },
  ];
  parts[0].holes = [circleLoop(0, 0, mmToCm(row.diameterMm) / 2, 16)];
  parts[0].standardCompliance = spec;
  parts[0].threadGeometry = threadGeom(row, options, "internal");
  return pack("acorn-nut", "acorn-nut", row, options, parts, {
    group, standard, spec, callout: "DIN 1587 " + row.size,
    matePorts: [matePort({ id: "axis", type: "axis", diameterMm: row.diameterMm, gender: "female" })],
    dimensionsMm: { diameter: row.diameterMm, acrossFlats: row.af, hexHeight: row.hexH, domeH: row.domeH },
  });
}

function generateWasher(row, options, group, family, standard) {
  const segs = lodSegments(normalizeLod(options.lod));
  let part = {
    kind: "ext", name: row.size + " " + family, axis: "y", from: 0, to: mmToCm(row.h),
    pts: circleLoop(0, 0, mmToCm(row.odMm) / 2, segs),
    holes: [circleLoop(0, 0, mmToCm(row.idMm) / 2, segs)],
    standardRole: "washer",
  };
  if (family === "washer-lock") {
    part.pts = annulusProfile(0, mmToCm(row.odMm) / 2, mmToCm(row.idMm) / 2, Math.max(12, segs));
    part.holes = [];
  }
  if (family === "washer-csink") {
    part = {
      kind: "cyl", name: row.size + " " + family, x: 0, y: 0, z: 0,
      r: mmToCm(row.odMm) / 2, r2: mmToCm(row.idMm) / 2, h: mmToCm(row.h), standardRole: "washer",
    };
  }
  return pack(family, family, row, options, [part], {
    group, standard, callout: row.size + " " + standard.replace(/:.*$/, ""),
    matePorts: [matePort({ id: "axis", type: "axis", diameterMm: row.idMm, gender: "clearance" })],
    dimensionsMm: { id: row.idMm, od: row.odMm, thickness: row.h },
  });
}

function generateTNut(row, options, group) {
  const standard = "T-nut (4-prong)";
  const spec = { family: "t-nut", standard, diameterMm: row.diameterMm, pitchMm: row.pitchMm };
  const parts = [
    {
      kind: "ext", name: row.size + " T-nut barrel", axis: "y",
      from: -mmToCm(row.barrelH), to: 0,
      pts: circleLoop(0, 0, mmToCm(row.barrelDiaMm) / 2, 16),
      holes: [circleLoop(0, 0, mmToCm(row.diameterMm) / 2, 14)],
      standardRole: "barrel", standardCompliance: spec,
    },
    { kind: "cyl", name: "flange", x: 0, y: 0, z: 0, r: mmToCm(row.flangeDiaMm) / 2, h: mmToCm(row.flangeH), standardRole: "flange" },
  ];
  if (normalizeLod(options.lod) >= 2) {
    for (let i = 0; i < row.prongs; i++) {
      const a = i * Math.PI * 2 / row.prongs;
      const r = mmToCm(row.flangeDiaMm / 2);
      parts.push({
        kind: "box", name: "prong",
        x0: Math.cos(a) * r * 0.4 - mmToCm(1), x1: Math.cos(a) * r * 0.4 + mmToCm(1),
        y0: -mmToCm(row.prongL), y1: 0,
        z0: Math.sin(a) * r * 0.4 - mmToCm(0.6), z1: Math.sin(a) * r * 0.4 + mmToCm(0.6),
        standardRole: "prong",
      });
    }
  }
  return pack("t-nut", "t-nut", row, options, parts, {
    group, standard, spec, callout: row.size + " 4-prong T-nut",
    matePorts: [matePort({ id: "axis", type: "axis", diameterMm: row.diameterMm, gender: "female" })],
    dimensionsMm: { diameter: row.diameterMm, barrelDia: row.barrelDiaMm, flangeDia: row.flangeDiaMm },
  });
}

function generateTslot(row, options, group) {
  const standard = "T-slot nut";
  const spec = {
    family: "tslot-nut", standard, diameterMm: row.diameterMm, pitchMm: row.pitchMm,
    sizeKey: options.sizeKey || (row.profile + "-" + row.size), nominalSize: row.size,
  };
  const w = mmToCm(row.widthMm), l = mmToCm(row.lengthMm), h = mmToCm(row.heightMm);
  const part = {
    kind: "ext", name: row.profile + " " + row.size + " T-nut", axis: "y", from: 0, to: h,
    pts: roundedRectLoop(w, l, mmToCm(1), 0, 0, 2),
    holes: [circleLoop(0, 0, mmToCm(row.diameterMm) / 2, 14)],
    standardRole: "head", standardCompliance: spec, threadGeometry: threadGeom(row, options, "internal"),
  };
  return pack("tslot-nut", "tslot-nut", row, options, [part], {
    group, standard, spec, callout: row.profile + " " + row.size + " T-slot nut",
    matePorts: [matePort({ id: "axis", type: "axis", diameterMm: row.diameterMm, gender: "female" })],
    dimensionsMm: { diameter: row.diameterMm, profile: row.profile, length: row.lengthMm, width: row.widthMm, height: row.heightMm },
    material: options.material || "steel-zinc",
  });
}

function generateBushing(row, options, group) {
  const innerMm = Number(options.innerMm) > 0 ? Number(options.innerMm) : row.innerMm;
  const outerMm = Number(options.outerMm) > 0 ? Number(options.outerMm) : row.outerMm;
  const lengthMm = Number(options.lengthMm) > 0 ? Number(options.lengthMm) : row.lengthMm;
  const inner = mmToCm(innerMm);
  const outer = mmToCm(outerMm);
  const length = mmToCm(lengthMm);
  const part = {
    id: options.shankId, kind: "ext", name: row.size + " bushing", axis: "y",
    from: 0, to: length, pts: circleLoop(0, 0, outer / 2, 24),
    holes: [circleLoop(0, 0, inner / 2, 20)],
    standardRole: "insert", manufacturingRole: "insert",
    materialId: options.material || "brass",
  };
  return pack("bushing", "bushing", row, options, [part], {
    group, standard: "plain bushing", material: options.material || "brass", finish: "raw",
    lengthMm, spec: { family: "bushing", innerMm, outerMm, lengthMm },
    callout: "Ø" + innerMm + "/" + outerMm + "×" + lengthMm + " bushing",
    matePorts: [matePort({ id: "axis", type: "axis", diameterMm: innerMm, gender: "female" })],
    dimensionsMm: { inner: innerMm, outer: outerMm, length: lengthMm },
  });
}

function generateNail(row, options, group, family, standard) {
  const lengthMm = Number(options.lengthMm) > 0 ? Number(options.lengthMm) : row.lengthMm;
  const headDelta = (Number(row.headDiaMm) - Number(row.diameterMm)) * 0.35;
  const headH = mmToCm(headDelta) || mmToCm(0.8);
  const parts = [{
    kind: "cyl", name: row.size + " " + family,
    x: 0, y: 0, z: 0, r: 0.02, r2: mmToCm(row.diameterMm) / 2, h: mmToCm(lengthMm),
    standardRole: "shank",
  }];
  if (!row.headless && row.headDiaMm > row.diameterMm) {
    parts.push({
      kind: "cyl", name: "head", x: 0, y: mmToCm(lengthMm), z: 0,
      r: mmToCm(row.headDiaMm) / 2, h: headH, standardRole: "head",
    });
  }
  const wood = family === "pin-dowel-wood";
  return pack(family, family, row, options, parts, {
    group, lengthMm, standard, material: options.material || (wood ? "beech" : "steel"),
    finish: family.indexOf("drywall") >= 0 ? "phosphate" : "raw",
    callout: standard + " " + row.size,
    matePorts: fastenerAxisPorts(row.diameterMm, lengthMm),
    dimensionsMm: { diameter: row.diameterMm, length: lengthMm, headDia: row.headDiaMm },
  });
}

function generateEuroHinge(options, group) {
  const overlayKey = options.overlay || options.size || "full-overlay";
  const overlay = EURO_HINGE.overlays[overlayKey];
  if (!overlay) return fail("unresolved-size", "Unknown euro-hinge overlay " + overlayKey, { kind: "euro-hinge" });
  const angle = Number(options.angle) || 110;
  const cupR = mmToCm(EURO_HINGE.cupDiaMm) / 2;
  const cupH = mmToCm(EURO_HINGE.cupDepthMm);
  const crank = mmToCm(overlay.crankMm);
  const armL = mmToCm(45) + crank;
  const parts = [
    { kind: "cyl", name: "35mm cup", x: 0, y: -cupH, z: 0, r: cupR, h: cupH, standardRole: "cup" },
    { kind: "box", name: "arm", x0: -mmToCm(8), x1: armL, y0: 0, y1: mmToCm(10), z0: -mmToCm(6), z1: mmToCm(6), standardRole: "arm" },
    { kind: "box", name: "mounting plate", x0: armL, x1: armL + mmToCm(32), y0: -mmToCm(2), y1: mmToCm(8), z0: -mmToCm(16), z1: mmToCm(16), standardRole: "plate" },
  ];
  const matePorts = [
    matePort({ id: "cup", type: "axis", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 }, diameterMm: 35, insertionDepthMm: EURO_HINGE.cupDepthMm, gender: "male" }),
    matePort({ id: "plate", type: "plane", origin: { x: armL + mmToCm(16), y: -mmToCm(2), z: 0 }, axis: { x: 0, y: -1, z: 0 } }),
  ];
  return pack("euro-hinge", "euro-hinge", { size: overlay.label + " " + angle + "°" }, options, parts, {
    group, category: "hardware", standard: "EN 15570 / 32mm system", material: "steel-zinc",
    callout: "35mm " + overlay.label + " " + angle + "°",
    designation: "Euro hinge 35mm - " + overlay.label + " - " + angle + "° - crank " + overlay.crankMm + "mm",
    matePorts,
    dimensionsMm: { cupDia: 35, cupDepth: EURO_HINGE.cupDepthMm, crank: overlay.crankMm, plateSetback: EURO_HINGE.plateSetbackMm, plateHoleSpacing: 32, cupHoleSpacing: 45, drillingDistance: 5, openingAngle: angle },
  });
}

function generateButtHinge(row, options, group) {
  const L = mmToCm(row.lengthMm), W = mmToCm(row.widthMm), T = mmToCm(row.thicknessMm), K = mmToCm(row.knuckleDiaMm);
  const parts = [
    { kind: "box", name: "leaf A", x0: -W / 2, x1: 0, y0: 0, y1: T, z0: -L / 2, z1: L / 2, standardRole: "leaf" },
    { kind: "box", name: "leaf B", x0: 0, x1: W / 2, y0: 0, y1: T, z0: -L / 2, z1: L / 2, standardRole: "leaf" },
    { kind: "cyl", name: "knuckle", x: 0, y: -K / 2 + T / 2, z: -L / 2, r: K / 2, h: L, standardRole: "knuckle" },
  ];
  return pack("butt-hinge", "butt-hinge", row, options, parts, {
    group, category: "hardware", standard: "EN 1935 / ANSI/BHMA A156.1", material: "steel-zinc",
    callout: "Butt hinge " + row.size,
    matePorts: [
      matePort({ id: "leaf-a", type: "plane", origin: { x: -W / 4, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 } }),
      matePort({ id: "leaf-b", type: "plane", origin: { x: W / 4, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 } }),
      matePort({ id: "pin", type: "axis", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 } }),
    ],
    dimensionsMm: { length: row.lengthMm, width: row.widthMm, thickness: row.thicknessMm, knuckleDia: row.knuckleDiaMm },
  });
}

function generatePianoHinge(options, group) {
  const lengthMm = Number(options.lengthMm) || 1000;
  const W = mmToCm(PIANO_HINGE.widthMm), L = mmToCm(lengthMm), T = mmToCm(PIANO_HINGE.thicknessMm);
  const parts = [
    { kind: "box", name: "piano leaf A", x0: -W / 2, x1: 0, y0: 0, y1: T, z0: 0, z1: L, standardRole: "leaf" },
    { kind: "box", name: "piano leaf B", x0: 0, x1: W / 2, y0: 0, y1: T, z0: 0, z1: L, standardRole: "leaf" },
    { kind: "cyl", name: "knuckle", x: 0, y: -mmToCm(PIANO_HINGE.knuckleDiaMm) / 2, z: 0, r: mmToCm(PIANO_HINGE.knuckleDiaMm) / 2, h: L, standardRole: "knuckle" },
  ];
  return pack("piano-hinge", "piano-hinge", { size: lengthMm + "mm" }, options, parts, {
    group, lengthMm, category: "hardware", standard: "continuous / piano hinge", material: "steel-zinc",
    callout: "Piano hinge " + lengthMm + "mm",
    matePorts: [
      matePort({ id: "leaf-a", type: "plane", origin: { x: -W / 4, y: 0, z: L / 2 }, axis: { x: 0, y: -1, z: 0 } }),
      matePort({ id: "leaf-b", type: "plane", origin: { x: W / 4, y: 0, z: L / 2 }, axis: { x: 0, y: -1, z: 0 } }),
    ],
    dimensionsMm: { length: lengthMm, width: PIANO_HINGE.widthMm, holePitch: PIANO_HINGE.holePitchMm, thickness: PIANO_HINGE.thicknessMm },
  });
}

function generateSlide(options, group, undermount) {
  const lengthMm = Number(options.lengthMm) || 450;
  const sideMm = Number(options.drawerSideMm) || (undermount ? 16 : null);
  const H = mmToCm(undermount ? DRAWER_SLIDE.heightsMm.undermount : DRAWER_SLIDE.heightsMm.ball);
  const L = mmToCm(lengthMm);
  const t = mmToCm(1.2);
  const w = mmToCm(undermount ? 6 + Number(sideMm || 16) : 12.7);
  const parts = [
    { kind: "box", name: "outer member", x0: 0, x1: w, y0: 0, y1: H, z0: 0, z1: L, standardRole: "outer" },
    { kind: "box", name: "intermediate", x0: t, x1: w - t, y0: t, y1: H - t, z0: mmToCm(10), z1: L - mmToCm(10), standardRole: "intermediate" },
    { kind: "box", name: "inner member", x0: t * 2, x1: w - t * 2, y0: t * 2, y1: H - t * 2, z0: mmToCm(20), z1: L, standardRole: "inner" },
  ];
  const family = undermount ? "undermount-slide" : "drawer-slide";
  return pack(family, family, { size: lengthMm + "mm" }, options, parts, {
    group, lengthMm, category: "hardware",
    standard: undermount ? "undermount soft-close" : "ball-bearing full extension 45kg",
    material: "steel-zinc",
    callout: (undermount ? "Undermount " : "Ball-bearing ") + lengthMm + "mm",
    matePorts: [
      matePort({ id: "cabinet", type: "plane", origin: { x: 0, y: H / 2, z: L / 2 }, axis: { x: -1, y: 0, z: 0 } }),
      matePort({ id: "drawer", type: "plane", origin: { x: w, y: H / 2, z: L / 2 }, axis: { x: 1, y: 0, z: 0 } }),
    ],
    dimensionsMm: { length: lengthMm, height: undermount ? 28 : 45, ratingKg: 45, sideClearance: undermount ? null : 12.7, drawerSide: sideMm },
  });
}

function generateBarPull(row, options, group) {
  const cc = mmToCm(row.ccMm), r = mmToCm(row.barDiaMm) / 2, post = mmToCm(row.postH);
  const parts = [
    { kind: "cyl", name: "post A", x: 0, y: 0, z: 0, r: mmToCm(row.postDiaMm) / 2, h: post, standardRole: "post" },
    { kind: "cyl", name: "post B", x: cc, y: 0, z: 0, r: mmToCm(row.postDiaMm) / 2, h: post, standardRole: "post" },
    { kind: "ext", name: "bar", axis: "x", from: 0, to: cc, pts: circleLoop(0, 0, r, 16), standardRole: "bar" },
  ];
  return pack("bar-pull", "bar-pull", row, options, parts, {
    group, category: "hardware", standard: "32mm system bar pull", material: options.material || "chrome", finish: "polished",
    callout: "Bar pull CC " + row.ccMm + "mm",
    matePorts: [
      matePort({ id: "screw-a", type: "axis", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 }, diameterMm: 4, gender: "female" }),
      matePort({ id: "screw-b", type: "axis", origin: { x: cc, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 }, diameterMm: 4, gender: "female" }),
    ],
    dimensionsMm: { cc: row.ccMm, barDia: row.barDiaMm, projection: row.projectionMm },
  });
}

function generateKnob(row, options, group) {
  const parts = row.kind === "square"
    ? [{ kind: "box", name: row.size + " knob", x0: -mmToCm(row.diaMm) / 2, x1: mmToCm(row.diaMm) / 2, y0: 0, y1: mmToCm(row.heightMm), z0: -mmToCm(row.diaMm) / 2, z1: mmToCm(row.diaMm) / 2, standardRole: "knob" }]
    : [{ kind: "cyl", name: row.size + " knob", x: 0, y: 0, z: 0, r: mmToCm(row.diaMm) / 2, r2: row.kind === "round" ? mmToCm(row.diaMm) * 0.35 : mmToCm(row.diaMm) / 2, h: mmToCm(row.heightMm), standardRole: "knob" }];
  return pack("cabinet-knob", "cabinet-knob", row, options, parts, {
    group, category: "hardware", standard: "cabinet knob M4", material: options.material || "chrome", finish: "polished",
    callout: "Knob " + row.size,
    matePorts: [matePort({ id: "bore", type: "axis", axis: { x: 0, y: -1, z: 0 }, diameterMm: 4, gender: "female" })],
    dimensionsMm: { dia: row.diaMm, height: row.heightMm, bore: row.bore },
  });
}

function generateEdgePull(row, options, group) {
  const L = mmToCm(row.lengthMm), W = mmToCm(row.widthMm), H = mmToCm(row.heightMm);
  const parts = [{ kind: "box", name: "edge pull " + row.size, x0: 0, x1: W, y0: 0, y1: H, z0: 0, z1: L, standardRole: "pull" }];
  return pack("edge-pull", "edge-pull", row, options, parts, {
    group, category: "hardware", standard: "edge / J pull", material: options.material || "aluminum",
    callout: "Edge pull " + row.size,
    matePorts: [matePort({ id: "mount", type: "plane", origin: { x: 0, y: H / 2, z: L / 2 }, axis: { x: -1, y: 0, z: 0 } })],
    dimensionsMm: { length: row.lengthMm, width: row.widthMm, height: row.heightMm },
  });
}

function generateFlushPull(row, options, group) {
  const L = mmToCm(row.lengthMm), W = mmToCm(row.widthMm), D = mmToCm(row.depthMm);
  const parts = [{
    kind: "ext", name: "flush pull " + row.size, axis: "y", from: -D, to: 0,
    pts: roundedRectLoop(L, W, mmToCm(4), 0, 0, 3),
    holes: [roundedRectLoop(L - mmToCm(12), W - mmToCm(12), mmToCm(3), 0, 0, 3)],
    standardRole: "pull",
  }];
  return pack("flush-pull", "flush-pull", row, options, parts, {
    group, category: "hardware", standard: "recessed flush pull", material: options.material || "aluminum",
    callout: "Flush pull " + row.size,
    matePorts: [matePort({ id: "recess", type: "plane", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 } })],
    dimensionsMm: { length: row.lengthMm, width: row.widthMm, depth: row.depthMm },
  });
}

function generateCamLock(row, options, group) {
  const boltMm = Number(options.lengthMm) || row.boltLengthsMm[1];
  const parts = [
    { kind: "cyl", name: row.size + " cam", x: 0, y: 0, z: 0, r: mmToCm(row.camDiaMm) / 2, h: mmToCm(row.camH), standardRole: "cam" },
    {
      kind: "ext", name: "connecting bolt", axis: "x",
      from: mmToCm(row.camDiaMm) / 2, to: mmToCm(row.camDiaMm) / 2 + mmToCm(boltMm),
      pts: circleLoop(0, 0, mmToCm(row.boltDiaMm) / 2, 12), standardRole: "bolt",
    },
  ];
  return pack("cam-lock", "cam-lock", row, options, parts, {
    group, lengthMm: boltMm, category: "hardware", standard: row.size, material: "zinc",
    callout: row.size + " + bolt " + boltMm + "mm",
    matePorts: [
      matePort({ id: "cam", type: "axis", diameterMm: row.camDiaMm, insertionDepthMm: row.camH }),
      matePort({ id: "bolt", type: "axis", origin: { x: mmToCm(row.camDiaMm) / 2, y: mmToCm(row.camH) / 2, z: 0 }, axis: { x: 1, y: 0, z: 0 }, diameterMm: row.boltDiaMm }),
    ],
    dimensionsMm: { camDia: row.camDiaMm, camH: row.camH, boltDia: row.boltDiaMm, boltLength: boltMm },
  });
}

function generateBrace(row, options, group) {
  const a = mmToCm(row.armMm), w = mmToCm(row.widthMm), t = mmToCm(row.thicknessMm);
  const parts = [
    { kind: "box", name: "brace leg A", x0: 0, x1: a, y0: 0, y1: t, z0: -w / 2, z1: w / 2, standardRole: "leg" },
    { kind: "box", name: "brace leg B", x0: 0, x1: t, y0: 0, y1: a, z0: -w / 2, z1: w / 2, standardRole: "leg" },
  ];
  return pack("corner-brace", "corner-brace", row, options, parts, {
    group, category: "hardware", standard: "90° corner brace", material: "steel-zinc",
    callout: "Corner brace " + row.size,
    matePorts: [
      matePort({ id: "face-a", type: "plane", origin: { x: a / 2, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 } }),
      matePort({ id: "face-b", type: "plane", origin: { x: 0, y: a / 2, z: 0 }, axis: { x: -1, y: 0, z: 0 } }),
    ],
    dimensionsMm: { arm: row.armMm, width: row.widthMm, thickness: row.thicknessMm },
  });
}

function generatePlate(row, options, group) {
  const L = mmToCm(row.lengthMm), W = mmToCm(row.widthMm), T = mmToCm(row.thicknessMm);
  const family = row.shape === "T" ? "t-plate" : "mending-plate";
  const parts = [{ kind: "box", name: row.size + " plate", x0: -L / 2, x1: L / 2, y0: 0, y1: T, z0: -W / 2, z1: W / 2, standardRole: "plate" }];
  if (row.shape === "T") {
    const stem = mmToCm(row.stemMm || 20);
    parts.push({ kind: "box", name: "T stem", x0: -stem / 2, x1: stem / 2, y0: 0, y1: T, z0: W / 2, z1: W / 2 + L / 2, standardRole: "stem" });
  }
  return pack(family, family, row, options, parts, {
    group, category: "hardware", standard: row.shape === "T" ? "T-plate" : "flat mending plate", material: "steel-zinc",
    callout: row.size + (row.shape === "T" ? " T-plate" : " mending plate"),
    matePorts: [matePort({ id: "face", type: "plane", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 } })],
    dimensionsMm: { length: row.lengthMm, width: row.widthMm, thickness: row.thicknessMm },
  });
}

function generateShelfSupport(row, options, group) {
  const parts = [
    { kind: "cyl", name: row.size, x: 0, y: 0, z: 0, r: mmToCm(row.diameterMm) / 2, h: mmToCm(row.lengthMm), standardRole: "pin" },
  ];
  if (row.padMm) {
    parts.push({ kind: "cyl", name: "pad", x: mmToCm(row.lengthMm) * 0.2, y: mmToCm(row.lengthMm), z: 0, r: mmToCm(row.padMm) / 2, h: mmToCm(1.5), standardRole: "pad" });
  }
  return pack("shelf-support", "shelf-support", row, options, parts, {
    group, category: "hardware", standard: "32mm system shelf support", material: "steel-zinc",
    callout: "Shelf support " + row.size,
    matePorts: [matePort({ id: "pin", type: "axis", diameterMm: row.diameterMm, insertionDepthMm: row.lengthMm, gender: "male" })],
    dimensionsMm: { diameter: row.diameterMm, length: row.lengthMm, style: row.style },
  });
}

function generatePipe(row, options, group, kind, standard) {
  const lengthMm = Number(options.lengthMm) || 1000;
  const lod = normalizeLod(options.lod);
  const od = mmToCm(row.odMm), id = mmToCm(pipeIdMm(row)), h = mmToCm(lengthMm);
  const segs = lodSegments(lod, 28);
  const part = lod >= 2
    ? { kind: "ext", name: row.size + " pipe", axis: "y", from: 0, to: h, pts: circleLoop(0, 0, od / 2, segs), holes: [circleLoop(0, 0, id / 2, segs)], standardRole: "pipe" }
    : { kind: "cyl", name: row.size + " pipe", x: 0, y: 0, z: 0, r: od / 2, h, standardRole: "pipe" };
  const material = options.material || (kind === "pipe-copper" ? "copper" : kind === "pipe-pvc" ? "pvc-u" : kind === "pipe-pex" ? "pex" : kind === "pipe-conduit" ? (row.kind === "pvc" ? "pvc-u" : "emt") : "galvanized");
  return pack(kind, kind, row, options, [part], {
    group, lengthMm, category: "piping", standard, material, finish: "raw",
    callout: standard + " " + row.size + " × " + lengthMm,
    matePorts: pipeEndPorts(row.odMm, pipeIdMm(row), lengthMm),
    dimensionsMm: { od: row.odMm, wall: row.wallMm, id: pipeIdMm(row), length: lengthMm, schedule: row.schedule, dn: row.dn },
  });
}

function generateElbow(row, options, group, angle) {
  const lod = normalizeLod(options.lod);
  const series = options.radius || "long-radius";
  const bend = elbowBendRadiusMm(row.odMm, series);
  const od = mmToCm(row.odMm), id = mmToCm(pipeIdMm(row)), R = mmToCm(bend);
  const segs = lodSegments(lod, 20);
  const material = options.material || "pvc-u";
  const street = !!options.street;
  const parts = lod >= 1
    ? [{
      kind: "rev", name: angle + "° elbow",
      pts: lod >= 2 ? annulusProfile(R, od / 2, id / 2, segs) : circleLoop(R, 0, od / 2, segs),
      angle, seg: Math.max(8, Math.round(angle / 6)),
      standardRole: "body",
    }]
    : [
      { kind: "cyl", name: "leg A", x: 0, y: 0, z: R, r: od / 2, h: R, standardRole: "leg" },
      { kind: "ext", name: "leg B", axis: "x", from: 0, to: R, pts: circleLoop(0, 0, od / 2, 12), standardRole: "leg" },
    ];
  const ports = [
    matePort({ id: "end-a", type: "pipe", origin: { x: 0, y: 0, z: R }, axis: { x: 0, y: 0, z: 1 }, diameterMm: row.odMm, gender: street ? "male" : "socket" }),
    matePort({ id: "end-b", type: "pipe", origin: { x: R, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, diameterMm: row.odMm, gender: "socket" }),
  ];
  const family = street ? "elbow-street" : (angle === 45 ? "elbow-45" : "elbow-90");
  return pack(family, family, row, options, parts, {
    group, category: "piping", standard: "pipe elbow " + angle + "° " + series,
    material, finish: "raw", representative: true,
    callout: row.size + " " + angle + "° " + (street ? "street " : "") + series + " elbow",
    matePorts: ports,
    dimensionsMm: { od: row.odMm, wall: row.wallMm, angle, bendRadius: bend, series },
  });
}

function generateTee(row, options, group, variant) {
  const reducing = variant === "reducing";
  const cross = variant === "cross";
  let branchRow = row;
  if (reducing) {
    branchRow = resolveBranchRow(row, options);
    if (!branchRow) return fail("unresolved-size", "Reducing tee needs a smaller branch size", { kind: "tee-reducing" });
    if (!(Number(branchRow.odMm) < Number(row.odMm))) {
      return fail("invalid-branch", "Reducing-tee branch must be smaller than the run", { kind: "tee-reducing" });
    }
  }
  const od = mmToCm(row.odMm), id = mmToCm(pipeIdMm(row));
  const branchOd = mmToCm(branchRow.odMm);
  const run = mmToCm(row.odMm * FITTING.TEE_RUN_FACTOR);
  const branch = mmToCm(branchRow.odMm * FITTING.TEE_BRANCH_FACTOR);
  const segs = 16;
  const parts = [
    { kind: "ext", name: "run", axis: "x", from: -run, to: run, pts: circleLoop(0, 0, od / 2, segs), holes: [circleLoop(0, 0, id / 2, segs)], standardRole: "run" },
    { kind: "cyl", name: "branch", x: 0, y: 0, z: 0, r: branchOd / 2, h: branch, standardRole: "branch" },
  ];
  if (cross) parts.push({ kind: "cyl", name: "branch 2", x: 0, y: -branch, z: 0, r: od / 2, h: branch, standardRole: "branch" });
  const ports = [
    matePort({ id: "run-a", type: "pipe", origin: { x: -run, y: 0, z: 0 }, axis: { x: -1, y: 0, z: 0 }, diameterMm: row.odMm, gender: "socket" }),
    matePort({ id: "run-b", type: "pipe", origin: { x: run, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, diameterMm: row.odMm, gender: "socket" }),
    matePort({ id: "branch", type: "pipe", origin: { x: 0, y: branch, z: 0 }, axis: { x: 0, y: 1, z: 0 }, diameterMm: branchRow.odMm, gender: "socket" }),
  ];
  if (cross) ports.push(matePort({ id: "branch-2", type: "pipe", origin: { x: 0, y: -branch, z: 0 }, axis: { x: 0, y: -1, z: 0 }, diameterMm: row.odMm, gender: "socket" }));
  const family = cross ? "cross-equal" : reducing ? "tee-reducing" : "tee-equal";
  const callout = reducing
    ? row.size + " × " + branchRow.size + " reducing tee"
    : row.size + (cross ? " equal cross" : " equal tee");
  return pack(family, family, row, options, parts, {
    group, category: "piping", standard: reducing ? "reducing tee" : (cross ? "equal cross" : "equal tee"),
    material: options.material || "pvc-u", finish: "raw", representative: true,
    designation: callout,
    callout,
    matePorts: ports,
    dimensionsMm: {
      odMm: row.odMm, wallMm: row.wallMm, branchOdMm: branchRow.odMm, branchSize: branchRow.size,
    },
  });
}

function resolveBranchRow(run, options) {
  const key = options.branchKey || options.branchSize;
  if (key) {
    return lookupSize(PVC_D1785, key) || lookupSize(COPPER_EN1057, key) || lookupSize(STEEL_EN10255, key);
  }
  const next = reducingBranchRows(run, PVC_D1785)[0] || reducingBranchRows(run, STEEL_EN10255)[0];
  return next && next.row;
}

function generateCoupling(row, options, group, family) {
  const od = mmToCm(row.odMm * FITTING.SOCKET_OD_FACTOR), id = mmToCm(row.odMm), h = mmToCm(row.odMm * FITTING.SOCKET_LENGTH_FACTOR);
  const segs = 16;
  const part = {
    kind: "ext", name: family, axis: "y", from: 0, to: h,
    pts: circleLoop(0, 0, od / 2, segs), holes: [circleLoop(0, 0, id / 2, segs)],
    standardRole: "body",
  };
  const thread = family === "adapter-thread" ? (options.thread || "BSPT") : null;
  return pack(family, family, row, options, [part], {
    group, category: "piping", standard: family, material: options.material || "pvc-u", finish: "raw",
    representative: true,
    callout: row.size + " " + family.replace(/-/g, " "),
    matePorts: pipeEndPorts(row.odMm, pipeIdMm(row), row.odMm * FITTING.SOCKET_LENGTH_FACTOR, thread),
    dimensionsMm: { od: row.odMm, wall: row.wallMm, thread },
  });
}

function generateReducer(row, options, group, family) {
  const large = row;
  const smallOd = Number(options.smallOdMm) || large.odMm * FITTING.REDUCER_SMALL_OD_FACTOR;
  const h = mmToCm(large.odMm * FITTING.REDUCER_LENGTH_FACTOR);
  const eccentric = family === "reducer-eccentric";
  const parts = [{
    kind: "cyl", name: family, x: 0, y: 0, z: eccentric ? mmToCm((large.odMm - smallOd) / 4) : 0,
    r: mmToCm(large.odMm) / 2, r2: mmToCm(smallOd) / 2, h, standardRole: "body",
  }];
  return pack(family, family, row, options, parts, {
    group, category: "piping", standard: family, material: options.material || "pvc-u", finish: "raw",
    representative: true,
    callout: row.size + " → Ø" + Math.round(smallOd) + " " + family.replace(/-/g, " "),
    matePorts: [
      matePort({ id: "large", type: "pipe", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 }, diameterMm: large.odMm, gender: "socket" }),
      matePort({ id: "small", type: "pipe", origin: { x: 0, y: h, z: 0 }, axis: { x: 0, y: 1, z: 0 }, diameterMm: smallOd, gender: "socket" }),
    ],
    dimensionsMm: { odLarge: large.odMm, odSmall: smallOd },
  });
}

function generateCap(row, options, group, family) {
  const od = mmToCm(row.odMm * (family === "plug" ? 1 : FITTING.CAP_OD_FACTOR));
  const h = mmToCm(row.odMm * FITTING.CAP_LENGTH_FACTOR);
  const parts = family === "plug"
    ? [{ kind: "cyl", name: "plug", x: 0, y: 0, z: 0, r: mmToCm(row.odMm) / 2, h, standardRole: "plug" }]
    : [{ kind: "ext", name: "cap", axis: "y", from: 0, to: h, pts: circleLoop(0, 0, od / 2, 16), holes: [circleLoop(0, 0, mmToCm(row.odMm) / 2, 14)], standardRole: "cap" }];
  return pack(family, family, row, options, parts, {
    group, category: "piping", standard: family, material: options.material || "pvc-u", finish: "raw",
    representative: true,
    callout: row.size + " " + family,
    matePorts: [matePort({ id: "end", type: "pipe", diameterMm: row.odMm, gender: family === "plug" ? "male" : "socket" })],
    dimensionsMm: { od: row.odMm },
  });
}

function generateFlange(row, options, group, standard) {
  const t = mmToCm(row.thicknessMm);
  const segs = 24;
  const holes = [circleLoop(0, 0, mmToCm(row.boreMm) / 2, 18)];
  if (normalizeLod(options.lod) >= 2) {
    for (let i = 0; i < row.holes; i++) {
      const a = (i / row.holes) * Math.PI * 2;
      const r = mmToCm(row.pcdMm) / 2;
      holes.push(circleLoop(Math.cos(a) * r, Math.sin(a) * r, mmToCm(row.holeDiaMm) / 2, 10));
    }
  }
  const parts = [{
    kind: "ext", name: row.size + " flange", axis: "y", from: 0, to: t,
    pts: circleLoop(0, 0, mmToCm(row.odMm) / 2, segs), holes, standardRole: "flange",
  }];
  return pack("flange", "flange", row, options, parts, {
    group, category: "piping", standard, material: options.material || "steel", finish: "raw",
    series: options.series || null,
    callout: standard + " " + row.size + " flange",
    matePorts: [
      matePort({ id: "face", type: "plane", origin: { x: 0, y: t, z: 0 }, axis: { x: 0, y: 1, z: 0 }, diameterMm: row.odMm }),
      matePort({ id: "bore", type: "pipe", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 }, diameterMm: row.boreMm, gender: "socket" }),
    ],
    dimensionsMm: { od: row.odMm, pcd: row.pcdMm, thickness: row.thicknessMm, holes: row.holes, holeDia: row.holeDiaMm, bore: row.boreMm },
  });
}

function generateValve(row, options, group, family) {
  const od = mmToCm(row.odMm), L = mmToCm(row.odMm * FITTING.VALVE_LENGTH_FACTOR), H = mmToCm(row.odMm * FITTING.VALVE_HEIGHT_FACTOR);
  const parts = [
    { kind: "cyl", name: family + " body", x: 0, y: 0, z: 0, r: od * FITTING.VALVE_BODY_FACTOR, h: L, standardRole: "body" },
    { kind: "cyl", name: "bonnet", x: 0, y: L / 2, z: 0, r: od * FITTING.VALVE_BONNET_FACTOR, h: H, standardRole: "bonnet" },
  ];
  if (family === "valve-ball") {
    parts.push({ kind: "box", name: "handle", x0: -mmToCm(8), x1: mmToCm(row.odMm * 1.8), y0: L / 2 + H, y1: L / 2 + H + mmToCm(4), z0: -mmToCm(3), z1: mmToCm(3), standardRole: "handle" });
  }
  return pack(family, family, row, options, parts, {
    group, category: "piping", standard: family.replace("valve-", "") + " valve", material: options.material || "brass", finish: "raw",
    representative: true,
    callout: row.size + " " + family.replace("valve-", "") + " valve",
    matePorts: pipeEndPorts(row.odMm, pipeIdMm(row), row.odMm * FITTING.VALVE_LENGTH_FACTOR),
    dimensionsMm: { od: row.odMm, length: row.odMm * 2.4 },
  });
}

const PIPE_STOCK = {
  "pipe-copper": { table: COPPER_EN1057, standard: "EN 1057", fallback: COPPER_ASTM_B88 },
  "pipe-pvc": { table: PVC_D1785, standard: "ISO 1452 / ASTM D1785" },
  "pipe-pex": { table: PEX_ISO15875, standard: "ISO 15875 / ASTM F876" },
  "pipe-steel": { table: STEEL_EN10255, standard: "EN 10255 / ISO 65" },
  "pipe-conduit": { table: CONDUIT, standard: "EMT / EN 61386" },
};

function pipeRow(kind, options) {
  const stock = PIPE_STOCK[kind] || PIPE_STOCK["pipe-pvc"];
  const key = options.sizeKey || options.size;
  const row = lookupSize(stock.table, key)
    || (stock.fallback && lookupSize(stock.fallback, key));
  if (row) return row;
  if (!key) return stock.table[Object.keys(stock.table)[0]] || null;
  return null;
}

function fittingRow(options) {
  const key = options.sizeKey || options.size;
  if (!key) return null;
  return lookupSize(PVC_D1785, key) || lookupSize(COPPER_EN1057, key) || lookupSize(STEEL_EN10255, key);
}

function flangeLookup(options) {
  const key = options.sizeKey || options.size;
  const series = options.series;
  if (series === "CL150") {
    const row = lookupSize(FLANGE_CL150, key);
    return row ? { row, standard: "ASME B16.5 Class 150", series: "CL150" } : null;
  }
  if (series === "PN16") {
    const row = lookupSize(FLANGE_PN16, key);
    return row ? { row, standard: "ISO 7005 PN16", series: "PN16" } : null;
  }
  if (key && FLANGE_PN16[key]) return { row: FLANGE_PN16[key], standard: "ISO 7005 PN16", series: "PN16" };
  if (key && FLANGE_CL150[key]) return { row: FLANGE_CL150[key], standard: "ASME B16.5 Class 150", series: "CL150" };
  const pn = lookupSize(FLANGE_PN16, key);
  const cl = lookupSize(FLANGE_CL150, key);
  if (pn && !cl) return { row: pn, standard: "ISO 7005 PN16", series: "PN16" };
  if (cl && !pn) return { row: cl, standard: "ASME B16.5 Class 150", series: "CL150" };
  return null;
}

export function generateToolboxPart(options = {}) {
  const kind = options.kind || "shcs";
  if ((kind === "hex-screw" || kind === "hex-bolt") && !options.threadMode) {
    options = Object.assign({}, options, { threadMode: "modeled" });
  }
  const group = groupId(options, kind);
  const go = (table, fallbackKey, fn) => {
    const requested = options.sizeKey || options.size;
    const resolvedKey = lookupSizeKey(table, requested);
    let row = resolvedKey ? table[resolvedKey] : lookupSize(table, requested);
    let key = resolvedKey || requested;
    if (!row && !requested && fallbackKey) {
      key = fallbackKey;
      row = table[fallbackKey];
    }
    if (!row) return fail("unresolved-size", "Size " + (requested || "(none)") + " is not in the " + kind + " table", { kind });
    return fn(row, Object.assign({}, options, { sizeKey: key || row.size }), group);
  };
  switch (kind) {
    case "shcs": return go(ISO4762_SHCS, "M8", generateShcs);
    case "hex-screw": return go(ISO4017_HEX, "M8", (row, o, g) => generateHexScrew(row, o, g, false));
    case "hex-bolt": return go(ISO4017_HEX, "M8", (row, o, g) => generateHexScrew(row, o, g, true));
    case "csink-socket": return go(ISO10642_CSINK, "M6", generateCsinkSocket);
    case "button-socket": return go(ISO7380_BUTTON, "M6", generateButton);
    case "pan-screw": return go(ISO7045_PAN, "M5", generatePan);
    case "csink-machine": return go(ISO7046_CSINK_MACHINE, "M5", generateMachineCsink);
    case "wood-screw": return go(DIN7997_WOOD, "4.0", generateWoodScrew);
    case "lag-bolt": return go(DIN571_LAG, "M8", generateLag);
    case "set-flat": return go(ISO4026_SET, "M6", (row, o, g) => generateSetScrew(row, o, g, "flat"));
    case "set-cone": return go(ISO4026_SET, "M6", (row, o, g) => generateSetScrew(row, o, g, "cone"));
    case "set-cup": return go(ISO4026_SET, "M6", (row, o, g) => generateSetScrew(row, o, g, "cup"));
    case "hex-nut": return go(ISO4032_NUT, "M8", (row, o, g) => generateHexNut(row, o, g, "hex-nut", "ISO 4032:2023"));
    case "jam-nut": return go(ISO4035_JAM, "M8", (row, o, g) => generateHexNut(row, o, g, "jam-nut", "ISO 4035:2023"));
    case "nyloc-nut": return go(ISO7040_NYLOC, "M8", (row, o, g) => generateHexNut(row, o, g, "nyloc-nut", "ISO 7040:2012"));
    case "flange-nut": return go(ISO4161_FLANGE, "M8", (row, o, g) => generateHexNut(row, o, g, "flange-nut", "ISO 4161:2012"));
    case "wing-nut": return go(DIN315_WING, "M8", generateWingNut);
    case "acorn-nut": return go(DIN1587_ACORN, "M8", generateAcorn);
    case "t-nut": return go(TNUT_WOOD, "M6", generateTNut);
    case "tslot-nut": return go(TSLOT_NUT, "2020-M5", generateTslot);
    case "washer-flat": return go(ISO7089_WASHER, "M8", (row, o, g) => generateWasher(row, o, g, "washer-flat", "ISO 7089:2000"));
    case "washer-fender": return go(ISO7093_FENDER, "M8", (row, o, g) => generateWasher(row, o, g, "washer-fender", "ISO 7093:2000"));
    case "washer-lock": return go(DIN127_LOCK, "M8", (row, o, g) => generateWasher(row, o, g, "washer-lock", "DIN 127B"));
    case "washer-csink": return go(CSINK_FINISH_WASHER, "M6", (row, o, g) => generateWasher(row, o, g, "washer-csink", "finishing washer"));
    case "bushing": return go(PLAIN_BUSHING, "M8", generateBushing);
    case "nail-wire": return go(DIN1151_NAIL, "2.5x50", (row, o, g) => generateNail(row, o, g, "nail-wire", "DIN 1151 / ASTM F1667"));
    case "nail-brad": return go(BRAD_NAIL, "18GA-32", (row, o, g) => generateNail(row, o, g, "nail-brad", "brad / finishing nail"));
    case "nail-drywall": return go(DRYWALL_SCREW, "3.5x35", (row, o, g) => generateNail(row, o, g, "nail-drywall", "bugle drywall screw"));
    case "nail-concrete": return go(CONCRETE_NAIL, "3.0x40", (row, o, g) => generateNail(row, o, g, "nail-concrete", "fluted concrete pin"));
    case "pin-dowel-steel": return go(ISO2338_PIN, "6x24", (row, o, g) => generateNail(row, o, g, "pin-dowel-steel", "ISO 2338"));
    case "pin-dowel-wood": return go(WOOD_DOWEL, "8x40", (row, o, g) => generateNail(row, o, g, "pin-dowel-wood", "fluted beech dowel"));
    case "euro-hinge": return generateEuroHinge(options, group);
    case "butt-hinge": return go(BUTT_HINGE, "100", generateButtHinge);
    case "piano-hinge": return generatePianoHinge(options, group);
    case "drawer-slide": return generateSlide(options, group, false);
    case "undermount-slide": return generateSlide(options, group, true);
    case "bar-pull": return go(BAR_PULL, "128", generateBarPull);
    case "cabinet-knob": return go(CABINET_KNOB, "round-30", generateKnob);
    case "edge-pull": return go(EDGE_PULL, "80", generateEdgePull);
    case "flush-pull": return go(FLUSH_PULL, "90x45", generateFlushPull);
    case "cam-lock": return go(CAM_LOCK, "minifix", generateCamLock);
    case "corner-brace": return go(CORNER_BRACE, "40", generateBrace);
    case "mending-plate": return go(MENDING_PLATE, "80x16", generatePlate);
    case "t-plate": return go(MENDING_PLATE, "t-80", generatePlate);
    case "shelf-support": return go(SHELF_SUPPORT, "spoon-5", generateShelfSupport);
    case "pipe-copper":
    case "pipe-pvc":
    case "pipe-pex":
    case "pipe-steel":
    case "pipe-conduit": {
      const stock = PIPE_STOCK[kind];
      const row = pipeRow(kind, options);
      if (!row) return fail("unresolved-size", "Size " + (options.sizeKey || options.size || "(none)") + " is not in the " + kind + " table", { kind });
      const resolvedKey = Object.keys(stock.table).find((key) => stock.table[key] === row)
        || (stock.fallback && Object.keys(stock.fallback).find((key) => stock.fallback[key] === row))
        || options.sizeKey || options.size || row.size;
      return generatePipe(row, Object.assign({}, options, { sizeKey: resolvedKey }), group, kind, stock.standard);
    }
    case "elbow-90":
    case "elbow-45":
    case "elbow-street": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateElbow(row, kind === "elbow-street" ? Object.assign({}, options, { street: true }) : options, group, kind === "elbow-45" ? 45 : 90);
    }
    case "tee-equal": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateTee(row, options, group, "equal");
    }
    case "tee-reducing": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateTee(row, options, group, "reducing");
    }
    case "cross-equal": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateTee(row, options, group, "cross");
    }
    case "coupling":
    case "adapter-thread":
    case "union": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateCoupling(row, options, group, kind);
    }
    case "reducer-concentric":
    case "reducer-eccentric":
    case "bushing-reducer": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateReducer(row, options, group, kind);
    }
    case "cap":
    case "plug": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateCap(row, options, group, kind);
    }
    case "flange": {
      const found = flangeLookup(options);
      if (!found) return fail("unresolved-size", "Flange " + (options.sizeKey || options.size || "") + (options.series ? " / " + options.series : "") + " is not in the selected series", { kind });
      return generateFlange(found.row, Object.assign({}, options, { series: found.series }), group, found.standard);
    }
    case "valve-ball":
    case "valve-gate":
    case "valve-check": {
      const row = fittingRow(options);
      if (!row) return fail("unresolved-size", "Unknown fitting size " + (options.sizeKey || options.size), { kind });
      return generateValve(row, options, group, kind);
    }
    default: return fail("unknown-kind", "Unknown toolbox family: " + kind, { kind });
  }
}

export {
  ISO4762_SHCS, ISO4017_HEX, ISO4032_NUT, PREFERRED_LENGTHS_MM, IMPERIAL_LENGTHS_MM,
  preferredLengthFor, EURO_HINGE, DRAWER_SLIDE, BAR_PULL, PIPE_LENGTHS_MM, PIPE_STOCK,
};
