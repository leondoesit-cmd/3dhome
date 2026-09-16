/* The mobile dimension knob — a rotary dial + scrub strip that takes over
   every numeric field on a phone or tablet.
 *
 * Why it exists: on a compact layout a dimension is edited through a 16px box
 * behind a soft keyboard that hides the very plan being measured, and the
 * edit itself is "select all, retype three digits" even when the change is
 * +5 cm. The dial keeps the drawing visible and turns the edit back into a
 * gesture, with the arithmetic in js/dim_knob.js.
 *
 * Two design rules do most of the work here:
 *
 * 1. THE FIELD STAYS THE SOURCE OF TRUTH. The knob never talks to the model.
 *    It writes the input's value and fires the events the field is already
 *    bound to, so every binding style in the app keeps working untouched —
 *    `input` (wall height), `change` (wall length/thickness/angle) and the
 *    blur-committed smart dimensions, which additionally opt in to live
 *    scrubbing through `mf-scrub` (js/ui.js). Nothing had to be re-bound, and
 *    a new numeric field gets a dial for free.
 *
 * 2. THE FOCUS LIFECYCLE IS REAL. ui.js snapshots undo on `focus` and drops it
 *    again on `blur`, so the knob genuinely focuses the field instead of
 *    faking events — one scrub is one undo step, exactly like one typed edit.
 *    The soft keyboard is kept away with `readOnly`, which suppresses it on
 *    every engine, rather than with preventDefault games that vary by browser.
 */

import { t, onLangChange } from "./i18n.js";
import { parseLen, toDisp, fromDisp, fmtLen, unitLabel } from "./display_units.js";
import { inferDomainFromElementId } from "./unit_settings.js";
import {
  createDimScrub,
  baseStepFor,
  angleAt,
  angleDelta,
  decimalsFor,
} from "./dim_knob.js";

var overlay = null,
  labelEl = null,
  rangeEl = null,
  dialEl = null,
  ringEl = null,
  valueEl = null,
  unitEl = null,
  stepEl = null,
  wheelEl = null,
  wheelTicks = null,
  hintEl = null,
  typeBtn = null,
  doneBtn = null,
  closeBtn = null;

var target = null; // the input this dial currently owns
var scrub = null;
var restore = null; // the field's own readOnly/inputmode, put back on close
var typing = null; // field handed over to the keyboard, so a tap does not re-grab it
var grab = null; // live pointer gesture
var slidePx = 0; // strip travel, for the tick pattern only
var frame = 0;
var writing = false; // guards the value hook against our own writes
var unhook = null;
var guardTimer = 0;
var lastBuzz = 0;

var NOTCHES = 36;
var TICK_SPACING = 12; // px between strip ticks

function compact() {
  return document.body.classList.contains("compact-nav");
}

function emit(el, type) {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function buzz() {
  var now = Date.now();
  if (now - lastBuzz < 28) return;
  lastBuzz = now;
  if (navigator.vibrate) navigator.vibrate(4);
}

/* ---- which fields get a dial ------------------------------------------- */

/* Every numeric field on a compact layout, minus explicit opt-outs. Listing
   dimension ids instead would leave the modeler, the cabinet designer and
   every panel built at runtime without one, which is where the boxes are
   smallest. `data-knob="off"` is the escape hatch. */
export function knobEligible(el) {
  if (!el || el.tagName !== "INPUT" || el.type !== "number") return false;
  if (el.disabled || el.readOnly) return false;
  if (el.getAttribute("data-knob") === "off") return false;
  return !el.closest("#start-screen, #dim-knob");
}

/* An ABSENT bound is not a bound of zero. Number(null) is 0, so reading these
   straight off the element would pin every field without a min/max attribute —
   which is most of them — to exactly zero. */
function numAttr(el, name) {
  var raw = el.getAttribute(name);
  if (raw == null || raw === "") return null;
  var v = Number(raw);
  return isFinite(v) ? v : null;
}

function labelFor(input) {
  var lab = input.closest("label");
  var span = lab && lab.querySelector("span");
  var text = (span && span.textContent) || input.getAttribute("aria-label") || "";
  if (!text && input.id) {
    var forLabel = document.querySelector('label[for="' + input.id + '"]');
    if (forLabel) text = forLabel.textContent;
  }
  if (!text) text = input.getAttribute("placeholder") || "";
  text = String(text).replace(/\s+/g, " ").trim();
  return text || t("dk_value");
}

/* Angles and lengths are the only two units a planner field carries, and the
   distinction is visible in the id of every one of them. */
function unitFor(input) {
  var explicit = input.getAttribute("data-knob-unit");
  if (explicit) return explicit;
  if (/rot|ang|azim|pitch|north|cone|deg/i.test(input.id || "")) return "°";
  return unitLabel(inferDomainFromElementId(input.id) || "plan");
}

function fieldValue(input) {
  if (/rot|ang|azim|pitch|north|cone|deg/i.test(input.id || "")) {
    var ang = parseFloat(input.value);
    return isFinite(ang) ? ang : 0;
  }
  var domain = inferDomainFromElementId(input.id) || "plan";
  var cm = parseLen(input.value, domain);
  if (Number.isFinite(cm)) return toDisp(cm, domain);
  var v = parseFloat(input.value);
  return isFinite(v) ? v : 0;
}

function writeKnobValue(input, displayValue) {
  if (/rot|ang|azim|pitch|north|cone|deg/i.test(input.id || "")) {
    input.value = String(displayValue);
    return;
  }
  var domain = inferDomainFromElementId(input.id) || "plan";
  input.value = fmtLen(fromDisp(displayValue, domain), { domain: domain, suffix: false });
}

/* ---- the panel ---------------------------------------------------------- */

function notchMarkup() {
  var out = "";
  for (var i = 0; i < NOTCHES; i++) {
    var major = i % 3 === 0;
    out +=
      '<line class="dk-notch' + (major ? " dk-notch-major" : "") + '"' +
      ' x1="50" y1="' + (major ? 8 : 10) + '" x2="50" y2="' + (major ? 17 : 15) + '"' +
      ' transform="rotate(' + (i * (360 / NOTCHES)) + ' 50 50)" />';
  }
  return out;
}

function build() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "dim-knob";
  overlay.className = "dim-knob";
  overlay.setAttribute("role", "group");
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="dk-head">' +
      '<span class="dk-label"></span>' +
      '<span class="dk-range"></span>' +
      '<button type="button" class="dk-close btn-icon"><i class="ph ph-x"></i></button>' +
    "</div>" +
    '<div class="dk-body">' +
      '<div class="dk-dial" role="slider" tabindex="0">' +
        /* The cap is the only still part. Notches AND grip turn together with
           the finger — a dial whose face never moves reads as broken during
           the slow, one-step-at-a-time turns this exists for. */
        '<svg viewBox="0 0 100 100" aria-hidden="true">' +
          '<circle class="dk-cap" cx="50" cy="50" r="27" />' +
          '<g class="dk-ring">' + notchMarkup() +
            '<path class="dk-grip" d="M50 30 L50 44" />' +
          "</g>" +
        "</svg>" +
        '<span class="dk-mark" aria-hidden="true"></span>' +
      "</div>" +
      '<div class="dk-side">' +
        '<div class="dk-readout"><b class="dk-value">0</b><span class="dk-unit"></span></div>' +
        '<div class="dk-steps">' +
          '<button type="button" class="dk-nudge" data-dir="-1"><i class="ph ph-minus"></i></button>' +
          '<span class="dk-step"></span>' +
          '<button type="button" class="dk-nudge" data-dir="1"><i class="ph ph-plus"></i></button>' +
        "</div>" +
      "</div>" +
    "</div>" +
    '<div class="dk-wheel" role="slider" tabindex="0"><span class="dk-wheel-ticks"></span><span class="dk-wheel-cursor"></span></div>' +
    '<div class="dk-foot">' +
      '<span class="dk-hint"></span>' +
      '<button type="button" class="dk-type"></button>' +
      '<button type="button" class="dk-done btn-accent"></button>' +
    "</div>";
  document.body.appendChild(overlay);

  labelEl = overlay.querySelector(".dk-label");
  rangeEl = overlay.querySelector(".dk-range");
  dialEl = overlay.querySelector(".dk-dial");
  ringEl = overlay.querySelector(".dk-ring");
  valueEl = overlay.querySelector(".dk-value");
  unitEl = overlay.querySelector(".dk-unit");
  stepEl = overlay.querySelector(".dk-step");
  wheelEl = overlay.querySelector(".dk-wheel");
  wheelTicks = overlay.querySelector(".dk-wheel-ticks");
  hintEl = overlay.querySelector(".dk-hint");
  typeBtn = overlay.querySelector(".dk-type");
  doneBtn = overlay.querySelector(".dk-done");
  closeBtn = overlay.querySelector(".dk-close");

  dialEl.addEventListener("pointerdown", startRotate);
  wheelEl.addEventListener("pointerdown", startSlide);
  [dialEl, wheelEl].forEach(function (el) {
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", endGesture);
    el.addEventListener("pointercancel", endGesture);
    el.addEventListener("keydown", onArrowKeys);
    el.addEventListener("wheel", onWheel, { passive: false });
  });
  overlay.querySelectorAll(".dk-nudge").forEach(function (btn) {
    btn.addEventListener("pointerdown", startNudge);
    btn.addEventListener("pointerup", stopNudge);
    btn.addEventListener("pointercancel", stopNudge);
    btn.addEventListener("pointerleave", stopNudge);
  });
  /* Keep the field focused while the panel's own buttons are pressed. The
     dial and the strip already prevent the default on pointerdown, but a plain
     button would move focus, fire the field's blur early and end the undo step
     in the middle of the gesture that is still running. */
  overlay.addEventListener("mousedown", function (e) {
    if (e.target.closest("button")) e.preventDefault();
  });
  typeBtn.addEventListener("click", handOverToKeyboard);
  doneBtn.addEventListener("click", function () { close(true); });
  closeBtn.addEventListener("click", function () { close(true); });
  applyLabels();
}

function applyLabels() {
  if (!overlay) return;
  overlay.setAttribute("aria-label", t("dk_title"));
  hintEl.textContent = t("dk_hint");
  typeBtn.textContent = t("dk_type");
  doneBtn.textContent = t("dk_done");
  closeBtn.setAttribute("aria-label", t("dk_close"));
  dialEl.setAttribute("aria-label", t("dk_dial"));
  wheelEl.setAttribute("aria-label", t("dk_wheel"));
  overlay.querySelectorAll(".dk-nudge").forEach(function (btn) {
    btn.setAttribute("aria-label", t(btn.dataset.dir === "1" ? "dk_inc" : "dk_dec"));
  });
  if (target) unitEl.textContent = unitFor(target);
}

/* The panel sits above whichever bottom chrome the current editor is showing —
   the planner rows, the modeler rows or the cabinet designer's. Measuring beats
   picking one editor's CSS token, because all three can be the visible one. */
function bottomInset() {
  var inset = 0;
  document
    .querySelectorAll("#mobile-nav, #m-ctx, #md-nav, #md-ctx, .cb-m-nav, .cbm-ctx")
    .forEach(function (bar) {
      if (!bar.getClientRects().length) return;
      var top = bar.getBoundingClientRect().top;
      inset = Math.max(inset, Math.round((window.innerHeight || 0) - top));
    });
  return inset;
}

/* ---- open / close ------------------------------------------------------- */

export function openDimKnob(input) {
  if (!input || target === input) return;
  if (target) close(true);
  build();

  target = input;
  restore = {
    readOnly: input.readOnly,
    inputMode: input.getAttribute("inputmode"),
  };
  /* readOnly is what actually keeps the soft keyboard down; the field still
     focuses, still fires focus/blur, and still accepts programmatic writes. */
  input.readOnly = true;
  input.setAttribute("inputmode", "none");
  input.classList.add("dim-knob-live");

  var min = numAttr(input, "min");
  var max = numAttr(input, "max");
  scrub = createDimScrub({
    value: fieldValue(input),
    base: baseStepFor(input.getAttribute("step"), restore.inputMode),
    min: min == null ? -Infinity : min,
    max: max == null ? Infinity : max,
  });
  slidePx = 0;

  labelEl.textContent = labelFor(input);
  unitEl.textContent = unitFor(input);
  rangeEl.textContent =
    min == null && max == null
      ? ""
      : (min == null ? "…" : min) + " – " + (max == null ? "…" : max);
  overlay.style.setProperty("--dk-bottom", bottomInset() + "px");
  overlay.hidden = false;
  // one frame later, so the entry transition has a state to move away from
  requestAnimationFrame(function () {
    if (overlay && target) overlay.classList.add("on");
  });
  document.body.classList.add("dim-knob-open");

  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
  hookValue(input);
  guardTimer = setInterval(guard, 250);
  render();
}

/* The field can go away underneath the dial: a new selection rebuilds a panel,
   a sheet closes, the window grows back to a desktop layout. */
function guard() {
  if (!target) return;
  if (!target.isConnected || target.disabled || !compact()) close(false);
}

function close(commit) {
  if (!target) return;
  var input = target;
  target = null;
  grab = null;
  stopNudge();
  if (guardTimer) clearInterval(guardTimer);
  guardTimer = 0;
  if (unhook) unhook();
  unhook = null;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;

  input.classList.remove("dim-knob-live");
  input.readOnly = restore.readOnly;
  if (restore.inputMode == null) input.removeAttribute("inputmode");
  else input.setAttribute("inputmode", restore.inputMode);
  restore = null;

  if (overlay) {
    overlay.classList.remove("on");
    overlay.hidden = true;
  }
  document.body.classList.remove("dim-knob-open");

  if (commit && scrub) {
    writing = true;
    writeKnobValue(input, scrub.value);
    emit(input, "input");
    emit(input, "change");
    writing = false;
  }
  scrub = null;
  // the real blur: ui.js drops an untouched undo snapshot here, and the smart
  // dimensions run their final validation (and may still raise a proposal)
  if (document.activeElement === input) input.blur();
}

/* "Type" is not an escape from the dial, it is the same edit continued on the
   keyboard: close cleanly first so undo and validation see one finished
   gesture, then hand the field back with its own inputmode restored. */
function handOverToKeyboard() {
  var input = target;
  if (!input) return;
  close(true);
  typing = input;
  try {
    input.focus({ preventScroll: true });
    input.select();
  } catch (_) {}
}

/* ---- two-way binding ---------------------------------------------------- */

/* The rest of the app assigns `input.value` directly (fillProps, a plan drag,
   the constraint solver) and fires nothing, so there is no event to listen for.
   Shadowing the accessor on this ONE element for as long as the dial is open
   is the only way to see those writes; `delete` puts the prototype back. */
function hookValue(input) {
  var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!desc || !desc.set) return;
  Object.defineProperty(input, "value", {
    configurable: true,
    enumerable: desc.enumerable,
    get: function () {
      return desc.get.call(this);
    },
    set: function (v) {
      desc.set.call(this, v);
      if (!writing) pullFromField();
    },
  });
  input.addEventListener("input", pullFromField);
  unhook = function () {
    input.removeEventListener("input", pullFromField);
    delete input.value;
  };
}

function pullFromField() {
  if (!target || !scrub || writing) return;
  scrub.set(fieldValue(target));
  render();
}

/* Push the scrubbed number into the field and fire everything bound to it.
   `mf-scrub` is the live channel for the blur-committed smart dimensions: it
   applies what the model accepts outright and stays silent about choices, so
   no proposal dialog can open in the middle of a drag.

   `writing` shuts the value hook off for the round trip. Without it the very
   `input` event this fires would feed the field's own value back into the
   accumulator, quantising away the remainder — and a slow drag that travels
   3° at a time would then never move at all. What comes back AFTERWARDS is a
   different matter: a field that clamped us (a wall length pinned to 5 cm)
   has made a decision, and the dial adopts it. */
function push() {
  if (!target || !scrub) return;
  writing = true;
  writeKnobValue(target, scrub.value);
  emit(target, "input");
  emit(target, "change");
  target.dispatchEvent(new CustomEvent("mf-scrub", { bubbles: true }));
  writing = false;
  var settled = fieldValue(target);
  if (settled !== scrub.value) scrub.set(settled);
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(function () {
    frame = 0;
    push();
    render();
  });
}

function render() {
  if (!overlay || !scrub) return;
  valueEl.textContent = scrub.value.toFixed(decimalsFor(scrub.base)).replace(/\.0+$/, "");
  stepEl.textContent = "±" + scrub.step;
  ringEl.style.transform = "rotate(" + scrub.turn.toFixed(2) + "deg)";
  wheelTicks.style.transform =
    "translateX(" + (((slidePx % TICK_SPACING) + TICK_SPACING) % TICK_SPACING).toFixed(2) + "px)";
  [dialEl, wheelEl].forEach(function (el) {
    el.setAttribute("aria-valuenow", String(scrub.value));
    if (isFinite(scrub.min)) el.setAttribute("aria-valuemin", String(scrub.min));
    if (isFinite(scrub.max)) el.setAttribute("aria-valuemax", String(scrub.max));
    el.setAttribute("aria-valuetext", scrub.value + " " + unitEl.textContent);
  });
}

/* ---- gestures ----------------------------------------------------------- */

function capture(el, e) {
  // untrusted (synthetic) pointer events have no active pointer to capture,
  // and the throw would abort the whole handler
  try {
    el.setPointerCapture(e.pointerId);
  } catch (_) {}
}

function startRotate(e) {
  if (!target) return;
  e.preventDefault();
  var r = dialEl.getBoundingClientRect();
  var cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  grab = {
    id: e.pointerId,
    mode: "rotate",
    cx: cx,
    cy: cy,
    angle: angleAt(cx, cy, e.clientX, e.clientY),
    time: e.timeStamp || Date.now(),
  };
  capture(dialEl, e);
  dialEl.classList.add("dragging");
}

function startSlide(e) {
  if (!target) return;
  e.preventDefault();
  grab = {
    id: e.pointerId,
    mode: "slide",
    x: e.clientX,
    time: e.timeStamp || Date.now(),
  };
  capture(wheelEl, e);
  wheelEl.classList.add("dragging");
}

function onMove(e) {
  if (!grab || !scrub || e.pointerId !== grab.id) return;
  e.preventDefault();
  var now = e.timeStamp || Date.now();
  var dt = now - grab.time;
  grab.time = now;
  var changed;
  if (grab.mode === "rotate") {
    var a = angleAt(grab.cx, grab.cy, e.clientX, e.clientY);
    changed = scrub.rotate(angleDelta(grab.angle, a), dt);
    grab.angle = a;
  } else {
    var dx = e.clientX - grab.x;
    grab.x = e.clientX;
    slidePx += dx;
    changed = scrub.slide(dx, dt);
  }
  if (changed) buzz();
  schedule();
}

function endGesture(e) {
  if (!grab || (e && e.pointerId !== grab.id)) return;
  grab = null;
  dialEl.classList.remove("dragging");
  wheelEl.classList.remove("dragging");
  if (scrub) scrub.settle();
  schedule();
}

/* Press-and-hold on ± repeats, so a dozen centimetres do not cost a dozen taps. */
var nudgeTimer = 0,
  nudgeDelay = 0;

function startNudge(e) {
  if (!scrub) return;
  e.preventDefault();
  var dir = Number(this.dataset.dir) || 1;
  var self = this;
  capture(self, e);
  function step() {
    if (!scrub) return stopNudge();
    if (scrub.nudge(dir)) buzz();
    schedule();
  }
  step();
  nudgeDelay = setTimeout(function () {
    nudgeTimer = setInterval(step, 90);
  }, 350);
}

function stopNudge() {
  if (nudgeDelay) clearTimeout(nudgeDelay);
  if (nudgeTimer) clearInterval(nudgeTimer);
  nudgeDelay = nudgeTimer = 0;
}

function onArrowKeys(e) {
  if (!scrub) return;
  var dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
  if (!dir) return;
  e.preventDefault();
  scrub.nudge(dir);
  schedule();
}

function onWheel(e) {
  if (!scrub) return;
  e.preventDefault();
  scrub.nudge(e.deltaY < 0 ? 1 : -1);
  schedule();
}

/* ---- wiring ------------------------------------------------------------- */

export function initDimKnob() {
  /* Capture phase: the dial has to claim the tap before the field focuses and
     the keyboard starts coming up. */
  document.addEventListener(
    "pointerdown",
    function (e) {
      var el = e.target;
      if (overlay && overlay.contains(el)) return;
      if (target && el === target) return;
      if (compact() && el !== typing && knobEligible(el)) {
        e.preventDefault();
        openDimKnob(el);
        return;
      }
      if (target) close(true);
    },
    true,
  );
  document.addEventListener("focusout", function (e) {
    if (e.target === typing) typing = null;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && target) close(true);
  });
  // a fold, a rotation or a resize back to desktop moves the chrome under it
  window.addEventListener("mf-posture", function () {
    if (!target) return;
    if (!compact()) close(false);
    else overlay.style.setProperty("--dk-bottom", bottomInset() + "px");
  });
  window.addEventListener("resize", function () {
    if (target && overlay) overlay.style.setProperty("--dk-bottom", bottomInset() + "px");
  });
  onLangChange(applyLabels);
}
