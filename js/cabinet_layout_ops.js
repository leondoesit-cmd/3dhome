// Small structural edits on a cabinet spec (`it.cab`), kept free of the DOM
// and of three so Node can test them directly. Each one mutates the spec in
// place and reports what it did; the designer (ui_cabinet_inspect.js) names
// the undo step, marks the layout hand-edited and re-fits.

import { STD } from "./cabinet.js";

// Display precision can lose centimetres on a round trip (especially inches).
// Only text the user actually changed should be parsed as a new size.
export function sizeEntryChanged(initialText, text) {
  return String(initialText).trim() !== String(text).trim();
}

function plainColumn(c) {
  return !!c && (!c.kind || c.kind === "normal");
}

/* Swap a column with its neighbour. Returns the column's new index, or -1
   when there is nowhere to go. The column takes its contents, door and width
   with it — it is the same column, `hid` and all, in a different place. */
export function moveColumn(sp, i, dir) {
  var cols = sp && sp.cols,
    j = i + (dir < 0 ? -1 : 1);
  if (!cols || !cols[i] || j < 0 || j >= cols.length) return -1;
  var c = cols[i];
  cols[i] = cols[j];
  cols[j] = c;
  return j;
}

/* Swap a compartment with the one above (dir > 0) or below (dir < 0) it.
   Compartments are listed bottom-up, the way the column is built. */
export function moveSection(sp, ci, si, dir) {
  var secs = sp && sp.cols && sp.cols[ci] && sp.cols[ci].secs,
    j = si + (dir < 0 ? -1 : 1);
  if (!secs || !secs[si] || j < 0 || j >= secs.length) return -1;
  var s = secs[si];
  secs[si] = secs[j];
  secs[j] = s;
  return j;
}

/* Give every ordinary column the same width. Fillers and blind corners are
   strips of a set size, so they keep theirs (and are pinned, so the re-fit
   cannot stretch them); the ordinary columns share what is left equally,
   because they all end up flexible at one common width and the re-fit scales
   them alike. Returns the number of columns evened out. */
export function evenColumnWidths(sp) {
  var cols = (sp && sp.cols) || [],
    plain = cols.filter(plainColumn);
  if (plain.length < 2) return 0;
  var total = plain.reduce(function (n, c) { return n + (c.w > 0 ? c.w : 0); }, 0),
    each = Math.round((total / plain.length) * 10) / 10;
  cols.forEach(function (c) {
    if (plainColumn(c)) {
      c.w = each;
      delete c.fixed;
    } else c.fixed = true;
  });
  return plain.length;
}

/* True when every ordinary column already has the same width (to a millimetre),
   so the "even out" button can say there is nothing to do. */
export function columnsEven(sp) {
  var plain = ((sp && sp.cols) || []).filter(plainColumn);
  if (plain.length < 2) return true;
  return plain.every(function (c) { return Math.abs(c.w - plain[0].w) < 0.1; });
}

/* The left-hand version of the same cabinet: the columns in reverse order and
   every single hinged leaf hung from the other side, so a design drawn for one
   end of a room can be dropped at the other. Returns false when there is
   nothing to mirror (one column with no handed door). */
export function mirrorLayout(sp) {
  var cols = sp && sp.cols;
  if (!cols || !cols.length) return false;
  var handed = cols.some(handedColumn);
  if (cols.length < 2 && !handed) return false;
  cols.reverse();
  // a leaf with no side recorded hangs on the right (cabinet.js buildDoor)
  cols.forEach(function (c) {
    if (handedColumn(c)) c.door.hinge = c.door.hinge === "L" ? "R" : "L";
  });
  return true;
}

function handedColumn(c) {
  var door = c.door;
  if (!plainColumn(c) || !door || !["hinged", "glass", "mirror", "folding"].includes(door.t)) return false;
  // normalizeSpec re-fits c.w in place; layoutCab builds at that same width.
  return Math.max(1, door.leaves || (c.w > STD.maxDoor ? 2 : 1)) === 1;
}

/* Set one member of a run (a column's width, a compartment's height) to an
   exact size and pin it, taking the difference from the others — the ones
   that are free to change before the ones already pinned or rigid, and within
   each, nearest first (the next one along before the one behind) — without
   pushing any of them below `opts.minOf(member)`. The run's total does not
   change, so the re-fit has nothing to rescale and the size typed is the size
   built. Before this, a column whose other compartments were all rigid
   (drawers, a top box) scaled everything, the new size included, and a
   compartment set to 50 came out at 83.5.
   opts: { key: "w" | "h", minOf(member), flexOf(member), canGrow(member) }.
   canGrow defaults to allowing every neighbour to receive freed room. If none
   can, the run is unchanged, including its pins.
   Returns the size actually given, which is less than asked only when the
   others had nothing left to give. */
export function setExactSize(list, i, size, opts) {
  var self = list && list[i],
    key = opts.key,
    flexOf = opts.flexOf || function (o) { return !o.fixed; };
  if (!self || !(size > 0)) return NaN;
  var want = size - self[key],
    near = [];
  if (want === 0) return self[key];
  for (var step = 1; step < list.length; step++) {
    if (list[i + step]) near.push(list[i + step]);
    if (list[i - step]) near.push(list[i - step]);
  }
  var order = near.filter(flexOf).concat(near.filter(function (o) { return !flexOf(o); }));
  if (!order.length) return self[key]; // a run of one fills the cabinet
  if (want < 0) {
    var receiver = order.find(opts.canGrow || function () { return true; });
    if (!receiver) return self[key];
    receiver[key] -= want; // the room given back goes to one eligible neighbour
  } else {
    var left = want;
    var available = order.reduce(function (n, o) { return n + Math.max(0, o[key] - opts.minOf(o)); }, 0);
    if (!(available > 0)) return self[key];
    order.forEach(function (o) {
      if (left <= 0) return;
      var take = Math.min(left, Math.max(0, o[key] - opts.minOf(o)));
      o[key] -= take;
      left -= take;
    });
    want -= left;
  }
  self[key] += want;
  self.fixed = true;
  return self[key];
}

/* Where the arrow keys go from the current selection in a laid-out cabinet
   (`L` from layoutCab: cols[i].secs[j].y0/y1, bottom-up). Left/right keeps
   what kind of thing is selected — a column stays a column — and lands on the
   compartment at the same height in the next column rather than on its bottom
   one; up/down walks the compartments of the column, and from a column picks
   its bottom (up) or top (down) compartment. Columns without compartments of
   their own (fillers) are selected as columns. */
export function neighbourSelection(L, sel, key) {
  var cols = (L && L.cols) || [];
  if (!cols.length) return null;
  var ci = sel && sel.col != null ? Math.max(0, Math.min(cols.length - 1, sel.col)) : 0,
    col = cols[ci],
    secs = (col && col.secs) || [],
    si = sel ? sel.sec : null;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    var nj = Math.max(0, Math.min(cols.length - 1, ci + (key === "ArrowRight" ? 1 : -1))),
      next = cols[nj],
      nsecs = (next && next.secs) || [],
      divided = nsecs.length > 0 && plainColumn(next);
    if (si == null || !divided) return { col: nj, sec: null };
    if (!secs[si]) return { col: nj, sec: 0 };
    var mid = (secs[si].y0 + secs[si].y1) / 2,
      best = 0,
      bestD = Infinity;
    nsecs.forEach(function (s, j) {
      var d = mid >= s.y0 && mid <= s.y1 ? 0 : Math.min(Math.abs(mid - s.y0), Math.abs(mid - s.y1));
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    return { col: nj, sec: best };
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    if (!secs.length || !plainColumn(col)) return { col: ci, sec: null };
    if (si == null || !secs[si]) return { col: ci, sec: key === "ArrowUp" ? 0 : secs.length - 1 };
    return { col: ci, sec: Math.max(0, Math.min(secs.length - 1, si + (key === "ArrowUp" ? 1 : -1))) };
  }
  return sel ? { col: ci, sec: si } : null;
}
