/* Cache keys and draw modes for the presentation plan's furniture sprites
   (js/plan_sprites.js). Pure, so what makes two pieces "look the same from
   above" is tested rather than assumed.

   A sprite is a top-down render of the piece in its OWN frame, so where it
   stands and which way it faces never change the picture: the plan rotates
   and places the image. Everything else that reaches the builder does —
   size, variant, textures, cabinet spec, stair configuration, parameter
   overrides — the same rule as view3d.js itemSig(). */

// Bump when the models or the sprite lighting change, so no stale picture
// survives a code update in a long-lived cache.
export const SPRITE_VERSION = 4;

export const SPRITE_BUCKETS = [64, 128, 256, 512];

// fields that position the piece or describe runtime state, not its shape
const PLACEMENT = { x: 1, z: 1, rot: 1, id: 1, name: 1, locked: 1, smartState: 1, on: 1, powered: 1, _live: 1 };

function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ":" + stable(v[k]);
    }).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

function shapeOf(it) {
  var out = {};
  Object.keys(it || {}).forEach(function (k) {
    if (PLACEMENT[k] || k.charAt(0) === "_" || typeof it[k] === "function") return;
    out[k] = it[k];
  });
  return out;
}

export function spriteKey(it, bucket, rev) {
  return SPRITE_VERSION + "|" + (rev || 0) + "|" + bucket + "|" + stable(shapeOf(it));
}

/* Smallest resolution that covers the piece's longest side on screen, in
   device pixels. */
export function spriteBucket(maxPx) {
  var px = Number(maxPx) || 0;
  for (var i = 0; i < SPRITE_BUCKETS.length; i++) if (SPRITE_BUCKETS[i] >= px) return SPRITE_BUCKETS[i];
  return SPRITE_BUCKETS[SPRITE_BUCKETS.length - 1];
}

// lights, sensors and small smart devices keep their plan symbol: a render of
// a smoke detector from above is a white dot that says nothing
const GLYPH_TYPES = {
  motionSensor: 1, contactSensor: 1, tempSensor: 1, smokeDetector: 1, smartLock: 1, smartPlug: 1,
};
// pieces a plan draws dashed, as above the cut plane, whatever their height
const OVERHEAD_TYPES = { upper: 1, hood: 1, ac: 1, acCassette: 1, acDiffuser: 1, acReturn: 1, ceilingFan: 1, tvWall: 1 };

/* "sprite" | "overhead" | "glyph".
   `lamp` says whether the piece is a light (drawn by drawLamp); `vspan` is its
   {lo, hi} in cm above the floor. Anything whose underside is at or above
   150 cm hangs over the room below it and would hide the counters and beds
   it floats over, so it is drawn as a dashed outline, the way a plan does. */
export function spriteMode(it, opts) {
  opts = opts || {};
  if (!it || opts.lamp) return "glyph";
  if (GLYPH_TYPES[it.type]) return "glyph";
  if (OVERHEAD_TYPES[it.type]) return "overhead";
  var vs = opts.vspan;
  if (vs && Number(vs.lo) >= 150) return "overhead";
  return "sprite";
}
