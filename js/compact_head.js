/* The pure parts of the phone and fold chrome (js/pro_compact.js): the order
 * the editor knob turns through, which face sits where on it, what the header
 * title says, and the recent-tools list the bottom toolbar offers. No DOM, so
 * a Node test can hold them to their word. */

/* The knob is a drum of the three editors: turning it down brings the next one
   up into the middle, and it wraps — past Cabinet comes Plan again. */
export var KNOB_ORDER = ["plan", "model", "cab"];

export function knobStep(current, step) {
  var n = KNOB_ORDER.length, i = KNOB_ORDER.indexOf(current);
  if (i < 0) i = 0;
  return KNOB_ORDER[(((i + step) % n) + n) % n];
}

/* Where a face sits on the drum while `current` is in front: 0 in the middle,
   -1 curving away above (the previous editor), 1 curving away below (the next). */
export function knobOffset(face, current) {
  var n = KNOB_ORDER.length;
  var d = (KNOB_ORDER.indexOf(face) - KNOB_ORDER.indexOf(current) + n) % n;
  return d === 0 ? 0 : d === 1 ? 1 : -1;
}

/* The header names what you are working on, never the editor (the knob does
   that): the selection first, with its part code, else the tool in hand, else
   the project. `sub` is the quieter second line. */
export function pickTitle(o) {
  o = o || {};
  if (o.selName) {
    return { kind: "sel", main: o.selName, code: o.selCode || "", sub: o.selSub || "" };
  }
  if (o.toolName) return { kind: "tool", main: o.toolName, code: "", sub: o.toolSub || "" };
  return { kind: "project", main: o.project || "", code: "", sub: o.place || "" };
}

/* Most recent first, no repeats, at most `max`. */
export function pushRecent(list, id, max) {
  if (!id) return (list || []).slice(0, max || 4);
  var out = [id];
  (list || []).forEach(function (x) { if (x !== id && out.indexOf(x) < 0) out.push(x); });
  return out.slice(0, max || 4);
}
