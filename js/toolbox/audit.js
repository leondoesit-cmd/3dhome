// Table-driven standards audit for toolbox declarations. Geometry of ISO 4017
// hex screws is still measured by cad_standards.js; everything else is checked
// against the installed millimetre pack so a wrong head height cannot pass.

import { near, lookupSize } from "./geom.js";
import { ANSI_TYPE_A_NARROW, ANSI_HEX_MACHINE_NUT, ANSI_PAN_CROSS } from "./ansi_machine_tables.js";
import { canonicalDimensionsMm } from "./schema.js";
import { TOOLBOX_KINDS } from "./catalog.js";
import {
  ISO4762_SHCS, ISO4017_HEX, ISO4032_NUT, ISO4035_JAM, ISO7040_NYLOC, ISO4161_FLANGE,
  ISO7089_WASHER, ISO7093_FENDER, DIN127_LOCK, ISO10642_CSINK, ISO7380_BUTTON,
  ISO7045_PAN, ISO7046_CSINK_MACHINE, ISO4026_SET, TNUT_WOOD, TSLOT_NUT, PLAIN_BUSHING,
  METRIC_COARSE_PITCH,
} from "./fastener_tables.js";
import { COPPER_EN1057, COPPER_ASTM_B88, PVC_D1785, PEX_ISO15875, STEEL_EN10255, FLANGE_PN16, FLANGE_CL150 } from "./pipe_tables.js";
import { EURO_HINGE } from "./hardware_tables.js";

const PACKS = {
  "ansi-pan-cross": {table:ANSI_PAN_CROSS,standard:"ASME B18.6.3",fields:{diameterMm:"diameterMm",pitchMm:"pitchMm",headDiaMm:"headDiaMm",headHeightMm:"headHeightMm"}},
  "ansi-hex-machine-nut": {table:ANSI_HEX_MACHINE_NUT,standard:"ASME B18.6.3",fields:{diameterMm:"diameterMm",pitchMm:"pitchMm",acrossFlatsMm:"af",headHeightMm:"h"}},
  "ansi-washer-narrow": {table:ANSI_TYPE_A_NARROW,standard:"ASME B18.21.1",fields:{idMm:"idMm",odMm:"odMm",thicknessMm:"h"}},
  shcs: { table: ISO4762_SHCS, standard: "ISO 4762:2018", aliases: ["ISO 4762:2018", "ISO 4762", "DIN 912"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", headDiaMm: "headDiaMm", headHeightMm: "headHeightMm", acrossFlatsMm: "hexAfMm" } },
  "hex-screw": { table: ISO4017_HEX, standard: "ISO 4017:2022", aliases: ["ISO 4017:2022", "ISO 4017", "DIN 933"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", acrossFlatsMm: "af", headHeightMm: "h" } },
  "hex-bolt": { table: ISO4017_HEX, standard: "ISO 4014:2022", aliases: ["ISO 4014:2022", "ISO 4014", "DIN 931"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", acrossFlatsMm: "af", headHeightMm: "h" } },
  "hex-nut": { table: ISO4032_NUT, standard: "ISO 4032:2023", aliases: ["ISO 4032:2023", "ISO 4032", "DIN 934"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", acrossFlatsMm: "af", headHeightMm: "h" } },
  "jam-nut": { table: ISO4035_JAM, standard: "ISO 4035:2023", aliases: ["ISO 4035:2023", "ISO 4035", "DIN 439"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", acrossFlatsMm: "af", headHeightMm: "h" } },
  "nyloc-nut": { table: ISO7040_NYLOC, standard: "ISO 7040:2012", aliases: ["ISO 7040:2012", "ISO 7040", "DIN 985"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", acrossFlatsMm: "af", headHeightMm: "h" } },
  "flange-nut": { table: ISO4161_FLANGE, standard: "ISO 4161:2012", aliases: ["ISO 4161:2012", "ISO 4161", "DIN 6923"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", acrossFlatsMm: "af", headHeightMm: "h" } },
  "csink-socket": { table: ISO10642_CSINK, standard: "ISO 10642:2019", aliases: ["ISO 10642:2019", "ISO 10642", "DIN 7991"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", headDiaMm: "headDiaMm", headHeightMm: "headHeightMm" } },
  "button-socket": { table: ISO7380_BUTTON, standard: "ISO 7380-1:2022", aliases: ["ISO 7380-1:2022", "ISO 7380-1"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", headDiaMm: "headDiaMm", headHeightMm: "headHeightMm" } },
  "pan-screw": { table: ISO7045_PAN, standard: "ISO 7045:2011", aliases: ["ISO 7045:2011", "ISO 7045"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", headDiaMm: "headDiaMm", headHeightMm: "headHeightMm" } },
  "csink-machine": { table: ISO7046_CSINK_MACHINE, standard: "ISO 7046:2011", aliases: ["ISO 7046:2011", "ISO 7046"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm", headDiaMm: "headDiaMm", headHeightMm: "headHeightMm" } },
  "set-flat": { table: ISO4026_SET, standard: "ISO 4026:2003", aliases: ["ISO 4026:2003", "ISO 4026", "DIN 913"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm" } },
  "set-cone": { table: ISO4026_SET, standard: "ISO 4027:2003", aliases: ["ISO 4027:2003", "ISO 4027"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm" } },
  "set-cup": { table: ISO4026_SET, standard: "ISO 4029:2003", aliases: ["ISO 4029:2003", "ISO 4029"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm" } },
  "t-nut": { table: TNUT_WOOD, standard: "T-nut (4-prong)", aliases: ["T-nut (4-prong)", "wood T-nut"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm" } },
  "tslot-nut": { table: TSLOT_NUT, standard: "T-slot nut", aliases: ["T-slot nut", "extrusion T-nut"], fields: { diameterMm: "diameterMm", pitchMm: "pitchMm" } },
  "washer-flat": { table: ISO7089_WASHER, standard: "ISO 7089:2000", aliases: ["ISO 7089:2000", "ISO 7089", "DIN 125A"], fields: { idMm: "idMm", odMm: "odMm", thicknessMm: "h" } },
  "washer-fender": { table: ISO7093_FENDER, standard: "ISO 7093:2000", aliases: ["ISO 7093:2000", "ISO 7093", "DIN 9021"], fields: { idMm: "idMm", odMm: "odMm", thicknessMm: "h" } },
  "washer-lock": { table: DIN127_LOCK, standard: "DIN 127B", aliases: ["DIN 127B", "DIN 127"], fields: { idMm: "idMm", odMm: "odMm", thicknessMm: "h" } },
  bushing: { table: PLAIN_BUSHING, standard: "plain bushing", aliases: ["plain bushing"], fields: { innerMm: "innerMm", outerMm: "outerMm" } },
  "pipe-pvc": { table: PVC_D1785, standard: "ISO 1452 / ASTM D1785", aliases: ["ISO 1452 / ASTM D1785", "ASTM D1785", "ISO 1452"], fields: { odMm: "odMm", wallMm: "wallMm" } },
  "pipe-copper": { table: Object.assign({}, COPPER_EN1057, COPPER_ASTM_B88), standard: "EN 1057", aliases: ["EN 1057", "ASTM B88"], fields: { odMm: "odMm", wallMm: "wallMm" } },
  "pipe-pex": { table: PEX_ISO15875, standard: "ISO 15875 / ASTM F876", aliases: ["ISO 15875 / ASTM F876", "ISO 15875"], fields: { odMm: "odMm", wallMm: "wallMm" } },
  "pipe-steel": { table: STEEL_EN10255, standard: "EN 10255 / ISO 65", aliases: ["EN 10255 / ISO 65", "EN 10255", "ISO 65"], fields: { odMm: "odMm", wallMm: "wallMm" } },
  flange: { table: Object.assign({}, FLANGE_PN16, FLANGE_CL150), standard: "ISO 7005 PN16", aliases: ["ISO 7005 PN16", "ISO 7005", "ASME B16.5 Class 150", "ASME B16.5"], fields: { odMm: "odMm", pcdMm: "pcdMm", thicknessMm: "thicknessMm", holes: "holes", holeDiaMm: "holeDiaMm", boreMm: "boreMm" } },
};

function issue(code, message, field, severity = "error") {
  return { code, message, field, severity };
}

function report(standard, issues, computed = {}) {
  return {
    ok: issues.every((row) => row.severity !== "error"),
    standard,
    edition: standard && String(standard).split(":")[1] || null,
    status: computed.status || (issues.some((row) => row.severity === "error") ? "noncompliant" : "compliant"),
    issues,
    computed,
  };
}

function normalizeStandardId(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([A-Z]{1,6}(?:\/[A-Z]+)?(?:\s+[0-9]+(?:-[0-9]+)?)?)/i);
  const edition = (text.match(/:(\d{4})\b/) || [])[1] || null;
  return { id: (match ? match[1] : text).replace(/\s+/g, " ").trim().toUpperCase(), edition, raw: text };
}

function standardAccepted(declared, pack) {
  if (!declared || !pack) return false;
  const aliases = pack.aliases || [pack.standard];
  if (aliases.indexOf(declared) >= 0) return true;
  const got = normalizeStandardId(declared);
  return aliases.some((alias) => {
    const want = normalizeStandardId(alias);
    if (got.id !== want.id) return false;
    if (want.edition && got.edition && want.edition !== got.edition) return false;
    if (want.edition && !got.edition) return false;
    return true;
  });
}

function readDim(spec, dims, field) {
  if (spec[field] != null) return spec[field];
  if (dims[field] != null) return dims[field];
  if (spec.dimensionsMm && spec.dimensionsMm[field] != null) return spec.dimensionsMm[field];
  if (field === "acrossFlatsMm") {
    return spec.headAcrossFlatsMm != null ? spec.headAcrossFlatsMm : (dims.headAcrossFlatsMm != null ? dims.headAcrossFlatsMm : null);
  }
  return null;
}

export function isToolboxFamily(family) {
  if (!family) return false;
  if (family === "plain-bushing") return true;
  return TOOLBOX_KINDS.indexOf(family) >= 0 || !!PACKS[family];
}

export function validateToolboxSpec(spec = {}) {
  const family = spec.family === "plain-bushing" ? "bushing" : (spec.family || "");
  if (!family) return report(spec.standard, [issue("missing-family", "Toolbox declaration has no family", "family")], { status: "noncompliant" });
  if (!isToolboxFamily(family)) {
    return report(spec.standard || null, [issue("unsupported-standard", "No verified validator is installed for this standard", "standard")], { family, status: "unsupported" });
  }
  const pack = PACKS[family];
  if (!pack) {
    if (family === "euro-hinge") return validateEuroHinge(spec);
    const issues = [];
    if (spec.representative) issues.push(issue("representative-geometry", "Geometry is a representative placeholder, not a published take-out", "standard", "info"));
    else issues.push(issue("not-audited", "Family is catalogued but has no dimensional pack", "standard", "info"));
    return report(spec.standard || null, issues, { family, status: "not-audited" });
  }
  const issues = [];
  if (!spec.standard) issues.push(issue("missing-standard", "Toolbox part must declare a standard", "standard"));
  const size = spec.sizeKey || spec.nominalSize || spec.size || "";
  if (!size) issues.push(issue("missing-size", "Toolbox part must declare a nominal size", "nominalSize"));
  const row = size ? lookupSize(pack.table, size) : null;
  if (size && !row) issues.push(issue("table-pack", "Size is not in the installed " + pack.standard + " pack", "nominalSize"));
  if (spec.standard && !standardAccepted(spec.standard, pack) && !(row && row.standard && spec.standard === row.standard)) {
    issues.push(issue("wrong-standard", "Declared standard must be " + pack.standard, "standard"));
  }
  const dims = canonicalDimensionsMm(spec.dimensionsMm, spec);
  if (row) {
    Object.keys(pack.fields).forEach((field) => {
      const expected = row[pack.fields[field]];
      const actual = readDim(spec, dims, field);
      if (actual == null) {
        issues.push(issue("missing-dimension", field + " is required for " + pack.standard + " " + row.size, field));
        return;
      }
      if (!near(actual, expected, 1e-3)) issues.push(issue("dimension-mismatch", field + " must be " + expected + " mm for " + row.size, field));
    });
    const pitch = spec.pitchMm != null ? spec.pitchMm : dims.pitchMm;
    const expectedPitch = METRIC_COARSE_PITCH[row.size];
    if (expectedPitch && pitch != null && !near(pitch, expectedPitch, 1e-6) && spec.series !== "fine" && !row.imperial) {
      issues.push(issue("wrong-coarse-pitch", row.size + " coarse pitch must be " + expectedPitch + " mm", "pitchMm"));
    }
  }
  if (spec.representative) issues.push(issue("representative-geometry", "Published dimensional envelope only; detailed driver/thread form is representative", "standard", "warning"));
  return report(spec.standard || pack.standard, issues, { pack: pack.standard, size: row && row.size, family, ...(spec.representative ? {status:"representative"} : {}) });
}

function validateEuroHinge(spec) {
  const issues = [];
  if (!spec.standard) issues.push(issue("missing-standard", "Euro hinge must declare EN 15570 / 32mm system", "standard"));
  const dims = canonicalDimensionsMm(spec.dimensionsMm, spec);
  if (dims.cupDiaMm != null && !near(dims.cupDiaMm, EURO_HINGE.cupDiaMm, 1e-3)) {
    issues.push(issue("dimension-mismatch", "Cup diameter must be 35 mm", "cupDiaMm"));
  } else if (dims.cupDiaMm == null) {
    issues.push(issue("missing-dimension", "cupDiaMm is required", "cupDiaMm"));
  }
  if (dims.plateHoleSpacingMm != null && !near(dims.plateHoleSpacingMm, EURO_HINGE.plateHoleSpacingMm, 1e-3)) {
    issues.push(issue("dimension-mismatch", "Mounting plate pitch must be 32 mm", "plateHoleSpacingMm"));
  }
  return report(spec.standard || "EN 15570 / 32mm system", issues, { family: "euro-hinge" });
}

export { PACKS };
