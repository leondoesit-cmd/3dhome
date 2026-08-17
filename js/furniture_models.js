// Core furniture catalog definitions (FURN) + variant accessors.
import {
  CAB, ISL, TOP, STEEL, DARK, GLASS, HANDLE, FABRIC, WOOD, BEDC, TVB,
  GREEN, RUGC, PVC_WHITE, BLACK_PLASTIC, ALUMINUM, WATER, TUFF, MOUNTH, WALL_H, WALL_T,
} from "./state.js";
import { box, cyl, sph } from "./primitives.js";
import { buildCab } from "./cabinet.js";
import { getLang } from "./i18n.js";
import {
  handleBar, upholstered, legsUnder, slabWithHoles, basin, gooseneck,
} from "./furniture_helpers.js";

export const FURN = {
  base: {
    label: "ארון בסיס",
    w: 60,
    d: 60,
    h: 90,
    col: "#ece5d6",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h - 4, -it.d / 2, it.d / 2, CAB, {
        rough: 0.72,
      });
      box(
        g,
        -it.w / 2 - 1.5,
        it.w / 2 + 1.5,
        it.h - 4,
        it.h,
        -it.d / 2 - 1.5,
        it.d / 2 + 1.5,
        TOP,
        { metal: 0.05, rough: 0.4 },
      );
      handleBar(g, it);
    },
  },
  tall: {
    label: "ארון גבוה",
    w: 60,
    d: 60,
    h: 210,
    col: "#d7c4a3",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h, -it.d / 2, it.d / 2, CAB, {
        rough: 0.7,
      });
      box(g, -1, 1, 4, it.h - 4, it.d / 2 - 1, it.d / 2 + 0.3, 0x9a8c72);
      box(
        g,
        it.w / 2 - 8,
        it.w / 2 - 4,
        it.h * 0.45,
        it.h * 0.55,
        it.d / 2 - 2,
        it.d / 2 - 0.4,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
    },
  },
  island: {
    label: "אי",
    w: 130,
    d: 85,
    h: 90,
    col: "#c8b896",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h - 4, -it.d / 2, it.d / 2, ISL, {
        rough: 0.72,
      });
      box(
        g,
        -it.w / 2 - 4,
        it.w / 2 + 4,
        it.h - 4,
        it.h,
        -it.d / 2 - 4,
        it.d / 2 + 4,
        TOP,
        { metal: 0.05, rough: 0.38 },
      );
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
      var V = vspec(it),
        style = V.style || "inset",
        bowls = V.bowls || 1,
        bcol = V.bowlCol != null ? V.bowlCol : 0x9aa4a9,
        bmat = { metal: V.bowlMetal != null ? V.bowlMetal : 0.65, rough: V.bowlRough != null ? V.bowlRough : 0.26 },
        hw = it.w / 2,
        hd = it.d / 2,
        topT = 4,
        cy0 = it.h - topT, // underside of the worktop
        toe = 8;

      if (style === "vessel") {
        // bathroom vanity: solid top, round basin standing on it
        box(g, -hw + 4, hw - 4, 0, toe, -hd + 5, hd - 3, 0x8c8781, { rough: 0.8 });
        box(g, -hw, hw, toe, cy0, -hd, hd, CAB, { rough: 0.72 });
        box(g, -0.6, 0.6, toe + 4, cy0 - 4, hd - 0.6, hd + 0.3, 0x9a8c72);
        box(g, -hw - 1.5, hw + 1.5, cy0, it.h, -hd - 1.5, hd + 1.5, TOP, {
          metal: 0.05,
          rough: 0.35,
        });
        var br = Math.min(hw - 6, hd - 6, 20),
          bh = V.depth || 13;
        // open-ended tube + floor disc = a bowl with a visible inside
        cyl(g, 0, it.h + bh / 2, 2, br, bh, bcol, {
          metal: 0.03,
          rough: 0.2,
          seg: 32,
          open: true,
          r2: br * 1.06,
        });
        cyl(g, 0, it.h + 1.1, 2, br * 0.99, 2.2, bcol, { metal: 0.03, rough: 0.2, seg: 32 });
        cyl(g, 0, it.h + 2.4, 2, 2.6, 0.7, 0xc6cccf, { metal: 0.9, rough: 0.14, seg: 20 });
        gooseneck(g, 0, it.h, -hd + 8, Math.max(12, hd - 6), 20, 0xc9cfd2, 1.5);
        handleBar(g, it);
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
      box(g, -hw + 4, hw - 4, 0, toe, -hd + 5, hd - 3, 0x8c8781, { rough: 0.8 }); // plinth
      box(g, -hw, hw, toe, Math.max(toe + 2, bBot - 2), -hd, hd, CAB, { rough: 0.72 });
      slabWithHoles(
        g,
        -hw,
        hw,
        Math.max(toe + 2, bBot - 2),
        cy0,
        -hd,
        Math.min(hd, bz1),
        holes,
        CAB,
        { rough: 0.72, skipFront: apron },
      );
      if (!apron) box(g, -hw, hw, Math.max(toe + 2, bBot - 2), cy0, bz1, hd, CAB, { rough: 0.72, sharp: true });
      // door split line + handles, one per bowl
      box(g, -0.6, 0.6, toe + 4, cy0 - 4, hd - 0.6, hd + 0.3, 0x9a8c72);
      if (!apron) handleBar(g, it);

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
          sharp: true,
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
      box(g, -it.w / 2, it.w / 2, 0, it.h - 4, -it.d / 2, it.d / 2, CAB, {
        rough: 0.72,
      });
      box(
        g,
        -it.w / 2 - 1.5,
        it.w / 2 + 1.5,
        it.h - 4,
        it.h,
        -it.d / 2 - 1.5,
        it.d / 2 + 1.5,
        TOP,
        { metal: 0.05, rough: 0.4 },
      );
      box(
        g,
        -it.w / 2 + 7,
        it.w / 2 - 7,
        it.h,
        it.h + 1.4,
        -it.d / 2 + 7,
        it.d / 2 - 7,
        DARK,
        { metal: 0.2, rough: 0.25 },
      );
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(function (p) {
        cyl(
          g,
          p[0] * it.w * 0.2,
          it.h + 1.8,
          p[1] * it.d * 0.18,
          5.5,
          1,
          0x39434a,
          { metal: 0.3 },
        );
      });
    },
  },
  oven: {
    label: "תנור",
    w: 60,
    d: 60,
    h: 90,
    col: "#c9ccce",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h - 4, -it.d / 2, it.d / 2, CAB, {
        rough: 0.72,
      });
      box(
        g,
        -it.w / 2 - 1.5,
        it.w / 2 + 1.5,
        it.h - 4,
        it.h,
        -it.d / 2 - 1.5,
        it.d / 2 + 1.5,
        TOP,
        { metal: 0.05, rough: 0.4 },
      );
      box(
        g,
        -it.w / 2 + 5,
        it.w / 2 - 5,
        it.h * 0.45,
        it.h * 0.85,
        it.d / 2 - 1,
        it.d / 2 + 0.3,
        STEEL,
        { metal: 0.55, rough: 0.35 },
      );
      box(
        g,
        -it.w / 2 + 10,
        it.w / 2 - 10,
        it.h * 0.5,
        it.h * 0.74,
        it.d / 2,
        it.d / 2 + 0.5,
        0x232b2f,
        { metal: 0.3, rough: 0.3 },
      );
      box(
        g,
        -it.w / 2 + 8,
        it.w / 2 - 8,
        it.h * 0.88,
        it.h * 0.93,
        it.d / 2 - 1,
        it.d / 2 + 0.3,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
    },
  },
  dishwasher: {
    label: "מדיח",
    w: 60,
    d: 60,
    h: 90,
    col: "#cfd4d6",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h - 4, -it.d / 2, it.d / 2, CAB, {
        rough: 0.72,
      });
      box(
        g,
        -it.w / 2 - 1.5,
        it.w / 2 + 1.5,
        it.h - 4,
        it.h,
        -it.d / 2 - 1.5,
        it.d / 2 + 1.5,
        TOP,
        { metal: 0.05, rough: 0.4 },
      );
      box(
        g,
        -it.w / 2 + 3,
        it.w / 2 - 3,
        4,
        it.h - 6,
        it.d / 2 - 1,
        it.d / 2 + 0.4,
        STEEL,
        { metal: 0.55, rough: 0.4 },
      );
      box(
        g,
        -it.w / 2 + 6,
        it.w / 2 - 6,
        it.h - 12,
        it.h - 9,
        it.d / 2,
        it.d / 2 + 0.5,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
    },
  },
  fridge: {
    label: "מקרר",
    w: 70,
    d: 70,
    h: 185,
    col: "#d7c4a3",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h, -it.d / 2, it.d / 2, 0xbcc3c7, {
        metal: 0.45,
        rough: 0.35,
      });
      box(
        g,
        -it.w / 2,
        it.w / 2,
        it.h * 0.58 - 1.2,
        it.h * 0.58 + 1.2,
        it.d / 2 - 0.2,
        it.d / 2 + 0.5,
        0x808c92,
        { metal: 0.5 },
      );
      box(
        g,
        it.w / 2 - 7,
        it.w / 2 - 4,
        it.h * 0.3,
        it.h * 0.46,
        it.d / 2,
        it.d / 2 + 1,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
      box(
        g,
        it.w / 2 - 7,
        it.w / 2 - 4,
        it.h * 0.66,
        it.h * 0.82,
        it.d / 2,
        it.d / 2 + 1,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
    },
  },
  wardrobe: {
    label: "ארון בגדים",
    w: 100,
    d: 60,
    h: 210,
    col: "#d7c4a3",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        style = V.style || "hinged";
      if (style === "open") {
        // open wardrobe: carcass, shelves, hanging rail and a few garments
        box(g, -hw, -hw + 2, 0, it.h, -hd, hd, CAB, { rough: 0.7 });
        box(g, hw - 2, hw, 0, it.h, -hd, hd, CAB, { rough: 0.7 });
        box(g, -hw, hw, 0, 3, -hd, hd, CAB, { rough: 0.7 });
        box(g, -hw, hw, it.h - 3, it.h, -hd, hd, CAB, { rough: 0.7 });
        box(g, -hw, hw, 0, it.h, -hd, -hd + 1.5, 0xb5a68b, { rough: 0.8 });
        box(g, -hw + 2, hw - 2, it.h * 0.4, it.h * 0.4 + 2.5, -hd + 2, hd - 2, CAB, { rough: 0.7 });
        cyl(g, 0, it.h - 22, 0, 1.3, it.w - 5, HANDLE, {
          metal: 0.8, rough: 0.3, seg: 12, rz: Math.PI / 2,
        });
        for (var i = 0; i < 5; i++) {
          var gx = -hw + 8 + i * ((it.w - 16) / 5);
          box(g, gx, gx + 6, it.h * 0.4 + 3, it.h - 26, -hd + 8, hd - 8,
            [0x6f7a86, 0x8a6a5a, 0x6a7a62, 0x7a6a86, 0x8a8272][i % 5], { rough: 0.9 });
        }
        return;
      }
      box(g, -hw, hw, 0, it.h, -hd, hd, CAB, { rough: 0.7 });
      if (style === "sliding") {
        // two overlapping panels in a track, one recessed behind the other
        box(g, -hw + 1, 0.5, 4, it.h - 4, hd, hd + 1.6, V.doorCol != null ? V.doorCol : CAB, {
          rough: V.doorRough != null ? V.doorRough : 0.35,
          metal: V.doorMetal,
          trans: V.mirrorDoor,
          opacity: V.mirrorDoor ? 0.9 : 1,
        });
        box(g, -0.5, hw - 1, 4, it.h - 4, hd + 1.8, hd + 3.4, V.doorCol != null ? V.doorCol : CAB, {
          rough: V.doorRough != null ? V.doorRough : 0.35,
          metal: V.doorMetal,
          trans: V.mirrorDoor,
          opacity: V.mirrorDoor ? 0.9 : 1,
        });
        box(g, -hw, hw, it.h - 4, it.h - 2, hd, hd + 3.6, HANDLE, { metal: 0.7, rough: 0.35 });
        box(g, -hw, hw, 2, 4, hd, hd + 3.6, HANDLE, { metal: 0.7, rough: 0.35 });
        return;
      }
      box(g, -1, 1, 4, it.h - 4, hd - 1, hd + 0.3, 0x9a8c72);
      [-1, 1].forEach(function (s) {
        var x = s < 0 ? -hw + 6 : hw - 9;
        box(g, x, x + 3, it.h * 0.45, it.h * 0.6, hd - 2, hd - 0.4, HANDLE, {
          metal: 0.8, rough: 0.3,
        });
      });
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
      box(g, -hw, hw, base, base + frameT, -hd, hd, WOOD, { rough: 0.6 }); // frame
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
      var mT = base + frameT + 16;
      box(g, -hw + 4, hw - 4, base + frameT, mT, -hd + 4, hd - 4, BEDC, soft); // mattress
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
        V.upholsteredHb ? FABRIC : WOOD, V.upholsteredHb ? soft : { rough: 0.6 });
      // pillows + folded blanket
      [-1, 1].forEach(function (s) {
        box(g, s < 0 ? -it.w * 0.42 : it.w * 0.04, s < 0 ? -it.w * 0.04 : it.w * 0.42,
          mT, mT + 12, -hd + 10, -hd + 44, 0xfaf7f0, { rough: 0.97 });
      });
      box(g, -hw + 6, hw - 6, mT - 14, mT + 2, -hd + 50, hd - 6, V.throwCol != null ? V.throwCol : 0xdfd7c8, {
        rough: 0.96,
      });
    },
  },
  table: {
    label: "שולחן",
    w: 120,
    d: 80,
    h: 75,
    col: "#9c7a4e",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        topT = V.topT || 5,
        base = V.base || "legs",
        topCol = V.topCol != null ? V.topCol : WOOD,
        legCol = V.legCol != null ? V.legCol : 0x6f5535;
      box(g, -hw, hw, it.h - topT, it.h, -hd, hd, topCol, {
        rough: V.topRough != null ? V.topRough : 0.5,
        metal: V.topMetal,
        trans: V.glassTop,
        opacity: V.glassTop ? 0.35 : 1,
      });
      if (base === "trestle") {
        // two solid A-frame ends tied by a stretcher
        [-1, 1].forEach(function (s) {
          box(g, s * hw - 4 - 3, s * hw - 4 + 3, 0, it.h - topT, -hd + 6, hd - 6, legCol, { rough: 0.6 });
          box(g, s * hw - 14, s * hw + 4, 0, 5, -hd + 4, hd - 4, legCol, { rough: 0.6 });
        });
        box(g, -hw + 6, hw - 6, it.h * 0.3, it.h * 0.3 + 6, -3, 3, legCol, { rough: 0.6 });
      } else if (base === "pedestal") {
        cyl(g, 0, (it.h - topT) / 2, 0, 7, it.h - topT, legCol, { rough: 0.55, seg: 20 });
        cyl(g, 0, 2, 0, Math.min(hw, hd) * 0.6, 4, legCol, { rough: 0.55, seg: 24 });
      } else if (base === "frame") {
        // steel box frame, industrial look
        [-1, 1].forEach(function (s) {
          box(g, s * hw - 4 - 2, s * hw - 4 + 2, 0, it.h - topT, -hd + 4, -hd + 8, legCol, { metal: 0.8, rough: 0.35 });
          box(g, s * hw - 4 - 2, s * hw - 4 + 2, 0, it.h - topT, hd - 8, hd - 4, legCol, { metal: 0.8, rough: 0.35 });
          box(g, s * hw - 6, s * hw - 2, it.h - topT - 6, it.h - topT - 2, -hd + 4, hd - 4, legCol, { metal: 0.8, rough: 0.35 });
        });
        box(g, -hw + 4, hw - 4, it.h - topT - 6, it.h - topT - 2, -hd + 4, -hd + 8, legCol, { metal: 0.8, rough: 0.35 });
        box(g, -hw + 4, hw - 4, it.h - topT - 6, it.h - topT - 2, hd - 8, hd - 4, legCol, { metal: 0.8, rough: 0.35 });
      } else {
        legsUnder(g, it, V.legs || "square", it.h - topT, 5, legCol);
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
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        seatY = V.seatY || 44,
        padded = !!V.padded,
        legCol = V.legCol != null ? V.legCol : 0x6f5535,
        frameCol = V.frameCol != null ? V.frameCol : WOOD;
      box(g, -hw, hw, seatY, seatY + 4, -hd, hd, frameCol, { rough: 0.5 });
      if (padded)
        box(g, -hw + 1, hw - 1, seatY + 4, seatY + 9, -hd + 1, hd - 1, FABRIC, { rough: 0.95 });
      if (V.backStyle === "slat") {
        // two stiles + horizontal slats
        [-1, 1].forEach(function (s) {
          box(g, s * (hw - 3) - 1.6, s * (hw - 3) + 1.6, seatY, it.h, -hd, -hd + 3.2, frameCol, { rough: 0.5 });
        });
        for (var i = 0; i < 3; i++) {
          var y = seatY + 12 + i * ((it.h - seatY - 16) / 3);
          box(g, -hw + 3, hw - 3, y, y + 5, -hd + 0.4, -hd + 3, frameCol, { rough: 0.5 });
        }
      } else if (V.backStyle === "hoop") {
        cyl(g, 0, it.h - 4, -hd + 4, hw - 2, 3.5, frameCol, { rough: 0.5, seg: 20, rx: Math.PI / 2 });
        [-1, 1].forEach(function (s) {
          box(g, s * (hw - 4) - 1.4, s * (hw - 4) + 1.4, seatY, it.h - 4, -hd + 2, -hd + 5, frameCol, { rough: 0.5 });
        });
      } else {
        box(g, -hw, hw, seatY + 4, it.h, -hd, -hd + 4, padded ? FABRIC : frameCol,
          padded ? { rough: 0.95 } : { rough: 0.5 });
      }
      legsUnder(g, it, V.legs || "square", seatY, 4, legCol);
    },
  },
  tv: {
    label: "טלוויזיה",
    w: 120,
    d: 40,
    h: 55,
    col: "#15191c",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, 30, -it.d / 2, it.d / 2, 0x6f5535, {
        rough: 0.5,
      });
      box(
        g,
        -it.w / 2 + 6,
        it.w / 2 - 6,
        34,
        it.h + 28,
        -it.d / 2 + 6,
        -it.d / 2 + 9,
        TVB,
        { metal: 0.3, rough: 0.3 },
      );
      box(
        g,
        -it.w / 2 + 8,
        it.w / 2 - 8,
        36,
        it.h + 26,
        -it.d / 2 + 6,
        -it.d / 2 + 7,
        0x1d2630,
        { metal: 0.2, rough: 0.2 },
      );
    },
  },
  rug: {
    label: "שטיח",
    w: 200,
    d: 140,
    h: 1,
    col: "#b88f7a",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        inner = V.innerCol != null ? V.innerCol : 0xcaa593,
        flat = { rough: 1, cast: false };
      if (V.round) {
        var rr = Math.min(hw, hd),
          sx = hw / rr;
        [
          cyl(g, 0, 0.6, 0, rr, 1.2, RUGC, { rough: 1, seg: 40, metal: 0 }),
          cyl(g, 0, 1.4, 0, rr - 10, 0.4, inner, { rough: 1, seg: 40, metal: 0 }),
        ].forEach(function (m) {
          if (m) m.scale.x = sx;
        });
        return;
      }
      box(g, -hw, hw, 0, 1.2, -hd, hd, RUGC, flat);
      if (V.stripes) {
        // banded kilim: alternating stripes across the width
        var n = Math.max(4, Math.round(it.d / 25));
        for (var i = 0; i < n; i++) {
          if (i % 2) continue;
          var z0 = -hd + 6 + (i * (it.d - 12)) / n;
          box(g, -hw + 6, hw - 6, 1.2, 1.6, z0, z0 + (it.d - 12) / n - 1, inner, flat);
        }
      } else if (V.shag) {
        // deep pile: a thicker slab plus a scattering of tufts
        box(g, -hw, hw, 1.2, 3.4, -hd, hd, inner, flat);
        for (var k = 0; k < 60; k++) {
          var tx = -hw + 6 + ((k * 3607) % Math.max(1, it.w - 12)),
            tz = -hd + 6 + ((k * 2411) % Math.max(1, it.d - 12));
          cyl(g, tx, 3.8, tz, 2.4, 1.4, inner, { rough: 1, seg: 6, cast: false });
        }
      } else {
        box(g, -hw + 10, hw - 10, 1.2, 1.6, -hd + 10, hd - 10, inner, flat);
        if (V.medallion) {
          box(g, -hw * 0.45, hw * 0.45, 1.6, 1.9, -hd * 0.45, hd * 0.45, RUGC, flat);
          box(g, -hw * 0.28, hw * 0.28, 1.9, 2.2, -hd * 0.28, hd * 0.28, inner, flat);
        }
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
      box(g, -it.w / 2, it.w / 2, it.h - 4, it.h, -it.d / 2, it.d / 2, WOOD, {
        rough: 0.5,
      });
      box(
        g,
        -it.w / 2 + 3,
        -it.w / 2 + 8,
        0,
        it.h - 4,
        -it.d / 2 + 3,
        it.d / 2 - 3,
        0x6f5535,
      );
      box(
        g,
        it.w / 2 - 34,
        it.w / 2 - 2,
        0,
        it.h - 4,
        -it.d / 2 + 2,
        it.d / 2 - 2,
        CAB,
        { rough: 0.7 },
      );
      box(
        g,
        it.w / 2 - 30,
        it.w / 2 - 6,
        it.h - 24,
        it.h - 21,
        it.d / 2 - 3,
        it.d / 2 - 1.6,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
      box(
        g,
        it.w / 2 - 30,
        it.w / 2 - 6,
        it.h - 46,
        it.h - 43,
        it.d / 2 - 3,
        it.d / 2 - 1.6,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
    },
  },
  bookshelf: {
    label: "כוננית ספרים",
    w: 80,
    d: 30,
    h: 180,
    col: "#a8825a",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        rows = V.rows || 4,
        cols = V.cols || 1,
        shelfCol = V.shelfCol != null ? V.shelfCol : WOOD,
        backCol = V.backCol != null ? V.backCol : 0x8a6a44,
        s,
        b;
      box(g, -hw, -hw + 3, 0, it.h, -hd, hd, shelfCol, { rough: 0.6 });
      box(g, hw - 3, hw, 0, it.h, -hd, hd, shelfCol, { rough: 0.6 });
      if (V.back !== false) box(g, -hw, hw, 0, it.h, -hd, -hd + 2, backCol, { rough: 0.7 });
      for (s = 0; s <= rows; s++) {
        var y = 3 + (s * (it.h - 6)) / rows;
        box(g, -hw + 3, hw - 3, y, y + 3, -hd + 2, hd, shelfCol, { rough: 0.6 });
      }
      // vertical dividers turn the case into a cube grid
      for (var c = 1; c < cols; c++) {
        var vx = -hw + (c * it.w) / cols;
        box(g, vx - 1.5, vx + 1.5, 3, it.h - 3, -hd + 2, hd, shelfCol, { rough: 0.6 });
      }
      if (V.empty) return;
      var bc = V.bookCols || [0x7a4a3a, 0x4a6a7a, 0x8a8a4a, 0x5a4a7a, 0x9a6a4a];
      for (s = 0; s < rows; s++) {
        var y2 = 7 + (s * (it.h - 6)) / rows,
          rowH = (it.h - 6) / rows,
          bx = -hw + 6;
        for (b = 0; b < 5 * cols; b++) {
          var bw = 6 + ((s * 7 + b * 3) % 5),
            bh = Math.min(rowH - 6, 20 + ((s * 5 + b * 7) % 10));
          if (bx + bw > hw - 6) break;
          box(g, bx, bx + bw, y2, y2 + bh, -hd + 4, hd - 7, bc[(s + b) % bc.length], {
            rough: 0.85,
          });
          bx += bw + 2;
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
      box(g, -it.w / 2, it.w / 2, 4, it.h, -it.d / 2, it.d / 2, CAB, {
        rough: 0.7,
      });
      box(
        g,
        -it.w / 2 + 2,
        it.w / 2 - 2,
        it.h * 0.52 - 0.8,
        it.h * 0.52 + 0.8,
        it.d / 2 - 0.4,
        it.d / 2 + 0.2,
        0x9a8c72,
      );
      box(
        g,
        -6,
        6,
        it.h * 0.75,
        it.h * 0.75 + 2.6,
        it.d / 2 - 1.6,
        it.d / 2 - 0.2,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
      box(
        g,
        -6,
        6,
        it.h * 0.28,
        it.h * 0.28 + 2.6,
        it.d / 2 - 1.6,
        it.d / 2 - 0.2,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
    },
  },
  dresser: {
    label: "שידה",
    w: 100,
    d: 45,
    h: 80,
    col: "#d3bd97",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 4, it.h, -it.d / 2, it.d / 2, CAB, {
        rough: 0.7,
      });
      for (var r = 1; r < 3; r++)
        box(
          g,
          -it.w / 2 + 2,
          it.w / 2 - 2,
          4 + (r * (it.h - 4)) / 3 - 0.8,
          4 + (r * (it.h - 4)) / 3 + 0.8,
          it.d / 2 - 0.4,
          it.d / 2 + 0.2,
          0x9a8c72,
        );
      for (var r2 = 0; r2 < 3; r2++) {
        var hy = 4 + ((r2 + 0.5) * (it.h - 4)) / 3;
        box(
          g,
          -9,
          9,
          hy - 1.3,
          hy + 1.3,
          it.d / 2 - 1.6,
          it.d / 2 - 0.2,
          HANDLE,
          { metal: 0.8, rough: 0.3 },
        );
      }
    },
  },
  toilet: {
    label: "אסלה",
    w: 40,
    d: 65,
    h: 78,
    col: "#eef0f2",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        cer = V.cerCol != null ? V.cerCol : 0xf0f2f4,
        cerR = V.cerRough != null ? V.cerRough : 0.35,
        seatY = V.wallHung ? 40 : 34;
      if (V.wallHung) {
        // concealed cistern behind a tiled duct panel, bowl cantilevered off it
        box(g, -hw - 3, hw + 3, 0, it.h + 20, -hd, -hd + 18, V.ductCol != null ? V.ductCol : 0xe4e7e9, {
          rough: 0.5,
        });
        box(g, -9, 9, it.h + 6, it.h + 14, -hd + 17, -hd + 19, 0xc9ced1, { metal: 0.5, rough: 0.3 });
        box(g, -hw + 2, hw - 2, seatY, seatY + 16, -hd + 18, hd - 4, cer, { rough: cerR });
        box(g, -hw + 3, hw - 3, seatY + 16, seatY + 20, -hd + 20, hd - 3, 0xf6f8fa, { rough: 0.3 });
        cyl(g, 0, seatY + 8, hd - 12, Math.min(it.w, it.d) / 2 - 8, 15, cer, {
          rough: cerR, seg: 18, metal: 0.02,
        });
        return;
      }
      box(g, -hw, hw, seatY, it.h, -hd, -hd + 14, cer, { rough: cerR }); // cistern
      box(g, -hw + 4, hw - 4, it.h - 6, it.h - 2, -hd + 3, -hd + 11, 0xdde2e5, { rough: 0.4 });
      cyl(g, 0, 17, 7, Math.min(it.w, it.d) / 2 - 5, 34, V.softClose ? cer : 0xf2f4f6, {
        rough: cerR,
        seg: 18,
        r2: Math.min(it.w, it.d) / 2 - 10,
        metal: 0.02,
      });
      box(g, -hw + 3, hw - 3, seatY, seatY + 5, -hd + 12, hd - 3, 0xf6f8fa, { rough: 0.3 });
    },
  },
  bathtub: {
    label: "אמבטיה",
    w: 170,
    d: 75,
    h: 55,
    col: "#e8ecee",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        shell = V.shellCol != null ? V.shellCol : 0xe9edef,
        water = V.waterCol != null ? V.waterCol : 0xd7e2e6;
      if (V.freestanding) {
        // oval tub: an open-ended tube (a rim you can see into) stretched along
        // x to fill the footprint — only the shell is scaled, not the tapware
        var rr = hd - 2,
          sx = hw / rr;
        [
          cyl(g, 0, it.h / 2 + 3, 0, rr, it.h - 3, shell, {
            rough: 0.3, seg: 36, open: true, metal: 0.04,
          }),
          cyl(g, 0, 5, 0, rr * 0.99, 6, shell, { rough: 0.3, seg: 36 }),
          cyl(g, 0, it.h - 7, 0, rr - 5, 3, water, {
            rough: 0.18, seg: 36, metal: 0.15, trans: true, opacity: 0.8, cast: false,
          }),
          cyl(g, 0, 2, 0, rr * 0.6, 4, 0xd9dde0, { rough: 0.6, seg: 24 }),
        ].forEach(function (m) {
          if (m) m.scale.x = sx;
        });
        gooseneck(g, -hw + 22, it.h - 6, -hd + 12, 22, 24, 0xc6cccf, 1.5);
        return;
      }
      // Shell, then a well sunk into it. The rim must be PUNCHED (slabWithHoles)
      // — a solid box's top face would cap the well and hide it completely.
      var iw = hw - 8,
        idp = hd - 8,
        wellBot = 8;
      box(g, -hw, hw, 0, wellBot, -hd, hd, shell, { rough: 0.4 });
      slabWithHoles(g, -hw, hw, wellBot, it.h, -hd, hd,
        [{ x0: -iw, x1: iw, z0: -idp, z1: idp }], shell, { rough: 0.4 });
      basin(g, -iw, iw, -idp, idp, it.h, it.h - wellBot, shell, {
        metal: 0.04, rough: 0.3,
      });
      box(g, -hw + 10, hw - 10, it.h - 12, it.h - 10, -hd + 10, hd - 10, water, {
        rough: 0.18, metal: 0.15, trans: true, opacity: 0.75, cast: false,
      });
      cyl(g, -hw + 16, it.h + 7, 0, 1.6, 14, 0xc6cccf, { metal: 0.9, rough: 0.2 });
      box(g, -hw + 16, -hw + 26, it.h + 12, it.h + 14, -1.2, 1.2, 0xc6cccf, {
        metal: 0.9, rough: 0.2,
      });
      if (V.screen)
        // bath screen: a glass panel at the tap end
        box(g, -hw, -hw + 2, it.h, it.h + 130, -hd, hd - 6, GLASS, {
          trans: true, opacity: 0.22, rough: 0.05, metal: 0.1, cast: false,
        });
    },
  },
  shower: {
    label: "מקלחון",
    w: 90,
    d: 90,
    h: 200,
    col: "#dfe8ec",
    build: function (g, it) {
      var V = vspec(it),
        hw = it.w / 2,
        hd = it.d / 2,
        trayH = V.trayH != null ? V.trayH : 6,
        gl = { trans: true, opacity: 0.22, rough: 0.05, metal: 0.1, cast: false },
        frame = V.frameCol != null ? V.frameCol : 0xc6cccf;
      if (V.walkIn) {
        // wet room: tiled floor, one fixed glass screen, ceiling rain head
        box(g, -hw, hw, 0, 1.5, -hd, hd, V.trayCol != null ? V.trayCol : 0xd6dbde, { rough: 0.55 });
        box(g, hw - 2, hw, 1.5, it.h, -hd, hd - it.d * 0.28, GLASS, gl);
        box(g, hw - 3, hw, 1.5, it.h, -hd - 0.4, -hd + 1.6, frame, { metal: 0.8, rough: 0.3 });
        cyl(g, 0, it.h - 3, 0, 1.4, 8, frame, { metal: 0.9, rough: 0.25 });
        box(g, -12, 12, it.h - 8, it.h - 6, -12, 12, frame, { metal: 0.85, rough: 0.25 });
        gooseneck(g, -hw + 10, 100, -hd + 6, 14, 12, frame, 1.4);
        return;
      }
      box(g, -hw, hw, 0, trayH, -hd, hd, V.trayCol != null ? V.trayCol : 0xe6eaec, { rough: 0.5 });
      if (V.quadrant) {
        // curved corner enclosure: a ring of short glass panels
        var qn = 9,
          qr = Math.min(hw, hd);
        for (var i = 0; i < qn; i++) {
          var am = (Math.PI / 2) * ((i + 0.5) / qn),
            segL = (Math.PI * qr) / (2 * qn) + 1,
            pan = box(g, -segL / 2, segL / 2, trayH, it.h, -1, 1, GLASS, gl);
          if (!pan) continue;
          // panel long axis follows the tangent at `am`, hence ry = -(am + π/2)
          pan.position.set(-hw + qr * Math.cos(am), (trayH + it.h) / 2, -hd + qr * Math.sin(am));
          pan.rotation.y = -(am + Math.PI / 2);
        }
      } else {
        box(g, -hw, -hw + 2, trayH, it.h, -hd, hd, GLASS, gl);
        box(g, hw - 2, hw, trayH, it.h, -hd, hd, GLASS, gl);
        box(g, -hw, hw, trayH, it.h, hd - 2, hd, GLASS, gl);
      }
      cyl(g, 0, (it.h + 60) / 2, -hd + 6, 1.4, it.h - 64, frame, { metal: 0.9, rough: 0.25 });
      cyl(g, 0, it.h - 6, -hd + 18, 7, 2, frame, { metal: 0.9, rough: 0.25 });
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
      var hw = it.w / 2,
        hd = it.d / 2,
        cy0 = it.h - 3,
        depth = 12,
        hole = [{ x0: -hw + 8, x1: hw - 8, z0: -hd + 10, z1: hd - 6 }],
        bBot = it.h - 3 - depth;
      box(g, -hw + 3, hw - 3, 0, 10, -hd + 4, hd - 3, 0x8c8781, { rough: 0.8 }); // plinth
      box(g, -hw, hw, 10, Math.max(12, bBot - 2), -hd, hd, CAB, { rough: 0.7 });
      slabWithHoles(g, -hw, hw, Math.max(12, bBot - 2), cy0, -hd, hd, hole, CAB, {
        rough: 0.7,
      });
      slabWithHoles(g, -hw - 1.5, hw + 1.5, cy0, it.h, -hd - 1.5, hd + 1.5, hole, TOP, {
        rough: 0.35, metal: 0.05,
      });
      basin(g, hole[0].x0, hole[0].x1, hole[0].z0, hole[0].z1, it.h, depth + 3, 0xf4f6f8, {
        metal: 0.02, rough: 0.26,
      });
      gooseneck(g, 0, it.h, -hd + 6, Math.max(12, hd - 4), 13, 0xc6cccf, 1.4);
      box(g, -7, 7, it.h * 0.5, it.h * 0.5 + 2.6, hd - 1.6, hd - 0.2, HANDLE, {
        metal: 0.8, rough: 0.3,
      });
    },
  },
  washer: {
    label: "מכונת כביסה",
    w: 60,
    d: 60,
    h: 85,
    col: "#e6e9eb",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h, -it.d / 2, it.d / 2, 0xe8ebed, {
        metal: 0.15,
        rough: 0.4,
      });
      box(
        g,
        -it.w / 2 + 4,
        it.w / 2 - 4,
        it.h - 11,
        it.h - 3,
        it.d / 2 - 1,
        it.d / 2 + 0.3,
        0x394349,
        { rough: 0.4 },
      );
      cyl(g, 0, it.h * 0.48, it.d / 2 + 0.6, 19, 2.5, 0xb8bfc4, {
        metal: 0.6,
        rough: 0.3,
        rx: Math.PI / 2,
        seg: 28,
      });
      cyl(g, 0, it.h * 0.48, it.d / 2 + 1.6, 14, 2, 0x22303a, {
        metal: 0.2,
        rough: 0.15,
        rx: Math.PI / 2,
        seg: 28,
      });
    },
  },
  upper: {
    label: "ארון עליון",
    w: 80,
    d: 35,
    h: 70,
    col: "#e5ddcb",
    build: function (g, it) {
      var y0 = 145;
      box(g, -it.w / 2, it.w / 2, y0, y0 + it.h, -it.d / 2, it.d / 2, CAB, {
        rough: 0.7,
      });
      box(
        g,
        -1,
        1,
        y0 + 4,
        y0 + it.h - 4,
        it.d / 2 - 1,
        it.d / 2 + 0.3,
        0x9a8c72,
      );
      box(g, -10, 10, y0 + 6, y0 + 9, it.d / 2 - 2, it.d / 2 - 0.4, HANDLE, {
        metal: 0.8,
        rough: 0.3,
      });
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
      cyl(g, 0, 28, 0, 2.5, it.h * 0.5, 0x6b5536, { rough: 0.8 });
      sph(g, 0, it.h * 0.62, 0, it.w * 0.5, GREEN, { rough: 0.95 });
      sph(g, it.w * 0.18, it.h * 0.78, it.d * 0.1, it.w * 0.34, 0x7da064, {
        rough: 0.95,
      });
      sph(g, -it.w * 0.16, it.h * 0.84, -it.d * 0.08, it.w * 0.3, 0x638554, {
        rough: 0.95,
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
      box(g, -it.w / 2, it.w / 2, it.h - 4, it.h, -it.d / 2, it.d / 2, WOOD, {
        rough: 0.5,
      });
      box(
        g,
        -it.w / 2 + 6,
        it.w / 2 - 6,
        12,
        15,
        -it.d / 2 + 5,
        it.d / 2 - 5,
        0x8a6a44,
        { rough: 0.6 },
      );
      var lx = it.w / 2 - 4,
        lz = it.d / 2 - 4;
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(function (p) {
        box(
          g,
          p[0] * lx - 2,
          p[0] * lx + 2,
          0,
          it.h - 4,
          p[1] * lz - 2,
          p[1] * lz + 2,
          0x6f5535,
        );
      });
    },
  },
  sideTable: {
    label: "שולחן צד",
    w: 45,
    d: 45,
    h: 55,
    col: "#a98a5f",
    build: function (g, it) {
      cyl(g, 0, it.h - 1.5, 0, it.w / 2, 3, WOOD, { rough: 0.5, seg: 24 });
      cyl(g, 0, (2 + it.h - 3) / 2, 0, 2.5, it.h - 5, 0x6f5535, { rough: 0.6 });
      cyl(g, 0, 1, 0, it.w * 0.32, 2, 0x6f5535, { rough: 0.6, seg: 24 });
    },
  },
  tvunit: {
    label: "מזנון טלוויזיה",
    w: 160,
    d: 40,
    h: 45,
    col: "#8a6f4d",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 8, it.h - 3, -it.d / 2, it.d / 2, WOOD, {
        rough: 0.6,
      });
      box(
        g,
        -it.w / 2,
        it.w / 2,
        it.h - 3,
        it.h,
        -it.d / 2,
        it.d / 2,
        0x6f5535,
        { rough: 0.5 },
      );
      box(
        g,
        -it.w / 6 - 1,
        -it.w / 6 + 1,
        10,
        it.h - 5,
        it.d / 2 - 0.4,
        it.d / 2 + 0.2,
        0x6f5535,
      );
      box(
        g,
        it.w / 6 - 1,
        it.w / 6 + 1,
        10,
        it.h - 5,
        it.d / 2 - 0.4,
        it.d / 2 + 0.2,
        0x6f5535,
      );
      [-it.w / 3, 0, it.w / 3].forEach(function (x) {
        box(
          g,
          x - 5,
          x + 5,
          it.h - 9,
          it.h - 7,
          it.d / 2 - 1.6,
          it.d / 2 - 0.2,
          HANDLE,
          { metal: 0.8, rough: 0.3 },
        );
      });
      var lx = it.w / 2 - 6,
        lz = it.d / 2 - 5;
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(function (p) {
        box(
          g,
          p[0] * lx - 2,
          p[0] * lx + 2,
          0,
          8,
          p[1] * lz - 2,
          p[1] * lz + 2,
          0x4b4540,
        );
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
      cyl(g, 0, it.h - 2, 0, it.w / 2, 4, WOOD, { rough: 0.5, seg: 32 });
      cyl(g, 0, (3 + it.h - 4) / 2, 0, 5, it.h - 7, 0x6f5535, { rough: 0.6 });
      cyl(g, 0, 1.5, 0, it.w * 0.3, 3, 0x6f5535, { rough: 0.6, seg: 28 });
    },
  },
  barstool: {
    label: "כיסא בר",
    w: 40,
    d: 40,
    h: 100,
    col: "#8d8d8d",
    build: function (g, it) {
      var sy = it.h * 0.75;
      cyl(g, 0, sy + 3, 0, it.w * 0.42, 6, 0x4a4f54, { rough: 0.9, seg: 24 });
      cyl(g, 0, sy / 2, 0, 2.2, sy, STEEL, { metal: 0.8, rough: 0.3 });
      cyl(g, 0, it.h * 0.3, 0, it.w * 0.3, 2, STEEL, {
        metal: 0.8,
        rough: 0.3,
        seg: 24,
      });
      cyl(g, 0, 1.5, 0, it.w * 0.4, 3, STEEL, {
        metal: 0.7,
        rough: 0.35,
        seg: 24,
      });
    },
  },
  officeChair: {
    label: "כיסא משרדי",
    w: 60,
    d: 60,
    h: 108,
    col: "#4a4f54",
    build: function (g, it) {
      box(
        g,
        -it.w / 2 + 6,
        it.w / 2 - 6,
        45,
        53,
        -it.d / 2 + 8,
        it.d / 2 - 6,
        0x3a3f44,
        { rough: 0.9 },
      );
      box(
        g,
        -it.w / 2 + 9,
        it.w / 2 - 9,
        53,
        it.h - 8,
        -it.d / 2 + 4,
        -it.d / 2 + 12,
        0x3a3f44,
        { rough: 0.9 },
      );
      cyl(g, 0, 24, 0, 2.4, 42, STEEL, { metal: 0.8, rough: 0.3 });
      cyl(g, 0, 1.5, 0, it.w * 0.42, 3, DARK, {
        metal: 0.5,
        rough: 0.4,
        seg: 24,
      });
      box(
        g,
        -it.w / 2 + 2,
        -it.w / 2 + 8,
        60,
        64,
        -it.d / 2 + 16,
        it.d / 2 - 16,
        0x2c3034,
        { rough: 0.7 },
      );
      box(
        g,
        it.w / 2 - 8,
        it.w / 2 - 2,
        60,
        64,
        -it.d / 2 + 16,
        it.d / 2 - 16,
        0x2c3034,
        { rough: 0.7 },
      );
    },
  },
  piano: {
    label: "פסנתר",
    w: 150,
    d: 62,
    h: 108,
    col: "#2e2a28",
    build: function (g, it) {
      var bz = -it.d / 2 + it.d * 0.6,
        PB = 0x24201e;
      box(g, -it.w / 2, it.w / 2, 0, it.h, -it.d / 2, bz, PB, {
        rough: 0.35,
        metal: 0.15,
      });
      box(g, -it.w / 2, it.w / 2, 70, 78, bz, it.d / 2, PB, {
        rough: 0.35,
        metal: 0.15,
      });
      box(
        g,
        -it.w / 2 + 6,
        it.w / 2 - 6,
        78,
        80.5,
        bz,
        it.d / 2 - 3,
        0xf5f2ea,
        { rough: 0.4 },
      );
      for (var k = 1; k < 6; k++) {
        var kx = -it.w / 2 + 6 + (k * (it.w - 12)) / 6;
        box(g, kx - 0.5, kx + 0.5, 78, 81, bz + 0.5, it.d / 2 - 3.5, 0x1a1614, {
          rough: 0.4,
        });
      }
      box(
        g,
        -it.w / 2 + 4,
        -it.w / 2 + 10,
        0,
        70,
        it.d / 2 - 7,
        it.d / 2 - 1,
        PB,
        { rough: 0.35, metal: 0.15 },
      );
      box(
        g,
        it.w / 2 - 10,
        it.w / 2 - 4,
        0,
        70,
        it.d / 2 - 7,
        it.d / 2 - 1,
        PB,
        { rough: 0.35, metal: 0.15 },
      );
      [-9, 0, 9].forEach(function (x) {
        box(g, x - 2.5, x + 2.5, 2, 4, it.d / 2 - 6, it.d / 2 + 1, HANDLE, {
          metal: 0.8,
          rough: 0.3,
        });
      });
    },
  },
  crib: {
    label: "מיטת תינוק",
    w: 130,
    d: 70,
    h: 90,
    col: "#e7d9c4",
    build: function (g, it) {
      var LW = 0xd8c8a8,
        lx = it.w / 2 - 3,
        lz = it.d / 2 - 3,
        i,
        n,
        x,
        z;
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(function (p) {
        box(
          g,
          p[0] * lx - 3,
          p[0] * lx + 3,
          0,
          it.h,
          p[1] * lz - 3,
          p[1] * lz + 3,
          LW,
          { rough: 0.7 },
        );
      });
      box(
        g,
        -it.w / 2 + 4,
        it.w / 2 - 4,
        28,
        36,
        -it.d / 2 + 4,
        it.d / 2 - 4,
        BEDC,
        { rough: 0.95 },
      );
      n = Math.max(3, Math.round(it.w / 11));
      for (i = 1; i < n; i++) {
        x = -it.w / 2 + (i * it.w) / n;
        box(g, x - 1, x + 1, 36, it.h - 5, -it.d / 2 + 1, -it.d / 2 + 3, LW, {
          rough: 0.7,
        });
        box(g, x - 1, x + 1, 36, it.h - 5, it.d / 2 - 3, it.d / 2 - 1, LW, {
          rough: 0.7,
        });
      }
      n = Math.max(3, Math.round(it.d / 11));
      for (i = 1; i < n; i++) {
        z = -it.d / 2 + (i * it.d) / n;
        box(g, -it.w / 2 + 1, -it.w / 2 + 3, 36, it.h - 5, z - 1, z + 1, LW, {
          rough: 0.7,
        });
        box(g, it.w / 2 - 3, it.w / 2 - 1, 36, it.h - 5, z - 1, z + 1, LW, {
          rough: 0.7,
        });
      }
      box(
        g,
        -it.w / 2,
        it.w / 2,
        it.h - 5,
        it.h - 2,
        -it.d / 2,
        -it.d / 2 + 4,
        LW,
        { rough: 0.7 },
      );
      box(
        g,
        -it.w / 2,
        it.w / 2,
        it.h - 5,
        it.h - 2,
        it.d / 2 - 4,
        it.d / 2,
        LW,
        { rough: 0.7 },
      );
      box(
        g,
        -it.w / 2,
        -it.w / 2 + 4,
        it.h - 5,
        it.h - 2,
        -it.d / 2,
        it.d / 2,
        LW,
        { rough: 0.7 },
      );
      box(
        g,
        it.w / 2 - 4,
        it.w / 2,
        it.h - 5,
        it.h - 2,
        -it.d / 2,
        it.d / 2,
        LW,
        { rough: 0.7 },
      );
    },
  },
  bunk: {
    label: "מיטת קומתיים",
    w: 100,
    d: 200,
    h: 165,
    col: "#b98d5e",
    build: function (g, it) {
      var lx = it.w / 2 - 3,
        lz = it.d / 2 - 3,
        y2 = it.h * 0.67,
        i;
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(function (p) {
        box(
          g,
          p[0] * lx - 3,
          p[0] * lx + 3,
          0,
          it.h,
          p[1] * lz - 3,
          p[1] * lz + 3,
          WOOD,
          { rough: 0.6 },
        );
      });
      [it.h * 0.21, y2].forEach(function (y) {
        box(g, -it.w / 2, it.w / 2, y - 8, y, -it.d / 2, it.d / 2, WOOD, {
          rough: 0.6,
        });
        box(
          g,
          -it.w / 2 + 4,
          it.w / 2 - 4,
          y,
          y + 10,
          -it.d / 2 + 4,
          it.d / 2 - 4,
          BEDC,
          { rough: 0.95 },
        );
      });
      box(
        g,
        -it.w / 2 + 4,
        it.w / 2 - 4,
        y2 + 24,
        y2 + 29,
        it.d / 2 - 4,
        it.d / 2 - 1,
        WOOD,
        { rough: 0.6 },
      );
      box(g, -14, -10, 0, y2 + 20, it.d / 2, it.d / 2 + 4, WOOD, {
        rough: 0.6,
      });
      box(g, 10, 14, 0, y2 + 20, it.d / 2, it.d / 2 + 4, WOOD, { rough: 0.6 });
      for (i = 0; i < 4; i++) {
        var ry = it.h * (0.17 + i * 0.17);
        box(
          g,
          -10,
          10,
          ry - 1.5,
          ry + 1.5,
          it.d / 2 + 0.5,
          it.d / 2 + 3.5,
          WOOD,
          { rough: 0.6 },
        );
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
      box(g, -it.w / 2, it.w / 2, 4, it.h, -2.5, 2.5, WOOD, { rough: 0.6 });
      box(g, -it.w / 2 + 3, it.w / 2 - 3, 7, it.h - 3, 1.5, 3, 0xdfe8ec, {
        metal: 1.0,
        rough: 0.03,
      });
      box(g, -it.w / 2 + 2, -it.w / 2 + 8, 0, 4, -it.d / 2, it.d / 2, WOOD, {
        rough: 0.6,
      });
      box(g, it.w / 2 - 8, it.w / 2 - 2, 0, 4, -it.d / 2, it.d / 2, WOOD, {
        rough: 0.6,
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
      var y0 = 105,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd, WOOD, { rough: 0.55 });
      box(g, -hw + 3, hw - 3, y0 + 3, y0 + it.h - 3, hd - 0.8, hd + 0.2, 0xdfe8ec, {
        metal: 1.0,
        rough: 0.03,
      });
    },
  },
  art: {
    label: "תמונת קיר",
    w: 70,
    d: 6,
    h: 95,
    col: "#c9b17e",
    build: function (g, it) {
      var y0 = 115;
      box(
        g,
        -it.w / 2,
        it.w / 2,
        y0,
        y0 + it.h,
        -it.d / 2,
        -it.d / 2 + 4,
        0x4a3826,
        { rough: 0.6 },
      );
      box(
        g,
        -it.w / 2 + 4,
        it.w / 2 - 4,
        y0 + 4,
        y0 + it.h - 4,
        -it.d / 2 + 1,
        -it.d / 2 + 4.4,
        0xe8e2d4,
        { rough: 0.85 },
      );
      box(
        g,
        -it.w / 2 + 8,
        -it.w * 0.05,
        y0 + it.h * 0.35,
        y0 + it.h - 10,
        -it.d / 2 + 2,
        -it.d / 2 + 4.8,
        0xc06a4a,
        { rough: 0.85 },
      );
      box(
        g,
        it.w * 0.02,
        it.w / 2 - 8,
        y0 + 8,
        y0 + it.h * 0.6,
        -it.d / 2 + 2,
        -it.d / 2 + 4.9,
        0x4a7a8c,
        { rough: 0.85 },
      );
      box(
        g,
        -it.w * 0.2,
        it.w * 0.3,
        y0 + 10,
        y0 + it.h * 0.4,
        -it.d / 2 + 2,
        -it.d / 2 + 5,
        0xd8b76a,
        { rough: 0.85 },
      );
    },
  },
  ac: {
    label: "מזגן עילי",
    w: 90,
    d: 24,
    h: 28,
    col: "#eef1f2",
    build: function (g, it) {
      var y0 = 212;
      box(
        g,
        -it.w / 2,
        it.w / 2,
        y0,
        y0 + it.h,
        -it.d / 2,
        it.d / 2,
        0xeef1f2,
        { rough: 0.35 },
      );
      box(
        g,
        -it.w / 2 + 4,
        it.w / 2 - 4,
        y0 + 2,
        y0 + 7,
        it.d / 2 - 0.5,
        it.d / 2 + 0.3,
        0x39434a,
        { rough: 0.5 },
      );
      box(
        g,
        it.w / 2 - 8,
        it.w / 2 - 5,
        y0 + 10,
        y0 + 12,
        it.d / 2,
        it.d / 2 + 0.4,
        0x44ff88,
        { emis: 0x44ff88, cast: false },
      );
    },
  },
  shoeCab: {
    label: "ארון נעליים",
    w: 90,
    d: 32,
    h: 120,
    col: "#d8c8a8",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 4, it.h, -it.d / 2, it.d / 2, CAB, {
        rough: 0.7,
      });
      for (var r = 1; r < 3; r++)
        box(
          g,
          -it.w / 2 + 2,
          it.w / 2 - 2,
          4 + (r * (it.h - 4)) / 3 - 0.8,
          4 + (r * (it.h - 4)) / 3 + 0.8,
          it.d / 2 - 0.4,
          it.d / 2 + 0.2,
          0x9a8c72,
        );
      for (var r2 = 0; r2 < 3; r2++) {
        var hy = 4 + ((r2 + 0.72) * (it.h - 4)) / 3;
        cyl(g, 0, hy, it.d / 2 + 0.6, 1.6, 1.6, HANDLE, {
          metal: 0.8,
          rough: 0.3,
          rx: Math.PI / 2,
          seg: 12,
        });
      }
    },
  },
  coatRack: {
    label: "מתלה מעילים",
    w: 45,
    d: 45,
    h: 175,
    col: "#7a5c3e",
    build: function (g, it) {
      cyl(g, 0, 1.5, 0, it.w * 0.35, 3, 0x6f5535, { rough: 0.6, seg: 20 });
      cyl(g, 0, it.h / 2, 0, 2.2, it.h - 3, 0x7a5c3e, { rough: 0.6 });
      box(g, -it.w / 2, 0, it.h - 12, it.h - 9, -1.5, 1.5, 0x7a5c3e, {
        rough: 0.6,
      });
      box(g, 0, it.w / 2, it.h - 16, it.h - 13, -1.5, 1.5, 0x7a5c3e, {
        rough: 0.6,
      });
      box(g, -1.5, 1.5, it.h - 12, it.h - 9, -it.d / 2, 0, 0x7a5c3e, {
        rough: 0.6,
      });
      box(g, -1.5, 1.5, it.h - 16, it.h - 13, 0, it.d / 2, 0x7a5c3e, {
        rough: 0.6,
      });
    },
  },
  dryer: {
    label: "מייבש כביסה",
    w: 60,
    d: 60,
    h: 85,
    col: "#e6e9eb",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h, -it.d / 2, it.d / 2, 0xdfe3e5, {
        metal: 0.15,
        rough: 0.4,
      });
      box(
        g,
        -it.w / 2 + 4,
        it.w / 2 - 4,
        it.h - 11,
        it.h - 3,
        it.d / 2 - 1,
        it.d / 2 + 0.3,
        0x394349,
        { rough: 0.4 },
      );
      cyl(
        g,
        0,
        it.h * 0.48,
        it.d / 2 + 0.6,
        Math.min(it.w, it.d) * 0.32,
        2.5,
        0x9aa2a8,
        { metal: 0.6, rough: 0.3, rx: Math.PI / 2, seg: 28 },
      );
      cyl(
        g,
        0,
        it.h * 0.48,
        it.d / 2 + 1.6,
        Math.min(it.w, it.d) * 0.23,
        2,
        0x22303a,
        { metal: 0.2, rough: 0.15, rx: Math.PI / 2, seg: 28 },
      );
    },
  },
  microwave: {
    label: "מיקרוגל",
    w: 50,
    d: 38,
    h: 30,
    col: "#d7dadd",
    build: function (g, it) {
      var y0 = 92;
      box(
        g,
        -it.w / 2,
        it.w / 2,
        y0,
        y0 + it.h,
        -it.d / 2,
        it.d / 2,
        0xd7dadd,
        { metal: 0.2, rough: 0.4 },
      );
      box(
        g,
        -it.w / 2 + 3,
        it.w / 2 - 14,
        y0 + 3,
        y0 + it.h - 3,
        it.d / 2 - 0.5,
        it.d / 2 + 0.3,
        0x232b2f,
        { metal: 0.2, rough: 0.25 },
      );
      box(
        g,
        it.w / 2 - 12,
        it.w / 2 - 3,
        y0 + 3,
        y0 + it.h - 3,
        it.d / 2 - 0.5,
        it.d / 2 + 0.2,
        0x9aa2a8,
        { metal: 0.4, rough: 0.4 },
      );
    },
  },
  hood: {
    label: "קולט אדים",
    w: 62,
    d: 50,
    h: 55,
    col: "#c3c9cd",
    build: function (g, it) {
      var y0 = 150;
      box(g, -it.w / 2, it.w / 2, y0, y0 + 6, -it.d / 2, it.d / 2, STEEL, {
        metal: 0.6,
        rough: 0.35,
      });
      box(
        g,
        -it.w / 2 + 8,
        it.w / 2 - 8,
        y0 + 6,
        y0 + 16,
        -it.d / 2 + 6,
        it.d / 2 - 6,
        0xbfc6ca,
        { metal: 0.6, rough: 0.35 },
      );
      box(g, -10, 10, y0 + 16, 265, -10, 10, STEEL, {
        metal: 0.6,
        rough: 0.35,
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
      box(g, -it.w / 2, it.w / 2, 0, 30, -it.d / 2, it.d / 2, 0x3a332c, {
        rough: 0.7,
      });
      box(g, -it.w / 2, -it.w / 2 + 1.5, 30, it.h, -it.d / 2, it.d / 2, GLASS, {
        trans: true,
        opacity: 0.22,
        rough: 0.05,
        metal: 0.1,
        cast: false,
      });
      box(g, it.w / 2 - 1.5, it.w / 2, 30, it.h, -it.d / 2, it.d / 2, GLASS, {
        trans: true,
        opacity: 0.22,
        rough: 0.05,
        metal: 0.1,
        cast: false,
      });
      box(g, -it.w / 2, it.w / 2, 30, it.h, -it.d / 2, -it.d / 2 + 1.5, GLASS, {
        trans: true,
        opacity: 0.22,
        rough: 0.05,
        metal: 0.1,
        cast: false,
      });
      box(g, -it.w / 2, it.w / 2, 30, it.h, it.d / 2 - 1.5, it.d / 2, GLASS, {
        trans: true,
        opacity: 0.22,
        rough: 0.05,
        metal: 0.1,
        cast: false,
      });
      box(
        g,
        -it.w / 2 + 2,
        it.w / 2 - 2,
        32,
        it.h - 8,
        -it.d / 2 + 2,
        it.d / 2 - 2,
        0x3f8fa8,
        { trans: true, opacity: 0.45, rough: 0.2, cast: false },
      );
      box(
        g,
        -it.w / 2 + 2,
        it.w / 2 - 2,
        30,
        34,
        -it.d / 2 + 2,
        it.d / 2 - 2,
        0x6b5b43,
        { rough: 0.95 },
      );
      sph(g, -it.w * 0.2, it.h * 0.65, 0, 2.5, 0xe8873c, { rough: 0.6 });
      sph(g, it.w * 0.18, it.h * 0.75, it.d * 0.1, 2.5, 0xe8873c, {
        rough: 0.6,
      });
      cyl(g, it.w * 0.3, 44, -it.d * 0.15, 3, 24, GREEN, {
        rough: 0.95,
        r2: 0.8,
      });
    },
  },
  bench: {
    label: "ספסל",
    w: 120,
    d: 38,
    h: 45,
    col: "#9c7a4e",
    build: function (g, it) {
      var sd = (it.d - 8) / 3;
      for (var s = 0; s < 3; s++) {
        var z0 = -it.d / 2 + s * (sd + 4);
        box(g, -it.w / 2, it.w / 2, it.h - 4, it.h, z0, z0 + sd, WOOD, {
          rough: 0.6,
        });
      }
      box(
        g,
        -it.w / 2 + 6,
        -it.w / 2 + 12,
        0,
        it.h - 4,
        -it.d / 2 + 3,
        it.d / 2 - 3,
        0x6f5535,
        { rough: 0.6 },
      );
      box(
        g,
        it.w / 2 - 12,
        it.w / 2 - 6,
        0,
        it.h - 4,
        -it.d / 2 + 3,
        it.d / 2 - 3,
        0x6f5535,
        { rough: 0.6 },
      );
    },
  },
  stairs: {
    label: "מדרגות",
    w: 100,
    d: 250,
    h: 260,
    col: "#b09a76",
    build: function (g, it) {
      for (var i = 0; i < 10; i++)
        box(
          g,
          -it.w / 2,
          it.w / 2,
          0,
          ((i + 1) * it.h) / 10,
          it.d / 2 - ((i + 1) * it.d) / 10,
          it.d / 2 - (i * it.d) / 10,
          0xb09a76,
          { rough: 0.7 },
        );
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
      var ow = it.w * 0.3,
        ST = 0x5e5a56;
      box(g, -it.w / 2, -ow, 0, it.h - 6, -it.d / 2, it.d / 2, ST, {
        rough: 0.95,
      });
      box(g, ow, it.w / 2, 0, it.h - 6, -it.d / 2, it.d / 2, ST, {
        rough: 0.95,
      });
      box(g, -ow, ow, 0, 10, -it.d / 2, it.d / 2, ST, { rough: 0.95 });
      box(g, -ow, ow, 58, it.h - 6, -it.d / 2, it.d / 2, ST, { rough: 0.95 });
      box(g, -ow, ow, 10, 58, -it.d / 2, -it.d / 2 + 6, 0x151210, {
        rough: 0.9,
      });
      box(
        g,
        -it.w / 2 - 3,
        it.w / 2 + 3,
        it.h - 6,
        it.h,
        -it.d / 2 - 2,
        it.d / 2 + 2,
        0x8a8480,
        { rough: 0.8 },
      );
      cyl(g, 0, 15, 4, 4, ow * 1.4, 0x5a4632, { rough: 0.9, rz: Math.PI / 2 });
      cyl(g, 0, 21, -2, 3.5, ow * 1.1, 0x4e3c2a, {
        rough: 0.9,
        rz: Math.PI / 2,
      });
      sph(g, -7, 27, 2, 6, 0xff9a3c, { emis: 0xff7a2a, cast: false });
      sph(g, 6, 31, 0, 5, 0xff9a3c, { emis: 0xff7a2a, cast: false });
      box(g, -3, 3, 24, 42, -2, 4, 0xff9a3c, { emis: 0xff7a2a, cast: false });
    },
  },
  pouf: {
    label: "הדום",
    w: 55,
    d: 55,
    h: 38,
    col: "#b48a66",
    build: function (g, it) {
      box(
        g,
        -it.w / 2 + 2,
        it.w / 2 - 2,
        0,
        it.h - 8,
        -it.d / 2 + 2,
        it.d / 2 - 2,
        0xb48a66,
        { rough: 0.97 },
      );
      box(
        g,
        -it.w / 2,
        it.w / 2,
        it.h - 8,
        it.h,
        -it.d / 2,
        it.d / 2,
        0xbf9670,
        { rough: 0.97 },
      );
      box(
        g,
        -it.w / 2 + 1,
        it.w / 2 - 1,
        it.h - 9.2,
        it.h - 8.4,
        -it.d / 2 + 1,
        it.d / 2 - 1,
        0x8a6a4c,
        { rough: 0.97 },
      );
    },
  },
  dressTable: {
    label: "שולחן איפור",
    w: 100,
    d: 44,
    h: 135,
    col: "#d9c39c",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 68, 72, -it.d / 2, it.d / 2, WOOD, {
        rough: 0.5,
      });
      box(
        g,
        -it.w / 2 + 2,
        -it.w / 2 + 26,
        0,
        68,
        -it.d / 2 + 2,
        it.d / 2 - 2,
        CAB,
        { rough: 0.7 },
      );
      box(
        g,
        it.w / 2 - 26,
        it.w / 2 - 2,
        0,
        68,
        -it.d / 2 + 2,
        it.d / 2 - 2,
        CAB,
        { rough: 0.7 },
      );
      box(
        g,
        -it.w / 2 + 8,
        -it.w / 2 + 20,
        40,
        42.6,
        it.d / 2 - 3.4,
        it.d / 2 - 1.8,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
      box(
        g,
        it.w / 2 - 20,
        it.w / 2 - 8,
        40,
        42.6,
        it.d / 2 - 3.4,
        it.d / 2 - 1.8,
        HANDLE,
        { metal: 0.8, rough: 0.3 },
      );
      box(
        g,
        -it.w * 0.28,
        it.w * 0.28,
        74,
        it.h,
        -it.d / 2,
        -it.d / 2 + 4,
        0x8a6a44,
        { rough: 0.6 },
      );
      box(
        g,
        -it.w * 0.28 + 3,
        it.w * 0.28 - 3,
        78,
        it.h - 3,
        -it.d / 2 + 3,
        -it.d / 2 + 4.5,
        0xdfe8ec,
        { metal: 1.0, rough: 0.03 },
      );
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
      cyl(g, 0, MOUNTH - 2, 0, it.w * 0.5, 3, 0xeef0ee, {
        rough: 0.4,
        metal: 0.2,
      });
      cyl(g, 0, MOUNTH - 5, 0, it.w * 0.4, 3, 0xfff3d2, {
        emis: 0xffe6a8,
        rough: 0.3,
        cast: false,
      });
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
      var V = vspec(it),
        shade = V.shadeCol != null ? V.shadeCol : 0x2d3338,
        drop = V.drop || 46,
        sh = V.shape || "cone";
      cyl(g, 0, MOUNTH - 1, 0, 2.4, 2, 0x2b2f33, { metal: 0.4 }); // ceiling rose
      box(g, -0.7, 0.7, MOUNTH - drop, MOUNTH - 2, -0.7, 0.7, 0x33383c, { cast: false });
      if (sh === "globe") {
        sph(g, 0, MOUNTH - drop - 12, 0, it.w * 0.42, 0xfdf6e6, {
          trans: true, opacity: 0.55, rough: 0.1, metal: 0.05,
        });
      } else if (sh === "dome") {
        cyl(g, 0, MOUNTH - drop - 7, 0, it.w * 0.5, 14, shade, {
          rough: V.shadeRough != null ? V.shadeRough : 0.4,
          metal: V.shadeMetal != null ? V.shadeMetal : 0.6,
          r2: it.w * 0.3,
        });
      } else if (sh === "cage") {
        // bare-bulb cage: ring + vertical bars
        cyl(g, 0, MOUNTH - drop - 1, 0, it.w * 0.34, 1.2, shade, { metal: 0.7, rough: 0.35, seg: 20 });
        cyl(g, 0, MOUNTH - drop - 20, 0, it.w * 0.34, 1.2, shade, { metal: 0.7, rough: 0.35, seg: 20 });
        for (var i = 0; i < 8; i++) {
          var an = (i / 8) * Math.PI * 2,
            bx = Math.cos(an) * it.w * 0.34,
            bz = Math.sin(an) * it.w * 0.34;
          box(g, bx - 0.5, bx + 0.5, MOUNTH - drop - 20, MOUNTH - drop, bz - 0.5, bz + 0.5, shade, {
            metal: 0.7, rough: 0.35, cast: false,
          });
        }
      } else if (sh === "drum") {
        cyl(g, 0, MOUNTH - drop - 11, 0, it.w * 0.5, 22, V.shadeCol != null ? V.shadeCol : 0xe9dcc1, {
          rough: 0.65, trans: true, opacity: 0.94,
        });
      } else {
        cyl(g, 0, MOUNTH - drop - 8, 0, it.w * 0.5, 17, shade, {
          rough: V.shadeRough != null ? V.shadeRough : 0.5,
          metal: V.shadeMetal != null ? V.shadeMetal : 0.3,
          r2: it.w * 0.13,
        });
      }
      sph(g, 0, MOUNTH - drop - 11, 0, 4, 0xfff3d0, { emis: 0xffe2a0, cast: false });
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
      var V = vspec(it),
        stem = V.stemCol != null ? V.stemCol : 0x6e7478,
        shade = V.shadeCol != null ? V.shadeCol : 0xe9dcc1,
        style = V.style || "column";
      if (style === "tripod") {
        // three splayed wooden legs meeting under the shade
        [0, 1, 2].forEach(function (i) {
          var an = (i / 3) * Math.PI * 2;
          cyl(g, (Math.cos(an) * it.w) / 2.6, (it.h - 40) / 2, (Math.sin(an) * it.w) / 2.6, 1.5,
            it.h - 34, V.legCol != null ? V.legCol : WOOD, {
              rough: 0.55, seg: 10,
              rx: -Math.sin(an) * 0.26, rz: Math.cos(an) * 0.26,
            });
        });
        cyl(g, 0, it.h - 20, 0, it.w * 0.5, 30, shade, {
          rough: 0.6, r2: it.w * 0.4, trans: true, opacity: 0.93,
        });
        sph(g, 0, it.h - 22, 0, 4, 0xfff2cc, { emis: 0xffe2a0, cast: false });
        return;
      }
      cyl(g, 0, 2, 0, it.w * 0.42, 4, 0x42474a, { metal: 0.4, rough: 0.5 }); // base
      if (style === "arc") {
        // slim stem that arcs over the room, shade hanging head-down at the end.
        // Arc centre (xc, yc), radius R: point = (xc + R·sinθ, yc + R·cosθ) and
        // the tangent gives rz = -(θ + π/2) — the XZ version of gooseneck().
        var R = it.w * 0.6,
          x0 = -it.w * 0.3,
          xc = x0 + R,
          yc = it.h - 58,
          N = 12;
        cyl(g, x0, (yc + 2) / 2, 0, 1.6, yc - 2, stem, { metal: 0.6, rough: 0.35 });
        for (var k = 0; k < N; k++) {
          var th = -Math.PI / 2 + Math.PI * ((k + 0.5) / N);
          cyl(g, xc + R * Math.sin(th), yc + R * Math.cos(th), 0, 1.6, (Math.PI * R) / N + 0.9, stem, {
            metal: 0.6, rough: 0.35, seg: 12, rz: -(th + Math.PI / 2),
          });
        }
        cyl(g, xc + R, yc - 11, 0, it.w * 0.34, 20, shade, {
          rough: 0.6, r2: it.w * 0.24, trans: true, opacity: 0.93,
        });
        sph(g, xc + R, yc - 19, 0, 4, 0xfff2cc, { emis: 0xffe2a0, cast: false });
        return;
      }
      cyl(g, 0, (6 + it.h - 34) / 2, 0, 1.6, it.h - 40, stem, { metal: 0.5, rough: 0.45 });
      if (style === "globe")
        sph(g, 0, it.h - 16, 0, it.w * 0.36, 0xfdf6e6, {
          trans: true, opacity: 0.5, rough: 0.1,
        });
      else
        cyl(g, 0, it.h - 18, 0, it.w * 0.5, 28, shade, {
          rough: 0.6,
          r2: style === "drum" ? it.w * 0.5 : it.w * 0.38,
          trans: true,
          opacity: 0.92,
        });
      sph(g, 0, it.h - 20, 0, 4, 0xfff2cc, { emis: 0xffe2a0, cast: false });
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
      cyl(g, 0, 2, 0, it.w * 0.34, 4, 0x55504a, { metal: 0.3, rough: 0.5 });
      cyl(g, 0, (6 + it.h - 22) / 2, 0, 1.3, it.h - 28, 0x8a857c, {
        metal: 0.4,
      });
      cyl(g, 0, it.h - 12, 0, it.w * 0.5, 20, 0xefe4cb, {
        rough: 0.6,
        r2: it.w * 0.34,
        trans: true,
        opacity: 0.92,
      });
      sph(g, 0, it.h - 13, 0, 3, 0xfff2cc, { emis: 0xffe2a0, cast: false });
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
      box(g, -it.w / 2, it.w / 2, 0, it.h, -it.d / 2, it.d / 2, 0xcccccc, {
        metal: 0.8,
        rough: 0.2,
      });
      box(g, -it.w / 2 + 1, it.w / 2 - 1, it.h - 0.5, it.h, -it.d / 2 + 1, it.d / 2 - 1, 0xffffff, {
        emis: 0xffffff,
        cast: false,
      });
    },
  },
  nft_pipe_75: {
    label: "צינור NFT 75 מ\"מ",
    w: 300, d: 7.5, h: 10, col: "#f2f5f7",
    build: function(g, it) {
      cyl(g, 0, it.h/2, 0, 3.75, it.w, PVC_WHITE, { rz: Math.PI/2, seg: 16 });
      for(var i=-120; i<=120; i+=15) {
        cyl(g, i, it.h/2 + 3.75, 0, 2.5, 0.5, BLACK_PLASTIC, { seg: 8 });
      }
    }
  },
  nft_pipe_110: {
    label: "צינור NFT 110 מ\"מ",
    w: 300, d: 11, h: 15, col: "#f2f5f7",
    build: function(g, it) {
      cyl(g, 0, it.h/2, 0, 5.5, it.w, PVC_WHITE, { rz: Math.PI/2, seg: 24 });
      for(var i=-120; i<=120; i+=20) {
        cyl(g, i, it.h/2 + 5.5, 0, 3.5, 0.5, BLACK_PLASTIC, { seg: 12 });
      }
    }
  },
  nft_pipe_160: {
    label: "צינור NFT 160 מ\"מ",
    w: 300, d: 16, h: 20, col: "#f2f5f7",
    build: function(g, it) {
      cyl(g, 0, it.h/2, 0, 8, it.w, PVC_WHITE, { rz: Math.PI/2, seg: 24 });
      for(var i=-120; i<=120; i+=30) {
        cyl(g, i, it.h/2 + 8, 0, 5, 0.5, BLACK_PLASTIC, { seg: 16 });
      }
    }
  },
  nft_square_12x12: {
    label: "תעלת NFT מרובעת",
    w: 300, d: 12, h: 12, col: "#f2f5f7",
    build: function(g, it) {
      box(g, -it.w/2, it.w/2, 0, it.h, -it.d/2, it.d/2, PVC_WHITE, { rough: 0.5 });
      for(var i=-120; i<=120; i+=20) {
        cyl(g, i, it.h, 0, 3.5, 0.5, BLACK_PLASTIC, { seg: 12 });
      }
    }
  },
  dwc_bucket: {
    label: "דלי DWC",
    w: 31, d: 31, h: 40, col: "#222222",
    build: function(g, it) {
      cyl(g, 0, it.h/2, 0, it.w/2, it.h, BLACK_PLASTIC, { rough: 0.9, seg: 24 });
      cyl(g, 0, it.h, 0, 10, 1, 0x111111, { rough: 0.9, seg: 16 });
      cyl(g, 0, it.h + 5, 0, 5, 15, GREEN, { rough: 0.7, seg: 12 });
    }
  },
  rdwc_header: {
    label: "מיכל בקרה RDWC",
    w: 40, d: 40, h: 50, col: "#222222",
    build: function(g, it) {
      box(g, -it.w/2, it.w/2, 0, it.h, -it.d/2, it.d/2, BLACK_PLASTIC, { rough: 0.9 });
      cyl(g, 0, it.h, 0, 5, 2, PVC_WHITE, { rough: 0.5 });
    }
  },
  ebb_flow_tray: {
    label: "מגש הצפה וריקון",
    w: 120, d: 250, h: 100, col: "#b0b3b5",
    build: function(g, it) {
      var lx = it.w/2 - 2, lz = it.d/2 - 2;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(p) {
        box(g, p[0]*lx - 2, p[0]*lx + 2, 0, 80, p[1]*lz - 2, p[1]*lz + 2, ALUMINUM, { metal: 0.6 });
      });
      box(g, -it.w/2, it.w/2, 80, 95, -it.d/2, it.d/2, BLACK_PLASTIC, { rough: 0.8 });
      box(g, -it.w/2 + 2, it.w/2 - 2, 82, 90, -it.d/2 + 2, it.d/2 - 2, TUFF, { rough: 1 });
      cyl(g, -it.w/2 + 10, 85, -it.d/2 + 10, 4, 15, PVC_WHITE, { seg: 12 }); 
    }
  },
  tower_commercial: {
    label: "מגדל מסחרי",
    w: 60, d: 60, h: 180, col: "#f2f5f7",
    build: function(g, it) {
      box(g, -25, 25, 0, 40, -25, 25, PVC_WHITE, { rough: 0.5 });
      for(var i=40; i<170; i+=20) {
        cyl(g, 0, i+10, 0, 8, 18, PVC_WHITE, { seg: 16 });
        [[-1,0],[1,0],[0,-1],[0,1]].forEach(function(p) {
          box(g, p[0]*10 - 3, p[0]*10 + 3, i+5, i+12, p[1]*10 - 3, p[1]*10 + 3, PVC_WHITE);
        });
      }
    }
  },
  tower_diy_pvc: {
    label: "מגדל PVC",
    w: 40, d: 40, h: 180, col: "#f2f5f7",
    build: function(g, it) {
      cyl(g, 0, it.h/2, 0, 10, it.h, PVC_WHITE, { seg: 24 });
      for(var i=20; i<170; i+=15) {
        var a = (i/15) * (Math.PI/2);
        box(g, Math.cos(a)*10 - 4, Math.cos(a)*10 + 4, i, i+8, Math.sin(a)*10 - 4, Math.sin(a)*10 + 4, PVC_WHITE);
      }
    }
  },
  water_chiller: {
    label: "צ'ילר",
    w: 30, d: 40, h: 40, col: "#111111",
    build: function(g, it) {
      box(g, -it.w/2, it.w/2, 0, it.h, -it.d/2, it.d/2, BLACK_PLASTIC, { rough: 0.6 });
      box(g, -it.w/2 + 2, it.w/2 - 2, 10, it.h - 5, it.d/2, it.d/2 + 1, ALUMINUM, { metal: 0.8 });
    }
  },
  grow_tent: {
    label: "אוהל גידול",
    w: 120, d: 120, h: 200, col: "#151515",
    build: function(g, it) {
      box(g, -it.w/2, it.w/2, 0, it.h, -it.d/2, it.d/2, 0x151515, { rough: 0.9, trans: true, opacity: 0.95 });
      var lx = it.w/2 - 1, lz = it.d/2 - 1;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(p) {
        box(g, p[0]*lx - 1, p[0]*lx + 1, 0, it.h, p[1]*lz - 1, p[1]*lz + 1, ALUMINUM, { metal: 0.7 });
      });
    }
  },
  led_grow_light: {
    label: "מנורת גידול לד",
    w: 60, d: 60, h: 5, col: "#b0b3b5",
    lamp: { type: "omni", color: "#ff88ff", it: 1.5 },
    build: function(g, it) {
      box(g, -it.w/2, it.w/2, it.h-3, it.h, -it.d/2, it.d/2, ALUMINUM, { metal: 0.6 });
      box(g, -it.w/2 + 2, it.w/2 - 2, 0, 2, -it.d/2 + 2, it.d/2 - 2, 0xffbbff, { emis: 0xff88ff });
    }
  },
  water_reservoir_60l: {
    label: "מאגר 60 ליטר",
    w: 40, d: 40, h: 50, col: "#222222",
    build: function(g, it) {
      box(g, -it.w/2, it.w/2, 0, it.h, -it.d/2, it.d/2, BLACK_PLASTIC, { rough: 0.9 });
      box(g, -it.w/2, it.w/2, it.h, it.h + 2, -it.d/2, it.d/2, PVC_WHITE, { rough: 0.8 });
    }
  },
  shade_net: {
    label: "רשת הצללה",
    w: 200, d: 200, h: 250, col: "#1a1a1a",
    build: function(g, it) {
      var lx = it.w/2 - 2, lz = it.d/2 - 2;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(p) {
        cyl(g, p[0]*lx, it.h/2, p[1]*lz, 2, it.h, ALUMINUM, { metal: 0.6, seg: 12 });
      });
      box(g, -it.w/2, it.w/2, it.h, it.h + 1, -it.d/2, it.d/2, 0x1a1a1a, { rough: 0.9, trans: true, opacity: 0.8 });
    }
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
