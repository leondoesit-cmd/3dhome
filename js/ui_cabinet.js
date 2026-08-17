// Cabinet designer — the overlay that drives the modular cabinet system in
// cabinet.js. Left: presets that regenerate for the current size. Middle: a
// front elevation you edit directly (click a compartment, drag a divider).
// Right: a live 3D preview, the inspector for whatever is selected, the
// hardware (פרזול) choices and the running cut list / price.
//
// Edits are applied straight to the item — the plan, the 3D view and the cost
// panel stay in sync — with one history snapshot taken when the overlay opens
// and a revert button that restores it.

import { S, clamp, fin } from "./state.js";
import { buildItem, clearVSpanCache } from "./furniture.js";
import { getLang, onLangChange } from "./i18n.js";
import { render2D } from "./plan2d.js";
import { pushHistory } from "./history.js";
import { createHistory } from "./edit_history.js";
import { createHistoryPanel } from "./ui_history.js";
import { createEditorView, createViewportSwap } from "./editor_view.js";
import { updateCost } from "./ui_tree.js";
import {
  STD, FAM, SEC, DOORS, HW, PRESETS, makeSpec,
  normalizeSpec, specOf, famOf, defaultPreset, makeBlankSpec, layoutCab, columnFill, cutList,
  hardwareList, cabPrice, secLabel, doorLabel, famLabel, presetLabel,
  presetNote, hwLabel, cabSummary, famShort, FRONTS, FINISH, COLKIND, CARCASS,
  frontLabel, finishLabel, kindLabel, carcassLabel, checkCab, presetById,
  bandMeters, roleLabelHe,
  secFit, doorFit, kindFit, carcassFit, frontFit, fitCtx, secRelevant, doorRelevant,
} from "./cabinet.js";
import { ceilingHeight } from "./elevation.js";
import { openNest, isNestOpen } from "./ui_nest.js";
import {
  BANDING, PROFILES, sheetsFor, sheetById, sheetPrice, bandById, bandPPM,
  profilePPM, sheetLabel, bandLabel, profileLabel,
} from "./stock.js";
import { syncCabinetDefinition } from "./parametric_cabinet.js";

/* ================= local i18n ================= */
var TXT = {
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
    "לחצו על תא לעריכה · גררו מחיצה כדי לשנות מידה · לחיצה כפולה = הזנת מידה מדויקת",
    "Click a compartment to edit · drag a divider to resize · double-click to type an exact size",
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
    "לחצו במקום שבו תעבור המחיצה האנכית · Esc ליציאה",
    "Click where the vertical partition goes · Esc to exit",
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
  technicalTitle: ["פרמטרים טכניים וייצור", "Technical & manufacturing parameters"],
};
function T(k) {
  var e = TXT[k] || ["", ""];
  return getLang() === "en" ? e[1] : e[0];
}
function isEn() {
  return getLang() === "en";
}

/* ================= state ================= */
var root = null,
  swapView = null,
  E = {
    open: false,
    it: null,
    base: null, // spec + dims as of the last open, for revert / cancel
    sel: null, // {col:i} | {col:i, sec:j}
    showDoors: true,
    cv: null,
    cx: null,
    view: null, // canvas→model transform
    drag: null,
    tool: null, // null | "vwall" | "hwall" | "erase" — the partition-drawing tools
    ghost: null, // where the partition about to be drawn would land
    snap: true, // round + snap drawn partitions, or land exactly on the pointer
    mode: "2d", // "2d" (the drawing) | "3d" (the orbiting model), keys 2 / 3
    axis: "front", // which direction the 2D drawing looks from
    hid: true, // draw what is hidden behind other parts as dashed lines
    level: "composition",

    pv: null,
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
function sp() {
  return E.it ? E.it.cab : null;
}

/* ================= the icon bars =================
   Each panel is a few groups of big icons — never more than four to a row —
   over one content area that shows whichever icon is pressed. A `tab` icon
   swaps the content, an `act` icon just does something; both explain
   themselves with a persistent caption; the tooltip remains useful for the
   compact/narrow layout and for keyboard focus. */
function ico(kind, key, icon, tip, extra) {
  return (
    '<button data-' + kind + '="' + key + '" data-tip="' + T(tip) + '" aria-label="' + T(tip) + '">' +
    '<i class="ph ' + icon + '"></i><span class="cb-icon-label">' + T(tip) + '</span>' + (extra || "") + "</button>"
  );
}
function grp(title, icons, cls, extra) {
  return (
    '<div class="cb-grp">' +
    "<h5>" + T("g_" + title) + (extra || "") + "</h5>" +
    '<div class="cb-icons ' + (cls || "") + '">' + icons.join("") + "</div></div>"
  );
}

/* ================= DOM ================= */
/* The overlay's chrome is built once, with the labels of the language that was
   current then; a language switch throws it away so the next open rebuilds it
   (the elevation and the panels re-label themselves on every draw anyway). */
function destroyDOM() {
  if (E.pv && E.pv.rr) E.pv.rr.dispose();
  E.pv = null;
  swapView = null; // it closes over elements that are about to be removed
  E.cv = null;
  E.cx = null;
  if (root) root.remove();
  root = null;
}

function buildDOM() {
  E.lang = getLang();
  root = el("div", "", "");
  root.id = "cabdes";
  root.innerHTML =
    '<div class="cb-head">' +
    '<div class="cb-head-main">' +
    '<div class="cb-logo"><i class="ph ph-lockers"></i> <b>' + T("title") + "</b>" +
    '<span class="cb-sub" id="cbSub"></span><span class="cb-session" id="cbSession" role="status" aria-live="polite"></span></div>' +
    '<div class="cb-levels" role="tablist" aria-label="Cabinet editing level">' +
    '<button type="button" data-level="composition" class="on"><i class="ph ph-layout"></i> ' + T("levelCompose") + '</button>' +
    '<button type="button" data-level="technical"><i class="ph ph-sliders-horizontal"></i> ' + T("levelTechnical") + '</button>' +
    '<button type="button" data-level="advanced"><i class="ph ph-cube-focus"></i> ' + T("levelAdvanced") + '</button>' +
    '</div>' +
    '<div class="cb-actions">' +
    '<div class="cb-history-actions" aria-label="History">' +
    '<button id="cbUndo" title="Ctrl+Z" aria-label="' + T("undo") + '"><i class="ph ph-arrow-u-up-left"></i></button>' +
    '<button id="cbRedo" title="Ctrl+Y" aria-label="' + T("redo") + '"><i class="ph ph-arrow-u-up-right"></i></button></div>' +
    '<button id="cbRevert" title="' + T("cancelTip") + '"><i class="ph ph-arrow-counter-clockwise"></i> ' + T("revert") + "</button>" +
    '<button id="cbClose" class="btn-accent"><i class="ph ph-check"></i> ' + T("close") + "</button>" +
    "</div></div>" +
    '<div class="cb-context-bar">' +
    '<div class="cb-control-group cb-size-group"><span class="cb-group-title">' + T("cabinetSize") + '</span>' +
    '<div class="cb-dims">' +
    '<label><span>' + T("width") + '</span><span class="cb-number"><input id="cbW" type="number" inputmode="decimal"><em>cm</em></span></label>' +
    '<label><span>' + T("depth") + '</span><span class="cb-number"><input id="cbD" type="number" inputmode="decimal"><em>cm</em></span></label>' +
    '<label><span>' + T("height") + '</span><span class="cb-number"><input id="cbH" type="number" inputmode="decimal"><em>cm</em></span></label>' +
    '</div></div>' +
    '<div class="cb-context-sep"></div>' +
    '<div class="cb-control-group cb-preview-group"><span class="cb-group-title">' + T("preview") + '</span><div class="cb-preview-controls">' +
    '<div class="cb-slider-wrap">' +
    '<div class="cb-slider-hdr"><span id="cbOpenLabel">🔒 ' + T("closed") + '</span><span id="cbOpenVal">0%</span></div>' +
    '<input id="cbOpen" type="range" min="0" max="100" value="0" list="cbOpenStages" aria-label="' + T("openDoors") + '">' +
    '<datalist id="cbOpenStages"><option value="0"><option value="40"><option value="80"><option value="100"></datalist>' +
    '<div class="cb-stage-chips">' +
    '<button type="button" class="cb-chip-stage" data-v="0" title="' + T("closed") + '" aria-label="' + T("closed") + '">🔒 0%</button>' +
    '<button type="button" class="cb-chip-stage" data-v="40" title="' + T("openDoors") + '" aria-label="' + T("openDoors") + '">🚪 ' + T("doorsStage") + '</button>' +
    '<button type="button" class="cb-chip-stage" data-v="80" title="' + T("drawersStage") + '" aria-label="' + T("drawersStage") + '">🗄️ ' + T("drawersStage") + '</button>' +
    '<button type="button" class="cb-chip-stage" data-v="100" title="' + T("fullStage") + '" aria-label="' + T("fullStage") + '">🔓 ' + T("fullStage") + '</button>' +
    '</div></div>' +
    '<label class="cb-cb"><input id="cbShowDoors" type="checkbox" checked><span><i class="ph ph-door-open"></i> ' + T("showDoors") + "</span></label>" +
    "</div></div></div></div>" +
    '<div class="cb-body">' +
    '<div class="cb-panel cb-left">' +
    '<div class="cb-search"><i class="ph ph-magnifying-glass"></i>' +
    '<input id="cbSearch" type="text" autocomplete="off" placeholder="' + T("searchPh") + '">' +
    '<button id="cbSearchX" title="' + T("clear") + '"><i class="ph ph-x"></i></button></div>' +
    /* Everything the panel can show is an icon in a group, four to a row, and
       the group below shows whichever one is pressed. Hovering any of them
       says what it is — nothing here relies on a caption. */
    grp("design", [
      ico("tab", "fams", "ph-squares-four", "family"),
      ico("tab", "presets", "ph-cards-three", "presets"),
      ico("act", "blank", "ph-selection-plus", "blank"),
    ]) +
    grp("mine", [
      ico("act", "save", "ph-floppy-disk", "savePreset"),
      ico("tab", "mine", "ph-folder-open", "loadPreset"),
    ], "cb-pair") +
    '<div class="cb-tabs cb-fill" data-side="L">' +
    '<div class="cb-pane" data-pane="fams"><h4 id="cbFamsTitle">' + T("family") + '</h4>' +
    '<div id="cbFams" class="cb-chips"></div><div class="cb-note">' + T("applyFam") + "</div></div>" +
    '<div class="cb-pane" data-pane="presets"><div id="cbActs" class="cb-hits"></div>' +
    '<div id="cbPresets" class="cb-presets"></div>' +
    '<div id="cbNoHits" class="cb-note" style="display:none">' + T("noHits") + "</div></div>" +
    '<div class="cb-pane" data-pane="mine"><div id="cbMine" class="cb-presets"></div></div>' +
    "</div></div>" +
    '<div class="cb-mid">' +
    '<div class="cb-tools" id="cbTools">' +
    '<button data-tool="" class="on"><i class="ph ph-cursor"></i> ' + T("toolSel") + "</button>" +
    '<button data-tool="vwall"><i class="ph ph-columns-plus-right"></i> ' + T("toolV") + "</button>" +
    '<button data-tool="hwall"><i class="ph ph-rows-plus-bottom"></i> ' + T("toolH") + "</button>" +
    '<button data-tool="erase"><i class="ph ph-eraser"></i> ' + T("toolErase") + "</button>" +
    "</div>" +
    '<div class="cb-views" id="cbViews">' +
    '<div class="cb-vgroup">' +
    '<button data-mode="2d" class="on">2D</button><button data-mode="3d">3D</button>' +
    "</div>" +
    '<div class="cb-vgroup cb-vaxes" id="cbAxes">' +
    '<button data-ax="front" class="on"><i class="ph ph-square"></i>' + T("vFront") + "</button>" +
    '<button data-ax="back"><i class="ph ph-square-half"></i>' + T("vBack") + "</button>" +
    '<button data-ax="left"><i class="ph ph-arrow-line-left"></i>' + T("vLeft") + "</button>" +
    '<button data-ax="right"><i class="ph ph-arrow-line-right"></i>' + T("vRight") + "</button>" +
    '<button data-ax="top"><i class="ph ph-arrow-line-up"></i>' + T("vTop") + "</button>" +
    '<button data-ax="bottom"><i class="ph ph-arrow-line-down"></i>' + T("vBottom") + "</button>" +
    '<div class="cb-v45">' +
    '<button data-ax="fl" title="45°">◤</button><button data-ax="fr" title="45°">◥</button>' +
    '<button data-ax="bl" title="45°">◣</button><button data-ax="br" title="45°">◢</button>' +
    "</div></div>" +
    // a preference rather than a tool, so it sits apart from the four of them
    '<div class="cb-vgroup cb-vdraw"><button id="cbSnap" class="on" title="' + T("snapTip") +
    '"><i class="ph ph-magnet"></i> <span>' + T("snapOn") + "</span></button>" +
    // likewise a preference, and one that only the projected views answer to
    '<button id="cbHid" class="on" title="' + T("hidTip") +
    '"><i class="ph ph-square-split-horizontal"></i> <span>' + T("hidOn") + "</span></button></div>" +
    "</div>" +
    '<canvas id="cbCanvas"></canvas><div id="cb3dHost" class="cb-3dhost"></div>' +
    '<div class="cb-hint">' + T("hint") + "</div></div>" +
    '<div class="cb-panel cb-right">' +
    '<div class="cb-sec cb-prev-wrap"><canvas id="cbPrev"></canvas></div>' +
    grp("edit", [
      ico("tab", "insp", "ph-cursor-click", "inspTab"),
      ico("tab", "look", "ph-paint-brush", "front"),
      ico("tab", "hw", "ph-nut", "hardware"),
      ico("tab", "hist", "ph-clock-counter-clockwise", "history"),
    ]) +
    grp("review", [
      ico("tab", "checks", "ph-seal-check", "checks", '<span id="cbChkBadge" class="cb-badge"></span>'),
      ico("tab", "bom", "ph-list-numbers", "summary"),
      ico("act", "nest", "ph-scissors", "cutPlan"),
      ico("act", "png", "ph-image", "pngExport"),
    ], "", '<span id="cbBomBadge" class="cb-hprice"></span>') +
    '<div class="cb-tabs cb-fill" data-side="R">' +
    '<div class="cb-pane" data-pane="insp"><h4 id="cbInspTitle">' + T("section") + '</h4><div id="cbInsp"></div></div>' +
    '<div class="cb-pane" data-pane="technical"><h4>' + T("technicalTitle") + '</h4><div id="cbTechnical"></div></div>' +
    '<div class="cb-pane" data-pane="look"><div id="cbLook"></div></div>' +
    '<div class="cb-pane" data-pane="hw"><div id="cbHw"></div></div>' +
    '<div class="cb-pane" data-pane="hist"><div id="cbHist"></div></div>' +
    '<div class="cb-pane" data-pane="checks"><div id="cbChecks"></div></div>' +
    '<div class="cb-pane" data-pane="bom"><div id="cbBom"></div>' +
    '<button id="cbCsv" class="cb-wide"><i class="ph ph-file-csv"></i> ' + T("csv") + "</button></div>" +
    "</div></div>";
  document.body.appendChild(root);

  root.querySelector("#cbClose").addEventListener("click", closeCabinet);
  root.querySelector("#cbRevert").addEventListener("click", revert);
  // the cut plan and the PNG hang off the review icons now (see wireTabs);
  // only the CSV still sits inside the bill itself, next to the table it dumps
  root.querySelector("#cbCsv").addEventListener("click", exportBOM);
  root.querySelector("#cbUndo").addEventListener("click", undo);
  root.querySelector("#cbRedo").addEventListener("click", redo);
  root.querySelectorAll(".cb-levels [data-level]").forEach(function (button) {
    button.addEventListener("click", function () {
      var level = button.getAttribute("data-level");
      if (level === "advanced") {
        var item = E.it;
        syncCabinetDefinition(S, item, { propagate:true });
        closeCabinet();
        import("./modeler.js").then(function (modeler) { modeler.openModelerForItem(item); });
        return;
      }
      E.level = level;
      root.classList.toggle("cb-level-technical", level === "technical");
      root.querySelectorAll(".cb-levels [data-level]").forEach(function (candidate) {
        candidate.classList.toggle("on", candidate.getAttribute("data-level") === level);
      });
      if (level === "technical") { fillTechnical(); setTab("technical", false); }
      else setTab("insp", false);
    });
  });
  histPanel = createHistoryPanel(H, {
    title: T("history"),
    showBaseline: true,
    scope: specScope,
    onPick: specPick,
  });
  root.querySelector("#cbHist").appendChild(histPanel.el);
  ["W", "D", "H"].forEach(function (k) {
    var dim = root.querySelector("#cb" + k);
    dim.min = 20;
    dim.step = 0.1;
    dim.title = T(k === "W" ? "width" : k === "D" ? "depth" : "height") + " (cm)";
    dim.addEventListener("change", function () {
      var v = Math.max(20, +this.value || 0);
      act(T("opSize") + " · " + k + " → " + Math.round(v));
      E.it[k.toLowerCase()] = v;
      this.value = Math.round(v);
      changed(true);
    });
    dim.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.blur();
      }
    });
  });
  root.querySelector("#cbOpen").addEventListener("input", function () {
    var val = +this.value / 100;
    E.it.runtimeState = E.it.runtimeState || {};
    E.it.runtimeState.cabinetOpen = val;
    sp().open = val;
    syncOpenUI(val);
    runtimeChanged();
  });
  root.querySelectorAll(".cb-chip-stage").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = +this.getAttribute("data-v") / 100;
      E.it.runtimeState = E.it.runtimeState || {};
      E.it.runtimeState.cabinetOpen = val;
      sp().open = val;
      syncOpenUI(val);
      runtimeChanged();
    });
  });
  root.querySelector("#cbShowDoors").addEventListener("change", function () {
    E.showDoors = this.checked;
    draw();
  });

  root.querySelectorAll("#cbTools button[data-tool]").forEach(function (b) {
    b.addEventListener("click", function () {
      setTool(b.getAttribute("data-tool") || null);
    });
  });
  wireTabs();
  var sIn = root.querySelector("#cbSearch");
  sIn.addEventListener("input", function () {
    E.q = this.value.trim().toLowerCase();
    applySearch();
  });
  sIn.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && this.value) {
      e.stopPropagation(); // the first Escape clears the search, not the overlay
      this.value = "";
      E.q = "";
      applySearch();
    }
  });
  root.querySelector("#cbSearchX").addEventListener("click", function () {
    sIn.value = "";
    E.q = "";
    applySearch();
    sIn.focus();
  });

  root.querySelector("#cbSnap").addEventListener("click", function () {
    // the size discipline is a preference, not a mode: it stays where it was
    // put and applies to whichever tool is in hand
    E.snap = !E.snap;
    this.classList.toggle("on", E.snap);
    this.setAttribute("aria-pressed", E.snap ? "true" : "false");
    this.querySelector("span").textContent = T(E.snap ? "snapOn" : "snapOff");
    E.ghost = null;
    draw();
  });
  root.querySelector("#cbHid").addEventListener("click", function () {
    /* Off is not just "stop dashing": a part that is wholly behind another is
       dropped from the drawing altogether, so what is left is exactly what the
       eye would see standing at this angle. */
    E.hid = !E.hid;
    this.classList.toggle("on", E.hid);
    this.setAttribute("aria-pressed", E.hid ? "true" : "false");
    this.querySelector("span").textContent = T(E.hid ? "hidOn" : "hidOff");
    draw();
  });
  root.querySelectorAll("#cbViews button[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      setMode(b.getAttribute("data-mode"));
    });
  });
  root.querySelectorAll("#cbViews button[data-ax]").forEach(function (b) {
    b.addEventListener("click", function () {
      setAxis(b.getAttribute("data-ax"));
    });
  });

  E.cv = root.querySelector("#cbCanvas");
  E.cx = E.cv.getContext("2d");
  wireCanvas();
  initPreview();
  window.addEventListener("resize", function () {
    if (E.open) {
      sizeCanvas();
      draw();
      renderPreview();
    }
  });
  /* The cut plan opens on top of the designer and edits the same spec: when it
     closes, whatever it changed (material, board thickness) has to show up
     here. */
  window.addEventListener("cabStockChanged", function () {
    if (E.open) changed(true);
  });
  document.addEventListener("keydown", function (e) {
    // the cut plan sits on top of us and has its own Escape
    if (!E.open || isNestOpen()) return;
    var typing = /input|textarea|select/i.test((document.activeElement || {}).tagName || "");
    // a drawing tool owns Escape first — it exits the tool, not the designer
    if (e.key === "Escape" && E.tool) return setTool(null);
    if (e.key === "Escape") return cancelCabinet();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return redo();
    }
    if (typing) return;
    if (e.key === "/") {
      e.preventDefault();
      return root.querySelector("#cbSearch").focus();
    }
    if (e.key === "2") return setMode("2d");
    if (e.key === "3") return setMode("3d");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") return copyColumn();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return pasteColumn();
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (!E.sel) return;
      if (E.sel.sec != null) delSection();
      else delColumn();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // walk the columns; in a mirrored (RTL) reading the arrows still follow
      // the drawing, which is always left-to-right
      var d = e.key === "ArrowRight" ? 1 : -1;
      E.sel = { col: clamp((E.sel.col || 0) + d, 0, sp().cols.length - 1), sec: 0 };
      draw();
      fillInspector();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      var c = sp().cols[E.sel.col];
      if (!c) return;
      var j = (E.sel.sec == null ? 0 : E.sel.sec) + (e.key === "ArrowUp" ? 1 : -1);
      E.sel = { col: E.sel.col, sec: clamp(j, 0, c.secs.length - 1) };
      draw();
      fillInspector();
    }
  });
}

function syncOpenUI(rawVal) {
  if (!root) return;
  var v = Math.round((rawVal || 0) * 100);
  var openInput = root.querySelector("#cbOpen");
  if (openInput) openInput.value = v;

  var lbl = root.querySelector("#cbOpenLabel");
  var valTag = root.querySelector("#cbOpenVal");
  if (valTag) valTag.textContent = v + "%";

  if (lbl) {
    var lang = E.lang || getLang();
    if (v === 0) {
      lbl.textContent = lang === "he" ? "🔒 סגור" : "🔒 Closed";
    } else if (v <= 40) {
      var p1 = Math.round((v / 40) * 100);
      lbl.textContent = lang === "he" ? "🚪 דלתות (" + p1 + "%)" : "🚪 Doors (" + p1 + "%)";
    } else if (v <= 80) {
      var p2 = Math.round(((v - 40) / 40) * 100);
      lbl.textContent = lang === "he" ? "🗄️ מגירות ונשלפים (" + p2 + "%)" : "🗄️ Drawers & pull-outs (" + p2 + "%)";
    } else {
      var p3 = Math.round(((v - 80) / 20) * 100);
      lbl.textContent = lang === "he" ? "🔓 פתוח מלא / כספת (" + p3 + "%)" : "🔓 Fully open & safe (" + p3 + "%)";
    }
  }

  var chips = root.querySelectorAll(".cb-chip-stage");
  chips.forEach(function (chip) {
    var cv = +chip.getAttribute("data-v");
    if ((cv === 0 && v === 0) || (cv === 40 && v > 0 && v <= 40) ||
        (cv === 80 && v > 40 && v <= 80) || (cv === 100 && v > 80)) {
      chip.classList.add("active");
      chip.setAttribute("aria-pressed", "true");
    } else {
      chip.classList.remove("active");
      chip.setAttribute("aria-pressed", "false");
    }
  });
}

/* ================= open / close ================= */

export function openCabinet(it) {
  if (root && E.lang !== getLang()) destroyDOM();
  if (!root) buildDOM();
  if (!it) return;
  // Any cabinet-ish piece can be converted; anything else gets a fresh unit.
  if (!it.cab) {
    pushHistory();
    it.cab = makeSpec(defaultPreset(famOf(it)), it.w, it.h, it.d);
    if (it.type !== "cabsys") it.type = "cabsys";
  } else pushHistory();
  E.it = it;
  /* A Done/open round trip is only a change of workspace visibility. Preserve
     the CAD timeline when it is the same item and the model still matches the
     timeline marker. If the inspector, an import, or another editor changed
     the item while we were closed, stale undo states are deliberately dropped. */
  specOf(E.it);
  var sameItem = E.histIt === it ||
    (E.histId != null && it.id != null && String(E.histId) === String(it.id));
  var resumeHistory = sameItem && H.matchesCurrent();
  E.open = true;
  if (!resumeHistory || !E.sel) E.sel = { col: 0, sec: 0 };
  // Use the exact same serializer as history/isEdited; JSON key order is part
  // of the compare key, so hand-building this with d/h swapped reports a false
  // modification even when every value is identical.
  E.base = stateOf();
  root.style.display = "flex";
  root.querySelector("#cbW").value = Math.round(it.w);
  root.querySelector("#cbD").value = Math.round(it.d);
  root.querySelector("#cbH").value = Math.round(it.h);
  syncOpenUI(it.runtimeState && fin(it.runtimeState.cabinetOpen) ? it.runtimeState.cabinetOpen : it.cab.open || 0);
  if (resumeHistory) syncUndoButtons();
  else {
    H.clear();
  }
  E.histIt = it;
  E.histId = it.id != null ? it.id : null;
  setTool(null);
  E.q = "";
  root.querySelector("#cbSearch").value = "";
  var reopenAxis = resumeHistory && AXES[E.axis] ? E.axis : "front",
    reopenMode = resumeHistory && E.mode === "3d" ? "3d" : "2d";
  E.modeApplied = false;
  // Axis first because setAxis intentionally returns to the drawing; restore a
  // remembered 3D workspace only after the projected view has been selected.
  setAxis(reopenAxis);
  setMode(reopenMode);
  syncViewPreferences();
  fillFamilies();
  fillPresets();
  fillMine();
  sizeCanvas();
  syncSessionStatus();
  changed();
  E.base = stateOf();
  syncSessionStatus();
  if (!resumeHistory) {
    /* Rendering touches every derived cabinet rule once. Treat that normalized
       result—not the half-initialized input—as the honest opening checkpoint. */
    H.clear();
    H.seed();
  }
}

export function closeCabinet() {
  if (!E.open) return;
  E.open = false;
  root.style.display = "none";
  E.it = null;
  S.dirty3D = true;
  updateCost();
  render2D();
}

/* The way out of a whole editing session. In-designer undo deliberately stops
   at the boundary, so this — not Ctrl+Z held down — is what puts the cabinet
   back the way it was found. Escape lands here; the accent ✓ button closes and
   keeps. Anything worth losing gets a confirm first, since Escape is easy to
   hit by accident. */
export function cancelCabinet() {
  if (!E.open) return;
  if (isEdited() && !confirm(T("dropQ"))) return;
  revert();
  closeCabinet();
}
function isEdited() {
  return !!(E.base && E.it) && stateKey(stateOf()) !== stateKey(E.base);
}

function revert() {
  if (!E.base || !E.it) return;
  var s = JSON.parse(E.base);
  E.it.cab = s.cab;
  E.it.w = s.w;
  E.it.d = s.d;
  E.it.h = s.h;
  root.querySelector("#cbW").value = Math.round(s.w);
  root.querySelector("#cbD").value = Math.round(s.d);
  root.querySelector("#cbH").value = Math.round(s.h);
  syncOpenUI(s.cab.open || 0);
  E.sel = { col: 0, sec: 0 };
  changed(true);
}

/* The model updates live, but Revert is scoped to this editor session. Keeping
   that boundary visible makes it clear when Escape would discard this session's
   work. */
function syncSessionStatus() {
  var tag = root && root.querySelector("#cbSession"), changed = isEdited();
  if (!tag) return;
  tag.textContent = changed ? T("modified") : T("original");
  tag.classList.toggle("is-modified", changed);
}

/* Mark the layout as hand-edited, so a later resize re-fits it instead of
   re-planning it from the preset and throwing the edit away. Structural edits
   call this; finishes and hardware do not. */
function touch() {
  if (sp()) sp().auto = false;
}

/* ================= undo inside the designer =================
   The app's own history takes one snapshot when the overlay opens; in here a
   design goes through dozens of small moves, so the designer keeps its own
   stack of spec snapshots and never touches the global one.

   That stack STOPS AT THE BOUNDARY: when it runs out, Ctrl+Z does nothing
   rather than falling through to the plan's history and silently discarding
   the whole session. Getting out of the session is Esc (or Revert), which puts
   back the spec as it was when the overlay opened. */
/* Rather than sprinkling snapshot calls over three dozen handlers, every pass
   through changed() compares the spec with the one it saw last and banks the
   previous state when it really differs. Door-opening is excluded so dragging
   the preview slider does not bury the stack. */
function stateOf() {
  return E.it ? JSON.stringify({ cab: E.it.cab, w: E.it.w, h: E.it.h, d: E.it.d }) : "";
}
function stateKey(json) {
  if (!json) return "";
  var o = JSON.parse(json);
  delete o.cab.open;
  return JSON.stringify(o);
}
/* ---- what is inside a design -------------------------------------------
   The history tree's second axis: which part of the cabinet a step touched.
   The nesting is the one the elevation already draws — cabinet, then its
   columns, then the compartments and the door in each — so scoping the panel
   to the compartment you have selected shows that compartment's own thread,
   and scoping to its column shows everything that happened inside it.
   `hid` (cabinet.js) is what keeps a column the same column after one is
   inserted in front of it. */
function scanSpec(str) {
  var o;
  try {
    o = JSON.parse(str);
  } catch (err) {
    return [];
  }
  var sp = o && o.cab;
  if (!sp) return [];
  var shell = Object.assign({}, sp);
  // the cabinet itself is its carcass and its styling; the things it CONTAINS
  // are objects of their own and must not mark it as changed too
  delete shell.cols;
  delete shell.hw;
  delete shell.dim;
  delete shell.open;
  var out = [
    { id: "cab", kind: "cabinet", label: presetLabel(sp.preset) || famLabel(sp.fam), sig: JSON.stringify(shell) },
    { id: "dim", parent: "cab", kind: "dim", label: T("size"), sig: [o.w, o.h, o.d].join("×") },
    { id: "hw", parent: "cab", kind: "hardware", label: T("hardware"), sig: JSON.stringify(sp.hw || {}) },
  ];
  (sp.cols || []).forEach(function (c, i) {
    var cid = "col:" + (c.hid || i);
    var body = Object.assign({}, c);
    delete body.secs;
    delete body.door;
    out.push({ id: cid, parent: "cab", kind: "column", label: T("column") + " " + (i + 1), sig: JSON.stringify(body) });
    out.push({
      id: "door:" + (c.hid || i), parent: cid, kind: "door",
      label: doorLabel((c.door && c.door.t) || "none"), sig: JSON.stringify(c.door || {}),
    });
    (c.secs || []).forEach(function (s, j) {
      out.push({
        id: "sec:" + (s.hid || i + "." + j), parent: cid, kind: "section",
        label: secLabel(s.t), sig: JSON.stringify(s),
      });
    });
  });
  return out;
}
/* The selection, named the way the scan names it, and the way back from a chip
   in the panel to the same selection. E.sel is a pair of INDEXES, so both
   directions go through the live spec. */
function specScope() {
  var s = sp();
  if (!s || !E.sel) return null;
  var col = s.cols[E.sel.col];
  if (!col) return null;
  if (E.sel.sec == null) return "col:" + (col.hid || E.sel.col);
  var sec = col.secs[E.sel.sec];
  return sec ? "sec:" + (sec.hid || E.sel.col + "." + E.sel.sec) : "col:" + (col.hid || E.sel.col);
}
function specPick(id) {
  var s = sp();
  if (!s) return;
  var at = id.indexOf(":"),
    kind = id.slice(0, at),
    key = id.slice(at + 1),
    found = null;
  s.cols.forEach(function (c, i) {
    if ((kind === "col" || kind === "door") && String(c.hid || i) === key) found = { col: i };
    (c.secs || []).forEach(function (sc, j) {
      if (kind === "sec" && String(sc.hid || i + "." + j) === key) found = { col: i, sec: j };
    });
  });
  if (!found) return;
  E.sel = found;
  draw();
  fillInspector();
  if (histPanel) histPanel.refreshNow();
}

const H = createHistory({
  get: stateOf,
  key: stateKey,
  scan: scanSpec,
  onChange: syncUndoButtons,
  set: function (json) {
    var s = JSON.parse(json);
    E.it.cab = s.cab;
    E.it.w = s.w;
    E.it.h = s.h;
    E.it.d = s.d;
    root.querySelector("#cbW").value = Math.round(s.w);
    root.querySelector("#cbD").value = Math.round(s.d);
    root.querySelector("#cbH").value = Math.round(s.h);
    syncOpenUI(s.cab.open || 0);
    if (E.sel && E.sel.col >= s.cab.cols.length) E.sel = { col: 0, sec: 0 };
    changed(true);
  },
});
/* What the next recorded step is called. Handlers set it just before they
   mutate the spec; changed() consumes it. An edit that never names itself
   still gets a step — it just shows up as a generic one. */
function act(label) {
  E.act = label;
}
function commit() {
  if (!E.it) return;
  H.observe(E.act || T("opEdit"));
  E.act = null;
}
function undo() {
  H.undo();
}
function redo() {
  H.redo();
}
var histPanel = null;
function syncUndoButtons() {
  if (!root) return;
  var u = root.querySelector("#cbUndo"), r = root.querySelector("#cbRedo");
  u.disabled = !H.canUndo();
  u.title = "Ctrl+Z · " + (H.undoLabel() || T("noUndo"));
  r.disabled = !H.canRedo();
  r.title = "Ctrl+Y · " + (H.redoLabel() || T("noRedo"));
  if (histPanel) histPanel.refresh();
}

/* --- a column on the clipboard, so a good one can be repeated --- */
/* One clipboard, two kinds of thing. Ctrl+C on a compartment copies the
   compartment; on a column header it copies the whole column — which is what
   you meant either way, since the selection already says which you are looking
   at. Paste puts the copy after whatever is selected, of the matching kind. */
function copyColumn() {
  if (!E.sel || !sp()) return;
  if (E.sel.sec != null) {
    var col = sp().cols[E.sel.col],
      s = col && col.secs[E.sel.sec];
    if (!s) return;
    E.clip = { kind: "sec", json: JSON.stringify(s) };
    flashHint(T("copySec") + " ✓");
    return;
  }
  E.clip = { kind: "col", json: JSON.stringify(sp().cols[E.sel.col]) };
  flashHint(T("copyCol") + " ✓");
}
function pasteColumn() {
  if (!E.clip || !sp()) return;
  var v = JSON.parse(E.clip.json);
  act(T("pasteCol"));
  touch();
  if (E.clip.kind === "sec") {
    var col = sp().cols[E.sel.col];
    if (!col) return;
    // the new compartment takes its share out of the one it lands next to,
    // so the column still adds up to the height it has
    var at = E.sel.sec == null ? col.secs.length - 1 : E.sel.sec,
      host = col.secs[at];
    if (host) {
      var half = host.h / 2;
      host.h = half;
      v.h = Math.min(v.h || half, half);
    }
    col.secs.splice(at + 1, 0, v);
    E.sel = { col: E.sel.col, sec: at + 1 };
  } else {
    delete v.fixed;
    sp().cols.splice(E.sel.col + 1, 0, v);
    E.sel = { col: E.sel.col + 1, sec: 0 };
  }
  changed();
}
function flashHint(msg) {
  var el2 = root.querySelector(".cb-hint");
  if (!el2) return;
  var old = el2.textContent;
  el2.textContent = msg;
  clearTimeout(E.hintT);
  E.hintT = setTimeout(function () {
    el2.textContent = old;
  }, 1400);
}

/* Everything that has to happen after any edit: re-fit the spec to the size
   (or re-plan it, while it is still the preset's own layout — see specOf),
   repaint the elevation and the preview, and let the app know. */
function changed(refit) {
  if (!E.it) return;
  specOf(E.it);
  syncCabinetDefinition(S, E.it, { propagate:true });
  clearVSpanCache();
  S.dirty3D = true;
  draw();
  updatePreview();
  fillInspector();
  if (E.q) fillHits(); // the search results act on the selection, so they follow it
  fillLook();
  fillTechnical();
  fillHardware();
  fillChecks();
  fillBOM();
  var sub = root.querySelector("#cbSub");
  if (sub) sub.textContent = cabSummary(E.it);
  syncSessionStatus();
  // the cost panel prices a modular cabinet from its actual board area and
  // ironmongery, so every edit in here moves the number
  updateCost();
  commit();
  if (refit) render2D();
}

// Doors/drawers are simulation state, not an authoring change. This path only
// regenerates the affected preview/runtime mesh and never solves the cabinet
// definition or adds a design-history step.
function runtimeChanged() {
  if (!E.it) return;
  clearVSpanCache();
  S.dirty3D = true;
  updatePreview();
  render2D();
}

/* ================= panels: collapse & search =================
   Eleven blocks open at once is a wall, not a panel. Every section folds to
   its title, the state is remembered between sessions, and the ones you rarely
   touch (finishes, ironmongery, checks, the bill) start folded — with what
   matters kept on the title itself, so a folded section still tells you the
   price and whether anything is wrong. */
var UIKEY = "home3d_cab_panels";

function panelState() {
  try {
    return JSON.parse(localStorage.getItem(UIKEY) || "{}");
  } catch (e) {
    return {};
  }
}
function paneOf(k) {
  return root && root.querySelector('[data-pane="' + k + '"]');
}
// which side owns a pane, so pressing an icon only re-lights its own bar
function sideOf(k) {
  var p = paneOf(k),
    box = p && p.closest(".cb-tabs");
  return box ? box.getAttribute("data-side") : "L";
}
function setTab(k, remember) {
  var side = sideOf(k);
  root.querySelectorAll('.cb-tabs[data-side="' + side + '"] .cb-pane').forEach(function (p) {
    p.classList.toggle("on", p.getAttribute("data-pane") === k);
  });
  root.querySelectorAll(".cb-icons button[data-tab]").forEach(function (b) {
    var t = b.getAttribute("data-tab");
    if (sideOf(t) === side) {
      var selected = t === k;
      b.classList.toggle("on", selected);
      b.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  });
  E["tab" + side] = k;
  if (remember !== false) {
    var st = panelState();
    st[side] = k;
    try {
      localStorage.setItem(UIKEY, JSON.stringify(st));
    } catch (e) {}
  }
}
function wireTabs() {
  root.querySelectorAll(".cb-icons button[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      setTab(b.getAttribute("data-tab"));
    });
  });
  var acts = {
    blank: startBlank,
    save: saveUserPreset,
    nest: function () {
      openNest(E.it);
    },
    png: exportPNG,
  };
  root.querySelectorAll(".cb-icons button[data-act]").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = acts[b.getAttribute("data-act")];
      if (f) f();
    });
  });
  var st = panelState();
  setTab(st.L || "presets", false);
  setTab(st.R || "insp", false);
}

function matches(str) {
  return !E.q || String(str || "").toLowerCase().indexOf(E.q) >= 0;
}

/* The search covers the catalogue on the left AND the things that are normally
   buried in the inspector: type "safe" and the compartment type comes to you
   as a button that applies itself to whatever is selected. */
function fillHits() {
  var box = root.querySelector("#cbActs");
  box.innerHTML = "";
  if (!E.q || !sp() || !E.sel) return;
  var L = layoutCab(E.it),
    col = L.cols[E.sel.col] || L.cols[0],
    fc = fitCtx(L, col),
    n = 0;
  Object.keys(SEC).forEach(function (k) {
    if (!matches(secLabel(k)) || n > 7) return;
    var fit = secFit(k, fc.w, fc.colH, fc.d),
      b = btn('<i class="ph ' + SEC[k].icon + '"></i><span>' + secLabel(k) + "</span>", function () {
        applySecType(k);
      }, "cb-hit" + (fit.ok ? "" : " cb-off"));
    b.disabled = !fit.ok || E.sel.sec == null;
    b.title = fit.ok ? T("section") + " · " + secLabel(k) : fit.why;
    box.appendChild(b);
    n++;
  });
  Object.keys(DOORS).forEach(function (k) {
    if (!matches(doorLabel(k)) || n > 11) return;
    var fit = doorFit(k, fc),
      b = btn('<i class="ph ph-door"></i><span>' + doorLabel(k) + "</span>", function () {
        var c = sp().cols[E.sel.col];
        c.door = c.door || {};
        c.door.t = k;
        touch();
        changed();
      }, "cb-hit" + (fit.ok ? "" : " cb-off"));
    b.disabled = !fit.ok;
    b.title = fit.ok ? T("door") + " · " + doorLabel(k) : fit.why;
    box.appendChild(b);
    n++;
  });
}

function applySecType(k) {
  var col = sp().cols[E.sel.col],
    s = col && col.secs[E.sel.sec];
  if (!s) return;
  var m = SEC[k];
  s.t = k;
  delete s.n;
  delete s.heights;
  delete s.space;
  if (s.h < m.min) s.h = Math.max(s.h, Math.min(m.min, m.def));
  touch();
  changed();
}

function applySearch() {
  fillFamilies();
  fillPresets();
  fillMine();
  fillHits();
  var hits = root.querySelectorAll("#cbPresets .cb-preset, #cbActs .cb-hit").length;
  root.querySelector("#cbNoHits").style.display = E.q && !hits ? "" : "none";
  /* Searching shows the results pane, but the icon that was pressed keeps its
     light — clearing the box puts you back where you were. */
  if (E.q) {
    E.tabBeforeQ = E.tabBeforeQ || E.tabL;
    setTab("presets", false);
  } else if (E.tabBeforeQ) {
    setTab(E.tabBeforeQ, false);
    E.tabBeforeQ = null;
  }
}

/* ================= left panel ================= */

function fillFamilies() {
  var wrap = root.querySelector("#cbFams"),
    title = root.querySelector("#cbFamsTitle");
  wrap.innerHTML = "";
  /* Fourteen named chips were five rows of the panel. They are icons now, and
     the one in force is spelled out on the section title instead. */
  if (title)
    title.childNodes[0].nodeValue = T("family") + (sp() ? " · " + famShort(sp().fam) : "");
  Object.keys(FAM).forEach(function (k) {
    if (!matches(famLabel(k) + " " + famShort(k))) return;
    var f = FAM[k],
      b = btn('<i class="ph ' + f.icon + '"></i>', function () {
        var it = E.it;
        it.d = f.d;
        it.h = f.h;
        if (it.w < STD.minCol) it.w = f.w;
        // a blank stays blank when the family changes — only its proportions
        // and its carcass follow the new family; and the free-form "family"
        // has no preset to fall back on, so it is always a blank
        act(T("opFamily") + " · " + famLabel(f));
        it.cab = k === "free" || (sp() && sp().preset === "blank")
          ? makeBlankSpec(k, it.w, it.h, it.d, it.cab)
          : makeSpec(f.preset, it.w, it.h, it.d, it.cab);
        root.querySelector("#cbD").value = Math.round(it.d);
        root.querySelector("#cbH").value = Math.round(it.h);
        E.sel = { col: 0, sec: 0 };
        fillPresets();
        fillFamilies();
        changed(true);
      }, "cb-chip cb-chip-ico" + (sp() && sp().fam === k ? " on" : ""));
    b.title = famLabel(k);
    b.setAttribute("aria-label", famLabel(k));
    wrap.appendChild(b);
  });
}

function fillPresets() {
  var wrap = root.querySelector("#cbPresets"),
    fam = sp() ? sp().fam : "wardrobe";
  wrap.innerHTML = "";
  // the family's own presets first, then the rest — a wardrobe preset is still
  // a legitimate thing to try on a walk-in
  fillPresetCards(wrap, fam);
  var blankIco = root.querySelector('.cb-icons button[data-act="blank"]');
  if (blankIco) blankIco.classList.toggle("on", !!sp() && sp().preset === "blank");
}

/* The bare carcass: a preset answers the size for you, this hands you an empty
   box and the wall tools instead. */
function startBlank() {
  var it = E.it;
  if (!it) return;
  it.cab = makeBlankSpec(sp() ? sp().fam : famOf(it), it.w, it.h, it.d, it.cab);
  E.sel = { col: 0, sec: 0 };
  fillPresets();
  fillFamilies();
  setTool("vwall"); // straight into drawing, which is the point of a blank
  changed(true);
}

function fillPresetCards(wrap, fam) {
  var list = PRESETS.slice().sort(function (a, b) {
    return (a.fam === fam ? 0 : 1) - (b.fam === fam ? 0 : 1);
  });
  list.forEach(function (p) {
    if (!matches(presetLabel(p) + " " + presetNote(p) + " " + famLabel(p.fam))) return;
    var card = el("div", "cb-preset" + (sp() && sp().preset === p.id ? " on" : ""));
    card.innerHTML =
      '<div class="cb-p-top"><i class="ph ' + (FAM[p.fam] || {}).icon + '"></i><b>' + presetLabel(p) + "</b></div>" +
      '<div class="cb-p-note">' + presetNote(p) + "</div>" +
      '<div class="cb-p-fam">' + famLabel(p.fam) + "</div>";
    card.addEventListener("click", function () {
      var it = E.it,
        f = FAM[p.fam];
      // a preset from another family brings that family's proportions with it
      if (sp().fam !== p.fam) {
        it.d = f.d;
        it.h = f.h;
        root.querySelector("#cbD").value = Math.round(it.d);
        root.querySelector("#cbH").value = Math.round(it.h);
      }
      act(T("opPreset") + " · " + presetLabel(p));
      it.cab = makeSpec(p.id, it.w, it.h, it.d, it.cab);
      E.sel = { col: 0, sec: 0 };
      setTool(null);
      fillPresets();
      fillFamilies();
      changed(true);
    });
    wrap.appendChild(card);
  });
}

/* ================= elevation ================= */

function sizeCanvas() {
  if (!E.cv) return;
  var r = E.cv.parentElement.getBoundingClientRect(),
    dpr = Math.min(2, window.devicePixelRatio || 1);
  E.cv.width = Math.max(100, r.width * dpr);
  E.cv.height = Math.max(100, r.height * dpr);
  E.cv.style.width = r.width + "px";
  E.cv.style.height = r.height + "px";
  E.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  E.vw = r.width;
  E.vh = r.height;
}

function css(name, fb) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fb;
}

/* ================= view modes =================
   2 is the drawing, 3 is the model — the same two keys a CAD user reaches for.
   In 2D the drawing looks from whichever direction is picked: the six axes and
   the four 45° corners between the horizontal ones. Only the front view is the
   editable elevation; the rest are orthographic projections of the very same
   layout, so they cannot drift from it. */
var AXES = {
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

function setMode(m) {
  if (!root) return;
  m = m === "3d" ? "3d" : "2d";
  if (m === E.mode && E.modeApplied) return;
  E.mode = m;
  E.modeApplied = true;
  if (m === "3d") setTool(null);
  /* Switching to the model picks up the drawing's own direction, so the piece
     does not jump to some unrelated angle the moment you want to look at it in
     the round. Straight up and straight down are pulled back off the pole —
     a camera looking exactly along its own up vector has no orientation. */
  if (m === "3d" && E.pv && AXES[E.axis]) E.pv.orbitTo(AXES[E.axis].az, AXES[E.axis].el);
  // one renderer, two homes — see editor_view.js
  if (!swapView) {
    swapView = createViewportSwap({
      wrap: root.querySelector(".cb-prev-wrap"),
      bigHost: root.querySelector("#cb3dHost"),
      panelHost: root.querySelector(".cb-right"),
    });
  }
  swapView(m === "3d", E.pv);
  root.classList.toggle("cb-is3d", m === "3d");
  root.querySelectorAll("#cbViews button[data-mode]").forEach(function (b) {
    var selected = b.getAttribute("data-mode") === m;
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  syncHint();
  if (E.view || m === "2d") draw();
  renderPreview();
}

function setAxis(a) {
  if (!AXES[a]) return;
  E.axis = a;
  if (a !== "front") setTool(null);
  root.querySelectorAll("#cbViews button[data-ax]").forEach(function (b) {
    var selected = b.getAttribute("data-ax") === a;
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  root.querySelectorAll("#cbTools button").forEach(function (b) {
    b.disabled = a !== "front" && !!b.getAttribute("data-tool");
  });
  root.querySelector("#cbHid").disabled = a === "front"; // no projection to hide
  setMode("2d");
  syncHint();
  draw();
}

function syncHint() {
  var h = root && root.querySelector(".cb-hint");
  if (!h) return;
  h.textContent =
    E.mode === "3d" ? T("hint3d")
      : E.axis !== "front" ? T("hintRO")
      : E.tool ? T(E.tool === "vwall" ? "hintV" : E.tool === "hwall" ? "hintH" : "hintErase")
      : T("hint");
}

function syncViewPreferences() {
  if (!root) return;
  var snap = root.querySelector("#cbSnap"), hidden = root.querySelector("#cbHid");
  if (snap) {
    snap.classList.toggle("on", E.snap);
    snap.setAttribute("aria-pressed", E.snap ? "true" : "false");
    snap.querySelector("span").textContent = T(E.snap ? "snapOn" : "snapOff");
  }
  if (hidden) {
    hidden.classList.toggle("on", E.hid);
    hidden.setAttribute("aria-pressed", E.hid ? "true" : "false");
    hidden.querySelector("span").textContent = T(E.hid ? "hidOn" : "hidOff");
  }
}

/* --- the orthographic projection behind every view but the front --- */
function camBasis(az, elv) {
  var dir = [Math.sin(az) * Math.cos(elv), Math.sin(elv), Math.cos(az) * Math.cos(elv)],
    // straight up or straight down leaves no horizon to take "right" from, so
    // a plan view is pinned: width across, depth up the page
    flat = Math.abs(Math.cos(elv)) < 1e-6,
    rt = flat ? [1, 0, 0] : norm([dir[2], 0, -dir[0]]),
    up = [
      dir[1] * rt[2] - dir[2] * rt[1],
      dir[2] * rt[0] - dir[0] * rt[2],
      dir[0] * rt[1] - dir[1] * rt[0],
    ];
  return { dir: dir, rt: rt, up: up };
}
function norm(v) {
  var l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/* Every part reduced to the box it occupies. A rail or a handle is a cylinder
   and a corner board a polygon, but at drawing scale their extent is what
   reads — and one shape here keeps the projector to a single code path. */
function partBox(p) {
  if (p.k === "box") return [p.x0, p.y0, p.z0, p.x1, p.y1, p.z1];
  if (p.k === "poly") {
    var xs = p.pts.map(function (q) { return q[0]; }),
      zs = p.pts.map(function (q) { return q[1]; });
    return [Math.min.apply(null, xs), p.y0, Math.min.apply(null, zs), Math.max.apply(null, xs), p.y1, Math.max.apply(null, zs)];
  }
  var r = p.r || 1,
    hgt = p.k === "sph" ? 2 * r : p.hgt || 2 * r,
    // a cylinder stands on Y unless it was laid over onto another axis
    ex = p.rz ? hgt / 2 : r,
    ey = p.rx || p.rz ? r : hgt / 2,
    ez = p.rx ? hgt / 2 : r;
  return [p.x - ex, p.y - ey, p.z - ez, p.x + ex, p.y + ey, p.z + ez];
}

// The 8 corners in the cabinet's own frame, through the part's pivot if it has
// one (an open door, a pulled-out drawer) — the same transform buildCab uses.
function partCorners(p, L) {
  var b = partBox(p),
    u = p.unit != null ? L.units[p.unit] : null,
    out = [];
  for (var i = 0; i < 8; i++) {
    var x = i & 1 ? b[3] : b[0],
      y = i & 2 ? b[4] : b[1],
      z = i & 4 ? b[5] : b[2];
    if (u) {
      var lx = x - (u.px || 0),
        ly = y - (u.py || 0),
        lz = z - (u.pz || 0),
        a = u.ang || 0,
        c = Math.cos(a),
        s = Math.sin(a),
        rx = lx, ry = ly, rz = lz;
      if (u.rot === "y") { rx = lx * c + lz * s; rz = -lx * s + lz * c; }
      else if (u.rot === "x") { ry = ly * c - lz * s; rz = ly * s + lz * c; }
      else if (u.rot === "z") { rx = lx * c - ly * s; ry = lx * s + ly * c; }
      x = rx + (u.px || 0) + (u.tx || 0);
      y = ry + (u.py || 0) + (u.ty || 0);
      z = rz + (u.pz || 0) + (u.tz || 0);
    }
    out.push([x, y, z]);
  }
  return out;
}

/* The six faces of the corner cube, as indices into partCorners' order. No
   normals baked in: a door on its hinge is not axis-aligned any more, so the
   normal is taken from the transformed corners and pointed outwards from the
   part's own centre — which is true whatever the pivot did to it. */
var FACES = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
function faceNormal(w3, idx, centre) {
  var a = w3[idx[0]], b = w3[idx[1]], c = w3[idx[2]],
    e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]],
    n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]],
    mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2],
    out = [mid[0] - centre[0], mid[1] - centre[1], mid[2] - centre[2]];
  if (dot3(n, out) < 0) n = [-n[0], -n[1], -n[2]];
  return norm(n);
}

/* Which face sits across each edge of each face, worked out once by matching
   vertex pairs. An edge whose neighbour is turned away from us is a silhouette
   edge — the outline of the part against whatever lies behind it — and those
   are the only edges worth haloing. */
var FACE_NB = (function () {
  function key(a, b) { return a < b ? a + ":" + b : b + ":" + a; }
  var owner = {};
  FACES.forEach(function (f, i) {
    for (var j = 0; j < 4; j++) (owner[key(f[j], f[(j + 1) % 4])] || (owner[key(f[j], f[(j + 1) % 4])] = [])).push(i);
  });
  return FACES.map(function (f, i) {
    var out = [];
    for (var j = 0; j < 4; j++) {
      var o = owner[key(f[j], f[(j + 1) % 4])];
      out.push(o[0] === i ? o[1] : o[0]);
    }
    return out;
  });
})();

/* One colour per material, pulled apart in hue as well as in value: two boards
   of the same brightness sitting edge to edge read as one board otherwise. */
var PROJ_COL = {
  front: [204, 172, 126], doorPanel: [192, 158, 112], batten: [178, 146, 104],
  carcass: [226, 210, 182], back: [186, 174, 152], dark: [96, 88, 80],
  top: [128, 124, 120], metal: [154, 162, 172], rail: [140, 148, 160],
  handle: [104, 116, 132], glazing: [170, 206, 222], glass: [170, 206, 222],
  screen: [62, 70, 84], led: [232, 226, 176], appliance: [190, 196, 204],
  tvPanel: [112, 106, 100], leather: [150, 106, 82], garment: [166, 150, 168],
  fabric: [176, 160, 140],
};

/* A CSS colour to [r,g,b]. Only the forms the themes actually use — #rgb, #rrggbb
   and rgb()/rgba() — with the caller's fallback for anything else. */
function rgbOf(s, fb) {
  s = (s || "").trim();
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = /^rgba?\(([^)]+)\)/i.exec(s);
  if (m) {
    var n = m[1].split(/[,\s/]+/).map(parseFloat);
    if (n.length >= 3 && n.every(function (q) { return isFinite(q); })) return [n[0], n[1], n[2]];
  }
  return fb;
}
function mixC(a, b, t) {
  return Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
}

function drawProjected(ax) {
  var it = E.it,
    L = layoutCab(it),
    c = E.cx,
    W = E.vw,
    H = E.vh,
    v = AXES[ax],
    B = camBasis(v.az, v.el),
    pad = 92, // the dimension chains and the hint pill live in this margin
    gut = 118; // and the view picker owns this strip down the leading edge
  E.view = null; // nothing here is hit-testable — the front view owns editing

  /* Looking straight down at a closed box shows you a lid, which tells nobody
     anything — so the plan view is a section: the top of the carcass comes off.
     The same courtesy from below. */
  var skip = ax === "top" ? { top: 1, worktop: 1 } : ax === "bottom" ? { bottom: 1, plinth: 1 } : {};

  // every corner first, so the drawing is fitted to what it actually is
  var boxes = [],
    minU = 1e9, maxU = -1e9, minV = 1e9, maxV = -1e9;
  L.parts.forEach(function (p) {
    if (skip[p.role]) return;
    var pts = partCorners(p, L),
      pr = pts.map(function (q) {
        var uu = dot3(q, B.rt), vv = dot3(q, B.up), dd = dot3(q, B.dir);
        if (uu < minU) minU = uu;
        if (uu > maxU) maxU = uu;
        if (vv < minV) minV = vv;
        if (vv > maxV) maxV = vv;
        return [uu, vv, dd];
      });
    /* Sorted on the corner nearest the camera, not the centroid: a side panel
       runs the whole depth of the piece, so its centre sits behind a door that
       it is in fact level with, and the door would be painted over. */
    var dsum = 0,
      dmax = -1e9,
      ctr = [0, 0, 0];
    pr.forEach(function (q) {
      dsum += q[2];
      if (q[2] > dmax) dmax = q[2];
    });
    pts.forEach(function (q) {
      ctr[0] += q[0] / 8;
      ctr[1] += q[1] / 8;
      ctr[2] += q[2] / 8;
    });
    boxes.push({ p: p, pr: pr, w3: pts, ctr: ctr, depth: dmax, mid: dsum / 8 });
  });
  if (!boxes.length) return;
  var k = Math.min((W - gut - pad * 2) / Math.max(1, maxU - minU), (H - pad * 2) / Math.max(1, maxV - minV)),
    ox = gut + (W - gut) / 2 - ((minU + maxU) / 2) * k,
    oy = H / 2 + ((minV + maxV) / 2) * k;

  c.clearRect(0, 0, W, H);
  var muted = css("--text-muted", "#7b838c");

  /* Sorted face by face, not box by box. A whole-box sort is fine looking
     down an axis, but at 45° a door panel's nearest corner sticks out further
     than the handle bolted to its face, so the door won ties and painted over
     its own handle. Each quad carries its own depth instead, which is what the
     painter's algorithm actually wants. */
  var faces = [];
  boxes.forEach(function (bx) {
    var base = PROJ_COL[bx.p.mat] || PROJ_COL.carcass,
      vis = FACES.map(function (f) {
        return dot3(faceNormal(bx.w3, f, bx.ctr), B.dir) > 0.001; // towards us?
      });
    FACES.forEach(function (f, fi) {
      if (!vis[fi]) return;
      var nrm = faceNormal(bx.w3, f, bx.ctr),
        d = 0;
      f.forEach(function (idx) { d += bx.pr[idx][2] / 4; });
      // a flat lambert on the face normal is all the depth cue a shop drawing
      // needs, and it keeps the six axis views readable when faces are edge-on
      faces.push({ f: f, pr: bx.pr, base: base, d: d,
        sil: FACE_NB[fi].map(function (nb) { return !vis[nb]; }),
        sh: 0.62 + 0.38 * Math.max(0, dot3(nrm, norm([0.35, 0.85, 0.4]))) });
    });
  });
  if (!faces.length) return;
  faces.sort(function (a, b) { return a.d - b.d; });

  /* Aerial perspective: everything fades towards the canvas behind it with
     distance, so what is in front of what is readable without spinning the
     model. The near end keeps its full colour — only depth is spent here. */
  var dLo = faces[0].d,
    dHi = faces[faces.length - 1].d,
    span = Math.max(1e-6, dHi - dLo),
    bg = rgbOf(css("--bg-canvas-2d", "#e2e8f0"), [226, 232, 240]);

  c.lineJoin = "round";
  c.lineCap = "round";
  var P = function (idx, pr) { return [ox + pr[idx][0] * k, oy - pr[idx][1] * k]; };

  /* A coarse depth buffer over the drawing, so an edge can be asked whether
     anything stands in front of it. Half resolution is plenty — it decides
     dashed-versus-solid, it does not draw anything. The projection is
     orthographic, so depth across a flat face is an affine function of the
     screen position: three corners give the plane, and no perspective divide
     is needed anywhere here. */
  var ZS = 0.5,
    BW = Math.max(1, Math.ceil(W * ZS)),
    BH = Math.max(1, Math.ceil(H * ZS)),
    zb = new Float32Array(BW * BH).fill(-1e30);
  faces.forEach(function (fc) {
    var q = fc.f.map(function (idx) {
      var p = P(idx, fc.pr);
      return [p[0] * ZS, p[1] * ZS, fc.pr[idx][2]];
    });
    var e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]],
      e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]],
      det = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.abs(det) < 1e-9) return; // edge-on: no area to occlude with
    var a = (e1[2] * e2[1] - e2[2] * e1[1]) / det,
      b = (e2[2] * e1[0] - e1[2] * e2[0]) / det,
      cc = q[0][2] - a * q[0][0] - b * q[0][1],
      ys = q.map(function (p) { return p[1]; }),
      y0 = Math.max(0, Math.floor(Math.min.apply(null, ys))),
      y1 = Math.min(BH - 1, Math.ceil(Math.max.apply(null, ys)));
    for (var y = y0; y <= y1; y++) {
      var yc = y + 0.5, xlo = 1e30, xhi = -1e30;
      for (var i = 0; i < 4; i++) {
        var A = q[i], Bq = q[(i + 1) % 4];
        if ((A[1] <= yc) === (Bq[1] <= yc)) continue;
        var x = A[0] + ((yc - A[1]) / (Bq[1] - A[1])) * (Bq[0] - A[0]);
        if (x < xlo) xlo = x;
        if (x > xhi) xhi = x;
      }
      if (xhi < xlo) continue;
      var xa = Math.max(0, Math.floor(xlo)), xb = Math.min(BW - 1, Math.ceil(xhi));
      for (var xx = xa; xx <= xb; xx++) {
        var d = a * (xx + 0.5) + b * yc + cc, o = y * BW + xx;
        if (d > zb[o]) zb[o] = d;
      }
    }
  });
  // half a board's thickness of slack, so a face never buries its own outline
  var ZEPS = Math.max(0.4, span * 0.004);
  function occluded(X, Y, d) {
    var x = Math.floor(X * ZS), y = Math.floor(Y * ZS);
    if (x < 0 || y < 0 || x >= BW || y >= BH) return false;
    return zb[y * BW + x] > d + ZEPS;
  }

  /* Each face is cut into a grid before it is sorted. One scalar per polygon
     cannot order geometry that interleaves: a drawer box pulled out of its
     carcass is partly in front of the side panel and partly behind it, and
     whichever way the two averages fall, one of them paints straight over the
     other. Cut into tiles the ordering is per tile, so the same board can be
     in front along one edge and behind along another — which is what it is.
     Faces flat-on to the camera stay whole; only depth costs tiles. */
  var tiles = [];
  faces.forEach(function (fc) {
    var pt = fc.f.map(function (idx) { return P(idx, fc.pr); }),
      dz = fc.f.map(function (idx) { return fc.pr[idx][2]; }),
      ext = Math.max.apply(null, dz) - Math.min.apply(null, dz),
      n = Math.max(1, Math.min(8, Math.round(ext / (span * 0.05)))),
      // bilinear over the quad: valid for a planar face under an ortho camera
      at = function (u, vq) {
        var a = 1 - u, b2 = 1 - vq;
        return [
          b2 * (a * pt[0][0] + u * pt[1][0]) + vq * (a * pt[3][0] + u * pt[2][0]),
          b2 * (a * pt[0][1] + u * pt[1][1]) + vq * (a * pt[3][1] + u * pt[2][1]),
          b2 * (a * dz[0] + u * dz[1]) + vq * (a * dz[3] + u * dz[2]),
        ];
      };
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        // a hair of overlap, or antialiasing leaves seams between the tiles
        var u0 = i / n - 0.004, u1 = (i + 1) / n + 0.004,
          v0 = j / n - 0.004, v1 = (j + 1) / n + 0.004,
          q = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)],
          ctr = at((i + 0.5) / n, (j + 0.5) / n);
        /* Dropped only when the centre AND both quarter points are covered. A
           tile that is half visible has to stay, or the cull eats bites out of
           the silhouette and the edge comes out looking sawn. */
        if (occluded(ctr[0], ctr[1], ctr[2]) &&
            occluded.apply(null, at((i + 0.25) / n, (j + 0.25) / n)) &&
            occluded.apply(null, at((i + 0.75) / n, (j + 0.75) / n))) continue;
        tiles.push({ q: q, d: ctr[2], fc: fc });
      }
    }
  });
  tiles.sort(function (a, b) { return a.d - b.d; });

  tiles.forEach(function (tl) {
    // shaded off the whole face, not the tile: a per-tile fade puts a visible
    // step down the middle of a board that the tiling is meant to be invisible
    var t = (dHi - tl.fc.d) / span, // 0 nearest, 1 furthest
      fade = 0.34 * t * t, // squared: the fall-off stays off the front ranks
      base = tl.fc.base,
      sh = tl.fc.sh,
      q = tl.q;

    /* No halo line here any more. It was a per-face trick and it does not
       survive being cut into tiles: along an edge that runs away from the
       camera one tile's halo is stroked after its neighbour's fill and takes a
       notch out of it, which is what serrated every silhouette. The weighted
       outline plus the dashed hidden lines carry the same information without
       painting over anything. */
    c.beginPath();
    q.forEach(function (p, n2) {
      if (n2 === 0) c.moveTo(p[0], p[1]);
      else c.lineTo(p[0], p[1]);
    });
    c.closePath();
    c.fillStyle = "rgb(" + mixC(base[0] * sh, bg[0], fade) + "," + mixC(base[1] * sh, bg[1], fade) + "," + mixC(base[2] * sh, bg[2], fade) + ")";
    c.fill();
  });

  /* Edges last, and every one of them walked against the depth buffer rather
     than drawn end to end: the stretch of an edge you can see comes out solid,
     the stretch running behind another part comes out dashed. That is the
     whole hidden-line convention, and it is also why an edge no longer gets a
     solid line drawn parallel to its own dashed one — one walk decides both.
     A silhouette edge is weighted heavier than a fold, as in a hand drawing.
     Folds are never dashed: hidden internal edges turn a drawing into
     hatching. */
  var hcol = rgbOf(css("--text-muted", "#7b838c"), [123, 131, 140]),
    dash = "rgba(" + hcol[0] + "," + hcol[1] + "," + hcol[2] + ",0.75)";
  c.lineCap = "butt";
  faces.forEach(function (fc) {
    var t = (dHi - fc.d) / span,
      fade = 0.34 * t * t,
      base = fc.base,
      ink = "rgba(" + mixC(base[0] * 0.28, bg[0], fade) + "," + mixC(base[1] * 0.28, bg[1], fade) + "," + mixC(base[2] * 0.28, bg[2], fade) + ",";
    for (var e = 0; e < 4; e++) {
      var i0 = fc.f[e], i1 = fc.f[(e + 1) % 4],
        A = P(i0, fc.pr), Bp = P(i1, fc.pr),
        dA = fc.pr[i0][2], dB = fc.pr[i1][2],
        len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
      if (len < 1) continue;
      var n = Math.min(200, Math.max(2, Math.ceil(len / 3))),
        hit = [];
      for (var s = 0; s < n; s++) {
        var m = (s + 0.5) / n;
        hit.push(occluded(A[0] + (Bp[0] - A[0]) * m, A[1] + (Bp[1] - A[1]) * m, dA + (dB - dA) * m));
      }
      /* De-speckled before anything is drawn. An edge that grazes the surface
         it lies against flips hidden/visible from sample to sample — against a
         2 px depth buffer that is noise, not geometry — and drawing it run by
         run made a solid edge come out looking finely dashed. A stretch has to
         hold for three samples (~9 px) to count as a change. */
      for (var pass = 0; pass < 2; pass++) {
        for (var i2 = 0; i2 < n; i2++) {
          var j2 = i2;
          while (j2 + 1 < n && hit[j2 + 1] === hit[i2]) j2++;
          if (j2 - i2 < 2 && (i2 > 0 || j2 < n - 1)) {
            var fillv = i2 > 0 ? hit[i2 - 1] : hit[j2 + 1];
            for (var z = i2; z <= j2; z++) hit[z] = fillv;
          }
          i2 = j2;
        }
      }
      var run = 0;
      for (var s2 = 1; s2 <= n; s2++) {
        if (s2 < n && hit[s2] === hit[run]) continue;
        seg(run / n, s2 / n, hit[run]);
        run = s2;
      }
      // eslint-disable-next-line no-loop-func
      function seg(t0, t1, hidden) {
        if (hidden && !E.hid) return; // "visible only": it simply is not there
        if (hidden) {
          c.setLineDash([5, 4]);
          c.strokeStyle = dash;
          c.lineWidth = 1;
        } else {
          c.setLineDash([]);
          c.strokeStyle = ink + (fc.sil[e] ? 0.92 - 0.5 * t : 0.5 - 0.3 * t).toFixed(2) + ")";
          c.lineWidth = (fc.sil[e] ? 1.5 : 0.7) - 0.5 * t;
        }
        c.beginPath();
        c.moveTo(A[0] + (Bp[0] - A[0]) * t0, A[1] + (Bp[1] - A[1]) * t0);
        c.lineTo(A[0] + (Bp[0] - A[0]) * t1, A[1] + (Bp[1] - A[1]) * t1);
        c.stroke();
      }
    }
  });
  c.setLineDash([]);
  c.lineCap = "round";
  dims();

  // the two real dimensions of an axis view (a 45° view has none to give)
  function dims() {
    if (!v.hDim) return;
    var hv = it[v.hDim],
      vv2 = it[v.vDim];
    dimTick(c, ox + minU * k, ox + maxU * k, oy - minV * k + 30, Math.round(hv), muted, true);
    dimTickV(c, oy - maxV * k, oy - minV * k, ox + minU * k - 30, Math.round(vv2), muted, true);
  }
}

function draw() {
  if (!E.open || !E.cx || !E.vw) return;
  if (E.mode === "3d") {
    E.cx.clearRect(0, 0, E.vw || 0, E.vh || 0);
    return;
  }
  if (E.axis !== "front") return drawProjected(E.axis);
  var it = E.it,
    L = layoutCab(it),
    c = E.cx,
    W = E.vw,
    H = E.vh,
    padX = 58,
    padT = 112, // the labelled 2×2 tool group floats over the canvas — draw below it
    padB = 84, // room for the width dimension and the hint pill
    k = Math.min((W - padX * 2) / it.w, (H - padT - padB) / it.h),
    ox = W / 2,
    oy = padT + it.h * k;
  E.view = { k: k, ox: ox, oy: oy, L: L };
  var X = function (mx) {
      return ox + mx * k;
    },
    Y = function (my) {
      return oy - my * k;
    };

  c.clearRect(0, 0, W, H);
  var line = css("--border-color", "#c9ced4"),
    txt = css("--text-main", "#20242a"),
    muted = css("--text-muted", "#7b838c"),
    accent = css("--accent", "#3b82f6");

  // carcass body — a floating run has none, so its extent is only indicated
  var floating = L.sp.carcass === "float";
  c.fillStyle = "rgba(140,120,90,0.10)";
  c.strokeStyle = line;
  c.lineWidth = 2;
  if (floating) {
    c.save();
    c.setLineDash([5, 4]);
    c.lineWidth = 1;
    c.strokeRect(X(-it.w / 2), Y(it.h), it.w * k, it.h * k);
    c.restore();
  } else {
    c.fillRect(X(-it.w / 2), Y(it.h), it.w * k, it.h * k);
    c.strokeRect(X(-it.w / 2), Y(it.h), it.w * k, it.h * k);
  }

  // plinth
  if (L.sp.plinth > 0) {
    c.fillStyle = "rgba(90,90,90,0.18)";
    c.fillRect(X(-it.w / 2), Y(L.sp.plinth), it.w * k, L.sp.plinth * k);
    c.strokeRect(X(-it.w / 2), Y(L.sp.plinth), it.w * k, L.sp.plinth * k);
  }
  if (L.sp.top) {
    c.fillStyle = "rgba(60,70,80,0.22)";
    c.fillRect(X(-it.w / 2), Y(it.h), it.w * k, L.sp.top * k);
  }

  c.font = "600 11px Inter, Rubik, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";

  L.cols.forEach(function (col, ci) {
    // a filler / blind corner is drawn as one hatched block: no division, no
    // front, exactly what it is on a joinery elevation
    if (col.kind && col.kind !== "normal") {
      var fx = X(col.x0),
        fy = Y(L.yt + L.t),
        fw = (col.x1 - col.x0) * k,
        fh = (L.yt - L.yb + 2 * L.t) * k,
        selF = E.sel && E.sel.col === ci;
      c.fillStyle = "rgba(120,128,136,0.20)";
      c.fillRect(fx, fy, fw, fh);
      c.save();
      c.beginPath();
      c.rect(fx, fy, fw, fh);
      c.clip();
      c.strokeStyle = "rgba(120,128,136,0.55)";
      c.lineWidth = 1;
      for (var hx = -fh; hx < fw; hx += 9) {
        c.beginPath();
        c.moveTo(fx + hx, fy + fh);
        c.lineTo(fx + hx + fh, fy);
        c.stroke();
      }
      c.restore();
      c.strokeStyle = selF ? accent : line;
      c.lineWidth = selF ? 3 : 1;
      c.strokeRect(fx, fy, fw, fh);
      if (fw > 30) {
        c.save();
        c.translate(fx + fw / 2, fy + fh / 2);
        if (fw < 70) c.rotate(-Math.PI / 2);
        c.fillStyle = txt;
        c.fillText(kindLabel(col.kind), 0, 0);
        c.restore();
      }
      dimTick(c, X(col.x0), X(col.x1), Y(it.h) - 26, Math.round(col.w), muted);
      return;
    }
    col.secs.forEach(function (cell, si) {
      var x = X(col.x0),
        y = Y(cell.y1),
        w = (col.x1 - col.x0) * k,
        h = (cell.y1 - cell.y0) * k,
        m = SEC[cell.ref.t] || SEC.shelves,
        selected = E.sel && E.sel.col === ci && E.sel.sec === si;
      if (!cell.floatShelf) {
        c.fillStyle = m.col;
        c.globalAlpha = 0.55;
        c.fillRect(x, y, w, h);
        c.globalAlpha = 1;
        drawSecDetail(c, cell, x, y, w, h, k, line);
      }
      c.strokeStyle = selected ? accent : line;
      c.lineWidth = selected ? 3 : 1;
      c.strokeRect(x, y, w, h);
      /* A floating shelf: the board itself is the only thing there, so it is
         drawn solid at the foot of its compartment and the clear space above it
         is left empty — which is what the elevation of a shelf run looks like. */
      if (cell.floatShelf) {
        c.fillStyle = "rgba(140,120,90,0.55)";
        c.fillRect(x, y + h - L.t * k, w, L.t * k);
        c.strokeStyle = line;
        c.lineWidth = 1;
        c.strokeRect(x, y + h - L.t * k, w, L.t * k);
      }
      if (h > 22 && w > 44) {
        c.fillStyle = txt;
        c.fillText(secLabel(cell.ref.t), x + w / 2, y + h / 2 - 7);
        c.fillStyle = muted;
        c.font = "500 10px Inter, Rubik, sans-serif";
        c.fillText(Math.round(cell.ref.h) + " " + (isEn() ? "cm" : 'ס"מ'), x + w / 2, y + h / 2 + 7);
        c.font = "600 11px Inter, Rubik, sans-serif";
      }
    });
    /* A floating run's compartments each carry the board at their foot, so the
       board that caps the top of the run belongs to no compartment — draw it
       here, or the top shelf would be missing from the drawing. */
    if (floating) {
      c.fillStyle = "rgba(140,120,90,0.55)";
      c.fillRect(X(col.x0), Y(it.h), (col.x1 - col.x0) * k, L.t * k);
      c.strokeStyle = line;
      c.lineWidth = 1;
      c.strokeRect(X(col.x0), Y(it.h), (col.x1 - col.x0) * k, L.t * k);
    }
    if (E.showDoors) drawDoor(c, L, col, X, Y, k, accent);
    dimTick(c, X(col.x0), X(col.x1), Y(it.h) - 26, Math.round(col.w), muted);
    // column selection band
    var selCol = E.sel && E.sel.col === ci && E.sel.sec == null;
    c.fillStyle = selCol ? accent : "rgba(128,128,128,0.35)";
    c.fillRect(X(col.x0) + 1, Y(it.h) - 7, (col.x1 - col.x0) * k - 2, 4);
  });

  // the selected column's compartments, dimensioned down the side
  var selCol2 = E.sel && L.cols[E.sel.col];
  if (selCol2 && selCol2.secs.length) {
    // outside the piece, opposite the overall height, so it never sits on top
    // of the drawing itself
    var dx = X(it.w / 2) + 20;
    selCol2.secs.forEach(function (cell) {
      dimTickV(c, Y(cell.y1), Y(cell.y0), dx, Math.round(cell.ref.h), accent);
    });
  }

  // overall dimensions
  dimTick(c, X(-it.w / 2), X(it.w / 2), Y(0) + 26, Math.round(it.w), muted, true);
  dimTickV(c, Y(it.h), Y(0), X(-it.w / 2) - 26, Math.round(it.h), muted, true);
  if (L.sp.elev)
    dimTickV(c, Y(0), Y(0) + L.sp.elev * k, X(-it.w / 2) - 26, Math.round(L.sp.elev), muted, true);

  // the partition about to be drawn, with the two zone sizes it would leave
  var g = E.ghost;
  if (g) {
    c.save();
    c.strokeStyle = g.ok ? accent : "#d9534f";
    c.lineWidth = Math.max(2, L.t * k);
    c.globalAlpha = 0.75;
    if (g.kind === "vwall") {
      var gc = L.cols[g.col];
      c.beginPath();
      c.moveTo(X(g.x), Y(gc.secs[0].y0));
      c.lineTo(X(g.x), Y(gc.secs[gc.secs.length - 1].y1));
      c.stroke();
    } else {
      var full = E.ghostAll,
        gx0 = full ? -it.w / 2 : L.cols[g.col].x0,
        gx1 = full ? it.w / 2 : L.cols[g.col].x1;
      c.beginPath();
      c.moveTo(X(gx0), Y(g.y));
      c.lineTo(X(gx1), Y(g.y));
      c.stroke();
    }
    c.globalAlpha = 1;
    /* When the line landed on something — the middle of the bay, a shelf in
       another column — say so, and for an alignment draw the guide over to the
       column it lined up with, which is the only way to see that it did. */
    if (g.snap === "align" && g.at != null && L.cols[g.at]) {
      var o = L.cols[g.at];
      c.save();
      c.setLineDash([4, 4]);
      c.strokeStyle = accent;
      c.lineWidth = 1;
      c.globalAlpha = 0.6;
      c.beginPath();
      c.moveTo(X(Math.min(o.x0, L.cols[g.col].x0)), Y(g.y));
      c.lineTo(X(Math.max(o.x1, L.cols[g.col].x1)), Y(g.y));
      c.stroke();
      c.restore();
    }
    c.fillStyle = txt;
    c.font = "600 11px system-ui, sans-serif";
    c.textAlign = "center";
    // free sizes are shown to the millimetre, or the readout would lie
    var fmt = function (n) {
      return E.snap ? Math.round(n) : Math.round(n * 10) / 10;
    },
      lab = fmt(g.a) + " | " + fmt(g.b) + (g.snap ? "  " + T("snap_" + g.snap) : "");
    if (g.kind === "vwall") c.fillText(lab, X(g.x), Y(0) - 10);
    else c.fillText(lab, X(L.cols[g.col].x1) + 30, Y(g.y) - 4);
    c.restore();
  }
}

/* Dimension lines the way a shop drawing carries them: a run between two
   ticks with the figure sitting on it. */
function dimTick(c, x0, x1, y, val, col, big) {
  c.save();
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(x1, y);
  c.moveTo(x0, y - 4);
  c.lineTo(x0, y + 4);
  c.moveTo(x1, y - 4);
  c.lineTo(x1, y + 4);
  c.stroke();
  var txt2 = String(val);
  c.font = (big ? "700 12px" : "600 10px") + " Inter, Rubik, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  var tw = c.measureText(txt2).width;
  if (tw + 8 < Math.abs(x1 - x0)) {
    c.clearRect((x0 + x1) / 2 - tw / 2 - 3, y - 7, tw + 6, 14);
    c.fillText(txt2, (x0 + x1) / 2, y);
  } else c.fillText(txt2, (x0 + x1) / 2, y - 9);
  c.restore();
}
function dimTickV(c, y0, y1, x, val, col, big) {
  c.save();
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y0);
  c.lineTo(x, y1);
  c.moveTo(x - 4, y0);
  c.lineTo(x + 4, y0);
  c.moveTo(x - 4, y1);
  c.lineTo(x + 4, y1);
  c.stroke();
  c.translate(x, (y0 + y1) / 2);
  c.rotate(-Math.PI / 2);
  c.font = (big ? "700 12px" : "600 10px") + " Inter, Rubik, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  var txt3 = String(val),
    tw2 = c.measureText(txt3).width;
  if (tw2 + 8 < Math.abs(y1 - y0)) {
    c.clearRect(-tw2 / 2 - 3, -7, tw2 + 6, 14);
    c.fillText(txt3, 0, 0);
  } else c.fillText(txt3, 0, -9);
  c.restore();
}

// Type-specific glyphs, the same ones a joinery elevation would carry.
function drawSecDetail(c, cell, x, y, w, h, k, line) {
  var t = cell.ref.t;
  c.strokeStyle = "rgba(60,60,60,0.45)";
  c.lineWidth = 1;
  if (cell.shelves) {
    for (var i = 1; i <= cell.shelves; i++) {
      var sy = y + h - (h * i) / (cell.shelves + 1);
      c.beginPath();
      if (t === "shoe") {
        c.moveTo(x + 2, sy + 4);
        c.lineTo(x + w - 2, sy - 4);
      } else {
        c.moveTo(x + 2, sy);
        c.lineTo(x + w - 2, sy);
      }
      c.stroke();
    }
  }
  if (cell.drawers) {
    cell.drawers.forEach(function (d) {
      var dy = y + h - (d.y1 - cell.y0) * k,
        dh = (d.y1 - d.y0) * k;
      c.strokeRect(x + 2, dy + 1, w - 4, dh - 2);
      c.beginPath(); // handle mark
      c.moveTo(x + w / 2 - Math.min(18, w / 4), dy + dh / 2);
      c.lineTo(x + w / 2 + Math.min(18, w / 4), dy + dh / 2);
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
    });
  }
  if (t === "hang" || t === "hangS" || t === "hang2") {
    var rails = t === "hang2" ? [0.94, 0.47] : [0.94];
    rails.forEach(function (f) {
      var ry = y + h * (1 - f);
      c.beginPath();
      c.moveTo(x + 3, ry);
      c.lineTo(x + w - 3, ry);
      c.lineWidth = 2.5;
      c.stroke();
      c.lineWidth = 1;
      // a couple of hanger hooks
      for (var i = 1; i <= 3; i++) {
        var hx = x + (w * i) / 4;
        c.beginPath();
        c.moveTo(hx, ry);
        c.lineTo(hx - 6, ry + Math.min(16, h * 0.18));
        c.lineTo(hx + 6, ry + Math.min(16, h * 0.18));
        c.closePath();
        c.stroke();
      }
    });
  }
  if (cell.baskets) {
    for (var b = 0; b < cell.baskets; b++) {
      var by = y + h - ((b + 1) * h) / cell.baskets;
      c.strokeRect(x + 3, by + 2, w - 6, h / cell.baskets - 5);
    }
  }
  /* A television niche is drawn as the set that goes in it — 16:9, to scale,
     with the size in inches — because the only question anyone asks of the
     drawing is "will my TV fit". The cable grommet is on it too, since that is
     a hole somebody has to drill. */
  if (t === "tv") {
    var sw = Math.max(8, w - 8 * (w / (w || 1)) - 8),
      sh = Math.min(h - 6, (sw * 9) / 16);
    if (sh > 8) {
      var sx = x + (w - sw) / 2,
        sy2 = y + h - (h * 0.52 + sh / 2);
      c.fillStyle = "rgba(16,19,24,0.82)";
      c.fillRect(sx, sy2, sw, sh);
      c.strokeStyle = "rgba(60,60,60,0.7)";
      c.strokeRect(sx, sy2, sw, sh);
      if (cell.tvSize && sw > 40 && sh > 18) {
        c.fillStyle = "rgba(255,255,255,0.85)";
        c.font = "600 10px Inter, Rubik, sans-serif";
        c.textAlign = "center";
        c.fillText('~' + cell.tvSize + '"', sx + sw / 2, sy2 + sh / 2);
      }
    }
    c.strokeStyle = "rgba(60,60,60,0.55)";
    c.beginPath(); // the grommet, low and to one side
    c.arc(x + Math.min(14, w * 0.2), y + h - Math.min(12, h * 0.2), 3, 0, Math.PI * 2);
    c.stroke();
  } else if (t === "appl") {
    // the machine's own front, with the feature that identifies it
    c.setLineDash([3, 2]);
    c.strokeRect(x + 2, y + 2, w - 4, h - 4);
    c.setLineDash([]);
    var aH = cell.y1 - cell.y0;
    if (aH >= 72 && aH <= 105) {
      c.beginPath();
      c.arc(x + w / 2, y + h * 0.54, Math.min(w, h) * 0.29, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.strokeRect(x + 5, y + h * 0.28, w - 10, h * 0.5);
      c.beginPath();
      c.lineWidth = 2;
      c.moveTo(x + 6, y + h * 0.18);
      c.lineTo(x + w - 6, y + h * 0.18);
      c.stroke();
      c.lineWidth = 1;
    }
  } else if (t === "laundry" || t === "safe") {
    c.setLineDash([4, 3]);
    c.strokeRect(x + 4, y + 4, w - 8, h - 8);
    c.setLineDash([]);
  }
}

/* Hinged doors get the standard opening triangle; sliding gets arrows. One
   symbol per run of covered compartments — the same runs the 3D build uses, so
   an open niche in a doored column is drawn open here too. */
function drawDoor(c, L, col, X, Y, k, accent) {
  var dr = col.ref.door || { t: "none" };
  if (dr.t === "none" || dr.t === "drawer") return;
  (col.runs || []).forEach(function (run) {
    drawDoorRun(c, L, col, X, Y, k, dr, run);
  });
}

function drawDoorRun(c, L, col, X, Y, k, dr, run) {
  var last = col.secs.length - 1,
    my0 = run.i0 === 0 ? L.yb - L.t : col.secs[run.i0].y0 - L.t / 2,
    my1 = run.i1 === last ? L.yt + L.t : col.secs[run.i1].y1 + L.t / 2,
    y0 = Y(my1),
    y1 = Y(my0),
    // leaves are counted per run in buildDoor; the drawing only needs how many
    // this column's width calls for
    leaves = Math.max(1, dr.leaves || (col.w > STD.maxDoor ? 2 : 1)),
    gapW = ((col.x1 - col.x0) * k) / leaves;
  if (y1 - y0 < 6) return;
  c.save();
  c.strokeStyle = dr.t === "mirror" ? "#8fb6c9" : dr.t === "glass" ? "#7fb2c8" : "rgba(70,80,95,0.75)";
  c.lineWidth = 1.5;
  if (dr.t === "glass" || dr.t === "mirror") {
    c.fillStyle = dr.t === "mirror" ? "rgba(150,190,210,0.22)" : "rgba(140,190,215,0.16)";
    c.fillRect(X(col.x0), y0, (col.x1 - col.x0) * k, y1 - y0);
  }
  for (var i = 0; i < leaves; i++) {
    var lx0 = X(col.x0) + i * gapW,
      lx1 = lx0 + gapW;
    c.strokeRect(lx0 + 1, y0 + 1, gapW - 2, y1 - y0 - 2);
    if (dr.t === "sliding") {
      c.beginPath();
      var my = (y0 + y1) / 2,
        dir = col.i % 2 ? -1 : 1;
      c.moveTo(lx0 + gapW * 0.3, my);
      c.lineTo(lx0 + gapW * 0.7, my);
      c.lineTo(lx0 + gapW * (dir > 0 ? 0.6 : 0.4), my - 6);
      c.stroke();
    } else if (dr.t === "lift") {
      c.beginPath();
      c.moveTo(lx0 + gapW / 2, y1 - 8);
      c.lineTo(lx0 + gapW / 2, y0 + 8);
      c.lineTo(lx0 + gapW / 2 - 5, y0 + 16);
      c.stroke();
    } else {
      // DIN 919 / ISO 128-30 standard: opening triangle vertex points to the hinge
      var hingeLeft = leaves > 1 ? i === 0 : dr.hinge === "L";
      c.setLineDash([5, 4]);
      c.beginPath();
      if (hingeLeft) {
        c.moveTo(lx1 - 1, y0 + 1);
        c.lineTo(lx0 + 2, (y0 + y1) / 2);
        c.lineTo(lx1 - 1, y1 - 1);
      } else {
        c.moveTo(lx0 + 1, y0 + 1);
        c.lineTo(lx1 - 2, (y0 + y1) / 2);
        c.lineTo(lx0 + 1, y1 - 1);
      }
      c.stroke();
      c.setLineDash([]);

      // hardware / handle placement on elevation
      var hwType = L.sp.hw && L.sp.hw.handle;
      if (hwType !== "push") {
        var hxMark = hingeLeft ? lx1 - Math.min(12, gapW * 0.25) : lx0 + Math.min(12, gapW * 0.25);
        var hyMark = (y0 + y1) / 2;
        c.beginPath();
        if (hwType === "knob") {
          c.arc(hxMark, hyMark, 2.5, 0, Math.PI * 2);
          c.fillStyle = "rgba(70,80,95,0.85)";
          c.fill();
        } else {
          var barH = Math.min(28, (y1 - y0) * 0.25);
          c.moveTo(hxMark, hyMark - barH / 2);
          c.lineTo(hxMark, hyMark + barH / 2);
          c.lineWidth = 2.5;
          c.stroke();
          c.lineWidth = 1.5;
        }
      }
    }
  }
  c.restore();
}

/* ================= elevation interaction ================= */

/* One repaint per frame, however many pointer moves arrive in it. */
function queueDraw() {
  if (E.rafPending) return;
  E.rafPending = true;
  requestAnimationFrame(function () {
    E.rafPending = false;
    draw();
  });
}

function toModel(ev) {
  var r = E.cv.getBoundingClientRect(),
    v = E.view;
  return { x: (ev.clientX - r.left - v.ox) / v.k, y: (v.oy - (ev.clientY - r.top)) / v.k };
}

// What is under the pointer: a divider to drag, or a cell / column to select.
function hit(p) {
  var L = E.view.L,
    tol = 7 / E.view.k; // grab band in cm, from a comfortable 7 px
  for (var i = 0; i < L.cols.length; i++) {
    var col = L.cols[i];
    if (i > 0 && Math.abs(p.x - col.x0 + L.t / 2) < tol + L.t / 2 && p.y > L.yb && p.y < L.yt)
      return { kind: "colDiv", i: i };
  }
  for (var ci = 0; ci < L.cols.length; ci++) {
    var c2 = L.cols[ci];
    if (p.x < c2.x0 - L.t || p.x > c2.x1 + L.t) continue;
    // dividers before cells: the top edge of a compartment is also the bottom
    // of the shelf above it, and grabbing the shelf has to win
    for (var si = 1; si < c2.secs.length; si++)
      if (Math.abs(p.y - c2.secs[si].y0 + L.t / 2) < tol + L.t / 2) return { kind: "secDiv", col: ci, i: si };
    for (var sj = 0; sj < c2.secs.length; sj++) {
      var s = c2.secs[sj];
      if (p.y >= s.y0 && p.y <= s.y1) return { kind: "cell", col: ci, sec: sj };
    }
    if (p.y > L.yt) return { kind: "col", col: ci };
  }
  return null;
}

function wireCanvas() {
  var cv = E.cv;
  // only the front elevation is editable — every other view is a projection
  function live() {
    return E.open && E.mode === "2d" && E.axis === "front" && E.view;
  }
  cv.addEventListener("pointerdown", function (e) {
    if (!live()) return;
    var p = toModel(e);
    if (E.tool) {
      act(T(E.tool === "erase" ? "opErase" : "opDraw"));
      if (E.tool === "erase") eraseAt(p);
      else if (E.tool === "vwall") drawVWall(ghostAt(p));
      else drawHWall(ghostAt(p), e.shiftKey);
      return;
    }
    var h = hit(p);
    if (!h) return;
    if (h.kind === "colDiv" || h.kind === "secDiv") {
      cv.setPointerCapture(e.pointerId);
      act(T("opDrag"));
      E.drag = { h: h, start: p, snap: JSON.parse(JSON.stringify(sp().cols)) };
    } else if (h.kind === "cell") {
      E.sel = { col: h.col, sec: h.sec };
      draw();
      fillInspector();
    } else if (h.kind === "col") {
      E.sel = { col: h.col };
      draw();
      fillInspector();
    }
  });
  cv.addEventListener("pointermove", function (e) {
    if (!live()) return;
    var p = toModel(e);
    if (E.tool) {
      // the ghost line is the whole feedback of the tool, so it follows the
      // pointer — but a pointer emits far more moves than the screen has
      // frames, and a repaint here is a full layout + elevation
      E.ghost = E.tool === "erase" ? null : ghostAt(p);
      E.ghostAll = e.shiftKey;
      cv.style.cursor = "crosshair";
      queueDraw();
      return;
    }
    if (!E.drag) {
      var h = hit(p);
      cv.style.cursor = !h ? "default" : h.kind === "colDiv" ? "ew-resize" : h.kind === "secDiv" ? "ns-resize" : "pointer";
      return;
    }
    var d = E.drag,
      cols = sp().cols;
    if (d.h.kind === "colDiv") {
      var i = d.h.i,
        dx = p.x - d.start.x,
        a = d.snap[i - 1].w + dx,
        b = d.snap[i].w - dx;
      if (a >= 12 && b >= 12) {
        cols[i - 1].w = a;
        cols[i].w = b;
        cols[i - 1].fixed = cols[i].fixed = false;
      }
    } else {
      var c2 = cols[d.h.col],
        j = d.h.i,
        dy = p.y - d.start.y,
        sa = d.snap[d.h.col].secs[j - 1].h + dy,
        sb = d.snap[d.h.col].secs[j].h - dy;
      if (sa >= 8 && sb >= 8) {
        c2.secs[j - 1].h = sa;
        c2.secs[j].h = sb;
      }
    }
    normalizeSpec(sp(), E.it.w, E.it.h, E.it.d);
    queueDraw();
  });
  function endDrag() {
    if (!E.drag) return;
    E.drag = null;
    touch();
    changed();
  }
  cv.addEventListener("pointerleave", function () {
    if (E.ghost) {
      E.ghost = null;
      draw();
    }
  });
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("dblclick", function (e) {
    if (!live()) return;
    var h = hit(toModel(e));
    if (!h) return;
    if (h.kind === "cell") {
      var s = sp().cols[h.col].secs[h.sec],
        v = prompt(T("secH") + ' (' + (isEn() ? "cm" : 'ס"מ') + ")", Math.round(s.h));
      if (v != null && fin(+v) && +v > 5) {
        s.h = +v;
        s.fixed = true;
        touch();
        changed();
      }
    } else if (h.kind === "col" || h.kind === "colDiv") {
      var ci = h.col != null ? h.col : h.i,
        c2 = sp().cols[ci],
        v2 = prompt(T("colW") + ' (' + (isEn() ? "cm" : 'ס"מ') + ")", Math.round(c2.w));
      if (v2 != null && fin(+v2) && +v2 > 10) {
        c2.w = +v2;
        c2.fixed = true;
        touch();
        changed();
      }
    }
  });
}

/* ================= inspector ================= */

function row(label, node) {
  var r = el("label", "cb-row", "<span>" + label + "</span>");
  r.appendChild(node);
  return r;
}
function numInput(val, cb, min, max) {
  var i = el("input");
  i.type = "number";
  i.value = Math.round(val * 10) / 10;
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
function select(opts, cur, cb) {
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
function checkbox(label, cur, cb) {
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

function fillInspector() {
  // the history panel is scoped to the selection, so it follows every pick —
  // and the inspector is the one thing every pick refreshes
  if (histPanel) histPanel.refresh();
  var wrap = root.querySelector("#cbInsp"),
    title = root.querySelector("#cbInspTitle");
  wrap.innerHTML = "";
  if (!E.sel || !sp()) {
    title.textContent = T("section");
    wrap.appendChild(el("div", "cb-note", T("nothing")));
    return;
  }
  var col = sp().cols[E.sel.col];
  if (!col) {
    E.sel = { col: 0, sec: 0 };
    col = sp().cols[0];
  }

  if (E.sel.sec != null && !(col.kind && col.kind !== "normal")) {
    var s = col.secs[E.sel.sec];
    if (!s) {
      E.sel.sec = 0;
      s = col.secs[0];
    }
    title.textContent = T("section") + " " + (E.sel.col + 1) + "." + (E.sel.sec + 1);
    /* Type picker. Anything this cabinet cannot physically hold is greyed out
       with the reason on it — a television niche in a 40 cm column, hanging in a
       35 cm deep carcass, a drawer wider than any runner. Width and depth are
       set by the cabinet, so they are hard limits; the required height is
       measured against the whole column rather than this compartment, because a
       compartment grows when you pick something that needs the room. */
    var L0 = layoutCab(E.it),
      fc = fitCtx(L0, L0.cols[E.sel.col]),
      grid = el("div", "cb-typegrid"),
      fam = sp().fam,
      dimmed = 0;
    /* Three tiers, in this order: what this kind of unit is for, what it could
       hold but nobody orders, and what will not physically fit. Only the last is
       unclickable — a bedroom television in a wardrobe is a real request, an
       80 cm hanging rail is not. */
    Object.keys(SEC)
      .map(function (k) {
        var fit = secFit(k, fc.w, fc.colH, fc.d),
          rel = secRelevant(k, fam);
        return { k: k, fit: fit, rel: rel, rank: fit.ok ? (rel ? 0 : 1) : 2 };
      })
      .sort(function (a, b) {
        return a.rank - b.rank;
      })
      .forEach(function (o) {
        var k = o.k,
          m = SEC[k],
          cur = s.t === k;
        if (o.rank > 0) dimmed++;
        // fourteen buttons for what is usually a choice of five: the odd ones
        // are behind "more options" until they are asked for
        if (o.rank > 0 && !E.allTypes && !cur) return;
        var b = btn('<i class="ph ' + m.icon + '"></i><span>' + secLabel(k) + "</span>", function () {
          s.t = k;
          delete s.n;
          delete s.heights;
          delete s.space;
          if (s.h < m.min) s.h = Math.max(s.h, Math.min(m.min, m.def));
          touch();
          changed();
        }, "cb-type" + (cur ? " on" : "") + (o.rank === 1 ? " cb-dim" : o.rank === 2 ? " cb-off" : ""));
        b.style.borderInlineStartColor = m.col;
        if (o.rank === 2) {
          // the current type stays clickable even when it no longer fits, so a
          // design loaded from a file can be inspected and moved off
          b.disabled = !cur;
          b.title = secLabel(k) + " — " + o.fit.why;
        } else if (o.rank === 1) b.title = secLabel(k) + " — " + T("unusualFor") + " " + famLabel(fam);
        grid.appendChild(b);
      });
    wrap.appendChild(grid);
    if (dimmed)
      wrap.appendChild(btn(
        E.allTypes ? T("lessOpts") : T("moreOpts").replace("$1", dimmed),
        function () {
          E.allTypes = !E.allTypes;
          fillInspector();
        },
        "cb-more"
      ));
    if (dimmed && E.allTypes) wrap.appendChild(el("div", "cb-note", T("fitNote")));
    wrap.appendChild(row(T("secH"), numInput(s.h, function (v) {
      s.h = v;
      s.fixed = true;
      touch();
      changed();
    }, 8)));
    if (s.t === "drawers")
      wrap.appendChild(row(T("count"), numInput(s.n || Math.max(1, Math.round(s.h / STD.drawerH)), function (v) {
        s.n = Math.max(1, Math.round(v));
        delete s.heights;
        touch();
        changed();
      }, 1, 8)));
    if (s.t === "shelves" || s.t === "shoe") {
      wrap.appendChild(row(T("count"), numInput(s.n != null ? s.n : Math.max(0, Math.round(s.h / (s.space || STD.shelfSpace)) - 1), function (v) {
        s.n = Math.max(0, Math.round(v));
        touch();
        changed();
      }, 0, 20)));
      wrap.appendChild(row(T("spacing"), numInput(s.space || (s.t === "shoe" ? STD.shoeSpace : STD.shelfSpace), function (v) {
        s.space = v;
        delete s.n;
        touch();
        changed();
      }, 12, 80)));
    }
    if (s.t === "pullout")
      wrap.appendChild(row(T("count"), numInput(s.n || Math.max(1, Math.round(s.h / 24)), function (v) {
        s.n = Math.max(1, Math.round(v));
        touch();
        changed();
      }, 1, 8)));
    var br = el("div", "cb-btnrow");
    br.appendChild(btn('<i class="ph ph-rows-plus-bottom"></i> ' + T("splitSec"), splitSection));
    br.appendChild(btn('<i class="ph ph-trash"></i> ' + T("delSec"), delSection, "btn-danger"));
    wrap.appendChild(br);
  } else {
    title.textContent = T("column") + " " + (E.sel.col + 1);
  }

  /* column block — always shown, since a compartment always belongs to one */
  var head = el("h5", "cb-h5", T("column") + " " + (E.sel.col + 1));
  wrap.appendChild(head);
  wrap.appendChild(row(T("colW"), numInput(col.w, function (v) {
    col.w = v;
    col.fixed = true;
    touch();
    changed();
  }, 12)));
  // the same fit table drives every picker below
  var Lc = layoutCab(E.it),
    cfc = fitCtx(Lc, Lc.cols[E.sel.col]);
  wrap.appendChild(row(T("colKind"), select(Object.keys(COLKIND).map(function (k) {
    return [k, kindLabel(k), kindFit(k, cfc)];
  }), col.kind || "normal", function (v) {
    col.kind = v === "normal" ? undefined : v;
    // a filler is a strip of board, not a cabinet — give it a sane width
    if (v === "filler" && col.w > 15) {
      col.w = 6;
      col.fixed = true;
    }
    touch();
    changed();
  })));
  // a filler or a blind corner has no front and no division to speak of
  var plain = !col.kind || col.kind === "normal";
  // fronts this kind of unit is normally given first, then the rest, then the
  // ones this column cannot take at all
  if (plain) wrap.appendChild(row(T("door"), select(Object.keys(DOORS)
    .map(function (k) {
      var fit = doorFit(k, cfc),
        rel = doorRelevant(k, sp().fam);
      return { k: k, fit: fit, rank: fit.ok ? (rel ? 0 : 1) : 2, rel: rel };
    })
    .sort(function (a, b) { return a.rank - b.rank; })
    .map(function (o) {
      return [o.k, doorLabel(o.k) + (o.rank === 1 ? " ·" : ""), o.fit];
    }), (col.door || {}).t || "none", function (v) {
    col.door = col.door || {};
    col.door.t = v;
    touch();
    changed();
  })));
  if (plain && col.door && ["hinged", "glass", "mirror", "folding"].indexOf(col.door.t) >= 0) {
    // "auto" is the default: one leaf up to a comfortable width, a pair above
    var laid = E.view && E.view.L.cols[E.sel.col],
      autoN = laid ? laid.doorLeaves : 1;
    wrap.appendChild(row(T("leaves"), select(
      [["", T("auto") + " (" + autoN + ")"], ["1", "1"], ["2", "2"]],
      col.door.leaves ? String(col.door.leaves) : "",
      function (v) {
        col.door.leaves = v ? +v : null;
        touch();
        changed();
      })));
    if ((col.door.leaves || autoN) === 1)
      wrap.appendChild(row(T("hinge"), select([["L", T("hingeL")], ["R", T("hingeR")]], col.door.hinge || "R", function (v) {
        col.door.hinge = v;
        touch();
        changed();
      })));
  }
  if (plain) {
    var fill = el("div", "cb-btnrow cb-wrap");
    /* A one-click layout is only offered when its own compartments would fit:
       "hanging" in a 35 cm deep bookcase builds a rail nobody can hang on. */
    [["fillHang", "hang", "hangS"], ["fillMix", "mix", "drawers"], ["fillShelf", "shelf", "shelves"], ["fillDraw", "draw", "drawers"]].forEach(function (f) {
      var fit = secFit(f[2], cfc.w, cfc.colH, cfc.d),
        b = btn(T(f[0]), function () {
          refillColumn(col, f[1]);
        }, "cb-sm" + (fit.ok ? "" : " cb-off"));
      if (!fit.ok) {
        b.disabled = true;
        b.title = fit.why;
      }
      fill.appendChild(b);
    });
    wrap.appendChild(el("div", "cb-note", T("fillCol")));
    wrap.appendChild(fill);
  }
  var br2 = el("div", "cb-btnrow");
  br2.appendChild(btn('<i class="ph ph-columns-plus-right"></i> ' + T("splitCol"), splitColumn, "cb-sm"));
  br2.appendChild(btn('<i class="ph ph-copy"></i> ' + T("dupCol"), dupColumn, "cb-sm"));
  br2.appendChild(btn('<i class="ph ph-trash"></i> ' + T("delCol"), delColumn, "cb-sm btn-danger"));
  wrap.appendChild(br2);

  /* carcass block */
  var ch = el("h5", "cb-h5", T("carcass"));
  wrap.appendChild(ch);
  /* How much carcass there is at all — a closed box, the same box with no back,
     or no box: bare shelves on concealed brackets. */
  wrap.appendChild(row(T("carcassMode"), select(Object.keys(CARCASS).map(function (k) {
    return [k, carcassLabel(k), carcassFit(k, cfc)];
  }), sp().carcass || "full", function (v) {
    var s2 = sp(),
      was = s2.carcass || "full",
      f2 = FAM[s2.fam] || FAM.wardrobe;
    s2.carcass = v;
    if (v === "float") {
      // bare shelves are a slab, not carcass board; they hang on the wall and
      // there is nothing on them to open
      if (s2.panel < 3) s2.panel = STD.floatT;
      if (!s2.elev) s2.elev = 90;
      s2.cols.forEach(function (c2) {
        c2.door = { t: "none", leaves: null, hinge: "R" };
      });
    } else {
      /* Back to being a box. Undo what floating did — a 38 mm carcass hung 90 cm
         off the floor with no plinth is nobody's idea of a cabinet. */
      if (was === "float") {
        if (s2.panel >= 3) s2.panel = STD.panel;
        s2.elev = f2.elev || 0;
        s2.plinthType = f2.plinth ? "recessed" : "none";
        s2.plinth = f2.plinth || 0;
      }
      s2.back = v === "open" ? 0 : s2.back || STD.back;
    }
    touch();
    changed(true);
  })));
  wrap.appendChild(row(T("panel"), numInput(sp().panel, function (v) {
    sp().panel = v;
    changed();
  }, 0.8, 4)));
  wrap.appendChild(row(T("back"), numInput(sp().back, function (v) {
    sp().back = v;
    changed();
  }, 0.3, 3)));
  wrap.appendChild(row(T("plinthType"), select([
    ["recessed", isEn() ? "Recessed" : "שקוע (סטנדרט)"],
    ["flush", isEn() ? "Flush" : "בקו החזית"],
    ["legs", isEn() ? "Legs" : "רגליות"],
    ["none", isEn() ? "None" : "ללא"],
  ], sp().plinthType, function (v) {
    sp().plinthType = v;
    if (v === "none") sp().plinth = 0;
    else if (!sp().plinth) sp().plinth = (FAM[sp().fam] || FAM.wardrobe).plinth || 8;
    changed();
  })));
  if (sp().plinthType !== "none")
    wrap.appendChild(row(T("plinth"), numInput(sp().plinth, function (v) {
      sp().plinth = v;
      changed();
    }, 2, 30)));
  wrap.appendChild(row(T("gap"), numInput(sp().gap, function (v) {
    sp().gap = v;
    changed();
  }, 0, 2)));
  // wall units and floating vanities hang off the floor
  wrap.appendChild(row(T("elev"), numInput(sp().elev || 0, function (v) {
    sp().elev = v;
    changed(true);
  }, 0, 250)));
}

/* --- drawing partitions ---
   The blueprint tool draws a wall and the room appears; here a partition is
   drawn on the elevation and the zone appears. A vertical one splits the
   column it lands in (the two halves keep the contents), a horizontal one
   splits the compartment under the pointer — with Shift, the same height in
   every column, which is how a full-width shelf is meant to be drawn. */
function setTool(t) {
  E.tool = t || null;
  E.ghost = null;
  if (!root) return;
  root.querySelectorAll("#cbTools button").forEach(function (b) {
    var selected = (b.getAttribute("data-tool") || null) === E.tool;
    b.classList.toggle("on", selected);
    b.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  syncHint();
  if (E.cv) E.cv.style.cursor = E.tool ? "crosshair" : "default";
  if (E.view) draw(); // on the very first open the canvas has no transform yet
}

// Where would a partition drawn at p land? Also what the ghost line draws.
/* Freehand is not how a cabinet gets divided — a joiner lands on the middle of
   the bay, on the line of the shelf next door, or on a round number. So the
   pointer is a suggestion and these candidates are what it lands on, in that
   order of authority; the ghost says which one it took. */
/* Not purely nearest: lining up with the shelf next door or halving the bay is
   worth giving up a little accuracy for, so those pull harder than a round
   number that happens to be a few millimetres closer. */
var SNAP_PULL = { align: 0.5, mid: 0.45, eq: 0.3, round: 0 };
function pickSnap(raw, cands, tol) {
  // switched off, the pointer is the answer — to a tenth of a millimetre, so a
  // hand-measured 47.3 stays 47.3 and never creeps to 47
  if (!E.snap) return { v: Math.round(raw * 100) / 100, why: null };
  var best = null;
  cands.forEach(function (c) {
    var dist = Math.abs(raw - c.v);
    if (dist > tol) return;
    var score = dist - (SNAP_PULL[c.why] || 0) * tol;
    if (!best || score < best.score - 0.001) best = { v: c.v, why: c.why, at: c.at, score: score };
  });
  // failing all of them, whole centimetres — never 37.4183
  return best || { v: Math.round(raw), why: null };
}
function roundCands(from, lo, hi, why) {
  var out = [];
  for (var v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) out.push({ v: from + v, why: why });
  return out;
}

function ghostAt(p) {
  var L = E.view && E.view.L;
  if (!L) return null;
  var tol = 8 / E.view.k; // a comfortable 8 px, in centimetres
  if (E.tool === "vwall") {
    for (var i = 0; i < L.cols.length; i++) {
      var c = L.cols[i];
      if (p.x < c.x0 || p.x > c.x1) continue;
      var t = L.t || sp().panel,
        cands = [{ v: (c.x0 + c.x1) / 2, why: "mid" }];
      // a bay that repeats a neighbour's width, measured from either edge
      L.cols.forEach(function (o) {
        if (o === c) return;
        cands.push({ v: c.x0 + o.w + t / 2, why: "eq", at: o.i });
        cands.push({ v: c.x1 - o.w - t / 2, why: "eq", at: o.i });
      });
      cands = cands.concat(roundCands(c.x0, 5, c.w - 5, "round"));
      var sn = pickSnap(p.x, cands, tol),
        a = sn.v - c.x0 - t / 2,
        b = c.x1 - sn.v - t / 2;
      return { kind: "vwall", col: i, x: sn.v, snap: sn.why, at: sn.at, ok: a >= 12 && b >= 12, a: a, b: b };
    }
    return null;
  }
  if (E.tool === "hwall") {
    for (var ci = 0; ci < L.cols.length; ci++) {
      var c2 = L.cols[ci];
      if (p.x < c2.x0 - L.t || p.x > c2.x1 + L.t) continue;
      for (var sj = 0; sj < c2.secs.length; sj++) {
        var s = c2.secs[sj];
        if (p.y < s.y0 || p.y > s.y1) continue;
        var t2 = sp().panel,
          hc = [];
        // a shelf that lines up with one in another column reads as one line
        // across the piece — that is worth more than any round number
        L.cols.forEach(function (o) {
          if (o === c2) return;
          o.secs.forEach(function (os, k) {
            // y0 is the top face of that shelf's board; the cut that produces
            // it sits half a board lower, which is what has to match
            if (k > 0 && os.y0 > s.y0 && os.y0 < s.y1) hc.push({ v: os.y0 - t2 / 2, why: "align", at: o.i });
          });
        });
        hc.push({ v: (s.y0 + s.y1) / 2, why: "mid" });
        hc = hc.concat(roundCands(0, s.y0 + 5, s.y1 - 5, "round"));
        var sn2 = pickSnap(p.y, hc, tol),
          ha = sn2.v - s.y0 - t2 / 2,
          hb = s.y1 - sn2.v - t2 / 2;
        return {
          kind: "hwall", col: ci, sec: sj, y: sn2.v, snap: sn2.why, at: sn2.at,
          ok: ha >= 8 && hb >= 8, a: ha, b: hb,
        };
      }
    }
    return null;
  }
  return null;
}

function drawVWall(g) {
  if (!g || !g.ok) return flashHint(T("tooSmall"));
  touch();
  var cols = sp().cols,
    c = cols[g.col],
    copy = JSON.parse(JSON.stringify(c));
  c.w = g.a;
  copy.w = g.b;
  delete c.fixed;
  delete copy.fixed;
  cols.splice(g.col + 1, 0, copy);
  E.sel = { col: g.col + 1, sec: 0 };
  changed();
}

/* One height, every column it can be drawn in — a shelf across the whole piece
   is one gesture, and a column where it would leave a sliver simply keeps its
   compartment whole rather than blocking the others. */
function drawHWall(g, all) {
  if (!g) return;
  if (!all && !g.ok) return flashHint(T("tooSmall"));
  var y = g.y,
    L = E.view.L,
    t = sp().panel,
    targets = all ? L.cols.map(function (_, i) { return i; }) : [g.col],
    done = 0;
  touch();
  targets.forEach(function (ci) {
    var lc = L.cols[ci],
      col = sp().cols[ci];
    for (var j = 0; j < lc.secs.length; j++) {
      var ls = lc.secs[j];
      if (y < ls.y0 || y > ls.y1) continue;
      var a = y - ls.y0 - t / 2,
        b = ls.y1 - y - t / 2;
      if (a < 8 || b < 8) return;
      var s = col.secs[j],
        copy = JSON.parse(JSON.stringify(s));
      s.h = a;
      copy.h = b;
      delete s.fixed;
      delete copy.fixed;
      col.secs.splice(j + 1, 0, copy);
      done++;
      return;
    }
  });
  if (!done) return flashHint(T("tooSmall"));
  // silently doing less than asked is worse than saying so
  if (done < targets.length)
    flashHint(T("partial").replace("$1", done).replace("$2", targets.length));
  E.sel = { col: g.col, sec: 0 };
  changed();
}

// Erase: click a partition and the two zones it separated become one.
function eraseAt(p) {
  var h = hit(p);
  if (!h) return;
  if (h.kind === "colDiv") {
    var cols = sp().cols;
    if (cols.length <= 1) return;
    touch();
    /* Two bays become one, and one of the two interiors has to go. Losing the
       plainer one is nearly always what was meant — you rub out a divider to
       let the good side spread, not to keep the empty side. */
    var a = cols[h.i - 1],
      b = cols[h.i],
      keep = b.secs.length > a.secs.length ? b : a;
    keep.w = a.w + b.w + sp().panel;
    delete keep.fixed;
    cols.splice(h.i - 1, 2, keep);
    E.sel = { col: h.i - 1, sec: 0 };
    changed();
  } else if (h.kind === "secDiv") {
    var col2 = sp().cols[h.col];
    if (!col2 || col2.secs.length <= 1) return;
    touch();
    var sa = col2.secs[h.i - 1],
      sb = col2.secs[h.i],
      keepS = sb.h > sa.h ? sb : sa;
    keepS.h = sa.h + sb.h + sp().panel;
    delete keepS.fixed;
    col2.secs.splice(h.i - 1, 2, keepS);
    E.sel = { col: h.col, sec: h.i - 1 };
    changed();
  }
}

/* --- structural edits --- */
function refillColumn(col, mode) {
  act(T("fillCol"));
  touch();
  col.secs = columnFill(mode, E.view.L.yt - E.view.L.yb, sp().panel);
  E.sel = { col: E.sel.col, sec: 0 };
  changed();
}
function splitSection() {
  act(T("splitSec"));
  touch();
  var col = sp().cols[E.sel.col],
    i = E.sel.sec,
    s = col.secs[i],
    half = (s.h - sp().panel) / 2;
  if (half < 10) return;
  s.h = half;
  delete s.fixed;
  col.secs.splice(i + 1, 0, { t: "shelves", h: half });
  changed();
}
function delSection() {
  act(T("delSec"));
  touch();
  var col = sp().cols[E.sel.col];
  if (!col || col.secs.length <= 1) return;
  col.secs.splice(E.sel.sec, 1);
  E.sel.sec = Math.min(E.sel.sec, col.secs.length - 1);
  changed();
}
function splitColumn() {
  act(T("splitCol"));
  touch();
  var cols = sp().cols,
    i = E.sel.col,
    c = cols[i],
    half = (c.w - sp().panel) / 2;
  if (half < 15) return;
  c.w = half;
  delete c.fixed;
  var copy = JSON.parse(JSON.stringify(c));
  copy.w = half;
  cols.splice(i + 1, 0, copy);
  changed();
}
function dupColumn() {
  act(T("dupCol"));
  touch();
  var cols = sp().cols,
    copy = JSON.parse(JSON.stringify(cols[E.sel.col]));
  delete copy.fixed;
  cols.splice(E.sel.col + 1, 0, copy);
  changed();
}
function delColumn() {
  act(T("delCol"));
  touch();
  var cols = sp().cols;
  if (cols.length <= 1) return;
  cols.splice(E.sel.col, 1);
  E.sel = { col: Math.max(0, E.sel.col - 1), sec: 0 };
  changed();
}

/* ================= appearance ================= */

function swatch(id, cur, cb) {
  var f = FINISH[id],
    b = el("button", "cb-sw" + (cur === id ? " on" : ""));
  b.title = finishLabel(id);
  if (f.col == null) b.classList.add("cb-sw-auto");
  else b.style.background = "#" + f.col.toString(16).padStart(6, "0");
  b.addEventListener("click", function () {
    cb(id);
  });
  return b;
}

function fillLook() {
  var wrap = root.querySelector("#cbLook");
  if (!sp()) return;
  wrap.innerHTML = "";
  var s = sp();
  // front style — a framed or reeded front needs a leaf wide enough to frame
  var Lf = layoutCab(E.it),
    ffc = fitCtx(Lf, null),
    styles = el("div", "cb-typegrid");
  Object.keys(FRONTS).forEach(function (k) {
    var fit = frontFit(k, ffc),
      cur = s.front === k,
      b = btn("<span>" + frontLabel(k) + "</span>", function () {
        s.front = k;
        changed();
      }, "cb-type" + (cur ? " on" : "") + (fit.ok ? "" : " cb-off"));
    if (!fit.ok) {
      b.disabled = !cur;
      b.title = frontLabel(k) + " — " + fit.why;
    }
    styles.appendChild(b);
  });
  wrap.appendChild(styles);
  // two independent colour rows: fronts and carcass
  [["finFront", T("finFront")], ["finCarcass", T("finCarcass")]].forEach(function (row2) {
    var lab = el("div", "cb-note", row2[1]),
      strip = el("div", "cb-swatches");
    Object.keys(FINISH).forEach(function (k) {
      strip.appendChild(swatch(k, s[row2[0]], function (v) {
        s[row2[0]] = v;
        changed();
      }));
    });
    wrap.appendChild(lab);
    wrap.appendChild(strip);
  });

  /* --- what it is actually made of ---
     A finish is what the piece looks like; this is which sheet it is cut from,
     and therefore what it costs and how it nests. Picking a carcass board also
     sets the board thickness, because those are not two separate decisions. */
  wrap.appendChild(el("h5", "cb-h5", T("stock")));
  [["carcass", "stCarcass", null], ["front", "stFront", STD.doorT], ["back", "stBack", null]]
    .concat(s.top ? [["top", "stTop", null]] : [])
    .forEach(function (r) {
      var pool = sheetsFor(r[0]).filter(function (sh) {
        return r[2] == null || Math.abs(sh.t - r[2]) < 0.35;
      });
      if (!pool.length) return;
      wrap.appendChild(row(T(r[1]), select(
        pool.map(function (sh) {
          return [sh.id, sheetLabel(sh, isEn()) + " · ₪" + sheetPrice(sh)];
        }),
        (s.stock || {})[r[0]],
        function (v) {
          var sh = sheetById(v);
          s.stock = s.stock || {};
          s.stock[r[0]] = v;
          if (sh) {
            if (r[0] === "carcass") s.panel = sh.t;
            else if (r[0] === "back" && s.back > 0) s.back = sh.t;
            else if (r[0] === "top" && s.top > 0) s.top = sh.t;
          }
          changed(true);
        },
      )));
    });
  wrap.appendChild(row(T("stBand"), select(
    BANDING.map(function (b) {
      return [b.id, bandLabel(b, isEn()) + " · ₪" + bandPPM(b) + "/m"];
    }),
    s.band,
    function (v) {
      s.band = v;
      changed();
    },
  )));
  if (s.top)
    wrap.appendChild(row(T("stProfile"), select(
      PROFILES.map(function (p) {
        return [p.id, profileLabel(p, isEn()) + (p.ppm ? " · ₪" + profilePPM(p) + "/m" : "")];
      }),
      s.profile,
      function (v) {
        s.profile = v;
        changed();
      },
    )));
}

function fillTechnical() {
  var wrap = root && root.querySelector("#cbTechnical");
  if (!wrap || !sp()) return;
  wrap.innerHTML = "";
  var s = sp();
  wrap.appendChild(el("div", "cb-note", isEn()
    ? "Manufacturing values drive the same cabinet model, cut list and quote."
    : "ערכי הייצור מניעים את אותו מודל, כתב כמויות ותמחור."));
  wrap.appendChild(row(T("panel"), numInput(s.panel, function (v) {
    act(T("panel")); s.panel = v; changed(true);
  }, 0.8, 4)));
  wrap.appendChild(row(isEn() ? "Shelf board" : "עובי מדף", numInput(s.shelf || s.panel, function (v) {
    act(isEn() ? "Shelf board" : "עובי מדף"); s.shelf = v; changed(true);
  }, 0.8, 4)));
  wrap.appendChild(row(T("back"), numInput(s.back, function (v) {
    act(T("back")); s.back = v; changed(true);
  }, 0.3, 3)));
  wrap.appendChild(row(T("plinth"), numInput(s.plinth || 0, function (v) {
    act(T("plinth")); s.plinth = v; s.plinthType = v > 0 ? (s.plinthType === "none" ? "recessed" : s.plinthType) : "none"; changed(true);
  }, 0, 30)));
  wrap.appendChild(row(T("gap"), numInput(s.gap, function (v) {
    act(T("gap")); s.gap = v; changed();
  }, 0, 2)));
  wrap.appendChild(row(T("spacing"), numInput(s.space || STD.shelfSpace, function (v) {
    act(T("spacing")); s.space = v; changed();
  }, 12, 80)));
  wrap.appendChild(el("h5", "cb-h5", T("stock")));
  [["carcass", "stCarcass"], ["back", "stBack"]].forEach(function (entry) {
    var pool = sheetsFor(entry[0]);
    if (!pool.length) return;
    wrap.appendChild(row(T(entry[1]), select(pool.map(function (sheet) {
      return [sheet.id, sheetLabel(sheet, isEn()) + " · ₪" + sheetPrice(sheet)];
    }), (s.stock || {})[entry[0]], function (value) {
      var sheet = sheetById(value);
      s.stock = s.stock || {};
      s.stock[entry[0]] = value;
      if (sheet && entry[0] === "carcass") { s.panel = sheet.t; s.shelf = sheet.t; }
      if (sheet && entry[0] === "back" && s.back > 0) s.back = sheet.t;
      act(T(entry[1])); changed(true);
    })));
  });
  var price = el("div", "cb-technical-price");
  price.textContent = T("total") + " · ₪" + cabPrice(E.it).toLocaleString("en-US");
  wrap.appendChild(price);
}

/* ================= checks ================= */

function fillChecks() {
  var wrap = root.querySelector("#cbChecks"),
    badge = root.querySelector("#cbChkBadge");
  if (!sp()) return;
  var list = checkCab(E.it, ceilingHeight()),
    bad = list.filter(function (c) {
      return c.level !== "info";
    }).length;
  badge.textContent = bad ? String(bad) : "";
  badge.className = "cb-badge" + (bad ? " on" : "");
  // a real fault lights its icon red wherever you happen to be looking
  var ib = root.querySelector('.cb-icons button[data-tab="checks"]');
  if (ib) ib.classList.toggle("cb-alert", list.some(function (c) { return c.level === "err"; }));
  wrap.innerHTML = "";
  if (!list.length) {
    wrap.appendChild(el("div", "cb-note cb-ok", "✓ " + T("checksOk")));
    return;
  }
  var order = { err: 0, warn: 1, info: 2 };
  list
    .slice()
    .sort(function (a, b) {
      return order[a.level] - order[b.level];
    })
    .forEach(function (c) {
      var row2 = el("div", "cb-check cb-" + c.level, c.msg);
      if (c.col != null)
        row2.addEventListener("click", function () {
          E.sel = { col: c.col, sec: 0 };
          draw();
          fillInspector();
        });
      wrap.appendChild(row2);
    });
}

/* ================= my presets ================= */

var LS_PRESETS = "home3d_cab_presets";
function userPresets() {
  try {
    return JSON.parse(localStorage.getItem(LS_PRESETS) || "[]");
  } catch (e) {
    return [];
  }
}
function saveUserPresets(list) {
  try {
    localStorage.setItem(LS_PRESETS, JSON.stringify(list));
  } catch (e) {
    /* a full quota is not worth breaking the designer over */
  }
}
function saveUserPreset() {
  var name = prompt(T("presetName"), presetLabel(presetById(sp().preset) || { he: "", en: "" }) || "");
  if (!name) return;
  // prompt text is free-form: cap length and strip control chars so a pasted
  // name cannot blow up the list or become an accidental HTML injection vector
  // when older code paths still concatenate into innerHTML.
  name = String(name).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
  if (!name) return;
  var list = userPresets();
  var safeId = name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 20) || "preset";
  list.unshift({ id: "u" + list.length + "_" + safeId, name: name, cab: JSON.parse(JSON.stringify(sp())), w: E.it.w, h: E.it.h, d: E.it.d });
  saveUserPresets(list.slice(0, 30));
  fillMine();
  flashHint(T("savePreset") + " ✓");
}
function fillMine() {
  var wrap = root.querySelector("#cbMine");
  wrap.innerHTML = "";
  var list = userPresets();
  if (!list.length) {
    wrap.appendChild(el("div", "cb-note", "—"));
    return;
  }
  list.forEach(function (u, i) {
    if (!matches(u && u.name)) return;
    var card = el("div", "cb-preset cb-mine");
    // Build with textContent — preset names come from prompt() and must never
    // be interpolated into innerHTML (stored XSS if a name contains markup).
    var top = el("div", "cb-p-top");
    top.appendChild(el("i", "ph ph-bookmark-simple"));
    var title = document.createElement("b");
    title.textContent = u && u.name != null ? String(u.name) : "";
    top.appendChild(title);
    var note = el("div", "cb-p-note");
    note.textContent =
      Math.round(Number(u.w) || 0) + "×" + Math.round(Number(u.d) || 0) + "×" + Math.round(Number(u.h) || 0);
    card.appendChild(top);
    card.appendChild(note);
    var del = btn('<i class="ph ph-x"></i>', function (ev) {
      ev.stopPropagation();
      var l2 = userPresets();
      l2.splice(i, 1);
      saveUserPresets(l2);
      fillMine();
    }, "cb-mine-del");
    del.title = T("delPreset");
    card.appendChild(del);
    card.addEventListener("click", function () {
      // a saved design is a design, not a rule — it is re-fitted to whatever
      // size this cabinet is, and never re-planned behind the user's back
      var cab = JSON.parse(JSON.stringify(u.cab));
      cab.auto = false;
      E.it.cab = cab;
      normalizeSpec(cab, E.it.w, E.it.h, E.it.d);
      E.sel = { col: 0, sec: 0 };
      fillPresets();
      fillFamilies();
      changed(true);
    });
    wrap.appendChild(card);
  });
}

/* ================= hardware ================= */

function fillHardware() {
  var wrap = root.querySelector("#cbHw");
  if (!sp()) return;
  wrap.innerHTML = "";
  var hw = sp().hw;
  function pick(key, group, label) {
    wrap.appendChild(row(label, select(Object.keys(HW[group]).map(function (k) {
      return [k, hwLabel(group, k)];
    }), hw[key], function (v) {
      hw[key] = v;
      changed();
    })));
  }
  pick("handle", "handle", T("handle"));
  pick("finish", "finish", T("finish"));
  pick("hinge", "hinge", T("hingeHw"));
  pick("slide", "slide", T("slide"));
  pick("rail", "rail", T("rail"));
  var cbs = el("div", "cb-btnrow cb-wrap");
  cbs.appendChild(checkbox(T("led"), hw.led, function (v) {
    hw.led = v;
    changed();
  }));
  cbs.appendChild(checkbox(T("mirrorIn"), hw.mirrorInside, function (v) {
    hw.mirrorInside = v;
    changed();
  }));
  cbs.appendChild(checkbox(T("lock"), hw.lock, function (v) {
    hw.lock = v;
    changed();
  }));
  wrap.appendChild(cbs);
}

/* ================= BOM ================= */

// one table of part names, in cabinet.js, so the BOM here, the cut plan and the
// CSV all call a divider a divider
var roleLabel = roleLabelHe;

function fillBOM() {
  var wrap = root.querySelector("#cbBom");
  if (!sp()) return;
  wrap.innerHTML = "";
  var L = layoutCab(E.it),
    boards = cutList(E.it, L),
    hwl = hardwareList(E.it, L);
  var tb = el("table", "cb-bom");
  tb.innerHTML = "<thead><tr><th>" + T("boards") + "</th><th>" + T("qty") + "</th></tr></thead>";
  var body = el("tbody");
  boards.forEach(function (r) {
    var tr = el("tr"),
      sh = r.sheet ? sheetById(r.sheet) : null;
    // the banded edge is part of the part: a shelf 900 long with 0.9 m of edge
    // on it is a different item to order than the same shelf with none
    tr.innerHTML =
      "<td>" + roleLabel(r.role) +
      ' <span class="cb-dim">' + Math.round(r.l * 10) + "×" + Math.round(r.w * 10) + "×" + Math.round(r.t * 10) +
      (r.bandEach ? " · " + T("bandTotal") + " " + r.bandEach.toFixed(2) + "m" : "") +
      (sh ? "<br>" + sheetLabel(sh, isEn()) : "") +
      "</span></td><td>" + r.qty + "</td>";
    body.appendChild(tr);
  });
  var hdr = el("tr", "cb-bom-head");
  hdr.innerHTML = "<td colspan=2>" + T("hwList") + "</td>";
  body.appendChild(hdr);
  hwl.forEach(function (r) {
    var tr = el("tr");
    tr.innerHTML = "<td>" + r.label + "</td><td>" + r.qty + "</td>";
    body.appendChild(tr);
  });
  tb.appendChild(body);
  wrap.appendChild(tb);
  var tot = el("div", "cb-total"),
    price = cabPrice(E.it, L);
  tot.innerHTML = "<span>" + T("total") + "</span><b>₪" + price.toLocaleString("en-US") + "</b>";
  wrap.appendChild(tot);
  // folded away, the section still has to carry the one number people want
  var bb = root.querySelector("#cbBomBadge");
  if (bb) bb.textContent = "₪" + price.toLocaleString("en-US");
}

/* The elevation as a shop drawing: white background, a title block with the
   sizes and the finish, and the same drawing the designer shows. */
function exportPNG() {
  var src = E.cv,
    pad = 26,
    head = 54,
    out = document.createElement("canvas");
  out.width = src.width + pad * 2;
  out.height = src.height + pad * 2 + head;
  var c = out.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(src, pad, pad + head);
  c.fillStyle = "#1b1f24";
  c.textBaseline = "middle";
  c.direction = isEn() ? "ltr" : "rtl";
  c.textAlign = isEn() ? "left" : "right";
  var x = isEn() ? pad : out.width - pad;
  c.font = "700 22px Inter, Rubik, sans-serif";
  c.fillText(T("title") + " · " + famLabel(sp().fam), x, pad + 14);
  c.font = "500 14px Inter, Rubik, sans-serif";
  c.fillStyle = "#5b636b";
  c.fillText(
    Math.round(E.it.w) + "×" + Math.round(E.it.d) + "×" + Math.round(E.it.h) +
      "  ·  " + cabSummary(E.it) + "  ·  " + frontLabel(sp().front) + "  ·  ₪" + cabPrice(E.it).toLocaleString("en-US"),
    x, pad + 38,
  );
  c.strokeStyle = "#c9ced4";
  c.lineWidth = 1;
  c.strokeRect(pad * 0.5, pad * 0.5, out.width - pad, out.height - pad);
  var a = document.createElement("a");
  a.href = out.toDataURL("image/png");
  a.download = "cabinet-elevation.png";
  a.click();
}

/* The cut list as a workshop would want it: millimetres, the sheet each part
   comes off, and the metres of banding per part. */
function exportBOM() {
  var rows = [[
    isEn() ? "Part" : "פריט",
    isEn() ? "Length (mm)" : 'אורך (מ"מ)',
    isEn() ? "Width (mm)" : 'רוחב (מ"מ)',
    isEn() ? "Thk (mm)" : 'עובי (מ"מ)',
    T("qty"),
    isEn() ? "Sheet material" : "חומר גלם",
    isEn() ? "Banding (m each)" : "קנט (מ׳ ליחידה)",
  ]];
  cutList(E.it).forEach(function (r) {
    var sh = r.sheet ? sheetById(r.sheet) : null;
    rows.push([
      roleLabel(r.role), Math.round(r.l * 10), Math.round(r.w * 10), Math.round(r.t * 10), r.qty,
      sh ? sheetLabel(sh, isEn()) : "", r.bandEach || "",
    ]);
  });
  rows.push([]);
  rows.push([T("hwList"), "", "", "", T("qty")]);
  hardwareList(E.it).forEach(function (r) {
    rows.push([r.label, "", "", "", r.qty]);
  });
  rows.push([]);
  var band = bandById(sp().band);
  rows.push([T("bandTotal") + (band ? " · " + bandLabel(band, isEn()) : ""), "", "", "", bandMeters(E.it) + " m"]);
  rows.push([T("total"), "", "", "", cabPrice(E.it)]);
  var csv = rows
    .map(function (r) {
      return r
        .map(function (c) {
          return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
        })
        .join(",");
    })
    .join("\r\n");
  var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "cabinet-bom.csv";
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* ================= 3D preview ================= */

function initPreview() {
  E.pv = createEditorView({
    canvas: root.querySelector("#cbPrev"),
    fov: 42,
    ambient: 0.6, keyLight: 0.95, fill: 0.35,
    az: 0.55, el: 0.28, dist: 420,
    minEl: -0.2, maxEl: 1.3, minDist: 60, maxDist: 2500,
    pad: 24, ratio: 0.82,
    // the big view is framed with room for an open door to swing into
    bigZoom: 1.3,
    // centre on where the piece actually is — a wall unit hangs at 145
    center: function () {
      return (sp() && sp().elev ? sp().elev : 0) + (E.it ? E.it.h / 2 : 0);
    },
    active: function () {
      return E.open && !!E.it;
    },
  });
}

function updatePreview() {
  if (!E.pv || !E.it) return;
  // frame the piece for the size it now is
  E.pv.frame(Math.max(E.it.w * 0.95, E.it.h) * 1.35);
  // buildItem, not build(): it sets the item's style variant and clears it
  // again, which is the only correct way to render a piece
  E.pv.rebuild(function (grp) { buildItem(grp, E.it); });
}

function renderPreview() {
  if (E.pv) E.pv.render();
}


/* ================= entry points ================= */

export function initCabinetUI() {
  // "design this cabinet" on the item inspector — enabled for any piece, since
  // converting a plain wardrobe into a modular one is the usual way in
  var host = document.getElementById("itemProps");
  if (host) {
    var rowEl = el("div", "btn-row");
    var b = btn('<i class="ph ph-lockers"></i> <span>' + T("title") + "</span>", function () {
      if (S.sel && S.sel.kind === "item" && S.sel.ref) openCabinet(S.sel.ref);
    }, "btn-accent");
    b.id = "cabDesignBtn";
    b.style.width = "100%";
    rowEl.appendChild(b);
    onLangChange(function () {
      b.querySelector("span").textContent = T("title");
    });
    // sit right under the size fields rather than at the very bottom
    var anchor = document.getElementById("i_variant_box");
    if (anchor && anchor.parentNode === host) host.insertBefore(rowEl, anchor.nextSibling);
    else host.appendChild(rowEl);
  }

  /* And the other way in: a cabinet that starts as nothing. The library panel
     is where a new piece comes from, so the button lives beside the model
     editor's — it drops a fresh unit in the plan and opens it free-form and
     empty, with no type and nothing inside. */
  var lib = document.querySelector(".furn-panel") || document.querySelector(".furn-wrap");
  if (lib) {
    var nb = btn('<i class="ph ph-selection-plus"></i> <span>' + T("newCab") + "</span>", newCabinet, "");
    nb.id = "cabNewBtn";
    nb.style.width = "100%";
    nb.style.marginTop = "5px";
    lib.appendChild(nb);
    onLangChange(function () {
      nb.querySelector("span").textContent = T("newCab");
    });
  }
}

/* A cabinet from absolute zero: a new item in the plan, free-form, one empty
   bay, straight into the drawing tools. */
function newCabinet() {
  import("./ui.js").then(function (m) {
    m.addFurnItem("cabsys");
    var it = S.sel && S.sel.kind === "item" ? S.sel.ref : null;
    if (!it) return;
    var f = FAM.free;
    it.w = f.w;
    it.h = f.h;
    it.d = f.d;
    it.cab = makeBlankSpec("free", it.w, it.h, it.d);
    openCabinet(it);
    setTool("vwall");
  });
}

// Used by the action dispatcher (data-act="cabDesign") and the library panel.
export function openCabinetForSelection() {
  if (S.sel && S.sel.kind === "item" && S.sel.ref) openCabinet(S.sel.ref);
}
export function isCabinetOpen() {
  return E.open;
}
