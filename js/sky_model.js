/* A procedural daylight sky for image-based lighting. The old environment
   was an 8-bit three-stop gradient: every glossy surface (marble, glass, a
   steel hood) reflected a flat band, and nothing ever caught the sun. This is
   an equirectangular radiance map in LINEAR light with values above 1 where
   the sun is — a sky gradient that darkens toward the zenith, a warm glow and
   a small bright disc around the sun, and a green-tinted ground bounce below
   the horizon (the lawn every presentation view stands on).

   Pure maths over plain arrays; view3d.js packs it into a half-float texture
   and prefilters it with PMREM. */

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* Radiance arriving from direction d (unit, y up) under a sun at `sun`
   (unit). p: {zenith, horizon, ground, sunColor: linear RGB, sunI: disc
   radiance, glowI: halo strength}. */
export function skyRadiance(d, sun, p) {
  var up = d[1], c;
  if (up >= 0) {
    c = mix(p.horizon, p.zenith, Math.pow(up, 0.55));
  } else {
    // below the horizon: the ground, lit by the sky, darkening straight down
    c = mix(p.horizon, p.ground, Math.min(1, -up * 6));
    c = [c[0] * (0.75 + 0.25 * (1 + up)), c[1] * (0.75 + 0.25 * (1 + up)), c[2] * (0.75 + 0.25 * (1 + up))];
  }
  var cs = d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2];
  if (cs > 0 && sun[1] > -0.05) {
    var glow = (p.glowI || 0) * Math.pow(cs, 12) + (p.sunI || 0) * Math.pow(cs, 2400);
    c = [c[0] + p.sunColor[0] * glow, c[1] + p.sunColor[1] * glow, c[2] + p.sunColor[2] * glow];
  }
  return c;
}

/* w × h equirect RGBA floats, laid out for three's equirect lookup
   (u = atan2(z, x) / 2π + 0.5, v = asin(y) / π + 0.5) in an unflipped
   DataTexture — so row 0 is straight DOWN and the last row straight up. The
   sun is given in world space and lands where the scene's sun is. */
export function equirectDir(u, v) {
  var a = (u - 0.5) * Math.PI * 2, lat = (v - 0.5) * Math.PI, cl = Math.cos(lat);
  return [cl * Math.cos(a), Math.sin(lat), cl * Math.sin(a)];
}
export function skyPixels(w, h, sun, p) {
  var out = new Float32Array(w * h * 4);
  for (var y = 0; y < h; y++)
    for (var x = 0; x < w; x++) {
      var c = skyRadiance(equirectDir((x + 0.5) / w, (y + 0.5) / h), sun, p), o = (y * w + x) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 1;
    }
  return out;
}

/* sRGB 0..1 → linear, for palette colours given as hex. */
export function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
