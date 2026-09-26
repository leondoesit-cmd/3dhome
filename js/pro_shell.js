/* The pro shell: one editor switcher — Planner · Model · Cabinet — shared by
 * the planner ribbon, the model editor header and the cabinet designer header,
 * so every editor can reach the other two the same way (Round 6 mockups).
 *
 * This module imports no editor. Each editor registers how it opens and how it
 * is left, which keeps the lazily-loaded model editor off the boot graph and
 * avoids an import cycle with ui_cabinet.js (which mounts the switcher too).
 *
 *   open()   — show the editor; for the cabinet designer this opens the item
 *              selected in the plan, so canOpen()/why() say when there is none.
 *   isOpen() — true while its overlay is showing.
 *   leave()  — close it; may ask about unsaved work and resolve false to stay.
 *
 * The rest of the Round-6 shell lives here for the same reason: the project
 * name, the AI switch, Share, the bottom "AI | › Cmd" bar and the AI status
 * chip are markup and wiring only. What they act on comes from registerShell()
 * (js/pro_ribbon.js registers the planner's project, AI helper and the pro
 * catalog), so an editor mounts them without importing the planner.
 */
import { getLang } from "./i18n.js";
import { proLabel } from "./pro_catalog.js";

var EDITORS = [
  // id, full name (desktop), short name (phone, fold) — both in PRO_HE
  ["plan", "Planner", "Plan"],
  ["model", "Model editor", "Model"],
  ["cab", "Cabinet designer", "Cabinet"],
];
var MSG = {
  editor: ["Editor", "עורך"],
  project: ["Project name — click to rename", "שם הפרויקט — לחצו לשינוי"],
  projectRo: ["Project name (view only)", "שם הפרויקט (צפייה בלבד)"],
  ai: ["AI", "AI"],
  aiTipOn: ["AI on — the bar can ask the AI helper. Every tool also works by hand.", "AI פעיל — אפשר לשאול את העוזר מהסרגל. כל כלי עובד גם ידנית."],
  aiTipOff: ["AI off — fully manual: the bar only runs tools by name.", "AI כבוי — ידני לגמרי: הסרגל רק מפעיל כלים לפי שם."],
  share: ["Share", "שיתוף"],
  shareTip: ["Share and review this project", "שיתוף וסקירה של הפרויקט"],
  modes: ["Ask the AI or run a command", "שאלו את ה־AI או הפעילו פקודה"],
  cmd: ["› Cmd", "› פקודה"],
  aiPlanOnly: ["The AI helper works on the plan for now — Cmd runs every tool here.", "עוזר ה־AI עובד כרגע על התוכנית — פקודה מפעילה כאן כל כלי."],
  aiIsOff: ["AI is off — Cmd runs every tool by name. Turn AI back on with the AI switch.", "AI כבוי — פקודה מפעילה כל כלי לפי שם. הפעילו AI במתג ה־AI."],
  noTool: ["No tool called “{0}”.", "אין כלי בשם „{0}”."],
  statusOn: ["AI on · every tool also works by hand", "AI פעיל · כל כלי עובד גם ידנית"],
  statusOff: ["AI off · fully manual", "AI כבוי · ידני לגמרי"],
  mic: ["Speak your request", "אמרו את הבקשה"],
  micOff: ["Voice input is not supported in this browser.", "הקלטה קולית לא נתמכת בדפדפן הזה."],
  listening: ["Listening…", "מקשיב…"],
  suggest: ["Matching tools", "כלים מתאימים"],
};
/* Example requests per editor. Every tool named in a Cmd example is a real
   entry of js/pro_catalog.js (tests/pro_shell.test.mjs checks it). */
var PLACEHOLDER = {
  plan: {
    ai: ["Ask or command: “make this wall 200 thick”, “add a window here”, “Wall”", "שאלו או פקדו: „קיר בעובי 200”, „הוסף חלון כאן”, „קיר”"],
    cmd: ["Type a tool: “Wall”, “Door”, “Dimension”, “Section”…", "הקלידו כלי: „קיר”, „דלת”, „מידה”, „חתך”…"],
  },
  model: {
    cmd: ["Type a command: “Extrude”, “Fillet”, “Hole wizard”…", "הקלידו פקודה: „שליפה”, „עיגול פינה”, „אשף חורים”…"],
  },
  cab: {
    cmd: ["Type a tool: “Presets”, “Vertical partition”, “Kitchen run”…", "הקלידו כלי: „תבניות”, „מחיצה אנכית”, „שורת מטבח”…"],
  },
};
function he() { return getLang() === "he"; }
function L(text) { return proLabel(text, he() ? "he" : "en"); }
function M(key) { return MSG[key][he() ? 1 : 0]; }

var editors = {};

/** Register (or extend) an editor's open/isOpen/leave/canOpen/why hooks. */
export function registerEditor(id, hooks) {
  editors[id] = Object.assign(editors[id] || {}, hooks);
}

/** The editor whose overlay is showing, else the planner underneath them. */
export function activeEditor() {
  if (editors.model && editors.model.isOpen && editors.model.isOpen()) return "model";
  if (editors.cab && editors.cab.isOpen && editors.cab.isOpen()) return "cab";
  return "plan";
}

export function proToast(msg) {
  var el = document.getElementById("proToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "proToast";
    el.className = "pro-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("on"); }, 2600);
}

/* Leaving goes first and may be refused (unsaved model work), and the target is
   checked before anything closes: a Cabinet press with nothing selected must
   not throw the user out of the editor they were in. */
export async function switchEditor(target) {
  var from = activeEditor();
  if (target === from) return true;
  var to = editors[target] || {};
  if (to.canOpen && !to.canOpen()) {
    if (to.why) proToast(to.why());
    return false;
  }
  var cur = editors[from];
  if (cur && cur.leave && (await cur.leave()) === false) return false;
  // The model editor may still be fetching three.js when open() resolves, so
  // this does not check isOpen() afterwards; the editor reports its own failure.
  if (to.open) await to.open();
  return true;
}

/** Markup for the switcher; `active` is "plan" | "model" | "cab". */
export function editorSwitchHTML(active, extraClass) {
  return (
    '<div class="pr-editors' + (extraClass ? " " + extraClass : "") + '" role="group" aria-label="' + M("editor") + '">' +
    EDITORS.map(function (e) {
      var on = e[0] === active;
      return (
        '<button type="button" data-pro-editor="' + e[0] + '"' + (on ? ' class="on" aria-current="page"' : "") +
        ' aria-pressed="' + on + '" title="' + L(e[1]) + '">' +
        '<span class="pr-ed-full">' + L(e[1]) + '</span><span class="pr-ed-short" aria-hidden="true">' + L(e[2]) + "</span></button>"
      );
    }).join("") +
    "</div>"
  );
}

/** Wire every switcher button inside `root` (idempotent per element). */
export function wireEditorSwitch(root) {
  root.querySelectorAll(".pr-editors [data-pro-editor]").forEach(function (b) {
    if (b._proSwitch) return;
    b._proSwitch = true;
    b.addEventListener("click", function () { switchEditor(b.getAttribute("data-pro-editor")); });
  });
}

/* ================================================================ the shell */

var LS_AI = "mf.proShell.ai";
var LS_MODE = "mf.proShell.mode";
function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* private mode or no storage: the shell simply forgets */ }
  return null;
}
function P(editor, mode) {
  var row = (PLACEHOLDER[editor] || PLACEHOLDER.plan)[mode] || PLACEHOLDER.plan.cmd;
  return row[he() ? 1 : 0];
}

/* AI on is the default; off means fully manual — the bar never reaches the
   AI helper and says so. The helper's own button still opens it on request. */
export function aiOn() { return store(LS_AI) !== "0"; }
export function setAiOn(on) {
  store(LS_AI, on ? "1" : "0");
  syncShell();
}

/* What the shell acts on:
     projectName() canRename() renameProject(name) share()
     ask(text) -> bool               the planner's AI helper (tool names first)
     runTool(editor, text) -> bool   an exact tool name in that editor
     suggest(editor, text) -> [{label, sub, run}] */
var shell = {};
export function registerShell(hooks) {
  Object.assign(shell, hooks);
  syncShell();
}

/* The AI mode needs the planner's helper, so only the planner offers it. */
function aiModeAvailable(editor) { return aiOn() && editor === "plan" && !!shell.ask; }
function barMode(editor) { return aiModeAvailable(editor) && store(LS_MODE) !== "cmd" ? "ai" : "cmd"; }

export function projectChipHTML() {
  return '<span class="ps-project"><button type="button" class="ps-project-btn" data-ps="rename">' +
    '<i class="ph ph-house-line" aria-hidden="true"></i><span class="ps-project-name"></span></button></span>';
}

/** AI switch + Share, in the order of the mockup header. */
export function shellActionsHTML() {
  return '<span class="ps-actions">' +
    '<button type="button" class="ps-ai" role="switch" data-ps="ai"><i class="ph ph-sparkle" aria-hidden="true"></i><span>' + M("ai") + '</span><span class="ps-knob" aria-hidden="true"></span></button>' +
    '<button type="button" class="ps-share" data-ps="share" title="' + M("shareTip") + '"><i class="ph ph-share-network" aria-hidden="true"></i><span>' + M("share") + "</span></button>" +
    "</span>";
}

/* Rendered in its current state: a host that rebuilds its status line (the
   model editor does, on every sync) re-adds it without waiting for a sync. */
export function aiStatusHTML() {
  var on = aiOn();
  return '<span class="ps-ai-status' + (on ? "" : " off") + '" data-ps="status"><i class="ph ph-sparkle" aria-hidden="true"></i><span>' +
    M(on ? "statusOn" : "statusOff") + "</span></span>";
}

/** The floating "AI | › Cmd" bar for `editor` ("plan" | "model" | "cab"). */
export function commandBarHTML(editor) {
  return '<div class="ps-cmdbar" data-ps-bar="' + editor + '">' +
    '<div class="ps-modes" role="radiogroup" aria-label="' + M("modes") + '">' +
      '<button type="button" role="radio" data-ps-mode="ai"><i class="ph ph-sparkle" aria-hidden="true"></i> ' + M("ai") + "</button>" +
      '<button type="button" role="radio" data-ps-mode="cmd">' + M("cmd") + "</button>" +
    "</div>" +
    '<input type="text" class="ps-cmd-input" enterkeyhint="go" autocomplete="off" spellcheck="false" dir="auto" role="combobox" aria-autocomplete="list" aria-expanded="false">' +
    '<button type="button" class="ps-mic"><i class="ph ph-microphone" aria-hidden="true"></i></button>' +
    '<ul class="ps-suggest" role="listbox" aria-label="' + M("suggest") + '" hidden></ul>' +
    "</div>";
}

var roots = [];

/** Wire every shell piece inside `root`; `editor` is whose bar/tools these are. */
export function wireShell(root, editor) {
  if (!root) return;
  if (roots.indexOf(root) < 0) roots.push(root);
  root.querySelectorAll('[data-ps="rename"]').forEach(function (b) {
    once(b, function () { b.addEventListener("click", function () { startRename(b); }); });
  });
  root.querySelectorAll('[data-ps="ai"]').forEach(function (b) {
    once(b, function () { b.addEventListener("click", function () { setAiOn(!aiOn()); }); });
  });
  root.querySelectorAll('[data-ps="share"]').forEach(function (b) {
    once(b, function () { b.addEventListener("click", function () { if (shell.share) shell.share(); }); });
  });
  root.querySelectorAll(".ps-cmdbar").forEach(function (bar) {
    once(bar, function () { wireBar(bar, editor || bar.dataset.psBar); });
  });
  root._psAi = undefined;
  syncShell();
}
function once(el, fn) {
  if (el._psWired) return;
  el._psWired = true;
  fn();
}

/** Refresh every mounted shell piece: names, the AI switch, modes, status. */
export function syncShell() {
  roots = roots.filter(function (r) { return r.isConnected; });
  var on = aiOn();
  var name = shell.projectName ? shell.projectName() : "";
  var canRename = !!shell.renameProject && (!shell.canRename || shell.canRename());
  roots.forEach(function (root) {
    root.querySelectorAll(".ps-project-btn").forEach(function (b) {
      // Runs on a slow poll too, so it only writes what changed.
      var span = b.querySelector(".ps-project-name");
      if (span && span.textContent !== name) span.textContent = name;
      if (b.disabled !== !canRename) b.disabled = !canRename;
      var tip = M(canRename ? "project" : "projectRo");
      if (b.title !== tip) b.title = tip;
      if (b.getAttribute("aria-label") !== name + " — " + tip) b.setAttribute("aria-label", name + " — " + tip);
    });
    if (root._psAi === on) return; // the rest only changes with the AI switch or language
    root._psAi = on;
    root.querySelectorAll('[data-ps="ai"]').forEach(function (b) {
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("on", on);
      b.title = M(on ? "aiTipOn" : "aiTipOff");
    });
    root.querySelectorAll('[data-ps="status"]').forEach(function (s) {
      s.classList.toggle("off", !on);
      s.querySelector("span").textContent = M(on ? "statusOn" : "statusOff");
    });
    root.querySelectorAll(".ps-cmdbar").forEach(syncBar);
  });
}

function syncBar(bar) {
  var editor = bar.dataset.psBar;
  var mode = barMode(editor);
  bar.dataset.mode = mode;
  bar.querySelectorAll("[data-ps-mode]").forEach(function (b) {
    var m = b.dataset.psMode, sel = m === mode;
    b.classList.toggle("on", sel);
    b.setAttribute("aria-checked", sel ? "true" : "false");
    var unavailable = m === "ai" && !aiModeAvailable(editor);
    b.setAttribute("aria-disabled", unavailable ? "true" : "false");
    b.classList.toggle("unavailable", unavailable);
    if (unavailable) b.title = M(aiOn() ? "aiPlanOnly" : "aiIsOff");
    else b.removeAttribute("title");
  });
  var input = bar.querySelector(".ps-cmd-input");
  if (!bar.classList.contains("listening")) input.placeholder = P(editor, mode);
  input.setAttribute("aria-label", P(editor, mode));
  if (mode !== "cmd") hideSuggest(bar);
}

function startRename(button) {
  if (!shell.renameProject || button.disabled) return;
  var wrap = button.parentNode;
  var input = document.createElement("input");
  input.type = "text";
  input.className = "ps-project-input";
  input.maxLength = 80;
  input.value = shell.projectName ? shell.projectName() : "";
  input.setAttribute("aria-label", M("project"));
  button.hidden = true;
  wrap.appendChild(input);
  input.focus();
  input.select();
  var done = false;
  function finish(commit) {
    if (done) return;
    done = true;
    var value = input.value.trim();
    input.remove();
    button.hidden = false;
    if (commit && value) shell.renameProject(value);
    syncShell();
    button.focus();
  }
  input.addEventListener("keydown", function (e) {
    e.stopPropagation(); // typing a name must not fire editor shortcuts
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", function () { finish(true); });
}

/* ---------------------------------------------------------------- the bar */

function wireBar(bar, editor) {
  var input = bar.querySelector(".ps-cmd-input");
  var list = bar.querySelector(".ps-suggest");
  var active = -1, items = [];
  bar.querySelectorAll("[data-ps-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.psMode === "ai" && !aiModeAvailable(editor)) { proToast(M(aiOn() ? "aiPlanOnly" : "aiIsOff")); return; }
      store(LS_MODE, b.dataset.psMode);
      syncBar(bar);
      input.focus();
      refresh();
    });
  });
  function refresh() {
    var q = input.value.trim();
    items = bar.dataset.mode === "cmd" && q && shell.suggest ? shell.suggest(editor, q).slice(0, 6) : [];
    active = items.length ? 0 : -1;
    render();
  }
  function render() {
    list.innerHTML = "";
    items.forEach(function (it, i) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = "ps-opt-" + editor + "-" + i;
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      li.className = i === active ? "on" : "";
      li.innerHTML = "<b></b><small></small>";
      li.querySelector("b").textContent = it.label;
      li.querySelector("small").textContent = it.sub || "";
      // pointerdown, so the input's blur does not hide the list first
      li.addEventListener("pointerdown", function (e) { e.preventDefault(); run(it); });
      list.appendChild(li);
    });
    list.hidden = !items.length;
    input.setAttribute("aria-expanded", items.length ? "true" : "false");
    if (active >= 0) input.setAttribute("aria-activedescendant", "ps-opt-" + editor + "-" + active);
    else input.removeAttribute("aria-activedescendant");
  }
  function run(it) {
    input.value = "";
    items = [];
    render();
    it.run();
  }
  function submit(text) {
    text = String(text || "").trim();
    if (!text) return false;
    if (bar.dataset.mode === "ai") {
      if (shell.ask && shell.ask(text)) { input.value = ""; return true; }
      return false; // ask() says why it could not
    }
    if (active >= 0 && items[active]) { run(items[active]); return true; }
    if (shell.runTool && shell.runTool(editor, text)) { input.value = ""; hideSuggest(bar); return true; }
    proToast(M("noTool").replace("{0}", text));
    return false;
  }
  input.addEventListener("input", refresh);
  input.addEventListener("focus", refresh);
  input.addEventListener("blur", function () { setTimeout(function () { items = []; render(); }, 0); });
  input.addEventListener("keydown", function (e) {
    e.stopPropagation(); // typing here must not trigger editor shortcuts
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit(input.value);
    } else if (e.key === "Escape") {
      if (items.length) { items = []; render(); } else input.blur();
    }
  });
  wireVoice(input, bar.querySelector(".ps-mic"), bar, submit, function () { return P(editor, bar.dataset.mode); });
}
function hideSuggest(bar) {
  var list = bar.querySelector(".ps-suggest"), input = bar.querySelector(".ps-cmd-input");
  if (list) { list.hidden = true; list.innerHTML = ""; }
  if (input) { input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
}

/* Dictation into a text box: interim words show as they come, the final text
   goes to onFinal (true once it has acted on it, which clears the box). Shared
   by the bottom bar and the phone Tools sheet's Ask box. */
export function wireVoice(input, mic, holder, onFinal, placeholder) {
  if (!input || !mic) return;
  var Rec = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  mic.setAttribute("aria-label", M("mic"));
  mic.title = M("mic");
  if (!Rec) { mic.addEventListener("click", function () { proToast(M("micOff")); }); return; }
  var rec = null;
  mic.addEventListener("click", function () {
    if (rec) { rec.stop(); return; }
    rec = new Rec();
    rec.lang = he() ? "he-IL" : "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    holder.classList.add("listening");
    input.placeholder = M("listening");
    var finalText = "";
    rec.onresult = function (ev) {
      var interim = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
        else interim += ev.results[i][0].transcript;
      }
      input.value = (finalText + interim).trim();
    };
    rec.onerror = function () { /* onend still runs and resets the box */ };
    rec.onend = function () {
      holder.classList.remove("listening");
      input.placeholder = placeholder();
      rec = null;
      if (finalText.trim() && onFinal(finalText)) input.value = "";
    };
    rec.start();
  });
}
