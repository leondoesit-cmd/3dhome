// Furniture runtime API: build, vertical spans, item factory, default scene.
import { THREE, loadThree, threeLoaded } from "./three_lazy.js";
import { S, uid, fin, MOUNTH, WALL_H, WALL_T } from "./state.js";
import { setSkin, clearGroup } from "./primitives.js";
import { FURN, variantOf } from "./furniture_models.js";
import { ensureItemDefinition, rebuildItem } from "./core/project.js";
import { designNewStairs } from "./stair_floors.js";
import { setLayoutSetId } from "./group_frame.js";
import { reseat } from "./stack.js";

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
// variant is part of the key: a wall-hung toilet or a four-poster bed
// occupies a different vertical span than the model's default shape
function vSpanKey(it) {
  // a modular cabinet builds at its spec's own elevation (a wall unit hangs): that is part of its span
  var cabElev = it.cab && Number(it.cab.elev) ? ":e" + Number(it.cab.elev) : "";
  return it.type + ":" + it.w + "x" + it.d + "x" + it.h + ":" + (it.variant || "") + cabElev;
}
// The span the piece's own geometry occupies, before any per-item offset.
function baseVSpan(it) {
  var f = it && FURN[it.type];
  if (!f) return { lo: 0, hi: (it && it.h) || 0 };
  var key = vSpanKey(it);
  var hit = vSpanCache.get(key);
  if (hit) return hit;
  /* three is late-bound, and this probe is on the 2D path (stack labels,
     elevations, marker clearances) — it can be asked before anything has
     wanted a scene. Answer with the floor-standing fallback WITHOUT caching
     it, fetch three, and repaint when it lands so the next paint gets the
     real bounding box. Caching the fallback would pin a wall-hung toilet to
     the floor for the rest of the session. (Nothing measured is cached before
     three lands, so there is nothing to drop then: the only entries are spans
     seeded from pictures kept on disk, which are real measurements.) */
  if (!threeLoaded()) {
    whenThree();
    return { lo: 0, hi: (it && it.h) || 0 };
  }
  var span = null,
    g = null;
  try {
    g = new THREE.Group();
    buildItem(g, it);
    g.updateMatrixWorld(true);
    var bb = new THREE.Box3().setFromObject(g);
    if (fin(bb.min.y) && fin(bb.max.y) && bb.max.y > bb.min.y)
      span = { lo: bb.min.y, hi: bb.max.y };
  } catch (e) {
    // a builder that needs more than a bare group — fall back to floor-standing
  } finally {
    // The probe is one-shot, as a thumbnail build is: dispose its materials,
    // which also releases their counted shares of the shared texture repeats
    // (pbr_material.js) — an abandoned probe held them, and an evicted
    // repeat's GPU copy, for good. Textures themselves stay (shared caches).
    if (g) clearGroup(g);
  }
  if (!span) span = { lo: 0, hi: it.h };
  vSpanCache.set(key, span);
  return span;
}
// baseVSpan()'s rule for turning a built piece's Box3 into its span
export function spanOfBox(box, it) {
  return box && box.min && box.max && fin(box.min.y) && fin(box.max.y) && box.max.y > box.min.y
    ? { lo: box.min.y, hi: box.max.y } : { lo: 0, hi: (it && it.h) || 0 };
}
/* A caller that has just built the piece anyway (the presentation-plan
   picture bake, js/plan_sprites.js) hands its bounding box over, so the
   piece is not built a second time only to learn its height. `box` is the
   Box3 of buildItem(group, it) — the same build baseVSpan() measures.
   Returns true when it was new. */
export function rememberVSpan(it, box) {
  if (!it || !FURN[it.type] || !box || !threeLoaded()) return false;
  return seedVSpan(vSpanKey(it), spanOfBox(box, it));
}
/* The cache key of a piece's span, and a span learnt elsewhere under it:
   the presentation plan keeps each picture's span with the picture on disk,
   so a reloaded plan knows which pieces hang above the cut without building
   them. Works before three has loaded: the kept pictures' index is read at
   boot, and a switch to the presentation plan right after a reload must not
   wait for every piece to be built again to learn its height. */
export function vSpanKeyOf(it) {
  return it && FURN[it.type] ? vSpanKey(it) : null;
}
export function seedVSpan(key, span) {
  if (!key || !span || !fin(span.lo) || !fin(span.hi) || vSpanCache.has(key)) return false;
  vSpanCache.set(key, { lo: span.lo, hi: span.hi });
  toMeasure.delete(key);
  return true;
}
// Store the ceiling datum, not a guess at a pendant's unmeasured drop.
export function mountAtCeiling(it, ceilingTop) {
  if (fin(ceilingTop)) it.configuration = { ...it.configuration, ceilingTop };
  return it;
}

/* An explicit mount height is the world Y of the piece's bottom. A ceiling
   fitting instead meets its mount at the top. Both use the built span so
   resizing the piece keeps the mounting face fixed. */
export function elevOffset(it) {
  if (!it) return 0;
  if (fin(it.elev)) return it.elev - baseVSpan(it).lo;
  const ceiling = it.configuration?.ceilingTop;
  return fin(ceiling) ? ceiling - baseVSpan(it).hi : 0;
}
export function itemVSpan(it) {
  var b = baseVSpan(it);
  var off = elevOffset(it);
  return off ? { lo: b.lo + off, hi: b.hi + off } : b;
}

/* For paint paths, where measuring is too slow to do inline: a first paint
   of a generated home would build every distinct piece (~90 ms of one task)
   just to learn which ones hang above the plan cut. knownVSpan() answers
   only from the cache (null when the piece has not been measured yet), and
   measureVSpanSoon() measures it in idle moments, a few pieces per slice,
   then dispatches "vspan:ready" once so the plan repaints. */
export function knownVSpan(it) {
  if (!it || !FURN[it.type]) return itemVSpan(it);
  return vSpanCache.has(vSpanKey(it)) ? itemVSpan(it) : null;
}
/* Before three has loaded nothing can be measured: a span asked for then waits
   in `awaitingThree` (not queued again on every paint) until three lands, and
   a slice that measured nothing new announces nothing. Announcing anyway made
   a loop: "vspan:ready" -> repaint -> the painter asks again -> another empty
   slice -> "vspan:ready", once per idle slice until three loaded, and for
   good when it never did. */
var toMeasure = new Map(), measureAsked = false, awaitingThree = new Set(), threeHooked = false;
function whenThree() {
  if (threeHooked) return;
  threeHooked = true;
  loadThree().then(function () {
    awaitingThree.clear();
    // A home may have been furnished using the provisional catalogue heights.
    // Use the current document: the user may have moved a lamp or changed
    // floors while the geometry library was loading.
    const hosts = new Set(S.items.filter(it => it.on != null).map(it => it.on));
    if (hosts.size) {
      for (const it of S.items) if (it.on == null && hosts.has(it.id)) reseat(it);
      S.dirty3D = true;
    }
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("vspan:ready"));
  }, function () { /* three never came: what waits stays unmeasured, quietly */ });
}
export function measureVSpanSoon(it) {
  if (!it || !FURN[it.type]) return;
  var key = vSpanKey(it);
  if (vSpanCache.has(key) || toMeasure.has(key) || awaitingThree.has(key)) return;
  toMeasure.set(key, it);
  if (measureAsked) return;
  measureAsked = true;
  var idle = typeof requestIdleCallback === "function"
    ? function (fn) { requestIdleCallback(fn, { timeout: 200 }); }
    : function (fn) { setTimeout(function () { fn({ timeRemaining: function () { return 8; } }); }, 16); };
  var measured = 0;
  var slice = function (deadline) {
    var t0 = Date.now();
    toMeasure.forEach(function (piece, k) {
      // budget: what the idle period has left, at least a few ms when it timed out
      if (Date.now() - t0 > Math.max(4, deadline.timeRemaining() - 2)) return;
      toMeasure.delete(k);
      if (!threeLoaded()) { awaitingThree.add(k); whenThree(); return; }
      try { baseVSpan(piece); } catch (e) { /* measured as floor-standing on the next ask */ }
      if (vSpanCache.has(k)) measured++;
    });
    if (toMeasure.size && threeLoaded()) return void idle(slice);
    toMeasure.forEach(function (_, k) { awaitingThree.add(k); });
    if (toMeasure.size) whenThree();
    toMeasure.clear();
    measureAsked = false;
    if (measured && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("vspan:ready"));
  };
  idle(slice);
}

export function isLamp(it) {
  return it && FURN[it.type] && !!FURN[it.type].lamp;
}
export function lampColor(it) {
  return it.lightColor != null ? it.lightColor : FURN[it.type].lamp.color;
}

export function mkItem(type, x, z, rot, host) {
  var f = FURN[type] || { w: 60, d: 60, h: 80 };
  // a new flight of stairs starts with a design fitted to the code and the
  // floor above (js/stair_floors.js), inside the same undo step as the place
  if (type === "stairs") return designNewStairs({ id: uid(), type: type, x: x, z: z, w: f.w, d: f.d, h: f.h, rot: rot || 0 });
  return {
    id: uid(),
    type: type,
    x: x,
    z: z,
    w: f.w || 60,
    d: f.d || 60,
    h: f.h || 80,
    rot: rot || 0,
    ...(host && { on: host.id, elev: itemVSpan(host).hi }),
  };
}

export function emptyScene() {
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.markers = [];
  S.slabOpenings = [];
  S.roomMeta = {};
  S.sel = null;
  S.rectDraft = null;
  S.placeType = null;
  S.wallCons = [];
}

export function defaultScene() {
  S.slabOpenings = [];
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
      s: 100,
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
  const kitchenGroup = uid();
  let runEnd = WALL_T / 2;
  const kitchen = ["base", "sink", "cooktop", "fridge"].map(type => {
    const { w, d } = FURN[type];
    const unit = mkItem(type, runEnd + w / 2, WALL_T / 2 + d / 2, 0);
    runEnd += w;
    unit.functionalZone = "kitchen";
    return setLayoutSetId(unit, kitchenGroup);
  });
  const tv = mkItem("tv", runEnd + FURN.tv.w / 2, WALL_T / 2 + FURN.tv.d / 2, 0);
  const sofa = mkItem("sofa", tv.x, 300 - WALL_T / 2 - FURN.sofa.d / 2, 180);
  sofa.w = 120; // the bay beside the run accommodates a loveseat
  sofa.facesId = tv.id;
  tv.facesId = sofa.id;
  S.items = [
    sofa,
    mkItem("coffee", tv.x, 145, 0),
    tv,
    mkItem("plant", 55, 250, 0),
    ...kitchen,
    mountAtCeiling(mkItem("ceilingLight", 200, 150, 0), WALL_H),
    mkItem("floorLamp", 245, 250, 0),
  ];
  S.sel = null;
}
