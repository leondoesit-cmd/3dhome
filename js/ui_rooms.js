/* The room-preset palette that sits over the plan.
 *
 * It is deliberately the same shape as the wall palette next to it: a floating
 * card that appears with its tool and disappears with it, dockable by the same
 * grip machinery (js/plan_tools_dock.js), and made of the same chips. What it
 * arms is a preset from js/room_presets.js; the placing itself belongs to the
 * tool in js/interaction.js.
 *
 * The size fields are the point of the panel, not decoration. A preset's
 * numbers are a starting guess — "bedroom, but 3.8 by 3.2" is the normal case,
 * not the exception — and typing it BEFORE placing is far cheaper than
 * stamping a 3.5 and then dragging two walls. Values are exact interior
 * sizes in the project's display unit (2.74m, 9'-6"), with a 20 cm hard
 * minimum so the panel cannot arm something unbuildable.
 */

import { S } from "./state.js";
import { t, onLangChange } from "./i18n.js";
import { ROOM_CATEGORIES, ROOM_PRESETS, roomPreset, presetsByCategory, CONNECTION_MODES } from "./room_presets.js";
import { armRoomStamp, rotateRoomStamp, setRoomStampSize, setRoomStampConnMode } from "./interaction.js";
import { fmtLen, parseLen, unitLabel } from "./display_units.js";

var host = null;
var activeCat = ROOM_CATEGORIES[0].id;

function label(preset) {
  var s = t(preset.i18n);
  return s === preset.i18n ? preset.name : s;
}

function catLabel(cat) {
  var s = t(cat.i18n);
  return s === cat.i18n ? cat.id : s;
}

function build() {
  if (!host) return;
  host.textContent = "";

  var head = document.createElement("div");
  head.className = "wd-head";
  var title = document.createElement("span");
  title.className = "wd-title";
  title.textContent = t("rp_title");
  head.appendChild(title);
  var collapse = document.createElement("button");
  collapse.type = "button";
  collapse.id = "roomPaletteToggle";
  collapse.className = "wd-collapse";
  var expanded = !host.classList.contains("auto-collapsed");
  collapse.setAttribute("aria-expanded", expanded ? "true" : "false");
  collapse.title = t(expanded ? "rp_collapse" : "rp_expand");
  collapse.setAttribute("aria-label", collapse.title);
  collapse.innerHTML = '<i class="ph ' + (expanded ? "ph-caret-left" : "ph-sliders-horizontal") + '"></i>';
  collapse.addEventListener("click", function () {
    host.classList.toggle("auto-collapsed");
    build();
  });
  head.appendChild(collapse);
  host.appendChild(head);

  var tabs = document.createElement("div");
  tabs.className = "rp-tabs";
  ROOM_CATEGORIES.forEach(function (cat) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rp-tab" + (cat.id === activeCat ? " active" : "");
    b.textContent = catLabel(cat);
    b.addEventListener("click", function () {
      activeCat = cat.id;
      build();
    });
    tabs.appendChild(b);
  });
  host.appendChild(tabs);

  var grid = document.createElement("div");
  grid.className = "rp-grid";
  presetsByCategory(activeCat).forEach(function (preset) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rp-chip" + (S.roomStamp && S.roomStamp.id === preset.id ? " active" : "");
    b.dataset.preset = preset.id;
    var name = document.createElement("span");
    name.className = "rp-name";
    name.textContent = label(preset);
    var size = document.createElement("span");
    size.className = "rp-size";
    var shownW = S.roomStamp && S.roomStamp.id === preset.id ? S.roomStamp.w : preset.w;
    var shownD = S.roomStamp && S.roomStamp.id === preset.id ? S.roomStamp.d : preset.d;
    size.textContent = fmtLen(shownW, { domain: "rooms", suffix: false }) + " × " +
      fmtLen(shownD, { domain: "rooms", suffix: false });
    b.append(name, size);
    b.addEventListener("click", function () { armRoomStamp(preset.id); });
    grid.appendChild(b);
  });
  host.appendChild(grid);

  var armed = S.roomStamp && roomPreset(S.roomStamp.id);
  if (armed) {
    var sec = document.createElement("div");
    sec.className = "wd-sec rp-size-sec";
    var lab = document.createElement("span");
    lab.className = "wd-lab";
    lab.textContent = t("rp_clearSize") + " (" + unitLabel("rooms") + ")";
    sec.appendChild(lab);
    var row = document.createElement("div");
    row.className = "rp-fields";
    row.append(sizeField("w", armed), sizeField("d", armed));
    sec.appendChild(row);

    var turn = document.createElement("button");
    turn.type = "button";
    turn.className = "wd-btn rp-turn";
    turn.textContent = t("rp_turn");
    turn.title = t("rp_turnHint");
    turn.addEventListener("click", function () { rotateRoomStamp(); });
    sec.appendChild(turn);
    host.appendChild(sec);

    var connSec = document.createElement("div");
    connSec.className = "wd-sec rp-conn-sec";
    var connLab = document.createElement("span");
    connLab.className = "wd-lab";
    connLab.textContent = t("rp_conn_label");
    connSec.appendChild(connLab);

    var curMode = (S.roomStamp && S.roomStamp.connMode) || "auto";
    var seg = document.createElement("div");
    seg.className = "rp-conn-seg";
    CONNECTION_MODES.forEach(function (m) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rp-conn-btn" + (curMode === m ? " active" : "");
      btn.dataset.mode = m;
      btn.textContent = t("rp_conn_" + m) || m;
      btn.addEventListener("click", function () {
        setRoomStampConnMode(m);
      });
      seg.appendChild(btn);
    });
    connSec.appendChild(seg);
    if (curMode === "open") {
      var hint = document.createElement("div");
      hint.className = "rp-open-note";
      hint.textContent = t("rp_open_hint");
      connSec.appendChild(hint);
    }
    host.appendChild(connSec);

    var sizeHint = document.createElement("div");
    sizeHint.className = "rp-open-note";
    sizeHint.textContent = t("rp_size_hint");
    host.appendChild(sizeHint);
  }
}

function sizeField(axis, preset) {
  var wrap = document.createElement("label");
  wrap.className = "rp-field";
  var cap = document.createElement("span");
  cap.textContent = axis === "w" ? t("rp_width") : t("rp_depth");
  var input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.dataset.axis = axis;
  input.value = fmtLen(S.roomStamp[axis], { domain: "rooms", suffix: false });
  input.setAttribute("aria-label", (axis === "w" ? t("rp_width") : t("rp_depth")) + " (" + unitLabel("rooms") + ")");
  function commit() {
    var next = parseLen(input.value, "rooms");
    if (!Number.isFinite(next)) {
      input.value = fmtLen(S.roomStamp[axis], { domain: "rooms", suffix: false });
      return;
    }
    if (axis === "w") setRoomStampSize(next, S.roomStamp.d);
    else setRoomStampSize(S.roomStamp.w, next);
    input.value = fmtLen(S.roomStamp[axis], { domain: "rooms", suffix: false });
  }
  input.addEventListener("change", commit);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); commit(); }
  });
  wrap.append(cap, input);
  return wrap;
}

function syncVisibility() {
  if (!host) return;
  var wasHidden = host.hidden;
  host.hidden = S.tool !== "roomstamp";
  if (wasHidden && !host.hidden) host.classList.remove("auto-collapsed");
}

export function refreshRoomPalette() {
  syncVisibility();
  build();
}

function syncRoomSizeControls() {
  if (!host || !S.roomStamp) return;
  host.querySelectorAll(".rp-field input[data-axis]").forEach(function (input) {
    input.value = fmtLen(S.roomStamp[input.dataset.axis], { domain: "rooms", suffix: false });
  });
  var chipSize = host.querySelector('.rp-chip[data-preset="' + S.roomStamp.id + '"] .rp-size');
  if (chipSize) chipSize.textContent = fmtLen(S.roomStamp.w, { domain: "rooms", suffix: false }) + " × " +
    fmtLen(S.roomStamp.d, { domain: "rooms", suffix: false });
}

export function initRoomPalette(root) {
  host = (root || document).querySelector("#plan-room-palette");
  if (!host) return null;
  build();
  syncVisibility();
  /* Rebuild, not just show: picking the tool from the toolbar arms the last
     preset used, and the size fields belong to whatever is armed. */
  window.addEventListener("planner-tool", refreshRoomPalette);
  // the armed preset changes from the keyboard too (R, and the 0 shortcut),
  // so the panel listens rather than being told by every call site
  window.addEventListener("planner-room-stamp", function (event) {
    /* A size commit used to rebuild the card synchronously. On touch, the
       resulting blur removed the second input before its tap could focus it;
       screen-reader references became stale for the same reason. Keep the
       stable controls and update only their values. */
    if (event.detail && event.detail.reason === "size") syncRoomSizeControls();
    else refreshRoomPalette();
  });
  window.addEventListener("planner-room-created", function () {
    if (!host || !document.body.classList.contains("compact-nav") || host.hidden) return;
    host.classList.add("auto-collapsed");
    build();
  });
  window.addEventListener("planner-units", refreshRoomPalette);
  onLangChange(build);
  return host;
}

export { ROOM_PRESETS };
