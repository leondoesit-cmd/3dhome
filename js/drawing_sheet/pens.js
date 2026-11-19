/* Pen weights and lettering sizes for the regional working drawing
   (js/drawing_sheet/pro_plan.js), in PAPER millimetres: a size on paper is the
   same at 1:50 and 1:100, and `mm()` in the plan turns it into model units.

   Three pen groups, as an architect's plan has them: the cut (walls in
   section) heavy, what is seen below the cut (openings, frames, fixtures,
   stairs) medium, and the fine pen for furniture, hatching, dimension and
   witness lines. ISO 128-20 line widths (0.13 · 0.18 · 0.25 · 0.35 · 0.5 ·
   0.7); lettering per ISO 3098 / the usual office practice: 3.5 room names,
   2.5 everything a builder reads, 1.8 at the least. All ink is black. */

export const PEN_INK = "#000";
export const PEN_FACE = "Inter, Helvetica, Arial, sans-serif";

export const PENS = Object.freeze({
  cutOuter: 0.5,   // exterior wall outline
  cutInner: 0.35,  // interior wall outline
  medium: 0.25,    // openings, frames, fixtures, stairs, room-label frames
  fine: 0.13,      // hatching, furniture, dimension and witness lines
  tick: 0.35,      // dimension terminators
});

// the least a label may shrink to and still read (ISO 3098: 1.8 mm minimum)
export const MIN_SIZES = Object.freeze({ room: 2.5, area: 1.8, level: 1.8 });

const BASE = Object.freeze({ room: 3.5, area: 2.5, dim: 2.5, tag: 2.0, level: 2.0, note: 2.5, small: 1.8 });

/* Lettering per scale: the drawing scales of a working plan (1:20 … 1:100)
   keep the base sizes; at 1:200 and smaller there is no room and the minimum
   legible sizes take over. US denominators (48, 96, 192) are inch scales. */
export function textSizes(denom) {
  const d = Number(denom) || 50;
  if (d >= 150) return Object.freeze({ room: 2.5, area: 2.0, dim: 1.8, tag: 1.8, level: 1.8, note: 2.0, small: 1.8 });
  return BASE;
}

/* Rough width of a string in paper mm at a lettering height: the measure the
   label placer uses for its boxes. Inter's mean advance is ~0.56 of the
   height for Latin and digits, ~0.62 for Hebrew. */
export function textWidthMm(s, size, bold) {
  const str = String(s == null ? "" : s);
  let w = 0;
  for (const ch of str) w += /[֐-׿]/.test(ch) ? 0.62 : /[ .,:'"|]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.68 : /[0-9²]/.test(ch) ? 0.6 : 0.54;
  return w * size * (bold ? 1.1 : 1);
}
