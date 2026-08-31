/* The work-set layer UI: the chip strip beside the drawing tools, and the
   unlock pill that explains a refused drag.

   This module exists because wave 1 made the layer policy real in every hit
   path but gave it no controls. With the default work set `furniture`,
   structure ranks 1 everywhere: a wall still selects and still fills the
   inspector, but it no longer drags in 2D and — because the 3D pane has no
   select-only path at all — a click on an opening in 3D edit mode does nothing
   visible except fire `layers:blocked-drag`. Without the chips there is no way
   to move the work set back to structure, and without the pill there is no way
   to learn why the drag was refused. The chips are the layer system's steering
   wheel; the pill is its error message.

   NOTHING HERE POLLS. Every path is event-driven:
     - `layers:changed`  — this module dispatches it after any layer edit, and
       js/view3d.js already listens for it (gated on ready3D) to re-apply hide
       and ghost to the 3D roots. Dispatching therefore does the 3D half for us
       and setLockStruct()'s padlock reaches the chips by the same route.
     - `planner-tool` / `planner-place` — js/interaction.js and js/ui.js fire
       these when the tool or the armed furniture type changes; that is how the
       work set follows the tool without this module touching setTool().
     - `mf-lang` via onLangChange — chip labels are rebuilt, not re-read.

   IMPORT NOTE: this imports `flash`/`fillProps` from js/ui.js and is imported
   only by js/main.js. js/ui.js does not import this module, so there is no
   cycle — the padlock button syncs through the `layers:changed` event instead
   of through a direct call. */
import { S } from "./state.js";
import { LAYER_IDS, layerState, isLayerLocked, layerRank, saveLayers } from "./layers.js";
import { render2D } from "./plan2d.js";
import { t, onLangChange } from "./i18n.js";
import { flash, fillProps } from "./ui.js";
import { pushHistory } from "./history.js";

/* One Phosphor glyph per layer, so a chip is recognisable at a glance in the
   narrow phone strip where the name is the first thing to be truncated. */
var LAYER_ICON = {
  structure: "ph-wall",
  furniture: "ph-armchair",
  mep: "ph-lightning",
  annotations: "ph-crosshair",
  underlay: "ph-image",
};
// The eye is three-state, and the icon has to read as the state it IS.
var VIS_ICON = { show: "ph-eye", ghost: "ph-eye-closed", hide: "ph-eye-slash" };
var VIS_NEXT = { show: "ghost", ghost: "hide", hide: "show" };

/* Which layer each drawing tool edits. `select` is deliberately absent: the
   select tool is what you use *while* working on any layer, so it must never
   move the work set. Furniture has no tool of its own — arming a piece from
   the library fires `planner-place` instead (js/ui.js), which is handled
   separately below. The wall-edit verbs (break/reverse/paint) are here for the
   same reason as the wall tools even though they only ever act on an existing
   wall: you cannot use them on a plan whose structure is off the work set. */
var TOOL_SET = {
  wall: "structure",
  arcwall: "structure",
  rect: "structure",
  door: "structure",
  window: "structure",
  passage: "structure",
  slabvoid: "structure",
  walloffset: "structure",
  walljoin: "structure",
  wallbreak: "structure",
  wallreverse: "structure",
  wallpaint: "structure",
  point: "annotations",
};

var strip = null; // #layer-chips
var rows = {}; // layer id -> the elements of its chip, so sync() never queries

function labelOf(id) {
  return t("lay_" + id);
}

/* ---- committing a change -------------------------------------------------

   One funnel for every edit so nothing can be persisted without the two panes
   hearing about it. Order matters only in that saveLayers() must not be able
   to miss a change: it reads S, so it runs first and the notifications follow. */
function commit() {
  saveLayers();
  window.dispatchEvent(new CustomEvent("layers:changed"));
  render2D();
}

/* `autoLock` is the only field in the layer record that js/layers.js stores
   but never reads — it is a UI policy, not a permission, so it is applied
   here: a layer that opted in is locked exactly while it is not the work set.
   Run on every work-set change, including the ones the tool triggers. */
function applyAutoLock() {
  LAYER_IDS.forEach(function (id) {
    var L = layerState(id);
    if (!L || !L.autoLock) return;
    L.locked = !(S.workSet === id || S.workSet === "all");
  });
}

function setWorkSet(id, announce) {
  if (!id || S.workSet === id) return;
  S.workSet = id;
  applyAutoLock();
  commit();
  if (announce) flash(t("lay_ws_now", { name: labelOf(id) }));
}

/* Solo: this layer shown, every other ghosted. Ghost rather than hide because
   a ghosted layer still draws faintly, so soloing structure while furnishing
   leaves the room outline visible to aim at instead of a blank sheet. A second
   solo on a layer that is already the only one shown puts everything back —
   otherwise the gesture is a one-way door out of a five-layer plan. */
function solo(id) {
  var alone = LAYER_IDS.every(function (o) {
    var L = layerState(o);
    return o === id ? L.vis === "show" : L.vis !== "show";
  });
  LAYER_IDS.forEach(function (o) {
    layerState(o).vis = alone ? "show" : o === id ? "show" : "ghost";
  });
  commit();
}

/* ---- the chip strip ---- */

function build() {
  strip = document.getElementById("layer-chips");
  if (!strip) return;
  strip.textContent = "";
  rows = {};
  LAYER_IDS.forEach(function (id) {
    var row = document.createElement("div");
    row.className = "lchip";
    row.setAttribute("data-layer", id);

    /* The name button IS the work-set control. Given as a radio rather than a
       toggle: exactly one layer is the work set, and `aria-checked` is what
       tells a screen reader which, since the visual cue is a colour. */
    var name = document.createElement("button");
    name.type = "button";
    name.className = "lchip-name";
    name.setAttribute("role", "radio");
    name.innerHTML = '<i class="ph ' + LAYER_ICON[id] + '"></i><span class="lchip-t"></span>';
    name.addEventListener("click", function () {
      setWorkSet(id, true);
    });

    var eye = document.createElement("button");
    eye.type = "button";
    eye.className = "lchip-eye";
    eye.innerHTML = '<i class="ph"></i>';
    eye.addEventListener("click", function (e) {
      if (e.shiftKey) return solo(id);
      var L = layerState(id);
      L.vis = VIS_NEXT[L.vis] || "show";
      commit();
    });

    var lock = document.createElement("button");
    lock.type = "button";
    lock.className = "lchip-lock";
    lock.innerHTML = '<i class="ph"></i>';
    lock.addEventListener("click", function () {
      var L = layerState(id);
      L.locked = !L.locked;
      /* Toggling the padlock by hand contradicts the automation that would
         immediately undo it on the next work-set change, so it also clears
         the opt-in rather than leaving a lock that silently reverts. */
      if (L.autoLock) L.autoLock = false;
      commit();
    });

    var more = document.createElement("button");
    more.type = "button";
    more.className = "lchip-more";
    more.innerHTML = '<i class="ph ph-dots-three-vertical"></i>';
    more.addEventListener("click", function (e) {
      e.stopPropagation();
      openPopover(id, more);
    });

    row.append(name, eye, lock, more);
    strip.appendChild(row);
    rows[id] = { row: row, name: name, eye: eye, lock: lock, more: more };
  });
  strip.setAttribute("role", "radiogroup");
  sync();
}

/* Re-label without rebuilding: the chips carry live state (which popover is
   open, which chip has focus) that a rebuild would drop mid-interaction. */
function relabel() {
  LAYER_IDS.forEach(function (id) {
    var r = rows[id];
    if (!r) return;
    var nm = labelOf(id);
    r.name.querySelector(".lchip-t").textContent = nm;
    r.name.title = t("lay_ws_t", { name: nm });
    r.more.title = t("lay_more");
    r.more.setAttribute("aria-label", t("lay_more"));
  });
  sync();
}

function sync() {
  if (!strip) return;
  LAYER_IDS.forEach(function (id) {
    var r = rows[id],
      L = layerState(id);
    if (!r || !L) return;
    var on = S.workSet === id || S.workSet === "all";
    r.row.classList.toggle("on", on);
    r.row.classList.toggle("ghosted", L.vis === "ghost");
    r.row.classList.toggle("hidden-layer", L.vis === "hide");
    r.row.classList.toggle("locked", !!L.locked);
    r.name.setAttribute("aria-checked", on ? "true" : "false");
    r.eye.querySelector("i").className = "ph " + (VIS_ICON[L.vis] || "ph-eye");
    r.eye.title = t("lay_vis_" + L.vis) + " · " + t("lay_solo");
    r.eye.setAttribute("aria-label", r.eye.title);
    r.lock.querySelector("i").className =
      "ph " + (L.locked ? "ph-lock-simple" : "ph-lock-simple-open");
    r.lock.title = t(L.locked ? "lay_unlock" : "lay_lock");
    r.lock.setAttribute("aria-label", r.lock.title);
  });
  syncLockBtn();
  syncStructureRim();
  if (popFor) fillPopover();
}

/* The plan toolbar's padlock and the structure chip's padlock are the same
   bit: S.lockStruct is a live accessor onto S.layers.structure.locked
   (js/state.js). setLockStruct() already updates the button when the user
   presses it or hits L; this covers the other direction, where the chip or a
   popover moved the flag. */
function syncLockBtn() {
  var b = document.getElementById("lockStructBtn");
  if (!b) return;
  var on = isLayerLocked("structure");
  b.classList.toggle("active", on);
  var i = b.querySelector("i");
  if (i) i.className = "ph " + (on ? "ph-lock-simple" : "ph-lock-simple-open");
}

/* An amber rim on whichever panes are showing, while structure is genuinely
   draggable — rank 0 and unlocked. That is the only state in which a stray
   drag can move a wall, and it is worth a standing reminder because the whole
   point of the work set is that most of the time it cannot. Not keyed on
   `!locked` alone: structure defaults to unlocked (see "No default-on
   structure lock" in LAYERS_PERF_PLAN.md), so that rim would never be off. */
function syncStructureRim() {
  var live = layerRank("structure") === 0 && !isLayerLocked("structure");
  ["view-2d", "view-3d"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("structure-live", live);
  });
}

/* ---- the per-layer popover ----

   Portaled to <body> and positioned fixed, the same trick the topbar dropdowns
   use: the chip strip lives inside #plan-tools, which is a bounded, internally
   scrolling column, and a popover parented there is clipped by it. */
var pop = null,
  popFor = null;

function ensurePop() {
  if (pop) return pop;
  pop = document.createElement("div");
  pop.className = "layer-pop";
  pop.hidden = true;
  document.body.appendChild(pop);
  document.addEventListener(
    "pointerdown",
    function (e) {
      if (!popFor) return;
      if (pop.contains(e.target) || (rows[popFor] && rows[popFor].more.contains(e.target))) return;
      closePopover();
    },
    true,
  );
  return pop;
}

function openPopover(id, anchor) {
  if (popFor === id) return closePopover();
  ensurePop();
  popFor = id;
  fillPopover();
  pop.hidden = false;
  var r = anchor.getBoundingClientRect(),
    pr = pop.getBoundingClientRect();
  /* Clamped to the viewport on both axes rather than flipped: the strip can be
     a left column (desktop) or a bottom rail (phone), and in RTL it is a right
     column, so there is no single "other side" to flip to. */
  var x = Math.min(Math.max(6, r.left), window.innerWidth - pr.width - 6);
  var y = Math.min(Math.max(6, r.bottom + 6), window.innerHeight - pr.height - 6);
  pop.style.left = x + "px";
  pop.style.top = y + "px";
}

function closePopover() {
  popFor = null;
  if (pop) pop.hidden = true;
}

/* A tri-state override cannot be a checkbox: `null` (follow the work set) is a
   real, and the usual, value, and an unchecked box would read as "never". Three
   labelled buttons say what the three states are. */
function overrideRow(key, get, set) {
  var wrap = document.createElement("div");
  wrap.className = "lp-row";
  var lab = document.createElement("span");
  lab.className = "lp-lab";
  lab.textContent = t(key);
  wrap.appendChild(lab);
  var seg = document.createElement("div");
  seg.className = "lp-seg";
  [
    [null, "lay_ov_auto"],
    [true, "lay_ov_on"],
    [false, "lay_ov_off"],
  ].forEach(function (o) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = t(o[1]);
    b.className = get() === o[0] ? "on" : "";
    b.addEventListener("click", function () {
      set(o[0]);
      commit();
    });
    seg.appendChild(b);
  });
  wrap.appendChild(seg);
  return wrap;
}

function checkRow(key, get, set) {
  var lab = document.createElement("label");
  lab.className = "lp-row lp-check";
  var cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!get();
  cb.addEventListener("change", function () {
    set(cb.checked);
    commit();
  });
  var sp = document.createElement("span");
  sp.textContent = t(key);
  lab.append(cb, sp);
  return lab;
}

function fillPopover() {
  if (!pop || !popFor) return;
  var id = popFor,
    L = layerState(id);
  if (!L) return closePopover();
  pop.textContent = "";
  var h = document.createElement("div");
  h.className = "lp-head";
  h.textContent = labelOf(id);
  pop.appendChild(h);
  pop.appendChild(
    overrideRow(
      "lay_pick",
      function () {
        return L.pickOverride;
      },
      function (v) {
        L.pickOverride = v;
      },
    ),
  );
  pop.appendChild(
    overrideRow(
      "lay_snap",
      function () {
        return L.snapOverride;
      },
      function (v) {
        L.snapOverride = v;
      },
    ),
  );
  pop.appendChild(
    checkRow(
      "lay_autolock",
      function () {
        return L.autoLock;
      },
      function (v) {
        L.autoLock = v;
        applyAutoLock();
      },
    ),
  );
  pop.appendChild(
    checkRow(
      "lay_pin",
      function () {
        return S.workSetPinned;
      },
      function (v) {
        S.workSetPinned = v;
      },
    ),
  );
  var hint = document.createElement("div");
  hint.className = "lp-hint";
  hint.textContent = t("lay_pin_h");
  pop.appendChild(hint);
}

/* ---- the unlock pill ----

   js/interaction.js and js/view3d.js both dispatch `layers:blocked-drag` with
   `{sel, layer, reason, where}` when a press could not become a drag. Neither
   knows where the pointer is, so the coordinates come from the pointerdown
   that is still in flight when the event fires. */
var pill = null,
  pillMsg = null,
  pillFix = null,
  pillHint = null,
  pillDetail = null,
  pillSticky = false,
  lastBlockAt = 0,
  ptX = 0,
  ptY = 0;

// One listener per PRESS, not per move: a pointerdown is the only thing that
// can precede a blocked drag, so this is enough to place the pill.
if (typeof window !== "undefined")
  window.addEventListener(
    "pointerdown",
    function (e) {
      ptX = e.clientX;
      ptY = e.clientY;
    },
    true,
  );

function ensurePill() {
  if (pill) return pill;
  pill = document.createElement("div");
  pill.className = "unlock-pill";
  pill.setAttribute("role", "status");
  pill.hidden = true;
  pill.innerHTML =
    '<i class="ph ph-lock-simple"></i><span class="up-msg"></span>' +
    '<button type="button" class="up-fix"></button><span class="up-hint"></span>';
  document.body.appendChild(pill);
  pillMsg = pill.querySelector(".up-msg");
  pillFix = pill.querySelector(".up-fix");
  pillHint = pill.querySelector(".up-hint");
  pillFix.addEventListener("click", function (e) {
    e.stopPropagation();
    applyFix();
  });
  return pill;
}

function placePill(where) {
  var pane = document.getElementById(where === "3d" ? "view-3d" : "view-2d");
  var r = pill.getBoundingClientRect();
  var box = pane ? pane.getBoundingClientRect() : null;
  /* A maximized pane hides the other one outright, and a display:none element
     measures as an all-zero rect — clamping into that puts the pill at negative
     coordinates, off the top-left of the window. Fall back to the viewport
     whenever the named pane has no box to aim at. */
  if (!box || box.width < 8 || box.height < 8)
    box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  /* Offset below-right of the cursor, then clamped INTO the named pane so the
     pill never drifts over the inspector or the other view. Clamping to the
     pane rather than the viewport is what makes `where` load-bearing. */
  var x = Math.min(Math.max(box.left + 4, ptX + 16), box.right - r.width - 4);
  var y = Math.min(Math.max(box.top + 4, ptY + 18), box.bottom - r.height - 4);
  pill.style.left = x + "px";
  pill.style.top = y + "px";
}

function fillPill() {
  var d = pillDetail;
  if (!d) return;
  var nm = d.layer ? labelOf(d.layer) : t("lay_unknown");
  if (d.reason === "rank") {
    pillMsg.textContent = t("lp_rank", { layer: nm, work: labelOf(S.workSet) });
    pillFix.textContent = t("lp_fix_rank", { layer: nm });
  } else if (d.reason === "layer") {
    pillMsg.textContent = t("lp_layer", { layer: nm });
    pillFix.textContent = t("lp_fix_layer", { layer: nm });
  } else {
    pillMsg.textContent = t("lp_object");
    pillFix.textContent = t("lp_fix_object");
  }
  // A drag is still in progress behind a transient pill, so it advertises the
  // gesture that makes the pill stay put long enough to press its button.
  pillHint.textContent = pillSticky ? "" : t("lp_hint");
  pill.classList.toggle("sticky", pillSticky);
}

function showPill(detail, sticky) {
  if (!detail || !detail.layer) return;
  ensurePill();
  pillDetail = detail;
  pillSticky = !!sticky;
  fillPill();
  pill.hidden = false;
  placePill(detail.where);
  if (sticky) return;
  // Transient: it lives exactly as long as the press that was refused.
  window.addEventListener("pointerup", onPillUp, { once: true, capture: true });
}

function onPillUp() {
  if (!pillSticky) hidePill();
}

function hidePill() {
  if (!pill) return;
  pill.hidden = true;
  pillSticky = false;
}

/* Unlock the individual object behind the refused drag. Object locks are part
   of the document (they serialize and they undo), unlike layer state, so this
   one branch takes a history snapshot. Rooms are the odd case for the same
   reason as in js/layers.js: a room selection's `ref` is a key into
   S.roomMeta, not an object with a flag on it. */
function unlockSel(sel) {
  if (!sel) return false;
  pushHistory();
  if (sel.kind === "room") {
    var m = (S.roomMeta[sel.ref] = S.roomMeta[sel.ref] || {});
    m.locked = false;
  } else if (Array.isArray(sel.refs)) {
    sel.refs.forEach(function (r) {
      if (r) r.locked = false;
    });
  } else if (sel.ref) {
    sel.ref.locked = false;
  } else return false;
  return true;
}

function applyFix() {
  var d = pillDetail;
  if (!d) return;
  hidePill();
  if (d.reason === "rank") {
    /* Reaching for a layer by hand is the clearest statement of intent there
       is, so it also pins the work set: otherwise the very next tool press
       would move it straight back and the fix would look like it failed. */
    S.workSetPinned = true;
    setWorkSet(d.layer, true);
  } else if (d.reason === "layer") {
    var L = layerState(d.layer);
    if (!L) return;
    L.locked = false;
    L.autoLock = false;
    commit();
    flash(t("lay_unlocked", { name: labelOf(d.layer) }));
  } else if (unlockSel(d.sel)) {
    fillProps();
    render2D();
    flash(t("lp_unlocked_obj"));
  }
}

function initPill() {
  window.addEventListener("layers:blocked-drag", function (e) {
    lastBlockAt = Date.now();
    showPill(e.detail, false);
  });
  /* Double-click / double-tap on a refused object promotes the transient pill
     to a sticky one. It needs no hit test of its own: the two presses of the
     double-click each fired `layers:blocked-drag` first, so a recent block is
     proof the object under the cursor is the refused one. Browsers synthesize
     `dblclick` from a double-tap, so this is the touch path too. */
  ["plan", "v3d"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("dblclick", function () {
      if (!pillDetail || Date.now() - lastBlockAt > 700) return;
      showPill(pillDetail, true);
    });
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && pill && !pill.hidden) hidePill();
  });
}

/* ---- tool → work set ---- */

function followTool() {
  if (S.workSetPinned) return;
  var tool = S.tool || "select";
  /* An armed furniture type outranks the tool: arming one leaves S.tool at
     "select" (js/ui.js sets S.placeType instead), so reading the tool alone
     would keep the work set wherever it was. */
  var id = S.placeType ? "furniture" : tool.indexOf("mep") === 0 ? "mep" : TOOL_SET[tool];
  if (id) setWorkSet(id, false);
}

/* ---- keyboard ----

   Shift+1..5 focuses and solos a layer. Capture phase and stopped on the way
   through, because js/interaction.js binds the bare digits to setTool() and
   those bindings must keep working untouched — 1..5 stay the drawing tools. */
function onKey(e) {
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  var el = e.target;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
  var m = /^Digit([1-5])$/.exec(e.code || "");
  if (!m) return;
  var id = LAYER_IDS[+m[1] - 1];
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  S.workSetPinned = true;
  setWorkSet(id, true);
  solo(id);
}

export function initLayersUI() {
  build();
  initPill();
  window.addEventListener("layers:changed", sync);
  window.addEventListener("planner-tool", followTool);
  window.addEventListener("planner-place", followTool);
  window.addEventListener("keydown", onKey, true);
  onLangChange(relabel);
  relabel();
}
