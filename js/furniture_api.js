// Furniture runtime API: build, vertical spans, item factory, default scene.
import * as THREE from "three";
import { S, uid, fin, MOUNTH, WALL_H, WALL_T } from "./state.js";
import { setSkin } from "./primitives.js";
import { FURN, variantOf } from "./furniture_models.js";
import { ensureItemDefinition, rebuildItem } from "./core/project.js";

// build a piece into `g` with its variant finish applied. Every caller that
// renders furniture (3D scene, vertical-span probe, modeler import) goes
// through here so the skin is always set AND always cleared.
export function buildItem(g, it) {
  var f = FURN[it.type];
  if (!f || !f.build) return;
  // Procedural furniture builders are derived-representation adapters. Resolve
  // their canonical definition/parameters before asking them for meshes.
  if (it && it.id != null) {
    var definition = ensureItemDefinition(S, it, f),
      cached = S.parametric && S.parametric.derived && S.parametric.derived[it.id],
      overrides = it.parameterOverrides || {};
    if (!cached || cached.definitionId !== definition.id ||
        cached.definitionRevision !== definition.revision ||
        cached.parameters.width !== overrides.width ||
        cached.parameters.depth !== overrides.depth ||
        cached.parameters.height !== overrides.height) rebuildItem(S, it, f);
  }
  var sk = variantOf(it);
  if (it && (it.tex || it.texParts)) {
    var customSwap = {};
    if (sk && sk.swap) Object.assign(customSwap, sk.swap);
    if (it.tex) {
      var texObj = { tex: it.tex };
      if (it.texTint) {
        texObj.col = parseInt(it.texTint.replace("#", "0x"), 16);
        texObj.texColor = texObj.col;
      }
      if (it.texScale) texObj.texScale = it.texScale;
      [0x9aa6a8, 0xd0b48c, 0xe2ded4, 0x4a4d52].forEach(function(c) {
        customSwap[c] = texObj;
      });
    }
    if (it.texParts) {
      if (it.texParts.doors) customSwap[0xd0b48c] = { tex: it.texParts.doors, texScale: it.texScale };
      if (it.texParts.body) customSwap[0xe2ded4] = { tex: it.texParts.body, texScale: it.texScale };
      if (it.texParts.top) customSwap[0x4a4d52] = { tex: it.texParts.top, texScale: it.texScale };
    }
    // Keep the legacy colour swaps for intentional accents, but also expose a
    // finish-wide texture fallback.  Primitive helpers use it for every
    // eligible surface that did not have a more specific texture mapping.
    sk = {
      swap: customSwap,
      allTex: it.tex || null,
      allTexScale: it.texScale,
      allTexBump: it.texBump,
      allTexColor: it.texTint ? parseInt(it.texTint.replace("#", "0x"), 16) : null,
    };
  }
  setSkin(sk);
  try {
    f.build(g, it);
  } finally {
    setSkin(null);
  }
}
// plan/elevation/thumbnail fill color, honoring the variant's own `col`
export function fcolor(it) {
  var v = variantOf(it);
  return (v && v.col) || (FURN[it.type] && FURN[it.type].col) || "#c9bfa6";
}

/* ---- vertical span -------------------------------------------------------
   How high off the floor a piece actually sits. There is no declarative mount
   height to read: each build() bakes its own Y offsets (a ceiling light draws
   near MOUNTH, a wall AC starts at y=212, a sofa starts at 0), so the only
   source of truth that cannot drift from the 3D view is the geometry itself.
   Build the piece once into a throwaway group and measure its bounding box.

   Used by the elevation views, which previously assumed `it.elev || 0` — a
   field nothing ever writes — and so drew every wall- and ceiling-mounted item
   sitting on the floor.

   The group is never added to a scene or rendered, so no GPU buffers are
   allocated and it is plain garbage once measured. Results are cached per
   type+size. */
var vSpanCache = new Map();
export function clearVSpanCache() {
  vSpanCache.clear();
}
// The span the piece's own geometry occupies, before any per-item offset.
function baseVSpan(it) {
  var f = it && FURN[it.type];
  if (!f) return { lo: 0, hi: (it && it.h) || 0 };
  // variant is part of the key: a wall-hung toilet or a four-poster bed
  // occupies a different vertical span than the model's default shape
  var key =
    it.type + ":" + it.w + "x" + it.d + "x" + it.h + ":" + (it.variant || "");
  var hit = vSpanCache.get(key);
  if (hit) return hit;
  var span = null;
  try {
    var g = new THREE.Group();
    buildItem(g, it);
    g.updateMatrixWorld(true);
    var bb = new THREE.Box3().setFromObject(g);
    if (fin(bb.min.y) && fin(bb.max.y) && bb.max.y > bb.min.y)
      span = { lo: bb.min.y, hi: bb.max.y };
  } catch (e) {
    // a builder that needs more than a bare group — fall back to floor-standing
  }
  if (!span) span = { lo: 0, hi: it.h };
  vSpanCache.set(key, span);
  return span;
}
/* `it.elev` re-hangs a piece at a chosen height: it is the world Y of the
   piece's BOTTOM, whatever its builder baked in. Expressing it as an offset
   from the built span (rather than replacing the span with `elev..elev+h`)
   is what keeps the 3D view and the elevations agreeing — a wall AC moved to
   elev 180 keeps its own 40cm-tall shape instead of being stretched to `h`. */
export function elevOffset(it) {
  if (!it || !fin(it.elev)) return 0;
  return it.elev - baseVSpan(it).lo;
}
export function itemVSpan(it) {
  var b = baseVSpan(it);
  var off = elevOffset(it);
  return off ? { lo: b.lo + off, hi: b.hi + off } : b;
}

export function isLamp(it) {
  return it && FURN[it.type] && !!FURN[it.type].lamp;
}
export function lampColor(it) {
  return it.lightColor != null ? it.lightColor : FURN[it.type].lamp.color;
}

export function mkItem(type, x, z, rot) {
  var f = FURN[type];
  return {
    id: uid(),
    type: type,
    x: x,
    z: z,
    w: f.w,
    d: f.d,
    h: f.h,
    rot: rot || 0,
  };
}

export function defaultScene() {
  S.nodes = [
    { x: 0, z: 0 },
    { x: 400, z: 0 },
    { x: 400, z: 300 },
    { x: 0, z: 300 },
  ];
  var w = [
    { id: uid(), a: 0, b: 1, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: 1, b: 2, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: 2, b: 3, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: 3, b: 0, thickness: WALL_T, height: WALL_H },
  ];
  S.walls = w;
  S.openings = [
    {
      id: uid(),
      type: "door",
      wall: w[3].id,
      s: 150,
      width: 90,
      height: 205,
      sill: 0,
    },
    {
      id: uid(),
      type: "window",
      wall: w[0].id,
      s: 200,
      width: 120,
      height: 120,
      sill: 90,
    },
    {
      id: uid(),
      type: "window",
      wall: w[1].id,
      s: 150,
      width: 120,
      height: 120,
      sill: 90,
    },
  ];
  S.items = [
    mkItem("sofa", 200, 245, 180),
    mkItem("table", 200, 160, 0),
    mkItem("tv", 200, 28, 0),
    mkItem("plant", 55, 250, 0),
    mkItem("base", 45, 42, 0),
    mkItem("sink", 110, 42, 0),
    mkItem("cooktop", 175, 42, 0),
    mkItem("fridge", 355, 55, 0),
    mkItem("ceilingLight", 200, 150, 0),
    mkItem("floorLamp", 360, 250, 0),
  ];
  S.sel = null;
}
