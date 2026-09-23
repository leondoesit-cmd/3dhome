/* Textured fills for the presentation plan.

   A floor material is one painted tile (primitives.js PAINT) that covers
   TILE[type] cm of floor. The plan fills a room with that tile as a canvas
   pattern, which has two problems a 3D texture does not:

   - no mipmaps. A 256px tile squeezed into 12 screen pixels shimmers into
     moiré as you pan, so the tile is painted at the smallest power-of-two
     size that still covers its on-screen footprint, and below ~10px the room
     is filled with the tile's average colour instead;
   - it is anchored to the canvas, not the world. patternMatrix() pins tile
     (0,0) to world (0,0) and scales it to cm, so planks do not slide under a
     pan and a zoom keeps them the same real size.

   The level and matrix maths are pure so they can be tested; patternFill()
   is the one DOM-touching function. */

export const PATTERN_LEVELS = [32, 64, 128, 256, 512];
export const FLAT_BELOW_PX = 10;

/* On-screen size of one tile in device pixels → the tile resolution to paint,
   or "flat" when the tile is too small for its detail to read. */
export function patternLevel(tileCm, SC, dpr) {
  var px = Number(tileCm) * Number(SC) * (Number(dpr) || 1);
  if (!(px > 0) || !isFinite(px)) return "flat";
  if (px < FLAT_BELOW_PX) return "flat";
  for (var i = 0; i < PATTERN_LEVELS.length; i++) if (PATTERN_LEVELS[i] >= px) return PATTERN_LEVELS[i];
  return PATTERN_LEVELS[PATTERN_LEVELS.length - 1];
}

/* The pattern transform, in the CSS-pixel space the plan draws in: tile pixel
   (0,0) lands on world (0,0) at screen (OX,OY), and `level` tile pixels span
   tileCm world centimetres. Returned as the six DOMMatrix terms. */
export function patternMatrix(tileCm, level, OX, OY, SC) {
  var k = (Number(tileCm) * Number(SC)) / Number(level);
  return { a: k, b: 0, c: 0, d: k, e: Number(OX) || 0, f: Number(OY) || 0 };
}

/* The tile pixel a world point shows, for a view {OX,OY,SC}: where the point
   lands on screen, pushed back through the pattern matrix. The tests use it
   to show a point keeps its place in the pattern under any pan or zoom. */
export function tilePixelAt(worldX, worldZ, view, tileCm, level) {
  var m = patternMatrix(tileCm, level, view.OX, view.OY, view.SC);
  var px = view.OX + worldX * view.SC, py = view.OY + worldZ * view.SC;
  var mod = function (n) { return ((n % level) + level) % level; };
  return { u: mod((px - m.e) / m.a), v: mod((py - m.f) / m.d) };
}

var patCache = new Map();

/* A fillStyle for `source(level)` tiled at tileCm: a transformed pattern, or
   `flat` when the tile is too small on screen. `source` returns a canvas. */
export function patternFill(ctx, cacheKey, source, flat, tileCm, view) {
  var level = patternLevel(tileCm, view.SC, view.dpr);
  if (level === "flat" || !ctx || typeof ctx.createPattern !== "function") return flat;
  var key = cacheKey + "@" + level;
  var pat = patCache.get(key);
  if (!pat) {
    var c = source(level);
    if (!c) return flat;
    try {
      pat = ctx.createPattern(c, "repeat");
    } catch (e) {
      pat = null;
    }
    if (!pat) return flat;
    patCache.set(key, pat);
  }
  if (typeof pat.setTransform === "function" && typeof DOMMatrix === "function") {
    var m = patternMatrix(tileCm, level, view.OX, view.OY, view.SC);
    pat.setTransform(new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
  }
  return pat;
}
