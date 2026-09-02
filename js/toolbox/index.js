// Public toolbox API. cad_toolbox.js re-exports this so existing editor
// imports keep working.

export { mmToCm, cmToMm, inchToMm, normalizeLod, lookupSize, lookupSizeKey } from "./geom.js";
export {
  TOOLBOX_CATEGORIES, TOOLBOX_MATERIALS, TOOLBOX_FINISHES, materialAppearance,
  matePort, fastenerAxisPorts, pipeEndPorts, standardPartMetadata,
  canonicalDimensionsMm, bomIdentity,
} from "./schema.js";
export { generateToolboxPart } from "./generate.js";
export {
  TOOLBOX_FAMILIES, TOOLBOX_KINDS, TOOLBOX_CATEGORY_LABELS, toolboxFamily,
  listToolboxLibrary, listToolboxPicker, listToolboxCatalog, searchToolbox,
  lengthOptionsForSize,
} from "./catalog.js";
export { toolboxBOMRows, toolboxBOMFromParts, toolboxBOMCsv, collectToolboxItems } from "./bom.js";
export { toolboxLodMesh, toolboxEnvelope } from "./mesh.js";
export { validateToolboxSpec, isToolboxFamily } from "./audit.js";
export { ISO4762_SHCS, ISO4017_HEX, ISO4032_NUT, PREFERRED_LENGTHS_MM, preferredLengthFor } from "./fastener_tables.js";
export { EURO_HINGE, DRAWER_SLIDE, BAR_PULL_CC_MM } from "./hardware_tables.js";
export { COPPER_EN1057, PVC_D1785, PEX_ISO15875, STEEL_EN10255, PIPE_LENGTHS_MM, reducingBranchRows } from "./pipe_tables.js";

import { generateToolboxPart } from "./generate.js";
import { ISO4762_SHCS, preferredLengthFor, PREFERRED_LENGTHS_MM } from "./fastener_tables.js";

export const FASTENER_KINDS = Object.freeze(["shcs", "hex-screw", "hex-nut", "bushing"]);
export const FASTENER_LENGTHS_MM = PREFERRED_LENGTHS_MM;
export const TOOLBOX_SIZES = Object.freeze(Object.keys(ISO4762_SHCS).filter((key) => key.startsWith("M")));

export function toolboxFastener(options = {}) {
  return generateToolboxPart(options);
}

export function preferredLength(size) {
  const key = String(size || "M8").toUpperCase();
  const row = ISO4762_SHCS[key] || ISO4762_SHCS.M8;
  return preferredLengthFor(row.size, row.diameterMm);
}
