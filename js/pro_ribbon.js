/* The pro ribbon: every planner tool on one tabbed ribbon (desktop), the
 * same catalog as an "All tools" section in the phone Tools sheet, and the
 * model-editor and cabinet-designer tools inside the app-wide ⌘K search.
 *
 * Nothing here implements a tool. Each entry of js/pro_catalog.js names the
 * control, action or command that already does the work, and runProBinding()
 * only reaches it — so the ribbon, the rail, the phone sheet, search and the
 * AI helper can never disagree about what a tool does. */
import { PRO_CATALOG, parseBinding, proTools, proLabel } from "./pro_catalog.js";
import { getLang, onLangChange } from "./i18n.js";
import { askAgent } from "./ui_agent.js";
import { PRO_ACTIONS } from "./pro_actions.js";
import { addToolSearchEntries } from "./tool_search.js";
import { openCabinetForSelection, isCabinetOpen } from "./ui_cabinet.js";
import {
  editorSwitchHTML, wireEditorSwitch, proToast, registerShell, wireShell, syncShell, aiOn, wireVoice,
  projectChipHTML, shellActionsHTML, commandBarHTML, aiStatusHTML, fitCommandBar,
} from "./pro_shell.js";
import { S } from "./state.js";
import { markDirty } from "./persist.js";

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
  aiOff: ["AI is off — type a tool's name, or turn AI back on with the AI switch.", "AI כבוי — הקלידו שם של כלי, או הפעילו AI במתג ה־AI."],
  every: ["Every command", "כל הפקודות"],
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

function toolButton(tool) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "pr-tool";
  b.dataset.proBind = tool.bind || "";
  var name = L(tool.label);
  b.title = name + (tool.key ? " (" + tool.key + ")" : "");
  b.setAttribute("aria-label", name);
  if (!tool.bind) { b.disabled = true; b.title = name + M("notYet"); }
  if (tool.bind && tool.bind.indexOf("planned:") === 0) { b.classList.add("planned"); b.title = name + M("plannedTip"); b.setAttribute("aria-description", M("plannedHelp")); }
  b.innerHTML = '<i class="ph ' + tool.icon + '" aria-hidden="true"></i><span></span>' + (tool.key ? "<kbd>" + tool.key + "</kbd>" : "");
  b.querySelector("span").textContent = name;
  b.addEventListener("click", function () { runProBinding(tool.bind, tool.label); syncActive(); });
  return b;
}

var ribbon = null;

function renderGroups(tabIndex) {
  var tabs = PRO_CATALOG.plan.tabs;
  var i = Math.max(0, Math.min(tabs.length - 1, tabIndex));
  ribbon.querySelectorAll(".pr-tab").forEach(function (t, j) {
    t.classList.toggle("on", j === i);
    t.setAttribute("aria-selected", j === i ? "true" : "false");
  });
  var body = ribbon.querySelector(".pr-groups");
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
  store(LS_TAB, String(i));
  syncActive();
}

/* The floating rail stays the source of truth for the active tool. */
function syncActive() {
  var on = document.querySelector("#plan-toolbar [data-tool].active, #plan-toolbar [data-tool].on");
  var active = on ? "tool:" + on.getAttribute("data-tool") : "";
  if (ribbon) ribbon.querySelectorAll(".pr-tool").forEach(function (b) { b.classList.toggle("on", !!active && b.dataset.proBind === active); });
  // The fold rails' docked grids (renderToolTab) show each editor's armed tool:
  // the planner's from its rail, the model editor's and the cabinet designer's
  // from their own command buttons, which mark the active one with .on.
  document.querySelectorAll(".pro-rail-grid [data-pro-bind]").forEach(function (b) {
    b.classList.toggle("on", railBindActive(b.dataset.proBind, active));
  });
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
  ribbon.querySelectorAll(".pr-tab").forEach(function (t) {
    t.addEventListener("click", function () { setCollapsed(false); renderGroups(+t.dataset.proTab); });
  });
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
      b.title = name + (tool.key ? " (" + tool.key + ")" : "");
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

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

/* The top bar's tool search already covers all three editors' tools. */
function openToolSearch() {
  var input = document.getElementById("toolSearchInput");
  if (!input) return;
  input.focus();
  input.select();
}

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
    var tool = editorToolNamed(editor, text);
    if (!tool) return false;
    runProBinding(tool.bind, tool.label);
    syncActive();
    return true;
  },
  suggest: suggestTools,
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
  mountStatusChip(0);
  fitPlannerBar();
  if (!shellMounted) {
    shellMounted = true;
    /* Refit when anything that shares the row can have moved: the window, the
       view mode (the centre canvas's classes), and the plan's own tool panels. */
    var refit = function () { requestAnimationFrame(fitPlannerBar); };
    window.addEventListener("resize", refit);
    if (window.MutationObserver) {
      if (canvas) new MutationObserver(refit).observe(canvas, { attributes: true, attributeFilter: ["class"] });
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
    setInterval(syncShell, 1500);
  }
}
/* What floats in the bar's row over the plan and the 3D view. */
var PLANNER_BAR_OBSTACLES = ".pt-panel, .view-gizmo, .planner-navigation, .plan-gizmo, .view-max-btn, .plan-style-btn";
function fitPlannerBar() {
  var canvas = document.getElementById("center-canvas");
  var bar = canvas && canvas.querySelector(":scope > .ps-cmdbar");
  if (!bar) return;
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
