/* The planner coach: a light-bulb in the bottom command bar that answers
   "what can I do here?", and a small non-modal card that explains the current
   situation — by itself the first time (unless muted or switched off), and
   whenever the bulb is pressed. Topics, strings and the pure rules live in
   js/coach_topics.js; this file is the DOM.

   Evaluated on events, never polled: a storey added or switched
   (coachEvaluate, from js/planner_chrome.js), a selection change
   ("planner-selection"), and a cheap signature check after each plan render
   that only keeps the bulb's dot honest. */
import { S, uid } from "./state.js";
import { getLang, onLangChange } from "./i18n.js";
import { onAfterRender, render2D } from "./plan2d.js";
import { pushHistory, onAfterRestore } from "./history.js";
import { setTool } from "./interaction.js";
import { flash, fillProps, refreshTree } from "./ui.js";
import { withoutRoomPrompts } from "./ui_tree.js";
import { markDirty } from "./persist.js";
import { floorBelow, toggleReferenceFloor } from "./floors.js";
import { floorDisplayName, floorText } from "./floor_strings.js";
import { copyStoreyWalls } from "./floor_copy.js";
import { fmtLen } from "./display_units.js";
import {
  COACH_TOPICS, autoTopic, bulbTopic, coachContext, coachText, coachTopic, normalizeCoachPrefs,
  pendingTopic, readCoachPrefs, topicActions, topicScopeKey, topicSteps, writeCoachPrefs,
} from "./coach_topics.js";

var prefs = normalizeCoachPrefs(null);
var opened = new Set(); // topicScopeKey values opened this session
var card = null, cardTopic = null, cardAuto = false;
var bulb = null;
var floatBulb = null; // phones: the command bar lives in the Ask sheet there
var lastSig = "";
var evalQueued = false;

function storage() {
  try { return window.localStorage; } catch (_) { return null; }
}
function savePrefs() { writeCoachPrefs(storage(), prefs); }

/* ---- the illustrations: inline SVG, CSS keyframes in css/coach.css ---- */
var ANIM = {
  upper:
    '<svg viewBox="0 0 160 84" aria-hidden="true" focusable="false">' +
    '<rect class="ca-ghost" x="18" y="10" width="124" height="64" rx="1"/>' +
    '<line class="ca-ghost" x1="84" y1="10" x2="84" y2="74"/>' +
    '<rect class="ca-void" x="96" y="20" width="18" height="40"/>' +
    '<path class="ca-wall" pathLength="100" d="M18 10H142V74H18Z"/>' +
    '<path class="ca-wall ca-wall2" pathLength="100" d="M84 10V74"/>' +
    "</svg>",
  stairs:
    '<svg viewBox="0 0 160 84" aria-hidden="true" focusable="false">' +
    '<g class="ca-turn">' +
    '<g class="ca-st ca-st1"><rect x="68" y="12" width="24" height="60"/><path d="M68 22h24M68 32h24M68 42h24M68 52h24M68 62h24"/><path class="ca-run" d="M80 70V16"/></g>' +
    '<g class="ca-st ca-st2"><path d="M56 72V30h24v42z"/><path d="M56 30V12h44v18H80"/><path d="M56 40h24M56 50h24M56 60h24M88 12v18M94 12v18"/><path class="ca-run" d="M68 70V22h30"/></g>' +
    '<g class="ca-st ca-st3"><path d="M54 72V12h52v60H84V30H76v42z"/><path d="M54 62h22M54 52h22M54 42h22M84 42h22M84 52h22M84 62h22"/><path class="ca-run" d="M65 70V20h30v50"/></g>' +
    "</g></svg>",
  first:
    '<svg viewBox="0 0 160 84" aria-hidden="true" focusable="false">' +
    '<path class="ca-wall" pathLength="100" d="M30 14H130V70H30Z"/>' +
    '<path class="ca-door" d="M70 70V52a18 18 0 0 1 18 18"/>' +
    '<circle class="ca-dot" cx="30" cy="14" r="3"/>' +
    "</svg>",
};

/* ---- context and vars ---- */
function ctxNow() { return coachContext(S); }

function nameOf(info) {
  if (!info) return "";
  var floors = (S.workspace && S.workspace.floors) || [];
  var idx = floors.findIndex(function (f) { return f && f.id === info.id; });
  return floorDisplayName(idx >= 0 ? floors[idx] : { id: info.id, name: info.name }, idx);
}

/* Names and lengths go into sentences of the other script ("Floor 1" inside
   Hebrew, "300 cm" too): bidi isolates keep each one whole and in place. */
var FSI = String.fromCharCode(0x2068), PDI = String.fromCharCode(0x2069);
function iso(s) { return s ? FSI + s + PDI : s; }

function varsFor(ctx) {
  var height = ctx.floor && ctx.below ? ctx.floor.elevation - ctx.below.elevation : 0;
  return { floor: iso(nameOf(ctx.floor)), below: iso(nameOf(ctx.below)), above: iso(nameOf(ctx.above)), height: iso(fmtLen(height)) };
}

function blocked() {
  if (typeof document === "undefined") return true;
  var start = document.getElementById("start-screen");
  if (start && !start.hidden) return true;
  if (document.querySelector(".bp-overlay, .planner-tour-card")) return true;
  var modal = document.querySelector('[role="dialog"][aria-modal="true"]');
  return !!(modal && modal.offsetParent !== null);
}

/* ---- the bulb ---- */
function makeBulb(cls) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.innerHTML = '<i class="ph ph-lightbulb" aria-hidden="true"></i><span class="ps-coach-dot" aria-hidden="true"></span>';
  b.addEventListener("click", function () {
    if (card && cardTopic && !cardAuto) { closeCard(true); return; }
    openCoach();
  });
  return b;
}

function bulbs() {
  return [bulb, floatBulb].filter(Boolean);
}

/* The one a phone or a desktop actually shows (focus goes back to it). */
function shownBulb() {
  return bulbs().find(function (b) { return b.isConnected && b.offsetParent !== null; }) || null;
}

function ensureBulb() {
  /* Phones (body.compact-nav, css/coach.css) keep the command bar inside the
     Ask sheet, so a second bulb floats over the plan's bottom corner there. */
  var plan = document.getElementById("view-2d");
  if (plan && !(floatBulb && floatBulb.isConnected)) {
    if (!floatBulb) floatBulb = makeBulb("ps-coach ps-coach-float");
    plan.appendChild(floatBulb);
    labelBulb();
  }
  if (bulb && bulb.isConnected) return bulb;
  var bar = document.querySelector('.ps-cmdbar[data-ps-bar="plan"]');
  if (!bar) return null;
  if (!bulb) bulb = makeBulb("ps-coach");
  labelBulb();
  var all = bar.querySelector(".ps-allcmds"), modes = bar.querySelector(".ps-modes");
  var after = all || modes;
  bar.insertBefore(bulb, after ? after.nextSibling : bar.firstChild);
  return bulb;
}

function labelBulb() {
  var tip = coachText("bulb");
  bulbs().forEach(function (b) {
    b.title = tip;
    b.setAttribute("aria-label", tip);
  });
}

function syncDot(ctx) {
  if (!bulbs().length) return;
  var pending = !!pendingTopic(ctx || ctxNow(), opened);
  bulbs().forEach(function (b) { b.classList.toggle("has-tip", pending); });
}

/* ---- the card ---- */
function host() {
  return document.getElementById("center-canvas") || document.body;
}

function place(el) {
  if (document.body.classList.contains("compact-nav")) {
    el.style.bottom = "";
    return;
  }
  var h = host(), bar = document.getElementById("psPlanBar");
  var lift = 12;
  if (bar && !bar.hidden && h.contains(bar) && bar.offsetParent !== null) {
    var hr = h.getBoundingClientRect(), br = bar.getBoundingClientRect();
    lift = Math.max(12, Math.round(hr.bottom - br.top + 10));
  }
  el.style.bottom = lift + "px";
}

function closeCard(returnFocus) {
  if (!card) return;
  var hadFocus = card.contains(document.activeElement);
  card.remove();
  card = null;
  cardTopic = null;
  cardAuto = false;
  window.removeEventListener("resize", onResize);
  var back = shownBulb();
  if ((returnFocus || hadFocus) && back) back.focus({ preventScroll: true });
}

function onResize() { if (card) place(card); }

function runCoachAction(id) {
  if (id === "copyWalls") copyWallsFromBelow();
  else if (id === "toggleRef") {
    if (toggleReferenceFloor()) { markDirty(); render2D(); }
  } else if (id === "drawWalls") {
    closeCard(false);
    setTool("wall");
  } else if (id === "rotate90") {
    if (typeof window.__runAction === "function") window.__runAction("rotSel90");
  } else if (id === "moreGuides") {
    closeCard(false);
    import("./planner_tutorial.js").then(function (m) { m.showPlannerTutorialHub(); });
  }
}

function copyWallsFromBelow() {
  var below = floorBelow();
  if (!below || S.walls.length) return;
  pushHistory();
  var done = copyStoreyWalls(below.scene, S, uid);
  var name = floorDisplayName(below, S.workspace.floors.indexOf(below));
  if (!done.walls) { flash(floorText("nothingToCopy")); return; }
  S.dirty3D = true;
  markDirty();
  /* A whole storey of walls closes several rooms at once: asking for a name
     for each ("Enclosed space detected") would bury the plan under prompts. */
  withoutRoomPrompts(function () {
    render2D();
    refreshTree();
  });
  fillProps();
  flash(floorText("wallsCopied", { n: done.walls, name: name }), "success");
  closeCard(false);
}

function renderCard(topic, ctx) {
  var vars = varsFor(ctx);
  card.innerHTML = "";
  card.dataset.topic = topic.id;
  // prose reads in its own direction; the card stays where the bulb is
  card.dir = getLang() === "he" ? "rtl" : "ltr";
  var head = document.createElement("div");
  head.className = "coach-head";
  head.innerHTML = '<i class="ph ph-lightbulb" aria-hidden="true"></i><h2 id="coachTitle"></h2><button type="button" class="coach-x"><i class="ph ph-x" aria-hidden="true"></i></button>';
  head.querySelector("h2").textContent = coachText(topic.title, vars);
  var x = head.querySelector(".coach-x");
  x.setAttribute("aria-label", coachText("close"));
  x.title = coachText("close");
  x.addEventListener("click", function () { closeCard(true); });
  card.appendChild(head);

  var anim = document.createElement("div");
  anim.className = "coach-anim coach-anim-" + (topic.anim || "first");
  anim.innerHTML = ANIM[topic.anim] || ANIM.first;
  card.appendChild(anim);

  var steps = document.createElement("ol");
  steps.className = "coach-steps";
  topicSteps(topic, ctx).forEach(function (key) {
    var li = document.createElement("li");
    li.textContent = coachText(key, vars);
    steps.appendChild(li);
  });
  card.appendChild(steps);

  var acts = topicActions(topic, ctx);
  if (acts.length) {
    var row = document.createElement("div");
    row.className = "coach-actions";
    acts.forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "coach-btn" + (a.primary ? " primary" : "");
      b.textContent = coachText(a.label, vars);
      b.addEventListener("click", function () { runCoachAction(a.id); });
      row.appendChild(b);
    });
    card.appendChild(row);
  }

  // only tips that make sense here: one that applies now, or a general one
  var others = COACH_TOPICS.filter(function (o) { return o.id !== topic.id && (o.general || o.when(ctx)); });
  if (others.length) {
    var other = document.createElement("div");
    other.className = "coach-other";
    var lab = document.createElement("span");
    lab.textContent = coachText("other");
    other.appendChild(lab);
    others.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "coach-link";
      b.textContent = coachText(o.name || o.title, vars);
      b.addEventListener("click", function () { openCoach(o.id); });
      other.appendChild(b);
    });
    card.appendChild(other);
  }

  var foot = document.createElement("div");
  foot.className = "coach-foot";
  var mute = document.createElement("label");
  mute.className = "coach-mute";
  var box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!prefs.muted[topic.id];
  box.addEventListener("change", function () {
    if (box.checked) prefs.muted[topic.id] = true;
    else delete prefs.muted[topic.id];
    savePrefs();
  });
  mute.appendChild(box);
  mute.appendChild(document.createTextNode(" " + coachText("mute")));
  foot.appendChild(mute);
  var off = document.createElement("button");
  off.type = "button";
  off.className = "coach-off";
  off.textContent = coachText(prefs.off ? "autoOn" : "autoOff");
  off.addEventListener("click", function () {
    prefs.off = !prefs.off;
    savePrefs();
    off.textContent = coachText(prefs.off ? "autoOn" : "autoOff");
    if (prefs.off) flash(coachText("autoOffDone"));
  });
  foot.appendChild(off);
  card.appendChild(foot);
}

function showCard(topic, auto) {
  var ctx = ctxNow();
  if (!card) {
    card = document.createElement("section");
    card.className = "coach-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    card.setAttribute("aria-labelledby", "coachTitle");
    card.tabIndex = -1;
    card.addEventListener("keydown", function (e) {
      // keys typed in the card must not reach the plan's shortcuts
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); closeCard(true); }
    });
    host().appendChild(card);
    window.addEventListener("resize", onResize);
  }
  cardTopic = topic;
  cardAuto = !!auto;
  renderCard(topic, ctx);
  place(card);
  opened.add(topicScopeKey(topic, ctx));
  syncDot(ctx);
  if (!auto) {
    var first = card.querySelector(".coach-btn.primary") || card.querySelector(".coach-x");
    (first || card).focus({ preventScroll: true });
  }
}

/* The bulb, the coachTips action and the tool search all land here: the
   topic for the current context (muting ignored), or the one asked for. */
export function openCoach(topicId) {
  ensureBulb();
  var topic = (topicId && coachTopic(topicId)) || bulbTopic(ctxNow());
  if (topic) showCard(topic, false);
}

function evaluateNow() {
  evalQueued = false;
  ensureBulb();
  var ctx = ctxNow();
  // an automatic card whose situation has passed goes away by itself
  if (card && cardAuto && cardTopic && !cardTopic.when(ctx)) closeCard(false);
  syncDot(ctx);
  if (card || blocked()) return;
  var topic = autoTopic(ctx, prefs);
  if (!topic) return;
  prefs.seen[topicScopeKey(topic, ctx)] = true;
  savePrefs();
  showCard(topic, true);
}

/* Ask for an evaluation; several in one frame collapse into one. */
export function coachEvaluate() {
  if (evalQueued || typeof requestAnimationFrame !== "function") return;
  evalQueued = true;
  requestAnimationFrame(evaluateNow);
}

function afterRender() {
  ensureBulb();
  var sel = S.sel, ws = S.workspace || {};
  var sig = (ws.activeFloor || "") + "|" + S.walls.length + "|" + S.items.length + "|" +
    (sel && sel.ref && sel.ref.type ? sel.ref.type : sel ? sel.kind : "");
  if (sig === lastSig) return;
  lastSig = sig;
  var ctx = ctxNow();
  if (card && cardAuto && cardTopic && !cardTopic.when(ctx)) closeCard(false);
  syncDot(ctx);
}

var started = false;
export function initCoach() {
  if (started || typeof document === "undefined") return;
  started = true;
  prefs = readCoachPrefs(storage());
  ensureBulb();
  onAfterRender(afterRender);
  onAfterRestore(coachEvaluate);
  window.addEventListener("planner-selection", coachEvaluate);
  onLangChange(function () {
    labelBulb();
    if (card && cardTopic) renderCard(cardTopic, ctxNow());
  });
  window.__coach = { open: openCoach, evaluate: coachEvaluate };
  coachEvaluate();
}
