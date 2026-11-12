import { applyCabinetLayoutEdits } from "./core/cabinet_parts.js";
// Modular cabinet system ("מערכת ארונות") — carcass, internal division,
// doors, drawers, shelves, rails and hardware, all generated from one spec
// that re-flows when the piece is resized.
//
// The numbers baked in here are ordinary cabinetmaking practice for 18 mm
// melamine carcass work as it is built in Israel / Europe: 60 cm deep
// wardrobes, 90 cm max unsupported shelf span, 150 cm clear for a long hang,
// 35-40 cm between folded-clothes shelves, 90 cm worktop, 15 cm plinth on
// kitchen bases, and so on. Every one of them is a *default*, editable per
// cabinet from the designer overlay (ui_cabinet.js).
//
// Spec, stored on the item as `it.cab` (rides along in serialize/history for
// free, since items are JSON):
//   { preset, fam, panel, back, plinth, plinthType, gap, open,
//     cols: [ { w, fixed, door:{t,leaves,hinge}, secs:[ {t,h,fixed,...} ] } ],
//     hw:  { handle, finish, hinge, slide, rail, led, softClose, ... } }
//
// One layout pass (`layoutCab`) turns that into plain geometry, and the 3D
// builder, the elevation editor, the cut list and the price all read it — so
// what you see in the drawing is what gets built and what gets costed.

import { S, fin } from "./state.js";
import { getLang } from "./i18n.js";
import {
  defaultStock, defaultBand, defaultProfile, resolveSheet, sheetById,
  bandById, profileById, perM2, bandPPM, profilePPM, laborRate,
} from "./stock.js";
import {
  cabSummary, carcassLabel, doorLabel, famLabel, famShort, finishLabel,
  frontLabel, hwLabel, kindLabel, planCab, presetLabel, presetNote,
  roleLabelHe, secLabel,
} from "./cabinet/labels_plan.js";
import {
  bandMeters, boxCount, cabPrice, cabQuote, cabinetDoorSwings, checkCab,
  doorSweeps, hardwareList, profileMeters,
} from "./cabinet/pricing.js";
import {
  addHandle, bandLen, boardWeight, countHardware, cutList, drillPlan,
  foldingLeaf, hingeCount, leafWeight, partDims, sheetFor, stockRole,
} from "./cabinet/hardware.js";
import {
  doorRuns, famOf, getAccessoryOpen, getDoorOpen, getInteriorOpen, layoutCab,
  sectionOpen, specOf,
} from "./cabinet/layout.js";
import {
  defaultPreset, innerOf, makeBlankSpec, makeSpec, normalizeSpec, presetById,
} from "./cabinet/presets.js";
export { defaultPreset, innerOf, makeBlankSpec, makeSpec, normalizeSpec, presetById };
export { famOf, getAccessoryOpen, getDoorOpen, getInteriorOpen, layoutCab, sectionOpen, specOf };
export { bandLen, boardWeight, cutList, drillPlan, hingeCount, leafWeight, partDims, sheetFor, stockRole };
export { bandMeters, boxCount, cabPrice, cabQuote, cabinetDoorSwings, checkCab, doorSweeps, hardwareList, profileMeters };
export { cabSummary, carcassLabel, doorLabel, famLabel, famShort, finishLabel, frontLabel, hwLabel, kindLabel, planCab, presetLabel, presetNote, roleLabelHe, secLabel };
// for js/cabinet/labels_plan.js (live bindings: it sees every reassignment)
export { he, planMemo };
// for js/cabinet/pricing.js (live bindings: it sees every reassignment)
export { EXTRA_PRICE, FRONT_ROLES, MAT_PRICE, YIELD, axisOf };
// for js/cabinet/hardware.js (live bindings: it sees every reassignment)
export { NO_BAND };
// for js/cabinet/layout.js (live bindings: it sees every reassignment)
export { sec };
// for js/cabinet/presets.js (live bindings: it sees every reassignment)
export { door, inc_partSeq };

function he(a, b) {
  return getLang() === "en" ? b : a;
}

/* ========================= standards ========================= */

export const STD = {
  panel: 1.8, // carcass / shelf board — 18 mm melamine
  back: 0.8, // back panel — 8 mm hardboard, rebated
  gap: 0.3, // reveal between door / drawer fronts
  doorT: 1.8, // door leaf thickness
  slideTrack: 8, // depth eaten by a sliding-door track set
  maxSpan: 90, // longest unsupported 18 mm shelf before it sags
  maxBox: 120, // widest carcass built as one box — lorry, doorway, stairs
  maxTop: 300, // longest single piece of worktop before it needs a joint
  cornerFront: 45, // the diagonal door on a corner unit — 45 cm is the usual
  maxDoor: 70, // widest comfortable hinged leaf — over this, a pair
  minCol: 30, // narrowest useful column
  minSec: 12, // shortest useful compartment
  shelfSpace: 36, // folded clothes
  bookSpace: 32, // books
  shoeSpace: 19, // shoes, on a tilted shelf
  floatSpan: 110, // longest floating shelf on concealed brackets, in 38 mm stock
  floatT: 3.8, // a floating shelf reads as a slab, not as a board
  drawerH: 21, // default drawer front
  hangLong: 150, // clear needed for coats / dresses
  hangShort: 100, // clear needed for shirts / folded trousers
  railDrop: 6, // rail centre below the compartment top
  toeInset: 5, // how far a recessed plinth sits back
};

// Cabinet families — the starting dimensions and the rules that go with them.
export const FAM = {
  /* No family at all: a box with the dimensions you give it and not one
     opinion about what belongs in it — no plinth, no worktop, no standard
     depth, and (because it is absent from SEC_FAM / DOOR_FAM) every
     compartment and every front counts as usual here. The starting point for
     something the catalogue has no name for. */
  free: { sHe: "ללא סוג", sEn: "Free-form", he: "ארון חופשי (ללא סוג)", en: "Free-form (no type)", w: 120, d: 60, h: 200, plinth: 0, module: 90, space: 34, preset: "w_classic", icon: "ph-selection-plus" },
  wardrobe: { sHe: "בגדים", sEn: "Wardrobe", he: "ארון בגדים", en: "Wardrobe", w: 200, d: 60, h: 240, plinth: 8, module: 90, space: 36, preset: "w_classic", icon: "ph-coat-hanger" },
  walkin: { sHe: "חדר ארונות", sEn: "Walk-in", he: "חדר ארונות", en: "Walk-in closet", w: 240, d: 55, h: 240, plinth: 8, module: 80, space: 36, preset: "w_walkin", icon: "ph-door-open" },
  hall: { sHe: "כניסה", sEn: "Entry", he: "ארון כניסה", en: "Hall / entry unit", w: 140, d: 45, h: 220, plinth: 8, module: 70, space: 34, preset: "w_hall", icon: "ph-coat-hanger" },
  kitchenBase: { sHe: "מטבח תחתון", sEn: "Base unit", he: "ארון מטבח תחתון", en: "Kitchen base unit", w: 60, d: 60, h: 90, plinth: 14, module: 60, space: 32, preset: "k_base_drawers", top: 4, icon: "ph-lockers" },
  kitchenUpper: { sHe: "מטבח עליון", sEn: "Wall unit", he: "ארון מטבח עליון", en: "Kitchen wall unit", w: 60, d: 35, h: 72, plinth: 0, module: 60, space: 32, preset: "k_upper", elev: 145, icon: "ph-lockers" },
  kitchenTall: { sHe: "מזווה", sEn: "Tall/pantry", he: "עמודת מטבח / מזווה", en: "Tall kitchen / pantry", w: 60, d: 60, h: 220, plinth: 14, module: 60, space: 32, preset: "k_tall", icon: "ph-lockers" },
  kitchenCorner: { sHe: "פינה", sEn: "Corner", he: "ארון פינה אלכסוני", en: "Diagonal corner unit", w: 90, d: 90, h: 90, plinth: 14, module: 90, space: 34, preset: "k_corner", top: 4, icon: "ph-flow-arrow" },
  vanity: { sHe: "אמבטיה", sEn: "Vanity", he: "ארון אמבטיה", en: "Bathroom vanity", w: 80, d: 46, h: 80, plinth: 0, module: 80, space: 30, preset: "bath_vanity", icon: "ph-bathtub" },
  bookcase: { sHe: "ספרייה", sEn: "Bookcase", he: "ספרייה", en: "Bookcase", w: 120, d: 32, h: 200, plinth: 6, module: 80, space: 32, preset: "book_open", icon: "ph-books" },
  shelving: { sHe: "מדפים", sEn: "Shelving", he: "מדפים פתוחים", en: "Open shelving", w: 120, d: 28, h: 120, plinth: 0, module: 90, space: 34, preset: "sh_float", elev: 90, icon: "ph-rows" },
  tvUnit: { sHe: "טלוויזיה", sEn: "TV unit", he: "יחידת טלוויזיה", en: "TV unit", w: 200, d: 45, h: 55, plinth: 6, module: 70, space: 30, preset: "tv_unit", icon: "ph-television" },
  office: { sHe: "משרדי", sEn: "Office", he: "ארון משרדי", en: "Office storage", w: 100, d: 45, h: 200, plinth: 6, module: 90, space: 33, preset: "office", icon: "ph-folders" },
  laundry: { sHe: "שירות", sEn: "Utility", he: "ארון שירות", en: "Utility / laundry", w: 120, d: 60, h: 220, plinth: 8, module: 60, space: 36, preset: "laundry", icon: "ph-washing-machine" },
  shoe: { sHe: "נעליים", sEn: "Shoes", he: "ארון נעליים", en: "Shoe cabinet", w: 100, d: 38, h: 120, plinth: 6, module: 60, space: 19, preset: "shoe", icon: "ph-sneaker" },
};

/* Compartment ("חלוקה") catalogue. `min`/`def` are clear heights in cm,
   `flex` marks the ones that absorb a size change (a drawer stack keeps its
   height when the cabinet grows — the hanging section above it gets taller). */
export const SEC = {
  hang: { he: "תלייה ארוכה", en: "Long hanging", col: "#7ea8d8", min: 120, def: 160, flex: 1, icon: "ph-coat-hanger" },
  hangS: { he: "תלייה קצרה", en: "Short hanging", col: "#a2c4e8", min: 85, def: 105, flex: 1, icon: "ph-coat-hanger" },
  hang2: { he: "תלייה כפולה", en: "Double hanging", col: "#5b8bc0", min: 190, def: 205, flex: 1, icon: "ph-coat-hanger" },
  shelves: { he: "מדפים", en: "Shelves", col: "#cbb894", min: 25, def: 110, flex: 1, icon: "ph-rows" },
  drawers: { he: "מגירות", en: "Drawers", col: "#dda06a", min: 15, def: 64, flex: 0, icon: "ph-list-dashes" },
  box: { he: "תא עליון / אחסון", en: "Storage box", col: "#bfc6cc", min: 20, def: 45, flex: 0, icon: "ph-package" },
  open: { he: "תא פתוח", en: "Open niche", col: "#e3e7ea", min: 15, def: 40, flex: 1, icon: "ph-square" },
  pullout: { he: "סלים נשלפים", en: "Pull-out baskets", col: "#b8c9a8", min: 40, def: 80, flex: 0, icon: "ph-basket" },
  shoe: { he: "מדפי נעליים", en: "Shoe shelves", col: "#c9a9a0", min: 38, def: 96, flex: 1, icon: "ph-sneaker" },
  trouser: { he: "מתלה מכנסיים", en: "Trouser rack", col: "#9fb8c9", min: 30, def: 45, flex: 0, icon: "ph-hand-tap" },
  laundry: { he: "סל כביסה", en: "Laundry hamper", col: "#c8b6d4", min: 45, def: 65, flex: 0, icon: "ph-basket" },
  safe: { he: "כספת", en: "Safe", col: "#8d9298", min: 25, def: 35, flex: 0, icon: "ph-lock-key" },
  tv: { he: "נישת טלוויזיה", en: "TV niche", col: "#6e777d", min: 40, def: 70, flex: 1, icon: "ph-television" },
  appl: { he: "נישת מכשיר", en: "Appliance niche", col: "#aeb6bb", min: 55, def: 88, flex: 0, icon: "ph-washing-machine" },
};

// Door / front types, per column.
export const DOORS = {
  none: { he: "ללא דלת (פתוח)", en: "Open — no door" },
  hinged: { he: "דלת צירים", en: "Hinged door" },
  glass: { he: "דלת זכוכית", en: "Glass door" },
  mirror: { he: "דלת מראה", en: "Mirror door" },
  sliding: { he: "דלת הזזה", en: "Sliding door" },
  folding: { he: "דלת אקורדיון", en: "Bi-fold door" },
  lift: { he: "דלת מתרוממת", en: "Lift-up door" },
  drawer: { he: "חזיתות מגירה", en: "Drawer fronts only" },
};

/* Front (door / drawer face) styles. `flat` is the plain slab everyone starts
   from; the rest are what a joinery shop actually offers, built from real
   parts so they read correctly from any angle and land on the cutting list. */
export const FRONTS = {
  flat: { he: "חלקה", en: "Flat slab", extra: 1 },
  shaker: { he: "מסגרת (שייקר)", en: "Shaker frame", extra: 1.45 },
  groove: { he: "חריצים אופקיים", en: "Grooved", extra: 1.25 },
  slat: { he: "קנלורה (סרגלים)", en: "Reeded / slatted", extra: 1.6 },
};

/* Finishes. `null` (the first entry) means "follow the piece's style variant",
   so a cabinet keeps behaving like every other model in the catalogue until
   you deliberately pick a colour for the carcass or the fronts separately. */
export const FINISH = {
  auto: { he: "לפי גרסת הפריט", en: "From item style", col: null },
  white: { he: "לבן מט", en: "Matte white", col: 0xf1efe9, rough: 0.62 },
  gloss: { he: "לבן מבריק", en: "White gloss", col: 0xfafaf8, rough: 0.14 },
  cream: { he: "שמנת", en: "Cream", col: 0xe8ddc8, rough: 0.6 },
  oak: { he: "אלון טבעי", en: "Natural oak", col: 0xcaa877, rough: 0.66 },
  walnut: { he: "אגוז כהה", en: "Dark walnut", col: 0x6a4a30, rough: 0.6 },
  birch: { he: "ליבנה בהיר", en: "Pale birch", col: 0xdcc49b, rough: 0.66 },
  graphite: { he: "גרפיט", en: "Graphite", col: 0x454a4e, rough: 0.5 },
  black: { he: "שחור מט", en: "Matte black", col: 0x26292b, rough: 0.55 },
  sage: { he: "ירוק מרווה", en: "Sage green", col: 0x8b9b85, rough: 0.6 },
  navy: { he: "כחול נייבי", en: "Navy", col: 0x33445c, rough: 0.58 },
  clay: { he: "חימר", en: "Clay", col: 0xb08a72, rough: 0.62 },
};

/* Column roles. Most columns hold things; a run against a wall also needs the
   two that do not — the scribe filler that closes the gap, and the blind
   corner whose front is covered by the cabinet around the corner. */
export const COLKIND = {
  normal: { he: "עמודה רגילה", en: "Storage column" },
  filler: { he: "פנל מילוי", en: "Filler / scribe panel" },
  blind: { he: "פינה עיוורת", en: "Blind corner" },
};

/* How much carcass there is. `full` is a closed box; `open` is the same box
   with no back, the way an open bookcase or a room divider is built; `float` is
   not a box at all — bare shelves on concealed brackets, which is what people
   mean by "מדפים" when they do not mean a cabinet. */
export const CARCASS = {
  full: { he: "גוף סגור", en: "Closed carcass" },
  open: { he: "גוף בלי גב", en: "Open back" },
  float: { he: "מדפים צפים (ללא גוף)", en: "Floating shelves" },
};
export function isFloat(sp) {
  return !!sp && sp.carcass === "float";
}

/* פרזול — hardware. Prices are ₪ per unit (or per metre where noted) and are
   what feeds the cost panel / shopping list. */
export const HW = {
  handle: {
    bar: { he: "ידית מוט", en: "Bar handle", price: 25 },
    knob: { he: "כפתור", en: "Knob", price: 15 },
    edge: { he: "ידית פרופיל (J)", en: "J-profile", price: 45 },
    gola: { he: "גולה שקועה", en: "Gola recess", price: 70 },
    leather: { he: "רצועת עור", en: "Leather pull", price: 55 },
    push: { he: "פוש (ללא ידית)", en: "Push-to-open", price: 0 },
  },
  finish: {
    steel: { he: "ניקל מוברש", en: "Brushed nickel", col: 0xb9c0c4, metal: 0.85, rough: 0.32 },
    black: { he: "שחור מט", en: "Matte black", col: 0x2b2e30, metal: 0.5, rough: 0.55 },
    chrome: { he: "כרום", en: "Chrome", col: 0xd6dbde, metal: 0.95, rough: 0.1 },
    brass: { he: "פליז", en: "Brass", col: 0xb08d4a, metal: 0.9, rough: 0.28 },
    white: { he: "לבן", en: "White", col: 0xf0efec, metal: 0.1, rough: 0.5 },
    wood: { he: "עץ", en: "Wood", col: 0x8a6338, metal: 0.02, rough: 0.7 },
  },
  hinge: {
    soft: { he: "ציר סמוי בלימה", en: "Soft-close concealed", price: 14 },
    std: { he: "ציר סמוי רגיל", en: "Standard concealed", price: 7 },
    push: { he: "ציר פוש", en: "Push-open hinge", price: 22 },
    wide: { he: "ציר 165° (פינתי)", en: "165° corner hinge", price: 30 },
  },
  slide: {
    softFull: { he: "מסילת בלימה מלאה", en: "Soft-close full extension", price: 75 },
    tandem: { he: "מסילה סמויה (טנדם)", en: "Concealed undermount", price: 110 },
    ball: { he: "מסילת כדוריות", en: "Ball-bearing", price: 45 },
    roller: { he: "מסילת גלגלית", en: "Roller runner", price: 22 },
  },
  rail: {
    oval: { he: "מוט אובלי כרום", en: "Oval chrome rail", price: 28 },
    round: { he: "מוט עגול", en: "Round rail", price: 18 },
    led: { he: "מוט מואר LED", en: "LED-lit rail", price: 190 },
    down: { he: "מוט ירידה (פנטוגרף)", en: "Pull-down rail", price: 420 },
  },
};

// ₪ per m² of finished board, by front material.
/* Fallback ₪ per m² of finished board, used only when a design names a sheet
   that is no longer in the catalogue. Real pricing comes from stock.js. */
const MAT_PRICE = { carcass: 95, front: 210, top: 480, lacquer: 480, glass: 620, mirror: 390, back: 45 };
/* Fittings priced per unit. The appliance and the television themselves are
   deliberately absent: a joiner builds the niche, the customer buys the machine,
   and putting a fridge on the joinery quote would be wrong. */
const EXTRA_PRICE = { led: 130, mirrorInside: 220, safe: 620, hamper: 180, trouser: 160, basket: 95, slidingKit: 380, lock: 90, bracket: 34, tvBracket: 240, grommet: 22, leg: 18 };

/* ========================= corner units =========================

   The one shape a run cannot be made of rectangles: where two runs meet at a
   right angle, something has to fill the corner. `COLKIND.blind` covers the
   cheap answer (let the neighbour's front run past and write the corner off as
   dead space); this is the other one — a unit whose front is cut across the
   corner at 45°, with a single door on the diagonal and pentagon shelves that
   reach right into it.

   Its footprint is the square w×d with the corner opposite the walls cut away.
   Local frame: the walls are at the back (z = -d/2) and the left (x = -w/2), so
   the diagonal cuts the front-right corner and the two carcass sides face the
   neighbouring runs. `sp.cornerFront` is the finished width of that diagonal. */
export function isCorner(sp) {
  return !!sp && sp.corner === "diag";
}

/* Where the diagonal cuts, as a distance back along each side from the cut
   corner: a front of width F meets both sides at F/√2. */
export function cornerCut(sp, w, d) {
  var f = sp.cornerFront || STD.cornerFront;
  return Math.min(Math.min(w, d) - 12, f / Math.SQRT2);
}

/* The footprint, anticlockwise from the wall corner. Used by the 3D pentagon
   parts, the plan symbol and the shelf sizes alike, so they cannot disagree. */
export function cornerPoly(sp, w, d, inset) {
  var i = inset || 0,
    hw = w / 2 - i,
    hd = d / 2 - i,
    c = cornerCut(sp, w - 2 * i, d - 2 * i);
  return [
    { x: -hw, z: -hd }, // the wall corner
    { x: hw, z: -hd },
    { x: hw, z: hd - c }, // the diagonal starts
    { x: hw - c, z: hd }, // and ends
    { x: -hw, z: hd },
  ];
}

/* ========================= runs of adjacent units =========================

   A kitchen is not a row of independent cabinets. Units that stand side by side
   in line share one worktop, one continuous plinth and one worked stone edge —
   and until this existed, every unit built its own worktop with a 1.5 cm
   overhang on both sides, so two neighbours overlapped by 3 cm and each was
   billed for two end returns that are actually buried inside the run. A 3 m
   kitchen of five units quoted about nine metres of polished edge where the
   honest answer is a little over four.

   The run is derived, never stored: it falls out of where the pieces stand, so
   dragging a unit against its neighbour merges their tops and the price follows.
   `layoutCab` asks for it by item; everything else reads it off the layout. */

/* An item's own width axis in world space. view3d places a piece with
   `rotation.y = -rot·π/180`, which sends its local +x to (cos r, sin r). */
function axisOf(it) {
  var r = ((it.rot || 0) * Math.PI) / 180;
  return { c: Math.cos(r), s: Math.sin(r) };
}
function alongOf(it) {
  var a = axisOf(it);
  return { u: it.x * a.c + it.z * a.s, v: -it.x * a.s + it.z * a.c };
}

/* Two units belong to the same run when they stand in line, touch, and agree
   about everything a shared worktop needs to be flush: rotation, depth, height,
   mounting height and the worktop itself. Anything else is a step, and a step
   is two runs. */
function sameRun(a, b) {
  var sa = a.cab,
    sb = b.cab;
  if (!sa || !sb) return false;
  var turn = ((((a.rot || 0) - (b.rot || 0)) % 360) + 360) % 360;
  if (Math.min(turn, 360 - turn) > 0.5) return false;
  if (Math.abs(a.d - b.d) > 1 || Math.abs(a.h - b.h) > 1) return false;
  if (Math.abs((sa.elev || 0) - (sb.elev || 0)) > 1) return false;
  if (Math.abs((sa.top || 0) - (sb.top || 0)) > 0.2) return false;
  if ((sa.stock || {}).top !== (sb.stock || {}).top) return false;
  if (isFloat(sa) !== isFloat(sb)) return false;
  // a corner unit turns the run: its worktop and plinth are its own
  if (isCorner(sa) || isCorner(sb)) return false;
  var pa = alongOf(a),
    pb = alongOf(b);
  if (Math.abs(pa.v - pb.v) > 1) return false; // not on the same line
  // the gap between the facing edges, which may be a hair either way
  var gap = Math.abs(pa.u - pb.u) - (a.w + b.w) / 2;
  return gap < 2;
}

/* Where this unit sits in its run. A unit on its own is a run of one, which is
   the old behaviour exactly. Cheap enough to call per layout: the scan is over
   the modular cabinets in the plan, of which there are never many. */
export function cabRun(it, items) {
  var list = (items || S.items || []).filter(function (x) {
    return x && x.cab && x !== it;
  });
  var group = [it];
  // grow the run outwards until nothing else touches it
  var added = true;
  while (added) {
    added = false;
    for (var i = list.length - 1; i >= 0; i--) {
      for (var j = 0; j < group.length; j++) {
        if (sameRun(group[j], list[i])) {
          group.push(list[i]);
          list.splice(i, 1);
          added = true;
          break;
        }
      }
    }
  }
  group.sort(function (a, b) {
    return alongOf(a).u - alongOf(b).u;
  });
  var idx = group.indexOf(it),
    span = group.reduce(function (s, x) {
      return s + x.w;
    }, 0),
    before = 0;
  for (var k = 0; k < idx; k++) before += group[k].w;
  return {
    n: group.length,
    i: idx,
    first: idx === 0,
    last: idx === group.length - 1,
    span: span, // the whole run's width
    before: before, // how much of it lies before this unit
    key: group
      .map(function (x) {
        return Math.round(alongOf(x).u) + ":" + Math.round(x.w);
      })
      .join("|"),
  };
}

/* ========================= what fits where =========================

   The space each choice actually needs. These are the numbers a joiner would
   refuse the job over rather than merely grumble about: a hanging rail in a
   40 cm deep carcass, a drawer wider than any runner made, a television niche
   in a 30 cm column, a sliding door on a single-column cabinet.

   Two consumers, one table. The designer greys out whatever cannot fit and says
   why, so you never pick something that silently builds nothing — and checkCab
   flags a design that arrives from a saved file already violating it.

   The division of labour matters: this table is "impossible", `checkCab` is
   "will disappoint". A double hanging rail in a compartment that is currently
   35 cm tall is not impossible — the compartment re-fits when you pick it — so
   height is tested against the whole column, not against the compartment. Width
   and depth are set by the cabinet and cannot be fixed by choosing. */

export const SEC_FIT = {
  hang: { w: 40, h: 150, d: 50 },
  hangS: { w: 40, h: 85, d: 50 },
  hang2: { w: 40, h: 190, d: 50 },
  shelves: { w: 20, h: 25, d: 15 },
  drawers: { w: 25, h: 15, d: 30, wMax: 120 },
  box: { w: 20, h: 20, d: 15 },
  open: { w: 10, h: 15, d: 8 },
  pullout: { w: 30, h: 40, d: 45, wMax: 90 },
  shoe: { w: 25, h: 38, d: 28 },
  trouser: { w: 35, h: 30, d: 45 },
  laundry: { w: 30, h: 45, d: 40 },
  safe: { w: 30, h: 25, d: 30 },
  tv: { w: 55, h: 32, d: 12 },
  appl: { w: 45, h: 35, d: 40 },
};

/* Relevance is a separate question from possibility. A television niche fits a
   56 cm wide wardrobe perfectly well — it is simply not what anyone orders a
   wardrobe for, whereas it is the whole point of a TV unit. So these lists do
   not forbid anything: they say what a joiner would offer for this kind of unit,
   and the designer dims the rest so the handful that matter are what you see
   first. A family missing from the list gets everything. */
export const SEC_FAM = {
  wardrobe: ["hang", "hang2", "hangS", "shelves", "drawers", "box", "open", "shoe", "trouser", "laundry", "safe", "pullout"],
  walkin: ["hang", "hang2", "hangS", "shelves", "drawers", "box", "open", "shoe", "trouser", "pullout", "safe"],
  hall: ["shelves", "hangS", "drawers", "shoe", "open", "box", "laundry"],
  kitchenBase: ["drawers", "shelves", "pullout", "open", "appl", "box"],
  kitchenUpper: ["shelves", "open", "box"],
  kitchenTall: ["shelves", "drawers", "pullout", "appl", "open", "box"],
  vanity: ["drawers", "shelves", "open", "pullout", "laundry"],
  bookcase: ["shelves", "open", "box", "tv", "drawers"],
  shelving: ["open", "shelves"],
  tvUnit: ["tv", "open", "drawers", "shelves", "box"],
  office: ["shelves", "drawers", "open", "box", "safe"],
  laundry: ["appl", "laundry", "shelves", "pullout", "open", "drawers", "hangS", "box"],
  shoe: ["shoe", "shelves", "open", "drawers", "box"],
};
export const DOOR_FAM = {
  wardrobe: ["none", "hinged", "sliding", "mirror", "glass", "folding", "drawer"],
  walkin: ["none", "hinged", "sliding", "mirror", "drawer"],
  hall: ["none", "hinged", "mirror", "drawer"],
  kitchenBase: ["none", "hinged", "drawer"],
  kitchenUpper: ["none", "hinged", "glass", "lift"],
  kitchenTall: ["none", "hinged", "drawer", "folding"],
  vanity: ["none", "hinged", "drawer", "mirror"],
  bookcase: ["none", "glass", "hinged"],
  shelving: ["none"],
  tvUnit: ["none", "hinged", "drawer", "lift"],
  office: ["none", "hinged", "glass", "drawer", "folding"],
  laundry: ["none", "hinged", "drawer"],
  shoe: ["none", "hinged", "drawer"],
};
function relevant(list, t) {
  return !list || list.indexOf(t) >= 0;
}
export function secRelevant(t, fam) {
  return relevant(SEC_FAM[fam], t);
}
export function doorRelevant(t, fam) {
  return relevant(DOOR_FAM[fam], t);
}

function no(hes, ens) {
  return { ok: false, why: he(hes, ens) };
}
var YES = { ok: true, why: "" };
function cm(n) {
  return Math.round(n) + he(' ס"מ', " cm");
}

/* Can this compartment type go in a column `w` wide and `colH` tall of clear
   height, in a carcass with `d` of clear depth? */
export function secFit(t, w, colH, d) {
  var f = SEC_FIT[t];
  if (!f) return YES;
  if (w + 0.5 < f.w) return no("צריך עמודה ברוחב " + cm(f.w) + " לפחות", "needs a column at least " + cm(f.w) + " wide");
  if (f.wMax && w - 0.5 > f.wMax) return no("רחב מדי — עד " + cm(f.wMax), "too wide — up to " + cm(f.wMax));
  if (d + 0.5 < f.d) return no("צריך עומק פנימי " + cm(f.d) + " לפחות", "needs at least " + cm(f.d) + " of inside depth");
  if (colH + 0.5 < f.h) return no("צריך גובה " + cm(f.h) + " לפחות", "needs at least " + cm(f.h) + " of height");
  return YES;
}

/* Can this front go on this column? `ctx` is what the answer depends on:
   {w, colH, d, cols, drawers} — the column's width and clear height, the
   carcass's clear depth, how many columns the cabinet has, and whether this
   column contains a drawer stack. */
export function doorFit(t, ctx) {
  var w = ctx.w,
    d = ctx.d;
  if (t === "sliding") {
    if ((ctx.cols || 1) < 2) return no("דלת הזזה אחת לא נפתחת — צריך שתי עמודות לפחות", "a single sliding leaf cannot open — needs two columns");
    if (w + 0.5 < 45) return no("כנף הזזה צרה מדי — " + cm(45) + " לפחות", "sliding leaf too narrow — " + cm(45) + " minimum");
    if (d + 0.5 < 40) return no("מסילת הזזה אוכלת " + cm(STD.slideTrack) + " מהעומק", "the track set eats " + cm(STD.slideTrack) + " of depth");
    /* A sliding leaf runs past the entire front — it cannot stop short of a
       niche the way a hinged door can, so there is no such thing as an open
       compartment behind one. */
    if (ctx.openSec) return no("יש תא פתוח בעמודה — דלת הזזה תכסה אותו", "this column has an open niche — a sliding leaf would cover it");
  }
  if (t === "folding") {
    if (w + 0.5 < 45) return no("אקורדיון צריך " + cm(45) + " רוחב לשתי חציי-כנף", "a bi-fold needs " + cm(45) + " for its two halves");
    if (w - 0.5 > 120) return no("אקורדיון רחב מדי — עד " + cm(120), "bi-fold too wide — up to " + cm(120));
  }
  if (t === "lift" && (ctx.doorH ?? ctx.colH) - 0.5 > 100)
    return no("דלת מתרוממת עד " + cm(100) + " גובה", "a lift-up door works up to " + cm(100) + " tall");
  if (t === "drawer" && !ctx.drawers)
    return no("אין מגירות בעמודה — הוסיפו תא מגירות", "no drawers in this column — add a drawer compartment first");
  if (t === "mirror" && w + 0.5 < 25) return no("דלת מראה צרה מדי", "a mirror door this narrow is pointless");
  return YES;
}

export function kindFit(t, ctx) {
  if (t === "filler" && ctx.w - 0.5 > 25) return no("פנל מילוי עד " + cm(25), "a filler panel is up to " + cm(25));
  if (t === "blind" && ctx.w + 0.5 < 25) return no("פינה עיוורת צרה מדי לגישה", "a blind corner this narrow cannot be reached into");
  return YES;
}

export function carcassFit(t, ctx) {
  if (t === "float") {
    if (ctx.d - 0.5 > 45) return no("מדף צף עד " + cm(45) + " עומק", "a floating shelf goes up to " + cm(45) + " deep");
    if (ctx.top) return no("משטח עבודה לא יכול לשבת על מדפים צפים", "a worktop cannot sit on floating shelves");
  }
  return YES;
}

/* A framed or reeded front needs room for the frame. `minLeaf` is the smallest
   leaf the cabinet will actually produce. */
export function frontFit(t, ctx) {
  var mn = ctx.minLeaf || 0;
  if (t === "shaker" && mn + 0.5 < 25) return no("מסגרת שייקר צריכה כנף " + cm(25) + " לפחות", "a shaker frame needs a leaf at least " + cm(25));
  if ((t === "slat" || t === "groove") && mn + 0.5 < 15) return no("כנף צרה מדי לסרגלים", "the leaf is too narrow for battens");
  return YES;
}

/* The context the four functions above want, gathered from a live layout so the
   designer never has to assemble it by hand. */
export function fitCtx(L, col) {
  var sp = L.sp,
    innerD = isFloat(sp) ? L.d : L.zc - L.zb,
    colH = isFloat(sp) ? L.h : L.yt - L.yb,
    minLeaf = Infinity;
  L.cols.forEach(function (c) {
    if (c.kind && c.kind !== "normal") return;
    var lv = c.doorLeaves || 1;
    minLeaf = Math.min(minLeaf, c.w / Math.max(1, lv));
  });
  var doorH=colH;
  if(col && col.secs.length && !isCorner(sp)) {
    doorH=0;
    doorRuns({...col.ref,door:{t:"hinged"}}).forEach(function(run){
      var bottom=run.i0===0?L.yb-L.t:col.secs[run.i0].y0-L.t/2;
      var top=run.i1===col.secs.length-1?L.yt+L.t:col.secs[run.i1].y1+L.t/2;
      doorH=Math.max(doorH,top-bottom);
    });
  }
  return {
    w: col ? col.w : L.w,
    colH: colH,
    doorH: doorH,
    d: innerD,
    top: !!sp.top,
    cols: L.cols.length,
    drawers: col
      ? col.secs.some(function (cell) {
          return cell.ref.t === "drawers";
        })
      : false,
    openSec: col
      ? col.secs.some(function (cell) {
          return sectionOpen(cell.ref);
        })
      : false,
    minLeaf: isFinite(minLeaf) ? minLeaf : L.w,
  };
}

/* ========================= presets ========================= */

function nCols(inner, target, panel) {
  // how many columns of ~`target` fit, never leaving a shelf longer than it
  // can carry itself and never a column too narrow to be useful
  var n = Math.max(1, Math.round((inner + panel) / (target + panel)));
  while ((inner - (n - 1) * panel) / n > STD.maxSpan) n++;
  while (n > 1 && (inner - (n - 1) * panel) / n < STD.minCol) n--;
  return n;
}
function evenCols(inner, n, panel) {
  var w = (inner - (n - 1) * panel) / n,
    a = [];
  for (var i = 0; i < n; i++) a.push(w);
  return a;
}
function sec(t, h, extra) {
  return Object.assign({ t: t, h: h }, extra || {});
}
/* `leaves: null` means "as many as the column width calls for" — so widening
   a cabinet turns an over-wide single door into a pair by itself. The designer
   writes a number here only when the user picks one explicitly. */
function door(t, leaves, hinge) {
  return { t: t, leaves: leaves || null, hinge: hinge || "L" };
}

/* Reserve a top box only once the space ABOVE the 205 cm main zone fits
   its shelf and a useful compartment. Extra height fills that space gradually
   instead of taking a fixed 50 cm from the main zone at the threshold. */
function topBox(H, panel) {
  var available = H - 205 - (panel || STD.panel);
  return available >= STD.minSec ? Math.min(50, available) : 0;
}

// A hanging column: main hang (single or double), plus a top box on tall units.
function fillHang(H, panel) {
  var out = [],
    top = topBox(H, panel),
    rest = H - (top ? top + panel : 0);
  if (rest >= SEC.hang2.min) out.push(sec("hang2", rest));
  else if (rest >= STD.hangLong) out.push(sec("hang", rest));
  else if (rest >= SEC.hangS.min) out.push(sec("hangS", rest));
  else out.push(sec("shelves", rest));
  if (top) out.push(sec("box", top));
  return out;
}
// The "service" column of a wardrobe: drawers low, folded shelves above.
function fillShelfDrawer(H, panel, nDraw) {
  var out = [],
    top = topBox(H, panel),
    rest = H - (top ? top + panel : 0);
  var nd = nDraw == null ? (rest > 170 ? 3 : 2) : nDraw,
    dh = nd * STD.drawerH;
  out.push(sec("drawers", dh, { n: nd }));
  out.push(sec("shelves", rest - dh - panel));
  if (top) out.push(sec("box", top));
  return out;
}
function fillShelves(H, panel, space) {
  var out = [],
    top = topBox(H, panel),
    rest = H - (top ? top + panel : 0);
  out.push(sec("shelves", rest, { space: space }));
  if (top) out.push(sec("box", top));
  return out;
}

/* The four one-click layouts offered per column in the designer — the same
   rules the presets are built from, applied to a single column. */
export function columnFill(mode, H, panel) {
  if (mode === "mix") return fillShelfDrawer(H, panel);
  if (mode === "shelf") return fillShelves(H, panel);
  if (mode === "draw") {
    var top = topBox(H, panel),
      rest = H - (top ? top + panel : 0),
      out = [sec("drawers", rest, { n: Math.max(2, Math.round(rest / 24)) })];
    if (top) out.push(sec("box", top));
    return out;
  }
  return fillHang(H, panel);
}

/* Every preset is a function of the actual size, so the same choice gives a
   sensible cabinet at 120 cm and at 340 cm — more columns, more drawers, a
   top box once there is head room for one. */
export const PRESETS = [
  {
    id: "w_classic", fam: "wardrobe", he: "ארון קלאסי", en: "Classic wardrobe",
    note: ["תלייה + מדפים + מגירות, דלתות צירים", "Hanging + shelves + drawers, hinged doors"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 90, sp.panel),
        ws = evenCols(inner, n, sp.panel),
        svc = Math.floor((n - 1) / 2); // the drawers/shelves column
      return ws.map(function (cw, i) {
        return {
          w: cw,
          secs: i === svc ? fillShelfDrawer(H, sp.panel) : fillHang(H, sp.panel),
          door: door("hinged", null, i < n / 2 ? "L" : "R"),
        };
      });
    },
  },
  {
    id: "w_sliding", fam: "wardrobe", he: "ארון הזזה", en: "Sliding wardrobe",
    note: ["2-4 דלתות הזזה, חלוקה לפי מודול הדלת", "2-4 sliding leaves, interior on the door module"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = Math.max(2, Math.min(4, Math.round(w / 110))),
        ws = evenCols(inner, n, sp.panel),
        svc = n - 1;
      return ws.map(function (cw, i) {
        return {
          w: cw,
          secs: i === svc ? fillShelfDrawer(H, sp.panel, 3) : fillHang(H, sp.panel),
          door: door("sliding", 1, "R"),
        };
      });
    },
  },
  {
    id: "w_hisHers", fam: "wardrobe", he: "שלי ושלך", en: "His & hers",
    note: ["תלייה כפולה בצדדים, מגירות ומדפים במרכז", "Double hang each side, drawers in the middle"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = Math.max(3, nCols(inner, 85, sp.panel)),
        ws = evenCols(inner, n, sp.panel),
        mid = Math.floor(n / 2);
      return ws.map(function (cw, i) {
        var secs;
        if (i === mid) secs = fillShelfDrawer(H, sp.panel, 4);
        else if (i === 0 || i === n - 1) secs = fillHang(H, sp.panel);
        else secs = fillShelves(H, sp.panel);
        return { w: cw, secs: secs, door: door("hinged", null, i < mid ? "L" : "R") };
      });
    },
  },
  {
    id: "w_kids", fam: "wardrobe", he: "ארון ילדים", en: "Kids wardrobe",
    note: ["מוט נמוך בהישג יד, מגירות נמוכות והרבה מדפים", "Low reachable rail, low drawers, extra shelves"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 80, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        var secs = [],
          rest = H,
          top = H > 210 ? 45 : 0;
        if (top) rest -= top + sp.panel;
        if (i % 2 === 0) {
          secs.push(sec("drawers", 2 * STD.drawerH, { n: 2 }));
          secs.push(sec("hangS", 110)); // rail a child can reach
          secs.push(sec("shelves", rest - 2 * STD.drawerH - 110 - 2 * sp.panel));
        } else {
          secs.push(sec("drawers", 3 * STD.drawerH, { n: 3 }));
          secs.push(sec("shelves", rest - 3 * STD.drawerH - sp.panel, { space: 32 }));
        }
        if (top) secs.push(sec("box", top));
        return { w: cw, secs: secs, door: door("hinged", null, i < n / 2 ? "L" : "R") };
      });
    },
  },
  {
    id: "w_walkin", fam: "walkin", he: "חדר ארונות פתוח", en: "Open walk-in",
    note: ["מודולים פתוחים ללא דלתות, מגירות גלויות", "Open modules, exposed drawer stacks"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 80, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        var secs;
        if (i % 3 === 1) secs = fillShelfDrawer(H, sp.panel, 4);
        else if (i % 3 === 2) secs = fillShelves(H, sp.panel);
        else secs = fillHang(H, sp.panel);
        return { w: cw, secs: secs, door: door("none") };
      });
    },
  },
  {
    id: "w_hall", fam: "hall", he: "ארון כניסה", en: "Entry unit",
    note: ["מעילים, מדפי נעליים ומגירות למפתחות", "Coats, shoe shelves and a drawer for keys"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 65, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        var secs = [];
        if (i === 0) {
          secs.push(sec("shoe", Math.min(96, H * 0.45)));
          secs.push(sec("shelves", H - Math.min(96, H * 0.45) - sp.panel));
        } else {
          secs.push(sec("drawers", 2 * STD.drawerH, { n: 2 }));
          secs.push(sec("hangS", H - 2 * STD.drawerH - sp.panel));
        }
        return { w: cw, secs: secs, door: door(i === 0 ? "hinged" : "mirror", null, i < n / 2 ? "L" : "R") };
      });
    },
  },
  {
    id: "k_base_drawers", fam: "kitchenBase", he: "תחתון מגירות", en: "Base — drawers",
    note: ["מגירה רדודה למעלה ושתיים עמוקות (סטנדרט מטבח)", "Shallow top drawer + two deep (kitchen standard)"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel - (sp.top || 0),
        n = nCols(inner, 60, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw) {
        return { w: cw, secs: [sec("drawers", H, { n: 3, heights: [0.24, 0.38, 0.38] })], door: door("drawer") };
      });
    },
  },
  {
    id: "k_base_door", fam: "kitchenBase", he: "תחתון דלת + מדף", en: "Base — door + shelf",
    note: ["מגירה עליונה, דלת ומדף פנימי", "Top drawer over a door with one shelf"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel - (sp.top || 0),
        n = nCols(inner, 60, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        return {
          w: cw,
          secs: [sec("shelves", H - STD.drawerH - sp.panel, { n: 1 }), sec("drawers", STD.drawerH, { n: 1, nodoor: 1 })],
          door: door("hinged", null, i % 2 === 0 ? "L" : "R"),
        };
      });
    },
  },
  {
    id: "k_corner", fam: "kitchenCorner", he: "פינת מטבח אלכסונית", en: "Diagonal corner unit",
    note: ["ממלא את הפינה שבין שני צירים — דלת אחת באלכסון", "Fills the corner between two runs — one door on the diagonal"],
    corner: "diag",
    gen: function (w, h, d, sp) {
      var H = h - sp.plinth - 2 * sp.panel - (sp.top || 0);
      return [{ w: w - 2 * sp.panel, secs: [sec("shelves", H, { space: 34 })], door: door("hinged", 1, "R") }];
    },
  },
  {
    id: "k_upper", fam: "kitchenUpper", he: "עליון מטבח", en: "Wall unit",
    note: ["שני מדפים, תלייה 145 ס\"מ מהרצפה", "Two shelves, hung 145 cm off the floor"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - 2 * sp.panel,
        n = nCols(inner, 60, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        return { w: cw, secs: [sec("shelves", H, { space: 32 })], door: door(h < 50 ? "lift" : "hinged", null, i % 2 === 0 ? "L" : "R") };
      });
    },
  },
  {
    id: "k_tall", fam: "kitchenTall", he: "מזווה / עמודה", en: "Tall pantry",
    note: ["סלים נשלפים למטה, מדפים למעלה, תא עליון", "Pull-outs low, shelves above, top box"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 60, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        var top = H > 200 ? 45 : 0,
          rest = H - (top ? top + sp.panel : 0),
          po = Math.min(90, rest * 0.42),
          secs = [sec("pullout", po), sec("shelves", rest - po - sp.panel, { space: 34 })];
        if (top) secs.push(sec("box", top));
        return { w: cw, secs: secs, door: door("hinged", null, i % 2 === 0 ? "L" : "R") };
      });
    },
  },
  {
    id: "bath_vanity", fam: "vanity", he: "ארון אמבטיה", en: "Vanity unit",
    note: ["שתי מגירות תלויות מתחת לכיור", "Two drawers under the basin"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 80, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw) {
        return { w: cw, secs: [sec("drawers", H, { n: 2 })], door: door("drawer") };
      });
    },
  },
  {
    id: "book_open", fam: "bookcase", he: "ספרייה פתוחה", en: "Open bookcase",
    note: ["מדפים כל 32 ס\"מ, דלתות תחתונות אופציונליות", "Shelves every 32 cm"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 80, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw) {
        return { w: cw, secs: [sec("shelves", H, { space: STD.bookSpace })], door: door("none") };
      });
    },
  },
  /* --- open shelving: the three shapes people actually ask for --- */
  {
    id: "sh_float", fam: "shelving", he: "מדפים צפים", en: "Floating shelves",
    note: ["מדפי 38 מ\"מ על ברגי סמויים, בלי גוף", "38 mm slabs on concealed brackets, no carcass"],
    carcass: "float", panel: STD.floatT, back: 0,
    gen: function (w, h, d, sp) {
      /* n boards with n-1 gaps of about a shelf pitch: solve
         h = n·t + (n-1)·gap for n, then share the slack out evenly. And split
         the run into shorter shelves once it is longer than brackets can carry. */
      var t = sp.panel,
        space = STD.shelfSpace,
        nSh = Math.max(2, Math.round((h + space) / (space + t))),
        gap = Math.max(12, (h - nSh * t) / (nSh - 1)),
        cols = Math.max(1, Math.ceil(w / STD.floatSpan)),
        out = [];
      for (var c = 0; c < cols; c++) {
        var secs = [];
        for (var i = 0; i < nSh - 1; i++) secs.push(sec("open", gap));
        out.push({ w: w / cols, secs: secs, door: door("none") });
      }
      return out;
    },
  },
  {
    id: "sh_grid", fam: "shelving", he: "מדפי קופסאות (גריד)", en: "Cube / grid shelving",
    note: ["רשת תאים פתוחה, בלי גב — גם כמפריד חדר", "Open cube grid, no back — works as a room divider"],
    carcass: "open", back: 0,
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 38, sp.panel),
        ws = evenCols(inner, n, sp.panel),
        rows = Math.max(2, Math.round((H + sp.panel) / (38 + sp.panel)));
      return ws.map(function (cw) {
        var secs = [],
          hh = (H - (rows - 1) * sp.panel) / rows;
        for (var i = 0; i < rows; i++) secs.push(sec("open", hh));
        return { w: cw, secs: secs, door: door("none") };
      });
    },
  },
  {
    id: "sh_ladder", fam: "shelving", he: "מדפי מדרגה", en: "Stepped shelving",
    note: ["עמודות בגבהי מדף שונים — קיר תצוגה", "Columns stepped at different pitches — a display wall"],
    carcass: "open", back: 0,
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = Math.max(2, nCols(inner, 60, sp.panel)),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        // alternate a tall/short rhythm so no two neighbours line up
        var rows = 2 + ((i % 3) + 1),
          hh = (H - (rows - 1) * sp.panel) / rows,
          secs = [];
        for (var k = 0; k < rows; k++) secs.push(sec("open", hh));
        return { w: cw, secs: secs, door: door("none") };
      });
    },
  },
  {
    id: "tv_unit", fam: "tvUnit", he: "יחידת טלוויזיה", en: "TV unit",
    note: ["נישה פתוחה למרכז ומגירות בצדדים", "Open centre niche, drawers each side"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = Math.max(3, nCols(inner, 70, sp.panel)),
        ws = evenCols(inner, n, sp.panel),
        mid = Math.floor(n / 2);
      return ws.map(function (cw, i) {
        return i === mid
          ? { w: cw, secs: [sec("open", H)], door: door("none") }
          : { w: cw, secs: [sec("drawers", H, { n: Math.max(1, Math.round(H / 24)) })], door: door("drawer") };
      });
    },
  },
  {
    id: "office", fam: "office", he: "ארון משרדי", en: "Office storage",
    note: ["דלתות סגורות למטה, מדפים פתוחים למעלה", "Closed base, open shelving on top"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 90, sp.panel),
        ws = evenCols(inner, n, sp.panel),
        low = Math.min(110, H * 0.5);
      return ws.map(function (cw, i) {
        return {
          w: cw,
          secs: [
            sec("shelves", low, { space: 33 }),
            // the upper half is deliberately open — `nodoor` is what stops the
            // front from covering it, and it is why this unit has a door at all
            // rather than a full-height one
            sec("shelves", H - low - sp.panel, { space: 33, nodoor: 1 }),
          ],
          door: door("hinged", null, i % 2 === 0 ? "L" : "R"),
        };
      });
    },
  },
  {
    id: "laundry", fam: "laundry", he: "ארון שירות", en: "Utility cabinet",
    note: ["נישת מכונה, סל כביסה ומדפים", "Appliance niche, hamper and shelves"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = Math.max(2, nCols(inner, 62, sp.panel)),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        var secs;
        if (i === 0) secs = [sec("appl", 88), sec("shelves", H - 88 - sp.panel, { space: 36 })];
        else secs = [sec("laundry", 65), sec("shelves", H - 65 - sp.panel, { space: 36 })];
        return { w: cw, secs: secs, door: door(i === 0 ? "none" : "hinged", null, i % 2 === 0 ? "L" : "R") };
      });
    },
  },
  {
    id: "shoe", fam: "shoe", he: "ארון נעליים", en: "Shoe cabinet",
    note: ["מדפים משופעים כל 19 ס\"מ", "Tilted shelves every 19 cm"],
    gen: function (w, h, d, sp) {
      var inner = w - 2 * sp.panel,
        H = h - sp.plinth - 2 * sp.panel,
        n = nCols(inner, 60, sp.panel),
        ws = evenCols(inner, n, sp.panel);
      return ws.map(function (cw, i) {
        return { w: cw, secs: [sec("shoe", H)], door: door("hinged", null, i % 2 === 0 ? "L" : "R") };
      });
    },
  },
];

/* ========================= spec ========================= */

/* A name each column and compartment keeps for as long as it exists.
   Positions cannot serve: inserting a column at the front renumbers every one
   after it, and the designer's own history would then read as "everything
   changed" for what was one insert. Copy/paste clones a column whole, hid and
   all, so duplicates are re-tagged here rather than at every paste site. */
var partSeq = 0;
function inc_partSeq() { return ++partSeq; }

/* ========================= layout ========================= */

/* --- which compartments a front covers ---

   Some compartments are open by definition: an open niche, a television niche
   (you cannot watch a screen through a door) and an appliance niche (a washing
   machine's own door is the front). `nodoor` marks any other compartment the
   design deliberately leaves open. Each of those breaks the run of covered
   compartments, so a column can carry two separate doors with open shelving
   between them — which is how such a unit is actually built, and what the
   office preset always claimed to be. */
export const OPEN_SEC = { open: 1, tv: 1, appl: 1 };

/* ========================= cut list & price ========================= */

/* Which parts are boards that have to be cut out of something. */
export const BOARD_ROLES = [
  "plinth", "side", "bottom", "top", "back", "worktop", "divider", "fixedShelf",
  "shelf", "door", "doorPanel", "batten", "glazing", "filler", "drawerFront",
  "drawerBox", "drawerBottom", "tvPanel",
];
// Fronts: the roles a front style makes more expensive to machine.
const FRONT_ROLES = ["door", "doorPanel", "batten", "drawerFront", "filler"];

const NO_BAND = { back: 1, doorPanel: 1, glazing: 1, drawerBottom: 1, batten: 1, tvPanel: 1 };

/* ========================= drilling (System 32) =========================

   Generic review patterns use a 32 mm pitch, 37 mm setback and example
   hinge/runner dimensions. Hardware-specific drilling must be checked against
   the selected manufacturer's template; these defaults do not qualify a cut.
   Coordinates are millimetres in each panel's named datum. */
export const S32 = {
  pitch: 32, // the grid
  setback: 37, // holes sit this far in from the panel's front edge
  pin: 5, // shelf pin / plate screw / runner screw diameter
  pinDepth: 13,
  cup: 35, // hinge cup diameter
  cupDepth: 12.5,
  cupSetback: 22.5, // cup centre from the door's hinge edge, 3 mm overlay
  plateSpread: 32, // the two plate screws, one pitch apart
};

/* A single cabinet's price, itemised the way a joinery shop bills it.

   Board is priced per m² of the sheet the part comes off, times a yield
   allowance: one cabinet on its own is never a whole sheet of anything, and the
   offcut it leaves behind is paid for whether or not the next job can use it.
   That allowance is the one estimate here — the project-wide cut plan in
   nest.js replaces it with real sheet counts once you nest the whole order,
   which is exactly why that view exists. Everything else is measured: metres
   of banding, metres of saw cut, holes bored, runners fitted.

   `cabQuote` returns the breakdown; `cabPrice` is the single number the cost
   panel and the shopping list use. */
const YIELD = 1.18; // offcut allowance on a single unit's board

/* ========================= clash detection =========================

   Where a door ends up when it is open. This only became answerable once the
   swing direction was right — a leaf that used to rotate through the back panel
   could hardly be tested against the room. The sweep is approximated by the
   chord from the pivot to the leaf's free end at 90°, which is where a door
   spends its life and where it hits things. */

/* ========================= checks ========================= */

/* ========================= 2D plan symbol ========================= */

/* What the floor plan needs to draw a cabinet properly: its columns, the way
   each front opens, and where the drawers are. Plain numbers in cm, in the
   item's own frame, so plan2d only has to scale them. */
/* The plan repaints on every pointer move while a piece is being dragged, and
   a full layout per frame per cabinet is real work — so the symbol is memoised
   against the spec it was built from. */
var planMemo = typeof WeakMap === "function" ? new WeakMap() : null;

/* ========================= labels ========================= */

