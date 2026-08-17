/* Night Shift texture library.
   ---------------------------------------------------------------------------
   Every subsystem used to roll its own TextureLoader and its own cache, all of
   them loading colour maps and nothing else. In a game lit almost entirely by
   a moving flashlight cone that is the worst possible choice: an albedo-only
   surface has no response to the light sweeping across it, so bark, tarmac,
   brick and cloth all read as flat painted cardboard no matter how good the
   photo is.

   So this module owns texture policy for the whole mode:
     * one loader, one image cache — a file is fetched and decoded once even
       when the weapons, the exterior and the undead all want it;
     * derived maps — normal and roughness maps are generated from the albedo
       on a canvas, which is what actually makes the flashlight readable;
     * a texel budget tied to the existing quality slider, so "fast" is not
       silently paying for 1024² everywhere;
     * device anisotropy instead of a hardcoded 4, which is what the ground
       planes (repeat 8, viewed at a grazing angle) have always needed;
     * one disposeTexLib() so leaving the mode gives the VRAM back.

   Derived maps are built lazily, one per timer tick, because a Sobel pass over
   512² is ~10ms and doing eight of them back to back at wave start is a hitch.
   Every texture is born holding a neutral 1×1 image, so a material is never
   sampling an undefined map: colour maps start white (the material's own tint
   shows until the photo lands, instead of a black flash), normals start flat
   and roughness starts mid — and that is also the graceful failure if
   getImageData() is blocked (a file:// page taints the canvas).           */
import * as THREE from "three";
import { getRenderer } from "./view3d.js";

var IMG = {};       // url -> { img, err, waiting[] }
var BASE = {};      // cache key -> colour texture
var DERIVED = {};   // cache key -> normal / roughness texture
var QUEUE = [];     // pending derived-map builds
var pumping = false;
var BUDGET = 1024;  // max albedo edge in texels
var ANISO = -1;

/* ---- device / quality policy -------------------------------------------- */
export function texAniso() {
  return aniso();
}
function aniso() {
  if (ANISO < 0) {
    var r = null;
    try {
      r = getRenderer();
    } catch (e) {}
    ANISO =
      r && r.capabilities && r.capabilities.getMaxAnisotropy
        ? Math.min(8, r.capabilities.getMaxAnisotropy() || 1)
        : 4;
  }
  return ANISO;
}

// quality: 0 fast / 1 balanced / 2 high — matches the HUD slider.
// Returns true when the budget moved, i.e. the caller should dispose first.
export function setTexBudget(quality) {
  // Keep all three HUD choices distinct.  Balanced used to silently allocate
  // the same 1024px maps as High, so moving that part of the graphics slider
  // could not free any texture memory or image-processing work.
  var want = quality >= 2 ? 1024 : quality >= 1 ? 768 : 512;
  if (want === BUDGET) return false;
  BUDGET = want;
  return true;
}

/* ---- neutral placeholders ----------------------------------------------- */
function flat1(r, g, b) {
  var c = document.createElement("canvas");
  c.width = c.height = 1;
  var x = c.getContext("2d");
  x.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
  x.fillRect(0, 0, 1, 1);
  return c;
}
var NEUTRAL = {
  color: null,
  normal: null,
  rough: null,
};
function neutral(kind) {
  if (!NEUTRAL[kind])
    NEUTRAL[kind] =
      kind === "normal"
        ? flat1(128, 128, 255)
        : kind === "rough"
        ? flat1(200, 200, 200)
        : flat1(255, 255, 255);
  return NEUTRAL[kind];
}

/* ---- shared image cache -------------------------------------------------- */
// A url may register a procedural stand-in. It is drawn once, on failure, and
// then behaves exactly like the decoded photo — including as the source the
// normal and roughness maps are derived from, so the substitute is a complete
// material and not a flat colour. This is what keeps the undead from turning
// into white mannequins when the app is opened without its assets.
var FALLBACK = {};
export function registerFallback(url, makeCanvas) {
  if (!FALLBACK[url]) FALLBACK[url] = makeCanvas;
}

function imageOf(url, cb) {
  var e = IMG[url];
  if (!e) {
    e = IMG[url] = { img: null, err: false, waiting: [] };
    var settle = function (img) {
      e.img = img;
      e.err = !img;
      var w = e.waiting;
      e.waiting = [];
      w.forEach(function (f) {
        f(img);
      });
    };
    var im = new Image();
    im.onload = function () {
      settle(im);
    };
    im.onerror = function () {
      var fb = FALLBACK[url];
      settle(fb ? fb() : null);
    };
    im.src = url;
  }
  if (e.img || e.err) cb(e.img);
  else e.waiting.push(cb);
}

/* ---- derived-map build queue -------------------------------------------- */
// Derived maps (normal, roughness, detail) are expensive (~10ms Sobel pass
// over 512²). The old setTimeout(pump, 0) fired as fast as the event loop
// allowed, stacking several passes into a single frame and causing stutters.
// This version uses rAF + a per-frame time budget: at most one job per frame,
// and only when the frame has enough remaining budget.
var TEX_FRAME_BUDGET = 6; // ms — leave ~10ms for the rest of the frame
function queue(fn) {
  QUEUE.push(fn);
  if (pumping) return;
  pumping = true;
  var pump = function () {
    if (!QUEUE.length) { pumping = false; return; }
    var start = performance.now();
    // Process one job per frame if we have budget
    if (QUEUE.length) {
      var job = QUEUE.shift();
      try { job(); } catch (e) { /* tainted canvas — neutral placeholder stays */ }
    }
    // If more jobs remain, schedule the next one on the next frame
    if (QUEUE.length) requestAnimationFrame(pump);
    else pumping = false;
  };
  requestAnimationFrame(pump);
}

/* ---- canvas helpers ------------------------------------------------------ */
function fit(img, max) {
  var w = img.naturalWidth || img.width,
    h = img.naturalHeight || img.height;
  if (!w || !h) return img;
  var s = Math.min(1, max / Math.max(w, h));
  if (s >= 1) return img;
  var c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function luma(img, size) {
  var c = document.createElement("canvas");
  c.width = c.height = size;
  var x = c.getContext("2d");
  x.drawImage(img, 0, 0, size, size);
  var d = x.getImageData(0, 0, size, size).data; // throws if tainted
  var h = new Float32Array(size * size);
  for (var i = 0, n = size * size; i < n; i++)
    h[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  return { h: h, ctx: x, canvas: c };
}

// Sobel-lite height→normal. Sampling wraps, so a tiling albedo yields a
// tiling normal map with no seam down the edge of every hedge and road.
function buildNormal(img, size, strength) {
  var L = luma(img, size),
    h = L.h,
    x = L.ctx;
  var out = x.createImageData(size, size),
    od = out.data;
  for (var y = 0; y < size; y++) {
    var row = y * size,
      up = ((y - 1 + size) % size) * size,
      dn = ((y + 1) % size) * size;
    for (var xx = 0; xx < size; xx++) {
      var l = h[row + ((xx - 1 + size) % size)],
        r = h[row + ((xx + 1) % size)],
        u = h[up + xx],
        d = h[dn + xx];
      // three's normal maps are OpenGL convention: +Y is +V, and flipY puts
      // image row 0 at the top of V, so dh/dv reads as (down - up).
      var nx = (l - r) * strength,
        ny = (d - u) * strength,
        len = Math.sqrt(nx * nx + ny * ny + 1);
      var o = (row + xx) * 4;
      od[o] = ((nx / len) * 0.5 + 0.5) * 255;
      od[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      od[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      od[o + 3] = 255;
    }
  }
  x.putImageData(out, 0, 0);
  return L.canvas;
}

// Luminance → roughness, always in [lo, 1]. Dark pixels are grime and shadow
// (rough), bright pixels are worn or wet (smooth) — invert for surfaces where
// the opposite holds, e.g. handled steel that polishes up where it is bright.
//
// three MULTIPLIES roughnessMap by material.roughness, so dropping a map onto
// an existing material silently makes it shinier than it was authored. The
// map therefore only ever darkens, and callers scale the scalar up by
// roughBoost(lo) so the average lands back on the value they asked for.
function buildRough(img, size, lo, hi, invert) {
  var L = luma(img, size),
    h = L.h,
    x = L.ctx;
  var out = x.createImageData(size, size),
    od = out.data;
  for (var i = 0, n = size * size; i < n; i++) {
    var v = invert ? h[i] : 1 - h[i];
    var g = (lo + (hi - lo) * v) * 255;
    var o = i * 4;
    od[o] = od[o + 1] = od[o + 2] = g;
    od[o + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return L.canvas;
}

/* ---- public API ---------------------------------------------------------- */
function wrap(t, rep, clamp) {
  if (clamp) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  } else {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rep && rep !== 1) t.repeat.set(rep, rep);
  }
  t.anisotropy = aniso();
  return t;
}

function born(kind, rep, clamp, srgb) {
  var t = new THREE.Texture(neutral(kind));
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return wrap(t, rep, clamp);
}

// Colour map. opts: { rep, clamp, linear }
export function tex(url, opts) {
  opts = opts || {};
  var rep = opts.rep || 1,
    key = url + "|c|" + rep + "|" + (opts.clamp ? "e" : "r") + "|" + BUDGET;
  if (BASE[key]) return BASE[key];
  var t = born("color", rep, opts.clamp, !opts.linear);
  BASE[key] = t;
  imageOf(url, function (img) {
    if (!img) return;
    t.image = fit(img, BUDGET);
    t.needsUpdate = true;
  });
  return t;
}

// Normal map derived from the albedo. opts: { rep, clamp, strength }
export function normalTex(url, opts) {
  opts = opts || {};
  var rep = opts.rep || 1,
    str = opts.strength == null ? 2.2 : opts.strength,
    size = Math.min(256, BUDGET),
    key = url + "|n" + str + "|" + rep + "|" + (opts.clamp ? "e" : "r") + "|" + size;
  if (DERIVED[key]) return DERIVED[key];
  var t = born("normal", rep, opts.clamp, false);
  DERIVED[key] = t;
  if (BUDGET <= 512) return t; // Fast: keep the 1×1 placeholder, skip the Sobel hitch
  imageOf(url, function (img) {
    if (!img) return;
    queue(function () {
      t.image = buildNormal(img, size, str);
      t.needsUpdate = true;
    });
  });
  return t;
}

/* A DETAIL map: the photo's relative brightness, flattened to a narrow band
   around white, so it carries pattern without carrying brightness.

   These exterior photos are very dark in linear terms — grass and hedge
   average about 0.012, tarmac 0.05 — and three multiplies them by the
   material's colour. Authoring a hex as if it were the final colour and then
   multiplying a dark photo on top crushes the result: the parking lot's
   tarmac ends up with an effective albedo of 0.0056, i.e. a surface that
   reflects half a percent of what hits it. No street lamp can light that, and
   the same maths silently gated the emissive term too.

   So each texel becomes its brightness RELATIVE to the map's own mean, then
   is squeezed into [1-amount, 1+amount] and rescaled to fit an 8-bit texture.
   detailBoost(amount) undoes the rescale — multiply it into the material's
   colour (for a map) or its intensity (for an emissiveMap) and the average
   lands exactly on what was authored, with the texture free to modulate
   around it. Contrast is capped, so a black knot in the bark shades the
   surface without ever killing it. */
export function detailBoost(amount) {
  return 1 + (amount == null ? 0.45 : amount);
}

export function detailTex(url, opts) {
  opts = opts || {};
  var rep = opts.rep || 1,
    amt = opts.amount == null ? 0.45 : opts.amount,
    size = Math.min(256, BUDGET),
    key = url + "|d" + amt + "|" + rep + "|" + size;
  if (DERIVED[key]) return DERIVED[key];
  // starts white: until the map lands the surface is lit flatly, exactly as
  // it was before, rather than black
  var t = born("color", rep, opts.clamp, false);
  DERIVED[key] = t;
  if (BUDGET <= 512) return t;
  imageOf(url, function (img) {
    if (!img) return;
    queue(function () {
      var L = luma(img, size),
        h = L.h,
        x = L.ctx,
        n = size * size,
        i;
      var mean = 0;
      for (i = 0; i < n; i++) mean += h[i];
      mean /= n;
      var out = x.createImageData(size, size),
        od = out.data,
        scale = 1 / detailBoost(amt);
      for (i = 0; i < n; i++) {
        var rel = mean > 1e-5 ? h[i] / mean : 1;
        if (rel > 2) rel = 2;
        var v = (1 + amt * (rel - 1)) * scale * 255;
        var o = i * 4;
        od[o] = od[o + 1] = od[o + 2] = v;
        od[o + 3] = 255;
      }
      x.putImageData(out, 0, 0);
      t.image = L.canvas;
      t.needsUpdate = true;
    });
  });
  return t;
}

// Compensation for the multiply above: raises an authored roughness so a map
// spanning [lo, 1] averages back out to it.
export function roughBoost(lo) {
  return 2 / (1 + (lo == null ? 0.45 : lo));
}

// Roughness map derived from the albedo. opts: { rep, lo, invert }
export function roughTex(url, opts) {
  opts = opts || {};
  var rep = opts.rep || 1,
    lo = opts.lo == null ? 0.45 : opts.lo,
    hi = 1,
    size = Math.min(256, BUDGET),
    key = url + "|r" + lo + "," + hi + (opts.invert ? "i" : "") + "|" + rep + "|" + size;
  if (DERIVED[key]) return DERIVED[key];
  var t = born("rough", rep, opts.clamp, false);
  DERIVED[key] = t;
  if (BUDGET <= 512) return t;
  imageOf(url, function (img) {
    if (!img) return;
    queue(function () {
      t.image = buildRough(img, size, lo, hi, opts.invert);
      t.needsUpdate = true;
    });
  });
  return t;
}

// Colour + normal + roughness in one call, all sharing the same repeat, ready
// to spread over MeshStandardMaterial params.
export function pbr(url, opts) {
  opts = opts || {};
  var p = {
    map: tex(url, opts),
    normalMap: normalTex(url, opts),
  };
  var ns = opts.normalScale == null ? 1 : opts.normalScale;
  p.normalScale = new THREE.Vector2(ns, ns);
  if (opts.rough !== false)
    p.roughnessMap = roughTex(url, {
      rep: opts.rep,
      lo: opts.roughLo,
      invert: opts.roughInvert,
    });
  return p;
}

export function disposeTexLib() {
  var k;
  for (k in BASE) BASE[k].dispose();
  for (k in DERIVED) DERIVED[k].dispose();
  BASE = {};
  DERIVED = {};
  QUEUE.length = 0;
  // IMG is kept: the decoded <img> costs little next to a GPU upload, and
  // re-entering the mode is then instant instead of re-fetching every file.
}
