// Authored planner rule packs for built-in catalogue products.  These records
// are deliberately independent of display names and regexes: a catalogue key
// opts into a versioned manufacturing/configuration policy.  Unknown custom or
// imported products still use the conservative inference fallback in
// smart_dimension.js until their author publishes a rule pack.

export const PRODUCT_RULE_PACK_VERSION = 1;

const clone = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nearest = (value, choices) => choices.reduce((best, choice) => Math.abs(choice - value) < Math.abs(best - value) ? choice : best, choices[0]);

const BASE_DIMENSIONS = {
  width: { min: 5, max: 800, continuous: true },
  depth: { min: 5, max: 800, continuous: true },
  height: { min: 2, max: 600, continuous: true },
};

function pack(id, options) {
  return { id, version: PRODUCT_RULE_PACK_VERSION, source: "catalogue", ...options };
}

const PACKS = {
  bed: pack("sleeping.standard-mattress", {
    family: "bed",
    dimensions: {
      width: { min: 70, max: 210, allowed: [80, 90, 100, 120, 140, 160, 180, 200], tolerance: 2 },
      depth: { min: 180, max: 220, allowed: [190, 200, 210], tolerance: 2 },
      height: { min: 30, max: 120, continuous: true },
    },
    invariants: ["frameThickness", "mattressClearance", "slatSpacing"],
  }),
  bunk: pack("sleeping.bunk", {
    family: "bed",
    dimensions: {
      width: { min: 80, max: 140, allowed: [80, 90, 100, 120, 140], tolerance: 2 },
      depth: { min: 185, max: 215, allowed: [190, 200, 210], tolerance: 2 },
      height: { min: 150, max: 220, continuous: true },
    },
    invariants: ["frameThickness", "guardHeight", "ladderClearance", "slatSpacing"],
  }),
  crib: pack("sleeping.crib", {
    family: "bed",
    dimensions: {
      width: { min: 60, max: 90, allowed: [60, 70, 80, 90], tolerance: 1 },
      depth: { min: 115, max: 165, allowed: [120, 140, 160], tolerance: 2 },
      height: { min: 75, max: 125, continuous: true },
    },
    invariants: ["railSpacing", "mattressClearance", "frameThickness"],
  }),
  sofa: pack("seating.modular", {
    family: "seating",
    dimensions: { ...BASE_DIMENSIONS, width: { min: 55, max: 420, continuous: true }, depth: { min: 70, max: 125, continuous: true }, height: { min: 55, max: 120, continuous: true } },
    module: { parameter: "seatCount", dimension: "width", minSpan: 52, maxSpan: 78, minCount: 1, maxCount: 6, noun: "seats" },
    invariants: ["armWidth", "frameThickness", "cushionGap"],
  }),
  bench: pack("seating.bench", {
    family: "seating",
    dimensions: { ...BASE_DIMENSIONS, width: { min: 70, max: 360, continuous: true }, depth: { min: 32, max: 75, continuous: true }, height: { min: 38, max: 105, continuous: true } },
    module: { parameter: "seatCount", dimension: "width", minSpan: 45, maxSpan: 70, minCount: 1, maxCount: 6, noun: "seats" },
    invariants: ["frameThickness", "supportSpacing", "seatDepth"],
  }),
  singleSeat: pack("seating.single", {
    family: "seating",
    dimensions: { ...BASE_DIMENSIONS, width: { min: 38, max: 125, continuous: true }, depth: { min: 38, max: 125, continuous: true }, height: { min: 38, max: 135, continuous: true } },
    invariants: ["frameThickness", "seatHeight", "backAngle"],
  }),
  table: pack("tables.supported-span", {
    family: "table",
    dimensions: { ...BASE_DIMENSIONS, width: { min: 35, max: 500, continuous: true }, depth: { min: 30, max: 180, continuous: true }, height: { min: 25, max: 125, continuous: true } },
    module: { parameter: "supportCount", dimension: "width", minSpan: 45, maxSpan: 160, minCount: 2, maxCount: 6, noun: "supports" },
    invariants: ["topThickness", "legSection", "edgeOverhang", "supportedSpan"],
  }),
  roundTable: pack("tables.round", {
    family: "table",
    dimensions: { ...BASE_DIMENSIONS, width: { min: 45, max: 220, continuous: true }, depth: { min: 45, max: 220, continuous: true }, height: { min: 30, max: 115, continuous: true } },
    linkedDimensions: [{ source: "width", target: "depth", relation: "equal", prompt: true }],
    invariants: ["topThickness", "pedestalSection", "radialClearance"],
  }),
  casework: pack("casework.modular", {
    family: "casework",
    dimensions: { ...BASE_DIMENSIONS, width: { min: 30, max: 600, continuous: true }, depth: { min: 20, max: 100, continuous: true }, height: { min: 25, max: 320, continuous: true } },
    module: { parameter: "moduleCount", dimension: "width", minSpan: 30, maxSpan: 90, minCount: 1, maxCount: 12, noun: "modules" },
    coupledCounts: [{ parameter: "doorCount", from: "moduleCount", multiplier: 1 }],
    invariants: ["panelThickness", "backThickness", "hardwareSpacing", "supportedSpan"],
  }),
  kitchenModule: pack("casework.kitchen-module", {
    family: "casework",
    dimensions: {
      width: { min: 30, max: 240, allowed: [30, 40, 45, 50, 60, 80, 90, 100, 120, 180, 240], tolerance: 1 },
      depth: { min: 30, max: 90, allowed: [35, 40, 55, 60, 65, 80, 90], tolerance: 1 },
      height: { min: 35, max: 260, continuous: true },
    },
    module: { parameter: "moduleCount", dimension: "width", minSpan: 30, maxSpan: 60, minCount: 1, maxCount: 6, noun: "modules" },
    coupledCounts: [{ parameter: "doorCount", from: "moduleCount", multiplier: 1 }],
    invariants: ["panelThickness", "backThickness", "worktopThickness", "hardwareSpacing"],
  }),
  appliance: pack("appliances.standard-envelope", {
    family: "appliance",
    dimensions: {
      width: { min: 40, max: 125, allowed: [45, 50, 55, 60, 70, 75, 80, 90, 120], tolerance: 1 },
      depth: { min: 45, max: 85, allowed: [50, 55, 60, 65, 70, 75, 80], tolerance: 1 },
      height: { min: 35, max: 220, continuous: true },
    },
    invariants: ["serviceClearance", "doorSwing", "manufacturerEnvelope"],
  }),
  wallPanel: pack("decor.aspect-preserving", {
    family: "decor",
    dimensions: { ...BASE_DIMENSIONS, width: { min: 10, max: 500, continuous: true }, depth: { min: 0.5, max: 25, continuous: true }, height: { min: 10, max: 400, continuous: true } },
    invariants: ["mountingDepth"],
  }),
  decor: pack("decor.scaled-composition", {
    family:"decor", dimensions:{...BASE_DIMENSIONS,width:{min:5,max:500,continuous:true},depth:{min:2,max:250,continuous:true},height:{min:5,max:400,continuous:true}},
    invariants:["materialThickness","stableBase","visualProportion"],
  }),
  plumbing: pack("fixtures.plumbing-envelope", {
    family:"fixture", dimensions:{width:{min:20,max:250,continuous:true},depth:{min:20,max:220,continuous:true},height:{min:15,max:240,continuous:true}},
    invariants:["trapClearance","serviceConnection","userClearance","fixtureWall"],
  }),
  hvac: pack("services.hvac-module", {
    family:"hvac", dimensions:{width:{min:15,max:500,continuous:true},depth:{min:8,max:180,continuous:true},height:{min:5,max:300,continuous:true}},
    module:{parameter:"serviceModuleCount",dimension:"width",minSpan:30,maxSpan:120,minCount:1,maxCount:12,noun:"service modules"},
    invariants:["airflowArea","serviceClearance","mountingPoints","connectionDiameter"],
  }),
  lighting: pack("lighting.photometric-fixture", {
    family:"lighting", dimensions:{width:{min:2,max:500,continuous:true},depth:{min:2,max:500,continuous:true},height:{min:1,max:300,continuous:true}},
    linkedDimensions:[{source:"width",target:"depth",relation:"equal",prompt:false}],
    invariants:["lampSpacing","driverClearance","mountingPlate","photometricCenter"],
  }),
  electronics: pack("electronics.service-envelope", {
    family:"electronics", dimensions:{width:{min:5,max:300,continuous:true},depth:{min:2,max:150,continuous:true},height:{min:2,max:200,continuous:true}},
    invariants:["connectorClearance","ventilationGap","screenAspect","mountingPattern"],
  }),
  hydroChannel: pack("hydroponics.channel-system", {
    family:"hydroponics", dimensions:{width:{min:50,max:1200,continuous:true},depth:{min:6,max:40,allowed:[7.5,11,16,20,25,30,40],tolerance:1},height:{min:6,max:300,continuous:true}},
    module:{parameter:"plantSiteCount",dimension:"width",minSpan:15,maxSpan:35,minCount:2,maxCount:48,noun:"plant sites"},
    invariants:["channelSection","plantSpacing","flowSlope","endCapThickness"],
  }),
  hydroEquipment: pack("hydroponics.equipment", {
    family:"hydroponics", dimensions:{width:{min:15,max:600,continuous:true},depth:{min:15,max:600,continuous:true},height:{min:15,max:400,continuous:true}},
    invariants:["fluidVolume","serviceClearance","wallThickness","connectionSize"],
  }),
  circulation: pack("circulation.code-envelope", {
    family:"circulation", dimensions:{width:{min:60,max:400,continuous:true},depth:{min:100,max:1500,continuous:true},height:{min:30,max:500,continuous:true}},
    module:{parameter:"stepCount",dimension:"height",minSpan:15,maxSpan:19,minCount:2,maxCount:30,noun:"risers"},
    invariants:["riserHeight","treadDepth","guardClearance","supportSpacing"],
  }),
  anthropometric: pack("characters.anthropometric", {
    family:"character", dimensions:{width:{min:30,max:100,continuous:true},depth:{min:20,max:70,continuous:true},height:{min:80,max:220,continuous:true}},
    linkedDimensions:[{source:"height",target:"width",relation:"proportional",ratio:.28},{source:"height",target:"depth",relation:"proportional",ratio:.18}],
    invariants:["skeletonProportions","collisionCapsule","footprint"],
  }),
};

const PRODUCT_PACK = new Map();
function assign(packName, keys) { keys.forEach((key) => PRODUCT_PACK.set(key, packName)); }

assign("bed", ["bed"]);
assign("bunk", ["bunk"]);
assign("crib", ["crib"]);
assign("sofa", ["sofa"]);
assign("bench", ["bench"]);
assign("singleSeat", ["armchair", "recliner", "pouf", "chair", "officeChair", "stool", "barstool"]);
assign("table", ["table", "desk", "coffee", "sideTable", "console", "dressTable", "island"]);
assign("roundTable", ["roundTable"]);
assign("casework", ["wardrobe", "dresser", "bookshelf", "sideboard", "pantry", "vanity", "nightstand", "shoeCab", "filingCab", "wallShelf", "tvunit", "cabsys"]);
assign("kitchenModule", ["base", "tall", "upper"]);
assign("appliance", ["fridge", "oven", "dishwasher", "washer", "dryer", "wineFridge", "microwave"]);
assign("wallPanel", ["tv", "tvWall", "mirror", "wallMirror", "floorMirror", "art", "whiteboard"]);
assign("decor", ["rug","plant","clock","curtain","piano","aquarium","fireplace","coatRack","laundryBasket"]);
assign("plumbing", ["sink","pedestalSink","toilet","bidet","bathtub","shower","towelRail","waterHeater"]);
assign("hvac", ["ac","acCassette","acDucted","acDiffuser","acReturn","acOutdoor","radiator"]);
assign("lighting", ["ceilingLight","pendant","chandelier","ceilingFan","trackLight","floorLamp","wallLamp","tableLamp","lightStrip","led_grow_light"]);
assign("electronics", ["cooktop","hood","coffeeMachine","toaster","kettle","soundbar","speaker","desktop_pc","laptop","printer","monitor"]);
assign("hydroChannel", ["nft_pipe_75","nft_pipe_110","nft_pipe_160","nft_square_12x12","ebb_flow_tray"]);
assign("hydroEquipment", ["dwc_bucket","rdwc_header","tower_commercial","tower_diy_pvc","water_chiller","grow_tent","water_reservoir_60l","shade_net"]);
assign("circulation", ["stairs"]);
assign("anthropometric", ["man","woman","boy","girl","oldman","oldwoman"]);

function configurationFor(rules, width) {
  const configuration = {};
  if (rules.module) {
    const module = rules.module;
    const idealSpan = (module.minSpan + module.maxSpan) / 2;
    configuration[module.parameter] = clamp(Math.round(width / idealSpan), module.minCount || 1, module.maxCount || 99);
  }
  (rules.coupledCounts || []).forEach((coupling) => {
    const source = configuration[coupling.from];
    if (Number.isFinite(source)) configuration[coupling.parameter] = Math.max(1, Math.round(source * (coupling.multiplier || 1)));
  });
  if (rules.family === "bed" && rules.dimensions.width?.allowed) configuration.sizeFamily = nearest(width, rules.dimensions.width.allowed) + " cm mattress";
  return configuration;
}

function mergeRules(base, override) {
  if (!override) return base;
  const merged = { ...base, ...clone(override) };
  merged.dimensions = { ...(base.dimensions || {}), ...(override.dimensions || {}) };
  merged.invariants = Array.from(new Set([...(base.invariants || []), ...(override.invariants || [])]));
  merged.configuration = { ...(base.configuration || {}), ...(override.configuration || {}) };
  return merged;
}

export function authoredProductRules(type, dimensions = {}, catalogueOverride) {
  const packName = PRODUCT_PACK.get(String(type || ""));
  if (!packName && !catalogueOverride) return null;
  const base = packName ? clone(PACKS[packName]) : { id: "catalogue.inline", version: PRODUCT_RULE_PACK_VERSION, source: "catalogue", family: "generic", dimensions: clone(BASE_DIMENSIONS), invariants: [] };
  const rules = mergeRules(base, catalogueOverride);
  rules.productType = String(type || "");
  rules.configuration = { ...configurationFor(rules, Number(dimensions.width) || 100), ...(rules.configuration || {}) };
  return rules;
}

export function productRulePackName(type) {
  return PRODUCT_PACK.get(String(type || "")) || null;
}
