// Shared cabinet-designer state, copy and tiny DOM helpers.
// Overlay chrome, the elevation and the inspector panes all import this.

import { clamp, fin } from "./state.js";
import { getLang } from "./i18n.js";

export const api = {};

/* ================= local i18n ================= */
export var TXT = {
  title: ["מעצב ארונות", "Cabinet designer"],
  presets: ["פריסטים", "Presets"],
  family: ["סוג ארון", "Cabinet type"],
  width: ["רוחב", "Width"],
  size: ["מידות", "Size"],
  cabinetSize: ["מידות ארון", "Cabinet size"],
  preview: ["תצוגה מקדימה", "Preview"],
  depth: ["עומק", "Depth"],
  height: ["גובה", "Height"],
  openDoors: ["פתיחת דלתות", "Open doors"],
  closed: ["סגור", "Closed"],
  doorsStage: ["דלתות", "Doors"],
  drawersStage: ["מגירות", "Drawers"],
  fullStage: ["מלא", "Fully open"],
  showDoors: ["הצג דלתות", "Show doors"],
  original: ["עיצוב מקורי", "Original design"],
  modified: ["שינויים בפעולה", "Session changed"],
  close: ["סיום", "Done"],
  /* ---- compact (phone / foldable) chrome — js/ui_cabinet_mobile.js ---- */
  mView: ["תצוגה", "View"],
  mTools: ["כלים", "Tools"],
  mDesign: ["עיצוב", "Design"],
  mProps: ["מאפיינים", "Properties"],
  mMore: ["עוד", "More"],
  mSheetView: ["בחירת תצוגה", "Choose view"],
  mSheetTools: ["כלי שרטוט", "Drawing tools"],
  mSheetMore: ["מידות ותפריט", "Size & menu"],
  mEndTool: ["ביטול", "Cancel"],
  mEdit: ["ערוך", "Edit"],
  mSplit: ["חלק", "Split"],
  mDel: ["מחק", "Delete"],
  mAxis: ["כיוון מבט", "Viewpoint"],
  mAxfl: ["קדמי־שמאל", "Front-left"],
  mAxfr: ["קדמי־ימין", "Front-right"],
  mAxbl: ["אחורי־שמאל", "Back-left"],
  mAxbr: ["אחורי־ימין", "Back-right"],
  mLevels: ["רמת עריכה", "Editing level"],
  mExtras: ["פעולות", "Actions"],
  cancelTip: ["יציאה ללא שמירה (Esc)", "Discard and close (Esc)"],
  revert: ["בטל שינויים", "Revert"],
  history: ["היסטוריה", "History"],
  opEdit: ["שינוי", "Edit"],
  opSize: ["מידות הארון", "Cabinet size"],
  opPreset: ["פריסט", "Preset"],
  opFamily: ["סוג ארון", "Cabinet type"],
  opDraw: ["שרטוט מחיצה", "Draw partition"],
  opErase: ["מחיקת מחיצה", "Erase partition"],
  opDrag: ["גרירת מחיצה", "Drag divider"],
  opLook: ["גימור", "Finish"],
  opHw: ["פרזול", "Hardware"],
  dropQ: [
    "לצאת בלי לשמור? כל השינויים בארון יבוטלו.",
    "Discard changes? The cabinet goes back to how it was.",
  ],
  column: ["עמודה", "Column"],
  section: ["תא", "Compartment"],
  carcass: ["גוף הארון", "Carcass"],
  hardware: ["פרזול", "Hardware"],
  summary: ["כתב כמויות", "Bill of materials"],
  panel: ["עובי דופן", "Board"],
  back: ["גב", "Back"],
  plinth: ["סוקל", "Plinth"],
  plinthType: ["סוג סוקל", "Plinth type"],
  gap: ["מרווח חזיתות", "Front reveal"],
  front: ["סגנון חזית", "Front style"],
  finFront: ["גוון חזיתות", "Front colour"],
  finCarcass: ["גוון גוף", "Carcass colour"],
  colKind: ["תפקיד העמודה", "Column role"],
  checks: ["בדיקות", "Checks"],
  checksOk: ["הכל תקין — אין הערות", "All good — nothing to flag"],
  undo: ["בטל", "Undo"],
  redo: ["בצע שוב", "Redo"],
  noUndo: ["אין שינויים לביטול", "No changes to undo"],
  noRedo: ["אין שינויים לביצוע מחדש", "No changes to redo"],
  copyCol: ["העתק עמודה", "Copy column"],
  pasteCol: ["הדבק עמודה", "Paste column"],
  copySec: ["העתק תא", "Copy compartment"],
  myPresets: ["הפריסטים שלי", "My presets"],
  savePreset: ["שמור עיצוב נוכחי", "Save this design"],
  presetName: ["שם הפריסט", "Preset name"],
  delPreset: ["מחק", "Delete"],
  pngExport: ["ייצוא חזית PNG", "Export elevation PNG"],
  elev: ["גובה תלייה מהרצפה", "Mounting height"],
  door: ["דלת", "Door"],
  leaves: ["כנפיים", "Leaves"],
  hinge: ["צד ציר", "Hinge side"],
  hingeL: ["שמאל", "Left"],
  hingeR: ["ימין", "Right"],
  secH: ["גובה תא", "Clear height"],
  colW: ["רוחב עמודה", "Column width"],
  count: ["כמות", "Count"],
  spacing: ["מרווח מדפים", "Shelf spacing"],
  auto: ["אוטומטי", "Auto"],
  splitCol: ["פצל עמודה", "Split column"],
  delCol: ["מחק עמודה", "Delete column"],
  dupCol: ["שכפל עמודה", "Duplicate column"],
  splitSec: ["פצל תא", "Split compartment"],
  delSec: ["מחק תא", "Delete compartment"],
  fillCol: ["חלוקה מומלצת", "Suggested layout"],
  fillHang: ["תלייה", "Hanging"],
  fillMix: ["מדפים + מגירות", "Shelves + drawers"],
  fillShelf: ["מדפים", "Shelves"],
  fillDraw: ["מגירות", "Drawers"],
  handle: ["ידית", "Handle"],
  finish: ["גימור פרזול", "Hardware finish"],
  hingeHw: ["צירים", "Hinges"],
  slide: ["מסילות", "Runners"],
  rail: ["מוט תלייה", "Hanging rail"],
  led: ["תאורת LED", "LED lighting"],
  mirrorIn: ["מראה פנימית", "Interior mirror"],
  lock: ["מנעול", "Lock"],
  boards: ["לוחות", "Boards"],
  hwList: ["פרזול ואביזרים", "Hardware & fittings"],
  total: ["הערכת עלות", "Estimated cost"],
  qty: ["כמות", "Qty"],
  csv: ["ייצוא כתב כמויות", "Export BOM"],
  cutPlan: ["תוכנית ניסור ותמחור", "Cut plan & quote"],
  stock: ["חומר גלם", "Sheet material"],
  stCarcass: ["גוף ומדפים", "Carcass"],
  stFront: ["חזיתות", "Fronts"],
  stBack: ["גב", "Back"],
  stTop: ["משטח", "Worktop"],
  stBand: ["קנט", "Banding"],
  stProfile: ["עיבוד קנט משטח", "Worktop edge"],
  carcassMode: ["סוג גוף", "Carcass type"],
  bandTotal: ["קנטים", "Edge banding"],
  hint: [
    "לחצו על תא לעריכה · גררו מחיצה · V/H/X לכלי מחיצה · לחיצה כפולה = מידה מדויקת",
    "Click a compartment to edit · drag a divider · V/H/X for partition tools · double-click for an exact size",
  ],
  nothing: ["בחרו תא או עמודה בחזית", "Select a compartment or a column"],
  blank: ["ארון ריק — התחלה מאפס", "Blank — start from scratch"],
  blankNote: [
    "גוף בלבד בלי חלוקה. שרטטו מחיצות כמו קירות ותנו לכל אזור תוכן",
    "Just the carcass. Draw partitions like walls and fill each zone",
  ],
  toolSel: ["בחירה", "Select"],
  toolV: ["מחיצה אנכית", "Vertical partition"],
  toolH: ["מחיצה אופקית", "Horizontal partition"],
  toolErase: ["מחיקת מחיצה", "Remove partition"],
  hintV: [
    "לחצו במקום שבו תעבור המחיצה האנכית · Esc או V ליציאה",
    "Click where the vertical partition goes · Esc or V to exit",
  ],
  hintH: [
    "לחצו בגובה המחיצה · Shift = מחיצה לרוחב כל הארון · Esc ליציאה",
    "Click at the shelf height · Shift = across every column · Esc to exit",
  ],
  hintErase: ["לחצו על מחיצה כדי למחוק אותה · Esc ליציאה", "Click a partition to remove it · Esc to exit"],
  tooSmall: ["האזור קטן מדי", "That zone would be too small"],
  snap_mid: ["· אמצע", "· centre"],
  snap_eq: ["· שווה לשכנה", "· matches neighbour"],
  snap_align: ["· בקו אחד", "· aligned"],
  snap_round: ["· מידה עגולה", "· round"],
  partial: ["נוספה ב-$1 מתוך $2 עמודות", "Added in $1 of $2 columns"],
  newCab: ["ארון חדש מאפס", "New cabinet from scratch"],
  searchPh: ["חיפוש סוג, פריסט, תא, פרזול…", "Search a type, preset, compartment…"],
  clear: ["נקה", "Clear"],
  noHits: ["אין תוצאות", "Nothing matches"],
  moreOpts: ["עוד אפשרויות ($1)", "More options ($1)"],
  lessOpts: ["הצג פחות", "Show less"],
  jumpTo: ["מעבר אל", "Go to"],
  g_design: ["עיצוב", "Design"],
  g_mine: ["הפריסטים שלי", "My presets"],
  g_edit: ["עריכה", "Edit"],
  g_review: ["בקרה וייצוא", "Review & export"],
  loadPreset: ["טעינת עיצוב שמור", "Load a saved design"],
  inspTab: ["התא / העמודה הנבחרים", "The selected compartment or column"],
  snapOn: ["עיגול מידות", "Snap sizes"],
  snapOff: ["מידה חופשית", "Free sizes"],
  snapTip: [
    "כבוי = המחיצה נוחתת בדיוק במקום הסמן, בלי עיגול לס\"מ שלם ובלי הצמדות",
    "Off = the partition lands exactly where the pointer is — no rounding, no snapping",
  ],
  hidOn: ["קווים נסתרים", "Hidden lines"],
  hidOff: ["רק הנראה", "Visible only"],
  hidTip: [
    "מקווקו = קצה שממשיך מאחורי חלק אחר. כבוי = רואים רק את מה שגלוי מנקודת המבט",
    "Dashed = an edge continuing behind another part. Off = only what the eye can see from here",
  ],
  view2d: ["דו מימד", "2D"],
  view3d: ["תלת מימד", "3D"],
  vFront: ["חזית", "Front"],
  vBack: ["אחור", "Back"],
  vLeft: ["שמאל", "Left"],
  vRight: ["ימין", "Right"],
  vTop: ["מבט על", "Top"],
  vBottom: ["מלמטה", "Bottom"],
  v45: ["45°", "45°"],
  hint3d: [
    "גררו לסיבוב · גלגלת לזום · 2 לדו מימד",
    "Drag to orbit · wheel to zoom · press 2 for 2D",
  ],
  /* Touch wording for the compact layout: the desktop hints name a wheel, a
     Shift key and a keyboard shortcut, none of which a phone has. */
  hint3dT: [
    "גררו לסיבוב · צביטה לזום",
    "Drag to orbit · pinch to zoom",
  ],
  hintT: [
    "הקישו על תא לעריכה · גררו מחיצה · הקשה כפולה = מידה מדויקת",
    "Tap a compartment · drag a divider · double-tap for an exact size",
  ],
  hintHT: [
    "הקישו בגובה המדף",
    "Tap at the shelf height",
  ],
  hintRO: [
    "מבט לצפייה בלבד — העריכה מתבצעת במבט החזית",
    "A view only — editing happens in the front view",
  ],
  fitNote: [
    "אפשרות מחוקה לא נכנסת במידות האלה, ומעומעמת פשוט לא מקובלת בארון כזה — ריחוף עם העכבר מראה למה.",
    "A struck-through option does not fit these dimensions; a dimmed one simply is not usual in this kind of unit — hover to see why.",
  ],
  unusualFor: ["לא מקובל ב", "unusual in a"],
  applyFam: ["החלפת סוג מעדכנת עומק וגובה למקובל", "Changing the type sets the usual depth & height"],
  levelCompose: ["1 · הרכב", "1 · Compose"],
  levelTechnical: ["2 · טכני", "2 · Technical"],
  levelAdvanced: ["3 · עורך מודל", "3 · Model editor"],
  levelsAria: ["רמת עריכת ארון", "Cabinet editing level"],
  historyAria: ["היסטוריה", "History"],
  technicalTitle: ["פרמטרים טכניים וייצור", "Technical & manufacturing parameters"],
  shelfBoard: ["עובי מדף", "Shelf board"],
  plinthRecessed: ["שקוע (סטנדרט)", "Recessed"],
  plinthFlush: ["בקו החזית", "Flush"],
  plinthLegs: ["רגליות", "Legs"],
  plinthNone: ["ללא", "None"],
  sizeProposal: ["נדרשת חלוקה חדשה", "Configuration required"],
  keepSize: ["השאירו את המידה הנוכחית", "Keep current size"],
  techHint: [
    "עובי לוחות, סוקל ומרווח חזיתות נמצאים ברמה הטכנית.",
    "Board thicknesses, plinth and front reveal live on the Technical level.",
  ],
  sizeRejected: ["לא ניתן לשנות למידה הזו", "That dimension cannot be changed"],
};
export function T(k) {
  var e = TXT[k] || ["", ""];
  return getLang() === "en" ? e[1] : e[0];
}
export function isEn() {
  return getLang() === "en";
}


export var E = {
  host: null,
  swapView: null,
  histPanel: null,
  open: false,
  it: null,
  base: null,
  sel: null,
  showDoors: true,
  cv: null,
  cx: null,
  view: null,
  drag: null,
  tool: null,
  ghost: null,
  snap: true,
  mode: "2d",
  axis: "front",
  hid: true,
  level: "composition",
  pv: null,
};

export function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export function btn(label, cb, cls) {
  var b = el("button", cls || "", label);
  b.addEventListener("click", cb);
  return b;
}
export function sp() {
  return E.it ? E.it.cab : null;
}

/* ================= the icon bars =================
   Each panel is a few groups of big icons — never more than four to a row —
   over one content area that shows whichever icon is pressed. A `tab` icon
   swaps the content, an `act` icon just does something; both explain
   themselves with a persistent caption; the tooltip remains useful for the
   compact/narrow layout and for keyboard focus. */
export function ico(kind, key, icon, tip, extra) {
  return (
    '<button data-' + kind + '="' + key + '" data-tip="' + T(tip) + '" aria-label="' + T(tip) + '">' +
    '<i class="ph ' + icon + '"></i><span class="cb-icon-label">' + T(tip) + '</span>' + (extra || "") + "</button>"
  );
}
export function grp(title, icons, cls, extra) {
  return (
    '<div class="cb-grp">' +
    "<h5>" + T("g_" + title) + (extra || "") + "</h5>" +
    '<div class="cb-icons ' + (cls || "") + '">' + icons.join("") + "</div></div>"
  );
}

/* ================= DOM ================= */
/* The overlay's chrome is built once, with the labels of the language that was
   current then; a language switch throws it away so the next open rebuilds it
   in the new language. */

export function formatCm(v) {
  return String(Math.round(Number(v) * 10) / 10);
}

export function row(label, node) {
  var r = el("label", "cb-row", "<span>" + label + "</span>");
  r.appendChild(node);
  return r;
}
export function numInput(val, cb, min, max) {
  var i = el("input");
  i.type = "number";
  i.inputMode = "decimal";
  i.step = "0.1";
  if (min != null) i.min = min;
  if (max != null) i.max = max;
  i.value = formatCm(val);
  i.addEventListener("change", function () {
    var v = +this.value;
    if (!fin(v)) return;
    cb(clamp(v, min == null ? 0 : min, max == null ? 1e5 : max));
  });
  return i;
}
/* `opts` entries are [value, label] or [value, label, fit] where `fit` is a
   `{ok, why}` from cabinet.js's fit table. An option that does not fit is
   disabled and carries the reason as its label and tooltip, so the answer to
   "why can't I pick a sliding door here" is in the list itself rather than
   discovered by picking it and getting nothing. The current value is never
   disabled — you have to be able to see what a design already says. */
export function select(opts, cur, cb) {
  var s = el("select");
  opts.forEach(function (o) {
    var op = el("option"),
      fit = o[2],
      bad = fit && !fit.ok && String(o[0]) !== String(cur);
    op.value = o[0];
    op.textContent = bad ? o[1] + " — " + fit.why : o[1];
    if (bad) op.disabled = true;
    if (fit && !fit.ok) op.title = fit.why;
    s.appendChild(op);
  });
  s.value = cur;
  s.addEventListener("change", function () {
    cb(this.value);
  });
  return s;
}
export function checkbox(label, cur, cb) {
  var l = el("label", "cb-cb"),
    i = el("input");
  i.type = "checkbox";
  i.checked = !!cur;
  i.addEventListener("change", function () {
    cb(this.checked);
  });
  l.appendChild(i);
  l.appendChild(el("span", "", label));
  return l;
}

export var AXES = {
  front: { az: 0, el: 0, hDim: "w", vDim: "h" },
  back: { az: Math.PI, el: 0, hDim: "w", vDim: "h" },
  right: { az: Math.PI / 2, el: 0, hDim: "d", vDim: "h" },
  left: { az: -Math.PI / 2, el: 0, hDim: "d", vDim: "h" },
  top: { az: 0, el: Math.PI / 2, hDim: "w", vDim: "d" },
  bottom: { az: 0, el: -Math.PI / 2, hDim: "w", vDim: "d" },
  fl: { az: -Math.PI / 4, el: 0 },
  fr: { az: Math.PI / 4, el: 0 },
  bl: { az: (-3 * Math.PI) / 4, el: 0 },
  br: { az: (3 * Math.PI) / 4, el: 0 },
};

