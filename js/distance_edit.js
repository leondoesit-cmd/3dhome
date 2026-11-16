/* Click a distance, type it: the small editor that opens on a distance pill
   of the selected piece, in the 3D pane or on the plan (the pills register
   themselves, js/distance_pills.js / js/keep_paint.js).

   Pointer: a press on a pill is taken in the window's capture phase, before
   the plan's or the 3D pane's own handlers, so it never picks the piece
   under it or orbits; a release without a drag (8 px) opens the editor at the
   pill. A drag that starts on a pill does nothing. Hover over a pill: pointer
   cursor and a light ring. Touch targets are padded to 44 px.
   Editor: the distance in display units (selected), the unit, "Keep this
   distance", and for a kept one an Unlock button. Enter applies
   (js/item_keep_edit.js setDistance / setKeepValue, with the lock also
   keeping it), Esc or a press outside cancels, Tab / Shift+Tab move to the
   piece's next / previous distance. A refusal shows inline. It closes when
   the selection, the tool or the view changes. Its field is an ordinary
   decimal text input whose id (i_dist) puts it in the furniture unit domain,
   so phones and tablets give it the dimension dial (js/ui_dim_knob.js). */
import { S } from "./state.js";
import { fmtLen, parseLen, unitLabel } from "./display_units.js";
import { hitPill, nextPill, onPillsBegin, pillsOf } from "./distance_pills.js";
import { keepItem, keepScene } from "./item_keep_scene.js";
import { removeKeep, setDistance, setKeepValue } from "./item_keep_edit.js";
import { matchKeep, parseDistanceInput, toKeep } from "./item_keep_plan.js";
import { measureKeep, normalizeKeeps } from "./item_keep.js";
import { distanceError, distanceText } from "./distance_strings.js";

var SLOP = 8;
var press = null, state = null, pop = null, ring = null, swallowClick = false;

function viewOf(el) {
  if (!el || !el.id) return null;
  if (el.id === "v3d") return "3d";
  if (el.id === "plan") return "2d";
  return null;
}
function originOf(view) {
  var el = document.getElementById(view === "3d" ? "view-3d" : "plan");
  return el ? el.getBoundingClientRect() : null;
}
function local(view, e) {
  var r = originOf(view);
  return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
}
function selRef() { return S.sel && S.sel.kind === "item" ? S.sel.ref : null; }
function itemById(id) {
  return (S.items || []).find(function (o) { return o && String(o.id) === String(id); }) || null;
}
function editable() {
  return !(S.workspace && S.workspace.role === "viewer") && (!S.tool || S.tool === "select") && !S.placeType;
}
function inKnob(el) { return !!(el && el.closest && el.closest("#dim-knob")); }

/* ---- hover ---- */
function showRing(view, pill) {
  if (!pill) {
    if (ring) ring.hidden = true;
    document.body.classList.remove("dist-pill-hover");
    return;
  }
  var r = originOf(view);
  if (!r) return;
  if (!ring) {
    ring = document.createElement("div");
    ring.className = "dist-pill-ring";
    ring.setAttribute("aria-hidden", "true");
    document.body.append(ring);
  }
  ring.hidden = false;
  ring.style.left = r.left + pill.x - pill.w / 2 - 2 + "px";
  ring.style.top = r.top + pill.y - pill.h / 2 - 2 + "px";
  ring.style.width = pill.w + 4 + "px";
  ring.style.height = pill.h + 4 + "px";
  ring.title = distanceText("editHint");
  document.body.classList.add("dist-pill-hover");
}

/* ---- the editor ---- */
function close() {
  state = null;
  if (pop) { pop.remove(); pop = null; }
}
export function closeDistanceEditor() { close(); }

function currentOf(it, src) {
  var scene = keepScene(), me = keepItem(it), k = toKeep(src, me, scene);
  if (!k) return null;
  var v = measureKeep(k, me, scene);
  if (v == null) v = src.gap != null ? src.gap : src.dim ? src.dim.value : k.value;
  return { keep: k, value: Math.max(0, Number(v) || 0), index: matchKeep(normalizeKeeps(it.keep), k) };
}

function place(view, pill) {
  var r = originOf(view);
  if (!r || !pop) return;
  var vw = window.innerWidth, vh = window.innerHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
  var x = r.left + pill.x - pw / 2, y = r.top + pill.y + pill.h / 2 + 6;
  if (y + ph > vh - 8) y = r.top + pill.y - pill.h / 2 - 6 - ph;
  pop.style.left = Math.round(Math.max(8, Math.min(vw - pw - 8, x))) + "px";
  pop.style.top = Math.round(Math.max(8, Math.min(vh - ph - 8, y))) + "px";
}

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Open the editor on a pill (from the pointer, or Tab). */
export function openDistanceEditor(view, pill) {
  close();
  showRing(null, null);
  var it = pill && itemById(pill.itemId);
  if (!it || !editable()) return false;
  var cur = currentOf(it, pill.src);
  if (!cur) return false;
  var text = fmtLen(cur.value, { domain: "furniture", suffix: false });
  state = { view: view, pill: pill, it: it, sel: selRef(), tool: S.tool, cur: cur, text: text };
  pop = el("div", "dist-pop");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("dir", "ltr");
  pop.setAttribute("aria-label", distanceText("title"));
  var row = el("div", "dist-pop-row"), input = el("input", "dist-pop-input");
  input.id = "i_dist";
  input.type = "text"; input.inputMode = "decimal"; input.autocomplete = "off"; input.spellcheck = false;
  input.value = text;
  input.setAttribute("aria-label", distanceText("title"));
  var unit = el("span", "dist-pop-unit", unitLabel("furniture"));
  var ok = el("button", "dist-pop-ok");
  ok.type = "button"; ok.title = distanceText("apply"); ok.setAttribute("aria-label", distanceText("apply"));
  ok.append(el("i", "ph ph-check"));
  row.append(input, unit, ok);
  var lockRow = el("label", "dist-pop-lock"), lock = el("input");
  lock.type = "checkbox"; lock.checked = cur.index >= 0;
  var lockText = el("span", null, distanceText("keep"));
  lockText.setAttribute("dir", "auto");
  lockRow.append(lock, lockText);
  pop.append(row, lockRow);
  if (cur.index >= 0) {
    var unl = el("button", "dist-pop-unlock");
    unl.type = "button";
    unl.append(el("i", "ph ph-lock-open"), el("span", null, distanceText("unlock")));
    unl.onclick = function () { var r = removeKeep(it, cur.index); if (r.error) msg(r.error); else close(); };
    pop.append(unl);
  }
  var note = el("div", "dist-pop-msg");
  note.setAttribute("role", "alert");
  note.setAttribute("dir", "auto");
  pop.append(note);
  function msg(code) { note.textContent = distanceError(code); pop.classList.add("has-msg"); }
  function apply() {
    var cm = input.value.trim() === state.text ? cur.value : parseDistanceInput(input.value, function (t) { return parseLen(t, "furniture"); });
    if (!Number.isFinite(cm)) return msg("bad-value");
    var r = applyDistance(it, cur, cm, lock.checked);
    if (r && r.error) msg(r.error);
    else close();
  }
  ok.onclick = apply;
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); apply(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") {
      var next = nextPill(pillsOf(view), pill, e.shiftKey ? -1 : 1);
      e.preventDefault();
      if (next) openDistanceEditor(view, next);
    }
  });
  // the dial (phones / tablets) commits with a change event: apply it
  input.addEventListener("change", function () { if (document.body.classList.contains("compact-nav") && state) apply(); });
  document.body.append(pop);
  place(view, pill);
  if (!document.body.classList.contains("compact-nav")) { input.focus(); input.select(); }
  return true;
}

/** The editor's Enter: what typing `cm` with the lock on / off means. */
function applyDistance(it, cur, cm, lockOn) {
  var same = Math.abs(cm - cur.value) < 0.005;
  if (cur.index >= 0) {
    if (lockOn) return setKeepValue(it, cur.index, cm);
    var r = removeKeep(it, cur.index);
    if (r.error || same) return r;
    return setDistance(it, cur.keep, cm);
  }
  return setDistance(it, cur.keep, cm, { keep: lockOn });
}

/* ---- pointer ---- */
function onDown(e) {
  if (pop && !pop.contains(e.target) && !inKnob(e.target)) close();
  var view = viewOf(e.target);
  if (!view || (e.pointerType === "mouse" && e.button !== 0) || !editable()) return;
  var p = local(view, e), pill = p && hitPill(pillsOf(view), p.x, p.y, { touch: e.pointerType === "touch" });
  if (!pill) return;
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, view: view, pill: pill, moved: false };
  e.preventDefault();
  e.stopImmediatePropagation();
}
function onMove(e) {
  if (press && press.id === e.pointerId) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) press.moved = true;
    e.stopImmediatePropagation();
    return;
  }
  if (e.buttons || e.pointerType === "touch") return;
  var view = viewOf(e.target), p = view && editable() ? local(view, e) : null;
  showRing(view, p ? hitPill(pillsOf(view), p.x, p.y) : null);
}
function onUp(e) {
  if (!press || press.id !== e.pointerId) return;
  var pr = press;
  press = null;
  e.preventDefault();
  e.stopImmediatePropagation();
  swallowClick = true;
  setTimeout(function () { swallowClick = false; }, 0);
  if (e.type === "pointerup" && !pr.moved) openDistanceEditor(pr.view, pr.pill);
}
function onClick(e) {
  if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); e.preventDefault(); }
}

/* the piece, the tool or the view changed: the editor goes */
function checkStale() {
  if (!state) return;
  var r = originOf(state.view);
  if (selRef() !== state.sel || S.tool !== state.tool || !r || !r.width || !itemById(state.it.id)) close();
}

if (typeof window !== "undefined" && window.addEventListener && typeof document !== "undefined") {
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", function (e) { if (state && e.key === "Escape" && !(pop && pop.contains(e.target))) close(); }, true);
  window.addEventListener("planner-viewport", close);
  // a phone's keyboard resizes the window: follow, do not close
  window.addEventListener("resize", function () { if (state) place(state.view, state.pill); });
  onPillsBegin(function () { if (state) setTimeout(checkStale, 0); });
}
