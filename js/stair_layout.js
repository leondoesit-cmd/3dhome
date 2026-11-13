/* Stair layout: the one source of truth for a staircase's plan and steps.

   Pure (no THREE, no DOM): the 3D builder (js/stair_model.js), the plan
   symbol (js/plan_symbols.js) and the code check (js/code_check_plan.js) all
   read the same numbers from here, so the drawing, the model and the check
   can never disagree about how many steps there are or how deep they are.

   Two kinds of stair:
   - DESIGNED: it.configuration.stair =
       { v: 1, width, going, runs: [n0, n1, ...], turns: ["L"|"R"|"S", ...],
         turnType: "landing"|"winder", autoSteps, autoRise }
     The flight starts at the item's front (+z) heading -z. Run i is runs[i]
     treads of depth `going`; between runs a turn: "L"/"R" a quarter turn (a
     width x width square), "S" a straight intermediate landing (always flat).
     A 0-tread run between two turns merges them into one level landing — a
     U stair is runs [a, 0, b], turns [X, X]. Risers are all equal (rise / N,
     N = every block: treads, landings, winders) and goings are equal on every
     run by construction. The footprint is derived from the path.
   - LEGACY: no configuration.stair (or the "curved" variant). The shapes the
     catalogue drew before stairs could be designed — straight / L / U /
     curved — with exactly the arithmetic they always had.

   Item-local frame, cm: x right, z toward the front (+), y up. Every step's
   top is (k + 1) * riser: n blocks fill the footprint and the top block is
   flush with the floor above. */

var TAN30 = Math.tan(Math.PI / 6);
export var STAIR_FALLBACK_RULES = { maxRiser: 17.5, minTread: 26 };
var RAIL_INSET = 3;

function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function P(x, z) { return { x: x, z: z }; }
function add(a, b) { return P(a.x + b.x, a.z + b.z); }
function mul(a, k) { return P(a.x * k, a.z * k); }
function leftOf(d) { return P(d.z, -d.x); } // walking toward d, your left hand
function area(poly) {
  var a = 0;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].z - poly[i].x * poly[j].z;
  return a / 2;
}
// every polygon wound the same way (positive signed area in x/z)
function wind(poly) { return area(poly) < 0 ? poly.slice().reverse() : poly; }
function rectPoly(x0, x1, z0, z1) { return wind([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]); }

/* ---------------- designed model ---------------- */

export function normalizeStair(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  var runs = (Array.isArray(cfg.runs) ? cfg.runs : []).map(function (n) { return Math.max(0, Math.round(num(n, 0))); });
  if (!runs.length) runs = [Math.max(1, Math.round(num(cfg.steps, 14)))];
  runs = runs.slice(0, 12);
  if (runs[0] < 1) runs[0] = 1;
  if (runs[runs.length - 1] < 1) runs[runs.length - 1] = 1;
  var turns = [];
  for (var i = 0; i < runs.length - 1; i++) {
    var t = cfg.turns && cfg.turns[i];
    turns.push(t === "L" || t === "R" || t === "S" ? t : "R");
  }
  return {
    v: 1,
    width: clamp(num(cfg.width, 90), 50, 400),
    going: clamp(num(cfg.going, 28), 15, 60),
    runs: runs,
    turns: turns,
    turnType: cfg.turnType === "winder" ? "winder" : "landing",
    autoSteps: cfg.autoSteps !== false,
    autoRise: !!cfg.autoRise,
  };
}

/* One quarter turn ("L"/"R") or straight landing ("S") entered at edge centre
   p heading d: its square, where the path leaves it, and (for a quarter
   turn) the three winder wedges fanning from the inner corner. */
function turnCell(p, d, W, t) {
  var L = leftOf(d);
  if (t === "S") {
    var a = add(p, mul(L, W / 2)), b = add(p, mul(L, -W / 2));
    return {
      t: t, poly: wind([a, b, add(b, mul(d, W)), add(a, mul(d, W))]),
      exitP: add(p, mul(d, W)), exitD: d, centre: add(p, mul(d, W / 2)),
    };
  }
  var side = t === "L" ? L : mul(L, -1);
  var inner = add(p, mul(side, W / 2)), outerEntry = add(p, mul(side, -W / 2));
  var outerFar = add(outerEntry, mul(d, W)), innerFar = add(inner, mul(d, W));
  var p1 = add(outerEntry, mul(d, W * TAN30)), p2 = add(innerFar, mul(side, -W * TAN30));
  return {
    t: t, poly: wind([inner, outerEntry, outerFar, innerFar]),
    wedges: [wind([inner, outerEntry, p1]), wind([inner, p1, outerFar, p2]), wind([inner, p2, innerFar])],
    inner: inner, exitP: add(add(p, mul(d, W / 2)), mul(side, W / 2)), exitD: side,
    centre: add(p, mul(d, W / 2)),
  };
}

/* The outline of a union of polygons that meet edge to edge: the edges no
   two polygons share, chained into one loop (collinear joints kept, so a
   neighbour's edge still matches it exactly). */
function key(p) { return Math.round(p.x * 1000) + "," + Math.round(p.z * 1000); }
function looseEdges(polys) {
  var edges = [], count = new Map();
  polys.forEach(function (poly) {
    poly.forEach(function (a, i) {
      var b = poly[(i + 1) % poly.length], k1 = key(a) + "|" + key(b), k2 = key(b) + "|" + key(a);
      edges.push({ a: a, b: b, k: k1 < k2 ? k1 : k2 });
      count.set(k1 < k2 ? k1 : k2, (count.get(k1 < k2 ? k1 : k2) || 0) + 1);
    });
  });
  return { all: edges, loose: edges.filter(function (e) { return count.get(e.k) === 1; }) };
}
function unionLoop(polys) {
  var loose = looseEdges(polys.map(wind)).loose;
  if (!loose.length) return polys[0];
  var from = new Map();
  loose.forEach(function (e) { from.set(key(e.a), e); });
  var out = [], e = loose[0];
  for (var guard = 0; guard < loose.length && e; guard++) {
    out.push(e.a);
    e = from.get(key(e.b));
    if (e === loose[0]) break;
  }
  return wind(out);
}

/* Lay the designed path out (unshifted: starts at the origin heading -z).
   Returns blocks in walking order with their kind, polygon and k, plus the
   walking line, the outer handrail line and the flights. */
function buildDesigned(c) {
  var W = c.width, G = c.going, p = P(0, 0), d = P(0, -1);
  var segs = [];
  // first pass: geometry of every run and turn cell, in order
  c.runs.forEach(function (n, i) {
    var treads = [], start = p, dir = d;
    for (var s = 0; s < n; s++) {
      var L = leftOf(d), a = add(p, mul(d, s * G)), b = add(p, mul(d, (s + 1) * G));
      treads.push(wind([add(a, mul(L, W / 2)), add(a, mul(L, -W / 2)), add(b, mul(L, -W / 2)), add(b, mul(L, W / 2))]));
    }
    p = add(p, mul(d, n * G));
    segs.push({ run: i, n: n, treads: treads, start: start, end: p, d: dir });
    if (i < c.turns.length) {
      var cell = turnCell(p, d, W, c.turns[i]);
      segs.push({ turn: i, cell: cell, entry: p, d: d });
      p = cell.exitP;
      d = cell.exitD;
    }
  });
  // second pass: number the blocks. Turn cells joined by a 0-tread run are one
  // landing group: one level landing, or each quarter cell's wedges in turn.
  var blocks = [], flights = [], k = 0, groups = [], cur = null;
  segs.forEach(function (sg) {
    if (sg.cell) {
      if (!cur) { cur = []; groups.push(cur); }
      cur.push(sg);
    } else if (sg.n > 0) cur = null;
  });
  var groupOf = new Map();
  groups.forEach(function (g) { g.forEach(function (sg) { groupOf.set(sg, g); }); });
  var doneGroups = new Set();
  segs.forEach(function (sg) {
    if (!sg.cell) {
      sg.k0 = k;
      sg.treads.forEach(function (poly) { blocks.push({ kind: "tread", poly: poly, k: k++ }); });
      if (sg.n) flights.push({ from: sg.k0, to: k - 1, steps: sg.n, going: G });
      return;
    }
    var g = groupOf.get(sg);
    if (c.turnType === "landing") {
      if (!doneGroups.has(g)) {
        doneGroups.add(g);
        blocks.push({ kind: "landing", poly: g.length > 1 ? unionLoop(g.map(function (x) { return x.cell.poly; })) : sg.cell.poly, k: k++ });
      }
      sg.kFirst = sg.kLast = k - 1;
      return;
    }
    sg.kFirst = k;
    if (sg.cell.wedges) sg.cell.wedges.forEach(function (poly) { blocks.push({ kind: "winder", poly: poly, k: k++ }); });
    else blocks.push({ kind: "landing", poly: sg.cell.poly, k: k++ });
    sg.kLast = k - 1;
  });
  return { segs: segs, blocks: blocks, flights: flights, N: k };
}

function designedLayout(it, cfg) {
  var c = normalizeStair(cfg), b = buildDesigned(c), W = c.width;
  var N = Math.max(1, b.N), rise = Math.max(1, num(it && it.h, 300)), R = rise / N;
  // walking line: the centre of every run, through a landing's centre, and
  // round a winder fan on a quarter arc about its inner corner
  var walk = [];
  function push(q) {
    var last = walk[walk.length - 1];
    if (!last || Math.hypot(last.x - q.x, last.z - q.z) > 1e-6) walk.push(q);
  }
  // the handrail runs along one side the whole way: the outside of the first
  // quarter turn (a straight flight keeps it on the right, as it always had)
  var firstQ = c.turns.find(function (t) { return t !== "S"; });
  var railLeft = firstQ === "R", off = W / 2 - RAIL_INSET, rail = [];
  function railVec(d) { return mul(leftOf(d), railLeft ? 1 : -1); }
  function rpush(q, y) {
    var last = rail[rail.length - 1];
    if (last && Math.hypot(last.x - q.x, last.z - q.z) < 1e-6) { last.y = Math.max(last.y, y); return; }
    rail.push({ x: q.x, z: q.z, y: y });
  }
  b.segs.forEach(function (sg) {
    if (!sg.cell) {
      push(sg.start);
      push(sg.end);
      if (sg.n) {
        var rv = railVec(sg.d);
        rpush(add(sg.start, mul(rv, off)), (sg.k0 + 1) * R);
        rpush(add(sg.end, mul(rv, off)), (sg.k0 + sg.n + 1) * R);
      }
      return;
    }
    var cell = sg.cell, d = sg.d, rv2 = railVec(d);
    // a flat block's rail is level at its top; winders climb to the next run's nosing
    var flat = c.turnType === "landing" || !cell.wedges;
    var yIn = (sg.kFirst + 1) * R, yOut = flat ? (sg.kLast + 1) * R : (sg.kLast + 2) * R;
    if (cell.t === "S" || c.turnType === "landing" || !cell.wedges) {
      push(cell.centre);
    } else {
      var a0 = Math.atan2(sg.entry.z - cell.inner.z, sg.entry.x - cell.inner.x),
        a1 = Math.atan2(cell.exitP.z - cell.inner.z, cell.exitP.x - cell.inner.x), da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      for (var q = 1; q < 6; q++) {
        var aq = a0 + (da * q) / 6;
        push(P(cell.inner.x + Math.cos(aq) * W / 2, cell.inner.z + Math.sin(aq) * W / 2));
      }
    }
    push(cell.exitP);
    var start = add(sg.entry, mul(rv2, off));
    rpush(start, yIn);
    if (cell.t === "S") rpush(add(start, mul(d, W)), yOut);
    else {
      var toward = (cell.t === "L") === railLeft;
      rpush(add(start, mul(d, toward ? W / 2 - off : W / 2 + off)), (yIn + yOut) / 2);
      rpush(add(cell.exitP, mul(railVec(cell.exitD), off)), yOut);
    }
  });
  // centre the footprint's bounding box on the item origin
  var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  b.blocks.forEach(function (bl) {
    bl.poly.forEach(function (q) {
      minx = Math.min(minx, q.x); maxx = Math.max(maxx, q.x);
      minz = Math.min(minz, q.z); maxz = Math.max(maxz, q.z);
    });
  });
  var cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  function sh(q) { var o = P(q.x - cx, q.z - cz); if (q.y != null) o.y = q.y; return o; }
  var winders = b.blocks.some(function (bl) { return bl.kind === "winder"; });
  return {
    designed: true,
    shape: presetOf(c),
    config: c,
    risers: N,
    riser: R,
    rise: rise,
    going: c.going,
    winderGoing: winders ? (Math.PI * W) / 12 : null,
    width: W,
    w: maxx - minx,
    d: maxz - minz,
    steps: b.blocks.map(function (bl) {
      return { kind: bl.kind, poly: bl.poly.map(sh), top: (bl.k + 1) * R, k: bl.k };
    }),
    walk: walk.map(sh),
    rail: rail.map(sh),
    railLeft: railLeft,
    flights: b.flights,
    legacy: null,
  };
}

/* ---------------- legacy shapes ---------------- */

function legacyLayout(it, variantShape) {
  var cfg = (it && it.configuration) || {};
  var n = Math.max(2, Math.min(100, Math.round(cfg.stepCount || (it && it.steps) || 14)));
  var shape = variantShape || cfg.shape || "straight";
  var w = num(it && it.w, 100), d = num(it && it.d, 250), H = num(it && it.h, 260);
  var hw = w / 2, hd = d / 2, rise = H / n, steps = [], flights = [], L = { shape: shape, n: n, rise: rise, hw: hw, hd: hd };
  function step(x0, x1, z0, z1, k, kind) {
    steps.push({ kind: kind || "tread", poly: rectPoly(x0, x1, z0, z1), rect: { x0: x0, x1: x1, z0: z0, z1: z1 }, top: (k + 1) * rise, k: k });
  }
  var walk;
  if (shape === "L") {
    var fw = Math.min(w * 0.45, 100), n1 = Math.max(1, Math.round(n * 0.55)), n2 = n - n1 - 1,
      len1 = d - fw, len2 = w - fw;
    Object.assign(L, { fw: fw, n1: n1, n2: n2, len1: len1, len2: len2 });
    for (var i = 0; i < n1; i++) step(-hw, -hw + fw, hd - ((i + 1) * len1) / n1, hd - (i * len1) / n1, i);
    step(-hw, -hw + fw, -hd, -hd + fw, n1, "landing");
    for (var j = 0; j < n2; j++) step(-hw + fw + (j * len2) / n2, -hw + fw + ((j + 1) * len2) / n2, -hd, -hd + fw, n1 + 1 + j);
    flights.push({ from: 0, to: n1 - 1, steps: n1, going: len1 / n1 });
    if (n2 > 0) flights.push({ from: n1 + 1, to: n1 + n2, steps: n2, going: len2 / n2 });
    walk = [P(-hw + fw / 2, hd - 8), P(-hw + fw / 2, -hd + fw / 2), P(hw - 6, -hd + fw / 2)];
  } else if (shape === "U") {
    var flightW = Math.min(w * 0.45, 100), landingD = Math.min(flightW, d * 0.35);
    var flightD = d - landingD, first = Math.max(1, Math.floor((n - 1) / 2)), second = Math.max(1, n - first - 1);
    Object.assign(L, { flightW: flightW, landingD: landingD, flightD: flightD, first: first, second: second });
    for (var u1 = 0; u1 < first; u1++)
      step(-hw, -hw + flightW, hd - (u1 + 1) * flightD / first, hd - u1 * flightD / first, u1);
    step(-hw, hw, -hd, -hd + landingD, first, "landing");
    for (var u2 = 0; u2 < second; u2++)
      step(hw - flightW, hw, -hd + landingD + u2 * flightD / second, -hd + landingD + (u2 + 1) * flightD / second, first + 1 + u2);
    flights.push({ from: 0, to: first - 1, steps: first, going: flightD / first });
    flights.push({ from: first + 1, to: first + second, steps: second, going: flightD / second });
    walk = [P(-hw + flightW / 2, hd - 8), P(-hw + flightW / 2, -hd + landingD / 2), P(hw - flightW / 2, -hd + landingD / 2), P(hw - flightW / 2, hd - 8)];
  } else if (shape === "curved") {
    var ro = Math.min(w, d) - 2, ri = Math.max(12, ro * 0.18), cx = -hw, cz = -hd;
    Object.assign(L, { ro: ro, ri: ri, cx: cx, cz: cz });
    for (var k = 0; k < n; k++) {
      var a0 = (k / n) * (Math.PI / 2), a1 = ((k + 1) / n) * (Math.PI / 2);
      steps.push({
        kind: "winder", k: k, top: (k + 1) * rise,
        poly: wind([P(cx + Math.sin(a0) * ri, cz + Math.cos(a0) * ri), P(cx + Math.sin(a0) * ro, cz + Math.cos(a0) * ro),
          P(cx + Math.sin(a1) * ro, cz + Math.cos(a1) * ro), P(cx + Math.sin(a1) * ri, cz + Math.cos(a1) * ri)]),
      });
    }
    var rm = (ri + ro) / 2;
    walk = [];
    for (var q = 0; q <= 8; q++) {
      var aa = 0.08 + (q / 8) * (Math.PI / 2 - 0.2);
      walk.push(P(cx + Math.sin(aa) * rm, cz + Math.cos(aa) * rm));
    }
  } else {
    shape = L.shape = "straight";
    for (var s = 0; s < n; s++) step(-hw, hw, hd - ((s + 1) * d) / n, hd - (s * d) / n, s);
    flights.push({ from: 0, to: n - 1, steps: n, going: d / n });
    walk = [P(0, hd - 8), P(0, -hd + 6)];
  }
  var lastK = steps.reduce(function (m, st) { return Math.max(m, st.k); }, 0);
  return {
    designed: false,
    shape: shape,
    config: null,
    risers: lastK + 1,
    riser: rise,
    rise: H,
    going: shape === "straight" ? d / n : null,
    winderGoing: null,
    width: shape === "straight" ? w : shape === "curved" ? null : (L.fw || L.flightW),
    w: w,
    d: d,
    steps: steps,
    walk: walk,
    rail: null,
    flights: flights,
    legacy: L,
  };
}

/* The plan shape a stairs catalogue variant carries (js/furniture_variants.js
   `stairs`: lShape -> "L", curved -> "curved"), for readers that cannot load
   the THREE-backed catalogue. */
export function stairVariantShape(variant) {
  return variant === "lShape" ? "L" : variant === "curved" ? "curved" : null;
}

/* The layout of a staircase item. `variantShape` is the catalogue variant's
   shape (vspec(it).shape); "curved" always keeps its catalogue fan. */
export function stairLayout(it, variantShape) {
  var cfg = it && it.configuration && it.configuration.stair;
  if (variantShape !== "curved" && cfg && typeof cfg === "object") return designedLayout(it, cfg);
  return legacyLayout(it, variantShape);
}

/* ---------------- presets, fitting and editing ---------------- */

export function presetOf(cfg) {
  var c = cfg, r = c.runs, t = c.turns;
  if (r.length === 1) return "straight";
  if (r.length === 2 && (t[0] === "L" || t[0] === "R")) return "L";
  if (r.length === 3 && r[1] === 0 && t[0] === t[1] && (t[0] === "L" || t[0] === "R")) return "U";
  return "custom";
}

// blocks a config's turns take (landings, winders), whatever its treads
function turnBlocks(cfg) {
  var c = normalizeStair(cfg);
  return buildDesigned(c).N - c.runs.reduce(function (a, b) { return a + b; }, 0);
}

export function stairPreset(kind, opts) {
  opts = opts || {};
  var turnType = opts.turnType === "winder" ? "winder" : "landing", turn = opts.turn === "L" ? "L" : "R";
  var N = Math.max(2, Math.round(num(opts.risers, 16))), runs, turns;
  if (kind === "L") {
    var treadsL = Math.max(2, N - (turnType === "winder" ? 3 : 1)), a = Math.ceil(treadsL / 2);
    runs = [a, treadsL - a]; turns = [turn];
  } else if (kind === "U") {
    var treadsU = Math.max(2, N - (turnType === "winder" ? 6 : 1)), b = Math.ceil(treadsU / 2);
    runs = [b, 0, treadsU - b]; turns = [turn, turn];
  } else {
    runs = [N]; turns = [];
  }
  return normalizeStair({
    width: num(opts.width, 90), going: num(opts.going, 28), runs: runs, turns: turns, turnType: turnType,
    autoSteps: opts.autoSteps !== false, autoRise: !!opts.autoRise,
  });
}

/* Plain limit numbers from a js/code_profiles.js profile (or its rules). */
export function stairRulesFrom(profile) {
  var R = (profile && (profile.rules || profile)) || {};
  function v(k) { return R[k] && Number.isFinite(Number(R[k].value)) ? Number(R[k].value) : undefined; }
  return { maxRiser: v("stairMaxRiser"), minTread: v("stairMinTread"), maxPitch: v("stairMaxPitch"), strideMin: v("stairStrideMin"), strideMax: v("stairStrideMax") };
}

function meets(R, G, rules) {
  var maxR = rules.maxRiser || STAIR_FALLBACK_RULES.maxRiser, minT = rules.minTread || STAIR_FALLBACK_RULES.minTread;
  if (R > maxR + 1e-6 || G < minT - 1e-6) return false;
  if (rules.maxPitch && (Math.atan2(R, G) * 180) / Math.PI > rules.maxPitch + 1e-6) return false;
  if (rules.strideMin && 2 * R + G < rules.strideMin - 1e-6) return false;
  if (rules.strideMax && 2 * R + G > rules.strideMax + 1e-6) return false;
  return true;
}

/* Riser count and going for a rise: the fewest equal risers under the
   maximum, the going from the 63 cm stride rule kept inside the limits, then
   more risers while a pitch or stride limit still fails. */
export function fitStairNumbers(rise, rules, minRisers) {
  rules = rules || {};
  rise = Math.max(1, num(rise, 300));
  var maxR = rules.maxRiser || STAIR_FALLBACK_RULES.maxRiser, minT = rules.minTread || STAIR_FALLBACK_RULES.minTread;
  var N = Math.max(minRisers || 2, Math.ceil(rise / maxR - 1e-9)), best = null;
  for (var guard = 0; guard < 60; guard++, N++) {
    var R = rise / N, G = Math.round(clamp(63 - 2 * R, minT, 32) * 2) / 2;
    if (G < minT) G = Math.ceil(minT * 2) / 2;
    if (rules.maxPitch) {
      var gp = R / Math.tan((rules.maxPitch * Math.PI) / 180);
      if (G < gp) G = Math.ceil(gp * 2) / 2;
    }
    if (rules.strideMin && 2 * R + G < rules.strideMin) G = Math.ceil((rules.strideMin - 2 * R) * 2) / 2;
    if (rules.strideMax && 2 * R + G > rules.strideMax) G = Math.max(Math.ceil(minT * 2) / 2, Math.floor((rules.strideMax - 2 * R) * 2) / 2);
    if (!best) best = { risers: N, riser: R, going: G };
    if (meets(R, G, rules)) return { risers: N, riser: R, going: G };
  }
  return best;
}

/* Change the total number of risers, keeping the shape: the treads are
   shared out over the runs in proportion, a merged landing's 0 run stays 0. */
export function setRiserCount(cfg, N) {
  var c = normalizeStair(cfg), extra = turnBlocks(c), live = c.runs.filter(function (r) { return r > 0; }).length;
  var treads = Math.max(live, Math.round(num(N, 0)) - extra), sum = c.runs.reduce(function (a, b) { return a + b; }, 0) || 1;
  var runs = c.runs.map(function (r) { return r === 0 ? 0 : Math.max(1, Math.round((r * treads) / sum)); });
  var diff = treads - runs.reduce(function (a, b) { return a + b; }, 0);
  for (var guard = 0; diff !== 0 && guard < 400; guard++) {
    // take from / give to the longest run first, never below one tread
    var idx = 0;
    runs.forEach(function (r, i) { if (r > runs[idx]) idx = i; });
    if (diff > 0) { runs[idx]++; diff--; }
    else if (runs[idx] > 1) { runs[idx]--; diff++; }
    else break;
  }
  c.runs = runs;
  return c;
}

export function autoStair(o) {
  o = o || {};
  var preset = o.preset === "L" || o.preset === "U" ? o.preset : "straight";
  var turnType = o.turnType === "winder" ? "winder" : "landing";
  var minN = preset === "straight" ? 2 : 2 + (preset === "L" ? (turnType === "winder" ? 3 : 1) : (turnType === "winder" ? 6 : 1));
  var f = fitStairNumbers(o.rise, o.rules, minN);
  return stairPreset(preset, { risers: f.risers, width: num(o.width, 90), going: f.going, turn: o.turn, turnType: turnType, autoSteps: true, autoRise: o.autoRise });
}

/* Re-fit an existing design to the code, keeping its runs' proportions,
   turns, landing type and width. */
export function fitStair(cfg, rise, rules) {
  var c = normalizeStair(cfg);
  var live = c.runs.filter(function (r) { return r > 0; }).length;
  var f = fitStairNumbers(rise, rules, turnBlocks(c) + live);
  var out = setRiserCount(c, f.risers);
  out.going = f.going;
  out.autoSteps = true;
  return out;
}

export function mirrorStair(cfg) {
  var c = normalizeStair(cfg);
  c.turns = c.turns.map(function (t) { return t === "L" ? "R" : t === "R" ? "L" : t; });
  return c;
}

/* Set run i to n treads. With autoSteps the riser count stays put: the
   difference comes out of the last run (or the first, when i is the last).
   null when that would leave a run with no treads (0 is only allowed for a
   middle run between two quarter turns — a U's merged landing). */
export function setRunSteps(cfg, i, n) {
  var c = normalizeStair(cfg);
  n = Math.round(num(n, NaN));
  if (!(i >= 0 && i < c.runs.length) || !Number.isFinite(n)) return null;
  var middle = i > 0 && i < c.runs.length - 1 && c.turns[i - 1] !== "S" && c.turns[i] !== "S";
  if (n < (middle ? 0 : 1)) return null;
  var diff = n - c.runs[i];
  c.runs[i] = n;
  if (c.autoSteps && diff) {
    var donor = i === c.runs.length - 1 ? 0 : c.runs.length - 1;
    if (donor === i) return null;
    c.runs[donor] -= diff;
    if (c.runs[donor] < 1) return null;
  }
  return c;
}

/* Add a turn after the last run (splitting it), or drop run i with the turn
   before it (its treads go to the run before). */
export function addStairTurn(cfg, turn) {
  var c = normalizeStair(cfg), last = c.runs.length - 1, n = c.runs[last];
  var a = Math.max(1, Math.ceil(n / 2)), b = Math.max(1, n - a);
  c.runs.splice(last, 1, a, b);
  c.turns.push(turn === "L" || turn === "S" ? turn : "R");
  return normalizeStair(c);
}
export function removeStairRun(cfg, i) {
  var c = normalizeStair(cfg);
  if (c.runs.length < 2 || !(i >= 0 && i < c.runs.length)) return null;
  var into = i === 0 ? 1 : i - 1;
  c.runs[into] += c.runs[i];
  c.runs.splice(i, 1);
  c.turns.splice(i === 0 ? 0 : i - 1, 1);
  return normalizeStair(c);
}

export function stairRiserCount(cfg) {
  return buildDesigned(normalizeStair(cfg)).N;
}

/* Write a design onto the item: the config, the fields older readers use,
   and the footprint (w/d) and rise (h) it derives. */
export function applyStairConfig(it, cfg, rise) {
  var c = normalizeStair(cfg);
  if (!it || !c) return null;
  var h = Math.max(20, num(rise, num(it.h, 300)));
  it.configuration = Object.assign({}, it.configuration || {}, { stair: c });
  var lay = designedLayout(Object.assign({}, it, { h: h }), c);
  it.configuration.stepCount = lay.risers;
  it.configuration.shape = lay.shape;
  it.w = Math.round(lay.w * 10) / 10;
  it.d = Math.round(lay.d * 10) / 10;
  it.h = h;
  return lay;
}

/* The code numbers of a laid-out stair against plain limits:
   [{ rule, value, limit, ok, kind: "max"|"min", unit, note? }]. Winders are
   measured at the walking line (the centre of the flight). */
export function stairCodeReport(layout, rules) {
  rules = rules || {};
  var rows = [], R = layout.riser, going = null, note = null;
  layout.flights.forEach(function (f) { if (f.steps > 0 && (going == null || f.going < going)) going = f.going; });
  if (layout.winderGoing != null && (going == null || layout.winderGoing < going)) { going = layout.winderGoing; note = "winder-walkline"; }
  function row(rule, value, limit, kind, unit, extra) {
    if (limit == null || !Number.isFinite(limit) || value == null || !Number.isFinite(value)) return;
    var ok = kind === "max" ? value <= limit + 1e-6 : value >= limit - 1e-6;
    rows.push(Object.assign({ rule: rule, value: value, limit: limit, ok: ok, kind: kind, unit: unit }, extra || {}));
  }
  row("stairMaxRiser", R, rules.maxRiser, "max", "length");
  row("stairMinTread", going, rules.minTread, "min", "length", note ? { note: note } : null);
  if (going > 0) {
    row("stairMaxPitch", (Math.atan2(R, going) * 180) / Math.PI, rules.maxPitch, "max", "angle");
    row("stairStrideMin", 2 * R + going, rules.strideMin, "min", "length");
    row("stairStrideMax", 2 * R + going, rules.strideMax, "max", "length");
  }
  return rows;
}

/* Edge lists of a layout's blocks for drawing: `inner` edges two blocks
   share (tread lines), `outer` the stair's outline. */
export function stairEdges(layout) {
  var e = looseEdges(layout.steps.map(function (s) { return s.poly; })), seen = new Set(), inner = [];
  e.all.forEach(function (x) {
    if (e.loose.indexOf(x) !== -1 || seen.has(x.k)) return;
    seen.add(x.k);
    inner.push(x);
  });
  return { inner: inner, outer: e.loose };
}
