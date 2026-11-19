/* Pure helpers for the cabinet designer's chrome — no DOM, no imports, so the
   Node tests run them directly:
   - countWord: "1 rail" / "2 rails" (and the Hebrew pair) for every count the
     designer prints;
   - statusSegments: what the bottom status bar shows, each with a priority
     the narrow-width CSS drops by (js/ui_cabinet.js fillStatusBar);
   - hintReserve: how much of the drawing's bottom margin the floating hint
     pill takes, so it never sits on the dimension labels
     (js/ui_cabinet_view.js draw). */

// forms: [Hebrew one, Hebrew many, English one, English many]
export function countWord(n, forms, en) {
  var one = n === 1;
  return n + " " + (en ? (one ? forms[2] : forms[3]) : (one ? forms[0] : forms[1]));
}

// which of two string keys a count takes: "{n} sheet" for one, "{n} sheets" else
export function pluralKey(n, oneKey, manyKey) {
  return n === 1 ? oneKey : manyKey;
}

/* A unit with no number ("mm", "Units: mm") is a label for nothing. */
var UNIT_TOKEN = /(^|[^a-z֐-׿])(mm|cm|m|in|ft)([^a-z֐-׿]|$)/i;
export function isBareUnit(text) {
  var s = String(text == null ? "" : text);
  return UNIT_TOKEN.test(s) && !/\d/.test(s);
}

/* 1 = the core manufacturing metrics (stock thickness, sheets, parts), which
   stay at any width; 2 drops next; 3 (the convention) drops first. */
export var STATUS_PRIORITY = { stock: 1, sheets: 1, parts: 1, failed: 1, yield: 2, units: 2, conv: 3 };

// list: [{ key, text }] in display order → the shown ones, each with its prio
export function statusSegments(list) {
  return (list || [])
    .filter(function (s) { return s && s.text && !isBareUnit(s.text); })
    .map(function (s) { return { key: s.key, text: s.text, prio: STATUS_PRIORITY[s.key] || 2 }; });
}

/* The width dimension hangs 26px under the drawing's baseline with its label
   under that; DIM_CLEAR is that much plus a little air. `base` is the margin
   the layout keeps anyway. Rects are plain {left, right, top, bottom, height}. */
export var DIM_CLEAR = 44;
export function hintReserve(canvasRect, hintRect, base) {
  if (!canvasRect || !hintRect || !(hintRect.height > 0)) return base;
  // a pill beside the drawing's columns, or under the canvas, costs nothing
  if (hintRect.right <= canvasRect.left || hintRect.left >= canvasRect.right) return base;
  var below = canvasRect.bottom - hintRect.top;
  if (below <= 0 || below > canvasRect.bottom - canvasRect.top) return base;
  return Math.max(base, Math.ceil(below + DIM_CLEAR));
}
