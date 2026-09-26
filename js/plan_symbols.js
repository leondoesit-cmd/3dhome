/* Drafting symbols for the construction sheet: the line-work a builder's
   plan uses for fixtures — a WC's bowl and cistern, a tub's inner rim, a
   cooktop's burners, stair treads with an UP arrow, a bed's pillows.

   Pure data: symbolPrims() returns primitives in the item's own frame
   (centimetres, origin at its centre, +z toward its front — the frame
   plan2d.js draws items in), so any backend can place and rotate them.
     {k:"rect", x, z, w, d, r?}      {k:"line", x1, z1, x2, z2}
     {k:"circle", x, z, r}           {k:"arc", x, z, r, a0, a1}
     {k:"poly", pts:[{x,z}], closed}  {k:"text", x, z, s, size}
   `weight` on any primitive: "heavy" | "light" (default "light"). */

function rect(x, z, w, d, r) { return { k: "rect", x: x, z: z, w: w, d: d, r: r || 0 }; }
function line(x1, z1, x2, z2) { return { k: "line", x1: x1, z1: z1, x2: x2, z2: z2 }; }
function circle(x, z, r) { return { k: "circle", x: x, z: z, r: r }; }

function outline(w, d, r) { return [Object.assign(rect(-w / 2, -d / 2, w, d, r), { weight: "heavy" })]; }

var SYMBOLS = {
  toilet: function (w, d) {
    var tank = Math.min(20, d * 0.3);
    return [
      Object.assign(rect(-w / 2, -d / 2, w, tank, 2), { weight: "heavy" }),
      { k: "poly", closed: true, weight: "heavy", pts: ellipsePts(0, -d / 2 + tank + (d - tank) * 0.5, w * 0.42, (d - tank) * 0.5, 20) },
      { k: "poly", closed: true, pts: ellipsePts(0, -d / 2 + tank + (d - tank) * 0.52, w * 0.28, (d - tank) * 0.34, 18) },
    ];
  },
  bidet: function (w, d) {
    return [{ k: "poly", closed: true, weight: "heavy", pts: ellipsePts(0, 0, w * 0.45, d * 0.48, 20) },
      { k: "poly", closed: true, pts: ellipsePts(0, d * 0.05, w * 0.3, d * 0.3, 16) }];
  },
  sink: function (w, d) {
    return outline(w, d).concat([rect(-w * 0.32, -d * 0.2, w * 0.64, d * 0.55, 4), circle(0, -d * 0.32, 1.5)]);
  },
  vanity: function (w, d) { return SYMBOLS.sink(w, d); },
  pedestalSink: function (w, d) {
    return [{ k: "poly", closed: true, weight: "heavy", pts: ellipsePts(0, 0, w * 0.48, d * 0.46, 20) }, circle(0, -d * 0.2, 1.5)];
  },
  bathtub: function (w, d) {
    return outline(w, d).concat([rect(-w / 2 + 6, -d / 2 + 6, w - 12, d - 12, Math.min(w, d) * 0.3), circle(-w / 2 + 14, 0, 2.5)]);
  },
  shower: function (w, d) {
    return outline(w, d).concat([line(-w / 2, -d / 2, w / 2, d / 2), line(w / 2, -d / 2, -w / 2, d / 2), circle(0, 0, 3)]);
  },
  cooktop: function (w, d) {
    var r = Math.min(w, d) * 0.14;
    return outline(w, d).concat([circle(-w * 0.22, -d * 0.2, r), circle(w * 0.22, -d * 0.2, r * 0.8),
      circle(-w * 0.22, d * 0.2, r * 0.8), circle(w * 0.22, d * 0.2, r)]);
  },
  fridge: function (w, d) {
    return outline(w, d).concat([line(-w / 2, d / 2 - 4, w / 2, d / 2 - 4), { k: "text", x: 0, z: 0, s: "REF", size: Math.min(w, d) * 0.22 }]);
  },
  base: function (w, d) { return outline(w, d).concat([line(-w / 2, d / 2 - 3, w / 2, d / 2 - 3)]); },
  island: function (w, d) { return outline(w, d).concat([rect(-w / 2 + 3, -d / 2 + 3, w - 6, d - 6)]); },
  tall: function (w, d) { return outline(w, d).concat([line(-w / 2, -d / 2, w / 2, d / 2)]); },
  dishwasher: function (w, d) { return outline(w, d).concat([{ k: "text", x: 0, z: 0, s: "DW", size: Math.min(w, d) * 0.28 }]); },
  washer: function (w, d) { return outline(w, d).concat([circle(0, 0, Math.min(w, d) * 0.32), { k: "text", x: 0, z: d * 0.36, s: "W", size: Math.min(w, d) * 0.16 }]); },
  dryer: function (w, d) { return outline(w, d).concat([circle(0, 0, Math.min(w, d) * 0.32), { k: "text", x: 0, z: d * 0.36, s: "D", size: Math.min(w, d) * 0.16 }]); },
  wardrobe: function (w, d) {
    return outline(w, d).concat([Object.assign(line(-w / 2 + 4, 0, w / 2 - 4, 0), { dash: true })]);
  },
  bed: function (w, d) {
    var n = w >= 140 ? 2 : 1, pw = (w - 16) / n, out = outline(w, d, 3);
    for (var i = 0; i < n; i++) out.push(rect(-w / 2 + 8 + i * pw + 2, -d / 2 + 6, pw - 4, 22, 5));
    out.push(line(-w / 2, -d / 2 + 50, w / 2, -d / 2 + 50));
    out.push(line(-w / 2 + 6, -d / 2 + 56, w / 2 - 6, -d / 2 + 56));
    return out;
  },
  sofa: function (w, d) {
    var arm = Math.min(16, w * 0.1), back = Math.min(20, d * 0.24), out = outline(w, d, 4);
    out.push(rect(-w / 2, -d / 2, w, back, 3));
    out.push(rect(-w / 2, -d / 2 + back, arm, d - back, 3));
    out.push(rect(w / 2 - arm, -d / 2 + back, arm, d - back, 3));
    var n = Math.max(1, Math.round((w - 2 * arm) / 70)), cw = (w - 2 * arm) / n;
    for (var i = 1; i < n; i++) out.push(line(-w / 2 + arm + i * cw, -d / 2 + back, -w / 2 + arm + i * cw, d / 2));
    return out;
  },
  armchair: function (w, d) { return SYMBOLS.sofa(w, d); },
  table: function (w, d) {
    // the table with chairs pulled up on its long sides
    var out = outline(w, d, 2), cw = 42, n = Math.max(1, Math.floor((w - 10) / 60));
    for (var i = 0; i < n; i++) {
      var cx = -w / 2 + (w * (i + 0.5)) / n;
      out.push(rect(cx - cw / 2, -d / 2 - 30, cw, 26, 4));
      out.push(rect(cx - cw / 2, d / 2 + 4, cw, 26, 4));
    }
    return out;
  },
  roundTable: function (w, d) { return [Object.assign(circle(0, 0, Math.min(w, d) / 2), { weight: "heavy" })]; },
  chair: function (w, d) { return outline(w, d, 3).concat([line(-w / 2, -d / 2 + 5, w / 2, -d / 2 + 5)]); },
  desk: function (w, d) { return outline(w, d); },
  plant: function (w, d) {
    var r = Math.min(w, d) / 2, out = [Object.assign(circle(0, 0, r), { weight: "heavy" }), circle(0, 0, r * 0.3)];
    for (var i = 0; i < 6; i++) {
      var a = (i * Math.PI) / 3;
      out.push(line(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95));
    }
    return out;
  },
  rug: function (w, d) { return [Object.assign(rect(-w / 2, -d / 2, w, d), { dash: true })]; },
  stairs: function (w, d, it) {
    var steps = Math.max(2, Math.min(100, Math.round((it && it.configuration && it.configuration.stepCount) || (it && it.steps) || 14)));
    var shape = stairShape(it), out = outline(w, d), up = { k: "text", s: "UP", size: Math.max(8, Math.min(16, w * 0.14)), upLabel: true };
    var hw = w / 2, hd = d / 2;
    function arrow(pts) {
      for (var i = 0; i + 1 < pts.length; i++) out.push(Object.assign(line(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z), { weight: "heavy" }));
      var a = pts[pts.length - 2], b = pts[pts.length - 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1,
        ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      out.push(Object.assign(line(b.x, b.z, b.x - ux * 9 - uz * 5, b.z - uz * 9 + ux * 5), { weight: "heavy" }));
      out.push(Object.assign(line(b.x, b.z, b.x - ux * 9 + uz * 5, b.z - uz * 9 - ux * 5), { weight: "heavy" }));
    }
    if (shape === "L") {
      // up the left side to a quarter landing, then across the back
      var fw = Math.min(w * 0.45, 100), n1 = Math.max(1, Math.round(steps * 0.55)), n2 = Math.max(1, steps - n1 - 1),
        len1 = d - fw, len2 = w - fw;
      out.push(rect(-hw, -hd, fw, fw));
      for (var i = 1; i < n1; i++) out.push(line(-hw, hd - (i * len1) / n1, -hw + fw, hd - (i * len1) / n1));
      for (var j = 1; j < n2; j++) out.push(line(-hw + fw + (j * len2) / n2, -hd, -hw + fw + (j * len2) / n2, -hd + fw));
      out.push(line(-hw + fw, -hd + fw, -hw + fw, hd));
      out.push(line(-hw + fw, -hd + fw, hw, -hd + fw));
      arrow([{ x: -hw + fw / 2, z: hd - 8 }, { x: -hw + fw / 2, z: -hd + fw / 2 }, { x: hw - 6, z: -hd + fw / 2 }]);
      out.push(Object.assign(up, { x: -hw + fw / 2, z: hd - 18 }));
      return out;
    }
    if (shape === "U") {
      var fwU = Math.min(w * 0.45, 100), landingU = Math.min(fwU, d * 0.35), flightU = d - landingU;
      var firstU = Math.max(1, Math.floor((steps - 1) / 2)), secondU = Math.max(1, steps - firstU - 1);
      for (var u1 = 1; u1 < firstU; u1++) out.push(line(-hw, hd - u1 * flightU / firstU, -hw + fwU, hd - u1 * flightU / firstU));
      for (var u2 = 1; u2 < secondU; u2++) out.push(line(hw - fwU, -hd + landingU + u2 * flightU / secondU, hw, -hd + landingU + u2 * flightU / secondU));
      out.push(line(-hw, -hd + landingU, hw, -hd + landingU));
      arrow([{ x: -hw + fwU / 2, z: hd - 8 }, { x: -hw + fwU / 2, z: -hd + landingU / 2 }, { x: hw - fwU / 2, z: -hd + landingU / 2 }, { x: hw - fwU / 2, z: hd - 8 }]);
      out.push(Object.assign(up, { x: hw - fwU / 2, z: hd - 16 }));
      return out;
    }
    if (shape === "curved") {
      // a quarter-turn fan about the back-left corner
      var ro = Math.min(w, d) - 2, ri = Math.max(12, ro * 0.18), cx = -hw, cz = -hd, arc = [], inner = [];
      for (var k = 0; k <= steps; k++) {
        var a = (k / steps) * (Math.PI / 2), sx = Math.sin(a), cs = Math.cos(a);
        out.push(line(cx + sx * ri, cz + cs * ri, cx + sx * ro, cz + cs * ro));
        arc.push({ x: cx + sx * ro, z: cz + cs * ro });
        inner.push({ x: cx + sx * ri, z: cz + cs * ri });
      }
      out.push({ k: "poly", pts: arc, closed: false, weight: "heavy" });
      out.push({ k: "poly", pts: inner, closed: false });
      var rm = (ri + ro) / 2, path = [];
      for (var q = 0; q <= 8; q++) {
        var aa = 0.08 + (q / 8) * (Math.PI / 2 - 0.2);
        path.push({ x: cx + Math.sin(aa) * rm, z: cz + Math.cos(aa) * rm });
      }
      arrow(path);
      out.push(Object.assign(up, { x: cx + Math.sin(0.12) * rm + 10, z: cz + Math.cos(0.12) * rm - 6 }));
      return out;
    }
    for (var s2 = 1; s2 < steps; s2++) out.push(line(-hw, -hd + (s2 * d) / steps, hw, -hd + (s2 * d) / steps));
    arrow([{ x: 0, z: hd - 8 }, { x: 0, z: -hd + 6 }]);
    out.push(Object.assign(up, { x: 0, z: hd - 16 }));
    return out;
  },
};

/* Which plan a staircase has: the variant's shape, else the item's own
   configuration, else a straight flight. */
export function stairShape(it) {
  return (it && (it.shape || (it.configuration && it.configuration.shape))) || "straight";
}

export function ellipsePts(cx, cz, rx, rz, n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz });
  }
  return out;
}

export const SYMBOL_TYPES = Object.keys(SYMBOLS);

/* Primitives for a piece, or a plain outline for anything without a symbol.
   `upLabel` text ("UP") is left for the caller to translate. */
export function symbolPrims(type, w, d, it) {
  var f = SYMBOLS[type];
  return f ? f(w, d, it) : outline(w, d);
}

/* Item-local point → world, for an item at (x,z) turned `rot` degrees — the
   same rotation plan2d.js applies (canvas y is world +z). */
export function localToWorld(it, lx, lz) {
  var a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: it.x + lx * c - lz * s, z: it.z + lx * s + lz * c };
}
