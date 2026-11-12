/* Cabinet presets, default hardware and blank specs, split out of
   js/cabinet.js. It shares the editor's state through live imports from
   ../cabinet.js. */
import { bandById, defaultBand, defaultProfile, defaultStock } from "../stock.js";
import {
  CARCASS, FAM, FINISH, FRONTS, PRESETS, SEC, STD, door, inc_partSeq,
  isCorner, isFloat, sec,
} from "../cabinet.js";

export function presetById(id) {
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
  return null;
}

function defHW(fam) {
  var kitchen = fam === "kitchenBase" || fam === "kitchenUpper" || fam === "kitchenTall";
  return {
    handle: kitchen ? "bar" : "bar",
    finish: fam === "vanity" ? "chrome" : "steel",
    hinge: "soft",
    slide: kitchen ? "tandem" : "softFull",
    rail: "oval",
    led: false,
    mirrorInside: false,
    softClose: true,
    lock: false,
  };
}

// A fresh spec for a family at a given size — this is what "ברירת מחדל" means.
export function makeSpec(presetId, w, h, d, prev) {
  var p = presetById(presetId) || PRESETS[0],
    f = FAM[p.fam] || FAM.wardrobe,
    carcass = p.carcass || "full",
    corner = p.corner || null,
    // the board thickness and the back are the user's to set — but only while
    // the piece stays the same kind of thing. Switching to floating shelves
    // means 38 mm slabs and no back; switching back to a box means 18 mm and a
    // back panel again, not whatever the shelves happened to be made of.
    same = prev && (prev.carcass || "full") === carcass;
  var sp = {
    preset: p.id,
    fam: p.fam,
    carcass: carcass,
    corner: corner, // "diag" on a corner unit, null on everything else
    cornerFront: (prev && prev.cornerFront) || STD.cornerFront,
    panel: p.panel || (same && prev.panel) || STD.panel,
    back: p.back != null ? p.back : same && prev.back != null ? prev.back : STD.back,
    plinth: prev && prev.plinthType === "none" ? 0 : f.plinth,
    plinthType: (prev && prev.plinthType) || (f.plinth ? "recessed" : "none"),
    top: f.top || 0, // worktop thickness (kitchen bases)
    // how high off the floor the unit hangs — wall units sit 145 up so there
    // is the usual 50-55 cm of clearance over a 90 cm worktop
    elev: prev && prev.fam === p.fam && prev.elev != null ? prev.elev : f.elev || 0,
    gap: STD.gap,
    open: prev ? prev.open || 0 : 0,
    front: (prev && prev.front) || "flat", // door / drawer face style
    finFront: (prev && prev.finFront) || "auto",
    finCarcass: (prev && prev.finCarcass) || "auto",
    // which sheet each material role is actually bought as (see stock.js) —
    // this is what the cut plan nests and what the price is built from
    stock: Object.assign(defaultStock(p.fam), (prev && prev.stock) || {}),
    band: (prev && prev.band) || defaultBand(p.fam),
    profile: (prev && prev.profile) || defaultProfile(p.fam),
    hw: Object.assign(defHW(p.fam), (prev && prev.hw) || {}),
  };
  sp.cols = p.gen(w, h, d, sp);
  // `auto` = this layout is still the preset's own answer to this size, so a
  // resize may re-plan it. The designer clears the flag the moment the user
  // changes the division themselves.
  sp.auto = prev ? prev.auto !== false : true;
  sp.dim = { w: w, h: h, d: d };
  /* A re-plan builds brand new column objects. Positionally they are the same
     columns — the second column of a wardrobe that grew 20 cm is still the
     second column — so they inherit their predecessors' names, and the history
     reads as "column 2 changed" instead of as the whole interior being
     replaced. Anything the re-plan really did add is named by tagParts. */
  if (prev && prev.cols) carryPartIds(prev.cols, sp.cols);
  return normalizeSpec(sp, w, h, d);
}
function carryPartIds(from, to) {
  to.forEach(function (c, i) {
    var old = from[i];
    if (!old) return;
    if (old.hid) c.hid = old.hid;
    (c.secs || []).forEach(function (s, j) {
      var os = (old.secs || [])[j];
      if (os && os.hid) s.hid = os.hid;
    });
  });
}

export function defaultPreset(fam) {
  return (FAM[fam] || FAM.wardrobe).preset;
}

/* "Start from scratch" — the carcass of the family and nothing inside it: one
   full-height open bay, no door. From here the designer's wall tool draws the
   divisions the way the blueprint tool draws walls. It is deliberately NOT a
   PRESETS entry: a blank is a state, not a plan, so `auto` is off from the
   first moment and a resize only ever re-fits what was drawn. */
export function makeBlankSpec(fam, w, h, d, prev) {
  var f = FAM[fam] || FAM.wardrobe,
    sp = makeSpec(f.preset, w, h, d, prev),
    inner;
  /* makeSpec takes the family off the seed preset — for a blank the family is
     the one that was asked for, and the free-form one has no preset of its
     own at all. Fix it before the inner box is measured, because the plinth
     and the worktop it drops come from exactly this. */
  sp.fam = fam;
  if (fam === "free") {
    sp.plinth = 0;
    sp.plinthType = "none";
    sp.top = 0;
    sp.elev = 0;
  }
  inner = innerOf(sp, w, h);
  sp.preset = "blank";
  sp.cols = [{ w: inner.w, secs: [sec("open", inner.h)], door: door("none") }];
  sp.auto = false;
  return normalizeSpec(sp, w, h, d);
}

/* Re-fit a spec to the piece's current size. Fixed-height parts (drawer
   stacks, appliance niches, a top box) keep their height and the flexible
   ones (hanging, shelves, open niches) take up the slack — the way a joiner
   would re-plan a cabinet that grew 20 cm, rather than stretching everything. */
function distribute(list, total, getMin) {
  if (!list.length) return;
  var fixedSum = 0,
    flexSum = 0;
  list.forEach(function (o) {
    if (o.__flex) flexSum += o.__size;
    else fixedSum += o.__size;
  });
  var avail = total - fixedSum;
  if (flexSum > 0 && avail > flexSum * 0.35) {
    var k = avail / flexSum;
    list.forEach(function (o) {
      if (o.__flex) o.__size = Math.max(getMin(o), o.__size * k);
    });
  } else {
    var k2 = total / (fixedSum + flexSum || 1);
    list.forEach(function (o) {
      o.__size = Math.max(getMin(o), o.__size * k2);
    });
  }
  // Absorb rounding drift without forcing any member below its minimum.
  var sum = 0;
  list.forEach(function (o) {
    sum += o.__size;
  });
  var big = list[0];
  list.forEach(function (o) {
    if (o.__size > big.__size) big = o;
  });
  if (sum <= total) big.__size += total - sum;
  else {
    // Preserve minimum sizes when possible; impossible envelopes remain
    // visibly overfull so construction validation can reject them.
    var capacity = list.reduce(function (n, o) { return n + Math.max(0, o.__size - getMin(o)); }, 0);
    var deficit = Math.min(sum - total, capacity);
    if (capacity > 0) list.forEach(function (o) {
      o.__size -= deficit * Math.max(0, o.__size - getMin(o)) / capacity;
    });
  }
}

/* The clear box the division has to fit inside. Floating shelves have no
   carcass at all, so their "inner box" is the whole piece and every board eats
   into the height — one place to say that, read by both the re-fit below and
   the layout pass, so the drawing and the sizes can never drift apart. */
export function innerOf(sp, w, h) {
  var t = sp.panel || STD.panel;
  /* A floating run is n shelves with n-1 gaps between them, so the piece's
     height is the underside of the bottom board to the top of the top one and
     every compartment costs a board at each end. A closed box spends a board
     only *between* compartments; its ends are the top and bottom panels. */
  if (isFloat(sp)) return { w: w, h: h, wall: 0, boardPerSec: 2 };
  return { w: w - 2 * t, h: h - sp.plinth - 2 * t - (sp.top || 0), wall: t, boardPerSec: 0 };
}

function tagParts(sp) {
  var taken = {},
    dup = [];
  // one pass to learn which names are already in use — including the ones a
  // spec loaded from a file brought with it, which a fresh counter would
  // otherwise hand out a second time
  sp.cols.forEach(function (c) {
    [c].concat(c.secs || []).forEach(function (o) {
      if (o.hid && !taken[o.hid]) taken[o.hid] = 1;
      else dup.push(o);
    });
  });
  dup.forEach(function (o) {
    var id;
    do {
      id = "p" + inc_partSeq();
    } while (taken[id]);
    o.hid = id;
    taken[id] = 1;
  });
}

export function normalizeSpec(sp, w, h, d) {
  sp.panel = sp.panel || STD.panel;
  sp.shelf = sp.shelf || sp.panel;
  sp.gap = sp.gap == null ? STD.gap : sp.gap;
  sp.hw = Object.assign(defHW(sp.fam), sp.hw || {});
  if (!CARCASS[sp.carcass]) sp.carcass = "full";
  if (sp.corner !== "diag") sp.corner = null;
  if (!(sp.cornerFront > 20)) sp.cornerFront = STD.cornerFront;
  if (isCorner(sp)) {
    // a corner unit is one space behind one diagonal door: no columns to divide
    sp.carcass = "full";
    if (sp.cols.length > 1) sp.cols = [sp.cols[0]];
    if (sp.cols[0].secs.length > 1) sp.cols[0].secs = [sp.cols[0].secs[0]];
  }
  if (!(sp.elev >= 0)) sp.elev = (FAM[sp.fam] || FAM.wardrobe).elev || 0;
  if (!FRONTS[sp.front]) sp.front = "flat";
  if (!FINISH[sp.finFront]) sp.finFront = "auto";
  if (!FINISH[sp.finCarcass]) sp.finCarcass = "auto";
  sp.stock = Object.assign(defaultStock(sp.fam), sp.stock || {});
  if (!bandById(sp.band)) sp.band = defaultBand(sp.fam);
  if (!sp.profile) sp.profile = defaultProfile(sp.fam);
  if (isFloat(sp)) {
    // bare shelves: nothing to stand on, nothing to hang on, nothing to open
    sp.plinth = 0;
    sp.plinthType = "none";
    sp.back = 0;
    sp.top = 0;
  }
  if (sp.plinthType === "none") sp.plinth = 0;
  else if (sp.plinth == null) sp.plinth = (FAM[sp.fam] || FAM.wardrobe).plinth || 8;
  if (!sp.cols || !sp.cols.length) sp.cols = [{ w: 60, secs: [sec("shelves", 100)], door: door("none") }];
  tagParts(sp);

  var t = sp.panel,
    st = sp.shelf,
    inner = innerOf(sp, w, h),
    innerW = inner.w,
    innerH = inner.h;

  // columns (floating shelf runs butt into each other — there is no divider)
  var cl = sp.cols.map(function (c) {
    c.__size = c.w > 0 ? c.w : 40;
    c.__flex = !c.fixed;
    return c;
  });
  distribute(cl, innerW - (isFloat(sp) ? 0 : cl.length - 1) * t, function () {
    return 8;
  });
  sp.cols.forEach(function (c) {
    c.w = Math.round(c.__size * 10) / 10;
    delete c.__size;
    delete c.__flex;
    if (!c.secs || !c.secs.length) c.secs = [sec("shelves", innerH)];
    if (!c.door) c.door = door("none");
    // sections
    var sl = c.secs.map(function (s) {
      var m = SEC[s.t] || SEC.shelves;
      s.__size = s.h > 0 ? s.h : m.def;
      s.__flex = s.fixed ? 0 : m.flex;
      return s;
    });
    // a closed box spends a board between compartments; a floating run spends
    // one under every shelf, including the bottom one
    distribute(sl, innerH - (sl.length - 1 + inner.boardPerSec) * st, function (s) {
      return Math.max(STD.minSec, (SEC[s.t] || SEC.shelves).min);
    });
    c.secs.forEach(function (s) {
      s.h = Math.round(s.__size * 10) / 10;
      delete s.__size;
      delete s.__flex;
    });
  });
  return sp;
}
