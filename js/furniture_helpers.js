// Shared procedural-shape helpers used by furniture model builders.
import { HANDLE, FABRIC, WOOD } from "./state.js";
import { box, cyl, sph } from "./primitives.js";

export function handleBar(g, it) {
  box(g, -7, 7, it.h - 18, it.h - 14, it.d / 2 - 2, it.d / 2 - 0.4, HANDLE, {
    metal: 0.8,
    rough: 0.3,
  });
}
/* ---- shared shape helpers ---- */

// Sofa / armchair carcass. Shared so both get the same variant vocabulary:
//   arms: block | low | roll | wing | none      legs: plinth | wood | taper | metal
//   seats: number of seat cushions   tufted: buttoned back   chaise: 'l'|'r' return
export function upholstered(g, it, V, armW) {
  var arms = V.arms || "block",
    aw = arms === "none" ? 0 : V.armW != null ? V.armW : armW,
    hw = it.w / 2,
    hd = it.d / 2,
    legH = V.legH != null ? V.legH : 8,
    seatT = legH + 26,
    backZ = -hd + (V.backT || 18),
    cushCol = V.cushCol != null ? V.cushCol : 0xb4bdbd,
    soft = { rough: 0.95 };
  box(g, -hw, hw, legH, seatT, -hd, hd, FABRIC, soft); // seat base
  // one cushion per seat so a 3-seater reads as a 3-seater
  var n = V.seats || Math.max(1, Math.round((it.w - 2 * aw) / 70)),
    c0 = -hw + aw + 2,
    cw = (hw - aw - 2 - c0) / n;
  for (var i = 0; i < n; i++)
    box(g, c0 + i * cw + 1, c0 + (i + 1) * cw - 1, seatT, seatT + 6, backZ + 2, hd - 2, cushCol, soft);
  box(g, -hw, hw, seatT, it.h, -hd, backZ, FABRIC, soft); // back
  // back cushions, or buttoned tufting for the classic look
  if (V.tufted) {
    for (var r = 0; r < 2; r++)
      for (var c = 0; c < Math.max(2, Math.round(it.w / 45)); c++) {
        var bx = -hw + aw + 6 + ((it.w - 2 * (aw + 6)) * (c + 0.5)) / Math.max(2, Math.round(it.w / 45));
        sph(g, bx, seatT + 12 + r * 16, backZ + 0.6, 1.5, FABRIC, { rough: 0.6 });
      }
  } else if (arms !== "none") {
    for (var k = 0; k < n; k++)
      box(g, c0 + k * cw + 2, c0 + (k + 1) * cw - 2, seatT + 4, it.h - 4, backZ, backZ + 7, cushCol, soft);
  }
  // arms
  var armH = V.armH != null ? V.armH : arms === "low" ? seatT + 12 : 54;
  if (aw) {
    [-1, 1].forEach(function (s) {
      var ax0 = s < 0 ? -hw : hw - aw,
        ax1 = s < 0 ? -hw + aw : hw;
      box(g, ax0, ax1, legH, armH, -hd, hd, FABRIC, soft);
      if (arms === "roll") // rolled bolster along the top of the arm
        cyl(g, (ax0 + ax1) / 2, armH, 0, aw / 2, it.d - 2, FABRIC, {
          rough: 0.95, seg: 14, rx: Math.PI / 2,
        });
      if (arms === "wing") // wing back panel rising off the arm
        box(g, ax0, ax1, armH, it.h + 12, -hd, backZ + 10, FABRIC, soft);
    });
  }
  if (V.chaise) {
    // long return on one side — turns the sofa into a sectional
    var s2 = V.chaise === "l" ? -1 : 1,
      cd = V.chaiseD || it.d * 0.85,
      z1 = hd + cd,
      cx0 = s2 < 0 ? -hw : hw - it.d,
      cx1 = s2 < 0 ? -hw + it.d : hw;
    box(g, cx0, cx1, legH, seatT, hd, z1, FABRIC, soft);
    box(g, cx0 + 1, cx1 - 1, seatT, seatT + 6, hd, z1 - 2, cushCol, soft);
    box(g, s2 < 0 ? cx0 : cx1 - aw, s2 < 0 ? cx0 + aw : cx1, legH, armH, hd, z1, FABRIC, soft);
    legsUnder(g, { w: cx1 - cx0, d: cd }, V.legs, legH, 6, V.legCol, (cx0 + cx1) / 2, hd + cd / 2);
  }
  legsUnder(g, it, V.legs, legH, 6, V.legCol);
}

// What a seat / table / case stands on. `kind`: plinth (recessed base block),
// wood (square posts), taper (turned conical legs), metal (steel pins),
// hairpin (splayed steel rods) or none.
// `cx`/`cz` shift the whole set (a sectional's chaise sits off-centre).
export function legsUnder(g, it, kind, legH, inset, col, cx, cz) {
  if (!legH || kind === "none") return;
  var ins = inset != null ? inset : 6,
    hw = it.w / 2 - ins,
    hd = it.d / 2 - ins,
    ox = cx || 0,
    oz = cz || 0;
  if (!kind || kind === "plinth") {
    box(g, ox - hw, ox + hw, 0, legH, oz - hd, oz + hd, col != null ? col : 0x4b4540, {
      rough: 0.8,
    });
    return;
  }
  var lc = kind === "metal" || kind === "hairpin" ? 0x3d4348 : col != null ? col : WOOD;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
    var px = ox + p[0] * hw,
      pz = oz + p[1] * hd;
    if (kind === "metal")
      cyl(g, px, legH / 2, pz, 1.5, legH, lc, { metal: 0.85, rough: 0.3, seg: 12 });
    else if (kind === "hairpin") {
      // two rods per corner, splayed outward — mid-century hairpin look
      cyl(g, px, legH / 2, pz, 0.8, legH * 1.02, lc, {
        metal: 0.85, rough: 0.3, seg: 8, rz: p[0] * 0.14,
      });
      cyl(g, px, legH / 2, pz, 0.8, legH * 1.02, lc, {
        metal: 0.85, rough: 0.3, seg: 8, rx: -p[1] * 0.14,
      });
    } else if (kind === "taper")
      cyl(g, px, legH / 2, pz, 1.5, legH, lc, { r2: 2.8, rough: 0.6, seg: 14 });
    else
      box(g, px - 2.5, px + 2.5, 0, legH, pz - 2.5, pz + 2.5, lc, { rough: 0.65 });
  });
}

// A slab with rectangular openings punched through it, built as strips so the
// hole is real geometry you can look down into (countertops, cabinet tops).
// `holes` are {x0,x1,z0,z1}, listed left→right and sharing one z-range.
// `skipFront` leaves the front strip out (apron-front / farmhouse basins).
export function slabWithHoles(g, x0, x1, y0, y1, z0, z1, holes, col, opt) {
  opt = Object.assign({ sharp: true }, opt || {});
  if (!holes || !holes.length) {
    box(g, x0, x1, y0, y1, z0, z1, col, opt);
    return;
  }
  var hz0 = Math.max(z0, holes[0].z0),
    hz1 = Math.min(z1, holes[0].z1);
  if (hz0 > z0) box(g, x0, x1, y0, y1, z0, hz0, col, opt); // back strip
  if (z1 > hz1 && !opt.skipFront) box(g, x0, x1, y0, y1, hz1, z1, col, opt);
  var cx = x0; // left, between-bowl and right strips
  holes.forEach(function (h) {
    if (h.x0 > cx) box(g, cx, h.x0, y0, y1, hz0, hz1, col, opt);
    cx = h.x1;
  });
  if (x1 > cx) box(g, cx, x1, y0, y1, hz0, hz1, col, opt);
}

// A recessed rectangular basin: four walls hung inside the counter opening
// plus a floor and a drain, so you look into an actual bowl.
// `openFront` drops the front wall's inset (farmhouse apron reads from outside).
export function basin(g, x0, x1, z0, z1, top, depth, col, opt) {
  var t = 1.4,
    bot = top - depth;
  var mo = Object.assign({ metal: 0.55, rough: 0.32, sharp: true }, opt || {});
  box(g, x0, x1, bot, top, z0, z0 + t, col, mo); // back
  box(g, x0, x1, bot, top, z1 - t, z1, col, mo); // front
  box(g, x0, x0 + t, bot, top, z0, z1, col, mo); // left
  box(g, x1 - t, x1, bot, top, z0, z1, col, mo); // right
  box(g, x0, x1, bot - t, bot, z0, z1, col, mo); // floor
  var cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  cyl(g, cx, bot + 0.35, cz, 3.6, 0.7, 0xc6cccf, {
    metal: 0.9,
    rough: 0.14,
    seg: 20,
  }); // drain flange
  cyl(g, cx, bot + 0.9, cz, 2.1, 0.6, 0x2b3236, {
    metal: 0.3,
    rough: 0.7,
    seg: 20,
  }); // the hole
}

// Chrome mixer tap: riser, 180° gooseneck arch over the bowl, spout and lever.
// The arc is a chain of short cylinders; at parameter θ the tube centre sits at
// (cx, yc+R·cosθ, zc+R·sinθ) and its axis is the tangent, hence rx = θ + π/2.
export function gooseneck(g, cx, baseY, z, reach, riseH, col, tubeR) {
  var R = reach / 2,
    yc = baseY + riseH,
    zc = z + R,
    tr = tubeR || 1.7,
    mo = { metal: 0.92, rough: 0.14, seg: 16 };
  col = col == null ? 0xc9cfd2 : col;
  cyl(g, cx, baseY + riseH / 2, z, tr, riseH, col, mo); // riser
  var N = 10,
    segL = (Math.PI * R) / N + 0.8;
  for (var i = 0; i < N; i++) {
    var th = -Math.PI / 2 + (Math.PI * (i + 0.5)) / N;
    cyl(
      g,
      cx,
      yc + R * Math.cos(th),
      zc + R * Math.sin(th),
      tr,
      segL,
      col,
      Object.assign({ rx: th + Math.PI / 2 }, mo),
    );
  }
  cyl(g, cx, yc - 3, zc + R, tr * 0.85, 6, col, mo); // spout, pointing down
  cyl(g, cx, yc - 6.2, zc + R, tr * 0.7, 0.8, 0xdfe4e6, mo); // aerator
  // single lever, angled back over the riser
  cyl(g, cx - tr - 1.5, baseY + 6, z - 1, 0.9, 9, col, {
    metal: 0.9,
    rough: 0.16,
    seg: 12,
    rx: 0.5,
  });
  cyl(g, cx, baseY + 1.2, z, tr + 1.4, 2.4, col, mo); // escutcheon
}
