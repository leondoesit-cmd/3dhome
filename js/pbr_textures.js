/* Procedural surface detail for the furniture: a near-white ALBEDO detail map
   (multiplied by the part's own colour, so every tint and variant still reads
   as itself) and a tangent-space NORMAL map, per material family — the weave
   of linen, the grain of oak, the veins of marble, the loops of bouclé.

   Everything here is pure array maths, seeded and exactly periodic, so the
   tiles wrap with no seam and the tests can check both properties in Node.
   The three wrapping (CanvasTexture, a never-disposed cache) lives in
   primitives.js, next to the floor painters. */

// deterministic PRNG (same LCG as the floor painters in primitives.js)
export function mkRnd(seed) {
  var s = seed || 1;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/* Periodic value noise: a lattice of `cells` × `cells` random values that
   wraps, so the field tiles exactly across the texture edge. */
function lattice(cells, seed) {
  var rnd = mkRnd(seed), v = new Float32Array(cells * cells);
  for (var i = 0; i < v.length; i++) v[i] = rnd();
  return v;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noiseAt(lat, cells, u, v) {
  // u, v in [0,1)
  var x = u * cells, y = v * cells,
    x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
  var i0 = ((x0 % cells) + cells) % cells, j0 = ((y0 % cells) + cells) % cells,
    i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells;
  var a = lat[j0 * cells + i0], b = lat[j0 * cells + i1], c = lat[j1 * cells + i0], d = lat[j1 * cells + i1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbmField(size, baseCells, octaves, seed) {
  var out = new Float32Array(size * size), lats = [], amp = 1, norm = 0;
  for (var o = 0; o < octaves; o++) {
    lats.push({ lat: lattice(baseCells << o, seed + o * 101), cells: baseCells << o, amp: amp });
    norm += amp;
    amp *= 0.5;
  }
  for (var y = 0; y < size; y++)
    for (var x = 0; x < size; x++) {
      var s = 0;
      for (var k = 0; k < lats.length; k++) s += lats[k].amp * noiseAt(lats[k].lat, lats[k].cells, x / size, y / size);
      out[y * size + x] = s / norm;
    }
  return out;
}

var TAU = Math.PI * 2;

/* Each family returns {albedo: Float32 0..1 luminance multiplier, height:
   Float32 0..1, strength: normal-map strength, tileCm: real size of one tile}.
   Periodic functions use an integer number of cycles per tile so they wrap. */
var FAMILIES = {
  linen: function (n) {
    var f = fbmField(n, 8, 3, 11), a = new Float32Array(n * n), h = new Float32Array(n * n), cyc = 48;
    for (var y = 0; y < n; y++)
      for (var x = 0; x < n; x++) {
        var i = y * n + x, wx = Math.sin((TAU * cyc * x) / n), wy = Math.sin((TAU * cyc * y) / n);
        // over-under weave: warp high where weft is low
        var weave = 0.5 + 0.25 * (wx * (wy > 0 ? 1 : -0.4) + wy * (wx > 0 ? 0.4 : -1));
        h[i] = weave * 0.8 + f[i] * 0.2;
        a[i] = 0.86 + 0.1 * weave + 0.06 * (f[i] - 0.5);
      }
    return { albedo: a, height: h, strength: 1.4, tileCm: 10 };
  },
  boucle: function (n) {
    var f = fbmField(n, 32, 3, 23), g = fbmField(n, 16, 2, 29), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) {
      var loops = 1 - Math.abs(f[i] * 2 - 1);
      h[i] = Math.pow(loops, 1.6);
      a[i] = 0.8 + 0.2 * h[i] + 0.05 * (g[i] - 0.5);
    }
    return { albedo: a, height: h, strength: 2.2, tileCm: 14 };
  },
  velvet: function (n) {
    var f = fbmField(n, 4, 4, 37), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) {
      h[i] = f[i];
      a[i] = 0.84 + 0.2 * (f[i] - 0.5);
    }
    return { albedo: a, height: h, strength: 0.5, tileCm: 60 };
  },
  cotton: function (n) {
    var f = fbmField(n, 16, 3, 41), g = fbmField(n, 4, 2, 43), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) {
      h[i] = f[i] * 0.6 + g[i] * 0.4;
      a[i] = 0.93 + 0.08 * (g[i] - 0.5);
    }
    return { albedo: a, height: h, strength: 0.9, tileCm: 30 };
  },
  leather: function (n) {
    var f = fbmField(n, 24, 3, 47), g = fbmField(n, 4, 3, 53), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) {
      var crease = Math.pow(1 - Math.abs(f[i] * 2 - 1), 3);
      h[i] = 1 - crease * 0.7;
      a[i] = 0.88 - 0.12 * crease + 0.1 * (g[i] - 0.5);
    }
    return { albedo: a, height: h, strength: 1.2, tileCm: 20 };
  },
  oak: function (n) {
    var f = fbmField(n, 2, 4, 59), g = fbmField(n, 64, 1, 61), q = fbmField(n, 8, 3, 63),
      a = new Float32Array(n * n), h = new Float32Array(n * n), cyc = 14;
    for (var y = 0; y < n; y++)
      for (var x = 0; x < n; x++) {
        var i = y * n + x;
        // growth rings run along u (a board's long axis), gently warped; the
        // late wood is a thin darker line, not a stripe
        var ring = 0.5 + 0.5 * Math.sin(TAU * (cyc * y / n + 2.6 * f[i]));
        var late = Math.pow(ring, 10) * (0.5 + q[i]);
        // pores: fine dark flecks strung along the grain
        var pore = g[i] > 0.8 ? (g[i] - 0.8) * 5 : 0;
        h[i] = 0.5 * late + 0.3 * q[i] + 0.2 * pore;
        a[i] = 0.95 - 0.045 * late - 0.035 * pore + 0.07 * (q[i] - 0.5);
      }
    return { albedo: a, height: h, strength: 0.4, tileCm: 80 };
  },
  marble: function (n) {
    var f = fbmField(n, 4, 5, 67), g = fbmField(n, 8, 3, 71), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var y = 0; y < n; y++)
      for (var x = 0; x < n; x++) {
        var i = y * n + x;
        var t = Math.sin(TAU * ((x + y) / n * 2 + 3.2 * f[i]));
        var vein = Math.pow(1 - Math.abs(t), 14) + 0.35 * Math.pow(1 - Math.abs(Math.sin(TAU * (x / n * 3 + 4 * g[i]))), 30);
        a[i] = 1 - 0.4 * Math.min(1, vein) - 0.05 * (g[i] - 0.5);
        h[i] = 0.5;
      }
    return { albedo: a, height: h, strength: 0, tileCm: 120 };
  },
  quartz: function (n) {
    var f = fbmField(n, 64, 1, 73), g = fbmField(n, 8, 3, 79), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) {
      var fleck = f[i] > 0.82 ? 0.14 : f[i] < 0.14 ? -0.08 : 0;
      a[i] = 0.93 - fleck + 0.05 * (g[i] - 0.5);
      h[i] = 0.5;
    }
    return { albedo: a, height: h, strength: 0, tileCm: 45 };
  },
  brushed: function (n) {
    var a = new Float32Array(n * n), h = new Float32Array(n * n), rnd = mkRnd(83), row = new Float32Array(n);
    for (var y = 0; y < n; y++) row[y] = rnd();
    var lat = lattice(64, 89);
    for (var y2 = 0; y2 < n; y2++)
      for (var x = 0; x < n; x++) {
        var i = y2 * n + x, s = 0.75 * row[y2] + 0.25 * noiseAt(lat, 64, x / n, y2 / n);
        a[i] = 0.9 + 0.1 * s;
        h[i] = s;
      }
    return { albedo: a, height: h, strength: 0.35, tileCm: 25 };
  },
  plaster: function (n) {
    var f = fbmField(n, 8, 4, 97), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) {
      h[i] = f[i];
      a[i] = 0.95 + 0.08 * (f[i] - 0.5);
    }
    return { albedo: a, height: h, strength: 0.6, tileCm: 80 };
  },
  foliage: function (n) {
    var f = fbmField(n, 16, 4, 101), a = new Float32Array(n * n), h = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) {
      var leaf = Math.pow(f[i], 1.4);
      h[i] = leaf;
      a[i] = 0.62 + 0.55 * leaf;
    }
    return { albedo: a, height: h, strength: 2.4, tileCm: 40 };
  },
};

export const PBR_FAMILIES = Object.keys(FAMILIES);

/* Tangent-space normal map from a wrapped height field (Sobel), 0..255. */
export function heightToNormal(h, n, strength) {
  var out = new Uint8ClampedArray(n * n * 4);
  function H(x, y) { return h[(((y % n) + n) % n) * n + (((x % n) + n) % n)]; }
  for (var y = 0; y < n; y++)
    for (var x = 0; x < n; x++) {
      var dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      var dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      var nx = -dx * strength, ny = -dy * strength, nz = 1, l = Math.hypot(nx, ny, nz), o = (y * n + x) * 4;
      out[o] = Math.round((nx / l * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  return out;
}

/* {size, tileCm, albedo: RGBA bytes, normal: RGBA bytes | null} for a family. */
export function pbrPixels(name, size) {
  var n = size || 256, fam = FAMILIES[name];
  if (!fam) return null;
  var r = fam(n), alb = new Uint8ClampedArray(n * n * 4);
  for (var i = 0; i < n * n; i++) {
    var v = Math.round(Math.max(0, Math.min(1, r.albedo[i])) * 255);
    alb[i * 4] = alb[i * 4 + 1] = alb[i * 4 + 2] = v;
    alb[i * 4 + 3] = 255;
  }
  return {
    size: n,
    tileCm: r.tileCm,
    albedo: alb,
    normal: r.strength > 0 ? heightToNormal(r.height, n, r.strength) : null,
  };
}
