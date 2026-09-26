import { mountCabinetShopSetup } from "./ui_cabinet_manufacturing.js";
import { mountCabinetProduction } from "./ui_cabinet_production.js";
import { cabinetManufacturingReport, cabinetManufacturingJSON } from "./cabinet_manufacturing.js";
// Cut plan & quote — the overlay on top of nest.js.
//
// Left: what the job is made of (which sheet per material role, which banding,
// which worked stone edge) and the price book behind the numbers. Middle: the
// nesting itself, one drawing per sheet, guillotine cuts only, with the yield
// on each. Right: the quote, broken into the lines a joinery shop bills, the
// suppliers it has to be ordered from and how long the longest of them takes.
//
// Scope is either the cabinet you came in from or every cabinet in the plan.
// The project scope is the point of the whole view: nesting a whole order at
// once is what turns four half-used sheets into three full ones, and the header
// says how much that is worth against the per-unit estimate.

import { S } from "./state.js";
import { getLang, onLangChange } from "./i18n.js";
import { flabel } from "./furniture.js";
import { pushHistory } from "./history.js";
import { updateCost, refreshTree } from "./ui_tree.js";
import { quote, cutCSV, drillCSV, nestDXF, purchaseOrders, quoteHTML, supplierPlan, unitLabel } from "./nest.js";
import { STD, specOf, normalizeSpec, roleLabelHe } from "./cabinet.js";
import {
  BANDING, PROFILES, SUPPLIERS, sheetsFor, sheetById,
  sheetPrice, bandPPM, profilePPM, laborRate, perM2,
  setPrice, resetPrices, overrideCount, isOverridden, LABOR, NEST,
  sheetLabel, bandLabel, profileLabel, supLabel, supCity,
  offcuts, addOffcuts, removeOffcut, clearOffcuts,
} from "./stock.js";

/* ================= local i18n ================= */
var TXT = {
  title: ["תוכנית ניסור ותמחור", "Cut plan & quote"],
  scope: ["היקף", "Scope"],
  thisCab: ["הארון הזה", "This cabinet"],
  allCabs: ["כל הארונות בתוכנית", "Every cabinet in the plan"],
  close: ["סגור", "Close"],
  materials: ["חומרים", "Materials"],
  roleCarcass: ["גוף ומדפים", "Carcass & shelves"],
  roleFront: ["חזיתות", "Fronts"],
  roleBack: ["גב", "Back panel"],
  roleTop: ["משטח עבודה", "Worktop"],
  banding: ["קנטים", "Edge banding"],
  profile: ["עיבוד קנט משטח", "Worktop edge"],
  saw: ["הגדרות ניסור", "Saw settings"],
  kerf: ['עובי מסור (מ"מ)', "Blade kerf (mm)"],
  trim: ['גזירת שוליים (מ"מ)', "Edge trim (mm)"],
  grainLock: ["לשמור כיוון סיב", "Respect grain direction"],
  priceBook: ["מחירון", "Price book"],
  pbNote: [
    "המחירים כאן הם מחירי שוק להמחשה. שינוי נשמר במחשב שלכם ומשפיע על כל התמחור.",
    "These are indicative market prices. Anything you change is saved on this machine and drives every price.",
  ],
  labour: ["עבודה", "Labour"],
  reset: ["אפס מחירון", "Reset price book"],
  overrides: ["מחירים מותאמים", "custom prices"],
  sheets: ["פלטות", "Sheets"],
  sheetN: ["פלטה", "Sheet"],
  bySqm: ["נמדד ונחתך אצל הספק", "Cut to size by the supplier"],
  rack: ["מלאי שאריות", "Offcut rack"],
  rackNote: [
    "שאריות שנשמרו מעבודות קודמות. הניסור לוקח מהן לפני שהוא קונה פלטה חדשה.",
    "Pieces kept from earlier jobs. The nesting takes from these before it buys a new sheet.",
  ],
  useStock: ["השתמש בשאריות מהמלאי", "Use pieces from the rack"],
  fromRack: ["חתיכות נלקחו מהמלאי", "pieces taken from the rack"],
  bank: ["שמור שאריות למלאי", "Bank the leftovers"],
  banked: ["השאריות נשמרו למלאי", "Leftovers banked on the rack"],
  clearRack: ["רוקן מלאי", "Empty the rack"],
  yield: ["ניצולת", "Yield"],
  offcut: ["שאריות שמישות", "Usable offcuts"],
  quoteT: ["הצעת מחיר", "Quote"],
  matCost: ["חומרי גלם", "Materials"],
  bandCost: ["קנטים", "Edge banding"],
  profCost: ["עיבוד קנט אבן", "Stone edge work"],
  hwCost: ["פרזול", "Ironmongery"],
  labCost: ["עבודה", "Labour"],
  margin: ["רווח קבלני", "Margin"],
  vat: ['מע"מ', "VAT"],
  total: ['סה"כ לתשלום', "Total"],
  net: ["עלות ישירה", "Direct cost"],
  perUnit: ['אומדן לפי פריט (ללא מע"מ)', "Per-unit estimate (ex VAT)"],
  proRata: ["חומר לפי חלק יחסי", "Board pro-rata"],
  wholeSheets: ["חומר בפלטות שלמות", "Board as whole sheets"],
  saving: ["הפרש", "Difference"],
  savingNote: [
    'האומדן בפאנל העלות מחלק את הפלטה באופן יחסי ומוסיף מקדם פחת. תוכנית ניסור אמיתית קונה פלטות שלמות — ההפרש כאן הוא מה שהניסור המשותף חוסך, או מה שהוא מגלה שחסר. אין כאן מע"מ והובלה, שהאומדן לפי פריט לא מכיר.',
    "The cost panel's estimate divides the sheet pro-rata with a fixed offcut allowance. A real cut plan buys whole sheets — this difference is what nesting the order together saves, or reveals is missing. It excludes VAT and delivery, which the per-unit estimate knows nothing about.",
  ],
  suppliers: ["ספקים וזמני אספקה", "Suppliers & lead times"],
  lead: ["ימי אספקה", "days"],
  leadTotal: ["זמן אספקה ארוך ביותר", "Longest lead time"],
  days: ["ימי עסקים", "business days"],
  unplaced: ["חלקים שלא נכנסים לפלטה", "Parts that do not fit a sheet"],
  unplacedNote: [
    "חלק גדול מהפלטה שנבחרה — יש לפצל אותו, לבחור פלטה גדולה יותר, או לוותר על כיוון הסיב.",
    "Bigger than the chosen sheet — split it, choose a larger sheet, or drop the grain constraint.",
  ],
  panels: ["חלקים", "Parts"],
  boardArea: ["שטח פלטות", "Board bought"],
  usedArea: ["שטח מנוצל", "Board used"],
  waste: ["פחת", "Waste"],
  exports: ["ייצוא", "Export"],
  csv: ["רשימת ניסור CSV", "Cut list CSV"],
  drill: ["תוכנית קידוח CSV", "Drilling review CSV"],
  dxf: ["ניסור + קידוח DXF", "Nesting + drilling review DXF"],
  po: ["הזמנות רכש לפי ספק", "Purchase orders by supplier"],
  quoteDoc: ["הצעת מחיר ללקוח", "Quote for the client"],
  poDone: ["הזמנות רכש הורדו", "purchase orders downloaded"],
  quoteDone: ["הצעת המחיר הורדה — ניתן לפתוח ולהדפיס", "Quote downloaded — open it and print"],
  png: ["תוכנית PNG", "Plan PNG"],
  empty: ["אין ארונות מודולריים בתוכנית", "No modular cabinets in this plan"],
  emptyNote: [
    "הוסיפו ארון מודולרי מהספרייה, או פתחו את מעצב הארונות על פריט קיים.",
    "Add a modular cabinet from the library, or open the cabinet designer on an existing piece.",
  ],
  cabs: ["ארונות", "Cabinets"],
  each: ["ליחידה", "each"],
  rotated: ["מסובב", "turned"],
  grainMark: ["כיוון סיב", "grain"],
};
function T(k) {
  var e = TXT[k] || ["", ""];
  return getLang() === "en" ? e[1] : e[0];
}
function isEn() {
  return getLang() === "en";
}
function ils(n) {
  return "₪" + Math.round(n).toLocaleString("en-US");
}
function mm(cm) {
  return Math.round(cm * 10);
}

/* Boards are drawn tinted by what they are, so a sheet reads at a glance:
   carcass grey, shelves warm, fronts blue, drawers orange. */
var ROLE_COL = {
  side: "#9fadbb", bottom: "#9fadbb", top: "#9fadbb", divider: "#8b9aaa", plinth: "#8e959b",
  fixedShelf: "#cbb894", shelf: "#cbb894",
  back: "#b5a68b", worktop: "#868c92",
  door: "#7ea8d8", doorPanel: "#9ec0e0", batten: "#8fb3d8", glazing: "#b9dde6", filler: "#adb3b8",
  drawerFront: "#dda06a", drawerBox: "#c9b79a", drawerBottom: "#dbd0ba",
};

/* ================= state ================= */
var root = null,
  E = {
    open: false,
    scope: "project",
    it: null,
    q: null,
    lang: null,
    opt: { algorithm: "guillotine", kerf: NEST.kerf, trim: NEST.trim, grainLock: NEST.grainLock, minOffcut: NEST.minOffcut },
  };

function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function btn(label, cb, cls) {
  var b = el("button", cls || "", label);
  b.addEventListener("click", cb);
  return b;
}
function row(label, node) {
  var r = el("div", "nz-row", "<span>" + label + "</span>");
  r.appendChild(node);
  return r;
}
function numIn(val, cb, step) {
  var i = el("input");
  i.type = "number";
  i.value = val;
  if (step) i.step = step;
  i.addEventListener("change", function () {
    cb(+this.value);
  });
  return i;
}
function select(opts, cur, cb) {
  var s = el("select");
  opts.forEach(function (o) {
    var op = el("option");
    op.value = o[0];
    op.textContent = o[1];
    if (String(o[0]) === String(cur)) op.selected = true;
    s.appendChild(op);
  });
  s.addEventListener("change", function () {
    cb(this.value);
  });
  return s;
}

/* ================= scope ================= */

function cabItems() {
  var list =
    E.scope === "item" && E.it
      ? [E.it]
      : (S.items || []).filter(function (it) {
          return it && (it.cab || it.type === "cabsys");
        });
  /* A modular cabinet that has never been opened in the designer has no spec
     yet — it is created on demand (see specOf), and the 3D build is usually
     what triggers it. Ask for it here too, or a freshly added cabinet would be
     silently missing from the cut plan. */
  list.forEach(function (it) {
    specOf(it);
  });
  return list;
}
// the spec every material picker edits: one cabinet's, or all of them at once
function specs() {
  return cabItems().map(function (it) {
    return specOf(it);
  });
}

/* ================= DOM ================= */

function destroyDOM() {
  if (root) root.remove();
  root = null;
}

function buildDOM() {
  E.lang = getLang();
  root = el("div");
  root.id = "nestplan";
  root.innerHTML =
    '<div class="nz-head">' +
    '<div class="nz-logo"><i class="ph ph-scissors"></i> <b>' + T("title") + "</b>" +
    '<span class="nz-sub" id="nzSub"></span></div>' +
    '<div class="nz-scope" id="nzScope"></div>' +
    '<div class="nz-actions">' +
    '<button id="nzClose" class="btn-accent"><i class="ph ph-check"></i> ' + T("close") + "</button>" +
    "</div></div>" +
    // lives outside the panels: fillSheets() rebuilds the middle column wholesale
    '<div id="nzFlash" class="nz-flash"></div>' +
    '<div class="nz-body">' +
    '<div class="nz-panel nz-left">' +
    '<div class="nz-sec"><h4>' + T("materials") + '</h4><div id="nzMat"></div></div>' +
    '<div class="nz-sec"><h4>' + T("saw") + '</h4><div id="nzSaw"></div></div>' +
    '<div class="nz-sec"><h4>' + T("rack") + ' <span id="nzRackN" class="nz-badge"></span></h4>' +
    '<div class="nz-note">' + T("rackNote") + '</div><div id="nzRack"></div></div>' +
    '<div class="nz-sec nz-fill"><h4>' + T("priceBook") + ' <span id="nzPbBadge" class="nz-badge"></span></h4>' +
    '<div class="nz-note">' + T("pbNote") + "</div><div id=\"nzBook\"></div></div>" +
    "</div>" +
    '<div class="nz-mid" id="nzMid"></div>' +
    '<div class="nz-panel nz-right">' +
    '<div class="nz-sec"><h4>' + T("quoteT") + '</h4><div id="nzQuote"></div></div>' +
    '<div class="nz-sec"><h4>' + T("suppliers") + '</h4><div id="nzSup"></div></div>' +
    '<div class="nz-sec" id="nzWarnSec" style="display:none"><h4>' + T("unplaced") + '</h4><div id="nzWarn"></div></div>' +
    '<div class="nz-sec"><h4>' + T("exports") + "</h4>" +
    '<button id="nzCsv" class="nz-wide"><i class="ph ph-file-csv"></i> ' + T("csv") + "</button>" +
    '<button id="nzDrill" class="nz-wide"><i class="ph ph-circles-three"></i> ' + T("drill") + "</button>" +
    '<button id="nzDxf" class="nz-wide"><i class="ph ph-file-dashed"></i> ' + T("dxf") + "</button>" +
    '<div id="nzProductionHost"></div><div id="nzShopSetup"></div>' +
    '<div id="nzManufacturing" class="nz-note" role="status"></div>' +
    '<button id="nzManufacturingJson" class="nz-wide">' + (isEn() ? "Manufacturing review JSON" : "דוח בדיקת ייצור JSON") + "</button>" +
    '<button id="nzPo" class="nz-wide"><i class="ph ph-shopping-cart"></i> ' + T("po") + "</button>" +
    '<button id="nzQuoteDoc" class="nz-wide btn-accent"><i class="ph ph-file-text"></i> ' + T("quoteDoc") + "</button>" +
    '<button id="nzPng" class="nz-wide"><i class="ph ph-image"></i> ' + T("png") + "</button>" +
    "</div></div></div>";
  document.body.appendChild(root);
  root._cabinetShopSetup = mountCabinetShopSetup(root.querySelector("#nzShopSetup"), function () { return E.q?.items || []; }, downloadText);
  root._cabinetProduction = mountCabinetProduction(root.querySelector("#nzProductionHost"), cabItems, downloadText, function (change) {
    pushHistory(); change(); S.dirty3D = true; recompute();
  }, function () { return root._cabinetShopSetup.getRecipes(); });

  root.querySelector("#nzClose").addEventListener("click", closeNest);
  root.querySelector("#nzCsv").addEventListener("click", exportCSV);
  root.querySelector("#nzDrill").addEventListener("click", exportDrill);
  root.querySelector("#nzDxf").addEventListener("click", exportDXF);
  root.querySelector("#nzManufacturingJson").addEventListener("click", function () {
    if (E.q) downloadText("manufacturing-review.json", cabinetManufacturingJSON(E.q.items), "application/json");
  });
  root.querySelector("#nzPo").addEventListener("click", exportPOs);
  root.querySelector("#nzQuoteDoc").addEventListener("click", exportQuoteDoc);
  root.querySelector("#nzPng").addEventListener("click", exportPNG);
  document.addEventListener("keydown", function (e) {
    if (!E.open) return;
    if (e.key === "Escape") closeNest();
  });
  window.addEventListener("resize", function () {
    if (E.open) fillSheets();
  });
}

/* ================= open / close ================= */

export function openNest(it) {
  if (root && E.lang !== getLang()) destroyDOM();
  if (!root) buildDOM();
  E.it = it && it.cab ? it : null;
  E.scope = E.it ? "item" : "project";
  E.open = true;
  root.style.display = "flex";
  recompute();
}

export function closeNest() {
  if (!root) return;
  E.open = false;
  root.style.display = "none";
  // material choices are real edits to the design — let the rest of the app see
  // the new prices and the (possibly) new board thickness
  S.dirty3D = true;
  refreshTree();
  updateCost();
  window.dispatchEvent(new Event("cabStockChanged"));
}
export function isNestOpen() {
  return E.open;
}

/* ================= recompute ================= */

function recompute() {
  var list = cabItems();
  E.q = list.length
    ? quote(list, Object.assign({}, E.opt, {
        // parts are tagged with the piece they belong to, in the user's language
        label: function (it) {
          return flabel(it.type);
        },
      }))
    : null;
  fillScope();
  fillMaterials();
  fillSaw();
  fillRack();
  fillBook();
  fillSheets();
  fillQuote();
  fillSuppliers();
  fillWarnings();
  var sub = root.querySelector("#nzSub");
  if (sub)
    sub.textContent = E.q
      ? list.length + " " + T("cabs") + " · " + E.q.panelCount + " " + T("panels") + " · " + E.q.nest.sheetCount + " " + T("sheets")
      : "";
}

function fillScope() {
  var host = root.querySelector("#nzScope");
  host.innerHTML = "";
  var opts = [["project", T("allCabs")]];
  if (E.it) opts.unshift(["item", T("thisCab")]);
  opts.forEach(function (o) {
    var b = btn(o[1], function () {
      E.scope = o[0];
      recompute();
    }, "nz-chip" + (E.scope === o[0] ? " on" : ""));
    host.appendChild(b);
  });
}

/* ================= materials ================= */

/* One picker per material role. In project scope a change applies to every
   cabinet at once, which is what "the whole order is one material" means and is
   how a kitchen is actually specified. */
function setStock(role, id) {
  pushHistory();
  var sheet = sheetById(id);
  specs().forEach(function (sp) {
    sp.stock = sp.stock || {};
    sp.stock[role] = id;
    /* Board thickness is not a separate opinion from the sheet you buy: pick
       25 mm melamine for the carcass and the carcass is 25 mm. The design
       re-fits around it. */
    if (sheet) {
      if (role === "carcass") sp.panel = sheet.t;
      else if (role === "back" && sp.back > 0) sp.back = sheet.t;
      else if (role === "top" && sp.top > 0) sp.top = sheet.t;
    }
  });
  cabItems().forEach(function (it) {
    normalizeSpec(it.cab, it.w, it.h, it.d);
  });
  S.dirty3D = true;
  recompute();
}

// what the current selection is, or "mixed" when the cabinets disagree
function common(get) {
  var vals = specs().map(get),
    first = vals[0];
  return vals.every(function (v) {
    return v === first;
  })
    ? first
    : null;
}

function fillMaterials() {
  var host = root.querySelector("#nzMat");
  host.innerHTML = "";
  var list = cabItems();
  if (!list.length) return;
  var mixed = isEn() ? "— mixed —" : "— מעורב —";

  var hasTop = specs().some(function (sp) {
    return sp.top > 0;
  });
  [["carcass", "roleCarcass", null], ["front", "roleFront", STD.doorT], ["back", "roleBack", null], ["top", "roleTop", null]].forEach(function (r) {
    // no point offering a worktop material to a piece that has no worktop
    if (r[0] === "top" && !hasTop) return;
    var role = r[0],
      lock = r[2],
      pool = sheetsFor(role).filter(function (s) {
        // a front has to be the thickness the doors are built at
        return lock == null || Math.abs(s.t - lock) < 0.35;
      });
    if (!pool.length) return;
    var cur = common(function (sp) {
        return (sp.stock || {})[role];
      }),
      opts = pool.map(function (s) {
        return [s.id, sheetLabel(s, isEn()) + "  ·  " + ils(sheetPrice(s)) + "/" + (isEn() ? "sheet" : "פלטה")];
      });
    if (cur == null) opts.unshift(["", mixed]);
    host.appendChild(
      row(T(r[1]), select(opts, cur == null ? "" : cur, function (v) {
        if (v) setStock(role, v);
      })),
    );
    var s = cur ? sheetById(cur) : null;
    if (s) {
      var meta = el("div", "nz-meta");
      meta.textContent =
        mm(s.l) + "×" + mm(s.w) + "×" + mm(s.t) + " · " + Math.round(perM2(s)) + "₪/m²" +
        " · " + supLabel(s.sup, isEn()) + (s.grain ? " · " + T("grainMark") : "");
      host.appendChild(meta);
    }
  });

  var curB = common(function (sp) {
    return sp.band;
  });
  host.appendChild(
    row(T("banding"), select(
      (curB == null ? [["", mixed]] : []).concat(BANDING.map(function (b) {
        return [b.id, bandLabel(b, isEn()) + "  ·  " + bandPPM(b) + "₪/m"];
      })),
      curB == null ? "" : curB,
      function (v) {
        if (!v) return;
        pushHistory();
        specs().forEach(function (sp) {
          sp.band = v;
        });
        recompute();
      },
    )),
  );

  // only offer a stone edge when something in scope actually has a worktop
  if (hasTop) {
    var curP = common(function (sp) {
      return sp.profile;
    });
    host.appendChild(
      row(T("profile"), select(
        (curP == null ? [["", mixed]] : []).concat(PROFILES.map(function (p) {
          return [p.id, profileLabel(p, isEn()) + (p.ppm ? "  ·  " + profilePPM(p) + "₪/m" : "")];
        })),
        curP == null ? "" : curP,
        function (v) {
          if (!v) return;
          pushHistory();
          specs().forEach(function (sp) {
            sp.profile = v;
          });
          recompute();
        },
      )),
    );
  }
}

/* The rack of offcuts kept between jobs. Banking is deliberate: a plan that was
   drawn and never built must not fill the rack with board nobody cut. */
function fillRack() {
  var host = root.querySelector("#nzRack"),
    badge = root.querySelector("#nzRackN");
  if (!host) return;
  host.innerHTML = "";
  var list = offcuts(),
    left = E.q ? E.q.nest.leftovers : [];
  badge.className = "nz-badge" + (list.length ? " on" : "");
  badge.textContent = list.length || "";

  var cb = el("label", "nz-cb"),
    i = el("input");
  i.type = "checkbox";
  i.checked = E.opt.useStock !== false;
  i.addEventListener("change", function () {
    E.opt.useStock = this.checked;
    recompute();
  });
  cb.appendChild(i);
  cb.appendChild(el("span", "", T("useStock")));
  host.appendChild(cb);

  if (E.q && E.q.nest.stockCount)
    host.appendChild(el("div", "nz-stockline", E.q.nest.stockCount + " " + T("fromRack")));

  list.slice(0, 8).forEach(function (o) {
    var sh = sheetById(o.sheet),
      r = el("div", "nz-row nz-rack-row", "<span>" + mm(o.l) + "×" + mm(o.w) + " · " + sheetLabel(sh, isEn()) + "</span>");
    r.appendChild(btn('<i class="ph ph-x"></i>', function () {
      removeOffcut(o.n);
      recompute();
    }, "nz-x"));
    host.appendChild(r);
  });
  if (list.length > 8) host.appendChild(el("div", "nz-note", "+" + (list.length - 8)));

  if (left.length)
    host.appendChild(btn('<i class="ph ph-tray-arrow-down"></i> ' + T("bank") + " (" + left.length + ")", function () {
      addOffcuts(left.map(function (o) {
        return { sheet: o.sheet, l: o.l, w: o.w, from: new Date().toLocaleDateString() };
      }));
      flashInfo(T("banked"));
      recompute();
    }, "nz-wide"));
  if (list.length)
    host.appendChild(btn('<i class="ph ph-trash"></i> ' + T("clearRack"), function () {
      clearOffcuts();
      recompute();
    }, "nz-wide"));
}

function fillSaw() {
  var host = root.querySelector("#nzSaw");
  host.innerHTML = "";
  var algorithm=el("select");algorithm.id="nzNestingAlgorithm";
  [["guillotine",isEn()?"Guillotine panel saw":"מסור לוחות — חיתוך גליוטינה"],["router-rectangular",isEn()?"Router — rectangular blanks":"כרסום — מלבנים בלבד"]].forEach(function(entry){var option=el("option","",entry[1]);option.value=entry[0];algorithm.appendChild(option);});
  algorithm.value=E.opt.algorithm||"guillotine";algorithm.addEventListener("change",function(){E.opt.algorithm=this.value;recompute();});
  host.appendChild(row(isEn()?"Nesting method":"שיטת פריסה",algorithm));
  host.appendChild(el("p","",isEn()?"Rectangular blanks only. Router spacing uses the kerf field as tool clearance. No true-shape nesting, lead-ins, hold-down or CAM paths. Router labour is a perimeter estimate using the saw rate.":"פריסת מלבנים בלבד. במצב כרסום עובי המסור משמש כמרווח כלי. ללא פריסת צורות, כניסות כלי, אחיזה או מסלולי CAM. עלות הכרסום היא אומדן היקף לפי תעריף ניסור."));
  host.appendChild(row(T("kerf"), numIn(mm(E.opt.kerf), function (v) {
    E.opt.kerf = Math.max(0, Math.min(12, v)) / 10;
    recompute();
  })));
  host.appendChild(row(T("trim"), numIn(mm(E.opt.trim), function (v) {
    E.opt.trim = Math.max(0, Math.min(50, v)) / 10;
    recompute();
  })));
  var cb = el("label", "nz-cb");
  var i = el("input");
  i.type = "checkbox";
  i.checked = !!E.opt.grainLock;
  i.addEventListener("change", function () {
    E.opt.grainLock = this.checked;
    recompute();
  });
  cb.appendChild(i);
  cb.appendChild(el("span", "", T("grainLock")));
  host.appendChild(cb);
}

/* ================= price book ================= */

/* Only the prices this job actually uses, so the panel stays short and every
   number in it moves something on the right. */
function fillBook() {
  var host = root.querySelector("#nzBook");
  host.innerHTML = "";
  var badge = root.querySelector("#nzPbBadge"),
    n = overrideCount();
  badge.className = "nz-badge" + (n ? " on" : "");
  badge.textContent = n ? n : "";

  if (E.q) {
    E.q.sheets.forEach(function (l) {
      // always the sheet price, even for cut-to-size goods — the ₪/m² they are
      // billed at is derived from it, and one knob beats two
      host.appendChild(priceRow(
        sheetLabel(l.sheet, isEn()) + (isEn() ? " /sheet" : " /פלטה"),
        "sheet", l.sheet.id, "price", sheetPrice(l.sheet), l.sheet.price,
      ));
    });
    E.q.bandLines.forEach(function (l) {
      host.appendChild(priceRow(bandLabel(l.band, isEn()) + " /m", "band", l.band.id, "ppm", bandPPM(l.band), l.band.ppm));
    });
    E.q.profileLines.forEach(function (l) {
      host.appendChild(priceRow(profileLabel(l.profile, isEn()) + " /m", "profile", l.profile.id, "ppm", profilePPM(l.profile), l.profile.ppm));
    });
  }
  host.appendChild(el("h5", "nz-h5", T("labour")));
  var labKeys = E.q && E.q.labor.length
    ? E.q.labor.map(function (r) {
        return [r.key, isEn() ? r.en : r.he];
      })
    : [];
  labKeys.push(["margin", T("margin") + " (%)"], ["vat", T("vat") + " (%)"]);
  var seen = {};
  labKeys.forEach(function (k) {
    if (seen[k[0]]) return;
    seen[k[0]] = 1;
    var pct = k[0] === "margin" || k[0] === "vat",
      cur = laborRate(k[0]),
      def = LABOR[k[0]];
    host.appendChild(
      priceRow(k[1], "labor", "rate", k[0], pct ? Math.round(cur * 100) : cur, pct ? Math.round(def * 100) : def, pct),
    );
  });
  host.appendChild(btn('<i class="ph ph-arrow-counter-clockwise"></i> ' + T("reset"), function () {
    resetPrices();
    recompute();
  }, "nz-wide"));
}

function priceRow(label, kind, id, field, cur, def, pct) {
  var r = el("div", "nz-row nz-price" + (isOverridden(kind, id, field) ? " on" : ""), "<span>" + label + "</span>");
  var i = el("input");
  i.type = "number";
  i.step = "any";
  i.value = cur;
  i.title = (isEn() ? "catalogue: " : "מחירון: ") + def;
  i.addEventListener("change", function () {
    var v = this.value === "" ? null : +this.value;
    setPrice(kind, id, field, v == null ? null : pct ? v / 100 : v);
    recompute();
  });
  r.appendChild(i);
  return r;
}

/* ================= the nesting drawings ================= */

function css(name, fb) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fb;
}

function fillSheets() {
  var host = root.querySelector("#nzMid");
  if (!host) return;
  host.innerHTML = "";
  if (!E.q) {
    var e = el("div", "nz-empty");
    e.innerHTML = '<i class="ph ph-lockers"></i><b>' + T("empty") + "</b><span>" + T("emptyNote") + "</span>";
    host.appendChild(e);
    return;
  }
  var stats = el("div", "nz-stats");
  [
    [T("boardArea"), E.q.nest.boardArea.toFixed(2) + " m²"],
    [T("usedArea"), E.q.nest.usedArea.toFixed(2) + " m²"],
    [T("yield"), Math.round(E.q.yield * 100) + "%"],
    [T("waste"), E.q.waste.toFixed(2) + " m²"],
  ].forEach(function (s) {
    var b = el("div", "nz-stat", "<b>" + s[1] + "</b><span>" + s[0] + "</span>");
    stats.appendChild(b);
  });
  host.appendChild(stats);

  E.q.nest.groups.forEach(function (g) {
    var gh = el("div", "nz-group"),
      // cut-to-size goods are invoiced by the metre, so that is what the header
      // says; whole sheets say how many sheets
      how = g.bySqm
        ? T("bySqm") + " · " + g.billedM2.toFixed(2) + " m²"
        : g.count + " × " + mm(g.sheet.l) + "×" + mm(g.sheet.w);
    gh.appendChild(el("div", "nz-gtitle",
      "<b>" + sheetLabel(g.sheet, isEn()) + "</b><span>" + how +
      " · " + ils(g.cost) + " · " + Math.round(g.eff * 100) + "% " + T("yield") + "</span>"));
    g.sheets.forEach(function (sh) {
      gh.appendChild(sheetCard(g, sh));
    });
    host.appendChild(gh);
  });
}

function sheetCard(g, sh) {
  var card = el("div", "nz-sheet");
  var head = el("div", "nz-shead",
    "<span>" + T("sheetN") + " " + (sh.i + 1) + "</span>" +
    '<span class="nz-eff">' + Math.round(sh.eff * 100) + "%</span>");
  card.appendChild(head);
  var bar = el("div", "nz-bar");
  var fill = el("div", "nz-barfill");
  fill.style.width = Math.round(sh.eff * 100) + "%";
  fill.style.background = sh.eff > 0.8 ? "#4f9a63" : sh.eff > 0.62 ? "#d08a2c" : "#d9534f";
  bar.appendChild(fill);
  card.appendChild(bar);
  var cv = el("canvas", "nz-cv");
  card.appendChild(cv);
  if (sh.offcuts.length) {
    var oc = el("div", "nz-offcut");
    oc.textContent =
      T("offcut") + ": " +
      sh.offcuts
        .map(function (r) {
          return mm(r.w) + "×" + mm(r.h);
        })
        .join(" · ");
    card.appendChild(oc);
  }
  // sized once it is in the document, so the canvas knows how wide it may be
  setTimeout(function () {
    drawSheet(cv, g, sh);
  }, 0);
  return card;
}

/* The sheet is drawn lying down — length across the page, grain horizontal —
   the way a nesting diagram is read at the saw. The packer works in
   (across, along); this swaps the two on the way out. */
function drawSheet(cv, g, sh) {
  var host = cv.parentElement;
  if (!host) return;
  var availW = Math.max(120, host.clientWidth - 2),
    sheet = sh.sheet,
    k = availW / sheet.l,
    dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = availW + "px";
  cv.style.height = sheet.w * k + "px";
  cv.width = Math.round(availW * dpr);
  cv.height = Math.round(sheet.w * k * dpr);
  var c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  var line = css("--border-color", "#c9ced4"),
    muted = css("--text-muted", "#7b838c");

  // the raw sheet, and the strip that comes off all round before anything is cut
  c.fillStyle = "rgba(128,128,128,0.10)";
  c.fillRect(0, 0, sheet.l * k, sheet.w * k);
  c.strokeStyle = line;
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, sheet.l * k - 1, sheet.w * k - 1);
  var tr = sh.stock ? 0 : E.opt.trim;
  if (tr > 0) {
    c.save();
    c.setLineDash([3, 3]);
    c.strokeStyle = muted;
    c.strokeRect(tr * k, tr * k, (sheet.l - 2 * tr) * k, (sheet.w - 2 * tr) * k);
    c.restore();
  }

  // usable offcuts, hatched, so what is left on the rack is visible
  sh.offcuts.forEach(function (r) {
    var ox = r.y * k,
      oy = r.x * k,
      ow = r.h * k,
      oh = r.w * k;
    c.save();
    c.beginPath();
    c.rect(ox, oy, ow, oh);
    c.clip();
    c.strokeStyle = "rgba(79,154,99,0.55)";
    c.lineWidth = 1;
    for (var hx = -oh; hx < ow; hx += 7) {
      c.beginPath();
      c.moveTo(ox + hx, oy + oh);
      c.lineTo(ox + hx + oh, oy);
      c.stroke();
    }
    c.restore();
  });

  c.textAlign = "center";
  c.textBaseline = "middle";
  c.direction = isEn() ? "ltr" : "rtl";
  sh.place.forEach(function (q) {
    var x = q.y * k,
      y = q.x * k,
      w = q.h * k,
      h = q.w * k,
      p = q.p;
    c.fillStyle = ROLE_COL[p.role] || "#a9b0b6";
    c.globalAlpha = 0.75;
    c.fillRect(x, y, w, h);
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(20,24,28,0.55)";
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // the grain, drawn on the boards that have one — it runs along the sheet,
    // and it is the reason the nesting could not simply turn this piece 90°
    if (p.grain && E.opt.grainLock && w > 14) {
      c.save();
      c.strokeStyle = "rgba(20,24,28,0.16)";
      for (var gy = y + 4; gy < y + h - 2; gy += 5) {
        c.beginPath();
        c.moveTo(x + 2, gy);
        c.lineTo(x + w - 2, gy);
        c.stroke();
      }
      c.restore();
    }
    if (w > 44 && h > 26) {
      var lbl = isEn() ? p.role : roleLabelHe(p.role),
        vert = h > w * 1.6 && w < 90;
      c.save();
      c.translate(x + w / 2, y + h / 2);
      if (vert) c.rotate(-Math.PI / 2);
      c.fillStyle = "#15181c";
      c.font = "600 10px Inter, Rubik, sans-serif";
      // the part number leads: it is what gets written on the board
      c.fillText("#" + p.no + " " + lbl, 0, -6);
      c.font = "500 9px Inter, Rubik, sans-serif";
      c.fillStyle = "rgba(21,24,28,0.72)";
      c.fillText(mm(p.l) + "×" + mm(p.w) + (q.rot ? " ↻" : ""), 0, 6);
      c.restore();
    } else if (w > 20 && h > 12) {
      c.save();
      c.fillStyle = "rgba(21,24,28,0.8)";
      c.font = "600 9px Inter, Rubik, sans-serif";
      c.direction = "ltr";
      c.fillText("#" + p.no, x + w / 2, y + h / 2);
      c.restore();
    }
  });

  // the sheet's own size, along the two outside edges
  c.fillStyle = muted;
  c.font = "500 9px Inter, Rubik, sans-serif";
  c.textAlign = "center";
  c.direction = "ltr";
  c.fillText(mm(sheet.l) + "", (sheet.l * k) / 2, 7);
  c.save();
  c.translate(8, (sheet.w * k) / 2);
  c.rotate(-Math.PI / 2);
  c.fillText(mm(sheet.w) + "", 0, 0);
  c.restore();
}

/* ================= the quote ================= */

function qRow(host, label, val, cls) {
  var r = el("div", "nz-qrow" + (cls ? " " + cls : ""));
  r.appendChild(el("span", "nz-qname", label));
  r.appendChild(el("span", "nz-qval", val));
  host.appendChild(r);
  return r;
}

function fillQuote() {
  var host = root.querySelector("#nzQuote");
  host.innerHTML = "";
  var q = E.q;
  if (!q) {
    host.appendChild(el("div", "nz-note", T("emptyNote")));
    return;
  }
  q.sheets.forEach(function (l) {
    qRow(host, sheetLabel(l.sheet, isEn()) + (l.bySqm ? " · " + l.m2.toFixed(2) + " m²" : " ×" + l.qty), ils(l.cost), "nz-sub");
  });
  qRow(host, T("matCost"), ils(q.material), "nz-head-row");
  // the metres billed, i.e. including the feed allowance — the same figure the
  // banding labour line uses, so the two cannot look like different jobs
  if (q.band) qRow(host, T("bandCost") + " · " + q.bandBilledM.toFixed(1) + "m", ils(q.band));
  if (q.profile) qRow(host, T("profCost"), ils(q.profile));
  if (q.hardwareCost) {
    qRow(host, T("hwCost"), ils(q.hardwareCost), "nz-head-row");
    q.hardware.slice(0, 6).forEach(function (r) {
      qRow(host, r.label + " ×" + r.qty, ils(r.total), "nz-sub");
    });
  }
  qRow(host, T("labCost"), ils(q.laborCost), "nz-head-row");
  q.labor.forEach(function (r) {
    qRow(host, (isEn() ? r.en : r.he) + " · " + r.qty + " " + unitLabel(r.unit, isEn()), ils(r.cost), "nz-sub");
  });
  qRow(host, T("net"), ils(q.net), "nz-head-row");
  qRow(host, T("margin") + " " + Math.round(q.marginRate * 100) + "%", ils(q.margin));
  qRow(host, T("vat") + " " + Math.round(q.vatRate * 100) + "%", ils(q.vat));
  qRow(host, T("total"), ils(q.total), "nz-total");

  /* Board pro-rata against board actually bought. That is the one number the
     cut plan changes, so it is the one worth putting side by side — comparing
     the totals instead would fold in VAT and delivery, which the per-unit
     estimate has no notion of. */
  var diff = q.material - q.estimateMaterial;
  var cmp = el("div", "nz-cmp");
  cmp.innerHTML =
    "<div><span>" + T("proRata") + "</span><b>" + ils(q.estimateMaterial) + "</b></div>" +
    "<div><span>" + T("wholeSheets") + "</span><b>" + ils(q.material) + "</b></div>" +
    "<div><span>" + T("saving") + '</span><b class="' + (diff > 0 ? "nz-up" : "nz-down") + '">' +
    (diff > 0 ? "+" : "") + ils(diff) + "</b></div>";
  host.appendChild(cmp);
  host.appendChild(el("div", "nz-note", T("savingNote")));
  qRow(host, T("perUnit"), ils(q.estimate), "nz-sub");
}

function fillSuppliers() {
  var host = root.querySelector("#nzSup");
  host.innerHTML = "";
  if (!E.q) return;
  var plan = supplierPlan(E.q);
  plan.forEach(function (s) {
    var sup = SUPPLIERS[s.sup] || {},
      r = el("div", "nz-sup");
    r.innerHTML =
      "<div class=\"nz-sup-top\"><b>" + supLabel(s.sup, isEn()) + "</b><span>" + ils(s.cost) + "</span></div>" +
      '<div class="nz-sup-meta"><i class="ph ph-map-pin"></i>' + supCity(s.sup, isEn()) +
      ' <i class="ph ph-truck"></i>' + s.lead + " " + T("lead") +
      (sup.site ? ' <a href="https://' + sup.site + '" target="_blank" rel="noreferrer">' + sup.site + "</a>" : "") +
      "</div>" +
      '<div class="nz-sup-what">' +
      s.what
        .map(function (x) {
          return isEn() ? x.en : x.he;
        })
        .join(" · ") +
      "</div>";
    host.appendChild(r);
  });
  if (E.q.leadDays)
    qRow(host, T("leadTotal"), E.q.leadDays + " " + T("days"), "nz-total");
}

function fillWarnings() {
  root._cabinetShopSetup?.invalidate();
  root._cabinetProduction?.refresh();
  var manufacturing = root.querySelector("#nzManufacturing");
  if (manufacturing && E.q) {
    var report = cabinetManufacturingReport(E.q.items);
    manufacturing.replaceChildren();
    manufacturing.appendChild(el("strong", "", isEn() ? "Manufacturing review required" : "נדרשת בדיקת ייצור"));
    manufacturing.appendChild(el("p", "", isEn() ? "Exports are review drawings and data, not machine programs. Select and qualify the hardware, tooling and machine before production." : "הייצוא הוא שרטוט ונתונים לבדיקה, לא תוכנית מכונה. יש להתאים ולאמת פרזול, כלים ומכונה לפני ייצור."));
    manufacturing.appendChild(el("p", "", report.panelCount + (isEn() ? " panels · " : " לוחות · ") + report.operationCount + (isEn() ? " drilling operations" : " פעולות קידוח")));
    var details = document.createElement("details"), summary = document.createElement("summary");
    summary.textContent = isEn() ? "Review findings (" + report.issues.length + ")" : "ממצאי בדיקה (" + report.issues.length + ")";
    details.appendChild(summary);
    report.issues.forEach(function (issue) { details.appendChild(el("p", "", (issue.itemId ? issue.itemId + ": " : "") + issue.message)); });
    manufacturing.appendChild(details);
  }
  var sec = root.querySelector("#nzWarnSec"),
    host = root.querySelector("#nzWarn");
  host.innerHTML = "";
  var un = E.q ? E.q.nest.unplaced : [];
  var review = E.q && E.q.manufacturingReviewRequired;
  sec.style.display = un.length || review ? "" : "none";
  if (review) {
    var stockIssues = (E.q.productionIssues || []).filter(function (issue) { return issue.code === "missing-stock" || issue.code === "stock-thickness-mismatch"; });
    host.appendChild(el("div", "nz-warn", stockIssues.length
      ? isEn() ? "Partial estimate — " + stockIssues.length + " parts have no matching sheet stock and are excluded from the cut plan. Review the stock catalog or design before purchasing."
        : "אומדן חלקי — ל־" + stockIssues.length + " חלקים אין לוח תואם והם אינם נכללים בתוכנית הניסור. בדקו את קטלוג הלוחות או התכנון לפני רכש."
      : isEn() ? "Partial estimate — production findings require review before purchasing or cutting."
        : "אומדן חלקי — ממצאי הייצור דורשים בדיקה לפני רכש או ניסור."));
  }
  if (!un.length) return;
  host.appendChild(el("div", "nz-note", T("unplacedNote")));
  un.forEach(function (p) {
    var r = el("div", "nz-warn");
    r.textContent =
      (isEn() ? p.role : roleLabelHe(p.role)) + " " + mm(p.l) + "×" + mm(p.w) +
      " — " + p.item + " · " + sheetLabel(sheetById(p.sheetId), isEn());
    host.appendChild(r);
  });
}

/* ================= exports ================= */

function download(name, url) {
  var a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
function downloadText(name, text, mime) {
  var blob = new Blob(["﻿" + text], { type: (mime || "text/plain") + ";charset=utf-8;" }),
    url = URL.createObjectURL(blob);
  download(name, url);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function exportCSV() {
  if (!E.q) return;
  downloadText("cut-list.csv", cutCSV(E.q, isEn()), "text/csv");
}
function exportDrill() {
  if (!E.q) return;
  downloadText("drilling-review.csv", drillCSV(E.q.items, isEn()), "text/csv");
}
function exportDXF() {
  if (!E.q) return;
  downloadText("nesting-review.dxf", nestDXF(E.q), "application/dxf");
}

/* One file per supplier — a shop sends the boards to the board merchant and the
   banding to whoever stocks it, not "the job" to everybody. */
function exportPOs() {
  if (!E.q) return;
  var pos = purchaseOrders(E.q, isEn());
  if (!pos.length) return;
  pos.forEach(function (po, i) {
    // stagger them: a browser drops downloads fired in the same tick
    setTimeout(function () {
      downloadText("po-" + po.sup + ".csv", po.csv, "text/csv");
    }, i * 250);
  });
  flashInfo(pos.length + " " + T("poDone"));
}

/* The client-facing document, with the nesting drawings left out — a customer is
   quoted units, sizes, finishes and a date, not sheet yields. */
function exportQuoteDoc() {
  if (!E.q) return;
  var html = quoteHTML(E.q, {
    en: isEn(),
    date: new Date().toLocaleDateString(isEn() ? "en-GB" : "he-IL"),
    ref: "Q-" + String(Math.round(E.q.total)).slice(0, 6),
  });
  downloadText("quote.html", html, "text/html");
  flashInfo(T("quoteDone"));
}

function flashInfo(msg) {
  var el2 = root.querySelector("#nzFlash");
  if (!el2) return;
  el2.textContent = msg;
  el2.classList.add("on");
  clearTimeout(E.flashT);
  E.flashT = setTimeout(function () {
    el2.classList.remove("on");
  }, 2600);
}

/* The whole plan as one sheet of paper: a title block with the totals, then
   every sheet drawn to the same scale, laid out in rows. */
function exportPNG() {
  if (!E.q) return;
  var cvs = Array.prototype.slice.call(root.querySelectorAll(".nz-cv")).filter(function (c) {
    return c.width > 0;
  });
  if (!cvs.length) return;
  var pad = 24,
    head = 84,
    gap = 18,
    perRow = Math.min(4, cvs.length),
    cw = Math.max.apply(null, cvs.map(function (c) { return c.width; })),
    chh = Math.max.apply(null, cvs.map(function (c) { return c.height; })),
    rows = Math.ceil(cvs.length / perRow),
    out = document.createElement("canvas");
  out.width = pad * 2 + perRow * cw + (perRow - 1) * gap;
  out.height = pad * 2 + head + rows * chh + (rows - 1) * gap;
  var c = out.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  cvs.forEach(function (src, i) {
    var r = Math.floor(i / perRow),
      col = i % perRow;
    c.drawImage(src, pad + col * (cw + gap), pad + head + r * (chh + gap));
    c.fillStyle = "#5b636b";
    c.font = "600 13px Inter, Rubik, sans-serif";
    c.textAlign = "left";
    c.direction = "ltr";
    c.fillText("#" + (i + 1), pad + col * (cw + gap), pad + head - 6);
  });
  c.fillStyle = "#1b1f24";
  c.textBaseline = "middle";
  c.direction = isEn() ? "ltr" : "rtl";
  c.textAlign = isEn() ? "left" : "right";
  var x = isEn() ? pad : out.width - pad;
  c.font = "700 22px Inter, Rubik, sans-serif";
  c.fillText(T("title"), x, pad + 14);
  c.font = "500 14px Inter, Rubik, sans-serif";
  c.fillStyle = "#5b636b";
  c.fillText(
    E.q.items.length + " " + T("cabs") + "  ·  " + E.q.panelCount + " " + T("panels") +
      "  ·  " + E.q.nest.sheetCount + " " + T("sheets") +
      "  ·  " + T("yield") + " " + Math.round(E.q.yield * 100) + "%" +
      "  ·  " + T("total") + " " + ils(E.q.total),
    x, pad + 40,
  );
  c.font = "500 12px Inter, Rubik, sans-serif";
  c.fillText(
    E.q.sheets
      .map(function (l) {
        return sheetLabel(l.sheet, isEn()) + " ×" + l.qty;
      })
      .join("  ·  "),
    x, pad + 62,
  );
  c.strokeStyle = "#c9ced4";
  c.lineWidth = 1;
  c.strokeRect(pad * 0.5, pad * 0.5, out.width - pad, out.height - pad);
  download("cut-plan.png", out.toDataURL("image/png"));
}

/* ================= entry ================= */

onLangChange(function () {
  if (root && !E.open) destroyDOM();
});

window.addEventListener("themechange", function () {
  if (E.open) fillSheets();
});

// Opened from the cost panel (whole plan) and from the cabinet designer (one
// cabinet). Called with no argument it nests everything.
export function openNestForPlan() {
  openNest(null);
}
