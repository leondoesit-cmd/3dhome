/* How a ribbon tab fits its window — a pure function, so the fold order can be
   unit-tested without a DOM (js/pro_ribbon.js measures and applies it).

   A tab whose groups are wider than the ribbon used to scroll sideways under
   a hidden scrollbar: at 1024px the planner's Build tab hid all of Levels and
   Rooms, and the model editor's Sketch tab hid Smart dimension and every
   relation, with nothing on screen to say they were there. Now, in order:

     1. every group at full size, if they fit;
     2. dense: tighter tiles (the editors' ribbons take a third row);
     3. dense, and the LAST groups fold one by one, each into a single button
        named after its group that drops its tools down as a menu. The first
        group never folds: it holds the tab's everyday tools (Select, Sketch,
        the opening verbs).

   If even that is too wide (a 501px window), `overflow` says so and the
   ribbon shows its scroll buttons.

   groups:    [{ full, dense, folded }] — each group's width in px in each state
   available: the width the groups row has */
export function planRibbonFit(groups, available) {
  var list = Array.isArray(groups) ? groups : [];
  var room = Math.max(0, Number(available) || 0);
  var n = list.length;
  var w = function (g, key) { return Math.max(0, Number(g && g[key]) || 0); };
  var sum = function (key, from, to) {
    var s = 0;
    for (var i = from; i < to; i++) s += w(list[i], key);
    return s;
  };
  // half a pixel of slack: measured widths are fractional
  if (sum("full", 0, n) <= room + 0.5) return { dense: false, fold: 0, overflow: false };
  if (sum("dense", 0, n) <= room + 0.5) return { dense: true, fold: 0, overflow: false };
  for (var k = 1; k < n; k++) {
    if (sum("dense", 0, n - k) + sum("folded", n - k, n) <= room + 0.5) return { dense: true, fold: k, overflow: false };
  }
  return { dense: true, fold: Math.max(0, n - 1), overflow: n > 0 };
}
