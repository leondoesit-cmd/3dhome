/* The AI card of the model editor's and the cabinet designer's bottom bar:
 * the request goes to js/editor_agent.js, and what comes back is shown above
 * the bar before anything changes —
 *
 *   Working…  (Stop)
 *   → the AI's sentence, and what it picked: "column 1 · compartment 2:
 *     Shelves → Drawers ×3", "Open Fillet — radius 8 mm on the top edges"
 *     with its compartment outlined on the drawing;  Apply · Cancel
 *   → Applied;  Undo (only the steps the AI's change made) · Close
 *
 * Nothing is applied without Apply. With no AI model set up the bar says so
 * and keeps the text; the planner's AI helper settings hold the one set of
 * settings every editor uses. */
import { registerShell, proToast, runShellTool } from "./pro_shell.js";
import { editorAgent, runEditorAgentTurn } from "./editor_agent.js";
import { loadAgentConfig, validateAgentConfig } from "./agent_config.js";
import { getLang } from "./i18n.js";

var MSG = {
  head: ["AI · {0}", "AI · {0}"],
  model: ["Model editor", "עורך המודלים"],
  cab: ["Cabinet designer", "מעצב הארונות"],
  working: ["Working on it…", "עובד על זה…"],
  stop: ["Stop", "עצירה"],
  picked: ["The AI picked", "ה־AI בחר"],
  open: ["Open “{0}”", "פתיחת „{0}”"],
  opened: ["Opened “{0}” — fill it in by hand", "„{0}” נפתח — מלאו אותו ידנית"],
  apply: ["Apply", "החלה"],
  cancel: ["Cancel", "ביטול"],
  close: ["Close", "סגירה"],
  undo: ["Undo", "ביטול השינוי"],
  applied: ["Applied.", "הוחל."],
  undone: ["Undone.", "השינוי בוטל."],
  asked: ["The designer asks how to re-plan the layout for the new size — pick there. Undo and the history take any of it back.", "המעצב שואל איך לתכנן מחדש את הפריסה לגודל החדש — בחרו שם. ביטול וההיסטוריה מחזירים כל חלק מזה."],
  nothing: ["Nothing to prepare for that here.", "אין כאן מה להכין לבקשה הזו."],
  failed: ["Could not prepare: {0}", "לא ניתן להכין: {0}"],
  unreachable: ["The AI helper could not be reached: {0}", "לא ניתן להגיע לעוזר ה־AI: {0}"],
  setup: ["Set up the AI helper first (Planner → Team → AI helper) — every tool also works by hand.", "הגדירו קודם את עוזר ה־AI (מתכנן ← צוות ← עוזר AI) — כל כלי עובד גם ידנית."],
  closed: ["Open a document in this editor first.", "פתחו קודם מסמך בעורך הזה."],
  byHand: ["Checks are advice — nothing changes until Apply.", "זו המלצה — שום דבר לא משתנה עד ההחלה."],
};
function M(key, arg) {
  var s = MSG[key][getLang() === "he" ? 1 : 0];
  return arg == null ? s : s.replace("{0}", arg);
}
function h(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

var card = null, run = 0, controller = null;

function closeCard() {
  run++;
  if (controller) { try { controller.abort(); } catch (_) {} controller = null; }
  if (card && card._clear) card._clear();
  if (card) card.remove();
  card = null;
}

/* Above the bar, in the bar's own pane: the same left and width as the bar,
   its bottom just over the bar's top. */
function place(bar) {
  if (!card || !bar.isConnected) return;
  var host = bar.offsetParent || bar.parentElement, hr = host.getBoundingClientRect(), br = bar.getBoundingClientRect();
  card.style.left = Math.round(br.left - hr.left) + "px";
  card.style.width = Math.round(br.width) + "px";
  card.style.bottom = Math.round(hr.bottom - br.top + 8) + "px";
}

function frame(editor, bar) {
  closeCard();
  card = h("section", "ea-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-live", "polite");
  var head = h("header", "ea-head");
  head.appendChild(h("b", null, M("head", M(editor))));
  var x = h("button", "ea-x");
  x.type = "button";
  x.setAttribute("aria-label", M("close"));
  x.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
  x.addEventListener("click", closeCard);
  head.appendChild(x);
  card.appendChild(head);
  card.appendChild(h("div", "ea-body"));
  card.appendChild(h("footer", "ea-foot"));
  card.addEventListener("keydown", function (e) {
    e.stopPropagation(); // the card's keys are not editor shortcuts
    if (e.key === "Escape") closeCard();
  });
  (bar.offsetParent || bar.parentElement).appendChild(card);
  place(bar);
  return card;
}
function body() { return card.querySelector(".ea-body"); }
function foot(buttons) {
  var f = card.querySelector(".ea-foot");
  f.textContent = "";
  buttons.forEach(function (b) {
    var el = h("button", b.primary ? "ea-btn ea-primary" : "ea-btn", b.label);
    el.type = "button";
    el.addEventListener("click", b.run);
    f.appendChild(el);
  });
  var first = f.querySelector(".ea-primary") || f.querySelector("button");
  if (first) first.focus();
}

// "NO_SUCH_VARIABLE" → "no such variable": the codes are for the model, not a person
function reasons(list) {
  return list.map(function (r) { return String(r).toLowerCase().replace(/_/g, " "); }).join(", ");
}
function proposalLines(p) {
  if (p.kind === "command") return [M("open", p.label) + (p.values ? " — " + p.values : "")];
  return p.lines || [];
}

function showResult(editor, bar, adapter, result) {
  var b = body();
  b.textContent = "";
  if (result.reply) b.appendChild(h("p", "ea-reply", result.reply));
  if (!result.proposals.length) {
    if (!result.reply) b.appendChild(h("p", "ea-reply", M("nothing")));
    if (result.failures.length) b.appendChild(h("p", "ea-note", M("failed", reasons(result.failures.map(function (f) { return f.reason; })))));
    foot([{ label: M("close"), primary: true, run: closeCard }]);
    return;
  }
  b.appendChild(h("div", "ea-kicker", M("picked")));
  var list = h("ul", "ea-list");
  result.proposals.forEach(function (p) {
    proposalLines(p).forEach(function (line) {
      var li = h("li", "ea-item ea-" + p.kind);
      li.appendChild(h("i", "ph " + (p.kind === "command" ? "ph-terminal-window" : "ph-sparkle")));
      li.appendChild(h("span", null, line));
      list.appendChild(li);
    });
  });
  b.appendChild(list);
  if (result.failures.length) b.appendChild(h("p", "ea-note", M("failed", reasons(result.failures.map(function (f) { return f.reason; })))));
  b.appendChild(h("p", "ea-note", M("byHand")));
  // outline what the first proposal names, where the editor can
  var shown = result.proposals.find(function (p) { return p.kind !== "command"; });
  if (shown && adapter.focus) adapter.focus(shown);
  if (adapter.clear) card._clear = adapter.clear;
  foot([
    { label: M("apply"), primary: true, run: function () { applyAll(editor, bar, adapter, result.proposals); } },
    { label: M("cancel"), run: closeCard },
  ]);
}

function applyAll(editor, bar, adapter, proposals) {
  var steps = 0, asked = false, problems = [], opened = [];
  proposals.forEach(function (p) {
    if (p.kind === "command") {
      if (runShellTool(editor, p.label)) opened.push(p);
      else problems.push(p.label);
      return;
    }
    var out = adapter.apply(p) || {};
    if (!out.ok) problems.push(out.reason || "FAILED");
    steps += out.steps || 0;
    if (out.asked) asked = true;
  });
  var b = body();
  b.textContent = "";
  // a command only opens: say so, with what the AI said to enter in it
  if (opened.length < proposals.length) b.appendChild(h("p", "ea-reply", M("applied")));
  opened.forEach(function (p) {
    b.appendChild(h("p", "ea-reply", M("opened", p.label) + (p.values ? ": " + p.values : "")));
  });
  if (asked) b.appendChild(h("p", "ea-note", M("asked")));
  if (problems.length) b.appendChild(h("p", "ea-note", M("failed", reasons(problems))));
  var buttons = [{ label: M("close"), primary: true, run: closeCard }];
  /* Undo takes back exactly the steps this change made, nothing before it —
     so not when the designer is still asking about a size: the step that
     choice makes lands on top of these, after the card has counted. */
  if (steps && adapter.undo && !asked) buttons.push({ label: M("undo"), run: function () {
    for (var i = 0; i < steps; i++) adapter.undo();
    body().textContent = "";
    body().appendChild(h("p", "ea-reply", M("undone")));
    foot([{ label: M("close"), primary: true, run: closeCard }]);
  } });
  foot(buttons);
}

function askEditor(editor, text, bar) {
  var adapter = editorAgent(editor);
  if (!adapter) return false;
  if (adapter.isOpen && !adapter.isOpen()) { proToast(M("closed")); return false; }
  var checked = validateAgentConfig(loadAgentConfig());
  if (!checked.ok) { proToast(M("setup")); return false; }
  frame(editor, bar);
  var mine = ++run;
  controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  body().appendChild(h("p", "ea-working", M("working")));
  foot([{ label: M("stop"), run: closeCard }]);
  runEditorAgentTurn(editor, text, checked.config, { signal: controller && controller.signal }).then(function (result) {
    if (mine !== run || !card) return;
    controller = null;
    showResult(editor, bar, adapter, result);
    place(bar);
  }, function (error) {
    if (mine !== run || !card) return;
    controller = null;
    body().textContent = "";
    body().appendChild(h("p", "ea-note", M("unreachable", String(error && error.message || error))));
    foot([{ label: M("close"), primary: true, run: closeCard }]);
  });
  return true;
}

registerShell({
  canAskEditor: function (editor) { return !!editorAgent(editor); },
  askEditor: askEditor,
});
// leaving the editor takes its card with it
window.addEventListener("resize", function () { if (card) { var bar = card.parentElement && card.parentElement.querySelector(".ps-cmdbar"); if (bar) place(bar); } });
