// Finish/shape variant tables attached to FURN entries.
import {
  CAB, ISL, TOP, STEEL, DARK, GLASS, HANDLE, FABRIC, WOOD, BEDC, TVB,
  GREEN, RUGC, PVC_WHITE, BLACK_PLASTIC, ALUMINUM, WATER, TUFF,
} from "./state.js";
import { FURN } from "./furniture_models.js";

/* ================= VARIANT TABLES =================
   Declared here, at the bottom, so the whole palette reads in one place and
   every FURN key (including the appended computer/human models) already
   exists. Attached to the models at the end of this block.

   V(id, he, en, swap) — `swap` remaps source colors (the constants in
   state.js) to a color, or to {col,rough,metal} for a finish change too.
   Extra shape fields are merged in via the 5th argument and read by the
   model's own build() through vspec(). The first entry of each list is the
   model's original look, so scenes saved before variants existed are
   untouched. */
function smap() {
  // smap(src, dst, src, dst, …) — numeric keys need building at runtime
  var o = {};
  for (var i = 0; i + 1 < arguments.length; i += 2) o[arguments[i]] = arguments[i + 1];
  return o;
}
function V(id, he, en, swap, shape) {
  return Object.assign({ id: id, label: he, en: en, swap: swap || null }, shape || {});
}

/* -- reusable finish families -- */

// cabinet / storage board (kitchen units, wardrobes, chests, vanities)
function carcassFin(col, rough) {
  var f = { col: col, rough: rough == null ? 0.72 : rough };
  return smap(CAB, f, ISL, f);
}
var CARCASS = [
  V("oak", "אלון טבעי", "Natural oak"),
  V("white", "לבן מט", "Matte white", carcassFin(0xf1efe9)),
  V("gloss", "לכה לבנה מבריקה", "White gloss", carcassFin(0xfafaf8, 0.16)),
  V("walnut", "אגוז כהה", "Dark walnut", carcassFin(0x6a4a30, 0.62)),
  V("graphite", "גרפיט", "Graphite", carcassFin(0x454a4e, 0.5)),
  V("sage", "ירוק מרווה", "Sage green", carcassFin(0x8b9b85)),
  V("navy", "כחול נייבי", "Navy", carcassFin(0x33445c)),
];
// same finishes, plus a worktop change — for the pieces that carry a counter
function counterFin(carc, top, topRough) {
  var s = carcassFin(carc);
  s[TOP] = { col: top, rough: topRough == null ? 0.34 : topRough };
  return s;
}
var COUNTER = [
  V("oak", "אלון + קוורץ בהיר", "Oak + light quartz"),
  V("white", "לבן + קוורץ", "White + quartz", counterFin(0xf1efe9, 0xf4f2ee)),
  V("graniteTop", "לבן + גרניט שחור", "White + black granite", counterFin(0xf1efe9, 0x33373a, 0.24)),
  V("butcher", "לבן + עץ מלא", "White + butcher block", counterFin(0xf1efe9, 0xb98a55, 0.55)),
  V("walnut", "אגוז + שיש", "Walnut + marble", counterFin(0x6a4a30, 0xeae7e0, 0.22)),
  V("graphite", "גרפיט + בטון", "Graphite + concrete", counterFin(0x454a4e, 0x9c9a95, 0.6)),
];
// upholstery (sofas, chairs, poufs, beds' fabric parts)
function uphFin(col, rough, metal) {
  return smap(FABRIC, { col: col, rough: rough == null ? 0.95 : rough, metal: metal });
}
var UPH = [
  V("grey", "אפור בהיר", "Light grey"),
  V("charcoal", "אפור פחם", "Charcoal", uphFin(0x3f464b)),
  V("cream", "שמנת", "Cream", uphFin(0xd9cfba)),
  V("navy", "כחול עמוק", "Deep blue", uphFin(0x39506e)),
  V("olive", "זית", "Olive", uphFin(0x6c7752)),
  V("terracotta", "טרהקוטה", "Terracotta", uphFin(0xa9603f)),
  V("leather", "עור טבעי", "Tan leather", uphFin(0x8a5a34, 0.42, 0.06)),
  V("blackLeather", "עור שחור", "Black leather", uphFin(0x2e3134, 0.34, 0.08)),
];
// solid wood (tables, chairs, shelving, bed frames)
function woodFin(col, rough) {
  return smap(WOOD, { col: col, rough: rough == null ? 0.55 : rough }, 0x6f5535, {
    col: col, rough: rough == null ? 0.55 : rough,
  });
}
var WOODF = [
  V("oak", "אלון", "Oak"),
  V("walnut", "אגוז", "Walnut", woodFin(0x5e422a)),
  V("white", "לבן", "White", woodFin(0xeeeae2, 0.6)),
  V("black", "שחור", "Black", woodFin(0x2b2e31, 0.45)),
  V("birch", "ליבנה בהיר", "Pale birch", woodFin(0xd8bf97)),
];
// appliance bodies (steel / white / black / graphite)
function applFin(col, rough, metal) {
  var f = { col: col, rough: rough == null ? 0.4 : rough, metal: metal == null ? 0.3 : metal };
  return smap(STEEL, f, 0xbcc3c7, f, 0xe8ebed, f, 0xdfe3e5, f, 0x9aa2a8, f, 0xd7dadd, f);
}
var APPL = [
  V("steel", "נירוסטה", "Stainless steel"),
  V("white", "לבן", "White", applFin(0xf2f2f0, 0.45, 0.06)),
  V("black", "שחור", "Black", applFin(0x2a2d30, 0.35, 0.2)),
  V("graphite", "גרפיט", "Graphite", applFin(0x585e63, 0.38, 0.35)),
];
// lamp metalwork
function metalFin(col, rough, metal) {
  var f = { col: col, rough: rough == null ? 0.3 : rough, metal: metal == null ? 0.8 : metal };
  return smap(0x2b2f33, f, 0x33383c, f, 0x2d3338, f, 0x42474a, f, 0x6e7478, f, 0x8a857c, f, 0x55504a, f);
}
var LAMPM = [
  V("dark", "מתכת כהה", "Dark metal"),
  V("brass", "פליז", "Brass", metalFin(0xb08d4a, 0.28, 0.9)),
  V("chrome", "כרום", "Chrome", metalFin(0xd3d8db, 0.12, 0.95)),
  V("white", "לבן", "White", metalFin(0xf0efec, 0.5, 0.1)),
];
// sanitaryware (toilets, tubs, showers, basins)
function sanFin(col, rough) {
  var f = { col: col, rough: rough == null ? 0.32 : rough };
  return smap(0xf0f2f4, f, 0xf2f4f6, f, 0xf6f8fa, f, 0xdde2e5, f, 0xe9edef, f, 0xd7e2e6, f, 0xe6eaec, f);
}
var SANITARY = [
  V("white", "לבן", "White"),
  V("ivory", "שמנת", "Ivory", sanFin(0xf0ead9)),
  V("matteGrey", "אפור מט", "Matte grey", sanFin(0x8f959a, 0.62)),
  V("matteBlack", "שחור מט", "Matte black", sanFin(0x33373a, 0.58)),
];
// hydroponic plastics
function pvcFin(col) {
  return smap(PVC_WHITE, { col: col, rough: 0.55 });
}
var PVCF = [
  V("white", "PVC לבן", "White PVC"),
  V("grey", "PVC אפור", "Grey PVC", pvcFin(0xb8bcbf)),
  V("black", "PVC שחור", "Black PVC", pvcFin(0x2f3336)),
  V("green", "ירוק חממה", "Greenhouse green", pvcFin(0x4f6f4a)),
];

/* -- per-model variant lists (finish family, plus shape fields) -- */
var VARIANTS = {
  /* kitchen & storage carcasses */
  base: COUNTER,
  cabsys: CARCASS,
  tall: CARCASS,
  upper: CARCASS,
  island: COUNTER,
  pantry: CARCASS,
  cooktop: COUNTER,
  vanity: COUNTER,
  nightstand: CARCASS,
  dresser: CARCASS,
  shoeCab: CARCASS,
  dressTable: CARCASS,
  desk: CARCASS,
  filingCab: CARCASS,
  sideboard: CARCASS,

  /* sink — finish AND bowl layout */
  sink: [
    V("single", "כיור נירוסטה", "Stainless, single bowl", null, { style: "inset", bowls: 1 }),
    V("double", "כיור כפול", "Double bowl", null, { style: "inset", bowls: 2, depth: 18 }),
    V("granite", "כיור גרניט", "Composite granite", counterFin(0xf1efe9, 0x3c4044, 0.3), {
      style: "inset", bowls: 1, bowlCol: 0x33373a, bowlMetal: 0.08, bowlRough: 0.55, depth: 20,
    }),
    V("farmhouse", "כיור חזית חשופה", "Farmhouse apron", carcassFin(0xf1efe9), {
      style: "farmhouse", bowls: 1, bowlCol: 0xf4f2ee, bowlMetal: 0.03, bowlRough: 0.2,
    }),
    V("vessel", "כיור מונח (אמבטיה)", "Vessel basin (bath)", null, {
      style: "vessel", bowlCol: 0xf6f7f8, depth: 13,
    }),
    V("vesselStone", "כיור אבן מונח", "Stone vessel basin", counterFin(0x6a4a30, 0x2f3336, 0.4), {
      style: "vessel", bowlCol: 0x4b4f52, depth: 14,
    }),
  ],

  /* seating */
  sofa: [
    V("classic", "קלאסית", "Classic", null, { arms: "block" }),
    V("modern", "מודרנית שטוחה", "Low-arm modern", uphFin(0x4a5257), {
      arms: "low", legs: "metal", legH: 14, seats: 3,
    }),
    V("chesterfield", "צ׳סטרפילד", "Chesterfield", uphFin(0x6d3f2c, 0.4, 0.06), {
      arms: "roll", tufted: true, legs: "taper", legH: 10, legCol: 0x4a3520,
    }),
    V("scandi", "סקנדינבית", "Scandi", uphFin(0xd9cfba), {
      arms: "low", legs: "taper", legH: 16, legCol: 0xc9a06a, seats: 3,
    }),
    V("sectionalR", "פינתית (ימין)", "Sectional (right)", uphFin(0x50585d), {
      arms: "block", chaise: "r", legs: "metal", legH: 12,
    }),
    V("sectionalL", "פינתית (שמאל)", "Sectional (left)", uphFin(0x50585d), {
      arms: "block", chaise: "l", legs: "metal", legH: 12,
    }),
    V("leather", "עור שחור", "Black leather", uphFin(0x2e3134, 0.34, 0.08), {
      arms: "block", legs: "metal", legH: 10,
    }),
  ],
  armchair: [
    V("classic", "קלאסית", "Classic"),
    V("wing", "כורסת אוזניים", "Wing chair", uphFin(0x39506e), {
      arms: "wing", legs: "taper", legH: 12, legCol: 0x4a3520,
    }),
    V("tub", "כורסת אמבט", "Tub chair", uphFin(0x8a5a34, 0.42, 0.06), {
      arms: "roll", legs: "metal", legH: 10,
    }),
    V("scandi", "סקנדינבית", "Scandi", uphFin(0xd9cfba), {
      arms: "low", legs: "taper", legH: 18, legCol: 0xc9a06a,
    }),
    V("lounge", "לאונג׳ מרופדת", "Tufted lounge", uphFin(0x3f464b), {
      arms: "block", tufted: true, legs: "hairpin", legH: 14,
    }),
  ],
  chair: [
    V("wood", "עץ", "Wood", null, { backStyle: "panel" }),
    V("slat", "משענת שלבים", "Slat back", null, { backStyle: "slat" }),
    V("hoop", "משענת מעוגלת", "Hoop back", woodFin(0x5e422a), { backStyle: "hoop", padded: true }),
    V("padded", "מרופד", "Upholstered", uphFin(0x4a5257), { padded: true, legs: "square" }),
    V("metal", "רגלי מתכת", "Metal legs", woodFin(0x2b2e31, 0.45), {
      padded: true, legs: "metal", legCol: 0x3d4348,
    }),
    V("scandi", "סקנדינבי", "Scandi", woodFin(0xd8bf97), { backStyle: "slat", legs: "taper" }),
  ],
  barstool: [
    V("steel", "נירוסטה", "Steel"),
    V("black", "שחור", "Black", smap(STEEL, { col: 0x2e3134, rough: 0.4, metal: 0.4 })),
    V("brass", "פליז", "Brass", smap(STEEL, { col: 0xb08d4a, rough: 0.3, metal: 0.9 })),
    V("wood", "עץ", "Wood", smap(STEEL, { col: 0xb98a55, rough: 0.6, metal: 0.05 })),
  ],
  officeChair: [
    V("black", "שחור", "Black"),
    V("grey", "אפור", "Grey", smap(0x2c3034, { col: 0x6b7176, rough: 0.6 }, 0x3a3f44, { col: 0x7d8388, rough: 0.6 })),
    V("white", "לבן", "White", smap(0x2c3034, { col: 0xeceae6, rough: 0.5 }, 0x3a3f44, { col: 0xd8d6d2, rough: 0.5 })),
    V("mesh", "רשת כחולה", "Blue mesh", smap(0x3a3f44, { col: 0x39506e, rough: 0.85 })),
  ],
  pouf: [
    V("tan", "עור בהיר", "Tan"),
    V("grey", "אפור", "Grey", smap(0xbf9670, { col: 0x8b9195, rough: 0.9 }, 0xb48a66, { col: 0x7d8387, rough: 0.9 }, 0x8a6a4c, { col: 0x6a7074, rough: 0.9 })),
    V("navy", "כחול", "Navy", smap(0xbf9670, { col: 0x39506e, rough: 0.9 }, 0xb48a66, { col: 0x334862, rough: 0.9 }, 0x8a6a4c, { col: 0x2b3d54, rough: 0.9 })),
    V("mustard", "חרדל", "Mustard", smap(0xbf9670, { col: 0xc79a3c, rough: 0.9 }, 0xb48a66, { col: 0xb88d34, rough: 0.9 }, 0x8a6a4c, { col: 0x96742a, rough: 0.9 })),
  ],
  bench: WOODF,
  stool: WOODF,
  recliner: UPH,
  ceilingFan: [
    V("wood", "כנפי עץ", "Wood blades"),
    V("white", "לבן", "White", woodFin(0xeeeae2, 0.6)),
    V("black", "שחור", "Black", woodFin(0x2b2e31, 0.45)),
    V("brass", "פליז", "Brass", metalFin(0xb08d4a, 0.28, 0.9)),
  ],

  /* tables */
  table: [
    V("wood", "עץ", "Wood", null, { base: "legs", legs: "square" }),
    V("trestle", "רגלי חבית", "Trestle", woodFin(0x5e422a), { base: "trestle" }),
    V("pedestal", "רגל מרכזית", "Pedestal", woodFin(0xeeeae2, 0.6), { base: "pedestal" }),
    V("industrial", "תעשייתי", "Industrial", null, { base: "frame", legCol: 0x3d4348, topCol: 0x8a6a44 }),
    V("marble", "שיש", "Marble top", null, {
      base: "pedestal", topCol: 0xeae7e0, topRough: 0.2, topT: 4, legCol: 0xd3d8db,
    }),
    V("glass", "זכוכית", "Glass top", null, {
      base: "frame", glassTop: true, topCol: 0xbcd2da, topRough: 0.05, legCol: 0x3d4348,
    }),
    V("hairpin", "רגלי סיכה", "Hairpin legs", woodFin(0xd8bf97), { base: "legs", legs: "hairpin" }),
  ],
  roundTable: WOODF,
  coffee: [
    V("wood", "עץ", "Wood"),
    V("walnut", "אגוז", "Walnut", woodFin(0x5e422a)),
    V("white", "לבן", "White", woodFin(0xeeeae2, 0.6)),
    V("black", "שחור", "Black", woodFin(0x2b2e31, 0.45)),
    V("marble", "שיש", "Marble", woodFin(0xeae7e0, 0.22)),
  ],
  sideTable: WOODF,
  console: WOODF,
  tvunit: [
    V("wood", "עץ", "Wood"),
    V("walnut", "אגוז", "Walnut", woodFin(0x5e422a)),
    V("white", "לבן", "White", woodFin(0xeeeae2, 0.6)),
    V("black", "שחור", "Black", woodFin(0x2b2e31, 0.45)),
  ],
  stairs: [
    V("wood", "עץ", "Wood"),
    V("dark", "עץ כהה", "Dark wood", smap(0xb09a76, { col: 0x6a4a30, rough: 0.6 })),
    V("white", "לבן", "White", smap(0xb09a76, { col: 0xeeeae2, rough: 0.6 })),
    V("concrete", "בטון", "Concrete", smap(0xb09a76, { col: 0xa8a6a1, rough: 0.85 })),
  ],

  /* beds */
  bed: [
    V("classic", "קלאסית", "Classic"),
    V("platform", "פלטפורמה נמוכה", "Low platform", woodFin(0x5e422a), {
      platform: true, headboard: 18,
    }),
    V("upholstered", "ראש מיטה מרופד", "Upholstered headboard", uphFin(0x4a5257), {
      upholsteredHb: true, headboard: 42, legs: "wood",
    }),
    V("fourposter", "מיטת אפיריון", "Four-poster", woodFin(0x2b2e31, 0.45), {
      posts: true, headboard: 24,
    }),
    V("storage", "עם מגירות", "With drawers", woodFin(0xeeeae2, 0.6), { drawers: true }),
    V("scandi", "סקנדינבית", "Scandi", woodFin(0xd8bf97), { legs: "taper", headboard: 26 }),
  ],
  bunk: WOODF,
  crib: [
    V("natural", "עץ טבעי", "Natural"),
    V("white", "לבן", "White", smap(0xd8c8a8, { col: 0xf2f0ec, rough: 0.6 })),
    V("grey", "אפור", "Grey", smap(0xd8c8a8, { col: 0x9aa0a4, rough: 0.6 })),
  ],
  wardrobe: [
    V("hinged", "דלתות ציר", "Hinged doors", null, { style: "hinged" }),
    V("sliding", "דלתות הזזה", "Sliding doors", null, { style: "sliding" }),
    V("mirrorSlide", "הזזה עם מראה", "Mirrored sliding", null, {
      style: "sliding", mirrorDoor: true, doorCol: 0xdfe8ec, doorRough: 0.06, doorMetal: 0.5,
    }),
    V("open", "פתוח (ללא דלתות)", "Open / walk-in", null, { style: "open" }),
    V("white", "לבן", "White", carcassFin(0xf1efe9), { style: "hinged" }),
    V("walnut", "אגוז", "Walnut", carcassFin(0x6a4a30, 0.62), { style: "sliding" }),
  ],

  /* storage & shelving */
  bookshelf: [
    V("wood", "עץ", "Wood"),
    V("cube", "קופסאות (3 טורים)", "Cube grid", null, { cols: 3, rows: 4 }),
    V("tall", "צפוף (6 מדפים)", "Six shelves", woodFin(0x5e422a), { rows: 6 }),
    V("openBack", "ללא גב", "Open back", woodFin(0xeeeae2, 0.6), { back: false }),
    V("empty", "ריק", "Empty", woodFin(0x2b2e31, 0.45), { empty: true }),
  ],
  wallShelf: WOODF,
  coatRack: [
    V("wood", "עץ", "Wood"),
    V("black", "שחור", "Black", smap(0x7a5c3e, { col: 0x2e3134, rough: 0.4, metal: 0.3 }, 0x6f5535, { col: 0x24262a, rough: 0.4, metal: 0.3 })),
    V("brass", "פליז", "Brass", smap(0x7a5c3e, { col: 0xb08d4a, rough: 0.3, metal: 0.85 }, 0x6f5535, { col: 0x9c7a3c, rough: 0.3, metal: 0.85 })),
  ],

  /* appliances */
  fridge: [
    V("steel", "נירוסטה", "Stainless steel"),
    V("white", "לבן", "White", applFin(0xf2f2f0, 0.45, 0.06)),
    V("black", "שחור", "Black", applFin(0x2a2d30, 0.35, 0.2)),
    V("graphite", "גרפיט", "Graphite", applFin(0x585e63, 0.38, 0.35)),
    V("retro", "רטרו מנטה", "Retro mint", applFin(0x8fbcae, 0.3, 0.1)),
  ],
  oven: APPL,
  dishwasher: APPL,
  washer: APPL,
  dryer: APPL,
  microwave: APPL,
  hood: [
    V("steel", "נירוסטה", "Stainless steel"),
    V("black", "שחור", "Black", smap(STEEL, { col: 0x2a2d30, rough: 0.35, metal: 0.4 })),
    V("white", "לבן", "White", smap(STEEL, { col: 0xf2f2f0, rough: 0.45, metal: 0.06 })),
    V("copper", "נחושת", "Copper", smap(STEEL, { col: 0xa9704a, rough: 0.28, metal: 0.9 })),
  ],
  wineFridge: APPL,
  coffeeMachine: APPL,
  toaster: APPL,
  kettle: APPL,
  waterHeater: APPL,
  printer: APPL,
  ac: [
    V("white", "לבן", "White"),
    V("silver", "כסוף", "Silver", smap(0xeef1f2, { col: 0xc4c9cc, rough: 0.35, metal: 0.4 })),
    V("black", "שחור", "Black", smap(0xeef1f2, { col: 0x33373a, rough: 0.4, metal: 0.2 })),
  ],
  radiator: [
    V("white", "לבן", "White"),
    V("anthracite", "אנתרציט", "Anthracite", smap(0xeef1f2, { col: 0x44494d, rough: 0.5 }, 0xe4e7e9, { col: 0x3b4044, rough: 0.5 })),
    V("chrome", "כרום", "Chrome", smap(0xeef1f2, { col: 0xc9ced1, rough: 0.2, metal: 0.8 }, 0xe4e7e9, { col: 0xbcc3c7, rough: 0.2, metal: 0.8 })),
  ],
  tv: [
    V("black", "שחור", "Black"),
    V("frame", "מסך תמונה", "Framed art TV", smap(0x6f5535, { col: 0xb98a55, rough: 0.55 }, TVB, { col: 0x1a1e22, rough: 0.4 })),
    V("silver", "כסוף", "Silver", smap(TVB, { col: 0x8f9599, rough: 0.3, metal: 0.6 })),
  ],
  speaker: [
    V("black", "שחור", "Black"),
    V("walnut", "אגוז", "Walnut", woodFin(0x5e422a)),
    V("white", "לבן", "White", woodFin(0xeeeae2, 0.6)),
  ],
  // A soundbar lives either on the console under a standing TV or bracketed on
  // the wall under a hung one — that is the choice worth exposing, not a finish.
  soundbar: [
    V("shelf", "על מזנון", "On console"),
    V("wall", "תלוי על הקיר", "Wall-mounted", null, { mountY: 92 }),
    V("wallHigh", "תלוי גבוה", "Wall-mounted, high", null, { mountY: 122 }),
    V("white", "לבן", "White", smap(0x2a2d30, { col: 0xeceae6, rough: 0.5 }, 0x3d4348, { col: 0xd8d6d2, rough: 0.85 })),
  ],
  // Screen bottom-edge heights: 100 is the usual "sofa" hang, 120 suits a
  // console underneath, 140 is the over-fireplace hang.
  tvWall: [
    V("black", "שחור", "Black"),
    V("high", "תלייה גבוהה", "High mount", null, { mountY: 140 }),
    V("low", "תלייה נמוכה", "Low mount", null, { mountY: 80 }),
    V("frameless", "מסגרת דקה", "Frameless", null, { bezel: 0.5 }),
    V("silver", "כסוף", "Silver", smap(TVB, { col: 0x8f9599, rough: 0.3, metal: 0.6 })),
  ],
  acDucted: [
    V("std", "בתקרה אקוסטית", "In ceiling void"),
    V("low", "בתוך גבס נמוך", "In a low bulkhead", null, { mountY: 214 }),
  ],
  acDiffuser: [
    V("square", "מרובע 4 כיוונים", "Square, 4-way"),
    V("linear", "ליניארי", "Linear bar", null, { linear: true }),
    V("wall", "על הקיר (גבוה)", "High on the wall", null, { mountY: 230 }),
  ],
  acReturn: [
    V("ceiling", "בתקרה", "In the ceiling"),
    V("wall", "על הקיר", "On the wall", null, { mountY: 220 }),
  ],
  acCassette: [
    V("white", "לבן", "White"),
    V("low", "תקרה נמוכה", "Low ceiling", null, { mountY: 226 }),
  ],
  acOutdoor: [
    V("ground", "על הרצפה/מרפסת", "On the floor"),
    V("bracket", "על מתלה קיר", "On a wall bracket", null, { mountY: 120 }),
    V("dark", "אפור כהה", "Dark grey", smap(0xd9dde0, { col: 0x6f757a, rough: 0.5, metal: 0.3 })),
  ],
  aquarium: [
    V("clear", "שקוף", "Clear"),
    V("planted", "שתול", "Planted", smap(GREEN, { col: 0x4f7a44, rough: 0.9 })),
    V("reef", "שונית", "Reef", smap(GREEN, { col: 0xc06a7a, rough: 0.8 })),
  ],

  /* bathroom */
  toilet: [
    V("floor", "אסלה רגילה", "Close-coupled", null, {}),
    V("wallHung", "אסלה תלויה", "Wall-hung", null, { wallHung: true }),
    V("black", "שחור מט", "Matte black", sanFin(0x33373a, 0.58), {}),
    V("wallHungBlack", "תלויה שחורה", "Wall-hung, black", sanFin(0x33373a, 0.58), {
      wallHung: true, ductCol: 0x4a4e51,
    }),
  ],
  bathtub: [
    V("alcove", "אמבטיה משולבת", "Alcove", null, {}),
    V("screen", "עם מחיצת זכוכית", "With bath screen", null, { screen: true }),
    V("freestanding", "אמבטיה חופשית", "Freestanding oval", null, { freestanding: true }),
    V("blackFree", "חופשית שחורה", "Freestanding, black", null, {
      freestanding: true, shellCol: 0x33373a,
    }),
  ],
  shower: [
    V("square", "מקלחון מרובע", "Square enclosure", null, {}),
    V("quadrant", "מקלחון פינתי מעוגל", "Quadrant", null, { quadrant: true }),
    V("walkIn", "מקלחת פתוחה", "Walk-in wet room", null, { walkIn: true }),
    V("black", "פרופיל שחור", "Black frame", null, { frameCol: 0x33373a }),
  ],
  bidet: SANITARY,
  pedestalSink: SANITARY,
  towelRail: [
    V("chrome", "כרום", "Chrome"),
    V("black", "שחור מט", "Matte black", smap(0xc6cccf, { col: 0x33373a, rough: 0.55, metal: 0.3 })),
    V("brass", "פליז", "Brass", smap(0xc6cccf, { col: 0xb08d4a, rough: 0.3, metal: 0.9 })),
  ],
  mirror: [
    V("wood", "מסגרת עץ", "Wood frame"),
    V("black", "מסגרת שחורה", "Black frame", woodFin(0x2b2e31, 0.45)),
    V("brass", "מסגרת פליז", "Brass frame", smap(WOOD, { col: 0xb08d4a, rough: 0.3, metal: 0.9 })),
    V("white", "מסגרת לבנה", "White frame", woodFin(0xeeeae2, 0.6)),
  ],
  floorMirror: [
    V("wood", "מסגרת עץ", "Wood frame"),
    V("black", "מסגרת שחורה", "Black frame", woodFin(0x2b2e31, 0.45)),
    V("brass", "מסגרת פליז", "Brass frame", smap(WOOD, { col: 0xb08d4a, rough: 0.3, metal: 0.9 })),
  ],

  /* lighting */
  ceilingLight: [
    V("warm", "אור חם", "Warm"),
    V("white", "אור ניטרלי", "Neutral white", smap(0xffe7bb, { col: 0xf4f6f8 }, 0xfff3d2, { col: 0xf8fafc }, 0xffe6a8, { col: 0xeef2f6 })),
    V("blackTrim", "מסגרת שחורה", "Black trim", smap(0xeef0ee, { col: 0x33373a, rough: 0.4 })),
  ],
  pendant: [
    V("cone", "חרוט", "Cone", null, { shape: "cone" }),
    V("dome", "כיפה", "Dome", null, { shape: "dome" }),
    V("globe", "כדור זכוכית", "Glass globe", null, { shape: "globe" }),
    V("drum", "תוף בד", "Fabric drum", null, { shape: "drum" }),
    V("cage", "כלוב תעשייתי", "Industrial cage", null, { shape: "cage" }),
    V("brass", "כיפת פליז", "Brass dome", null, {
      shape: "dome", shadeCol: 0xb08d4a, shadeMetal: 0.9, shadeRough: 0.28,
    }),
    V("longDrop", "תלייה ארוכה", "Long drop", null, { shape: "cone", drop: 70 }),
  ],
  chandelier: LAMPM,
  floorLamp: [
    V("column", "עמוד", "Column", null, { style: "column" }),
    V("tripod", "חצובה", "Tripod", null, { style: "tripod" }),
    V("arc", "קשת", "Arc", null, { style: "arc" }),
    V("globe", "כדור", "Globe", null, { style: "globe" }),
    V("drum", "תוף", "Drum shade", null, { style: "drum" }),
    V("brass", "פליז", "Brass", metalFin(0xb08d4a, 0.28, 0.9), { style: "column" }),
  ],
  tableLamp: LAMPM,
  wallLamp: LAMPM,
  trackLight: LAMPM,
  lightStrip: [
    V("warm", "לבן חם", "Warm white"),
    V("cool", "לבן קר", "Cool white", smap(0xcccccc, { col: 0xdfe8f0 })),
  ],

  /* decor & misc */
  rug: [
    V("plain", "חלק", "Plain border"),
    V("medallion", "מדליון", "Medallion", null, { medallion: true }),
    V("stripes", "פסים", "Striped kilim", null, { stripes: true, innerCol: 0x8f7f6a }),
    V("shag", "שאגי", "Shag", null, { shag: true, innerCol: 0xd8cbb6 }),
    V("round", "עגול", "Round", null, { round: true }),
    V("grey", "אפור", "Grey", smap(RUGC, { col: 0x8b8f92, rough: 1 }), { innerCol: 0x9ca0a3 }),
    V("blue", "כחול", "Blue", smap(RUGC, { col: 0x4f6a86, rough: 1 }), { innerCol: 0x5f7a96 }),
  ],
  plant: [
    V("green", "ירוק", "Green"),
    V("dark", "ירוק כהה", "Deep green", smap(0x7da064, { col: 0x4f7048 }, 0x638554, { col: 0x3d5a3a })),
    V("dry", "ענף יבש", "Dried", smap(0x7da064, { col: 0xb2a06a }, 0x638554, { col: 0x9c8a58 })),
    V("whitePot", "עציץ לבן", "White pot", smap(0xae8b67, { col: 0xf0eee8, rough: 0.5 }, 0x6b5536, { col: 0xd8d4cc, rough: 0.5 })),
  ],
  art: [
    V("abstract", "אבסטרקט", "Abstract"),
    V("mono", "שחור-לבן", "Monochrome", smap(0x4a7a8c, { col: 0x2e3134 }, 0xc06a4a, { col: 0x8f9599 }, 0xd8b76a, { col: 0xe8e6e0 })),
    V("warm", "גוני אדמה", "Earth tones", smap(0x4a7a8c, { col: 0xa9603f }, 0xc06a4a, { col: 0xc79a3c }, 0xd8b76a, { col: 0x8a6a4c })),
  ],
  fireplace: [
    V("stone", "אבן", "Stone"),
    V("modern", "מודרני שחור", "Modern black", smap(0x8a8480, { col: 0x33373a, rough: 0.5 }, 0x5e5a56, { col: 0x24272a, rough: 0.5 })),
    V("white", "לבן קלאסי", "Classic white", smap(0x8a8480, { col: 0xefece6, rough: 0.6 }, 0x5e5a56, { col: 0xdcd8d0, rough: 0.6 })),
  ],
  piano: [
    V("white", "לבן", "White"),
    V("black", "שחור מלוטש", "Polished black", smap(0xf5f2ea, { col: 0x1a1c1e, rough: 0.12, metal: 0.2 })),
    V("walnut", "אגוז", "Walnut", smap(0xf5f2ea, { col: 0x5e422a, rough: 0.3 })),
  ],
  clock: [
    V("black", "שחור", "Black"),
    V("wood", "עץ", "Wood", woodFin(0x5e422a)),
    V("brass", "פליז", "Brass", smap(WOOD, { col: 0xb08d4a, rough: 0.3, metal: 0.9 })),
  ],
  curtain: [
    V("linen", "פשתן", "Linen"),
    V("grey", "אפור", "Grey", smap(FABRIC, { col: 0x8b8f92, rough: 0.95 })),
    V("navy", "כחול", "Navy", smap(FABRIC, { col: 0x39506e, rough: 0.95 })),
    V("blackout", "האפלה", "Blackout", smap(FABRIC, { col: 0x3a3d40, rough: 0.98 })),
  ],
  whiteboard: [
    V("white", "לוח לבן", "Whiteboard"),
    V("black", "לוח גיר", "Blackboard", smap(0xf6f7f8, { col: 0x2c3230, rough: 0.75 })),
  ],
  laundryBasket: [
    V("wicker", "נצרים", "Wicker"),
    V("white", "לבן", "White", smap(0xb98a55, { col: 0xf0eee8, rough: 0.55 })),
    V("grey", "אפור", "Grey", smap(0xb98a55, { col: 0x8b8f92, rough: 0.6 })),
  ],

  /* hydroponics */
  nft_pipe_75: PVCF,
  nft_pipe_110: PVCF,
  nft_pipe_160: PVCF,
  nft_square_12x12: PVCF,
  rdwc_header: PVCF,
  tower_commercial: PVCF,
  tower_diy_pvc: PVCF,
  water_reservoir_60l: PVCF,
  ebb_flow_tray: PVCF,
  dwc_bucket: [
    V("black", "דלי שחור", "Black bucket"),
    V("white", "דלי לבן", "White bucket", smap(BLACK_PLASTIC, { col: 0xf0eee8, rough: 0.75 }, 0x111111, { col: 0xd8d6d0, rough: 0.8 })),
    V("green", "דלי ירוק", "Green bucket", smap(BLACK_PLASTIC, { col: 0x3f5f3a, rough: 0.8 })),
  ],
  water_chiller: [
    V("black", "שחור", "Black"),
    V("white", "לבן", "White", smap(BLACK_PLASTIC, { col: 0xf0eee8, rough: 0.5 })),
    V("steel", "נירוסטה", "Stainless", smap(BLACK_PLASTIC, { col: 0xb4bcc1, rough: 0.35, metal: 0.6 })),
  ],
  grow_tent: [
    V("silver", "שלדה כסופה", "Silver frame"),
    V("black", "שלדה שחורה", "Black frame", smap(ALUMINUM, { col: 0x2e3134, rough: 0.5, metal: 0.4 })),
  ],
  led_grow_light: [
    V("silver", "גוף כסוף", "Silver body"),
    V("black", "גוף שחור", "Black body", smap(ALUMINUM, { col: 0x2e3134, rough: 0.5, metal: 0.4 })),
  ],
  shade_net: [
    V("black", "רשת שחורה", "Black net"),
    V("green", "רשת ירוקה", "Green net", smap(0x1a1a1a, { col: 0x3f5f3a, rough: 0.9 })),
    V("white", "רשת לבנה", "White net", smap(0x1a1a1a, { col: 0xe4e2dc, rough: 0.9 })),
  ],

  /* computers */
  desktop_pc: [
    V("black", "שחור", "Black"),
    V("white", "לבן", "White", smap(0x2a2c2e, { col: 0xeceae6, rough: 0.4 }, 0x1a1c1e, { col: 0xdedcd8, rough: 0.45 })),
    V("rgb", "גיימינג", "Gaming", smap(0x111111, { col: 0x1a1c1e, rough: 0.3 }, 0x2a2c2e, { col: 0x2b3a6e, rough: 0.3 })),
  ],
  laptop: [
    V("silver", "כסוף", "Silver"),
    V("space", "אפור חלל", "Space grey", smap(0xc0c4c8, { col: 0x6b7176, rough: 0.35, metal: 0.5 }, 0xadb1b5, { col: 0x5f656a, rough: 0.35, metal: 0.5 })),
  ],
  monitor: [
    V("black", "שחור", "Black"),
    V("white", "לבן", "White", smap(0x2a2c2e, { col: 0xeceae6, rough: 0.4 }, 0x1a1c1e, { col: 0xdedcd8, rough: 0.45 })),
  ],
};

Object.keys(VARIANTS).forEach(function (k) {
  if (FURN[k]) FURN[k].variants = VARIANTS[k];
});

