// Hierarchical toolbox catalog for the picker, search, and BOM.

import {
  ISO4762_SHCS, ISO4017_HEX, ISO4032_NUT, ISO4035_JAM, ISO7040_NYLOC, ISO4161_FLANGE,
  DIN315_WING, DIN1587_ACORN, ISO7089_WASHER, ISO7093_FENDER, DIN127_LOCK, CSINK_FINISH_WASHER,
  ISO10642_CSINK, ISO7380_BUTTON, ISO7045_PAN, ISO7046_CSINK_MACHINE, DIN7997_WOOD, DIN571_LAG,
  ISO4026_SET, TNUT_WOOD, TSLOT_NUT, PLAIN_BUSHING, DIN1151_NAIL, BRAD_NAIL, DRYWALL_SCREW,
  CONCRETE_NAIL, ISO2338_PIN, WOOD_DOWEL, PREFERRED_LENGTHS_MM, IMPERIAL_LENGTHS_MM,
  preferredLengthFor,
} from "./fastener_tables.js";
import {
  EURO_HINGE, BUTT_HINGE, PIANO_HINGE, DRAWER_SLIDE, BAR_PULL, CABINET_KNOB, EDGE_PULL,
  FLUSH_PULL, CAM_LOCK, CORNER_BRACE, MENDING_PLATE, SHELF_SUPPORT,
} from "./hardware_tables.js";
import {
  COPPER_EN1057, COPPER_ASTM_B88, PVC_D1785, PEX_ISO15875, STEEL_EN10255, CONDUIT,
  FLANGE_PN16, FLANGE_CL150, PIPE_LENGTHS_MM,
} from "./pipe_tables.js";

function sizeLabel(key, row) {
  const bits = [];
  if (row.profile) bits.push(row.profile);
  bits.push(row.size || key);
  if (row.schedule) bits.push("Sch " + row.schedule);
  if (row.type) bits.push("Type " + row.type);
  return bits.join(" · ");
}

function sizesOf(table, extra = {}) {
  return Object.keys(table).map((key) => {
    const row = table[key];
    return {
      size: row.size || key,
      key,
      lengthMm: row.lengthMm != null ? row.lengthMm : (row.diameterMm ? preferredLengthFor(row.size, row.diameterMm) : null),
      imperial: !!row.imperial,
      series: extra.series || row.series || null,
      schedule: row.schedule || null,
      profile: row.profile || null,
      label: extra.label || sizeLabel(key, row),
    };
  });
}

const LENGTH_SCREW = PREFERRED_LENGTHS_MM;
const LENGTH_IMP = IMPERIAL_LENGTHS_MM;

function family(kind, label, standard, table, extra = {}) {
  const sizes = extra.sizes || (table ? sizesOf(table) : [{ size: extra.defaultSize || "", lengthMm: extra.defaultLength || null, label: extra.defaultSize || label }]);
  let lengthOptions = extra.lengthOptions ? extra.lengthOptions.slice() : null;
  if (sizes.some((row) => row.imperial) && extra.hasLength !== false) {
    lengthOptions = lengthOptions || LENGTH_SCREW.slice();
    LENGTH_IMP.forEach((mm) => { if (lengthOptions.indexOf(mm) < 0) lengthOptions.push(mm); });
  }
  return {
    kind,
    label,
    standard,
    category: extra.category || "fastener",
    hasLength: extra.hasLength !== undefined ? !!extra.hasLength : sizes.some((row) => row.lengthMm != null),
    lengthOptions,
    options: extra.options || null,
    sizes,
    defaultSize: extra.defaultSize || (sizes[0] && (sizes[0].key || sizes[0].size)),
    defaultLength: extra.defaultLength || null,
    sizesBySeries: extra.sizesBySeries || null,
  };
}

export const TOOLBOX_FAMILIES = Object.freeze([
  family("shcs", "ISO 4762 SHCS", "ISO 4762:2018 / ASME B18.3", ISO4762_SHCS, { hasLength: true, lengthOptions: LENGTH_SCREW.concat(LENGTH_IMP), defaultSize: "M8" }),
  family("hex-screw", "ISO 4017 hex screw", "ISO 4017:2022 / DIN 933", ISO4017_HEX, { hasLength: true, lengthOptions: LENGTH_SCREW, defaultSize: "M8" }),
  family("hex-bolt", "ISO 4014 hex bolt", "ISO 4014:2022 / DIN 931", ISO4017_HEX, { hasLength: true, lengthOptions: LENGTH_SCREW, defaultSize: "M8" }),
  family("csink-socket", "ISO 10642 countersunk socket", "ISO 10642 / DIN 7991", ISO10642_CSINK, { hasLength: true, lengthOptions: LENGTH_SCREW, defaultSize: "M6" }),
  family("button-socket", "ISO 7380-1 button head", "ISO 7380-1", ISO7380_BUTTON, { hasLength: true, lengthOptions: LENGTH_SCREW, defaultSize: "M6" }),
  family("pan-screw", "ISO 7045 pan machine screw", "ISO 7045", ISO7045_PAN, { hasLength: true, lengthOptions: LENGTH_SCREW, defaultSize: "M5" }),
  family("csink-machine", "ISO 7046 countersunk machine", "ISO 7046", ISO7046_CSINK_MACHINE, { hasLength: true, lengthOptions: LENGTH_SCREW, defaultSize: "M5" }),
  family("wood-screw", "DIN 7997 wood / chipboard", "DIN 7997 / ISO 14585", DIN7997_WOOD, { hasLength: true, lengthOptions: [16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80], defaultSize: "4.0" }),
  family("lag-bolt", "DIN 571 coach / lag bolt", "DIN 571", DIN571_LAG, { hasLength: true, lengthOptions: [30, 40, 50, 60, 80, 100, 120, 150, 200], defaultSize: "M8" }),
  family("set-flat", "ISO 4026 set screw (flat)", "ISO 4026 / DIN 913", ISO4026_SET, { hasLength: true, lengthOptions: [4, 5, 6, 8, 10, 12, 16, 20, 25], defaultSize: "M6" }),
  family("set-cone", "ISO 4027 set screw (cone)", "ISO 4027", ISO4026_SET, { hasLength: true, lengthOptions: [4, 5, 6, 8, 10, 12, 16, 20], defaultSize: "M6" }),
  family("set-cup", "ISO 4029 set screw (cup)", "ISO 4029", ISO4026_SET, { hasLength: true, lengthOptions: [4, 5, 6, 8, 10, 12, 16, 20], defaultSize: "M6" }),
  family("hex-nut", "ISO 4032 hex nut", "ISO 4032 / DIN 934", ISO4032_NUT, { hasLength: false, defaultSize: "M8" }),
  family("jam-nut", "ISO 4035 jam nut", "ISO 4035 / DIN 439", ISO4035_JAM, { hasLength: false, defaultSize: "M8" }),
  family("nyloc-nut", "ISO 7040 nyloc nut", "ISO 7040 / DIN 985", ISO7040_NYLOC, { hasLength: false, defaultSize: "M8" }),
  family("flange-nut", "ISO 4161 flange nut", "ISO 4161 / DIN 6923", ISO4161_FLANGE, { hasLength: false, defaultSize: "M8" }),
  family("wing-nut", "DIN 315 wing nut", "DIN 315", DIN315_WING, { hasLength: false, defaultSize: "M8" }),
  family("acorn-nut", "DIN 1587 cap / acorn nut", "DIN 1587", DIN1587_ACORN, { hasLength: false, defaultSize: "M8" }),
  family("t-nut", "4-prong T-nut", "wood T-nut", TNUT_WOOD, { hasLength: false, defaultSize: "M6" }),
  family("tslot-nut", "T-slot nut 2020/3030/4040", "extrusion T-nut", TSLOT_NUT, { hasLength: false, defaultSize: "2020-M5" }),
  family("washer-flat", "ISO 7089 flat washer", "ISO 7089 / DIN 125A", ISO7089_WASHER, { hasLength: false, defaultSize: "M8" }),
  family("washer-fender", "ISO 7093 fender washer", "ISO 7093 / DIN 9021", ISO7093_FENDER, { hasLength: false, defaultSize: "M8" }),
  family("washer-lock", "DIN 127B split lock washer", "DIN 127B", DIN127_LOCK, { hasLength: false, defaultSize: "M8" }),
  family("washer-csink", "Countersunk finishing washer", "finishing washer", CSINK_FINISH_WASHER, { hasLength: false, defaultSize: "M6" }),
  family("bushing", "Plain bushing / insert", "plain bushing", PLAIN_BUSHING, { hasLength: false, defaultSize: "M8" }),
  family("nail-wire", "DIN 1151 wire nail", "DIN 1151 / ASTM F1667", DIN1151_NAIL, { hasLength: false, defaultSize: "2.5x50" }),
  family("nail-brad", "Brad / finishing nail", "16/18/23 GA", BRAD_NAIL, { hasLength: false, defaultSize: "18GA-32" }),
  family("nail-drywall", "Bugle-head drywall screw", "phosphate drywall", DRYWALL_SCREW, { hasLength: false, defaultSize: "3.5x35" }),
  family("nail-concrete", "Fluted concrete pin", "concrete nail", CONCRETE_NAIL, { hasLength: false, defaultSize: "3.0x40" }),
  family("pin-dowel-steel", "ISO 2338 parallel pin", "ISO 2338", ISO2338_PIN, { hasLength: false, defaultSize: "6x24" }),
  family("pin-dowel-wood", "Fluted beech dowel", "furniture dowel", WOOD_DOWEL, { hasLength: false, defaultSize: "8x40" }),

  family("euro-hinge", "35mm Euro cup hinge", "EN 15570 / 32mm system", null, {
    category: "hardware", hasLength: false, defaultSize: "full-overlay",
    sizes: Object.keys(EURO_HINGE.overlays).map((key) => ({ size: key, key, label: EURO_HINGE.overlays[key].label, lengthMm: null })),
    options: { overlay: Object.keys(EURO_HINGE.overlays), angle: EURO_HINGE.angles.slice() },
  }),
  family("butt-hinge", "Butt hinge", "EN 1935 / ANSI/BHMA A156.1", BUTT_HINGE, { category: "hardware", hasLength: false, defaultSize: "100mm" }),
  family("piano-hinge", "Continuous / piano hinge", "piano hinge 50mm pitch", null, {
    category: "hardware", hasLength: true, lengthOptions: PIANO_HINGE.lengthsMm.slice(), defaultLength: 1000, defaultSize: "1000mm",
    sizes: PIANO_HINGE.lengthsMm.map((mm) => ({ size: mm + "mm", lengthMm: mm, label: mm + "mm" })),
  }),
  family("drawer-slide", "Ball-bearing drawer slide", "full extension 45kg", null, {
    category: "hardware", hasLength: true, lengthOptions: DRAWER_SLIDE.lengthsMm.slice(), defaultLength: 450, defaultSize: "450mm",
    sizes: DRAWER_SLIDE.lengthsMm.map((mm) => ({ size: mm + "mm", lengthMm: mm, label: mm + "mm" })),
  }),
  family("undermount-slide", "Undermount soft-close slide", "16/19mm drawer side", null, {
    category: "hardware", hasLength: true, lengthOptions: DRAWER_SLIDE.lengthsMm.slice(), defaultLength: 450, defaultSize: "450mm",
    sizes: DRAWER_SLIDE.lengthsMm.map((mm) => ({ size: mm + "mm", lengthMm: mm, label: mm + "mm" })),
    options: { drawerSideMm: DRAWER_SLIDE.undermountSidesMm.slice() },
  }),
  family("bar-pull", "Bar pull / handle", "32mm system CC", BAR_PULL, { category: "hardware", hasLength: false, defaultSize: "128mm" }),
  family("cabinet-knob", "Cabinet knob", "M4 bore knobs", CABINET_KNOB, { category: "hardware", hasLength: false, defaultSize: "Ø30" }),
  family("edge-pull", "Edge / J pull", "edge pull", EDGE_PULL, { category: "hardware", hasLength: false, defaultSize: "80mm" }),
  family("flush-pull", "Recessed flush pull", "flush pull", FLUSH_PULL, { category: "hardware", hasLength: false, defaultSize: "90×45" }),
  family("cam-lock", "Cam-lock fastener", "Minifix / Rafix / VB 36", CAM_LOCK, { category: "hardware", hasLength: true, lengthOptions: [24, 34, 44], defaultLength: 34, defaultSize: "Minifix 15" }),
  family("corner-brace", "Corner brace / angle bracket", "90° zinc bracket", CORNER_BRACE, { category: "hardware", hasLength: false, defaultSize: "40×40" }),
  family("mending-plate", "Flat mending plate", "mending plate", MENDING_PLATE, { category: "hardware", hasLength: false, defaultSize: "80×16" }),
  family("t-plate", "T-plate", "T mending plate", MENDING_PLATE, { category: "hardware", hasLength: false, defaultSize: "T 80×80", sizes: sizesOf(MENDING_PLATE).filter((row) => (MENDING_PLATE[row.key] || {}).shape === "T") }),
  family("shelf-support", "Shelf support", "Ø3/Ø5 spoon & pin", SHELF_SUPPORT, { category: "hardware", hasLength: false, defaultSize: "Ø5 spoon" }),

  family("pipe-copper", "Copper pipe EN 1057 / ASTM B88", "EN 1057 / ASTM B88", Object.assign({}, COPPER_EN1057, COPPER_ASTM_B88), { category: "piping", hasLength: true, lengthOptions: PIPE_LENGTHS_MM.slice(), defaultLength: 1000, defaultSize: "22mm" }),
  family("pipe-pvc", "PVC / uPVC / CPVC pipe", "ISO 1452 / ASTM D1785", PVC_D1785, { category: "piping", hasLength: true, lengthOptions: PIPE_LENGTHS_MM.slice(), defaultLength: 1000, defaultSize: "DN25-40" }),
  family("pipe-pex", "PEX tubing", "ISO 15875 / ASTM F876", PEX_ISO15875, { category: "piping", hasLength: true, lengthOptions: PIPE_LENGTHS_MM.slice(), defaultLength: 1000, defaultSize: "16×2.0" }),
  family("pipe-steel", "Steel / galvanized pipe", "EN 10255 / ISO 65 / ASTM A53", STEEL_EN10255, { category: "piping", hasLength: true, lengthOptions: PIPE_LENGTHS_MM.slice(), defaultLength: 1000, defaultSize: "DN25" }),
  family("pipe-conduit", "Electrical conduit", "EMT / EN 61386", CONDUIT, { category: "piping", hasLength: true, lengthOptions: PIPE_LENGTHS_MM.slice(), defaultLength: 1000, defaultSize: "20mm EMT" }),
  family("elbow-90", "90° elbow", "LR / SR elbow", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40", options: { radius: ["long-radius", "short-radius"] } }),
  family("elbow-45", "45° elbow", "45° elbow", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("elbow-street", "Street elbow (M-F)", "street elbow", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("tee-equal", "Equal tee", "equal tee", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("tee-reducing", "Reducing tee", "reducing tee", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("cross-equal", "Equal cross", "cross fitting", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("coupling", "Straight coupler", "coupling", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("adapter-thread", "Slip-to-thread adapter", "NPT / BSPP / BSPT", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40", options: { thread: ["NPT", "BSPP", "BSPT"] } }),
  family("union", "Union fitting", "union", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("reducer-concentric", "Concentric reducer", "concentric reducer", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("reducer-eccentric", "Eccentric reducer", "eccentric reducer", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("bushing-reducer", "Bushing reducer", "bushing reducer", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("cap", "Socket end cap", "cap", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("plug", "Threaded plug", "plug", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("flange", "Pipe flange", "ISO 7005 PN16 / ASME B16.5 CL150", FLANGE_PN16, {
    category: "piping", hasLength: false, defaultSize: "DN50",
    sizesBySeries: {
      PN16: sizesOf(FLANGE_PN16, { series: "PN16" }).map((row) => Object.assign({}, row, { label: row.size + " PN16" })),
      CL150: sizesOf(FLANGE_CL150, { series: "CL150" }).map((row) => Object.assign({}, row, { label: row.size + " CL150" })),
    },
    sizes: sizesOf(FLANGE_PN16, { series: "PN16" }).map((row) => Object.assign({}, row, { label: row.size + " PN16" }))
      .concat(sizesOf(FLANGE_CL150, { series: "CL150" }).map((row) => Object.assign({}, row, { label: row.size + " CL150" }))),
  }),
  family("valve-ball", "2-way ball valve", "quarter-turn ball valve", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("valve-gate", "Gate valve", "gate valve", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
  family("valve-check", "Check valve", "check valve", PVC_D1785, { category: "piping", hasLength: false, defaultSize: "DN25-40" }),
]);

export const TOOLBOX_KINDS = Object.freeze(TOOLBOX_FAMILIES.map((row) => row.kind));

export const TOOLBOX_CATEGORY_LABELS = Object.freeze({
  fastener: "Fasteners",
  hardware: "Cabinet & furniture hardware",
  piping: "Pipes & fittings",
});

export function toolboxFamily(kind) {
  return TOOLBOX_FAMILIES.find((row) => row.kind === kind) || null;
}

export function lengthOptionsForSize(fam, size) {
  const opts = (fam && fam.lengthOptions) || [];
  if (!opts.length) return opts.slice();
  const row = (fam.sizes || []).find((item) => item.size === size || item.key === size);
  const key = String(size || "");
  const imperial = row ? !!row.imperial : /^#/.test(key) || /-\d+$/.test(key) || /\//.test(key);
  if (!(fam.sizes || []).some((item) => item.imperial)) return opts.slice();
  const allowed = new Set(imperial ? LENGTH_IMP : LENGTH_SCREW);
  const filtered = opts.filter((mm) => allowed.has(mm));
  return filtered.length ? filtered : (imperial ? LENGTH_IMP.slice() : opts.filter((mm) => !LENGTH_IMP.includes(mm)));
}

export function listToolboxLibrary() {
  const groups = { fastener: [], hardware: [], piping: [] };
  TOOLBOX_FAMILIES.forEach((row) => {
    (groups[row.category] || groups.fastener).push(row);
  });
  return ["fastener", "hardware", "piping"].map((id) => ({
    id, label: TOOLBOX_CATEGORY_LABELS[id], families: groups[id],
  }));
}

export function listToolboxPicker() {
  const legacy = ["shcs", "hex-screw", "hex-nut", "bushing"];
  return legacy.map((kind) => {
    const row = toolboxFamily(kind);
    return { kind, label: row.label, sizes: row.sizes.map((size) => ({ size: size.size, lengthMm: kind === "hex-nut" || kind === "bushing" ? null : size.lengthMm })) };
  });
}

export function listToolboxCatalog() {
  return TOOLBOX_FAMILIES.map((row) => ({
    kind: row.kind, label: row.label, standard: row.standard, category: row.category,
    sizes: row.sizes.map((size) => size.size),
    hasLength: row.hasLength,
  }));
}

export function searchToolbox(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return TOOLBOX_FAMILIES.slice();
  return TOOLBOX_FAMILIES.filter((row) => {
    const blob = [row.kind, row.label, row.standard, row.category, ...(row.sizes || []).map((size) => [size.size, size.key, size.label].filter(Boolean).join(" "))].join(" ").toLowerCase();
    return blob.indexOf(q) >= 0;
  });
}
