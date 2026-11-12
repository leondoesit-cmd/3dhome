/* Cabinet spec/family lookup, cabinet and corner layout, open sections and door
   runs, split out of js/cabinet.js. It shares the editor's state through live
   imports from ../cabinet.js. */
import { addHandle, countHardware, foldingLeaf, hingeCount, leafWeight, sheetFor } from "../cabinet/hardware.js";
import { defaultPreset, makeSpec, normalizeSpec, presetById } from "../cabinet/presets.js";
import { applyCabinetLayoutEdits } from "../core/cabinet_parts.js";
import { S, fin } from "../state.js";
import {
  OPEN_SEC, STD, cabRun, cornerCut, cornerPoly, isCorner, isFloat, sec,
} from "../cabinet.js";

/* The spec of an item, creating a default one on first use.

   This is also where "the preset follows the size" happens: while the layout
   is still the preset's own (nothing hand-edited), a real size change re-runs
   the generator — 200 cm gives three columns, 300 cm gives four, and a column
   that grew past a comfortable leaf width gets a pair of doors. Once the user
   has edited the division, the spec is only re-fitted, never re-planned. */
export function specOf(it) {
  if (!it.cab) {
    it.cab = makeSpec(defaultPreset(famOf(it)), it.w, it.h, it.d);
    return it.cab;
  }
  var sp = it.cab,
    d0 = sp.dim;
  if (sp.auto !== false && presetById(sp.preset) && (!d0 || Math.abs(d0.w - it.w) > 2 || Math.abs(d0.h - it.h) > 2 || Math.abs(d0.d - it.d) > 2))
    it.cab = makeSpec(sp.preset, it.w, it.h, it.d, sp);
  else normalizeSpec(sp, it.w, it.h, it.d);
  return it.cab;
}
export function famOf(it) {
  if (it.cab && it.cab.fam) return it.cab.fam;
  if (it.h <= 100 && it.d <= 50) return "tvUnit";
  if (it.h <= 100) return "kitchenBase";
  if (it.d <= 36) return "bookcase";
  return "wardrobe";
}

/* Turns the spec into flat geometry. Everything downstream — the 3D build,
   the elevation drawing, the cut list and the price — reads this and only
   this, so they can never disagree with each other. */
export function layoutCab(it, run, options) {
  function finish(layout) {
    const edits = !options?.semanticOnly && S.parametric?.definitions?.[it.definitionId]?.metadata?.advancedEdits;
    return applyCabinetLayoutEdits(layout, edits);
  }
  var sp = specOf(it),
    // where this unit sits among its neighbours — a run of one when it stands
    // alone, which is what a wardrobe in the middle of a wall always is
    R = run || cabRun(it),
    t = sp.panel,
    st = sp.shelf || t,
    w = it.w,
    h = it.h,
    d = it.d,
    hw = w / 2,
    hd = d / 2,
    ph = sp.plinth,
    topT = sp.top || 0;
  // Runtime interaction state is instance-owned. Keep `sp.open` only as the
  // compatibility projection consumed by the existing motion builder.
  if (it.runtimeState && Number.isFinite(it.runtimeState.cabinetOpen)) sp.open = it.runtimeState.cabinetOpen;

  var sliding = sp.cols.some(function (c) {
      return c.door && c.door.t === "sliding";
    }),
    doorT = STD.doorT,
    // where the carcass front sits: overlay doors hang on it, sliding leaves
    // need their track in front of it
    zc = sliding ? hd - STD.slideTrack : hd - doorT,
    zb = -hd + sp.back, // inside face of the back panel
    yb = ph + t, // top of the bottom panel
    yt = h - topT - t; // underside of the top panel

  var L = {
    it: it, sp: sp, w: w, h: h, d: d, t: t, st: st, zc: zc, zb: zb, yb: yb, yt: yt,
    sliding: sliding, run: R, parts: [], units: [], cols: [], hw: {},
  };
  function part(o) {
    if (!o) return null;
    if (o.k === "box") {
      if (!fin(o.x0) || !fin(o.x1) || !fin(o.y0) || !fin(o.y1) || !fin(o.z0) || !fin(o.z1)) return null;
      if (Math.abs(o.x1 - o.x0) < 1e-4 || Math.abs(o.y1 - o.y0) < 1e-4 || Math.abs(o.z1 - o.z0) < 1e-4) return null;
    } else if (o.k === "cyl") {
      if (!fin(o.x) || !fin(o.y) || !fin(o.z) || !fin(o.r) || !fin(o.hgt) || o.r <= 0 || o.hgt <= 0) return null;
    }
    L.parts.push(o);
    return o;
  }
  function unit(o) {
    L.units.push(o);
    return L.units.length - 1;
  }
  L.part = part;
  L.unit = unit;

  /* --- floating shelves: no carcass, so nothing below applies ---
     One board per compartment, sitting at its foot and spanning the full depth,
     on brackets that are inside the wall and therefore have no geometry. The
     columns/compartments are still built the same way, so the elevation editor,
     the cut list and the checks all work unchanged. */
  if (isFloat(sp)) {
    L.yb = 0;
    L.yt = h;
    L.zc = hd;
    L.zb = -hd;
    var fx = -hw;
    sp.cols.forEach(function (c, ci) {
      var cw = Math.max(0, fin(c.w) ? c.w : 0);
      var fcol = { i: ci, x0: fx, x1: fx + cw, w: cw, ref: c, secs: [], kind: "normal" };
      L.cols.push(fcol);
      var fy = 0;
      function shelf(y) {
        if (cw > 0.001) {
          part({ k: "box", role: "shelf", x0: fcol.x0, x1: fcol.x1, y0: y, y1: y + st, z0: -hd, z1: hd, mat: "front", float: 1 });
        }
      }
      var floatSecs = Array.isArray(c.secs) && c.secs.length ? c.secs : [{ t: "open", h: Math.max(0, h) }];
      floatSecs.forEach(function (s, si) {
        var sh = Math.max(0, fin(s.h) ? s.h : 0);
        shelf(fy);
        // the compartment owns the board at its foot and the clear space above it
        fcol.secs.push({ i: si, y0: fy, y1: fy + st + sh, ref: s, col: fcol, shelves: 0, floatShelf: 1 });
        fy += st + sh;
      });
      shelf(fy); // and the top board caps the run
      fx = fcol.x1;
    });
    countHardware(L);
    // two concealed brackets per shelf, a third once it is too long for two
    L.hw.floatShelves = 0;
    L.hw.brackets = 0;
    L.cols.forEach(function (col) {
      var n = col.secs.length + 1;
      L.hw.floatShelves += n;
      L.hw.brackets += n * (col.w > 90 ? 3 : 2);
    });
    return finish(L);
  }

  /* --- a corner unit is a different shape, so it builds itself --- */
  if (isCorner(sp)) {
    layoutCorner(L, part);
    countHardware(L);
    return finish(L);
  }

  /* --- carcass --- */
  if (ph > 0 && sp.plinthType !== "legs") {
    /* A real plinth is a front rail with return pieces, not a solid block —
       which is also what has to appear on the cutting list. Across a run the
       rail is continuous, so the returns exist only at the two ends that are
       actually visible; the joints in the middle have nothing to close. */
    var inset = sp.plinthType === "flush" ? 0 : STD.toeInset,
      pz = sp.plinthType === "flush" ? zc + STD.doorT : zc - inset;
    part({ k: "box", role: "plinth", x0: -hw, x1: hw, y0: 0, y1: ph, z0: pz - t, z1: pz, mat: "carcass" });
    [-1, 1].forEach(function (sx) {
      if (sx < 0 ? !R.first : !R.last) return;
      var x0 = sx < 0 ? -hw : hw - t;
      part({ k: "box", role: "plinth", x0: x0, x1: x0 + t, y0: 0, y1: ph, z0: zb, z1: pz - t, mat: "carcass" });
    });
  } else if (sp.plinthType === "legs" && ph > 0) {
    var legXs = [-hw + Math.min(6, w / 4), hw - Math.min(6, w / 4)], dividerX = -hw + t;
    sp.cols.slice(0,-1).forEach(function(c){dividerX += c.w;legXs.push(dividerX + t / 2);dividerX += t;});
    legXs.sort(function(a,b){return a-b;});
    // Include intermediate supports across a very wide single bay too.
    var supports = [];
    legXs.forEach(function(x,i){if(i){var prev=legXs[i-1],n=Math.ceil((x-prev)/STD.maxSpan);for(var j=1;j<n;j++)supports.push(prev+(x-prev)*j/n);}supports.push(x);});
    supports.forEach(function(x,i){if(i && Math.abs(x-supports[i-1])<0.1)return;
      [-1,1].forEach(function(sz){part({k:"cyl",role:"leg",x:x,y:ph/2,z:sz*(hd-Math.min(8,d/4)),r:1.8,hgt:ph,mat:"metal"});});
    });
  }
  part({ k: "box", role: "side", x0: -hw, x1: -hw + t, y0: ph, y1: h - topT, z0: zb - sp.back, z1: zc, mat: "carcass" });
  part({ k: "box", role: "side", x0: hw - t, x1: hw, y0: ph, y1: h - topT, z0: zb - sp.back, z1: zc, mat: "carcass" });
  part({ k: "box", role: "bottom", x0: -hw + t, x1: hw - t, y0: ph, y1: yb, z0: zb, z1: zc, mat: "carcass" });
  part({ k: "box", role: "top", x0: -hw + t, x1: hw - t, y0: yt, y1: h - topT, z0: zb, z1: zc, mat: "carcass" });
  /* An open-backed unit (a grid shelf, a room divider) has no back to cut.
     A closed one does not get a single board across the whole run either: the
     back is a piece per carcass box, butt-jointed behind a divider, which is
     both how it is built and the only way it fits on a sheet — a 2 m wardrobe
     back in one piece is 1964 mm wide and no board is. */
  if (sp.back > 0) {
    var innerW = w - 2 * t,
      bh = h - topT - ph,
      bsheet = sheetFor(sp, "back", sp.back),
      /* How wide a back piece may be: whatever the chosen back sheet can hold
         once the piece's height is laid along one of its two axes. Fall back to
         a carcass box if no sheet is resolvable. */
      maxW = STD.maxBox;
    if (bsheet) {
      var across = bh <= bsheet.l - 2 ? bsheet.w - 2 : bh <= bsheet.w - 2 ? bsheet.l - 2 : 0;
      if (across > 20) maxW = across;
    }
    var nBack = Math.max(1, Math.ceil(innerW / maxW)),
      segs = [];
    if (nBack === 1) segs = [innerW];
    else {
      /* Prefer a joint over a divider, where it is supported — but not at the
         price of an extra piece and an extra sheet. Three 650 mm backs cut from
         three sheets is worse joinery than two 980 mm backs from two. */
      var cur = 0,
        onDiv = [];
      sp.cols.forEach(function (c, ci) {
        var seg = c.w + (ci > 0 ? t : 0); // the divider belongs to the piece behind it
        if (cur > 0 && cur + seg > maxW) {
          onDiv.push(cur);
          cur = seg;
        } else cur += seg;
      });
      if (cur > 0) onDiv.push(cur);
      if (onDiv.length <= nBack) segs = onDiv;
      else for (var bi = 0; bi < nBack; bi++) segs.push(innerW / nBack);
    }
    var bx = -hw + t;
    segs.forEach(function (sw) {
      part({ k: "box", role: "back", x0: bx, x1: bx + sw, y0: ph, y1: h - topT, z0: zb - sp.back, z1: zb, mat: "back" });
      bx += sw;
    });
  }
  /* The worktop belongs to the RUN, not to the unit: one slab across five base
     units, overhanging only at the two exposed ends, jointed where it is longer
     than a slab. The run's first unit carries the whole thing so the piece count
     and the area are right; the others carry none. The pieces are drawn in this
     unit's own frame, which is why they run off past its sides. */
  if (topT && R.first) {
    var runW = R.span + 3,
      nTop = Math.max(1, Math.ceil(runW / STD.maxTop)),
      pw = runW / nTop,
      tx = -hw - 1.5;
    for (var ti = 0; ti < nTop; ti++) {
      var cutouts = (sp.worktopCutouts || []).map(function(hole) {
        return { kind: hole.kind, x0: -hw + hole.x0, x1: -hw + hole.x1, z0: hole.z0, z1: hole.z1 };
      }).filter(function(hole) { return hole.x1 > tx && hole.x0 < tx + pw; });
      part({ k: "box", role: "worktop", x0: tx, x1: tx + pw, y0: h - topT, y1: h, z0: -hd - 1.5, z1: hd + 1.5, mat: "top", run: 1, cutouts: cutouts, exposedReturns: (ti === 0 ? 1 : 0) + (ti === nTop - 1 ? 1 : 0) });
      tx += pw;
    }
  }

  /* --- columns --- */
  var x = -hw + t;
  sp.cols.forEach(function (c, ci) {
    var cw = Math.max(0, fin(c.w) ? c.w : 0);
    if (ci > 0) {
      part({ k: "box", role: "divider", x0: x, x1: x + t, y0: yb, y1: yt, z0: zb, z1: zc, mat: "carcass" });
      x += t;
    }
    var cx0 = x,
      cx1 = x + cw,
      col = { i: ci, x0: cx0, x1: cx1, w: cw, ref: c, secs: [] };
    L.cols.push(col);

    /* A filler closes the gap between the run and the wall, and a blind corner
       is the dead space the cabinet round the corner covers: neither is
       divided, and only the filler shows a face. */
    col.kind = c.kind || "normal";
    if (col.kind !== "normal") {
      if (col.kind === "filler" && cw > 0.001)
        part({ k: "box", role: "filler", x0: cx0, x1: cx1, y0: yb - t, y1: yt + t, z0: zc, z1: zc + STD.doorT, mat: "front" });
      x = cx1;
      return;
    }

    /* Where a front can actually go, worked out before anything is built: an
       open niche is open, so the compartments a door covers are the runs
       *between* the open ones — which is what lets one column be a closed base
       with open shelving above it. */
    col.runs = doorRuns(c);

    var y = yb;
    var rawSecs = Array.isArray(c.secs) && c.secs.length ? c.secs : [{ t: "open", h: Math.max(0, yt - yb) }];
    rawSecs.forEach(function (s, si) {
      var sh = Math.max(0, fin(s.h) ? s.h : 0);
      if (si > 0 && cw > 0.001 && sh > 0.001) {
        part({ k: "box", role: "fixedShelf", x0: cx0, x1: cx1, y0: y, y1: y + st, z0: zb, z1: zc - 1.5, mat: "carcass" });
        y += st;
      }
      var cell = { i: si, y0: y, y1: y + sh, ref: s, col: col };
      cell.covered = coveredBy(col.runs, si);
      col.secs.push(cell);
      if (cw > 0.001 && sh > 0.001) {
        fillSection(L, col, cell, s);
      }
      y += sh;
    });
    if (cw > 0.001) {
      buildDoor(L, col, c);
    }
    x = cx1;
  });

  countHardware(L);
  return finish(L);
}

/* --- the corner unit ---

   Two carcass sides facing the neighbouring runs, two backs against the walls,
   pentagon bottom/top/shelves, and one door on the diagonal. Only one column and
   one compartment: a corner unit is a single space, which is the whole point of
   it — you reach past the diagonal into the depth the neighbours cannot use. */
function layoutCorner(L, part) {
  var sp = L.sp,
    it = L.it,
    t = L.t,
    st = L.st || t,
    w = L.w,
    h = L.h,
    d = L.d,
    hw = w / 2,
    hd = d / 2,
    ph = sp.plinth,
    yb = ph + t,
    yt = h - t,
    c = cornerCut(sp, w, d),
    front = c * Math.SQRT2; // the finished door width

  // the two sides that meet the neighbouring runs
  part({ k: "box", role: "side", x0: hw - t, x1: hw, y0: ph, y1: h, z0: -hd, z1: hd - c, mat: "carcass" });
  part({ k: "box", role: "side", x0: -hw, x1: hw - c, y0: ph, y1: h, z0: hd - t, z1: hd, mat: "carcass" });
  // the two backs, against the walls
  if (sp.back > 0) {
    part({ k: "box", role: "back", x0: -hw, x1: hw, y0: ph, y1: h, z0: -hd, z1: -hd + sp.back, mat: "back" });
    part({ k: "box", role: "back", x0: -hw, x1: -hw + sp.back, y0: ph, y1: h, z0: -hd, z1: hd, mat: "back" });
  }
  // bottom and top, cut to the footprint
  ["bottom", "top"].forEach(function (role) {
    var y = role === "bottom" ? yb - t : yt;
    part({ k: "poly", role: role, pts: cornerPoly(sp, w - 0.4, d - 0.4), y0: y, y1: y + t, mat: "carcass", bw: w, bd: d, cut: c });
  });
  if (ph > 0 && sp.plinthType !== "legs") {
    // the plinth follows the diagonal too, or the toe kick would foul the door
    part({ k: "box", role: "plinth", x0: -hw, x1: hw - c * 0.7, y0: 0, y1: ph, z0: hd - STD.toeInset - t, z1: hd - STD.toeInset, mat: "carcass" });
    part({ k: "box", role: "plinth", x0: hw - STD.toeInset - t, x1: hw - STD.toeInset, y0: 0, y1: ph, z0: -hd, z1: hd - c * 0.7, mat: "carcass" });
  }

  if(ph>0 && sp.plinthType==="legs") {
    cornerPoly(sp,w,d).forEach(function(p){
      var len=Math.hypot(p.x,p.z),scale=len>0?Math.max(0,(len-8)/len):0;
      part({k:"cyl",role:"leg",x:p.x*scale,z:p.z*scale,y:ph/2,r:1.8,hgt:ph,mat:"metal"});
    });
  }

  // one column, one compartment, pentagon shelves in it
  var col = { i: 0, x0: -hw + t, x1: hw - t, w: w - 2 * t, ref: sp.cols[0], secs: [], kind: "normal" };
  L.cols.push(col);
  // one compartment behind one diagonal door: a run of exactly one, or none
  var hasDoor = (sp.cols[0].door || {}).t !== "none";
  col.runs = hasDoor ? [{ i0: 0, i1: 0 }] : [];
  var s = sp.cols[0].secs[0] || sec("shelves", yt - yb),
    cell = { i: 0, y0: yb, y1: yt, ref: s, col: col, covered: hasDoor };
  col.secs.push(cell);
  var n = s.n != null ? s.n : Math.max(0, Math.round((yt - yb) / (s.space || STD.shelfSpace)) - 1);
  cell.shelves = n;
  for (var i = 1; i <= n; i++) {
    var sy = yb + ((yt - yb) * i) / (n + 1);
    part({ k: "poly", role: "shelf", pts: cornerPoly(sp, w - 2 * t - 0.6, d - 2 * t - 0.6), y0: sy - st / 2, y1: sy + st / 2, mat: "carcass", bw: w - 2 * t, bd: d - 2 * t, cut: c });
  }

  /* The door, standing on the diagonal: a leaf of `front` wide, turned 45° and
     hinged at one end. Its unit carries both the turn and the swing, so opening
     it rotates about the hinge in the plane of the diagonal. */
  var dr = sp.cols[0].door || { t: "hinged" };
  if (dr.t !== "none") {
    var open = getDoorOpen(sp.open || 0),
      mx = (hw + hw - c) / 2, // the diagonal's midpoint
      mz = (hd - c + hd) / 2,
      hingeLeft = dr.hinge === "L",
      // the hinge end of the diagonal, and the 45° the leaf sits at
      px = hingeLeft ? hw - c : hw,
      pz = hingeLeft ? hd : hd - c,
      /* Closed, the leaf lies along the diagonal, which is +45° from the axis it
         is authored on — for either hinge end, since each is authored running
         away from its own pivot. Opening then carries on in the direction that
         takes the free end out of the cabinet. */
      base = Math.PI / 4,
      swing = open * 1.6 * (hingeLeft ? -1 : 1),
      u = L.unit({ type: "door", px: px, py: 0, pz: pz, rot: "y", ang: base + swing });
    // authored along +x from the pivot, then turned onto the diagonal by the unit
    var lx0 = hingeLeft ? px : px - front,
      lx1 = lx0 + front;
    frontLeaf(L, u, lx0, lx1, ph + sp.gap, h - sp.gap, pz - STD.doorT, pz, "front", "door");
    addHandle(L, ["edge", "gola"].includes(sp.hw.handle) ? (lx0 + lx1) / 2 : hingeLeft ? lx1 - 5 : lx0 + 5, (ph + h) / 2, pz, front, h - ph, "v", u);
    col.doorLeaves = 1;
    col.doorH = h - ph;
    col.hinges = hingeCount(h - ph);
    for (var k2 = 0; k2 < col.hinges; k2++) {
      var hy = ph + 8 + ((h - ph - 16) * k2) / Math.max(1, col.hinges - 1);
      L.part({ k: "cyl", role: "hinge", x: hingeLeft ? lx0 + 2 : lx1 - 2, y: hy, z: pz - 1.5, r: 1.7, hgt: 1.4, rx: Math.PI / 2, mat: "metal", unit: u });
    }
  }
  if (sp.top) part({ k: "poly", role: "worktop", pts: cornerPoly(sp, w + 3, d + 3), y0: h - sp.top, y1: h, mat: "top", bw: w + 3, bd: d + 3, cut: c });
  L.cornerFront = front;
}

export function sectionOpen(s) {
  return !!(s && (s.nodoor || OPEN_SEC[s.t]));
}
function doorRuns(c) {
  var dr = c.door || { t: "none" };
  if (dr.t === "none" || dr.t === "drawer") return [];
  // a sliding leaf runs past everything: it cannot leave a niche uncovered
  if (dr.t === "sliding") return c.secs && c.secs.length ? [{ i0: 0, i1: c.secs.length - 1 }] : [];
  var runs = [],
    cur = null;
  (c.secs || []).forEach(function (s, i) {
    if (sectionOpen(s)) {
      cur = null;
      return;
    }
    if (cur) cur.i1 = i;
    else runs.push((cur = { i0: i, i1: i }));
  });
  return runs;
}
function coveredBy(runs, i) {
  for (var r = 0; r < runs.length; r++) if (i >= runs[r].i0 && i <= runs[r].i1) return true;
  return false;
}

/* --- staged opening progress math ---
   Phase 1 (0.0 -> 0.4): Doors swing/slide open
   Phase 2 (0.4 -> 0.8): Drawers, baskets, pull-outs & hampers extend
   Phase 3 (0.8 -> 1.0): Safes, TV brackets & accessories open */
export function getDoorOpen(rawOpen) {
  var v = Math.max(0, Math.min(1, rawOpen || 0));
  return Math.min(1, v / 0.4);
}

export function getInteriorOpen(rawOpen, behindDoor) {
  var v = Math.max(0, Math.min(1, rawOpen || 0));
  return behindDoor ? Math.max(0, Math.min(1, (v - 0.4) / 0.4)) : Math.min(1, v / 0.8);
}

export function getAccessoryOpen(rawOpen) {
  var v = Math.max(0, Math.min(1, rawOpen || 0));
  return Math.max(0, Math.min(1, (v - 0.8) / 0.2));
}

/* --- what goes inside one compartment --- */
function fillSection(L, col, cell, s) {
  var sp = L.sp,
    t = L.t,
    st = L.st || t,
    x0 = col.x0,
    x1 = col.x1,
    y0 = cell.y0,
    y1 = cell.y1,
    H = y1 - y0,
    zb = L.zb,
    zc = L.zc,
    // whether THIS compartment ends up behind a front, not merely whether the
    // column has one — an open niche in a doored column is still open
    hasDoor = !!cell.covered,
    shelfBack = zb + 1,
    shelfFront = zc - 2;

  function shelfRun(space, tilt) {
    if (x1 - x0 <= 0.4 || H <= 0.001) { cell.shelves = 0; return; }
    var n = s.n != null ? Math.max(0, s.n) : Math.max(0, Math.round(H / (space || sp.space || STD.shelfSpace)) - 1);
    cell.shelves = n;
    if (n === 0) return;
    for (var i = 1; i <= n; i++) {
      var sy = y0 + (H * i) / (n + 1);
      L.part({
        k: "box", role: "shelf", x0: x0 + 0.2, x1: x1 - 0.2, y0: sy - st / 2, y1: sy + st / 2,
        z0: shelfBack, z1: shelfFront, mat: "carcass", tilt: tilt || 0,
      });
    }
  }
  function railAt(y) {
    L.part({
      k: "cyl", role: "rail", x: (x0 + x1) / 2, y: y, z: (zb + zc) / 2 + 4,
      r: 1.5, hgt: x1 - x0 - 1, rz: Math.PI / 2, mat: "rail",
    });
    cell.rails = (cell.rails || 0) + 1;
    // a couple of garments, only where they will actually be seen
    if (!hasDoor || sp.open > 0.25) {
      var n = Math.max(2, Math.floor((x1 - x0) / 14));
      for (var i = 0; i < n; i++) {
        var gx = x0 + 4 + ((x1 - x0 - 8) * i) / Math.max(1, n - 1),
          len = Math.min(y - y0 - 6, 60 + ((i * 13) % 25));
        L.part({
          k: "box", role: "garment", x0: gx - 4.5, x1: gx + 4.5, y0: y - 4 - len, y1: y - 4,
          z0: (zb + zc) / 2 - 2, z1: (zb + zc) / 2 + 10, mat: "garment", tone: i % 5,
        });
      }
    }
  }

  switch (s.t) {
    case "shelves":
      shelfRun(s.space);
      break;
    case "shoe":
      shelfRun(s.space || STD.shoeSpace, -0.22);
      break;
    case "hang":
    case "hangS":
      railAt(y1 - STD.railDrop);
      break;
    case "hang2":
      railAt(y1 - STD.railDrop);
      railAt(y0 + H / 2 - STD.railDrop);
      break;
    case "drawers":
      drawerStack(L, col, cell, s, hasDoor);
      break;
    case "pullout":
      basketStack(L, col, cell, s);
      break;
    case "trouser": {
      var trouserOpen = getInteriorOpen(sp.open || 0, hasDoor);
      var uTrouser = L.unit({ type: "drawer", tx: 0, ty: 0, tz: (zc - zb) * 0.65 * trouserOpen, px: 0, py: 0, pz: 0 });
      for (var i = 0; i < 5; i++) {
        var ty = y1 - 6;
        if (ty < y0 + 4) break;
        L.part({ k: "cyl", role: "rail", x: (x0 + x1) / 2, y: ty, z: zb + 3 + i * Math.max(0, zc - zb - 6) / 4, r: 0.7, hgt: x1 - x0 - 2, rz: Math.PI / 2, mat: "rail", unit: uTrouser });
      }
      cell.trouser = 1;
      break;
    }
    case "laundry": {
      var hamperOpen = getInteriorOpen(sp.open || 0, hasDoor);
      var uHamper = L.unit({ type: "hamper", px: (x0 + x1) / 2, py: y0 + 2, pz: zb + 4, rot: "x", ang: hamperOpen * 0.35, tz: (zc - zb) * 0.15 * hamperOpen });
      L.part({ k: "box", role: "hamper", x0: x0 + 3, x1: x1 - 3, y0: y0 + 2, y1: y1 - 6, z0: zb + 4, z1: zc - 6, mat: "fabric", unit: uHamper });
      cell.hamper = 1;
      break;
    }
    case "safe": {
      var safeOpen = getAccessoryOpen(sp.open || 0);
      var uSafe = L.unit({ type: "door", px: x0 + 2, py: 0, pz: zc - 3, rot: "y", ang: -safeOpen * 1.6 });
      L.part({ k: "box", role: "safe", x0: x0 + 2, x1: x1 - 2, y0: y0 + 2, y1: y1 - 2, z0: zb + 3, z1: zc - 3, mat: "dark" });
      L.part({ k: "box", role: "safeDoor", x0: x0 + 2.5, x1: x1 - 2.5, y0: y0 + 2.5, y1: y1 - 2.5, z0: zc - 3.5, z1: zc - 2.5, mat: "dark", unit: uSafe });
      L.part({ k: "cyl", role: "safeKnob", x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: zc - 2, r: 2.2, hgt: 1.6, rx: Math.PI / 2, mat: "metal", unit: uSafe });
      cell.safe = 1;
      break;
    }
    /* A television niche is a board to hang a screen on, a hole for the cables
       and the screen itself. It used to be a 6 mm dark panel at the back of the
       compartment, which is invisible in a cabinet and told you nothing about
       whether the set you own would fit. */
    case "tv": {
      var nW = x1 - x0,
        nH = y1 - y0,
        // the mounting board: a real panel, so it lands on the cutting list
        pz1 = zb + t;
      L.part({ k: "box", role: "tvPanel", x0: x0 + 0.2, x1: x1 - 0.2, y0: y0 + 0.5, y1: y1 - 0.5, z0: zb, z1: pz1, mat: "carcass" });
      // the cable pass-through, low and to one side, where a bracket never sits
      L.part({ k: "cyl", role: "grommet", x: x0 + Math.min(12, nW * 0.2), y: y0 + Math.min(10, nH * 0.2), z: pz1 - 0.3, r: 3, hgt: 1.2, rx: Math.PI / 2, mat: "dark" });
      cell.grommet = 1;
      // the screen: 16:9, held off the board on its bracket, with a margin all
      // round so it reads as a set in a niche rather than a panel filling it
      var sw = Math.max(0, nW - 8),
        shh = Math.min(nH - 6, (sw * 9) / 16);
      if (sw >= 20 && shh > 12 && nH >= 18 && zc - pz1 >= 5.5) {
        var scx = (x0 + x1) / 2,
          scy = y0 + nH * 0.52,
          sz0 = pz1 + 4;
        L.part({ k: "box", role: "tvBracket", x0: scx - 8, x1: scx + 8, y0: scy - 6, y1: scy + 6, z0: pz1, z1: sz0, mat: "metal" });
        L.part({ k: "box", role: "tvBody", x0: scx - sw / 2, x1: scx + sw / 2, y0: scy - shh / 2, y1: scy + shh / 2, z0: sz0, z1: sz0 + 1.2, mat: "dark" });
        L.part({ k: "box", role: "tvScreen", x0: scx - sw / 2 + 0.8, x1: scx + sw / 2 - 0.8, y0: scy - shh / 2 + 0.8, y1: scy + shh / 2 - 0.8, z0: sz0 + 1.2, z1: sz0 + 1.5, mat: "screen" });
        cell.tvSize = Math.round(Math.sqrt(sw * sw + shh * shh) / 2.54); // the size a shop would quote, in inches
      }
      cell.tv = 1;
      break;
    }
    /* An appliance niche used to emit nothing whatsoever — an empty hole that
       looked identical to an open shelf and told you nothing about whether the
       machine fits. The appliance is not our supply, so it is drawn but never
       costed; what matters is that the hole is the right size and the front of
       the machine, not a cabinet door, closes it. */
    case "appl": {
      var aW = x1 - x0,
        aH = y1 - y0,
        ax0 = x0 + 1,
        ax1 = x1 - 1,
        acx = (x0 + x1) / 2,
        af1 = zc - 1, // the machine's own front sits just inside the carcass line
        af0 = af1 - 2;
      L.part({ k: "box", role: "appliance", x0: ax0, x1: ax1, y0: y0 + 1, y1: y1 - 1, z0: zb + 2, z1: af0, mat: "appliance" });
      L.part({ k: "box", role: "appliance", x0: ax0, x1: ax1, y0: y0 + 1, y1: y1 - 1, z0: af0, z1: af1, mat: "appliance" });
      if (aH >= 72 && aH <= 105 && aW >= 52) {
        // washer / dryer proportions: a porthole and a detergent drawer
        var pr = Math.min(aW, aH) * 0.31;
        L.part({ k: "cyl", role: "applDoor", x: acx, y: y0 + aH * 0.46, z: af1 - 0.2, r: pr, hgt: 1.4, rx: Math.PI / 2, mat: "metal" });
        L.part({ k: "cyl", role: "applGlass", x: acx, y: y0 + aH * 0.46, z: af1 + 0.4, r: pr * 0.78, hgt: 0.8, rx: Math.PI / 2, mat: "glass" });
        L.part({ k: "box", role: "applPanel", x0: ax0 + 2, x1: ax1 - 2, y0: y1 - 9, y1: y1 - 4, z0: af1, z1: af1 + 0.6, mat: "dark" });
      } else {
        // oven / microwave proportions: a glazed door and a full-width handle
        L.part({ k: "box", role: "applGlass", x0: ax0 + 3, x1: ax1 - 3, y0: y0 + aH * 0.22, y1: y1 - aH * 0.3, z0: af1, z1: af1 + 0.5, mat: "glass" });
        L.part({ k: "box", role: "applPanel", x0: ax0 + 2, x1: ax1 - 2, y0: y1 - Math.min(8, aH * 0.2), y1: y1 - 2, z0: af1, z1: af1 + 0.6, mat: "dark" });
        L.part({ k: "cyl", role: "applHandle", x: acx, y: y1 - Math.min(11, aH * 0.26), z: af1 + 2, r: 0.9, hgt: aW - 8, rz: Math.PI / 2, mat: "metal" });
      }
      cell.appl = 1;
      break;
    }
    case "open":
    case "box":
    default:
      break;
  }
  if (sp.hw.led && (s.t === "shelves" || s.t === "hang" || s.t === "hang2" || s.t === "open")) {
    L.part({ k: "box", role: "led", x0: x0 + 2, x1: x1 - 2, y0: y1 - 1.4, y1: y1 - 0.8, z0: zc - 8, z1: zc - 6, mat: "led" });
    cell.led = 1;
  }
}

// Drawer heights: an explicit ratio list, or an even split.
function drawerHeights(s, H, gap) {
  var n = s.n != null ? Math.max(0, s.n) : Math.max(1, Math.round(H / (STD.drawerH + gap))),
    hs = [];
  if (n <= 0 || H <= 0) return hs;
  if (s.heights && s.heights.length === n) {
    var sum = s.heights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var avail = Math.max(0, H - gap * (n - 1));
    s.heights.forEach(function (r) {
      hs.push(sum > 0 ? (avail * r) / sum : 0);
    });
  } else {
    var e = Math.max(0, (H - gap * (n - 1)) / n);
    for (var i = 0; i < n; i++) hs.push(e);
  }
  return hs;
}

function drawerStack(L, col, cell, s, behindDoor) {
  var sp = L.sp,
    gap = sp.gap,
    H = cell.y1 - cell.y0,
    hs = drawerHeights(s, H, gap),
    zc = L.zc,
    inset = behindDoor ? 3 : 0, // internal drawers sit back from the door line
    fz1 = zc - inset,
    fz0 = fz1 - STD.doorT,
    y = cell.y0;
  cell.drawers = [];
  if (hs.length === 0 || col.w <= 0.001 || H <= 0.001) return;
  var drawerOpen = getInteriorOpen(sp.open || 0, behindDoor);
  hs.forEach(function (dh, i) {
    if (dh <= 4 || col.w-gap <= 2 + 2*sp.panel || fz0 <= L.zb + 3 + sp.panel) {
      cell.invalidDrawers = (cell.invalidDrawers || 0) + 1;
      y += dh + gap;
      return;
    }
    var slide = (L.zc - L.zb) * 0.72 * drawerOpen,
      u = L.unit({ type: "drawer", tx: 0, ty: 0, tz: slide, px: 0, py: 0, pz: 0 });
    var dx0 = col.x0 + gap / 2,
      dx1 = col.x1 - gap / 2,
      dy0 = y,
      dy1 = y + dh;
    if (behindDoor)
      L.part({ k: "box", role: "drawerFront", x0: dx0, x1: dx1, y0: dy0, y1: dy1, z0: fz0, z1: fz1, mat: "carcass", unit: u });
    else frontLeaf(L, u, dx0, dx1, dy0, dy1, fz0, fz1, "front", "drawerFront");
    // the box behind the front, so an open drawer is not a floating panel
    var bz1 = fz0,
      bz0 = L.zb + 3,
      bh = Math.min(dh - 3, 16), bt = sp.panel;
    L.part({ k: "box", role: "drawerBox", x0: dx0 + 1, x1: dx0 + 1 + bt, y0: dy0 + 1.5, y1: dy0 + 1.5 + bh, z0: bz0, z1: bz1, mat: "carcass", unit: u });
    L.part({ k: "box", role: "drawerBox", x0: dx1 - 1 - bt, x1: dx1 - 1, y0: dy0 + 1.5, y1: dy0 + 1.5 + bh, z0: bz0, z1: bz1, mat: "carcass", unit: u });
    L.part({ k: "box", role: "drawerBox", x0: dx0 + 1, x1: dx1 - 1, y0: dy0 + 1.5, y1: dy0 + 1.5 + bh, z0: bz0, z1: bz0 + bt, mat: "carcass", unit: u });
    L.part({ k: "box", role: "drawerBottom", x0: dx0 + 1, x1: dx1 - 1, y0: dy0 + 1.5, y1: dy0 + 2.3, z0: bz0, z1: bz1, mat: "back", unit: u });
    if (!behindDoor) addHandle(L, (dx0 + dx1) / 2, dy1 - Math.min(dh / 2, 6), fz1, dx1 - dx0, dh, "h", u);
    cell.drawers.push({ y0: dy0, y1: dy1 });
    y += dh + gap;
  });
}

function basketStack(L, col, cell, s) {
  var n = s.n || Math.max(1, Math.round((cell.y1 - cell.y0) / 24)),
    step = (cell.y1 - cell.y0) / n,
    zc = L.zc;
  var behindDoor = !!cell.covered;
  var basketOpen = getInteriorOpen(L.sp.open || 0, behindDoor);
  cell.baskets = n;
  for (var i = 0; i < n; i++) {
    var by = cell.y0 + i * step + 2,
      u = L.unit({ type: "drawer", tx: 0, ty: 0, tz: (L.zc - L.zb) * 0.7 * basketOpen, px: 0, py: 0, pz: 0 });
    L.part({ k: "box", role: "basket", x0: col.x0 + 2, x1: col.x1 - 2, y0: by, y1: by + 1.2, z0: L.zb + 3, z1: zc - 3, mat: "metal", unit: u });
    [0, 1].forEach(function (e) {
      L.part({
        k: "box", role: "basket", x0: e ? col.x1 - 3.2 : col.x0 + 2, x1: e ? col.x1 - 2 : col.x0 + 3.2,
        y0: by, y1: by + Math.min(14, step - 4), z0: L.zb + 3, z1: zc - 3, mat: "metal", unit: u,
      });
    });
    L.part({ k: "box", role: "basket", x0: col.x0 + 2, x1: col.x1 - 2, y0: by, y1: by + Math.min(14, step - 4), z0: zc - 4.2, z1: zc - 3, mat: "metal", unit: u });
  }
}

/* One door leaf or drawer face, in the chosen front style. Everything is real
   geometry — a shaker front is four rails around a recessed panel, a reeded
   one is a run of battens — so it reads correctly from any angle and the cut
   list gets the pieces that actually have to be made.
   `role` keeps the cutting list honest about what the part is. */
function frontLeaf(L, u, x0, x1, y0, y1, z0, z1, mat, role) {
  var st = mat === "glass" || mat === "mirror" ? "glazed" : L.sp.front || "flat",
    w = x1 - x0,
    h = y1 - y0,
    t = z1 - z0;
  if (w <= 0.01 || h <= 0.01 || t <= 0.001 || !fin(w) || !fin(h) || !fin(t)) return;
  if (role === "door" || role === "drawerFront") {
    L.fronts ||= [];
    L.fronts.push({ unit: u, x0, x1, y0, y1, z0, z1, style: st, role });
  }
  function p(a, b, c, d, e, f, m, r) {
    L.part({ k: "box", role: r || role, x0: a, x1: b, y0: c, y1: d, z0: e, z1: f, mat: m, unit: u });
  }
  if (st === "shaker" || st === "glazed") {
    // stiles and rails around a recessed centre — 7 cm is the usual width
    var r0 = Math.min(7, Math.min(w, h) * 0.22),
      inz = z1 - t * 0.45; // the panel sits back from the face
    p(x0, x0 + r0, y0, y1, z0, z1, "front");
    p(x1 - r0, x1, y0, y1, z0, z1, "front");
    p(x0 + r0, x1 - r0, y0, y0 + r0, z0, z1, "front");
    p(x0 + r0, x1 - r0, y1 - r0, y1, z0, z1, "front");
    p(x0 + r0 - 0.6, x1 - r0 + 0.6, y0 + r0 - 0.6, y1 - r0 + 0.6, z0, inz,
      st === "glazed" ? mat : "front", st === "glazed" ? "glazing" : "doorPanel");
    return;
  }
  if (st === "groove" || st === "slat") {
    // a plain back panel with battens standing proud of it
    var relief = t * 0.55; // deep enough to catch a shadow line
    p(x0, x1, y0, y1, z0, z1 - relief, mat);
    var along = st === "slat" ? w : h,
      pitch = st === "slat" ? 5.5 : 9,
      n = Math.max(1, Math.min(28, Math.round(along / pitch))),
      step = along / n,
      bat = step * 0.72;
    for (var i = 0; i < n; i++) {
      var a0 = (st === "slat" ? x0 : y0) + i * step + (step - bat) / 2;
      if (st === "slat") p(a0, a0 + bat, y0, y1, z1 - relief, z1, mat, "batten");
      else p(x0, x1, a0, a0 + bat, z1 - relief, z1, mat, "batten");
    }
    return;
  }
  p(x0, x1, y0, y1, z0, z1, mat); // flat slab
}

/* --- doors --- */
function buildDoor(L, col, c) {
  var dr = c.door || { t: "none" },
    sp = L.sp,
    gap = sp.gap,
    open = getDoorOpen(sp.open || 0),
    hd = L.d / 2,
    y0 = L.yb - L.t - (sp.plinthType === "none" ? 0 : 0),
    y1 = L.yt + L.t;
  if (col.w <= 0.001 || !fin(col.w) || dr.t === "none" || dr.t === "drawer") return;

  var mat = dr.t === "glass" ? "glass" : dr.t === "mirror" ? "mirror" : "front";
  col.doorMat = mat;

  if (dr.t === "sliding") {
    // Leaves span the whole front and overlap; the back leaf runs in the rear
    // track, so column-by-column they read as one continuous front.
    var lane = col.i % 2, // alternate tracks
      z1 = hd - (lane ? 4.6 : 0.6),
      z0 = z1 - STD.doorT,
      // opening a slider means one leaf travels behind its neighbour — the
      // rear-track leaves stay put, so nothing ever leaves the carcass
      slide = lane ? -open * (col.x1 - col.x0) : 0,
      u = L.unit({ type: "slide", tx: slide, ty: 0, tz: 0, px: 0, py: 0, pz: 0 });
    frontLeaf(L, u, col.x0 - gap, col.x1 + gap, y0 + 2, y1 - 2, z0, z1, mat, "door");
    addHandle(L, col.i % 2 ? col.x0 + 5 : col.x1 - 5, (y0 + y1) / 2, z1, 4, y1 - y0, "v", u);
    if (!L._hasSlidingTracks) {
      L.part({ k: "box", role: "track", x0: -L.w / 2, x1: L.w / 2, y0: y1 - 2, y1: y1, z0: hd - 6, z1: hd, mat: "metal" });
      L.part({ k: "box", role: "track", x0: -L.w / 2, x1: L.w / 2, y0: y0, y1: y0 + 2, z0: hd - 6, z1: hd, mat: "metal" });
      L._hasSlidingTracks = true;
    }
    col.doorLeaves = 1;
    return;
  }

  /* One door per run of covered compartments. The run's own top and bottom set
     the leaf's height, splitting the shelf it stops at, so a closed base and a
     closed top box read as two separate fronts with the niche between them
     genuinely open. */
  var z0d = L.zc,
    z1d = L.zc + STD.doorT,
    runs = col.runs && col.runs.length ? col.runs : [];
  col.doorLeaves = 0;
  col.hinges = 0;
  col.doorH = 0;

  runs.forEach(function (run) {
    var last = col.secs.length - 1,
      ry0 = run.i0 === 0 ? y0 : col.secs[run.i0].y0 - L.t / 2,
      ry1 = run.i1 === last ? y1 : col.secs[run.i1].y1 + L.t / 2,
      rh = ry1 - ry0;
    if (rh < 8) return;
    var leaves = Math.max(1, dr.leaves || (col.w > STD.maxDoor ? 2 : 1)),
      lw = (col.w - gap * (leaves - 1)) / leaves;
    col.doorLeaves += leaves;
    col.doorH = Math.max(col.doorH, rh);

    for (var i = 0; i < leaves; i++) {
      var lx0 = col.x0 + i * (lw + gap),
        lx1 = lx0 + lw,
        // outer edge carries the hinges: a 2-leaf pair opens away from the middle
        hingeLeft = leaves > 1 ? i === 0 : dr.hinge === "L",
        px = hingeLeft ? lx0 : lx1,
        /* Sign: three.js turns +x towards -z for a positive Y rotation, and the
           cabinet's front is +z — so a leaf hinged on its left edge has to swing
           through a NEGATIVE angle to open outwards. Getting this backwards sent
           every door through the back panel and into the wall. */
        ang = open * 1.75 * (hingeLeft ? -1 : 1),
        u2;
      if (dr.t === "folding") {
        foldingLeaf(L, lx0, lx1, ry0 + gap, ry1 - gap, z0d, z1d, mat, hingeLeft, open, gap);
        col.hinges += 2 + hingeCount(rh); // carcass hinges plus the centre knuckles
        continue;
      }
      if (dr.t === "lift") {
        u2 = L.unit({ type: "lift", px: 0, py: ry1, pz: z1d, rot: "x", ang: -open * 1.3 });
      } else {
        u2 = L.unit({ type: "door", px: px, py: 0, pz: z0d, rot: "y", ang: ang });
      }
      frontLeaf(L, u2, lx0, lx1, ry0 + gap, ry1 - gap, z0d, z1d, mat, "door");
      var hx = hingeLeft ? lx1 - 5 : lx0 + 5;
      if (dr.t === "lift") addHandle(L, (lx0 + lx1) / 2, ry0 + 4, z1d, lw, 6, "h", u2);
      else addHandle(L, hx, (ry0 + ry1) / 2, z1d, 5, rh, "v", u2);
      // the hinge cups themselves, visible when the door swings
      var nh = hingeCount(rh, leafWeight(L, { doorMat: mat, doorLeaves: leaves, doorH: rh, w: col.w }));
      col.hinges += nh;
      for (var k = 0; k < nh; k++) {
        var hy = ry0 + 8 + ((rh - 16) * k) / Math.max(1, nh - 1);
        L.part({ k: "cyl", role: "hinge", x: hingeLeft ? lx0 + 2 : lx1 - 2, y: hy, z: z0d - 1.5, r: 1.7, hgt: 1.4, rx: Math.PI / 2, mat: "metal", unit: u2 });
      }
    }
  });
}

export { doorRuns, frontLeaf };
