/* Scrub engine for the mobile dimension knob (js/ui_dim_knob.js).
 *
 * A number field on a phone is a 16px box behind a soft keyboard: to take a
 * wall from 320 to 345 you tap it, the keyboard covers the plan you are
 * looking at, you clear three digits and type three more. The knob replaces
 * that with a finger already resting on the screen — but a dial is only
 * usable if it answers two opposite demands at once:
 *
 *   settle on an exact number   → a slow turn must move in the field's own
 *                                 smallest unit and never overshoot it,
 *   cross a large range fast    → a flick must cover hundreds of centimetres
 *                                 without twenty revolutions.
 *
 * Both come out of the same measurement: the ANGULAR SPEED of the finger.
 * Slow travel keeps unit gain at 1 and quantises to the base step; as speed
 * rises the gain grows and the quantum climbs the ladder base → ×5 → ×10, so
 * a fast spin lands on round numbers rather than on 347.3. Nothing here is
 * time-based or animated: the same gesture always produces the same number,
 * which is what makes a dial trustworthy for a dimension.
 *
 * The engine is deliberately DOM-free — it is the part with arithmetic worth
 * testing, and the rotary dial and the linear strip are two views of it.
 */

// A slow turn spends this many degrees per base step: a full revolution is 60
// of them, which is one comfortable thumb sweep across a useful range.
export var DEG_PER_STEP = 6;
// The strip is the same engine driven by travel instead of rotation.
export var PX_PER_DEG = 1.6;
// Below this the finger is placing a value, above it the finger is travelling.
export var SPEED_KNEE = 0.25; // degrees per millisecond
export var MAX_GAIN = 12;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* Decimals implied by a step, so 0.5 never renders as 12.500000000000002. */
export function decimalsFor(step) {
  var s = String(Math.abs(Number(step) || 1));
  var exp = s.indexOf("e-");
  if (exp > 0) return Math.min(6, Number(s.slice(exp + 2)) || 0);
  var dot = s.indexOf(".");
  return dot < 0 ? 0 : Math.min(6, s.length - dot - 1);
}

export function roundTo(value, decimals) {
  var v = Number(value.toFixed(Math.max(0, Math.min(6, decimals || 0))));
  // -0 reads as "-0" in a dimension box
  return v === 0 ? 0 : v;
}

/* The field's own smallest meaningful unit. An explicit step attribute wins;
   otherwise a decimal keypad means the author expects fractions (0.5 cm) and
   a numeric one means whole centimetres. */
export function baseStepFor(stepAttr, inputMode) {
  var s = Number(stepAttr);
  if (isFinite(s) && s > 0) return s;
  return String(inputMode || "").toLowerCase() === "decimal" ? 0.5 : 1;
}

export function stepLadder(base) {
  var dec = decimalsFor(base);
  return [base, roundTo(base * 5, dec), roundTo(base * 10, dec)];
}

/* Unit gain as a function of angular speed. Flat at 1 up to the knee so a
   deliberate turn is never amplified, then super-linear so a flick travels. */
export function gainFor(speed) {
  var s = Number(speed) || 0;
  if (!(s > SPEED_KNEE)) return 1;
  return Math.min(MAX_GAIN, 1 + Math.pow((s - SPEED_KNEE) / SPEED_KNEE, 1.35));
}

/* The quantum that goes with a gain. Rounding a fast spin to the base step
   would hand back 347.3 — at speed the user is choosing a magnitude, not a
   millimetre, and expects the number to stay round. */
export function stepFor(base, gain) {
  var ladder = stepLadder(base);
  if (gain < 2.5) return ladder[0];
  return gain < 6 ? ladder[1] : ladder[2];
}

export function angleAt(cx, cy, x, y) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

/* Signed shortest way round, so crossing the ±180° seam is not a full turn. */
export function angleDelta(prev, next) {
  var d = (Number(next) || 0) - (Number(prev) || 0);
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/* A live scrub over one field.

   `acc` is the continuous truth and `value` is what the field shows: keeping
   them apart is what makes slow scrubbing smooth. If the displayed number
   were the accumulator, every quantisation would throw away the remainder and
   a slow drag would stall — travel 3° six times and nothing would ever move. */
export function createDimScrub(opts) {
  opts = opts || {};
  var base = Number(opts.base) > 0 ? Number(opts.base) : 1;
  var dec = decimalsFor(base);
  var min = isFinite(Number(opts.min)) ? Number(opts.min) : -Infinity;
  var max = isFinite(Number(opts.max)) ? Number(opts.max) : Infinity;
  if (max < min) max = min;

  var api = {
    base: base,
    min: min,
    max: max,
    decimals: dec,
    value: clamp(roundTo(Number(opts.value) || 0, dec), min, max),
    step: base,
    // total degrees turned, for the dial's own rotation — never for the value
    turn: 0,
  };
  var acc = api.value;

  function commit(units, speed) {
    var gain = gainFor(speed);
    api.step = stepFor(base, gain);
    acc = clamp(acc + units * gain, min, max);
    var next = clamp(roundTo(Math.round(acc / api.step) * api.step, dec), min, max);
    var changed = next !== api.value;
    api.value = next;
    return changed;
  }

  /* Set from the outside — a typed edit, a plan drag, a new selection. The
     accumulator has to follow or the next turn would resume from a stale
     position and snap the field back. */
  api.set = function (value) {
    var v = clamp(roundTo(Number(value) || 0, dec), min, max);
    var changed = v !== api.value;
    api.value = v;
    acc = v;
    return changed;
  };

  api.rotate = function (deltaDeg, dtMs) {
    var d = Number(deltaDeg) || 0;
    var dt = Number(dtMs) > 0 ? Number(dtMs) : 16;
    api.turn += d;
    return commit((d / DEG_PER_STEP) * base, Math.abs(d) / dt);
  };

  api.slide = function (deltaPx, dtMs) {
    var deg = (Number(deltaPx) || 0) / PX_PER_DEG;
    var dt = Number(dtMs) > 0 ? Number(dtMs) : 16;
    api.turn += deg;
    return commit((deg / DEG_PER_STEP) * base, Math.abs(deg) / dt);
  };

  /* One press of ± or one wheel notch: exactly the step now on show, so the
     button always does what the readout beside it promises. */
  api.nudge = function (dir) {
    var d = Number(dir) || 0;
    if (!d) return false;
    var step = api.step;
    var from = Math.round(api.value / step) * step;
    return api.set(from + (d > 0 ? step : -step));
  };

  /* The finger let go: drop back to fine resolution so the next gesture — and
     every ± press until then — starts precise. */
  api.settle = function () {
    api.step = base;
    acc = api.value;
  };

  return api;
}
