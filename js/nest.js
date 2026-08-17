// Cut plan and quote — turns cabinets into panels, panels into sheets, and
// sheets into a price.
//
// The costing that already existed prices board per square metre. That is the
// right answer for "roughly what does this cabinet cost" and the wrong answer
// for "what do I have to order": board comes in whole sheets, the saw eats 4 mm
// of it per cut, a grained board may not be turned 90°, and the offcut is paid
// for whether or not the next job can use it. So the real question is a packing
// problem, and this module solves it:
//
//   panelsOf(items)  every board every cabinet needs, at its cut size
//   nest(panels)     those boards laid out on real sheets, guillotine cuts only
//   quote(items)     the sheets, the banding, the ironmongery, the labour, VAT
//
// Nothing here touches the DOM — ui_nest.js draws it. Sizes are centimetres
// (the app's unit) and money is shekels; the drawings and the cut list are
// presented in millimetres, because that is how a joiner reads them.

import {
  layoutCab, hardwareList, cabPrice, cabQuote, boxCount, profileMeters, BOARD_ROLES,
  stockRole, sheetFor, bandLen, isFloat, roleLabelHe, drillPlan,
  cabSummary, famLabel, frontLabel, finishLabel,
} from "./cabinet.js";
import {
  sheetById, bandById, profileById, sheetPrice, bandPPM,
  profilePPM, laborRate, sheetArea, perM2, NEST, SUPPLIERS, offcuts,
} from "./stock.js";

/* ========================= panelisation ========================= */

/* Which way the grain runs on a part, worked out from how the part sits in the
   cabinet: up the panel on anything upright (a side, a divider, a door), along
   the panel on anything flat (a shelf, a top, a worktop). That is ordinary
   cabinetmaking practice, and it is what decides whether the nesting is allowed
   to turn the part 90° on the sheet. */
function panelDims(p) {
  // a corner unit's pentagon board is cut from the rectangle it fits inside, and
  // that rectangle is what has to be nested and paid for
  if (p.k === "poly") return { t: Math.abs(p.y1 - p.y0), gl: p.bw, gw: p.bd, cut: p.cut || 0 };
  var dx = Math.abs(p.x1 - p.x0),
    dy = Math.abs(p.y1 - p.y0),
    dz = Math.abs(p.z1 - p.z0),
    t = Math.min(dx, dy, dz);
  if (t === dz) return { t: dz, gl: dy, gw: dx }; // face-on: door, back, front
  if (t === dy) return { t: dy, gl: dx, gw: dz }; // flat: shelf, top, worktop
  return { t: dx, gl: dy, gw: dz }; // upright: side, divider
}

/* Every board, one entry per physical part — this is the list that gets nested.
   `gl` runs along the grain, `gw` across it; `l`/`w` are the same board sorted
   long-side-first, which is how a cut list is written. */
export function panelsOf(items, opt) {
  opt = opt || {};
  var out = [],
    n = 0,
    /* Part numbers run across the whole order, and identical boards from the
       same cabinet share one — that is what a shop writes on the board and reads
       off the nesting diagram. Keyed the same way the cut list groups, so a row
       in the list and a rectangle on a sheet carry the same number. */
    partNo = {},
    nextNo = 0;
  (items || []).forEach(function (it, ii) {
    if (!it || !it.cab) return;
    var L = layoutCab(it),
      sp = L.sp,
      name = (opt.label && opt.label(it)) || it.name || it.type || "cab",
      tag = (items.length > 1 ? ii + 1 + "· " : "") + name;
    L.parts.forEach(function (p) {
      if ((p.k !== "box" && p.k !== "poly") || BOARD_ROLES.indexOf(p.role) < 0) return;
      var d = panelDims(p),
        srole = stockRole(p.mat),
        sheet = sheetFor(sp, srole, d.t);
      if (!sheet) return;
      var nk = ii + "|" + p.role + "|" + p.mat + "|" + Math.round(d.gl) + "x" + Math.round(d.gw) + "x" + d.t.toFixed(1);
      if (!partNo[nk]) partNo[nk] = ++nextNo;
      out.push({
        id: "p" + ++n,
        no: partNo[nk],
        it: it,
        item: tag,
        itemIx: ii,
        role: p.role,
        mat: p.mat,
        srole: srole,
        sheetId: sheet.id,
        t: +d.t.toFixed(2),
        gl: +d.gl.toFixed(1),
        gw: +d.gw.toFixed(1),
        l: +Math.max(d.gl, d.gw).toFixed(1),
        w: +Math.min(d.gl, d.gw).toFixed(1),
        band: +bandLen(p).toFixed(3),
        bandId: sp.band,
        grain: !!sheet.grain,
      });
    });
  });
  return out;
}

/* ========================= the packer ========================= */

/* A guillotine packer, because a panel saw can only make cuts that run right
   across whatever is in front of it — a nesting that needs an L-shaped cut is
   a nesting nobody can actually produce. Free space is kept as a list of
   rectangles; placing a board splits its rectangle in two along the shorter
   leftover axis, which is the rule that leaves the most useful offcuts.
   Placement itself is best-short-side-fit across every sheet already open.
   Typical yield on real cabinet work: 82-92%. */

function usable(sheet, opt) {
  // the mill's edges are never square or clean, so a strip comes off all round
  return { w: sheet.w - 2 * opt.trim, h: sheet.l - 2 * opt.trim };
}

function newSheet(sheet, opt, i) {
  var u = usable(sheet, opt);
  return { sheet: sheet, i: i, place: [], free: [{ x: opt.trim, y: opt.trim, w: u.w, h: u.h }] };
}

/* The best place this board could go on this sheet, without committing to it —
   so the caller can compare every open sheet and pick the tightest fit anywhere
   rather than the first one that happens to work. */
function findPlace(sh, p, opt) {
  var best = null,
    // across the sheet × along the sheet; the grain runs along `l`
    forms = [[p.gw, p.gl, 0]];
  if (!(opt.grainLock && p.grain)) forms.push([p.gl, p.gw, 1]);
  for (var i = 0; i < sh.free.length; i++) {
    var f = sh.free[i];
    for (var j = 0; j < forms.length; j++) {
      var pw = forms[j][0],
        ph = forms[j][1];
      if (pw > f.w + 1e-6 || ph > f.h + 1e-6) continue;
      var score = Math.min(f.w - pw, f.h - ph); // best short side fit
      if (!best || score < best.score) best = { fi: i, w: pw, h: ph, rot: forms[j][2], score: score };
    }
  }
  return best;
}

function place(sh, p, best, opt) {
  var f2 = sh.free[best.fi],
    k = opt.kerf,
    restW = f2.w - best.w - k,
    restH = f2.h - best.h - k,
    add = [];
  sh.place.push({ p: p, x: f2.x, y: f2.y, w: best.w, h: best.h, rot: best.rot });
  if (f2.w - best.w < f2.h - best.h) {
    // split across first: a full-width strip survives below
    if (restW > 0) add.push({ x: f2.x + best.w + k, y: f2.y, w: restW, h: best.h });
    if (restH > 0) add.push({ x: f2.x, y: f2.y + best.h + k, w: f2.w, h: restH });
  } else {
    if (restW > 0) add.push({ x: f2.x + best.w + k, y: f2.y, w: restW, h: f2.h });
    if (restH > 0) add.push({ x: f2.x, y: f2.y + best.h + k, w: best.w, h: restH });
  }
  sh.free.splice(best.fi, 1);
  add.forEach(function (r) {
    if (r.w >= 1 && r.h >= 1) sh.free.push(r);
  });
  return true;
}

function finishSheet(sh, opt) {
  var used = 0;
  sh.place.forEach(function (q) {
    used += q.w * q.h;
  });
  var area = sh.sheet.l * sh.sheet.w;
  sh.used = used / 10000;
  sh.area = area / 10000;
  sh.eff = area ? used / area : 0;
  // what is left that is worth putting back on the rack
  sh.offcuts = sh.free
    .filter(function (r) {
      return r.w >= opt.minOffcut && r.h >= opt.minOffcut;
    })
    .sort(function (a, b) {
      return b.w * b.h - a.w * a.h;
    })
    .slice(0, 4);
  return sh;
}

/* The orders worth trying: longest side first, biggest area first, and widest
   first (which tends to build clean full-width rows on tall sheets). */
const SORTS = [
  function (a, b) {
    return Math.max(b.gl, b.gw) - Math.max(a.gl, a.gw) || b.gl * b.gw - a.gl * a.gw;
  },
  function (a, b) {
    return b.gl * b.gw - a.gl * a.gw;
  },
  function (a, b) {
    return b.gw - a.gw || b.gl - a.gl;
  },
];

/* A piece off the rack, dressed up as a sheet so the packer needs to know
   nothing about where board comes from. It costs nothing — it is already paid
   for — and it is never trimmed again, because it was trimmed when it was cut. */
function rackSheet(o, sheet, i) {
  return {
    sheet: { id: sheet.id, l: o.l, w: o.w, t: sheet.t, grain: sheet.grain, hand: sheet.hand, he: sheet.he, en: sheet.en, sup: sheet.sup },
    stock: o,
    i: i,
    place: [],
    free: [{ x: 0, y: 0, w: o.w, h: o.l }],
  };
}

function packWith(list, sheet, opt, stock) {
  var sheets = [],
    unplaced = [];
  /* The rack goes first, smallest piece that will do before the big ones, so a
     job eats the awkward leftovers rather than adding to them. */
  (stock || []).forEach(function (o, i) {
    sheets.push(rackSheet(o, sheet, -1 - i));
  });
  list.forEach(function (p) {
    /* Best fit across every sheet already open, not the first one that happens
       to work: the tightest gap anywhere is the one to fill, and leaving the
       loose gaps loose is what keeps a big offcut whole. */
    var bestSh = null,
      bestCand = null;
    sheets.forEach(function (sh) {
      var cand = findPlace(sh, p, opt);
      if (cand && (!bestCand || cand.score < bestCand.score)) {
        bestCand = cand;
        bestSh = sh;
      }
    });
    if (bestCand) return place(bestSh, p, bestCand, opt);
    var fresh = newSheet(sheet, opt, sheets.filter(function (s) { return !s.stock; }).length),
      cand2 = findPlace(fresh, p, opt);
    if (cand2) {
      place(fresh, p, cand2, opt);
      sheets.push(fresh);
      return;
    }
    unplaced.push(p);
  });
  // how much of the last sheet is still whole — the tie-breaker between two
  // nestings that need the same number of sheets: the one that leaves a bigger
  // usable piece behind is the better one to cut
  // an unused rack piece is not part of the plan; drop it before reporting
  sheets = sheets.filter(function (s) {
    return s.place.length;
  });
  var last = sheets[sheets.length - 1],
    lastFree = 0;
  if (last)
    last.free.forEach(function (r) {
      lastFree = Math.max(lastFree, r.w * r.h);
    });
  return {
    sheets: sheets,
    unplaced: unplaced,
    // what has to be BOUGHT — a rack piece is already paid for, so the heuristics
    // are compared on purchases, not on how many pieces of board got used
    bought: sheets.filter(function (s) {
      return !s.stock;
    }).length,
    lastFree: -lastFree,
  };
}

/* Nest a panel list. Panels are grouped by the sheet they are cut from — you
   cannot nest an 18 mm melamine door into a 4 mm back sheet. */
export function nest(panels, opt) {
  opt = Object.assign({}, NEST, opt || {});
  var groups = {},
    order = [],
    unplaced = [],
    cutM = 0,
    slabCutM = 0,
    bandM = 0,
    bandBy = {};

  panels.forEach(function (p) {
    if (!groups[p.sheetId]) {
      groups[p.sheetId] = { sheetId: p.sheetId, sheet: sheetById(p.sheetId), panels: [] };
      order.push(p.sheetId);
    }
    groups[p.sheetId].panels.push(p);
    bandM += p.band;
    if (p.band > 0) bandBy[p.bandId] = (bandBy[p.bandId] || 0) + p.band;
  });

  order.forEach(function (id) {
    var g = groups[id],
      sheet = g.sheet;
    if (!sheet) return;
    var best = null,
      // what the rack already holds in this material, biggest first
      stock = (opt.useStock === false ? [] : offcuts(id)).slice().sort(function (a, b) {
        return b.l * b.w - a.l * a.w;
      });
    /* Decreasing-first is the right family of heuristic but there is no one
       right order within it, and which one wins depends on the parts. Nesting
       software tries several and keeps the best sheet count; so do we — the
       panel counts here are small enough that three passes are free. */
    SORTS.forEach(function (cmp) {
      var r = packWith(g.panels.slice().sort(cmp), sheet, opt, stock);
      if (!best || r.bought < best.bought || (r.bought === best.bought && r.lastFree < best.lastFree)) best = r;
    });
    best.unplaced.forEach(function (p) {
      // bigger than the sheet it was assigned to — say so rather than drop it
      unplaced.push(p);
    });
    best.sheets.forEach(function (sh) {
      finishSheet(sh, opt);
      sh.place.forEach(function (q) {
        var run = (q.w + q.h) / 100; // two cuts free each board
        if (sheet.hand === "slab") slabCutM += run;
        else cutM += run;
      });
    });
    g.sheets = best.sheets;
    // sheets that had to be bought, versus pieces taken off the rack
    g.fromStock = g.sheets.filter(function (s) {
      return s.stock;
    }).length;
    g.count = g.sheets.length - g.fromStock;
    g.area = g.count * sheetArea(sheet);
    g.used = g.sheets.reduce(function (s, x) {
      return s + (x.stock ? 0 : x.used);
    }, 0);
    g.stockUsed = g.sheets.reduce(function (s, x) {
      return s + (x.stock ? x.used : 0);
    }, 0);
    g.eff = g.area ? g.used / g.area : 0;
    /* Whole sheets, unless this is something a supplier cuts to size and
       invoices by the square metre (sprayed fronts, stone, glass) — then the
       offcut is theirs and you pay for the parts plus their own allowance. */
    g.bySqm = !!sheet.bySqm;
    if (g.bySqm) {
      g.unit = perM2(sheet);
      g.billedM2 = g.used * (1 + opt.sqmWaste);
      g.cost = g.billedM2 * g.unit;
    } else {
      g.unit = sheetPrice(sheet);
      g.cost = g.count * g.unit;
    }
    // what is actually paid for, in m² — whole sheets, or the invoiced area
    g.bought = g.bySqm ? g.billedM2 : g.area;
  });

  var gl = order
    .map(function (id) {
      return groups[id];
    })
    .filter(function (g) {
      return g.sheet && g.sheets;
    })
    .sort(function (a, b) {
      return b.cost - a.cost;
    });

  return {
    opt: opt,
    panels: panels,
    groups: gl,
    unplaced: unplaced,
    sheetCount: gl.reduce(function (s, g) {
      return s + g.count;
    }, 0),
    stockCount: gl.reduce(function (s, g) {
      return s + (g.fromStock || 0);
    }, 0),
    // every usable piece this job would leave behind, ready to bank on the rack
    leftovers: gl.reduce(function (acc, g) {
      g.sheets.forEach(function (sh) {
        sh.offcuts.forEach(function (r) {
          acc.push({ sheet: g.sheetId, l: Math.max(r.w, r.h), w: Math.min(r.w, r.h) });
        });
      });
      return acc;
    }, []),
    boardArea: gl.reduce(function (s, g) {
      return s + g.bought;
    }, 0),
    usedArea: gl.reduce(function (s, g) {
      return s + g.used;
    }, 0),
    materialCost: gl.reduce(function (s, g) {
      return s + g.cost;
    }, 0),
    cutM: cutM,
    slabCutM: slabCutM,
    bandM: bandM,
    bandBy: bandBy,
  };
}

/* ========================= the quote ========================= */

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* What a labour line is billed by. Kept here next to the lines themselves so
   the quote panel and the exported CSV say the same thing. */
const UNITS = {
  sheet: ["פלטות", "sheets"], m: ["מ׳", "m"], u: ["יח׳", "u"],
  pair: ["זוגות", "pairs"], hole: ["קידוחים", "holes"], box: ["גופים", "boxes"],
  shelf: ["מדפים", "shelves"], run: ["נסיעה", "run"],
};
export function unitLabel(u, en) {
  var x = UNITS[u];
  return x ? (en ? x[1] : x[0]) : u;
}

/* Merge every cabinet's ironmongery into one order: five cabinets with the same
   soft-close hinge is one line of 34 hinges, not five lines of 6-8. */
function mergeHardware(items) {
  var by = {},
    order = [];
  items.forEach(function (it) {
    if (!it.cab) return;
    hardwareList(it).forEach(function (r) {
      var k = r.label + "@" + r.unit;
      if (!by[k]) {
        by[k] = { label: r.label, unit: r.unit, qty: 0, total: 0 };
        order.push(k);
      }
      by[k].qty += r.qty;
      by[k].total += r.total;
    });
  });
  return order
    .map(function (k) {
      by[k].qty = Math.round(by[k].qty * 10) / 10;
      return by[k];
    })
    .sort(function (a, b) {
      return b.total - a.total;
    });
}

/* The full job price, line by line. `opt.bandWaste` is the allowance a shop
   makes on banding (you always feed a little more than the finished edge);
   `opt.margin`/`opt.vat` come from the price book unless overridden. */
export function quote(items, opt) {
  opt = Object.assign({ bandWaste: 0.1 }, NEST, opt || {});
  var list = (items || []).filter(function (it) {
    return it && it.cab;
  });
  var panels = panelsOf(list, opt),
    res = nest(panels, opt);

  // --- boards ---
  var lines = [],
    material = res.materialCost;
  res.groups.forEach(function (g) {
    lines.push({
      kind: "sheet", id: g.sheetId, sheet: g.sheet, qty: g.count,
      bySqm: g.bySqm, m2: g.billedM2, unit: g.unit, cost: g.cost,
      eff: g.eff, sup: g.sheet.sup,
    });
  });

  // --- edge banding, per type, with the shop's feed allowance ---
  var bandCost = 0,
    bandLines = [];
  Object.keys(res.bandBy).forEach(function (id) {
    var b = bandById(id);
    if (!b) return;
    var m = res.bandBy[id] * (1 + opt.bandWaste),
      cost = m * bandPPM(b);
    bandCost += cost;
    bandLines.push({ kind: "band", id: id, band: b, meters: round2(m), unit: bandPPM(b), cost: cost, sup: b.sup });
  });

  // --- worked stone edges ---
  var profCost = 0,
    profLines = [],
    profBy = {};
  list.forEach(function (it) {
    var sp = it.cab;
    if (!sp.top || !sp.profile || sp.profile === "none") return;
    // the exposed run, not the unit: cabinet.js owns that rule (a unit buried
    // mid-run has no end returns), so ask it rather than keeping a second copy
    profBy[sp.profile] = (profBy[sp.profile] || 0) + profileMeters(it);
  });
  Object.keys(profBy).forEach(function (id) {
    var pr = profileById(id),
      m = profBy[id],
      cost = m * profilePPM(pr);
    profCost += cost;
    profLines.push({ kind: "profile", id: id, profile: pr, meters: round2(m), unit: profilePPM(pr), cost: cost });
  });

  // --- ironmongery ---
  var hw = mergeHardware(list),
    hwCost = hw.reduce(function (s, r) {
      return s + r.total;
    }, 0);

  // --- labour, measured rather than guessed ---
  var bores = 0,
    slides = 0,
    pins = 0,
    boxes = 0,
    floatShelves = 0;
  list.forEach(function (it) {
    var L = layoutCab(it),
      c = L.hw;
    bores += c.hinges || 0;
    slides += c.slides || 0;
    pins += c.pins || 0;
    if (isFloat(L.sp)) floatShelves += c.floatShelves || 0;
    else boxes += boxCount(it, L);
  });
  var lab = [];
  function labLine(key, he, en, qty, unit) {
    if (qty <= 0) return;
    var rate = laborRate(key);
    lab.push({ key: key, he: he, en: en, qty: Math.round(qty * 10) / 10, unit: unit, rate: rate, cost: qty * rate });
  }
  labLine("sheetHandle", "טיפול בפלטות", "Sheet handling", res.sheetCount, "sheet");
  labLine("cutPerM", "ניסור", "Sawing", res.cutM, "m");
  labLine("slabCutPerM", "ניסור אבן", "Stone cutting", res.slabCutM, "m");
  labLine("bandPerM", "הדבקת קנטים", "Edge banding", res.bandM * (1 + opt.bandWaste), "m");
  labLine("hingeBore", "קידוח צירים", "Hinge boring", bores, "u");
  labLine("slideFit", "הרכבת מסילות", "Runner fitting", slides, "pair");
  labLine("shelfBore", "קידוח פינים", "Shelf-pin boring", pins, "hole");
  labLine("assemblyPerUnit", "הרכבת גוף", "Carcass assembly", boxes, "box");
  labLine("fitPerUnit", "התקנה באתר", "On-site fitting", boxes, "box");
  labLine("fitPerShelf", "התקנת מדף צף", "Floating shelf fitting", floatShelves, "shelf");
  labLine("delivery", "הובלה", "Delivery", list.length ? 1 : 0, "run");
  var laborCost = lab.reduce(function (s, r) {
    return s + r.cost;
  }, 0);

  var net = material + bandCost + profCost + hwCost + laborCost,
    marginRate = opt.marginRate != null ? opt.marginRate : laborRate("margin"),
    vatRate = opt.vatRate != null ? opt.vatRate : laborRate("vat"),
    margin = net * marginRate,
    sub = net + margin,
    vat = sub * vatRate;

  return {
    items: list,
    nest: res,
    panelCount: panels.length,
    sheets: lines,
    material: material,
    bandLines: bandLines,
    bandM: round2(res.bandM), // finished edge
    bandBilledM: round2(res.bandM * (1 + opt.bandWaste)), // what is fed through the machine
    band: bandCost,
    profileLines: profLines,
    profile: profCost,
    hardware: hw,
    hardwareCost: hwCost,
    labor: lab,
    laborCost: laborCost,
    net: net,
    marginRate: marginRate,
    margin: margin,
    subtotal: sub,
    vatRate: vatRate,
    vat: vat,
    total: sub + vat,
    /* For comparison with the per-unit estimate in the cost panel. That
       estimate prices board pro-rata with a fixed offcut allowance; this one
       counts whole sheets. `estimateMaterial` is the pro-rata board figure, so
       the two can be set against each other and the difference attributed to
       the nesting rather than to VAT or delivery, which the estimate has no
       notion of. */
    estimate: list.reduce(function (s, it) {
      return s + cabPrice(it);
    }, 0),
    estimateMaterial: list.reduce(function (s, it) {
      return s + cabQuote(it).material;
    }, 0),
    waste: res.boardArea - res.usedArea,
    yield: res.boardArea ? res.usedArea / res.boardArea : 0,
    leadDays: leadTime(lines, bandLines),
  };
}

/* The longest lead time in the order — a quote has to say when, not just how
   much, and one slab yard at seven days sets the date for everything. */
function leadTime(sheetLines, bandLines) {
  var d = 0;
  sheetLines.concat(bandLines).forEach(function (l) {
    var s = l.sheet || l.band,
      sup = s && SUPPLIERS[s.sup];
    if (sup) d = Math.max(d, sup.lead || 0);
  });
  return d;
}

/* Who has to be ordered from, and how long each of them takes. `what` carries
   the catalogue entries themselves, not their names, so the caller labels them
   in whatever language it is showing. */
export function supplierPlan(q) {
  var by = {},
    order = [];
  function add(supId, entry, cost) {
    if (!supId) return;
    if (!by[supId]) {
      by[supId] = { sup: supId, lead: (SUPPLIERS[supId] || {}).lead || 0, cost: 0, what: [] };
      order.push(supId);
    }
    by[supId].cost += cost;
    if (by[supId].what.indexOf(entry) < 0) by[supId].what.push(entry);
  }
  q.sheets.forEach(function (l) {
    add(l.sheet.sup, l.sheet, l.cost);
  });
  q.bandLines.forEach(function (l) {
    add(l.band.sup, l.band, l.cost);
  });
  return order
    .map(function (k) {
      return by[k];
    })
    .sort(function (a, b) {
      return b.lead - a.lead || b.cost - a.cost;
    });
}

/* ========================= exports ========================= */

function mm(cm) {
  return Math.round(cm * 10);
}

/* The cut list a workshop actually cuts from: one line per board, in mm, with
   its banding and which sheet number it comes off. */
export function cutCSV(q, en) {
  var rows = [
    en
      ? ["Part #", "Sheet material", "Sheet #", "Part", "Item", "Length (mm)", "Width (mm)", "Thk (mm)", "Grain locked", "Banding (m)", "X (mm)", "Y (mm)", "Rotated"]
      : ["מס׳ חלק", "חומר", "פלטה", "חלק", "פריט", 'אורך (מ"מ)', 'רוחב (מ"מ)', 'עובי (מ"מ)', "כיוון סיב", "קנט (מ׳)", 'X (מ"מ)', 'Y (מ"מ)', "מסובב"],
  ];
  q.nest.groups.forEach(function (g) {
    g.sheets.forEach(function (sh) {
      sh.place
        .slice()
        .sort(function (a, b) {
          return a.y - b.y || a.x - b.x;
        })
        .forEach(function (pl) {
          var p = pl.p;
          rows.push([
            p.no,
            en ? g.sheet.en : g.sheet.he,
            sh.i + 1,
            en ? p.role : roleLabelHe(p.role),
            p.item,
            mm(p.l), mm(p.w), mm(p.t),
            p.grain ? (en ? "yes" : "כן") : "",
            p.band ? p.band.toFixed(2) : "",
            mm(pl.x), mm(pl.y),
            pl.rot ? (en ? "yes" : "כן") : "",
          ]);
        });
    });
  });
  rows.push([]);
  rows.push([en ? "QUOTE" : "הצעת מחיר"]);
  q.sheets.forEach(function (l) {
    rows.push(["", en ? l.sheet.en : l.sheet.he, l.qty, "", "", "", "", "", "", "", "", "", Math.round(l.cost)]);
  });
  q.bandLines.forEach(function (l) {
    rows.push(["", en ? l.band.en : l.band.he, l.meters + " m", "", "", "", "", "", "", "", "", "", Math.round(l.cost)]);
  });
  q.profileLines.forEach(function (l) {
    rows.push(["", en ? l.profile.en : l.profile.he, l.meters + " m", "", "", "", "", "", "", "", "", "", Math.round(l.cost)]);
  });
  q.hardware.forEach(function (r) {
    rows.push(["", r.label, r.qty, "", "", "", "", "", "", "", "", "", Math.round(r.total)]);
  });
  q.labor.forEach(function (r) {
    rows.push(["", en ? r.en : r.he, r.qty + " " + unitLabel(r.unit, en), "", "", "", "", "", "", "", "", "", Math.round(r.cost)]);
  });
  rows.push(["", en ? "Margin" : "רווח קבלני", Math.round(q.marginRate * 100) + "%", "", "", "", "", "", "", "", "", "", Math.round(q.margin)]);
  rows.push(["", en ? "VAT" : 'מע"מ', Math.round(q.vatRate * 100) + "%", "", "", "", "", "", "", "", "", "", Math.round(q.vat)]);
  rows.push(["", en ? "TOTAL" : 'סה"כ', "", "", "", "", "", "", "", "", "", "", Math.round(q.total)]);
  return rows
    .map(function (r) {
      return r
        .map(function (c) {
          return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
        })
        .join(",");
    })
    .join("\r\n");
}

/* The document that goes to the customer.

   Deliberately NOT the internal breakdown: a client is quoted units, sizes,
   finishes, what is included, when it arrives and what it costs. Sheet counts,
   yields, saw metres and the shop's margin are nobody's business but the shop's,
   and putting them in front of a customer invites a negotiation about the wrong
   thing. The real total is allocated across the units by their share of it, so
   the lines add up to the figure the shop actually calculated.

   Self-contained HTML with print styles: openable, printable, saveable as PDF,
   with no dependency on this app being around. */
export function quoteHTML(q, opt) {
  opt = opt || {};
  var en = !!opt.en,
    dir = en ? "ltr" : "rtl",
    L = function (h, e) {
      return en ? e : h;
    },
    esc = function (s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    },
    ils = function (n) {
      return "₪" + Math.round(n).toLocaleString("en-US");
    };

  // each unit's share of the real quote, so the lines sum to the total
  var shares = q.items.map(function (it) {
      return Math.max(1, cabQuote(it).total);
    }),
    sum = shares.reduce(function (a, b) {
      return a + b;
    }, 0),
    rows = q.items
      .map(function (it, i) {
        var sp = it.cab,
          price = (q.subtotal * shares[i]) / sum;
        return (
          "<tr><td>" + (i + 1) + "</td>" +
          "<td><b>" + esc(famLabel(sp.fam)) + "</b><div class=sub>" + esc(cabSummary(it)) + "</div></td>" +
          "<td class=n>" + Math.round(it.w) + " × " + Math.round(it.d) + " × " + Math.round(it.h) + "</td>" +
          "<td>" + esc(frontLabel(sp.front)) + "<div class=sub>" + esc(finishLabel(sp.finFront)) + "</div></td>" +
          "<td class=n>" + ils(price) + "</td></tr>"
        );
      })
      .join("");

  var incl = en
      ? ["Design and shop drawings", "Board, edge banding and worked edges", "Soft-close ironmongery as specified", "Assembly in the workshop", "Delivery and installation on site", "Removal of packaging"]
      : ["תכנון ושרטוטי ייצור", "לוחות, קנטים ועיבודי קצה", "פרזול בלימה לפי המפרט", "הרכבה בבית המלאכה", "הובלה והתקנה באתר", "פינוי אריזות"],
    excl = en
      ? ["Appliances, sinks, taps and the television", "Electrical, plumbing and gas work", "Wall preparation, plaster and paint", "Anything not listed above"]
      : ["מוצרי חשמל, כיורים, ברזים וטלוויזיה", "עבודות חשמל, אינסטלציה וגז", "הכשרת קירות, שפכטל וצבע", "כל דבר שאינו מפורט לעיל"];

  var imgs = (opt.images || [])
    .map(function (src) {
      return '<img src="' + src + '" alt="">';
    })
    .join("");

  return (
    '<!doctype html><html lang="' + (en ? "en" : "he") + '" dir="' + dir + '"><meta charset="utf-8">' +
    "<title>" + esc(opt.title || L("הצעת מחיר", "Quotation")) + "</title>" +
    "<style>" +
    "*{box-sizing:border-box}body{margin:0;padding:28px;font:14px/1.55 'Inter','Rubik',system-ui,sans-serif;color:#1b1f24;background:#fff}" +
    ".wrap{max-width:820px;margin:0 auto}" +
    "header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #1b1f24;padding-bottom:14px}" +
    "h1{margin:0;font-size:26px;letter-spacing:-.02em}h2{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:#6b7280;margin:26px 0 8px}" +
    ".meta{font-size:12px;color:#6b7280;text-align:" + (en ? "right" : "left") + "}" +
    "table{width:100%;border-collapse:collapse;margin-top:6px}" +
    "th{text-align:" + (en ? "left" : "right") + ";font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #d7dbe0;padding:6px 8px}" +
    "td{padding:9px 8px;border-bottom:1px solid #eef0f2;vertical-align:top}" +
    "td.n,th.n{text-align:" + (en ? "right" : "left") + ";white-space:nowrap;font-variant-numeric:tabular-nums;direction:ltr}" +
    ".sub{font-size:11.5px;color:#6b7280;margin-top:2px}" +
    ".tot{margin-top:14px;margin-inline-start:auto;width:min(340px,100%)}" +
    ".tot div{display:flex;justify-content:space-between;padding:5px 8px}" +
    ".tot .big{border-top:2px solid #1b1f24;margin-top:6px;padding-top:9px;font-weight:700;font-size:19px}" +
    ".cols{display:flex;gap:26px;flex-wrap:wrap}.cols>div{flex:1;min-width:230px}" +
    "ul{margin:0;padding-inline-start:18px}li{margin:3px 0;font-size:13px}" +
    ".terms{font-size:12px;color:#4b5563;border-top:1px solid #d7dbe0;margin-top:26px;padding-top:12px}" +
    "img{max-width:100%;border:1px solid #d7dbe0;border-radius:6px;margin-top:10px}" +
    "@media print{body{padding:0}.noprint{display:none}}" +
    "</style><div class=wrap>" +
    "<header><div><h1>" + esc(opt.title || L("הצעת מחיר", "Quotation")) + "</h1>" +
    "<div class=sub>" + esc(opt.shop || L("נגרות ומטבחים", "Joinery & kitchens")) + "</div></div>" +
    "<div class=meta>" +
    (opt.client ? L("לכבוד: ", "For: ") + esc(opt.client) + "<br>" : "") +
    (opt.date ? esc(opt.date) + "<br>" : "") +
    (opt.ref ? L("סימוכין: ", "Ref: ") + esc(opt.ref) : "") +
    "</div></header>" +
    "<h2>" + L("הפריטים", "Items") + "</h2><table><thead><tr><th>#</th><th>" + L("פריט", "Item") +
    "</th><th class=n>" + L('רוחב × עומק × גובה (ס"מ)', "W × D × H (cm)") + "</th><th>" + L("חזית וגימור", "Front & finish") +
    "</th><th class=n>" + L("מחיר", "Price") + "</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    '<div class=tot><div><span>' + L("סה״כ לפני מע״מ", "Subtotal") + "</span><span>" + ils(q.subtotal) + "</span></div>" +
    "<div><span>" + L('מע"מ', "VAT") + " " + Math.round(q.vatRate * 100) + "%</span><span>" + ils(q.vat) + "</span></div>" +
    '<div class=big><span>' + L('סה"כ לתשלום', "Total") + "</span><span>" + ils(q.total) + "</span></div></div>" +
    "<h2>" + L("מה כלול", "Scope") + '</h2><div class=cols><div><b>' + L("כולל", "Included") + "</b><ul>" +
    incl.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div>" +
    "<div><b>" + L("לא כולל", "Not included") + "</b><ul>" +
    excl.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div></div>" +
    (imgs ? "<h2>" + L("שרטוטים", "Drawings") + "</h2>" + imgs : "") +
    "<div class=terms>" +
    "<b>" + L("זמן אספקה", "Lead time") + ":</b> " +
    L("כ-" + (q.leadDays + 14) + " ימי עסקים ממועד אישור התכנון והמידות באתר.",
      "About " + (q.leadDays + 14) + " working days from approval of the design and a site survey.") +
    "<br><b>" + L("תשלומים", "Payment") + ":</b> " +
    L("50% במועד ההזמנה, 40% לפני הובלה, 10% בגמר ההתקנה.",
      "50% on order, 40% before delivery, 10% on completion.") +
    "<br><b>" + L("תוקף ההצעה", "Validity") + ":</b> " + L("14 יום.", "14 days.") +
    "<br><b>" + L("הערות", "Notes") + ":</b> " +
    L("המידות באחריות המזמין עד לביצוע מדידה באתר. גוני עץ טבעי עשויים להשתנות בין מקבצים.",
      "Dimensions are subject to a site survey. Natural timber tones vary between batches.") +
    "</div></div></html>"
  );
}

/* One purchase order per supplier — because that is how the material is bought.
   A shop does not send "the job" to anybody; it sends the boards to the board
   merchant and the banding to whoever stocks it. Returns [{sup, name, csv}]. */
export function purchaseOrders(q, en) {
  var by = {};
  function push(supId, row) {
    if (!supId) return;
    (by[supId] = by[supId] || []).push(row);
  }
  q.sheets.forEach(function (l) {
    push(l.sheet.sup, [
      en ? l.sheet.en : l.sheet.he,
      l.bySqm ? l.m2.toFixed(2) + " m²" : l.qty,
      l.bySqm ? (en ? "cut to size" : "נמדד וחתוך") : mm(l.sheet.l) + "×" + mm(l.sheet.w) + "×" + mm(l.sheet.t),
      Math.round(l.unit),
      Math.round(l.cost),
    ]);
  });
  q.bandLines.forEach(function (l) {
    push(l.band.sup, [en ? l.band.en : l.band.he, l.meters.toFixed(1) + " m", mm(l.band.t) + " mm", l.unit, Math.round(l.cost)]);
  });
  return Object.keys(by).map(function (supId) {
    var sup = SUPPLIERS[supId] || {},
      rows = [
        [en ? "PURCHASE ORDER" : "הזמנת רכש", en ? sup.en : sup.he, (en ? sup.cityEn : sup.city) || "", sup.site || "", (sup.lead || 0) + (en ? " days" : " ימים")],
        [],
        en ? ["Item", "Qty", "Size", "Unit (ILS)", "Total (ILS)"] : ["פריט", "כמות", "מידה", "מחיר יח׳", 'סה"כ'],
      ].concat(by[supId]);
    var total = by[supId].reduce(function (s, r) {
      return s + (+r[4] || 0);
    }, 0);
    rows.push([]);
    rows.push([en ? "TOTAL (ex VAT)" : 'סה"כ (ללא מע"מ)', "", "", "", Math.round(total)]);
    return {
      sup: supId,
      name: en ? sup.en : sup.he,
      total: total,
      csv: rows
        .map(function (r) {
          return r
            .map(function (c) {
              return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
            })
            .join(",");
        })
        .join("\r\n"),
    };
  });
}

/* Every hole in the job, one row each: the format a CNC operator or a boring
   machine's setup sheet actually wants. Positions are millimetres in the
   panel's own frame and the datum is stated per panel, because "37 mm in" means
   nothing until you know from which corner. */
export function drillCSV(items, en) {
  var rows = [
    en
      ? ["Item", "Panel", "Datum", "Panel L (mm)", "Panel W (mm)", "X (mm)", "Y (mm)", "Dia (mm)", "Depth (mm)", "Purpose"]
      : ["פריט", "לוח", "נקודת אפס", 'אורך (מ"מ)', 'רוחב (מ"מ)', 'X (מ"מ)', 'Y (מ"מ)', 'קוטר (מ"מ)', 'עומק (מ"מ)', "ייעוד"],
  ];
  var KIND = {
    pin: ["פין למדף", "shelf pin"], plate: ["פלטת ציר", "hinge plate"],
    cup: ["קדח ציר", "hinge cup"], runner: ["מסילה", "runner"], handle: ["ידית", "handle"],
  };
  (items || []).forEach(function (it, ii) {
    if (!it || !it.cab) return;
    drillPlan(it).forEach(function (e) {
      e.holes.forEach(function (h) {
        var k = KIND[h.kind] || [h.kind, h.kind];
        rows.push([
          ii + 1, en ? e.role : roleLabelHe(e.role), e.datum, e.l, e.w,
          h.x, h.y, h.d, h.depth || "", en ? k[1] : k[0],
        ]);
      });
    });
  });
  return rows
    .map(function (r) {
      return r
        .map(function (c) {
          return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
        })
        .join(",");
    })
    .join("\r\n");
}

/* The nesting as DXF, in mm, for a CNC nesting table or just to hand to
   somebody with a CAD seat: one outline per sheet on layer SHEET, one per part
   on layer PART, the part number as text inside it — and, laid out beneath the
   sheets, a drilling detail per panel pattern on layer DRILL. The holes are
   drawn as their own details rather than inside the nested parts because a hole
   position is stated from the panel's datum, and a nested part may have been
   turned 90° on the sheet; a detail cannot be misread that way. */
export function nestDXF(q) {
  var out = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  function line(x1, y1, x2, y2, layer) {
    out.push("0", "LINE", "8", layer, "10", String(x1), "20", String(y1), "30", "0.0", "11", String(x2), "21", String(y2), "31", "0.0");
  }
  function rect(x, y, w, h, layer) {
    line(x, y, x + w, y, layer);
    line(x + w, y, x + w, y + h, layer);
    line(x + w, y + h, x, y + h, layer);
    line(x, y + h, x, y, layer);
  }
  function text(x, y, h, s, layer) {
    out.push("0", "TEXT", "8", layer, "10", String(x), "20", String(y), "30", "0.0", "40", String(h), "1", String(s).replace(/[\r\n]/g, " "));
  }
  function circle(x, y, r, layer) {
    out.push("0", "CIRCLE", "8", layer, "10", String(x), "20", String(y), "30", "0.0", "40", String(r));
  }
  var ox = 0,
    lowest = 0;
  q.nest.groups.forEach(function (g) {
    g.sheets.forEach(function (sh) {
      var SW = mm(g.sheet.w),
        SL = mm(g.sheet.l);
      rect(ox, 0, SW, SL, "SHEET");
      text(ox + 20, SL + 40, 60, (g.sheet.en || g.sheetId) + " #" + (sh.i + 1) + " — " + Math.round(sh.eff * 100) + "%", "LABEL");
      sh.place.forEach(function (pl) {
        var x = ox + mm(pl.x),
          y = mm(pl.y),
          w = mm(pl.w),
          h = mm(pl.h);
        rect(x, y, w, h, "PART");
        if (w > 220 && h > 90) {
          text(x + 20, y + h / 2 + 10, 40, "#" + pl.p.no + " " + pl.p.role, "PART_TEXT");
          text(x + 20, y + h / 2 - 40, 26, mm(pl.p.l) + "x" + mm(pl.p.w) + "  " + pl.p.item, "PART_TEXT");
        } else if (w > 90 && h > 40) {
          text(x + 10, y + h / 2, 30, "#" + pl.p.no, "PART_TEXT");
        }
      });
      sh.offcuts.forEach(function (r) {
        rect(ox + mm(r.x), mm(r.y), mm(r.w), mm(r.h), "OFFCUT");
      });
      ox += SW + 200;
      lowest = Math.min(lowest, 0);
    });
  });

  /* The drilling details, in a row below the sheets: each distinct panel pattern
     drawn flat with its holes, its datum corner marked and its sizes on it. */
  var dy = -1200,
    dx = 0;
  (q.items || []).forEach(function (it, ii) {
    drillPlan(it).forEach(function (e) {
      rect(dx, dy - e.w, e.l, e.w, "DRILL");
      // the datum corner, so nobody drills the pattern mirrored
      line(dx, dy - e.w, dx + 120, dy - e.w, "DRILL_DATUM");
      line(dx, dy - e.w, dx, dy - e.w + 120, "DRILL_DATUM");
      text(dx, dy + 60, 44, (ii + 1) + "· " + e.role + "  " + e.l + "x" + e.w + "  (" + e.datum + ")", "DRILL_TEXT");
      e.holes.forEach(function (h) {
        circle(dx + h.x, dy - e.w + h.y, h.d / 2, "DRILL");
      });
      dx += e.l + 300;
    });
  });

  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n");
}
