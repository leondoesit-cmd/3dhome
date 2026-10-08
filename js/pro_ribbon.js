/* The pro ribbon: every planner tool on one tabbed ribbon (desktop), the
 * same catalog as an "All tools" section in the phone Tools sheet, and the
 * model-editor and cabinet-designer tools inside the app-wide ⌘K search.
 *
 * Nothing here implements a tool. Each entry of js/pro_catalog.js names the
 * control, action or command that already does the work, and runProBinding()
 * only reaches it — so the ribbon, the rail, the phone sheet, search and the
 * AI helper can never disagree about what a tool does. */
import { PRO_CATALOG, PRO_EDITORS, parseBinding, proTools, proLabel } from "./pro_catalog.js";
import { getLang, onLangChange } from "./i18n.js";
import { askAgent } from "./ui_agent.js";
import { PRO_ACTIONS } from "./pro_actions.js";
import { addToolSearchEntries } from "./tool_search.js";
import { openCabinetForSelection, isCabinetOpen } from "./ui_cabinet.js";
import {
  editorSwitchHTML, wireEditorSwitch, proToast, registerShell, wireShell, syncShell, aiOn, wireVoice,
  projectChipHTML, shellActionsHTML, commandBarHTML, aiStatusHTML, fitCommandBar, activeEditor,
} from "./pro_shell.js";
import { S } from "./state.js";
import { markDirty } from "./persist.js";
import { partCodeAnswer, partCodeToast } from "./part_code_labels.js";
import "./editor_agent_ui.js"; // the AI card of the model editor's and cabinet designer's bars
import { relocate, layoutCompact, placeLayersChip } from "./pro_compact.js";
import { placeLeft } from "./pro_left.js";

var LS_TAB = "mf.proRibbon.tab";
function he() { return getLang() === "he"; }
function L(text) { return proLabel(text, he() ? "he" : "en"); }
var MSG = {
  na: ["This tool is not available yet.", "הכלי הזה עדיין לא זמין."],
  modelerFail: ["The model editor did not open.", "עורך המודלים לא נפתח."],
  modelerCmd: ["The model editor could not run that command.", "עורך המודלים לא הצליח להריץ את הפקודה."],
  needSketch: ["Open a sketch first, then pick a relation.", "פתחו סקיצה ואז בחרו יחס."],
  needGeom: ["Select the sketch geometry this relation applies to first.", "בחרו תחילה את הגאומטריה שהיחס חל עליה."],
  mepNa: ["Not available right now: draw a room or pick a device first.", "לא זמין כרגע: ציירו חדר או בחרו רכיב תחילה."],
  needCab: ["Select a cabinet in the plan first, then pick this tool.", "בחרו תחילה ארון בתוכנית ואז את הכלי."],
  collapse: ["Collapse the tool ribbon", "כווץ את סרגל הכלים"],
  expand: ["Expand the tool ribbon", "הרחב את סרגל הכלים"],
  count: [" tools · ⌘K searches all three editors", " כלים · ⌘K מחפש בכל שלושת העורכים"],
  all: ["All tools", "כל הכלים"],
  aria: ["All planner tools", "כל כלי המתכנן"],
  notYet: [" — not available yet", " — עדיין לא זמין"],
  planned: ["“{0}” is planned and not built yet.", "„{0}” מתוכנן ועדיין לא נבנה."],
  clearOk: ["No door or window swing hits anything.", "אף כיוון פתיחה של דלת או חלון לא מתנגש."],
  clearN: ["{0} swing clearance problems — listed under Warnings.", "{0} בעיות מרווח פתיחה — מפורטות באזהרות."],
  nothing: ["Nothing to show: there are no rebuild errors.", "אין מה להציג: אין שגיאות בנייה."],
  needSel: ["Select something this applies to first.", "בחרו תחילה פריט שהפעולה חלה עליו."],
  plannedTip: [" — planned, not built yet", " — מתוכנן, עדיין לא נבנה"],
  plannedHelp: ["Planned. This tool is in the design but not built yet, so pressing it changes nothing.", "מתוכנן. הכלי קיים בעיצוב אבל עדיין לא נבנה, ולחיצה עליו לא משנה דבר."],
  askPh: ["Ask AI or name a tool: “add a window on the north wall”", "שאלו את ה־AI או כתבו שם כלי: „הוסף חלון בקיר הצפוני”"],
  ask: ["Ask the AI helper", "שאלו את עוזר ה־AI"],
  mic: ["Speak your request", "אמרו את הבקשה"],
  micOff: ["Voice input is not supported in this browser.", "הקלטה קולית לא נתמכת בדפדפן הזה."],
  listening: ["Listening…", "מקשיב…"],
  noAgent: ["The AI helper is not available.", "עוזר ה־AI אינו זמין."],
  aiOff: ["AI is off — type a tool's name, or choose AI on the bar to turn it on.", "AI כבוי — הקלידו שם של כלי, או בחרו AI בסרגל כדי להפעיל."],
  allCmds: ["All commands", "כל הפקודות"],
  every: ["Every command", "כל הפקודות"],
  phUndo: ["Undo", "ביטול"],
  phParts: ["Parts & library", "חלקים וספרייה"],
  phMore: ["More", "עוד"],
  phTools: ["All tools", "כל הכלים"],
  everyOf: ["Every tool · {0}", "כל הכלים · {0}"],
  everySub: ["The same list is the ribbon, this palette, the phone tool shelf and what the AI can run", "אותה רשימה היא הסרגל, החלון הזה, מדף הכלים בטלפון ומה שה־AI יכול להפעיל"],
  everyPh: ["Type a tool, or ask the AI", "הקלידו כלי או שאלו את ה־AI"],
  everyAsk: ["No tool by that name. Press Enter to ask the AI.", "אין כלי בשם הזה. Enter שולח את השאלה ל־AI."],
  everyNone: ["No tool called “{0}”.", "אין כלי בשם „{0}”."],
  close: ["Close", "סגירה"],
  phTree: ["Feature tree", "עץ התכונות"],
  phDesign: ["Design", "עיצוב"],
  phProps: ["Properties", "מאפיינים"],
  everyTip: ["Search every tool of all three editors (Ctrl+K)", "חיפוש בכל הכלים של שלושת העורכים (Ctrl+K)"],
};
function M(key) { return MSG[key][he() ? 1 : 0]; }
var LS_COLLAPSED = "mf.proRibbon.collapsed";

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* private mode: the ribbon simply forgets */ }
  return null;
}

var toast = proToast;

function modelerOpen() {
  var m = document.getElementById("modeler");
  // openModeler sets display:flex and closeModeler none; the root is fixed, so no offsetParent.
  return !!(m && m.style.display && m.style.display !== "none");
}

/* Opening the model editor can load its 3D stack lazily, so wait for it. */
function whenModelerOpen(fn) {
  if (modelerOpen()) { fn(); return; }
  if (window.__runAction) window.__runAction("openModeler");
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (modelerOpen()) { clearInterval(timer); fn(); }
    else if (tries > 40) { clearInterval(timer); toast(M("modelerFail")); }
  }, 150);
}

function reveal(el) {
  var pane = el.closest("[data-left-pane]");
  if (pane && window.__plannerChrome) window.__plannerChrome.setLeftTab(pane.getAttribute("data-left-pane"));
  if (pane && document.body.classList.contains("compact-nav")) document.body.classList.add("show-left");
  if (el.closest("#right-inspector") && document.body.classList.contains("compact-nav")) document.body.classList.add("show-right");
  var section = el.closest(".panel-section");
  if (section) section.classList.remove("collapsed");
  // A collapsed <details> — the target itself, its first one, or one around it.
  var own = el.tagName === "DETAILS" ? el : el.querySelector("details");
  if (own) own.open = true;
  for (var up = el.parentElement && el.parentElement.closest("details"); up; up = up.parentElement && up.parentElement.closest("details")) up.open = true;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  el.classList.remove("tool-search-located");
  void el.offsetWidth;
  el.classList.add("tool-search-located");
  setTimeout(function () { el.classList.remove("tool-search-located"); }, 2500);
}

export function runProBinding(bind, label) {
  var b = parseBinding(bind);
  if (!b) { toast(M("na")); return false; }
  if (b.kind === "planned") { toast(M("planned").replace("{0}", L(label || b.value))); return false; }
  if (b.kind === "pro") {
    var fn = PRO_ACTIONS[b.value];
    if (!fn) return false;
    var out = fn();
    if (b.value === "partCodes") toast(partCodeToast(out));
    if (b.value === "clearances") {
      toast(out ? M("clearN").replace("{0}", out) : M("clearOk"));
      var wp = document.getElementById("warnPanel");
      if (out && wp) reveal(wp);
    }
    return true;
  }
  if (b.kind === "lib") {
    if (window.__plannerChrome) window.__plannerChrome.setLeftTab("library");
    if (document.body.classList.contains("compact-nav")) document.body.classList.add("show-left");
    var home = document.querySelector('[data-left-pane="library"] [data-crumb="0"]');
    if (home) home.click();
    var tile = document.querySelector('[data-left-pane="library"] .furn-nav[data-nav="' + b.value + '"]');
    if (tile) { tile.click(); return true; }
    toast(M("na"));
    return false;
  }
  if (b.kind === "run") {
    if (!window.__runAction) return false;
    window.__runAction(b.value);
    return true;
  }
  if (b.kind === "mclick") {
    whenModelerOpen(function () {
      var mb = document.querySelector("#modeler " + b.value);
      if (mb && mb.hidden) toast(M("nothing"));
      else if (mb && !mb.disabled) mb.click();
      else toast(M("modelerCmd"));
    });
    return true;
  }
  if (b.kind === "tool") {
    var tb = document.querySelector('#plan-toolbar [data-tool="' + b.value + '"]') || document.querySelector('[data-tool="' + b.value + '"]');
    if (!tb) return false;
    tb.click();
    // Drawing needs the plan: a tool picked while only 3D shows would land nowhere.
    if (b.value !== "select" && window.__setViewMode && (document.getElementById("center-canvas") || document.body).classList.contains("max-view-3d")) window.__setViewMode("plan");
    return true;
  }
  if (b.kind === "act") {
    if (window.__runAction) { window.__runAction(b.value); return true; }
    var ab = document.querySelector('[data-act="' + b.value + '"]');
    if (ab) ab.click();
    return !!ab;
  }
  if (b.kind === "click") {
    var cb = document.querySelector(b.value);
    if (cb) cb.click();
    return !!cb;
  }
  if (b.kind === "reveal") {
    var rv = document.querySelector(b.value);
    if (!rv) return false;
    reveal(rv);
    // Inspector sections only show for a matching selection.
    if (!rv.offsetParent && getComputedStyle(rv).position !== "fixed") toast(M("needSel"));
    return true;
  }
  if (b.kind === "left") {
    if (window.__plannerChrome) window.__plannerChrome.setLeftTab(b.value);
    if (document.body.classList.contains("compact-nav")) document.body.classList.add("show-left");
    return true;
  }
  if (b.kind === "mcmd") {
    whenModelerOpen(function () {
      if (!window.__modelerRunCommand || !window.__modelerRunCommand(b.value)) toast(M("modelerCmd"));
    });
    return true;
  }
  if (b.kind === "meng") {
    whenModelerOpen(function () {
      var tab = document.querySelector('#modeler [data-tab="look"]');
      if (tab) tab.click();
      var eb = document.querySelector('#modeler [data-engineering-action="' + b.value + '"]');
      if (eb && !eb.disabled) eb.click(); else toast(M("needSel"));
    });
    return true;
  }
  if (b.kind === "mcon") {
    whenModelerOpen(function () {
      var cb = document.querySelector('#modeler [data-constraint="' + b.value + '"]');
      if (!cb) toast(M("needSketch"));
      else if (cb.disabled) toast(M("needGeom"));
      else cb.click();
    });
    return true;
  }
  if (b.kind === "mrel") {
    whenModelerOpen(function () {
      var rb = document.querySelector('#modeler [data-relation="' + b.value + '"]');
      if (!rb) toast(M("needSketch"));
      else if (rb.disabled) toast(M("needGeom"));
      else rb.click();
    });
    return true;
  }
  if (b.kind === "nest" || b.kind === "nestgo") {
    var go = function () {
      var el = document.querySelector(b.value);
      if (!el) return false;
      if (b.kind === "nestgo") el.click();
      else reveal(el);
      return true;
    };
    var target = document.querySelector(b.value);
    if (target && target.offsetParent) return go();
    if (window.__runAction) window.__runAction("cutPlan");
    var n = 0;
    var timer = setInterval(function () {
      var el = document.querySelector(b.value);
      if ((el && el.offsetParent) || ++n > 30) { clearInterval(timer); if (!go()) toast(M("na")); }
    }, 100);
    return true;
  }
  if (b.kind === "mep") {
    var panel = document.getElementById("mepPanel");
    if (!panel) return false;
    reveal(panel);
    var mb = panel.querySelector('[data-mep="' + b.value + '"]');
    if (mb && !mb.disabled) mb.click();
    else if (mb) toast(M("mepNa"));
    return !!mb;
  }
  if (b.kind === "cab") {
    if (!isCabinetOpen()) openCabinetForSelection();
    if (!isCabinetOpen()) { toast(M("needCab")); return false; }
    var c = document.querySelector("#cabdes [data-" + b.attr + '="' + b.value + '"]');
    if (c) c.click();
    return !!c;
  }
  return false;
}

/* ---------------------------------------------------------------- desktop ribbon */

function syncExplodeBinding(button) {
  if(button.dataset.proBind!=="mcmd:explode")return;
  var source=document.querySelector('#modeler [data-command="explode"]');
  if(!source)return;
  var label=source.getAttribute('aria-label'),pressed=source.getAttribute('aria-pressed');
  if(label){
    var text=button.querySelector('span');if(text && text.textContent!==label)text.textContent=label;
    if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  }
  if(pressed!==null && button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);
  if(source.title && button.title!==source.title)button.title=source.title;
}
function toolButton(tool) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "pr-tool";
  b.dataset.proBind = tool.bind || "";
  var name = L(tool.label);
  b.title = name + (tool.key ? " (" + keyLabel(tool.key) + ")" : "");
  b.setAttribute("aria-label", name);
  if (!tool.bind) { b.disabled = true; b.title = name + M("notYet"); }
  if (tool.bind && tool.bind.indexOf("planned:") === 0) { b.classList.add("planned"); b.title = name + M("plannedTip"); b.setAttribute("aria-description", M("plannedHelp")); }
  b.innerHTML = '<i class="ph ' + tool.icon + '" aria-hidden="true"></i><span></span>' + (tool.key ? "<kbd></kbd>" : "");
  b.querySelector("span").textContent = name;
  if (tool.key) b.querySelector("kbd").textContent = keyLabel(tool.key);
  b.addEventListener("click", function () { runProBinding(tool.bind, tool.label); syncActive(); });
  syncExplodeBinding(b);
  return b;
}

var ribbon = null;

function renderGroups(tabIndex) {
  fillRibbon(ribbon, "plan", tabIndex, LS_TAB);
}
function wireRibbonTabs(host, editor, selectTab) {
  var panel = host.querySelector(".pr-groups");
  var tabs = Array.from(host.querySelectorAll(".pr-tab"));
  panel.id = "pr-panel-" + editor;
  panel.setAttribute("role", "tabpanel");
  panel.tabIndex = 0;
  tabs.forEach(function (tab, i) {
    tab.id = "pr-tab-" + editor + "-" + i;
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", function () { selectTab(i); });
    tab.addEventListener("keydown", function (event) {
      var next = i;
      var rtl = getComputedStyle(tab).direction === "rtl";
      if (event.key === "ArrowRight") next = (i + (rtl ? -1 : 1) + tabs.length) % tabs.length;
      else if (event.key === "ArrowLeft") next = (i + (rtl ? 1 : -1) + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(next);
      tabs[next].focus();
    });
  });
}
function fillRibbon(host, editor, tabIndex, key) {
  var tabs = PRO_CATALOG[editor].tabs;
  var i = Math.max(0, Math.min(tabs.length - 1, tabIndex));
  host.querySelectorAll(".pr-tab").forEach(function (t, j) {
    t.classList.toggle("on", j === i);
    t.setAttribute("aria-selected", j === i ? "true" : "false");
    t.tabIndex = j === i ? 0 : -1;
  });
  var body = host.querySelector(".pr-groups");
  body.setAttribute("aria-labelledby", "pr-tab-" + editor + "-" + i);
  body.setAttribute("aria-label", L(tabs[i][0]));
  body.innerHTML = "";
  tabs[i][1].forEach(function (group) {
    var g = document.createElement("div");
    g.className = "pr-group";
    var items = document.createElement("div");
    items.className = "pr-items";
    group[1].forEach(function (tool) { items.appendChild(toolButton(tool)); });
    var lab = document.createElement("span");
    lab.className = "pr-glabel";
    lab.textContent = L(group[0]);
    g.appendChild(items);
    g.appendChild(lab);
    body.appendChild(g);
  });
  store(key, String(i));
  host.querySelector(".pr-tab.on").scrollIntoView({ block: "nearest", inline: "nearest" });
  syncActive();
  if (host.classList.contains("pr-editor-ribbon")) fitEditorRows(host);
}
/* The editors' ribbons stack their tools in two rows; when a narrower window
   would push tools off the end, a third row takes them instead. */
function fitEditorRows(el) {
  var body = el.querySelector(".pr-groups");
  if (!body || !body.clientWidth) return;
  if (el.classList.contains("pr-rows3")) el.classList.remove("pr-rows3");
  if (body.scrollWidth > body.clientWidth + 1) el.classList.add("pr-rows3");
}

/* The model editor's and cabinet designer's ribbon in the Round-6 layout:
   their catalog tabs (js/pro_catalog.js — every command of the editor, the
   same entries the fold rails and "Every command" use) as the planner's tabs
   row and tool tiles, under the editor's header. css/pro_skin.css shows it
   only in that layout, where it stands in for the editor's own command rows;
   everywhere else the editor's own rows are what shows. */
var EDITOR_RIBBON_AFTER = { model: ".md-head", cab: ".cb-head-main" };
function mountEditorRibbon(editor, root) {
  if (!PRO_CATALOG[editor] || !root) return;
  var head = root.querySelector(EDITOR_RIBBON_AFTER[editor]);
  if (!head) return;
  var old = root.querySelector(".pr-editor-ribbon");
  if (old) old.remove();
  var tabs = PRO_CATALOG[editor].tabs, key = LS_TAB + "." + editor;
  var el = document.createElement("div");
  el.className = "pro-ribbon pr-editor-ribbon";
  el.dataset.proEditor = editor;
  el.setAttribute("role", "toolbar");
  el.innerHTML =
    '<div class="pr-bar"><div class="pr-tabs" role="tablist">' +
      tabs.map(function (t, i) { return '<button type="button" role="tab" class="pr-tab" data-pro-tab="' + i + '">' + L(t[0]) + "</button>"; }).join("") +
    '</div><button type="button" class="pr-every pr-every-ed"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><span>' + M("every") + "</span><kbd>" + (isMac() ? "⌘K" : "Ctrl K") + "</kbd></button></div>" +
    '<div class="pr-groups"></div>';
  head.after(el);
  wireRibbonTabs(el, editor, function (i) { fillRibbon(el, editor, i, key); });
  // "Every command": the editor's own command search
  el.querySelector(".pr-every-ed").addEventListener("click", function () {
    if (document.body.classList.contains("pro-skin")) { openEveryPanel(editor); return; }
    var own = editor === "model" ? root.querySelector("#mdCommandSearchBtn") : null;
    if (own) own.click();
    else { var q = root.querySelector("#cbSearch"); if (q) q.focus(); }
  });
  fillRibbon(el, editor, +(store(key) || 0), key);
  if (typeof ResizeObserver === "function") {
    var lastW = 0;
    new ResizeObserver(function () {
      if (el.clientWidth === lastW) return;
      lastW = el.clientWidth;
      // next frame: changing the ribbon's height inside the observer's own
      // callback is a "ResizeObserver loop" error, which the app reports
      requestAnimationFrame(function () { fitEditorRows(el); });
    }).observe(el);
  }
  placeEditorChrome(proDesk());
  watchEditorCommandState(root);
}
function watchEditorCommandState(root) {
  /* Follow both armed tools and presentation labels on the source commands.
     Pro buttons may be recreated after the editor has already synchronized. */
  if (window.MutationObserver && !root._psRibbonWatch) {
    var queued = false;
    root._psRibbonWatch = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; syncActive(); });
    });
    root._psRibbonWatch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class","aria-label","aria-pressed","title"] });
  }
}

/* The floating rail stays the source of truth for the active tool. */
function syncActive() {
  var on = document.querySelector("#plan-toolbar [data-tool].active, #plan-toolbar [data-tool].on");
  var active = on ? "tool:" + on.getAttribute("data-tool") : "";
  if (ribbon) ribbon.querySelectorAll(".pr-tool").forEach(function (b) { b.classList.toggle("on", !!active && b.dataset.proBind === active); });
  // The fold rails' docked grids (renderToolTab) show each editor's armed tool:
  // the planner's from its rail, the model editor's and the cabinet designer's
  // from their own command buttons, which mark the active one with .on.
  document.querySelectorAll(".pro-rail-grid [data-pro-bind], .pr-editor-ribbon [data-pro-bind]").forEach(function (b) {
    b.classList.toggle("on", railBindActive(b.dataset.proBind, active));
  });
  document.querySelectorAll('[data-pro-bind="mcmd:explode"]').forEach(syncExplodeBinding);
}
function railBindActive(bind, plannerActive) {
  if (!bind) return false;
  if (bind.indexOf("tool:") === 0) return !!plannerActive && bind === plannerActive;
  var p = parseBinding(bind);
  if (!p) return false;
  if (p.kind === "mcmd") return !!document.querySelector('#modeler [data-command="' + p.value + '"].on');
  if (p.kind === "cab" && p.attr) return !!document.querySelector("#cabdes [data-" + p.attr + '="' + p.value + '"].on');
  return false;
}

function setCollapsed(c) {
  ribbon.classList.toggle("collapsed", c);
  document.body.classList.toggle("pro-ribbon-collapsed", c);
  var btn = ribbon.querySelector(".pr-collapse");
  btn.setAttribute("aria-expanded", c ? "false" : "true");
  btn.setAttribute("aria-label", M(c ? "expand" : "collapse"));
  btn.innerHTML = '<i class="ph ' + (c ? "ph-caret-down" : "ph-caret-up") + '" aria-hidden="true"></i>';
  store(LS_COLLAPSED, c ? "1" : "0");
}

export function initProRibbon() {
  if (ribbon || !document.getElementById("topbar")) return;
  buildRibbon();
  onLangChange(function () {
    if (!ribbon) return;
    // the search field lives in the ribbon on desktop: take it home first
    relocate(document.getElementById("toolSearch"), null);
    ribbon.remove();
    ribbon = null;
    buildRibbon();
  });
  var rail = document.getElementById("plan-toolbar");
  if (rail && window.MutationObserver) new MutationObserver(syncActive).observe(rail, { subtree: true, attributes: true, attributeFilter: ["class"] });
}

function buildRibbon() {
  ribbon = document.createElement("div");
  ribbon.id = "pro-ribbon";
  ribbon.className = "pro-ribbon";
  ribbon.setAttribute("role", "toolbar");
  ribbon.setAttribute("aria-label", M("aria"));
  var tabs = PRO_CATALOG.plan.tabs;
  var count = proTools("plan").length;
  ribbon.innerHTML =
    '<div class="pr-bar">' +
      editorSwitchHTML("plan") +
      '<div class="pr-tabs" role="tablist">' +
        tabs.map(function (t, i) { return '<button type="button" role="tab" class="pr-tab" data-pro-tab="' + i + '">' + L(t[0]) + "</button>"; }).join("") +
      "</div>" +
      '<span class="pr-count">' + count + M("count") + "</span>" +
      '<button type="button" class="pr-every" title="' + M("everyTip") + '"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><span>' + M("every") + "</span><kbd>" + (isMac() ? "⌘K" : "Ctrl K") + "</kbd></button>" +
      '<button type="button" class="pr-collapse" aria-label="Collapse the tool ribbon"></button>' +
    "</div>" +
    '<div class="pr-groups"></div>';
  var top = document.getElementById("topbar");
  top.parentNode.insertBefore(ribbon, top.nextSibling);
  wireRibbonTabs(ribbon, "plan", function (i) { setCollapsed(false); renderGroups(i); });
  wireEditorSwitch(ribbon);
  mountPlannerShell();
  ribbon.querySelector(".pr-collapse").addEventListener("click", function () { setCollapsed(!ribbon.classList.contains("collapsed")); });
  ribbon.querySelector(".pr-every").addEventListener("click", openToolSearch);
  renderGroups(+(store(LS_TAB) || 0));
  setCollapsed(store(LS_COLLAPSED) === "1");
  document.body.classList.add("pro-ribbon-on");
}

/* ---------------------------------------------------------------- phone sheet */

var sheetState = { editor: "plan", tab: 0 };

function appendToolsSheet(body, close) {
  var wrap = document.createElement("div");
  wrap.className = "pro-sheet";
  body.appendChild(wrap);
  function draw() {
    var cat = PRO_CATALOG[sheetState.editor];
    var tab = cat.tabs[Math.min(sheetState.tab, cat.tabs.length - 1)];
    wrap.innerHTML = "";
    var h = document.createElement("h5");
    h.className = "m-sheet-sec";
    h.textContent = M("all") + " · " + proTools().length;
    wrap.appendChild(h);
    var ask = document.createElement("label");
    ask.className = "pr-ask pro-sheet-ask";
    ask.innerHTML = '<i class="ph ph-sparkle" aria-hidden="true"></i><input type="text" enterkeyhint="send" autocomplete="off" dir="auto"><button type="button" class="pr-mic"><i class="ph ph-microphone" aria-hidden="true"></i></button>';
    wrap.appendChild(ask);
    wireAsk(ask);
    ask.querySelector("input").addEventListener("keydown", function (e) { if (e.key === "Enter") close(); });
    var eds = document.createElement("div");
    eds.className = "pro-sheet-chips";
    [["plan", "Planner"], ["model", "Model editor"], ["cab", "Cabinet designer"]].forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pro-chip" + (e[0] === sheetState.editor ? " on" : "");
      b.textContent = L(e[1]);
      b.addEventListener("click", function () { sheetState = { editor: e[0], tab: 0 }; draw(); });
      eds.appendChild(b);
    });
    wrap.appendChild(eds);
    var tabs = document.createElement("div");
    tabs.className = "pro-sheet-chips pro-sheet-tabs";
    cat.tabs.forEach(function (t, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pro-chip" + (t === tab ? " on" : "");
      b.textContent = L(t[0]);
      b.addEventListener("click", function () { sheetState.tab = i; draw(); });
      tabs.appendChild(b);
    });
    wrap.appendChild(tabs);
    tab[1].forEach(function (group) {
      var gh = document.createElement("h5");
      gh.className = "m-sheet-sec";
      gh.textContent = L(group[0]);
      wrap.appendChild(gh);
      var grid = document.createElement("div");
      grid.className = "m-grid m-icon-grid";
      group[1].forEach(function (tool) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "m-grid-btn";
        b.disabled = !tool.bind;
        var name = L(tool.label);
        b.setAttribute("aria-label", name);
        b.title = name;
        b.innerHTML = '<i class="ph ' + tool.icon + '"></i><span></span>';
        b.querySelector("span").textContent = name;
        if (tool.bind && tool.bind.indexOf("planned:") === 0) b.classList.add("planned");
        b.addEventListener("click", function () { close(); runProBinding(tool.bind, tool.label); });
        grid.appendChild(b);
      });
      wrap.appendChild(grid);
    });
  }
  draw();
}

window.__proAppendToolsSheet = appendToolsSheet;

/* ---------------------------------------------------------------- fold rail */

/* The unfolded-foldable rail (js/mobile_shell.js draws it): one entry per
   catalog tab, and the tab's tools as the grid that docks above the inspector
   — the Round-6 Fold7 / wide-fold screens. Same catalog, same bindings. */
var TAB_ICON = {
  "Build": "ph-cursor", "Constrain": "ph-ruler", "Interior": "ph-squares-four", "MEP": "ph-lightning",
  "Site & scan": "ph-map-pin", "Annotate": "ph-pencil-ruler", "Analyze": "ph-chart-bar",
  "View & render": "ph-eye", "Output": "ph-floppy-disk",
};
var TAB_SHORT = { "Site & scan": "Site", "View & render": "View" };
function proToolTabs(editor) {
  return PRO_CATALOG[editor].tabs.map(function (t, i) {
    var count = t[1].reduce(function (n, g) { return n + g[1].length; }, 0);
    return {
      index: i, name: t[0], label: L(TAB_SHORT[t[0]] || t[0]), full: L(t[0]), count: count,
      icon: TAB_ICON[t[0]] || t[1][0][1][0].icon,
    };
  });
}
/* One tab's tools, grouped "WALLS · 9" like the mockup; onRun(tool) after a
   tool runs, so the host can keep or close its panel. */
function renderToolTab(container, editor, index, onRun) {
  var tab = PRO_CATALOG[editor].tabs[index];
  if (!tab) return;
  container.innerHTML = "";
  tab[1].forEach(function (group) {
    var gh = document.createElement("h5");
    gh.className = "m-sheet-sec";
    gh.textContent = L(group[0]) + " · " + group[1].length;
    container.appendChild(gh);
    var grid = document.createElement("div");
    grid.className = "m-grid m-icon-grid pro-rail-grid";
    group[1].forEach(function (tool) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "m-grid-btn";
      b.disabled = !tool.bind;
      b.dataset.proBind = tool.bind || "";
      var name = L(tool.label);
      b.setAttribute("aria-label", name);
      b.title = name + (tool.key ? " (" + keyLabel(tool.key) + ")" : "");
      b.innerHTML = '<i class="ph ' + tool.icon + '" aria-hidden="true"></i><span></span>';
      b.querySelector("span").textContent = name;
      b.addEventListener("click", function () {
        runProBinding(tool.bind, tool.label);
        syncActive();
        // editor commands can arm a frame later (the model editor may still be opening)
        setTimeout(syncActive, 200);
        if (onRun) onRun(tool);
      });
      grid.appendChild(b);
    });
    container.appendChild(grid);
  });
}
window.__proToolTabs = { tabs: proToolTabs, render: renderToolTab, sync: syncActive };

/* ---------------------------------------------------------------- ⌘K search */

/* Planner actions and tools are already indexed from the DOM by tool search,
   so only what it cannot see is added: panels, and every model-editor and
   cabinet-designer command. */
var EDITOR_NAME = { plan: "Planner", model: "Model editor", cab: "Cabinet designer" };
addToolSearchEntries(proTools().filter(function (t) {
  var b = parseBinding(t.bind);
  // Planner tools and actions with a button are already indexed from the page.
  return b && (t.editor !== "plan" || (b.kind !== "tool" && b.kind !== "act"));
}).map(function (t, i) {
  return {
    id: "pro-" + t.editor + "-" + i,
    label: {
      en: t.label + " · " + (t.editor === "plan" ? t.group : t.tab) + " · " + EDITOR_NAME[t.editor],
      he: proLabel(t.label, "he") + " · " + proLabel(t.editor === "plan" ? t.group : t.tab, "he") + " · " + proLabel(EDITOR_NAME[t.editor], "he"),
    },
    icon: t.icon,
    location: t.editor === "model" ? "modeler" : t.editor === "cab" ? "cabinet" : "ribbon",
    keywords: [t.label, t.group, t.tab, EDITOR_NAME[t.editor]].map(function (x) { return x + " " + proLabel(x, "he"); }).join(" "),
    help: t.bind.indexOf("planned:") === 0
      ? { en: MSG.plannedHelp[0], he: MSG.plannedHelp[1] }
      : t.editor === "model"
      ? { en: "Opens the model editor if it is closed, then starts this command. Commands that need a sketch or a solid say so.", he: "פותח את עורך המודלים אם הוא סגור ומפעיל את הפקודה. פקודה שדורשת סקיצה או גוף תודיע על כך." }
      : t.bind === "pro:cabRun"
        ? { en: "Select a straight wall in the plan first, then choose the number and size of cabinets.", he: "בחרו קיר ישר בתוכנית ואז קבעו את מספר הארונות ומידותיהם." }
      : t.bind === "pro:cabWorktop"
        ? { en: "Select a cabinet in a run, then set its shared top, material, edge and optional cutout.", he: "בחרו ארון בשורה ואז קבעו משטח משותף, חומר, קנט ופתח לפי הצורך." }
      : t.bind === "pro:cabSend"
        ? { en: "Open the project shop review package, create a revision snapshot, then share or download it.", he: "פתחו את חבילת הבדיקה לנגרייה, צרו גרסת תכנון ואז שתפו או הורידו אותה." }
      : t.editor === "cab"
        ? { en: "Select a cabinet in the plan first. This opens the cabinet designer on it and goes to this tool.", he: "בחרו תחילה ארון בתוכנית. הפקודה פותחת עליו את מעצב הארונות ועוברת לכלי." }
        : null,
    run: function () { runProBinding(t.bind, t.label); },
    selector: t.bind.indexOf("reveal:") === 0 || t.bind.indexOf("click:") === 0 ? t.bind.slice(t.bind.indexOf(":") + 1) : "",
  };
}));

/* ---------------------------------------------------------------- Ask: type or speak */

/* A request that is exactly a tool's name runs the tool; anything else goes to
   the AI helper, which previews and asks before it changes the plan. */
function toolNamed(text) {
  var q = String(text || "").trim().toLowerCase();
  if (!q) return null;
  var hit = null;
  proTools().some(function (t) {
    if (!t.bind) return false;
    if (t.label.toLowerCase() === q || proLabel(t.label, "he") === q) { hit = t; return true; }
    return false;
  });
  return hit;
}

export function submitAsk(text) {
  // a part code needs no AI to find: select it, AI on or off
  var said = partCodeAnswer(text);
  if (said) { toast(said); return true; }
  var tool = toolNamed(text);
  if (tool) return runProBinding(tool.bind);
  // AI off is fully manual: a request that names no tool goes nowhere, and says so.
  if (!aiOn()) { toast(M("aiOff")); return false; }
  if (!askAgent(text)) { toast(M("noAgent")); return false; }
  return true;
}

function wireAsk(label) {
  if (!label) return;
  var input = label.querySelector("input"), mic = label.querySelector(".pr-mic");
  input.placeholder = M("askPh");
  input.setAttribute("aria-label", M("ask"));
  input.addEventListener("keydown", function (e) {
    e.stopPropagation(); // typing here must not trigger planner shortcuts
    if (e.key === "Enter" && input.value.trim()) {
      e.preventDefault();
      if (submitAsk(input.value)) input.value = "";
    } else if (e.key === "Escape") input.blur();
  });
  wireVoice(input, mic, label, submitAsk, function () { return M("askPh"); });
}

/* ---------------------------------------------------------------- the shell */

// the catalog writes Mac keys; elsewhere ⌘ is Ctrl and ⇧ is Shift
function keyLabel(key) {
  return isMac() ? key : String(key).replace("⇧", "Shift+").replace("⌘", "Ctrl+");
}
function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

/* The top bar's tool search already covers all three editors' tools. */
function openToolSearch() {
  // the Round-6 layout's "Every command" is the whole-catalog panel
  if (document.body.classList.contains("pro-skin")) { openEveryPanel(activeEditor()); return; }
  var input = document.getElementById("toolSearchInput");
  if (!input) return;
  input.focus();
  input.select();
}

/* "Every command" (screen v6-*-all): the whole catalog of one editor at once —
   every tab a card, every group under its name, every tool with its key — and
   a field that narrows it as you type. Enter runs the first match; with no
   match and the AI on, the planner sends the text to the AI helper, as its bar
   would. The Planner / Model / Cabinet pills show another editor's catalog
   (its tools open that editor, as the command bar's do). Desktop only; phones
   have the tools sheet. */
var everyPanel = null;
var EVERY_NAMES = { plan: "Planner", model: "Model", cab: "Cabinet" };
function closeEveryPanel() {
  if (everyPanel) everyPanel.remove();
  everyPanel = null;
  document.removeEventListener("keydown", everyEscape, true);
}
// Escape closes the panel wherever the focus is (a click on the backdrop or a
// card leaves it outside the panel's own field)
function everyEscape(e) {
  if (e.key !== "Escape" || !everyPanel) return;
  e.preventDefault();
  e.stopPropagation();
  closeEveryPanel();
}
function openEveryPanel(editor) {
  closeEveryPanel();
  editor = PRO_CATALOG[editor] ? editor : "plan";
  var el = document.createElement("div");
  el.className = "pr-every-panel";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML =
    '<div class="pe-sheet"><div class="pe-head"><span class="pe-mark"><i class="ph ph-command" aria-hidden="true"></i></span>' +
    '<div class="pe-title"><b></b><span></span></div>' +
    '<label class="pe-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="text" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></label>' +
    '<div class="pe-editors" role="tablist"></div>' +
    '<button type="button" class="pe-x"><i class="ph ph-x" aria-hidden="true"></i></button></div>' +
    '<div class="pe-body"></div></div>';
  document.body.appendChild(el);
  everyPanel = el;
  document.addEventListener("keydown", everyEscape, true);
  var input = el.querySelector("input"), body = el.querySelector(".pe-body"), current = editor;
  el.querySelector(".pe-x").setAttribute("aria-label", M("close"));
  el.querySelector(".pe-x").addEventListener("click", closeEveryPanel);
  el.addEventListener("keydown", function (e) {
    e.stopPropagation(); // typing here must not reach the editors' shortcuts
    if (e.key === "Escape") { e.preventDefault(); closeEveryPanel(); }
  });
  el.addEventListener("pointerdown", function (e) { if (e.target === el) closeEveryPanel(); });
  var eds = el.querySelector(".pe-editors");
  PRO_EDITORS.forEach(function (ed) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.dataset.editor = ed;
    b.textContent = L(EVERY_NAMES[ed]);
    b.addEventListener("click", function () { current = ed; render(); input.focus(); });
    eds.appendChild(b);
  });
  function run(tool) {
    closeEveryPanel();
    runProBinding(tool.bind, tool.label);
    syncActive();
  }
  function render() {
    var q = input.value.trim().toLowerCase(), first = null, count = 0;
    eds.querySelectorAll("button").forEach(function (b) {
      var on = b.dataset.editor === current;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var all = proTools(current).filter(function (t) { return t.bind; });
    el.querySelector(".pe-title b").textContent = M("everyOf").replace("{0}", L(PRO_CATALOG[current].name)) + " · " + all.length;
    el.querySelector(".pe-title span").textContent = M("everySub");
    input.placeholder = M("everyPh");
    body.textContent = "";
    PRO_CATALOG[current].tabs.forEach(function (tab) {
      var card = document.createElement("section");
      card.className = "pe-card";
      var tabCount = 0;
      var head = document.createElement("h4");
      card.appendChild(head);
      tab[1].forEach(function (group) {
        var tools = group[1].filter(function (t) {
          if (!t.bind) return false;
          if (!q) return true;
          return t.label.toLowerCase().indexOf(q) >= 0 || proLabel(t.label, "he").indexOf(q) >= 0 || group[0].toLowerCase().indexOf(q) >= 0;
        });
        if (!tools.length) return;
        var g = document.createElement("div");
        g.className = "pe-group";
        var gh = document.createElement("h5");
        gh.textContent = L(group[0]);
        g.appendChild(gh);
        var list = document.createElement("div");
        list.className = "pe-tools";
        tools.forEach(function (t) {
          var b = document.createElement("button");
          b.type = "button";
          b.innerHTML = '<i class="ph ' + t.icon + '" aria-hidden="true"></i><span></span>' + (t.key ? "<kbd></kbd>" : "");
          b.querySelector("span").textContent = L(t.label);
          if (t.key) b.querySelector("kbd").textContent = keyLabel(t.key);
          b.addEventListener("click", function () { run(t); });
          list.appendChild(b);
          if (!first) first = t;
          tabCount++;
        });
        g.appendChild(list);
        card.appendChild(g);
      });
      if (!tabCount) return;
      head.innerHTML = "<b></b><span></span>";
      head.querySelector("b").textContent = L(tab[0]);
      head.querySelector("span").textContent = String(tabCount);
      body.appendChild(card);
      count += tabCount;
    });
    if (!count) {
      var none = document.createElement("p");
      none.className = "pe-none";
      none.textContent = aiOn() && current === "plan" ? M("everyAsk") : M("everyNone").replace("{0}", input.value.trim());
      body.appendChild(none);
    }
    el._first = first;
  }
  input.addEventListener("input", render);
  input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (el._first) run(el._first);
    else if (input.value.trim() && aiOn() && current === "plan") {
      var text = input.value.trim();
      closeEveryPanel();
      submitAsk(text);
    }
  });
  render();
  input.focus();
}
// Cmd K / Ctrl K opens it in the Round-6 layout, ahead of the older search's own shortcut
window.addEventListener("keydown", function (e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || String(e.key).toLowerCase() !== "k") return;
  if (!document.body.classList.contains("pro-skin")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (everyPanel) closeEveryPanel(); else openEveryPanel(activeEditor());
}, true);

/* A tool of one editor by its exact name (English or Hebrew). */
function editorToolNamed(editor, text) {
  var q = String(text || "").trim().toLowerCase();
  if (!q) return null;
  var hit = null;
  proTools(editor).some(function (t) {
    if (t.bind && (t.label.toLowerCase() === q || proLabel(t.label, "he") === q)) { hit = t; return true; }
    return false;
  });
  return hit;
}

/* Tools of one editor whose name contains the text; names that start with it first. */
export function suggestTools(editor, text) {
  var q = String(text || "").trim().toLowerCase();
  if (!q) return [];
  var starts = [], contains = [];
  proTools(editor).forEach(function (t) {
    if (!t.bind) return;
    var en = t.label.toLowerCase(), hv = proLabel(t.label, "he");
    var at = Math.min(en.indexOf(q) < 0 ? 99 : en.indexOf(q), hv.indexOf(q) < 0 ? 99 : hv.indexOf(q));
    if (at === 99) return;
    (at === 0 ? starts : contains).push(t);
  });
  return starts.concat(contains).map(function (t) {
    return {
      label: L(t.label),
      sub: L(t.group) + " · " + L(t.tab),
      run: function () { runProBinding(t.bind, t.label); syncActive(); },
    };
  });
}

registerShell({
  projectName: function () { return (S.workspace && S.workspace.name) || "Home project"; },
  canRename: function () { return !(S.workspace && S.workspace.role === "viewer"); },
  renameProject: function (name) {
    if (!S.workspace) return;
    S.workspace.name = String(name).trim().slice(0, 80) || "Home project";
    markDirty();
  },
  // The project dialog's Collaborate tab: live session, review links, presenting.
  share: function () {
    import("./workspace.js").then(function (m) { m.openWorkspace("collaborate"); });
  },
  ask: submitAsk,
  runTool: function (editor, text) {
    // a part code (W12, D7, F13) selects that part before any tool name
    var said = editor === "plan" && partCodeAnswer(text);
    if (said) { toast(said); return true; }
    var tool = editorToolNamed(editor, text);
    if (!tool) return false;
    runProBinding(tool.bind, tool.label);
    syncActive();
    return true;
  },
  suggest: suggestTools,
  mountEditorRibbon: mountEditorRibbon,
});

/* Header pieces go into the planner's own chrome (desktop only in css): the
   project, AI and Share on the ribbon's first row, the
   bottom bar over the canvas and the AI chip at the end of the status bar,
   which initCadHud() builds after this module has initialised. */
var shellMounted = false;
function mountPlannerShell() {
  // The ribbon's first row is the mockup's header: project · switcher · … ·
  // AI · Share. The planner's own top bar is left as it was (its centre is full).
  var editorsRow = ribbon && ribbon.querySelector(".pr-editors");
  if (editorsRow && !ribbon.querySelector(".ps-project")) editorsRow.insertAdjacentHTML("beforebegin", projectChipHTML());
  var every = ribbon && ribbon.querySelector(".pr-every");
  if (every && !ribbon.querySelector(".ps-actions")) every.insertAdjacentHTML("beforebegin", shellActionsHTML());
  var canvas = document.getElementById("center-canvas");
  if (canvas && !canvas.querySelector(".ps-cmdbar")) canvas.insertAdjacentHTML("beforeend", commandBarHTML("plan"));
  if (ribbon) wireShell(ribbon, "plan");
  if (canvas) wireShell(canvas, "plan");
  mountProHeader();
  mountStatusChip(0);
  fitPlannerBar();
  if (!shellMounted) {
    shellMounted = true;
    /* Refit when anything that shares the row can have moved: the window, the
       view mode (the centre canvas's classes), and the plan's own tool panels. */
    var refit = function () { requestAnimationFrame(fitPlannerBar); };
    window.addEventListener("resize", refit);

    if (window.MutationObserver) {
      if (canvas) new MutationObserver(function () { refit(); placeDesk(); }).observe(canvas, { attributes: true, attributeFilter: ["class"] });
      var tools = document.getElementById("plan-tools");
      if (tools) new MutationObserver(refit).observe(tools, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
    }
    setInterval(fitPlannerBar, 1500);
    onLangChange(function () {
      document.querySelectorAll("#center-canvas > .ps-cmdbar, #cad-status .ps-ai-status").forEach(function (el) { el.remove(); });
      mountPlannerShell();
    });
    // Opening, loading or joining a project changes the name without an event
    // of its own; syncShell only writes what changed, so a slow poll is cheap.
    // (The workflow row is built after the ribbon, so placing is re-checked too.)
    setInterval(function () { syncShell(); placeDesk(); }, 1500);
    if (DESK && DESK.addEventListener) DESK.addEventListener("change", placeDesk);
    if (window.MutationObserver) new MutationObserver(placeDesk).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
}
/* ---- the Round-6 header (desktop) ----
   The mockup has ONE header row — logo, project, Planner · Model · Cabinet,
   2D · 3D · Split in the middle, then AI, undo/redo, people and Share — over
   a tabs row that ends in "Every command", over the tools. The planner's own
   top bar is that header: css/pro_skin.css flattens its three clusters and
   orders what stays; the shell's pieces move up into it from the ribbon's
   first row, which keeps the tabs and takes the search field.
   Everything moved keeps its node (ids, listeners). What moves back and forth
   with the layout — the search field, the workflow row that becomes the
   canvas-edge strip — returns to where it came from on a phone or a narrow
   window, so the compact layouts see the page they were built for. */
/* Every window that is not a compact one (js/chrome_posture.js: a mouse
   window over 500px) wears this layout: from 501 to 1023px it used to fall
   back to the classic chrome, so narrowing a desktop window changed design. */
var DESK = typeof matchMedia === "function" ? matchMedia("(min-width: 501px)") : null;
// localStorage mf.proSkin = "0" keeps the classic desktop layout (and is how
// the browser tests of that layout's own chrome — the plan's floating tool
// strip, the stacked split — still reach it)
function proDesk() {
  return !!(DESK && DESK.matches) && !document.body.classList.contains("compact-nav") && store("mf.proSkin") !== "0";
}
function placeDesk() {
  var on = proDesk();
  if (document.body.classList.contains("pro-skin") !== on) document.body.classList.toggle("pro-skin", on);
  // the old search field stays home: the ribbon's "Every command" pill opens the
  // whole-catalog panel instead (openEveryPanel)
  relocate(document.getElementById("toolSearch"), null);
  relocate(document.getElementById("planner-workflow"), on ? document.getElementById("center-canvas") : null);
  placeSplit3D(on);
  placeEditorChrome(on);
  placeLeft(on);
  placePlanBar(on);
  if (on) placeLayersChip();
  placeCompact();
}
/* ---- the Round-6 phone and fold chrome (screens *-ptools, *-pinsp, *-cover,
   *-fold7, *-wide) ----
   Top: the project, undo, parts & library, More. Bottom: the tools grid, the
   Ask / Cmd field and the mic — the planner's own command bar, which the
   compact layouts used to hide. The five-slot navigation it replaces stays in
   the page (its buttons are what the grid, parts and More press) but is not
   shown; 2D · 3D · Split is on the strip, the inspector opens from the
   selection card. mf.proSkin = "0" keeps the classic compact chrome too. */
function compactOn() { return document.body.classList.contains("compact-nav") && store("mf.proSkin") !== "0"; }
/* One pass of the phone and fold chrome: js/pro_compact.js builds the one-row
   headers (editor knob, title, view switch, undo, redo, More), the slim
   bottom toolbar and the ask panel. */
function placeCompact() {
  var on = compactOn();
  if (document.body.classList.contains("pro-compact") !== on) document.body.classList.toggle("pro-compact", on);
  // an editor over the planner owns the bottom toolbar
  var over = activeEditor() !== "plan";
  if (document.body.classList.contains("ps-editor-open") !== over) document.body.classList.toggle("ps-editor-open", over);
  layoutCompact();
}
/* The editors' view switches go into their headers, the mockup's centre
   pill; the model editor's workflow strip (the next step) rides on the
   canvas instead of taking a row. Back where they were anywhere else. */
function placeEditorChrome(on) {
  var md = document.getElementById("modeler");
  // on a phone or a fold the view pill belongs to the one-row header (js/pro_compact.js)
  var phone = compactOn();
  if (md) addAllCommands(md.querySelector(".md-mid > .ps-cmdbar"), "model");
  if (md && on) nameViewButtons(md.querySelector("#mdViews"));
  if (md) {
    if (!phone) relocate(md.querySelector("#mdModes"), on ? md.querySelector(".md-head") : null);
    relocate(md.querySelector(".md-status-row"), on ? md.querySelector(".md-mid") : null);
  }
  var cb = document.getElementById("cabdes");
  if (cb) addAllCommands(cb.querySelector('.ps-cmdbar[data-ps-bar="cab"]'), "cab");
  if (cb && !phone) relocate(cb.querySelector(".cb-vmodes"), on ? cb.querySelector(".cb-head-main") : null);
  if (cb) placeCabChrome(cb, on && !phone);
}
/* The cabinet designer's rows, desktop layout:
   - the second row is one line: the drawing tools (Select, partitions,
     erase), the size fields, then the door-opening preview and Show doors
     (it wraps only when the window is too narrow for one line);
   - the AI / Cmd bar sits in a bottom bar with the status line, as in the
     planner and the model editor.
   Everything goes home on a phone, a fold or the classic layout. */
function placeCabChrome(cb, on) {
  var tabsRow = cb.querySelector(".pr-editor-ribbon .pr-bar");
  var size = cb.querySelector(".cb-size-group"), ctx = cb.querySelector(".cb-context-bar");
  var tools = cb.querySelector("#cbTools"), status = cb.querySelector("#cbStatus");
  var bar = cb.querySelector('.ps-cmdbar[data-ps-bar="cab"]');
  var foot = cb.querySelector(".cb-bottombar");
  if (!on) {
    if (size && tabsRow && size.parentElement === tabsRow) relocate(size, null);
    if (tools && ctx && tools.parentElement === ctx) relocate(tools, null);
    // only what the bar holds: on a phone the ask panel borrows the same bar
    if (foot && bar && bar.parentElement === foot) relocate(bar, null);
    if (foot && status && status.parentElement === foot) relocate(status, null);
    if (foot && !foot.hidden) foot.hidden = true;
    return;
  }
  if (tools && ctx) relocate(tools, ctx);
  if (status) {
    if (!foot) {
      foot = document.createElement("div");
      foot.className = "cb-bottombar";
      status.parentNode.insertBefore(foot, status);
    }
    if (foot.hidden) foot.hidden = false;
    relocate(bar, foot);
    relocate(status, foot);
  }
  // the size fields stay in the second row (their home), between the tools and the preview
  if (size && tabsRow && size.parentElement === tabsRow) relocate(size, null);
}
/* In this layout the model's view list is a column of icons: each button
   keeps its name as a tooltip and an accessible name. */
function nameViewButtons(views) {
  if (!views || views._psNamed) return;
  views._psNamed = true;
  views.querySelectorAll("button").forEach(function (b) {
    var span = b.querySelector("span"), name = span ? span.textContent.trim() : "";
    if (!name) return;
    if (!b.getAttribute("aria-label")) b.setAttribute("aria-label", name);
    if (!b.hasAttribute("data-tip") && !b.title) b.title = name;
  });
}
/* The planner's bottom bar, as the model editor's: under the views, the
   AI / Cmd bar (with All commands, in place of the ribbon's Every command
   pill) and then the CAD status line (snaps, ortho, grid, the AI chip). The
   views shrink to make room, so the bar covers nothing — in 2D, 3D or split.
   Both pieces go home on a phone, a fold or the classic layout. */
function placePlanBar(on) {
  var canvas = document.getElementById("center-canvas");
  if (!canvas) return;
  var dock = document.getElementById("psPlanBar");
  var bar = canvas.querySelector('.ps-cmdbar[data-ps-bar="plan"]'), status = document.getElementById("cad-status");
  if (!on) {
    // only what this bar holds: on a phone the ask panel borrows the same bar
    if (dock && bar && bar.parentElement === dock) relocate(bar, null);
    if (dock && status && status.parentElement === dock) relocate(status, null);
    if (dock && !dock.hidden) dock.hidden = true;
    // only when set: even a no-op remove is a class mutation, and placeDesk
    // runs on every change to the body's classes
    if (document.body.classList.contains("ps-plan-docked")) document.body.classList.remove("ps-plan-docked");
    return;
  }
  if (!dock) {
    dock = document.createElement("div");
    dock.id = "psPlanBar";
    dock.className = "ps-plan-bar";
    canvas.appendChild(dock);
  }
  if (dock.hidden) dock.hidden = false;
  if (dock !== canvas.lastElementChild) canvas.appendChild(dock);
  addAllCommands(bar, "plan");
  relocate(bar, dock);
  relocate(status, dock);
  if (!document.body.classList.contains("ps-plan-docked")) document.body.classList.add("ps-plan-docked");
}
/* The editors have no "Every command" pill: their AI / Cmd bar ends in this
   button, which opens the whole catalog (the model editor's bar sits in its
   bottom bar, the cabinet designer's floats over the drawing). */
function addAllCommands(bar, editor) {
  if (!bar || bar.querySelector(".ps-allcmds")) return;
  var b = document.createElement("button");
  b.type = "button";
  b.className = "ps-allcmds";
  b.innerHTML = '<i class="ph ph-squares-four" aria-hidden="true"></i><span></span>';
  b.querySelector("span").textContent = M("allCmds");
  b.title = M("allCmds") + " (" + (isMac() ? "⌘K" : "Ctrl K") + ")";
  b.setAttribute("aria-label", M("allCmds"));
  b.addEventListener("click", function () { openEveryPanel(editor); });
  // right after the AI | Cmd switch, before the text
  var modes = bar.querySelector(".ps-modes");
  bar.insertBefore(b, modes ? modes.nextSibling : bar.firstChild);
}
/* Split, as the mockup draws it: the plan keeps the whole canvas and the 3D
   view sits at the top of the right column, over the inspector — the same
   single renderer, moved (its maximise button still opens it full size).
   2D or 3D alone, or any compact layout, and it is back in the canvas. */
function placeSplit3D(desk) {
  var canvas = document.getElementById("center-canvas"), v3 = document.getElementById("view-3d"), insp = document.getElementById("right-inspector");
  if (!canvas || !v3 || !insp) return;
  var split = desk && !canvas.classList.contains("max-view-2d") && !canvas.classList.contains("max-view-3d");
  if (document.body.classList.contains("ps-split3d") !== split) document.body.classList.toggle("ps-split3d", split);
  var moved = false;
  if (split && v3.parentNode !== insp) {
    relocate(v3, null); // make sure its way home is recorded first
    insp.insertBefore(v3, insp.firstChild);
    moved = true;
  } else if (!split && v3.parentNode === insp) {
    relocate(v3, null);
    moved = true;
  }
  // the floor chip names the plan, so in this split it stays on the plan
  var floors = document.getElementById("floor-tabs"), v2 = document.getElementById("view-2d");
  if (split && floors && v2 && floors.parentNode !== v2) v2.appendChild(floors);
  // the renderer sizes itself from its box: tell it the box changed
  if (moved) requestAnimationFrame(function () {
    window.dispatchEvent(new Event("resize"));
    // and draw: a canvas that changed parents shows nothing until the next frame is asked for
    S.dirty3D = true;
    import("./view3d.js").then(function (m) { if (m.requestRender) m.requestRender(); });
  });
}
function mountProHeader() {
  var top = document.getElementById("topbar");
  if (!top || !ribbon) return;
  // a rebuilt ribbon (language change) brings its own: drop the old ones
  top.querySelectorAll("[data-ps-moved]").forEach(function (n) { n.remove(); });
  var start = top.querySelector(".tb-start") || top, end = top.querySelector(".tb-end") || top;
  [".ps-project", ".pr-editors"].forEach(function (sel) {
    var n = ribbon.querySelector(".pr-bar > " + sel);
    if (n) { n.setAttribute("data-ps-moved", ""); start.appendChild(n); }
  });
  var actions = ribbon.querySelector(".pr-bar > .ps-actions");
  if (actions) { actions.setAttribute("data-ps-moved", ""); end.appendChild(actions); }
  // the loose icon buttons the header drops stay one click away in More
  // the dropdown portals its menu to <body> the first time it is wired
  var menu = top.querySelector("#moreMenu .dropdown-menu") ||
    Array.prototype.find.call(document.querySelectorAll("body > .dropdown-menu"), function (m) { return m._dd && m._dd.id === "moreMenu"; });
  if (menu) {
    menu.querySelectorAll(".ps-more-item").forEach(function (n) { n.remove(); });
    ["btn_settings", "themeToggle", "langBtn", "shortcutsBtn", "plannerTutorialBtn", "videoStudioBtn"].forEach(function (id) {
      var src = document.getElementById(id);
      if (!src) return;
      var item = document.createElement("button");
      item.type = "button";
      item.className = "ps-more-item";
      item.setAttribute("role", "menuitem");
      var icon = src.querySelector("i");
      item.innerHTML = (icon ? icon.outerHTML : "") + "<span></span>";
      var label = function () { return src.getAttribute("title") || src.getAttribute("aria-label") || id; };
      item.querySelector("span").textContent = label();
      item.addEventListener("click", function () {
        src.click();
        // the theme and language buttons name what they switch to next
        setTimeout(function () { item.querySelector("span").textContent = label(); }, 0);
      });
      menu.appendChild(item);
    });
  }
  wireShell(top, "plan");
  placeDesk();
}
/* What floats in the bar's row over the plan and the 3D view. */
var PLANNER_BAR_OBSTACLES = ".pt-panel, .view-gizmo, .planner-navigation, .plan-gizmo, .view-max-btn, .plan-style-btn";
function fitPlannerBar() {
  var canvas = document.getElementById("center-canvas");
  var bar = canvas && canvas.querySelector(":scope > .ps-cmdbar");
  // docked in the bottom bar (placePlanBar), nothing floats to fit around
  if (!bar) { if (canvas) canvas.style.removeProperty("--ps-bar-clear"); return; }
  fitCommandBar(bar, canvas, PLANNER_BAR_OBSTACLES);
  /* The hints float centred at the bottom too: they stand clear of wherever
     the bar ended up (css reads --ps-bar-clear). */
  var hr = canvas.getBoundingClientRect(), br = bar.getBoundingClientRect();
  if (br.height > 0) canvas.style.setProperty("--ps-bar-clear", Math.round(hr.bottom - br.top + 8) + "px");
  else canvas.style.removeProperty("--ps-bar-clear");
}
function mountStatusChip(tries) {
  var bar = document.getElementById("cad-status");
  if (!bar) { if (tries < 40) setTimeout(function () { mountStatusChip(tries + 1); }, 100); return; }
  if (!bar.querySelector(".ps-ai-status")) bar.insertAdjacentHTML("beforeend", aiStatusHTML());
  wireShell(bar, "plan");
}
