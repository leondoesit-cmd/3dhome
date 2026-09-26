// Shared procedural-shape helpers used by furniture model builders.
import { HANDLE, FABRIC, WOOD, DARK } from "./state.js";
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
// Built soft: every upholstered part has a real radius, seat cushions dome,
// back cushions lean back and bulge forward, and a pair of scatter cushions
// sits against the arms — the pieces a rendered sofa is read by.
export function upholstered(g, it, V, armW) {
  var arms = V.arms || "block",
    aw = arms === "none" ? 0 : V.armW != null ? V.armW : armW,
    hw = it.w / 2,
    hd = it.d / 2,
    legH = V.legH != null ? V.legH : 8,
    seatT = legH + 22,
    backZ = -hd + (V.backT || 18),
    cushCol = V.cushCol != null ? V.cushCol : 0xb4bdbd,
    shell = { rough: 0.95, radius: 3 };
  box(g, -hw, hw, legH, seatT, -hd, hd, FABRIC, shell); // seat base
  // one cushion per seat so a 3-seater reads as a 3-seater
  var n = V.seats || Math.max(1, Math.round((it.w - 2 * aw) / 70)),
    c0 = -hw + aw + 1,
    cw = (hw - aw - 1 - c0) / n;
  for (var i = 0; i < n; i++)
    box(g, c0 + i * cw + 0.6, c0 + (i + 1) * cw - 0.6, seatT - 1, seatT + 11, backZ + 1, hd - 0.5, cushCol,
      { rough: 0.95, radius: 5, crown: 2.2 });
  box(g, -hw, hw, seatT, it.h - 2, -hd, backZ, FABRIC, { rough: 0.95, radius: 4, crown: 1.5 }); // back
  // back cushions, or buttoned tufting for the classic look
  if (V.tufted) {
    for (var r = 0; r < 2; r++)
      for (var c = 0; c < Math.max(2, Math.round(it.w / 45)); c++) {
        var bx = -hw + aw + 6 + ((it.w - 2 * (aw + 6)) * (c + 0.5)) / Math.max(2, Math.round(it.w / 45));
        sph(g, bx, seatT + 12 + r * 16, backZ + 0.6, 1.5, FABRIC, { rough: 0.6 });
      }
  } else if (arms !== "none") {
    for (var k = 0; k < n; k++) {
      var bc = box(g, c0 + k * cw + 1, c0 + (k + 1) * cw - 1, seatT + 9, it.h + 1, backZ - 1, backZ + 13, cushCol,
        { rough: 0.95, radius: 6, crown: 3, crownAxis: "z" });
      if (bc) bc.rotation.x = -0.14; // leaning back into the frame
    }
  }
  // arms
  var armH = V.armH != null ? V.armH : arms === "low" ? seatT + 12 : 56;
  if (aw) {
    [-1, 1].forEach(function (s) {
      var ax0 = s < 0 ? -hw : hw - aw,
        ax1 = s < 0 ? -hw + aw : hw;
      box(g, ax0, ax1, legH, armH, -hd, hd, FABRIC, { rough: 0.95, radius: Math.min(6, aw / 2 - 0.2), crown: 1.2 });
      if (arms === "roll") // rolled bolster along the top of the arm
        cyl(g, (ax0 + ax1) / 2, armH, 0, aw / 2, it.d - 2, FABRIC, {
          rough: 0.95, seg: 18, rx: Math.PI / 2,
        });
      if (arms === "wing") // wing back panel rising off the arm
        box(g, ax0, ax1, armH, it.h + 12, -hd, backZ + 10, FABRIC, shell);
    });
    // scatter cushions against both arms, turned and leaning
    if (!V.tufted && it.w >= 120 && V.pillows !== false) {
      var pc = V.pillowCol != null ? V.pillowCol : 0xd8ccb6, ps = Math.min(44, it.d * 0.45);
      [-1, 1].forEach(function (s) {
        var px = s * (hw - aw - ps * 0.42);
        var pl = box(g, px - ps / 2, px + ps / 2, seatT + 8, seatT + 8 + ps, backZ + 8, backZ + 22, pc,
          { rough: 0.97, radius: 6, crown: 3, crownAxis: "z" });
        if (pl) {
          pl.rotation.x = -0.32;
          pl.rotation.y = s * 0.42;
        }
      });
    }
  }
  if (V.chaise) {
    // long return on one side — turns the sofa into a sectional
    var s2 = V.chaise === "l" ? -1 : 1,
      cd = V.chaiseD || it.d * 0.85,
      z1 = hd + cd,
      cx0 = s2 < 0 ? -hw : hw - it.d,
      cx1 = s2 < 0 ? -hw + it.d : hw;
    box(g, cx0, cx1, legH, seatT, hd, z1, FABRIC, shell);
    box(g, cx0 + 1, cx1 - 1, seatT - 1, seatT + 11, hd, z1 - 1, cushCol, { rough: 0.95, radius: 5, crown: 2.2 });
    box(g, s2 < 0 ? cx0 : cx1 - aw, s2 < 0 ? cx0 + aw : cx1, legH, armH, hd, z1, FABRIC,
      { rough: 0.95, radius: Math.max(0.5, Math.min(6, aw / 2 - 0.2)) });
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
  // Split at every cutout boundary so openings at different depths, including
  // one that crosses a joint between slabs, still leave actual empty geometry.
  var xs = [x0, x1], zs = [z0, z1];
  holes.forEach(function (h) {
    xs.push(Math.max(x0, Math.min(x1, h.x0)), Math.max(x0, Math.min(x1, h.x1)));
    zs.push(Math.max(z0, Math.min(z1, h.z0)), Math.max(z0, Math.min(z1, h.z1)));
  });
  xs = [...new Set(xs)].sort(function (a, b) { return a - b; });
  zs = [...new Set(zs)].sort(function (a, b) { return a - b; });
  for (var ix = 0; ix < xs.length - 1; ix++) for (var iz = 0; iz < zs.length - 1; iz++) {
    var xa = xs[ix], xb = xs[ix + 1], za = zs[iz], zb = zs[iz + 1];
    if (xb - xa < 1e-6 || zb - za < 1e-6) continue;
    if (opt.skipFront && zb === z1) continue;
    var mx = (xa + xb) / 2, mz = (za + zb) / 2;
    if (!holes.some(function (h) { return mx > h.x0 && mx < h.x1 && mz > h.z0 && mz < h.z1; }))
      box(g, xa, xb, y0, y1, za, zb, col, opt);
  }
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

/* ================= casework detailing kit =================
   What makes a cabinet read as made rather than modelled: fronts that sit
   proud of the carcass with a shadow reveal round every one, real hardware
   (a bar on two posts, a knob, an edge pull), a recessed toe-kick, a worktop
   with a softened nosing. Every model builds from these so the whole
   catalogue shares one standard of finish. Model frame: centimetres, origin
   at the centre of the footprint on the floor, front toward +z. */
var PI = Math.PI;
export var METAL = { metal: 0.85, rough: 0.25 };

/* A handle. style: "bar" (round bar on two posts), "knob", "edge" (a slim
   aluminium lip along the top of the front), "cup" (half-moon pull) or
   "none". (x,y) is its centre on the face plane z; `vertical` turns a bar. */
export function pull(g, x, y, z, len, vertical, style, col) {
  var c = col != null ? col : HANDLE;
  style = style || "bar";
  if (style === "none") return;
  if (style === "knob") {
    cyl(g, x, y, z + 0.9, 0.55, 1.8, c, { metal: 0.85, rough: 0.25, rx: PI / 2, seg: 10 });
    sph(g, x, y, z + 2.1, 1.35, c, { metal: 0.85, rough: 0.25 });
    return;
  }
  if (style === "edge") {
    box(g, x - len / 2, x + len / 2, y - 0.5, y + 0.5, z, z + 1.8, c, { metal: 0.8, rough: 0.3, sharp: true });
    return;
  }
  if (style === "cup") {
    box(g, x - len / 2, x + len / 2, y - 1.2, y + 0.4, z, z + 1.6, c, { metal: 0.85, rough: 0.28, radius: 0.6 });
    return;
  }
  var stand = 2.4, r = 0.62, L = Math.max(6, len);
  if (vertical) {
    cyl(g, x, y - L / 2 + 1.2, z + stand / 2, 0.42, stand, c, { metal: 0.85, rough: 0.25, rx: PI / 2, seg: 8 });
    cyl(g, x, y + L / 2 - 1.2, z + stand / 2, 0.42, stand, c, { metal: 0.85, rough: 0.25, rx: PI / 2, seg: 8 });
    cyl(g, x, y, z + stand, r, L, c, { metal: 0.85, rough: 0.22, seg: 12 });
  } else {
    cyl(g, x - L / 2 + 1.2, y, z + stand / 2, 0.42, stand, c, { metal: 0.85, rough: 0.25, rx: PI / 2, seg: 8 });
    cyl(g, x + L / 2 - 1.2, y, z + stand / 2, 0.42, stand, c, { metal: 0.85, rough: 0.25, rx: PI / 2, seg: 8 });
    cyl(g, x, y, z + stand, r, L, c, { metal: 0.85, rough: 0.22, seg: 12, rz: PI / 2 });
  }
}

/* A door or drawer front standing proud of the carcass face at zFace, inset
   by a shadow reveal on every side. o: {kind:"door"|"drawer", hinge:-1|1
   (which side the hinges are; the handle goes on the other), handle style,
   handleAt:"top"|"bottom"|"middle" for doors, shaker (a framed panel),
   glass (a glazed centre), rough, metal, t, reveal}. Returns the front mesh. */
export function front(g, x0, x1, y0, y1, zFace, col, o) {
  o = o || {};
  var rv = o.reveal != null ? o.reveal : 0.3, t = o.t != null ? o.t : 1.8;
  var a0 = x0 + rv, a1 = x1 - rv, b0 = y0 + rv, b1 = y1 - rv;
  if (a1 - a0 < 1 || b1 - b0 < 1) return null;
  var fo = { rough: o.rough != null ? o.rough : 0.6, metal: o.metal, radius: 0.45 };
  var zf = zFace + t, w = a1 - a0, h = b1 - b0;
  var m;
  if (o.glass) {
    // glazed door: a frame of stiles and rails round a pane
    var fw = Math.min(6, w * 0.18);
    box(g, a0, a0 + fw, b0, b1, zFace, zf, col, fo);
    box(g, a1 - fw, a1, b0, b1, zFace, zf, col, fo);
    box(g, a0 + fw, a1 - fw, b0, b0 + fw, zFace, zf, col, fo);
    m = box(g, a0 + fw, a1 - fw, b1 - fw, b1, zFace, zf, col, fo);
    box(g, a0 + fw, a1 - fw, b0 + fw, b1 - fw, zFace + t * 0.4, zFace + t * 0.6, 0x9fc4d6, {
      trans: true, opacity: 0.3, rough: 0.05, metal: 0.1, cast: false,
    });
  } else {
    m = box(g, a0, a1, b0, b1, zFace, zf, col, fo);
    if (o.shaker && w > 14 && h > 14) {
      // shaker door: a raised frame round a flat centre panel
      var sw = Math.min(6.5, w * 0.16), rl = 0.5;
      box(g, a0, a0 + sw, b0, b1, zf, zf + rl, col, { rough: fo.rough, sharp: true });
      box(g, a1 - sw, a1, b0, b1, zf, zf + rl, col, { rough: fo.rough, sharp: true });
      box(g, a0 + sw, a1 - sw, b0, b0 + sw, zf, zf + rl, col, { rough: fo.rough, sharp: true });
      box(g, a0 + sw, a1 - sw, b1 - sw, b1, zf, zf + rl, col, { rough: fo.rough, sharp: true });
      zf += rl;
    }
  }
  var hs = o.handle || "bar";
  if (o.kind === "drawer") {
    var hy = h > 22 ? b1 - 6 : (b0 + b1) / 2;
    if (hs === "edge") hy = b1 - 0.6;
    pull(g, (a0 + a1) / 2, hy, zf, Math.min(32, w * 0.45), false, hs, o.handleCol);
  } else {
    var side = o.hinge != null ? -o.hinge : 1,
      hx = side > 0 ? a1 - 4 : a0 + 4,
      at = o.handleAt || "middle",
      hl = Math.min(20, h * 0.35),
      hy2 = at === "top" ? b1 - hl / 2 - 4 : at === "bottom" ? b0 + hl / 2 + 4 : (b0 + b1) / 2;
    if (hs === "edge") pull(g, (a0 + a1) / 2, at === "bottom" ? b0 + 0.6 : b1 - 0.6, zf, w * 0.6, false, "edge", o.handleCol);
    else pull(g, hx, hy2, zf, hl, true, hs, o.handleCol);
  }
  return m;
}

/* Recessed toe-kick: set back from the front so the carcass seems to float. */
export function toeKick(g, x0, x1, h, z0, z1, col) {
  box(g, x0 + 0.5, x1 - 0.5, 0, h, z0 + 1, z1 - 6, col != null ? col : 0x3b3936, { rough: 0.85, sharp: true });
}

/* A worktop or case top with a softened nosing. */
export function slab(g, x0, x1, y0, y1, z0, z1, col, o) {
  o = o || {};
  return box(g, x0, x1, y0, y1, z0, z1, col, { rough: o.rough != null ? o.rough : 0.32, metal: o.metal != null ? o.metal : 0.04, radius: o.radius != null ? o.radius : 0.6 });
}

/* A tapered, rounded timber leg (turned look) or a slim square one. */
export function leg(g, x, z, y0, y1, col, kind) {
  var h = y1 - y0;
  if (kind === "square") return box(g, x - 2, x + 2, y0, y1, z - 2, z + 2, col, { rough: 0.55, radius: 0.5 });
  if (kind === "metal") return cyl(g, x, y0 + h / 2, z, 1.1, h, col, { metal: 0.85, rough: 0.28, seg: 12 });
  return cyl(g, x, y0 + h / 2, z, 1.2, h, col, { r2: 2.2, rough: 0.55, seg: 14 });
}

/* A dark glass panel with a bright frame line — oven doors, displays. */
export function glassPanel(g, x0, x1, y0, y1, z, col) {
  box(g, x0, x1, y0, y1, z, z + 0.5, col != null ? col : 0x1b2226, { metal: 0.35, rough: 0.08 });
}

/* A row of vent slats (appliance kick grilles, speaker grilles). */
export function slats(g, x0, x1, y0, y1, z, n, col) {
  var step = (y1 - y0) / n;
  for (var i = 0; i < n; i++)
    box(g, x0, x1, y0 + i * step + step * 0.25, y0 + i * step + step * 0.7, z, z + 0.6, col != null ? col : DARK, { rough: 0.6, sharp: true });
}
