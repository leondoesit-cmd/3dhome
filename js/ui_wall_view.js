/* The Walls switch on the 3D view's toolbar: Up / Cutaway / Down, and how a
   cut wall looks (js/wall_view.js holds the state, js/view3d.js draws it).

   One button that names the current position ("Walls: Cutaway") and drops a
   small card with the three positions and the three looks. It replaces
   nothing: the Dollhouse button still frames the presentation camera, and it
   and this switch are the same bit (S.cutaway.on) seen from two places.

   Keys: Page Up raises the walls one step (Down -> Cutaway -> Up), Page Down
   lowers them, as in the games that made the three-position switch familiar. */
import { S } from "./state.js";
import { t, onLangChange } from "./i18n.js";
import { setCutaway } from "./ui.js";
import { WALL_MODES, CUT_STYLES, wallMode, cutStyle, setNearCut, setCutStyle } from "./wall_view.js";

var MODE_ICON = { up: "ph-wall", cut: "ph-selection-slash", down: "ph-arrow-line-down" };

export function setWallMode(mode) {
  if (WALL_MODES.indexOf(mode) < 0 || mode === wallMode()) return;
  if (mode === "down") setCutaway({ on: true });
  else {
    if (S.cutaway && S.cutaway.on) setCutaway({ on: false });
    setNearCut(mode === "cut");
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("walls3d:changed"));
}

// One step up or down the switch; false at either end.
export function stepWallMode(dir) {
  var i = WALL_MODES.indexOf(wallMode()) - dir; // the list runs up -> down
  if (i < 0 || i >= WALL_MODES.length) return false;
  setWallMode(WALL_MODES[i]);
  return true;
}

var button = null,
  pop = null;

export function wallsButton() {
  if (button) return button;
  button = document.createElement("button");
  button.type = "button";
  button.className = "pn-walls";
  button.id = "planner-walls";
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = '<i class="ph" aria-hidden="true"></i><span></span>';
  button.addEventListener("click", function (e) {
    e.stopPropagation();
    if (pop && !pop.hidden) closePop();
    else openPop();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("walls3d:changed", sync);
    window.addEventListener("keydown", onKey);
  }
  onLangChange(sync);
  sync();
  return button;
}

function sync() {
  if (!button) return;
  var mode = wallMode();
  button.querySelector("i").className = "ph " + MODE_ICON[mode];
  var label = t("walls_label", { mode: t("walls_" + mode) });
  button.querySelector("span").textContent = label;
  button.title = label + " · " + t("walls_keys");
  button.setAttribute("aria-label", label);
  if (pop && !pop.hidden) fillPop();
}

function ensurePop() {
  if (pop) return pop;
  pop = document.createElement("div");
  pop.className = "layer-pop walls-pop";
  pop.hidden = true;
  document.body.appendChild(pop);
  document.addEventListener(
    "pointerdown",
    function (e) {
      if (pop.hidden || pop.contains(e.target) || button.contains(e.target)) return;
      closePop();
    },
    true,
  );
  window.addEventListener("resize", closePop);
  return pop;
}

function openPop() {
  ensurePop();
  fillPop();
  pop.hidden = false;
  button.setAttribute("aria-expanded", "true");
  var r = button.getBoundingClientRect(),
    pr = pop.getBoundingClientRect();
  // a phone hides the floating toolbar (its buttons ride in the bottom bar):
  // centre the card over that bar instead of over an invisible button
  if (!(r.width > 0)) {
    var bottom = window.innerHeight;
    // the first of the phone's bottom bars that is actually on screen
    [".ps-dock", "#m-ctx", "#mobile-nav"].some(function (sel) {
      var el = document.querySelector(sel),
        r2 = el && el.getBoundingClientRect();
      if (!r2 || !(r2.height > 0)) return false;
      bottom = r2.top;
      return true;
    });
    pop.style.left = Math.max(6, (window.innerWidth - pr.width) / 2) + "px";
    pop.style.top = Math.max(6, bottom - pr.height - 8) + "px";
    return;
  }
  var x = Math.min(Math.max(6, r.right - pr.width), window.innerWidth - pr.width - 6);
  // below the button when it sits high (desktop), above it when it sits low
  var y = r.top > window.innerHeight / 2 ? r.top - pr.height - 6 : r.bottom + 6;
  pop.style.left = x + "px";
  pop.style.top = Math.max(6, Math.min(y, window.innerHeight - pr.height - 6)) + "px";
}

/* The phone's bottom toolbar (js/mobile_shell.js) offers the same card: one
   entry that names the position and opens the three positions and looks. */
export function openWallsMenu() {
  if (!button) wallsButton();
  openPop();
}
export function wallsNavSpec() {
  var mode = wallMode();
  return { icon: MODE_ICON[mode], label: t("walls_label", { mode: t("walls_" + mode) }) };
}

function closePop() {
  if (!pop) return;
  pop.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function segRow(labelKey, ids, current, keyOf, pick) {
  var wrap = document.createElement("div");
  wrap.className = "lp-row";
  var lab = document.createElement("span");
  lab.className = "lp-lab";
  lab.textContent = t(labelKey);
  wrap.appendChild(lab);
  var seg = document.createElement("div");
  seg.className = "lp-seg";
  ids.forEach(function (id) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = t(keyOf(id));
    b.className = id === current ? "on" : "";
    b.setAttribute("aria-pressed", id === current ? "true" : "false");
    b.addEventListener("click", function () {
      pick(id);
    });
    seg.appendChild(b);
  });
  wrap.appendChild(seg);
  return wrap;
}

function fillPop() {
  var mode = wallMode();
  pop.textContent = "";
  var h = document.createElement("div");
  h.className = "lp-head";
  h.textContent = t("walls_title");
  pop.appendChild(h);
  pop.appendChild(
    segRow("walls_show", WALL_MODES, mode, function (m) { return "walls_" + m; }, setWallMode),
  );
  var hint = document.createElement("div");
  hint.className = "lp-hint walls-mode-h";
  hint.textContent = t("walls_h_" + mode);
  pop.appendChild(hint);
  var style = segRow("walls_style", CUT_STYLES, cutStyle(), function (s) { return "walls_style_" + s; }, setCutStyle);
  // the look of a cut wall only means something on Cutaway
  if (mode !== "cut") style.classList.add("lp-off");
  pop.appendChild(style);
  var keys = document.createElement("div");
  keys.className = "lp-hint walls-keys"; // a phone has no Page keys: css hides it there
  keys.textContent = t("walls_keys");
  pop.appendChild(keys);
}

function onKey(e) {
  if (e.key !== "PageUp" && e.key !== "PageDown") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  var el = e.target;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
  // only while the 3D view is the one being worked in
  if (typeof document === "undefined" || document.documentElement.dataset.plannerViewport !== "3d") return;
  if (stepWallMode(e.key === "PageUp" ? 1 : -1)) e.preventDefault();
}
