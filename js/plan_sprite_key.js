/* Cache keys and draw modes for the presentation plan's furniture sprites
   (js/plan_sprites.js). Pure, so what makes two pieces "look the same from
   above" is tested rather than assumed.

   A sprite is a top-down render of the piece in its OWN frame, so where it
   stands and which way it faces never change the picture: the plan rotates
   and places the image. Everything else that reaches the builder does —
   size, variant, textures, cabinet spec, stair configuration, parameter
   overrides — the same rule as view3d.js itemSig(). */

import { inferProductRules } from "./core/smart_dimension.js";

// Bump when the models or the sprite lighting change, so no stale picture
// survives a code update in a long-lived cache.
export const SPRITE_VERSION = 6;

export const SPRITE_BUCKETS = [64, 128, 256, 512];

// fields that position the piece or describe runtime state, not its shape
const PLACEMENT = { x: 1, z: 1, rot: 1, id: 1, name: 1, locked: 1, smartState: 1, on: 1, powered: 1, _live: 1,
  facesId: 1, groupId: 1, mepNodeId: 1, functionalZone: 1, rotUser: 1 };
const DIMENSION_FIELD = { width: "w", depth: "d", height: "h" };

function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ":" + stable(v[k]);
    }).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

function shapeOf(it, builtin, configuration) {
  var out = {};
  Object.keys(it || {}).forEach(function (k) {
    if (PLACEMENT[k] || k.charAt(0) === "_" || typeof it[k] === "function") return;
    const value = it[k];
    // ensureItemDefinition writes the built-in ID and dimension projections
    // during the first 3D build. The same picture can be requested before it.
    if (k === "definitionId" && builtin && value === "builtin:" + it.type) return;
    if (k === "parameterOverrides" && value && typeof value === "object" && !Array.isArray(value)) {
      const overrides = {};
      for (const [key, v] of Object.entries(value)) {
        const field = DIMENSION_FIELD[key];
        if (!field || !Number.isFinite(it[field]) || it[field] !== v) overrides[key] = v;
      }
      if (Object.keys(overrides).length) out[k] = overrides;
    } else if (k !== "configuration") out[k] = value;
  });
  if (configuration && typeof configuration === "object" && !Array.isArray(configuration)) {
    const { layoutSetId, ...visual } = configuration;
    if (Object.keys(visual).length) out.configuration = visual;
  } else if (configuration != null) out.configuration = configuration;
  return out;
}

// Only unmaterialised built-ins need the catalogue defaults. Match the nominal
// dimensions used by genericDefinition, independent of the placed size.
export function spriteKey(it, bucket, rev, entry, definition, defaults) {
  const genericId = "builtin:" + it?.type;
  const builtin = !it?.cab && !entry?.custom && (!it?.definitionId || it.definitionId === genericId) &&
    (!definition || (definition.metadata?.source === "built-in-library" && definition.revision === 1));
  let configuration = it?.configuration || definition?.rules?.configuration;
  if (!configuration && builtin && entry) {
    const width = Number(entry.w) || Number(it.w) || 100, depth = Number(entry.d) || Number(it.d) || 60;
    const height = Number(entry.h) || Number(it.h) || 100;
    const key = it.type + "|" + width + "|" + depth + "|" + height;
    configuration = defaults?.get(key);
    if (!configuration) {
      configuration = inferProductRules(it.type, { width, depth, height }, entry.parametricRules).configuration || {};
      defaults?.set(key, configuration);
    }
  }
  const shape = shapeOf(it, builtin, configuration);
  // The revision follows commits to an edited definition independently of
  // its placed item. A custom catalogue entry also carries defSig in keyFor.
  if (!builtin && definition) shape.definitionRevision = definition.revision;
  return SPRITE_VERSION + "|" + (rev || 0) + "|" + bucket + "|" + stable(shape);
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
