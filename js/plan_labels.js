/* Presentation room labels: the room name in capitals with its size under it,
   the way a marketing plan writes it ("LOUNGE" / "21'-6" X 16'-0""). Pure —
   the caller passes the name, the measurement and the length formatter, so
   the unit setting (metres, feet-inches) is honoured without this file
   knowing about it. */

/* {title, size} for one room. `meas` is roomMeasurements(): the face-to-face
   interior when the room is a clean rectangle, else the reference bounding
   box, which is what a plan annotates for an L-shaped room too. */
export function roomLabelLines(opts) {
  opts = opts || {};
  var name = String(opts.name || "").trim();
  var fmt = typeof opts.fmt === "function" ? opts.fmt : function (v) { return String(Math.round(v)); };
  // the last number carries the unit ("5 X 4 m"); feet-inches marks each one
  var fmtLast = typeof opts.fmtLast === "function" ? opts.fmtLast : fmt;
  var meas = opts.meas || null;
  var w = null, d = null;
  if (meas && meas.interior && meas.interior.width > 0 && meas.interior.depth > 0) {
    w = meas.interior.width;
    d = meas.interior.depth;
  } else if (meas && meas.referenceWidth > 0 && meas.referenceDepth > 0) {
    w = meas.referenceWidth;
    d = meas.referenceDepth;
  }
  return {
    // toLocaleUpperCase leaves scripts without case (Hebrew) untouched
    title: name ? name.toLocaleUpperCase() : "",
    size: w != null ? fmt(w) + " X " + fmtLast(d) : "",
  };
}

/* Font size for a label on screen: follows the zoom so the text keeps its
   proportion to the room, clamped so it never shrinks below legibility or
   swamps a small room. `SC` is pixels per cm. */
export function roomLabelFont(SC, big) {
  var px = (big ? 26 : 18) * Number(SC || 0);
  var lo = big ? 11 : 9, hi = big ? 20 : 14;
  if (!(px > 0)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(px)));
}
