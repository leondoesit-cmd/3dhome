// Additional built-in furniture models appended onto FURN.
import {
  CAB, ISL, TOP, STEEL, DARK, GLASS, HANDLE, FABRIC, WOOD, BEDC, TVB,
  GREEN, RUGC, PVC_WHITE, BLACK_PLASTIC, ALUMINUM, WATER, TUFF, MOUNTH,
} from "./state.js";
import { box, cyl, sph } from "./primitives.js";
import { HumanFactory } from "./human.js";
import {
  handleBar, upholstered, legsUnder, slabWithHoles, basin, gooseneck,
} from "./furniture_helpers.js";
import { FURN, vspec, smartOn } from "./furniture_models.js";

// ================= COMPUTER MODELS =================
Object.assign(FURN, {
  desktop_pc: {
    label: "מחשב נייח",
    w: 20,
    d: 45,
    h: 45,
    col: "#1a1c1e",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, it.h, -it.d / 2, it.d / 2, 0x1a1c1e, { rough: 0.4 });
      box(g, -it.w / 2 + 1, it.w / 2 - 1, 2, it.h - 2, it.d / 2, it.d / 2 + 1, 0x2a2c2e, { rough: 0.5 });
      box(g, -it.w / 2 + 4, it.w / 2 - 4, it.h - 10, it.h - 6, it.d / 2 + 1, it.d / 2 + 1.2, 0x111111);
    }
  },
  laptop: {
    label: "מחשב נייד",
    w: 35,
    d: 25,
    h: 22,
    col: "#d1d5d8",
    build: function (g, it) {
      box(g, -it.w / 2, it.w / 2, 0, 1.5, -it.d / 2, it.d / 2, 0xc0c4c8, { metal: 0.4, rough: 0.3 });
      box(g, -it.w / 2 + 2, it.w / 2 - 2, 1.5, 1.7, -it.d / 2 + 2, it.d / 2 - 8, 0x111111);
      box(g, -5, 5, 1.5, 1.7, it.d / 2 - 6, it.d / 2 - 1, 0xadb1b5);
      box(g, -it.w / 2, it.w / 2, 1.5, it.h, -it.d / 2, -it.d / 2 + 1.5, 0xc0c4c8, { metal: 0.4, rough: 0.3 });
      box(g, -it.w / 2 + 1, it.w / 2 - 1, 3, it.h - 1, -it.d / 2 + 1.5, -it.d / 2 + 1.8, 0x111111, { metal: 0.1, rough: 0.1 });
    }
  },
  monitor: {
    label: "מסך מחשב",
    w: 55,
    d: 15,
    h: 40,
    col: "#1a1c1e",
    build: function (g, it) {
      box(g, -10, 10, 0, 1, -6, 6, 0x2a2c2e, { rough: 0.4 });
      box(g, -2, 2, 1, 12, -2, 0, 0x2a2c2e, { rough: 0.4 });
      box(g, -it.w / 2, it.w / 2, 10, it.h, -it.d / 2 + 5, it.d / 2, 0x1a1c1e, { rough: 0.5 });
      box(g, -it.w / 2 + 1, it.w / 2 - 1, 11, it.h - 1, it.d / 2, it.d / 2 + 0.5, 0x111111, { metal: 0.2, rough: 0.2 });
    }
  }
});

// ================= HUMAN MODELS =================
Object.assign(FURN, {
  man: { label: "גבר", w: 50, d: 30, h: 170, col: "#e8b48c", build: function (g, it) { HumanFactory.buildMesh(g, 'man'); } },
  woman: { label: "אישה", w: 45, d: 25, h: 165, col: "#e8b48c", build: function (g, it) { HumanFactory.buildMesh(g, 'woman'); } },
  boy: { label: "ילד", w: 40, d: 20, h: 130, col: "#e8b48c", build: function (g, it) { HumanFactory.buildMesh(g, 'boy'); } },
  girl: { label: "ילדה", w: 38, d: 18, h: 125, col: "#e8b48c", build: function (g, it) { HumanFactory.buildMesh(g, 'girl'); } },
  oldman: { label: "זקן", w: 50, d: 30, h: 165, col: "#e8b48c", build: function (g, it) { HumanFactory.buildMesh(g, 'oldman'); } },
  oldwoman: { label: "זקנה", w: 45, d: 25, h: 160, col: "#e8b48c", build: function (g, it) { HumanFactory.buildMesh(g, 'oldwoman'); } }
});
// ================= ADDITIONAL BUILT-IN MODELS =================
// Same conventions as the models above: local frame x=width, z=depth, front=+z,
// floor-standing pieces start at y=0, and anything wall- or counter-mounted
// bakes its own mount height (92 = worktop, 150+ = wall).
Object.assign(FURN, {
  sideboard: {
    label: "מזנון",
    w: 160,
    d: 45,
    h: 80,
    col: "#c8b896",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2,
        legH = 12;
      legsUnder(g, it, "taper", legH, 7, WOOD);
      box(g, -hw, hw, legH, it.h - 3, -hd, hd, CAB, { rough: 0.7 });
      box(g, -hw - 1, hw + 1, it.h - 3, it.h, -hd - 1, hd + 1, WOOD, { rough: 0.5 });
      // three doors, split by shadow lines, with slim bar handles
      for (var i = 1; i < 3; i++) {
        var x = -hw + (i * it.w) / 3;
        box(g, x - 0.6, x + 0.6, legH + 3, it.h - 6, hd - 0.6, hd + 0.3, 0x9a8c72);
      }
      for (var k = 0; k < 3; k++) {
        var cx = -hw + ((k + 0.5) * it.w) / 3;
        box(g, cx - 9, cx + 9, it.h * 0.55, it.h * 0.55 + 2, hd, hd + 1.6, HANDLE, {
          metal: 0.8, rough: 0.3,
        });
      }
    },
  },
  console: {
    label: "קונסולה",
    w: 110,
    d: 35,
    h: 78,
    col: "#9c7a4e",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, it.h - 4, it.h, -hd, hd, WOOD, { rough: 0.5 });
      box(g, -hw + 6, hw - 6, it.h * 0.32, it.h * 0.32 + 3, -hd + 4, hd - 4, WOOD, { rough: 0.55 });
      legsUnder(g, it, "square", it.h - 4, 5, 0x6f5535);
    },
  },
  stool: {
    label: "שרפרף",
    w: 36,
    d: 36,
    h: 46,
    col: "#b98a55",
    build: function (g, it) {
      var hw = it.w / 2;
      cyl(g, 0, it.h - 2, 0, hw, 4, WOOD, { rough: 0.55, seg: 24 });
      legsUnder(g, it, "taper", it.h - 4, 5, 0x6f5535);
      // stretcher ring so it doesn't read as a floating disc
      [-1, 1].forEach(function (s) {
        box(g, -hw + 5, hw - 5, it.h * 0.35, it.h * 0.35 + 2.5, s * (hw - 6) - 1.2, s * (hw - 6) + 1.2, 0x6f5535, {
          rough: 0.6,
        });
      });
    },
  },
  recliner: {
    label: "כורסת טלוויזיה",
    w: 90,
    d: 100,
    h: 105,
    col: "#8d949a",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2,
        soft = { rough: 0.95 },
        legH = 8;
      box(g, -hw + 6, hw - 6, 0, legH, -hd + 8, hd - 4, 0x4b4540, { rough: 0.8 });
      box(g, -hw, hw, legH, 40, -hd, hd - 24, FABRIC, soft); // seat block
      box(g, -hw + 2, hw - 2, 40, 46, -hd + 6, hd - 26, 0xb4bdbd, soft); // cushion
      // back, tipped back a little — recliners never sit bolt upright
      var bk = box(g, -hw, hw, 40, it.h, -hd, -hd + 16, FABRIC, soft);
      if (bk) {
        bk.rotation.x = -0.14;
        bk.position.z += 4;
        bk.position.y -= 2;
      }
      [-1, 1].forEach(function (s) {
        box(g, s < 0 ? -hw : hw - 14, s < 0 ? -hw + 14 : hw, legH, 60, -hd, hd - 20, FABRIC, soft);
      });
      // extended footrest
      box(g, -hw + 8, hw - 8, 26, 38, hd - 26, hd, FABRIC, soft);
      box(g, -hw + 10, hw - 10, 38, 42, hd - 24, hd - 2, 0xb4bdbd, soft);
      // side lever
      cyl(g, hw + 1.5, 34, -6, 1, 12, HANDLE, { metal: 0.8, rough: 0.3, seg: 10, rz: Math.PI / 2 });
    },
  },
  pantry: {
    label: "ארון מזון",
    w: 80,
    d: 60,
    h: 220,
    col: "#d7c4a3",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw + 4, hw - 4, 0, 8, -hd + 5, hd - 3, 0x8c8781, { rough: 0.8 });
      box(g, -hw, hw, 8, it.h, -hd, hd, CAB, { rough: 0.7 });
      box(g, -0.7, 0.7, 12, it.h - 6, hd - 0.7, hd + 0.3, 0x9a8c72);
      // two long handles, upper and lower door
      [0.34, 0.72].forEach(function (f) {
        [-1, 1].forEach(function (s) {
          var x = s < 0 ? -7 : 4;
          box(g, x, x + 3, it.h * f, it.h * f + 34, hd, hd + 1.6, HANDLE, {
            metal: 0.8, rough: 0.3,
          });
        });
      });
      box(g, -hw, hw, it.h, it.h + 4, -hd, hd, CAB, { rough: 0.75 }); // cornice
    },
  },
  filingCab: {
    label: "ארונית תיוק",
    w: 45,
    d: 60,
    h: 100,
    col: "#b9bcbe",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, 0, it.h, -hd, hd, CAB, { rough: 0.6 });
      for (var i = 0; i < 3; i++) {
        var y0 = 4 + (i * (it.h - 8)) / 3,
          y1 = y0 + (it.h - 8) / 3 - 2;
        box(g, -hw + 1.5, hw - 1.5, y0, y1, hd, hd + 1.4, CAB, { rough: 0.55 });
        box(g, -8, 8, (y0 + y1) / 2 - 1.2, (y0 + y1) / 2 + 1.2, hd + 1.4, hd + 2.6, HANDLE, {
          metal: 0.8, rough: 0.3,
        });
      }
    },
  },
  wallShelf: {
    label: "מדף צף",
    w: 90,
    d: 22,
    h: 5,
    col: "#9c7a4e",
    build: function (g, it) {
      var y0 = 150,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + 4, -hd, hd, WOOD, { rough: 0.55 });
      // a few objects so an empty shelf doesn't read as a floating plank
      var bc = [0x7a4a3a, 0x4a6a7a, 0x8a8a4a, 0x5a4a7a];
      for (var b = 0; b < 4; b++) {
        var bx = -hw + 8 + b * 9;
        box(g, bx, bx + 6, y0 + 4, y0 + 22 + ((b * 7) % 8), -hd + 4, hd - 5, bc[b % 4], {
          rough: 0.85,
        });
      }
      cyl(g, hw - 14, y0 + 12, 0, 6, 16, 0x6f8f5a, { rough: 0.8, seg: 16, r2: 7 });
    },
  },
  floorMirror: {
    label: "מראה קמרון",
    w: 70,
    d: 8,
    h: 180,
    col: "#cfd6da",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2,
        archY = it.h - hw; // where the straight sides stop and the arch begins
      box(g, -hw, hw, 0, archY, -hd, hd, WOOD, { rough: 0.55 });
      cyl(g, 0, archY, 0, hw, it.d, WOOD, { rough: 0.55, seg: 28, rx: Math.PI / 2 });
      box(g, -hw + 4, hw - 4, 4, archY, hd - 1.2, hd + 0.2, 0xdfe8ec, {
        metal: 1.0, rough: 0.03,
      });
      cyl(g, 0, archY, hd - 0.5, hw - 4, 1.4, 0xdfe8ec, {
        metal: 1.0, rough: 0.03, seg: 28, rx: Math.PI / 2,
      });
    },
  },
  clock: {
    label: "שעון קיר",
    w: 34,
    d: 6,
    h: 34,
    col: "#2b2e31",
    build: function (g, it) {
      var y0 = 170,
        r = Math.min(it.w, it.h) / 2,
        cz = it.d / 2;
      cyl(g, 0, y0 + r, cz - 3, r, 5, WOOD, { rough: 0.5, seg: 32, rx: Math.PI / 2 });
      cyl(g, 0, y0 + r, cz - 0.4, r - 2, 1.4, 0xf6f4ef, { rough: 0.4, seg: 32, rx: Math.PI / 2 });
      box(g, -0.8, 0.8, y0 + r, y0 + r + r * 0.62, cz + 0.2, cz + 0.8, 0x2b2e31, { cast: false });
      box(g, -0.8, r * 0.42, y0 + r - 0.8, y0 + r + 0.8, cz + 0.2, cz + 0.8, 0x2b2e31, { cast: false });
      cyl(g, 0, y0 + r, cz + 0.6, 1.1, 0.8, HANDLE, { metal: 0.8, rough: 0.3, seg: 12, rx: Math.PI / 2 });
    },
  },
  curtain: {
    label: "וילון",
    w: 170,
    d: 14,
    h: 240,
    col: "#d9cfba",
    build: function (g, it) {
      var hw = it.w / 2,
        top = it.h,
        hd = it.d / 2;
      cyl(g, 0, top - 3, -hd + 4, 1.6, it.w + 14, HANDLE, {
        metal: 0.7, rough: 0.35, seg: 14, rz: Math.PI / 2,
      });
      [-1, 1].forEach(function (s) {
        cyl(g, s * (hw + 6), top - 3, -hd + 4, 2.6, 2, HANDLE, { metal: 0.7, rough: 0.35, seg: 14 });
      });
      // each panel is a row of half-round folds — reads as hanging fabric
      var folds = Math.max(6, Math.round(it.w / 14));
      var pos = it.smart && typeof it.smart.position === "number" ? it.smart.position : 100;
      var openFrac = 1 - Math.max(0, Math.min(100, pos)) / 100;
      var gapW = it.w * (0.16 + 0.7 * openFrac);
      for (var i = 0; i < folds; i++) {
        var fx = -hw + ((i + 0.5) * it.w) / folds;
        if (Math.abs(fx) < gapW / 2) continue;
        cyl(g, fx, (top - 8) / 2 + 2, -hd + 4 + ((i % 2) ? 1.6 : 0), it.w / folds / 2, top - 10, FABRIC, {
          rough: 0.95, seg: 10, metal: 0,
        });
      }
    },
  },
  whiteboard: {
    label: "לוח מחיק",
    w: 150,
    d: 6,
    h: 100,
    col: "#f6f7f8",
    build: function (g, it) {
      var y0 = 110,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd - 1.5, 0xb9bcbe, { metal: 0.5, rough: 0.4 });
      box(g, -hw + 2.5, hw - 2.5, y0 + 2.5, y0 + it.h - 2.5, hd - 1.5, hd, 0xf6f7f8, {
        rough: 0.16, metal: 0.05,
      });
      box(g, -hw + 20, -hw + 60, y0 + 3, y0 + 4.4, hd, hd + 3, 0xc9ced1, { rough: 0.5 }); // pen tray
    },
  },
  speaker: {
    label: "רמקול עמוד",
    w: 24,
    d: 30,
    h: 105,
    col: "#2b2e31",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw - 2, hw + 2, 0, 2.5, -hd - 2, hd + 2, 0x24262a, { rough: 0.7 });
      box(g, -hw, hw, 2.5, it.h, -hd, hd, WOOD, { rough: 0.45 });
      [0.72, 0.5].forEach(function (f, i) {
        cyl(g, 0, it.h * f, hd - 0.5, hw - 4 - i * 3, 1.6, 0x1a1c1e, {
          rough: 0.6, seg: 22, rx: Math.PI / 2,
        });
        cyl(g, 0, it.h * f, hd + 0.3, (hw - 4 - i * 3) * 0.42, 1.2, 0x4a4f54, {
          rough: 0.4, metal: 0.4, seg: 16, rx: Math.PI / 2,
        });
      });
      cyl(g, 0, it.h * 0.9, hd - 0.5, 3, 1.4, 0x1a1c1e, { rough: 0.6, seg: 16, rx: Math.PI / 2 });
    },
  },
  soundbar: {
    label: "סאונדבר",
    w: 110,
    d: 12,
    h: 8,
    col: "#2a2d30",
    build: function (g, it) {
      // mountY: on a TV console (62) or bracketed on the wall under a tvWall
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 62,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd, 0x2a2d30, { rough: 0.45 });
      box(g, -hw + 2, hw - 2, y0 + 1, y0 + it.h - 1, hd - 0.4, hd + 0.3, 0x3d4348, { rough: 0.85 });
      box(g, -14, 14, y0 + 1.5, y0 + 3, hd + 0.3, hd + 0.6, 0x1a1c1e, { cast: false });
      if (V.mountY != null && V.mountY > 40)
        // slim wall brackets, so a floating bar doesn't read as levitating
        [-1, 1].forEach(function (s) {
          box(g, s * (hw * 0.5) - 2, s * (hw * 0.5) + 2, y0 + 1, y0 + it.h - 1, -hd - 2.5, -hd, 0x4a4f54, {
            metal: 0.5, rough: 0.45,
          });
        });
    },
  },
  wineFridge: {
    label: "מקרר יין",
    w: 45,
    d: 60,
    h: 88,
    col: "#2a2d30",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2;
      // carcass as a shell (back, sides, top, base) so the racks inside show
      // through the glass door instead of being buried in a solid block
      box(g, -hw, hw, 0, it.h, -hd, -hd + 3, STEEL, { rough: 0.4, metal: 0.35 });
      box(g, -hw, -hw + 2, 0, it.h, -hd, hd - 3, STEEL, { rough: 0.4, metal: 0.35 });
      box(g, hw - 2, hw, 0, it.h, -hd, hd - 3, STEEL, { rough: 0.4, metal: 0.35 });
      box(g, -hw, hw, 0, 6, -hd, hd - 3, STEEL, { rough: 0.4, metal: 0.35 });
      box(g, -hw, hw, it.h - 4, it.h, -hd, hd - 3, STEEL, { rough: 0.4, metal: 0.35 });
      // racked bottles behind glass
      for (var s = 0; s < 4; s++) {
        var y = 12 + s * ((it.h - 22) / 4);
        box(g, -hw + 3, hw - 3, y, y + 1.6, -hd + 5, hd - 6, STEEL, { metal: 0.7, rough: 0.4 });
        for (var b = 0; b < 4; b++) {
          var bx = -hw + 7 + b * ((it.w - 14) / 4);
          cyl(g, bx, y + 5, 0, 3.4, it.d - 18, [0x2f4a2a, 0x3c2a22, 0x24331f, 0x402a26][b % 4], {
            rough: 0.35, metal: 0.1, seg: 12, rx: Math.PI / 2,
          });
        }
      }
      box(g, -hw, hw, 0, it.h, hd - 3, hd, GLASS, {
        trans: true, opacity: 0.3, rough: 0.05, metal: 0.15, cast: false,
      });
      box(g, hw - 4, hw - 1.5, it.h * 0.3, it.h * 0.75, hd, hd + 2, HANDLE, { metal: 0.85, rough: 0.25 });
    },
  },
  coffeeMachine: {
    label: "מכונת אספרסו",
    w: 30,
    d: 38,
    h: 38,
    col: "#b8bfc4",
    build: function (g, it) {
      var y0 = 92,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h - 6, -hd, hd - 10, STEEL, { metal: 0.55, rough: 0.3 });
      box(g, -hw + 2, hw - 2, y0 + it.h - 6, y0 + it.h, -hd + 2, hd - 12, 0x9aa2a8, { rough: 0.4 });
      // group head + portafilter + cup on the drip tray
      box(g, -6, 6, y0 + 14, y0 + 20, hd - 12, hd - 4, 0x4a4f54, { metal: 0.6, rough: 0.35 });
      cyl(g, 0, y0 + 12, hd - 7, 3, 4, HANDLE, { metal: 0.8, rough: 0.3, seg: 14 });
      box(g, -hw + 4, hw - 4, y0 + 1, y0 + 2.4, hd - 12, hd, 0x3d4348, { rough: 0.5 });
      cyl(g, 0, y0 + 6, hd - 6, 3.4, 7, 0xf2f2f0, { rough: 0.35, seg: 16 });
      box(g, hw - 3, hw + 1, y0 + 20, y0 + 24, hd - 12, hd - 8, HANDLE, { metal: 0.8, rough: 0.3 });
    },
  },
  toaster: {
    label: "טוסטר",
    w: 28,
    d: 18,
    h: 20,
    col: "#c4c9cc",
    build: function (g, it) {
      var y0 = 92,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd, STEEL, { metal: 0.6, rough: 0.28 });
      [-1, 1].forEach(function (s) {
        box(g, s * 6 - 3.5, s * 6 + 3.5, y0 + it.h - 1, y0 + it.h + 0.4, -hd + 4, hd - 4, 0x24262a, {
          cast: false,
        });
      });
      box(g, hw - 1, hw + 1.6, y0 + 6, y0 + 9, -2, 2, 0x3d4348, { rough: 0.5 });
    },
  },
  kettle: {
    label: "קומקום",
    w: 22,
    d: 22,
    h: 27,
    col: "#dfe3e5",
    build: function (g, it) {
      var y0 = 92,
        r = Math.min(it.w, it.d) / 2;
      cyl(g, 0, y0 + 1.5, 0, r, 3, 0x3d4348, { rough: 0.5, seg: 22 }); // base
      cyl(g, 0, y0 + (it.h + 3) / 2, 0, r - 1, it.h - 4, STEEL, {
        metal: 0.6, rough: 0.26, seg: 24, r2: r - 3,
      });
      cyl(g, 0, y0 + it.h, 0, r - 3.5, 2, 0x9aa2a8, { rough: 0.4, seg: 20 }); // lid
      box(g, -1.4, 1.4, y0 + 10, y0 + it.h - 1, -r - 3, -r + 1, 0x24262a, { rough: 0.5 }); // handle
      cyl(g, 0, y0 + it.h - 6, r - 1, 1.6, 6, STEEL, {
        metal: 0.6, rough: 0.3, seg: 12, rx: -0.9,
      }); // spout
    },
  },
  waterHeater: {
    label: "דוד חימום",
    w: 50,
    d: 50,
    h: 130,
    col: "#dfe3e5",
    build: function (g, it) {
      var r = Math.min(it.w, it.d) / 2;
      cyl(g, 0, it.h / 2, 0, r, it.h, STEEL, { metal: 0.35, rough: 0.45, seg: 26 });
      cyl(g, 0, it.h + 1, 0, r - 2, 3, 0x9aa2a8, { rough: 0.5, seg: 24 });
      cyl(g, 0, 3, 0, r - 1, 6, 0x9aa2a8, { rough: 0.5, seg: 24 });
      [-1, 1].forEach(function (s) {
        cyl(g, s * (r - 8), it.h + 8, 0, 1.6, 14, 0xc6cccf, { metal: 0.85, rough: 0.25, seg: 12 });
      });
      box(g, -8, 8, 26, 44, r - 1, r + 3, 0x3d4348, { rough: 0.5 }); // thermostat cover
    },
  },
  printer: {
    label: "מדפסת",
    w: 45,
    d: 40,
    h: 26,
    col: "#3a3f44",
    build: function (g, it) {
      var y0 = 76,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h - 5, -hd, hd, 0x3a3f44, { rough: 0.5 });
      box(g, -hw + 2, hw - 2, y0 + it.h - 5, y0 + it.h, -hd + 2, hd - 2, 0x2a2d30, { rough: 0.45 });
      box(g, -hw + 4, hw - 4, y0 + 8, y0 + 10, hd - 1, hd + 6, 0xd8d6d2, { rough: 0.6 }); // output tray
      box(g, -12, 12, y0 + it.h - 4.4, y0 + it.h - 3, hd - 12, hd - 4, 0x1a1c1e, { cast: false });
    },
  },
  bidet: {
    label: "בידה",
    w: 38,
    d: 58,
    h: 42,
    col: "#eef0f2",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2,
        cer = { rough: 0.32 };
      cyl(g, 0, it.h / 2 - 4, 4, Math.min(hw, hd) - 6, it.h - 8, 0xf2f4f6, {
        rough: 0.32, seg: 20, r2: Math.min(hw, hd) - 11, metal: 0.02,
      });
      slabWithHoles(g, -hw + 3, hw - 3, it.h - 8, it.h - 3, -hd + 6, hd - 4,
        [{ x0: -hw + 6, x1: hw - 6, z0: -hd + 9, z1: hd - 7 }], 0xf0f2f4, cer);
      basin(g, -hw + 6, hw - 6, -hd + 9, hd - 7, it.h - 3, 12, 0xf6f8fa, {
        metal: 0.02, rough: 0.28,
      });
      gooseneck(g, 0, it.h - 3, -hd + 5, 14, 8, 0xc6cccf, 1.3);
    },
  },
  pedestalSink: {
    label: "כיור על רגל",
    w: 58,
    d: 46,
    h: 85,
    col: "#eef0f2",
    build: function (g, it) {
      var hw = it.w / 2,
        hd = it.d / 2,
        cer = 0xf2f4f6;
      // pedestal column, flaring to the floor
      cyl(g, 0, (it.h - 16) / 2, 0, 9, it.h - 16, cer, {
        rough: 0.32, seg: 22, r2: 12, metal: 0.02,
      });
      cyl(g, 0, 2, 0, 15, 4, cer, { rough: 0.32, seg: 24 });
      // basin body + rim, with a real bowl sunk into it (rim punched, not solid)
      slabWithHoles(g, -hw, hw, it.h - 16, it.h, -hd, hd,
        [{ x0: -hw + 6, x1: hw - 6, z0: -hd + 7, z1: hd - 5 }], cer, { rough: 0.32 });
      basin(g, -hw + 6, hw - 6, -hd + 7, hd - 5, it.h, 15, 0xf6f8fa, {
        metal: 0.02, rough: 0.26,
      });
      gooseneck(g, 0, it.h, -hd + 5, Math.max(12, hd - 4), 14, 0xc6cccf, 1.4);
    },
  },
  towelRail: {
    label: "מגבות מחומם",
    w: 60,
    d: 10,
    h: 90,
    col: "#c6cccf",
    build: function (g, it) {
      var y0 = 60,
        hw = it.w / 2,
        hd = it.d / 2,
        chrome = { metal: 0.88, rough: 0.2, seg: 14 };
      [-1, 1].forEach(function (s) {
        cyl(g, s * (hw - 3), y0 + it.h / 2, -hd + 3, 1.5, it.h, 0xc6cccf, chrome);
        box(g, s * (hw - 3) - 2, s * (hw - 3) + 2, y0 + 8, y0 + 12, -hd, -hd + 3, 0xc6cccf, {
          metal: 0.8, rough: 0.3,
        });
      });
      var bars = 7;
      for (var i = 0; i < bars; i++) {
        var y = y0 + 6 + (i * (it.h - 12)) / (bars - 1);
        cyl(g, 0, y, -hd + 3, 1.2, it.w - 6, 0xc6cccf, {
          metal: 0.88, rough: 0.2, seg: 12, rz: Math.PI / 2,
        });
      }
      // a towel folded over the third bar
      box(g, -hw + 10, 4, y0 + 20, y0 + 62, -hd + 1, -hd + 6, 0xe4dccb, { rough: 0.95 });
    },
  },
  laundryBasket: {
    label: "סל כביסה",
    w: 42,
    d: 42,
    h: 58,
    col: "#b98a55",
    build: function (g, it) {
      var r = Math.min(it.w, it.d) / 2;
      // open weave basket: a tube you can see into, plus a floor
      cyl(g, 0, it.h / 2, 0, r - 2, it.h, 0xb98a55, {
        rough: 0.85, seg: 26, open: true, r2: r,
      });
      cyl(g, 0, 1.5, 0, r - 2.5, 3, 0xa87d4a, { rough: 0.85, seg: 26 });
      cyl(g, 0, it.h - 1, 0, r + 0.6, 2.4, 0xa87d4a, { rough: 0.8, seg: 26 });
      box(g, -r + 6, r - 6, it.h - 12, it.h - 4, -r + 6, r - 6, 0xeae4d8, { rough: 0.96 }); // linen
    },
  },
  chandelier: {
    label: "נברשת",
    w: 60,
    d: 60,
    h: 55,
    col: "#c9a15e",
    lamp: { y: MOUNTH - 40, color: 0xffe2a0, intensity: 1.15, dist: 700 },
    build: function (g, it) {
      var top = MOUNTH,
        r = it.w / 2 - 6,
        arms = 6,
        gold = { metal: 0.85, rough: 0.28, seg: 14 };
      cyl(g, 0, top - 1, 0, 2.6, 2, 0xb08d4a, gold);
      box(g, -0.8, 0.8, top - 26, top - 2, -0.8, 0.8, 0xb08d4a, { metal: 0.85, rough: 0.3, cast: false });
      cyl(g, 0, top - 30, 0, 4, 10, 0xb08d4a, gold);
      for (var i = 0; i < arms; i++) {
        var an = (i / arms) * Math.PI * 2,
          ax = Math.cos(an) * r,
          az = Math.sin(an) * r;
        // arm sloping up and out from the hub
        cyl(g, ax / 2, top - 32, az / 2, 1.1, r, 0xb08d4a, {
          metal: 0.85, rough: 0.28, seg: 10,
          rx: Math.sin(an) * 1.35, rz: -Math.cos(an) * 1.35,
        });
        cyl(g, ax, top - 30, az, 2.6, 6, 0xb08d4a, gold); // candle cup
        cyl(g, ax, top - 24, az, 1.6, 7, 0xf6f0e2, { rough: 0.5, seg: 12 }); // candle
        sph(g, ax, top - 19, az, 2.4, 0xfff3d0, { emis: 0xffe2a0, cast: false });
      }
    },
  },
  // These three were already listed in CATALOG/PRICE/FURN_EN but had no build,
  // so the library silently skipped them. Now they exist.
  radiator: {
    label: "רדיאטור",
    w: 80,
    d: 10,
    h: 60,
    col: "#eef1f2",
    build: function (g, it) {
      var y0 = 18,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h, -hd, -hd + 2.5, 0xeef1f2, { rough: 0.4 });
      // vertical fins across the panel
      var fins = Math.max(6, Math.round(it.w / 8));
      for (var i = 0; i < fins; i++) {
        var fx = -hw + 2 + (i * (it.w - 4)) / fins;
        box(g, fx, fx + (it.w - 4) / fins - 2, y0 + 2, y0 + it.h - 2, -hd + 2.5, hd, 0xe4e7e9, {
          rough: 0.45,
        });
      }
      box(g, -hw, hw, y0 + it.h, y0 + it.h + 2, -hd, hd, 0xeef1f2, { rough: 0.4 });
      // valve + pipe stubs down to the floor
      [-1, 1].forEach(function (s) {
        cyl(g, s * (hw - 6), y0 / 2, -hd + 1, 1.4, y0, 0xc9ced1, { metal: 0.7, rough: 0.3, seg: 12 });
      });
      cyl(g, hw - 6, y0 + 4, -hd - 2, 2.2, 5, HANDLE, { metal: 0.8, rough: 0.3, seg: 14, rx: Math.PI / 2 });
    },
  },
  wallLamp: {
    label: "מנורת קיר",
    w: 20,
    d: 18,
    h: 26,
    col: "#e9dcc1",
    lamp: { y: 176, color: 0xffe2a0, intensity: 0.5, dist: 380 },
    build: function (g, it) {
      var y0 = 166,
        hd = it.d / 2;
      box(g, -4, 4, y0, y0 + 12, -hd, -hd + 2, 0x42474a, { rough: 0.45, metal: 0.4 }); // back plate
      cyl(g, 0, y0 + 6, -hd + 5, 1.3, 9, 0x6e7478, {
        metal: 0.55, rough: 0.4, seg: 12, rx: Math.PI / 2,
      }); // arm
      cyl(g, 0, y0 + 10, -hd + 11, it.w * 0.5, 13, 0xe9dcc1, {
        rough: 0.6, r2: it.w * 0.34, trans: true, opacity: 0.92,
      });
      sph(g, 0, y0 + 10, -hd + 11, 3, 0xfff2cc, { emis: 0xffe2a0, cast: false });
    },
  },
  trackLight: {
    label: "גוף תאורה על מסילה",
    w: 90,
    d: 8,
    h: 12,
    col: "#42474a",
    lamp: { y: MOUNTH - 14, color: 0xffe6b4, intensity: 0.8, dist: 560 },
    build: function (g, it) {
      var top = MOUNTH,
        hw = it.w / 2,
        heads = 3;
      box(g, -hw, hw, top - 4, top, -2, 2, 0x42474a, { rough: 0.45, metal: 0.4 }); // track
      for (var i = 0; i < heads; i++) {
        var hx = -hw + ((i + 0.5) * it.w) / heads;
        cyl(g, hx, top - 6, 0, 1.6, 5, 0x6e7478, { metal: 0.6, rough: 0.35, seg: 12 });
        cyl(g, hx, top - 12, 0, 3.6, 9, 0x42474a, {
          metal: 0.5, rough: 0.4, seg: 16, r2: 2.8, rx: 0.35,
        });
        sph(g, hx, top - 16, 1.4, 2.2, 0xfff2cc, { emis: 0xffe2a0, cast: false });
      }
    },
  },
  ceilingFan: {
    label: "מאוורר תקרה",
    w: 120,
    d: 120,
    h: 35,
    col: "#b9b29e",
    lamp: { y: MOUNTH - 34, color: 0xffe6b4, intensity: 0.9, dist: 620 },
    build: function (g, it) {
      var top = MOUNTH,
        r = it.w / 2,
        blades = 4;
      cyl(g, 0, top - 2, 0, 3.4, 4, 0x42474a, { metal: 0.5, rough: 0.4 });
      box(g, -1.2, 1.2, top - 18, top - 2, -1.2, 1.2, 0x42474a, { cast: false });
      cyl(g, 0, top - 21, 0, 7, 8, 0x6e7478, { metal: 0.5, rough: 0.4, seg: 20 });
      for (var i = 0; i < blades; i++) {
        var an = (i / blades) * Math.PI * 2,
          bl = box(g, -r + 7, r - 7, top - 22, top - 20.4, -6, 6, WOOD, { rough: 0.5 });
        if (bl) {
          // rotate about Y into place, with a slight pitch so it reads as a fan
          bl.position.set((Math.cos(an) * (r - 8)) / 2 + 0, top - 21, (Math.sin(an) * (r - 8)) / 2);
          bl.scale.x = 0.55;
          bl.rotation.y = -an;
          bl.rotation.z = 0.1;
        }
      }
      cyl(g, 0, top - 28, 0, 8, 9, 0xe9dcc1, { rough: 0.6, trans: true, opacity: 0.92, seg: 20 });
      sph(g, 0, top - 30, 0, 3.5, 0xfff2cc, { emis: 0xffe2a0, cast: false });
    },
  },

  /* ---- wall-hung TV + soundbar ----
     `tv` is the console-standing set (it draws its own cabinet); this is the
     bracket-mounted one, so the pair is: tv = on furniture, tvWall = on a wall.
     `mountY` is the height of the screen's BOTTOM edge — the variant knob most
     people actually reach for, and the soundbar sits just under it. */
  tvWall: {
    label: "טלוויזיה תלויה",
    w: 123, // 55" 16:9 panel
    d: 8,
    h: 71,
    col: "#15191c",
    build: function (g, it) {
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 100,
        hw = it.w / 2,
        hd = it.d / 2,
        bezel = V.bezel != null ? V.bezel : 1.2;
      // wall bracket: the panel floats a few cm off the wall on two arms
      [-1, 1].forEach(function (s) {
        box(g, s * 12 - 3, s * 12 + 3, y0 + it.h * 0.35, y0 + it.h * 0.72, -hd, -hd + 3, 0x4a4f54, {
          metal: 0.6, rough: 0.4,
        });
      });
      box(g, -18, 18, y0 + it.h * 0.42, y0 + it.h * 0.62, -hd + 2.5, -hd + 4, 0x33383c, { metal: 0.5, rough: 0.45 });
      // panel: dark chassis, then the screen face inset by the bezel
      box(g, -hw, hw, y0, y0 + it.h, -hd + 3.5, hd - 1, TVB, { metal: 0.3, rough: 0.35 });
      box(g, -hw + bezel, hw - bezel, y0 + bezel, y0 + it.h - bezel, hd - 1, hd,
        smartOn(it, false) ? 0x4a90c8 : 0x1d2630,
        smartOn(it, false) ? { metal: 0.08, rough: 0.15, emis: 0x3a7ab8 } : { metal: 0.2, rough: 0.15 },
      );
      // standby LED, bottom centre — reads as "this one is powered"
      box(g, -1.5, 1.5, y0 + 0.4, y0 + 1.2, hd - 0.2, hd + 0.2,
        smartOn(it, false) ? 0x44ff88 : 0xff4444,
        { emis: smartOn(it, false) ? 0x44ff88 : 0xff4444, cast: false });
    },
  },

  /* ---- ducted air-conditioning ----
     The whole chain a real install needs: outdoor condenser → concealed fan
     coil in the ceiling void → ducts (routed as an MEP `hvac` network, see
     mep.js) → supply diffusers + a return grille. Cassette and the existing
     wall-hung `ac` cover the non-ducted options. Heights are baked so each
     part lands where it belongs against a 270 ceiling. */
  acDucted: {
    label: "מפוח נסתר (מיני מרכזי)",
    w: 110,
    d: 60,
    h: 26,
    col: "#c9ced2",
    build: function (g, it) {
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 232, // inside the bulkhead/ceiling void
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd, STEEL, { metal: 0.35, rough: 0.5 });
      // supply spigot (front) and return spigot (back), what the ducts clip onto
      box(g, -hw * 0.55, hw * 0.55, y0 + 4, y0 + it.h - 4, hd, hd + 6, 0x9aa1a6, { metal: 0.3, rough: 0.55 });
      box(g, -hw * 0.7, hw * 0.7, y0 + 3, y0 + it.h - 3, -hd - 6, -hd, 0x9aa1a6, { metal: 0.3, rough: 0.55 });
      // hanging rods up to the slab — kept short enough not to pierce a 270 ceiling
      [-1, 1].forEach(function (s) {
        [-1, 1].forEach(function (t) {
          cyl(g, s * (hw - 8), y0 + it.h + 5, t * (hd - 8), 0.8, 10, 0x8d9498, { metal: 0.6, rough: 0.4, seg: 8 });
        });
      });
      // condensate tray lip
      box(g, -hw - 1.5, hw + 1.5, y0 - 2, y0, -hd - 1.5, hd + 1.5, 0xb9c0c4, { metal: 0.2, rough: 0.6 });
    },
  },
  acDiffuser: {
    label: "מפזר אוויר",
    w: 40,
    d: 40,
    h: 8,
    col: "#eceef0",
    build: function (g, it) {
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 262,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0 + 2, y0 + it.h, -hd, hd, 0xeceef0, { rough: 0.5 }); // plenum box above
      box(g, -hw, hw, y0, y0 + 2, -hd, hd, 0xf4f6f7, { rough: 0.45 }); // face frame
      // stepped blades — a linear bar grille or a square 4-way, per variant
      var n = Math.max(3, Math.round(Math.min(it.w, it.d) / 7));
      for (var i = 0; i < n; i++) {
        var f = (i + 0.5) / n;
        if (V.linear) {
          var bx = -hw + 3 + f * (it.w - 6);
          box(g, bx - 1, bx + 1, y0 - 1.2, y0 + 0.4, -hd + 3, hd - 3, 0xd7dbde, { rough: 0.55 });
        } else {
          var r = Math.min(hw, hd) - 3 - i * ((Math.min(hw, hd) - 5) / n);
          box(g, -r, r, y0 - 0.6 - i * 0.9, y0 + 0.6 - i * 0.9, -r, -r + 1.4, 0xd7dbde, { rough: 0.55 });
          box(g, -r, r, y0 - 0.6 - i * 0.9, y0 + 0.6 - i * 0.9, r - 1.4, r, 0xd7dbde, { rough: 0.55 });
          box(g, -r, -r + 1.4, y0 - 0.6 - i * 0.9, y0 + 0.6 - i * 0.9, -r, r, 0xd7dbde, { rough: 0.55 });
          box(g, r - 1.4, r, y0 - 0.6 - i * 0.9, y0 + 0.6 - i * 0.9, -r, r, 0xd7dbde, { rough: 0.55 });
        }
      }
    },
  },
  acReturn: {
    label: "רשת אוויר חוזר",
    w: 60,
    d: 40,
    h: 6,
    col: "#e6e9eb",
    build: function (g, it) {
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 262,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw, hw, y0 + 1.5, y0 + it.h, -hd, hd, 0xdfe3e6, { rough: 0.55 }); // filter box
      box(g, -hw, hw, y0, y0 + 1.5, -hd, hd, 0xf1f3f4, { rough: 0.45 }); // frame
      // egg-crate face
      var cols = Math.max(4, Math.round(it.w / 6)),
        rows = Math.max(3, Math.round(it.d / 6));
      for (var c = 0; c <= cols; c++) {
        var x = -hw + 2 + (c * (it.w - 4)) / cols;
        box(g, x - 0.35, x + 0.35, y0 - 0.8, y0 + 0.2, -hd + 2, hd - 2, 0xb9bfc3, { rough: 0.6 });
      }
      for (var r2 = 0; r2 <= rows; r2++) {
        var z = -hd + 2 + (r2 * (it.d - 4)) / rows;
        box(g, -hw + 2, hw - 2, y0 - 0.8, y0 + 0.2, z - 0.35, z + 0.35, 0xb9bfc3, { rough: 0.6 });
      }
    },
  },
  acCassette: {
    label: "מזגן קסטה",
    w: 60,
    d: 60,
    h: 24,
    col: "#f2f4f5",
    build: function (g, it) {
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 246,
        hw = it.w / 2,
        hd = it.d / 2;
      box(g, -hw + 4, hw - 4, y0 + 4, y0 + it.h, -hd + 4, hd - 4, STEEL, { metal: 0.3, rough: 0.55 }); // body in the void
      box(g, -hw, hw, y0, y0 + 4, -hd, hd, 0xf2f4f5, { rough: 0.4 }); // flush face panel
      box(g, -hw * 0.42, hw * 0.42, y0 + 0.6, y0 + 4, -hd * 0.42, hd * 0.42, 0xe4e8ea, { rough: 0.5 }); // return centre
      // four-way blades around the face
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
        var lx = d[0] ? d[0] * (hw - 5) : 0,
          lz = d[1] ? d[1] * (hd - 5) : 0,
          ax = d[0] ? 3 : hw - 8,
          az = d[1] ? 3 : hd - 8;
        box(g, lx - ax, lx + ax, y0 - 1, y0 + 0.8, lz - az, lz + az, 0xdadfe2, { rough: 0.5 });
      });
    },
  },
  acOutdoor: {
    label: "יחידה חיצונית (מעבה)",
    w: 90,
    d: 34,
    h: 70,
    col: "#d9dde0",
    build: function (g, it) {
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 0, // on the floor, or bracketed on a wall
        hw = it.w / 2,
        hd = it.d / 2;
      if (y0 > 0) {
        // wall bracket under the unit
        [-1, 1].forEach(function (s) {
          box(g, s * (hw - 10) - 2, s * (hw - 10) + 2, y0 - 14, y0, -hd, hd - 2, 0x6f767a, { metal: 0.5, rough: 0.5 });
        });
      } else {
        [-1, 1].forEach(function (s) {
          box(g, s * (hw - 12) - 4, s * (hw - 12) + 4, 0, 6, -hd + 2, hd - 2, 0x5f666a, { metal: 0.4, rough: 0.6 });
        });
        y0 = 6; // sits on its feet
      }
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd, 0xd9dde0, { metal: 0.25, rough: 0.55 });
      // fan grille on the front
      var cy = y0 + it.h * 0.45,
        r = Math.min(it.h * 0.36, hw - 6);
      cyl(g, 0, cy, hd + 0.3, r, 1.2, 0x3a4045, { rough: 0.6, seg: 24, rx: Math.PI / 2 });
      for (var i = 0; i < 12; i++) {
        var an = (i / 12) * Math.PI * 2,
          bl = box(g, -r * 0.9, r * 0.9, cy - 1, cy + 1, hd + 0.4, hd + 0.9, 0x9aa1a6, { rough: 0.5, cast: false });
        if (bl) bl.rotation.z = an;
      }
      // top louvres + the two refrigerant service valves
      for (var s2 = 0; s2 < 5; s2++) {
        var ly = y0 + it.h - 4 - s2 * 3;
        box(g, -hw + 4, hw - 4, ly, ly + 1.4, -hd + 2, -hd + 2.6, 0xb7bdc1, { rough: 0.6 });
      }
      [-1, 1].forEach(function (s3) {
        cyl(g, hw - 8, y0 + 12 + (s3 > 0 ? 8 : 0), -hd + 6, 1.4, 6, 0xb08d4a, {
          metal: 0.8, rough: 0.3, seg: 10, rx: Math.PI / 2,
        });
      });
    },
  },
  // ================= SMART HOME & SENSORS =================
  motionSensor: {
    label: "גלאי תנועה",
    w: 12,
    d: 10,
    h: 14,
    col: "#f0f2f5",
    build: function (g, it) {
      var hw = it.w / 2, hd = it.d / 2;
      var on = it.smart && it.smart.motion;
      // Sensor main body
      box(g, -hw, hw, 0, it.h, -hd, hd, 0xf0f4f8, { rough: 0.35 });
      // Beveled mounting base plate
      box(g, -hw - 0.5, hw + 0.5, 0, 1.5, -hd - 0.5, hd + 0.5, 0xdbe0e6, { rough: 0.5 });
      // Faceted PIR Fresnel dome lens
      cyl(g, 0, it.h * 0.45, hd + 0.2, hw * 0.65, 2.5, 0xe2e8f0, { rough: 0.2, seg: 16, rx: Math.PI / 2 });
      // Status indicator LED (lights up on detected motion)
      sph(g, 0, it.h - 2.8, hd + 0.6, 0.9, on ? 0x10b981 : 0x64748b);
    },
  },
  contactSensor: {
    label: "חיישן דלת/חלון",
    w: 16,
    d: 8,
    h: 22,
    col: "#f8fafc",
    build: function (g, it) {
      var open = it.smart && it.smart.contact;
      var hw = it.w / 2, hd = it.d / 2;
      // Main transmitter unit
      box(g, -hw, -hw + 8, 0, it.h, -hd, hd, 0xf8fafc, { rough: 0.3 });
      // Status LED on main unit
      sph(g, -hw + 4, it.h - 3, hd + 0.3, 0.7, open ? 0xef4444 : 0x10b981);
      // Magnet companion unit (separated if open)
      var magOffset = open ? 4 : 1.5;
      box(g, -hw + 8 + magOffset, hw, 0, it.h * 0.75, -hd * 0.8, hd * 0.8, 0xf1f5f9, { rough: 0.35 });
    },
  },
  tempSensor: {
    label: "חיישן טמפרטורה ולחות",
    w: 16,
    d: 6,
    h: 16,
    col: "#ffffff",
    build: function (g, it) {
      var hw = it.w / 2, hd = it.d / 2;
      // Thermostat wall body
      box(g, -hw, hw, 0, it.h, -hd, hd, 0xf8fafc, { rough: 0.3 });
      // Digital LCD display screen bezel
      box(g, -hw + 1.8, hw - 1.8, 2.5, it.h - 2.5, hd, hd + 0.5, 0x1e293b, { rough: 0.2, metal: 0.2 });
      // LCD screen panel
      box(g, -hw + 2.5, hw - 2.5, 3.2, it.h - 3.2, hd + 0.5, hd + 0.8, 0x38bdf8, { rough: 0.1 });
    },
  },
  smokeDetector: {
    label: "גלאי עשן",
    w: 22,
    d: 22,
    h: 7,
    col: "#ffffff",
    build: function (g, it) {
      var r = it.w / 2;
      var alert = it.smart && it.smart.smoke;
      // Circular ceiling housing
      cyl(g, 0, it.h * 0.5, 0, r, it.h, 0xf8fafc, { rough: 0.3, seg: 24 });
      // Center test / silence button
      cyl(g, 0, it.h + 0.4, 0, r * 0.35, 0.8, 0xe2e8f0, { rough: 0.4, seg: 16 });
      // Perimeter smoke chamber vents
      for (var i = 0; i < 8; i++) {
        var an = (i / 8) * Math.PI * 2;
        var vx = Math.cos(an) * (r * 0.65);
        var vz = Math.sin(an) * (r * 0.65);
        box(g, vx - 1.2, vx + 1.2, it.h * 0.2, it.h * 0.8, vz - 1.2, vz + 1.2, 0x334155, { rough: 0.6 });
      }
      // Status indicator LED
      sph(g, 0, it.h + 0.9, 0, 1.0, alert ? 0xef4444 : 0x22c55e);
    },
  },
  smartLock: {
    label: "מנעול חכם",
    w: 14,
    d: 14,
    h: 30,
    col: "#1e293b",
    build: function (g, it) {
      var hw = it.w / 2, hd = it.d / 2;
      var locked = it.smart ? it.smart.locked !== false : true;
      // Escutcheon backplate
      box(g, -hw, hw, 0, it.h, -hd, hd, 0x1e293b, { metal: 0.6, rough: 0.3 });
      // Keypad touchscreen / reader window
      box(g, -hw + 1.5, hw - 1.5, it.h * 0.5, it.h - 2, hd, hd + 0.6, 0x0f172a, { rough: 0.1, metal: 0.4 });
      // Status indicator ring (Red = Locked, Green = Unlocked)
      cyl(g, 0, it.h * 0.75, hd + 0.8, 2.2, 0.5, locked ? 0xef4444 : 0x10b981, { seg: 16, rx: Math.PI / 2 });
      // Door handle / lever
      cyl(g, 0, it.h * 0.28, hd + 1.5, 1.8, 4, 0x475569, { metal: 0.8, rough: 0.2, seg: 12, rx: Math.PI / 2 });
      box(g, 0, hw + 10, it.h * 0.28 - 1.5, it.h * 0.28 + 1.5, hd + 4, hd + 6, 0x334155, { metal: 0.8, rough: 0.2 });
    },
  },
  vacuum: {
    label: "שואב אבק רובוטי",
    w: 36,
    d: 38,
    h: 12,
    col: "#1e293b",
    build: function (g, it) {
      var r = 16;
      var active = it.smart && (it.smart.on || it.smart.status === "cleaning");
      // Charging dock behind the vacuum
      box(g, -12, 12, 0, 10, -18, -14, 0x334155, { rough: 0.4 });
      box(g, -10, 10, 0, 1.2, -14, -8, 0x1e293b, { rough: 0.5 });
      // Main round vacuum disc body
      cyl(g, 0, 4.5, 0, r, 7, 0x1e293b, { metal: 0.3, rough: 0.35, seg: 32 });
      // Front bumper arc
      cyl(g, 0, 4.5, 3, r + 0.4, 6.5, 0x0f172a, { metal: 0.2, rough: 0.5, seg: 24, thetaLength: Math.PI });
      // Top LiDAR laser turret
      cyl(g, 0, 9.5, -2, 4.5, 3.5, 0x334155, { metal: 0.4, rough: 0.3, seg: 20 });
      // Power / Home control buttons & glowing status ring
      cyl(g, 0, 8.2, 7, 2.2, 0.6, active ? 0x06b6d4 : 0x64748b, { seg: 16 });
    },
  },
  smartPlug: {
    label: "שקע חכם",
    w: 12,
    d: 12,
    h: 14,
    col: "#ffffff",
    build: function (g, it) {
      var hw = it.w / 2, hd = it.d / 2;
      var on = it.smart && it.smart.on;
      // Plug housing
      box(g, -hw, hw, 0, it.h, -hd, hd, 0xf8fafc, { rough: 0.35 });
      // Socket face recess
      cyl(g, 0, it.h * 0.55, hd + 0.1, hw * 0.7, 1.2, 0xe2e8f0, { rough: 0.4, seg: 20, rx: Math.PI / 2 });
      // Pin holes
      [-2.2, 2.2].forEach(function (px) {
        cyl(g, px, it.h * 0.55, hd + 0.8, 0.7, 1.0, 0x1e293b, { seg: 10, rx: Math.PI / 2 });
      });
      // Power button & LED indicator ring
      box(g, -1.8, 1.8, it.h - 2.5, it.h - 0.5, hd + 0.2, hd + 0.8, on ? 0x10b981 : 0x94a3b8);
    },
  },
});

