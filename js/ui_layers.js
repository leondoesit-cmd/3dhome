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
import { render2D, onAfterRender } from "./plan2d.js";
import { select } from "./ui_props.js";
import { hiddenSets } from "./geometry.js";
import { markDirty } from "./persist.js";
import { floorBelow, floorAbove, floorById, setReferenceFloor } from "./floors.js";
import { setWallMode } from "./ui_wall_view.js";
import { wallMode } from "./wall_view.js";
import {
  userLayers,
  userLayerById,
  itemsOnUserLayer,
  addUserLayer,
  nextUserLayerName,
  renameUserLayer,
  removeUserLayer,
  assignUserLayer,
  itemUserUnpickable,
} from "./user_layers.js";
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
/* The eye is a plain show/hide switch, the way every layer list people know
   works. It used to cycle show -> ghost -> hide, so one click on a visible
   layer only dimmed it and a second click was needed to hide it, and nothing
   on screen said which of the three states a layer was in. "Faded" lives in
   the layer's menu now, and the row says when a layer is faded or hidden. A
   faded layer keeps the open eye, drawn dimmer (css .lchip.ghosted). */
var VIS_ICON = { show: "ph-eye", ghost: "ph-eye", hide: "ph-eye-slash" };
var VIS_IDS = ["show", "ghost", "hide"];

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
var status = null; // the "Editing: ..." line above the rows

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
function soloed(id) {
  return LAYER_IDS.every(function (o) {
    var L = layerState(o);
    return o === id ? L.vis === "show" : L.vis !== "show";
  });
}
function solo(id) {
  var alone = soloed(id);
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
  /* What the work set IS, in words. The accent fill on one row was the only
     cue, and nothing said what being "on" a layer means: the other layers
     still select but never drag, and the tools move you between layers on
     their own. Shown where there is room for it (the desktop's Layers tab);
     the strips over the plan hide it (css .lchip-status). */
  status = document.createElement("div");
  status.className = "lchip-status";
  status.innerHTML =
    '<div class="lchip-status-line"><i class="ph" aria-hidden="true"></i><span class="lchip-status-name"></span>' +
    '<span class="lchip-status-mode"></span></div><div class="lchip-status-h"></div>';
  strip.appendChild(status);
  presetBar = document.createElement("div");
  presetBar.className = "lchip-presets";
  presetBar.setAttribute("role", "group");
  Object.keys(PRESETS).forEach(function (id) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-preset", id);
    b.innerHTML = '<i class="ph ' + PRESETS[id].icon + '" aria-hidden="true"></i><span></span>';
    b.addEventListener("click", function () {
      applyPreset(id);
    });
    presetBar.appendChild(b);
  });
  strip.appendChild(presetBar);
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
      L.vis = L.vis === "show" ? "hide" : "show";
      commit();
    });

    /* "Editing", "Faded" or "Hidden": the state a glance at the row has to
       answer. A sibling of the name button rather than part of it, because
       js/pro_compact.js reads the work layer's name from that button's text. */
    var tag = document.createElement("span");
    tag.className = "lchip-tag";

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

    // how many things are on it (the desktop Layers tab only, css .lchip-count)
    var count = document.createElement("span");
    count.className = "lchip-count";

    row.append(name, count, tag, eye, lock, more);
    strip.appendChild(row);
    rows[id] = { row: row, name: name, count: count, tag: tag, eye: eye, lock: lock, more: more };
  });
  strip.appendChild(buildRefRow());
  userBox = document.createElement("div");
  userBox.className = "lchip-user";
  strip.appendChild(userBox);
  strip.setAttribute("role", "radiogroup");
  sync();
}

/* Re-label without rebuilding: the chips carry live state (which popover is
   open, which chip has focus) that a rebuild would drop mid-interaction. */
function relabel() {
  LAYER_IDS.forEach(function (id, i) {
    var r = rows[id];
    if (!r) return;
    var nm = labelOf(id);
    r.name.querySelector(".lchip-t").textContent = nm;
    r.name.title = t("lay_ws_t", { name: nm }) + " · " + t("lay_key", { n: i + 1 });
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
    var auto = !!L.locked && !!L.autoLock;
    r.row.classList.toggle("on", on);
    r.row.classList.toggle("ghosted", L.vis === "ghost");
    r.row.classList.toggle("hidden-layer", L.vis === "hide");
    r.row.classList.toggle("locked", !!L.locked);
    // the automatic lock is the layer system working, not a warning: it is
    // drawn quieter than a padlock the user closed by hand
    r.row.classList.toggle("autolocked", auto);
    r.name.setAttribute("aria-checked", on ? "true" : "false");
    r.tag.textContent = L.vis !== "show" ? t("lay_vis_" + L.vis) : on && S.workSet !== "all" ? t("lay_tag_edit") : "";
    r.tag.setAttribute("data-kind", L.vis !== "show" ? L.vis : on ? "edit" : "");
    r.eye.querySelector("i").className = "ph " + (VIS_ICON[L.vis] || "ph-eye");
    r.eye.title =
      t("lay_vis_" + L.vis) + " · " + t(L.vis === "show" ? "lay_eye_hide" : "lay_eye_show") + " · " + t("lay_solo");
    r.eye.setAttribute("aria-label", r.eye.title);
    r.eye.setAttribute("aria-pressed", L.vis === "show" ? "true" : "false");
    r.lock.querySelector("i").className =
      "ph " + (L.locked ? "ph-lock-simple" : "ph-lock-simple-open");
    r.lock.title = auto ? t("lay_autolocked") : t(L.locked ? "lay_unlock" : "lay_lock");
    r.lock.setAttribute("aria-label", r.lock.title);
  });
  syncStatus();
  syncPresets();
  syncCounts();
  syncRefRow();
  renderUserRows();
  syncLockBtn();
  syncStructureRim();
  if (popFor) fillPopover();
}

function syncStatus() {
  if (!status) return;
  var all = S.workSet === "all";
  status.querySelector("i").className = "ph " + (all ? "ph-stack" : LAYER_ICON[S.workSet] || "ph-stack");
  status.querySelector(".lchip-status-name").textContent = all
    ? t("lay_status_all")
    : t("lay_status", { name: labelOf(S.workSet) });
  status.querySelector(".lchip-status-mode").textContent =
    "· " + t(S.workSetPinned ? "lay_status_pinned" : "lay_status_follow");
  status.querySelector(".lchip-status-h").textContent = all ? "" : t("lay_status_h");
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
  window.addEventListener('resize', closePopover);
  strip?.addEventListener('scroll', closePopover, { passive: true });
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
  /* On desktop, the editor pane is the menu's visual owner. Clamping only to
     the window let the last layer's menu paint over the Inspector in Split.
     Fall back to viewport bounds when a phone pane cannot hold the card. */
  var owner = anchor.closest('#view-2d, #view-3d');
  var bounds = owner?.getBoundingClientRect();
  var minX = bounds && bounds.width >= pr.width + 12 ? bounds.left + 6 : 6;
  var maxX = bounds && bounds.width >= pr.width + 12 ? bounds.right - pr.width - 6 : window.innerWidth - pr.width - 6;
  var minY = bounds && bounds.height >= pr.height + 12 ? bounds.top + 6 : 6;
  var maxY = bounds && bounds.height >= pr.height + 12 ? bounds.bottom - pr.height - 6 : window.innerHeight - pr.height - 6;
  var x = Math.min(Math.max(minX, r.left), maxX);
  var preferredY = r.bottom + 6;
  if (owner?.id === 'view-3d') {
    /* The 3D Layers ribbon sits directly above its editing toolbar. A menu
       opened from it should not hide the very tool controls beside it. */
    owner.querySelectorAll('.pt-panel[data-panel="tools"], .pt-panel[data-panel="walls"], .pt-panel[data-panel="rooms"]').forEach(function (panel) {
      if (panel.hidden || getComputedStyle(panel).display === 'none') return;
      var box = panel.getBoundingClientRect();
      if (box.top >= r.top - 2 && box.left < x + pr.width && box.right > x) preferredY = Math.max(preferredY, box.bottom + 6);
    });
  }
  var y = Math.min(Math.max(minY, preferredY), maxY);
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
    if (o[0] === null) b.title = t("lay_ov_auto_t");
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
  var id = popFor;
  if (id.indexOf("ul:") === 0) {
    var U = userLayerById(id.slice(3));
    if (!U) return closePopover();
    pop.textContent = "";
    return fillUserPopover(U);
  }
  var L = layerState(id);
  if (!L) return closePopover();
  pop.textContent = "";
  var h = document.createElement("div");
  h.className = "lp-head";
  h.textContent = labelOf(id);
  pop.appendChild(h);
  pop.appendChild(visibilityRow(L));
  if (id === "structure" || id === "furniture")
    pop.appendChild(
      actButton("lay_select_all", null, true, function () {
        selectLayer(id);
      }),
    );
  var only = document.createElement("button");
  only.type = "button";
  only.className = "lp-solo";
  only.textContent = t(soloed(id) ? "lay_unsolo_btn" : "lay_solo_btn");
  only.addEventListener("click", function () {
    solo(id);
  });
  pop.appendChild(only);
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
  // the one setting here that is not about this layer: set apart from the rest
  var sep = document.createElement("div");
  sep.className = "lp-sep";
  pop.appendChild(sep);
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

// Visible / Faded / Hidden: the three visibility states, each named.
function visibilityRow(L, onChange) {
  var wrap = document.createElement("div");
  wrap.className = "lp-row";
  var lab = document.createElement("span");
  lab.className = "lp-lab";
  lab.textContent = t("lay_vis");
  wrap.appendChild(lab);
  var seg = document.createElement("div");
  seg.className = "lp-seg";
  VIS_IDS.forEach(function (v) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = t("lay_vis_" + v);
    b.className = L.vis === v ? "on" : "";
    b.addEventListener("click", function () {
      L.vis = v;
      (onChange || commit)();
    });
    seg.appendChild(b);
  });
  wrap.appendChild(seg);
  return wrap;
}

/* ---- workspaces: one click for the layers AND the walls ------------------

   Each preset is a whole way of working: which layer you edit, what shows,
   what fades, and how the 3D view treats walls. The button of the preset the
   current state matches is lit, so the strip also answers "what am I set up
   for?". Picking one does not pin the work set; the tools still move it. */
var PRESETS = {
  build: {
    icon: "ph-wall",
    work: "structure",
    vis: { structure: "show", furniture: "ghost", mep: "ghost", annotations: "show", underlay: "show" },
    walls: "cut",
  },
  furnish: {
    icon: "ph-armchair",
    work: "furniture",
    vis: { structure: "show", furniture: "show", mep: "hide", annotations: "show", underlay: "show" },
    walls: "cut",
  },
  services: {
    icon: "ph-lightning",
    work: "mep",
    vis: { structure: "show", furniture: "ghost", mep: "show", annotations: "show", underlay: "show" },
    walls: "cut",
  },
  present: {
    icon: "ph-presentation-chart",
    work: "furniture",
    vis: { structure: "show", furniture: "show", mep: "hide", annotations: "hide", underlay: "hide" },
    walls: "down",
  },
};
var presetBar = null;

function presetMatches(id) {
  var p = PRESETS[id];
  if (!p || S.workSet !== p.work || wallMode() !== p.walls) return false;
  return LAYER_IDS.every(function (l) {
    return layerState(l).vis === p.vis[l];
  });
}

function applyPreset(id) {
  var p = PRESETS[id];
  if (!p) return;
  LAYER_IDS.forEach(function (l) {
    layerState(l).vis = p.vis[l];
  });
  S.workSet = p.work;
  applyAutoLock();
  setWallMode(p.walls);
  commit();
  flash(t("lay_preset_on", { name: t("lay_preset_" + id) }));
}

function syncPresets() {
  if (!presetBar) return;
  presetBar.querySelectorAll("button[data-preset]").forEach(function (b) {
    var id = b.getAttribute("data-preset"),
      on = presetMatches(id);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.querySelector("span").textContent = t("lay_preset_" + id);
    b.title = t("lay_preset_" + id + "_t");
  });
}

/* ---- what is on each layer ---- */

function layerCount(id) {
  if (id === "structure") return (S.walls || []).length;
  if (id === "furniture") return (S.items || []).length;
  if (id === "mep") return S.mep ? (S.mep.nodes || []).length + (S.mep.runs || []).length : 0;
  if (id === "annotations") return (S.markers || []).length + (S.annotations || []).length;
  return null; // the underlay is a picture, not a number of things
}

// Cheap enough to run after every plan paint: five numbers, written only when changed.
function syncCounts() {
  LAYER_IDS.forEach(function (id) {
    var r = rows[id];
    if (!r || !r.count) return;
    var n = layerCount(id),
      txt = n == null ? "" : String(n);
    if (r.count.textContent !== txt) r.count.textContent = txt;
  });
  userLayers().forEach(function (L) {
    var r = rows["ul:" + L.id];
    if (!r || !r.count) return;
    var txt = String(itemsOnUserLayer(L.id).length);
    if (r.count.textContent !== txt) r.count.textContent = txt;
  });
}

function selectableOn(id) {
  var hid = hiddenSets();
  if (id === "structure")
    return (S.walls || []).filter(function (w) {
      return !hid.walls[w.id];
    });
  if (id === "furniture")
    return (S.items || []).filter(function (it) {
      return !hid.items[it.id] && !itemUserUnpickable(it);
    });
  return [];
}

function selectRefs(refs, one, many) {
  if (!refs.length) {
    flash(t("lay_select_none"));
    return;
  }
  select(refs.length > 1 ? { kind: many, refs: refs } : { kind: one, ref: refs[0] });
  render2D();
  flash(t("lay_selected", { n: refs.length }));
}

function selectLayer(id) {
  closePopover();
  selectRefs(selectableOn(id), id === "structure" ? "wall" : "item", id === "structure" ? "walls" : "items");
}

/* ---- another floor, faintly, under this one ----

   The reference-floor overlay (js/floors.js, drawn by js/plan2d.js) used to be
   reachable only from the Workspace dialog. Here it is a row like the layers
   it sits beside. Turned on from this row it FOLLOWS: switch storey and the
   reference moves to the new storey's floor below. */
var refRow = null;

function refTarget() {
  return floorBelow() || floorAbove();
}

function buildRefRow() {
  refRow = document.createElement("div");
  refRow.className = "lchip lchip-x lchip-ref";
  refRow.innerHTML =
    '<span class="lchip-name"><i class="ph ph-stack" aria-hidden="true"></i><span class="lchip-t"></span></span>' +
    '<button type="button" class="lchip-eye"><i class="ph"></i></button>';
  refRow.querySelector(".lchip-eye").addEventListener("click", function () {
    var ws = S.workspace;
    if (!ws) return;
    if (refShown()) ws.showReferenceFloor = false;
    else {
      var f = refTarget();
      if (!f) return;
      setReferenceFloor(f.id, true);
      ws.referenceFollows = true;
    }
    markDirty();
    render2D();
    syncRefRow();
  });
  return refRow;
}

function refShown() {
  var ws = S.workspace;
  return !!(ws && ws.showReferenceFloor && ws.referenceFloor && ws.referenceFloor !== ws.activeFloor);
}

function syncRefRow() {
  if (!refRow) return;
  var ws = S.workspace,
    floors = (ws && ws.floors) || [];
  refRow.hidden = floors.length < 2;
  if (refRow.hidden) return;
  var on = refShown(),
    f = on ? floorById(ws.referenceFloor) : refTarget(),
    below = floorBelow();
  var label = f ? t(below && f.id === below.id ? "lay_ref_below" : "lay_ref_other", { name: f.name }) : "";
  var lt = refRow.querySelector(".lchip-t");
  if (lt.textContent !== label) lt.textContent = label;
  refRow.title = t("lay_ref_t");
  refRow.classList.toggle("hidden-layer", !on);
  var eye = refRow.querySelector(".lchip-eye");
  eye.querySelector("i").className = "ph " + (on ? "ph-eye" : "ph-eye-slash");
  eye.title = t(on ? "lay_eye_hide" : "lay_eye_show");
  eye.setAttribute("aria-label", label + " · " + eye.title);
  eye.setAttribute("aria-pressed", on ? "true" : "false");
}

// After a storey switch, a following reference moves to the new floor below.
function followReference() {
  var ws = S.workspace;
  if (!ws || !ws.showReferenceFloor || !ws.referenceFollows) return;
  var want = refTarget();
  if (!want || want.id === ws.referenceFloor) return;
  setReferenceFloor(want.id, true);
  requestAnimationFrame(function () {
    render2D();
  });
}

/* ---- user layers (js/user_layers.js) ---- */
var userBox = null;

function selectedItems() {
  var sel = S.sel;
  if (!sel) return [];
  if (sel.kind === "item" && sel.ref) return [sel.ref];
  if (sel.kind === "items" && sel.refs) return sel.refs.slice();
  return [];
}

// A user-layer edit: the pieces and the list are part of the document.
function userChanged() {
  markDirty();
  commit();
}

function renderUserRows() {
  if (!userBox) return;
  Object.keys(rows).forEach(function (k) {
    if (k.indexOf("ul:") === 0) delete rows[k];
  });
  userBox.textContent = "";
  var head = document.createElement("div");
  head.className = "lchip-user-head";
  var title = document.createElement("span");
  title.textContent = t("ul_title");
  var add = document.createElement("button");
  add.type = "button";
  add.className = "lchip-user-add";
  add.innerHTML = '<i class="ph ph-plus" aria-hidden="true"></i><span></span>';
  add.querySelector("span").textContent = t("ul_new");
  add.title = t("ul_new_t");
  add.addEventListener("click", function (e) {
    e.stopPropagation();
    newUserLayer();
  });
  head.append(title, add);
  userBox.appendChild(head);
  var ls = userLayers();
  if (!ls.length) {
    var hint = document.createElement("div");
    hint.className = "lchip-user-empty";
    hint.textContent = t("ul_empty");
    userBox.appendChild(hint);
    return;
  }
  ls.forEach(function (L) {
    var key = "ul:" + L.id;
    var row = document.createElement("div");
    row.className = "lchip lchip-x lchip-ul";
    row.setAttribute("data-ulayer", L.id);
    row.classList.toggle("ghosted", L.vis === "ghost");
    row.classList.toggle("hidden-layer", L.vis === "hide");
    row.classList.toggle("locked", !!L.locked);
    var name = document.createElement("button");
    name.type = "button";
    name.className = "lchip-name";
    name.innerHTML = '<i class="ph ph-folder-simple" aria-hidden="true"></i><span class="lchip-t"></span>';
    name.querySelector(".lchip-t").textContent = L.name;
    name.title = t("ul_sel_t", { name: L.name });
    name.addEventListener("click", function () {
      selectRefs(
        itemsOnUserLayer(L.id).filter(function (it) {
          return !itemUserUnpickable(it);
        }),
        "item",
        "items",
      );
    });
    var count = document.createElement("span");
    count.className = "lchip-count";
    count.textContent = String(itemsOnUserLayer(L.id).length);
    var tag = document.createElement("span");
    tag.className = "lchip-tag";
    tag.textContent = L.vis !== "show" ? t("lay_vis_" + L.vis) : "";
    tag.setAttribute("data-kind", L.vis !== "show" ? L.vis : "");
    var eye = document.createElement("button");
    eye.type = "button";
    eye.className = "lchip-eye";
    eye.innerHTML = '<i class="ph ' + (L.vis === "hide" ? "ph-eye-slash" : "ph-eye") + '"></i>';
    eye.title = t("lay_vis_" + L.vis) + " · " + t(L.vis === "show" ? "lay_eye_hide" : "lay_eye_show");
    eye.setAttribute("aria-label", L.name + " · " + eye.title);
    eye.setAttribute("aria-pressed", L.vis === "show" ? "true" : "false");
    eye.addEventListener("click", function () {
      L.vis = L.vis === "show" ? "hide" : "show";
      userChanged();
    });
    var lock = document.createElement("button");
    lock.type = "button";
    lock.className = "lchip-lock";
    lock.innerHTML = '<i class="ph ' + (L.locked ? "ph-lock-simple" : "ph-lock-simple-open") + '"></i>';
    lock.title = t(L.locked ? "lay_unlock" : "lay_lock");
    lock.setAttribute("aria-label", L.name + " · " + lock.title);
    lock.addEventListener("click", function () {
      L.locked = !L.locked;
      userChanged();
    });
    var more = document.createElement("button");
    more.type = "button";
    more.className = "lchip-more";
    more.innerHTML = '<i class="ph ph-dots-three-vertical"></i>';
    more.title = t("lay_more");
    more.setAttribute("aria-label", L.name + " · " + t("lay_more"));
    more.addEventListener("click", function (e) {
      e.stopPropagation();
      openPopover(key, more);
    });
    row.append(name, count, tag, eye, lock, more);
    userBox.appendChild(row);
    rows[key] = { row: row, more: more, count: count };
  });
}

function newUserLayer() {
  var L = addUserLayer(nextUserLayerName(t("ul_base")));
  var picked = selectedItems();
  if (picked.length) {
    pushHistory();
    assignUserLayer(picked, L.id);
  }
  userChanged();
  flash(picked.length ? t("ul_made_with", { name: L.name, n: picked.length }) : t("ul_made", { name: L.name }));
  // straight into its menu, where the name field waits
  var r = rows["ul:" + L.id];
  if (r) openPopover("ul:" + L.id, r.more);
}

function actButton(key, vars, enabled, run) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "lp-solo";
  b.textContent = t(key, vars);
  b.disabled = !enabled;
  b.addEventListener("click", run);
  return b;
}

function fillUserPopover(L) {
  var h = document.createElement("label");
  h.className = "lp-row lp-name";
  var lab = document.createElement("span");
  lab.className = "lp-lab";
  lab.textContent = t("ul_name");
  var input = document.createElement("input");
  input.type = "text";
  input.value = L.name;
  input.maxLength = 40;
  input.addEventListener("keydown", function (e) {
    e.stopPropagation(); // the planner's shortcuts must not fire while typing
    if (e.key === "Enter") input.blur();
  });
  input.addEventListener("change", function () {
    if (renameUserLayer(L.id, input.value)) userChanged();
  });
  h.append(lab, input);
  pop.appendChild(h);
  pop.appendChild(visibilityRow(L, userChanged));
  var picked = selectedItems(),
    offIt = picked.filter(function (it) {
      return it.ulayer !== L.id;
    });
  pop.appendChild(
    actButton("ul_add", { n: offIt.length }, offIt.length > 0, function () {
      pushHistory();
      var n = assignUserLayer(offIt, L.id);
      userChanged();
      flash(t("ul_added", { n: n, name: L.name }));
    }),
  );
  var onIt = picked.filter(function (it) {
    return it.ulayer === L.id;
  });
  pop.appendChild(
    actButton("ul_take", { n: onIt.length }, onIt.length > 0, function () {
      pushHistory();
      var n = assignUserLayer(onIt, null);
      userChanged();
      flash(t("ul_taken", { n: n, name: L.name }));
    }),
  );
  pop.appendChild(
    actButton("ul_delete", null, true, function () {
      closePopover();
      pushHistory();
      removeUserLayer(L.id);
      userChanged();
      flash(t("ul_deleted", { name: L.name }));
    }),
  );
  var hint = document.createElement("div");
  hint.className = "lp-hint";
  hint.textContent = t("ul_h");
  pop.appendChild(hint);
  if (L.name.indexOf(t("ul_base") + " ") === 0)
    setTimeout(function () {
      if (!pop.hidden && popFor === "ul:" + L.id) input.select();
    }, 0);
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
  } else if (d.reason === "ulayer" && userLayerById(d.ulayer)) {
    var un = userLayerById(d.ulayer).name;
    pillMsg.textContent = t("lp_layer", { layer: un });
    pillFix.textContent = t("lp_fix_layer", { layer: un });
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
  } else if (d.reason === "ulayer" && userLayerById(d.ulayer)) {
    var U = userLayerById(d.ulayer);
    U.locked = false;
    userChanged();
    flash(t("lay_unlocked", { name: U.name }));
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
  if (!id || id === S.workSet) return;
  /* Say it. The switch used to be silent, so the first sign of it was a sofa
     that suddenly would not drag. The toast offers the way back, which also
     pins the work set so the next tool does not undo the answer. */
  var prev = S.workSet;
  setWorkSet(id, false);
  if (prev && prev !== "all")
    flash(t("lay_ws_auto", { name: labelOf(id) }), null, {
      label: t("lay_ws_stay", { name: labelOf(prev) }),
      run: function () {
        S.workSetPinned = true;
        setWorkSet(prev, true);
      },
    });
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
  onAfterRender(function () {
    syncCounts();
    followReference();
    syncRefRow();
  });
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
