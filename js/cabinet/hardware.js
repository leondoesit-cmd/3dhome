/* Cabinet folding leaves, hinge counts, board/leaf weights, handles and
   hardware counts, split out of js/cabinet.js. It shares the editor's state
   through live imports from ../cabinet.js. */
import { frontLeaf, layoutCab } from "../cabinet/layout.js";
import { resolveSheet } from "../stock.js";
import {
  BOARD_ROLES, FRONT_ROLES, NO_BAND, S32, STD, he, isCorner, isFloat,
} from "../cabinet.js";

/* A bi-fold ("אקורדיון") is two half-leaves knuckled together: the outer half
   swings on the carcass through `a`, and the inner half counter-rotates through
   `-a` about the moving knuckle, so the pair folds flat and the opening it
   leaves is only shortened, never swept. The unit list is flat (no parenting),
   so the knuckle's travel is applied as the second unit's translation and its
   rotation is given absolutely. */
function foldingLeaf(L, lx0, lx1, y0, y1, z0d, z1d, mat, hingeLeft, open, gap) {
  var w = lx1 - lx0,
    half = (w - gap / 2) / 2,
    s = hingeLeft ? 1 : -1,
    hingeX = hingeLeft ? lx0 : lx1,
    a = open * 1.55 * (hingeLeft ? -1 : 1), // same sign rule as a hinged leaf
    jointX = hingeX + s * half;

  var uOut = L.unit({ type: "fold", outer: true, px: hingeX, py: 0, pz: z0d, rot: "y", ang: a });
  frontLeaf(L, uOut, hingeLeft ? lx0 : lx1 - half, hingeLeft ? lx0 + half : lx1, y0, y1, z0d, z1d, mat, "door");

  // where the knuckle has travelled to, once the outer half has swung
  var tx = s * half * (Math.cos(a) - 1),
    tz = -s * half * Math.sin(a);
  var uIn = L.unit({ type: "fold", px: jointX, py: 0, pz: z0d, tx: tx, tz: tz, rot: "y", ang: -a });
  frontLeaf(L, uIn, hingeLeft ? jointX + gap / 2 : jointX - half, hingeLeft ? jointX + half : jointX - gap / 2, y0, y1, z0d, z1d, mat, "door");
  addHandle(L, hingeLeft ? lx1 - 5 : lx0 + 5, (y0 + y1) / 2, z1d, 5, y1 - y0, "v", uIn);
}

/* How many hinges a leaf needs. Height is the usual rule of thumb, but it is
   only a proxy for weight — a 2 m glass or lacquered door is far heavier than a
   2 m melamine one and needs the extra hinge that height alone would not ask
   for. Each concealed hinge is good for about 6 kg of leaf. */
export function hingeCount(h, kg) {
  var byHeight = h <= 90 ? 2 : h <= 160 ? 3 : h <= 200 ? 4 : h <= 240 ? 5 : 6;
  if (!kg) return byHeight;
  return Math.max(byHeight, Math.min(8, Math.ceil(kg / 6)));
}

/* What a board actually weighs, from the sheet it is cut out of. Densities are
   in the catalogue: 650 kg/m³ for melamine chipboard, 780 for lacquered MDF,
   2500 for glass — which is why a glass door needs different hardware. */
export function boardWeight(areaM2, sheet) {
  var dens = (sheet && sheet.dens) || 700,
    t = (sheet && sheet.t) || STD.doorT;
  return areaM2 * (t / 100) * dens;
}

/* The weight of one leaf of this column's front, in kg. */
export function leafWeight(L, col) {
  var sp = L.sp,
    mat = col.doorMat || "front",
    sheet = sheetFor(sp, stockRole(mat), STD.doorT),
    leaves = col.doorLeaves || 1,
    h = col.doorH || L.yt - L.yb;
  if (!leaves) return 0;
  return boardWeight((((isCorner(sp) ? L.cornerFront || col.w : col.w) / leaves) * h) / 10000, sheet);
}

/* --- handles (פרזול) --- */
function addHandle(L, cx, cy, zFace, availW, availH, dir, unit) {
  var t = L.sp.hw.handle;
  L.hw.handles = (L.hw.handles || 0) + 1;
  if (!["push","edge","gola"].includes(t)) {
    L.handleMounts ||= [];
    (t === "knob" || t === "leather" ? [0] : [-4.8,4.8]).forEach(function(offset){
      L.handleMounts.push({unit:unit,x:cx+(dir==="h"?offset:0),y:cy+(dir==="v"?offset:0)});
    });
  }
  if (t === "push") return;
  if (t === "knob") {
    L.part({ k: "cyl", role: "handle", x: cx, y: cy, z: zFace + 1.1, r: 1.6, hgt: 2.2, rx: Math.PI / 2, mat: "handle", unit: unit });
    L.part({ k: "sph", role: "handle", x: cx, y: cy, z: zFace + 2.4, r: 1.7, mat: "handle", unit: unit });
    return;
  }
  if (t === "edge" || t === "gola") {
    // a continuous lip along the top edge of the front — no protruding handle
    var lipY = dir === "v" ? cy + availH / 2 - 3 : cy + Math.min(availH / 2, 3);
    L.part({
      k: "box", role: "handle", x0: cx - availW / 2 + 1, x1: cx + availW / 2 - 1,
      y0: lipY - 1.6, y1: lipY + 0.4, z0: zFace + 0.2, z1: zFace + (t === "gola" ? 1 : 2.2), mat: "handle", unit: unit,
    });
    return;
  }
  if (t === "leather") {
    L.part({
      k: "box", role: "handle", x0: cx - 1.4, x1: cx + 1.4, y0: cy - 6, y1: cy + 6,
      z0: zFace + 0.2, z1: zFace + 1.4, mat: "leather", unit: unit,
    });
    return;
  }
  // bar handle: 12-30 cm on drawers, ~half the leaf on doors, on 2 stand-offs
  var len = dir === "v" ? Math.min(30, Math.max(12, availH * 0.22)) : Math.min(32, Math.max(12, availW * 0.4)),
    r = 0.8,
    off = 3;
  if (dir === "v") {
    L.part({ k: "cyl", role: "handle", x: cx, y: cy, z: zFace + off, r: r, hgt: len, mat: "handle", unit: unit });
    [-1, 1].forEach(function (s) {
      L.part({ k: "cyl", role: "handle", x: cx, y: cy + s * 4.8, z: zFace + off / 2, r: r * 0.85, hgt: off, rx: Math.PI / 2, mat: "handle", unit: unit });
    });
  } else {
    L.part({ k: "cyl", role: "handle", x: cx, y: cy, z: zFace + off, r: r, hgt: len, rz: Math.PI / 2, mat: "handle", unit: unit });
    [-1, 1].forEach(function (s) {
      L.part({ k: "cyl", role: "handle", x: cx + s * 4.8, y: cy, z: zFace + off / 2, r: r * 0.85, hgt: off, rx: Math.PI / 2, mat: "handle", unit: unit });
    });
  }
}

/* --- hardware tally, for the price and the ironmongery list --- */
function countHardware(L) {
  var hwc = L.hw;
  hwc.legs = L.parts.filter(function(p){return p.role === "leg";}).length;
  hwc.hinges = 0;
  hwc.slides = 0;
  hwc.rails = 0;
  hwc.railLen = 0;
  hwc.pins = 0;
  hwc.slidingLeaves = 0;
  hwc.baskets = 0;
  hwc.hampers = 0;
  hwc.trousers = 0;
  hwc.safes = 0;
  hwc.ledLen = 0;
  hwc.tvBrackets = 0;
  hwc.grommets = 0;
  hwc.applNiches = 0;
  L.cols.forEach(function (col) {
    var dr = col.ref.door || { t: "none" };
    if (dr.t === "sliding") hwc.slidingLeaves += 1;
    // buildDoor counts the hinges it actually placed, run by run — a column with
    // a closed base and a closed top box carries two doors' worth, and a bi-fold
    // carries the centre knuckles on top of the carcass hinges
    else if (dr.t !== "none" && dr.t !== "drawer") hwc.hinges += col.hinges || 0;
    col.secs.forEach(function (cell) {
      if (cell.drawers) hwc.slides += cell.drawers.length;
      if (cell.baskets) hwc.baskets += cell.baskets;
      if (cell.shelves) hwc.pins += cell.shelves * 4;
      if (cell.rails) {
        hwc.rails += cell.rails;
        hwc.railLen += (cell.rails * col.w) / 100;
      }
      if (cell.hamper) hwc.hampers++;
      if (cell.trouser) hwc.trousers++;
      if (cell.safe) hwc.safes++;
      if (cell.tv) hwc.tvBrackets++;
      if (cell.grommet) hwc.grommets++;
      if (cell.appl) hwc.applNiches++;
      if (cell.led) hwc.ledLen += col.w / 100;
    });
  });
}

function m2(a, b) {
  return (a * b) / 10000;
}

/* Which sheet a part of this role and thickness is cut from.

   The carcass, the fronts and the back are exactly as thick as the board they
   come off, so the thickness has to match — pick 25 mm melamine and you get
   25 mm sides. A worktop, a glazed panel or a mirror is drawn at whatever
   thickness the model needs (a "40 mm" worktop is a 20 mm slab with a mitred
   build-up, and a glass door leaf is drawn at door thickness), so matching on it
   would pick an absurd material. Those honour the chosen slab as it is. */
export function sheetFor(sp, srole, thickness) {
  var free = srole === "top" || srole === "glass" || srole === "mirror";
  return resolveSheet(sp.stock, srole, free ? null : thickness);
}

/* Which pile of board a part comes off. The 3D material names say what a part
   looks like; these five say what it is bought as, and that is what the cut plan
   nests and the price is built from. */
export function stockRole(mat) {
  if (mat === "back") return "back";
  if (mat === "top") return "top";
  if (mat === "glass" || mat === "glazing") return "glass";
  if (mat === "mirror") return "mirror";
  if (mat === "front" || mat === "doorPanel" || mat === "batten") return "front";
  return "carcass";
}

/* How much edge banding a board needs — read off where the board sits rather
   than from a table of roles, so a shelf gets its own front edge whatever
   column it lands in.

   A board is banded where a person can see or touch the raw core: a shelf on
   its front edge, a side on its front edge, a door all the way round, a drawer
   box along its top. A back panel, a recessed door panel, a glazing bead and a
   drawer bottom are captured on all four sides and get nothing. Metres. */
// a TV mounting board is captured in its niche on all four sides, like a back
/* A board's finished size and thickness, whatever shape it is. A polygon board
   (a corner unit's pentagon shelf) is bought as the rectangle it is cut out of —
   that is what nests and what is paid for — and `cut` records the corner that
   comes off it, which is what the cutting list has to say. */
export function partDims(p) {
  if (p.k === "poly") {
    var t = Math.abs(p.y1 - p.y0);
    return { l: Math.max(p.bw, p.bd), w: Math.min(p.bw, p.bd), t: t, cut: p.cut || 0, poly: 1 };
  }
  var dims = [Math.abs(p.x1 - p.x0), Math.abs(p.y1 - p.y0), Math.abs(p.z1 - p.z0)].sort(function (a, b) {
    return b - a;
  });
  return { l: dims[0], w: dims[1], t: dims[2], cut: 0, poly: 0 };
}

export function bandLen(p) {
  if (NO_BAND[p.role]) return 0;
  // a pentagon board shows its diagonal, and nothing else that is not captured
  if (p.k === "poly") return ((p.cut || 0) * Math.SQRT2) / 100;
  if (p.k !== "box") return 0;
  var dx = Math.abs(p.x1 - p.x0),
    dy = Math.abs(p.y1 - p.y0),
    dz = Math.abs(p.z1 - p.z0),
    dims = [dx, dy, dz].sort(function (a, b) {
      return a - b;
    }),
    face = dims[1] + dims[2]; // half the perimeter of the board's face
  if (FRONT_ROLES.indexOf(p.role) >= 0) return (2 * face) / 100; // seen all round
  if (p.role === "worktop") return (dx + (p.exposedReturns ?? 2) * dz) / 100; // front edge and exposed slab returns
  if (p.role === "plinth") return Math.max(dx, dz) / 100;
  if (p.role === "drawerBox") return dims[2] / 100; // the top edge only
  if (dz <= dx && dz <= dy) return (2 * face) / 100; // face-on board, no rule
  if (dy <= dx) return dx / 100; // shelf / top / bottom — its front edge
  return dy / 100; // side / divider — its front edge
}

/* The panel list a joiner would order: every board with its finished size,
   grouped by identical parts, each row carrying the banding it needs and the
   sheet it is to be cut from. Sizes are the cut sizes used in the model. */
export function cutList(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    rows = {},
    order = [];
  L.parts.forEach(function (p) {
    if (p.k !== "box" && p.k !== "poly") return;
    if (BOARD_ROLES.indexOf(p.role) < 0) return;
    var D = partDims(p),
      key = p.role + "|" + p.mat + "|" + +D.l.toFixed(10) + "x" + +D.w.toFixed(10) + "x" + D.t.toFixed(10) + "|" + +D.cut.toFixed(10);
    if (!rows[key]) {
      var srole = stockRole(p.mat),
        sheet = sheetFor(sp, srole, D.t);
      rows[key] = {
        role: p.role, mat: p.mat, srole: srole,
        l: +D.l.toFixed(10), w: +D.w.toFixed(10), t: +D.t.toFixed(10),
        // the corner that comes off a pentagon board, so the shop knows to cut it
        cut: D.cut ? +D.cut.toFixed(10) : 0,
        qty: 0, area: 0, band: 0, bandEach: Math.round(bandLen(p) * 100) / 100,
        sheet: sheet ? sheet.id : null,
        // a grained board may not be turned 90° on the saw, and neither may a
        // door: turning one would run its face pattern the wrong way
        grain: !!(sheet && sheet.grain),
      };
      order.push(key);
    }
    rows[key].qty++;
    // a pentagon is paid for as its rectangle: the cut corner is offcut, not saving
    rows[key].area += m2(D.l, D.w);
    rows[key].band += bandLen(p);
  });
  return order.map(function (k, i) {
    var r = rows[k];
    r.band = Math.round(r.band * 100) / 100;
    // the number the shop works from: written on the board, printed on the
    // nesting diagram and listed in the CSV, so all three agree
    r.no = i + 1;
    return r;
  });
}

// snap a measurement onto the 32 mm grid, which is what a shop actually drills
function snap32(mm, from) {
  return from + Math.round((mm - from) / S32.pitch) * S32.pitch;
}

/* Every hole in the job, grouped by the panel it goes in. A panel is identified
   the same way the cut list groups it, so a row in the cut list and a drilling
   pattern refer to the same board. */
export function drillPlan(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    t = sp.panel,
    out = [];

  function panel(role, l, w, datum) {
    var e = { id: "panel:" + out.length, role: role, l: Math.round(l * 10), w: Math.round(w * 10), thickness: t * 10, datum: datum, holes: [], rejectedHoles: [] };
    out.push(e);
    return e;
  }
  /* Positions arrive in the app's centimetres and leave in the millimetres a
     machine is programmed in — `e.l`/`e.w` are already mm, so the edge guard has
     to be applied after the conversion, not before it. */
  function hole(e, xCm, yCm, dia, depth, kind, face = "B") {
    var mx = Math.round(xCm * 100) / 10,
      my = Math.round(yCm * 100) / 10;
    var operation = { id: e.id + ":hole:" + (e.holes.length + e.rejectedHoles.length), x: mx, y: my, d: dia, depth: depth, kind: kind, face: face, through: depth === 0, templateId: "generic-system32-v1" };
    if (![mx, my, dia, depth].every(Number.isFinite) || dia <= 0 || depth < 0 || mx < dia / 2 || my < dia / 2 || mx > e.l - dia / 2 || my > e.w - dia / 2) {
      e.rejectedHoles.push({ ...operation, reason: "Hole is outside the panel or has invalid dimensions" });
      return;
    }
    // Preserve opposite-face operations, but never drill the same hole twice.
    if (!e.holes.some(function (h) { return h.x === mx && h.y === my && h.d === dia && h.depth === depth && h.face === face; })) e.holes.push(operation);
  }

  var innerD = L.zc - L.zb,
    base = L.yb - t, // the vertical boards' own bottom edge
    datum = he("מהתחתית ומהחזית", "from the bottom, from the front");

  /* One entry per physical vertical board, not per column face. A divider
     between two columns is a single board drilled on both of its faces — emit
     it twice and the shop drills two of them and has a spare. */
  if (isFloat(sp)) return out;
  var boards = [];
  var physical = L.parts.filter(function (p) { return p.k === "box" && ["side", "divider"].includes(p.role); });
  if (!isCorner(sp)) physical.sort(function (a, b) { return a.x0 - b.x0; });
  physical.forEach(function (p) {
    var board = panel(p.role, p.y1 - p.y0, Math.max(p.x1 - p.x0, p.z1 - p.z0), datum);
    board.base = p.y0;
    board.partIndex = L.parts.indexOf(p);
    board.thickness = Math.min(p.x1 - p.x0, p.z1 - p.z0) * 10;
    board.faceAxis = p.x1 - p.x0 < p.z1 - p.z0 ? "x" : "z";
    board.datumCode = "bottom-front";
    boards.push(board);
  });

  L.cols.forEach(function (col, ci) {
    if (col.kind && col.kind !== "normal") return;
    var sideL = boards[ci],
      sideR = boards[ci + 1];

    col.secs.forEach(function (cell) {
      // adjustable shelves: a pair of rows, front and back, on the grid
      if (cell.shelves) {
        for (var i = 1; i <= cell.shelves; i++) {
          var sy = snap32((((cell.y1 - cell.y0) * i) / (cell.shelves + 1) + cell.y0 - base) * 10, 0) / 10;
          [sideL, sideR].forEach(function (e, side) {
            if (!e) return;
            var face = isCorner(sp) ? "B" : side === 0 ? "A" : "B";
            hole(e, sy + base - (e.base ?? base), S32.setback / 10, S32.pin, S32.pinDepth, "pin", face);
            hole(e, sy + base - (e.base ?? base), e.w / 10 - S32.setback / 10, S32.pin, S32.pinDepth, "pin", face);
          });
        }
      }
      // drawer runners: two screws per side per drawer, on the grid
      if (cell.drawers)
        cell.drawers.forEach(function (dr) {
          var ry = snap32((dr.y0 + 3 - base) * 10, 0) / 10;
          [sideL, sideR].forEach(function (e, side) {
            if (!e) return;
            var face = isCorner(sp) ? "B" : side === 0 ? "A" : "B";
            hole(e, ry + base - (e.base ?? base), S32.setback / 10, S32.pin, S32.pinDepth, "runner", face);
            hole(e, ry + base - (e.base ?? base), (S32.setback + Math.floor((e.w - 2*S32.setback) / S32.pitch)*S32.pitch) / 10, S32.pin, S32.pinDepth, "runner", face);
          });
        });
    });

  });

  // A motion unit identifies one physical leaf, including separate covered
  // runs and corner fronts. Its local coordinates remain stable while open.
  (L.fronts || []).forEach(function (front) {
    var cups = L.parts.filter(function (p) { return p.role === "hinge" && p.unit === front.unit; });
    if (!cups.length && !(L.handleMounts || []).some(function(m){return m.unit===front.unit;})) return;
    var leafH = front.y1 - front.y0, leafW = front.x1 - front.x0;
    var door = panel(front.role || "door", leafH, leafW, he("מהתחתית ומקצה הציר", "from the bottom, from the hinge edge"));
    door.unit = front.unit;
    door.thickness = (front.z1 - front.z0) * 10;
    door.datumCode = "bottom-hinge";
    door.faceAxis = "local-z";
    door.front = { ...front };
    var left = !cups.length || cups[0].x < (front.x0 + front.x1) / 2;
    door.hingeLeft = left;
    cups.forEach(function (p) {
      hole(door, p.y - front.y0, S32.cupSetback / 10, S32.cup, S32.cupDepth, "cup");
      var ci = L.cols.findIndex(function (col) { return p.x >= col.x0 - 1 && p.x <= col.x1 + 1; });
      var board = isCorner(sp) ? boards[left ? 1 : 0] : boards[Math.max(0, ci) + (left ? 0 : 1)];
      if (board) {
        var hy = p.y - (board.base ?? base);
        hole(board, hy - S32.plateSpread / 20, S32.setback / 10, S32.pin, S32.pinDepth, "plate", isCorner(sp) ? "B" : left ? "A" : "B");
        hole(board, hy + S32.plateSpread / 20, S32.setback / 10, S32.pin, S32.pinDepth, "plate", isCorner(sp) ? "B" : left ? "A" : "B");
      }
    });
    (L.handleMounts || []).filter(function(m){return m.unit===front.unit;}).forEach(function(m){
      hole(door, m.y-front.y0, left ? m.x-front.x0 : front.x1-m.x, S32.pin, 0, "handle");
    });
  });

  return out.filter(function (e) {
    return e.holes.length || e.rejectedHoles.length;
  });
}

export { addHandle, countHardware, foldingLeaf };
