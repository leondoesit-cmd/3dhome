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
  if (Math.abs(((a.rot || 0) % 360) - ((b.rot || 0) % 360)) > 0.5) return false;
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

export function presetById(id) {
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
  return null;
}

/* ========================= spec ========================= */

function defHW(fam) {
  var kitchen = fam === "kitchenBase" || fam === "kitchenUpper" || fam === "kitchenTall";
  return {
    handle: kitchen ? "bar" : "bar",
    finish: fam === "vanity" ? "chrome" : "steel",
    hinge: "soft",
    slide: kitchen ? "tandem" : "softFull",
    rail: "oval",
    led: false,
    mirrorInside: false,
    softClose: true,
    lock: false,
  };
}

// A fresh spec for a family at a given size — this is what "ברירת מחדל" means.
export function makeSpec(presetId, w, h, d, prev) {
  var p = presetById(presetId) || PRESETS[0],
    f = FAM[p.fam] || FAM.wardrobe,
    carcass = p.carcass || "full",
    corner = p.corner || null,
    // the board thickness and the back are the user's to set — but only while
    // the piece stays the same kind of thing. Switching to floating shelves
    // means 38 mm slabs and no back; switching back to a box means 18 mm and a
    // back panel again, not whatever the shelves happened to be made of.
    same = prev && (prev.carcass || "full") === carcass;
  var sp = {
    preset: p.id,
    fam: p.fam,
    carcass: carcass,
    corner: corner, // "diag" on a corner unit, null on everything else
    cornerFront: (prev && prev.cornerFront) || STD.cornerFront,
    panel: p.panel || (same && prev.panel) || STD.panel,
    back: p.back != null ? p.back : same && prev.back != null ? prev.back : STD.back,
    plinth: prev && prev.plinthType === "none" ? 0 : f.plinth,
    plinthType: (prev && prev.plinthType) || (f.plinth ? "recessed" : "none"),
    top: f.top || 0, // worktop thickness (kitchen bases)
    // how high off the floor the unit hangs — wall units sit 145 up so there
    // is the usual 50-55 cm of clearance over a 90 cm worktop
    elev: prev && prev.fam === p.fam && prev.elev != null ? prev.elev : f.elev || 0,
    gap: STD.gap,
    open: prev ? prev.open || 0 : 0,
    front: (prev && prev.front) || "flat", // door / drawer face style
    finFront: (prev && prev.finFront) || "auto",
    finCarcass: (prev && prev.finCarcass) || "auto",
    // which sheet each material role is actually bought as (see stock.js) —
    // this is what the cut plan nests and what the price is built from
    stock: Object.assign(defaultStock(p.fam), (prev && prev.stock) || {}),
    band: (prev && prev.band) || defaultBand(p.fam),
    profile: (prev && prev.profile) || defaultProfile(p.fam),
    hw: Object.assign(defHW(p.fam), (prev && prev.hw) || {}),
  };
  sp.cols = p.gen(w, h, d, sp);
  // `auto` = this layout is still the preset's own answer to this size, so a
  // resize may re-plan it. The designer clears the flag the moment the user
  // changes the division themselves.
  sp.auto = prev ? prev.auto !== false : true;
  sp.dim = { w: w, h: h, d: d };
  /* A re-plan builds brand new column objects. Positionally they are the same
     columns — the second column of a wardrobe that grew 20 cm is still the
     second column — so they inherit their predecessors' names, and the history
     reads as "column 2 changed" instead of as the whole interior being
     replaced. Anything the re-plan really did add is named by tagParts. */
  if (prev && prev.cols) carryPartIds(prev.cols, sp.cols);
  return normalizeSpec(sp, w, h, d);
}
function carryPartIds(from, to) {
  to.forEach(function (c, i) {
    var old = from[i];
    if (!old) return;
    if (old.hid) c.hid = old.hid;
    (c.secs || []).forEach(function (s, j) {
      var os = (old.secs || [])[j];
      if (os && os.hid) s.hid = os.hid;
    });
  });
}

export function defaultPreset(fam) {
  return (FAM[fam] || FAM.wardrobe).preset;
}

/* "Start from scratch" — the carcass of the family and nothing inside it: one
   full-height open bay, no door. From here the designer's wall tool draws the
   divisions the way the blueprint tool draws walls. It is deliberately NOT a
   PRESETS entry: a blank is a state, not a plan, so `auto` is off from the
   first moment and a resize only ever re-fits what was drawn. */
export function makeBlankSpec(fam, w, h, d, prev) {
  var f = FAM[fam] || FAM.wardrobe,
    sp = makeSpec(f.preset, w, h, d, prev),
    inner;
  /* makeSpec takes the family off the seed preset — for a blank the family is
     the one that was asked for, and the free-form one has no preset of its
     own at all. Fix it before the inner box is measured, because the plinth
     and the worktop it drops come from exactly this. */
  sp.fam = fam;
  if (fam === "free") {
    sp.plinth = 0;
    sp.plinthType = "none";
    sp.top = 0;
    sp.elev = 0;
  }
  inner = innerOf(sp, w, h);
  sp.preset = "blank";
  sp.cols = [{ w: inner.w, secs: [sec("open", inner.h)], door: door("none") }];
  sp.auto = false;
  return normalizeSpec(sp, w, h, d);
}

/* Re-fit a spec to the piece's current size. Fixed-height parts (drawer
   stacks, appliance niches, a top box) keep their height and the flexible
   ones (hanging, shelves, open niches) take up the slack — the way a joiner
   would re-plan a cabinet that grew 20 cm, rather than stretching everything. */
function distribute(list, total, getMin) {
  if (!list.length) return;
  var fixedSum = 0,
    flexSum = 0;
  list.forEach(function (o) {
    if (o.__flex) flexSum += o.__size;
    else fixedSum += o.__size;
  });
  var avail = total - fixedSum;
  if (flexSum > 0 && avail > flexSum * 0.35) {
    var k = avail / flexSum;
    list.forEach(function (o) {
      if (o.__flex) o.__size = Math.max(getMin(o), o.__size * k);
    });
  } else {
    var k2 = total / (fixedSum + flexSum || 1);
    list.forEach(function (o) {
      o.__size = Math.max(getMin(o), o.__size * k2);
    });
  }
  // Absorb rounding drift without forcing any member below its minimum.
  var sum = 0;
  list.forEach(function (o) {
    sum += o.__size;
  });
  var big = list[0];
  list.forEach(function (o) {
    if (o.__size > big.__size) big = o;
  });
  if (sum <= total) big.__size += total - sum;
  else {
    // Preserve minimum sizes when possible; impossible envelopes remain
    // visibly overfull so construction validation can reject them.
    var capacity = list.reduce(function (n, o) { return n + Math.max(0, o.__size - getMin(o)); }, 0);
    var deficit = Math.min(sum - total, capacity);
    if (capacity > 0) list.forEach(function (o) {
      o.__size -= deficit * Math.max(0, o.__size - getMin(o)) / capacity;
    });
  }
}

/* The clear box the division has to fit inside. Floating shelves have no
   carcass at all, so their "inner box" is the whole piece and every board eats
   into the height — one place to say that, read by both the re-fit below and
   the layout pass, so the drawing and the sizes can never drift apart. */
export function innerOf(sp, w, h) {
  var t = sp.panel || STD.panel;
  /* A floating run is n shelves with n-1 gaps between them, so the piece's
     height is the underside of the bottom board to the top of the top one and
     every compartment costs a board at each end. A closed box spends a board
     only *between* compartments; its ends are the top and bottom panels. */
  if (isFloat(sp)) return { w: w, h: h, wall: 0, boardPerSec: 2 };
  return { w: w - 2 * t, h: h - sp.plinth - 2 * t - (sp.top || 0), wall: t, boardPerSec: 0 };
}

/* A name each column and compartment keeps for as long as it exists.
   Positions cannot serve: inserting a column at the front renumbers every one
   after it, and the designer's own history would then read as "everything
   changed" for what was one insert. Copy/paste clones a column whole, hid and
   all, so duplicates are re-tagged here rather than at every paste site. */
var partSeq = 0;
function tagParts(sp) {
  var taken = {},
    dup = [];
  // one pass to learn which names are already in use — including the ones a
  // spec loaded from a file brought with it, which a fresh counter would
  // otherwise hand out a second time
  sp.cols.forEach(function (c) {
    [c].concat(c.secs || []).forEach(function (o) {
      if (o.hid && !taken[o.hid]) taken[o.hid] = 1;
      else dup.push(o);
    });
  });
  dup.forEach(function (o) {
    var id;
    do {
      id = "p" + ++partSeq;
    } while (taken[id]);
    o.hid = id;
    taken[id] = 1;
  });
}

export function normalizeSpec(sp, w, h, d) {
  sp.panel = sp.panel || STD.panel;
  sp.shelf = sp.shelf || sp.panel;
  sp.gap = sp.gap == null ? STD.gap : sp.gap;
  sp.hw = Object.assign(defHW(sp.fam), sp.hw || {});
  if (!CARCASS[sp.carcass]) sp.carcass = "full";
  if (sp.corner !== "diag") sp.corner = null;
  if (!(sp.cornerFront > 20)) sp.cornerFront = STD.cornerFront;
  if (isCorner(sp)) {
    // a corner unit is one space behind one diagonal door: no columns to divide
    sp.carcass = "full";
    if (sp.cols.length > 1) sp.cols = [sp.cols[0]];
    if (sp.cols[0].secs.length > 1) sp.cols[0].secs = [sp.cols[0].secs[0]];
  }
  if (!(sp.elev >= 0)) sp.elev = (FAM[sp.fam] || FAM.wardrobe).elev || 0;
  if (!FRONTS[sp.front]) sp.front = "flat";
  if (!FINISH[sp.finFront]) sp.finFront = "auto";
  if (!FINISH[sp.finCarcass]) sp.finCarcass = "auto";
  sp.stock = Object.assign(defaultStock(sp.fam), sp.stock || {});
  if (!bandById(sp.band)) sp.band = defaultBand(sp.fam);
  if (!sp.profile) sp.profile = defaultProfile(sp.fam);
  if (isFloat(sp)) {
    // bare shelves: nothing to stand on, nothing to hang on, nothing to open
    sp.plinth = 0;
    sp.plinthType = "none";
    sp.back = 0;
    sp.top = 0;
  }
  if (sp.plinthType === "none") sp.plinth = 0;
  else if (!sp.plinth) sp.plinth = (FAM[sp.fam] || FAM.wardrobe).plinth || 8;
  if (!sp.cols || !sp.cols.length) sp.cols = [{ w: 60, secs: [sec("shelves", 100)], door: door("none") }];
  tagParts(sp);

  var t = sp.panel,
    st = sp.shelf,
    inner = innerOf(sp, w, h),
    innerW = inner.w,
    innerH = inner.h;

  // columns (floating shelf runs butt into each other — there is no divider)
  var cl = sp.cols.map(function (c) {
    c.__size = c.w > 0 ? c.w : 40;
    c.__flex = !c.fixed;
    return c;
  });
  distribute(cl, innerW - (isFloat(sp) ? 0 : cl.length - 1) * t, function () {
    return 8;
  });
  sp.cols.forEach(function (c) {
    c.w = Math.round(c.__size * 10) / 10;
    delete c.__size;
    delete c.__flex;
    if (!c.secs || !c.secs.length) c.secs = [sec("shelves", innerH)];
    if (!c.door) c.door = door("none");
    // sections
    var sl = c.secs.map(function (s) {
      var m = SEC[s.t] || SEC.shelves;
      s.__size = s.h > 0 ? s.h : m.def;
      s.__flex = s.fixed ? 0 : m.flex;
      return s;
    });
    // a closed box spends a board between compartments; a floating run spends
    // one under every shelf, including the bottom one
    distribute(sl, innerH - (sl.length - 1 + inner.boardPerSec) * st, function (s) {
      return Math.min(STD.minSec, (SEC[s.t] || SEC.shelves).min);
    });
    c.secs.forEach(function (s) {
      s.h = Math.round(s.__size * 10) / 10;
      delete s.__size;
      delete s.__flex;
    });
  });
  return sp;
}

/* The spec of an item, creating a default one on first use.

   This is also where "the preset follows the size" happens: while the layout
   is still the preset's own (nothing hand-edited), a real size change re-runs
   the generator — 200 cm gives three columns, 300 cm gives four, and a column
   that grew past a comfortable leaf width gets a pair of doors. Once the user
   has edited the division, the spec is only re-fitted, never re-planned. */
export function specOf(it) {
  if (!it.cab) {
    it.cab = makeSpec(defaultPreset(famOf(it)), it.w, it.h, it.d);
    return it.cab;
  }
  var sp = it.cab,
    d0 = sp.dim;
  if (sp.auto !== false && presetById(sp.preset) && (!d0 || Math.abs(d0.w - it.w) > 2 || Math.abs(d0.h - it.h) > 2 || Math.abs(d0.d - it.d) > 2))
    it.cab = makeSpec(sp.preset, it.w, it.h, it.d, sp);
  else normalizeSpec(sp, it.w, it.h, it.d);
  return it.cab;
}
export function famOf(it) {
  if (it.cab && it.cab.fam) return it.cab.fam;
  if (it.h <= 100 && it.d <= 50) return "tvUnit";
  if (it.h <= 100) return "kitchenBase";
  if (it.d <= 36) return "bookcase";
  return "wardrobe";
}

/* ========================= layout ========================= */

/* Turns the spec into flat geometry. Everything downstream — the 3D build,
   the elevation drawing, the cut list and the price — reads this and only
   this, so they can never disagree with each other. */
export function layoutCab(it, run, options) {
  function finish(layout) {
    const edits = !options?.semanticOnly && S.parametric?.definitions?.[it.definitionId]?.metadata?.advancedEdits;
    return applyCabinetLayoutEdits(layout, edits);
  }
  var sp = specOf(it),
    // where this unit sits among its neighbours — a run of one when it stands
    // alone, which is what a wardrobe in the middle of a wall always is
    R = run || cabRun(it),
    t = sp.panel,
    st = sp.shelf || t,
    w = it.w,
    h = it.h,
    d = it.d,
    hw = w / 2,
    hd = d / 2,
    ph = sp.plinth,
    topT = sp.top || 0;
  // Runtime interaction state is instance-owned. Keep `sp.open` only as the
  // compatibility projection consumed by the existing motion builder.
  if (it.runtimeState && Number.isFinite(it.runtimeState.cabinetOpen)) sp.open = it.runtimeState.cabinetOpen;

  var sliding = sp.cols.some(function (c) {
      return c.door && c.door.t === "sliding";
    }),
    doorT = STD.doorT,
    // where the carcass front sits: overlay doors hang on it, sliding leaves
    // need their track in front of it
    zc = sliding ? hd - STD.slideTrack : hd - doorT,
    zb = -hd + sp.back, // inside face of the back panel
    yb = ph + t, // top of the bottom panel
    yt = h - topT - t; // underside of the top panel

  var L = {
    it: it, sp: sp, w: w, h: h, d: d, t: t, st: st, zc: zc, zb: zb, yb: yb, yt: yt,
    sliding: sliding, run: R, parts: [], units: [], cols: [], hw: {},
  };
  function part(o) {
    if (!o) return null;
    if (o.k === "box") {
      if (!fin(o.x0) || !fin(o.x1) || !fin(o.y0) || !fin(o.y1) || !fin(o.z0) || !fin(o.z1)) return null;
      if (Math.abs(o.x1 - o.x0) < 1e-4 || Math.abs(o.y1 - o.y0) < 1e-4 || Math.abs(o.z1 - o.z0) < 1e-4) return null;
    } else if (o.k === "cyl") {
      if (!fin(o.x) || !fin(o.y) || !fin(o.z) || !fin(o.r) || !fin(o.hgt) || o.r <= 0 || o.hgt <= 0) return null;
    }
    L.parts.push(o);
    return o;
  }
  function unit(o) {
    L.units.push(o);
    return L.units.length - 1;
  }
  L.part = part;
  L.unit = unit;

  /* --- floating shelves: no carcass, so nothing below applies ---
     One board per compartment, sitting at its foot and spanning the full depth,
     on brackets that are inside the wall and therefore have no geometry. The
     columns/compartments are still built the same way, so the elevation editor,
     the cut list and the checks all work unchanged. */
  if (isFloat(sp)) {
    L.yb = 0;
    L.yt = h;
    L.zc = hd;
    L.zb = -hd;
    var fx = -hw;
    sp.cols.forEach(function (c, ci) {
      var cw = Math.max(0, fin(c.w) ? c.w : 0);
      var fcol = { i: ci, x0: fx, x1: fx + cw, w: cw, ref: c, secs: [], kind: "normal" };
      L.cols.push(fcol);
      var fy = 0;
      function shelf(y) {
        if (cw > 0.001) {
          part({ k: "box", role: "shelf", x0: fcol.x0, x1: fcol.x1, y0: y, y1: y + st, z0: -hd, z1: hd, mat: "front", float: 1 });
        }
      }
      var floatSecs = Array.isArray(c.secs) && c.secs.length ? c.secs : [{ t: "open", h: Math.max(0, h) }];
      floatSecs.forEach(function (s, si) {
        var sh = Math.max(0, fin(s.h) ? s.h : 0);
        shelf(fy);
        // the compartment owns the board at its foot and the clear space above it
        fcol.secs.push({ i: si, y0: fy, y1: fy + st + sh, ref: s, col: fcol, shelves: 0, floatShelf: 1 });
        fy += st + sh;
      });
      shelf(fy); // and the top board caps the run
      fx = fcol.x1;
    });
    countHardware(L);
    // two concealed brackets per shelf, a third once it is too long for two
    L.hw.floatShelves = 0;
    L.hw.brackets = 0;
    L.cols.forEach(function (col) {
      var n = col.secs.length + 1;
      L.hw.floatShelves += n;
      L.hw.brackets += n * (col.w > 90 ? 3 : 2);
    });
    return finish(L);
  }

  /* --- a corner unit is a different shape, so it builds itself --- */
  if (isCorner(sp)) {
    layoutCorner(L, part);
    countHardware(L);
    return finish(L);
  }

  /* --- carcass --- */
  if (ph > 0 && sp.plinthType !== "legs") {
    /* A real plinth is a front rail with return pieces, not a solid block —
       which is also what has to appear on the cutting list. Across a run the
       rail is continuous, so the returns exist only at the two ends that are
       actually visible; the joints in the middle have nothing to close. */
    var inset = sp.plinthType === "flush" ? 0 : STD.toeInset,
      pz = sp.plinthType === "flush" ? zc + STD.doorT : zc - inset;
    part({ k: "box", role: "plinth", x0: -hw, x1: hw, y0: 0, y1: ph, z0: pz - t, z1: pz, mat: "carcass" });
    [-1, 1].forEach(function (sx) {
      if (sx < 0 ? !R.first : !R.last) return;
      var x0 = sx < 0 ? -hw : hw - t;
      part({ k: "box", role: "plinth", x0: x0, x1: x0 + t, y0: 0, y1: ph, z0: zb, z1: pz - t, mat: "carcass" });
    });
  } else if (sp.plinthType === "legs" && ph > 0) {
    var legXs = [-hw + Math.min(6, w / 4), hw - Math.min(6, w / 4)], dividerX = -hw + t;
    sp.cols.slice(0,-1).forEach(function(c){dividerX += c.w;legXs.push(dividerX + t / 2);dividerX += t;});
    legXs.sort(function(a,b){return a-b;});
    // Include intermediate supports across a very wide single bay too.
    var supports = [];
    legXs.forEach(function(x,i){if(i){var prev=legXs[i-1],n=Math.ceil((x-prev)/STD.maxSpan);for(var j=1;j<n;j++)supports.push(prev+(x-prev)*j/n);}supports.push(x);});
    supports.forEach(function(x,i){if(i && Math.abs(x-supports[i-1])<0.1)return;
      [-1,1].forEach(function(sz){part({k:"cyl",role:"leg",x:x,y:ph/2,z:sz*(hd-Math.min(8,d/4)),r:1.8,hgt:ph,mat:"metal"});});
    });
  }
  part({ k: "box", role: "side", x0: -hw, x1: -hw + t, y0: ph, y1: h - topT, z0: zb - sp.back, z1: zc, mat: "carcass" });
  part({ k: "box", role: "side", x0: hw - t, x1: hw, y0: ph, y1: h - topT, z0: zb - sp.back, z1: zc, mat: "carcass" });
  part({ k: "box", role: "bottom", x0: -hw + t, x1: hw - t, y0: ph, y1: yb, z0: zb, z1: zc, mat: "carcass" });
  part({ k: "box", role: "top", x0: -hw + t, x1: hw - t, y0: yt, y1: h - topT, z0: zb, z1: zc, mat: "carcass" });
  /* An open-backed unit (a grid shelf, a room divider) has no back to cut.
     A closed one does not get a single board across the whole run either: the
     back is a piece per carcass box, butt-jointed behind a divider, which is
     both how it is built and the only way it fits on a sheet — a 2 m wardrobe
     back in one piece is 1964 mm wide and no board is. */
  if (sp.back > 0) {
    var innerW = w - 2 * t,
      bh = h - topT - ph,
      bsheet = sheetFor(sp, "back", sp.back),
      /* How wide a back piece may be: whatever the chosen back sheet can hold
         once the piece's height is laid along one of its two axes. Fall back to
         a carcass box if no sheet is resolvable. */
      maxW = STD.maxBox;
    if (bsheet) {
      var across = bh <= bsheet.l - 2 ? bsheet.w - 2 : bh <= bsheet.w - 2 ? bsheet.l - 2 : 0;
      if (across > 20) maxW = across;
    }
    var nBack = Math.max(1, Math.ceil(innerW / maxW)),
      segs = [];
    if (nBack === 1) segs = [innerW];
    else {
      /* Prefer a joint over a divider, where it is supported — but not at the
         price of an extra piece and an extra sheet. Three 650 mm backs cut from
         three sheets is worse joinery than two 980 mm backs from two. */
      var cur = 0,
        onDiv = [];
      sp.cols.forEach(function (c, ci) {
        var seg = c.w + (ci > 0 ? t : 0); // the divider belongs to the piece behind it
        if (cur > 0 && cur + seg > maxW) {
          onDiv.push(cur);
          cur = seg;
        } else cur += seg;
      });
      if (cur > 0) onDiv.push(cur);
      if (onDiv.length <= nBack) segs = onDiv;
      else for (var bi = 0; bi < nBack; bi++) segs.push(innerW / nBack);
    }
    var bx = -hw + t;
    segs.forEach(function (sw) {
      part({ k: "box", role: "back", x0: bx, x1: bx + sw, y0: ph, y1: h - topT, z0: zb - sp.back, z1: zb, mat: "back" });
      bx += sw;
    });
  }
  /* The worktop belongs to the RUN, not to the unit: one slab across five base
     units, overhanging only at the two exposed ends, jointed where it is longer
     than a slab. The run's first unit carries the whole thing so the piece count
     and the area are right; the others carry none. The pieces are drawn in this
     unit's own frame, which is why they run off past its sides. */
  if (topT && R.first) {
    var runW = R.span + 3,
      nTop = Math.max(1, Math.ceil(runW / STD.maxTop)),
      pw = runW / nTop,
      tx = -hw - 1.5;
    for (var ti = 0; ti < nTop; ti++) {
      part({ k: "box", role: "worktop", x0: tx, x1: tx + pw, y0: h - topT, y1: h, z0: -hd - 1.5, z1: hd + 1.5, mat: "top", run: 1, exposedReturns: (ti === 0 ? 1 : 0) + (ti === nTop - 1 ? 1 : 0) });
      tx += pw;
    }
  }

  /* --- columns --- */
  var x = -hw + t;
  sp.cols.forEach(function (c, ci) {
    var cw = Math.max(0, fin(c.w) ? c.w : 0);
    if (ci > 0) {
      part({ k: "box", role: "divider", x0: x, x1: x + t, y0: yb, y1: yt, z0: zb, z1: zc, mat: "carcass" });
      x += t;
    }
    var cx0 = x,
      cx1 = x + cw,
      col = { i: ci, x0: cx0, x1: cx1, w: cw, ref: c, secs: [] };
    L.cols.push(col);

    /* A filler closes the gap between the run and the wall, and a blind corner
       is the dead space the cabinet round the corner covers: neither is
       divided, and only the filler shows a face. */
    col.kind = c.kind || "normal";
    if (col.kind !== "normal") {
      if (col.kind === "filler" && cw > 0.001)
        part({ k: "box", role: "filler", x0: cx0, x1: cx1, y0: yb - t, y1: yt + t, z0: zc, z1: zc + STD.doorT, mat: "front" });
      x = cx1;
      return;
    }

    /* Where a front can actually go, worked out before anything is built: an
       open niche is open, so the compartments a door covers are the runs
       *between* the open ones — which is what lets one column be a closed base
       with open shelving above it. */
    col.runs = doorRuns(c);

    var y = yb;
    var rawSecs = Array.isArray(c.secs) && c.secs.length ? c.secs : [{ t: "open", h: Math.max(0, yt - yb) }];
    rawSecs.forEach(function (s, si) {
      var sh = Math.max(0, fin(s.h) ? s.h : 0);
      if (si > 0 && cw > 0.001 && sh > 0.001) {
        part({ k: "box", role: "fixedShelf", x0: cx0, x1: cx1, y0: y, y1: y + st, z0: zb, z1: zc - 1.5, mat: "carcass" });
        y += st;
      }
      var cell = { i: si, y0: y, y1: y + sh, ref: s, col: col };
      cell.covered = coveredBy(col.runs, si);
      col.secs.push(cell);
      if (cw > 0.001 && sh > 0.001) {
        fillSection(L, col, cell, s);
      }
      y += sh;
    });
    if (cw > 0.001) {
      buildDoor(L, col, c);
    }
    x = cx1;
  });

  countHardware(L);
  return finish(L);
}

/* --- the corner unit ---

   Two carcass sides facing the neighbouring runs, two backs against the walls,
   pentagon bottom/top/shelves, and one door on the diagonal. Only one column and
   one compartment: a corner unit is a single space, which is the whole point of
   it — you reach past the diagonal into the depth the neighbours cannot use. */
function layoutCorner(L, part) {
  var sp = L.sp,
    it = L.it,
    t = L.t,
    st = L.st || t,
    w = L.w,
    h = L.h,
    d = L.d,
    hw = w / 2,
    hd = d / 2,
    ph = sp.plinth,
    yb = ph + t,
    yt = h - t,
    c = cornerCut(sp, w, d),
    front = c * Math.SQRT2; // the finished door width

  // the two sides that meet the neighbouring runs
  part({ k: "box", role: "side", x0: hw - t, x1: hw, y0: ph, y1: h, z0: -hd, z1: hd - c, mat: "carcass" });
  part({ k: "box", role: "side", x0: -hw, x1: hw - c, y0: ph, y1: h, z0: hd - t, z1: hd, mat: "carcass" });
  // the two backs, against the walls
  if (sp.back > 0) {
    part({ k: "box", role: "back", x0: -hw, x1: hw, y0: ph, y1: h, z0: -hd, z1: -hd + sp.back, mat: "back" });
    part({ k: "box", role: "back", x0: -hw, x1: -hw + sp.back, y0: ph, y1: h, z0: -hd, z1: hd, mat: "back" });
  }
  // bottom and top, cut to the footprint
  ["bottom", "top"].forEach(function (role) {
    var y = role === "bottom" ? yb - t : yt;
    part({ k: "poly", role: role, pts: cornerPoly(sp, w - 0.4, d - 0.4), y0: y, y1: y + t, mat: "carcass", bw: w, bd: d, cut: c });
  });
  if (ph > 0 && sp.plinthType !== "legs") {
    // the plinth follows the diagonal too, or the toe kick would foul the door
    part({ k: "box", role: "plinth", x0: -hw, x1: hw - c * 0.7, y0: 0, y1: ph, z0: hd - STD.toeInset - t, z1: hd - STD.toeInset, mat: "carcass" });
    part({ k: "box", role: "plinth", x0: hw - STD.toeInset - t, x1: hw - STD.toeInset, y0: 0, y1: ph, z0: -hd, z1: hd - c * 0.7, mat: "carcass" });
  }

  if(ph>0 && sp.plinthType==="legs") {
    cornerPoly(sp,w,d).forEach(function(p){
      var len=Math.hypot(p.x,p.z),scale=len>0?Math.max(0,(len-8)/len):0;
      part({k:"cyl",role:"leg",x:p.x*scale,z:p.z*scale,y:ph/2,r:1.8,hgt:ph,mat:"metal"});
    });
  }

  // one column, one compartment, pentagon shelves in it
  var col = { i: 0, x0: -hw + t, x1: hw - t, w: w - 2 * t, ref: sp.cols[0], secs: [], kind: "normal" };
  L.cols.push(col);
  // one compartment behind one diagonal door: a run of exactly one, or none
  var hasDoor = (sp.cols[0].door || {}).t !== "none";
  col.runs = hasDoor ? [{ i0: 0, i1: 0 }] : [];
  var s = sp.cols[0].secs[0] || sec("shelves", yt - yb),
    cell = { i: 0, y0: yb, y1: yt, ref: s, col: col, covered: hasDoor };
  col.secs.push(cell);
  var n = s.n != null ? s.n : Math.max(0, Math.round((yt - yb) / (s.space || STD.shelfSpace)) - 1);
  cell.shelves = n;
  for (var i = 1; i <= n; i++) {
    var sy = yb + ((yt - yb) * i) / (n + 1);
    part({ k: "poly", role: "shelf", pts: cornerPoly(sp, w - 2 * t - 0.6, d - 2 * t - 0.6), y0: sy - st / 2, y1: sy + st / 2, mat: "carcass", bw: w - 2 * t, bd: d - 2 * t, cut: c });
  }

  /* The door, standing on the diagonal: a leaf of `front` wide, turned 45° and
     hinged at one end. Its unit carries both the turn and the swing, so opening
     it rotates about the hinge in the plane of the diagonal. */
  var dr = sp.cols[0].door || { t: "hinged" };
  if (dr.t !== "none") {
    var open = getDoorOpen(sp.open || 0),
      mx = (hw + hw - c) / 2, // the diagonal's midpoint
      mz = (hd - c + hd) / 2,
      hingeLeft = dr.hinge === "L",
      // the hinge end of the diagonal, and the 45° the leaf sits at
      px = hingeLeft ? hw - c : hw,
      pz = hingeLeft ? hd : hd - c,
      /* Closed, the leaf lies along the diagonal, which is +45° from the axis it
         is authored on — for either hinge end, since each is authored running
         away from its own pivot. Opening then carries on in the direction that
         takes the free end out of the cabinet. */
      base = Math.PI / 4,
      swing = open * 1.6 * (hingeLeft ? -1 : 1),
      u = L.unit({ type: "door", px: px, py: 0, pz: pz, rot: "y", ang: base + swing });
    // authored along +x from the pivot, then turned onto the diagonal by the unit
    var lx0 = hingeLeft ? px : px - front,
      lx1 = lx0 + front;
    frontLeaf(L, u, lx0, lx1, ph + sp.gap, h - sp.gap, pz - STD.doorT, pz, "front", "door");
    addHandle(L, ["edge", "gola"].includes(sp.hw.handle) ? (lx0 + lx1) / 2 : hingeLeft ? lx1 - 5 : lx0 + 5, (ph + h) / 2, pz, front, h - ph, "v", u);
    col.doorLeaves = 1;
    col.doorH = h - ph;
    col.hinges = hingeCount(h - ph);
    for (var k2 = 0; k2 < col.hinges; k2++) {
      var hy = ph + 8 + ((h - ph - 16) * k2) / Math.max(1, col.hinges - 1);
      L.part({ k: "cyl", role: "hinge", x: hingeLeft ? lx0 + 2 : lx1 - 2, y: hy, z: pz - 1.5, r: 1.7, hgt: 1.4, rx: Math.PI / 2, mat: "metal", unit: u });
    }
  }
  if (sp.top) part({ k: "poly", role: "worktop", pts: cornerPoly(sp, w + 3, d + 3), y0: h - sp.top, y1: h, mat: "top", bw: w + 3, bd: d + 3, cut: c });
  L.cornerFront = front;
}

/* --- which compartments a front covers ---

   Some compartments are open by definition: an open niche, a television niche
   (you cannot watch a screen through a door) and an appliance niche (a washing
   machine's own door is the front). `nodoor` marks any other compartment the
   design deliberately leaves open. Each of those breaks the run of covered
   compartments, so a column can carry two separate doors with open shelving
   between them — which is how such a unit is actually built, and what the
   office preset always claimed to be. */
export const OPEN_SEC = { open: 1, tv: 1, appl: 1 };
export function sectionOpen(s) {
  return !!(s && (s.nodoor || OPEN_SEC[s.t]));
}
function doorRuns(c) {
  var dr = c.door || { t: "none" };
  if (dr.t === "none" || dr.t === "drawer") return [];
  // a sliding leaf runs past everything: it cannot leave a niche uncovered
  if (dr.t === "sliding") return c.secs && c.secs.length ? [{ i0: 0, i1: c.secs.length - 1 }] : [];
  var runs = [],
    cur = null;
  (c.secs || []).forEach(function (s, i) {
    if (sectionOpen(s)) {
      cur = null;
      return;
    }
    if (cur) cur.i1 = i;
    else runs.push((cur = { i0: i, i1: i }));
  });
  return runs;
}
function coveredBy(runs, i) {
  for (var r = 0; r < runs.length; r++) if (i >= runs[r].i0 && i <= runs[r].i1) return true;
  return false;
}

/* --- staged opening progress math ---
   Phase 1 (0.0 -> 0.4): Doors swing/slide open
   Phase 2 (0.4 -> 0.8): Drawers, baskets, pull-outs & hampers extend
   Phase 3 (0.8 -> 1.0): Safes, TV brackets & accessories open */
export function getDoorOpen(rawOpen) {
  var v = Math.max(0, Math.min(1, rawOpen || 0));
  return Math.min(1, v / 0.4);
}

export function getInteriorOpen(rawOpen, behindDoor) {
  var v = Math.max(0, Math.min(1, rawOpen || 0));
  return behindDoor ? Math.max(0, Math.min(1, (v - 0.4) / 0.4)) : Math.min(1, v / 0.8);
}

export function getAccessoryOpen(rawOpen) {
  var v = Math.max(0, Math.min(1, rawOpen || 0));
  return Math.max(0, Math.min(1, (v - 0.8) / 0.2));
}

/* --- what goes inside one compartment --- */
function fillSection(L, col, cell, s) {
  var sp = L.sp,
    t = L.t,
    st = L.st || t,
    x0 = col.x0,
    x1 = col.x1,
    y0 = cell.y0,
    y1 = cell.y1,
    H = y1 - y0,
    zb = L.zb,
    zc = L.zc,
    // whether THIS compartment ends up behind a front, not merely whether the
    // column has one — an open niche in a doored column is still open
    hasDoor = !!cell.covered,
    shelfBack = zb + 1,
    shelfFront = zc - 2;

  function shelfRun(space, tilt) {
    if (x1 - x0 <= 0.4 || H <= 0.001) { cell.shelves = 0; return; }
    var n = s.n != null ? Math.max(0, s.n) : Math.max(0, Math.round(H / (space || sp.space || STD.shelfSpace)) - 1);
    cell.shelves = n;
    if (n === 0) return;
    for (var i = 1; i <= n; i++) {
      var sy = y0 + (H * i) / (n + 1);
      L.part({
        k: "box", role: "shelf", x0: x0 + 0.2, x1: x1 - 0.2, y0: sy - st / 2, y1: sy + st / 2,
        z0: shelfBack, z1: shelfFront, mat: "carcass", tilt: tilt || 0,
      });
    }
  }
  function railAt(y) {
    L.part({
      k: "cyl", role: "rail", x: (x0 + x1) / 2, y: y, z: (zb + zc) / 2 + 4,
      r: 1.5, hgt: x1 - x0 - 1, rz: Math.PI / 2, mat: "rail",
    });
    cell.rails = (cell.rails || 0) + 1;
    // a couple of garments, only where they will actually be seen
    if (!hasDoor || sp.open > 0.25) {
      var n = Math.max(2, Math.floor((x1 - x0) / 14));
      for (var i = 0; i < n; i++) {
        var gx = x0 + 4 + ((x1 - x0 - 8) * i) / Math.max(1, n - 1),
          len = Math.min(y - y0 - 6, 60 + ((i * 13) % 25));
        L.part({
          k: "box", role: "garment", x0: gx - 4.5, x1: gx + 4.5, y0: y - 4 - len, y1: y - 4,
          z0: (zb + zc) / 2 - 2, z1: (zb + zc) / 2 + 10, mat: "garment", tone: i % 5,
        });
      }
    }
  }

  switch (s.t) {
    case "shelves":
      shelfRun(s.space);
      break;
    case "shoe":
      shelfRun(s.space || STD.shoeSpace, -0.22);
      break;
    case "hang":
    case "hangS":
      railAt(y1 - STD.railDrop);
      break;
    case "hang2":
      railAt(y1 - STD.railDrop);
      railAt(y0 + H / 2 - STD.railDrop);
      break;
    case "drawers":
      drawerStack(L, col, cell, s, hasDoor);
      break;
    case "pullout":
      basketStack(L, col, cell, s);
      break;
    case "trouser": {
      var trouserOpen = getInteriorOpen(sp.open || 0, hasDoor);
      var uTrouser = L.unit({ type: "drawer", tx: 0, ty: 0, tz: (zc - zb) * 0.65 * trouserOpen, px: 0, py: 0, pz: 0 });
      for (var i = 0; i < 5; i++) {
        var ty = y1 - 6;
        if (ty < y0 + 4) break;
        L.part({ k: "cyl", role: "rail", x: (x0 + x1) / 2, y: ty, z: zb + 3 + i * Math.max(0, zc - zb - 6) / 4, r: 0.7, hgt: x1 - x0 - 2, rz: Math.PI / 2, mat: "rail", unit: uTrouser });
      }
      cell.trouser = 1;
      break;
    }
    case "laundry": {
      var hamperOpen = getInteriorOpen(sp.open || 0, hasDoor);
      var uHamper = L.unit({ type: "hamper", px: (x0 + x1) / 2, py: y0 + 2, pz: zb + 4, rot: "x", ang: hamperOpen * 0.35, tz: (zc - zb) * 0.15 * hamperOpen });
      L.part({ k: "box", role: "hamper", x0: x0 + 3, x1: x1 - 3, y0: y0 + 2, y1: y1 - 6, z0: zb + 4, z1: zc - 6, mat: "fabric", unit: uHamper });
      cell.hamper = 1;
      break;
    }
    case "safe": {
      var safeOpen = getAccessoryOpen(sp.open || 0);
      var uSafe = L.unit({ type: "door", px: x0 + 2, py: 0, pz: zc - 3, rot: "y", ang: -safeOpen * 1.6 });
      L.part({ k: "box", role: "safe", x0: x0 + 2, x1: x1 - 2, y0: y0 + 2, y1: y1 - 2, z0: zb + 3, z1: zc - 3, mat: "dark" });
      L.part({ k: "box", role: "safeDoor", x0: x0 + 2.5, x1: x1 - 2.5, y0: y0 + 2.5, y1: y1 - 2.5, z0: zc - 3.5, z1: zc - 2.5, mat: "dark", unit: uSafe });
      L.part({ k: "cyl", role: "safeKnob", x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: zc - 2, r: 2.2, hgt: 1.6, rx: Math.PI / 2, mat: "metal", unit: uSafe });
      cell.safe = 1;
      break;
    }
    /* A television niche is a board to hang a screen on, a hole for the cables
       and the screen itself. It used to be a 6 mm dark panel at the back of the
       compartment, which is invisible in a cabinet and told you nothing about
       whether the set you own would fit. */
    case "tv": {
      var nW = x1 - x0,
        nH = y1 - y0,
        // the mounting board: a real panel, so it lands on the cutting list
        pz1 = zb + t;
      L.part({ k: "box", role: "tvPanel", x0: x0 + 0.2, x1: x1 - 0.2, y0: y0 + 0.5, y1: y1 - 0.5, z0: zb, z1: pz1, mat: "carcass" });
      // the cable pass-through, low and to one side, where a bracket never sits
      L.part({ k: "cyl", role: "grommet", x: x0 + Math.min(12, nW * 0.2), y: y0 + Math.min(10, nH * 0.2), z: pz1 - 0.3, r: 3, hgt: 1.2, rx: Math.PI / 2, mat: "dark" });
      cell.grommet = 1;
      // the screen: 16:9, held off the board on its bracket, with a margin all
      // round so it reads as a set in a niche rather than a panel filling it
      var sw = Math.max(0, nW - 8),
        shh = Math.min(nH - 6, (sw * 9) / 16);
      if (sw >= 20 && shh > 12 && nH >= 18 && zc - pz1 >= 5.5) {
        var scx = (x0 + x1) / 2,
          scy = y0 + nH * 0.52,
          sz0 = pz1 + 4;
        L.part({ k: "box", role: "tvBracket", x0: scx - 8, x1: scx + 8, y0: scy - 6, y1: scy + 6, z0: pz1, z1: sz0, mat: "metal" });
        L.part({ k: "box", role: "tvBody", x0: scx - sw / 2, x1: scx + sw / 2, y0: scy - shh / 2, y1: scy + shh / 2, z0: sz0, z1: sz0 + 1.2, mat: "dark" });
        L.part({ k: "box", role: "tvScreen", x0: scx - sw / 2 + 0.8, x1: scx + sw / 2 - 0.8, y0: scy - shh / 2 + 0.8, y1: scy + shh / 2 - 0.8, z0: sz0 + 1.2, z1: sz0 + 1.5, mat: "screen" });
        cell.tvSize = Math.round(Math.sqrt(sw * sw + shh * shh) / 2.54); // the size a shop would quote, in inches
      }
      cell.tv = 1;
      break;
    }
    /* An appliance niche used to emit nothing whatsoever — an empty hole that
       looked identical to an open shelf and told you nothing about whether the
       machine fits. The appliance is not our supply, so it is drawn but never
       costed; what matters is that the hole is the right size and the front of
       the machine, not a cabinet door, closes it. */
    case "appl": {
      var aW = x1 - x0,
        aH = y1 - y0,
        ax0 = x0 + 1,
        ax1 = x1 - 1,
        acx = (x0 + x1) / 2,
        af1 = zc - 1, // the machine's own front sits just inside the carcass line
        af0 = af1 - 2;
      L.part({ k: "box", role: "appliance", x0: ax0, x1: ax1, y0: y0 + 1, y1: y1 - 1, z0: zb + 2, z1: af0, mat: "appliance" });
      L.part({ k: "box", role: "appliance", x0: ax0, x1: ax1, y0: y0 + 1, y1: y1 - 1, z0: af0, z1: af1, mat: "appliance" });
      if (aH >= 72 && aH <= 105 && aW >= 52) {
        // washer / dryer proportions: a porthole and a detergent drawer
        var pr = Math.min(aW, aH) * 0.31;
        L.part({ k: "cyl", role: "applDoor", x: acx, y: y0 + aH * 0.46, z: af1 - 0.2, r: pr, hgt: 1.4, rx: Math.PI / 2, mat: "metal" });
        L.part({ k: "cyl", role: "applGlass", x: acx, y: y0 + aH * 0.46, z: af1 + 0.4, r: pr * 0.78, hgt: 0.8, rx: Math.PI / 2, mat: "glass" });
        L.part({ k: "box", role: "applPanel", x0: ax0 + 2, x1: ax1 - 2, y0: y1 - 9, y1: y1 - 4, z0: af1, z1: af1 + 0.6, mat: "dark" });
      } else {
        // oven / microwave proportions: a glazed door and a full-width handle
        L.part({ k: "box", role: "applGlass", x0: ax0 + 3, x1: ax1 - 3, y0: y0 + aH * 0.22, y1: y1 - aH * 0.3, z0: af1, z1: af1 + 0.5, mat: "glass" });
        L.part({ k: "box", role: "applPanel", x0: ax0 + 2, x1: ax1 - 2, y0: y1 - Math.min(8, aH * 0.2), y1: y1 - 2, z0: af1, z1: af1 + 0.6, mat: "dark" });
        L.part({ k: "cyl", role: "applHandle", x: acx, y: y1 - Math.min(11, aH * 0.26), z: af1 + 2, r: 0.9, hgt: aW - 8, rz: Math.PI / 2, mat: "metal" });
      }
      cell.appl = 1;
      break;
    }
    case "open":
    case "box":
    default:
      break;
  }
  if (sp.hw.led && (s.t === "shelves" || s.t === "hang" || s.t === "hang2" || s.t === "open")) {
    L.part({ k: "box", role: "led", x0: x0 + 2, x1: x1 - 2, y0: y1 - 1.4, y1: y1 - 0.8, z0: zc - 8, z1: zc - 6, mat: "led" });
    cell.led = 1;
  }
}

// Drawer heights: an explicit ratio list, or an even split.
function drawerHeights(s, H, gap) {
  var n = s.n != null ? Math.max(0, s.n) : Math.max(1, Math.round(H / (STD.drawerH + gap))),
    hs = [];
  if (n <= 0 || H <= 0) return hs;
  if (s.heights && s.heights.length === n) {
    var sum = s.heights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var avail = Math.max(0, H - gap * (n - 1));
    s.heights.forEach(function (r) {
      hs.push(sum > 0 ? (avail * r) / sum : 0);
    });
  } else {
    var e = Math.max(0, (H - gap * (n - 1)) / n);
    for (var i = 0; i < n; i++) hs.push(e);
  }
  return hs;
}

function drawerStack(L, col, cell, s, behindDoor) {
  var sp = L.sp,
    gap = sp.gap,
    H = cell.y1 - cell.y0,
    hs = drawerHeights(s, H, gap),
    zc = L.zc,
    inset = behindDoor ? 3 : 0, // internal drawers sit back from the door line
    fz1 = zc - inset,
    fz0 = fz1 - STD.doorT,
    y = cell.y0;
  cell.drawers = [];
  if (hs.length === 0 || col.w <= 0.001 || H <= 0.001) return;
  var drawerOpen = getInteriorOpen(sp.open || 0, behindDoor);
  hs.forEach(function (dh, i) {
    if (dh <= 4 || col.w-gap <= 2 + 2*sp.panel || fz0 <= L.zb + 3 + sp.panel) {
      cell.invalidDrawers = (cell.invalidDrawers || 0) + 1;
      y += dh + gap;
      return;
    }
    var slide = (L.zc - L.zb) * 0.72 * drawerOpen,
      u = L.unit({ type: "drawer", tx: 0, ty: 0, tz: slide, px: 0, py: 0, pz: 0 });
    var dx0 = col.x0 + gap / 2,
      dx1 = col.x1 - gap / 2,
      dy0 = y,
      dy1 = y + dh;
    if (behindDoor)
      L.part({ k: "box", role: "drawerFront", x0: dx0, x1: dx1, y0: dy0, y1: dy1, z0: fz0, z1: fz1, mat: "carcass", unit: u });
    else frontLeaf(L, u, dx0, dx1, dy0, dy1, fz0, fz1, "front", "drawerFront");
    // the box behind the front, so an open drawer is not a floating panel
    var bz1 = fz0,
      bz0 = L.zb + 3,
      bh = Math.min(dh - 3, 16), bt = sp.panel;
    L.part({ k: "box", role: "drawerBox", x0: dx0 + 1, x1: dx0 + 1 + bt, y0: dy0 + 1.5, y1: dy0 + 1.5 + bh, z0: bz0, z1: bz1, mat: "carcass", unit: u });
    L.part({ k: "box", role: "drawerBox", x0: dx1 - 1 - bt, x1: dx1 - 1, y0: dy0 + 1.5, y1: dy0 + 1.5 + bh, z0: bz0, z1: bz1, mat: "carcass", unit: u });
    L.part({ k: "box", role: "drawerBox", x0: dx0 + 1, x1: dx1 - 1, y0: dy0 + 1.5, y1: dy0 + 1.5 + bh, z0: bz0, z1: bz0 + bt, mat: "carcass", unit: u });
    L.part({ k: "box", role: "drawerBottom", x0: dx0 + 1, x1: dx1 - 1, y0: dy0 + 1.5, y1: dy0 + 2.3, z0: bz0, z1: bz1, mat: "back", unit: u });
    if (!behindDoor) addHandle(L, (dx0 + dx1) / 2, dy1 - Math.min(dh / 2, 6), fz1, dx1 - dx0, dh, "h", u);
    cell.drawers.push({ y0: dy0, y1: dy1 });
    y += dh + gap;
  });
}

function basketStack(L, col, cell, s) {
  var n = s.n || Math.max(1, Math.round((cell.y1 - cell.y0) / 24)),
    step = (cell.y1 - cell.y0) / n,
    zc = L.zc;
  var behindDoor = !!cell.covered;
  var basketOpen = getInteriorOpen(L.sp.open || 0, behindDoor);
  cell.baskets = n;
  for (var i = 0; i < n; i++) {
    var by = cell.y0 + i * step + 2,
      u = L.unit({ type: "drawer", tx: 0, ty: 0, tz: (L.zc - L.zb) * 0.7 * basketOpen, px: 0, py: 0, pz: 0 });
    L.part({ k: "box", role: "basket", x0: col.x0 + 2, x1: col.x1 - 2, y0: by, y1: by + 1.2, z0: L.zb + 3, z1: zc - 3, mat: "metal", unit: u });
    [0, 1].forEach(function (e) {
      L.part({
        k: "box", role: "basket", x0: e ? col.x1 - 3.2 : col.x0 + 2, x1: e ? col.x1 - 2 : col.x0 + 3.2,
        y0: by, y1: by + Math.min(14, step - 4), z0: L.zb + 3, z1: zc - 3, mat: "metal", unit: u,
      });
    });
    L.part({ k: "box", role: "basket", x0: col.x0 + 2, x1: col.x1 - 2, y0: by, y1: by + Math.min(14, step - 4), z0: zc - 4.2, z1: zc - 3, mat: "metal", unit: u });
  }
}

/* One door leaf or drawer face, in the chosen front style. Everything is real
   geometry — a shaker front is four rails around a recessed panel, a reeded
   one is a run of battens — so it reads correctly from any angle and the cut
   list gets the pieces that actually have to be made.
   `role` keeps the cutting list honest about what the part is. */
function frontLeaf(L, u, x0, x1, y0, y1, z0, z1, mat, role) {
  var st = mat === "glass" || mat === "mirror" ? "glazed" : L.sp.front || "flat",
    w = x1 - x0,
    h = y1 - y0,
    t = z1 - z0;
  if (w <= 0.01 || h <= 0.01 || t <= 0.001 || !fin(w) || !fin(h) || !fin(t)) return;
  if (role === "door" || role === "drawerFront") {
    L.fronts ||= [];
    L.fronts.push({ unit: u, x0, x1, y0, y1, z0, z1, style: st, role });
  }
  function p(a, b, c, d, e, f, m, r) {
    L.part({ k: "box", role: r || role, x0: a, x1: b, y0: c, y1: d, z0: e, z1: f, mat: m, unit: u });
  }
  if (st === "shaker" || st === "glazed") {
    // stiles and rails around a recessed centre — 7 cm is the usual width
    var r0 = Math.min(7, Math.min(w, h) * 0.22),
      inz = z1 - t * 0.45; // the panel sits back from the face
    p(x0, x0 + r0, y0, y1, z0, z1, "front");
    p(x1 - r0, x1, y0, y1, z0, z1, "front");
    p(x0 + r0, x1 - r0, y0, y0 + r0, z0, z1, "front");
    p(x0 + r0, x1 - r0, y1 - r0, y1, z0, z1, "front");
    p(x0 + r0 - 0.6, x1 - r0 + 0.6, y0 + r0 - 0.6, y1 - r0 + 0.6, z0, inz,
      st === "glazed" ? mat : "front", st === "glazed" ? "glazing" : "doorPanel");
    return;
  }
  if (st === "groove" || st === "slat") {
    // a plain back panel with battens standing proud of it
    var relief = t * 0.55; // deep enough to catch a shadow line
    p(x0, x1, y0, y1, z0, z1 - relief, mat);
    var along = st === "slat" ? w : h,
      pitch = st === "slat" ? 5.5 : 9,
      n = Math.max(1, Math.min(28, Math.round(along / pitch))),
      step = along / n,
      bat = step * 0.72;
    for (var i = 0; i < n; i++) {
      var a0 = (st === "slat" ? x0 : y0) + i * step + (step - bat) / 2;
      if (st === "slat") p(a0, a0 + bat, y0, y1, z1 - relief, z1, mat, "batten");
      else p(x0, x1, a0, a0 + bat, z1 - relief, z1, mat, "batten");
    }
    return;
  }
  p(x0, x1, y0, y1, z0, z1, mat); // flat slab
}

/* --- doors --- */
function buildDoor(L, col, c) {
  var dr = c.door || { t: "none" },
    sp = L.sp,
    gap = sp.gap,
    open = getDoorOpen(sp.open || 0),
    hd = L.d / 2,
    y0 = L.yb - L.t - (sp.plinthType === "none" ? 0 : 0),
    y1 = L.yt + L.t;
  if (col.w <= 0.001 || !fin(col.w) || dr.t === "none" || dr.t === "drawer") return;

  var mat = dr.t === "glass" ? "glass" : dr.t === "mirror" ? "mirror" : "front";
  col.doorMat = mat;

  if (dr.t === "sliding") {
    // Leaves span the whole front and overlap; the back leaf runs in the rear
    // track, so column-by-column they read as one continuous front.
    var lane = col.i % 2, // alternate tracks
      z1 = hd - (lane ? 4.6 : 0.6),
      z0 = z1 - STD.doorT,
      // opening a slider means one leaf travels behind its neighbour — the
      // rear-track leaves stay put, so nothing ever leaves the carcass
      slide = lane ? -open * (col.x1 - col.x0) : 0,
      u = L.unit({ type: "slide", tx: slide, ty: 0, tz: 0, px: 0, py: 0, pz: 0 });
    frontLeaf(L, u, col.x0 - gap, col.x1 + gap, y0 + 2, y1 - 2, z0, z1, mat, "door");
    addHandle(L, col.i % 2 ? col.x0 + 5 : col.x1 - 5, (y0 + y1) / 2, z1, 4, y1 - y0, "v", u);
    if (!L._hasSlidingTracks) {
      L.part({ k: "box", role: "track", x0: -L.w / 2, x1: L.w / 2, y0: y1 - 2, y1: y1, z0: hd - 6, z1: hd, mat: "metal" });
      L.part({ k: "box", role: "track", x0: -L.w / 2, x1: L.w / 2, y0: y0, y1: y0 + 2, z0: hd - 6, z1: hd, mat: "metal" });
      L._hasSlidingTracks = true;
    }
    col.doorLeaves = 1;
    return;
  }

  /* One door per run of covered compartments. The run's own top and bottom set
     the leaf's height, splitting the shelf it stops at, so a closed base and a
     closed top box read as two separate fronts with the niche between them
     genuinely open. */
  var z0d = L.zc,
    z1d = L.zc + STD.doorT,
    runs = col.runs && col.runs.length ? col.runs : [];
  col.doorLeaves = 0;
  col.hinges = 0;
  col.doorH = 0;

  runs.forEach(function (run) {
    var last = col.secs.length - 1,
      ry0 = run.i0 === 0 ? y0 : col.secs[run.i0].y0 - L.t / 2,
      ry1 = run.i1 === last ? y1 : col.secs[run.i1].y1 + L.t / 2,
      rh = ry1 - ry0;
    if (rh < 8) return;
    var leaves = Math.max(1, dr.leaves || (col.w > STD.maxDoor ? 2 : 1)),
      lw = (col.w - gap * (leaves - 1)) / leaves;
    col.doorLeaves += leaves;
    col.doorH = Math.max(col.doorH, rh);

    for (var i = 0; i < leaves; i++) {
      var lx0 = col.x0 + i * (lw + gap),
        lx1 = lx0 + lw,
        // outer edge carries the hinges: a 2-leaf pair opens away from the middle
        hingeLeft = leaves > 1 ? i === 0 : dr.hinge === "L",
        px = hingeLeft ? lx0 : lx1,
        /* Sign: three.js turns +x towards -z for a positive Y rotation, and the
           cabinet's front is +z — so a leaf hinged on its left edge has to swing
           through a NEGATIVE angle to open outwards. Getting this backwards sent
           every door through the back panel and into the wall. */
        ang = open * 1.75 * (hingeLeft ? -1 : 1),
        u2;
      if (dr.t === "folding") {
        foldingLeaf(L, lx0, lx1, ry0 + gap, ry1 - gap, z0d, z1d, mat, hingeLeft, open, gap);
        col.hinges += 2 + hingeCount(rh); // carcass hinges plus the centre knuckles
        continue;
      }
      if (dr.t === "lift") {
        u2 = L.unit({ type: "lift", px: 0, py: ry1, pz: z1d, rot: "x", ang: -open * 1.3 });
      } else {
        u2 = L.unit({ type: "door", px: px, py: 0, pz: z0d, rot: "y", ang: ang });
      }
      frontLeaf(L, u2, lx0, lx1, ry0 + gap, ry1 - gap, z0d, z1d, mat, "door");
      var hx = hingeLeft ? lx1 - 5 : lx0 + 5;
      if (dr.t === "lift") addHandle(L, (lx0 + lx1) / 2, ry0 + 4, z1d, lw, 6, "h", u2);
      else addHandle(L, hx, (ry0 + ry1) / 2, z1d, 5, rh, "v", u2);
      // the hinge cups themselves, visible when the door swings
      var nh = hingeCount(rh, leafWeight(L, { doorMat: mat, doorLeaves: leaves, doorH: rh, w: col.w }));
      col.hinges += nh;
      for (var k = 0; k < nh; k++) {
        var hy = ry0 + 8 + ((rh - 16) * k) / Math.max(1, nh - 1);
        L.part({ k: "cyl", role: "hinge", x: hingeLeft ? lx0 + 2 : lx1 - 2, y: hy, z: z0d - 1.5, r: 1.7, hgt: 1.4, rx: Math.PI / 2, mat: "metal", unit: u2 });
      }
    }
  });
}

/* A bi-fold ("אקורדיון") is two half-leaves knuckled together: the outer half
   swings on the carcass through `a`, and the inner half counter-rotates through
   `-a` about the moving knuckle, so the pair folds flat and the opening it
   leaves is only shortened, never swept. The unit list is flat (no parenting),
   so the knuckle's travel is applied as the second unit's translation and its
   rotation is given absolutely. */
function foldingLeaf(L, lx0, lx1, y0, y1, z0d, z1d, mat, hingeLeft, open, gap) {
  var w = lx1 - lx0,
    half = (w - gap / 2) / 2,
    s = hingeLeft ? 1 : -1,
    hingeX = hingeLeft ? lx0 : lx1,
    a = open * 1.55 * (hingeLeft ? -1 : 1), // same sign rule as a hinged leaf
    jointX = hingeX + s * half;

  var uOut = L.unit({ type: "fold", outer: true, px: hingeX, py: 0, pz: z0d, rot: "y", ang: a });
  frontLeaf(L, uOut, hingeLeft ? lx0 : lx1 - half, hingeLeft ? lx0 + half : lx1, y0, y1, z0d, z1d, mat, "door");

  // where the knuckle has travelled to, once the outer half has swung
  var tx = s * half * (Math.cos(a) - 1),
    tz = -s * half * Math.sin(a);
  var uIn = L.unit({ type: "fold", px: jointX, py: 0, pz: z0d, tx: tx, tz: tz, rot: "y", ang: -a });
  frontLeaf(L, uIn, hingeLeft ? jointX + gap / 2 : jointX - half, hingeLeft ? jointX + half : jointX - gap / 2, y0, y1, z0d, z1d, mat, "door");
  addHandle(L, hingeLeft ? lx1 - 5 : lx0 + 5, (y0 + y1) / 2, z1d, 5, y1 - y0, "v", uIn);
}

/* How many hinges a leaf needs. Height is the usual rule of thumb, but it is
   only a proxy for weight — a 2 m glass or lacquered door is far heavier than a
   2 m melamine one and needs the extra hinge that height alone would not ask
   for. Each concealed hinge is good for about 6 kg of leaf. */
export function hingeCount(h, kg) {
  var byHeight = h <= 90 ? 2 : h <= 160 ? 3 : h <= 200 ? 4 : h <= 240 ? 5 : 6;
  if (!kg) return byHeight;
  return Math.max(byHeight, Math.min(8, Math.ceil(kg / 6)));
}

/* What a board actually weighs, from the sheet it is cut out of. Densities are
   in the catalogue: 650 kg/m³ for melamine chipboard, 780 for lacquered MDF,
   2500 for glass — which is why a glass door needs different hardware. */
export function boardWeight(areaM2, sheet) {
  var dens = (sheet && sheet.dens) || 700,
    t = (sheet && sheet.t) || STD.doorT;
  return areaM2 * (t / 100) * dens;
}

/* The weight of one leaf of this column's front, in kg. */
export function leafWeight(L, col) {
  var sp = L.sp,
    mat = col.doorMat || "front",
    sheet = sheetFor(sp, stockRole(mat), STD.doorT),
    leaves = col.doorLeaves || 1,
    h = col.doorH || L.yt - L.yb;
  if (!leaves) return 0;
  return boardWeight((((isCorner(sp) ? L.cornerFront || col.w : col.w) / leaves) * h) / 10000, sheet);
}

/* --- handles (פרזול) --- */
function addHandle(L, cx, cy, zFace, availW, availH, dir, unit) {
  var t = L.sp.hw.handle;
  L.hw.handles = (L.hw.handles || 0) + 1;
  if (!["push","edge","gola"].includes(t)) {
    L.handleMounts ||= [];
    (t === "knob" || t === "leather" ? [0] : [-4.8,4.8]).forEach(function(offset){
      L.handleMounts.push({unit:unit,x:cx+(dir==="h"?offset:0),y:cy+(dir==="v"?offset:0)});
    });
  }
  if (t === "push") return;
  if (t === "knob") {
    L.part({ k: "cyl", role: "handle", x: cx, y: cy, z: zFace + 1.1, r: 1.6, hgt: 2.2, rx: Math.PI / 2, mat: "handle", unit: unit });
    L.part({ k: "sph", role: "handle", x: cx, y: cy, z: zFace + 2.4, r: 1.7, mat: "handle", unit: unit });
    return;
  }
  if (t === "edge" || t === "gola") {
    // a continuous lip along the top edge of the front — no protruding handle
    var lipY = dir === "v" ? cy + availH / 2 - 3 : cy + Math.min(availH / 2, 3);
    L.part({
      k: "box", role: "handle", x0: cx - availW / 2 + 1, x1: cx + availW / 2 - 1,
      y0: lipY - 1.6, y1: lipY + 0.4, z0: zFace + 0.2, z1: zFace + (t === "gola" ? 1 : 2.2), mat: "handle", unit: unit,
    });
    return;
  }
  if (t === "leather") {
    L.part({
      k: "box", role: "handle", x0: cx - 1.4, x1: cx + 1.4, y0: cy - 6, y1: cy + 6,
      z0: zFace + 0.2, z1: zFace + 1.4, mat: "leather", unit: unit,
    });
    return;
  }
  // bar handle: 12-30 cm on drawers, ~half the leaf on doors, on 2 stand-offs
  var len = dir === "v" ? Math.min(30, Math.max(12, availH * 0.22)) : Math.min(32, Math.max(12, availW * 0.4)),
    r = 0.8,
    off = 3;
  if (dir === "v") {
    L.part({ k: "cyl", role: "handle", x: cx, y: cy, z: zFace + off, r: r, hgt: len, mat: "handle", unit: unit });
    [-1, 1].forEach(function (s) {
      L.part({ k: "cyl", role: "handle", x: cx, y: cy + s * 4.8, z: zFace + off / 2, r: r * 0.85, hgt: off, rx: Math.PI / 2, mat: "handle", unit: unit });
    });
  } else {
    L.part({ k: "cyl", role: "handle", x: cx, y: cy, z: zFace + off, r: r, hgt: len, rz: Math.PI / 2, mat: "handle", unit: unit });
    [-1, 1].forEach(function (s) {
      L.part({ k: "cyl", role: "handle", x: cx + s * 4.8, y: cy, z: zFace + off / 2, r: r * 0.85, hgt: off, rx: Math.PI / 2, mat: "handle", unit: unit });
    });
  }
}

/* --- hardware tally, for the price and the ironmongery list --- */
function countHardware(L) {
  var hwc = L.hw;
  hwc.legs = L.parts.filter(function(p){return p.role === "leg";}).length;
  hwc.hinges = 0;
  hwc.slides = 0;
  hwc.rails = 0;
  hwc.railLen = 0;
  hwc.pins = 0;
  hwc.slidingLeaves = 0;
  hwc.baskets = 0;
  hwc.hampers = 0;
  hwc.trousers = 0;
  hwc.safes = 0;
  hwc.ledLen = 0;
  hwc.tvBrackets = 0;
  hwc.grommets = 0;
  hwc.applNiches = 0;
  L.cols.forEach(function (col) {
    var dr = col.ref.door || { t: "none" };
    if (dr.t === "sliding") hwc.slidingLeaves += 1;
    // buildDoor counts the hinges it actually placed, run by run — a column with
    // a closed base and a closed top box carries two doors' worth, and a bi-fold
    // carries the centre knuckles on top of the carcass hinges
    else if (dr.t !== "none" && dr.t !== "drawer") hwc.hinges += col.hinges || 0;
    col.secs.forEach(function (cell) {
      if (cell.drawers) hwc.slides += cell.drawers.length;
      if (cell.baskets) hwc.baskets += cell.baskets;
      if (cell.shelves) hwc.pins += cell.shelves * 4;
      if (cell.rails) {
        hwc.rails += cell.rails;
        hwc.railLen += (cell.rails * col.w) / 100;
      }
      if (cell.hamper) hwc.hampers++;
      if (cell.trouser) hwc.trousers++;
      if (cell.safe) hwc.safes++;
      if (cell.tv) hwc.tvBrackets++;
      if (cell.grommet) hwc.grommets++;
      if (cell.appl) hwc.applNiches++;
      if (cell.led) hwc.ledLen += col.w / 100;
    });
  });
}


/* ========================= cut list & price ========================= */

function m2(a, b) {
  return (a * b) / 10000;
}

/* Which parts are boards that have to be cut out of something. */
export const BOARD_ROLES = [
  "plinth", "side", "bottom", "top", "back", "worktop", "divider", "fixedShelf",
  "shelf", "door", "doorPanel", "batten", "glazing", "filler", "drawerFront",
  "drawerBox", "drawerBottom", "tvPanel",
];
// Fronts: the roles a front style makes more expensive to machine.
const FRONT_ROLES = ["door", "doorPanel", "batten", "drawerFront", "filler"];

/* Which sheet a part of this role and thickness is cut from.

   The carcass, the fronts and the back are exactly as thick as the board they
   come off, so the thickness has to match — pick 25 mm melamine and you get
   25 mm sides. A worktop, a glazed panel or a mirror is drawn at whatever
   thickness the model needs (a "40 mm" worktop is a 20 mm slab with a mitred
   build-up, and a glass door leaf is drawn at door thickness), so matching on it
   would pick an absurd material. Those honour the chosen slab as it is. */
export function sheetFor(sp, srole, thickness) {
  var free = srole === "top" || srole === "glass" || srole === "mirror";
  return resolveSheet(sp.stock, srole, free ? null : thickness);
}

/* Which pile of board a part comes off. The 3D material names say what a part
   looks like; these five say what it is bought as, and that is what the cut plan
   nests and the price is built from. */
export function stockRole(mat) {
  if (mat === "back") return "back";
  if (mat === "top") return "top";
  if (mat === "glass" || mat === "glazing") return "glass";
  if (mat === "mirror") return "mirror";
  if (mat === "front" || mat === "doorPanel" || mat === "batten") return "front";
  return "carcass";
}

/* How much edge banding a board needs — read off where the board sits rather
   than from a table of roles, so a shelf gets its own front edge whatever
   column it lands in.

   A board is banded where a person can see or touch the raw core: a shelf on
   its front edge, a side on its front edge, a door all the way round, a drawer
   box along its top. A back panel, a recessed door panel, a glazing bead and a
   drawer bottom are captured on all four sides and get nothing. Metres. */
// a TV mounting board is captured in its niche on all four sides, like a back
/* A board's finished size and thickness, whatever shape it is. A polygon board
   (a corner unit's pentagon shelf) is bought as the rectangle it is cut out of —
   that is what nests and what is paid for — and `cut` records the corner that
   comes off it, which is what the cutting list has to say. */
export function partDims(p) {
  if (p.k === "poly") {
    var t = Math.abs(p.y1 - p.y0);
    return { l: Math.max(p.bw, p.bd), w: Math.min(p.bw, p.bd), t: t, cut: p.cut || 0, poly: 1 };
  }
  var dims = [Math.abs(p.x1 - p.x0), Math.abs(p.y1 - p.y0), Math.abs(p.z1 - p.z0)].sort(function (a, b) {
    return b - a;
  });
  return { l: dims[0], w: dims[1], t: dims[2], cut: 0, poly: 0 };
}

const NO_BAND = { back: 1, doorPanel: 1, glazing: 1, drawerBottom: 1, batten: 1, tvPanel: 1 };
export function bandLen(p) {
  if (NO_BAND[p.role]) return 0;
  // a pentagon board shows its diagonal, and nothing else that is not captured
  if (p.k === "poly") return ((p.cut || 0) * Math.SQRT2) / 100;
  if (p.k !== "box") return 0;
  var dx = Math.abs(p.x1 - p.x0),
    dy = Math.abs(p.y1 - p.y0),
    dz = Math.abs(p.z1 - p.z0),
    dims = [dx, dy, dz].sort(function (a, b) {
      return a - b;
    }),
    face = dims[1] + dims[2]; // half the perimeter of the board's face
  if (FRONT_ROLES.indexOf(p.role) >= 0) return (2 * face) / 100; // seen all round
  if (p.role === "worktop") return (dx + (p.exposedReturns ?? 2) * dz) / 100; // front edge and exposed slab returns
  if (p.role === "plinth") return Math.max(dx, dz) / 100;
  if (p.role === "drawerBox") return dims[2] / 100; // the top edge only
  if (dz <= dx && dz <= dy) return (2 * face) / 100; // face-on board, no rule
  if (dy <= dx) return dx / 100; // shelf / top / bottom — its front edge
  return dy / 100; // side / divider — its front edge
}

/* The panel list a joiner would order: every board with its finished size,
   grouped by identical parts, each row carrying the banding it needs and the
   sheet it is to be cut from. Sizes are the cut sizes used in the model. */
export function cutList(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    rows = {},
    order = [];
  L.parts.forEach(function (p) {
    if (p.k !== "box" && p.k !== "poly") return;
    if (BOARD_ROLES.indexOf(p.role) < 0) return;
    var D = partDims(p),
      key = p.role + "|" + p.mat + "|" + +D.l.toFixed(10) + "x" + +D.w.toFixed(10) + "x" + D.t.toFixed(10) + "|" + +D.cut.toFixed(10);
    if (!rows[key]) {
      var srole = stockRole(p.mat),
        sheet = sheetFor(sp, srole, D.t);
      rows[key] = {
        role: p.role, mat: p.mat, srole: srole,
        l: +D.l.toFixed(10), w: +D.w.toFixed(10), t: +D.t.toFixed(10),
        // the corner that comes off a pentagon board, so the shop knows to cut it
        cut: D.cut ? +D.cut.toFixed(10) : 0,
        qty: 0, area: 0, band: 0, bandEach: Math.round(bandLen(p) * 100) / 100,
        sheet: sheet ? sheet.id : null,
        // a grained board may not be turned 90° on the saw, and neither may a
        // door: turning one would run its face pattern the wrong way
        grain: !!(sheet && sheet.grain),
      };
      order.push(key);
    }
    rows[key].qty++;
    // a pentagon is paid for as its rectangle: the cut corner is offcut, not saving
    rows[key].area += m2(D.l, D.w);
    rows[key].band += bandLen(p);
  });
  return order.map(function (k, i) {
    var r = rows[k];
    r.band = Math.round(r.band * 100) / 100;
    // the number the shop works from: written on the board, printed on the
    // nesting diagram and listed in the CSV, so all three agree
    r.no = i + 1;
    return r;
  });
}

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

// snap a measurement onto the 32 mm grid, which is what a shop actually drills
function snap32(mm, from) {
  return from + Math.round((mm - from) / S32.pitch) * S32.pitch;
}

/* Every hole in the job, grouped by the panel it goes in. A panel is identified
   the same way the cut list groups it, so a row in the cut list and a drilling
   pattern refer to the same board. */
export function drillPlan(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    t = sp.panel,
    out = [];

  function panel(role, l, w, datum) {
    var e = { id: "panel:" + out.length, role: role, l: Math.round(l * 10), w: Math.round(w * 10), thickness: t * 10, datum: datum, holes: [], rejectedHoles: [] };
    out.push(e);
    return e;
  }
  /* Positions arrive in the app's centimetres and leave in the millimetres a
     machine is programmed in — `e.l`/`e.w` are already mm, so the edge guard has
     to be applied after the conversion, not before it. */
  function hole(e, xCm, yCm, dia, depth, kind, face = "B") {
    var mx = Math.round(xCm * 100) / 10,
      my = Math.round(yCm * 100) / 10;
    var operation = { id: e.id + ":hole:" + (e.holes.length + e.rejectedHoles.length), x: mx, y: my, d: dia, depth: depth, kind: kind, face: face, through: depth === 0, templateId: "generic-system32-v1" };
    if (![mx, my, dia, depth].every(Number.isFinite) || dia <= 0 || depth < 0 || mx < dia / 2 || my < dia / 2 || mx > e.l - dia / 2 || my > e.w - dia / 2) {
      e.rejectedHoles.push({ ...operation, reason: "Hole is outside the panel or has invalid dimensions" });
      return;
    }
    // Preserve opposite-face operations, but never drill the same hole twice.
    if (!e.holes.some(function (h) { return h.x === mx && h.y === my && h.d === dia && h.depth === depth && h.face === face; })) e.holes.push(operation);
  }

  var innerD = L.zc - L.zb,
    base = L.yb - t, // the vertical boards' own bottom edge
    datum = he("מהתחתית ומהחזית", "from the bottom, from the front");

  /* One entry per physical vertical board, not per column face. A divider
     between two columns is a single board drilled on both of its faces — emit
     it twice and the shop drills two of them and has a spare. */
  if (isFloat(sp)) return out;
  var boards = [];
  var physical = L.parts.filter(function (p) { return p.k === "box" && ["side", "divider"].includes(p.role); });
  if (!isCorner(sp)) physical.sort(function (a, b) { return a.x0 - b.x0; });
  physical.forEach(function (p) {
    var board = panel(p.role, p.y1 - p.y0, Math.max(p.x1 - p.x0, p.z1 - p.z0), datum);
    board.base = p.y0;
    board.partIndex = L.parts.indexOf(p);
    board.thickness = Math.min(p.x1 - p.x0, p.z1 - p.z0) * 10;
    board.faceAxis = p.x1 - p.x0 < p.z1 - p.z0 ? "x" : "z";
    board.datumCode = "bottom-front";
    boards.push(board);
  });

  L.cols.forEach(function (col, ci) {
    if (col.kind && col.kind !== "normal") return;
    var sideL = boards[ci],
      sideR = boards[ci + 1];

    col.secs.forEach(function (cell) {
      // adjustable shelves: a pair of rows, front and back, on the grid
      if (cell.shelves) {
        for (var i = 1; i <= cell.shelves; i++) {
          var sy = snap32((((cell.y1 - cell.y0) * i) / (cell.shelves + 1) + cell.y0 - base) * 10, 0) / 10;
          [sideL, sideR].forEach(function (e, side) {
            if (!e) return;
            var face = isCorner(sp) ? "B" : side === 0 ? "A" : "B";
            hole(e, sy + base - (e.base ?? base), S32.setback / 10, S32.pin, S32.pinDepth, "pin", face);
            hole(e, sy + base - (e.base ?? base), e.w / 10 - S32.setback / 10, S32.pin, S32.pinDepth, "pin", face);
          });
        }
      }
      // drawer runners: two screws per side per drawer, on the grid
      if (cell.drawers)
        cell.drawers.forEach(function (dr) {
          var ry = snap32((dr.y0 + 3 - base) * 10, 0) / 10;
          [sideL, sideR].forEach(function (e, side) {
            if (!e) return;
            var face = isCorner(sp) ? "B" : side === 0 ? "A" : "B";
            hole(e, ry + base - (e.base ?? base), S32.setback / 10, S32.pin, S32.pinDepth, "runner", face);
            hole(e, ry + base - (e.base ?? base), (S32.setback + Math.floor((e.w - 2*S32.setback) / S32.pitch)*S32.pitch) / 10, S32.pin, S32.pinDepth, "runner", face);
          });
        });
    });

  });

  // A motion unit identifies one physical leaf, including separate covered
  // runs and corner fronts. Its local coordinates remain stable while open.
  (L.fronts || []).forEach(function (front) {
    var cups = L.parts.filter(function (p) { return p.role === "hinge" && p.unit === front.unit; });
    if (!cups.length && !(L.handleMounts || []).some(function(m){return m.unit===front.unit;})) return;
    var leafH = front.y1 - front.y0, leafW = front.x1 - front.x0;
    var door = panel(front.role || "door", leafH, leafW, he("מהתחתית ומקצה הציר", "from the bottom, from the hinge edge"));
    door.unit = front.unit;
    door.thickness = (front.z1 - front.z0) * 10;
    door.datumCode = "bottom-hinge";
    door.faceAxis = "local-z";
    door.front = { ...front };
    var left = !cups.length || cups[0].x < (front.x0 + front.x1) / 2;
    door.hingeLeft = left;
    cups.forEach(function (p) {
      hole(door, p.y - front.y0, S32.cupSetback / 10, S32.cup, S32.cupDepth, "cup");
      var ci = L.cols.findIndex(function (col) { return p.x >= col.x0 - 1 && p.x <= col.x1 + 1; });
      var board = isCorner(sp) ? boards[left ? 1 : 0] : boards[Math.max(0, ci) + (left ? 0 : 1)];
      if (board) {
        var hy = p.y - (board.base ?? base);
        hole(board, hy - S32.plateSpread / 20, S32.setback / 10, S32.pin, S32.pinDepth, "plate", isCorner(sp) ? "B" : left ? "A" : "B");
        hole(board, hy + S32.plateSpread / 20, S32.setback / 10, S32.pin, S32.pinDepth, "plate", isCorner(sp) ? "B" : left ? "A" : "B");
      }
    });
    (L.handleMounts || []).filter(function(m){return m.unit===front.unit;}).forEach(function(m){
      hole(door, m.y-front.y0, left ? m.x-front.x0 : front.x1-m.x, S32.pin, 0, "handle");
    });
  });

  return out.filter(function (e) {
    return e.holes.length || e.rejectedHoles.length;
  });
}

/* Metres of worked worktop edge this unit is responsible for: its own front,
   plus a return for whichever end of the run happens to be its end. Summed over
   a run that is the run's front plus two returns — where the old per-unit
   `w + 2d` billed two returns for every unit in it. */
export function profileMeters(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp;
  if (!sp.top) return 0;
  if (isCorner(sp)) { var top=L.parts.find(function(p){return p.role==="worktop"&&p.k==="poly";});return top ? Math.hypot(top.pts[3].x-top.pts[2].x,top.pts[3].z-top.pts[2].z)/100 : 0; }
  return (it.w + (L.run.first ? it.d : 0) + (L.run.last ? it.d : 0)) / 100;
}

/* How many carcasses a run is really built as. A 3 m wardrobe is not one box:
   it goes on a lorry, through a doorway and up a staircase, so a shop builds it
   in boxes of no more than about 120 cm and joins them on site. This is what
   assembly and fitting are billed per — the same number in the per-unit price
   and in the project quote, so the two can be compared. */
export function boxCount(it, pre) {
  var L = pre || layoutCab(it);
  if (isFloat(L.sp)) return 0; // shelves are fitted one by one, not assembled
  return Math.max(1, Math.ceil(it.w / STD.maxBox));
}

/* Total banding for a piece, in metres, and the cut length its boards need. */
export function bandMeters(it, pre) {
  var m = 0;
  cutList(it, pre).forEach(function (r) {
    m += r.band;
  });
  return Math.round(m * 100) / 100;
}

export function hardwareList(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    c = L.hw,
    out = [];
  function row(label, qty, unit) {
    if (qty > 0) out.push({ label: label, qty: Math.round(qty * 10) / 10, unit: unit, total: qty * unit });
  }
  var hg = HW.hinge[sp.hw.hinge] || HW.hinge.soft,
    sl = HW.slide[sp.hw.slide] || HW.slide.softFull,
    rl = HW.rail[sp.hw.rail] || HW.rail.oval,
    hd = HW.handle[sp.hw.handle] || HW.handle.bar;
  row(he("רגל מתכווננת", "Adjustable cabinet leg"), c.legs, EXTRA_PRICE.leg);
  row(he(hg.he, hg.en), c.hinges, hg.price);
  row(he(sl.he, sl.en) + he(" (זוג)", " (pair)"), c.slides, sl.price);
  row(he(rl.he, rl.en) + he(" · מ'", " · m"), Math.max(0, c.railLen), rl.price);
  row(he(hd.he, hd.en), sp.hw.handle === "push" ? 0 : c.handles, hd.price);
  if (sp.hw.handle === "push") row(he("מנגנון פוש", "Push-to-open latch"), c.handles, 18);
  row(he("פינים למדף", "Shelf pins"), c.pins, 1.2);
  row(he("בריח סמוי למדף צף", "Concealed shelf bracket"), c.brackets, EXTRA_PRICE.bracket);
  row(he("ערכת הזזה לדלת", "Sliding door kit"), c.slidingLeaves, EXTRA_PRICE.slidingKit);
  row(he("סל נשלף", "Pull-out basket"), c.baskets, EXTRA_PRICE.basket);
  row(he("סל כביסה", "Laundry hamper"), c.hampers, EXTRA_PRICE.hamper);
  row(he("מתלה מכנסיים", "Trouser rack"), c.trousers, EXTRA_PRICE.trouser);
  row(he("כספת", "Safe"), c.safes, EXTRA_PRICE.safe);
  row(he("זרוע לטלוויזיה", "TV wall bracket"), c.tvBrackets, EXTRA_PRICE.tvBracket);
  row(he("מעבר כבלים", "Cable grommet"), c.grommets, EXTRA_PRICE.grommet);
  row(he("תאורת LED · מ'", "LED lighting · m"), c.ledLen, EXTRA_PRICE.led);
  if (sp.hw.mirrorInside) row(he("מראה פנימית", "Interior mirror"), 1, EXTRA_PRICE.mirrorInside);
  if (sp.hw.lock) row(he("מנעול", "Lock"), 1, EXTRA_PRICE.lock);
  return out;
}

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

export function cabQuote(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    boards = cutList(it, L),
    styleK = (FRONTS[sp.front] || FRONTS.flat).extra,
    mat = 0,
    bandM = 0,
    cutM = 0,
    slabCutM = 0,
    byMat = {};
  boards.forEach(function (r) {
    var sheet = r.sheet ? sheetById(r.sheet) : null,
      per = sheet ? perM2(sheet) : MAT_PRICE[r.srole === "carcass" ? "carcass" : r.srole] || MAT_PRICE.carcass;
    // a framed or reeded front is more machining than a plain slab
    if (FRONT_ROLES.indexOf(r.role) >= 0) per *= styleK;
    var cost = r.area * per * YIELD;
    mat += cost;
    bandM += r.band;
    var run = (r.qty * (r.l + r.w)) / 100; // two cuts to free each board
    if (sheet && sheet.hand === "slab") slabCutM += run;
    else cutM += run;
    var k = r.sheet || r.srole;
    if (!byMat[k]) byMat[k] = { sheet: r.sheet, srole: r.srole, area: 0, cost: 0 };
    byMat[k].area += r.area;
    byMat[k].cost += cost;
  });

  var band = bandById(sp.band),
    bandCost = bandM * (bandPPM(band) + laborRate("bandPerM")),
    cutCost = cutM * laborRate("cutPerM") + slabCutM * laborRate("slabCutPerM"),
    hwCost = 0;
  hardwareList(it, L).forEach(function (r) {
    hwCost += r.total;
  });

  var c = L.hw,
    boxes = boxCount(it, L),
    fitCost =
      (c.hinges || 0) * laborRate("hingeBore") +
      (c.slides || 0) * laborRate("slideFit") +
      (c.pins || 0) * laborRate("shelfBore") +
      (isFloat(sp)
        ? (c.floatShelves || 0) * laborRate("fitPerShelf")
        : boxes * (laborRate("assemblyPerUnit") + laborRate("fitPerUnit")));

  /* A worked stone edge is charged per metre of exposed run, not per m² — and
     only the edges a person can see. This unit's share is its own front, plus a
     return for each end of the run that happens to be its end: summed over the
     run that comes to the run's front plus two returns, instead of the front
     plus two returns *per unit*, which is what it used to bill. */
  var prof = profileById(sp.profile),
    profM = profileMeters(it, L),
    profCost = prof && prof.id !== "none" ? profM * profilePPM(prof) : 0;

  var net = mat + bandCost + cutCost + hwCost + fitCost + profCost,
    margin = net * laborRate("margin");
  return {
    material: mat, byMat: byMat, boxes: boxes, bandM: Math.round(bandM * 10) / 10, band: bandCost,
    cutM: Math.round((cutM + slabCutM) * 10) / 10, cut: cutCost,
    hardware: hwCost, fitting: fitCost, profileM: Math.round(profM * 10) / 10, profile: profCost,
    net: net, margin: margin, total: net + margin,
  };
}

export function cabPrice(it, pre) {
  return Math.round(cabQuote(it, pre).total / 10) * 10;
}

/* ========================= clash detection =========================

   Where a door ends up when it is open. This only became answerable once the
   swing direction was right — a leaf that used to rotate through the back panel
   could hardly be tested against the room. The sweep is approximated by the
   chord from the pivot to the leaf's free end at 90°, which is where a door
   spends its life and where it hits things. */

// the item's local frame → world, matching how view3d places a piece
function toWorld(it, lx, lz) {
  var r = ((it.rot || 0) * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return { x: it.x + lx * c - lz * s, z: it.z + lx * s + lz * c };
}

function segHit(a, b, c, d) {
  function cross(p, q, r) {
    return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  }
  var d1 = cross(c, d, a),
    d2 = cross(c, d, b),
    d3 = cross(a, b, c),
    d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// does a segment cross the footprint of another piece (its own rotated box)?
function segHitsItem(a, b, other) {
  var hw = other.w / 2,
    hd = other.d / 2,
    p = [
      toWorld(other, -hw, -hd), toWorld(other, hw, -hd),
      toWorld(other, hw, hd), toWorld(other, -hw, hd),
    ];
  var axis=axisOf(other);
  function inside(q){var dx=q.x-other.x,dz=q.z-other.z;return Math.abs(dx*axis.c+dz*axis.s)<hw && Math.abs(-dx*axis.s+dz*axis.c)<hd;}
  if(inside(a)||inside(b))return true;
  for (var i = 0; i < 4; i++) if (segHit(a, b, p[i], p[(i + 1) % 4])) return true;
  return false;
}

/* Local opening arcs are shared by plan symbols and clearance checks. Each
   arc carries the vertical interval of its actual leaf, not the full cabinet. */
export function cabinetDoorSwings(it, pre) {
  var L=pre||layoutCab(it),out=[],elev=L.sp.elev||0;
  if(isFloat(L.sp))return out;
  if(isCorner(L.sp)) {
    var dr=L.sp.cols[0].door||{},front=(L.fronts||[]).find(function(f){return f.role==="door";});
    if(!front || !["hinged","glass","mirror","folding"].includes(dr.t))return out;
    var poly=cornerPoly(L.sp,L.w,L.d),left=dr.hinge==="L",pivot=poly[left?3:2],closed=poly[left?2:3];
    var start=Math.atan2(closed.z-pivot.z,closed.x-pivot.x),sweep=left?Math.PI/2:-Math.PI/2;
    out.push({pivot:{...pivot},start:start,sweep:sweep,reach:L.cornerFront,col:0,type:dr.t,y0:front.y0+elev,y1:front.y1+elev});
    return out;
  }
  (L.fronts||[]).forEach(function(front){
    var u=L.units[front.unit];
    if(front.role!=="door" || !u || !(u.type==="door" || u.type==="fold" && u.outer))return;
    var left=Math.abs(u.px-front.x0)<0.01;
    var col=L.cols.find(function(c){return (front.x0+front.x1)/2>=c.x0 && (front.x0+front.x1)/2<=c.x1;});
    out.push({pivot:{x:u.px,z:u.pz},start:left?0:Math.PI,sweep:left?Math.PI/2:-Math.PI/2,
      reach:front.x1-front.x0,col:col?.i||0,type:u.type==="fold"?"folding":col?.ref.door?.t||"hinged",y0:front.y0+elev,y1:front.y1+elev});
  });
  return out;
}

/* Each hinged leaf at 90 degrees open, in room coordinates. */
export function doorSweeps(it, pre) {
  return cabinetDoorSwings(it,pre).map(function(sw){
    var angle=sw.start+sw.sweep;
    return {...sw,pivot:toWorld(it,sw.pivot.x,sw.pivot.z),
      tip:toWorld(it,sw.pivot.x+Math.cos(angle)*sw.reach,sw.pivot.z+Math.sin(angle)*sw.reach)};
  });
}

/* ========================= checks ========================= */

/* The things a joiner would query on the drawing before cutting anything.
   Each finding is {level, msg, col} — `err` is "this will not work", `warn`
   is "this will disappoint", `info` is a suggestion. Nothing here blocks the
   design: it is a second pair of eyes, not a validator. */
export function checkCab(it, ceilH) {
  var L = layoutCab(it),
    sp = L.sp,
    out = [],
    innerD = L.zc - L.zb;
  function add(level, hes, ens, col) {
    out.push({ level: level, msg: he(hes, ens), col: col });
  }
  // for messages that are already in the right language (the fit table's)
  function addMsg(level, msg, col) {
    out.push({ level: level, msg: msg, col: col });
  }

  if (S.parametric?.definitions?.[it.definitionId]?.metadata?.manufacturingReviewRequired)
    add("warn", "שינויי מודל מתקדמים דורשים בדיקת ייצור; כתב הכמויות הוא אומדן חלקי.", "Advanced model edits require manufacturing review; the bill of materials is a partial estimate.");
  if (ceilH && sp.elev + it.h > ceilH + 0.5)
    add("err", "הארון גבוה מהתקרה (" + Math.round(ceilH) + ' ס"מ)', "Taller than the ceiling (" + Math.round(ceilH) + " cm)");
  if (sp.elev > 0 && sp.elev < 40 && sp.plinth > 0)
    add("warn", "יחידה תלויה עם סוקל — בחרו סוקל 'ללא'", "A hung unit with a plinth — set the plinth to none");

  /* What being in a run means for this unit. Worth saying out loud: the run is
     invisible in the drawing (it is a property of where the pieces stand), so a
     worktop that suddenly belongs to the neighbour needs explaining. */
  if (L.run.n > 1) {
    addMsg("info",
      he("יחידה " + (L.run.i + 1) + " מתוך " + L.run.n + " ברצף באורך " + Math.round(L.run.span) + ' ס"מ',
        "Unit " + (L.run.i + 1) + " of " + L.run.n + " in a " + Math.round(L.run.span) + " cm run"));
    if (sp.top && !L.run.first)
      addMsg("info", he("המשטח נמדד על היחידה הראשונה ברצף", "The worktop is costed on the run's first unit"));
  }

  var envelope = innerOf(sp, it.w, it.h);
  var usedW = sp.cols.reduce(function (sum, c) { return sum + c.w; }, 0) + (isFloat(sp) ? 0 : sp.cols.length - 1) * sp.panel;
  if (usedW > envelope.w + 0.1 * sp.cols.length)
    add("err", "החלוקה חורגת מרוחב הארון", "Columns exceed the cabinet's available width");
  sp.cols.forEach(function (c, ci) {
    var usedH = c.secs.reduce(function (sum, section) { return sum + section.h; }, 0) + (c.secs.length - 1 + envelope.boardPerSec) * (sp.shelf || sp.panel);
    if (usedH > envelope.h + 0.1 * c.secs.length)
      add("err", "התאים חורגים מגובה הארון", "Compartments exceed the cabinet's available height", ci);
  });

  // the two cabinet-wide choices, against the same fit table
  var cfc = fitCtx(L, null),
    cfit = carcassFit(sp.carcass || "full", cfc),
    ffit = frontFit(sp.front || "flat", cfc);
  if (!cfit.ok) addMsg("err", carcassLabel(sp.carcass) + " — " + cfit.why);
  if (!ffit.ok) addMsg("warn", frontLabel(sp.front) + " — " + ffit.why);

  /* Floating shelves are a different animal: everything they carry goes into
     the wall, so the span, the board and the wall itself are the whole story. */
  if (isFloat(sp)) {
    L.cols.forEach(function (col, ci) {
      if (col.w > STD.floatSpan)
        add("warn", "מדף צף " + Math.round(col.w) + ' ס"מ — מעל ' + STD.floatSpan + " יש להוסיף בריח או לפצל",
          "Floating shelf " + Math.round(col.w) + " cm — over " + STD.floatSpan + " add a bracket or split it", ci);
    });
    if (sp.panel < 3)
      add("warn", 'מדף צף בעובי ' + sp.panel * 10 + ' מ"מ — לבריח סמוי צריך 30 מ"מ ומעלה',
        "A " + sp.panel * 10 + " mm floating shelf — a concealed bracket needs 30 mm or more");
    if (it.d > 32)
      add("info", "מדף צף בעומק " + Math.round(it.d) + ' ס"מ — עומק מעל 32 מגדיל את המומנט על הקיר',
        "A " + Math.round(it.d) + " cm deep floating shelf loads the wall hard");
    if (sp.elev < 20)
      add("info", "המדף התחתון כמעט על הרצפה — כדאי גובה תלייה גדול יותר",
        "The bottom shelf is almost on the floor — raise the mounting height");
    return out;
  }

  L.cols.forEach(function (col, ci) {
    var n = ci + 1,
      dr = col.ref.door || { t: "none" },
      where = " (" + he("עמודה ", "column ") + n + ")";
    /* The same table the designer greys options out with — so a design that
       arrives from a saved file, or one whose cabinet was resized under it,
       reports the thing that no longer fits instead of quietly building nothing.
       These are errors, not warnings: the part does not exist. */
    var fc = fitCtx(L, col),
      kfit = kindFit(col.kind || "normal", fc);
    if (!kfit.ok) addMsg("err", kindLabel(col.kind) + " — " + kfit.why + where, ci);

    if (col.kind === "filler") {
      if (col.w > 15 && col.w <= 25) add("warn", "פנל מילוי רחב מ-15 ס\"מ (עמודה " + n + ")", "Filler wider than 15 cm (column " + n + ")", ci);
      return;
    }
    if (col.kind === "blind") return;

    var dfit = doorFit(dr.t, fc);
    if (!dfit.ok) addMsg("err", doorLabel(dr.t) + " — " + dfit.why + where, ci);

    if (!isCorner(sp) && col.w > STD.maxSpan)
      add("warn", "מפתח מדף " + Math.round(col.w) + ' ס"מ — מעל ' + STD.maxSpan + " המדף ישקע (עמודה " + n + ")",
        "Shelf span " + Math.round(col.w) + " cm — over " + STD.maxSpan + " it will sag (column " + n + ")", ci);
    // a corner unit's leaf is the diagonal, not the column it spans
    var leafW = isCorner(sp) ? L.cornerFront || col.w : col.w / (col.doorLeaves || 1);
    if (dr.t !== "none" && dr.t !== "drawer" && dr.t !== "sliding" && leafW > STD.maxDoor + 5)
      add("warn", "כנף דלת " + Math.round(leafW) + ' ס"מ — עדיף זוג כנפיים (עמודה ' + n + ")",
        "Door leaf " + Math.round(leafW) + " cm — better as a pair (column " + n + ")", ci);
    /* What the leaf weighs, and whether the ironmongery is up to it. A lacquered
       or glass front is half as heavy again as melamine at the same size. */
    if (dr.t !== "none" && dr.t !== "drawer") {
      var kg = leafWeight(L, col);
      if (kg > 22)
        add("warn", "כנף במשקל " + Math.round(kg) + " ק\"ג (עמודה " + n + ") — צריך שני אנשים לתלייה",
          "A " + Math.round(kg) + " kg leaf (column " + n + ") — two people to hang it", ci);
      if (dr.t === "lift" && kg > 9)
        addMsg("info", he("בוכנת גז ל-" + Math.round(kg) + ' ק"ג', "Gas strut for a " + Math.round(kg) + " kg flap") + where, ci);
      if (kg > 6 * (col.hinges || 2) / (col.doorLeaves || 1))
        addMsg("info", he("שקלו ציר נוסף לכנף של " + Math.round(kg) + ' ק"ג', "Consider another hinge for a " + Math.round(kg) + " kg leaf") + where, ci);
    }

    col.secs.forEach(function (cell) {
      var s = cell.ref,
        H = cell.y1 - cell.y0;
      var sfit = secFit(s.t, col.w, fc.colH, innerD);
      if (!sfit.ok) addMsg("err", secLabel(s.t) + " — " + sfit.why + where, ci);
      if (s.t === "hang" || s.t === "hangS" || s.t === "hang2") {
        // deep enough to hang in at all is covered above; this is the "you will
        // be pressing shirts against the back" margin
        if (innerD >= 49.5 && innerD < 55)
          add("warn", 'עומק ' + Math.round(innerD) + ' ס"מ — קולבים ישתפשפו בגב', "Only " + Math.round(innerD) + " cm deep — verify hanger and clothing clearance", ci);
      }
      if (s.t === "hang" && H < STD.hangLong)
        add("warn", "תלייה ארוכה עם " + Math.round(H) + ' ס"מ פנוי — מעילים צריכים ' + STD.hangLong,
          "Long hang has only " + Math.round(H) + " cm — coats need " + STD.hangLong, ci);
      if (s.t === "hang2" && H < SEC.hang2.min)
        add("warn", "תלייה כפולה צריכה " + SEC.hang2.min + ' ס"מ (יש ' + Math.round(H) + ")",
          "Double hang needs " + SEC.hang2.min + " cm (has " + Math.round(H) + ")", ci);
      if(cell.invalidDrawers)add("err", "אין מקום לתיבת מגירה תקינה", "Drawer dimensions leave no room for a valid drawer box", ci);
      if (cell.drawers) {
        if (col.w > 120) add("warn", "מגירה ברוחב " + Math.round(col.w) + ' ס"מ — מעבר לטווח מסילות רגילות',
          "Drawer " + Math.round(col.w) + " cm wide — beyond standard runners", ci);
        if (cell.drawers.length > 5) add("info", "מעל 5 מגירות בעמודה " + n, "More than 5 drawers in column " + n, ci);
        if (cell.y1 > 145) add("info", "מגירה מעל 145 ס\"מ קשה לשימוש (עמודה " + n + ")",
          "A drawer above 145 cm is hard to use (column " + n + ")", ci);
      }
      /* A pull-out has to clear the door. With a pair of leaves both swing
         away and the whole column opens up; a single narrow leaf is what
         actually traps the drawer. */
      var access = (col.doorLeaves || 1) > 1 ? col.w : leafW;
      if ((cell.drawers || cell.baskets) && dr.t !== "none" && dr.t !== "drawer" && dr.t !== "sliding" && access < 40)
        add("warn", "מגירה/סל מאחורי כנף צרה (" + Math.round(access) + ' ס"מ) — לא ייצא במלואו',
          "Pull-out behind a narrow leaf (" + Math.round(access) + " cm) — it will not clear", ci);
      if (cell.y1 > 230 && s.t !== "box")
        add("info", "התא העליון בעמודה " + n + " מעל 230 ס\"מ — עדיף תא אחסון",
          "Column " + n + " has usable space above 230 cm — better as a storage box", ci);
      if (s.t === "shelves" && cell.shelves === 0 && H > 60)
        add("info", "תא מדפים בלי מדפים (עמודה " + n + ")", "Shelf compartment with no shelves (column " + n + ")", ci);
    });
  });

  /* Where the doors actually end up. A cabinet that cannot be opened is a
     cabinet nobody notices is wrong until it is installed. */
  doorSweeps(it, L).forEach(function (sw) {
    var n = sw.col + 1;
    (S.walls || []).forEach(function (wl) {
      var a = (S.nodes || [])[wl.a],
        b = (S.nodes || [])[wl.b];
      if (!a || !b) return;
      if (segHit(sw.pivot, sw.tip, a, b))
        add("err", "דלת עמודה " + n + " נחסמת על ידי קיר", "The door on column " + n + " is blocked by a wall", sw.col);
    });
    (S.items || []).forEach(function (other) {
      if (other === it || !other.w || !other.d) return;
      var otherBottom = other.cab?.elev ?? other.elev ?? 0;
      if (otherBottom + (other.h || 0) <= sw.y0 || otherBottom >= sw.y1) return;
      if (segHitsItem(sw.pivot, sw.tip, other))
        add("warn", "דלת עמודה " + n + " נפתחת לתוך פריט אחר", "The door on column " + n + " opens into another piece", sw.col);
    });
  });

  /* A niche behind a sliding leaf is not a niche. Buildable, so a warning rather
     than an error — but it is never what was meant. */
  L.cols.forEach(function (col, ci) {
    if ((col.ref.door || {}).t !== "sliding") return;
    col.secs.forEach(function (cell) {
      if (sectionOpen(cell.ref))
        addMsg("warn", secLabel(cell.ref.t) + " " + he("מאחורי דלת הזזה — הכנף תכסה אותו", "behind a sliding leaf — the door will cover it") + " (" + he("עמודה ", "column ") + (ci + 1) + ")", ci);
    });
  });

  // a sliding wardrobe never opens more than one leaf-width at a time
  if (L.sliding) {
    if (L.cols.length < 2) add("err", "דלת הזזה אחת לא נפתחת — צריך לפחות שתיים", "A single sliding leaf cannot open — two minimum");
    L.cols.forEach(function (col, ci) {
      if (col.secs.some(function (c2) { return c2.drawers; }) && ci % 2 === 0)
        add("warn", "מגירות מאחורי כנף הזזה קבועה (עמודה " + (ci + 1) + ") — יהיו חסומות",
          "Drawers behind a fixed sliding leaf (column " + (ci + 1) + ") will be blocked", ci);
    });
  }
  if (sp.plinth === 0 && sp.elev === 0 && (sp.fam === "kitchenBase" || sp.fam === "kitchenTall"))
    add("info", "ארון מטבח בלי סוקל", "A kitchen unit with no plinth");
  /* An open back is a legitimate design (a grid shelf, a room divider) — but it
     is still a box with nothing holding it square, so it needs a cross-brace or
     to be fixed to the wall. Said once, at the level it deserves. */
  if (!sp.back)
    add(sp.carcass === "open" ? "info" : "warn", "אין לוח גב — יש לקבע לקיר או להוסיף חיזוק אלכסוני",
      "No back panel — fix it to the wall or add a brace");
  /* Say each thing once. Two leaves on the same column both hitting the same
     neighbour is one problem, not two. */
  var seen = {};
  return out.filter(function (c) {
    var k = c.level + "|" + c.msg + "|" + c.col;
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
}

/* ========================= 2D plan symbol ========================= */

/* What the floor plan needs to draw a cabinet properly: its columns, the way
   each front opens, and where the drawers are. Plain numbers in cm, in the
   item's own frame, so plan2d only has to scale them. */
/* The plan repaints on every pointer move while a piece is being dragged, and
   a full layout per frame per cabinet is real work — so the symbol is memoised
   against the spec it was built from. */
var planMemo = typeof WeakMap === "function" ? new WeakMap() : null;
export function planCab(it) {
  var key = null;
  if (planMemo) {
    // the run is part of what the symbol depends on: dragging a unit against its
    // neighbour changes where the plinth returns and the worktop go
    key = it.w + "|" + it.h + "|" + it.d + "|" + cabRun(it).key + "|" + JSON.stringify(it.cab);
    var hit = planMemo.get(it);
    if (hit && hit.key === key) return hit.val;
  }
  var val = planCabFresh(it);
  if (planMemo) planMemo.set(it, { key: key, val: val });
  return val;
}
function planCabFresh(it) {
  var L = layoutCab(it);
  return {
    w: L.w, d: L.d, t: L.t, zc: L.zc, zb: L.zb, sliding: L.sliding, float: isFloat(L.sp) ? 1 : 0,
    // a corner unit is not a rectangle, so the plan draws its footprint instead
    poly: isCorner(L.sp) ? cornerPoly(L.sp, L.w, L.d) : null,
    cornerFront: L.cornerFront || 0,
    swings: cabinetDoorSwings(it,L),
    cols: L.cols.map(function (c) {
      var dr = c.ref.door || { t: "none" };
      return {
        x0: c.x0, x1: c.x1, kind: c.kind || "normal",
        door: dr.t, leaves: c.doorLeaves || 0, hinge: dr.hinge || "R",
        drawers: c.secs.some(function (s) { return !!s.drawers; }),
      };
    }),
  };
}

/* ========================= labels ========================= */

export function secLabel(t) {
  var s = SEC[t] || SEC.shelves;
  return he(s.he, s.en);
}
export function doorLabel(t) {
  var d = DOORS[t] || DOORS.none;
  return he(d.he, d.en);
}
export function famLabel(f) {
  var x = FAM[f] || FAM.wardrobe;
  return he(x.he, x.en);
}
// short form, for the type chips where the full name does not fit
export function famShort(f) {
  var x = FAM[f] || FAM.wardrobe;
  return he(x.sHe || x.he, x.sEn || x.en);
}
export function presetLabel(p) {
  return he(p.he, p.en);
}
export function presetNote(p) {
  return he(p.note[0], p.note[1]);
}
export function hwLabel(group, id) {
  var x = HW[group] && HW[group][id];
  return x ? he(x.he, x.en) : id;
}
export function frontLabel(id) {
  var x = FRONTS[id] || FRONTS.flat;
  return he(x.he, x.en);
}
export function finishLabel(id) {
  var x = FINISH[id] || FINISH.auto;
  return he(x.he, x.en);
}
export function kindLabel(id) {
  var x = COLKIND[id] || COLKIND.normal;
  return he(x.he, x.en);
}
export function carcassLabel(id) {
  var x = CARCASS[id] || CARCASS.full;
  return he(x.he, x.en);
}
export function roleLabelHe(role) {
  var R = {
    plinth: ["סוקל", "Plinth"], side: ["דופן", "Side"], bottom: ["תחתית", "Bottom"],
    top: ["גג", "Top"], back: ["גב", "Back"], worktop: ["משטח עבודה", "Worktop"],
    divider: ["מחיצה", "Divider"], fixedShelf: ["מדף קבוע", "Fixed shelf"],
    shelf: ["מדף", "Shelf"], door: ["דלת", "Door"], doorPanel: ["פנל דלת", "Door panel"],
    batten: ["סרגל", "Batten"], glazing: ["זיגוג", "Glazing"], filler: ["פנל מילוי", "Filler"],
    drawerFront: ["חזית מגירה", "Drawer front"], drawerBox: ["דופן מגירה", "Drawer box"],
    drawerBottom: ["תחתית מגירה", "Drawer bottom"],
    tvPanel: ["לוח תלייה לטלוויזיה", "TV mounting board"],
  };
  var x = R[role];
  return x ? he(x[0], x[1]) : role;
}

/* A short human summary — used in the tree and the designer header
   ("3 עמודות · 6 דלתות · 9 מגירות · 12 מדפים"). */
export function cabSummary(it) {
  var L = layoutCab(it),
    dcount = 0,
    dr = 0,
    sh = 0,
    rails = 0;
  L.cols.forEach(function (c) {
    dcount += c.doorLeaves || 0;
    c.secs.forEach(function (s) {
      if (s.drawers) dr += s.drawers.length;
      if (s.shelves) sh += s.shelves;
      if (s.rails) rails += s.rails;
    });
  });
  var p = [];
  p.push(L.cols.length + " " + he("עמודות", "columns"));
  if (dcount) p.push(dcount + " " + he("דלתות", "doors"));
  if (dr) p.push(dr + " " + he("מגירות", "drawers"));
  if (sh) p.push(sh + " " + he("מדפים", "shelves"));
  if (rails) p.push(rails + " " + he("מוטות", "rails"));
  return p.join(" · ");
}
