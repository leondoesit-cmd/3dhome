// Sheet stock, suppliers and the price book — the "what it is actually made of
// and what that costs" layer under the cabinet system.
//
// Until now a cabinet was priced from a flat ₪-per-m² table, which quietly
// assumes you can buy board by the square metre. You cannot: you buy whole
// sheets, you cut them up, and what is left over is paid for too. So the price
// of a job is a function of *how many sheets it takes*, and that is a packing
// problem — see nest.js, which nests the panels onto the sheets defined here.
//
// Everything in this file is in the app's own units: centimetres for sizes,
// shekels (₪, ex-VAT) for money. Sheet `l` is the length along the grain and
// `w` is across it, because that is the axis a grained board may not be rotated
// about on the saw.
//
// Prices are indicative Israeli trade prices. They are meant to be edited: the
// price book (see `setPrice`) overlays user values on top of these defaults and
// keeps them in localStorage, so a workshop can put its own numbers in without
// touching the code.

const PB_KEY = "home3d_pricebook";

/* ========================= suppliers ========================= */

/* `lead` is working days from order to collection/delivery — a slab yard is
   never next-day, a hardware importer usually is, and that difference is what
   a quote has to tell the customer. */
export const SUPPLIERS = {
  lavie: { he: "לבידי לביא", en: "Lavie Boards", city: "פתח תקווה", cityEn: "Petah Tikva", site: "lavie.co.il", lead: 2, kinds: ["board", "banding"] },
  etz: { he: "עץ ועצה", en: "Etz VeEtza", city: "חדרה", cityEn: "Hadera", site: "etz.co.il", lead: 3, kinds: ["board", "banding"] },
  woodcenter: { he: "מרכז העץ", en: "Wood Center", city: "חיפה", cityEn: "Haifa", site: "woodcenter.co.il", lead: 4, kinds: ["board"] },
  galil: { he: "עצי הגליל", en: "Galil Wood", city: "כרמיאל", cityEn: "Karmiel", site: "galilwood.co.il", lead: 3, kinds: ["board"] },
  caesar: { he: "אבן קיסר", en: "Caesarstone", city: "שדות ים", cityEn: "Sdot Yam", site: "caesarstone.co.il", lead: 7, kinds: ["slab"] },
  stoneart: { he: "אומנות האבן", en: "Stone Art", city: "ירושלים", cityEn: "Jerusalem", site: "stoneart.co.il", lead: 5, kinds: ["slab"] },
  glasstec: { he: "זכוכית טק", en: "Glass-Tec", city: "אשדוד", cityEn: "Ashdod", site: "glasstec.co.il", lead: 6, kinds: ["glass"] },
  hafele: { he: "הפלה ישראל", en: "Häfele Israel", city: "חולון", cityEn: "Holon", site: "hafele.co.il", lead: 2, kinds: ["hardware"] },
  blum: { he: "בלום ישראל", en: "Blum Israel", city: "תל אביב", cityEn: "Tel Aviv", site: "blum.com", lead: 1, kinds: ["hardware"] },
};

export function supLabel(id, en) {
  var s = SUPPLIERS[id];
  if (!s) return id || "";
  return en ? s.en : s.he;
}
export function supCity(id, en) {
  var s = SUPPLIERS[id];
  if (!s) return "";
  return en ? s.cityEn || s.city : s.city;
}

/* ========================= sheet stock ========================= */

/* `use` is which cabinet material roles a sheet may be assigned to — the same
   role names cabinet.js paints its parts with, so the designer's material
   pickers and the nesting both read one list.
     carcass — carcass boards, shelves, dividers, drawer boxes
     front   — doors, drawer fronts, filler panels
     back    — back panels and drawer bottoms
     top     — worktops
     glass / mirror — glazed and mirrored fronts
   `grain` marks a board whose face direction is visible, i.e. one that must not
   be rotated 90° on the saw. `hand` is a handling class: a stone slab is not
   cut on the same machine as an 18 mm melamine sheet, and it is not priced or
   lead-timed like one either. */
export const SHEETS = [
  // --- melamine-faced chipboard: the everyday carcass and front material ---
  { id: "mel_white_18", he: 'מלמין לבן 18 מ"מ', en: "White melamine 18 mm", l: 244, w: 122, t: 1.8, price: 185, grain: false, use: ["carcass", "front", "top"], sup: "lavie", col: 0xf1efe9, hand: "board", dens: 650 },
  { id: "mel_white_18_xl", he: 'מלמין לבן 18 מ"מ (פלטה גדולה)', en: "White melamine 18 mm (oversize)", l: 280, w: 207, t: 1.8, price: 455, grain: false, use: ["carcass", "front", "top"], sup: "lavie", col: 0xf1efe9, hand: "board", dens: 650 },
  { id: "mel_grey_18", he: 'מלמין אפור גרפיט 18 מ"מ', en: "Graphite melamine 18 mm", l: 280, w: 207, t: 1.8, price: 520, grain: false, use: ["carcass", "front"], sup: "lavie", col: 0x454a4e, hand: "board", dens: 650 },
  { id: "mel_oak_18", he: 'מלמין דמוי אלון 18 מ"מ', en: "Oak-effect melamine 18 mm", l: 280, w: 207, t: 1.8, price: 610, grain: true, use: ["carcass", "front", "top"], sup: "etz", col: 0xcaa877, hand: "board", dens: 650 },
  { id: "mel_walnut_18", he: 'מלמין דמוי אגוז 18 מ"מ', en: "Walnut-effect melamine 18 mm", l: 280, w: 207, t: 1.8, price: 660, grain: true, use: ["carcass", "front"], sup: "etz", col: 0x6a4a30, hand: "board", dens: 650 },
  { id: "mel_white_16", he: 'מלמין לבן 16 מ"מ', en: "White melamine 16 mm", l: 244, w: 122, t: 1.6, price: 165, grain: false, use: ["carcass"], sup: "woodcenter", col: 0xf1efe9, hand: "board", dens: 650 },
  { id: "mel_white_25", he: 'מלמין לבן 25 מ"מ (מדף כבד)', en: "White melamine 25 mm (heavy shelf)", l: 280, w: 207, t: 2.5, price: 690, grain: false, use: ["carcass", "top"], sup: "lavie", col: 0xf1efe9, hand: "board", dens: 650 },

  // --- MDF: painted fronts, and the raw board they are made from ---
  { id: "mdf_raw_18", he: 'MDF גלמי 18 מ"מ', en: "Raw MDF 18 mm", l: 280, w: 207, t: 1.8, price: 340, grain: false, use: ["carcass", "front"], sup: "lavie", col: 0xc9ab86, hand: "board", dens: 750 },
  // sprayed fronts are ordered cut to size from a specialist and charged by the
  // square metre, so `bySqm` — you never buy a whole sheet of lacquer for one
  // kitchen unit, you buy the doors
  { id: "mdf_lacq_18", he: 'MDF צבוע לכה 18 מ"מ', en: "Lacquered MDF 18 mm", l: 280, w: 207, t: 1.8, price: 2480, grain: false, use: ["front", "top"], sup: "etz", col: 0xf7f6f3, hand: "board", bySqm: 1, dens: 780 },
  { id: "mdf_lacq_gloss_18", he: 'MDF לכה מבריקה 18 מ"מ', en: "High-gloss lacquered MDF 18 mm", l: 280, w: 207, t: 1.8, price: 3100, grain: false, use: ["front"], sup: "etz", col: 0xfafaf8, hand: "board", bySqm: 1, dens: 780 },

  // --- plywood & veneer: visible joinery, floating shelves, open shelving ---
  { id: "ply_birch_18", he: 'סנדוויץ׳ ליבנה 18 מ"מ', en: "Birch plywood 18 mm", l: 244, w: 122, t: 1.8, price: 395, grain: true, use: ["carcass", "front", "top"], sup: "galil", col: 0xdcc49b, hand: "board", dens: 680 },
  { id: "ply_birch_38", he: 'ליבנה 38 מ"מ (מדף עבה)', en: "Birch 38 mm (thick shelf)", l: 244, w: 122, t: 3.8, price: 830, grain: true, use: ["carcass", "front", "top"], sup: "galil", col: 0xdcc49b, hand: "board", dens: 680 },
  { id: "ven_oak_18", he: 'MDF בפורניר אלון 18 מ"מ', en: "Oak-veneered MDF 18 mm", l: 280, w: 207, t: 1.8, price: 1150, grain: true, use: ["carcass", "front", "top"], sup: "etz", col: 0xcaa877, hand: "board", dens: 760 },

  // --- backs and drawer bottoms ---
  { id: "hdf_white_4", he: 'HDF לבן 4 מ"מ (גב)', en: "White HDF 4 mm (back)", l: 244, w: 122, t: 0.4, price: 62, grain: false, use: ["back"], sup: "lavie", col: 0xece9e2, hand: "board", dens: 850 },
  { id: "mel_back_8", he: 'מלמין 8 מ"מ (גב מחורץ)', en: "Melamine 8 mm (rebated back)", l: 244, w: 122, t: 0.8, price: 118, grain: false, use: ["back"], sup: "lavie", col: 0xe6e2d8, hand: "board", dens: 700 },
  /* The oversize versions exist because a tall wardrobe back is 2320 mm long:
     on a 2440×1220 sheet that is one piece and a useless offcut, on a 2800×2070
     it is two side by side. Worth having in the list when the cut plan shows the
     small sheet nesting badly. */
  { id: "hdf_white_4_xl", he: 'HDF לבן 4 מ"מ (פלטה גדולה)', en: "White HDF 4 mm (oversize)", l: 280, w: 207, t: 0.4, price: 158, grain: false, use: ["back"], sup: "lavie", col: 0xece9e2, hand: "board", dens: 850 },
  { id: "mel_back_8_xl", he: 'מלמין 8 מ"מ (פלטה גדולה)', en: "Melamine 8 mm (oversize)", l: 280, w: 207, t: 0.8, price: 288, grain: false, use: ["back"], sup: "lavie", col: 0xe6e2d8, hand: "board", dens: 700 },

  /* --- worktops, glass, mirror: not cut on the panel saw ---
     All `bySqm`: a stone yard and a glazier cut to your template and invoice the
     square metres, so the offcut stays with them. The nesting still lays these
     out — it is how the yard checks a top fits a slab, and how you find out that
     a 3.4 m island does not. */
  { id: "quartz_white_20", he: 'קוורץ לבן 20 מ"מ', en: "White quartz 20 mm", l: 320, w: 160, t: 2, price: 4300, grain: false, use: ["top"], sup: "caesar", col: 0xf2f0ec, hand: "slab", bySqm: 1, dens: 2400 },
  { id: "quartz_grey_20", he: 'קוורץ אפור בטון 20 מ"מ', en: "Concrete-grey quartz 20 mm", l: 320, w: 160, t: 2, price: 4600, grain: false, use: ["top"], sup: "caesar", col: 0x9b9a97, hand: "slab", bySqm: 1, dens: 2400 },
  { id: "granite_black_20", he: 'גרניט שחור 20 מ"מ', en: "Black granite 20 mm", l: 300, w: 160, t: 2, price: 3900, grain: true, use: ["top"], sup: "stoneart", col: 0x2b2b2d, hand: "slab", bySqm: 1, dens: 2700 },
  { id: "compact_12", he: 'קומפקט למינייט 12 מ"מ', en: "Compact laminate 12 mm", l: 305, w: 130, t: 1.2, price: 2350, grain: false, use: ["top", "front"], sup: "etz", col: 0x3b3f42, hand: "board", dens: 1400 },
  { id: "glass_clear_6", he: 'זכוכית שקופה מחוסמת 6 מ"מ', en: "Clear toughened glass 6 mm", l: 250, w: 160, t: 0.6, price: 1750, grain: false, use: ["glass"], sup: "glasstec", col: 0xcfe0e6, hand: "glass", bySqm: 1, dens: 2500 },
  { id: "glass_smoke_6", he: 'זכוכית מעושנת 6 מ"מ', en: "Smoked glass 6 mm", l: 250, w: 160, t: 0.6, price: 2100, grain: false, use: ["glass"], sup: "glasstec", col: 0x6b6f72, hand: "glass", bySqm: 1, dens: 2500 },
  { id: "mirror_4", he: 'מראה 4 מ"מ', en: "Mirror 4 mm", l: 244, w: 183, t: 0.4, price: 980, grain: false, use: ["mirror"], sup: "glasstec", col: 0xdae4e9, hand: "glass", bySqm: 1, dens: 2500 },
];

/* ========================= edge banding ========================= */

/* Banding is sold by the roll and applied by the metre; `t` is what it adds to
   the panel (0.4 mm PVC disappears, 2 mm ABS is a visible, knock-resistant
   edge, and it is what a good shop puts on a door). */
export const BANDING = [
  { id: "pvc_white_04", he: 'PVC לבן 0.4 מ"מ', en: "White PVC 0.4 mm", t: 0.04, ppm: 2.2, sup: "lavie", col: 0xf1efe9 },
  { id: "pvc_white_1", he: 'PVC לבן 1 מ"מ', en: "White PVC 1 mm", t: 0.1, ppm: 3.4, sup: "lavie", col: 0xf1efe9 },
  { id: "abs_white_2", he: 'ABS לבן 2 מ"מ', en: "White ABS 2 mm", t: 0.2, ppm: 6.5, sup: "lavie", col: 0xf1efe9 },
  { id: "abs_match_2", he: 'ABS בגוון הלוח 2 מ"מ', en: "Colour-matched ABS 2 mm", t: 0.2, ppm: 8.5, sup: "lavie", col: null },
  { id: "ven_oak_1", he: 'קנט פורניר אלון 1 מ"מ', en: "Oak veneer 1 mm", t: 0.1, ppm: 11, sup: "etz", col: 0xcaa877 },
  { id: "laser_2", he: 'קנט לייזר (ללא פס דבק) 2 מ"מ', en: "Laser edge (seamless) 2 mm", t: 0.2, ppm: 16, sup: "lavie", col: null },
];

/* ========================= worktop edge profiles ========================= */

/* Priced per running metre of *worked* edge, and only the exposed run gets one
   — this is stone-mason work, not banding. */
export const PROFILES = [
  { id: "none", he: "ללא עיבוד מיוחד", en: "No special edge", ppm: 0 },
  { id: "straight", he: "קנט ישר מלוטש", en: "Polished square edge", ppm: 55 },
  { id: "bevel", he: "קנט משופע", en: "Bevelled edge", ppm: 85 },
  { id: "bullnose", he: "קנט חצי עגול", en: "Bullnose edge", ppm: 125 },
  { id: "ogee", he: "קנט מדורג (אוג׳י)", en: "Ogee edge", ppm: 165 },
  { id: "mitre", he: "קנט מוגבה (מיטר 4 ס\"מ)", en: "Mitred 4 cm build-up", ppm: 240 },
];

/* ========================= labour & overheads ========================= */

/* The old price carried one blanket ×1.35 for "cutting, edge banding, fitting".
   That is fine as a guess and useless as a quote — you cannot tell a customer
   which part of it is the saw and which is the fitter. These are the lines a
   joinery shop actually bills, and nest.js fills in the quantities. */
export const LABOR = {
  sheetHandle: 38, // ₪ per sheet — ordering, delivery-in, onto the saw bed
  cutPerM: 5.5, // ₪ per metre of saw cut (panel saw, incl. blade wear)
  slabCutPerM: 95, // ₪ per metre cut in stone — a different machine entirely
  bandPerM: 9, // ₪ per metre banded (glue, feed, trim, scrape)
  hingeBore: 4.5, // ₪ per hinge cup + plate bored and screwed
  slideFit: 16, // ₪ per drawer runner pair fitted
  shelfBore: 1.4, // ₪ per shelf-pin hole
  assemblyPerUnit: 150, // ₪ per carcass box assembled in the shop
  fitPerUnit: 190, // ₪ per box levelled, scribed and hung on site
  fitPerShelf: 65, // ₪ per floating shelf — plugs, brackets, levelling
  delivery: 350, // ₪ per delivery run
  margin: 0.15, // workshop margin on the whole job
  vat: 0.18, // Israeli VAT
};

/* ========================= nesting defaults ========================= */

export const NEST = {
  kerf: 0.4, // saw blade — 4 mm of board turns into sawdust per cut
  trim: 1.0, // 10 mm trimmed off each sheet edge before anything is cut
  minOffcut: 20, // a leftover under 20×20 cm is waste, not stock
  grainLock: true, // never rotate a grained panel
  sqmWaste: 0.12, // what a cut-to-size supplier adds over the finished area
};

/* ========================= the price book ========================= */

/* User overrides, keyed `kind:id:field`. Kept deliberately flat so the whole
   book is one small JSON blob and a reset is one `removeItem`. */
var book = null;
function loadBook() {
  if (book) return book;
  book = {};
  try {
    var raw = localStorage.getItem(PB_KEY);
    if (raw) book = JSON.parse(raw) || {};
  } catch (_) {
    book = {};
  }
  return book;
}
function saveBook() {
  try {
    localStorage.setItem(PB_KEY, JSON.stringify(book || {}));
  } catch (_) {}
}
function bkey(kind, id, field) {
  return kind + ":" + id + ":" + (field || "price");
}

/* Read a number through the price book: the user's value if they set one, the
   catalogue default otherwise. Everything that costs money goes through here. */
export function priceOf(kind, id, field, fallback) {
  var b = loadBook(),
    k = bkey(kind, id, field);
  if (b[k] != null && isFinite(b[k])) return +b[k];
  return fallback;
}
export function setPrice(kind, id, field, val) {
  loadBook();
  var k = bkey(kind, id, field);
  if (val == null || val === "" || !isFinite(+val)) delete book[k];
  else book[k] = +val;
  saveBook();
}
export function isOverridden(kind, id, field) {
  var b = loadBook();
  return b[bkey(kind, id, field)] != null;
}
export function resetPrices() {
  book = {};
  try {
    localStorage.removeItem(PB_KEY);
  } catch (_) {}
}
export function overrideCount() {
  return Object.keys(loadBook()).length;
}

/* ========================= the offcut rack =========================

   Every job leaves usable pieces behind, and every shop has a rack of them. The
   nester computes those pieces already; until now it threw them away at the end
   of the run, which is why the yield figure was always "how well did this job
   nest" and never "how much board did we actually have to buy".

   A rack entry is {id, sheet, l, w, from} in centimetres. The nester consumes
   the rack before opening a new sheet, and what a job leaves is only banked when
   the user says so — banking automatically would fill the rack with pieces from
   plans that were never built. */
const RACK_KEY = "home3d_offcuts";
var rack = null;

function loadRack() {
  if (rack) return rack;
  rack = [];
  try {
    var raw = localStorage.getItem(RACK_KEY);
    if (raw) rack = JSON.parse(raw) || [];
  } catch (_) {
    rack = [];
  }
  return rack;
}
function saveRack() {
  try {
    localStorage.setItem(RACK_KEY, JSON.stringify(rack || []));
  } catch (_) {}
}

export function offcuts(sheetId) {
  var r = loadRack();
  return sheetId
    ? r.filter(function (o) {
        return o.sheet === sheetId;
      })
    : r.slice();
}
export function addOffcuts(list) {
  loadRack();
  var seq = rack.length ? Math.max.apply(null, rack.map(function (o) { return o.n || 0; })) : 0;
  list.forEach(function (o) {
    if (!(o.l >= NEST.minOffcut && o.w >= NEST.minOffcut)) return;
    rack.push({ n: ++seq, sheet: o.sheet, l: Math.round(o.l * 10) / 10, w: Math.round(o.w * 10) / 10, from: o.from || "" });
  });
  saveRack();
  return rack.length;
}
export function removeOffcut(n) {
  loadRack();
  rack = rack.filter(function (o) {
    return o.n !== n;
  });
  saveRack();
}
export function clearOffcuts() {
  rack = [];
  try {
    localStorage.removeItem(RACK_KEY);
  } catch (_) {}
}

/* ========================= lookups ========================= */

var sheetIx = null;
export function sheetById(id) {
  if (!sheetIx) {
    sheetIx = {};
    SHEETS.forEach(function (s) {
      sheetIx[s.id] = s;
    });
  }
  return sheetIx[id] || null;
}
export function bandById(id) {
  for (var i = 0; i < BANDING.length; i++) if (BANDING[i].id === id) return BANDING[i];
  return null;
}
export function profileById(id) {
  for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === id) return PROFILES[i];
  return PROFILES[0];
}
export function laborRate(k) {
  return priceOf("labor", "rate", k, LABOR[k]);
}
export function sheetPrice(s) {
  return s ? priceOf("sheet", s.id, "price", s.price) : 0;
}
export function bandPPM(b) {
  return b ? priceOf("band", b.id, "ppm", b.ppm) : 0;
}
export function profilePPM(p) {
  return p ? priceOf("profile", p.id, "ppm", p.ppm) : 0;
}

// Sheet area in m² and the raw ₪ per m² it works out to.
export function sheetArea(s) {
  return s ? (s.l * s.w) / 10000 : 0;
}
export function perM2(s) {
  var a = sheetArea(s);
  return a > 0 ? sheetPrice(s) / a : 0;
}

// Every sheet that may be used for a material role, thinnest-first.
export function sheetsFor(role) {
  return SHEETS.filter(function (s) {
    return s.use.indexOf(role) >= 0;
  }).sort(function (a, b) {
    return a.t - b.t || sheetPrice(a) - sheetPrice(b);
  });
}

/* ========================= defaults per family ========================= */

/* What a shop would quote by default for each kind of unit: melamine carcass
   throughout, an 8 mm rebated back (the thickness `STD.back` in cabinet.js
   builds to — pick the 4 mm HDF instead and the design thins the back to match),
   a lacquered front where the piece is a "show" piece and plain melamine where
   it is not, stone only where there is a worktop. */
const FAM_STOCK = {
  wardrobe: { carcass: "mel_white_18", front: "mel_white_18", back: "mel_back_8", top: "mel_white_18" },
  walkin: { carcass: "mel_white_18", front: "mel_white_18", back: "mel_back_8", top: "mel_white_18" },
  hall: { carcass: "mel_white_18", front: "mdf_lacq_18", back: "mel_back_8", top: "mel_white_18" },
  kitchenBase: { carcass: "mel_white_18", front: "mdf_lacq_18", back: "mel_back_8", top: "quartz_white_20" },
  kitchenUpper: { carcass: "mel_white_18", front: "mdf_lacq_18", back: "mel_back_8", top: "mel_white_18" },
  kitchenTall: { carcass: "mel_white_18", front: "mdf_lacq_18", back: "mel_back_8", top: "quartz_white_20" },
  vanity: { carcass: "mel_white_18", front: "mdf_lacq_18", back: "mel_back_8", top: "quartz_white_20" },
  bookcase: { carcass: "mel_oak_18", front: "mel_oak_18", back: "mel_back_8", top: "mel_oak_18" },
  shelving: { carcass: "ply_birch_38", front: "ply_birch_38", back: "mel_back_8", top: "ply_birch_38" },
  tvUnit: { carcass: "mel_white_18", front: "mel_oak_18", back: "mel_back_8", top: "mel_oak_18" },
  office: { carcass: "mel_white_18", front: "mel_white_18", back: "mel_back_8", top: "mel_white_18" },
  laundry: { carcass: "mel_white_18", front: "mel_white_18", back: "mel_back_8", top: "compact_12" },
  shoe: { carcass: "mel_white_18", front: "mel_white_18", back: "mel_back_8", top: "mel_white_18" },
};

export function defaultStock(fam) {
  var d = FAM_STOCK[fam] || FAM_STOCK.wardrobe;
  return { carcass: d.carcass, front: d.front, back: d.back, top: d.top, glass: "glass_clear_6", mirror: "mirror_4" };
}
/* What a shop puts on by default: 1 mm PVC on melamine carcass work, 2 mm ABS
   where the edge gets knocked (kitchen fronts), a veneer edge on anything whose
   edge is meant to look like wood. */
export function defaultBand(fam) {
  if (fam === "bookcase" || fam === "shelving") return "ven_oak_1";
  if (fam === "kitchenBase" || fam === "kitchenUpper" || fam === "kitchenTall" || fam === "vanity") return "abs_white_2";
  return "pvc_white_1";
}
export function defaultProfile(fam) {
  return fam === "kitchenBase" || fam === "kitchenTall" || fam === "vanity" ? "straight" : "none";
}

/* A sheet whose thickness matches a board the design actually needs. The
   designer lets you pick 25 mm melamine for the carcass; the 8 mm back then has
   to come from a back-material sheet, not from that. */
export function resolveSheet(stock, role, thickness) {
  var want = (stock && stock[role]) || null,
    s = want ? sheetById(want) : null;
  if (s && (thickness == null || Math.abs(s.t - thickness) < 0.35)) return s;
  // fall back to the cheapest stocked sheet of the right role and thickness
  var list = sheetsFor(role);
  var best = null;
  list.forEach(function (c) {
    if (thickness != null && Math.abs(c.t - thickness) >= 0.35) return;
    if (!best || sheetPrice(c) < sheetPrice(best)) best = c;
  });
  return best || s || list[0] || null;
}

export function sheetLabel(s, en) {
  if (!s) return "";
  return en ? s.en : s.he;
}
export function bandLabel(b, en) {
  if (!b) return "";
  return en ? b.en : b.he;
}
export function profileLabel(p, en) {
  if (!p) return "";
  return en ? p.en : p.he;
}
