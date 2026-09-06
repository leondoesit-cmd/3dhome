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
import { flabel } from "./furniture_meta.js";

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
  roomstamp: "structure",
  door: "structure",
  window: "structure",
  passage: "structure",
  slabvoid: "structure",
  walloffset: "structure",
  walljoin: "structure",
  wallbreak: "structure",
  wallbite: "structure",
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
        /* Withdrawing the opt-in has to release the lock the opt-in put on.
           applyAutoLock() only ever writes to layers that still want it, so
           without this the padlock the automation closed stays closed with
           nothing left to explain it — an off-work-set layer that refuses
           every drag and shows no reason for it. Safe because the chip's own
           padlock clears `autoLock` when pressed by hand: a layer arriving
           here with autoLock still true was locked by the automation, never
           by the user. */
        if (!v) L.locked = false;
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
  ptX = 0,
  ptY = 0;

/* One listener per PRESS, not per move: a pointerdown is the only thing that
   can precede a blocked drag, so this is enough to place the pill.

   It also DISMISSES the pill that is already standing. Capture phase on the
   window puts it ahead of the canvas handler that dispatches the next
   `layers:blocked-drag`, so the order for a second refused press is
   hide-then-show rather than show-then-hide — the pill reappears at the new
   cursor instead of vanishing. A press inside the pill is exempt, or reaching
   for its own button would close it. */
if (typeof window !== "undefined")
  window.addEventListener(
    "pointerdown",
    function (e) {
      ptX = e.clientX;
      ptY = e.clientY;
      if (pill && !pill.hidden && !pill.contains(e.target)) hidePill();
    },
    true,
  );

var TOOL_INFO = {
  select: { icon: "ph-cursor", key: "m_t_select" },
  wall: { icon: "ph-wall", key: "m_t_wall" },
  rect: { icon: "ph-rectangle", key: "m_t_rect" },
  arcwall: { icon: "ph-bezier-curve", key: "m_t_arcwall" },
  door: { icon: "ph-door", key: "m_t_door" },
  window: { icon: "ph-frame-corners", key: "m_t_window" },
  passage: { icon: "ph-columns", key: "m_t_passage" },
  slabvoid: { icon: "ph-stairs", key: "m_t_slabvoid" },
  point: { icon: "ph-crosshair", key: "m_t_point" },
  erase: { icon: "ph-eraser", key: "m_t_erase" },
};

function getStatusWrap() {
  return document.getElementById("plan-tool-status") || document.getElementById("top-tool-status");
}

export function syncToolStatus() {
  var wrap = getStatusWrap();
  if (!wrap) return;
  var idleEl = wrap.querySelector(".tool-status-idle");
  if (!idleEl) return;
  var iconEl = idleEl.querySelector(".tool-icon");
  var nameEl = idleEl.querySelector(".tool-name");

  var tool = S.tool || "select";
  var icon = "ph-cursor";
  var name = "";

  if (S.placeType) {
    icon = "ph-armchair";
    try {
      name = flabel(S.placeType);
    } catch (e) {
      name = S.placeType;
    }
  } else {
    var b = document.querySelector('#plan-toolbar [data-tool="' + tool + '"]');
    if (b) {
      var ic = b.querySelector("i");
      if (ic) {
        var m = ic.className.match(/ph-[a-z0-9-]+/);
        if (m) icon = m[0];
      }
      var nm = b.querySelector(".tool-name");
      if (nm && nm.textContent.trim()) name = nm.textContent.trim();
    }
    if (!name) {
      var info = TOOL_INFO[tool];
      if (info) {
        icon = info.icon;
        name = t(info.key);
      } else {
        name = tool.charAt(0).toUpperCase() + tool.slice(1);
      }
    }
  }

  if (iconEl) iconEl.className = "tool-icon ph " + icon;
  if (nameEl) nameEl.textContent = name;
}

function ensurePill() {
  if (pill) return pill;
  pill = document.querySelector(".unlock-pill");
  if (!pill) {
    pill = document.createElement("div");
    pill.className = "unlock-pill";
    pill.setAttribute("role", "status");
    pill.hidden = true;
    pill.innerHTML =
      '<i class="ph ph-lock-simple"></i><span class="up-msg"></span>' +
      '<button type="button" class="up-fix"></button><span class="up-hint"></span>';
    var wrap = getStatusWrap();
    if (wrap) wrap.appendChild(pill);
    else document.body.appendChild(pill);
  }
  pillMsg = pill.querySelector(".up-msg");
  pillFix = pill.querySelector(".up-fix");
  pillHint = pill.querySelector(".up-hint");
  pillFix.addEventListener("click", function (e) {
    e.stopPropagation();
    applyFix();
  });
  return pill;
}

function placePill() {
  /* Pill is integrated into the 2D view header (#plan-tool-status) */
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
  pillHint.textContent = "";
}

/* The pill stands until it is answered, another tool is chosen, or the user presses somewhere else. */
function showPill(detail) {
  if (!detail || !detail.layer) return;
  ensurePill();
  pillDetail = detail;
  fillPill();
  pill.hidden = false;
  var wrap = getStatusWrap();
  if (wrap) wrap.classList.add("has-msg");
}

function hidePill() {
  if (!pill) return;
  pill.hidden = true;
  pillDetail = null;
  var wrap = getStatusWrap();
  if (wrap) wrap.classList.remove("has-msg");
  syncToolStatus();
}

function onToolOrPlaceChanged() {
  if (pill && !pill.hidden) hidePill();
  else syncToolStatus();
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
  ensurePill();
  var idleEl = document.getElementById("planToolIdle") || document.getElementById("topToolIdle");
  if (idleEl) {
    idleEl.addEventListener("click", function () {
      var inp = document.getElementById("toolSearchInput");
      if (inp) inp.focus();
    });
  }
  window.addEventListener("layers:blocked-drag", function (e) {
    showPill(e.detail);
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
  /* One listener per event, not two. Both handlers want the same two events
     and both go straight to the DOM, so registering each separately doubled
     the work per tool change for no ordering guarantee either of them relied
     on — the order is now explicit instead of incidental. */
  function onPlannerToolEvent(e) {
    followTool(e);
    onToolOrPlaceChanged(e);
  }
  window.addEventListener("planner-tool", onPlannerToolEvent);
  window.addEventListener("planner-place", onPlannerToolEvent);
  window.addEventListener("keydown", onKey, true);
  onLangChange(function () {
    relabel();
    syncToolStatus();
    if (pillDetail && pill && !pill.hidden) fillPill();
  });
  relabel();
  syncToolStatus();
}
