// Additional built-in furniture models appended onto FURN.
import {
  CAB, ISL, TOP, STEEL, DARK, GLASS, HANDLE, FABRIC, WOOD, BEDC, TVB,
  GREEN, RUGC, PVC_WHITE, BLACK_PLASTIC, ALUMINUM, WATER, TUFF, MOUNTH,
} from "./state.js";
import { box, cyl, sph, lathe, tube, torus, drape } from "./primitives.js";
import { HumanFactory } from "./human.js";
import {
  handleBar, upholstered, legsUnder, slabWithHoles, basin, gooseneck,
  pull, front, toeKick, slab, leg, glassPanel, slats, METAL,
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
      /* Tower PC: a steel case with a smoked-glass side panel, a mesh front
         with a lit power button, and feet. */
      var hw = it.w / 2, hd = it.d / 2;
      box(g, -hw, hw, 2, it.h, -hd, hd, 0x1a1c1e, { rough: 0.4, radius: 0.8 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { box(g, p[0] * (hw - 3) - 1.5, p[0] * (hw - 3) + 1.5, 0, 2, p[1] * (hd - 4) - 3, p[1] * (hd - 4) + 3, 0x111111, { rough: 0.7, radius: 0.5 }); });
      box(g, -hw + 1.5, hw - 1.5, 4, it.h - 2, hd, hd + 0.8, 0x2a2c2e, { rough: 0.7, radius: 0.4 }); // mesh front
      for (var r = 0; r < 12; r++) box(g, -hw + 3, hw - 3, 6 + r * ((it.h - 16) / 12), 6.4 + r * ((it.h - 16) / 12), hd + 0.8, hd + 1, 0x111111, { sharp: true, cast: false });
      cyl(g, 0, it.h - 5, hd + 1.1, 1.2, 0.5, 0x0b1216, { emis: 0x4fb3e0, rx: Math.PI / 2, seg: 16, cast: false });
      box(g, hw, hw + 0.4, 6, it.h - 4, -hd + 4, hd - 4, 0x111111, { metal: 0.3, rough: 0.05, trans: true, opacity: 0.55 });
    }
  },
  laptop: {
    label: "מחשב נייד",
    w: 35,
    d: 25,
    h: 22,
    col: "#d1d5d8",
    build: function (g, it) {
      /* Laptop, open: an aluminium base with a recessed keyboard of real keys and
         a glass trackpad, a hinge barrel, and the lid tilted back on it carrying a
         thin-bezel screen. */
      var hw = it.w / 2, hd = it.d / 2, B = 0xc0c4c8, bt = 1.6, al = { metal: 0.55, rough: 0.3 };
      box(g, -hw, hw, 0, bt, -hd, hd, B, Object.assign({ radius: 0.7 }, al));
      box(g, -hw + 2, hw - 2, bt - 0.12, bt + 0.02, -hd + 2.2, hd - 9.6, 0x1d1f21, { rough: 0.6, sharp: true });
      var cols = 13, rows = 5, kw = (it.w - 4.6) / cols, kd = (it.d - 12.2) / rows;
      for (var r = 0; r < rows; r++)
        for (var c = 0; c < cols; c++) {
          if (r === rows - 1 && c > 3 && c < 9) continue; // the space bar takes these
          var kx = -hw + 2.3 + c * kw, kz = -hd + 2.4 + r * kd;
          box(g, kx + 0.12, kx + kw - 0.12, bt, bt + 0.2, kz + 0.12, kz + kd - 0.12, 0x2a2c2e, { rough: 0.55, sharp: true, cast: false });
        }
      var sz = -hd + 2.4 + (rows - 1) * kd;
      box(g, -hw + 2.3 + 4 * kw + 0.12, -hw + 2.3 + 9 * kw - 0.12, bt, bt + 0.2, sz + 0.12, sz + kd - 0.12, 0x2a2c2e, { rough: 0.55, sharp: true, cast: false });
      box(g, -6.5, 6.5, bt - 0.02, bt + 0.04, hd - 8.6, hd - 1.4, 0xadb1b5, { metal: 0.3, rough: 0.2, sharp: true }); // trackpad
      cyl(g, 0, bt + 0.4, -hd + 0.9, 0.75, it.w - 7, B, Object.assign({ rz: Math.PI / 2, seg: 12 }, al)); // hinge
      // the lid, pivoting on the hinge and leaning back by `a`: parts are placed
      // by (s along the lid from the hinge, n out of its face)
      var a = 0.2, L = (it.h - bt - 0.4) / Math.cos(a), py = bt + 0.4, pz = -hd + 0.9;
      function lidPart(x0, x1, s0, s1, n0, n1, col, opt) {
        var m = box(g, x0, x1, -(s1 - s0) / 2, (s1 - s0) / 2, -(n1 - n0) / 2, (n1 - n0) / 2, col, opt);
        if (!m) return;
        var sm = (s0 + s1) / 2, nm = (n0 + n1) / 2;
        m.position.set((x0 + x1) / 2, py + sm * Math.cos(a) + nm * Math.sin(a), pz - sm * Math.sin(a) + nm * Math.cos(a));
        m.rotation.x = -a;
      }
      lidPart(-hw, hw, 0, L, -0.35, 0.35, B, Object.assign({ radius: 0.3 }, al));
      lidPart(-hw + 0.6, hw - 0.6, 1.6, L - 0.6, 0.35, 0.42, 0x0e1012, { metal: 0.1, rough: 0.08, sharp: true });
      lidPart(-hw + 1.1, hw - 1.1, 2.4, L - 1.1, 0.42, 0.46, 0x223344, { metal: 0.1, rough: 0.12, emis: 0x1a2c3c, sharp: true, cast: false });
    },
  },
  monitor: {
    label: "מסך מחשב",
    w: 55,
    d: 15,
    h: 40,
    col: "#1a1c1e",
    build: function (g, it) {
      /* Monitor: a thin panel with a narrow bezel on a height-adjustable column
         and a flat round-cornered foot. */
      var hw = it.w / 2, hd = it.d / 2, y0 = 11;
      box(g, -11, 11, 0, 1.2, -hd + 1, hd - 3, 0x2a2c2e, { metal: 0.4, rough: 0.35, radius: 0.5 });
      box(g, -2.5, 2.5, 1.2, y0 + (it.h - y0) * 0.4, -hd + 3, -hd + 6, 0x2a2c2e, { metal: 0.4, rough: 0.35, radius: 0.8 });
      box(g, -hw, hw, y0, it.h, -hd + 5.5, -hd + 8, 0x1a1c1e, { rough: 0.45, radius: 0.5 });
      box(g, -hw + 0.8, hw - 0.8, y0 + 2, it.h - 0.8, -hd + 8, -hd + 8.2, 0x111111, { metal: 0.2, rough: 0.08, sharp: true });
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
      /* Sideboard on tapered legs: three doors on shadow reveals (drawers over
         the middle door), an overhanging solid-wood top. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, legH = 14, top = it.h - 3, zf = hd - 2, hs = V.handle || "bar";
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        leg(g, p[0] * (hw - 7), p[1] * (hd - 6), 0, legH + 1, WOOD, "taper");
      });
      box(g, -hw + 1, hw - 1, legH, top, -hd + 1, zf, CAB, { rough: 0.7, sharp: true });
      var cw = (it.w - 2) / 3;
      front(g, -hw + 1, -hw + 1 + cw, legH, top, zf, CAB, { kind: "door", hinge: -1, handle: hs });
      front(g, -hw + 1 + cw, -hw + 1 + 2 * cw, top - 16, top, zf, CAB, { kind: "drawer", handle: hs });
      front(g, -hw + 1 + cw, -hw + 1 + 2 * cw, legH, top - 16, zf, CAB, { kind: "door", hinge: -1, handle: hs, handleAt: "top" });
      front(g, -hw + 1 + 2 * cw, hw - 1, legH, top, zf, CAB, { kind: "door", hinge: 1, handle: hs });
      slab(g, -hw - 1, hw + 1, top, it.h, -hd - 0.5, hd + 1, WOOD, { rough: 0.5, radius: 0.8 });
    },
  },
  console: {
    label: "קונסולה",
    w: 110,
    d: 35,
    h: 78,
    col: "#9c7a4e",
    build: function (g, it) {
      /* Hall console: a solid top on square legs tied by an apron and a low
         shelf, with a slim drawer in the apron. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, ty = it.h - 3;
      slab(g, -hw, hw, ty, it.h, -hd, hd, WOOD, { rough: 0.5, radius: 0.8 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        box(g, p[0] * (hw - 4) - 2, p[0] * (hw - 4) + 2, 0, ty, p[1] * (hd - 4) - 2, p[1] * (hd - 4) + 2, 0x6f5535, { rough: 0.55, radius: 0.5 });
      });
      box(g, -hw + 6, hw - 6, ty - 10, ty, -hd + 3, -hd + 5, 0x6f5535, { rough: 0.55, sharp: true });
      box(g, -hw + 6, hw - 6, ty - 10, ty, hd - 5, hd - 3, 0x6f5535, { rough: 0.55, sharp: true });
      front(g, -hw * 0.45, hw * 0.45, ty - 10, ty, hd - 3.6, WOOD, { kind: "drawer", handle: V.handle || "knob", t: 1.4 });
      slab(g, -hw + 4, hw - 4, it.h * 0.2, it.h * 0.2 + 2.5, -hd + 4, hd - 4, WOOD, { rough: 0.55, radius: 0.5 });
    },
  },
  stool: {
    label: "שרפרף",
    w: 36,
    d: 36,
    h: 46,
    col: "#b98a55",
    build: function (g, it) {
      /* Wooden stool: a dished round seat on four splayed tapered legs tied by
         a stretcher ring. */
      var hw = it.w / 2, ty = it.h - 3;
      cyl(g, 0, it.h - 1.5, 0, hw, 3, WOOD, { rough: 0.5, seg: 40, r2: hw - 0.6 });
      for (var k = 0; k < 4; k++) {
        var a = (k * Math.PI) / 2 + Math.PI / 4, lx = Math.cos(a) * (hw - 6), lz = Math.sin(a) * (hw - 6);
        var l = cyl(g, lx * 1.1, ty / 2, lz * 1.1, 1.3, ty, 0x6f5535, { rough: 0.55, seg: 12, r2: 1.8 });
        if (l) { l.rotation.z = -Math.cos(a) * 0.08; l.rotation.x = Math.sin(a) * 0.08; }
      }
      cyl(g, 0, it.h * 0.34, 0, hw - 5, 1.6, 0x6f5535, { rough: 0.6, seg: 36, open: true });
    },
  },
  recliner: {
    label: "כורסת טלוויזיה",
    w: 90,
    d: 100,
    h: 105,
    col: "#8d949a",
    build: function (g, it) {
      /* Recliner: a plush pillow-top seat and a split back cushion leaning into
         the frame, padded arms, the footrest raised and a side lever. */
      var hw = it.w / 2, hd = it.d / 2, legH = 8;
      box(g, -hw + 6, hw - 6, 0, legH, -hd + 8, hd - 26, 0x4b4540, { rough: 0.8, radius: 0.5 });
      box(g, -hw, hw, legH, 40, -hd, hd - 24, FABRIC, { rough: 0.95, radius: 4 });
      box(g, -hw + 13, hw - 13, 39, 49, -hd + 14, hd - 25, 0xb4bdbd, { rough: 0.95, radius: 5, crown: 2 });
      var bk = box(g, -hw + 2, hw - 2, 40, it.h, -hd, -hd + 16, FABRIC, { rough: 0.95, radius: 5, crown: 1.5, crownAxis: "z" });
      if (bk) { bk.rotation.x = -0.18; bk.position.z += 3; bk.position.y -= 2; }
      [[48, 72], [72, it.h - 6]].forEach(function (b) {
        var c = box(g, -hw + 14, hw - 14, b[0], b[1], -hd + 13, -hd + 24, 0xb4bdbd, { rough: 0.95, radius: 5, crown: 2.5, crownAxis: "z" });
        if (c) { c.rotation.x = -0.18; c.position.z -= (b[0] - 40) * 0.12; }
      });
      [-1, 1].forEach(function (s) {
        box(g, s < 0 ? -hw : hw - 13, s < 0 ? -hw + 13 : hw, legH, 62, -hd, hd - 20, FABRIC, { rough: 0.95, radius: 5, crown: 1.5 });
      });
      box(g, -hw + 10, hw - 10, 24, 38, hd - 22, hd, FABRIC, { rough: 0.95, radius: 4, crown: 1 });
      box(g, -hw + 13, hw - 13, 37, 41, hd - 21, hd - 1.5, 0xb4bdbd, { rough: 0.95, radius: 2, crown: 1 });
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
      /* Larder cupboard: pairs of doors split at worktop height, a recessed
         plinth and a cornice. */
      var V = vspec(it), hw = it.w / 2, hd = it.d / 2, toe = 8, zf = hd - 2, split = Math.min(it.h - 40, 92), hs = V.handle || "bar";
      toeKick(g, -hw, hw, toe, -hd, hd);
      box(g, -hw, hw, toe, it.h, -hd, zf, CAB, { rough: 0.7, sharp: true });
      [-1, 1].forEach(function (s) {
        var x0 = s < 0 ? -hw : 0, x1 = s < 0 ? 0 : hw;
        front(g, x0, x1, toe, split, zf, CAB, { kind: "door", hinge: s < 0 ? -1 : 1, handle: hs, handleAt: "top", shaker: V.shaker });
        front(g, x0, x1, split, it.h, zf, CAB, { kind: "door", hinge: s < 0 ? -1 : 1, handle: hs, handleAt: "bottom", shaker: V.shaker });
      });
      box(g, -hw - 0.5, hw + 0.5, it.h, it.h + 4, -hd, hd + 1, CAB, { rough: 0.75, radius: 0.5 }); // cornice
    },
  },
  filingCab: {
    label: "ארונית תיוק",
    w: 45,
    d: 60,
    h: 100,
    col: "#b9bcbe",
    build: function (g, it) {
      /* Filing cabinet: three suspension drawers with label holders and
         recessed pulls, on a plinth. */
      var hw = it.w / 2, hd = it.d / 2, zf = hd - 2;
      box(g, -hw + 1, hw - 1, 0, 4, -hd + 2, hd - 4, 0x3b3936, { rough: 0.8, sharp: true });
      box(g, -hw, hw, 4, it.h, -hd, zf, CAB, { rough: 0.6, radius: 0.5 });
      var H = (it.h - 4) / 3;
      for (var i = 0; i < 3; i++) {
        var y0 = 4 + i * H, y1 = y0 + H;
        front(g, -hw, hw, y0, y1, zf, CAB, { kind: "drawer", handle: "cup", rough: 0.55 });
        box(g, -5, 5, y1 - 9, y1 - 6, zf + 1.8, zf + 2.1, 0xc9ced1, { metal: 0.7, rough: 0.3, sharp: true });
        box(g, -4.2, 4.2, y1 - 8.5, y1 - 6.5, zf + 2.1, zf + 2.15, 0xf4f2ec, { rough: 0.9, sharp: true, cast: false });
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
      /* Floating shelf (hidden bracket) styled with books, a stack, a vase and a
         small plant, so it reads as a shelf in use. */
      var y0 = 150, hw = it.w / 2, hd = it.d / 2;
      box(g, -hw, hw, y0, y0 + 4, -hd, hd, WOOD, { rough: 0.55, radius: 0.6 });
      var bc = [0x7a4a3a, 0x4a6a7a, 0xd8cfbf, 0x2f3b45, 0x8a8a4a];
      var x = -hw + 5;
      for (var b = 0; b < 6 && x < -hw + it.w * 0.45; b++) {
        var bw = 2.4 + (b * 7) % 3, bh = 17 + ((b * 5) % 7);
        box(g, x, x + bw, y0 + 4, y0 + 4 + bh, -hd + 3, hd - 4, bc[b % bc.length], { rough: 0.85, radius: 0.25 });
        x += bw + 0.3;
      }
      for (var st = 0; st < 3; st++) box(g, -4 - st, 12 - st, y0 + 4 + st * 2.6, y0 + 6.4 + st * 2.6, -hd + 4, hd - 5, bc[(st + 2) % bc.length], { rough: 0.85, radius: 0.3 });
      cyl(g, hw - 22, y0 + 13, 0, 4.5, 18, 0xe9e4da, { rough: 0.3, seg: 20, r2: 2.6 });
      cyl(g, hw - 9, y0 + 9, 0, 4.2, 10, 0xb58a66, { rough: 0.8, seg: 16, r2: 5 });
      sph(g, hw - 9, y0 + 18, 0, 6, GREEN, { rough: 0.95 });
    },
  },
  floorMirror: {
    label: "מראה קמרון",
    w: 70,
    d: 8,
    h: 180,
    col: "#cfd6da",
    build: function (g, it) {
      /* Arched floor mirror: a round-section frame — straight stiles, a bottom
         rail and a bent arch — round a bevelled glass, on a backing board. */
      var hw = it.w / 2, hd = it.d / 2, fr = 2.4, archY = it.h - hw, fo = { rough: 0.5, seg: 16 };
      var fz = hd - fr - 0.2; // the frame's centre line, front face at the footprint edge
      box(g, -hw + 1, hw - 1, 0.5, archY, -hd + 0.4, fz - fr + 0.3, 0x5a4a3a, { rough: 0.8, sharp: true }); // backing
      cyl(g, 0, archY, (-hd + 0.4 + fz - fr + 0.3) / 2, hw - 1, fz - fr - 0.1 + hd, 0x5a4a3a, { rough: 0.8, seg: 32, rx: Math.PI / 2 });
      [-1, 1].forEach(function (s) {
        box(g, s * (hw - fr) - fr, s * (hw - fr) + fr, 0, archY, fz - fr, fz + fr, WOOD, { rough: 0.5, radius: fr - 0.1 });
      });
      box(g, -hw + fr, hw - fr, 0, 2 * fr, fz - fr, fz + fr, WOOD, { rough: 0.5, radius: fr - 0.1 });
      torus(g, 0, archY, fz, hw - fr, fr, WOOD, Object.assign({ arc: Math.PI, rx: -Math.PI / 2, seg: 40, segR: 10 }, fo));
      var gz = fz - 0.8;
      box(g, -hw + 2 * fr, hw - 2 * fr, 2 * fr, archY, gz, gz + 0.5, 0xdfe8ec, { metal: 1, rough: 0.03, sharp: true });
      cyl(g, 0, archY, gz + 0.25, hw - 2 * fr, 0.5, 0xdfe8ec, { metal: 1, rough: 0.03, seg: 40, rx: Math.PI / 2 });
    },
  },
  clock: {
    label: "שעון קיר",
    w: 34,
    d: 6,
    h: 34,
    col: "#2b2e31",
    build: function (g, it) {
      /* Wall clock: a round rim, a white dial with twelve baton markers, hour,
         minute and a red second hand at ten past ten, a centre boss and a glass. */
      var y0 = 170, r = Math.min(it.w, it.h) / 2, cy = y0 + r, fz = 0.6, i;
      cyl(g, 0, cy, -1.2, r - 1, 2.4, WOOD, { rough: 0.5, seg: 48, rx: Math.PI / 2 });
      torus(g, 0, cy, 0.4, r - 1.4, 1.4, WOOD, { rough: 0.45, seg: 56, segR: 10, rx: -Math.PI / 2 });
      cyl(g, 0, cy, 0.2, r - 2.4, 0.4, 0xf6f4ef, { rough: 0.4, seg: 48, rx: Math.PI / 2 });
      for (i = 0; i < 12; i++) {
        var an = (i / 12) * Math.PI * 2, L = i % 3 ? 1.8 : 3.2, rm = r - 5 - L / 2;
        var mk = box(g, -0.4, 0.4, -L / 2, L / 2, -0.1, 0.1, 0x2b2e31, { sharp: true, cast: false });
        if (mk) {
          mk.position.set(Math.sin(an) * rm, cy + Math.cos(an) * rm, fz);
          mk.rotation.z = -an;
        }
      }
      function hand(an, len, wd, col, z) {
        var h = box(g, -wd / 2, wd / 2, -len * 0.15, len, -0.08, 0.08, col, { sharp: true, cast: false });
        if (h) {
          h.geometry.translate(0, len * 0.425, 0);
          h.position.set(0, cy, z);
          h.rotation.z = -an;
        }
      }
      hand(-Math.PI / 3 + 0.08, r * 0.5, 1.3, 0x2b2e31, fz + 0.2);
      hand(Math.PI / 3, r * 0.76, 0.9, 0x2b2e31, fz + 0.4);
      hand(Math.PI * 0.8, r * 0.82, 0.3, 0xc0392b, fz + 0.6);
      cyl(g, 0, cy, fz + 0.6, 0.9, 0.8, HANDLE, { metal: 0.8, rough: 0.3, seg: 14, rx: Math.PI / 2 });
      cyl(g, 0, cy, 1.9, r - 2, 0.2, GLASS, { trans: true, opacity: 0.12, rough: 0.03, metal: 0.1, seg: 48, rx: Math.PI / 2, cast: false });
    },
  },
  curtain: {
    label: "וילון",
    w: 170,
    d: 14,
    h: 240,
    col: "#d9cfba",
    build: function (g, it) {
      /* Curtains: a round pole on brackets with ball finials and rings, and two
         pleated panels hanging from them, drawn apart by the smart position. */
      var hw = it.w / 2, top = it.h, hd = it.d / 2, rz = -hd + 4, ry = top - 3,
        pole = { metal: 0.7, rough: 0.35, seg: 14 };
      cyl(g, 0, ry, rz, 1.4, it.w + 8, HANDLE, Object.assign({ rz: Math.PI / 2 }, pole));
      [-1, 1].forEach(function (s) {
        sph(g, s * (hw + 5.5), ry, rz, 2.6, HANDLE, { metal: 0.7, rough: 0.35, seg: 16, segV: 12 });
        cyl(g, s * (hw - 2), ry, (-hd + rz) / 2, 0.8, rz + hd, HANDLE, Object.assign({ rx: Math.PI / 2 }, pole)); // bracket
        cyl(g, s * (hw - 2), ry, -hd + 0.4, 2.2, 0.8, HANDLE, Object.assign({ rx: Math.PI / 2 }, pole));
      });
      var pos = it.smart && typeof it.smart.position === "number" ? it.smart.position : 100;
      var openFrac = 1 - Math.max(0, Math.min(100, pos)) / 100;
      var gapW = it.w * (0.16 + 0.7 * openFrac), pw = (it.w - gapW) / 2;
      if (pw < 4) return;
      [-1, 1].forEach(function (s) {
        var x0 = s < 0 ? -hw : gapW / 2, x1 = s < 0 ? -gapW / 2 : hw, folds = Math.max(3, Math.round(pw / 13));
        drape(g, x0, x1, 1.5, ry - 3, rz + 1, folds, Math.min(9, 5 + (1 - pw / hw) * 6), FABRIC, { rough: 0.95 });
        for (var k = 0; k <= folds * 2; k++) {
          var rx = x0 + ((x1 - x0) * k) / (folds * 2);
          torus(g, rx, ry, rz, 1.9, 0.28, HANDLE, { metal: 0.7, rough: 0.35, seg: 14, segR: 5, rz: Math.PI / 2, cast: false });
        }
      });
    },
  },
  whiteboard: {
    label: "לוח מחיק",
    w: 150,
    d: 6,
    h: 100,
    col: "#f6f7f8",
    build: function (g, it) {
      /* Whiteboard: an anodised frame of rounded bars with moulded corner caps
         round a glossy board, and a pen tray carrying three markers and an
         eraser. */
      var y0 = 110, hw = it.w / 2, hd = it.d / 2, f = 2.2, AL = 0xb9bcbe, al = { metal: 0.6, rough: 0.35, radius: 0.7 };
      box(g, -hw + f, hw - f, y0 + f, y0 + it.h - f, -hd, hd - 1.8, 0xf6f7f8, { rough: 0.14, metal: 0.05, sharp: true });
      box(g, -hw, hw, y0, y0 + f, -hd, hd - 1, AL, al);
      box(g, -hw, hw, y0 + it.h - f, y0 + it.h, -hd, hd - 1, AL, al);
      box(g, -hw, -hw + f, y0, y0 + it.h, -hd, hd - 1, AL, al);
      box(g, hw - f, hw, y0, y0 + it.h, -hd, hd - 1, AL, al);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        var cx = p[0] * (hw - f / 2), cy = p[1] < 0 ? y0 + f / 2 : y0 + it.h - f / 2;
        box(g, cx - 1.8, cx + 1.8, cy - 1.8, cy + 1.8, -hd, hd - 0.6, 0x3d4348, { rough: 0.5, radius: 0.8 });
      });
      box(g, -hw * 0.6, hw * 0.2, y0 - 0.4, y0 + 0.9, hd - 1, hd + 4, AL, al); // tray
      [0x1a1c1e, 0x2f6fb5, 0xc0392b].forEach(function (c, i) {
        var mx = -hw * 0.5 + i * 8;
        cyl(g, mx, y0 + 1.8, hd + 1.5, 0.8, 12, c, { rough: 0.4, seg: 10, rx: Math.PI / 2 });
        cyl(g, mx, y0 + 1.8, hd + 1.5, 0.9, 4, 0xf2f2f0, { rough: 0.4, seg: 10, rx: Math.PI / 2 });
      });
      box(g, -hw * 0.5 + 26, -hw * 0.5 + 38, y0 + 0.9, y0 + 3.6, hd, hd + 3.6, 0x3d4348, { rough: 0.6, radius: 0.6 });
    },
  },
  speaker: {
    label: "רמקול עמוד",
    w: 24,
    d: 30,
    h: 105,
    col: "#2b2e31",
    build: function (g, it) {
      /* Floor-standing speaker: a veneered cabinet with softened edges on a
         spiked plinth, a black baffle with two woofers (cone, rubber surround,
         dust cap), a dome tweeter and a bass port. */
      var hw = it.w / 2, hd = it.d / 2, i;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
        cyl(g, p[0] * (hw - 1), 0.7, p[1] * (hd - 1), 0.9, 1.4, 0x8a857c, { metal: 0.8, rough: 0.3, seg: 10, r2: 0.2 });
      });
      box(g, -hw - 1.5, hw + 1.5, 1.4, 3.6, -hd - 1.5, hd + 1.5, 0x24262a, { rough: 0.5, radius: 0.6 });
      box(g, -hw, hw, 3.6, it.h, -hd, hd - 0.6, WOOD, { rough: 0.42, radius: 1.6 });
      box(g, -hw + 0.3, hw - 0.3, 4.2, it.h - 0.6, hd - 1.2, hd, 0x1a1c1e, { rough: 0.7, radius: 0.8 });
      function driver(y, R) {
        torus(g, 0, y, hd, R, 0.7, 0x2b2d30, { rough: 0.8, seg: 36, segR: 8, rx: -Math.PI / 2 });
        lathe(g, 0, y, hd, [[R, 0], [R * 0.4, -2.4], [0, -2.6]], 0x3a3d40, { rough: 0.6, seg: 36, rx: Math.PI / 2 });
        var cap = sph(g, 0, y, hd - 2.4, R * 0.3, 0x2b2d30, { rough: 0.5, seg: 16, segV: 10 });
        if (cap) cap.scale.z = 0.5;
      }
      var R = Math.min(hw - 3.5, 8.5);
      for (i = 0; i < 2; i++) driver(it.h * (0.38 + i * 0.22), R);
      torus(g, 0, it.h * 0.86, hd, 3, 0.5, 0x4a4f54, { metal: 0.5, rough: 0.35, seg: 24, segR: 6, rx: -Math.PI / 2 });
      sph(g, 0, it.h * 0.86, hd - 0.4, 1.6, 0x55595e, { metal: 0.4, rough: 0.3, seg: 16, segV: 10 });
      torus(g, 0, it.h * 0.14, hd, 2.6, 0.5, 0x2b2d30, { rough: 0.6, seg: 24, segR: 6, rx: -Math.PI / 2 });
      cyl(g, 0, it.h * 0.14, hd - 0.2, 2.3, 0.6, 0x08090a, { rough: 0.9, seg: 20, rx: Math.PI / 2 });
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
        hd = it.d / 2,
        rr = Math.min(3, it.h / 2 - 0.2);
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd, 0x2a2d30, { rough: 0.45, radius: rr }); // shell
      box(g, -hw + 1, hw - 1, y0 + 0.6, y0 + it.h - 0.6, hd - 2, hd + 0.2, 0x3d4348, { rough: 0.92, radius: Math.max(0.5, rr - 0.6) }); // fabric wrap
      box(g, -6, 6, y0 + it.h * 0.45, y0 + it.h * 0.55, hd + 0.2, hd + 0.35, 0xdfe8f0, { emis: 0x7fa0c0, sharp: true, cast: false }); // display
      [-3, 0, 3].forEach(function (x) {
        cyl(g, x, y0 + it.h + 0.05, 0, 0.8, 0.2, 0x1a1c1e, { rough: 0.4, seg: 14, cast: false });
      });
      if (V.mountY != null && V.mountY > 40)
        // slim wall brackets, so a floating bar doesn't read as levitating
        [-1, 1].forEach(function (s) {
          box(g, s * (hw * 0.5) - 2, s * (hw * 0.5) + 2, y0 + 1, y0 + it.h - 1, -hd - 2.5, -hd, 0x4a4f54, {
            metal: 0.5, rough: 0.45, radius: 0.4,
          });
        });
      else
        [-1, 1].forEach(function (s) {
          box(g, s * (hw - 12) - 5, s * (hw - 12) + 5, y0 - 0.4, y0 + 0.4, -hd + 2, hd - 2, 0x1a1c1e, { rough: 0.9, sharp: true, cast: false });
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
      /* Wine cabinet: a shell carcass (so the inside shows), wooden-fronted
         racks of bottles lying base-out, a framed glass door with a bar handle,
         and a control strip with a temperature readout. */
      var hw = it.w / 2, hd = it.d / 2, sh = { rough: 0.4, metal: 0.35, sharp: true };
      box(g, -hw, hw, 0, it.h, -hd, -hd + 3, STEEL, sh);
      box(g, -hw, -hw + 2, 0, it.h, -hd, hd - 3, STEEL, sh);
      box(g, hw - 2, hw, 0, it.h, -hd, hd - 3, STEEL, sh);
      box(g, -hw, hw, 0, 6, -hd, hd - 3, STEEL, sh);
      box(g, -hw, hw, it.h - 4, it.h, -hd, hd - 3, STEEL, sh);
      box(g, -hw + 2, hw - 2, 6, it.h - 4, -hd + 3, -hd + 3.4, 0x1c1f22, { rough: 0.6, sharp: true, cast: false }); // dark liner
      var L = Math.min(30, it.d - 16), cols = Math.max(2, Math.floor((it.w - 6) / 8.5)), shelves = Math.max(2, Math.floor((it.h - 16) / 16));
      for (var s = 0; s < shelves; s++) {
        var y = 8 + s * ((it.h - 16) / shelves);
        box(g, -hw + 2, hw - 2, y, y + 1, -hd + 3.4, hd - 6, 0x6e7478, { metal: 0.6, rough: 0.4, sharp: true });
        box(g, -hw + 2, hw - 2, y - 1, y + 2.4, hd - 7.2, hd - 5.8, 0xa07a52, { rough: 0.55, radius: 0.4 }); // shelf front
        for (var b = 0; b < cols; b++) {
          var bx = -hw + 3 + (b + 0.5) * ((it.w - 6) / cols);
          lathe(g, bx, y + 5, hd - 7.5, [[0, 0], [3.2, 0], [3.4, 0.6], [3.4, L * 0.64], [2.5, L * 0.75], [1.2, L * 0.83], [1.2, L], [0, L]],
            [0x2f4a2a, 0x3c2a22, 0x24331f, 0x402a26][(b + s) % 4], { rough: 0.25, metal: 0.1, seg: 14, rx: -Math.PI / 2 });
        }
      }
      // door: frame round a glass pane
      var fz = hd - 3;
      box(g, -hw, -hw + 3, 0, it.h, fz, hd, STEEL, { rough: 0.35, metal: 0.5, radius: 0.5 });
      box(g, hw - 3, hw, 0, it.h, fz, hd, STEEL, { rough: 0.35, metal: 0.5, radius: 0.5 });
      box(g, -hw + 3, hw - 3, 0, 6, fz, hd, STEEL, { rough: 0.35, metal: 0.5, radius: 0.5 });
      box(g, -hw + 3, hw - 3, it.h - 5, it.h, fz, hd, STEEL, { rough: 0.35, metal: 0.5, radius: 0.5 });
      box(g, -hw + 3, hw - 3, 6, it.h - 5, fz + 1, fz + 1.6, GLASS, { trans: true, opacity: 0.22, rough: 0.04, metal: 0.15, cast: false, sharp: true });
      box(g, -hw + 5, -hw + 13, it.h - 3.6, it.h - 1.4, hd, hd + 0.2, 0x0e1012, { rough: 0.1, sharp: true });
      box(g, -hw + 6, -hw + 10, it.h - 3.1, it.h - 1.9, hd + 0.2, hd + 0.3, 0x7fd0ff, { emis: 0x5ab0e0, sharp: true, cast: false });
      pull(g, hw - 1.5, it.h * 0.55, hd, Math.min(40, it.h * 0.4), true, "bar", HANDLE);
    },
  },
  coffeeMachine: {
    label: "מכונת אספרסו",
    w: 30,
    d: 38,
    h: 38,
    col: "#b8bfc4",
    build: function (g, it) {
      /* Espresso machine on the worktop: a brushed body with rounded corners, a
         cup-warmer rail on top, the group head with its portafilter and handle,
         a steam wand, a pressure gauge, a grated drip tray with a cup on it. */
      var y0 = 92, hw = it.w / 2, hd = it.d / 2, M = { metal: 0.7, rough: 0.25 };
      box(g, -hw, hw, y0, y0 + 2.6, -hd, hd, 0x3d4348, { rough: 0.5, radius: 1 }); // base
      box(g, -hw, hw, y0 + 2.6, y0 + it.h - 1, -hd, hd - 11, STEEL, { metal: 0.6, rough: 0.3, radius: 2 }); // body
      box(g, -hw + 1.5, hw - 1.5, y0 + it.h - 1, y0 + it.h, -hd + 2, hd - 13, 0x9aa2a8, Object.assign({ radius: 0.4 }, M)); // cup warmer
      [-1, 1].forEach(function (s) {
        cyl(g, s * (hw - 2), y0 + it.h + 1.2, -hd + 6, 0.35, 2.4, 0x9aa2a8, Object.assign({ seg: 8 }, M));
      });
      cyl(g, 0, y0 + it.h + 2.4, -hd + 6, 0.35, it.w - 4, 0x9aa2a8, Object.assign({ seg: 8, rz: Math.PI / 2 }, M));
      // drip tray and grate
      box(g, -hw + 2, hw - 2, y0 + 2.6, y0 + 4.2, hd - 11, hd - 0.5, 0x9aa2a8, Object.assign({ radius: 0.5 }, M));
      for (var i = 0; i < 6; i++) {
        var gz = hd - 10 + i * 1.6;
        box(g, -hw + 3, hw - 3, y0 + 4.15, y0 + 4.25, gz, gz + 0.5, 0x2a2d30, { sharp: true, cast: false });
      }
      // group head, portafilter, handle
      var gy = y0 + 19, gzC = hd - 14;
      lathe(g, 0, gy, gzC, [[0, 0], [3.8, 0], [3.8, 3], [4.6, 3.6], [4.6, 5], [0, 5]], 0x9aa2a8, Object.assign({ seg: 28 }, M));
      lathe(g, 0, gy - 3, gzC, [[0, 0], [3, 0], [3.4, 0.6], [3.4, 3], [0, 3]], STEEL, Object.assign({ seg: 24 }, M));
      tube(g, [[0, gy - 1.8, gzC + 3], [0, gy - 2.4, gzC + 9], [0, gy - 3.2, gzC + 14]], 1.1, 0x24262a, { rough: 0.5, seg: 10 });
      // cup and saucer under the spout
      cyl(g, 0, y0 + 4.5, gzC + 1, 3.6, 0.5, 0xf2f2f0, { rough: 0.3, seg: 24 });
      lathe(g, 0, y0 + 4.7, gzC + 1, [[0, 0], [1.8, 0], [2.6, 3.6], [2.4, 3.6], [1.6, 0.4], [0, 0.4]], 0xf2f2f0, { rough: 0.3, seg: 24 });
      // steam wand
      tube(g, [[hw - 3, y0 + 24, hd - 12], [hw - 1.2, y0 + 21, hd - 10], [hw - 1.2, y0 + 12, hd - 9], [hw - 2, y0 + 8, hd - 8]], 0.45, 0x9aa2a8, { metal: 0.8, rough: 0.2, seg: 8 });
      // pressure gauge and buttons on the face
      torus(g, -hw + 7, y0 + it.h - 9, hd - 11, 3, 0.45, 0x9aa2a8, { metal: 0.8, rough: 0.2, seg: 24, segR: 6, rx: -Math.PI / 2 });
      cyl(g, -hw + 7, y0 + it.h - 9, hd - 11, 2.9, 0.3, 0xf2f2f0, { rough: 0.4, seg: 24, rx: Math.PI / 2 });
      [2, 5.5, 9].forEach(function (x) {
        cyl(g, x - 2, y0 + it.h - 9, hd - 10.8, 0.9, 0.6, 0x2a2d30, { rough: 0.4, seg: 12, rx: Math.PI / 2 });
      });
    },
  },
  toaster: {
    label: "טוסטר",
    w: 28,
    d: 18,
    h: 20,
    col: "#c4c9cc",
    build: function (g, it) {
      /* Two-slot toaster: a softly radiused body on a dark base, chrome-rimmed
         slots, the carriage lever in its slot and a browning knob. */
      var y0 = 92, hw = it.w / 2, hd = it.d / 2, top = y0 + it.h;
      box(g, -hw + 1, hw - 1, y0, y0 + 1.6, -hd + 1, hd - 1, 0x24262a, { rough: 0.6, radius: 0.6 });
      box(g, -hw, hw, y0 + 1.2, top, -hd, hd, STEEL, { metal: 0.6, rough: 0.26, radius: Math.min(3.5, hd - 0.5) });
      [-1, 1].forEach(function (s) {
        box(g, s * 5.5 - 4.2, s * 5.5 + 4.2, top - 0.3, top + 0.15, -hd + 3.2, hd - 3.2, 0x9aa2a8, { metal: 0.8, rough: 0.2, radius: 0.5 });
        box(g, s * 5.5 - 3.4, s * 5.5 + 3.4, top - 0.2, top + 0.2, -hd + 4, hd - 4, 0x16181a, { rough: 0.8, sharp: true, cast: false });
      });
      box(g, hw - 7, hw - 5, y0 + 5, y0 + it.h - 4, hd - 0.2, hd + 0.1, 0x16181a, { sharp: true, cast: false }); // lever slot
      box(g, hw - 8, hw - 4, y0 + it.h - 7, y0 + it.h - 5.4, hd, hd + 2.2, 0x24262a, { rough: 0.5, radius: 0.5 }); // lever
      cyl(g, -hw + 6, y0 + 6, hd + 0.8, 1.8, 1.6, 0x24262a, { rough: 0.5, seg: 18, rx: Math.PI / 2 }); // knob
    },
  },
  kettle: {
    label: "קומקום",
    w: 22,
    d: 22,
    h: 27,
    col: "#dfe3e5",
    build: function (g, it) {
      /* Cordless kettle: a turned steel body waisting in to its lid, on a power
         base; a looped handle, a drawn spout and a lid knob. */
      var y0 = 92, r = Math.min(it.w, it.d) / 2 - 3, H = it.h;
      lathe(g, 0, y0, 0, [[0, 0], [r + 0.4, 0], [r + 0.4, 1.6], [r - 0.4, 2.4], [0, 2.4]], 0x3d4348, { rough: 0.5, seg: 32 });
      lathe(g, 0, y0 + 2.4, 0, [[0, 0], [r - 2, 0], [r - 0.6, 1.2], [r, H * 0.3], [r - 1.4, H * 0.62], [r - 3.8, H - 5.4], [r - 4.4, H - 4.6], [0, H - 4.6]],
        STEEL, { metal: 0.65, rough: 0.22, seg: 40 });
      cyl(g, 0, y0 + H - 2, 0, r - 4.6, 0.8, 0x9aa2a8, { rough: 0.4, metal: 0.4, seg: 32 }); // lid
      lathe(g, 0, y0 + H - 1.6, 0, [[0, 0], [1.2, 0], [1.6, 1], [0.8, 1.6], [0, 1.6]], 0x24262a, { rough: 0.5, seg: 16 });
      tube(g, [[0, y0 + 7, -(r - 0.5)], [0, y0 + 9, -(r + 3.5)], [0, y0 + H - 6, -(r + 3.2)], [0, y0 + H - 3.4, -(r - 3.6)]], 1.3, 0x24262a, { rough: 0.5, seg: 10 });
      tube(g, [[0, y0 + H * 0.5, r - 1.2], [0, y0 + H * 0.66, r + 1.4], [0, y0 + H * 0.78, r + 3]], 1.2, STEEL, { metal: 0.65, rough: 0.22, seg: 10 });
    },
  },
  waterHeater: {
    label: "דוד חימום",
    w: 50,
    d: 50,
    h: 130,
    col: "#dfe3e5",
    build: function (g, it) {
      /* Water heater: a turned cylinder with dished heads on a ring stand, cold
         and hot connections with brass unions and colour bands, a relief valve
         and its discharge pipe, and the thermostat cover. */
      var r = Math.min(it.w, it.d) / 2, H = it.h;
      cyl(g, 0, 2, 0, r - 5, 4, 0x9aa2a8, { rough: 0.5, seg: 32, open: true });
      lathe(g, 0, 4, 0, [[0, 0], [r - 4, 0], [r - 0.5, 3], [r, 6], [r, H - 12], [r - 0.6, H - 8], [r - 5, H - 5], [r - 12, H - 4], [0, H - 4]],
        STEEL, { metal: 0.35, rough: 0.45, seg: 48 });
      [-1, 1].forEach(function (s) {
        var x = s * (r - 11);
        cyl(g, x, H + 4, 0, 1.3, 8, 0xc6cccf, { metal: 0.85, rough: 0.25, seg: 14 });
        lathe(g, x, H + 1, 0, [[0, 0], [2.2, 0], [2.2, 1.6], [1.6, 2.4], [0, 2.4]], 0xb08d4a, { metal: 0.85, rough: 0.3, seg: 6 }); // union
        cyl(g, x, H + 5.5, 0, 1.45, 1.2, s < 0 ? 0x2f6fb5 : 0xc0392b, { rough: 0.5, seg: 14 });
      });
      // temperature & pressure relief valve on the side, discharge piped down
      cyl(g, r + 1.5, H - 22, 0, 1.5, 4, 0xb08d4a, { metal: 0.85, rough: 0.3, seg: 12, rz: Math.PI / 2 });
      box(g, r + 2.5, r + 5, H - 22, H - 18, -1.2, 1.2, 0xb08d4a, { metal: 0.85, rough: 0.3, radius: 0.4 });
      tube(g, [[r + 3.8, H - 23, 0], [r + 3.8, H - 30, 0], [r + 3.8, 18, 0]], 1, 0xc6cccf, { metal: 0.85, rough: 0.25, seg: 10 });
      box(g, -8, 8, 22, 42, r - 3, r + 1.2, 0x3d4348, { rough: 0.5, radius: 1 }); // thermostat cover
      box(g, -6, 6, H * 0.55, H * 0.55 + 10, r - 0.6, r + 0.2, 0xf2f2f0, { rough: 0.6, sharp: true, cast: false }); // rating plate
    },
  },
  printer: {
    label: "מדפסת",
    w: 45,
    d: 40,
    h: 26,
    col: "#3a3f44",
    build: function (g, it) {
      /* Inkjet all-in-one on a desk: a rounded body, a scanner lid with its
         seam, a tilted control panel with a small screen, a paper feed at the
         back with a stack in it, and a pulled-out output tray with a sheet. */
      var y0 = 76, hw = it.w / 2, hd = it.d / 2, top = y0 + it.h;
      box(g, -hw, hw, y0, top - 5, -hd, hd, 0x3a3f44, { rough: 0.5, radius: 1.8 });
      box(g, -hw + 0.4, hw - 0.4, top - 5, top, -hd + 0.4, hd - 0.4, 0x2a2d30, { rough: 0.45, radius: 1.6 }); // scanner lid
      box(g, -hw + 0.3, hw - 0.3, top - 5.3, top - 4.9, -hd + 0.3, hd - 0.3, 0x16181a, { sharp: true, cast: false }); // seam
      var panel = box(g, -hw + 4, -hw + 22, top - 9, top - 6.2, hd - 1, hd + 1.2, 0x2a2d30, { rough: 0.45, radius: 0.6 });
      if (panel) panel.rotation.x = -0.35;
      var lcd = box(g, -hw + 6, -hw + 14, top - 8.2, top - 6.6, hd + 1, hd + 1.35, 0x223344, { emis: 0x1a3048, rough: 0.1, sharp: true, cast: false });
      if (lcd) lcd.rotation.x = -0.35;
      box(g, -hw + 6, hw - 6, y0 + 4, y0 + 7, hd - 0.2, hd + 0.2, 0x16181a, { sharp: true, cast: false }); // output slot
      box(g, -hw + 7, hw - 7, y0 + 4.2, y0 + 5, hd, hd + 9, 0xd8d6d2, { rough: 0.6, radius: 0.3 }); // output tray
      box(g, -hw + 9.5, hw - 9.5, y0 + 5, y0 + 5.15, hd - 2, hd + 7, 0xfafaf8, { rough: 0.9, sharp: true, cast: false }); // printed sheet
      var feed = box(g, -hw + 8, hw - 8, top - 1, top + 12, -hd + 1, -hd + 2, 0xd8d6d2, { rough: 0.6, radius: 0.3 });
      if (feed) feed.rotation.x = -0.3;
      var paper = box(g, -hw + 9.5, hw - 9.5, top - 0.5, top + 11, -hd + 2.1, -hd + 2.8, 0xfafaf8, { rough: 0.9, sharp: true });
      if (paper) paper.rotation.x = -0.3;
    },
  },
  bidet: {
    label: "בידה",
    w: 38,
    d: 58,
    h: 42,
    col: "#eef0f2",
    build: function (g, it) {
      /* Bidet: the WC's companion — an egg bowl on a tapering foot with a
         rolled rim and a deck mixer at the back. */
      var hw = it.w / 2, hd = it.d / 2, top = it.h, bcz = 2, brx = hw - 1.5, brz = hd - 4;
      var foot = cyl(g, 0, (top - 14) / 2, bcz, 1, top - 14, 0xf2f4f6, { rough: 0.3, seg: 32, r2: 1.25 });
      if (foot) foot.scale.set(brx * 0.62, 1, brz * 0.6);
      var shell = cyl(g, 0, top - 7, bcz, 1, 14, 0xf0f2f4, { rough: 0.3, seg: 48, open: true, r2: 0.85 });
      if (shell) shell.scale.set(brx, 1, brz);
      var rim = cyl(g, 0, top - 0.8, bcz, 1, 1.6, 0xf6f8fa, { rough: 0.25, seg: 48, open: true });
      if (rim) rim.scale.set(brx, 1, brz);
      var bowl = sph(g, 0, top - 1, bcz, 1, 0xf6f8fa, { rough: 0.24, seg: 40, segV: 12, thetaLen: Math.PI / 2 });
      if (bowl) { bowl.rotation.x = Math.PI; bowl.scale.set(brx - 2.5, 12, brz - 2.5); }
      gooseneck(g, 0, top, -hd + 6, 12, 8, 0xc6cccf, 1.3);
    },
  },
  pedestalSink: {
    label: "כיור על רגל",
    w: 58,
    d: 46,
    h: 85,
    col: "#eef0f2",
    build: function (g, it) {
      /* Pedestal basin: an oval vitreous-china basin — a thin shell round a
         sunken bowl with a rolled rim and a chrome waste — on a waisted column. */
      var hw = it.w / 2, hd = it.d / 2, cer = 0xf2f4f6, top = it.h, bh = 17;
      cyl(g, 0, (top - bh) / 2, -2, 8.5, top - bh, cer, { rough: 0.3, seg: 28, r2: 11.5, metal: 0.02 });
      var foot = cyl(g, 0, 1.5, -2, 1, 3, cer, { rough: 0.3, seg: 32 });
      if (foot) foot.scale.set(14, 1, 11);
      [
        cyl(g, 0, top - bh / 2, 0, 1, bh, cer, { rough: 0.3, seg: 48, open: true, r2: 0.9 }),
        cyl(g, 0, top - bh + 1, 0, 0.9, 2, cer, { rough: 0.3, seg: 48 }),
        cyl(g, 0, top - 0.8, 0, 1, 1.6, 0xf6f8fa, { rough: 0.25, seg: 48, open: true }),
      ].forEach(function (m) { if (m) m.scale.set(hw, 1, hd); });
      var bowl = sph(g, 0, top - 1, 1, 1, 0xf6f8fa, { rough: 0.24, seg: 40, segV: 12, thetaLen: Math.PI / 2 });
      if (bowl) { bowl.rotation.x = Math.PI; bowl.scale.set(hw - 3.5, 13, hd - 5); }
      cyl(g, 0, top - 13.6, 1, 1.8, 0.4, 0xc6cccf, { metal: 0.9, rough: 0.2, seg: 16 });
      gooseneck(g, 0, top, -hd + 4, Math.max(12, hd - 4), 14, 0xc6cccf, 1.3);
    },
  },
  towelRail: {
    label: "מגבות מחומם",
    w: 60,
    d: 10,
    h: 90,
    col: "#c6cccf",
    build: function (g, it) {
      /* Heated towel ladder: one bent tube — up one side, bowed across the top,
         down the other — with straight bars between, wall stand-offs, valves and
         pipe tails at the foot, and a towel folded over a bar. */
      var y0 = 60, hw = it.w / 2, hd = it.d / 2, X = hw - 3, z = -hd + 4, C = 0xc6cccf,
        ch = { metal: 0.9, rough: 0.18 };
      tube(g, [[-X, y0, z], [-X, y0 + it.h - 7, z], [-X * 0.72, y0 + it.h - 1.5, z], [0, y0 + it.h - 0.8, z], [X * 0.72, y0 + it.h - 1.5, z], [X, y0 + it.h - 7, z], [X, y0, z]],
        1.5, C, Object.assign({ seg: 12, steps: 80 }, ch));
      [-1, 1].forEach(function (s) {
        sph(g, s * X, y0, z, 1.5, C, Object.assign({ seg: 12, segV: 8 }, ch));
        [y0 + 10, y0 + it.h - 14].forEach(function (y) {
          cyl(g, s * X, y, (-hd + z) / 2, 0.7, z + hd, C, Object.assign({ seg: 10, rx: Math.PI / 2 }, ch));
          cyl(g, s * X, y, -hd + 0.3, 1.8, 0.6, C, Object.assign({ seg: 16, rx: Math.PI / 2 }, ch));
        });
        lathe(g, s * X, y0 - 7, z, [[0, 0], [1.4, 0], [1.4, 2], [2, 2.6], [2, 5.5], [1.4, 6.2], [1.4, 7], [0, 7]], C, Object.assign({ seg: 16 }, ch)); // valve
        cyl(g, s * X, (y0 - 7) / 2, z, 0.8, y0 - 7, C, Object.assign({ seg: 10 }, ch)); // pipe tail
      });
      var bars = 7;
      for (var i = 0; i < bars; i++) {
        var y = y0 + 5 + (i * (it.h - 16)) / (bars - 1);
        cyl(g, 0, y, z, 1.1, 2 * X, C, Object.assign({ seg: 12, rz: Math.PI / 2 }, ch));
      }
      var ty = y0 + 5 + (2 * (it.h - 16)) / (bars - 1);
      box(g, -X + 6, X * 0.35, ty - 34, ty + 1.2, z - 2.6, z - 1, 0xe4dccb, { rough: 0.97, radius: 0.7 });
      box(g, -X + 6, X * 0.35, ty - 26, ty + 1.2, z + 1, z + 2.6, 0xe4dccb, { rough: 0.97, radius: 0.7 });
      cyl(g, (-X + 6 + X * 0.35) / 2, ty, z, 2.6, X * 0.35 + X - 6, 0xe4dccb, { rough: 0.97, seg: 14, rz: Math.PI / 2 });
    },
  },
  laundryBasket: {
    label: "סל כביסה",
    w: 42,
    d: 42,
    h: 58,
    col: "#b98a55",
    build: function (g, it) {
      /* Woven laundry basket: a gently flared open tub with woven bands, a
         rolled rim, two rope handles and linen spilling over the top. */
      var r = Math.min(it.w, it.d) / 2 - 1.5, H = it.h - 1.4;
      lathe(g, 0, 0, 0, [[r - 3.2, 0], [r - 2.6, 1.2], [r, H]], 0xb98a55, { rough: 0.88, seg: 36 });
      cyl(g, 0, 0.8, 0, r - 3, 1.6, 0xa87d4a, { rough: 0.85, seg: 32 });
      for (var i = 1; i < 7; i++) {
        var y = (i * H) / 7, rr = r - 2.6 + (2.6 * y) / H;
        torus(g, 0, y, 0, rr + 0.1, 0.45, 0xa87d4a, { rough: 0.85, seg: 36, segR: 4, cast: false });
      }
      torus(g, 0, H, 0, r, 1.3, 0xa87d4a, { rough: 0.8, seg: 40, segR: 8 });
      [-1, 1].forEach(function (s) {
        torus(g, s * (r - 0.4), H - 4, 0, 3.2, 0.55, 0xa87d4a, { rough: 0.85, seg: 16, segR: 5, arc: Math.PI, ry: s * Math.PI / 2, rx: -Math.PI / 2 });
      });
      box(g, -r + 5, r - 5, H - 9, H + 1.5, -r + 5, r - 5, 0xeae4d8, { rough: 0.96, radius: 3, crown: 2 });
      box(g, r - 8, r + 1.5, H - 14, H + 1.8, -5, 5, 0xd9cfbf, { rough: 0.97, radius: 0.8 });
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
      /* Candle chandelier: a ceiling cup and chain, a turned baluster column,
         six S-scroll arms bent from one tube each, bobeches with candle sleeves
         and flame bulbs, a crystal drop under every arm and a finial below. */
      var top = MOUNTH, r = it.w / 2 - 5, arms = 6, B = 0xb08d4a, gold = { metal: 0.85, rough: 0.28 }, i;
      lathe(g, 0, top - 4, 0, [[0, 0], [2, 0], [5.5, 3], [5.5, 4], [0, 4]], B, Object.assign({ seg: 28 }, gold));
      for (i = 0; i < 5; i++)
        torus(g, 0, top - 6 - i * 3.2, 0, 1.4, 0.35, B, Object.assign({ seg: 12, segR: 5, rz: Math.PI / 2, ry: i % 2 ? Math.PI / 2 : 0, cast: false }, gold));
      var cy0 = top - 44, colTop = top - 21;
      lathe(g, 0, cy0, 0, [[0, 0], [1, 0], [2.4, 2], [3.2, 5], [2, 8], [1.4, 11], [3.8, 14], [4.4, 16], [2.2, 19], [1.4, colTop - cy0 - 1], [2, colTop - cy0], [0, colTop - cy0]], B, Object.assign({ seg: 24 }, gold));
      var ay = cy0 + 15;
      for (i = 0; i < arms; i++) {
        var an = (i / arms) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
        tube(g, [[c * 3.5, ay, s * 3.5], [c * r * 0.35, ay - 5, s * r * 0.35], [c * r * 0.75, ay - 4, s * r * 0.75], [c * r, ay + 2, s * r], [c * r, ay + 6, s * r]], 0.8, B, Object.assign({ seg: 8, steps: 36 }, gold));
        var bx = c * r, bz = s * r, by = ay + 6;
        lathe(g, bx, by, bz, [[0, 0], [1, 0], [3.4, 1.2], [3.6, 1.8], [0, 1.2]], B, Object.assign({ seg: 20 }, gold)); // bobeche
        cyl(g, bx, by + 5, bz, 1.2, 7, 0xf6f0e2, { rough: 0.5, seg: 12 }); // candle sleeve
        var fl = sph(g, bx, by + 10, bz, 1.5, 0xfff3d0, { emis: 0xffe2a0, cast: false, seg: 12, segV: 10 });
        if (fl) fl.scale.y = 1.7;
        var dr = sph(g, bx, by - 4, bz, 1, 0xf4f8fb, { trans: true, opacity: 0.6, rough: 0.02, metal: 0.2, seg: 8, segV: 6, cast: false });
        if (dr) dr.scale.y = 1.8;
      }
      lathe(g, 0, cy0 - 5, 0, [[0, 0], [0.8, 1.5], [1.8, 3], [1.2, 5], [0, 5]], B, Object.assign({ seg: 16 }, gold)); // finial
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
      /* Steel column radiator: round twin columns per section between rounded
         top and bottom headers, on wall brackets, with a thermostatic valve and a
         lockshield on the pipe tails. */
      var y0 = 18, hw = it.w / 2, hd = it.d / 2, B = 0xeef1f2, C = 0xe4e7e9, n = Math.max(5, Math.round(it.w / 5.5)), i;
      box(g, -hw, hw, y0, y0 + 4, -hd + 1, hd - 1, B, { rough: 0.4, radius: 1.5 });
      box(g, -hw, hw, y0 + it.h - 4, y0 + it.h, -hd + 1, hd - 1, B, { rough: 0.4, radius: 1.5 });
      for (i = 0; i < n; i++) {
        var x = -hw + ((i + 0.5) * it.w) / n;
        [-1, 1].forEach(function (s) {
          cyl(g, x, y0 + it.h / 2, s * (hd / 2 - 0.4), 1.25, it.h - 6, C, { rough: 0.45, seg: 10 });
        });
      }
      [-1, 1].forEach(function (s) {
        box(g, s * (hw - 8) - 1.5, s * (hw - 8) + 1.5, y0 + it.h - 12, y0 + it.h - 8, -hd - 1.5, -hd + 1, 0xd0d4d6, { rough: 0.5, radius: 0.4 }); // bracket
        var vx = s * (hw + 3.5);
        cyl(g, s * (hw + 1.5), y0 + 2, 0, 1, 4, 0xc9ced1, { metal: 0.8, rough: 0.25, seg: 12, rz: Math.PI / 2 });
        lathe(g, vx, y0 - 6, 0, [[0, 0], [1.5, 0], [1.5, 5], [2, 6], [2, 8], [0, 8]], 0xc9ced1, { metal: 0.8, rough: 0.25, seg: 16 }); // valve body
        cyl(g, vx, (y0 - 6) / 2, 0, 0.8, y0 - 6, 0xc9ced1, { metal: 0.8, rough: 0.25, seg: 10 }); // pipe tail
      });
      lathe(g, hw + 3.5, y0 + 2, 0, [[0, 0], [2.4, 0], [2.6, 6], [2.2, 8], [0, 8.4]], 0xf2f2f0, { rough: 0.4, seg: 24 }); // thermostatic head
      cyl(g, -hw - 3.5, y0 + 3, 0, 1.6, 2.4, 0xc9ced1, { metal: 0.8, rough: 0.3, seg: 6 }); // lockshield cap
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
      /* Wall sconce: a round back plate, a bent arm reaching out and up, and a
         tapered shade with wire rims round a warm bulb. */
      var y0 = 166, hd = it.d / 2, W = it.w, sz = -hd + 11;
      cyl(g, 0, y0 + 6, -hd + 0.8, 4.4, 1.6, 0x42474a, { rough: 0.45, metal: 0.4, seg: 28, rx: Math.PI / 2 });
      tube(g, [[0, y0 + 6, -hd + 1.6], [0, y0 + 6, -hd + 6], [0, y0 + 7.5, sz - 1], [0, y0 + 10, sz]], 0.9, 0x6e7478, { metal: 0.55, rough: 0.35, seg: 10 });
      cyl(g, 0, y0 + 11, sz, 1.4, 2.4, 0x6e7478, { metal: 0.55, rough: 0.35, seg: 14 });
      lathe(g, 0, y0 + 4, sz, [[W * 0.5, 0], [W * 0.34, 13]], 0xe9dcc1, { rough: 0.65, trans: true, opacity: 0.92, seg: 36 });
      torus(g, 0, y0 + 4, sz, W * 0.5, 0.22, 0x6e7478, { metal: 0.6, rough: 0.35, seg: 36, segR: 4 });
      torus(g, 0, y0 + 17, sz, W * 0.34, 0.22, 0x6e7478, { metal: 0.6, rough: 0.35, seg: 36, segR: 4 });
      sph(g, 0, y0 + 10, sz, 3, 0xfff2cc, { emis: 0xffe2a0, cast: false, seg: 16, segV: 12 });
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
      /* Track lighting: a three-circuit rail with end caps and a live feed,
         three adaptors each carrying a cylindrical spot on a stem, tilted to
         wash the room, with a glowing lens. */
      var top = MOUNTH, hw = it.w / 2, heads = 3, a = 0.35;
      box(g, -hw, hw, top - 3.4, top, -1.8, 1.8, 0x42474a, { rough: 0.45, metal: 0.4, radius: 0.5 });
      box(g, -hw + 0.6, hw - 0.6, top - 3.5, top - 3.3, -0.6, 0.6, 0x16181a, { sharp: true, cast: false });
      [-1, 1].forEach(function (s) {
        box(g, s * hw - (s > 0 ? 1 : 0), s * hw + (s < 0 ? 1 : 0), top - 3.6, top, -2, 2, 0x2b2f33, { rough: 0.5, radius: 0.4 });
      });
      box(g, -hw + 1, -hw + 7, top - 4.5, top, -2.4, 2.4, 0x2b2f33, { rough: 0.5, radius: 0.6 }); // feed
      for (var i = 0; i < heads; i++) {
        var hx = -hw + ((i + 0.5) * it.w) / heads;
        box(g, hx - 2.4, hx + 2.4, top - 6, top - 3.4, -1.6, 1.6, 0x42474a, { rough: 0.45, metal: 0.4, radius: 0.5 }); // adaptor
        cyl(g, hx, top - 7.6, 0, 0.8, 3.2, 0x6e7478, { metal: 0.6, rough: 0.35, seg: 12 });
        var py = top - 9.2;
        lathe(g, hx, py, 0, [[0, 0], [2.4, 0], [3, -1], [3, -8], [3.3, -8.6], [2.6, -9], [0, -9]], 0x42474a, { metal: 0.5, rough: 0.4, seg: 24, rx: a });
        cyl(g, hx, py - 8.9 * Math.cos(a), -8.9 * Math.sin(a), 2.5, 0.3, 0xfff2cc, { emis: 0xffe2a0, cast: false, seg: 20, rx: a });
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
      /* Ceiling fan: a canopy and downrod, a turned motor housing, four pitched
         blades each on a steel iron, and an opal light kit underneath. */
      var top = MOUNTH, r = it.w / 2, blades = 4, hy = top - 21, rin = 10, L = r - 2 - rin;
      lathe(g, 0, top - 6, 0, [[0, 0], [2.6, 0], [4.2, 4], [4.8, 6], [0, 6]], 0x42474a, { metal: 0.5, rough: 0.4, seg: 28 });
      cyl(g, 0, top - 11.5, 0, 1.1, 11, 0x42474a, { metal: 0.5, rough: 0.4, seg: 12 });
      lathe(g, 0, hy - 4.5, 0, [[0, 0], [6, 0], [8.6, 1.4], [9.4, 3.6], [9, 6.4], [6, 8.6], [2, 9.4], [0, 9.4]], 0x6e7478, { metal: 0.5, rough: 0.4, seg: 36 });
      for (var i = 0; i < blades; i++) {
        var an = (i / blades) * Math.PI * 2 + Math.PI / 4, c = Math.cos(an), s = Math.sin(an);
        var iron = box(g, -5, 5, -0.5, 0.5, -1.6, 1.6, 0x42474a, { metal: 0.6, rough: 0.35, radius: 0.4 });
        if (iron) {
          iron.position.set(c * (rin + 2), hy - 1.5, s * (rin + 2));
          iron.rotation.order = "YXZ";
          iron.rotation.set(0.12, -an, 0);
        }
        var bl = box(g, -L / 2, L / 2, -0.45, 0.45, -6.5, 6.5, WOOD, { rough: 0.5, radius: 0.4 });
        if (bl) {
          bl.position.set(c * (rin + L / 2), hy - 1.5, s * (rin + L / 2));
          bl.rotation.order = "YXZ";
          bl.rotation.set(0.14, -an, 0);
        }
      }
      lathe(g, 0, top - 30, 0, [[6.5, 4.6], [6.2, 2.4], [4.6, 0.6], [2, 0], [0, 0]], 0xf2eee4, { rough: 0.35, trans: true, opacity: 0.93, seg: 32 });
      cyl(g, 0, top - 25.2, 0, 6.8, 0.8, 0x6e7478, { metal: 0.5, rough: 0.4, seg: 32 });
      sph(g, 0, top - 28, 0, 3.2, 0xfff2cc, { emis: 0xffe2a0, cast: false, seg: 16, segV: 12 });
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
      /* Four-way cassette: the body up in the void, a flush fascia with rounded
         edges, a grilled return in the centre and four louvres angled down. */
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 246,
        hw = it.w / 2,
        hd = it.d / 2, i;
      box(g, -hw + 4, hw - 4, y0 + 4, y0 + it.h, -hd + 4, hd - 4, STEEL, { metal: 0.3, rough: 0.55, sharp: true }); // body in the void
      box(g, -hw, hw, y0, y0 + 4, -hd, hd, 0xf2f4f5, { rough: 0.4, radius: 1.2 }); // fascia
      box(g, -hw * 0.42, hw * 0.42, y0 - 0.3, y0 + 1, -hd * 0.42, hd * 0.42, 0xe4e8ea, { rough: 0.5, radius: 0.5 }); // return grille
      for (i = 0; i < 9; i++) {
        var gx = -hw * 0.38 + (i * hw * 0.76) / 8;
        box(g, gx - 0.3, gx + 0.3, y0 - 0.5, y0 - 0.2, -hd * 0.38, hd * 0.38, 0xc9ced2, { sharp: true, cast: false });
      }
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
        var lx = d[0] ? d[0] * (hw - 6) : 0, lz = d[1] ? d[1] * (hd - 6) : 0,
          ax = d[0] ? 2.2 : hw - 9, az = d[1] ? 2.2 : hd - 9;
        box(g, lx - ax - 0.8, lx + ax + 0.8, y0 - 0.1, y0 + 0.2, lz - az - 0.8, lz + az + 0.8, 0x2f353a, { sharp: true, cast: false }); // slot
        var lv = box(g, lx - ax, lx + ax, y0 - 0.9, y0 - 0.3, lz - az, lz + az, 0xdadfe2, { rough: 0.45, radius: 0.25 });
        if (lv) {
          lv.rotation.x = d[1] * 0.35;
          lv.rotation.z = -d[0] * 0.35;
        }
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
      /* Condensing unit: a rounded steel case on feet (or a wall bracket), a
         round fan guard of concentric rings and spokes over the fan, a finned
         coil showing down the side, and the service valve cover. */
      var V = vspec(it),
        y0 = V.mountY != null ? V.mountY : 0, // on the floor, or bracketed on a wall
        hw = it.w / 2,
        hd = it.d / 2,
        B = 0xd9dde0, i;
      if (y0 > 0) {
        [-1, 1].forEach(function (s) {
          box(g, s * (hw - 10) - 2, s * (hw - 10) + 2, y0 - 14, y0, -hd, hd - 2, 0x6f767a, { metal: 0.5, rough: 0.5, radius: 0.4 });
          box(g, s * (hw - 10) - 2, s * (hw - 10) + 2, y0 - 14, y0 - 2, -hd, -hd + 2, 0x6f767a, { metal: 0.5, rough: 0.5, radius: 0.4 });
        });
      } else {
        [-1, 1].forEach(function (s) {
          box(g, s * (hw - 12) - 4, s * (hw - 12) + 4, 0, 6, -hd + 2, hd - 2, 0x5f666a, { metal: 0.4, rough: 0.6, radius: 0.8 });
        });
        y0 = 6;
      }
      box(g, -hw, hw, y0, y0 + it.h, -hd, hd, B, { metal: 0.25, rough: 0.55, radius: 1.6 });
      var fx = -hw * 0.22, cy = y0 + it.h * 0.5, R = Math.min(it.h * 0.4, hw * 0.6);
      cyl(g, fx, cy, hd - 0.6, R, 1.4, 0x2a2f33, { rough: 0.7, seg: 36, rx: Math.PI / 2 }); // fan well
      lathe(g, fx, cy, hd - 1.5, [[R * 0.22, 0], [R * 0.1, 2], [0, 2]], 0x3a4045, { rough: 0.5, seg: 20, rx: Math.PI / 2 }); // hub
      for (i = 0; i < 3; i++) {
        var bl = box(g, -R * 0.42, R * 0.42, -R * 0.12, R * 0.12, -0.3, 0.3, 0x5a6064, { rough: 0.5, radius: 0.2, cast: false });
        if (bl) {
          var an = (i / 3) * Math.PI * 2;
          bl.position.set(fx + Math.cos(an) * R * 0.5, cy + Math.sin(an) * R * 0.5, hd - 1);
          bl.rotation.z = an;
          bl.rotation.x = 0.3;
        }
      }
      for (i = 1; i <= 5; i++)
        torus(g, fx, cy, hd + 0.3, (R * i) / 5, 0.28, 0x7a8286, { metal: 0.5, rough: 0.4, seg: 40, segR: 4, rx: -Math.PI / 2, cast: false });
      for (i = 0; i < 4; i++) {
        var sp = box(g, -R, R, -0.25, 0.25, -0.25, 0.25, 0x7a8286, { metal: 0.5, rough: 0.4, sharp: true, cast: false });
        if (sp) {
          sp.position.set(fx, cy, hd + 0.3);
          sp.rotation.z = (i * Math.PI) / 4;
        }
      }
      // finned coil down the side, service valve cover at the other end
      for (i = 0; i < 14; i++) {
        var zz = -hd + 2 + (i * (it.d - 4)) / 13;
        box(g, -hw - 0.3, -hw + 0.2, y0 + 4, y0 + it.h - 4, zz - 0.2, zz + 0.2, 0x9aa1a6, { metal: 0.5, rough: 0.4, sharp: true, cast: false });
      }
      box(g, hw * 0.55, hw - 2, y0 + 6, y0 + it.h * 0.45, hd - 0.2, hd + 0.8, B, { metal: 0.25, rough: 0.5, radius: 0.6 });
      [-1, 1].forEach(function (s) {
        cyl(g, hw + 1.6, y0 + 12 + (s > 0 ? 8 : 0), hd - 8, 1.4, 4, 0xb08d4a, { metal: 0.8, rough: 0.3, seg: 10, rz: Math.PI / 2 });
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
      box(g, -hw - 0.5, hw + 0.5, 0, 1.4, -hd - 0.5, hd + 0.5, 0xdbe0e6, { rough: 0.5, radius: 0.6 }); // mounting plate
      box(g, -hw, hw, 1.2, it.h, -hd, hd, 0xf0f4f8, { rough: 0.35, radius: Math.min(2.5, hw - 0.5) }); // body
      var lens = sph(g, 0, it.h * 0.52, hd - 0.4, hw * 0.62, 0xe2e8f0, { rough: 0.25, seg: 20, segV: 10, thetaLen: Math.PI / 2 }); // Fresnel dome
      if (lens) { lens.rotation.x = Math.PI / 2; lens.scale.y = 0.55; }
      sph(g, 0, it.h - 2.8, hd + 0.1, 0.7, on ? 0x10b981 : 0x64748b, on ? { emis: 0x10b981, cast: false } : { cast: false });
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
      box(g, -hw, -hw + 8, 0, it.h, -hd, hd, 0xf8fafc, { rough: 0.3, radius: 1.6 }); // transmitter
      box(g, -hw + 2.5, -hw + 5.5, it.h - 4.6, it.h - 4.4, hd - 0.1, hd + 0.05, 0xd8dde3, { sharp: true, cast: false }); // seam
      sph(g, -hw + 4, it.h - 3, hd, 0.6, open ? 0xef4444 : 0x10b981, { emis: open ? 0xef4444 : 0x10b981, cast: false });
      var magOffset = open ? 4 : 1.5;
      box(g, -hw + 8 + magOffset, hw, 0, it.h * 0.75, -hd * 0.8, hd * 0.8, 0xf1f5f9, { rough: 0.35, radius: 1.2 }); // magnet
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
      box(g, -hw, hw, 0, it.h, -hd, hd, 0xf8fafc, { rough: 0.3, radius: 2 });
      box(g, -hw + 1.8, hw - 1.8, 2.5, it.h - 2.5, hd - 0.2, hd + 0.3, 0x1e293b, { rough: 0.15, metal: 0.2, radius: 0.5 });
      box(g, -hw + 2.5, hw - 2.5, 3.2, it.h - 3.2, hd + 0.3, hd + 0.4, 0x38bdf8, { rough: 0.1, emis: 0x1c6f96, sharp: true, cast: false });
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
      lathe(g, 0, 0, 0, [[0, 0], [r, 0], [r, it.h * 0.45], [r * 0.9, it.h * 0.8], [r * 0.55, it.h], [0, it.h]], 0xf8fafc, { rough: 0.3, seg: 40 });
      // the smoke chamber's intake slots round the skirt
      for (var i = 0; i < 24; i++) {
        var an = (i / 24) * Math.PI * 2, v = box(g, -0.15, 0.15, it.h * 0.12, it.h * 0.34, -0.45, 0.45, 0x475569, { rough: 0.6, sharp: true, cast: false });
        if (v) {
          v.position.set(Math.cos(an) * (r - 0.1), it.h * 0.25, Math.sin(an) * (r - 0.1));
          v.rotation.y = -an;
        }
      }
      cyl(g, 0, it.h + 0.3, 0, r * 0.32, 0.6, 0xe2e8f0, { rough: 0.4, seg: 24 });
      sph(g, r * 0.5, it.h * 0.86, 0, 0.7, alert ? 0xef4444 : 0x22c55e, { emis: alert ? 0xef4444 : 0x22c55e, cast: false });
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
      box(g, -hw, hw, 0, it.h, -hd, hd, 0x1e293b, { metal: 0.6, rough: 0.3, radius: 1.6 }); // escutcheon
      box(g, -hw + 1.5, hw - 1.5, it.h * 0.48, it.h - 2, hd - 0.2, hd + 0.4, 0x0f172a, { rough: 0.1, metal: 0.4, radius: 0.6 }); // keypad glass
      for (var r = 0; r < 4; r++)
        for (var c = 0; c < 3; c++)
          cyl(g, -3 + c * 3, it.h * 0.52 + r * 2.8, hd + 0.45, 0.45, 0.1, 0x94a3b8, { emis: 0x334155, seg: 10, rx: Math.PI / 2, cast: false });
      torus(g, 0, it.h * 0.36, hd + 0.2, 2.2, 0.3, locked ? 0xef4444 : 0x10b981, { emis: locked ? 0xef4444 : 0x10b981, seg: 24, segR: 5, rx: -Math.PI / 2, cast: false });
      // lever handle: a rose, a neck out of the door, and the grip returning toward it
      cyl(g, 0, it.h * 0.18, hd + 0.4, 2.4, 0.8, 0x475569, { metal: 0.8, rough: 0.2, seg: 20, rx: Math.PI / 2 });
      tube(g, [[0, it.h * 0.18, hd + 0.8], [0, it.h * 0.18, hd + 4.5], [3, it.h * 0.18, hd + 5.5], [hw + 9, it.h * 0.18, hd + 5.2]], 1, 0x475569, { metal: 0.8, rough: 0.2, seg: 10 });
    },
  },
  vacuum: {
    label: "שואב אבק רובוטי",
    w: 36,
    d: 38,
    h: 12,
    col: "#1e293b",
    build: function (g, it) {
      var active = it.smart && (it.smart.on || it.smart.status === "cleaning");
      var r = Math.min(16, it.w / 2 - 2), cz = 1.5;
      // charging dock behind the robot
      box(g, -12, 12, 0, 10, -it.d / 2, -it.d / 2 + 4, 0x334155, { rough: 0.4, radius: 1.5 });
      box(g, -10, 10, 0, 0.8, -it.d / 2 + 4, -it.d / 2 + 9, 0x1e293b, { rough: 0.5, radius: 0.3 });
      [-1, 1].forEach(function (s) {
        box(g, s * 4 - 1.2, s * 4 + 1.2, 1, 2.6, -it.d / 2 + 4, -it.d / 2 + 4.5, 0xc9ced1, { metal: 0.8, rough: 0.3, sharp: true });
      });
      // body: a bevelled puck, a bumper band, a lidar turret and a button
      lathe(g, 0, 0.8, cz, [[0, 0], [r - 1.5, 0], [r, 1.5], [r, 6], [r - 1.5, 7.2], [0, 7.2]], 0x1e293b, { metal: 0.3, rough: 0.35, seg: 48 });
      cyl(g, 0, 3.8, cz, r + 0.3, 4, 0x0f172a, { metal: 0.2, rough: 0.55, seg: 48, open: true });
      lathe(g, 0, 8, cz - 3, [[0, 0], [4.4, 0], [4.6, 2.6], [4, 3.2], [0, 3.2]], 0x334155, { metal: 0.4, rough: 0.3, seg: 28 });
      torus(g, 0, 8.05, cz + 7, 2, 0.35, active ? 0x06b6d4 : 0x64748b, { emis: active ? 0x06b6d4 : null, seg: 20, segR: 5, cast: false });
      cyl(g, 0, 8, cz + 7, 1.6, 0.4, 0x0f172a, { rough: 0.4, seg: 18 });
      // side brush
      for (var k = 0; k < 3; k++) {
        var an = (k / 3) * Math.PI * 2;
        tube(g, [[-r * 0.6, 0.5, cz + r * 0.6], [-r * 0.6 + Math.cos(an) * 5, 0.3, cz + r * 0.6 + Math.sin(an) * 5]], 0.25, 0x64748b, { seg: 5, cast: false });
      }
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
      box(g, -hw, hw, 0, it.h, -hd, hd, 0xf8fafc, { rough: 0.35, radius: 2.2 });
      lathe(g, 0, it.h * 0.52, hd - 0.2, [[hw * 0.72, 0], [hw * 0.66, 0.8], [0, 0.8]], 0xe2e8f0, { rough: 0.4, seg: 32, rx: Math.PI / 2 }); // socket dish
      [-2.2, 2.2].forEach(function (px) {
        cyl(g, px, it.h * 0.52, hd + 0.5, 0.7, 0.4, 0x1e293b, { seg: 12, rx: Math.PI / 2, cast: false });
      });
      box(g, -1.8, 1.8, it.h - 2.4, it.h - 0.8, hd - 0.2, hd + 0.4, on ? 0x10b981 : 0x94a3b8, { radius: 0.4, emis: on ? 0x10b981 : null, cast: false });
    },
  },
});


// ================= OUTDOOR =================
// The pieces a presentation plan dresses the site with: a car on the drive,
// garden trees and hedges, a patio set. Same conventions as above (front +z).
var CAR_BODY = 0x2f3b45, TYRE = 0x1c1e20, FOLIAGE = GREEN, BARK = 0x5a4432;
Object.assign(FURN, {
  car: {
    label: "רכב",
    w: 185,
    d: 460,
    h: 145,
    col: "#2f3b45",
    build: function (g, it) {
      /* Saloon car, nose toward +z. The lower body is split round the wheels —
         a waist-high shell over sills and bumpers — so the tyres and alloy rims
         sit visibly in their arches; a tapering glasshouse under a
         body-coloured roof; lamps front and rear; mirrors. */
      var hw = it.w / 2, hd = it.d / 2, wr = Math.min(33, it.h * 0.23), wz = hd - Math.min(78, it.d * 0.18),
        paint = { metal: 0.6, rough: 0.22 }, beltY = it.h * 0.55, shellY = wr * 1.25;
      box(g, -hw, hw, shellY, beltY, -hd, hd, CAR_BODY, Object.assign({ radius: 11 }, paint)); // shell
      box(g, -hw + 1, hw - 1, 16, shellY + 4, -wz + wr + 5, wz - wr - 5, CAR_BODY, Object.assign({ radius: 5 }, paint)); // sills
      box(g, -hw + 2, hw - 2, 16, shellY + 4, wz + wr + 4, hd, CAR_BODY, Object.assign({ radius: 8 }, paint)); // front bumper
      box(g, -hw + 2, hw - 2, 16, shellY + 4, -hd, -wz - wr - 4, CAR_BODY, Object.assign({ radius: 8 }, paint)); // rear bumper
      box(g, -hw + 24, hw - 24, 14, shellY, -hd + 20, hd - 20, 0x15181a, { rough: 0.9, sharp: true }); // floor pan
      var c0 = -hd + it.d * 0.2, c1 = hd - it.d * 0.34, gy1 = it.h - 4;
      box(g, -hw + 8, hw - 8, beltY - 1, gy1, c0, c1, 0x1c2a33, { metal: 0.6, rough: 0.05, taper: { x: 0.86, z: 0.62 } });
      box(g, -(hw - 8) * 0.84, (hw - 8) * 0.84, gy1, it.h, c0 + (c1 - c0) * 0.2, c1 - (c1 - c0) * 0.2, CAR_BODY, Object.assign({ radius: 2.5 }, paint)); // roof
      [-1, 1].forEach(function (sx) {
        [-1, 1].forEach(function (sz) {
          var x = sx * (hw - 12), z = sz * wz;
          cyl(g, x, wr, z, wr, 21, TYRE, { rough: 0.85, seg: 28, rz: Math.PI / 2 });
          cyl(g, x + sx * 10.7, wr, z, wr * 0.64, 0.8, 0xc0c6ca, { metal: 0.9, rough: 0.2, seg: 24, rz: Math.PI / 2 });
          cyl(g, x + sx * 11.2, wr, z, wr * 0.16, 0.8, 0x8a9296, { metal: 0.9, rough: 0.2, seg: 16, rz: Math.PI / 2 });
          for (var k = 0; k < 5; k++) {
            var sp = box(g, x + sx * 11 - 0.4, x + sx * 11 + 0.4, wr - 1.2, wr + 1.2, z - wr * 0.6, z + wr * 0.6, 0xd6dbde, { metal: 0.9, rough: 0.2, sharp: true });
            if (sp) sp.rotation.x = (k * Math.PI) / 5;
          }
        });
        box(g, sx * (hw - 18) - 11, sx * (hw - 18) + 11, it.h * 0.4, it.h * 0.47, hd - 1.5, hd + 0.5, 0xeef4f8, { emis: 0xdfefff, cast: false, radius: 1 }); // headlamp
        box(g, sx * (hw - 16) - 13, sx * (hw - 16) + 13, it.h * 0.42, it.h * 0.49, -hd - 0.5, -hd + 1.5, 0x8a1b1b, { emis: 0x6a1010, cast: false, radius: 1 }); // tail lamp
        box(g, sx * (hw + 2) - 4, sx * (hw + 2) + 4, beltY + 2, beltY + 9, c1 - 18, c1 - 8, CAR_BODY, Object.assign({ radius: 1.5 }, paint)); // mirror
        box(g, sx * hw - 0.4, sx * hw + 0.4, shellY + 4, beltY - 3, 5, 6, 0x15181a, { sharp: true }); // door shut line
        box(g, sx * hw - 0.8, sx * hw + 0.8, beltY - 12, beltY - 10, 14, 26, 0x9aa2a8, { metal: 0.85, rough: 0.25, sharp: true }); // handle
      });
      box(g, -32, 32, it.h * 0.26, it.h * 0.37, hd - 1, hd + 0.8, 0x15181a, { rough: 0.5, radius: 1.2 }); // grille
      box(g, -26, 26, it.h * 0.24, it.h * 0.31, -hd - 0.8, -hd + 0.5, 0xf2f2ee, { rough: 0.5, sharp: true }); // plate
    },
  },
  tree: {
    label: "עץ",
    w: 320,
    d: 320,
    h: 520,
    col: "#5b7a3c",
    build: function (g, it) {
      /* Garden tree: a tapering trunk forking into three limbs under a crown
         of overlapping leaf masses (foliage texture), lighter at the top. */
      var R = Math.min(it.w, it.d) / 2, trunkH = it.h * 0.42;
      cyl(g, 0, trunkH / 2, 0, 9, trunkH, BARK, { rough: 0.95, seg: 14, r2: 7 });
      [[0.9, 0.3], [-0.7, 0.5], [0.1, -0.8]].forEach(function (d) {
        var b = cyl(g, d[0] * 22, trunkH + 30, d[1] * 22, 4.5, 80, BARK, { rough: 0.95, seg: 10, r2: 3 });
        if (b) { b.rotation.z = -d[0] * 0.5; b.rotation.x = d[1] * 0.5; }
      });
      [[0, 0.78, 0, 0.62], [0.42, 0.66, 0.2, 0.46], [-0.45, 0.68, 0.1, 0.44], [0.1, 0.7, -0.45, 0.46],
        [-0.15, 0.62, 0.42, 0.4], [0.3, 0.86, -0.1, 0.38], [-0.28, 0.9, -0.2, 0.34], [0.05, 0.98, 0.1, 0.3]].forEach(function (c) {
        sph(g, c[0] * R, c[1] * it.h, c[2] * R, c[3] * R, FOLIAGE, { rough: 0.95, seg: 20, segV: 14 });
      });
    },
  },
  hedge: {
    label: "גדר חיה",
    w: 200,
    d: 60,
    h: 110,
    col: "#4d6b33",
    build: function (g, it) {
      /* Clipped hedge: a squared mass with softly rounded shoulders and a
         lumpy, leafy top. */
      var hw = it.w / 2, hd = it.d / 2;
      box(g, -hw, hw, 0, it.h - 8, -hd, hd, FOLIAGE, { rough: 0.95, radius: 8, crown: 3 });
      var n = Math.max(2, Math.round(it.w / 30));
      for (var i = 0; i < n; i++) {
        var x = -hw + ((i + 0.5) * it.w) / n;
        sph(g, x, it.h - 14, (i % 2 ? 1 : -1) * hd * 0.2, Math.min(hd, it.w / n) * 0.75, FOLIAGE, { rough: 0.95, seg: 14, segV: 10 });
      }
    },
  },
  patioSet: {
    label: "פינת ישיבה בחצר",
    w: 220,
    d: 220,
    h: 240,
    col: "#8a857c",
    build: function (g, it) {
      /* Patio set: a round slatted table under a parasol, four chairs. */
      var r = 50, frame = { metal: 0.7, rough: 0.35, seg: 12 };
      cyl(g, 0, 73, 0, r, 3, WOOD, { rough: 0.6, seg: 40 });
      cyl(g, 0, 36, 0, 2.2, 72, 0x2e3134, frame);
      cyl(g, 0, 1.5, 0, 26, 3, 0x2e3134, { metal: 0.7, rough: 0.35, seg: 32 });
      cyl(g, 0, it.h / 2, 0, 1.6, it.h - 10, 0xeae4d8, { rough: 0.5, seg: 10 }); // parasol pole
      var can = cyl(g, 0, it.h - 18, 0, Math.min(it.w, it.d) / 2 - 8, 22, 0xeae4d8, { rough: 0.9, seg: 8, r2: 3 });
      for (var k = 0; k < 4; k++) {
        var a = (k * Math.PI) / 2, cx = Math.sin(a) * (r + 30), cz = Math.cos(a) * (r + 30), ch = new g.constructor();
        ch.position.set(cx, 0, cz);
        ch.rotation.y = a + Math.PI;
        g.add(ch);
        box(ch, -22, 22, 42, 46, -20, 20, 0x2e3134, { metal: 0.6, rough: 0.4, radius: 1 });
        box(ch, -20, 20, 46, 51, -18, 18, FABRIC, { rough: 0.95, radius: 2.5, crown: 1 });
        box(ch, -22, 22, 46, 88, -22, -19, 0x2e3134, { metal: 0.6, rough: 0.4, radius: 1 });
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { cyl(ch, p[0] * 19, 21, p[1] * 17, 1.2, 42, 0x2e3134, frame); });
      }
    },
  },
});
