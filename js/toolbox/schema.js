// Standard-part metadata, mate ports, materials and finishes.
// Every generated toolbox item carries this record so the auditor, BOM and
// mate solver can read a declaration instead of guessing from the mesh.

import { mmToCm, normalizeLod } from "./geom.js";

export const TOOLBOX_CATEGORIES = Object.freeze(["fastener", "hardware", "piping"]);

export const TOOLBOX_MATERIALS = Object.freeze({
  "steel-8.8-zinc": { id: "steel-8.8-zinc", name: "Steel 8.8 Zinc", color: "#aeb7c2", metal: 0.55, rough: 0.38, density: 7.85 },
  "steel-10.9-black": { id: "steel-10.9-black", name: "Steel 10.9 Black Oxide", color: "#3a3d40", metal: 0.62, rough: 0.42, density: 7.85 },
  "steel-zinc": { id: "steel-zinc", name: "Steel Zinc Plated", color: "#b4bcc6", metal: 0.5, rough: 0.4, density: 7.85 },
  "a2-70": { id: "a2-70", name: "Stainless Steel A2-70", color: "#c5ccd4", metal: 0.72, rough: 0.28, density: 7.9 },
  "a4-80": { id: "a4-80", name: "Stainless Steel A4-80", color: "#b8c0c8", metal: 0.74, rough: 0.26, density: 8.0 },
  brass: { id: "brass", name: "Brass", color: "#c4a35a", metal: 0.65, rough: 0.28, density: 8.5 },
  copper: { id: "copper", name: "Copper CW024A", color: "#b87333", metal: 0.85, rough: 0.22, density: 8.96 },
  "pvc-u": { id: "pvc-u", name: "PVC-U", color: "#d8d4cc", metal: 0.04, rough: 0.45, density: 1.4 },
  cpvc: { id: "cpvc", name: "CPVC", color: "#e8dcc8", metal: 0.04, rough: 0.42, density: 1.55 },
  pex: { id: "pex", name: "PEX", color: "#c45c5c", metal: 0.02, rough: 0.5, density: 0.94 },
  "pex-blue": { id: "pex-blue", name: "PEX (cold)", color: "#3b6ea8", metal: 0.02, rough: 0.5, density: 0.94 },
  nylon: { id: "nylon", name: "Nylon PA66", color: "#2a2a2c", metal: 0.04, rough: 0.48, density: 1.14 },
  zinc: { id: "zinc", name: "Zinc die-cast", color: "#9aa3ad", metal: 0.45, rough: 0.4, density: 6.6 },
  aluminum: { id: "aluminum", name: "Aluminum 6063", color: "#8fb8c4", metal: 0.7, rough: 0.32, density: 2.7 },
  beech: { id: "beech", name: "Beechwood", color: "#d2b48c", metal: 0.02, rough: 0.7, density: 0.72 },
  steel: { id: "steel", name: "Steel", color: "#aeb7c2", metal: 0.55, rough: 0.38, density: 7.85 },
  phosphate: { id: "phosphate", name: "Phosphate steel", color: "#4a4e46", metal: 0.35, rough: 0.55, density: 7.85 },
  chrome: { id: "chrome", name: "Polished chrome", color: "#d6dbde", metal: 0.95, rough: 0.1, density: 7.85 },
  "nickel-brushed": { id: "nickel-brushed", name: "Brushed nickel", color: "#b9c0c4", metal: 0.85, rough: 0.32, density: 8.9 },
  "matte-black": { id: "matte-black", name: "Matte black", color: "#2b2e30", metal: 0.5, rough: 0.55, density: 7.85 },
  galvanized: { id: "galvanized", name: "Galvanized steel", color: "#9aa39a", metal: 0.48, rough: 0.42, density: 7.85 },
  emt: { id: "emt", name: "EMT steel", color: "#c4b89a", metal: 0.4, rough: 0.45, density: 7.85 },
});

export const TOOLBOX_FINISHES = Object.freeze({
  "zinc-plated": "Zinc Plated",
  "black-oxide": "Black Oxide",
  raw: "Raw",
  polished: "Polished Chrome",
  "brushed-nickel": "Brushed Nickel",
  phosphate: "Phosphate",
  galvanized: "Galvanized",
  none: "Raw",
});

export function materialAppearance(id) {
  const row = TOOLBOX_MATERIALS[id] || TOOLBOX_MATERIALS["steel-8.8-zinc"];
  return { color: row.color, metal: row.metal, rough: row.rough, materialName: row.name, materialId: row.id };
}

export function paint(part, materialId) {
  return Object.assign(part, materialAppearance(materialId));
}

export function matePort(options = {}) {
  const origin = options.origin || { x: 0, y: 0, z: 0 };
  const axis = options.axis || { x: 0, y: 1, z: 0 };
  return {
    id: options.id || "port",
    type: options.type || "axis",
    origin: { x: Number(origin.x) || 0, y: Number(origin.y) || 0, z: Number(origin.z) || 0 },
    axis: { x: Number(axis.x) || 0, y: Number(axis.y) || 0, z: Number(axis.z) || 0 },
    diameterMm: options.diameterMm != null ? Number(options.diameterMm) : null,
    insertionDepthMm: options.insertionDepthMm != null ? Number(options.insertionDepthMm) : null,
    gender: options.gender || null,
    thread: options.thread || null,
    system: options.system || null,
    pitchMm: options.pitchMm != null ? Number(options.pitchMm) : null,
  };
}

export function fastenerAxisPorts(diameterMm, lengthMm, pitchMm) {
  const h = mmToCm(lengthMm);
  return [
    matePort({ id: "tip", type: "axis", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, diameterMm, insertionDepthMm: lengthMm, gender: "male", thread: "ISO-metric", pitchMm }),
    matePort({ id: "head-seat", type: "plane", origin: { x: 0, y: h, z: 0 }, axis: { x: 0, y: 1, z: 0 }, diameterMm }),
  ];
}

export function pipeEndPorts(odMm, idMm, lengthMm, thread) {
  const h = mmToCm(lengthMm);
  const spec = { diameterMm: odMm, gender: "spigot", thread: thread || null, system: "pipe" };
  return [
    matePort({ id: "end-a", type: "pipe", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: -1, z: 0 }, ...spec, insertionDepthMm: 0 }),
    matePort({ id: "end-b", type: "pipe", origin: { x: 0, y: h, z: 0 }, axis: { x: 0, y: 1, z: 0 }, ...spec, insertionDepthMm: 0 }),
  ];
}

export function standardPartMetadata(options = {}) {
  const dimensionsMm = canonicalDimensionsMm(options.dimensionsMm);
  const material = options.material || "steel-8.8-zinc";
  const stock = TOOLBOX_MATERIALS[material] || TOOLBOX_MATERIALS["steel-8.8-zinc"];
  const finish = options.finish || "zinc-plated";
  return {
    id: options.id || (options.family || "part") + ":" + (options.nominalSize || "") + (options.lengthMm ? "x" + options.lengthMm : ""),
    category: TOOLBOX_CATEGORIES.includes(options.category) ? options.category : "fastener",
    family: options.family || "",
    standard: options.standard || "",
    designation: options.designation || options.callout || "",
    nominalSize: options.nominalSize || options.size || "",
    dimensionsMm,
    material: stock.name,
    materialId: stock.id,
    finish: TOOLBOX_FINISHES[finish] || finish,
    matePorts: Array.isArray(options.matePorts) ? options.matePorts : [],
    lod: normalizeLod(options.lod),
    series: options.series || null,
    threadClass: options.threadClass || null,
    propertyClass: options.propertyClass || null,
    catalogKey: options.catalogKey || "",
    instanceId: options.instanceId || options.id || "",
    sizeKey: options.sizeKey || "",
    representative: !!options.representative,
  };
}

export function designationOf(options) {
  const bits = [options.standardName || options.standard, options.nominalSize || options.size];
  if (options.lengthMm) bits.push("×" + options.lengthMm);
  if (options.propertyClass) bits.push(options.propertyClass);
  if (options.finishCode) bits.push(options.finishCode);
  return bits.filter(Boolean).join(" - ").replace(" - ×", " × ");
}

const DIM_ALIAS = {
  diameter: "diameterMm", pitch: "pitchMm", headDia: "headDiaMm", headHeight: "headHeightMm",
  acrossFlats: "acrossFlatsMm", headAcrossFlatsMm: "acrossFlatsMm", hexAfMm: "acrossFlatsMm", socketDepth: "socketDepthMm", length: "lengthMm",
  od: "odMm", id: "idMm", wall: "wallMm", thickness: "thicknessMm", coreDia: "coreMm",
  cc: "ccMm", cupDia: "cupDiaMm", cupDepth: "cupDepthMm", crank: "crankMm",
  plateSetback: "plateSetbackMm", plateHoleSpacing: "plateHoleSpacingMm",
  cupHoleSpacing: "cupHoleSpacingMm", drillingDistance: "drillingDistanceMm",
  threadLength: "threadLengthMm", flangeDia: "flangeDiaMm", pcd: "pcdMm",
  holeDia: "holeDiaMm", bendRadius: "bendRadiusMm", odLarge: "odLargeMm",
  odSmall: "odSmallMm", inner: "innerMm", outer: "outerMm", barrelDia: "barrelDiaMm",
  width: "widthMm", arm: "armMm", barDia: "barDiaMm", projection: "projectionMm",
  dia: "diaMm", camDia: "camDiaMm", boltDia: "boltDiaMm", boltLength: "boltLengthMm",
  knuckleDia: "knuckleDiaMm", holePitch: "holePitchMm", sideClearance: "sideClearanceMm",
  span: "spanMm", hexHeight: "hexHeightMm", openingAngle: "openingAngleDeg",
  branchOd: "branchOdMm", core: "coreMm",
  height: "heightMm", depth: "depthMm", domeH: "domeHMm", camH: "camHMm",
};

const DIM_PASSTHROUGH = new Set([
  "schedule", "dn", "profile", "series", "point", "style", "thread", "holes",
  "ratingKg", "nps", "type", "kind", "angle", "drawerSide", "boreSize", "branchSize",
]);

function isNumericDim(value) {
  return typeof value === "number" ? Number.isFinite(value)
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
}

export function canonicalDimensionsMm(...sources) {
  const out = {};
  sources.filter(Boolean).forEach((src) => {
    Object.keys(src).forEach((key) => {
      const value = src[key];
      if (value == null || value === "") return;
      // Metadata `id` (e.g. "washer-flat:M4") must not overwrite hole idMm.
      if (key === "id" && !isNumericDim(value)) return;
      if (key === "af") { out.acrossFlatsMm = value; return; }
      if (key === "bore") {
        if (typeof value === "string" && !isNumericDim(value)) out.boreSize = value;
        else out.boreMm = value;
        return;
      }
      if (key === "h") return;
      const canon = DIM_ALIAS[key] || ((/Mm$/.test(key) || /Deg$/.test(key) || DIM_PASSTHROUGH.has(key)) ? key : null);
      if (!canon) {
        if (globalThis.MODELFORGE_WARN_UNMAPPED_DIMS) {
          console.warn("toolbox: unmapped dimension key " + key);
        }
        return;
      }
      if (DIM_PASSTHROUGH.has(canon) || canon === "boreSize" || canon === "branchSize") {
        out[canon] = value;
        return;
      }
      if (isNumericDim(value)) out[canon] = typeof value === "number" ? value : Number(value);
    });
  });
  return out;
}

export function bomIdentity(meta = {}) {
  return [
    meta.catalogKey || "",
    meta.designation || "",
    meta.family || "",
    meta.nominalSize || "",
    meta.materialId || meta.material || "",
    meta.finish || "",
    meta.propertyClass || "",
    meta.threadClass || "",
    meta.series || "",
    (meta.dimensionsMm && (meta.dimensionsMm.schedule || meta.dimensionsMm.profile || meta.dimensionsMm.branchOdMm || "")) || "",
  ].join("\u001f");
}
