// Core furniture catalog definitions (FURN) + variant accessors.
import {
  CAB, ISL, TOP, STEEL, DARK, GLASS, HANDLE, FABRIC, WOOD, BEDC, TVB,
  GREEN, RUGC, PVC_WHITE, BLACK_PLASTIC, ALUMINUM, WATER, TUFF, MOUNTH, WALL_H, WALL_T,
} from "./state.js";
import { box, cyl, sph, lathe, tube, torus, drape } from "./primitives.js";
import { buildCab } from "./cabinet_mesh.js";
import { getLang } from "./i18n.js";
import {
  handleBar, upholstered, legsUnder, slabWithHoles, basin, gooseneck,
  pull, front, toeKick, slab, leg, glassPanel, slats, METAL,
} from "./furniture_helpers.js";

function smartOn(it, fallback) {
  if (!it || !it.smart) return fallback !== undefined ? fallback : true;
  if (it.smart.on === false) return false;
  if (it.smart.hvacMode === "off") return false;
  return it.smart.on !== undefined ? !!it.smart.on : fallback !== undefined ? fallback : true;
}
export { smartOn };

/* An NFT growing channel lying along x — a round pipe on saddle clips, or a
   square gully sitting flat — capped both ends, fed at one end and drained
   at the other, with a planted net cup every `step` cm along the top. */
function nftChannel(g, it, R, step, cupR, square) {
  var hw = it.w / 2, hd = it.d / 2, cy = it.h / 2, top = square ? it.h : cy + R, i = 0;
  if (square) box(g, -hw + 1.2, hw - 1.2, 0, it.h, -hd, hd, PVC_WHITE, { rough: 0.45, radius: 1 });
  else cyl(g, 0, cy, 0, R, it.w - 2.4, PVC_WHITE, { rough: 0.45, seg: 24, rz: Math.PI / 2 });
  [-1, 1].forEach(function (s) {
    if (square)
      box(g, s * hw - (s > 0 ? 1.2 : 0), s * hw + (s < 0 ? 1.2 : 0), -0.2, it.h + 0.3, -hd - 0.3, hd + 0.3, 0xe4e8ea, { rough: 0.5, radius: 0.5 });
    else {
      cyl(g, s * (hw - 0.6), cy, 0, R + 0.4, 1.2, 0xe4e8ea, { rough: 0.5, seg: 24, rz: Math.PI / 2 });
      var cx = s * hw * 0.55;
      box(g, cx - 1.6, cx + 1.6, 0, Math.max(0.6, cy - R * 0.55), -R * 0.95, R * 0.95, BLACK_PLASTIC, { rough: 0.8, radius: 0.3 });
    }
  });
  cyl(g, -hw - 1.4, top - Math.min(R, it.h / 2) * 0.5, 0, 0.8, 3, 0x2b3236, { rough: 0.6, seg: 10, rz: Math.PI / 2 }); // feed line
  cyl(g, hw + 1.4, Math.max(1.4, top - Math.min(R, it.h / 2) * 1.5), 0, Math.max(1, R * 0.3), 3, PVC_WHITE, { rough: 0.45, seg: 14, rz: Math.PI / 2 }); // drain
  for (var x = -hw + step; x <= hw - step + 0.01; x += step, i++) {
    lathe(g, x, top, 0, [[0, -cupR * 1.4], [cupR * 0.7, -cupR * 1.4], [cupR, -0.2], [cupR + 0.8, -0.2], [cupR + 0.8, 0.4], [0, 0.4]], BLACK_PLASTIC, { rough: 0.8, seg: 14 });
    var lf = sph(g, x, top + cupR * 0.9, 0, cupR * (1.2 + (i % 3) * 0.18), GREEN, { rough: 0.8, seg: 12, segV: 8 });
    if (lf) lf.scale.y = 0.6;
  }
}

export const FURN = {
  base: {
    label: "ארון בסיס",
    w: 60,
    d: 60,
    h: 90,
    col: "#ece5d6",
    build: function (g, it) {
      /* Base unit: recessed toe-kick, carcass, a drawer over one or two doors
         (a pair of drawers on a wide unit), every front on a shadow reveal, and
         a worktop with a softened nosing overhanging the doors. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, toe = 10, cy1 = it.h - 4, zf = hd - 2,
        hs = V.handle || "bar", dH = it.w > 45 ? 17 : 0;
      toeKick(g, -hw, hw, toe, -hd, hd);
      box(g, -hw, hw, toe, cy1, -hd, zf, CAB, { rough: 0.72, sharp: true });
      if (dH) {
        var nd = it.w > 80 ? 2 : 1;
        for (var i = 0; i < nd; i++)
          front(g, -hw + (i * it.w) / nd, -hw + ((i + 1) * it.w) / nd, cy1 - dH, cy1, zf, CAB, { kind: "drawer", handle: hs, shaker: V.shaker });
      }
      var doors = it.w > 60 ? 2 : 1;
      for (var j = 0; j < doors; j++)
        front(g, -hw + (j * it.w) / doors, -hw + ((j + 1) * it.w) / doors, toe, cy1 - dH, zf, CAB, {
          kind: "door", hinge: doors === 2 ? (j ? 1 : -1) : -1, handle: hs, handleAt: "top", shaker: V.shaker,
        });
      slab(g, -hw - 0.5, hw + 0.5, cy1, it.h, -hd, hd + 2, TOP);
    },
  },
  tall: {
    label: "ארון גבוה",
    w: 60,
    d: 60,
    h: 210,
    col: "#d7c4a3",
    build: function (g, it) {
      /* Tall larder: a short door over the plinth and a long one above, split
         at worktop height the way a real larder hangs, handles meeting at the
         split; a pair of doors each when the unit is wide. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, toe = 10, zf = hd - 2, hs = V.handle || "bar",
        split = Math.min(it.h - 30, 90), cols = it.w > 65 ? 2 : 1;
      toeKick(g, -hw, hw, toe, -hd, hd);
      box(g, -hw, hw, toe, it.h, -hd, zf, CAB, { rough: 0.7, sharp: true });
      for (var c = 0; c < cols; c++) {
        var x0 = -hw + (c * it.w) / cols, x1 = -hw + ((c + 1) * it.w) / cols, hinge = cols === 2 ? (c ? 1 : -1) : -1;
        front(g, x0, x1, toe, split, zf, CAB, { kind: "door", hinge: hinge, handle: hs, handleAt: "top", shaker: V.shaker });
        front(g, x0, x1, split, it.h, zf, CAB, { kind: "door", hinge: hinge, handle: hs, handleAt: "bottom", shaker: V.shaker });
      }
      box(g, -hw, hw, it.h - 0.8, it.h, -hd, zf + 1.8, CAB, { rough: 0.7, sharp: true }); // top rail
    },
  },
  island: {
    label: "אי",
    w: 130,
    d: 85,
    h: 90,
    col: "#c8b896",
    build: function (g, it) {
      /* Kitchen island: waterfall ends in the worktop stone, drawer stacks on
         the working side, and a knee-space overhang on the seating side. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, toe = 10, cy1 = it.h - 4, zf = hd - 2, wf = 4,
        knee = Math.min(14, it.d * 0.2), hs = V.handle || "bar";
      toeKick(g, -hw + wf, hw - wf, toe, -hd + knee, hd);
      box(g, -hw + wf, hw - wf, toe, cy1, -hd + knee, zf, ISL, { rough: 0.72, sharp: true });
      var cols = Math.max(2, Math.round((it.w - 2 * wf) / 60)), cw = (it.w - 2 * wf) / cols, rows = [0.24, 0.34, 0.42];
      for (var c = 0; c < cols; c++) {
        var y = cy1;
        for (var r = 0; r < rows.length; r++) {
          var h = (cy1 - toe) * rows[r];
          front(g, -hw + wf + c * cw, -hw + wf + (c + 1) * cw, y - h, y, zf, ISL, { kind: "drawer", handle: hs });
          y -= h;
        }
      }
      box(g, -hw, -hw + wf, 0, cy1, -hd, hd, TOP, { rough: 0.3, metal: 0.04, radius: 0.5 });
      box(g, hw - wf, hw, 0, cy1, -hd, hd, TOP, { rough: 0.3, metal: 0.04, radius: 0.5 });
      slab(g, -hw, hw, cy1, it.h, -hd, hd, TOP);
    },
  },
  // Real sink: the counter and the cabinet top are punched, and the bowl is
  // built as walls + floor + drain, so it is an actual recess you can see into
  // (it used to be a flat plate laid on the worktop).
  sink: {
    label: "כיור",
    w: 80,
    d: 60,
    h: 90,
    col: "#dbe2e4",
    build: function (g, it) {
      /* Sink base: the bowl(s) are real holes in the worktop with a basin hung
         inside; below, the carcass carries a false front over one or two doors on
         shadow reveals (a farmhouse apron replaces the false front). */
      var V = vspec(it),
        style = V.style || "inset",
        bowls = V.bowls || 1,
        bcol = V.bowlCol != null ? V.bowlCol : 0x9aa4a9,
        bmat = { metal: V.bowlMetal != null ? V.bowlMetal : 0.65, rough: V.bowlRough != null ? V.bowlRough : 0.26 },
        hw = it.w / 2,
        hd = it.d / 2,
        topT = 4,
        cy0 = it.h - topT, // underside of the worktop
        toe = 8,
        zf = hd - 2,
        hs = V.handle || "bar",
        nd = it.w > 60 ? 2 : 1;
      function doors(y0, y1) {
        for (var j = 0; j < nd; j++)
          front(g, -hw + (j * it.w) / nd, -hw + ((j + 1) * it.w) / nd, y0, y1, zf, CAB, {
            kind: "door", hinge: nd === 2 ? (j ? 1 : -1) : -1, handle: hs, handleAt: "top", shaker: V.shaker,
          });
      }
      toeKick(g, -hw, hw, toe, -hd, hd);

      if (style === "vessel") {
        // bathroom vanity: solid top, round basin standing on it
        box(g, -hw, hw, toe, cy0, -hd, zf, CAB, { rough: 0.72, sharp: true });
        front(g, -hw, hw, cy0 - 16, cy0, zf, CAB, { kind: "drawer", handle: hs, shaker: V.shaker });
        doors(toe, cy0 - 16);
        slab(g, -hw - 1.5, hw + 1.5, cy0, it.h, -hd - 1.5, hd + 1.5, TOP, { rough: 0.35 });
        var br = Math.min(hw - 6, hd - 6, 20),
          bh = V.depth || 13;
        // a turned bowl: rolled rim, curved wall, flat foot — seen from inside too
        lathe(g, 0, it.h, 2, [[br * 0.42, 0], [br * 0.7, bh * 0.2], [br * 0.93, bh * 0.62], [br, bh - 0.8], [br - 0.4, bh], [br - 1.3, bh - 0.4], [br * 0.86, bh * 0.6], [br * 0.6, 1.4], [0, 1.2]],
          bcol, { metal: 0.03, rough: 0.2, seg: 40 });
        cyl(g, 0, it.h + 1.5, 2, 2.6, 0.7, 0xc6cccf, { metal: 0.9, rough: 0.14, seg: 20 });
        gooseneck(g, 0, it.h, -hd + 8, Math.max(12, hd - 6), 20, 0xc9cfd2, 1.5);
        return;
      }

      var apron = style === "farmhouse";
      var depth = V.depth || (apron ? 24 : 19);
      var bz0 = -hd + (apron ? 7 : 10),
        bz1 = hd - (apron ? -1.5 : 8);
      var bTop = it.h,
        bBot = bTop - topT - depth;
      // bowl footprint(s), left → right
      var holes = [];
      if (bowls > 1) {
        var span = Math.min(it.w - 16, 96),
          gapW = 3,
          bw = (span - gapW) / 2;
        holes.push({ x0: -span / 2, x1: -span / 2 + bw, z0: bz0, z1: bz1 });
        holes.push({ x0: span / 2 - bw, x1: span / 2, z0: bz0, z1: bz1 });
      } else {
        var half = Math.min(hw - (apron ? 5 : 10), apron ? 34 : 27);
        holes.push({ x0: -half, x1: half, z0: bz0, z1: bz1 });
      }

      // carcass: solid below the bowl, strips around it above
      var cTop = Math.max(toe + 2, bBot - 2);
      box(g, -hw, hw, toe, cTop, -hd, zf, CAB, { rough: 0.72, sharp: true });
      slabWithHoles(g, -hw, hw, cTop, cy0, -hd, Math.min(zf, bz1), holes, CAB, { rough: 0.72, skipFront: apron });
      if (!apron) box(g, -hw, hw, cTop, cy0, bz1, zf, CAB, { rough: 0.72, sharp: true });
      if (apron) doors(toe, cTop);
      else {
        front(g, -hw, hw, cy0 - 15, cy0, zf, CAB, { kind: "drawer", handle: "none", shaker: V.shaker }); // false front
        doors(toe, cy0 - 15);
      }

      // worktop, punched for the bowls
      slabWithHoles(g, -hw - 1.5, hw + 1.5, cy0, it.h, -hd - 1.5, hd + 1.5, holes, TOP, {
        metal: 0.05,
        rough: 0.35,
        skipFront: apron,
      });

      holes.forEach(function (h) {
        basin(g, h.x0, h.x1, h.z0, h.z1, bTop, topT + depth, bcol, bmat);
      });
      if (apron) {
        // the basin's own front wall is the visible apron — thicken it
        box(g, holes[0].x0 - 1.5, holes[holes.length - 1].x1 + 1.5, bBot - 1.4, bTop, bz1 - 3, bz1 + 1.5, bcol, {
          metal: bmat.metal,
          rough: bmat.rough,
          radius: 0.8,
        });
      }
      // mixer tap behind the bowl(s), arcing out to the bowl centre
      var fz = bz0 - 5.5,
        reach = Math.max(12, (bz0 + bz1) / 2 - fz);
      gooseneck(g, bowls > 1 ? 0 : (holes[0].x0 + holes[0].x1) / 2, it.h, fz, reach, 16);
    },
  },
  cooktop: {
    label: "כיריים",
    w: 60,
    d: 60,
    h: 90,
    col: "#cfd4d6",
    build: function (g, it) {
      /* Hob over a pan-drawer base: a black glass-ceramic plate set into the
         worktop, four cooking zones (two large, two small) and a touch strip. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, toe = 10, cy1 = it.h - 4, zf = hd - 2, hs = V.handle || "bar";
      toeKick(g, -hw, hw, toe, -hd, hd);
      box(g, -hw, hw, toe, cy1, -hd, zf, CAB, { rough: 0.72, sharp: true });
      var mid = toe + (cy1 - toe) * 0.46;
      front(g, -hw, hw, mid, cy1, zf, CAB, { kind: "drawer", handle: hs });
      front(g, -hw, hw, toe, mid, zf, CAB, { kind: "drawer", handle: hs });
      slab(g, -hw - 0.5, hw + 0.5, cy1, it.h, -hd, hd + 2, TOP);
      var px = Math.min(hw - 3, 29), pz = Math.min(hd - 5, 26);
      box(g, -px, px, it.h, it.h + 0.6, -pz, pz, DARK, { metal: 0.3, rough: 0.06, radius: 0.3 });
      [[-1, -1, 9.5], [1, -1, 7], [-1, 1, 7], [1, 1, 9.5]].forEach(function (z) {
        var zx = z[0] * px * 0.5, zz = z[1] * pz * 0.45 - 2;
        cyl(g, zx, it.h + 0.66, zz, z[2], 0.12, 0x5a6064, { metal: 0.2, rough: 0.3, seg: 40, cast: false });
        cyl(g, zx, it.h + 0.72, zz, z[2] - 0.7, 0.12, DARK, { metal: 0.3, rough: 0.06, seg: 40, cast: false });
        cyl(g, zx, it.h + 0.78, zz, z[2] * 0.45, 0.1, 0x4b5155, { metal: 0.2, rough: 0.3, seg: 32, cast: false });
      });
      for (var k = 0; k < 5; k++)
        box(g, -12 + k * 6 - 0.9, -12 + k * 6 + 0.9, it.h + 0.62, it.h + 0.7, pz - 5, pz - 3.2, 0x8a9296, { rough: 0.4, cast: false });
    },
  },
  oven: {
    label: "תנור",
    w: 60,
    d: 60,
    h: 90,
    col: "#c9ccce",
    build: function (g, it) {
      /* Built-in oven under the worktop: a steel fascia with two knobs and a
         clock, a framed dark-glass door with a full-width bar, and a storage
         drawer in the plinth zone. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, toe = 10, cy1 = it.h - 4, zf = hd - 2, hs = V.handle || "bar",
        oy0 = toe + 16, oy1 = cy1 - 1;
      toeKick(g, -hw, hw, toe, -hd, hd);
      box(g, -hw, hw, toe, cy1, -hd, zf, CAB, { rough: 0.72, sharp: true });
      front(g, -hw, hw, toe, oy0, zf, CAB, { kind: "drawer", handle: hs });
      box(g, -hw + 0.8, hw - 0.8, oy0 + 0.4, oy1, zf, zf + 1.4, STEEL, { metal: 0.6, rough: 0.3, radius: 0.4 });
      box(g, -hw + 1.5, hw - 1.5, oy1 - 10, oy1 - 1.2, zf + 1.4, zf + 1.8, 0x1f2427, { metal: 0.3, rough: 0.2 });
      [-1, 1].forEach(function (s) {
        cyl(g, s * hw * 0.6, oy1 - 5.6, zf + 2.6, 1.9, 1.8, STEEL, { metal: 0.7, rough: 0.25, rx: Math.PI / 2, seg: 20 });
      });
      box(g, -5, 5, oy1 - 7.5, oy1 - 3.5, zf + 1.8, zf + 1.9, 0x0b1216, { emis: 0x4fb3e0, cast: false });
      glassPanel(g, -hw + 4, hw - 4, oy0 + 3, oy1 - 13, zf + 1.4);
      box(g, -hw + 10, hw - 10, oy0 + 8, oy1 - 19, zf + 1.9, zf + 2.0, 0x2c363b, { metal: 0.2, rough: 0.05 });
      pull(g, 0, oy1 - 15, zf + 1.9, it.w * 0.72, false, "bar", STEEL);
      slab(g, -hw - 0.5, hw + 0.5, cy1, it.h, -hd, hd + 2, TOP);
    },
  },
  dishwasher: {
    label: "מדיח",
    w: 60,
    d: 60,
    h: 90,
    col: "#cfd4d6",
    build: function (g, it) {
      /* Dishwasher: a stainless door with a recessed control strip across its
         top edge, a full-width bar and a status light. */
      var hw = it.w / 2, hd = it.d / 2, toe = 10, cy1 = it.h - 4, zf = hd - 2;
      toeKick(g, -hw, hw, toe, -hd, hd);
      box(g, -hw, hw, toe, cy1, -hd, zf, CAB, { rough: 0.72, sharp: true });
      box(g, -hw + 0.4, hw - 0.4, toe + 0.4, cy1 - 0.4, zf, zf + 1.8, STEEL, { metal: 0.55, rough: 0.34, radius: 0.5 });
      box(g, -hw + 1, hw - 1, cy1 - 8, cy1 - 1, zf + 1.8, zf + 2.1, 0x2a3034, { metal: 0.3, rough: 0.25 });
      for (var k = 0; k < 4; k++) cyl(g, hw - 7 - k * 4, cy1 - 4.5, zf + 2.2, 0.8, 0.3, 0x8a9296, { metal: 0.6, rough: 0.3, rx: Math.PI / 2, seg: 12, cast: false });
      box(g, -hw + 3, -hw + 6, cy1 - 5.2, cy1 - 3.8, zf + 2.1, zf + 2.2, 0x0b1216, smartOn(it, false) ? { emis: 0x44c8ff, cast: false } : { rough: 0.4, cast: false });
      pull(g, 0, cy1 - 13, zf + 1.8, it.w * 0.72, false, "bar", STEEL);
      slab(g, -hw - 0.5, hw + 0.5, cy1, it.h, -hd, hd + 2, TOP);
    },
  },
  fridge: {
    label: "מקרר",
    w: 70,
    d: 70,
    h: 185,
    col: "#d7c4a3",
    build: function (g, it) {
      /* Refrigerator: French doors over a freezer drawer on a wide unit (a
         single door otherwise), full-height bar handles, a water and ice
         dispenser in the left door, and a kick grille on four levelling feet. */
      var hw = it.w / 2, hd = it.d / 2, body = 0xbcc3c7, bm = { metal: 0.45, rough: 0.3 }, dz = hd - 5,
        fy = Math.round(it.h * 0.36), french = it.w >= 75;
      box(g, -hw + 0.3, hw - 0.3, 3, it.h, -hd, dz, body, { metal: 0.45, rough: 0.3, radius: 1 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        cyl(g, p[0] * (hw - 4), 1.5, p[1] * (hd - 8), 1.6, 3, DARK, { rough: 0.6, seg: 10 });
      });
      slats(g, -hw + 3, hw - 3, 3.5, 10, dz, 3, 0x2a2f33);
      box(g, -hw + 0.2, hw - 0.2, 11, fy, dz, hd, body, { metal: 0.45, rough: 0.3, radius: 1.2 });
      pull(g, 0, fy - 6, hd, it.w * 0.6, false, "bar", STEEL);
      if (french) {
        [-1, 1].forEach(function (s) {
          box(g, s < 0 ? -hw + 0.2 : 0.25, s < 0 ? -0.25 : hw - 0.2, fy + 0.5, it.h - 0.3, dz, hd, body, { metal: 0.45, rough: 0.3, radius: 1.2 });
          pull(g, s * 3.2, fy + 0.5 + (it.h - fy) * 0.45, hd, (it.h - fy) * 0.6, true, "bar", STEEL);
        });
        box(g, -hw + 7, -hw + 21, fy + 30, fy + 58, hd, hd + 0.3, 0x1c2124, { metal: 0.3, rough: 0.2 });
        box(g, -hw + 9, -hw + 19, fy + 38, fy + 40, hd + 0.3, hd + 1.4, 0x6f777c, { metal: 0.5, rough: 0.3 });
      } else {
        box(g, -hw + 0.2, hw - 0.2, fy + 0.5, it.h - 0.3, dz, hd, body, { metal: 0.45, rough: 0.3, radius: 1.2 });
        pull(g, hw - 4, fy + 0.5 + (it.h - fy) * 0.45, hd, (it.h - fy) * 0.55, true, "bar", STEEL);
      }
    },
  },
  wardrobe: {
    label: "ארון בגדים",
    w: 100,
    d: 60,
    h: 210,
    col: "#d7c4a3",
    build: function (g, it) {
      /* Wardrobe on a recessed plinth under a cornice. Hinged: a door per
         ~50 cm with long bar handles meeting in pairs. Sliding: two framed
         panels on top and bottom tracks (mirror glass as a variant). Open: a
         walk-in bay with a rail of hung garments, a shelf and shoes. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, style = V.style || "hinged", toe = 6, zf = hd - 2;
      if (style === "open") {
        box(g, -hw, -hw + 2, 0, it.h, -hd, hd, CAB, { rough: 0.7, radius: 0.3 });
        box(g, hw - 2, hw, 0, it.h, -hd, hd, CAB, { rough: 0.7, radius: 0.3 });
        box(g, -hw, hw, 0, toe, -hd, hd - 3, CAB, { rough: 0.7, sharp: true });
        box(g, -hw, hw, it.h - 3, it.h, -hd, hd, CAB, { rough: 0.7, radius: 0.3 });
        box(g, -hw, hw, 0, it.h, -hd, -hd + 1.5, 0xb5a68b, { rough: 0.8, sharp: true });
        var sy = it.h - 34;
        box(g, -hw + 2, hw - 2, sy, sy + 2.5, -hd + 2, hd - 2, CAB, { rough: 0.7, radius: 0.3 });
        cyl(g, 0, sy - 6, 0, 1.2, it.w - 5, HANDLE, { metal: 0.85, rough: 0.25, seg: 12, rz: Math.PI / 2 });
        var cols = [0x6f7a86, 0x8a6a5a, 0xd9d2c3, 0x6a7a62, 0x3f464b, 0x7a6a86, 0xb9a58a];
        var n = Math.max(3, Math.floor((it.w - 10) / 9));
        for (var i = 0; i < n; i++) {
          var gx = -hw + 7 + (i * (it.w - 14)) / (n - 1), len = 60 + ((i * 37) % 45);
          cyl(g, gx, sy - 8.5, 0, 0.35, hd * 1.2, HANDLE, { metal: 0.8, rough: 0.3, seg: 6, rx: Math.PI / 2 }); // hanger
          box(g, gx - 1.8, gx + 1.8, sy - 9 - len, sy - 9, -hd * 0.62, hd * 0.62, cols[i % cols.length], { rough: 0.95, radius: 1.5 });
        }
        for (var k = 0; k < Math.floor((it.w - 10) / 22); k++) {
          var sx = -hw + 8 + k * 22;
          box(g, sx, sx + 9, toe, toe + 8, -hd + 8, hd - 10, k % 2 ? 0x3a302a : 0x8a5a34, { rough: 0.5, radius: 2 });
        }
        for (var b = 0; b < 3; b++) box(g, -hw + 6 + b * 26, -hw + 28 + b * 26, sy + 2.5, sy + 16 + (b % 2) * 6, -hd + 6, hd - 8, [0xd8cfbf, 0x9aa6a8, 0xc9b79a][b], { rough: 0.9, radius: 1.5 });
        return;
      }
      box(g, -hw, hw, 0, toe, -hd, hd - 4, 0x3b3936, { rough: 0.85, sharp: true });
      box(g, -hw, hw, toe, it.h - 4, -hd, zf, CAB, { rough: 0.7, sharp: true });
      box(g, -hw - 0.5, hw + 0.5, it.h - 4, it.h, -hd, hd + 1, CAB, { rough: 0.7, radius: 0.5 }); // cornice
      var dcol = V.doorCol != null ? V.doorCol : CAB;
      if (style === "sliding") {
        var dOpt = { rough: V.doorRough != null ? V.doorRough : 0.35, metal: V.doorMetal, radius: 0.3 };
        box(g, -hw, hw, toe, toe + 1.5, zf, hd, 0x8a8f92, { metal: 0.8, rough: 0.3, sharp: true }); // bottom track
        box(g, -hw, hw, it.h - 5.5, it.h - 4, zf, hd, 0x8a8f92, { metal: 0.8, rough: 0.3, sharp: true }); // top track
        [[-hw + 0.5, 1, zf + 0.2], [-1, hw - 0.5, zf + 1.8]].forEach(function (p) {
          var x0 = p[0], x1 = p[1], z = p[2];
          box(g, x0, x1, toe + 1.5, it.h - 5.5, z, z + 1.4, 0x8a8f92, { metal: 0.8, rough: 0.3, sharp: true }); // frame
          box(g, x0 + 2.5, x1 - 2.5, toe + 4, it.h - 8, z + 1.4, z + 1.7, dcol, V.mirrorDoor ? { metal: 0.95, rough: 0.04 } : dOpt);
          box(g, x0 + 0.6, x0 + 2.2, it.h * 0.4, it.h * 0.6, z + 1.4, z + 2.2, 0x6f7477, { metal: 0.8, rough: 0.3, sharp: true }); // grip profile
        });
        return;
      }
      var nd = Math.max(1, Math.round(it.w / 50));
      for (var d = 0; d < nd; d++) {
        var hinge = nd === 1 ? -1 : d % 2 === 0 ? -1 : 1;
        front(g, -hw + (d * it.w) / nd, -hw + ((d + 1) * it.w) / nd, toe, it.h - 4, zf, dcol, {
          kind: "door", hinge: hinge, handle: V.handle || "bar", rough: V.doorRough, metal: V.doorMetal, shaker: V.shaker,
        });
      }
    },
  },
  /* The modular cabinet: carcass, division, doors, drawers, shelves and
     hardware all come from `it.cab` (see cabinet.js), which is generated from
     a preset and re-flows whenever the piece is resized. Everything else in
     this catalogue is a fixed model; this one is a system. */
  cabsys: {
    label: "ארון מודולרי",
    w: 200,
    d: 60,
    h: 240,
    col: "#d7c4a3",
    build: function (g, it) {
      buildCab(g, it);
    },
  },
  sofa: {
    label: "ספה",
    w: 200,
    d: 90,
    h: 80,
    col: "#9aa6a8",
    build: function (g, it) {
      upholstered(g, it, vspec(it), 14);
    },
  },
  armchair: {
    label: "כורסה",
    w: 90,
    d: 90,
    h: 80,
    col: "#9aa6a8",
    build: function (g, it) {
      upholstered(g, it, vspec(it), 12);
    },
  },
  bed: {
    label: "מיטה",
    w: 160,
    d: 200,
    h: 50,
    col: "#ece7dd",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        base = V.platform ? 0 : 12, // platform beds sit straight on the floor
        frameT = 28,
        hbH = V.headboard != null ? V.headboard : 30,
        soft = { rough: 0.95 };
      if (base) legsUnder(g, it, V.legs || "wood", base, 8, V.legCol);
      box(g, -hw, hw, base, base + frameT, -hd, hd, WOOD, { rough: 0.6, radius: 1.5 }); // frame
      if (V.drawers) {
        // storage drawers along the visible side
        for (var dz = 0; dz < 2; dz++) {
          var z0 = -hd + 14 + dz * (it.d * 0.42);
          box(g, hw - 0.6, hw + 1, base + 4, base + frameT - 4, z0, z0 + it.d * 0.36, WOOD, {
            rough: 0.55,
          });
          box(g, hw + 1, hw + 1.8, base + frameT / 2 - 1, base + frameT / 2 + 1, z0 + 8, z0 + it.d * 0.36 - 8, HANDLE, {
            metal: 0.8, rough: 0.3,
          });
        }
      }
      var mT = base + frameT + 20;
      box(g, -hw + 3, hw - 3, base + frameT, mT, -hd + 3, hd - 3, BEDC, { rough: 0.95, radius: 5 }); // mattress
      // headboard: plain panel, upholstered, or four-poster with a canopy
      if (V.posts) {
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
          box(g, p[0] * hw - 4, p[0] * hw + 4, 0, 200, p[1] * hd - 4, p[1] * hd + 4, WOOD, {
            rough: 0.55,
          });
        });
        [-1, 1].forEach(function (s) {
          box(g, -hw - 4, hw + 4, 196, 200, s * hd - 4, s * hd + 4, WOOD, { rough: 0.55 });
        });
        box(g, -hw - 4, -hw + 4, 196, 200, -hd, hd, WOOD, { rough: 0.55 });
        box(g, hw - 4, hw + 4, 196, 200, -hd, hd, WOOD, { rough: 0.55 });
      }
      box(g, -hw, hw, base + frameT, base + frameT + hbH + 22, -hd, -hd + (V.upholsteredHb ? 12 : 6),
        V.upholsteredHb ? FABRIC : WOOD,
        V.upholsteredHb ? { rough: 0.95, radius: 4, crown: 1.5, crownAxis: "z" } : { rough: 0.6, radius: 1.5 });
      /* Made bed: a duvet that drapes over the sides and the foot, turned
         down at the head, pillows standing against the headboard and a throw
         across the foot — what a bed is recognised by from above. */
      var duvT = mT + 4, dz0 = -hd + 52, lip = 3;
      box(g, -hw - lip, hw + lip, mT - 16, duvT, dz0, hd + lip, BEDC, { rough: 0.97, radius: 4, crown: 2.5 });
      box(g, -hw - lip + 0.5, hw + lip - 0.5, mT - 15, duvT + 1.2, dz0 - 12, dz0 + 4, 0xf7f4ee, {
        rough: 0.97, radius: 3, crown: 1,
      }); // the turned-down fold
      var nP = it.w >= 140 ? 2 : 1, pw = (it.w - 16) / nP;
      for (var pi = 0; pi < nP; pi++) {
        var px0 = -hw + 8 + pi * pw;
        var pl = box(g, px0 + 1, px0 + pw - 1, mT - 2, mT + 14, -hd + 6, -hd + 24, 0xfbf9f4, {
          rough: 0.97, radius: 6, crown: 3, crownAxis: "z",
        });
        if (pl) pl.rotation.x = -0.35;
      }
      if (it.w >= 140) {
        // accent cushion in front of the pillows
        var ac = box(g, -it.w * 0.2, it.w * 0.2, mT, mT + 26, -hd + 24, -hd + 36, V.throwCol != null ? V.throwCol : 0xb9a58a, {
          rough: 0.97, radius: 6, crown: 3, crownAxis: "z",
        });
        if (ac) ac.rotation.x = -0.28;
      }
      // folded throw over the foot
      box(g, -hw - lip - 1, hw + lip + 1, mT - 10, duvT + 1.6, hd - 46, hd + lip + 1,
        V.throwCol != null ? V.throwCol : 0x8e9aa3, { rough: 0.98, radius: 2.5, crown: 0.8 });
    },
  },
  table: {
    label: "שולחן",
    w: 120,
    d: 80,
    h: 75,
    col: "#9c7a4e",
    build: function (g, it) {
      /* Dining table: a top with a softened edge over aprons, on turned legs by
         default; trestle ends, a flared pedestal or a steel frame as variants;
         marble or glass tops keep their base. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, topT = V.topT || 4, base = V.base || "legs",
        topCol = V.topCol != null ? V.topCol : WOOD, legCol = V.legCol != null ? V.legCol : 0x6f5535, ty = it.h - topT;
      box(g, -hw, hw, ty, it.h, -hd, hd, topCol, {
        rough: V.topRough != null ? V.topRough : 0.45, metal: V.topMetal, trans: V.glassTop, opacity: V.glassTop ? 0.35 : 1,
        radius: V.glassTop ? null : 1.2, sharp: V.glassTop,
      });
      if (base === "trestle") {
        [-1, 1].forEach(function (s) {
          var x = s * (hw - 14);
          box(g, x - 3.5, x + 3.5, 6, ty, -4, 4, legCol, { rough: 0.55, radius: 0.8 });
          box(g, x - 4, x + 4, 0, 6, -hd + 5, hd - 5, legCol, { rough: 0.55, radius: 1.2 });
          box(g, x - 3.5, x + 3.5, ty - 6, ty, -hd + 8, hd - 8, legCol, { rough: 0.55, radius: 0.8 });
        });
        box(g, -hw + 14, hw - 14, it.h * 0.28, it.h * 0.28 + 6, -2.5, 2.5, legCol, { rough: 0.55, radius: 0.8 });
      } else if (base === "pedestal") {
        var pr = Math.min(hw, hd);
        cyl(g, 0, ty / 2 + 2, 0, 6, ty - 4, legCol, { rough: 0.5, seg: 28, r2: 8.5 });
        cyl(g, 0, 2, 0, pr * 0.55, 4, legCol, { rough: 0.5, seg: 36, r2: pr * 0.45 });
        if (it.w > it.d * 1.4) {
          [-1, 1].forEach(function (s) {
            cyl(g, s * (hw - pr * 0.8), ty / 2 + 2, 0, 5, ty - 4, legCol, { rough: 0.5, seg: 24, r2: 7 });
            cyl(g, s * (hw - pr * 0.8), 2, 0, pr * 0.45, 4, legCol, { rough: 0.5, seg: 32, r2: pr * 0.38 });
          });
        }
      } else if (base === "frame") {
        var fm = { metal: 0.8, rough: 0.35, radius: 0.4 };
        [-1, 1].forEach(function (s) {
          var x = s * (hw - 6);
          box(g, x - 2, x + 2, 0, ty, -hd + 4, -hd + 8, legCol, fm);
          box(g, x - 2, x + 2, 0, ty, hd - 8, hd - 4, legCol, fm);
          box(g, x - 2, x + 2, ty - 5, ty, -hd + 4, hd - 4, legCol, fm);
          box(g, x - 2, x + 2, 0, 4, -hd + 4, hd - 4, legCol, fm);
        });
        box(g, -hw + 6, hw - 6, ty - 5, ty, -hd + 4, -hd + 8, legCol, fm);
        box(g, -hw + 6, hw - 6, ty - 5, ty, hd - 8, hd - 4, legCol, fm);
      } else {
        var lk = V.legs === "hairpin" ? "hairpin" : V.legs === "metal" ? "metal" : V.legs === "square" ? "square" : "taper";
        if (lk === "hairpin") legsUnder(g, it, "hairpin", ty, 6, legCol);
        else [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { leg(g, p[0] * (hw - 6), p[1] * (hd - 6), 0, ty, legCol, lk); });
        box(g, -hw + 6, hw - 6, ty - 8, ty, -hd + 5, -hd + 7, topCol, { rough: 0.5, sharp: true });
        box(g, -hw + 6, hw - 6, ty - 8, ty, hd - 7, hd - 5, topCol, { rough: 0.5, sharp: true });
        box(g, -hw + 5, -hw + 7, ty - 8, ty, -hd + 6, hd - 6, topCol, { rough: 0.5, sharp: true });
        box(g, hw - 7, hw - 5, ty - 8, ty, -hd + 6, hd - 6, topCol, { rough: 0.5, sharp: true });
      }
    },
  },
  chair: {
    label: "כיסא",
    w: 45,
    d: 45,
    h: 90,
    col: "#9c7a4e",
    build: function (g, it) {
      /* Dining chair: turned (or square / steel) legs tied by aprons, a seat
         with a softened edge (a padded cushion on the upholstered variants),
         and a raked back — a solid panel, slats between stiles, or a hoop. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, seatY = V.seatY || 45, padded = !!V.padded,
        legCol = V.legCol != null ? V.legCol : 0x6f5535, frameCol = V.frameCol != null ? V.frameCol : WOOD,
        lk = V.legs === "metal" ? "metal" : V.legs === "square" ? "square" : "taper";
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) {
        leg(g, p[0] * (hw - 3), p[1] * (hd - 3), 0, seatY, legCol, lk);
      });
      [[-hw + 3, hw - 3, hd - 4, hd - 2.5], [-hw + 3, hw - 3, -hd + 2.5, -hd + 4]].forEach(function (a) {
        box(g, a[0], a[1], seatY - 8, seatY - 1, a[2], a[3], frameCol, { rough: 0.55, sharp: true });
      });
      [-1, 1].forEach(function (s) { box(g, s * (hw - 3) - 0.8, s * (hw - 3) + 0.8, seatY - 8, seatY - 1, -hd + 3, hd - 3, frameCol, { rough: 0.55, sharp: true }); });
      box(g, -hw, hw, seatY - 1, seatY + 2.5, -hd, hd, frameCol, { rough: 0.5, radius: 1.2 });
      if (padded) box(g, -hw + 0.8, hw - 0.8, seatY + 2, seatY + 7.5, -hd + 1, hd - 0.8, FABRIC, { rough: 0.95, radius: 2.5, crown: 1.2 });
      var bz = -hd + 1.5, top = it.h;
      // stiles rising from the back legs, raked back a little
      [-1, 1].forEach(function (s) {
        var st = box(g, s * (hw - 3) - 1.6, s * (hw - 3) + 1.6, seatY, top, bz - 1.6, bz + 1.6, frameCol, { rough: 0.5, radius: 0.5 });
        if (st) { st.rotation.x = -0.09; st.position.z -= 1.5; }
      });
      var back;
      if (V.backStyle === "slat") {
        for (var i = 0; i < 3; i++) {
          var y = seatY + 14 + i * ((top - seatY - 18) / 3);
          back = box(g, -hw + 4.5, hw - 4.5, y, y + 5, bz - 1, bz + 1, frameCol, { rough: 0.5, radius: 0.6 });
          if (back) { back.rotation.x = -0.09; back.position.z -= (y - seatY) * 0.09; }
        }
      } else if (V.backStyle === "hoop") {
        var hoop = cyl(g, 0, top - 4, bz - 4, hw - 2, 3.5, frameCol, { rough: 0.5, seg: 24, rx: Math.PI / 2, open: true });
        if (hoop) hoop.rotation.x = Math.PI / 2 - 0.09;
        for (var k = -1; k <= 1; k++) box(g, k * 6 - 0.8, k * 6 + 0.8, seatY + 2, top - 6, bz - 3, bz - 1.4, frameCol, { rough: 0.5, radius: 0.4 });
      } else {
        back = box(g, -hw + 2, hw - 2, seatY + 18, top - 1, bz - 1, bz + 2, padded ? FABRIC : frameCol,
          padded ? { rough: 0.95, radius: 1.8, crown: 1, crownAxis: "z" } : { rough: 0.5, radius: 1 });
        if (back) { back.rotation.x = -0.1; back.position.z -= 3; }
      }
    },
  },
  tv: {
    label: "טלוויזיה",
    w: 120,
    d: 40,
    h: 55,
    col: "#15191c",
    build: function (g, it) {
      /* TV on its console: a slim panel on a pedestal foot, a dark glossy
         screen inside a thin bezel, standing on a wood console with a shelf. */
      var hw = it.w / 2, hd = it.d / 2, on = smartOn(it, false);
      box(g, -hw, hw, 0, 30, -hd, hd, 0x6f5535, { rough: 0.5, radius: 0.8 });
      box(g, -hw + 3, hw - 3, 12, 13.5, -hd + 2, hd - 1, 0x2a2420, { rough: 0.8, sharp: true });
      var sw = it.w - 12, sh = sw * 9 / 16, y0 = 36;
      box(g, -12, 12, 30, 31, -hd + 6, -hd + 20, TVB, { metal: 0.4, rough: 0.3, radius: 0.4 });
      box(g, -3, 3, 31, y0 + 6, -hd + 9, -hd + 11, TVB, { metal: 0.4, rough: 0.3, radius: 0.4 });
      box(g, -sw / 2, sw / 2, y0, y0 + sh, -hd + 7, -hd + 10, TVB, { metal: 0.3, rough: 0.3, radius: 0.4 });
      box(g, -sw / 2 + 0.8, sw / 2 - 0.8, y0 + 0.8, y0 + sh - 0.8, -hd + 10, -hd + 10.2, on ? 0x4a90c8 : 0x1d2630,
        on ? { metal: 0.08, rough: 0.12, emis: 0x3a7ab8, sharp: true } : { metal: 0.2, rough: 0.08, sharp: true });
    },
  },
  rug: {
    label: "שטיח",
    w: 200,
    d: 140,
    h: 1,
    col: "#b88f7a",
    build: function (g, it) {
      /* Rug: a bound edge, a pile field with a woven boucle texture, and the
         variant motif — a medallion, kilim bands, a deep shag or a round rug. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, inner = V.innerCol != null ? V.innerCol : 0xcaa593,
        flat = { rough: 1, cast: false };
      if (V.round) {
        var rr = Math.min(hw, hd), sx = hw / rr;
        [cyl(g, 0, 0.6, 0, rr, 1.2, RUGC, { rough: 1, seg: 56, metal: 0, cast: false }),
          cyl(g, 0, 1.3, 0, rr - 6, 0.3, inner, { rough: 1, seg: 56, metal: 0, cast: false }),
          cyl(g, 0, 1.45, 0, rr * 0.35, 0.2, RUGC, { rough: 1, seg: 40, metal: 0, cast: false })].forEach(function (m) { if (m) m.scale.x = sx; });
        return;
      }
      box(g, -hw, hw, 0, 1.2, -hd, hd, RUGC, { rough: 1, cast: false, radius: 0.5 });
      if (V.stripes) {
        var nS = Math.max(4, Math.round(it.d / 22));
        for (var i = 0; i < nS; i += 2) {
          var z0 = -hd + 6 + (i * (it.d - 12)) / nS;
          box(g, -hw + 5, hw - 5, 1.2, 1.5, z0, z0 + (it.d - 12) / nS - 1, inner, flat);
        }
        for (var f = -1; f <= 1; f += 2) for (var t = 0; t < Math.floor(it.w / 4); t++)
          box(g, -hw + 2 + t * 4, -hw + 3 + t * 4, 0, 0.5, f * hd, f * hd + f * 4, 0xe8dfcf, flat); // fringe
        return;
      }
      if (V.shag) {
        box(g, -hw + 1, hw - 1, 1.2, 3.6, -hd + 1, hd - 1, inner, { rough: 1, cast: false, radius: 1.5, crown: 0.6 });
        return;
      }
      box(g, -hw + 8, hw - 8, 1.2, 1.5, -hd + 8, hd - 8, inner, flat);
      box(g, -hw + 12, hw - 12, 1.5, 1.6, -hd + 12, hd - 12, RUGC, flat);
      box(g, -hw + 14, hw - 14, 1.6, 1.7, -hd + 14, hd - 14, inner, flat);
      if (V.medallion) {
        var med = cyl(g, 0, 1.8, 0, Math.min(hw, hd) * 0.42, 0.2, RUGC, { rough: 1, seg: 8, cast: false });
        if (med) med.scale.x = hw / hd;
        cyl(g, 0, 1.9, 0, Math.min(hw, hd) * 0.22, 0.2, inner, { rough: 1, seg: 8, cast: false });
      }
    },
  },
  desk: {
    label: "שולחן כתיבה",
    w: 120,
    d: 60,
    h: 75,
    col: "#b9976b",
    build: function (g, it) {
      /* Writing desk: a slab end on the left, a three-drawer pedestal on the
         right, a modesty panel at the back and a cable grommet in the top. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, topT = 3, ty = it.h - topT, pw = Math.min(40, it.w * 0.34), zf = hd - 4;
      slab(g, -hw, hw, ty, it.h, -hd, hd, WOOD, { rough: 0.5, radius: 0.8 });
      box(g, -hw + 1, -hw + 4, 0, ty, -hd + 2, hd - 2, 0x6f5535, { rough: 0.55, radius: 0.5 });
      box(g, -hw + 4, hw - pw, ty - 32, ty - 1, -hd + 2, -hd + 3.8, 0x6f5535, { rough: 0.6, sharp: true });
      box(g, hw - pw, hw - 1, 1, ty, -hd + 2, zf, CAB, { rough: 0.7, sharp: true });
      box(g, hw - pw, hw - 1, 0, 1, -hd + 4, zf - 4, 0x3b3936, { rough: 0.8, sharp: true });
      var rows = [0.22, 0.3, 0.48], y = ty, H = ty - 1;
      for (var r = 0; r < rows.length; r++) {
        front(g, hw - pw, hw - 1, y - H * rows[r], y, zf, CAB, { kind: "drawer", handle: V.handle || "bar" });
        y -= H * rows[r];
      }
      cyl(g, hw - pw - 12, it.h - 0.4, -hd + 8, 3, 1, DARK, { rough: 0.5, seg: 20 });
    },
  },
  bookshelf: {
    label: "כוננית ספרים",
    w: 80,
    d: 30,
    h: 180,
    col: "#a8825a",
    build: function (g, it) {
      /* Bookcase: sides, back and shelves with softened edges; books leaning,
         standing and stacked, with the odd object between them so a shelf
         reads as lived-in rather than tiled. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, rows = V.rows || 4, cols = V.cols || 1,
        shelfCol = V.shelfCol != null ? V.shelfCol : WOOD, backCol = V.backCol != null ? V.backCol : 0x8a6a44, s, b;
      var so = { rough: 0.6, radius: 0.4 };
      box(g, -hw, -hw + 2.5, 0, it.h, -hd, hd, shelfCol, so);
      box(g, hw - 2.5, hw, 0, it.h, -hd, hd, shelfCol, so);
      box(g, -hw + 2.5, hw - 2.5, 0, 6, -hd + 2, hd - 3, 0x5a4632, { rough: 0.8, sharp: true });
      if (V.back !== false) box(g, -hw + 2.5, hw - 2.5, 6, it.h, -hd, -hd + 1.2, backCol, { rough: 0.7, sharp: true });
      var ys = [];
      for (s = 0; s <= rows; s++) {
        var y = 6 + (s * (it.h - 8.5)) / rows;
        ys.push(y + 2.5);
        box(g, -hw + 2.5, hw - 2.5, y, y + 2.5, -hd + 1.2, hd - 0.5, shelfCol, so);
      }
      for (var c = 1; c < cols; c++) {
        var vx = -hw + (c * it.w) / cols;
        box(g, vx - 1.2, vx + 1.2, 6, it.h - 2.5, -hd + 1.2, hd - 0.5, shelfCol, so);
      }
      if (V.empty) return;
      var bc = V.bookCols || [0x7a4a3a, 0x4a6a7a, 0x8a8a4a, 0x5a4a7a, 0x9a6a4a, 0xd8cfbf, 0x2f3b45, 0xa0412d];
      var cw = (it.w - 5) / cols;
      for (s = 0; s < rows; s++) {
        var y0 = ys[s], rowH = ys[s + 1] - ys[s] - 2.5;
        for (var cc = 0; cc < cols; cc++) {
          var x = -hw + 3.5 + cc * cw, xEnd = x + cw - 3, seed = s * 7 + cc * 13;
          var mode = (seed % 5);
          if (mode === 4 && cw > 30) {
            // a stack lying flat and a small vase
            for (var st = 0; st < 3; st++) box(g, x + 1, x + 20 - st * 2, y0 + st * 3, y0 + st * 3 + 2.8, -hd + 4, hd - 6, bc[(seed + st) % bc.length], { rough: 0.85 });
            cyl(g, xEnd - 6, y0 + 8, 0, 3.5, 16, 0xe9e4da, { rough: 0.3, seg: 16, r2: 2.2 });
            continue;
          }
          for (b = 0; b < 30; b++) {
            var bw = 2.2 + ((seed + b * 3) % 4), bh = Math.min(rowH - 3, 18 + ((seed * 5 + b * 7) % 11));
            if (x + bw > xEnd - (b === 0 ? 0 : 4)) break;
            var bk = box(g, x, x + bw, y0, y0 + bh, -hd + 3 + ((b * 5) % 3), hd - 5, bc[(seed + b) % bc.length], { rough: 0.85 });
            x += bw + 0.25;
            if (b === 6 + (seed % 4) && bk) {
              // the last book leans on its neighbour
              bk.rotation.z = -0.25;
              bk.position.x += bh * 0.12;
              break;
            }
          }
        }
      }
    },
  },
  nightstand: {
    label: "שידת לילה",
    w: 45,
    d: 40,
    h: 55,
    col: "#d3bd97",
    build: function (g, it) {
      /* Bedside table: tapered legs, two drawers on shadow reveals, an
         overhanging top with a softened edge. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, legH = Math.min(14, it.h * 0.22), zf = hd - 2, top = it.h - 2.5;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        leg(g, p[0] * (hw - 3.5), p[1] * (hd - 3.5), 0, legH + 1, WOOD, "taper");
      });
      box(g, -hw + 1, hw - 1, legH, top, -hd + 1, zf, CAB, { rough: 0.7, sharp: true });
      var mid = legH + (top - legH) * 0.5;
      front(g, -hw + 1, hw - 1, mid, top, zf, CAB, { kind: "drawer", handle: V.handle || "bar" });
      front(g, -hw + 1, hw - 1, legH, mid, zf, CAB, { kind: "drawer", handle: V.handle || "bar" });
      slab(g, -hw, hw, top, it.h, -hd, hd, CAB, { rough: 0.6, radius: 0.8 });
    },
  },
  dresser: {
    label: "שידה",
    w: 100,
    d: 45,
    h: 80,
    col: "#d3bd97",
    build: function (g, it) {
      /* Chest of drawers: graduated full-width drawers under a top row that
         splits into two on a wide chest, on turned legs, with an overhanging
         top. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, legH = 10, zf = hd - 2, top = it.h - 3, hs = V.handle || "bar";
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        leg(g, p[0] * (hw - 4), p[1] * (hd - 4), 0, legH + 1, WOOD, "taper");
      });
      box(g, -hw + 1, hw - 1, legH, top, -hd + 1, zf, CAB, { rough: 0.7, sharp: true });
      var H = top - legH, rows = [0.37, 0.34, 0.29], y = legH;
      for (var r = 0; r < rows.length; r++) {
        var y1 = y + H * rows[r];
        if (r === rows.length - 1 && it.w >= 80) {
          front(g, -hw + 1, 0, y, y1, zf, CAB, { kind: "drawer", handle: hs });
          front(g, 0, hw - 1, y, y1, zf, CAB, { kind: "drawer", handle: hs });
        } else front(g, -hw + 1, hw - 1, y, y1, zf, CAB, { kind: "drawer", handle: hs });
        y = y1;
      }
      slab(g, -hw, hw, top, it.h, -hd, hd, CAB, { rough: 0.6, radius: 0.8 });
    },
  },
  toilet: {
    label: "אסלה",
    w: 40,
    d: 65,
    h: 78,
    col: "#eef0f2",
    build: function (g, it) {
      /* WC: an egg-shaped bowl on a tapering foot (or cantilevered off a tiled
         duct when wall-hung), a closed soft-close lid over the seat, a
         rounded cistern with a chrome dual-flush button. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2,
        cer = V.cerCol != null ? V.cerCol : 0xf0f2f4, cerR = V.cerRough != null ? V.cerRough : 0.3,
        wall = !!V.wallHung, seatY = wall ? 40 : 38, bz0 = -hd + (wall ? 18 : 16), bz1 = hd - 1,
        bcz = (bz0 + bz1) / 2, brx = hw - 1.5, brz = (bz1 - bz0) / 2;
      if (wall) {
        box(g, -hw - 4, hw + 4, 0, it.h + 22, -hd, -hd + 18, V.ductCol != null ? V.ductCol : 0xe4e7e9, { rough: 0.5, radius: 0.5 });
        box(g, -11, 11, it.h + 4, it.h + 18, -hd + 18, -hd + 18.6, 0xc9ced1, { metal: 0.6, rough: 0.25, radius: 0.4 });
        [-4.5, 4.5].forEach(function (x) { box(g, x - 3.8, x + 3.8, it.h + 6, it.h + 16, -hd + 18.6, -hd + 19, 0xdde2e5, { metal: 0.5, rough: 0.3, radius: 0.3 }); });
      } else {
        box(g, -hw + 1, hw - 1, seatY + 2, it.h - 2, -hd, -hd + 15, cer, { rough: cerR, radius: 3 }); // cistern
        box(g, -hw + 0.5, hw - 0.5, it.h - 2, it.h, -hd - 0.5, -hd + 15.5, 0xdde2e5, { rough: 0.35, radius: 0.8 }); // lid
        cyl(g, 0, it.h + 0.2, -hd + 7.5, 2.4, 0.6, 0xc6cccf, { metal: 0.85, rough: 0.2, seg: 20 });
        // foot: a tapering pedestal under the bowl
        var foot = cyl(g, 0, (seatY - 14) / 2, bcz + 2, 1, seatY - 14, 0xf2f4f6, { rough: cerR, seg: 24, r2: 1.25 });
        if (foot) foot.scale.set(hw * 0.62, 1, brz * 0.62);
      }
      // an open dome turned over: the bowl, open at the top under the seat
      var bowl = sph(g, 0, seatY - 1, bcz, 1, cer, { rough: cerR, seg: 28, segV: 14, thetaLen: Math.PI * 0.62 });
      if (bowl) {
        bowl.scale.set(brx, 13, brz);
        bowl.rotation.x = Math.PI;
      }
      var seat = cyl(g, 0, seatY + 0.6, bcz, 1, 1.6, 0xf6f8fa, { rough: 0.28, seg: 32 });
      if (seat) seat.scale.set(brx + 0.3, 1, brz + 0.3);
      var lid = cyl(g, 0, seatY + 2.2, bcz - 0.5, 1, 1.4, 0xf6f8fa, { rough: 0.28, seg: 32 });
      if (lid) lid.scale.set(brx - 0.2, 1, brz - 0.4);
      box(g, -hw + 5, hw - 5, seatY + 0.6, seatY + 3.2, bz0 - 1, bz0 + 3, 0xc6cccf, { metal: 0.8, rough: 0.25, radius: 0.6 }); // hinge bar
    },
  },
  bathtub: {
    label: "אמבטיה",
    w: 170,
    d: 75,
    h: 55,
    col: "#e8ecee",
    build: function (g, it) {
      /* Bath: a rounded rim round a sloped-back well, water, overflow and a
         deck mixer with spout; a pivoting glass screen as a variant; or a
         freestanding oval shell with a rolled rim and a floor-standing tap. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, shell = V.shellCol != null ? V.shellCol : 0xe9edef,
        water = V.waterCol != null ? V.waterCol : 0xd7e2e6, chrome = 0xc6cccf;
      if (V.freestanding) {
        var rr = hd - 2, sx = hw / rr;
        [
          cyl(g, 0, it.h / 2 + 3, 0, rr, it.h - 6, shell, { rough: 0.28, seg: 48, open: true, metal: 0.04, r2: rr * 0.92 }),
          cyl(g, 0, it.h - 1.5, 0, rr + 0.8, 3, shell, { rough: 0.28, seg: 48, open: true, metal: 0.04 }),
          cyl(g, 0, 3, 0, rr * 0.92, 6, shell, { rough: 0.3, seg: 48 }),
          cyl(g, 0, it.h - 9, 0, rr - 3, 1.5, water, { rough: 0.12, seg: 48, metal: 0.15, trans: true, opacity: 0.7, cast: false }),
          cyl(g, 0, 1.2, 0, rr * 0.7, 2.4, 0xd9dde0, { rough: 0.6, seg: 32 }),
        ].forEach(function (m) { if (m) m.scale.x = sx; });
        cyl(g, -hw - 8, 50, 0, 1.6, 100, chrome, { metal: 0.9, rough: 0.2, seg: 14 });
        cyl(g, -hw - 8, 1, 0, 5, 2, chrome, { metal: 0.9, rough: 0.2, seg: 20 });
        gooseneck(g, -hw - 8, it.h + 36, 0, 20, 12, chrome, 1.4);
        return;
      }
      var iw = hw - 7, idp = hd - 7, wellBot = 6;
      box(g, -hw, hw, 0, wellBot, -hd, hd, shell, { rough: 0.35, sharp: true });
      slabWithHoles(g, -hw, hw, wellBot, it.h - 2, -hd, hd, [{ x0: -iw, x1: iw, z0: -idp, z1: idp }], shell, { rough: 0.35 });
      // rounded rim cap round the opening
      [[-hw, hw, -hd, -idp], [-hw, hw, idp, hd], [-hw, -iw, -idp, idp], [iw, hw, -idp, idp]].forEach(function (r) {
        box(g, r[0], r[1], it.h - 2.5, it.h, r[2], r[3], shell, { rough: 0.3, radius: 1.2 });
      });
      basin(g, -iw, iw, -idp, idp, it.h - 2, it.h - wellBot - 2, shell, { metal: 0.04, rough: 0.28 });
      box(g, -hw + 12, hw - 12, it.h - 14, it.h - 13, -hd + 12, hd - 12, water, { rough: 0.1, metal: 0.15, trans: true, opacity: 0.7, cast: false });
      cyl(g, -iw + 0.3, it.h - 10, 0, 2.2, 0.6, chrome, { metal: 0.9, rough: 0.2, seg: 18, rz: Math.PI / 2 }); // overflow
      cyl(g, -iw + 8, wellBot + 0.4, 0, 2.2, 0.5, chrome, { metal: 0.9, rough: 0.2, seg: 18 }); // drain
      cyl(g, -hw + 4, it.h + 5, 0, 1.6, 10, chrome, { metal: 0.9, rough: 0.2, seg: 14 });
      cyl(g, -hw + 4, it.h + 10, 0, 1.6, 12, chrome, { metal: 0.9, rough: 0.2, seg: 14, rz: Math.PI / 2 });
      [-6, 6].forEach(function (z) { cyl(g, -hw + 4, it.h + 2, z, 2.4, 4, chrome, { metal: 0.9, rough: 0.2, seg: 16 }); });
      if (V.screen) {
        box(g, -hw, -hw + 1.2, it.h, it.h + 140, -hd + 2, hd - 20, GLASS, { trans: true, opacity: 0.2, rough: 0.05, metal: 0.1, cast: false });
        box(g, -hw - 0.3, -hw + 1.5, it.h, it.h + 140, -hd, -hd + 2.5, chrome, { metal: 0.85, rough: 0.25, radius: 0.3 });
      }
    },
  },
  shower: {
    label: "מקלחון",
    w: 90,
    d: 90,
    h: 200,
    col: "#dfe8ec",
    build: function (g, it) {
      /* Shower: a low stone tray with a linear drain, clear glass in slim metal
         profiles, a sliding door with a bar handle, a rail-mounted hand shower
         and a square rain head on an arm. Quadrant and walk-in as variants. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, trayH = V.trayH != null ? V.trayH : 4,
        gl = { trans: true, opacity: 0.18, rough: 0.04, metal: 0.1, cast: false },
        frame = V.frameCol != null ? V.frameCol : 0xc6cccf, fm = { metal: 0.85, rough: 0.25, radius: 0.3 },
        tray = V.trayCol != null ? V.trayCol : 0xe6eaec;
      function fittings() {
        box(g, -hw + 2, -hw + 3.2, 95, 180, -hd + 16, -hd + 17.5, frame, fm); // slide rail
        cyl(g, -hw + 5, 150, -hd + 16.8, 1.3, 12, frame, { metal: 0.9, rough: 0.2, seg: 12, rz: Math.PI / 2 });
        box(g, -8, 8, 108, 118, -hd + 0.2, -hd + 2, frame, fm); // mixer plate
        cyl(g, 0, 113, -hd + 3.5, 2.2, 3, frame, { metal: 0.9, rough: 0.2, seg: 18, rx: Math.PI / 2 });
        cyl(g, 0, it.h - 8, -hd + 16, 1, 32, frame, { metal: 0.9, rough: 0.2, seg: 10, rx: Math.PI / 2 }); // arm
        box(g, -12, 12, it.h - 10.5, it.h - 9, -hd + 20, -hd + 44, frame, fm); // rain head
      }
      if (V.walkIn) {
        box(g, -hw, hw, 0, 1.5, -hd, hd, tray, { rough: 0.55, sharp: true });
        box(g, -hw + 4, hw - 4, 1.5, 1.7, -hd + 6, -hd + 9, 0x8a9296, { metal: 0.8, rough: 0.3, sharp: true });
        box(g, hw - 1.5, hw - 0.5, 1.5, it.h, -hd, hd - it.d * 0.28, GLASS, gl);
        box(g, hw - 2, hw, 1.5, it.h, -hd, -hd + 1.6, frame, fm);
        cyl(g, hw - 1, it.h - 2, -hd + (it.d * 0.72) / 2, 0.8, it.d * 0.72, frame, { metal: 0.9, rough: 0.2, seg: 10, rx: Math.PI / 2 });
        fittings();
        return;
      }
      box(g, -hw, hw, 0, trayH, -hd, hd, tray, { rough: 0.5, radius: 0.8 });
      box(g, -hw + 6, hw - 6, trayH, trayH + 0.2, -hd + 6, -hd + 9, 0x8a9296, { metal: 0.8, rough: 0.3, sharp: true });
      if (V.quadrant) {
        var qn = 10, qr = Math.min(hw, hd);
        for (var i = 0; i < qn; i++) {
          var am = (Math.PI / 2) * ((i + 0.5) / qn), segL = (Math.PI * qr) / (2 * qn) + 1,
            pan = box(g, -segL / 2, segL / 2, trayH, it.h, -0.5, 0.5, GLASS, gl);
          if (!pan) continue;
          pan.position.set(-hw + qr * Math.cos(am), (trayH + it.h) / 2, -hd + qr * Math.sin(am));
          pan.rotation.y = -(am + Math.PI / 2);
        }
        [0, Math.PI / 2].forEach(function (am) {
          box(g, -hw + qr * Math.cos(am) - 1, -hw + qr * Math.cos(am) + 1, trayH, it.h, -hd + qr * Math.sin(am) - 1, -hd + qr * Math.sin(am) + 1, frame, fm);
        });
      } else {
        box(g, -hw + 0.5, -hw + 1.5, trayH, it.h, -hd, hd - 1, GLASS, gl);
        box(g, -hw + 0.5, 2, trayH, it.h, hd - 1.5, hd - 0.5, GLASS, gl); // fixed front panel
        box(g, -2, hw - 0.5, trayH + 1, it.h - 1, hd - 3.2, hd - 2.2, GLASS, gl); // sliding door
        box(g, -hw, hw, it.h - 1.5, it.h, hd - 3.6, hd, frame, fm); // top track
        box(g, -hw, -hw + 2, trayH, it.h, hd - 2, hd, frame, fm);
        box(g, -hw, -hw + 2, trayH, it.h, -hd, -hd + 2, frame, fm);
        pull(g, hw - 12, 105, hd - 2.2, 30, true, "bar", frame);
      }
      fittings();
    },
  },
  vanity: {
    label: "כיור אמבטיה",
    w: 60,
    d: 45,
    h: 85,
    col: "#dde4e6",
    // like `sink`, a real undermounted bowl rather than a disc laid on the top
    build: function (g, it) {
      /* Bathroom vanity: a two-drawer cabinet on a recessed plinth, a stone top
         with an undermounted basin, a single-lever mixer. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, cy0 = it.h - 3, depth = 12, zf = hd - 2,
        hole = [{ x0: -hw + 8, x1: hw - 8, z0: -hd + 10, z1: hd - 6 }], bBot = it.h - 3 - depth, toe = 8, hs = V.handle || "bar";
      toeKick(g, -hw, hw, toe, -hd, hd);
      box(g, -hw, hw, toe, Math.max(toe + 2, bBot - 2), -hd, zf, CAB, { rough: 0.7, sharp: true });
      slabWithHoles(g, -hw, hw, Math.max(toe + 2, bBot - 2), cy0, -hd, zf, hole, CAB, { rough: 0.7 });
      var mid = toe + (cy0 - toe) * 0.45;
      front(g, -hw, hw, mid, cy0, zf, CAB, { kind: "drawer", handle: hs });
      front(g, -hw, hw, toe, mid, zf, CAB, { kind: "drawer", handle: hs });
      slabWithHoles(g, -hw - 1, hw + 1, cy0, it.h, -hd, hd + 1.5, hole, TOP, { rough: 0.3, metal: 0.05 });
      basin(g, hole[0].x0, hole[0].x1, hole[0].z0, hole[0].z1, it.h, depth + 3, 0xf4f6f8, { metal: 0.02, rough: 0.24 });
      cyl(g, 0, it.h - depth - 2.8, (hole[0].z0 + hole[0].z1) / 2, 1.8, 0.4, 0xc6cccf, { metal: 0.9, rough: 0.2, seg: 16 });
      gooseneck(g, 0, it.h, -hd + 6, Math.max(12, hd - 6), 14, 0xc6cccf, 1.3);
      box(g, -1, 1, it.h + 16, it.h + 17, -hd + 4, -hd + 12, 0xc6cccf, { metal: 0.9, rough: 0.2, radius: 0.4 }); // lever
    },
  },
  washer: {
    label: "מכונת כביסה",
    w: 60,
    d: 60,
    h: 85,
    col: "#e6e9eb",
    build: function (g, it) {
      /* Front-loading washer: a rounded cabinet, a control fascia with the
         detergent drawer, a programme dial and a display, and a chrome-ringed
         porthole door with a smoked glass dome. */
      var hw = it.w / 2, hd = it.d / 2, body = 0xe8ebed, pz = hd - 0.2, dy = it.h * 0.44, R = Math.min(it.w, it.d) * 0.3;
      box(g, -hw, hw, 1.5, it.h, -hd, hd - 0.5, body, { metal: 0.15, rough: 0.38, radius: 1.2 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { cyl(g, p[0] * (hw - 4), 0.75, p[1] * (hd - 5), 1.5, 1.5, DARK, { rough: 0.7, seg: 10 }); });
      box(g, -hw + 1.5, hw - 1.5, it.h - 12, it.h - 1.5, hd - 0.5, hd, 0xf4f6f7, { metal: 0.1, rough: 0.35, radius: 0.5 });
      box(g, -hw + 3, -hw + 18, it.h - 10.5, it.h - 3, hd, hd + 0.4, 0xdfe3e5, { metal: 0.1, rough: 0.4, radius: 0.4 }); // detergent drawer
      cyl(g, 4, it.h - 6.7, hd + 1.2, 3, 2.2, 0xc3c9cd, { metal: 0.6, rough: 0.25, rx: Math.PI / 2, seg: 28 });
      box(g, hw - 16, hw - 5, it.h - 9, it.h - 4.5, hd, hd + 0.2, 0x0b1216, smartOn(it, false) ? { emis: 0x44c8ff, cast: false } : { rough: 0.3, cast: false });
      cyl(g, 0, dy, hd + 0.9, R, 1.8, 0xb8bfc4, { metal: 0.75, rough: 0.2, rx: Math.PI / 2, seg: 40 });
      cyl(g, 0, dy, hd + 1.9, R * 0.8, 0.6, 0x9aa2a8, { metal: 0.6, rough: 0.3, rx: Math.PI / 2, seg: 40 });
      var dome = sph(g, 0, dy, hd + 1.8, R * 0.74, 0x22303a, { metal: 0.3, rough: 0.08 });
      if (dome) dome.scale.z = 0.25;
      box(g, R * 0.7, R * 0.9, dy - 3, dy + 3, hd + 1.6, hd + 2.8, 0xb8bfc4, { metal: 0.7, rough: 0.25, radius: 0.4 }); // latch
      box(g, -hw + 4, -hw + 14, 3, 9, hd - 0.4, hd, 0xdfe3e5, { rough: 0.4, radius: 0.3 }); // filter hatch
    },
  },
  upper: {
    label: "ארון עליון",
    w: 80,
    d: 35,
    h: 70,
    col: "#e5ddcb",
    build: function (g, it) {
      /* Wall unit hung at 145 cm: carcass, doors with pulls at the bottom edge
         (where a hand reaches them), and a slim light rail under the front. */
      var V = vspec(it), y0 = 145, y1 = y0 + it.h, hw = it.w / 2, hd = it.d / 2, zf = hd - 2, hs = V.handle || "bar",
        doors = it.w > 60 ? 2 : 1;
      box(g, -hw, hw, y0, y1, -hd, zf, CAB, { rough: 0.7, sharp: true });
      for (var j = 0; j < doors; j++)
        front(g, -hw + (j * it.w) / doors, -hw + ((j + 1) * it.w) / doors, y0, y1, zf, CAB, {
          kind: "door", hinge: doors === 2 ? (j ? 1 : -1) : -1, handle: hs, handleAt: "bottom", glass: V.glass, shaker: V.shaker,
        });
      box(g, -hw, hw, y0 - 1.6, y0, zf - 4, zf + 1.8, CAB, { rough: 0.7, sharp: true }); // light rail
      box(g, -hw + 3, hw - 3, y0 - 1.9, y0 - 1.6, zf - 3, zf - 1, 0xfff4dc, { emis: 0xfff0d0, cast: false });
    },
  },
  plant: {
    label: "עציץ",
    w: 40,
    d: 40,
    h: 120,
    col: "#6f8f5a",
    build: function (g, it) {
      cyl(g, 0, 0, 0, it.w * 0.32, 28, 0xae8b67, {
        rough: 0.8,
        metal: 0,
        r2: it.w * 0.26,
      });
      cyl(g, 0, 27, 0, it.w * 0.33, 2, 0x9c7a58, { rough: 0.8, metal: 0 }); // rim
      cyl(g, 0, 27.4, 0, it.w * 0.29, 1, 0x4a3a2c, { rough: 1, metal: 0 }); // soil
      cyl(g, 0, 28 + it.h * 0.2, 0, 2.2, it.h * 0.4, 0x6b5536, { rough: 0.8 });
      /* a crown of overlapping leaf clumps rather than one ball: from above
         it reads as foliage, not as a green disc */
      var R = it.w * 0.5, top = it.h;
      [[0, 0.62, 0, 0.5], [0.3, 0.72, 0.18, 0.34], [-0.28, 0.76, 0.12, 0.32], [0.08, 0.86, -0.3, 0.3],
        [-0.2, 0.66, -0.22, 0.34], [0.26, 0.58, -0.12, 0.3], [0, 0.93, 0.04, 0.26]].forEach(function (b, i) {
        sph(g, b[0] * R * 1.4, b[1] * top, b[2] * R * 1.4, b[3] * it.w, GREEN, {
          rough: 0.95,
        });
      });
    },
  },
  coffee: {
    label: "שולחן קפה",
    w: 90,
    d: 55,
    h: 42,
    col: "#a98a5f",
    build: function (g, it) {
      /* Coffee table: a soft-cornered top over a lower shelf on tapered legs,
         dressed with a tray, two books and a small bowl. */
      var hw = it.w / 2, hd = it.d / 2, ty = it.h - 3.5;
      box(g, -hw, hw, ty, it.h, -hd, hd, WOOD, { rough: 0.45, radius: 2.5 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { leg(g, p[0] * (hw - 5), p[1] * (hd - 5), 0, ty, 0x6f5535, "taper"); });
      box(g, -hw + 4, hw - 4, 10, 12.5, -hd + 4, hd - 4, 0x8a6a44, { rough: 0.55, radius: 1 });
      box(g, -hw * 0.5, -hw * 0.5 + 24, it.h, it.h + 1.2, -hd * 0.4, hd * 0.4, 0x2e3134, { rough: 0.4, metal: 0.3, radius: 0.5 });
      box(g, hw * 0.1, hw * 0.1 + 20, it.h, it.h + 2.5, -8, 6, 0xd8cfbf, { rough: 0.85, radius: 0.3 });
      box(g, hw * 0.1 + 1, hw * 0.1 + 18, it.h + 2.5, it.h + 4.5, -7, 5, 0x4a6a7a, { rough: 0.85, radius: 0.3 });
      sph(g, hw * 0.55, it.h + 1, 2, 6, 0xe9e4da, { rough: 0.3, thetaLen: Math.PI * 0.5 }).rotation.x = Math.PI;
    },
  },
  sideTable: {
    label: "שולחן צד",
    w: 45,
    d: 45,
    h: 55,
    col: "#a98a5f",
    build: function (g, it) {
      /* Side table: a round top with a rolled edge on a turned column, a lower
         shelf and a weighted foot. */
      var r = Math.min(it.w, it.d) / 2;
      cyl(g, 0, it.h - 1.5, 0, r, 3, WOOD, { rough: 0.45, seg: 40 });
      cyl(g, 0, it.h - 3.2, 0, r - 1.2, 0.8, 0x6f5535, { rough: 0.5, seg: 40 });
      cyl(g, 0, (it.h - 3) / 2 + 1, 0, 1.8, it.h - 5, 0x6f5535, { rough: 0.5, seg: 16, r2: 2.6 });
      cyl(g, 0, it.h * 0.35, 0, r * 0.72, 2, WOOD, { rough: 0.5, seg: 36 });
      cyl(g, 0, 1, 0, r * 0.45, 2, 0x6f5535, { rough: 0.5, seg: 32, r2: r * 0.4 });
    },
  },
  tvunit: {
    label: "מזנון טלוויזיה",
    w: 160,
    d: 40,
    h: 45,
    col: "#8a6f4d",
    build: function (g, it) {
      /* Media console on tapered legs: fluted doors either side of an open bay
         (a set-top box and a cable cut-out in the back), under a solid top. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, legH = 10, top = it.h - 2.5, zf = hd - 2.4, bay = it.w * 0.34;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        leg(g, p[0] * (hw - 7), p[1] * (hd - 5), 0, legH + 1, 0x4b4540, "taper");
      });
      box(g, -hw, hw, legH, top, -hd, zf, WOOD, { rough: 0.6, sharp: true });
      slab(g, -hw, hw, top, it.h, -hd, hd, 0x6f5535, { rough: 0.5, radius: 0.6 });
      box(g, -bay / 2, bay / 2, legH + 2, top - 2, -hd + 3, zf + 0.1, 0x2a2420, { rough: 0.8, sharp: true }); // bay shadow
      box(g, -bay / 2 + 1, bay / 2 - 1, legH + (top - legH) * 0.5, legH + (top - legH) * 0.5 + 1.5, -hd + 3, zf, WOOD, { rough: 0.6, sharp: true });
      box(g, -bay * 0.3, bay * 0.3, legH + 2, legH + 6, -hd + 8, zf - 6, 0x1a1c1e, { rough: 0.4, radius: 0.4 }); // media box
      box(g, -bay * 0.25, -bay * 0.18, legH + 4, legH + 4.4, zf - 6, zf - 5.8, 0x0b1216, { emis: 0x3a9ad8, cast: false });
      [-1, 1].forEach(function (s) {
        var x0 = s < 0 ? -hw + 0.4 : bay / 2 + 0.3, x1 = s < 0 ? -bay / 2 - 0.3 : hw - 0.4;
        box(g, x0, x1, legH + 0.4, top - 0.4, zf, zf + 1.2, WOOD, { rough: 0.6, sharp: true });
        var n = Math.max(6, Math.round((x1 - x0) / 3.2));
        for (var k = 0; k < n; k++) {
          var fx = x0 + ((k + 0.5) * (x1 - x0)) / n;
          cyl(g, fx, (legH + top) / 2, zf + 1.2, 1.1, top - legH - 2, WOOD, { rough: 0.55, seg: 8 });
        }
        pull(g, s < 0 ? x1 - 3 : x0 + 3, (legH + top) / 2, zf + 2.3, 12, true, V.handle || "bar", 0x4b4540);
      });
    },
  },
  roundTable: {
    label: "שולחן עגול",
    w: 110,
    d: 110,
    h: 75,
    col: "#9c7a4e",
    build: function (g, it) {
      /* Round dining table: a thick top with a chamfered underside on a tapered
         column over a four-footed star base. */
      var r = Math.min(it.w, it.d) / 2;
      cyl(g, 0, it.h - 2, 0, r, 4, WOOD, { rough: 0.45, seg: 56 });
      cyl(g, 0, it.h - 5, 0, r - 3, 2, WOOD, { rough: 0.45, seg: 56, r2: r - 1 });
      cyl(g, 0, (it.h - 6) / 2 + 3, 0, 5, it.h - 12, 0x6f5535, { rough: 0.5, seg: 24, r2: 7 });
      for (var k = 0; k < 4; k++) {
        var f = box(g, 0, r * 0.55, 0, 5, -3, 3, 0x6f5535, { rough: 0.5, radius: 1 });
        if (f) {
          f.rotation.y = (k * Math.PI) / 2 + Math.PI / 4;
          f.position.set(Math.cos(-f.rotation.y) * r * 0.27, 2.5, Math.sin(-f.rotation.y) * r * 0.27);
        }
      }
    },
  },
  barstool: {
    label: "כיסא בר",
    w: 40,
    d: 40,
    h: 100,
    col: "#8d8d8d",
    build: function (g, it) {
      /* Counter stool: a padded round seat on a swivel, a chrome footring, a
         gas column and a weighted base disc with a rubber rim. */
      var sy = it.h * 0.75, r = it.w * 0.42;
      cyl(g, 0, sy + 3.5, 0, r, 5, 0x4a4f54, { rough: 0.9, seg: 36, r2: r - 1.5 });
      cyl(g, 0, sy + 0.5, 0, r * 0.55, 2, STEEL, { metal: 0.8, rough: 0.3, seg: 24 });
      cyl(g, 0, sy / 2, 0, 2.2, sy, STEEL, { metal: 0.85, rough: 0.2, seg: 16 });
      cyl(g, 0, it.h * 0.3, 0, it.w * 0.34, 1.6, STEEL, { metal: 0.85, rough: 0.2, seg: 36, open: true });
      for (var k = 0; k < 3; k++) {
        var sa = (k * Math.PI * 2) / 3, sl = it.w * 0.34,
        sp = box(g, 0, sl, it.h * 0.3 - 0.6, it.h * 0.3 + 0.6, -0.6, 0.6, STEEL, { metal: 0.85, rough: 0.2, sharp: true });
        if (sp) { sp.rotation.y = sa; sp.position.set(Math.cos(sa) * sl / 2, it.h * 0.3, -Math.sin(sa) * sl / 2); }
      }
      cyl(g, 0, 1.8, 0, it.w * 0.4, 2.6, STEEL, { metal: 0.8, rough: 0.25, seg: 40, r2: it.w * 0.36 });
      cyl(g, 0, 0.3, 0, it.w * 0.41, 0.6, DARK, { rough: 0.8, seg: 40 });
    },
  },
  officeChair: {
    label: "כיסא משרדי",
    w: 60,
    d: 60,
    h: 108,
    col: "#4a4f54",
    build: function (g, it) {
      /* Task chair: five-star base on twin-wheel casters, a gas lift in a
         shroud, a contoured seat, a mesh back in a frame with a lumbar pad, and
         height-adjustable arms with soft pads. */
      var hw = it.w / 2, hd = it.d / 2, seatY = 47, fr = 0x2c3034;
      for (var k = 0; k < 5; k++) {
        var a = (k * Math.PI * 2) / 5, L = it.w * 0.42, arm = box(g, 0, L, 5, 8, -2, 2, DARK, { metal: 0.4, rough: 0.35, radius: 0.8 });
        // a box turns about its own centre: re-seat it so the arm starts at the column
        if (arm) { arm.rotation.y = a; arm.position.set(Math.cos(a) * L / 2, 6.5, -Math.sin(a) * L / 2); }
        var cx = Math.cos(-a) * it.w * 0.4, cz = Math.sin(-a) * it.w * 0.4;
        cyl(g, cx, 3, cz, 2.6, 2.2, DARK, { rough: 0.5, seg: 14, rx: Math.PI / 2 });
        cyl(g, cx, 5.5, cz, 0.7, 3, DARK, { metal: 0.5, rough: 0.4, seg: 8 });
      }
      cyl(g, 0, 6.5, 0, 4.5, 3, DARK, { metal: 0.4, rough: 0.35, seg: 20 });
      cyl(g, 0, 16, 0, 3.2, 16, DARK, { rough: 0.5, seg: 16 });
      cyl(g, 0, 32, 0, 2.2, 16, STEEL, { metal: 0.85, rough: 0.2, seg: 14 });
      box(g, -12, 12, 39, 42, -10, 10, fr, { rough: 0.6, radius: 0.8 }); // mechanism
      box(g, -hw + 6, hw - 6, 42, seatY + 5, -hd + 7, hd - 4, 0x3a3f44, { rough: 0.9, radius: 3.5, crown: 1.5 });
      // backrest frame and mesh, raked
      var bk = box(g, -hw + 9, hw - 9, seatY + 8, it.h - 2, -hd + 3, -hd + 6, fr, { rough: 0.6, radius: 3 });
      var mesh = box(g, -hw + 11.5, hw - 11.5, seatY + 10.5, it.h - 4.5, -hd + 5.6, -hd + 6.4, 0x3a3f44, { rough: 0.95, radius: 1.5 });
      var lum = box(g, -hw + 13, hw - 13, seatY + 16, seatY + 24, -hd + 6.2, -hd + 8.5, fr, { rough: 0.8, radius: 2 });
      [bk, mesh, lum].forEach(function (m) { if (m) { m.rotation.x = -0.12; m.position.z -= 3; } });
      box(g, -hw + 12, hw - 12, seatY + 2, seatY + 10, -hd + 3, -hd + 5, fr, { rough: 0.6, radius: 0.6 }); // spine
      [-1, 1].forEach(function (s) {
        var x = s * (hw - 5);
        box(g, x - 1.5, x + 1.5, 40, seatY + 18, -2, 2, fr, { rough: 0.6, radius: 0.6 });
        box(g, x - 3, x + 3, seatY + 18, seatY + 21, -10, 12, 0x2c3034, { rough: 0.8, radius: 1.2 });
      });
    },
  },
  piano: {
    label: "פסנתר",
    w: 150,
    d: 62,
    h: 108,
    col: "#2e2a28",
    build: function (g, it) {
      /* Upright piano: a lacquered case with a fall board over a full keyboard
         (black keys raised in groups of two and three), a music desk, cheek
         blocks, legs on the key bed and three brass pedals. */
      var hw = it.w / 2, hd = it.d / 2, bz = -hd + it.d * 0.55, PB = 0x24201e, lac = { rough: 0.18, metal: 0.15, radius: 0.8 };
      box(g, -hw, hw, 4, it.h, -hd, bz, PB, lac);
      box(g, -hw + 2, hw - 2, 0, 4, -hd + 2, bz - 2, 0x1a1614, { rough: 0.5, sharp: true });
      box(g, -hw, hw, 70, 76, bz, hd - 2, PB, lac); // key bed
      box(g, -hw + 7, hw - 7, 76, 77.8, bz + 1, hd - 5, 0xf5f2ea, { rough: 0.35, sharp: true });
      var nW = 52, kw = (it.w - 14) / nW;
      for (var k = 1; k < nW; k++) box(g, -hw + 7 + k * kw - 0.1, -hw + 7 + k * kw + 0.1, 77.2, 77.9, bz + 1.5, hd - 5, 0xb9b3a8, { sharp: true, cast: false });
      var pat = [1, 1, 0, 1, 1, 1, 0];
      for (var b = 0; b < nW - 1; b++) {
        if (!pat[b % 7]) continue;
        var bx = -hw + 7 + (b + 1) * kw;
        box(g, bx - kw * 0.3, bx + kw * 0.3, 77.8, 79.2, bz + 1, bz + (hd - 5 - bz) * 0.62, 0x1a1614, { rough: 0.3, radius: 0.15 });
      }
      box(g, -hw + 6, hw - 6, 80, 86, bz - 6, bz, PB, lac); // fall board, open
      box(g, -hw * 0.6, hw * 0.6, 86, 104, bz - 8, bz - 5, PB, lac); // music desk
      [-1, 1].forEach(function (s) {
        box(g, s * hw - (s > 0 ? 6 : 0), s * hw + (s > 0 ? 0 : 6), 70, 82, bz, hd, PB, lac); // cheeks
        cyl(g, s * (hw - 7), 35, hd - 5, 2.6, 66, PB, { rough: 0.18, metal: 0.15, seg: 16, r2: 3.4 });
      });
      [-7, 0, 7].forEach(function (x) { box(g, x - 1.6, x + 1.6, 3, 4.5, bz, bz + 12, 0xc9a24f, { metal: 0.9, rough: 0.25, radius: 0.5 }); });
    },
  },
  crib: {
    label: "מיטת תינוק",
    w: 130,
    d: 70,
    h: 90,
    col: "#e7d9c4",
    build: function (g, it) {
      /* Cot: turned corner posts with ball finials, rounded rails, round
         spindles along both long sides, panelled ends, a slatted base carrying a
         mattress in a fitted sheet, a pillow and a folded blanket. */
      var LW = 0xd8c8a8, hw = it.w / 2, hd = it.d / 2, pr = 2.6, px = hw - pr, pz = hd - pr,
        top = it.h - 5, mY = 30, rail = { rough: 0.55, radius: 1 }, i;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        var x = p[0] * px, z = p[1] * pz;
        lathe(g, x, 0, z, [[0, 0], [pr * 0.8, 0], [pr * 0.8, 3], [pr, 4.5], [pr, top - 3], [pr * 1.12, top - 1.5], [pr * 1.12, top], [pr * 0.55, top + 0.8], [0, top + 0.8]],
          LW, { rough: 0.55, seg: 16 });
        sph(g, x, top + 2.6, z, 2.3, LW, { rough: 0.5, seg: 16, segV: 10 });
      });
      // long sides: bottom and top rail, round spindles between
      [-1, 1].forEach(function (s) {
        var z = s * pz;
        box(g, -px, px, mY - 6, mY, z - 1.6, z + 1.6, LW, rail);
        box(g, -px, px, top - 4.5, top, z - 1.9, z + 1.9, LW, rail);
        var n = Math.max(4, Math.round((2 * px) / 8.5));
        for (i = 1; i < n; i++) {
          var x = -px + (i * 2 * px) / n;
          cyl(g, x, (mY + top - 4.5) / 2, z, 1.05, top - 4.5 - mY, LW, { rough: 0.55, seg: 8 });
        }
      });
      // ends: a solid panel under a rail
      [-1, 1].forEach(function (s) {
        var x = s * px;
        box(g, x - 1, x + 1, mY - 6, top - 7, -pz + 1, pz - 1, LW, { rough: 0.55, radius: 0.6 });
        box(g, x - 1.9, x + 1.9, top - 4.5, top, -pz, pz, LW, rail);
      });
      // slatted base + mattress
      box(g, -px + 1, px - 1, mY - 3, mY - 1.5, -pz + 1, pz - 1, LW, { rough: 0.6, sharp: true });
      box(g, -px + 1.2, px - 1.2, mY - 1.5, mY + 10, -pz + 1.8, pz - 1.8, BEDC, { rough: 0.95, radius: 3, crown: 0.8 });
      box(g, -px + 4, -px + 28, mY + 10, mY + 15, -pz + 10, pz - 10, BEDC, { rough: 0.95, radius: 2.4, crown: 1.4 }); // pillow
      box(g, px - 38, px - 4, mY + 10, mY + 13.5, -pz + 5, pz - 5, 0xb9cad4, { rough: 0.97, radius: 1.6, crown: 0.6 }); // folded blanket
    },
  },
  bunk: {
    label: "מיטת קומתיים",
    w: 100,
    d: 200,
    h: 165,
    col: "#b98d5e",
    build: function (g, it) {
      /* Bunk bed: square posts with softened arrises, a rail frame and slats at
         each level carrying a mattress, duvet and pillow; guard rails round the
         top bunk with a gap where a round-runged ladder climbs the +x side. */
      var hw = it.w / 2, hd = it.d / 2, ps = 3.5, x1 = hw - ps, z1 = hd - ps,
        lowY = it.h * 0.21, upY = it.h * 0.67, wo = { rough: 0.55, radius: 0.8 },
        ladZ1 = hd - 2 * ps - 4, ladZ0 = ladZ1 - 42, i;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        box(g, p[0] * x1 - ps, p[0] * x1 + ps, 0, it.h, p[1] * z1 - ps, p[1] * z1 + ps, WOOD, { rough: 0.55, radius: 1 });
      });
      [lowY, upY].forEach(function (y, lvl) {
        [-1, 1].forEach(function (s) {
          box(g, s * x1 - 2, s * x1 + 2, y - 12, y, -z1 + ps, z1 - ps, WOOD, wo); // side rails
          box(g, -x1 + ps, x1 - ps, y - 12, y, s * z1 - 2, s * z1 + 2, WOOD, wo); // end rails
        });
        for (var k = 0; k < 11; k++) {
          var sz = -z1 + ps + 4 + (k * (2 * z1 - 2 * ps - 8)) / 10;
          box(g, -x1 + 2, x1 - 2, y - 4, y - 2.4, sz - 3.5, sz + 3.5, WOOD, { rough: 0.6, sharp: true });
        }
        var mx0 = -x1 + 2.5, mx1 = x1 - 2.5, mz0 = -z1 + 2.5, mz1 = z1 - 2.5;
        box(g, mx0, mx1, y - 2.4, y + 11, mz0, mz1, BEDC, { rough: 0.95, radius: 3.5, crown: 0.8 });
        box(g, mx0 - 0.6, mx1 + 0.6, y + 10, y + 13, mz0 + 34, mz1 + 0.4, lvl ? 0x8fa7b8 : 0xb7a48a, { rough: 0.97, radius: 1.5, crown: 1.2 }); // duvet
        box(g, mx0 + 8, mx1 - 8, y + 10.5, y + 17, mz0 + 6, mz0 + 30, BEDC, { rough: 0.95, radius: 3, crown: 1.6 }); // pillow
      });
      // head and foot boards of the lower bunk
      [-1, 1].forEach(function (s) {
        box(g, -x1 + ps, x1 - ps, lowY, lowY + 26, s * z1 - 1.2, s * z1 + 1.2, WOOD, { rough: 0.55, radius: 0.5 });
      });
      // top bunk guard rails: full on -x and both ends, stopping at the ladder on +x
      var gy = [upY + 13, upY + 24];
      gy.forEach(function (y) {
        box(g, -x1 - 1.6, -x1 + 1.6, y - 2.2, y + 2.2, -z1 + ps, z1 - ps, WOOD, wo);
        box(g, x1 - 1.6, x1 + 1.6, y - 2.2, y + 2.2, -z1 + ps, ladZ0 - 2, WOOD, wo);
        [-1, 1].forEach(function (s) {
          box(g, -x1 + ps, x1 - ps, y - 2.2, y + 2.2, s * z1 - 1.6, s * z1 + 1.6, WOOD, wo);
        });
      });
      // ladder on the +x side: two stiles and round rungs
      [ladZ0, ladZ1].forEach(function (z) {
        box(g, hw - 4.2, hw - 0.2, 0, upY + 26, z - 2, z + 2, WOOD, { rough: 0.55, radius: 0.8 });
      });
      for (i = 1; i <= 4; i++) {
        var ry = (i * (upY + 4)) / 5;
        cyl(g, hw - 2.2, ry, (ladZ0 + ladZ1) / 2, 1.6, ladZ1 - ladZ0 - 3, WOOD, { rough: 0.55, seg: 12, rx: Math.PI / 2 });
      }
    },
  },
  mirror: {
    label: "מראה עומדת",
    w: 50,
    d: 28,
    h: 170,
    col: "#cfd6da",
    build: function (g, it) {
      /* Cheval mirror: an arch-topped frame between two uprights on splayed
         feet, the glass set back behind a slim moulding. */
      var hw = it.w / 2, hd = it.d / 2, fw = hw - 4, top = it.h - fw;
      box(g, -fw, fw, 6, top, -1.5, 1.5, WOOD, { rough: 0.55, radius: 0.8 });
      box(g, -fw + 2.5, fw - 2.5, 8.5, top, 1.5, 1.9, 0xdfe8ec, { metal: 1.0, rough: 0.03, sharp: true });
      cyl(g, 0, top, 0, fw, 3, WOOD, { rough: 0.55, seg: 40, rx: Math.PI / 2, thetaLen: Math.PI });
      cyl(g, 0, top, 1.75, fw - 2.5, 0.4, 0xdfe8ec, { metal: 1.0, rough: 0.03, seg: 40, rx: Math.PI / 2 });
      [-1, 1].forEach(function (s) {
        box(g, s * hw - (s > 0 ? 3 : 0), s * hw + (s > 0 ? 0 : 3), 0, it.h * 0.62, -2, 2, WOOD, { rough: 0.55, radius: 0.6 });
        box(g, s * hw - (s > 0 ? 3.5 : -0.5) - 0.5, s * hw + (s > 0 ? 0.5 : 3.5), 0, 3, -hd, hd, WOOD, { rough: 0.55, radius: 0.8 });
        cyl(g, s * (hw - 1.5), it.h * 0.45, 0, 1, 3.4, 0xb08d4a, { metal: 0.9, rough: 0.25, seg: 12, rz: Math.PI / 2 });
      });
    },
  },
  wallMirror: {
    label: "מראת קיר",
    w: 60,
    d: 4,
    h: 85,
    col: "#cfd6da",
    build: function (g, it) {
      /* Wall mirror: a mitred frame with a bevelled edge round the glass. */
      var y0 = 105, hw = it.w / 2, hd = it.d / 2, f = 3;
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd - 1, WOOD, { rough: 0.55, radius: 0.8 });
      box(g, -hw + f, hw - f, y0 + f, y0 + it.h - f, hd - 1.2, hd - 0.6, 0xc9d3d8, { metal: 0.9, rough: 0.1, sharp: true });
      box(g, -hw + f + 1.5, hw - f - 1.5, y0 + f + 1.5, y0 + it.h - f - 1.5, hd - 0.6, hd - 0.4, 0xdfe8ec, { metal: 1.0, rough: 0.03, sharp: true });
    },
  },
  art: {
    label: "תמונת קיר",
    w: 70,
    d: 6,
    h: 95,
    col: "#c9b17e",
    build: function (g, it) {
      /* Framed print: a moulded frame, a wide white mat with a bevelled
         window, and an abstract composition of overlapping colour fields. */
      var y0 = 115, hw = it.w / 2, zb = -it.d / 2, fr = 0x4a3826;
      // the frame is a border: four moulded rails round the mat
      [[-hw, hw, y0, y0 + 3.5], [-hw, hw, y0 + it.h - 3.5, y0 + it.h], [-hw, -hw + 3.5, y0 + 3.5, y0 + it.h - 3.5], [hw - 3.5, hw, y0 + 3.5, y0 + it.h - 3.5]].forEach(function (r) {
      box(g, r[0], r[1], r[2], r[3], zb, zb + 4.5, fr, { rough: 0.55, radius: 0.6 });
      });
      box(g, -hw + 3.5, hw - 3.5, y0 + 3.5, y0 + it.h - 3.5, zb, zb + 2.4, 0xf4f1ea, { rough: 0.9, sharp: true });
      var m = Math.min(it.w, it.h) * 0.12, x0 = -hw + 3.5 + m, x1 = hw - 3.5 - m, a0 = y0 + 3.5 + m, a1 = y0 + it.h - 3.5 - m;
      box(g, x0, x1, a0, a1, zb + 2.4, zb + 2.6, 0xe8e2d4, { rough: 0.85, sharp: true });
      var W = x1 - x0, H = a1 - a0;
      box(g, x0 + W * 0.08, x0 + W * 0.55, a0 + H * 0.38, a1 - H * 0.08, zb + 2.6, zb + 2.8, 0xc06a4a, { rough: 0.85, sharp: true, cast: false });
      box(g, x0 + W * 0.4, x1 - W * 0.08, a0 + H * 0.08, a0 + H * 0.6, zb + 2.7, zb + 2.9, 0x4a7a8c, { rough: 0.85, sharp: true, cast: false });
      box(g, x0 + W * 0.25, x0 + W * 0.7, a0 + H * 0.14, a0 + H * 0.34, zb + 2.8, zb + 3.0, 0xd8b76a, { rough: 0.85, sharp: true, cast: false });
      cyl(g, x0 + W * 0.72, a1 - H * 0.2, zb + 3.0, Math.min(W, H) * 0.09, 0.2, 0x2e3134, { rough: 0.85, seg: 28, rx: Math.PI / 2, cast: false });
    },
  },
  ac: {
    label: "מזגן עילי",
    w: 90,
    d: 24,
    h: 28,
    col: "#eef1f2",
    build: function (g, it) {
      /* Wall split unit: a rounded chassis with a softly bowed front panel, the
         supply slot under it with its louvre flap tilted open, an intake grille
         across the top, and a small display with the status LED. */
      var y0 = 212, hw = it.w / 2, hd = it.d / 2, B = 0xeef1f2;
      box(g, -hw, hw, y0 + 3, y0 + it.h, -hd, hd - 3, B, { rough: 0.35, radius: 3.5 }); // chassis
      box(g, -hw + 0.4, hw - 0.4, y0 + 8, y0 + it.h - 0.6, hd - 5, hd - 1, B, { rough: 0.22, radius: 2.5, crown: 1, crownAxis: "z" }); // front panel
      box(g, -hw + 1, hw - 1, y0, y0 + 4, -hd + 1, hd - 8, B, { rough: 0.35, radius: 1.5 }); // underside
      box(g, -hw + 5, hw - 5, y0 + 2, y0 + 7.5, hd - 9, hd - 3, 0x39434a, { rough: 0.6, sharp: true }); // supply slot
      var flap = box(g, -hw + 5, hw - 5, y0 + 2, y0 + 3.2, hd - 9, hd - 1.5, B, { rough: 0.28, radius: 0.5 });
      if (flap) flap.rotation.x = 0.28;
      for (var i = 0; i < 16; i++) {
        var x = -hw + 6 + (i * (it.w - 12)) / 15;
        box(g, x - 0.35, x + 0.35, y0 + it.h - 0.3, y0 + it.h + 0.15, -hd + 3, hd - 7, 0xc6ccd0, { rough: 0.5, sharp: true, cast: false });
      }
      box(g, hw - 18, hw - 6, y0 + 11, y0 + 15, hd - 0.4, hd + 0.2, 0x2b3236, { rough: 0.12, metal: 0.2, sharp: true }); // display
      var led = 0x44ff88;
      if (it.smart) {
        if (!smartOn(it, true)) led = 0x4a5156;
        else if (it.smart.hvacMode === "heat") led = 0xff8844;
        else if (it.smart.hvacMode === "dry") led = 0x88c4ff;
      }
      box(g, hw - 9, hw - 7.4, y0 + 12.2, y0 + 13.8, hd + 0.2, hd + 0.4, led, { emis: led, cast: false, sharp: true });
    },
  },
  shoeCab: {
    label: "ארון נעליים",
    w: 90,
    d: 32,
    h: 120,
    col: "#d8c8a8",
    build: function (g, it) {
      /* Tilt-out shoe cabinet: three flaps on shadow reveals with knobs, a
         recessed plinth and a top shelf for keys. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, toe = 6, top = it.h - 2.5, zf = hd - 2;
      box(g, -hw + 1, hw - 1, 0, toe, -hd + 1, hd - 4, 0x3b3936, { rough: 0.85, sharp: true });
      box(g, -hw, hw, toe, top, -hd, zf, CAB, { rough: 0.7, sharp: true });
      var H = (top - toe) / 3;
      for (var r = 0; r < 3; r++)
        front(g, -hw, hw, toe + r * H, toe + (r + 1) * H, zf, CAB, { kind: "drawer", handle: V.handle || "knob" });
      slab(g, -hw - 0.5, hw + 0.5, top, it.h, -hd, hd + 0.5, CAB, { rough: 0.6, radius: 0.8 });
    },
  },
  coatRack: {
    label: "מתלה מעילים",
    w: 45,
    d: 45,
    h: 175,
    col: "#7a5c3e",
    build: function (g, it) {
      /* Coat stand: a turned pole on a weighted foot, two tiers of round-ended
         pegs, and a coat and a hat hung on it. */
      var hw = it.w / 2;
      cyl(g, 0, 2, 0, it.w * 0.34, 4, 0x6f5535, { rough: 0.55, seg: 32, r2: it.w * 0.3 });
      cyl(g, 0, it.h / 2 + 2, 0, 2, it.h - 4, 0x7a5c3e, { rough: 0.5, seg: 14, r2: 1.6 });
      sph(g, 0, it.h, 0, 3, 0x7a5c3e, { rough: 0.5 });
      [it.h - 14, it.h - 34].forEach(function (y, t) {
        for (var k = 0; k < 4; k++) {
          var a = (k * Math.PI) / 2 + t * Math.PI / 4, px = Math.cos(a) * 9, pz = Math.sin(a) * 9;
          var peg = cyl(g, px / 2, y, pz / 2, 0.9, 10, 0x7a5c3e, { rough: 0.5, seg: 8, rz: Math.PI / 2 });
          if (peg) peg.rotation.y = -a;
          sph(g, px, y + 0.6, pz, 1.6, 0x7a5c3e, { rough: 0.5 });
        }
      });
      box(g, 1, 12, it.h - 80, it.h - 14, -9, 9, 0x39506e, { rough: 0.95, radius: 3 }); // coat
      cyl(g, -8, it.h - 11, 0, 7, 5, 0xb9a58a, { rough: 0.9, seg: 20, r2: 5 }); // hat
      cyl(g, -8, it.h - 13.5, 0, 10, 0.8, 0xb9a58a, { rough: 0.9, seg: 24 });
    },
  },
  dryer: {
    label: "מייבש כביסה",
    w: 60,
    d: 60,
    h: 85,
    col: "#e6e9eb",
    build: function (g, it) {
      /* Heat-pump dryer: the washer's twin with a water-tank drawer in the
         fascia, a larger porthole and a lint-filter strip. */
      var hw = it.w / 2, hd = it.d / 2, body = 0xdfe3e5, dy = it.h * 0.45, R = Math.min(it.w, it.d) * 0.33;
      box(g, -hw, hw, 1.5, it.h, -hd, hd - 0.5, body, { metal: 0.15, rough: 0.38, radius: 1.2 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { cyl(g, p[0] * (hw - 4), 0.75, p[1] * (hd - 5), 1.5, 1.5, DARK, { rough: 0.7, seg: 10 }); });
      box(g, -hw + 1.5, hw - 1.5, it.h - 12, it.h - 1.5, hd - 0.5, hd, 0xeef0f1, { metal: 0.1, rough: 0.35, radius: 0.5 });
      box(g, -hw + 3, -hw + 22, it.h - 10.5, it.h - 3, hd, hd + 0.4, body, { metal: 0.1, rough: 0.4, radius: 0.4 }); // water tank
      cyl(g, 6, it.h - 6.7, hd + 1.2, 3, 2.2, 0xc3c9cd, { metal: 0.6, rough: 0.25, rx: Math.PI / 2, seg: 28 });
      box(g, hw - 14, hw - 4, it.h - 9, it.h - 4.5, hd, hd + 0.2, 0x0b1216, { rough: 0.3, cast: false });
      cyl(g, 0, dy, hd + 0.9, R, 1.8, 0x9aa2a8, { metal: 0.6, rough: 0.3, rx: Math.PI / 2, seg: 40 });
      var dome = sph(g, 0, dy, hd + 1.8, R * 0.78, 0x22303a, { metal: 0.3, rough: 0.08 });
      if (dome) dome.scale.z = 0.25;
      box(g, -hw + 5, hw - 5, 5, 7, hd - 0.4, hd, 0x9aa2a8, { rough: 0.5, sharp: true });
    },
  },
  microwave: {
    label: "מיקרוגל",
    w: 50,
    d: 38,
    h: 30,
    col: "#d7dadd",
    build: function (g, it) {
      /* Countertop microwave: rounded case, a dark-glass window framed in the
         door, a keypad column with a dial and a release button, rubber feet. */
      var y0 = 92, hw = it.w / 2, hd = it.d / 2, y1 = y0 + it.h, body = 0xd7dadd;
      box(g, -hw, hw, y0 + 1, y1, -hd, hd - 1.5, body, { metal: 0.2, rough: 0.4, radius: 1.4 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        cyl(g, p[0] * (hw - 4), y0 + 0.5, p[1] * (hd - 5), 1.4, 1, DARK, { rough: 0.8, seg: 10 });
      });
      var dx1 = hw - 13;
      box(g, -hw + 0.6, dx1, y0 + 1.6, y1 - 0.6, hd - 1.5, hd, body, { metal: 0.2, rough: 0.4, radius: 0.8 });
      glassPanel(g, -hw + 4, dx1 - 4, y0 + 5, y1 - 4.5, hd);
      box(g, dx1 + 0.4, hw - 0.6, y0 + 1.6, y1 - 0.6, hd - 1.5, hd - 0.2, 0x9aa2a8, { metal: 0.4, rough: 0.4, radius: 0.6 });
      box(g, dx1 + 2, hw - 2, y1 - 8, y1 - 3.5, hd - 0.2, hd, 0x0b1216, { emis: 0x7ad0ff, cast: false });
      for (var r = 0; r < 3; r++)
        for (var c = 0; c < 3; c++)
          box(g, dx1 + 2.2 + c * 3.2, dx1 + 4.4 + c * 3.2, y1 - 12 - r * 2.8, y1 - 10.4 - r * 2.8, hd - 0.2, hd + 0.2, 0xc7cdd0, { rough: 0.5, cast: false });
      cyl(g, (dx1 + hw) / 2, y0 + 7, hd + 0.6, 2.8, 1.2, 0xc7cdd0, { metal: 0.5, rough: 0.3, rx: Math.PI / 2, seg: 24 });
    },
  },
  hood: {
    label: "קולט אדים",
    w: 62,
    d: 50,
    h: 55,
    col: "#c3c9cd",
    build: function (g, it) {
      /* Chimney hood: a slim steel canopy tapering into the flue, baffle
         filters and two LED lamps underneath. */
      var y0 = 150, hw = it.w / 2, hd = it.d / 2, cyTop = y0 + 22, fw = 12;
      box(g, -hw, hw, y0, y0 + 4, -hd, hd, STEEL, { metal: 0.6, rough: 0.3, radius: 0.5 });
      box(g, -hw, hw, y0 + 4, cyTop, -hd, hd, STEEL, { metal: 0.6, rough: 0.3, taper: { x: fw / hw, z: fw / hd } });
      box(g, -fw, fw, cyTop, 265, -fw, fw, STEEL, { metal: 0.6, rough: 0.3, radius: 0.3 });
      box(g, -hw + 4, hw - 4, y0 - 0.4, y0, -hd + 4, hd - 4, 0x6e7478, { metal: 0.7, rough: 0.4, sharp: true });
      for (var k = 1; k < 6; k++) box(g, -hw + 4 + (k * (it.w - 8)) / 6 - 0.2, -hw + 4 + (k * (it.w - 8)) / 6 + 0.2, y0 - 0.6, y0 - 0.4, -hd + 4, hd - 4, 0x3a3f42, { sharp: true, cast: false });
      [-1, 1].forEach(function (s) {
        cyl(g, s * hw * 0.55, y0 - 0.7, hd - 7, 2.2, 0.4, 0xfff6e0, { emis: 0xfff0d0, seg: 16, cast: false });
      });
    },
  },
  aquarium: {
    label: "אקווריום",
    w: 100,
    d: 40,
    h: 70,
    col: "#7fb8c9",
    lamp: {
      y: function (it) {
        return it.h - 6;
      },
      color: 0x9fd8e8,
      intensity: 0.45,
      dist: 300,
    },
    build: function (g, it) {
      /* Aquarium on its cabinet: a stand with two doors, a glass tank with black
         silicone edges and rims, water, a sloped gravel bed with rocks, planted
         stems and a few fish, under a lid with a lit strip. */
      var hw = it.w / 2, hd = it.d / 2, st = 30, lid = 4, tk = it.h - lid, FR = 0x1a1c1e, ST = 0x3a332c,
        gl = { trans: true, opacity: 0.18, rough: 0.04, metal: 0.1, cast: false, sharp: true };
      toeKick(g, -hw, hw, 6, -hd, hd, 0x2a2521);
      box(g, -hw, hw, 6, st - 2, -hd, hd - 2, ST, { rough: 0.6, sharp: true });
      [0, 1].forEach(function (j) {
        front(g, -hw + j * hw, j * hw, 6, st - 2, hd - 2, ST, { kind: "door", hinge: j ? 1 : -1, handle: "knob", handleAt: "top" });
      });
      slab(g, -hw - 0.5, hw + 0.5, st - 2, st, -hd, hd, ST, { rough: 0.5 });
      // glass walls
      box(g, -hw, hw, st, tk, -hd, -hd + 0.8, GLASS, gl);
      box(g, -hw, hw, st, tk, hd - 0.8, hd, GLASS, gl);
      box(g, -hw, -hw + 0.8, st, tk, -hd, hd, GLASS, gl);
      box(g, hw - 0.8, hw, st, tk, -hd, hd, GLASS, gl);
      // silicone edges and rims
      [st, tk - 1.5].forEach(function (y) {
        box(g, -hw, hw, y, y + 1.5, -hd, -hd + 1.2, FR, { rough: 0.4, sharp: true });
        box(g, -hw, hw, y, y + 1.5, hd - 1.2, hd, FR, { rough: 0.4, sharp: true });
        box(g, -hw, -hw + 1.2, y, y + 1.5, -hd, hd, FR, { rough: 0.4, sharp: true });
        box(g, hw - 1.2, hw, y, y + 1.5, -hd, hd, FR, { rough: 0.4, sharp: true });
      });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        box(g, p[0] * hw - 0.6, p[0] * hw + 0.6, st, tk, p[1] * hd - 0.6, p[1] * hd + 0.6, FR, { rough: 0.4, sharp: true });
      });
      // water, gravel, rocks
      box(g, -hw + 0.9, hw - 0.9, st + 1.5, tk - 3, -hd + 0.9, hd - 0.9, 0x3f8fa8, { trans: true, opacity: 0.28, rough: 0.1, cast: false, sharp: true });
      box(g, -hw + 1, hw - 1, st + 1.5, st + 5, -hd + 1, hd - 1, 0x8a7a5e, { rough: 0.95, radius: 0.8, crown: 2.5 });
      [[-0.22, -0.2, 7], [0.26, -0.1, 5.5], [0.05, 0.12, 4]].forEach(function (r) {
        var rk = sph(g, it.w * r[0], st + 5, it.d * r[1], r[2], 0x77706a, { rough: 0.9, seg: 12, segV: 8 });
        if (rk) rk.scale.set(1.3, 0.75, 1);
      });
      // planted clumps: curved blades fanning out of the gravel
      for (var i = 0; i < 6; i++) {
        var cx = -hw + 8 + (((i * 37) % 97) / 97) * (it.w - 16), cz = -hd + 5 + (((i * 53) % 31) / 31) * (it.d * 0.45),
          ch = (tk - st - 10) * (0.45 + ((i * 29) % 11) / 20);
        for (var b = 0; b < 6; b++) {
          var ba = b * 1.05 + i, lean = 2 + (b % 3) * 1.6, bh = ch * (0.6 + (b % 3) * 0.2);
          tube(g, [[cx, st + 4, cz], [cx + Math.cos(ba) * lean * 0.3, st + 4 + bh * 0.5, cz + Math.sin(ba) * lean * 0.3], [cx + Math.cos(ba) * lean, st + 4 + bh, cz + Math.sin(ba) * lean]],
            0.5, GREEN, { rough: 0.8, seg: 5, steps: 10, cast: false });
        }
      }
      // fish
      [[-0.22, 0.55, 0.05, 0xe8873c], [0.18, 0.7, 0.12, 0xe8873c], [0.3, 0.45, -0.1, 0xf0c040], [-0.05, 0.62, -0.05, 0x3c8ae8]].forEach(function (f) {
        var fy = st + (tk - st) * f[1], fx = it.w * f[0], fz = it.d * f[2];
        var b = sph(g, fx, fy, fz, 1.8, f[3], { rough: 0.5, seg: 12, segV: 8 });
        if (b) b.scale.set(1.6, 0.9, 0.55);
        box(g, fx - 4.2, fx - 2.4, fy - 1.2, fy + 1.2, fz - 0.15, fz + 0.15, f[3], { rough: 0.5, sharp: true, cast: false });
      });
      // lid with a lit strip underneath
      box(g, -hw - 0.3, hw + 0.3, tk, it.h, -hd - 0.3, hd + 0.3, FR, { rough: 0.4, radius: 1 });
      box(g, -hw + 4, hw - 4, tk - 0.5, tk, -hd + 5, hd - 5, 0xdff4ff, { emis: 0xbfe8ff, cast: false, sharp: true });
    },
  },
  bench: {
    label: "ספסל",
    w: 120,
    d: 38,
    h: 45,
    col: "#9c7a4e",
    build: function (g, it) {
      /* Slatted bench: three seat boards with shadow gaps on two splayed leg
         frames tied by a stretcher. */
      var hw = it.w / 2, hd = it.d / 2, ty = it.h - 3.5, sd = (it.d - 3) / 3;
      for (var s = 0; s < 3; s++) {
        var z0 = -hd + s * (sd + 1.5);
        box(g, -hw, hw, ty, it.h, z0, z0 + sd, WOOD, { rough: 0.55, radius: 0.8 });
      }
      [-1, 1].forEach(function (sx) {
        var x = sx * (hw - 12);
        [-1, 1].forEach(function (sz) { leg(g, x, sz * (hd - 5), 0, ty, 0x6f5535, "square"); });
        box(g, x - 2, x + 2, ty - 6, ty, -hd + 3, hd - 3, 0x6f5535, { rough: 0.55, radius: 0.5 });
        box(g, x - 1.5, x + 1.5, 10, 13, -hd + 5, hd - 5, 0x6f5535, { rough: 0.55, radius: 0.4 });
      });
      box(g, -hw + 12, hw - 12, 10, 13, -1.5, 1.5, 0x6f5535, { rough: 0.55, radius: 0.4 });
    },
  },
  stairs: {
    label: "מדרגות",
    w: 100,
    d: 250,
    h: 260,
    col: "#b09a76",
    build: function (g, it) {
      /* Staircase, three plans (variant or it.configuration.shape):
           straight — one flight up from the front (+z) to the back;
           L        — up the left side to a quarter landing, then across the back;
           curved   — a quarter-turn winder fanning round the back-left corner.
         Treads have a nosing over each riser, closed stringers carry them, and
         the open side gets a sloped handrail on balusters. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, H = it.h, TR = 0xb09a76,
        n = Math.max(2, Math.min(100, Math.round((it.configuration && it.configuration.stepCount) || it.steps || 14))),
        shape = V.shape || (it.configuration && it.configuration.shape) || "straight", rise = H / n,
        rail = { metal: 0.8, rough: 0.3 };
      function step(x0, x1, z0, z1, k) {
        // solid riser block with a 2 cm nosing tread on top
        var y = (k + 1) * rise;
        box(g, x0, x1, k * rise, y - 3, z0, z1, TR, { rough: 0.7, sharp: true });
        box(g, x0, x1, y - 3, y, z0, z1, TR, { rough: 0.6, radius: 0.5 });
      }
      function railRun(x, z0, y0, z1, y1) {
        var L = Math.hypot(z1 - z0, y1 - y0), r = cyl(g, x, (y0 + y1) / 2 + 90, (z0 + z1) / 2, 2.2, L, WOOD, { rough: 0.45, seg: 12 });
        // tilt the cylinder's y axis onto the rise: up the flight, toward -z
        if (r) r.rotation.x = Math.atan2(z1 - z0, y1 - y0);
      }
      if (shape === "L") {
        var fw = Math.min(it.w * 0.45, 100), n1 = Math.max(1, Math.round(n * 0.55)), n2 = n - n1 - 1,
          len1 = it.d - fw, len2 = it.w - fw;
        for (var i = 0; i < n1; i++) step(-hw, -hw + fw, hd - ((i + 1) * len1) / n1, hd - (i * len1) / n1, i);
        step(-hw, -hw + fw, -hd, -hd + fw, n1); // landing
        for (var j = 0; j < n2; j++) step(-hw + fw + (j * len2) / n2, -hw + fw + ((j + 1) * len2) / n2, -hd, -hd + fw, n1 + 1 + j);
        box(g, -hw + fw, -hw + fw + 3, 0, n1 * rise + 6, -hd + fw, hd, TR, { rough: 0.7, sharp: true }); // open stringer
        railRun(-hw + fw + 1.5, hd, 0, -hd + fw, n1 * rise);
        for (var b = 0; b < n1; b++) cyl(g, -hw + fw + 1.5, (b + 1) * rise + 45, hd - ((b + 0.5) * len1) / n1, 0.9, 90, 0x2b2e31, { metal: 0.6, rough: 0.4, seg: 8 });
        return;
      }
      if (shape === "U") {
        var flightW = Math.min(it.w * 0.45, 100), landingD = Math.min(flightW, it.d * 0.35);
        var flightD = it.d - landingD, first = Math.max(1, Math.floor((n - 1) / 2)), second = Math.max(1, n - first - 1);
        for (var u1 = 0; u1 < first; u1++)
          step(-hw, -hw + flightW, hd - (u1 + 1) * flightD / first, hd - u1 * flightD / first, u1);
        step(-hw, hw, -hd, -hd + landingD, first);
        for (var u2 = 0; u2 < second; u2++)
          step(hw - flightW, hw, -hd + landingD + u2 * flightD / second, -hd + landingD + (u2 + 1) * flightD / second, first + 1 + u2);
        box(g, -hw + flightW - 3, -hw + flightW, 0, first * rise + 6, -hd + landingD, hd, TR, { rough: 0.7, sharp: true });
        box(g, hw - flightW, hw - flightW + 3, first * rise, H, -hd + landingD, hd, TR, { rough: 0.7, sharp: true });
        return;
      }
      if (shape === "curved") {
        // treads fan round the back-left corner through a quarter turn
        var ro = Math.min(it.w, it.d) - 2, ri = Math.max(12, ro * 0.18), cx = -hw, cz = -hd;
        for (var k = 0; k < n; k++) {
          var a0 = (k / n) * (Math.PI / 2), a1 = ((k + 1) / n) * (Math.PI / 2), am = (a0 + a1) / 2,
            rm = (ri + ro) / 2, wdt = (a1 - a0) * ro + 4, y = (k + 1) * rise;
          // a = 0 points toward the front (+z), a = π/2 toward the right (+x)
          var tread = box(g, -(ro - ri) / 2, (ro - ri) / 2, y - 3, y, -wdt / 2, wdt / 2, TR, { rough: 0.6, radius: 0.5 });
          var riser = box(g, -(ro - ri) / 2, (ro - ri) / 2, 0, y - 3, -wdt / 2 + 1, wdt / 2 - 1, TR, { rough: 0.7, sharp: true });
          [tread, riser].forEach(function (m) {
            if (!m) return;
            m.position.x = cx + Math.sin(am) * rm;
            m.position.z = cz + Math.cos(am) * rm;
            m.rotation.y = Math.PI / 2 - am;
          });
          var bx = cx + Math.sin(am) * (ro - 2), bz = cz + Math.cos(am) * (ro - 2);
          cyl(g, bx, y + 45, bz, 0.9, 90, 0x2b2e31, { metal: 0.6, rough: 0.4, seg: 8 });
        }
        cyl(g, cx + 0.1, H / 2, cz + 0.1, ri * 0.7, H, TR, { rough: 0.6, seg: 20 }); // newel column
        return;
      }
      for (var s = 0; s < n; s++) step(-hw, hw, hd - ((s + 1) * it.d) / n, hd - (s * it.d) / n, s);
      [-1, 1].forEach(function (sd) {
        // closed stringers either side, following the pitch
        box(g, sd * hw - (sd > 0 ? 3 : 0), sd * hw + (sd > 0 ? 0 : 3), 0, 12, -hd, hd, TR, { rough: 0.7, sharp: true });
      });
      railRun(hw - 3, hd, 0, -hd, H);
      for (var b2 = 0; b2 < n; b2++) cyl(g, hw - 3, (b2 + 1) * rise + 45, hd - ((b2 + 0.5) * it.d) / n, 0.9, 90, 0x2b2e31, { metal: 0.6, rough: 0.4, seg: 8 });
      cyl(g, hw - 3, 50, hd - 3, 3, 100, WOOD, { rough: 0.45, seg: 12 }); // newel
    },
  },
  fireplace: {
    label: "קמין",
    w: 110,
    d: 42,
    h: 115,
    col: "#6e6a66",
    lamp: { y: 35, color: 0xff9a3c, intensity: 1.1, dist: 430 },
    build: function (g, it) {
      /* Fireplace: a stone surround with a raised hearth and a mantel shelf,
         a sooted firebox with log grate, logs and flames. */
      var hw = it.w / 2, hd = it.d / 2, ow = it.w * 0.3, ST = 0x5e5a56, oh = 60;
      box(g, -hw, -ow, 0, it.h - 6, -hd, hd, ST, { rough: 0.9, radius: 0.8 });
      box(g, ow, hw, 0, it.h - 6, -hd, hd, ST, { rough: 0.9, radius: 0.8 });
      box(g, -ow, ow, oh, it.h - 6, -hd, hd, ST, { rough: 0.9, radius: 0.8 });
      box(g, -hw - 6, hw + 6, 0, 10, -hd, hd + 12, 0x8a8480, { rough: 0.8, radius: 1 }); // hearth
      box(g, -ow, ow, 10, oh, -hd, -hd + 4, 0x151210, { rough: 0.95, sharp: true });
      [-1, 1].forEach(function (s) { box(g, s * ow - (s > 0 ? 3 : 0), s * ow + (s > 0 ? 0 : 3), 10, oh, -hd + 4, hd, 0x2a2622, { rough: 0.95, sharp: true }); });
      box(g, -ow, ow, oh - 3, oh, -hd + 4, hd, 0x2a2622, { rough: 0.95, sharp: true });
      box(g, -hw - 4, hw + 4, it.h - 6, it.h, -hd - 2, hd + 4, 0x8a8480, { rough: 0.7, radius: 1.2 }); // mantel
      [-1, 1].forEach(function (s) { box(g, s * ow * 0.7 - 1, s * ow * 0.7 + 1, 10, 18, -4, 8, 0x2b2e31, { metal: 0.6, rough: 0.5 }); });
      box(g, -ow * 0.75, ow * 0.75, 17, 18.5, -6, 10, 0x2b2e31, { metal: 0.6, rough: 0.5 }); // grate
      cyl(g, 0, 21, 4, 4, ow * 1.3, 0x5a4632, { rough: 0.9, rz: Math.PI / 2 });
      cyl(g, 0, 26, -1, 3.5, ow * 1.1, 0x4e3c2a, { rough: 0.9, rz: Math.PI / 2 });
      sph(g, -7, 30, 2, 6, 0xff9a3c, { emis: 0xff7a2a, cast: false });
      sph(g, 6, 34, 0, 5, 0xff9a3c, { emis: 0xff7a2a, cast: false });
      box(g, -3, 3, 27, 44, -2, 4, 0xffb45c, { emis: 0xff8a2a, cast: false, radius: 1.5 });
    },
  },
  pouf: {
    label: "הדום",
    w: 55,
    d: 55,
    h: 38,
    col: "#b48a66",
    build: function (g, it) {
      /* Round leather pouf: a drum with a domed, piped top and a stitched
         band at the base. */
      var r = Math.min(it.w, it.d) / 2;
      cyl(g, 0, (it.h - 7) / 2 + 1, 0, r - 1, it.h - 9, 0xb48a66, { rough: 0.9, seg: 48, r2: r - 0.5 });
      cyl(g, 0, 1, 0, r - 1.8, 2, 0x8a6a4c, { rough: 0.9, seg: 48 });
      cyl(g, 0, it.h - 7.5, 0, r, 1.4, 0x8a6a4c, { rough: 0.85, seg: 48 });
      var top = sph(g, 0, it.h - 7, 0, r - 0.3, 0xbf9670, { rough: 0.9, seg: 40, segV: 12, thetaLen: Math.PI * 0.5 });
      if (top) top.scale.y = 7 / (r - 0.3);
      cyl(g, 0, it.h - 0.4, 0, 1.4, 0.8, 0x8a6a4c, { rough: 0.8, seg: 14 });
    },
  },
  dressTable: {
    label: "שולחן איפור",
    w: 100,
    d: 44,
    h: 135,
    col: "#d9c39c",
    build: function (g, it) {
      /* Dressing table: drawer pedestals either side of a knee hole, a slim
         top, and a framed mirror standing on it. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, ty = 70, pw = Math.min(28, it.w * 0.28), zf = hd - 2, hs = V.handle || "knob";
      slab(g, -hw, hw, ty, ty + 2.5, -hd, hd, WOOD, { rough: 0.5, radius: 0.6 });
      [-1, 1].forEach(function (s) {
        var x0 = s < 0 ? -hw + 1 : hw - pw, x1 = s < 0 ? -hw + pw : hw - 1;
        box(g, x0, x1, 4, ty, -hd + 1, zf, CAB, { rough: 0.7, sharp: true });
        box(g, x0 + 1, x1 - 1, 0, 4, -hd + 3, zf - 3, 0x3b3936, { rough: 0.8, sharp: true });
        var H = (ty - 4) / 3;
        for (var r = 0; r < 3; r++) front(g, x0, x1, 4 + r * H, 4 + (r + 1) * H, zf, CAB, { kind: "drawer", handle: hs });
      });
      box(g, -hw + pw, hw - pw, ty - 12, ty, -hd + 1, zf, CAB, { rough: 0.7, sharp: true });
      front(g, -hw + pw, hw - pw, ty - 12, ty, zf, CAB, { kind: "drawer", handle: hs });
      var mw = it.w * 0.28;
      box(g, -mw, mw, ty + 2.5, it.h, -hd + 1, -hd + 4, 0x8a6a44, { rough: 0.6, radius: 1.2 });
      box(g, -mw + 2.5, mw - 2.5, ty + 5, it.h - 2.5, -hd + 4, -hd + 4.3, 0xdfe8ec, { metal: 1.0, rough: 0.03 });
      box(g, -mw * 0.6, mw * 0.6, ty + 2.5, ty + 4, -hd + 1, -hd + 10, 0x8a6a44, { rough: 0.6, radius: 0.5 }); // foot
    },
  },
  // ---- light fixtures (each carries a `lamp` descriptor -> a PointLight) ----
  ceilingLight: {
    label: "מנורת תקרה",
    w: 46,
    d: 46,
    h: 10,
    col: "#fff4cf",
    lamp: { y: MOUNTH - 9, color: 0xffe7bb, intensity: 0.95, dist: 680 },
    build: function (g, it) {
      /* Flush ceiling light: a slim trim ring on the ceiling and a frosted
         opal dome diffuser glowing from within. */
      var r = it.w / 2;
      cyl(g, 0, MOUNTH - 1.2, 0, r, 2.4, 0xeef0ee, { rough: 0.4, metal: 0.2, seg: 48 });
      var dome = sph(g, 0, MOUNTH - 2.4, 0, r * 0.88, 0xfff3d2, { emis: 0xffe6a8, rough: 0.3, cast: false, seg: 40, segV: 10, thetaLen: Math.PI / 2 });
      if (dome) { dome.rotation.x = Math.PI; dome.scale.y = 7 / (r * 0.88); }
      cyl(g, 0, MOUNTH - 2.6, 0, r * 0.9, 0.5, 0xeef0ee, { rough: 0.4, metal: 0.2, seg: 48, open: true });
    },
  },
  pendant: {
    label: "מנורה תלויה",
    w: 34,
    d: 34,
    h: 10,
    col: "#caa15e",
    lamp: { y: MOUNTH - 58, color: 0xffd99a, intensity: 1.0, dist: 620 },
    build: function (g, it) {
      /* Pendant: a ceiling canopy, a fabric flex and socket, and a spun shade —
         cone, dome, glass globe, fabric drum or wire cage — with a white reflector
         inside the metal shades and a glowing bulb. */
      var V = vspec(it),
        shade = V.shadeCol != null ? V.shadeCol : 0x2d3338,
        drop = V.drop || 46,
        sh = V.shape || "cone",
        W = it.w,
        cy = MOUNTH - drop,
        so = { rough: V.shadeRough != null ? V.shadeRough : 0.45, metal: V.shadeMetal != null ? V.shadeMetal : 0.5, seg: 40 };
      lathe(g, 0, MOUNTH - 3, 0, [[0, 0], [5, 0], [5.6, 0.6], [5.6, 3], [0, 3]], 0x2b2f33, { metal: 0.4, rough: 0.4, seg: 28 }); // canopy
      cyl(g, 0, (MOUNTH - 3 + cy) / 2, 0, 0.35, MOUNTH - 3 - cy, 0x33383c, { rough: 0.8, seg: 8, cast: false }); // flex
      lathe(g, 0, cy - 5, 0, [[0, 0], [1.7, 0], [1.9, 1], [1.9, 5], [0, 5]], 0x2b2f33, { metal: 0.5, rough: 0.35, seg: 16 }); // socket
      var bulbY = cy - 9;
      if (sh === "globe") {
        var R = W * 0.42;
        sph(g, 0, cy - 5 - R, 0, R, 0xfdf6e6, { trans: true, opacity: 0.5, rough: 0.08, metal: 0.05, seg: 32, segV: 20, cast: false });
        bulbY = cy - 5 - R;
      } else if (sh === "dome") {
        var dp = [[2, 0], [W * 0.16, -1.2], [W * 0.3, -4], [W * 0.42, -9], [W * 0.49, -14], [W * 0.5, -15.2]];
        lathe(g, 0, cy - 4, 0, dp, shade, so);
        lathe(g, 0, cy - 4.4, 0, dp.map(function (p) { return [Math.max(0, p[0] - 0.4), p[1]]; }), 0xf4f1ea, { rough: 0.5, seg: 40, cast: false });
        bulbY = cy - 12;
      } else if (sh === "cage") {
        [cy - 6, cy - 26].forEach(function (y) {
          torus(g, 0, y, 0, W * 0.34, 0.45, shade, { metal: 0.7, rough: 0.35, seg: 28, segR: 6 });
        });
        for (var i = 0; i < 8; i++) {
          var an = (i / 8) * Math.PI * 2, bx = Math.cos(an) * W * 0.34, bz = Math.sin(an) * W * 0.34;
          tube(g, [[bx, cy - 6, bz], [bx * 1.08, cy - 16, bz * 1.08], [bx, cy - 26, bz]], 0.4, shade, { metal: 0.7, rough: 0.35, seg: 6, cast: false });
        }
        var bl = sph(g, 0, cy - 15, 0, 5.5, 0xfff3d0, { emis: 0xffe2a0, cast: false, seg: 20, segV: 14 });
        if (bl) bl.scale.y = 1.35;
        return;
      } else if (sh === "drum") {
        var dc = V.shadeCol != null ? V.shadeCol : 0xe9dcc1;
        lathe(g, 0, cy - 26, 0, [[W * 0.5, 0], [W * 0.5, 22]], dc, { rough: 0.7, trans: true, opacity: 0.94, seg: 48 });
        torus(g, 0, cy - 4, 0, W * 0.5, 0.3, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 48, segR: 5 });
        torus(g, 0, cy - 26, 0, W * 0.5, 0.3, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 48, segR: 5 });
        cyl(g, 0, cy - 25.6, 0, W * 0.49, 0.3, 0xf6efe0, { rough: 0.6, trans: true, opacity: 0.85, seg: 48, cast: false }); // diffuser
        bulbY = cy - 14;
      } else {
        var cp = [[1.9, 0], [2.6, -1], [4.2, -3], [W * 0.5, -17], [W * 0.5 + 0.2, -17.6]];
        lathe(g, 0, cy - 4, 0, cp, shade, so);
        lathe(g, 0, cy - 4.4, 0, cp.map(function (p) { return [Math.max(0, p[0] - 0.4), p[1]]; }), 0xf4f1ea, { rough: 0.5, seg: 40, cast: false });
        bulbY = cy - 12;
      }
      sph(g, 0, bulbY, 0, 4, 0xfff3d0, { emis: 0xffe2a0, cast: false, seg: 20, segV: 14 });
    },
  },
  floorLamp: {
    label: "מנורת רצפה",
    w: 40,
    d: 40,
    h: 160,
    col: "#b9b29e",
    lamp: {
      y: function (it) {
        return it.h - 18;
      },
      color: 0xffe6b4,
      intensity: 0.85,
      dist: 520,
    },
    build: function (g, it) {
      /* Floor lamp: a spun weighted base, a slim stem with a collar, and a
         shade with wire rims; the tripod stands on three turned legs meeting at
         a hub, the arc bends one continuous tube over to a hanging dome. */
      var V = vspec(it),
        stem = V.stemCol != null ? V.stemCol : 0x6e7478,
        shade = V.shadeCol != null ? V.shadeCol : 0xe9dcc1,
        style = V.style || "column",
        W = it.w,
        rim = { metal: 0.8, rough: 0.3, seg: 40, segR: 5 };
      function drumShade(x, y0, rb, rt, H) {
        lathe(g, x, y0, 0, [[rb, 0], [rt, H]], shade, { rough: 0.7, trans: true, opacity: 0.93, seg: 44 });
        torus(g, x, y0, 0, rb, 0.28, 0x8a857c, rim);
        torus(g, x, y0 + H, 0, rt, 0.28, 0x8a857c, rim);
        sph(g, x, y0 + H * 0.4, 0, 4, 0xfff2cc, { emis: 0xffe2a0, cast: false, seg: 18, segV: 12 });
      }
      if (style === "tripod") {
        var apex = it.h - 36, lc = V.legCol != null ? V.legCol : WOOD;
        [0, 1, 2].forEach(function (i) {
          var an = (i / 3) * Math.PI * 2 + Math.PI / 2, fx = Math.cos(an) * W * 0.44, fz = Math.sin(an) * W * 0.44;
          tube(g, [[fx, 0, fz], [fx * 0.08, apex, fz * 0.08]], 1.4, lc, { rough: 0.55, seg: 10 });
          sph(g, fx, 0.8, fz, 1.5, 0x2b2f33, { rough: 0.6, seg: 10, segV: 6 });
        });
        cyl(g, 0, apex + 2, 0, 2.2, 5, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 16 });
        cyl(g, 0, apex + 8, 0, 0.8, 10, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 10 });
        drumShade(0, it.h - 32, W * 0.5, W * 0.4, 30);
        return;
      }
      lathe(g, 0, 0, 0, [[0, 0], [W * 0.42, 0], [W * 0.42, 1.2], [W * 0.38, 2.6], [W * 0.18, 3.8], [2.4, 4.6], [0, 4.6]], 0x42474a, { metal: 0.5, rough: 0.35, seg: 36 });
      if (style === "arc") {
        // one continuous bent tube from the base up and over to the shade
        var R = W * 0.6, x0 = -W * 0.3, xc = x0 + R, yc = it.h - 58, pts = [[x0, 4, 0], [x0, yc * 0.5, 0]];
        for (var k = 0; k <= 12; k++) {
          var th = -Math.PI / 2 + Math.PI * (k / 12);
          pts.push([xc - R * Math.cos(th + Math.PI / 2), yc + R * Math.cos(th), 0]);
        }
        pts.push([xc + R, yc - 4, 0]);
        tube(g, pts, 1.5, stem, { metal: 0.6, rough: 0.35, seg: 10, steps: 64 });
        var ap = [[1.6, 0], [W * 0.12, -1.2], [W * 0.26, -5], [W * 0.34, -12], [W * 0.36, -16]];
        lathe(g, xc + R, yc - 4, 0, ap, 0x2d3338, { metal: 0.55, rough: 0.35, seg: 36 });
        sph(g, xc + R, yc - 12, 0, 4, 0xfff2cc, { emis: 0xffe2a0, cast: false, seg: 18, segV: 12 });
        return;
      }
      var sTop = style === "globe" ? it.h - 16 - W * 0.36 : it.h - 30;
      cyl(g, 0, (4.6 + sTop) / 2, 0, 1.1, sTop - 4.6, stem, { metal: 0.6, rough: 0.35, seg: 12 });
      cyl(g, 0, it.h * 0.45, 0, 1.6, 3, stem, { metal: 0.6, rough: 0.3, seg: 14 }); // collar
      if (style === "globe") {
        cyl(g, 0, sTop + 1, 0, 3, 3, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 16 });
        sph(g, 0, it.h - 16, 0, W * 0.36, 0xfdf6e6, { trans: true, opacity: 0.5, rough: 0.08, seg: 32, segV: 20, cast: false });
        sph(g, 0, it.h - 16, 0, 4, 0xfff2cc, { emis: 0xffe2a0, cast: false, seg: 18, segV: 12 });
        return;
      }
      drumShade(0, it.h - 32, W * 0.5, style === "drum" ? W * 0.5 : W * 0.38, 28);
    },
  },
  tableLamp: {
    label: "מנורת שולחן",
    w: 28,
    d: 28,
    h: 48,
    col: "#cdbf9a",
    lamp: {
      y: function (it) {
        return it.h - 10;
      },
      color: 0xffe1ac,
      intensity: 0.6,
      dist: 360,
    },
    build: function (g, it) {
      /* Table lamp: a glazed ceramic gourd on a turned foot, a metal neck and
         harp, and an open linen drum with a wire rim top and bottom. */
      var r = it.w / 2, sh0 = it.h - 22, sh1 = it.h - 2;
      cyl(g, 0, 1, 0, r * 0.62, 2, 0x55504a, { metal: 0.3, rough: 0.5, seg: 28 });
      var body = sph(g, 0, 11, 0, r * 0.58, 0xd9d1c2, { rough: 0.25, metal: 0.05, seg: 28, segV: 16 });
      if (body) body.scale.y = 0.9;
      cyl(g, 0, 20, 0, r * 0.22, 4, 0xd9d1c2, { rough: 0.25, seg: 20, r2: r * 0.14 });
      cyl(g, 0, (22 + sh0 + 6) / 2, 0, 0.9, sh0 + 6 - 22, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 10 });
      cyl(g, 0, (sh0 + sh1) / 2, 0, r, sh1 - sh0, 0xefe4cb, { rough: 0.7, seg: 36, r2: r * 0.8, open: true, trans: true, opacity: 0.9 });
      cyl(g, 0, sh0 + 0.3, 0, r + 0.1, 0.6, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 36, open: true });
      cyl(g, 0, sh1 - 0.3, 0, r * 0.8 + 0.1, 0.6, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 36, open: true });
      sph(g, 0, sh0 + 5, 0, 3, 0xfff2cc, { emis: 0xffe2a0, cast: false });
    },
  },
  lightStrip: {
    label: "פס תאורה",
    w: 100,
    d: 5,
    h: 2,
    col: "#dddddd",
    lamp: {
      y: function (it) {
        return it.h - 1;
      },
      color: 0xffffff,
      intensity: 1.0,
      dist: 500,
    },
    build: function (g, it) {
      /* LED strip in an aluminium channel: a U-profile, an opal diffuser that
         glows, and end caps. */
      var hw = it.w / 2, hd = it.d / 2, t = 0.35, al = { metal: 0.8, rough: 0.3, sharp: true };
      box(g, -hw, hw, 0, t, -hd, hd, 0xcccccc, al);
      box(g, -hw, hw, t, it.h, -hd, -hd + t, 0xcccccc, al);
      box(g, -hw, hw, t, it.h, hd - t, hd, 0xcccccc, al);
      box(g, -hw + 0.6, hw - 0.6, it.h - 0.7, it.h - 0.2, -hd + t, hd - t, 0xffffff, { emis: 0xffffff, rough: 0.4, cast: false, sharp: true });
      [-1, 1].forEach(function (s) {
        box(g, s * hw - (s > 0 ? 0.6 : 0), s * hw + (s < 0 ? 0.6 : 0), 0, it.h, -hd, hd, 0x9a9fa3, { rough: 0.5, sharp: true });
      });
    },
  },
  nft_pipe_75: {
    label: "צינור NFT 75 מ\"מ",
    w: 300, d: 7.5, h: 10, col: "#f2f5f7",
    build: function (g, it) {
      nftChannel(g, it, 3.75, 15, 2.5, false);
    },
  },
  nft_pipe_110: {
    label: "צינור NFT 110 מ\"מ",
    w: 300, d: 11, h: 15, col: "#f2f5f7",
    build: function (g, it) {
      nftChannel(g, it, 5.5, 20, 3.5, false);
    },
  },
  nft_pipe_160: {
    label: "צינור NFT 160 מ\"מ",
    w: 300, d: 16, h: 20, col: "#f2f5f7",
    build: function (g, it) {
      nftChannel(g, it, 8, 30, 5, false);
    },
  },
  nft_square_12x12: {
    label: "תעלת NFT מרובעת",
    w: 300, d: 12, h: 12, col: "#f2f5f7",
    build: function (g, it) {
      nftChannel(g, it, it.d / 2, 20, 3.5, true);
    },
  },
  dwc_bucket: {
    label: "דלי DWC",
    w: 31, d: 31, h: 40, col: "#222222",
    build: function (g, it) {
      /* Deep-water-culture bucket: a tapered, ribbed pail with a wire bail, a
         lid holding a net pot of clay pebbles, an air line dropping in, and the
         plant growing out of the pot. */
      var r = it.w / 2, H = it.h - 2;
      lathe(g, 0, 0, 0, [[0, 0], [r - 3.2, 0], [r - 2.6, 0.8], [r - 0.8, H - 3], [r, H - 2.6], [r, H], [r - 1, H], [r - 3.4, 1.2], [0, 1.2]], BLACK_PLASTIC, { rough: 0.85, seg: 36 });
      [H * 0.3, H * 0.6].forEach(function (y) {
        torus(g, 0, y, 0, r - 2.6 + (1.8 * y) / H + 0.1, 0.35, BLACK_PLASTIC, { rough: 0.85, seg: 36, segR: 4 });
      });
      [-1, 1].forEach(function (s) {
        cyl(g, s * (r - 0.2), H - 5, 0, 1.4, 1.2, BLACK_PLASTIC, { rough: 0.8, seg: 12, rz: Math.PI / 2 }); // bail lug
      });
      tube(g, [[-(r + 0.4), H - 5, 0], [-(r - 2), H + 6, 0], [0, H + 9, 0], [r - 2, H + 6, 0], [r + 0.4, H - 5, 0]], 0.25, 0x8a9296, { metal: 0.8, rough: 0.35, seg: 5, cast: false });
      cyl(g, 0, H + 0.6, 0, r + 0.2, 1.2, 0x111111, { rough: 0.8, seg: 36 }); // lid
      lathe(g, 0, H + 1.2, 0, [[0, -9], [3.6, -9], [5, -0.4], [6.2, -0.4], [6.2, 0.4], [0, 0.4]], 0x111111, { rough: 0.8, seg: 24 }); // net pot
      var peb = sph(g, 0, H + 1.4, 0, 4.8, 0x9a6a4a, { rough: 0.95, seg: 16, segV: 8, thetaLen: Math.PI / 2 });
      if (peb) peb.scale.y = 0.25;
      tube(g, [[r - 4, H + 1.2, -r + 5], [r - 1, H + 5, -r + 3], [r + 1, H - 6, -r + 4]], 0.3, 0x2b3236, { rough: 0.6, seg: 5, cast: false }); // air line
      cyl(g, 0, H + 6, 0, 0.8, 10, 0x5f8a45, { rough: 0.8, seg: 8 }); // stem
      [[0, 12, 0, 5.5], [3.5, 9, 2, 4], [-3, 10, -2.5, 4.2], [1.5, 15, -2, 3.6]].forEach(function (l) {
        var lf = sph(g, l[0], H + l[1], l[2], l[3], GREEN, { rough: 0.8, seg: 14, segV: 10 });
        if (lf) lf.scale.y = 0.55;
      });
    },
  },
  rdwc_header: {
    label: "מיכל בקרה RDWC",
    w: 40, d: 40, h: 50, col: "#222222",
    build: function (g, it) {
      /* RDWC control bucket: a ribbed square tank with a sealed lid, bulkhead
         fittings on each side with pipe stubs for the loop, a float valve for the
         top-up line and the air-stone line through the lid. */
      var hw = it.w / 2, hd = it.d / 2, H = it.h - 2;
      box(g, -hw + 1, hw - 1, 0, H, -hd + 1, hd - 1, BLACK_PLASTIC, { rough: 0.85, radius: 3 });
      [H * 0.35, H * 0.7].forEach(function (y) {
        box(g, -hw + 0.6, hw - 0.6, y - 0.4, y + 0.4, -hd + 0.6, hd - 0.6, BLACK_PLASTIC, { rough: 0.85, radius: 0.35 });
      });
      box(g, -hw, hw, H, H + 2, -hd, hd, 0x111111, { rough: 0.8, radius: 0.8 }); // lid
      [-1, 1].forEach(function (s) {
        var x = s * (hw - 1);
        cyl(g, x + s * 0.8, H * 0.3, 0, 3.4, 1.6, PVC_WHITE, { rough: 0.5, seg: 6, rz: Math.PI / 2 }); // bulkhead nut
        cyl(g, x + s * 2.8, H * 0.3, 0, 2.5, 4, PVC_WHITE, { rough: 0.45, seg: 20, rz: Math.PI / 2 }); // pipe stub
      });
      cyl(g, hw * 0.4, H + 3, -hd * 0.4, 2.4, 2, PVC_WHITE, { rough: 0.5, seg: 20 }); // top-up float valve
      cyl(g, hw * 0.4, H + 4.6, -hd * 0.4, 0.6, 1.8, 0x2b3236, { rough: 0.6, seg: 8 });
      lathe(g, -hw * 0.3, H + 2, hd * 0.3, [[0, 0], [1.6, 0], [1.2, 1.4], [0.5, 1.8], [0, 1.8]], 0x2b3236, { rough: 0.6, seg: 14 }); // grommet
      tube(g, [[-hw * 0.3, H + 3.6, hd * 0.3], [-hw * 0.2, H + 8, hd * 0.1], [0, H + 6, -hd * 0.2]], 0.3, 0x2b3236, { seg: 5, cast: false });
    },
  },
  ebb_flow_tray: {
    label: "מגש הצפה וריקון",
    w: 120, d: 250, h: 100, col: "#b0b3b5",
    build: function (g, it) {
      /* Flood-and-drain bench: an aluminium table with levelling feet and
         cross rails, a ribbed black flood tray with a drain fitting and a fill
         spout, and rows of rockwool blocks each carrying a seedling. */
      var hw = it.w / 2, hd = it.d / 2, lx = hw - 2.5, lz = hd - 2.5, ty = it.h - 20, al = { metal: 0.6, rough: 0.35, radius: 0.4 };
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        box(g, p[0] * lx - 2, p[0] * lx + 2, 2, ty, p[1] * lz - 2, p[1] * lz + 2, ALUMINUM, al);
        cyl(g, p[0] * lx, 1, p[1] * lz, 2.2, 2, 0x2b3236, { rough: 0.7, seg: 14 }); // levelling foot
      });
      [ty - 3, 18].forEach(function (y) {
        [-1, 1].forEach(function (s) {
          box(g, s * lx - 1.5, s * lx + 1.5, y - 3, y, -lz + 2, lz - 2, ALUMINUM, al);
          box(g, -lx + 2, lx - 2, y - 3, y, s * lz - 1.5, s * lz + 1.5, ALUMINUM, al);
        });
      });
      // the flood tray: floor, raised rim, drainage ribs
      var y0 = ty, t0 = y0 + 1.5, rimT = 3;
      box(g, -hw, hw, y0, t0, -hd, hd, BLACK_PLASTIC, { rough: 0.8, radius: 0.5 });
      box(g, -hw, hw, t0, t0 + 10, -hd, -hd + rimT, BLACK_PLASTIC, { rough: 0.8, radius: 0.8 });
      box(g, -hw, hw, t0, t0 + 10, hd - rimT, hd, BLACK_PLASTIC, { rough: 0.8, radius: 0.8 });
      box(g, -hw, -hw + rimT, t0, t0 + 10, -hd + rimT, hd - rimT, BLACK_PLASTIC, { rough: 0.8, radius: 0.8 });
      box(g, hw - rimT, hw, t0, t0 + 10, -hd + rimT, hd - rimT, BLACK_PLASTIC, { rough: 0.8, radius: 0.8 });
      for (var k = 1; k < 8; k++) {
        var rx = -hw + (k * it.w) / 8;
        box(g, rx - 0.6, rx + 0.6, t0, t0 + 0.8, -hd + rimT + 2, hd - rimT - 2, 0x2b2d30, { rough: 0.8, sharp: true, cast: false });
      }
      cyl(g, hw - 12, t0 + 2.5, -hd + 12, 2.6, 5, PVC_WHITE, { rough: 0.5, seg: 18 }); // overflow standpipe
      cyl(g, hw - 12, y0 - 4, -hd + 12, 1.8, 8, PVC_WHITE, { rough: 0.5, seg: 14 }); // drain
      tube(g, [[-hw + 6, t0 + 14, -hd + 6], [-hw + 8, t0 + 16, -hd + 10], [-hw + 10, t0 + 8, -hd + 12]], 1, PVC_WHITE, { rough: 0.5, seg: 10 }); // fill spout
      // rockwool blocks with seedlings
      var cols = Math.max(2, Math.floor((it.w - 20) / 26)), rows = Math.max(2, Math.floor((it.d - 20) / 30));
      for (var c = 0; c < cols; c++)
        for (var r = 0; r < rows; r++) {
          var bx = -hw + 10 + ((c + 0.5) * (it.w - 20)) / cols, bz = -hd + 10 + ((r + 0.5) * (it.d - 20)) / rows;
          box(g, bx - 5, bx + 5, t0 + 0.8, t0 + 8.5, bz - 5, bz + 5, TUFF, { rough: 1, radius: 0.5 });
          var pl = sph(g, bx, t0 + 12, bz, 5.5, GREEN, { rough: 0.8, seg: 12, segV: 8 });
          if (pl) pl.scale.y = 0.6;
          cyl(g, bx, t0 + 9.5, bz, 0.6, 3, 0x5f8a45, { rough: 0.8, seg: 6, cast: false });
        }
    },
  },
  tower_commercial: {
    label: "מגדל מסחרי",
    w: 60, d: 60, h: 180, col: "#f2f5f7",
    build: function (g, it) {
      /* Commercial aeroponic tower: a lidded reservoir with its pump lead, a
         stack of turned tower sections each with four angled planting pockets
         holding greens, and the irrigation cap on top. */
      var base = 40, secH = 20, top = it.h - 8, n = Math.max(3, Math.floor((top - base) / secH));
      box(g, -25, 25, 0, base - 2, -25, 25, PVC_WHITE, { rough: 0.45, radius: 3 });
      box(g, -26, 26, base - 3, base, -26, 26, 0xe4e8ea, { rough: 0.45, radius: 1.2 }); // lid
      box(g, 22, 25.6, 6, 12, -3, 3, 0xe4e8ea, { rough: 0.5, radius: 0.6 }); // fill hatch
      tube(g, [[25, 8, 0], [29, 6, 0], [29, 0.6, 0]], 0.4, 0x2b3236, { seg: 5, cast: false }); // pump lead
      for (var i = 0; i < n; i++) {
        var y = base + i * secH;
        lathe(g, 0, y, 0, [[7.2, 0], [8.2, 1], [8.2, secH - 2], [7.4, secH - 1], [7.4, secH], [0, secH]], PVC_WHITE, { rough: 0.45, seg: 28 });
        for (var k = 0; k < 4; k++) {
          var an = (k / 4) * Math.PI * 2 + (i % 2) * (Math.PI / 4), c = Math.cos(an), s = Math.sin(an);
          var pk = cyl(g, c * 9.5, y + 11, s * 9.5, 3.4, 7, PVC_WHITE, { rough: 0.45, seg: 16, open: true });
          if (pk) {
            pk.rotation.order = "YXZ";
            pk.rotation.set(0, -an, -0.75);
          }
          var lf = sph(g, c * 12, y + 16, s * 12, 4.6, GREEN, { rough: 0.8, seg: 12, segV: 8 });
          if (lf) lf.scale.set(1.1, 0.7, 1.1);
        }
      }
      lathe(g, 0, base + n * secH, 0, [[0, 0], [7.4, 0], [7.4, 2], [5, 4], [1.2, 4.6], [1.2, 7], [0, 7]], 0xe4e8ea, { rough: 0.45, seg: 28 }); // cap
    },
  },
  tower_diy_pvc: {
    label: "מגדל PVC",
    w: 40, d: 40, h: 180, col: "#f2f5f7",
    build: function (g, it) {
      /* DIY PVC tower: a capped upright pipe on a cross stand, with 45° net-cup
         pockets spiralling up it, each holding a plant. */
      var R = 5.5, H = it.h - 4;
      [0, Math.PI / 2].forEach(function (a) {
        var b = box(g, -it.w / 2 + 1, it.w / 2 - 1, 0, 3, -2, 2, PVC_WHITE, { rough: 0.5, radius: 0.8 });
        if (b) b.rotation.y = a;
      });
      cyl(g, 0, 5, 0, R + 1, 4, 0xe4e8ea, { rough: 0.45, seg: 28 }); // coupling
      cyl(g, 0, (3 + H) / 2, 0, R, H - 3, PVC_WHITE, { rough: 0.45, seg: 28 });
      lathe(g, 0, H, 0, [[0, 0], [R + 0.8, 0], [R + 0.8, 2.4], [R * 0.6, 3.6], [0, 3.8]], 0xe4e8ea, { rough: 0.45, seg: 28 }); // cap
      for (var y = 20, k = 0; y < H - 10; y += 15, k++) {
        var an = k * (Math.PI / 2), c = Math.cos(an), s = Math.sin(an);
        var pk = cyl(g, c * (R + 2.4), y, s * (R + 2.4), 2.8, 6, PVC_WHITE, { rough: 0.45, seg: 16, open: true });
        if (pk) {
          pk.rotation.order = "YXZ";
          pk.rotation.set(0, -an, -Math.PI / 4);
        }
        var lf = sph(g, c * (R + 4.5), y + 4.5, s * (R + 4.5), 4, GREEN, { rough: 0.8, seg: 12, segV: 8 });
        if (lf) lf.scale.y = 0.7;
      }
    },
  },
  water_chiller: {
    label: "צ'ילר",
    w: 30, d: 40, h: 40, col: "#111111",
    build: function (g, it) {
      /* Aquarium-style water chiller: a rounded case on rubber feet, a slatted
         condenser grille on the front, a lit temperature readout with its
         buttons, and hose barbs for the flow and return. */
      var hw = it.w / 2, hd = it.d / 2;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        cyl(g, p[0] * (hw - 4), 0.8, p[1] * (hd - 4), 2, 1.6, 0x16181a, { rough: 0.9, seg: 12 });
      });
      box(g, -hw, hw, 1.6, it.h, -hd, hd, BLACK_PLASTIC, { rough: 0.55, radius: 2.4 });
      box(g, -hw + 2.5, hw - 2.5, 5, it.h - 12, hd - 0.4, hd + 0.2, ALUMINUM, { metal: 0.7, rough: 0.35, radius: 0.6 });
      slats(g, -hw + 3.5, hw - 3.5, 6, it.h - 13, hd + 0.2, 10, 0x2b2d30);
      box(g, -hw + 3, hw - 3, it.h - 10, it.h - 3, hd - 0.2, hd + 0.3, 0x16181a, { rough: 0.2, metal: 0.2, radius: 0.5 }); // panel
      box(g, -hw + 5, -hw + 13, it.h - 8.4, it.h - 4.6, hd + 0.3, hd + 0.4, 0xff5a3c, { emis: 0xd8402a, sharp: true, cast: false }); // readout
      [0, 3.4, 6.8].forEach(function (x) {
        cyl(g, hw - 12 + x, it.h - 6.5, hd + 0.5, 0.9, 0.5, 0x5a6064, { rough: 0.4, seg: 12, rx: Math.PI / 2 });
      });
      [-1, 1].forEach(function (s) {
        cyl(g, s * 5, it.h * 0.5, -hd - 1.5, 1.2, 3, 0x2b3236, { rough: 0.5, seg: 12, rx: Math.PI / 2 }); // hose barbs
        cyl(g, s * 5, it.h * 0.5, -hd - 3.2, 1, 0.6, 0x2b3236, { rough: 0.5, seg: 12, rx: Math.PI / 2, r2: 1.4 });
      });
    },
  },
  grow_tent: {
    label: "אוהל גידול",
    w: 120, d: 120, h: 200, col: "#151515",
    build: function (g, it) {
      /* Grow tent: a steel-pole frame, black canvas walls and roof lined with
         reflective mylar, the front door zipped open and rolled up so the lining
         shows, a floor tray, and a ducting port with its sock on the side. */
      var hw = it.w / 2, hd = it.d / 2, H = it.h, t = 0.4, BK = 0x151515, MY = 0xd8dde0,
        cv = { rough: 0.95, sharp: true }, my = { metal: 0.85, rough: 0.28, sharp: true, cast: false };
      // frame: posts and top rails
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        cyl(g, p[0] * (hw - 1.2), H / 2, p[1] * (hd - 1.2), 1.1, H, ALUMINUM, { metal: 0.7, rough: 0.35, seg: 10 });
      });
      [-1, 1].forEach(function (s) {
        cyl(g, 0, H - 1.2, s * (hd - 1.2), 1.1, it.w - 2.4, ALUMINUM, { metal: 0.7, rough: 0.35, seg: 10, rz: Math.PI / 2 });
        cyl(g, s * (hw - 1.2), H - 1.2, 0, 1.1, it.d - 2.4, ALUMINUM, { metal: 0.7, rough: 0.35, seg: 10, rx: Math.PI / 2 });
      });
      // canvas shell (outside black, inside mylar)
      box(g, -hw, hw, 0, H, -hd, -hd + t, BK, cv);
      box(g, -hw + t, hw - t, 0.5, H - 0.5, -hd + t, -hd + 2 * t, MY, my);
      [-1, 1].forEach(function (s) {
        box(g, s * hw - (s > 0 ? t : 0), s * hw + (s < 0 ? t : 0), 0, H, -hd, hd, BK, cv);
        box(g, s * (hw - t) - (s > 0 ? t : 0), s * (hw - t) + (s < 0 ? t : 0), 0.5, H - 0.5, -hd + t, hd - t, MY, my);
      });
      box(g, -hw, hw, H - t, H, -hd, hd, BK, cv);
      box(g, -hw + t, hw - t, H - 2 * t, H - t, -hd + t, hd - t, MY, my);
      // front: fixed side strips and a lintel, the door rolled up under the lintel
      var dw = it.w * 0.72, dh = H * 0.84;
      box(g, -hw, -dw / 2, 0, H, hd - t, hd, BK, cv);
      box(g, dw / 2, hw, 0, H, hd - t, hd, BK, cv);
      box(g, -dw / 2, dw / 2, dh + 8, H, hd - t, hd, BK, cv);
      cyl(g, 0, dh + 4, hd + 3, 4, dw, BK, { rough: 0.95, seg: 16, rz: Math.PI / 2 }); // rolled door
      [-1, 1].forEach(function (s) {
        box(g, s * dw * 0.3 - 1, s * dw * 0.3 + 1, dh - 4, dh + 8.5, hd + 6.8, hd + 7.2, 0x2b2d30, { sharp: true, cast: false }); // tie strap
        box(g, s * dw / 2 - 0.4, s * dw / 2 + 0.4, 0, dh + 8, hd - 0.1, hd + 0.2, 0x3a3d40, { sharp: true, cast: false }); // zip
      });
      box(g, -hw + 2, hw - 2, 0, 4, -hd + 2, hd - 2, 0x1c1e20, { rough: 0.8, radius: 0.8 }); // floor tray
      // ducting port and sock, upper side
      torus(g, hw + 0.4, H - 32, 0, 10, 1.2, BK, { rough: 0.9, seg: 28, segR: 6, rz: Math.PI / 2 });
      cyl(g, hw + 4, H - 32, 0, 10, 7, BK, { rough: 0.95, seg: 28, rz: Math.PI / 2, open: true });
    },
  },
  led_grow_light: {
    label: "מנורת גידול לד",
    w: 60, d: 60, h: 5, col: "#b0b3b5",
    lamp: { type: "omni", color: "#ff88ff", it: 1.5 },
    build: function (g, it) {
      /* Bar-style LED grow light: parallel aluminium heat-sink bars each with a
         glowing diode strip underneath, joined by end rails, a driver box on
         top, and ratchet hangers rising from the corners. */
      var hw = it.w / 2, hd = it.d / 2, bars = Math.max(4, Math.round(it.w / 10)), al = { metal: 0.65, rough: 0.35 };
      [-1, 1].forEach(function (s) {
        box(g, -hw, hw, it.h - 2.4, it.h, s * hd - (s > 0 ? 2.5 : 0), s * hd + (s < 0 ? 2.5 : 0), ALUMINUM, Object.assign({ radius: 0.5 }, al));
      });
      for (var i = 0; i < bars; i++) {
        var x = -hw + 3 + (i * (it.w - 6)) / (bars - 1);
        box(g, x - 2, x + 2, it.h - 3.2, it.h - 0.4, -hd + 2.5, hd - 2.5, ALUMINUM, Object.assign({ radius: 0.4 }, al));
        box(g, x - 1.4, x + 1.4, it.h - 3.5, it.h - 3.1, -hd + 3.5, hd - 3.5, 0xffbbff, { emis: 0xff88ff, rough: 0.4, sharp: true, cast: false });
      }
      box(g, -8, 8, it.h, it.h + 3.6, -6, 6, 0x2b2f33, { metal: 0.4, rough: 0.5, radius: 0.8 }); // driver
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        var x = p[0] * (hw - 1.5), z = p[1] * (hd - 1.5);
        cyl(g, x, it.h + 8, z, 0.12, 14, 0x16181a, { seg: 4, cast: false }); // hanger cord
        box(g, x - 0.8, x + 0.8, it.h + 14, it.h + 17, z - 0.5, z + 0.5, 0x2b2f33, { rough: 0.5, radius: 0.2, cast: false }); // ratchet
      });
    },
  },
  water_reservoir_60l: {
    label: "מאגר 60 ליטר",
    w: 40, d: 40, h: 50, col: "#222222",
    build: function (g, it) {
      /* 60 L nutrient reservoir: a rounded tub tapering slightly to its base,
         a lid with a hatch, a sight-tube level gauge and a drain tap. */
      var hw = it.w / 2, hd = it.d / 2, H = it.h;
      box(g, -hw, hw, 0, H - 1, -hd, hd, BLACK_PLASTIC, { rough: 0.85, radius: 2.5 });
      box(g, -hw - 0.6, hw + 0.6, H - 1, H + 1.6, -hd - 0.6, hd + 0.6, PVC_WHITE, { rough: 0.6, radius: 0.8 }); // lid
      box(g, -hw * 0.45, hw * 0.45, H + 1.6, H + 2.4, -hd * 0.45, hd * 0.45, PVC_WHITE, { rough: 0.6, radius: 0.4 }); // hatch
      box(g, -hw * 0.2, hw * 0.2, H + 2.4, H + 3, hd * 0.35, hd * 0.45, 0xd8dbdd, { rough: 0.6, radius: 0.2 }); // hatch grip
      cyl(g, hw - 5, H * 0.5, hd + 0.8, 0.8, H - 12, 0xdfe8ec, { trans: true, opacity: 0.5, rough: 0.1, seg: 10 }); // sight tube
      cyl(g, hw - 5, H * 0.32, hd + 0.8, 0.55, H * 0.36, WATER, { rough: 0.2, seg: 10, cast: false });
      cyl(g, -hw + 7, 5, hd + 1.5, 1.4, 3, PVC_WHITE, { rough: 0.5, seg: 14, rx: Math.PI / 2 }); // drain tap
      box(g, -hw + 5.5, -hw + 8.5, 6.2, 7.2, hd + 1.5, hd + 3, 0xc0392b, { rough: 0.5, radius: 0.3 });
    },
  },
  shade_net: {
    label: "רשת הצללה",
    w: 200, d: 200, h: 250, col: "#1a1a1a",
    build: function (g, it) {
      /* Shade-net canopy: four aluminium posts on base plates carrying a top
         frame, the knitted net stretched over it with a slight sag, and guy
         lines to the corners. */
      var hw = it.w / 2, hd = it.d / 2, lx = hw - 2, lz = hd - 2, H = it.h;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        cyl(g, p[0] * lx, H / 2, p[1] * lz, 2, H, ALUMINUM, { metal: 0.6, rough: 0.35, seg: 12 });
        box(g, p[0] * lx - 5, p[0] * lx + 5, 0, 0.8, p[1] * lz - 5, p[1] * lz + 5, ALUMINUM, { metal: 0.6, rough: 0.4, radius: 0.3 });
        sph(g, p[0] * lx, H + 0.6, p[1] * lz, 2.4, ALUMINUM, { metal: 0.6, rough: 0.35, seg: 12, segV: 8 });
      });
      [-1, 1].forEach(function (s) {
        cyl(g, 0, H - 2, s * lz, 1.5, 2 * lx, ALUMINUM, { metal: 0.6, rough: 0.35, seg: 10, rz: Math.PI / 2 });
        cyl(g, s * lx, H - 2, 0, 1.5, 2 * lz, ALUMINUM, { metal: 0.6, rough: 0.35, seg: 10, rx: Math.PI / 2 });
      });
      box(g, -hw, hw, H - 0.6, H + 0.2, -hd, hd, 0x1a1a1a, { rough: 0.9, trans: true, opacity: 0.8, radius: 0.3 });
      for (var i = 1; i < 10; i++) {
        var x = -hw + (i * it.w) / 10, z = -hd + (i * it.d) / 10;
        box(g, x - 0.25, x + 0.25, H + 0.2, H + 0.5, -hd, hd, 0x2b2b2b, { rough: 0.9, sharp: true, cast: false });
        box(g, -hw, hw, H + 0.2, H + 0.5, z - 0.25, z + 0.25, 0x2b2b2b, { rough: 0.9, sharp: true, cast: false });
      }
    },
  }
};


/* ---- model variants ------------------------------------------------------
   A variant is one entry of `FURN[type].variants`, chosen per item via
   `it.variant` (the id). Two mechanisms, freely combined:

   1. FINISH — `swap` remaps source colors to new colors/finishes while the
      model builds (see setSkin in primitives.js). Costs nothing per model:
      because every builder paints with the shared constants from state.js,
      one swap table re-finishes a whole family of models.
   2. SHAPE  — any other field on the variant (e.g. `arms`, `bowls`, `legs`)
      is read by that model's own build() through `vspec(it)`.

   The FIRST variant of a list is the model's original look, so existing
   scenes (which have no `variant`) keep rendering exactly as before.
   `variantOf` falls back to it for unknown ids too. */
export function variantList(type) {
  var f = FURN[type];
  return (f && f.variants && f.variants.length > 1 && f.variants) || null;
}
export function variantOf(it) {
  var vs = it && FURN[it.type] && FURN[it.type].variants;
  if (!vs || !vs.length) return null;
  for (var i = 0; i < vs.length; i++) if (vs[i].id === it.variant) return vs[i];
  return vs[0];
}
// shape parameters for a build(): the chosen variant, or {} when unvarianted
export function vspec(it) {
  return variantOf(it) || {};
}
export function vlabel(v) {
  return getLang() === "en" && v.en ? v.en : v.label;
}
